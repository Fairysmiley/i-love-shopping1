import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

/**
 * Automated API integration + security tests (task1).
 *
 * | Block | Type | Covers |
 * |-------|------|--------|
 * | catalog:* | Integration + catalog security | Product API endpoints, DB reads, facets, injection-safe search |
 * | auth flow | Integration | Register/login persistence (database operations) |
 * | OAuth | Integration | Provider redirects + OAuthAccount provisioning/linking |
 * | refresh token rotation | Integration + auth | Token rotation against real DB |
 * | password reset (full) | Integration + auth | Token hash in DB, login with new password |
 * | two-factor authentication | Integration + security | Setup, TOTP login, recovery code |
 * | security:* | Security | Malformed input, SQLi-style strings, authz |
 * | reviews:* | Integration | Review API + aggregate recompute (bonus) |
 *
 * Unit tests (JWT, DTO validation, product model) live in src/*.spec.ts files.
 *
 * Run everything (Docker only): docker compose --profile test run --rm e2e
 * Locally: npm test, then npm run test:e2e (needs PostgreSQL + Redis + seed).
 */
describe('Villi API (e2e)', () => {
  let app: INestApplication;
  const unique = Date.now();
  const email = `e2e_${unique}@example.com`;
  const password = 'Str0ng!Passw0rd';
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const api = () => request(app.getHttpServer());

  // Extracts the refresh_token cookie string from a Set-Cookie header.
  const refreshCookie = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = (raw ?? []).find((c) => c.startsWith('refresh_token='));
    return cookie ? cookie.split(';')[0] : '';
  };

  describe('catalog: endpoints, responses & error handling', () => {
    let sample: any;

    it('GET /api/v1/health returns ok', async () => {
      const res = await api().get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('up');
    });

    it('GET /api/v1/products returns a paginated list with the full data model', async () => {
      const res = await api().get('/api/v1/products?limit=5').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 1, limit: 5, total: expect.any(Number) }),
      );
      sample = res.body.data[0];
      expect(sample).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          slug: expect.any(String),
          price: expect.any(Number),
          stockQuantity: expect.any(Number),
          category: expect.objectContaining({ slug: expect.any(String) }),
          brand: expect.objectContaining({ slug: expect.any(String) }),
        }),
      );
      // Dimensions exposed in both metric and imperial units.
      expect(sample.dimensions.metric).toBeDefined();
      expect(sample.dimensions.imperial).toBeDefined();
    });

    it('GET /api/v1/products/:slug retrieves a single product', async () => {
      const res = await api().get(`/api/v1/products/${sample.slug}`).expect(200);
      expect(res.body.id).toBe(sample.id);
      expect(Array.isArray(res.body.attributes)).toBe(true);
    });

    it('GET /api/v1/products/:slug returns 404 for an unknown product', async () => {
      await api().get('/api/v1/products/does-not-exist-xyz').expect(404);
    });

    it('GET /api/v1/products/facets returns brands, attributes and price bounds', async () => {
      const res = await api().get('/api/v1/products/facets').expect(200);
      expect(Array.isArray(res.body.brands)).toBe(true);
      expect(res.body.brands[0]).toEqual(
        expect.objectContaining({ slug: expect.any(String), count: expect.any(Number) }),
      );
      expect(res.body.price).toEqual(
        expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      );
      expect(typeof res.body.attributes).toBe('object');
    });

    it('faceted search filters by brand', async () => {
      const brand = sample.brand.slug;
      const res = await api().get(`/api/v1/products?brands=${brand}`).expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((p: any) => expect(p.brand.slug).toBe(brand));
    });

    it('faceted search filters by attribute (name:value)', async () => {
      const attr = sample.attributes[0];
      const token = `${attr.name}:${attr.value}`;
      const res = await api()
        .get(`/api/v1/products?attributes=${encodeURIComponent(token)}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((p: any) =>
        expect(p.attributes.some((a: any) => a.name === attr.name && a.value === attr.value)).toBe(
          true,
        ),
      );
    });

    it('supports price filtering + ascending sort', async () => {
      const res = await api().get('/api/v1/products?minPrice=100&sort=price_asc').expect(200);
      const prices = res.body.data.map((p: any) => p.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      prices.forEach((p: number) => expect(p).toBeGreaterThanOrEqual(100));
    });

    it('sorts by rating (descending)', async () => {
      const res = await api().get('/api/v1/products?sort=rating').expect(200);
      const ratings = res.body.data.map((p: any) => p.averageRating);
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    });

    it('supports relevance sort (default)', async () => {
      const res = await api().get('/api/v1/products?sort=relevance').expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const ratings = res.body.data.map((p: any) => p.averageRating);
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    });

    it('rejects an invalid sort option (400)', async () => {
      await api().get('/api/v1/products?sort=cheapest').expect(400);
    });

    it('pagination handles edge-case bounds gracefully (negative page or massive limit)', async () => {
      const negativePage = await api().get('/api/v1/products?page=-1&limit=5').expect(400);
      expect(negativePage.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/page/i)]));

      // DTO limits max page size (usually 100)
      const massiveLimit = await api().get('/api/v1/products?limit=1000').expect(400);
      expect(massiveLimit.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/limit/i)]));
    });

    it('faceted search returns empty gracefully for impossible combinations', async () => {
      const res = await api().get(`/api/v1/products?brands=non-existent-brand`).expect(200);
      expect(res.body.data.length).toBe(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('GET /api/v1/products/suggest returns dynamic suggestions', async () => {
      const res = await api().get('/api/v1/products/suggest?q=jac').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/v1/categories/tree returns the browsing tree', async () => {
      const res = await api().get('/api/v1/categories/tree').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('children');
    });
  });

  describe('auth flow + database persistence', () => {
    it('registers a new user, persists it and returns an access token', async () => {
      const res = await api()
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'E2E', lastName: 'Tester' })
        .expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(email);
      accessToken = res.body.accessToken;
    });

    it('rejects a duplicate registration (409)', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'E2E', lastName: 'Tester' })
        .expect(409);
    });

    it('logs in with valid credentials', async () => {
      const res = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects login with a wrong password (401)', async () => {
      await api().post('/api/v1/auth/login').send({ email, password: 'WrongPassw0rd!' }).expect(401);
    });

    it('retrieves the persisted user via /users/me with a bearer token', async () => {
      const res = await api()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe(email);
    });

    it('blocks /users/me without a token (401)', async () => {
      await api().get('/api/v1/users/me').expect(401);
    });
  });

  describe('OAuth authentication methods', () => {
    it('redirects GET /auth/oauth/google to Google (302)', async () => {
      const res = await api().get('/api/v1/auth/oauth/google').expect(302);
      expect(res.headers.location).toMatch(/google\.com/i);
    });

    it('redirects GET /auth/oauth/github to GitHub (302)', async () => {
      const res = await api().get('/api/v1/auth/oauth/github').expect(302);
      expect(res.headers.location).toMatch(/github\.com/i);
    });

    it('redirects GET /auth/oauth/facebook to Facebook (302)', async () => {
      const res = await api().get('/api/v1/auth/oauth/facebook').expect(302);
      expect(res.headers.location).toMatch(/facebook\.com/i);
    });

    it('provisions a new user from a Google OAuth identity', async () => {
      const users = app.get(UsersService);
      const oauthEmail = `oauth_google_${unique}@example.com`;
      const user = await users.findOrCreateFromOAuth({
        provider: 'GOOGLE',
        providerAccountId: `google-id-${unique}`,
        email: oauthEmail,
        firstName: 'OAuth',
        lastName: 'Google',
      });
      expect(user.email).toBe(oauthEmail);
      expect(user.isEmailVerified).toBe(true);

      const same = await users.findOrCreateFromOAuth({
        provider: 'GOOGLE',
        providerAccountId: `google-id-${unique}`,
        email: oauthEmail,
        firstName: 'OAuth',
        lastName: 'Google',
      });
      expect(same.id).toBe(user.id);
    });

    it('provisions a new user from a GitHub OAuth identity', async () => {
      const users = app.get(UsersService);
      const oauthEmail = `oauth_github_${unique}@example.com`;
      const user = await users.findOrCreateFromOAuth({
        provider: 'GITHUB',
        providerAccountId: `github-id-${unique}`,
        email: oauthEmail,
        firstName: 'OAuth',
        lastName: 'GitHub',
      });
      expect(user.email).toBe(oauthEmail);

      const login = await api()
        .post('/api/v1/auth/login')
        .send({ email: oauthEmail, password: 'NoPassword1!' })
        .expect(401);
      expect(login.body).toBeDefined();
    });

    it('links OAuth to an existing email-password account (same email)', async () => {
      const users = app.get(UsersService);
      const linkEmail = `oauth_link_${unique}@example.com`;
      await api()
        .post('/api/v1/auth/register')
        .send({ email: linkEmail, password, firstName: 'Link', lastName: 'User' })
        .expect(201);

      const linked = await users.findOrCreateFromOAuth({
        provider: 'GITHUB',
        providerAccountId: `gh-link-${unique}`,
        email: linkEmail,
        firstName: 'Link',
        lastName: 'OAuth',
      });
      expect(linked.email).toBe(linkEmail);

      await api().post('/api/v1/auth/login').send({ email: linkEmail, password }).expect(200);
    });
  });

  describe('refresh token rotation (single-use)', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      const login = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
      const oldCookie = refreshCookie(login);
      expect(oldCookie).toContain('refresh_token=');

      // First refresh: succeeds and issues a brand-new refresh cookie.
      const first = await api()
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);
      expect(first.body.accessToken).toEqual(expect.any(String));
      const newCookie = refreshCookie(first);
      expect(newCookie).not.toBe(oldCookie);

      // Reusing the OLD (already-rotated) refresh token must be rejected...
      await api().post('/api/v1/auth/refresh').set('Cookie', oldCookie).expect(401);

      // ...and detecting that reuse burns the whole token family (theft
      // mitigation), so the rotated token is invalidated too.
      await api().post('/api/v1/auth/refresh').set('Cookie', newCookie).expect(401);
    });

    it('revokes tokens on logout (access token denylisted)', async () => {
      const login = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
      const token = login.body.accessToken;
      const cookie = refreshCookie(login);

      await api()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', cookie)
        .expect(204);

      // The revoked access token is now rejected.
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${token}`).expect(401);
      // The revoked refresh token can no longer be rotated.
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });

  describe('password recovery and reset via email', () => {
    it('accepts forgot-password for unknown emails without enumeration (202)', async () => {
      await api()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody-here@example.com' })
        .expect(202);
    });

    it('accepts forgot-password for a registered email (202)', async () => {
      await api().post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    });

    it('rejects reset-password with an invalid token (400)', async () => {
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-valid-token', newPassword: 'Str0ng!Passw0rd' })
        .expect(400);
    });

    it('rejects reset-password when the new password is too weak (400)', async () => {
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: 'any-token', newPassword: 'weak' })
        .expect(400);
    });

    it('resets password with a valid token and revokes old refresh sessions', async () => {
      const resetEmail = `e2e_reset_${unique}@example.com`;
      const oldPassword = 'Str0ng!Passw0rd';
      const newPassword = 'NewStr0ng!Passw0rd9';

      const reg = await api()
        .post('/api/v1/auth/register')
        .send({ email: resetEmail, password: oldPassword, firstName: 'Reset', lastName: 'User' })
        .expect(201);
      const oldRefresh = refreshCookie(reg);

      await api().post('/api/v1/auth/forgot-password').send({ email: resetEmail }).expect(202);

      const prisma = app.get(PrismaService);
      const user = await prisma.user.findUnique({ where: { email: resetEmail } });
      expect(user).toBeTruthy();

      const rawToken = `e2e-reset-${unique}`;
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, newPassword })
        .expect(200);

      await api()
        .post('/api/v1/auth/login')
        .send({ email: resetEmail, password: oldPassword })
        .expect(401);

      await api()
        .post('/api/v1/auth/login')
        .send({ email: resetEmail, password: newPassword })
        .expect(200);

      await api().post('/api/v1/auth/refresh').set('Cookie', oldRefresh).expect(401);
    });
  });

  describe('two-factor authentication (optional, user-enabled)', () => {
    const tfaEmail = `e2e_2fa_${unique}@example.com`;
    const tfaPassword = 'Str0ng!Passw0rd9';
    let tfaSecret = '';
    let tfaRecoveryCode = '';

    function secretFromOtpauthUrl(otpauthUrl: string): string {
      const match = otpauthUrl.match(/[?&]secret=([^&]+)/);
      return match?.[1] ?? '';
    }

    it('enrolls 2FA and requires a TOTP code on login', async () => {
      const reg = await api()
        .post('/api/v1/auth/register')
        .send({ email: tfaEmail, password: tfaPassword, firstName: 'Two', lastName: 'Factor' })
        .expect(201);
      const token = reg.body.accessToken as string;

      const setup = await api()
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      tfaSecret = secretFromOtpauthUrl(setup.body.otpauthUrl as string);
      tfaRecoveryCode = setup.body.recoveryCodes[0] as string;
      expect(tfaSecret.length).toBeGreaterThan(10);

      const totp = authenticator.generate(tfaSecret);
      await api()
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: totp })
        .expect(200);

      const step1 = await api()
        .post('/api/v1/auth/login')
        .send({ email: tfaEmail, password: tfaPassword })
        .expect(200);
      expect(step1.body.requiresTwoFactor).toBe(true);
      expect(step1.body.accessToken).toBeUndefined();

      const step2 = await api()
        .post('/api/v1/auth/login')
        .send({
          email: tfaEmail,
          password: tfaPassword,
          twoFactorCode: authenticator.generate(tfaSecret),
        })
        .expect(200);
      expect(step2.body.accessToken).toEqual(expect.any(String));
    });

    it('accepts a one-time recovery code at login (then rejects reuse)', async () => {
      const step1 = await api()
        .post('/api/v1/auth/login')
        .send({ email: tfaEmail, password: tfaPassword })
        .expect(200);
      expect(step1.body.requiresTwoFactor).toBe(true);

      const step2 = await api()
        .post('/api/v1/auth/login')
        .send({ email: tfaEmail, password: tfaPassword, twoFactorCode: tfaRecoveryCode })
        .expect(200);
      expect(step2.body.accessToken).toEqual(expect.any(String));

      const step3 = await api()
        .post('/api/v1/auth/login')
        .send({ email: tfaEmail, password: tfaPassword, twoFactorCode: tfaRecoveryCode })
        .expect(401);
    });

    it('enforces mandatory 2FA gateway for ADMIN role', async () => {
      // The seeded admin@villi.test does not have 2FA enabled by default.
      // Trying to log in should immediately reject with a 401 demanding 2FA enrollment.
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@villi.test', password: 'Admin!Passw0rd' })
        .expect(401);
      
      expect(res.body.message).toMatch(/Administrators and Staff must enroll in Two-Factor Authentication/i);
    });
  });

  describe('security: input validation & injection', () => {
    it('rejects malformed/extra fields on registration (whitelist + validation, 400)', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({ email: 'bad', password: '123', firstName: '', lastName: '', isAdmin: true })
        .expect(400);
    });

    it('rejects SQL-injection-style login input with 400/401, not 500 (auth)', async () => {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: "admin' OR '1'='1", password: 'Str0ng!Passw0rd' });
      expect([400, 401]).toContain(res.status);
    });

    it('treats SQL-injection-style search input as data, not commands', async () => {
      const res = await api()
        .get(`/api/v1/products?q=${encodeURIComponent("'; DROP TABLE \"Product\";--")}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Catalog still intact after the malicious string.
      const after = await api().get('/api/v1/products').expect(200);
      expect(after.body.meta.total).toBeGreaterThan(0);
    });

    it('safely handles injection attempts in path params (404, not 500)', async () => {
      await api()
        .get(`/api/v1/products/${encodeURIComponent("' OR '1'='1")}`)
        .expect(404);
    });

    it('enforces rate-limiting on authentication endpoints (429)', async () => {
      // Send 15 requests sequentially to hit the Throttle limit of 5.
      const results: any[] = [];
      for (let i = 0; i < 15; i++) {
        results.push(
          await api().post('/api/v1/auth/forgot-password').send({ email: 'ratelimit@example.com' })
        );
      }
      // At least one of these requests must have hit the 429 status code
      const tooManyRequests = results.some((res: any) => res.status === 429);
      expect(tooManyRequests).toBe(true);
    });

    it('blocks admin-only product creation for anonymous users (401)', async () => {
      await api()
        .post('/api/v1/products')
        .send({
          name: 'x',
          description: 'y',
          price: 1,
          stockQuantity: 1,
          categoryId: 'a',
          brandId: 'b',
        })
        .expect(401);
    });

    it('blocks admin-only product creation for a regular logged-in user (403)', async () => {
      const login = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
      const token = login.body.accessToken;
      await api()
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Hacker Jacket',
          description: 'Unauthorized product',
          price: 1,
          stockQuantity: 1,
          categoryId: 'a',
          brandId: 'b',
        })
        .expect(403);
    });
  });

  describe('reviews: ratings derived from real review rows', () => {
    let slug: string;
    let token: string;

    beforeAll(async () => {
      const list = await api().get('/api/v1/products?limit=1').expect(200);
      slug = list.body.data[0].slug;
      const login = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
      token = login.body.accessToken;
    });

    it('lists reviews with a rating summary (public)', async () => {
      const res = await api().get(`/api/v1/products/${slug}/reviews`).expect(200);
      expect(res.body.summary).toEqual(
        expect.objectContaining({
          averageRating: expect.any(Number),
          ratingCount: expect.any(Number),
          distribution: expect.any(Object),
        }),
      );
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('blocks review creation for anonymous users (401)', async () => {
      await api().post(`/api/v1/products/${slug}/reviews`).send({ rating: 5 }).expect(401);
    });

    it('rejects an out-of-range rating (400)', async () => {
      await api()
        .post(`/api/v1/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 6 })
        .expect(400);
    });

    it('creates a review and recomputes the product rating aggregates', async () => {
      await api()
        .post(`/api/v1/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, title: 'Great', body: 'Exactly as described.' })
        .expect(201);

      const reviews = await api().get(`/api/v1/products/${slug}/reviews`).expect(200);
      const me = reviews.body.data.find((r: any) => r.title === 'Great');
      expect(me).toBeDefined();
      expect(me.rating).toBe(5);

      // The product's denormalized aggregates reflect the new review.
      const product = await api().get(`/api/v1/products/${slug}`).expect(200);
      expect(product.body.ratingCount).toBe(reviews.body.summary.ratingCount);
      expect(product.body.averageRating).toBeCloseTo(reviews.body.summary.averageRating, 1);
    });

    it('updates (not duplicates) an existing review on re-submit', async () => {
      const before = await api().get(`/api/v1/products/${slug}/reviews`).expect(200);
      const countBefore = before.body.summary.ratingCount;

      await api()
        .post(`/api/v1/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3, title: 'Changed my mind' })
        .expect(201);

      const after = await api().get(`/api/v1/products/${slug}/reviews`).expect(200);
      expect(after.body.summary.ratingCount).toBe(countBefore);
    });

    it('deletes the caller own review and recomputes (204)', async () => {
      await api()
        .delete(`/api/v1/products/${slug}/reviews/mine`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });
});
