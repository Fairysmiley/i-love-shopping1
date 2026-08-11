# Review Guide — Part 1: Platform Foundation

Answers every checklist item at the bottom of [`task1.txt`](task1.txt), in
the same order, against the actual running codebase — not the reference
project. Code paths are relative to the repo root; API routes are relative
to `https://localhost:3001` (direct) or `http://localhost:8080` (unified
proxy). Seeded accounts: `admin@villi.test` / `Admin!Passw0rd` and
`shopper@villi.test` / `Shopper!Passw0rd`.

---

**The README file contains a clear project overview, entity relationship diagram, setup instructions, and usage guide**

Yes. [`README.md`](../README.md) has `## Project overview`, `## Entity
Relationship Diagram` (Mermaid crow's-foot diagram plus full attribute/PK/FK
tables), `## Setup and installation`, and `## Usage guide` as top-level
sections, in that order.

> **Self-testable** — open [README.md](../README.md) and confirm each section is present and populated.

---

**The platform implements a Business-to-Consumer (B2C) e-commerce model.**

Yes. `Role` (`backend/prisma/schema.prisma`) has exactly `USER | ADMIN |
SUPPORT | SALES` — there is no `SELLER`/`MERCHANT`/company-account entity
anywhere in the schema. Consumers browse one platform-operated catalogue and
buy directly; `ADMIN`/`SUPPORT`/`SALES` are internal staff roles for running
the shop, not other businesses transacting on it. No wholesale pricing,
purchase-order flow, or multi-tenant vendor model exists.

> **Self-testable** — browse `https://localhost:8080` as a guest, register as an individual consumer, and grep `schema.prisma` for `enum Role` to confirm no B2B role exists.

---

**The system implements both email-password and OAuth authentication methods.**

Both are implemented. Email/password: `POST /api/v1/auth/register` and
`POST /api/v1/auth/login` (`backend/src/auth/auth.controller.ts`), passwords
hashed with argon2, email stored encrypted at rest (`User.email` ciphertext
+ `User.emailHash` for deterministic lookup). OAuth: `GET
/api/v1/auth/oauth/{google,github,facebook}` + matching `/callback` routes;
`UsersService.findOrCreateFromOAuth()` creates a new user or links the
provider to an existing account with the same email.

> **Self-testable** — register at `/register`, sign out, then use **Continue with Google/GitHub** (needs `GOOGLE_*`/`GITHUB_*` + matching `VITE_*_OAUTH_ENABLED=true` in `.env`, then rebuild `web`). Automated: `describe('OAuth authentication methods', ...)` in `backend/test/app.e2e-spec.ts:230`.

---

**CAPTCHA is integrated into the registration process.**

Yes. `RegisterDto.captchaToken` (`backend/src/auth/dto/auth.dto.ts:46-49`)
is verified server-side by `CaptchaService.verify()`
(`backend/src/auth/captcha.service.ts`), which POSTs the token to Google's
`siteverify` endpoint and enforces a minimum score. If `RECAPTCHA_SECRET` is
unset (local dev), verification is skipped so registration still works
without live keys — but the check itself is never bypassed once a secret is
configured. `Recaptcha.tsx` renders the widget on `/register`.

> **Self-testable** — with `VITE_RECAPTCHA_SITE_KEY`/`RECAPTCHA_SECRET` set, the widget appears on the register form and blocks submission until solved. Unit coverage: `backend/src/auth/captcha.service.spec.ts` (dev-skip, missing-token rejection, siteverify success/failure).

---

**Student can explain the concept of JWT and its components (header, payload, signature).**

A JWT is three Base64URL segments joined by dots:

- **Header** — `{"alg":"HS256","typ":"JWT"}` (set by `@nestjs/jwt`'s `JwtModule`).
- **Payload** — our claims, defined by `AccessTokenPayload` (`backend/src/auth/tokens.service.ts:14-26`): `sub` (user id), `email`, `role`, `jti` (unique token id, used for revocation), `twoFactorEnabled`, and `scope` (`'full'` for a normal session, `'twofa_setup'` for the narrow mandatory-2FA-enrollment token).
- **Signature** — HMAC-SHA256 of `header.payload` using `JWT_ACCESS_SECRET` (`auth.module.ts:20-26`). Any tampering with header or payload invalidates the signature.

Passport's `JwtStrategy` verifies the signature and `exp` on every request before any claim is trusted, and additionally checks the `jti` against a Redis revocation denylist.

> **Verbal**

---

**Access tokens are stored in memory.**

Yes. `frontend/src/api/client.ts:8` holds the access token in a plain
module-level variable (`let accessToken: string | null = null`) — never
`localStorage`/`sessionStorage`/a cookie. `AuthContext` only ever calls
`setAccessToken()`; every API call attaches it as `Authorization: Bearer
<token>` from that variable. Because it's memory-only, a full page reload
loses it; the app then silently calls `POST /api/v1/auth/refresh` using the
httpOnly `refresh_token` cookie to obtain a fresh one.

> **Self-testable** — log in, open DevTools → Application → Local Storage → the app origin: no access token appears there. Reload the page and watch the Network tab for the silent `POST /api/v1/auth/refresh` call that restores the session from the httpOnly cookie.

---

**Refresh token rotation is implemented with single-use validation.**

`TokensService.rotate()` (`backend/src/auth/tokens.service.ts:151-217`).
Only the SHA-256 hash of each refresh token is stored (`tokenHash`), never
the raw value. On every refresh, inside a DB transaction, the presented
token's row is claimed via a conditional `updateMany` — `WHERE id = … AND
revokedAt IS NULL AND replacedById IS NULL` — and only if that update
matches exactly one row is a brand-new token created and linked back via
`replacedById`. That conditional `WHERE` clause *is* the single-use
guarantee: a second, concurrent attempt to rotate the same token matches
zero rows and is rejected.

> **Self-testable** — `docker compose --profile test run --rm e2e` and watch `test/app.e2e-spec.ts:310` (`'rotates the refresh token and rejects reuse of the old one'`) pass.

---

**Verify that each refresh token can only be used once and new refresh token is issued with each refresh. Old refresh tokens must be rejected.**

After a successful rotation the old row has `revokedAt` set and
`replacedById` pointing at its successor
(`tokens.service.ts:176-209`). Presenting it again hits:

```ts
if (stored.revokedAt || stored.replacedById) {
  await this.revokeFamily(stored.familyId);
  throw new UnauthorizedException('Refresh token reuse detected');
}
```

(`tokens.service.ts:163-166`) — not just a 401, but the entire token
**family** (every descendant of that original login) is revoked, since reuse
of an already-rotated token is treated as evidence of theft, not a client
bug.

> **Self-testable** — login → `POST /api/v1/auth/refresh` twice reusing the **first** refresh cookie both times → the second call returns `401`. Automated in the same e2e test as above. Manual curl walkthrough (login → rotate → replay old token → confirm 401 → replay the token that *was* current a moment ago → confirm it *also* now 401s, proving family-wide revocation) is in this session's history and reproducible against the live stack.

---

**Token revocation mechanism is in place for both access and refresh tokens.**

- **Refresh** — `POST /api/v1/auth/logout` calls `revokeRefreshToken()`, setting `revokedAt` on the current token (`auth.controller.ts:159-161`).
- **Access** — the same logout call also does `redis.denylistAccessToken(user.jti, tokens.accessTtlSeconds())` (`auth.controller.ts:164`); `JwtStrategy` checks this Redis denylist by `jti` on every authenticated request, so a logged-out access token is rejected immediately rather than waiting out its 15-minute TTL.

> **Self-testable** — login, note the access token, log out, then call `GET /api/v1/users/me` with that same (still-unexpired) token → `401`. Automated: `'revokes tokens on logout (access token denylisted)'`, `app.e2e-spec.ts:332`.

---

**Password recovery and reset functionality via email is implemented.**

1. `POST /api/v1/auth/forgot-password` generates a random token, stores only its hash in `PasswordResetToken` with a 30-minute expiry (`RESET_TOKEN_TTL_MS`, `auth.service.ts:17`), and emails the raw token as a reset link. Response is identical whether or not the email exists (`202`, no enumeration).
2. `POST /api/v1/auth/reset-password` looks up the token, rejects it if missing/used/expired, updates the password, and revokes the user's existing refresh sessions.

Locally, emails are caught by **Mailhog** (`http://localhost:18025`) rather than a real SMTP provider.

> **Self-testable** — trigger `/forgot-password` from the login page, open Mailhog at `http://localhost:18025`, and follow the reset link. Automated: `describe('password recovery and reset via email', ...)`, `app.e2e-spec.ts:350`.

---

**Two-factor authentication (2FA) is available as an optional, user-enabled feature.**

For `USER` accounts it's opt-in: `/account` → **Enable 2FA** → `POST
/api/v1/auth/2fa/setup` (TOTP QR code) → `POST /api/v1/auth/2fa/enable`
(confirm a code, receive one-time recovery codes). Disabled by default;
login only asks for a code afterward.

For `ADMIN`/`SUPPORT`/`SALES` it is **mandatory**, not optional — but
implemented without a lockout trap: a privileged account without TOTP
configured gets a narrowly-scoped `twofa_setup` access token (5-minute TTL,
no refresh token issued) good only for the 2FA setup/enable endpoints,
enforced by `TwoFactorScopeGuard` (`backend/src/common/guards/two-factor-scope.guard.ts`).
It cannot call any other route until enrollment finishes.

> **Self-testable** — as `shopper@villi.test`: Account → Enable 2FA → scan the QR → sign out → sign back in → code prompt appears. Automated: `'enrolls 2FA and requires a TOTP code on login'` and `'gates ADMIN role behind mandatory 2FA, via a scoped bootstrap token that can only enroll'`, `app.e2e-spec.ts:433` and `:492`.

---

**User input validation is implemented on both client and server sides for authentication forms.**

- **Server** — every auth DTO (`backend/src/auth/dto/auth.dto.ts`) uses `class-validator` decorators; the global `ValidationPipe` (`main.ts:38-45`) runs with `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown fields are rejected outright, not silently dropped.
- **Client** — `frontend/src/utils/validation.ts` runs the same-shaped checks on Login/Register/Forgot/Reset before any request is sent, for immediate feedback. The server remains the authoritative boundary since client checks can be bypassed.

> **Self-testable** — on `/register`, submit a malformed email and a 2-character password: inline errors appear with no network call. Then send the same payload directly to `POST /api/v1/auth/register` (e.g. via `/api/docs` Swagger) to confirm the server still returns `400`.

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

**An Entity Relationship Diagram (ERD) is provided, clearly showing entities, attributes, relationships, primary keys, foreign keys, cardinality, and modality.**

Yes. README's [Entity Relationship Diagram](../README.md#entity-relationship-diagram)
section has a Mermaid `erDiagram` (crow's-foot notation, so cardinality *and*
modality are both expressed per relationship — e.g. `User ||--o{
OAuthAccount`) plus full per-entity attribute tables with PK/FK/UK markers,
generated from and kept in sync with `backend/prisma/schema.prisma`.

> **Self-testable** — open the Mermaid block in `README.md` in a Mermaid-aware viewer (GitHub renders it natively, or paste into mermaid.live), and cross-check against `prisma/schema.prisma`.

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

**The product data model includes all required fields: id, name, description, price, stock quantity, category, brand, images, and weight/dimensions (in both metric and imperial units).**

All present on `Product` (`backend/prisma/schema.prisma`):

| Field | Column |
|---|---|
| ID | `id` (UUID PK) |
| Name | `name` |
| Description | `description` |
| Price | `price` (`Decimal`) |
| Stock quantity | `stockQuantity` |
| Category | `categoryId` FK → `Category` |
| Brand | `brandId` FK → `Brand` |
| Images | `ProductImage[]` (1:N, ordered by `position`) |
| Weight (metric/imperial) | `weightGrams` → `weightOz` |
| Dimensions (metric/imperial) | `lengthMm/widthMm/heightMm` → `lengthIn/widthIn/heightIn` |

Metric→imperial conversion is computed on read by `buildDimensions()`
(`backend/src/common/utils/units.ts`) — canonical storage stays metric;
imperial is always derived, never a second source of truth that could drift.

> **Self-testable** — `GET /api/v1/products?limit=1`: response includes `dimensions.metric` and `dimensions.imperial`. Unit test: `backend/src/common/utils/units.spec.ts`.

---

**Products are organized into categories with an intuitive browsing structure.**

`Category` self-references via `parentId` (a tree, not a flat list).
`GET /api/v1/categories/tree` returns the nested structure; the shop
sidebar renders it as a clickable filter list, and selecting a category
narrows the product grid immediately.

> **Self-testable** — on `/shop`, click a category in the sidebar (e.g. "Shell Jackets") and confirm the grid and URL both update. Automated: `'GET /api/v1/categories/tree returns the browsing tree'`, `app.e2e-spec.ts:183`.

---

**Faceted search is implemented, allowing users to refine results by product attributes (e.g., price range, brand, category).**

`ProductQueryDto` (`backend/src/catalog/dto/product-query.dto.ts`) accepts
`category`, `brands[]`, `minPrice`/`maxPrice`, `minRating`, and free-form
`attributes[]` (`name:value` pairs — condition, size, gender, colour,
material, authenticity), all combined with logical AND in `buildWhere()`.
`GET /api/v1/products/facets` returns live counts per option for the current
filter combination.

The frontend keeps the filter *structure* (which brands/attributes are
shown at all) separate from their *live counts*: an unfiltered
`/products/facets` call renders every option once, and a second,
filter-scoped call only supplies the number next to each — so narrowing one
filter can zero out another option's count, but never makes the option
itself disappear or leave a filter silently stuck active with no way to see
or clear it. (This guide reflects two bugs of exactly that shape that were
found and fixed directly against this codebase: attribute facets vanishing
under a narrowing filter, and a category switch silently hiding an
already-checked brand.)

> **Self-testable** — on `/shop`, combine a category + brand + price range + a "N stars & up" filter simultaneously; confirm all four narrow the same grid, and that switching category never leaves an invisible stuck filter (every checkbox stays visible with a live count, even at 0).

---

**Product listing includes sorting options for relevance, price and rating.**

`ProductSort` enum (`product-query.dto.ts:12-18`): `relevance` (default —
well-rated first, then newest), `price_asc`, `price_desc`, `rating`, plus
`newest` as an extra option. An invalid `sort` value is rejected with `400`
before touching the database.

> **Self-testable** — use the sort dropdown on `/shop` and confirm order changes for each option. Automated: `'supports price filtering + ascending sort'`, `'sorts by rating (descending)'`, `'rejects an invalid sort option (400)'`, `app.e2e-spec.ts:139,146,159`.

---

**Product images are stored with proper file handling and basic serving functionality.**

Two paths:
1. **Seeded catalogue images** — static files under `frontend/public/products/`, served directly by the `web` container / nginx.
2. **Admin-managed images** — `POST /api/v1/products/:id/images` (`backend/src/catalog/products.controller.ts:63`, admin-only, `multipart/form-data`) runs the upload through `ImageService.processProductImage()` (`backend/src/catalog/image.service.ts`), which validates MIME type/size (≤10MB; JPEG/PNG/WebP) and uses `sharp` to generate three WebP variants (320px thumbnail, 768px medium, 1440px full) in parallel, saved under `backend/uploads/products/`.

> **Self-testable** — `curl -I http://localhost:8080/products/keb-shell.png` → `200` for a seeded image. For admin-uploaded images: `POST` a file to `/api/v1/products/:id/images` as an authenticated admin, then `GET` the returned `/uploads/products/…` URL — served both directly (`app.useStaticAssets`, `main.ts`) and through the unified proxy (`proxy/nginx.conf`, `location /uploads/`).

---

**Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process.**

Three automated layers, plus scheduled manual checks:
- **Unit tests** — pure logic, no I/O: token generation/rotation, DTO validation, CAPTCHA enforcement, dimension conversion, the public product shape.
- **API integration tests** — the real NestJS app + a real PostgreSQL instance via Supertest: HTTP contracts, persistence, status codes.
- **Security tests** — malformed/extra-field payloads, SQL-injection-shaped strings treated as data, path-param injection, RBAC guard enforcement.
- **Manual** — CAPTCHA widget UX, OAuth provider round-trips, and the 2FA setup+login flow are exercised by hand periodically, since they depend on third-party services that are awkward to fully automate.

> **Verbal**

---

**Automated tests exist for Unit, API integration, and Security tests covering authentication and product catalog functionality.**

Current live counts (`docker compose --profile test run --rm e2e`):

| Layer | Count | Files |
|---|---|---|
| **Unit** | 88, 11 suites | `backend/src/**/*.spec.ts` — `tokens.service.spec.ts` (JWT + rotation), `auth.dto.spec.ts` / `product.dto.spec.ts` (input validation), `captcha.service.spec.ts`, `units.spec.ts`, `products.service.spec.ts`, `users.service.spec.ts`, `addresses.service.spec.ts`, `cart.service.spec.ts`, `checkout.service.spec.ts`, `auth.service.spec.ts` |
| **API integration + security** | 60, 2 suites | `backend/test/app.e2e-spec.ts` (catalog, auth + persistence, OAuth, refresh rotation, revocation, password reset, 2FA, security/injection, reviews) and `commerce.e2e-spec.ts` (Project 2 checkout flows) |

Both auth and catalog are covered at every layer — see the `describe()`
blocks listed under the preceding items for exact line numbers.

> **Self-testable** — `docker compose --profile test run --rm e2e` runs all 148 tests against a throwaway DB with no host ports needed. Locally: `cd backend && npm test` (unit only, no DB) and `npm run test:e2e` (needs a reachable Postgres + Redis).

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
