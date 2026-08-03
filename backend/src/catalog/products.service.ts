import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { buildDimensions } from '../common/utils/units';
import { slugify } from '../common/utils/slug';
import { ProductQueryDto, ProductSort } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { BulkProductItemDto } from './dto/bulk-product.dto';

const productInclude = {
  category: true,
  brand: true,
  images: { orderBy: { position: 'asc' as const } },
  attributes: true,
} satisfies Prisma.ProductInclude;

type FullProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const SUGGEST_TTL_SECONDS = 60;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Builds the dynamic WHERE clause shared by search + facet aggregation.
  private buildWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [{ isActive: true }];

    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.category) {
      and.push({ category: { slug: query.category } });
    }
    if (query.brands?.length) {
      and.push({ brand: { slug: { in: query.brands } } });
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      and.push({
        price: {
          ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
        },
      });
    }
    if (query.minRating !== undefined) {
      and.push({ averageRating: { gte: query.minRating } });
    }
    if (query.attributes?.length) {
      // Each "name:value" facet must match (logical AND across facets).
      for (const raw of query.attributes) {
        const [name, ...rest] = raw.split(':');
        const value = rest.join(':');
        if (name && value) {
          and.push({ attributes: { some: { name, value } } });
        }
      }
    }
    return { AND: and };
  }

  private orderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
    const tiebreaker: Prisma.ProductOrderByWithRelationInput = { id: 'asc' };
    const resolved = sort ?? ProductSort.RELEVANCE;

    switch (resolved) {
      case ProductSort.PRICE_ASC:
        return [{ price: 'asc' }, tiebreaker];
      case ProductSort.PRICE_DESC:
        return [{ price: 'desc' }, tiebreaker];
      case ProductSort.RATING:
        return [{ averageRating: 'desc' }, { ratingCount: 'desc' }, tiebreaker];
      case ProductSort.NEWEST:
        return [{ createdAt: 'desc' }, tiebreaker];
      default:
        // Relevance: well-rated first, then newest (differs from pure "Top rated").
        return [{ averageRating: 'desc' }, { createdAt: 'desc' }, tiebreaker];
    }
  }

  async search(query: ProductQueryDto): Promise<PaginatedResult<ReturnType<typeof this.toPublic>>> {
    const cacheKey = `catalog:search:${JSON.stringify(query)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where = this.buildWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: this.orderBy(query.sort ?? ProductSort.RELEVANCE),
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    const result = {
      data: items.map((p) => this.toPublic(p)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };

    await this.redis.setEx(cacheKey, JSON.stringify(result), 60);
    return result;
  }

  /**
   * Returns the available facets (brands, attribute values, price bounds) for
   * the current filter set, so the UI can render counts next to each option.
   */
  async facets(query: ProductQueryDto) {
    const cacheKey = `catalog:facets:${JSON.stringify(query)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where = this.buildWhere(query);

    const [brandGroups, attributes, priceAgg] = await this.prisma.$transaction([
      this.prisma.product.groupBy({
        by: ['brandId'],
        where,
        _count: true,
        orderBy: { brandId: 'asc' },
      }),
      this.prisma.productAttribute.findMany({
        where: { product: where },
        select: { name: true, value: true },
      }),
      this.prisma.product.aggregate({ where, _min: { price: true }, _max: { price: true } }),
    ]);

    const brandIds = brandGroups.map((g) => g.brandId);
    const brands = await this.prisma.brand.findMany({ where: { id: { in: brandIds } } });
    const brandMap = new Map(brands.map((b) => [b.id, b]));

    const attrFacets: Record<string, Record<string, number>> = {};
    for (const a of attributes) {
      attrFacets[a.name] ??= {};
      attrFacets[a.name][a.value] = (attrFacets[a.name][a.value] ?? 0) + 1;
    }

    const result = {
      brands: brandGroups
        .map((g) => ({
          slug: brandMap.get(g.brandId)?.slug,
          name: brandMap.get(g.brandId)?.name,
          count: g._count,
        }))
        .filter((b) => b.slug),
      attributes: attrFacets,
      price: {
        min: priceAgg._min.price ? Number(priceAgg._min.price) : 0,
        max: priceAgg._max.price ? Number(priceAgg._max.price) : 0,
      },
    };

    await this.redis.setEx(cacheKey, JSON.stringify(result), 60);
    return result;
  }

  /** Type-ahead suggestions, cached in Redis to absorb keystroke traffic. */
  async suggest(prefix: string, limit = 8): Promise<string[]> {
    const q = prefix.trim().toLowerCase();
    if (q.length < 2) return [];

    const cacheKey = `suggest:${q}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];

    const rows = await this.prisma.product.findMany({
      where: { isActive: true, name: { contains: q, mode: 'insensitive' } },
      select: { name: true },
      orderBy: { averageRating: 'desc' },
      take: limit,
    });
    const suggestions = [...new Set(rows.map((r) => r.name))];
    await this.redis.setEx(cacheKey, JSON.stringify(suggestions), SUGGEST_TTL_SECONDS);
    return suggestions;
  }

  async findByIdOrSlug(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toPublic(product);
  }

  async create(dto: CreateProductDto) {
    const slug = await this.uniqueSlug(dto.name);
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency ?? 'EUR',
        stockQuantity: dto.stockQuantity,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        weightGrams: dto.weightGrams,
        lengthMm: dto.lengthMm,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        images: dto.images ? { create: dto.images } : undefined,
        attributes: dto.attributes ? { create: dto.attributes } : undefined,
      },
      include: productInclude,
    });
    return this.toPublic(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.getOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        currency: dto.currency,
        stockQuantity: dto.stockQuantity,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        weightGrams: dto.weightGrams,
        lengthMm: dto.lengthMm,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
      },
      include: productInclude,
    });
    return this.toPublic(product);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    // Soft-delete keeps the row for historical references (orders, reviews).
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  async bulkCreate(items: BulkProductItemDto[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        // Find or create category
        let category = await this.prisma.category.findUnique({
          where: { slug: item.categorySlug },
        });

        if (!category) {
          errors.push(`Row with SKU ${item.sku}: Category '${item.categorySlug}' not found`);
          skipped++;
          continue;
        }

        // Find or create brand if provided
        let brandId: string | null = null;
        if (item.brandName) {
          const brandSlug = slugify(item.brandName);
          let brand = await this.prisma.brand.findUnique({
            where: { slug: brandSlug },
          });

          if (!brand) {
            brand = await this.prisma.brand.create({
              data: {
                name: item.brandName,
                slug: brandSlug,
              },
            });
          }
          brandId = brand.id;
        }

        // Generate slug from name or use provided slug
        const slug = item.slug ? await this.uniqueSlug(item.slug) : await this.uniqueSlug(item.name);

        // Check if SKU already exists (upsert logic)
        const existing = await this.prisma.product.findFirst({
          where: {
            OR: [
              { slug },
              // Assuming SKU might be stored in a custom field or description
            ]
          },
        });

        if (existing) {
          // Update existing product
          const updateData: any = {
            name: item.name,
            description: item.description,
            price: new Prisma.Decimal(item.price),
            stockQuantity: item.stockQuantity,
            category: { connect: { id: category.id } },
            weightGrams: item.weightGrams,
            lengthMm: item.lengthMm,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
          };
          if (brandId) {
            updateData.brand = { connect: { id: brandId } };
          }
          await this.prisma.product.update({
            where: { id: existing.id },
            data: updateData,
          });
        } else {
          // Create new product - brandId is required for creation, skip if missing
          if (!brandId) {
            errors.push(`Row with SKU ${item.sku}: Brand is required for new products`);
            skipped++;
            continue;
          }

          await this.prisma.product.create({
            data: {
              name: item.name,
              slug,
              description: item.description || '',
              price: new Prisma.Decimal(item.price),
              currency: 'EUR',
              stockQuantity: item.stockQuantity,
              categoryId: category.id,
              brandId,
              weightGrams: item.weightGrams,
              lengthMm: item.lengthMm,
              widthMm: item.widthMm,
              heightMm: item.heightMm,
            },
          });
        }

        imported++;
      } catch (error) {
        errors.push(`Row with SKU ${item.sku}: ${error.message}`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  }

  parseCsvToProducts(csvContent: string): BulkProductItemDto[] {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const required = ['sku', 'name', 'price', 'stockquantity', 'categoryslug'];

    for (const col of required) {
      if (!headers.includes(col)) {
        throw new BadRequestException(`Missing required CSV column: ${col}`);
      }
    }

    const products: BulkProductItemDto[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      const price = parseFloat(row['price']);
      const stockQuantity = parseInt(row['stockquantity'], 10);

      if (!row['sku'] || !row['name'] || isNaN(price) || isNaN(stockQuantity)) {
        throw new BadRequestException(`Invalid data in CSV row ${i + 1}`);
      }

      products.push({
        sku: row['sku'],
        name: row['name'],
        description: row['description'] || '',
        slug: row['slug'],
        price,
        stockQuantity,
        categorySlug: row['categoryslug'],
        brandName: row['brandname'] || row['brand'],
        weightGrams: row['weightgrams'] ? parseInt(row['weightgrams'], 10) : undefined,
        lengthMm: row['lengthmm'] ? parseInt(row['lengthmm'], 10) : undefined,
        widthMm: row['widthmm'] ? parseInt(row['widthmm'], 10) : undefined,
        heightMm: row['heightmm'] ? parseInt(row['heightmm'], 10) : undefined,
      });
    }

    return products;
  }

  private async getOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 1;
    while (await this.prisma.product.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  toPublic(p: FullProduct) {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: Number(p.price),
      currency: p.currency,
      stockQuantity: p.stockQuantity,
      inStock: p.stockQuantity > 0,
      category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
      brand: { id: p.brand.id, name: p.brand.name, slug: p.brand.slug },
      dimensions: buildDimensions(p),
      averageRating: p.averageRating,
      ratingCount: p.ratingCount,
      images: p.images.map((img) => ({
        url: img.url,
        thumbnailUrl: img.thumbnailUrl || img.url,
        mediumUrl: img.mediumUrl || img.url,
        altText: img.altText,
        isPrimary: img.isPrimary,
      })),
      attributes: p.attributes.map((a) => ({ name: a.name, value: a.value })),
      createdAt: p.createdAt,
    };
  }

  /**
   * Add an image to a product
   */
  async addImage(
    productId: string,
    data: {
      url: string;
      thumbnailUrl?: string;
      mediumUrl?: string;
      altText?: string;
      isPrimary?: boolean;
    },
  ) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { images: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // If setting as primary, unset other primary images
    if (data.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Get the next position
    const maxPosition = product.images.reduce((max, img) => Math.max(max, img.position), -1);

    // Create the new image
    return this.prisma.productImage.create({
      data: {
        productId,
        url: data.url,
        thumbnailUrl: data.thumbnailUrl,
        mediumUrl: data.mediumUrl,
        altText: data.altText,
        isPrimary: data.isPrimary ?? false,
        position: maxPosition + 1,
      },
    });
  }
}
