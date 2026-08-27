import { IsEnum, IsOptional, IsDateString, IsIn } from 'class-validator';
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

  @IsIn(['createdAt', 'status'])
  @IsOptional()
  sortBy?: 'createdAt' | 'status';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
