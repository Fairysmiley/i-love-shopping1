import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [CheckoutModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
