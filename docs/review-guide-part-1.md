# Review Guide — Part 1: Platform Foundation

Answers every checklist item at the bottom of `task1.txt` (the assignment
brief — not checked into this repo), in the same order, against the running
codebase. Code paths are relative to the repo root; API routes are relative
to `https://localhost:3001` (direct) or `http://localhost:8080` (unified
proxy). Seeded accounts: `admin@villi.test` / `Admin!Passw0rd` and
`shopper@villi.test` / `Shopper!Passw0rd`.

---

**The README file contains a clear project overview, entity relationship diagram, setup instructions, and usage guide**

[`README.md`](../README.md) has `## Project overview`, `## Entity
Relationship Diagram` (Mermaid crow's-foot diagram plus full attribute/PK/FK
tables), `## Setup and installation`, and `## Usage guide` as top-level
sections, in that order.

> Open [README.md](../README.md) and confirm each section is present and populated.

---

**The platform implements a Business-to-Consumer (B2C) e-commerce model.**

Role` (`backend/prisma/schema.prisma`) has exactly `USER | ADMIN |
SUPPORT | SALES` — there is no `SELLER`/`MERCHANT`/company-account entity
anywhere in the schema. Consumers browse one platform-operated catalogue and
buy directly; `ADMIN`/`SUPPORT`/`SALES` are internal staff roles for running
the shop, not other businesses transacting on it. No wholesale pricing,
purchase-order flow, or multi-tenant vendor model exists.

> Browse `https://localhost:8080` as a guest, register as an individual consumer, and grep `schema.prisma` for `enum Role` to confirm no B2B role exists.

---

**The system implements both email-password and OAuth authentication methods.**

Email/password: `POST /api/v1/auth/register` and
`POST /api/v1/auth/login` (`backend/src/auth/auth.controller.ts`), passwords
hashed with argon2, email stored encrypted at rest (`User.email` ciphertext
+ `User.emailHash` for deterministic lookup). OAuth: `GET
/api/v1/auth/oauth/{google,github,facebook}` + matching `/callback` routes;
`UsersService.findOrCreateFromOAuth()` creates a new user or links the
provider to an existing account with the same email.

> Register at `/register`, sign out, then use **Continue with Google/GitHub** (needs `GOOGLE_*`/`GITHUB_*` + matching `VITE_*_OAUTH_ENABLED=true` in `.env`, then rebuild `web`). Automated: `describe('OAuth authentication methods', ...)` in `backend/test/app.e2e-spec.ts:230`.

---

**CAPTCHA is integrated into the registration process.**

`RegisterDto.captchaToken` (`backend/src/auth/dto/auth.dto.ts:46-49`)
is verified server-side by `CaptchaService.verify()`
(`backend/src/auth/captcha.service.ts`), which POSTs the token to Google's
`siteverify` endpoint and enforces a minimum score. If `RECAPTCHA_SECRET` is
unset (local dev), verification is skipped so registration still works
without live keys — but the check itself is never bypassed once a secret is
configured. `Recaptcha.tsx` renders the widget on `/register`.

> With `VITE_RECAPTCHA_SITE_KEY`/`RECAPTCHA_SECRET` set, the widget appears on the register form and blocks submission until solved. Unit coverage: `backend/src/auth/captcha.service.spec.ts` (dev-skip, missing-token rejection, siteverify success/failure).

---

**Access tokens are stored in memory.**

`frontend/src/api/client.ts:8` holds the access token in a plain
module-level variable (`let accessToken: string | null = null`) — never
`localStorage`/`sessionStorage`/a cookie. `AuthContext` only ever calls
`setAccessToken()`; every API call attaches it as `Authorization: Bearer
<token>` from that variable. Because it's memory-only, a full page reload
loses it; the app then silently calls `POST /api/v1/auth/refresh` using the
httpOnly `refresh_token` cookie to obtain a fresh one.

> Log in, open DevTools → Application → Local Storage → the app origin: no access token appears there. Reload the page and watch the Network tab for the silent `POST /api/v1/auth/refresh` call that restores the session from the httpOnly cookie.

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

> `docker compose --profile test run --rm e2e` and watch `test/app.e2e-spec.ts:310` (`'rotates the refresh token and rejects reuse of the old one'`) pass.

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

> Login → `POST /api/v1/auth/refresh` twice reusing the **first** refresh cookie both times → the second call returns `401`. Automated in the same e2e test as above. Manual curl walkthrough (login → rotate → replay old token → confirm 401 → replay the token that *was* current a moment ago → confirm it *also* now 401s, proving family-wide revocation) is in this session's history and reproducible against the live stack.

---

**Token revocation mechanism is in place for both access and refresh tokens.**

- **Refresh** — `POST /api/v1/auth/logout` calls `revokeRefreshToken()`, setting `revokedAt` on the current token (`auth.controller.ts:159-161`).
- **Access** — the same logout call also does `redis.denylistAccessToken(user.jti, tokens.accessTtlSeconds())` (`auth.controller.ts:164`); `JwtStrategy` checks this Redis denylist by `jti` on every authenticated request, so a logged-out access token is rejected immediately rather than waiting out its 15-minute TTL.

> Login, note the access token, log out, then call `GET /api/v1/users/me` with that same (still-unexpired) token → `401`. Automated: `'revokes tokens on logout (access token denylisted)'`, `app.e2e-spec.ts:332`.

---

**Password recovery and reset functionality via email is implemented.**

1. `POST /api/v1/auth/forgot-password` generates a random token, stores only its hash in `PasswordResetToken` with a 30-minute expiry (`RESET_TOKEN_TTL_MS`, `auth.service.ts:17`), and emails the raw token as a reset link. Response is identical whether or not the email exists (`202`, no enumeration).
2. `POST /api/v1/auth/reset-password` looks up the token, rejects it if missing/used/expired, updates the password, and revokes the user's existing refresh sessions.

Locally, emails are caught by **Mailhog** (`http://localhost:18025`) rather than a real SMTP provider.

> Trigger `/forgot-password` from the login page, open Mailhog at `http://localhost:18025`, and follow the reset link. Automated: `describe('password recovery and reset via email', ...)`, `app.e2e-spec.ts:350`.

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

> As `shopper@villi.test`: Account → Enable 2FA → scan the QR → sign out → sign back in → code prompt appears. Automated: `'enrolls 2FA and requires a TOTP code on login'` and `'gates ADMIN role behind mandatory 2FA, via a scoped bootstrap token that can only enroll'`, `app.e2e-spec.ts:433` and `:492`.

---

**User input validation is implemented on both client and server sides for authentication forms.**

- **Server** — every auth DTO (`backend/src/auth/dto/auth.dto.ts`) uses `class-validator` decorators; the global `ValidationPipe` (`main.ts:38-45`) runs with `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown fields are rejected outright, not silently dropped.
- **Client** — `frontend/src/utils/validation.ts` runs the same-shaped checks on Login/Register/Forgot/Reset before any request is sent, for immediate feedback. The server remains the authoritative boundary since client checks can be bypassed.

> On `/register`, submit a malformed email and a 2-character password: inline errors appear with no network call. Then send the same payload directly to `POST /api/v1/auth/register` (e.g. via `/api/docs` Swagger) to confirm the server still returns `400`.

---

**An Entity Relationship Diagram (ERD) is provided, clearly showing entities, attributes, relationships, primary keys, foreign keys, cardinality, and modality.**

README's [Entity Relationship Diagram](../README.md#entity-relationship-diagram)
section has a Mermaid `erDiagram` (crow's-foot notation, so cardinality *and*
modality are both expressed per relationship — e.g. `User ||--o{
OAuthAccount`) plus full per-entity attribute tables with PK/FK/UK markers,
generated from and kept in sync with `backend/prisma/schema.prisma`.

> Open the Mermaid block in `README.md` in a Mermaid-aware viewer (GitHub renders it natively, or paste into mermaid.live), and cross-check against `prisma/schema.prisma`.

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

> `GET /api/v1/products?limit=1`: response includes `dimensions.metric` and `dimensions.imperial`. Unit test: `backend/src/common/utils/units.spec.ts`.

---

**Products are organized into categories with an intuitive browsing structure.**

`Category` self-references via `parentId` (a tree, not a flat list).
`GET /api/v1/categories/tree` returns the nested structure; the shop
sidebar renders it as a clickable filter list, and selecting a category
narrows the product grid immediately.

> On `/shop`, click a category in the sidebar (e.g. "Shell Jackets") and confirm the grid and URL both update. Automated: `'GET /api/v1/categories/tree returns the browsing tree'`, `app.e2e-spec.ts:183`.

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

> On `/shop`, combine a category + brand + price range + a "N stars & up" filter simultaneously; confirm all four narrow the same grid, and that switching category never leaves an invisible stuck filter (every checkbox stays visible with a live count, even at 0).

---

**Product listing includes sorting options for relevance, price and rating.**

`ProductSort` enum (`product-query.dto.ts:12-18`): `relevance` (default —
well-rated first, then newest), `price_asc`, `price_desc`, `rating`, plus
`newest` as an extra option. An invalid `sort` value is rejected with `400`
before touching the database.

> Use the sort dropdown on `/shop` and confirm order changes for each option. Automated: `'supports price filtering + ascending sort'`, `'sorts by rating (descending)'`, `'rejects an invalid sort option (400)'`, `app.e2e-spec.ts:139,146,159`.

---

**Product images are stored with proper file handling and basic serving functionality.**

Two paths:
1. **Seeded catalogue images** — static files under `frontend/public/products/`, served directly by the `web` container / nginx.
2. **Admin-managed images** — `POST /api/v1/products/:id/images` (`backend/src/catalog/products.controller.ts:63`, admin-only, `multipart/form-data`) runs the upload through `ImageService.processProductImage()` (`backend/src/catalog/image.service.ts`), which validates MIME type/size (≤10MB; JPEG/PNG/WebP) and uses `sharp` to generate three WebP variants (320px thumbnail, 768px medium, 1440px full) in parallel, saved under `backend/uploads/products/`.

> `curl -I http://localhost:8080/products/keb-shell.png` → `200` for a seeded image. For admin-uploaded images: `POST` a file to `/api/v1/products/:id/images` as an authenticated admin, then `GET` the returned `/uploads/products/…` URL — served both directly (`app.useStaticAssets`, `main.ts`) and through the unified proxy (`proxy/nginx.conf`, `location /uploads/`).

---

**Automated tests exist for Unit, API integration, and Security tests covering authentication and product catalog functionality.**

Current live counts (`docker compose --profile test run --rm e2e`):

| Layer | Count | Files |
|---|---|---|
| **Unit** | 88, 11 suites | `backend/src/**/*.spec.ts` — `tokens.service.spec.ts` (JWT + rotation), `auth.dto.spec.ts` / `product.dto.spec.ts` (input validation), `captcha.service.spec.ts`, `units.spec.ts`, `products.service.spec.ts`, `users.service.spec.ts`, `addresses.service.spec.ts`, `cart.service.spec.ts`, `checkout.service.spec.ts`, `auth.service.spec.ts` |
| **API integration + security** | 60, 2 suites | `backend/test/app.e2e-spec.ts` (catalog, auth + persistence, OAuth, refresh rotation, revocation, password reset, 2FA, security/injection, reviews) and `commerce.e2e-spec.ts` (Project 2 checkout flows) |

Both auth and catalog are covered at every layer — see the `describe()`
blocks listed under the preceding items for exact line numbers.

> `docker compose --profile test run --rm e2e` runs all 148 tests against a throwaway DB with no host ports needed. Locally: `cd backend && npm test` (unit only, no DB) and `npm run test:e2e` (needs a reachable Postgres + Redis).


