# Villi — Reference & review material

Deeper detail that supports the [README](../README.md) but isn't required reading
to run or review the app: architecture, full API reference, security model,
testing, per-criterion review tables, and oral-exam talking points.

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [B2C e-commerce model](#b2c-e-commerce-model)
- [Database scalability & growth](#database-scalability--growth)
- [ACID properties in e-commerce](#acid-properties-in-e-commerce)
- [Payments: theoretical concepts](#payments-theoretical-concepts)
- [API reference](#api-reference)
- [Security model](#security-model)
- [CIA triad](#cia-triad)
- [Semantic HTML & accessibility](#semantic-html--accessibility)
- [Testing](#testing)
- [Review criteria (task1)](#review-criteria-task1)
- [Manual test checklist](#manual-test-checklist)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Bonus features](#bonus-features)
- [Oral-exam talking points](#oral-exam-talking-points)

---

## Tech stack

- **Backend:** NestJS 11 (TypeScript), Prisma 6, Passport, `@nestjs/jwt`, argon2, otplib, Helmet, `@nestjs/throttler`.
- **Frontend:** React 18 + Vite + React Router (served by nginx in production).
- **Database:** PostgreSQL 16. **Cache / token store:** Redis 7.
- **Tooling:** ESLint, Prettier, Jest + Supertest, Docker / Docker Compose.

## Architecture

```mermaid
flowchart LR
  Browser["React SPA (nginx)"] -->|"HTTPS REST /api/v1"| API["NestJS API"]
  API --> PG[("PostgreSQL")]
  API --> Redis[("Redis")]
  API --> OAuth["Google / GitHub OAuth"]
  API --> Mail["SMTP (email)"]
  API --> Captcha["Google reCAPTCHA"]

  subgraph compose [Docker Compose]
    Browser
    API
    PG
    Redis
  end
```

**Modular monolith:** one deployable API split into feature modules (`auth`,
`users`, `catalog`) plus shared infrastructure modules (`prisma`, `redis`,
`mail`) — simple to run, with clean seams to extract services later.

## B2C e-commerce model

Villi is a **single-store B2C** marketplace: one business operates the catalog
and sells **to end consumers**, not to other businesses.

| B2C characteristic | How Villi implements it |
|--------------------|-------------------------|
| Customers are consumers | Shoppers register with role `USER`; no business/wholesaler accounts. |
| Business → Consumer flow | Platform-managed catalog; no multi-vendor seller portal or B2B pricing. |
| Public storefront | React SPA: search, facets, product detail, reviews — for individual buyers. |
| Curated retail positioning | Pre-loved, one-of-a-kind items; `stockQuantity` is typically **1** per listing. |
| Consumer accounts | `User` for shoppers, `ADMIN` for platform staff — no "merchant" entity. |

**Out of scope by design:** B2B wholesale, seller onboarding, corporate
billing, multi-tenant vendor stores (arrives, if ever, in a later project).

## Database scalability & growth

PostgreSQL supports Villi's growth via:
- **Vertical scaling** — the single primary instance scales with CPU/RAM.
- **Read replicas** — async streaming replication offloads catalog reads (searches, product views) from the write-heavy primary.
- **Connection pooling** (PgBouncer / Prisma Accelerate) for high concurrent shopper traffic.
- **Indexing** — B-Tree for lookups/FKs, GIN/GiST for attribute/JSON search, keeping faceted search fast as the catalog grows.
- **Redis caching** in front of Postgres for catalog results, facet aggregations, and type-ahead — absorbs traffic spikes.

## ACID properties in e-commerce

ACID guarantees prevent catastrophic e-commerce failures (overselling, lost orders):
- **Atomicity** — placing an order (create order → create payment → clear cart → deduct stock) is one indivisible unit; any step failing rolls back all of it.
- **Consistency** — FKs and typed columns (`Decimal` for prices) keep the DB in a valid state.
- **Isolation** — concurrent buyers of the last unit of a product can't both succeed; the second fails gracefully instead of overselling.
- **Durability** — once a transaction commits, it survives a crash immediately after.

Multi-step operations (OAuth linking, refresh rotation, password reset +
session revocation, product creation, review + rating recompute) run inside
Prisma `$transaction`s.

## Payments: theoretical concepts

- **PCI DSS** — the card-industry standard for anyone who touches cardholder
  data. The cheapest, safest compliance posture is to never possess that data
  at all: Villi's checkout renders Stripe's own `PaymentElement` inside an
  iframe Stripe controls, so the card number/CVV/expiry are typed directly
  into Stripe's DOM and sent straight to Stripe — our frontend and backend
  never see them, `checkout.service.ts` only ever handles a Stripe
  `PaymentIntent` id and status. That keeps the app in the lightest PCI SAQ
  category (SAQ A) instead of the full audit required for a server that
  actually stores/processes card numbers. A real breach of stored card data —
  Target (2013), Heartland (2008), Equifax (2017, though not card data per
  se) — is exactly the failure mode "never store it" designs around: there's
  nothing on our servers worth stealing.
- **SSL/TLS** — encrypts the connection between browser and server so a
  network observer (public wifi, a compromised router) can't read or tamper
  with requests in transit — login credentials, session cookies, the Stripe
  client secret. In this repo, `proxy/nginx.conf` + `certs/` terminate
  TLS at the single-origin gateway (`docker-compose.yml`'s `proxy` service);
  Stripe's own hosted fields are loaded over HTTPS by the browser directly.
  This is transport security, a separate concern from *at-rest* encryption
  (`common/utils/encryption.util.ts`, AES-256-GCM) — TLS protects data
  in motion, `encrypt()`/`decrypt()` protect it sitting in Postgres.
- **Refunds & cancellations** — `OrdersService.cancelOrder()` /
  `processRefund()` (`backend/src/orders/orders.service.ts`) always call
  Stripe's refund API *before* mutating the local `Order`/`Payment` rows —
  if the gateway call throws, nothing here is recorded as cancelled/refunded,
  so the database can never claim a refund that didn't actually happen at
  Stripe. Only a `COMPLETED` payment is ever sent to Stripe for a refund; a
  `PENDING`/`FAILED` payment was never captured, so there's nothing to
  reverse — cancelling it just restocks inventory and marks the order
  `CANCELLED` directly.

---

## API reference

Base URL: `http://localhost:3001/api/v1`. Full interactive docs at `/api/docs`.

**Auth**
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register (email/password, CAPTCHA) |
| POST | `/auth/login` | Login; returns access token (+ refresh cookie) |
| POST | `/auth/refresh` | Rotate refresh token, get new access token |
| POST | `/auth/logout` | Revoke current refresh + access token |
| POST | `/auth/forgot-password` / `/auth/reset-password` | Password reset |
| GET/POST | `/auth/2fa/status\|setup\|enable\|disable` | Manage TOTP 2FA |
| GET | `/auth/oauth/google\|github` | Start OAuth flow |

**Users**
| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Current profile |
| GET | `/users/me/export` | GDPR data export |
| DELETE | `/users/me` | GDPR account deletion |

**Catalog**
| Method | Path | Description |
|---|---|---|
| GET | `/products` | Faceted search + sort + pagination |
| GET | `/products/suggest?q=` | Type-ahead suggestions |
| GET | `/products/facets` | Facet values + counts for current filters |
| GET | `/products/:idOrSlug` | Product detail |
| POST/PATCH/DELETE | `/products[/:id]` | Admin product management |
| GET/POST | `/products/:idOrSlug/reviews` | List / create-update review |
| DELETE | `/products/:idOrSlug/reviews/mine` | Delete your own review (auth) |
| GET | `/categories`, `/categories/tree` | Browse categories |
| GET | `/brands` | List brands |

**Example — faceted search:**
```
GET /api/v1/products?q=jacket&category=shell-jackets&brands=fjallraven&brands=haglofs\
&minPrice=100&maxPrice=300&minRating=4&attributes=size:M&attributes=condition:Very Good&sort=price_asc&page=1&limit=20
```

## Security model

- **Passwords** hashed with **argon2**; rules enforced server-side.
- **CAPTCHA** (Google reCAPTCHA) verified server-side on registration.
- **Access tokens** short-lived (15m default), kept **in memory only** on the SPA (never localStorage).
- **Refresh tokens** long-lived (7d default), opaque, stored as a SHA-256 hash, delivered as an **httpOnly, SameSite** cookie scoped to `/api/v1/auth`.
- **Rotation:** every refresh issues a new token and invalidates the old one; reuse of a rotated token revokes the whole token **family**.
- **Revocation:** logout revokes the refresh token and denylists the access token's `jti` in Redis.
- **2FA:** optional TOTP with hashed single-use recovery codes.
- **Transport/headers:** Helmet, strict CORS, global input validation with unknown-field stripping.
- **Rate limiting:** per-IP globally, tighter on auth-sensitive endpoints.
- **Injection safety:** Prisma parameterizes all queries.
- **GDPR:** data export + account erasure; no user-enumeration on login/reset.

## CIA triad

Villi's security model maps onto the classic **Confidentiality, Integrity,
Availability** triad (task3 "Student can explain CIA principles"):

- **Confidentiality** — data is readable only by who's authorized to read it.
  TLS (`certs/`, `proxy/nginx.conf`) stops it being read in transit; AES-256-GCM
  (`common/utils/encryption.util.ts`) stops it being read at rest even with
  raw DB access; argon2 password hashing means we never hold a readable
  password at all; JWTs live in memory only, never `localStorage`, to limit
  what an XSS payload could steal.
- **Integrity** — data stays accurate and isn't silently corrupted or
  tampered with. Postgres FKs/constraints and Prisma `$transaction`s (see
  [ACID properties](#acid-properties-in-e-commerce)) stop the DB reaching an
  inconsistent state; AES-GCM's auth tag makes tampering with encrypted
  ciphertext fail decryption instead of silently returning garbage; Stripe
  webhook signatures (`stripe-payment.service.ts`) stop a forged payment
  callback from marking an unpaid order as paid; refresh-token rotation with
  reuse-detection stops a stolen token being replayed to extend a session.
- **Availability** — legitimate users can actually reach the service.
  Redis-backed token-bucket rate limiting stops one client from starving
  everyone else; the API is stateless so it can run as multiple replicas
  behind the proxy; RabbitMQ's retry + dead-letter queue means a transient
  failure degrades gracefully instead of losing a payment-status update
  outright; see [`docs/load_test_report.md`](load_test_report.md) for the
  measured concurrency the platform actually sustains.

## Semantic HTML & accessibility

"Semantic HTML" means using the HTML5 element whose *meaning* matches the
content — `<button>` for something clickable, `<nav>`/`<main>`/`<header>` for
page regions, a real `<table>` for tabular data, `<h1>`–`<h6>` for an actual
document outline — instead of a generic `<div>`/`<span>` styled to look the
same. It matters for accessibility (task3 "Student can explain the
importance of semantic HTML") because assistive technology doesn't see
pixels, it sees the DOM: a screen reader announces `<button>` as an
interactive control a keyboard user can activate with Enter/Space for free,
lets a user jump by landmark (`<nav>`, `<main>`) or by heading level without
reading the whole page linearly, and a `<div onclick>` gets none of that —
it's silently unreachable by keyboard and unannounced as interactive unless
you hand-reimplement everything ARIA would have given you for free. That's
also why the WCAG 2.1 A checklist (task3) treats ARIA as a fallback, not a
first choice: "no ARIA is better than bad ARIA," because ARIA only overrides
*how* something is announced, it doesn't grant keyboard behavior — the
underlying semantic element (or a correctly reimplemented one) still has to
actually work.

---

## Testing

Frameworks: **Jest** (+ ts-jest) for unit tests, **Supertest** for API integration/security tests.

**Run everything via Docker** (throwaway DB, no host ports needed):
```bash
docker compose --profile test run --rm e2e
```

**Or run pieces locally** (Node 20+):
```bash
cd backend
npm test          # unit tests, no DB required
npm run test:cov  # unit tests with coverage
npm run test:e2e  # API integration + security tests (needs DB + Redis)
```

**Unit tests (108 across 12 spec files)** cover JWT token handling incl.
rotation/reuse-detection (`auth/tokens.service.spec.ts`), auth DTO validation
incl. injection-style input (`auth/dto/auth.dto.spec.ts`), CAPTCHA
skip/enforce logic (`auth/captcha.service.spec.ts`), the product data model +
dimension conversion (`catalog/dto/product.dto.spec.ts`,
`catalog/products.service.spec.ts`, `common/utils/units.spec.ts`), address
book validation (`addresses/addresses.service.spec.ts`), and — the Commerce
phase's required "cart functionality" and "order calculations" coverage —
`cart/cart.service.spec.ts` (34 cases: add/remove/update quantity math, stock
limits, guest-Redis vs logged-in-Prisma parity, guest→user cart merge) and
`checkout/checkout.service.spec.ts` (order total = subtotal + shipping,
decimal-precision rounding, stock deduction, Stripe failure-reason mapping)
plus `orders/orders.service.spec.ts` (cancellation restocking, refund
gating).

**API integration + security tests (63 across two files)**:
`test/app.e2e-spec.ts` (52) covers catalog listing/facets/sorting, full-text
search by name (the task3 "critical user flow" requirement), reviews
(auth-gated create, rating validation, aggregate recompute, owner delete),
auth (register/login/persistence), refresh-token rotation + reuse detection,
logout revocation, and security cases (malformed input, SQLi-as-data,
injection in path params, admin guards). `test/commerce.e2e-spec.ts` (11) is
the Commerce phase's required "critical user flow" coverage: full
register → add-to-cart → checkout → order → inventory-deduction flow, the
same flow for a guest cart/checkout, checkout validation edge cases (empty
cart, missing fields, invalid address/phone, no shipping option), Stripe
webhook signature rejection, and the async PENDING → PAID/CANCELLED
transition applied through the RabbitMQ queue — including an idempotency
check that a duplicate webhook message never double-reverts stock.

## Review criteria (task1)

Each row: criterion → where it's implemented → how to demonstrate it live.

**Auth**

| Criterion | Where | Demonstrate |
|-----------|-------|-------------|
| Email-password + OAuth | `POST /auth/register`, `/auth/login`; `GET /auth/oauth/google\|github` + callbacks; `findOrCreateFromOAuth()` links providers to existing emails | Register/sign in with email. For OAuth: set `GOOGLE_*`/`GITHUB_*` + `VITE_*_OAUTH_ENABLED=true` in `.env`, rebuild `web`. |
| Access token in memory | `frontend/src/api/client.ts` module variable, never localStorage | DevTools → Local Storage: no token present. |
| Refresh rotation (single-use) | `backend/src/auth/tokens.service.ts` `rotate()` | Call `/auth/refresh` twice with the same cookie — second call is 401. |
| Revocation (access + refresh) | Redis denylist by `jti` + refresh revocation on logout | After logout, old bearer token → 401. |
| Password reset via email | `/auth/forgot-password`, `/auth/reset-password`; caught by Mailhog | http://localhost:18025 |
| Client + server validation | `frontend/src/utils/validation.ts` + server DTOs/`ValidationPipe` | Submit invalid fields → inline errors; server still 400s if bypassed. |

**CAPTCHA & 2FA**

| Criterion | Where | Demonstrate |
|-----------|-------|-------------|
| CAPTCHA on registration | `Recaptcha.tsx`; `CaptchaService.verify()` | With keys set: widget blocks submit until checked. Without: skipped server-side (dev). |
| Optional user-enabled 2FA | `/account` → Enable 2FA; `two-factor.service.ts` | Enable → sign out → login prompts for a 6-digit code. |

**Catalog**

| Criterion | Where | Demonstrate |
|-----------|-------|-------------|
| Full product model | `Product`/`ProductImage` + `ProductsService.toPublic()` | `GET /products?limit=1` — id, price, stock, category, brand, images, dimensions. |
| Categories / browsing | Nested `Category` tree, `GET /categories/tree` | Pick a subcategory — listing updates. |
| Faceted search | `GET /products` + `/products/facets` | Filter by brand, price, rating, attributes. |
| Sorting | relevance / price / rating / newest | Sort dropdown on catalog. |
| Product images | `frontend/public/products/*.png` served via nginx | Images on cards. |

**B2C & ERD**

| Criterion | Where |
|-----------|-------|
| B2C model | Consumer `USER` role, platform-operated catalog, no B2B entities — see [B2C e-commerce model](#b2c-e-commerce-model). |
| Full ERD | [README → Entity Relationship Diagram](../README.md#entity-relationship-diagram) — entities/attributes/PK/FK + cardinality/modality table, matches `prisma/schema.prisma`. |

Full step-by-step walkthroughs: [`docs/review-guide-part-1.md`](review-guide-part-1.md).

## Manual test checklist

Guards against flows that are hard to fully automate:

- [ ] **CAPTCHA** — with `RECAPTCHA_SECRET`/`VITE_RECAPTCHA_SITE_KEY` set, registration shows the widget and fails server-side without a valid token.
- [ ] **OAuth (Google / GitHub / Facebook)** — "Continue with…" completes and lands signed-in, linking/creating the account.
- [ ] **2FA setup** — enable on Account, scan the QR, verify a code, confirm recovery codes shown once.
- [ ] **2FA login** — sign out/in; confirm the code prompt and that a recovery code works as fallback.
- [ ] **Data encryption at rest** — place an order, then `docker compose exec postgres psql -U villi -d villi -c 'SELECT "shippingAddress", "guestEmail" FROM "Order" LIMIT 1;'` and separately `SELECT "transactionId" FROM "Payment" LIMIT 1;` — both come back as opaque `iv:authTag:ciphertext` hex, never plaintext JSON/an email/a Stripe id. Confirm the app itself shows the decrypted, human-readable versions (order confirmation page, `/orders/:id`).
- [ ] **Data encryption in transit** — with the stack fronted by `proxy` (nginx + `certs/`), confirm the browser padlock/HTTPS is in effect end-to-end and that Stripe's card fields are also loaded over HTTPS (DevTools → Network, filter `js.stripe.com`).

---

## Project structure

```
.
├── proxy/nginx.conf          # unified gateway (/ → web, /api → api)
├── scripts/                  # ngrok tunnel + cert-recovery helper scripts
├── docker-compose.yml        # postgres + redis + api + web + proxy
├── start.sh                  # one-command build & run
├── .env.example               # all configuration (12-factor)
├── backend/                  # NestJS API
│   ├── prisma/               # schema, migrations, seed
│   └── src/
│       ├── auth/             # auth, JWT, OAuth, 2FA, captcha
│       ├── users/            # profile + GDPR
│       ├── catalog/          # products, categories, brands, search
│       ├── common/           # guards, filters, decorators, utils
│       ├── prisma|redis|mail/# infrastructure modules
│       └── main.ts           # bootstrap (Swagger, validation, security)
└── frontend/                 # React + Vite SPA (nginx in prod)
    └── src/{api,auth,components,pages}
```

## Roadmap

- **Project 2 — Commerce:** cart, checkout, payment integration, order lifecycle. Reuses Foundation auth + catalog; adds transactional stock decrement (`SELECT ... FOR UPDATE`) on order placement.
- **Project 3 — Experience:** full customer UI, admin dashboards, WCAG 2.1 Level A accessibility, performance/production hardening.

## Bonus features

- Refresh-token **family reuse detection** (theft mitigation).
- Redis-backed **access-token revocation** denylist.
- **Faceted** filtering with live counts + attribute facets.
- **Reviews & ratings** — aggregates recomputed transactionally from real rows.
- **Client + server validation** with inline, accessible (`aria-invalid`) errors.
- **Verified-authentic** + **condition** trust badges.
- Dual **metric/imperial** product dimensions.
- **GDPR** data export & erasure endpoints.

## Oral-exam talking points

[`docs/review-guide-part-1.md`](review-guide-part-1.md) answers every
`task1.txt` checklist item with a code reference and a demonstration, including:

- **JWT** — header/payload/signature, token lifecycle, live claim structure.
- **ACID** — walk a Prisma `$transaction` for checkout stock deduction / token rotation.
- **Architecture** — why modular monolith for Foundation; extraction path to microservices.
- **Scalability** — indexes, Redis cache, horizontal API replicas.
- **Search** — `buildWhere()` walkthrough, Postgres `ILIKE`, facet counts.
- **Testing** — unit vs e2e strategy, how to run and demo each suite live.
