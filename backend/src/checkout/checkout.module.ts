import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';

import { StripePaymentService } from './stripe-payment.service';
import { PaymentQueueService } from './payment-queue.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, StripePaymentService, PaymentQueueService],
})
export class CheckoutModule {}
