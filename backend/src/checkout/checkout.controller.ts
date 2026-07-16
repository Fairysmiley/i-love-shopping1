import { Controller, Post, Body } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  async processCheckout(@CurrentUser() user: any, @Body() dto: CheckoutDto) {
    return this.checkoutService.processCheckout(user.userId, dto);
  }
}
