import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';
import { decrypt } from '../common/utils/encryption.util';

const reviewInclude = {
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReviewInclude;

type FullReview = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProductId(idOrSlug: string): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product.id;
  }

  /**
   * Recomputes a product's denormalized rating aggregates from its review rows.
   * Runs inside the caller's transaction so the Product row and the Review rows
   * can never drift apart (ACID: atomicity + consistency).
   */
  private async recomputeAggregates(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        averageRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count,
      },
    });
  }

  async list(idOrSlug: string) {
    const productId = await this.resolveProductId(idOrSlug);
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      include: reviewInclude,
      orderBy: [
        { helpfulVotes: 'desc' },
        { createdAt: 'desc' }
      ],
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sum += r.rating;
    }
    const ratingCount = reviews.length;

    return {
      summary: {
        averageRating: ratingCount ? Math.round((sum / ratingCount) * 10) / 10 : 0,
        ratingCount,
        distribution,
      },
      data: reviews.map((r) => this.toPublic(r)),
    };
  }

  /**
   * Creates (or updates) the current user's review for a product. One review per
   * user per product is enforced by a unique constraint; re-submitting edits it.
   * Note: purchase-verification gating belongs to the Commerce phase (orders),
   * so for the Foundation any authenticated user may review.
   */
  async upsertForUser(idOrSlug: string, userId: string, dto: CreateReviewDto) {
    const productId = await this.resolveProductId(idOrSlug);

    // Purchase-verification gating belongs to the Commerce phase (orders),
    // so for the Foundation any authenticated user may review.

    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.upsert({
        where: { productId_userId: { productId, userId } },
        create: {
          productId,
          userId,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          body: dto.body?.trim() || null,
        },
        update: {
          rating: dto.rating,
          title: dto.title?.trim() || null,
          body: dto.body?.trim() || null,
        },
        include: reviewInclude,
      });
      await this.recomputeAggregates(tx, productId);
      return saved;
    });

    return this.toPublic(review);
  }

  async removeForUser(idOrSlug: string, userId: string): Promise<void> {
    const productId = await this.resolveProductId(idOrSlug);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({
        where: { productId_userId: { productId, userId } },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('You have not reviewed this product');
      await tx.review.delete({ where: { id: existing.id } });
      await this.recomputeAggregates(tx, productId);
    });
  }

  async voteHelpful(reviewId: string, userId: string): Promise<{ helpfulVotes: number }> {
    const existingVote = await this.prisma.reviewHelpfulVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    if (existingVote) {
      // User already voted, so we can toggle it off, or just ignore. The prompt asks to 'upvote reviews', usually we allow toggling. Let's just return if already voted, or remove vote.
      // Actually, removing vote (toggle) is standard.
      return this.prisma.$transaction(async (tx) => {
        await tx.reviewHelpfulVote.delete({ where: { id: existingVote.id } });
        const updated = await tx.review.update({
          where: { id: reviewId },
          data: { helpfulVotes: { decrement: 1 } },
          select: { helpfulVotes: true },
        });
        return updated;
      });
    } else {
      return this.prisma.$transaction(async (tx) => {
        await tx.reviewHelpfulVote.create({
          data: { reviewId, userId },
        });
        const updated = await tx.review.update({
          where: { id: reviewId },
          data: { helpfulVotes: { increment: 1 } },
          select: { helpfulVotes: true },
        });
        return updated;
      });
    }
  }

  private toPublic(r: FullReview) {
    // Show first name + last initial only — never leak full names/emails.
    const firstName = decrypt(r.user.firstName);
    const lastName = decrypt(r.user.lastName);
    const lastInitial = lastName ? `${lastName.charAt(0)}.` : '';
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: `${firstName} ${lastInitial}`.trim(),
      helpfulVotes: r.helpfulVotes,
      createdAt: r.createdAt,
    };
  }

  async getAllReviews() {
    const reviews = await this.prisma.review.findMany({
      include: {
        ...reviewInclude,
        product: { select: { name: true, slug: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reviews.map((r) => ({ ...this.toPublic(r), product: r.product }));
  }

  async deleteByAdmin(reviewId: string) {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({
        where: { id: reviewId },
        select: { productId: true }
      });
      if (!review) throw new NotFoundException('Review not found');
      
      await tx.review.delete({ where: { id: reviewId } });
      await this.recomputeAggregates(tx, review.productId);
    });
  }
}
