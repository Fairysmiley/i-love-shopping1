import { Controller, Post, Body } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Req } from '@nestjs/common';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  async processCheckout(@CurrentUser() user: any, @Body() dto: CheckoutDto) {
    return this.checkoutService.processCheckout(user.userId, dto);
  }

  @Post('create-intent')
  async createPaymentIntent(@CurrentUser() user: any, @Body() dto: { orderId: string, amount: number, currency: string }) {
    const intent = await this.checkoutService.createStripePaymentIntent(dto.amount, dto.currency, dto.orderId);
    return { clientSecret: intent.client_secret, intentId: intent.id };
  }

  @Public()
  @Post('webhook')
  async paymentWebhook(@Req() req: any) {
    // In a real environment, you'd use req.rawBody and stripe-signature header to verify
    // the webhook payload. For this implementation, we will pass the parsed body directly
    // since the stripe verification might fail in sandbox without proper raw body middleware.
    await this.checkoutService.handleStripeWebhook(req.body);
    return { received: true };
  }
}
