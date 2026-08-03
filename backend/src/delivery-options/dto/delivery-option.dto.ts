import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsInt, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateDeliveryOptionDto {
  @ApiProperty({ example: 'Standard Shipping' })
  @IsString()
  name: string;

  @ApiProperty({ required: false, example: 'Delivery within 5-7 business days' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 5.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 5, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedDaysMin?: number;

  @ApiProperty({ example: 7, required: false })
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  estimatedDaysMax?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDeliveryOptionDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedDaysMin?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  estimatedDaysMax?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
