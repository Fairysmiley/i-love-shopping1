import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';

import { StripePaymentService } from './stripe-payment.service';
import { PaymentQueueService } from './payment-queue.service';
import { OrderStatusConsumerService } from './order-status-consumer.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule, CartModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    StripePaymentService,
    PaymentQueueService,
    OrderStatusConsumerService,
  ],
})
export class CheckoutModule {}
