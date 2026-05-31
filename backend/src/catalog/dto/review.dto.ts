import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt({ message: 'Rating must be a whole number between 1 and 5.' })
  @Min(1, { message: 'Rating must be at least 1.' })
  @Max(5, { message: 'Rating must be at most 5.' })
  rating!: number;

  @ApiPropertyOptional({ example: 'Exactly as described' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Title must be 120 characters or fewer.' })
  title?: string;

  @ApiPropertyOptional({ example: 'Condition matched the listing perfectly. Very warm layer.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Review must be 2000 characters or fewer.' })
  body?: string;
}
