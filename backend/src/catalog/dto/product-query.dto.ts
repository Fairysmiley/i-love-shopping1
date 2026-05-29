import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export enum ProductSort {
  RELEVANCE = 'relevance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  RATING = 'rating',
  NEWEST = 'newest',
}

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value as string[];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search across name + description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Brand slugs (comma-separated or repeated)' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  brands?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Minimum average rating' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minRating?: number;

  @ApiPropertyOptional({
    description: 'Attribute facets as name:value pairs, e.g. color:Black,storage:256GB',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  attributes?: string[];

  @ApiPropertyOptional({ enum: ProductSort, default: ProductSort.RELEVANCE })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort = ProductSort.RELEVANCE;
}
