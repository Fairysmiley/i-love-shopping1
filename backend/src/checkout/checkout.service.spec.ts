import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripePaymentService } from './stripe-payment.service';
import { PaymentQueueService } from './payment-queue.service';
import { Prisma } from '@prisma/client';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      cart: {
        findFirst: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
      product: {
        update: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const mockStripePayment = {
      createPaymentIntent: jest.fn(),
    };

    const mockPaymentQueue = {
      publishStatusUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripePaymentService, useValue: mockStripePayment },
        { provide: PaymentQueueService, useValue: mockPaymentQueue },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    prisma = module.get(PrismaService);
  });

  it('throws BadRequestException if the cart is empty or missing', async () => {
    prisma.cart.findFirst.mockResolvedValue(null);
    await expect(service.processCheckout('u1', { paymentMethodId: 'tok' })).rejects.toThrow('Cart is empty. Cannot proceed with checkout.');

    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: [] } as any);
    await expect(service.processCheckout('u1', { paymentMethodId: 'tok' })).rejects.toThrow('Cart is empty. Cannot proceed with checkout.');
  });

  it('calculates accurate totals with shipping and deducts stock', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 2, product: { name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 } },
      { productId: 'p2', quantity: 1, product: { name: 'Hat', price: new Prisma.Decimal('15.00'), stockQuantity: 10 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o1', totalAmount: 90.0 } as any);

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await service.processCheckout('u1', dto);

    // subtotal = 30*2 + 15*1 = 75. <= 100, so shipping is 15. Total = 90.
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 90.0,
        }),
      }),
    );

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stockQuantity: { decrement: 2 } },
    });
  });

  it('rejects if item exceeds inventory limits', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 10, product: { name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await expect(service.processCheckout('u1', dto)).rejects.toThrow(BadRequestException);
  });

  it('adds free shipping if subtotal > 100', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 4, product: { name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o2', totalAmount: 120.0 } as any);

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await service.processCheckout('u1', dto);

    // subtotal = 4*30 = 120. > 100, free shipping. Total = 120.
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 120.0,
        }),
      }),
    );
  });

  it('adds 15 shipping if subtotal is exactly 100 (threshold is strict > 100)', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 1, product: { name: 'Item', price: new Prisma.Decimal('100.00'), stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o3', totalAmount: 115.0 } as any);

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await service.processCheckout('u1', dto);

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 115.0,
        }),
      }),
    );
  });

  it('handles decimal precision calculating final amount', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 3, product: { name: 'A', price: new Prisma.Decimal('0.10'), stockQuantity: 5 } },
      { productId: 'p2', quantity: 3, product: { name: 'B', price: new Prisma.Decimal('0.20'), stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o4', totalAmount: 15.9 } as any);

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await service.processCheckout('u1', dto);

    const createCallArgs = prisma.order.create.mock.calls[0][0] as any;
    expect(createCallArgs.data.totalAmount).toBeCloseTo(15.9, 1);
  });
});
