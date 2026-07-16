import { INestApplication, ValidationPipe } from '@nestjs/common';
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
      .post('/auth/register')
      .send({
        email: 'e2e-shopper@test.com',
        password: 'Password123!',
        firstName: 'E2E',
        lastName: 'Shopper',
      });
    expect(regRes.status).toBe(201);
    
    // 3. Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e-shopper@test.com', password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    accessToken = loginRes.body.accessToken;

    // 4. Add to cart
    const cartRes = await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, quantity: 2 });
    expect(cartRes.status).toBe(201);

    const getCartRes = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(getCartRes.body.items).toHaveLength(1);
    expect(getCartRes.body.items[0].quantity).toBe(2);

    // 5. Checkout
    const checkoutRes = await request(app.getHttpServer())
      .post('/checkout')
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
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.items).toHaveLength(1);

    // 7. Verify inventory deduction
    const updatedProduct = await prisma.product.findUnique({ where: { id: productId } });
    expect(updatedProduct?.stockQuantity).toBe(originalStock - 2);
  });
});
