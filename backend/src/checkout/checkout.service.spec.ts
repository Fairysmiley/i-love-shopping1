import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { OrderStatus } from '@prisma/client';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      cart: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
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
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    service = new CheckoutService(prisma);
  });

  it('calculates accurate totals with shipping and deducts stock', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 2, product: { name: 'Jacket', price: 30.0, stockQuantity: 5 } },
      { productId: 'p2', quantity: 1, product: { name: 'Hat', price: 15.0, stockQuantity: 10 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems });
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 });
    prisma.order.create.mockResolvedValue({ id: 'o1', totalAmount: 90.0 });

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    const order = await service.processCheckout('u1', dto);

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
      { productId: 'p1', quantity: 10, product: { name: 'Jacket', price: 30.0, stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems });

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await expect(service.processCheckout('u1', dto)).rejects.toThrow(BadRequestException);
  });

  it('adds free shipping if subtotal > 100', async () => {
    const cartItems = [
      { productId: 'p1', quantity: 4, product: { name: 'Jacket', price: 30.0, stockQuantity: 5 } },
    ];
    prisma.cart.findFirst.mockResolvedValue({ id: 'c1', items: cartItems });
    prisma.product.update.mockResolvedValue({ stockQuantity: 1 });
    prisma.order.create.mockResolvedValue({ id: 'o2', totalAmount: 120.0 });

    const dto = { paymentMethodId: 'tok', shippingAddress: '123 Main' };
    await service.processCheckout('u1', dto);

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 120.0,
        }),
      }),
    );
  });
});
