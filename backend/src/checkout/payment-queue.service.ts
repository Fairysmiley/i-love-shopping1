import { Injectable, Logger } from '@nestjs/common';
import { RabbitmqService } from '../queue/rabbitmq.service';

export interface PaymentMessage {
  orderId: string;
  status: 'succeeded' | 'failed';
  email: string;
  errorDetail?: string;
}

/**
 * Publishes payment-status events onto the RabbitMQ queue. This is the
 * "Payment Service" side of the architecture: it never touches the Order
 * row directly — `OrderStatusConsumerService` (the "Order Service" side)
 * consumes these messages and applies them.
 */
@Injectable()
export class PaymentQueueService {
  private readonly logger = new Logger(PaymentQueueService.name);

  constructor(private readonly rabbit: RabbitmqService) {}

  async publishStatusUpdate(message: PaymentMessage): Promise<void> {
    const channel = this.rabbit.getChannel();
    channel.sendToQueue(
      RabbitmqService.PAYMENT_STATUS_QUEUE,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, headers: { 'x-retry-count': 0 } },
    );
    this.logger.log(
      `Published payment status update for order ${message.orderId} (status=${message.status})`,
    );
  }
}
