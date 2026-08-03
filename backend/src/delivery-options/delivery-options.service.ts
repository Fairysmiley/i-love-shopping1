import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryOptionDto, UpdateDeliveryOptionDto } from './dto/delivery-option.dto';

@Injectable()
export class DeliveryOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    const where: Prisma.DeliveryOptionWhereInput = activeOnly ? { isActive: true } : {};
    const options = await this.prisma.deliveryOption.findMany({
      where,
      orderBy: { price: 'asc' },
    });

    return options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      description: opt.description,
      price: Number(opt.price),
      estimatedDaysMin: opt.estimatedDaysMin,
      estimatedDaysMax: opt.estimatedDaysMax,
      isActive: opt.isActive,
      createdAt: opt.createdAt,
      updatedAt: opt.updatedAt,
    }));
  }

  async findOne(id: string) {
    const option = await this.prisma.deliveryOption.findUnique({
      where: { id },
    });

    if (!option) {
      throw new NotFoundException('Delivery option not found');
    }

    return {
      id: option.id,
      name: option.name,
      description: option.description,
      price: Number(option.price),
      estimatedDaysMin: option.estimatedDaysMin,
      estimatedDaysMax: option.estimatedDaysMax,
      isActive: option.isActive,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
    };
  }

  async create(dto: CreateDeliveryOptionDto) {
    // Check if name already exists
    const existing = await this.prisma.deliveryOption.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('A delivery option with this name already exists');
    }

    const option = await this.prisma.deliveryOption.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        estimatedDaysMin: dto.estimatedDaysMin ?? 1,
        estimatedDaysMax: dto.estimatedDaysMax ?? 7,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      id: option.id,
      name: option.name,
      description: option.description,
      price: Number(option.price),
      estimatedDaysMin: option.estimatedDaysMin,
      estimatedDaysMax: option.estimatedDaysMax,
      isActive: option.isActive,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
    };
  }

  async update(id: string, dto: UpdateDeliveryOptionDto) {
    // Check if option exists
    await this.findOne(id);

    // If name is being updated, check for conflicts
    if (dto.name) {
      const existing = await this.prisma.deliveryOption.findFirst({
        where: {
          name: dto.name,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('A delivery option with this name already exists');
      }
    }

    const option = await this.prisma.deliveryOption.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        estimatedDaysMin: dto.estimatedDaysMin,
        estimatedDaysMax: dto.estimatedDaysMax,
        isActive: dto.isActive,
      },
    });

    return {
      id: option.id,
      name: option.name,
      description: option.description,
      price: Number(option.price),
      estimatedDaysMin: option.estimatedDaysMin,
      estimatedDaysMax: option.estimatedDaysMax,
      isActive: option.isActive,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
    };
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.deliveryOption.delete({ where: { id } });
  }
}
