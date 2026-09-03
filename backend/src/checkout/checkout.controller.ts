import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, CreatePaymentIntentDto } from './dto/checkout.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  private extractCtx(req: Request, user: any) {
    const userId = user?.userId;
    const guestId = req.headers['x-guest-cart-id'] as string | undefined;
    return { userId, guestId };
  }

  @Public()
  @Post()
  async processCheckout(@Req() req: Request, @CurrentUser() user: any, @Body() dto: CheckoutDto) {
    const { userId, guestId } = this.extractCtx(req, user);
    return this.checkoutService.processCheckout({ userId, guestId, email: dto.email }, dto);
  }

  @Public()
  @Post('create-intent')
  async createPaymentIntent(
    @Req() req: Request,
    @CurrentUser() user: any,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    const { userId } = this.extractCtx(req, user);
    const intent = await this.checkoutService.createStripePaymentIntentForOrder(
      dto.orderId,
      userId,
    );
    return { clientSecret: intent.client_secret, intentId: intent.id };
  }

  @Public()
  @Post('webhook')
  async paymentWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or raw payload.');
    }
    let event;
    try {
      event = this.checkoutService.verifyWebhookSignature(signature, req.rawBody);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }
    await this.checkoutService.handleStripeWebhook(event);
    return { received: true };
  }
}
