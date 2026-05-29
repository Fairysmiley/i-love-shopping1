import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slug';
import { CreateBrandDto, UpdateBrandDto } from './dto/category-brand.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateBrandDto) {
    return this.prisma.brand.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        description: dto.description,
        logoUrl: dto.logoUrl,
      },
    });
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.getOrThrow(id);
    return this.prisma.brand.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        logoUrl: dto.logoUrl,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.prisma.brand.delete({ where: { id } });
  }

  private async getOrThrow(id: string) {
    const b = await this.prisma.brand.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Brand not found');
    return b;
  }
}
