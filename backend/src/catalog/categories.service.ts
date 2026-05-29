import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slug';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category-brand.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the full category tree (roots with nested children). */
  async tree() {
    const all = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    const byParent = new Map<string | null, typeof all>();
    for (const c of all) {
      const key = c.parentId;
      byParent.set(key, [...(byParent.get(key) ?? []), c]);
    }
    const build = (parentId: string | null): any[] =>
      (byParent.get(parentId) ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        children: build(c.id),
      }));
    return build(null);
  }

  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { name: dto.name, slug: slugify(dto.name), description: dto.description, parentId: dto.parentId },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getOrThrow(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        parentId: dto.parentId,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.prisma.category.delete({ where: { id } });
  }

  private async getOrThrow(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }
}
