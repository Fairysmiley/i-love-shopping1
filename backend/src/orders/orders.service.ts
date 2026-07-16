import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt } from '../common/utils/encryption.util';
import { OrderFilterDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: { include: { product: true } }, payment: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(o => this.decryptOrder(o));
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

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: { include: { product: true } }, payment: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(o => this.decryptOrder(o));
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

  async cancelOrder(orderId: string, userId: string, isAdmin: boolean) {
    // Both user and admin can cancel, but only if PENDING or CONFIRMED
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.userId !== userId && !isAdmin) throw new ForbiddenException('Access denied');
      if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('Order is already cancelled');
      
      // We allow cancellation if it hasn't been shipped yet.
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAID) {
         throw new BadRequestException('Order cannot be cancelled at this stage. It may have already shipped.');
      }

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

      return this.decryptOrder(updatedOrder);
    });
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    // Admin only method (protected by controller role guard)
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.CANCELLED && dto.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change status of a cancelled order. Inventory has already been restored.');
    }

    if (dto.status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
      // Admin is explicitly cancelling an active order, we must restock!
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

      const finalOrder = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
      return this.decryptOrder(finalOrder);
    });
  }

  private decryptOrder(order: any) {
    if (!order) return order;
    if (order.shippingAddress) {
      order.shippingAddress = decrypt(order.shippingAddress);
    }
    if (order.payment && order.payment.transactionId) {
      order.payment.transactionId = decrypt(order.payment.transactionId);
    }
    return order;
  }
}
