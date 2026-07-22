import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../common/utils/encryption.util';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { StripePaymentService } from './stripe-payment.service';
import { PaymentQueueService } from './payment-queue.service';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripePayment: StripePaymentService,
    private readonly paymentQueue: PaymentQueueService
  ) {}

  async processCheckout(userId: string, dto: CheckoutDto) {
    // We wrap everything in an interactive Prisma transaction.
    // This ensures Atomicity and Consistency. If any throw occurs, everything rolls back.
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { userId },
        include: { items: { include: { product: true } } },
      }) as any;

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty. Cannot proceed with checkout.');
      }

      let subtotal = 0;

      // 1. Initial validation of cart items
      for (const item of cart.items) {
        if (item.quantity > item.product.stockQuantity) {
          throw new BadRequestException(
            `Cannot checkout. Item ${item.product.name} only has ${item.product.stockQuantity} in stock.`,
          );
        }
        subtotal += Number(item.product.price) * item.quantity;
      }

      // 2. Calculate final totals
      const shippingCost = subtotal > 100 ? 0 : 15.0; // Free shipping over 100 EUR
      const finalTotal = subtotal + shippingCost;

      // 3. Create the Order in PENDING state
      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING, // Payment not yet confirmed
          totalAmount: finalTotal,
          currency: 'EUR',
          shippingAddress: encrypt(dto.shippingAddress || '123 Fake Street, CA 90210'),
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.product.price,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Deduct stock temporarily (reserved)
      for (const item of cart.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (updatedProduct.stockQuantity < 0) {
          throw new BadRequestException(`Race condition detected: Oversold product ${updatedProduct.name}`);
        }
      }

      // 5. Clear the cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return order;
    });
  }

  async createStripePaymentIntent(amount: number, currency: string, orderId: string) {
    return this.stripePayment.createPaymentIntent(amount, currency, orderId);
  }

  async handleStripeWebhook(payload: any) {
    this.logger.log(`Received Stripe webhook payload: ${payload.type}`);
    
    // In Stripe, the intent object is under payload.data.object
    const intent = payload.data?.object;
    if (!intent || !intent.metadata?.orderId) return;

    const orderId = intent.metadata.orderId;
    const status = payload.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed';
    const errorDetail = payload.data?.error?.message;

    // We process the webhook update transactionally
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
      if (!order) {
        this.logger.error(`Order ${intent.orderId} not found for webhook!`);
        return;
      }

      // 1. Update order status
      const newStatus = status === 'succeeded' ? OrderStatus.PAID : OrderStatus.CANCELLED;
      await tx.order.update({
        where: { id: order.id },
        data: { status: newStatus }
      });

      // 2. Create Payment Record
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: intent.amount / 100, // Convert cents back to main currency unit
          currency: intent.currency.toUpperCase(),
          provider: 'stripe',
          status: status === 'succeeded' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          transactionId: encrypt(intent.id),
        }
      });

      // 3. Revert stock if payment failed
      if (status === 'failed') {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } }
          });
        }
      }

      // 4. Publish to message queue
      await this.paymentQueue.publishStatusUpdate({
        orderId: order.id,
        email: order.user.email,
        status: status,
        errorDetail: errorDetail
      });
    });
  }
}
