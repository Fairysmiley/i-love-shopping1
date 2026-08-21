import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripePaymentService } from '../checkout/stripe-payment.service';
import { encrypt, decrypt } from '../common/utils/encryption.util';

describe('OrdersService — refunds', () => {
  let service: OrdersService;
  let prisma: any;
  let stripePayment: any;

  const encryptedIntentId = encrypt('pi_captured123');

  beforeEach(async () => {
    const mockPrisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn((args) => ({ id: args.where.id, status: args.data.status })),
      },
      payment: {
        update: jest.fn(),
      },
      product: {
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const mockStripePayment = {
      refundPayment: jest.fn().mockResolvedValue({ id: 're_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripePaymentService, useValue: mockStripePayment },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
    stripePayment = module.get(StripePaymentService);
  });

  describe('processRefund', () => {
    it('refunds a completed payment via Stripe using the decrypted PaymentIntent id, then marks it REFUNDED', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAID,
        items: [{ productId: 'p1', quantity: 2 }],
        payment: { id: 'pay1', status: PaymentStatus.COMPLETED, transactionId: encryptedIntentId },
      });

      await service.processRefund('o1');

      expect(stripePayment.refundPayment).toHaveBeenCalledWith('pi_captured123');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: PaymentStatus.REFUNDED },
      });
    });

    it('restores stock for every item when refunding a still-active order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAID,
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p2', quantity: 1 },
        ],
        payment: { id: 'pay1', status: PaymentStatus.COMPLETED, transactionId: encryptedIntentId },
      });

      await service.processRefund('o1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stockQuantity: { increment: 2 } },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { stockQuantity: { increment: 1 } },
      });
    });

    it('does not call Stripe for a payment that was never captured', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PENDING,
        items: [],
        payment: { id: 'pay1', status: PaymentStatus.FAILED, transactionId: encryptedIntentId },
      });

      await service.processRefund('o1');

      expect(stripePayment.refundPayment).not.toHaveBeenCalled();
    });

    it('rejects an order that has no payment record', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: OrderStatus.PENDING, payment: null });
      await expect(service.processRefund('o1')).rejects.toThrow(BadRequestException);
      expect(stripePayment.refundPayment).not.toHaveBeenCalled();
    });

    it('rejects a payment that is already refunded', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.CANCELLED,
        payment: { id: 'pay1', status: PaymentStatus.REFUNDED, transactionId: encryptedIntentId },
      });
      await expect(service.processRefund('o1')).rejects.toThrow(BadRequestException);
      expect(stripePayment.refundPayment).not.toHaveBeenCalled();
    });

    it('rejects an unknown order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.processRefund('missing')).rejects.toThrow(NotFoundException);
    });

    it('does not mark the payment refunded if the Stripe call fails', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAID,
        items: [],
        payment: { id: 'pay1', status: PaymentStatus.COMPLETED, transactionId: encryptedIntentId },
      });
      stripePayment.refundPayment.mockRejectedValue(new Error('Stripe unreachable'));

      await expect(service.processRefund('o1')).rejects.toThrow('Stripe unreachable');
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('refunds via Stripe when cancelling an order that was already paid', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PAID,
        items: [{ productId: 'p1', quantity: 1 }],
        payment: { id: 'pay1', status: PaymentStatus.COMPLETED, transactionId: encryptedIntentId },
      });

      await service.cancelOrder('o1', 'u1', false);

      expect(stripePayment.refundPayment).toHaveBeenCalledWith('pi_captured123');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
        data: { status: PaymentStatus.REFUNDED },
      });
    });

    it('does not call Stripe when cancelling a still-PENDING (unpaid) order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'p1', quantity: 1 }],
        payment: null,
      });

      await service.cancelOrder('o1', 'u1', false);

      expect(stripePayment.refundPayment).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('rejects cancelling another user\'s order when not an admin', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'someone-else',
        status: OrderStatus.PENDING,
        payment: null,
      });
      await expect(service.cancelOrder('o1', 'u1', false)).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelling an already-cancelled order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.CANCELLED,
        payment: null,
      });
      await expect(service.cancelOrder('o1', 'u1', false)).rejects.toThrow(BadRequestException);
    });
  });
});

describe('decrypt/encrypt round-trip sanity (used by refund PaymentIntent lookup)', () => {
  it('recovers the original Stripe PaymentIntent id', () => {
    const ciphertext = encrypt('pi_abc123');
    expect(decrypt(ciphertext)).toBe('pi_abc123');
  });
});
