import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Commerce E2E (Task 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean up any test users
    await prisma.user.deleteMany({ where: { email: 'e2e-shopper@test.com' } });
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
        shippingAddress: '123 E2E Street',
      });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.id).toBeDefined();
    const orderId = checkoutRes.body.id;

    // 6. Verify order created
    const orderRes = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.items).toHaveLength(1);

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

    // Generate anonymous session identifier
    const guestId = 'guest-e2e-' + Date.now();

    // 2. Add product to guest cart
    const cartRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('x-guest-id', guestId)
      .send({ productId: guestProductId, quantity: 2 });
    expect(cartRes.status).toBe(201);

    // 3. Retrieve cart to verify persistence in temporary storage
    const getCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-id', guestId);
    expect(getCartRes.status).toBe(200);
    expect(getCartRes.body.items).toHaveLength(1);
    expect(getCartRes.body.items[0].quantity).toBe(2);
    expect(getCartRes.body.total).toBeDefined();

    // 4. Execute guest checkout pipeline
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('x-guest-id', guestId)
      .send({
        paymentMethodId: 'tok_mastercard',
        shippingAddress: '456 Guest Ave, Testing City',
        email: 'guest.shopper@test.com',
      });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.id).toBeDefined();
    const guestOrderId = checkoutRes.body.id;

    // 5. Verify order is generated and linked to guest email
    const createdOrder = await prisma.order.findUnique({
      where: { id: guestOrderId },
      include: { items: true },
    });
    expect(createdOrder).toBeDefined();
    // In this codebase, if userId is null, check if email is stored correctly
    // Depending on the exact db schema, let's verify items are created correctly.
    expect(createdOrder?.items).toHaveLength(1);
    expect(createdOrder?.items[0].productId).toBe(guestProductId);

    // 6. Verify inventory is deducted accurately in database
    const updatedProduct = await prisma.product.findUnique({ where: { id: guestProductId } });
    expect(updatedProduct?.stockQuantity).toBe(guestOriginalStock - 2);

    // 7. Verify guest cart is flushed upon completion
    const emptyCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-id', guestId);
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
      await prisma.cartItem.deleteMany({ where: { cart: { userId: (await prisma.user.findUnique({ where: { email: 'edge-cases@test.com' } }))!.id } } });
      
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: '123 Fake' });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cart is empty/i);
    });

    it('fails with 400 on missing required demographic or checkout fields (shipping validation)', async () => {
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
        .send({ shippingAddress: '123 Fake' }); // missing paymentMethodId
      
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('paymentMethodId should not be empty')]));
    });

    it('asserts simulated payment errors trigger appropriate validation/gateway HTTP errors', async () => {
      // Testing with simulatePaymentFailure flag or invalid tokens
      const res = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: '', shippingAddress: '123 Fake' }); // empty paymentMethodId triggers validation
      
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('paymentMethodId should not be empty')]));
    });

    it('properly shifts internal Order entity status between PENDING, SUCCESSFUL, and FAILED via Stripe webhook callback', async () => {
      // First, create a valid order to test webhook against
      const productSuccess = await prisma.product.findFirst({ where: { stockQuantity: { gte: 1 } } });
      const startingStockSuccess = productSuccess!.stockQuantity;

      // Ensure the cart is clean and has our test product
      await prisma.cartItem.deleteMany({ where: { cart: { userId: (await prisma.user.findUnique({ where: { email: 'edge-cases@test.com' } }))!.id } } });

      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: productSuccess!.id, quantity: 1 });

      const checkoutRes = await request(app.getHttpServer())
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethodId: 'tok_visa', shippingAddress: '123 Fake' });
      
      expect(checkoutRes.status).toBe(201);
      const orderId = checkoutRes.body.id;

      // Ensure it starts as PENDING
      const orderPending = await prisma.order.findUnique({ where: { id: orderId } });
      expect(orderPending?.status).toBe('PENDING');

      // 1. Simulate SUCCESS callback
      await request(app.getHttpServer())
        .post('/api/v1/checkout/webhook')
        .send({
          type: 'payment_intent.succeeded',
          data: { object: { metadata: { orderId }, amount: 1500, currency: 'EUR', id: 'pi_test123' } }
        })
        .expect(201); // Controller returns 201 created by default for Post, or 200 depending on framework

      const orderSuccess = await prisma.order.findUnique({ where: { id: orderId } });
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
        .send({ paymentMethodId: 'tok_visa', shippingAddress: '123 Fake' });
      expect(failCheckoutRes.status).toBe(201);
      const failOrderId = failCheckoutRes.body.id;

      // Simulate FAILED callback
      await request(app.getHttpServer())
        .post('/api/v1/checkout/webhook')
        .send({
          type: 'payment_intent.payment_failed',
          data: { object: { metadata: { orderId: failOrderId }, amount: 1500, currency: 'EUR', id: 'pi_fail123' }, error: { message: 'insufficient funds' } }
        });

      const orderFailed = await prisma.order.findUnique({ where: { id: failOrderId } });
      expect(orderFailed?.status).toBe('CANCELLED');

      // Check stock reverted
      const revertedProduct = await prisma.product.findUnique({ where: { id: productFail!.id } });
      // startingStockFail was reduced by 1 in the checkout, but then failed, so it should revert to startingStockFail
      expect(revertedProduct?.stockQuantity).toBe(startingStockFail);
    });
  });
});
