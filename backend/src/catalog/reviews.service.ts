import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

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
      orderBy: { createdAt: 'desc' },
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

  private toPublic(r: FullReview) {
    // Show first name + last initial only — never leak full names/emails.
    const lastInitial = r.user.lastName ? `${r.user.lastName.charAt(0)}.` : '';
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: `${r.user.firstName} ${lastInitial}`.trim(),
      createdAt: r.createdAt,
    };
  }
}
