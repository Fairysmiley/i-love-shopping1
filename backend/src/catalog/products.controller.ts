import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { ImageService } from './image.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { BulkProductUploadDto } from './dto/bulk-product.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly imageService: ImageService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Search/browse products with faceted filters + sorting' })
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Public()
  @SkipThrottle()
  @Get('suggest')
  @ApiOperation({ summary: 'Dynamic search suggestions (type-ahead)' })
  @ApiQuery({ name: 'q', required: true })
  suggest(@Query('q') q: string) {
    return this.products.suggest(q ?? '');
  }

  @Public()
  @SkipThrottle()
  @Get('facets')
  @ApiOperation({ summary: 'Available facet values + counts for the current filters' })
  facets(@Query() query: ProductQueryDto) {
    return this.products.facets(query);
  }

  @Post(':id/images')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Upload product image (generates multiple sizes)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, WebP). Max 10MB. Will be resized to 320px, 768px, and 1440px.',
        },
        altText: {
          type: 'string',
          description: 'Alt text for accessibility',
        },
        isPrimary: {
          type: 'boolean',
          description: 'Set as primary product image',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('altText') altText?: string,
    @Body('isPrimary') isPrimary?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    // Process image into multiple sizes
    const { fullUrl, mediumUrl, thumbnailUrl } = await this.imageService.processProductImage(file);

    // Add image to product
    return this.products.addImage(productId, {
      url: fullUrl,
      mediumUrl,
      thumbnailUrl,
      altText,
      isPrimary: isPrimary === 'true',
    });
  }

  @Public()
  @SkipThrottle()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get a single product by id or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.products.findByIdOrSlug(idOrSlug);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a product (admin)' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a product (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product (admin)' })
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }

  @Post('bulk')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bulk create/update products via JSON (admin)' })
  @ApiBody({ type: BulkProductUploadDto })
  async bulkUpload(@Body() dto: BulkProductUploadDto) {
    const result = await this.products.bulkCreate(dto.products);
    return result;
  }

  @Post('bulk-csv')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bulk create/update products via CSV file (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV file with headers: sku,name,description,price,stockQuantity,categorySlug,brandName'
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async bulkUploadCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    const csvContent = file.buffer.toString('utf-8');
    const { products, errors: parseErrors } = this.products.parseCsvToProducts(csvContent);
    const result = await this.products.bulkCreate(products);
    return {
      imported: result.imported,
      skipped: result.skipped + parseErrors.length,
      errors: [...parseErrors, ...result.errors],
    };
  }
}
