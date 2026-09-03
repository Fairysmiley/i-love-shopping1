import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt, encrypt } from '../common/utils/encryption.util';
import { AddressDto } from './dto/address.dto';

export interface AddressView {
  id: string;
  label: string | null;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(row: {
    id: string;
    label: string | null;
    data: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AddressView {
    const parsed = JSON.parse(decrypt(row.data));
    return {
      id: row.id,
      label: row.label,
      street: parsed.street,
      city: parsed.city,
      postalCode: parsed.postalCode,
      country: parsed.country,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(userId: string): Promise<AddressView[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async create(userId: string, dto: AddressDto): Promise<AddressView> {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    // The first address a user saves becomes their default automatically.
    const existingCount = await this.prisma.address.count({ where: { userId } });
    const row = await this.prisma.address.create({
      data: {
        userId,
        label: dto.label ?? null,
        isDefault: dto.isDefault ?? existingCount === 0,
        data: encrypt(
          JSON.stringify({
            street: dto.street,
            city: dto.city,
            postalCode: dto.postalCode,
            country: dto.country,
          }),
        ),
      },
    });
    return this.toView(row);
  }

  async update(userId: string, id: string, dto: AddressDto): Promise<AddressView> {
    await this.assertOwnership(userId, id);
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    const row = await this.prisma.address.update({
      where: { id },
      data: {
        label: dto.label ?? null,
        isDefault: dto.isDefault ?? undefined,
        data: encrypt(
          JSON.stringify({
            street: dto.street,
            city: dto.city,
            postalCode: dto.postalCode,
            country: dto.country,
          }),
        ),
      },
    });
    return this.toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwnership(userId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  private async assertOwnership(userId: string, id: string): Promise<void> {
    const row = await this.prisma.address.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Address not found');
    if (row.userId !== userId) throw new ForbiddenException('This address does not belong to you.');
  }
}
