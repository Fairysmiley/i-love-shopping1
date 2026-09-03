import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';

@ApiTags('reviews')
@Controller('products')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('admin/reviews')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all reviews across all products (admin)' })
  getAllReviews() {
    return this.reviews.getAllReviews();
  }

  @Delete('admin/reviews/:reviewId')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete any review (admin)' })
  deleteReview(@Param('reviewId') reviewId: string) {
    return this.reviews.deleteByAdmin(reviewId);
  }

  @Public()
  @Get(':idOrSlug/reviews')
  @ApiOperation({ summary: 'List a product’s reviews + rating summary' })
  list(@Param('idOrSlug') idOrSlug: string) {
    return this.reviews.list(idOrSlug);
  }

  @Get(':idOrSlug/can-review')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether the current user purchased this product and may review it (auth)',
  })
  canReview(@Param('idOrSlug') idOrSlug: string, @CurrentUser('userId') userId: string) {
    return this.reviews.canReview(idOrSlug, userId);
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

  @Post(':idOrSlug/reviews/:reviewId/helpful')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle a helpful vote on a review' })
  voteHelpful(@Param('reviewId') reviewId: string, @CurrentUser('userId') userId: string) {
    return this.reviews.voteHelpful(reviewId, userId);
  }
}
