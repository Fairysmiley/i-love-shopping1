import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripePaymentService } from '../checkout/stripe-payment.service';
import { decrypt } from '../common/utils/encryption.util';
import { OrderFilterDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripePayment: StripePaymentService,
  ) {}

  async getUserOrders(userId: string, filter: OrderFilterDto) {
    const where: any = { userId };
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = new Date(filter.startDate);
      if (filter.endDate) where.createdAt.lte = new Date(filter.endDate);
    }

    const orderBy: any = {};
    if (filter.sortBy) {
      orderBy[filter.sortBy] = filter.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: { include: { product: true } }, payment: true },
      orderBy,
    });
    return orders.map((o) => this.decryptOrder(o));
  }

  async getAllOrders(filter: OrderFilterDto) {
    const where: any = {};
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = new Date(filter.startDate);
      if (filter.endDate) where.createdAt.lte = new Date(filter.endDate);
    }

    const orderBy: any = {};
    if (filter.sortBy) {
      orderBy[filter.sortBy] = filter.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        payment: true,
        user: { select: { email: true } },
      },
      orderBy,
    });
    return orders.map((o) => this.decryptOrder(o));
  }

  async getOrderById(orderId: string, userId: string, isAdmin: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, payment: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId && !isAdmin) throw new ForbiddenException('Access denied');

    return this.decryptOrder(order);
  }

  async getOrderConfirmation(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { select: { name: true, images: { where: { isPrimary: true }, take: 1 } } },
          },
        },
        deliveryOption: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt,
      deliveryOption: order.deliveryOption
        ? {
            name: order.deliveryOption.name,
            estimatedDaysMin: order.deliveryOption.estimatedDaysMin,
            estimatedDaysMax: order.deliveryOption.estimatedDaysMax,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        product: { name: item.product.name, image: item.product.images[0]?.url ?? null },
      })),
    };
  }

  /** Refunds a captured payment via Stripe. Only call this for a payment
   *  already known to be COMPLETED — `transactionId` is only ever missing
   *  for a payment that was never actually charged. */
  private async refundStripePayment(transactionId: string | null): Promise<void> {
    if (!transactionId) {
      throw new BadRequestException('Payment is marked completed but has no Stripe transaction id.');
    }
    await this.stripePayment.refundPayment(decrypt(transactionId));
  }

  async cancelOrder(orderId: string, userId: string, isAdmin: boolean) {
    // Both user and admin can cancel, but only if PENDING or PAID
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!existing) throw new NotFoundException('Order not found');
    if (existing.userId !== userId && !isAdmin) throw new ForbiddenException('Access denied');
    if (existing.status === OrderStatus.CANCELLED)
      throw new BadRequestException('Order is already cancelled');
    if (existing.status !== OrderStatus.PENDING && existing.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        'Order cannot be cancelled at this stage. It may have already shipped.',
      );
    }

    // A PAID order was already charged — refund it via Stripe BEFORE we touch
    // our own DB state, so a cancellation is never recorded while the
    // customer's money is still held.
    const wasCharged = existing.payment?.status === PaymentStatus.COMPLETED;
    if (wasCharged) {
      await this.refundStripePayment(existing.payment!.transactionId);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      // Restore inventory natively via Prisma atomic increment
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      if (wasCharged) {
        await tx.payment.update({ where: { orderId }, data: { status: PaymentStatus.REFUNDED } });
      }

      return this.decryptOrder(updatedOrder);
    });
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    // Admin only method (protected by controller role guard)
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.CANCELLED && dto.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot change status of a cancelled order. Inventory has already been restored.',
      );
    }

    if (dto.status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
      // Admin is explicitly cancelling an active order, we must restock — and
      // refund via Stripe first if it had already been charged.
      const wasCharged = order.payment?.status === PaymentStatus.COMPLETED;
      if (wasCharged) {
        await this.refundStripePayment(order.payment!.transactionId);
      }

      return this.prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
          include: { items: true },
        });
        for (const item of updatedOrder.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        if (wasCharged) {
          await tx.payment.update({ where: { orderId }, data: { status: PaymentStatus.REFUNDED } });
        }
        return this.decryptOrder(updatedOrder);
      });
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
    });
    return this.decryptOrder(updatedOrder);
  }

  async processRefund(orderId: string) {
    // Admin only method
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!existing) throw new NotFoundException('Order not found');
    if (!existing.payment) throw new BadRequestException('Order has no payment record');
    if (existing.payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Order payment is already refunded');
    }

    // Issue the actual refund with Stripe BEFORE touching our own DB state —
    // if the gateway call fails, nothing here should look refunded. Only a
    // captured payment can be refunded; a failed/pending one never charged
    // the card, so there's nothing for Stripe to reverse.
    if (existing.payment.status === PaymentStatus.COMPLETED) {
      await this.refundStripePayment(existing.payment.transactionId);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payment: true },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (!order.payment) throw new BadRequestException('Order has no payment record');
      if (order.payment.status === PaymentStatus.REFUNDED) {
        throw new BadRequestException('Order payment is already refunded');
      }

      // If order is not cancelled, cancel it and restore stock natively.
      if (order.status !== OrderStatus.CANCELLED) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
        });
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }

      // Mark payment as refunded
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });

      const finalOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { payment: true },
      });
      return this.decryptOrder(finalOrder);
    });
  }

  private decryptOrder(order: any) {
    if (!order) return order;
    if (order.shippingAddress) {
      order.shippingAddress = decrypt(order.shippingAddress);
    }
    if (order.guestEmail) {
      order.guestEmail = decrypt(order.guestEmail);
    }
    if (order.user && order.user.email) {
      order.user.email = decrypt(order.user.email);
    }
    if (order.payment && order.payment.transactionId) {
      order.payment.transactionId = decrypt(order.payment.transactionId);
    }
    return order;
  }
}
