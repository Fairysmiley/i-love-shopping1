import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt } from '../common/utils/encryption.util';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

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

      // 3. Simulate payment transaction
      if (dto.simulatePaymentFailure) {
        // We throw an error, which instantly aborts the $transaction.
        // No stock is deducted, no order is saved.
        throw new BadRequestException('Payment declined by the payment provider.');
      }

      // If we reach here, payment "succeeded"
      const paymentProvider = 'mock_stripe';
      const transactionId = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // 4. Create the Order
      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PAID, // Payment succeeded right away
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
          payment: {
            create: {
              amount: finalTotal,
              currency: 'EUR',
              provider: paymentProvider,
              status: PaymentStatus.COMPLETED,
              transactionId: encrypt(transactionId),
            },
          },
        },
        include: { items: true, payment: true },
      });

      // 5. Deduct stock safely (preventing overselling)
      for (const item of cart.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        // Double check for concurrent race condition where decrement makes it negative
        if (updatedProduct.stockQuantity < 0) {
          throw new BadRequestException(`Race condition detected: Oversold product ${updatedProduct.name}`);
        }
      }

      // 6. Clear the cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return order;
    });
  }
}
