import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { decrypt, encrypt } from '../common/utils/encryption.util';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PaymentQueueService } from './payment-queue.service';
import { StripePaymentService } from './stripe-payment.service';

export interface CheckoutContext {
  userId?: string;
  guestId?: string;
  email?: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly stripePayment: StripePaymentService,
    private readonly paymentQueue: PaymentQueueService,
  ) {}

  async processCheckout(ctx: CheckoutContext, dto: CheckoutDto) {
    const { userId, guestId, email } = ctx;

    if (!userId && !guestId) {
      throw new BadRequestException('Cart is empty. Cannot proceed with checkout.');
    }
    if (!userId && !email) {
      throw new BadRequestException('An email address is required to check out as a guest.');
    }

    const deliveryOption = await this.prisma.deliveryOption.findUnique({
      where: { id: dto.deliveryOptionId },
    });
    if (!deliveryOption || !deliveryOption.isActive) {
      throw new BadRequestException('Selected shipping option is not available.');
    }

    // Guest cart items live in Redis, outside the Postgres transaction below;
    // read them first, then re-resolve live product rows inside the
    // transaction (same freshness guarantee the registered-user path gets
    // from reading `product` through `tx`).
    const guestItems = !userId && guestId ? await this.cart.getGuestItems(guestId) : null;

    // We wrap everything in an interactive Prisma transaction.
    // This ensures Atomicity and Consistency. If any throw occurs, everything rolls back.
    const order = await this.prisma.$transaction(async (tx) => {
      let items: {
        productId: string;
        quantity: number;
        product: { name: string; price: any; stockQuantity: number };
      }[];

      if (userId) {
        const cart = (await tx.cart.findFirst({
          where: { userId },
          include: { items: { include: { product: true } } },
        })) as any;
        if (!cart || cart.items.length === 0) {
          throw new BadRequestException('Cart is empty. Cannot proceed with checkout.');
        }
        items = cart.items;
      } else {
        if (!guestItems || guestItems.length === 0) {
          throw new BadRequestException('Cart is empty. Cannot proceed with checkout.');
        }
        const products = await tx.product.findMany({
          where: { id: { in: guestItems.map((i) => i.productId) } },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        items = guestItems
          .filter((i) => productMap.has(i.productId))
          .map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            product: productMap.get(i.productId)!,
          }));
        if (items.length === 0) {
          throw new BadRequestException('Cart is empty. Cannot proceed with checkout.');
        }
      }

      let subtotal = 0;

      // 1. Initial validation of cart items
      for (const item of items) {
        if (item.quantity > item.product.stockQuantity) {
          throw new BadRequestException(
            `Cannot checkout. Item ${item.product.name} only has ${item.product.stockQuantity} in stock.`,
          );
        }
        subtotal += Number(item.product.price) * item.quantity;
      }

      // 2. Calculate final totals using the selected shipping option
      const shippingCost = Number(deliveryOption.price);
      const finalTotal = subtotal + shippingCost;

      // 3. Create the Order in PENDING state
      const createdOrder = await tx.order.create({
        data: {
          userId: userId ?? null,
          guestEmail: userId || !email ? null : encrypt(email),
          status: OrderStatus.PENDING,
          totalAmount: finalTotal,
          currency: 'EUR',
          shippingAddress: encrypt(JSON.stringify(dto.shippingAddress)),
          deliveryOptionId: deliveryOption.id,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.product.price,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Deduct stock temporarily (reserved)
      for (const item of items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (updatedProduct.stockQuantity < 0) {
          throw new BadRequestException(
            `Race condition detected: Oversold product ${updatedProduct.name}`,
          );
        }
      }

      // 5. Clear the registered-user cart (guest cart is cleared after commit, below)
      if (userId) {
        const cart = await tx.cart.findFirst({ where: { userId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
      }

      return createdOrder;
    });

    if (!userId && guestId) {
      await this.cart.clearGuestCart(guestId);
    }

    return order;
  }

  /**
   * Guests have no session beyond the order id itself (an unguessable UUID
   * just handed back by processCheckout) — that possession is treated as
   * authorization for the immediate follow-up payment-intent call. Logged-in
   * users still require an exact account match.
   */
  async assertOrderAccess(orderId: string, userId?: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId && order.userId !== userId) {
      throw new ForbiddenException('This order does not belong to you.');
    }
  }

  async createStripePaymentIntent(amount: number, currency: string, orderId: string) {
    return this.stripePayment.createPaymentIntent(amount, currency, orderId);
  }

  verifyWebhookSignature(signature: string, rawBody: Buffer) {
    return this.stripePayment.constructEventFromPayload(signature, rawBody);
  }

  /**
   * "Payment Service" side of the flow: records what the gateway told us
   * about the payment, then publishes a status message onto the queue. It
   * deliberately does NOT touch Order.status or inventory — that happens
   * asynchronously in OrderStatusConsumerService, matching the required
   * Order Service <- Message Queue <- Payment Service architecture.
   */
  async handleStripeWebhook(payload: any) {
    this.logger.log(`Received Stripe webhook payload: ${payload.type}`);

    const intent = payload.data?.object;
    if (!intent || !intent.metadata?.orderId) return;

    const orderId = intent.metadata.orderId;
    const status: 'succeeded' | 'failed' =
      payload.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed';
    const errorDetail = payload.data?.error?.message;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) {
      this.logger.error(`Order ${orderId} not found for webhook!`);
      return;
    }

    await this.prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        amount: intent.amount / 100,
        currency: (intent.currency ?? 'eur').toUpperCase(),
        provider: 'stripe',
        status: status === 'succeeded' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        transactionId: encrypt(intent.id),
      },
      update: {
        status: status === 'succeeded' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        transactionId: encrypt(intent.id),
      },
    });

    // order.user/order.guestEmail are raw encrypted columns here (this query
    // bypasses UsersService/decryptOrder) — decrypt before using as an
    // actual email address.
    const notifyEmail = order.user ? decrypt(order.user.email) : order.guestEmail ? decrypt(order.guestEmail) : '';
    await this.paymentQueue.publishStatusUpdate({
      orderId: order.id,
      email: notifyEmail,
      status,
      errorDetail,
    });
  }
}
