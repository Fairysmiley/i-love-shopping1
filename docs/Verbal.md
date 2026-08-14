**Student can explain the concept of JWT and its components (header, payload, signature).**

A JWT is three Base64URL segments joined by dots:

- **Header** — `{"alg":"HS256","typ":"JWT"}` (set by `@nestjs/jwt`'s `JwtModule`).
- **Payload** — our claims, defined by `AccessTokenPayload` (`backend/src/auth/tokens.service.ts:14-26`): `sub` (user id), `email`, `role`, `jti` (unique token id, used for revocation), `twoFactorEnabled`, and `scope` (`'full'` for a normal session, `'twofa_setup'` for the narrow mandatory-2FA-enrollment token).
- **Signature** — HMAC-SHA256 of `header.payload` using `JWT_ACCESS_SECRET` (`auth.module.ts:20-26`). Any tampering with header or payload invalidates the signature.

Passport's `JwtStrategy` verifies the signature and `exp` on every request before any claim is trusted, and additionally checks the `jti` against a Redis revocation denylist.

> **Verbal**

---

**Student can explain the chosen database's scalability features and how they support potential growth of the e-commerce platform.**

PostgreSQL, for growth headroom:
- **Connection pooling** — Prisma's own pool (tunable `connection_limit`) absorbs bursts of concurrent shoppers without exhausting Postgres connections.
- **Indexes** — unique indexes on `emailHash`, `slug` (products/categories/brands), `tokenHash`; composite/foreign-key indexes back the faceted-search `WHERE` clauses so filtering stays fast as the catalogue grows.
- **Read replicas** — catalogue/search reads (the dominant traffic pattern) can be offloaded to streaming replicas, leaving the primary free for writes (orders, auth).
- **Redis in front of Postgres** — `RedisService` caches product search results, facet aggregations (60s TTL, `products.service.ts:118, 172`), and typeahead suggestions, absorbing read-heavy traffic spikes (promotions, peak hours) entirely outside the database.

> **Verbal**
---

**Student can explain ACID properties and their importance in e-commerce database design.**

- **Atomicity** — `TokensService.rotate()` and (in Project 2) checkout both run inside `prisma.$transaction(...)`: refresh-token rotation revokes the old row and creates the new one together, or neither happens.
- **Consistency** — `Prisma.Decimal` for money (no float rounding drift), FK constraints (a `Product` cannot reference a nonexistent `Category`/`Brand`), unique constraints (`emailHash`, `tokenHash`, `(productId, userId)` on reviews) enforce rules the application layer can't accidentally violate.
- **Isolation** — stock decrement uses an atomic `UPDATE ... SET stockQuantity = stockQuantity - N` inside a transaction (`backend/src/checkout/checkout.service.ts:132-143`); Postgres takes a row lock for the statement's duration, so two concurrent checkouts on the last unit serialize rather than both succeeding — the loser reads a negative result and the whole transaction throws and rolls back.
- **Durability** — Postgres WAL guarantees a committed transaction survives a crash; the `postgres` Docker volume persists data across container restarts.

> **Verbal**

---

**Student can demonstrate and explain the search implementation including database design and basic text search functionality.**

Text search (`GET /api/v1/products?q=<term>`) — `buildWhere()`
(`backend/src/catalog/products.service.ts:31-70`) adds a case-insensitive
`contains` match across `name` and `description`. Typeahead
(`GET /api/v1/products/suggest?q=<term>`) returns up to 8 matching product
names, cached in Redis for 60s to absorb keystroke traffic
(`products.service.ts:176-194`); it short-circuits below 2 characters.
Faceted filtering (category, brand, price range, rating, attributes) is
built dynamically from query params in the same `buildWhere()`, all via
Prisma's parameterized query builder — no raw string concatenation, so
there's no SQL-injection surface here.

> **Self-testable** — type into the header search box (2+ characters triggers the typeahead dropdown); submit to see full-text results on `/shop?q=…`. Automated: `'GET /api/v1/products/suggest returns dynamic suggestions'` and the security test `'treats SQL-injection-style search input as data, not commands'`, `app.e2e-spec.ts:178, 567`.


---

**Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process.**

Three automated layers, plus scheduled manual checks:
- **Unit tests** — pure logic, no I/O: token generation/rotation, DTO validation, CAPTCHA enforcement, dimension conversion, the public product shape.
- **API integration tests** — the real NestJS app + a real PostgreSQL instance via Supertest: HTTP contracts, persistence, status codes.
- **Security tests** — malformed/extra-field payloads, SQL-injection-shaped strings treated as data, path-param injection, RBAC guard enforcement.
- **Manual** — CAPTCHA widget UX, OAuth provider round-trips, and the 2FA setup+login flow are exercised by hand periodically, since they depend on third-party services that are awkward to fully automate.

> **Verbal**

---

**Ask the student to explain and demonstrate the functionality of the tests.**

Suggested live demo, in order:
1. `backend/test/app.e2e-spec.ts:310` — rotate a refresh token, replay the original, watch the `401` assertion.
2. `backend/src/auth/captcha.service.spec.ts` — dev-mode skip vs. enforced-when-configured, in isolation from any real Google call.
3. `backend/src/common/utils/units.spec.ts` — metric→imperial conversion correctness.
4. To show a failing test live: flip any `expect(res.status).toBe(400)` to `.toBe(200)` in `app.e2e-spec.ts`, rerun, observe the red output, then revert.

> **Self-testable** — run `cd backend && npm test && npm run test:e2e` (or the Docker one-liner above). To demonstrate a live failure and recovery: edit an expected value, rerun, observe the failure, revert, rerun green.

---

**Student can explain their chosen architectural approach and justify how it aligns with their platform's scalability requirements.**

**Pattern: modular monolith.** One deployable NestJS API split into feature
modules (`auth`, `users`, `catalog`, and — from Project 2 onward —
`checkout`, `cart`, `addresses`, `queue`) plus shared infrastructure modules
(`prisma`, `redis`, `mail`). Chosen over microservices for Foundation
because:
- Single deployment unit — no inter-service network latency for a codebase this size yet.
- Module boundaries are already clean enough (each domain owns its controller/service/DTOs) to extract into a separate service later without a rewrite, if a specific module's load ever outgrows the rest.
- Simpler debugging, transactions, and operational overhead while the team is small.

Scalability alignment: the API is stateless (all session state is JWT +
Redis, not in-process), so it can run as multiple horizontally-scaled
replicas behind the proxy; Redis absorbs catalogue read spikes; PostgreSQL
handles the write-heavy transactional paths and can add read replicas for
catalogue traffic as it grows.

> **Verbal**



