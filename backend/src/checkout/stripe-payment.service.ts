import { Injectable, Logger } from '@nestjs/common';
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

  /** Create a payment intent, with a bounded timeout so a slow/unreachable
   *  gateway surfaces as an explicit "payment gateway timeout" error rather
   *  than hanging the checkout request. */
  async createPaymentIntent(
    amount: number,
    currency: string,
    orderId: string,
  ): Promise<Stripe.PaymentIntent> {
    try {
      // Stripe expects amount in cents/smallest currency unit
      const amountInCents = Math.round(amount * 100);

      const intent = await this.withTimeout(
        this.stripe.paymentIntents.create({
          amount: amountInCents,
          currency: currency.toLowerCase(),
          // Explicit, curated list instead of `automatic_payment_methods` —
          // the latter surfaces every method type enabled account-wide in
          // the Stripe Dashboard (Klarna, Bancontact, EPS, MB Way, ...),
          // most of which are irrelevant to a Finnish/Nordic storefront and
          // just add checkout clutter. Card-only keeps checkout a genuine
          // single-page flow — every redirect-based method (MobilePay
          // included) hands off to an external confirmation screen, which
          // conflicts with that requirement.
          payment_method_types: ['card'],
          metadata: {
            orderId,
          },
        }),
        10_000,
        'Payment gateway timeout: Stripe did not respond in time.',
      );
      return intent;
    } catch (error) {
      this.logger.error(`Failed to create Stripe Payment Intent: ${error.message}`);
      throw error;
    }
  }

  /** Issues a real refund against a completed PaymentIntent (full amount).
   *  Returns null if the intent was never actually charged (e.g. it failed
   *  or was never confirmed) — Stripe rejects refunding those, and callers
   *  should treat that as "nothing to refund," not an error. */
  async refundPayment(paymentIntentId: string): Promise<Stripe.Refund | null> {
    try {
      return await this.withTimeout(
        this.stripe.refunds.create({ payment_intent: paymentIntentId }),
        10_000,
        'Payment gateway timeout: Stripe did not respond in time.',
      );
    } catch (error) {
      if (error?.code === 'charge_already_refunded') return null;
      if (
        error?.message?.includes('has not been charged') ||
        error?.code === 'payment_intent_unexpected_state'
      ) {
        this.logger.warn(
          `Refund skipped for ${paymentIntentId}: intent was never successfully charged.`,
        );
        return null;
      }
      this.logger.error(
        `Failed to refund Stripe Payment Intent ${paymentIntentId}: ${error.message}`,
      );
      throw error;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
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
