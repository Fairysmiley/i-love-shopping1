import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class OrderFilterDto {
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsOptional()
  sortBy?: 'createdAt' | 'status';

  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
