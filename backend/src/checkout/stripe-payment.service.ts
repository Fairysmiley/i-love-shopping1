import { Injectable, Logger, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripePaymentService {
  private readonly logger = new Logger(StripePaymentService.name);
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    // In a real environment, these would be required. 
    // We provide a fallback dummy string to prevent crashes if the user hasn't set them yet.
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') || 'sk_test_dummy';
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || 'whsec_dummy';
    
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia' as any, // fallback
    });
  }

  /** Create a payment intent */
  async createPaymentIntent(amount: number, currency: string, orderId: string): Promise<Stripe.PaymentIntent> {
    try {
      // Stripe expects amount in cents/smallest currency unit
      const amountInCents = Math.round(amount * 100);
      
      const intent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        metadata: {
          orderId,
        },
      });
      return intent;
    } catch (error) {
      this.logger.error(`Failed to create Stripe Payment Intent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Constructs the Stripe Event from the raw webhook payload.
   */
  constructEventFromPayload(signature: string, payload: Buffer): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw err;
    }
  }
}
