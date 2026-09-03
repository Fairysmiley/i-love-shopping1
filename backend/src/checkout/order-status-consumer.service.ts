import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitmqService } from '../queue/rabbitmq.service';
import { PaymentMessage } from './payment-queue.service';

const MAX_RETRIES = 3;

/**
 * The "Order Service" side of the payment flow diagram: consumes the
 * payment-status messages the webhook handler publishes and applies them —
 * updates Order.status, reverts reserved stock on failure, and sends the
 * confirmation/failure email. Kept separate from the webhook handler itself
 * so status changes actually flow through the queue instead of the webhook
 * mutating the Order directly.
 */
@Injectable()
export class OrderStatusConsumerService implements OnModuleInit {
  private readonly logger = new Logger(OrderStatusConsumerService.name);

  constructor(
    private readonly rabbit: RabbitmqService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const channel = this.rabbit.getChannel();
    await channel.prefetch(5);
    await channel.consume(RabbitmqService.PAYMENT_STATUS_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handle(channel, msg);
    });
  }

  private async handle(channel: any, msg: any): Promise<void> {
    let message: PaymentMessage;
    try {
      message = JSON.parse(msg.content.toString());
    } catch {
      this.logger.error('Discarding unparseable payment status message');
      channel.nack(msg, false, false);
      return;
    }

    const attempt = msg.properties.headers?.['x-retry-count'] ?? 0;
    try {
      await this.applyStatus(message, attempt);
      channel.ack(msg);
    } catch (err) {
      const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) + 1;
      this.logger.error(
        `Failed applying payment status for order ${message.orderId} (attempt ${retryCount}): ${(err as Error).message}`,
      );

      if (retryCount > MAX_RETRIES) {
        this.logger.error(
          `Order ${message.orderId} status update exhausted retries — sending to dead-letter queue`,
        );
        // No requeue: the primary queue's x-dead-letter-exchange routes this to the DLQ.
        channel.nack(msg, false, false);
      } else {
        channel.publish('', RabbitmqService.PAYMENT_STATUS_QUEUE, msg.content, {
          persistent: true,
          headers: { ...msg.properties.headers, 'x-retry-count': retryCount },
        });
        channel.ack(msg);
      }
    }
  }

  private async applyStatus(message: PaymentMessage, attempt: number): Promise<void> {
    // Whether we should (re-)send the email for this delivery. True whenever
    // this call actually transitions the order — the normal case. Also true
    // on a retried delivery (attempt > 0) that finds the order *already*
    // transitioned: that combination means a *previous* attempt got the DB
    // write through but then threw (most likely from this very mail call),
    // so retrying the email is exactly the point of the retry. Only a
    // brand-new delivery (attempt === 0) that finds the order already
    // terminal is a genuine duplicate — e.g. the broker never saw our ack
    // and redelivered a message we'd already fully handled, mail included —
    // and that one case must not re-send.
    const sendMail = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: message.orderId },
        include: { items: true },
      });
      if (!order) {
        this.logger.warn(`Order ${message.orderId} not found; skipping status update`);
        return false;
      }

      // Idempotency: a retried/duplicate webhook must not double-apply
      // (e.g. re-incrementing stock on a second "failed" delivery). The
      // frontend refuses to retry a failed PaymentIntent (it forces a new
      // order instead — see CheckoutPage's paymentFailed guard), so this
      // should only ever see ordinary duplicate deliveries of the same
      // message. A "succeeded" arriving for an already-CANCELLED order is
      // the one combination that isn't routine: it means the card *was*
      // charged (e.g. someone confirmed the same PaymentIntent outside our
      // UI) after we'd already released the order's stock, so it's worth
      // surfacing loudly for manual reconciliation instead of blending in
      // with normal skip-the-duplicate logging.
      if (order.status !== OrderStatus.PENDING) {
        if (message.status === 'succeeded' && order.status === OrderStatus.CANCELLED) {
          this.logger.error(
            `Order ${message.orderId} received a SUCCEEDED payment after already being cancelled — ` +
              `the customer's card was charged for a cancelled order. Needs manual reconciliation.`,
          );
        } else {
          this.logger.log(
            `Order ${message.orderId} already in terminal state ${order.status}; skipping duplicate message`,
          );
        }
        return attempt > 0;
      }

      const newStatus = message.status === 'succeeded' ? OrderStatus.PAID : OrderStatus.CANCELLED;
      await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });

      if (message.status === 'failed') {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }
      return true;
    });

    if (!sendMail) return;

    if (message.status === 'succeeded') {
      await this.mail.sendOrderConfirmation(message.email, message.orderId);
    } else {
      await this.mail.sendPaymentFailed(message.email, message.orderId, message.errorDetail);
    }
  }
}
