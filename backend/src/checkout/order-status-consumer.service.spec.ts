import { OrderStatus } from '@prisma/client';
import { OrderStatusConsumerService } from './order-status-consumer.service';
import { PaymentMessage } from './payment-queue.service';

describe('OrderStatusConsumerService', () => {
  let service: OrderStatusConsumerService;
  let prisma: any;
  let mail: { sendOrderConfirmation: jest.Mock; sendPaymentFailed: jest.Mock };
  let order: { id: string; status: OrderStatus; items: { productId: string; quantity: number }[] };

  const message = {
    orderId: 'order-1',
    status: 'succeeded' as const,
    email: 'shopper@example.com',
  };

  beforeEach(() => {
    order = {
      id: 'order-1',
      status: OrderStatus.PENDING,
      items: [{ productId: 'p1', quantity: 2 }],
    };

    const tx = {
      order: {
        findUnique: jest.fn(() => Promise.resolve(order)),
        update: jest.fn(({ data }) => {
          order = { ...order, status: data.status };
          return Promise.resolve(order);
        }),
      },
      product: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    mail = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendPaymentFailed: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrderStatusConsumerService({} as any, prisma, mail as any);
  });

  const applyStatus = (msg: PaymentMessage, attempt: number) =>
    (service as any).applyStatus(msg, attempt);

  it('transitions a PENDING order to PAID and emails the confirmation on a fresh delivery', async () => {
    await applyStatus(message, 0);

    expect(order.status).toBe(OrderStatus.PAID);
    expect(mail.sendOrderConfirmation).toHaveBeenCalledWith(message.email, message.orderId);
  });

  it('does not re-send the email for a genuine duplicate delivery of an already-applied message', async () => {
    order.status = OrderStatus.PAID; // a prior delivery already fully handled this order

    await applyStatus(message, 0); // attempt 0: no prior failure, so this is a true duplicate

    expect(mail.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it('does re-send the email on a retried delivery, since the DB write may have already succeeded before a prior attempt failed on the mail step', async () => {
    order.status = OrderStatus.PAID; // the earlier attempt's DB write went through

    await applyStatus(message, 1); // attempt 1: this is a requeue after a prior failure

    expect(mail.sendOrderConfirmation).toHaveBeenCalledWith(message.email, message.orderId);
  });

  it('restocks inventory and emails the failure notice for a failed payment', async () => {
    const failedMessage = { ...message, status: 'failed' as const, errorDetail: 'Card declined' };

    await applyStatus(failedMessage, 0);

    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(mail.sendPaymentFailed).toHaveBeenCalledWith(
      failedMessage.email,
      failedMessage.orderId,
      failedMessage.errorDetail,
    );
  });
});
