import { Module } from '@nestjs/common';
import { DeliveryOptionsController } from './delivery-options.controller';
import { DeliveryOptionsService } from './delivery-options.service';

@Module({
  controllers: [DeliveryOptionsController],
  providers: [DeliveryOptionsService],
  exports: [DeliveryOptionsService],
})
export class DeliveryOptionsModule {}
