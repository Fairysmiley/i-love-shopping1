import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripePaymentService } from './stripe-payment.service';
import { PaymentQueueService } from './payment-queue.service';
import { Prisma } from '@prisma/client';
import { decrypt } from '../common/utils/encryption.util';

const DELIVERY_OPTION = { id: 'do1', price: new Prisma.Decimal('15.00'), isActive: true };

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prisma: any;
  let cart: any;

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
        findMany: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      deliveryOption: {
        findUnique: jest.fn().mockResolvedValue(DELIVERY_OPTION),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const mockCart = {
      getGuestItems: jest.fn(),
      clearGuestCart: jest.fn(),
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
        { provide: CartService, useValue: mockCart },
        { provide: StripePaymentService, useValue: mockStripePayment },
        { provide: PaymentQueueService, useValue: mockPaymentQueue },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    prisma = module.get(PrismaService);
    cart = module.get(CartService);
  });

  const dto = (overrides: Partial<any> = {}) => ({
    paymentMethodId: 'tok',
    deliveryOptionId: 'do1',
    shippingAddress: {
      street: '123 Main',
      city: 'Helsinki',
      postalCode: '00100',
      country: 'Finland',
    },
    ...overrides,
  });

  it('throws BadRequestException if the cart is empty or missing', async () => {
    prisma.cart.findFirst.mockResolvedValue(null);
    await expect(service.processCheckout({ userId: 'u1' }, dto())).rejects.toThrow(
      'Cart is empty. Cannot proceed with checkout.',
    );

    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: [] } as any);
    await expect(service.processCheckout({ userId: 'u1' }, dto())).rejects.toThrow(
      'Cart is empty. Cannot proceed with checkout.',
    );
  });

  it('rejects when neither a user nor a guest cart is presented', async () => {
    await expect(service.processCheckout({}, dto())).rejects.toThrow(BadRequestException);
  });

  it('rejects guest checkout without an email', async () => {
    await expect(service.processCheckout({ guestId: 'g1' }, dto())).rejects.toThrow(
      'An email address is required to check out as a guest.',
    );
  });

  it('rejects an unavailable/unknown shipping option', async () => {
    prisma.deliveryOption.findUnique.mockResolvedValueOnce(null);
    await expect(service.processCheckout({ userId: 'u1' }, dto())).rejects.toThrow(
      'Selected shipping option is not available.',
    );
  });

  it('calculates accurate totals with the selected shipping option and deducts stock', async () => {
    const cartItems = [
      {
        productId: 'p1',
        quantity: 2,
        product: { name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 },
      },
      {
        productId: 'p2',
        quantity: 1,
        product: { name: 'Hat', price: new Prisma.Decimal('15.00'), stockQuantity: 10 },
      },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o1', totalAmount: 90.0 } as any);

    await service.processCheckout({ userId: 'u1' }, dto());

    // subtotal = 30*2 + 15*1 = 75. + 15 (mocked delivery option price) = 90.
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 90.0,
          userId: 'u1',
          guestEmail: null,
          deliveryOptionId: 'do1',
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
      {
        productId: 'p1',
        quantity: 10,
        product: { name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 },
      },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);

    await expect(service.processCheckout({ userId: 'u1' }, dto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('handles decimal precision calculating final amount', async () => {
    const cartItems = [
      {
        productId: 'p1',
        quantity: 3,
        product: { name: 'A', price: new Prisma.Decimal('0.10'), stockQuantity: 5 },
      },
      {
        productId: 'p2',
        quantity: 3,
        product: { name: 'B', price: new Prisma.Decimal('0.20'), stockQuantity: 5 },
      },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems } as any);
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o4', totalAmount: 15.9 } as any);

    await service.processCheckout({ userId: 'u1' }, dto());

    const createCallArgs = prisma.order.create.mock.calls[0][0] as any;
    // subtotal = 3*0.10 + 3*0.20 = 0.90 + 15 (delivery) = 15.90
    expect(createCallArgs.data.totalAmount).toBeCloseTo(15.9, 1);
  });

  it('checks out a guest cart using items from Redis, and clears it after commit', async () => {
    cart.getGuestItems.mockResolvedValue([{ productId: 'p1', quantity: 2 }]);
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Jacket', price: new Prisma.Decimal('30.00'), stockQuantity: 5 },
    ]);
    prisma.product.update.mockResolvedValue({ stockQuantity: 3 } as any);
    prisma.order.create.mockResolvedValue({ id: 'o5', totalAmount: 75.0 } as any);

    await service.processCheckout({ guestId: 'g1', email: 'guest@example.com' }, dto());

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          // guestEmail is encrypted at rest (PII) — assert it's ciphertext,
          // not the plaintext address, and that it round-trips correctly.
          guestEmail: expect.stringMatching(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/),
        }),
      }),
    );
    const createCall = prisma.order.create.mock.calls[0][0] as any;
    expect(decrypt(createCall.data.guestEmail)).toBe('guest@example.com');
    expect(prisma.cart.findFirst).not.toHaveBeenCalled(); // guest path never touches the DB cart
    expect(cart.clearGuestCart).toHaveBeenCalledWith('g1');
  });

  it('rejects guest checkout when the guest cart is empty', async () => {
    cart.getGuestItems.mockResolvedValue([]);
    await expect(
      service.processCheckout({ guestId: 'g1', email: 'guest@example.com' }, dto()),
    ).rejects.toThrow('Cart is empty. Cannot proceed with checkout.');
  });
});
