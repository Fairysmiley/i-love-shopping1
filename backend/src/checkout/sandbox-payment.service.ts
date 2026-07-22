import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'succeeded' | 'failed' | 'processing';
  orderId: string;
}

@Injectable()
export class SandboxPaymentService {
  private readonly logger = new Logger(SandboxPaymentService.name);

  constructor(private readonly redis: RedisService) {}

  /** Create a payment intent */
  async createPaymentIntent(amount: number, currency: string, orderId: string): Promise<PaymentIntent> {
    const id = `pi_sandbox_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const intent: PaymentIntent = {
      id,
      amount,
      currency,
      status: 'requires_payment_method',
      orderId,
    };
    
    // Store in redis temporarily (like Stripe does internally)
    await this.redis.setEx(`payment_intent:${id}`, JSON.stringify(intent), 3600); // 1 hour expiry
    return intent;
  }

  /**
   * Simulate a webhook callback by firing a request to our own server,
   * or we can just emit an event. The prompt asks for:
   * "The order system updates status appropriately upon receiving callbacks from payment provider"
   * So we will simulate an external webhook callback hitting our API.
   */
  async simulateWebhookCallback(intentId: string, status: 'succeeded' | 'failed', errorDetail?: string) {
    const intentData = await this.redis.get(`payment_intent:${intentId}`);
    if (!intentData) return;

    const intent: PaymentIntent = JSON.parse(intentData);
    intent.status = status;
    await this.redis.setEx(`payment_intent:${intentId}`, JSON.stringify(intent), 3600);

    const payload = {
      type: status === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
      data: {
        object: intent,
        error: errorDetail ? { message: errorDetail } : null,
      },
    };

    // In a real environment, this would be an HTTP POST to /api/v1/payment/webhook.
    // For sandbox, we'll fetch our own endpoint to trigger the callback flow.
    try {
      // Running inside docker, 'api' is the host, but we can use localhost
      await fetch('http://localhost:3000/api/v1/payment/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      this.logger.error(`Failed to send sandbox webhook: ${e.message}`);
    }
  }

  /** 
   * Simulate the card charge.
   * Specific card numbers trigger specific scenarios.
   */
  async confirmPayment(intentId: string, cardNumber: string): Promise<void> {
    const intentData = await this.redis.get(`payment_intent:${intentId}`);
    if (!intentData) throw new Error('Payment intent not found');
    
    const intent: PaymentIntent = JSON.parse(intentData);
    
    // Simulate gateway timeout
    if (cardNumber === '4000000000000005') {
      // Don't fire webhook, simulate timeout
      return;
    }

    // Default to success
    let status: 'succeeded' | 'failed' = 'succeeded';
    let errorDetail: string | undefined;

    // specific failure scenarios
    if (cardNumber === '4000000000000002') {
      status = 'failed';
      errorDetail = 'insufficient funds error';
    } else if (cardNumber === '4000000000000003') {
      status = 'failed';
      errorDetail = 'invalid card number error';
    } else if (cardNumber === '4000000000000004') {
      status = 'failed';
      errorDetail = 'expired card error';
    }

    // Fire webhook asynchronously
    setTimeout(() => {
      this.simulateWebhookCallback(intentId, status, errorDetail);
    }, 1500); // 1.5s delay to simulate external processing
  }
}
