import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';

/* ------------------------------------------------------------------ */
/*  Mock factories                                                     */
/* ------------------------------------------------------------------ */

/** Builds a minimal PrismaService mock covering the tables CartService touches. */
function makePrisma() {
  return {
    cart: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

/** Builds a minimal RedisService mock with an in-memory store for guest carts. */
function makeRedis() {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setEx: jest.fn(async (key: string, value: string, _ttl: number) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Shared test fixtures                                               */
/* ------------------------------------------------------------------ */

const PRODUCT_A = {
  id: 'prod-a',
  name: 'Fjällräven Keb Jacket',
  slug: 'fjallraven-keb-jacket',
  price: 250.0,
  stockQuantity: 5,
  images: [{ url: 'https://cdn.example.com/keb.png', isPrimary: true }],
};

const PRODUCT_B = {
  id: 'prod-b',
  name: 'Haglöfs L.I.M Hat',
  slug: 'haglofs-lim-hat',
  price: 35.0,
  stockQuantity: 10,
  images: [],
};

const USER_ID = 'user-42';
const GUEST_ID = 'guest-abc';
const CART_ID = 'cart-1';

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe('CartService', () => {
  let service: CartService;
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    prisma = makePrisma();
    redis = makeRedis();
    service = new CartService(prisma as any, redis as any);
  });

  /* ================================================================ */
  /*  1. Adding items                                                  */
  /* ================================================================ */

  describe('addItem', () => {
    describe('logged-in user (Prisma)', () => {
      it('creates a cart and a new cart item for a first-time user', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.cart.findFirst.mockResolvedValue(null);
        prisma.cart.create.mockResolvedValue({ id: CART_ID, userId: USER_ID });
        prisma.cartItem.findUnique.mockResolvedValue(null);
        prisma.cartItem.create.mockResolvedValue({});
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.addItem({ productId: PRODUCT_A.id, quantity: 1 }, USER_ID);

        expect(prisma.cart.create).toHaveBeenCalledWith({ data: { userId: USER_ID } });
        expect(prisma.cartItem.create).toHaveBeenCalledWith({
          data: { cartId: CART_ID, productId: PRODUCT_A.id, quantity: 1 },
        });
      });

      it('increments quantity when the product already exists in the cart', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        // First call (addItem logic), second call (trailing getCart)
        prisma.cart.findFirst
          .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID })
          .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID, items: [{ productId: PRODUCT_A.id, quantity: 3 }] });
        prisma.cartItem.findUnique.mockResolvedValue({
          id: 'ci-1',
          cartId: CART_ID,
          productId: PRODUCT_A.id,
          quantity: 2,
        });
        prisma.cartItem.update.mockResolvedValue({});
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.addItem({ productId: PRODUCT_A.id, quantity: 1 }, USER_ID);

        expect(prisma.cartItem.update).toHaveBeenCalledWith({
          where: { id: 'ci-1' },
          data: { quantity: 3 },
        });
        expect(prisma.cartItem.create).not.toHaveBeenCalled();
      });

      it('throws BadRequestException if requested quantity exceeds stock', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5

        await expect(
          service.addItem({ productId: PRODUCT_A.id, quantity: 10 }, USER_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('throws BadRequestException if cumulative quantity exceeds stock', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5
        prisma.cart.findFirst.mockResolvedValue({ id: CART_ID, userId: USER_ID });
        prisma.cartItem.findUnique.mockResolvedValue({
          id: 'ci-1',
          cartId: CART_ID,
          productId: PRODUCT_A.id,
          quantity: 4,
        });

        // 4 existing + 2 new = 6 > 5 stock
        await expect(
          service.addItem({ productId: PRODUCT_A.id, quantity: 2 }, USER_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('throws NotFoundException for a non-existent product', async () => {
        prisma.product.findUnique.mockResolvedValue(null);

        await expect(
          service.addItem({ productId: 'missing', quantity: 1 }, USER_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('guest user (Redis)', () => {
      it('stores a new item in Redis under the guest key', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.addItem({ productId: PRODUCT_A.id, quantity: 2 }, undefined, GUEST_ID);

        expect(redis.setEx).toHaveBeenCalled();
        const stored = JSON.parse(redis._store.get(`cart:guest:${GUEST_ID}`)!);
        expect(stored).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);
      });

      it('increments quantity for an existing guest cart item', async () => {
        // Seed the guest cart with 1 item
        redis._store.set(
          `cart:guest:${GUEST_ID}`,
          JSON.stringify([{ productId: PRODUCT_A.id, quantity: 1 }]),
        );
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.addItem({ productId: PRODUCT_A.id, quantity: 2 }, undefined, GUEST_ID);

        const stored = JSON.parse(redis._store.get(`cart:guest:${GUEST_ID}`)!);
        expect(stored).toEqual([{ productId: PRODUCT_A.id, quantity: 3 }]);
      });

      it('throws BadRequestException if guest cumulative quantity exceeds stock', async () => {
        redis._store.set(
          `cart:guest:${GUEST_ID}`,
          JSON.stringify([{ productId: PRODUCT_A.id, quantity: 4 }]),
        );
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5

        await expect(
          service.addItem({ productId: PRODUCT_A.id, quantity: 2 }, undefined, GUEST_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('does not touch Prisma cart tables for guest operations', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.addItem({ productId: PRODUCT_A.id, quantity: 1 }, undefined, GUEST_ID);

        expect(prisma.cart.findFirst).not.toHaveBeenCalled();
        expect(prisma.cart.create).not.toHaveBeenCalled();
        expect(prisma.cartItem.create).not.toHaveBeenCalled();
      });
    });
  });

  /* ================================================================ */
  /*  2. Updating item quantity                                        */
  /* ================================================================ */

  describe('updateItem', () => {
    describe('logged-in user (Prisma)', () => {
      it('updates the quantity within stock limits', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5
        // First call (updateItem logic), second call (trailing getCart)
        prisma.cart.findFirst
          .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID })
          .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID, items: [{ productId: PRODUCT_A.id, quantity: 3 }] });
        prisma.cartItem.findUnique.mockResolvedValue({ id: 'ci-1' });
        prisma.cartItem.update.mockResolvedValue({});
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.updateItem(PRODUCT_A.id, { quantity: 3 }, USER_ID);

        expect(prisma.cartItem.update).toHaveBeenCalledWith({
          where: { id: 'ci-1' },
          data: { quantity: 3 },
        });
      });

      it('throws BadRequestException when new quantity exceeds stock', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 99 }, USER_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('throws NotFoundException when the user has no cart', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.cart.findFirst.mockResolvedValue(null);

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 1 }, USER_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('throws NotFoundException when the item is not in the cart', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.cart.findFirst.mockResolvedValue({ id: CART_ID });
        prisma.cartItem.findUnique.mockResolvedValue(null);

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 1 }, USER_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('guest user (Redis)', () => {
      it('updates quantity in the Redis-backed guest cart', async () => {
        redis._store.set(
          `cart:guest:${GUEST_ID}`,
          JSON.stringify([{ productId: PRODUCT_A.id, quantity: 1 }]),
        );
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

        await service.updateItem(PRODUCT_A.id, { quantity: 4 }, undefined, GUEST_ID);

        const stored = JSON.parse(redis._store.get(`cart:guest:${GUEST_ID}`)!);
        expect(stored[0].quantity).toBe(4);
      });

      it('throws BadRequestException when guest update exceeds stock', async () => {
        redis._store.set(
          `cart:guest:${GUEST_ID}`,
          JSON.stringify([{ productId: PRODUCT_A.id, quantity: 1 }]),
        );
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 6 }, undefined, GUEST_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('throws NotFoundException when guest cart does not exist', async () => {
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
        // no redis entry

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 1 }, undefined, GUEST_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('throws NotFoundException when product is not in the guest cart', async () => {
        redis._store.set(
          `cart:guest:${GUEST_ID}`,
          JSON.stringify([{ productId: 'other-prod', quantity: 1 }]),
        );
        prisma.product.findUnique.mockResolvedValue(PRODUCT_A);

        await expect(
          service.updateItem(PRODUCT_A.id, { quantity: 1 }, undefined, GUEST_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });

  /* ================================================================ */
  /*  3. Removing an item                                              */
  /* ================================================================ */

  describe('removeItem', () => {
    it('deletes the cart item row for a logged-in user via Prisma', async () => {
      // First call (removeItem logic), second call (trailing getCart)
      prisma.cart.findFirst
        .mockResolvedValueOnce({ id: CART_ID })
        .mockResolvedValueOnce({ id: CART_ID, items: [] });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.product.findMany.mockResolvedValue([]);

      await service.removeItem(PRODUCT_A.id, USER_ID);

      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: CART_ID, productId: PRODUCT_A.id },
      });
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('filters the item out of the Redis guest cart', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([
          { productId: PRODUCT_A.id, quantity: 2 },
          { productId: PRODUCT_B.id, quantity: 1 },
        ]),
      );
      prisma.product.findMany.mockResolvedValue([PRODUCT_B]);

      await service.removeItem(PRODUCT_A.id, undefined, GUEST_ID);

      const stored = JSON.parse(redis._store.get(`cart:guest:${GUEST_ID}`)!);
      expect(stored).toEqual([{ productId: PRODUCT_B.id, quantity: 1 }]);
    });

    it('is a no-op when the logged-in user has no cart', async () => {
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.removeItem(PRODUCT_A.id, USER_ID);

      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  /* ================================================================ */
  /*  4. getCart — total calculations + dual-backend routing           */
  /* ================================================================ */

  describe('getCart', () => {
    it('returns enriched items with real-time total for a logged-in user', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: CART_ID,
        userId: USER_ID,
        items: [
          { productId: PRODUCT_A.id, quantity: 2 },
          { productId: PRODUCT_B.id, quantity: 3 },
        ],
      });
      prisma.product.findMany.mockResolvedValue([PRODUCT_A, PRODUCT_B]);

      const cart = await service.getCart(USER_ID);

      // 2 × 250 + 3 × 35 = 605
      expect(cart.total).toBe(605);
      expect(cart.items).toHaveLength(2);
      expect(cart.items[0]).toEqual(
        expect.objectContaining({
          productId: PRODUCT_A.id,
          quantity: 2,
          itemTotal: 500,
          product: expect.objectContaining({
            name: PRODUCT_A.name,
            price: 250,
            image: 'https://cdn.example.com/keb.png',
          }),
        }),
      );
    });

    it('reads from Redis for a guest user and never touches Prisma cart tables', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([{ productId: PRODUCT_B.id, quantity: 1 }]),
      );
      prisma.product.findMany.mockResolvedValue([PRODUCT_B]);

      const cart = await service.getCart(undefined, GUEST_ID);

      expect(redis.get).toHaveBeenCalledWith(`cart:guest:${GUEST_ID}`);
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
      expect(cart.total).toBe(35);
      expect(cart.items).toHaveLength(1);
    });

    it('returns an empty cart when neither userId nor guestId is provided', async () => {
      const cart = await service.getCart();

      expect(cart).toEqual({ items: [], total: 0 });
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('returns an empty cart when the user has no items', async () => {
      prisma.cart.findFirst.mockResolvedValue({ id: CART_ID, items: [] });

      const cart = await service.getCart(USER_ID);

      expect(cart).toEqual({ items: [], total: 0 });
    });

    it('prefers the dedicated thumbnailUrl over the full-size url when present', async () => {
      const productWithThumb = {
        ...PRODUCT_A,
        images: [
          { url: 'https://cdn.example.com/keb.png', thumbnailUrl: 'https://cdn.example.com/keb-thumb.png', isPrimary: true },
        ],
      };
      prisma.cart.findFirst.mockResolvedValue({
        id: CART_ID,
        items: [{ productId: PRODUCT_A.id, quantity: 1 }],
      });
      prisma.product.findMany.mockResolvedValue([productWithThumb]);

      const cart = await service.getCart(USER_ID);

      expect(cart.items[0].product.image).toBe('https://cdn.example.com/keb-thumb.png');
    });

    it('falls back to the full-size url when no thumbnailUrl is set', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: CART_ID,
        items: [{ productId: PRODUCT_A.id, quantity: 1 }],
      });
      prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

      const cart = await service.getCart(USER_ID);

      expect(cart.items[0].product.image).toBe('https://cdn.example.com/keb.png');
    });

    it('sets image to null when the product has no primary image', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: CART_ID,
        items: [{ productId: PRODUCT_B.id, quantity: 1 }],
      });
      prisma.product.findMany.mockResolvedValue([PRODUCT_B]); // images: []

      const cart = await service.getCart(USER_ID);

      expect(cart.items[0].product.image).toBeNull();
    });
  });

  /* ================================================================ */
  /*  5. mergeCart — guest → logged-in user merge                      */
  /* ================================================================ */

  describe('mergeCart', () => {
    it('copies guest items into the user\'s DB cart and clears the guest cart', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([{ productId: PRODUCT_A.id, quantity: 2 }]),
      );
      prisma.product.findUnique.mockResolvedValue(PRODUCT_A);
      prisma.cart.findFirst.mockResolvedValue({ id: CART_ID, userId: USER_ID, items: [] });
      prisma.cartItem.findUnique.mockResolvedValue(null); // no existing item
      prisma.cartItem.create.mockResolvedValue({});
      prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

      await service.mergeCart(GUEST_ID, USER_ID);

      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: CART_ID, productId: PRODUCT_A.id, quantity: 2 },
      });
      expect(redis.del).toHaveBeenCalledWith(`cart:guest:${GUEST_ID}`);
    });

    it('sums quantities when the product already exists in the user cart', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([{ productId: PRODUCT_A.id, quantity: 2 }]),
      );
      prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5
      // First call (mergeCart logic), second call (trailing getCart)
      prisma.cart.findFirst
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID })
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID, items: [{ productId: PRODUCT_A.id, quantity: 3 }] });
      prisma.cartItem.findUnique.mockResolvedValue({
        id: 'ci-existing',
        quantity: 1,
      });
      prisma.cartItem.update.mockResolvedValue({});
      prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

      await service.mergeCart(GUEST_ID, USER_ID);

      // 1 existing + 2 guest = 3 (within stock of 5)
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-existing' },
        data: { quantity: 3 },
      });
    });

    it('clamps the merged quantity to the product stock', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([{ productId: PRODUCT_A.id, quantity: 10 }]),
      );
      prisma.product.findUnique.mockResolvedValue(PRODUCT_A); // stock = 5
      // First call (mergeCart logic), second call (trailing getCart)
      prisma.cart.findFirst
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID })
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID, items: [{ productId: PRODUCT_A.id, quantity: 5 }] });
      prisma.cartItem.findUnique.mockResolvedValue({
        id: 'ci-existing',
        quantity: 3,
      });
      prisma.cartItem.update.mockResolvedValue({});
      prisma.product.findMany.mockResolvedValue([PRODUCT_A]);

      await service.mergeCart(GUEST_ID, USER_ID);

      // Math.min(3 + 10, 5) = 5
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'ci-existing' },
        data: { quantity: 5 },
      });
    });

    it('skips out-of-stock or missing products during merge', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([
          { productId: 'prod-missing', quantity: 1 },
          { productId: 'prod-oos', quantity: 1 },
        ]),
      );
      prisma.product.findUnique
        .mockResolvedValueOnce(null)                                    // missing
        .mockResolvedValueOnce({ ...PRODUCT_B, stockQuantity: 0 });     // out of stock
      // First call (mergeCart logic), second call (trailing getCart)
      prisma.cart.findFirst
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID })
        .mockResolvedValueOnce({ id: CART_ID, userId: USER_ID, items: [] });
      prisma.product.findMany.mockResolvedValue([]);

      await service.mergeCart(GUEST_ID, USER_ID);

      expect(prisma.cartItem.create).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith(`cart:guest:${GUEST_ID}`);
    });

    it('creates a new user cart if one does not already exist', async () => {
      redis._store.set(
        `cart:guest:${GUEST_ID}`,
        JSON.stringify([{ productId: PRODUCT_B.id, quantity: 1 }]),
      );
      prisma.product.findUnique.mockResolvedValue(PRODUCT_B);
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 'new-cart', userId: USER_ID });
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({});
      prisma.product.findMany.mockResolvedValue([PRODUCT_B]);

      await service.mergeCart(GUEST_ID, USER_ID);

      expect(prisma.cart.create).toHaveBeenCalledWith({ data: { userId: USER_ID } });
      expect(prisma.cartItem.create).toHaveBeenCalled();
    });

    it('returns the user cart unchanged when the guest cart is empty', async () => {
      redis._store.set(`cart:guest:${GUEST_ID}`, JSON.stringify([]));
      prisma.cart.findFirst.mockResolvedValue({ id: CART_ID, items: [] });

      const result = await service.mergeCart(GUEST_ID, USER_ID);

      expect(result).toEqual({ items: [], total: 0 });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('returns the user cart unchanged when no guest cart exists in Redis', async () => {
      // redis store is empty — no guest cart
      prisma.cart.findFirst.mockResolvedValue({ id: CART_ID, items: [] });

      const result = await service.mergeCart(GUEST_ID, USER_ID);

      expect(result).toEqual({ items: [], total: 0 });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
