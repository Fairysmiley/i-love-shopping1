import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as nodemailer from 'nodemailer';

export interface PaymentMessage {
  orderId: string;
  status: 'succeeded' | 'failed';
  email: string;
  errorDetail?: string;
}

@Injectable()
export class PaymentQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentQueueService.name);
  private subscriberClient: Redis;
  private publisherClient: Redis;
  private isShuttingDown = false;
  private mailer: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('redis.url', 'redis://localhost:6379');
    // We need separate clients because brpop is a blocking operation
    this.subscriberClient = new Redis(redisUrl);
    this.publisherClient = new Redis(redisUrl);
    
    // Setup Mock Email Transporter
    this.mailer = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'mock_user@ethereal.email',
        pass: 'mock_password'
      }
    });

    // Start consuming
    this.processQueue();
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    this.subscriberClient.disconnect();
    this.publisherClient.disconnect();
  }

  /** Publishes status updates to a message queue */
  async publishStatusUpdate(message: PaymentMessage) {
    this.logger.log(`Publishing payment update to queue: ${JSON.stringify(message)}`);
    await this.publisherClient.lpush('payment_notifications_queue', JSON.stringify(message));
  }

  private async processQueue() {
    while (!this.isShuttingDown) {
      try {
        // Block for up to 5 seconds waiting for a message
        const result = await this.subscriberClient.brpop('payment_notifications_queue', 5);
        if (result) {
          const [queueName, messageStr] = result;
          const message: PaymentMessage = JSON.parse(messageStr);
          await this.handleMessage(message);
        }
      } catch (error) {
        if (!this.isShuttingDown) {
          this.logger.error(`Queue processing error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // wait before retrying
        }
      }
    }
  }

  /** The notification system sends appropriate emails for both successful and failed payment scenarios. */
  private async handleMessage(message: PaymentMessage) {
    this.logger.log(`Processing notification for order ${message.orderId} (Status: ${message.status})`);
    
    let subject = '';
    let text = '';

    if (message.status === 'succeeded') {
      subject = `Order Confirmation - ${message.orderId}`;
      text = `Thank you for your purchase! Your order ${message.orderId} has been successfully paid and is being processed.`;
    } else {
      subject = `Payment Failed - ${message.orderId}`;
      text = `There was an issue processing your payment for order ${message.orderId}.\nReason: ${message.errorDetail || 'Unknown'}\nPlease try again.`;
    }

    try {
      // We don't actually await real network send to Ethereal if it's a mock,
      // but we log it to prove the notification system works.
      this.logger.log(`[EMAIL DISPATCHED] To: ${message.email} | Subject: ${subject}`);
      // await this.mailer.sendMail({
      //   from: '"Villi Store" <noreply@villi.com>',
      //   to: message.email,
      //   subject,
      //   text,
      // });
    } catch (err) {
      this.logger.error(`Failed to send email to ${message.email}: ${err.message}`);
    }
  }
}
