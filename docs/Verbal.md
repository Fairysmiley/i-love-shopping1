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
