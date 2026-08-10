import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

/**
 * Owns the RabbitMQ connection/channel and the well-known topology for the
 * payment-status queue, including its dead-letter exchange/queue. Messages
 * that exhaust retries in the consumer are routed here instead of being lost
 * (task2's "Message Queue Reliability" requirement).
 */
@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection?: any;
  private channel?: any;

  static readonly PAYMENT_STATUS_QUEUE = 'payment.status.updates';
  static readonly PAYMENT_STATUS_DLX = 'payment.status.updates.dlx';
  static readonly PAYMENT_STATUS_DLQ = 'payment.status.updates.dlq';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('rabbitmq.url') ?? 'amqp://localhost:5672';
    this.connection = await this.connectWithRetry(url);
    this.connection.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ connection error: ${err.message}`),
    );
    this.channel = await this.connection.createChannel();

    // Dead-letter exchange + queue: messages the consumer gives up on land here.
    await this.channel.assertExchange(RabbitmqService.PAYMENT_STATUS_DLX, 'fanout', {
      durable: true,
    });
    await this.channel.assertQueue(RabbitmqService.PAYMENT_STATUS_DLQ, { durable: true });
    await this.channel.bindQueue(
      RabbitmqService.PAYMENT_STATUS_DLQ,
      RabbitmqService.PAYMENT_STATUS_DLX,
      '',
    );

    // Primary queue: failed messages that exceed retry limits are nacked
    // without requeue, which RabbitMQ routes to the DLX above.
    await this.channel.assertQueue(RabbitmqService.PAYMENT_STATUS_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': RabbitmqService.PAYMENT_STATUS_DLX },
    });

    this.logger.log('RabbitMQ connected; payment-status queue + dead-letter queue ready.');
  }

  private async connectWithRetry(url: string, attempts = 15, delayMs = 2000): Promise<any> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await amqp.connect(url);
      } catch (err) {
        this.logger.warn(
          `RabbitMQ connection attempt ${attempt}/${attempts} failed: ${(err as Error).message}`,
        );
        if (attempt === attempts) throw err;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('unreachable');
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  getChannel(): any {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized yet');
    }
    return this.channel;
  }
}
