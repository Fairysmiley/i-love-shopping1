**Student can explain the concept of PCI DSS compliance and why sensitive payment data should not be stored on application servers.**

PCI DSS is the card networks' security standard for anyone who stores,
processes, or transmits cardholder data — network segmentation, access
controls, regular audits, the works. The less of that your own servers
actually touch, the less of it applies to you at all, which is the whole
reason to avoid storing card data in the first place.

- **What never reaches our servers** — the payment step uses Stripe's `PaymentElement`, which renders Stripe's own hosted iframe. Card number, expiry, and CVV go straight from the customer's browser to Stripe over TLS; our own frontend JavaScript and backend never see them (`frontend/src/components/StripePaymentForm.tsx`).
- **What we do store** — only a Stripe `PaymentIntent` id (`Payment.transactionId`, `backend/prisma/schema.prisma`), an opaque reference with no cardholder data in it at all. Even that gets encrypted at rest (AES-256-GCM, `backend/src/common/utils/encryption.util.ts`) as defense-in-depth, not because it's regulated data on its own.
- **Why this matters practically** — a slip-up in payment handling has real consequences (Equifax's reputational damage, Target's breach costs, Heartland losing its right to process payments), so keeping card data out of the app entirely isn't just a compliance checkbox, it removes an entire category of risk.

More detail in [`docs/REFERENCE.md`](REFERENCE.md) under "Payments:
theoretical concepts".

> **Verbal**

---

**Student can explain their approach to testing cart functionality, checkout flows, and payment integration.**

Three layers, each catching a different kind of bug:
- **Unit tests** — Prisma, Redis, and Stripe are all mocked out, so these run in milliseconds and pin down business-logic edge cases precisely: stock clamping, decimal precision, guest-vs-logged-in branching (`backend/src/cart/cart.service.spec.ts`, `backend/src/checkout/checkout.service.spec.ts`).
- **API integration tests** — real Postgres, Redis, and RabbitMQ running in Docker, real HTTP requests through the full request pipeline, asserting on actual database state after the webhook → queue → consumer chain has settled (`backend/test/commerce.e2e-spec.ts`).
- **Manual testing against live Stripe** — every payment-related requirement was also verified by hand against real Stripe test-mode keys with `stripe listen` running, not just against mocks — the actual webhook signature verification, actual test-card declines, actual async status settling.

> **Verbal**

---

**Automated tests exist for Unit tests (cart functionality, order calculations) and Critical User Flow tests (registration, checkout process). Ask the student to explain and demonstrate the functionality of the tests.**

| Layer | Count | Where |
|---|---|---|
| Unit | 108 tests, 12 suites | `backend/src/**/*.spec.ts` — cart, checkout, and order-service specs cover add/update/remove/get/merge, totals, stock limits, guest checkout, and Stripe failure parsing |
| API integration / Critical Flow | 63 tests, 2 suites | `backend/test/app.e2e-spec.ts` and `backend/test/commerce.e2e-spec.ts` — full register → cart → checkout → order flow, guest checkout, and checkout edge cases |

> Ask to see it run live. Unit suite (no database needed, about 20 seconds):
> ```
> cd backend && npm test
> ```
> Or everything — unit and integration together, 171 tests, against a fully isolated throwaway Postgres/Redis/RabbitMQ that never touches dev data:
> ```
> docker compose --profile test run --rm e2e
> ```

---

**Student can explain the concept of JWT and its components (header, payload, signature).**

A JWT is three Base64URL-encoded parts joined by dots: `header.payload.signature`.

- **Header** — says which algorithm signed the token (`HS256`).
- **Payload** — the claims about the user: `sub` (user id), `email`, `role`, `jti` (a unique id used to revoke this specific token), `twoFactorEnabled`, and `scope` (`'full'` for a normal session, `'twofa_setup'` for the restricted token issued during mandatory 2FA setup). Defined in `AccessTokenPayload` (`backend/src/auth/tokens.service.ts:14-26`).
- **Signature** — proves the token wasn't tampered with. It's an HMAC-SHA256 hash of the header+payload, signed with a secret only the server knows (`JWT_ACCESS_SECRET`, wired up in `auth.module.ts:20-26`). Change one character of the payload and the signature no longer matches.

On every request, `JwtStrategy` re-checks the signature and expiry, and also checks the `jti` against a Redis denylist — so a token can be revoked (e.g. on logout) even before it expires.

> **Verbal**

---

**Student can explain the chosen database's scalability features and how they support potential growth of the e-commerce platform.**

We use PostgreSQL. Four things keep it scaling as traffic grows:
- **Connection pooling** — Prisma pools connections so bursts of shoppers don't exhaust Postgres's connection limit.
- **Indexes** — on the fields we look up or filter by most (`emailHash`, `slug`, `tokenHash`, and the composite indexes behind faceted search), so lookups stay fast as the catalogue grows.
- **Read replicas** — catalogue browsing/search is the vast majority of traffic and is mostly reads, so those reads can be pointed at replicas, leaving the primary database free to handle writes (orders, auth).
- **Redis caching** — `RedisService` caches search results, facet counts, and typeahead suggestions for 60 seconds (`products.service.ts:118, 172`), so a traffic spike (a sale, a promotion) mostly hits Redis, not Postgres.

> **Verbal**
---

**Student can explain ACID properties and their importance in e-commerce database design.**

- **Atomicity** — "all or nothing." Refresh-token rotation (`TokensService.rotate()`) revokes the old token and issues the new one inside one `prisma.$transaction(...)` — if either step fails, both are undone.
- **Consistency** — the database enforces rules the app can't accidentally break: money uses `Prisma.Decimal` (no floating-point rounding errors), foreign keys stop a `Product` pointing at a `Category` that doesn't exist, and unique constraints stop duplicate emails or duplicate reviews.
- **Isolation** — concurrent transactions can't corrupt each other. Stock decrements use `UPDATE ... SET stockQuantity = stockQuantity - N` inside a transaction (`backend/src/checkout/checkout.service.ts:132-143`); Postgres locks that row for the duration, so if two people try to buy the last item at the same time, they're serialized — one succeeds, the other's transaction sees a negative result and rolls back.
- **Durability** — once a transaction commits, it survives a crash (Postgres's write-ahead log), and the data itself survives container restarts (persisted to a Docker volume).

**To demonstrate the isolation guarantee live:** set a product's stock to 1, then fire two simultaneous checkout requests for it (two browser tabs, or two `curl`/Postman calls at once). One order succeeds; the other gets an out-of-stock error — never both succeeding.

> **Verbal**

---

**Student can demonstrate and explain the search implementation including database design and basic text search functionality.**

Two related endpoints, both built on Prisma's parameterized query builder (so raw user input is never concatenated into SQL — no SQL-injection surface):

- **Full search** — `GET /api/v1/products?q=<term>` does a case-insensitive `contains` match on the product's name and description (`buildWhere()`, `backend/src/catalog/products.service.ts:31-70`). The same function also layers on faceted filters — category, brand, price range, rating, custom attributes — built dynamically from whatever query params are present.
- **Typeahead** — `GET /api/v1/products/suggest?q=<term>` returns up to 8 matching product names, ignores anything under 2 characters, and caches results in Redis for 60 seconds so fast typing doesn't hammer the database (`products.service.ts:176-194`).

**To demonstrate live:**
1. Open the storefront and type into the header search box — after the 2nd character, a typeahead dropdown appears with live suggestions.
2. Press Enter (or click a result) to land on `/shop?q=<term>` and see full matching results, with the facet filters (category, brand, price, rating) alongside them.
3. Try a filter combo — e.g. pick a category and a price range — and show the result list narrowing.
4. To show the SQL-injection point is safe, type something like `' OR 1=1 --` into the search box: it's treated as a literal (no-match) search string, not a query fragment.

Covered by automated tests: `'GET /api/v1/products/suggest returns dynamic suggestions'` and `'treats SQL-injection-style search input as data, not commands'` (`app.e2e-spec.ts:178, 567`).

> **Self-testable**

---

**Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process.**

Three automated layers, plus scheduled manual checks:
- **Unit tests** — fast, no I/O: token generation/rotation, DTO validation, CAPTCHA enforcement, unit conversion, the shape of data sent to the client.
- **API integration tests** — spin up the real NestJS app against a real PostgreSQL instance and hit it over HTTP (via Supertest), checking status codes and what actually gets persisted.
- **Security tests** — malformed payloads, SQL-injection-shaped input, tampered path parameters, and checks that role-based guards actually block the wrong role.
- **Manual** — CAPTCHA, OAuth login round-trips, and the 2FA setup+login flow are checked by hand periodically, since they depend on real third-party services that are impractical to fully automate.

> **Verbal**

---

**Ask the student to explain and demonstrate the functionality of the tests.**

**Live demo, in order:**
1. **Token rotation security** (`backend/test/app.e2e-spec.ts:310`) — rotate a refresh token, then try to reuse the original (now-revoked) one, and show it's rejected with `401`.
2. **CAPTCHA isolation** (`backend/src/auth/captcha.service.spec.ts`) — show the test skips real Google calls in dev mode but still enforces CAPTCHA when it's configured.
3. **Unit conversion** (`backend/src/common/utils/units.spec.ts`) — metric→imperial conversion correctness, a plain input/output unit test.
4. **A failing test, live** — open `app.e2e-spec.ts`, flip one `expect(res.status).toBe(400)` to `.toBe(200)`, rerun, point out the red failure output, then revert and rerun green.

**Commands to run it yourself:**
```bash
cd backend
npm test            # unit tests
npm run test:e2e    # API integration + security tests
```
Or, to run the full suite (including e2e) in an isolated Docker environment: `docker compose --profile test run --rm e2e`.

> **Self-testable**

---

**Student can explain their chosen architectural approach and justify how it aligns with their platform's scalability requirements.**

**Pattern: modular monolith.** One deployable NestJS app, split into feature modules (`auth`, `users`, `catalog`, and from Project 2: `checkout`, `cart`, `addresses`, `queue`) plus shared infrastructure modules (`prisma`, `redis`, `mail`).

Chosen over microservices because, at this stage:
- One deployment unit means no inter-service network calls to slow things down or fail.
- Each module already owns its own controller/service/DTOs cleanly, so any module could be pulled out into its own service later, if it ever needs to scale independently — without a rewrite.
- Debugging, transactions, and operations all stay simpler while the team and codebase are small.

**Why it still scales:** the API holds no session state in memory — everything is in the JWT or Redis — so it's stateless and can run as multiple replicas behind a load balancer. Redis absorbs catalogue read spikes; PostgreSQL handles the write-heavy paths (orders, auth) and can add read replicas as traffic grows.

**To demonstrate:** point to the module folders under `backend/src/` — each is self-contained (controller + service + DTOs), which is what would let it be extracted later.

> **Verbal**
