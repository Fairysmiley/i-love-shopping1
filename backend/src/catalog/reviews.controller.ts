import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';

@ApiTags('reviews')
@Controller('products')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get(':idOrSlug/reviews')
  @ApiOperation({ summary: 'List a product’s reviews + rating summary' })
  list(@Param('idOrSlug') idOrSlug: string) {
    return this.reviews.list(idOrSlug);
  }

  @Post(':idOrSlug/reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update your review for a product (auth)' })
  create(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.upsertForUser(idOrSlug, userId, dto);
  }

  @Delete(':idOrSlug/reviews/mine')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own review for a product (auth)' })
  remove(@Param('idOrSlug') idOrSlug: string, @CurrentUser('userId') userId: string) {
    return this.reviews.removeForUser(idOrSlug, userId);
  }
}
