import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Stripe from 'stripe';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { decrypt } from '../src/common/utils/encryption.util';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';

function testAddress() {
  return { street: '123 E2E Street', city: 'Helsinki', postalCode: '00100', country: 'Finland' };
}

/** Signs a webhook payload exactly the way Stripe would, so the controller's
 * signature verification (not bypassed for tests) accepts it. */
function signedWebhook(server: any, payload: object) {
  const body = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
  return request(server)
    .post('/api/v1/checkout/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(body);
}

/** The webhook only records the Payment + publishes to RabbitMQ; the actual
 * Order.status update happens asynchronously via the queue consumer. */
async function waitForOrderStatus(
  prisma: PrismaService,
  orderId: string,
  timeoutMs = 8000,
): Promise<{ status: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order && order.status !== 'PENDING') return order;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return prisma.order.findUnique({ where: { id: orderId } });
}

describe('Commerce E2E (Task 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deliveryOptionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api', { exclude: [] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean up any test users left over from a previous run. Order.user is
    // onDelete: Restrict (intentionally, in production), so their orders
    // must be cleared first — deleting the Order cascades its items/payment.
    // email is encrypted at rest, so lookups must go through UsersService
    // (hash-based), not a raw Prisma filter on the ciphertext column.
    const usersService = app.get(UsersService);
    const staleUsers = (
      await Promise.all(
        ['e2e-shopper@test.com', 'edge-cases@test.com'].map((email) => usersService.findByEmail(email)),
      )
    ).filter((u): u is NonNullable<typeof u> => u !== null);
    if (staleUsers.length > 0) {
      const staleUserIds = staleUsers.map((u) => u.id);
      await prisma.order.deleteMany({ where: { userId: { in: staleUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: staleUserIds } } });
    }

    const option = await prisma.deliveryOption.findFirst({ where: { isActive: true } });
    if (!option) throw new Error('Seed data is missing an active delivery option');
    deliveryOptionId = option.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken: string;
  let productId: string;
  let originalStock: number;

  it('Critical Flow: register -> add to cart -> checkout -> order -> deduct inventory', async () => {
    // 1. Get a product from the seeded DB
    const product = await prisma.product.findFirst({ where: { stockQuantity: { gte: 2 } } });
    expect(product).toBeDefined();
    if (!product) return;
    productId = product.id;
    originalStock = product.stockQuantity;

    // 2. Register
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'e2e-shopper@test.com',
        password: 'Password123!',
        firstName: 'E2E',
        lastName: 'Shopper',
      });
    expect(regRes.status).toBe(201);

    // 3. Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-shopper@test.com', password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    accessToken = loginRes.body.accessToken;

    // 4. Add to cart
    const cartRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 2 });
    expect(cartRes.status).toBe(201);

    const getCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(getCartRes.body.items).toHaveLength(1);
    expect(getCartRes.body.items[0].quantity).toBe(2);

    // 5. Checkout
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        paymentMethodId: 'tok_visa',
        shippingAddress: testAddress(),
        deliveryOptionId,
      });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.id).toBeDefined();
    expect(checkoutRes.body.userId).toBeDefined();
    const orderId = checkoutRes.body.id;

    // 6. Verify order created
    const orderRes = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.items).toHaveLength(1);

    // 6b. Public confirmation summary is reachable without auth too.
    const confirmationRes = await request(app.getHttpServer()).get(`/api/v1/orders/${orderId}/confirmation`);
    expect(confirmationRes.status).toBe(200);
    expect(confirmationRes.body.items).toHaveLength(1);

    // 7. Verify inventory deduction
    const updatedProduct = await prisma.product.findUnique({ where: { id: productId } });
    expect(updatedProduct?.stockQuantity).toBe(originalStock - 2);
  });

  it('Critical Flow: guest cart -> guest checkout -> order -> deduct inventory', async () => {
    // 1. Get a product from the seeded DB
    const product = await prisma.product.findFirst({ where: { stockQuantity: { gte: 2 } } });
    expect(product).toBeDefined();
    if (!product) return;
    const guestProductId = product.id;
    const guestOriginalStock = product.stockQuantity;

    // Generate anonymous session identifier — matches the real header the
    // frontend/CartController actually read (`x-guest-cart-id`).
    const guestId = 'guest-e2e-' + Date.now();

    // 2. Add product to guest cart
    const cartRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('x-guest-cart-id', guestId)
      .send({ productId: guestProductId, quantity: 2 });
    expect(cartRes.status).toBe(201);

    // 3. Retrieve cart to verify persistence in temporary storage
    const getCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-cart-id', guestId);
    expect(getCartRes.status).toBe(200);
    expect(getCartRes.body.items).toHaveLength(1);
    expect(getCartRes.body.items[0].quantity).toBe(2);
    expect(getCartRes.body.total).toBeDefined();

    // Guest checkout requires no auth and must be rejected without an email.
    const noEmailRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('x-guest-cart-id', guestId)
      .send({ paymentMethodId: 'tok_mastercard', shippingAddress: testAddress(), deliveryOptionId });
    expect(noEmailRes.status).toBe(400);
    expect(noEmailRes.body.message).toMatch(/email/i);

    // 4. Execute guest checkout pipeline
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('x-guest-cart-id', guestId)
      .send({
        paymentMethodId: 'tok_mastercard',
        shippingAddress: { street: '456 Guest Ave', city: 'Testing City', postalCode: '10001', country: 'Finland' },
        deliveryOptionId,
        email: 'guest.shopper@test.com',
      });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.id).toBeDefined();
    expect(checkoutRes.body.userId).toBeNull();
    const guestOrderId = checkoutRes.body.id;

    // 5. Verify order is generated and linked to the guest email (no account).
    const createdOrder = await prisma.order.findUnique({
      where: { id: guestOrderId },
      include: { items: true },
    });
    expect(createdOrder).toBeDefined();
    expect(createdOrder?.userId).toBeNull();
    // guestEmail is encrypted at rest — the raw DB row holds ciphertext.
    expect(createdOrder?.guestEmail).not.toBe('guest.shopper@test.com');
    expect(decrypt(createdOrder!.guestEmail!)).toBe('guest.shopper@test.com');
    expect(createdOrder?.items).toHaveLength(1);
    expect(createdOrder?.items[0].productId).toBe(guestProductId);

    // 5b. Guests can fetch their order confirmation without an account.
    const confirmationRes = await request(app.getHttpServer()).get(`/api/v1/orders/${guestOrderId}/confirmation`);
    expect(confirmationRes.status).toBe(200);
    expect(confirmationRes.body.status).toBe('PENDING');

    // 6. Verify inventory is deducted accurately in database
    const updatedProduct = await prisma.product.findUnique({ where: { id: guestProductId } });
    expect(updatedProduct?.stockQuantity).toBe(guestOriginalStock - 2);

    // 7. Verify guest cart is flushed upon completion
    const emptyCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-cart-id', guestId);
    expect(emptyCartRes.status).toBe(200);
    expect(emptyCartRes.body.items).toHaveLength(0);
    expect(emptyCartRes.body.total).toBe(0);
  });

  describe('Checkout Resilience & Edge Cases', () => {
    let userToken: string;

    beforeAll(async () => {
      // Create a fresh user for edge cases
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'edge-cases@test.com',
          password: 'Password123!',
          firstName: 'Edge',
          lastName: 'Cases',
        });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'edge-cases@test.com', password: 'Password123!' });
      userToken = loginRes.body.accessToken;
    });

    it('returns 400 Bad Request when attempting to check out an empty cart', async () => {
      // Ensure cart is empty initially
      await prisma.cartItem.deleteMany({ where: { cart: { userId: (await app.get(UsersService).findByEmail('edge-cases@test.com'))!.id } } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: testAddress(), deliveryOptionId });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cart is empty/i);
    });

    it('fails with 400 on missing required checkout fields (payment method)', async () => {
      // Add item to cart first
      const product = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });
      expect(product).toBeDefined();

      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: product!.id, quantity: 1 });

      // Missing paymentMethodId
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ shippingAddress: testAddress(), deliveryOptionId }); // missing paymentMethodId

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('paymentMethodId should not be empty')]));
    });

    it('fails with 400 on an incomplete/invalid shipping address', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          paymentMethodId: 'tok_visa',
          deliveryOptionId,
          shippingAddress: { street: '', city: 'Helsinki', postalCode: '###', country: 'Finland' },
        });

      expect(res.status).toBe(400);
      const messages = [].concat(res.body.message);
      expect(messages.some((m: string) => /street/i.test(m))).toBe(true);
    });

    it('fails with 400 when no shipping option is selected', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: testAddress() }); // missing deliveryOptionId

      expect(res.status).toBe(400);
    });

    it('rejects an empty paymentMethodId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: '', shippingAddress: testAddress(), deliveryOptionId });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('paymentMethodId should not be empty')]));
    });

    it('rejects a webhook with an invalid Stripe signature', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));

      expect(res.status).toBe(400);
    });

    it('applies PENDING -> PAID / CANCELLED via a signed Stripe webhook, asynchronously through the queue', async () => {
      // First, create a valid order to test webhook against
      const productSuccess = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });

      // Ensure the cart is clean and has our test product
      await prisma.cartItem.deleteMany({ where: { cart: { userId: (await app.get(UsersService).findByEmail('edge-cases@test.com'))!.id } } });

      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: productSuccess!.id, quantity: 1 });

      const checkoutRes = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: testAddress(), deliveryOptionId });

      expect(checkoutRes.status).toBe(201);
      const orderId = checkoutRes.body.id;

      // Ensure it starts as PENDING
      const orderPending = await prisma.order.findUnique({ where: { id: orderId } });
      expect(orderPending?.status).toBe('PENDING');

      // 1. Simulate SUCCESS callback (signed, as the real gateway would send it)
      await signedWebhook(app.getHttpServer(), {
        type: 'payment_intent.succeeded',
        data: { object: { metadata: { orderId }, amount: 1500, currency: 'eur', id: 'pi_test123' } },
      }).expect(201);

      const orderSuccess = await waitForOrderStatus(prisma, orderId);
      expect(orderSuccess?.status).toBe('PAID');

      // 2. We create another order to test FAILURE (which reverts stock)
      const productFail = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });
      const startingStockFail = productFail!.stockQuantity;

      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: productFail!.id, quantity: 1 });

      const failCheckoutRes = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: testAddress(), deliveryOptionId });
      expect(failCheckoutRes.status).toBe(201);
      const failOrderId = failCheckoutRes.body.id;

      // Simulate FAILED callback (signed)
      await signedWebhook(app.getHttpServer(), {
        type: 'payment_intent.payment_failed',
        data: {
          object: { metadata: { orderId: failOrderId }, amount: 1500, currency: 'eur', id: 'pi_fail123' },
          error: { message: 'insufficient funds' },
        },
      });

      const orderFailed = await waitForOrderStatus(prisma, failOrderId);
      expect(orderFailed?.status).toBe('CANCELLED');

      // Check stock reverted
      const revertedProduct = await prisma.product.findUnique({ where: { id: productFail!.id } });
      // startingStockFail was reduced by 1 in the checkout, but then failed, so it should revert to startingStockFail
      expect(revertedProduct?.stockQuantity).toBe(startingStockFail);
    });

    it('is idempotent: a duplicate webhook for an already-settled order does not double-revert stock', async () => {
      const product = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });
      const startingStock = product!.stockQuantity;

      await prisma.cartItem.deleteMany({ where: { cart: { userId: (await app.get(UsersService).findByEmail('edge-cases@test.com'))!.id } } });
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: product!.id, quantity: 1 });

      const checkoutRes = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: testAddress(), deliveryOptionId });
      const orderId = checkoutRes.body.id;

      const failurePayload = {
        type: 'payment_intent.payment_failed',
        data: {
          object: { metadata: { orderId }, amount: 1500, currency: 'eur', id: 'pi_dup_fail' },
          error: { message: 'insufficient funds' },
        },
      };

      await signedWebhook(app.getHttpServer(), failurePayload);
      await waitForOrderStatus(prisma, orderId);

      // Fire the exact same webhook again — the consumer must skip it (order
      // already left PENDING), or stock would be incorrectly incremented twice.
      await signedWebhook(app.getHttpServer(), failurePayload);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const finalProduct = await prisma.product.findUnique({ where: { id: product!.id } });
      expect(finalProduct?.stockQuantity).toBe(startingStock); // reverted exactly once
    });
  });
});
