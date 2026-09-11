import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';

export class BulkProductItemDto {
  @ApiProperty({ example: 'Warm Winter Jacket' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiProperty({ example: 149.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ required: false, example: 10, description: 'Defaults to 0 (out of stock) if omitted.' })
  @IsInt()
  @IsOptional()
  @Min(0)
  stockQuantity?: number;

  @ApiProperty({ example: 'outdoor-jackets' })
  @IsString()
  categorySlug: string;

  @ApiProperty({
    required: false,
    example: 'North Face',
    description: "Falls back to a generic 'Unbranded' brand if omitted.",
  })
  @IsString()
  @IsOptional()
  brandName?: string;

  @ApiProperty({ required: false, example: 1200 })
  @IsInt()
  @IsOptional()
  @Min(0)
  weightGrams?: number;

  @ApiProperty({ required: false, example: 700 })
  @IsInt()
  @IsOptional()
  @Min(0)
  lengthMm?: number;

  @ApiProperty({ required: false, example: 500 })
  @IsInt()
  @IsOptional()
  @Min(0)
  widthMm?: number;

  @ApiProperty({ required: false, example: 100 })
  @IsInt()
  @IsOptional()
  @Min(0)
  heightMm?: number;
}

export class BulkProductUploadDto {
  @ApiProperty({ type: [BulkProductItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkProductItemDto)
  products: BulkProductItemDto[];
}
