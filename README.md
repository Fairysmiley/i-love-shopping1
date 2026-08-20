# Villi — B2C E-commerce Platform (Project 1: Foundation)

Villi is a Business-to-Consumer **curated marketplace for verified,
authenticated pre-loved Finnish/Nordic design high-end outdoor apparel** (e.g.
Fjällräven, Haglöfs, Luhta, Sasta, Norrøna, Klättermusen). This repository
implements **Project 1 — Foundation**: secure user accounts, an
ACID-compliant relational database, and a searchable, faceted product
catalog. It's built API-first and runs end-to-end with a single Docker command.

Because every item is **pre-loved and one-of-a-kind**, each listing carries an
authenticity status, a condition grade, and a size — all faceted attributes
buyers can filter on, with stock fixed at one unit per item.

> Projects 2 (Commerce) and 3 (Experience) build on top of this Foundation.
> See [Roadmap](docs/REFERENCE.md#roadmap).

## Table of contents

- [Quick start (for reviewers)](#quick-start-for-reviewers)
- [Troubleshooting](#troubleshooting)
- [Project overview](#project-overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Setup and installation](#setup-and-installation)
- [Usage guide](#usage-guide)
- [Performance Analysis Report](#performance-analysis-report)
- [More documentation](#more-documentation) — tech stack, API reference, security, testing, review-criteria tables, project structure, roadmap

---

## Quick start (for reviewers)

**Prerequisite: Docker Desktop (running).** Nothing else to install.

```bash
git clone <this-repo>
cd i-love-shopping1
./start.sh
```

On first run this automatically copies `.env.example` → `.env`, generates a
self-signed local HTTPS cert, builds and starts every service (Postgres,
Redis, RabbitMQ, Mailhog, API, web, proxy), and applies migrations + seed data.

Then open **http://localhost:8080** and sign in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@villi.test` | `Admin!Passw0rd` |
| Customer | `shopper@villi.test` | `Shopper!Passw0rd` |

**Not required for review:** OAuth, Stripe keys, and reCAPTCHA are left blank
in `.env.example` on purpose — those integrations are skipped without keys,
and every other flow (accounts, catalog, 2FA, password reset via
[Mailhog](http://localhost:18025)) works fully without them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `permission denied ... docker.sock` | Your user was added to the `docker` group but the current shell predates it. Open a new terminal (or `wsl --shutdown` + reopen on Windows/WSL2), or run `newgrp docker` to refresh it in-place. |
| `api` container restart-looping, log shows `ENOENT ... certs/key.pem` | Delete the empty `certs/` dir if Docker auto-created it root-owned (`sudo rm -rf certs`), then re-run `./start.sh` — it regenerates the cert as your user. |
| API crashes with `RangeError: Invalid key length` | `ENCRYPTION_KEY` in `.env` must be exactly 32 bytes/characters. Regenerate: `openssl rand -hex 16`. |
| `./scripts/ngrok.sh` fails with `ERR_NGROK_4018` (not authenticated) | Run `ngrok config add-authtoken <token>` from https://dashboard.ngrok.com/get-started/your-authtoken first. |
| Port `3001`/`5173`/`8080` already in use | Set `API_HOST_PORT`/`WEB_HOST_PORT`/`PROXY_HOST_PORT` in `.env`, then re-run `./start.sh`. |

---

## Project overview

**Villi** is a B2C e-commerce **Foundation** for a curated pre-loved outdoor
apparel shop. Shoppers browse and search a product catalog; the platform
handles **accounts** (registration, login, JWT sessions, optional 2FA) and a
**relational catalog** (categories, brands, facets, reviews) backed by
PostgreSQL. Commerce (cart, checkout, payments) and the full admin UI are
planned in later projects.

| Capability | Summary |
|---|---|
| **Accounts & auth** | Email/password + OAuth (Google, GitHub), CAPTCHA on signup, JWT access + rotating refresh tokens, token revocation, password reset, optional TOTP 2FA. |
| **Database** | PostgreSQL (relational, ACID) via Prisma. Transactions for multi-step writes, FKs/constraints for integrity. |
| **Catalog** | Full product model, nested category browse, faceted search, sort by relevance/price/rating, static images. |
| **API-first** | Versioned (`/api/v1`), documented with Swagger/OpenAPI, global validation, consistent error shape, per-IP rate limiting. |
| **Ops** | Fully containerized; one command builds + runs the whole stack. |
| **Business model** | **B2C** — Villi sells directly to individual consumers; see [B2C e-commerce model](docs/REFERENCE.md#b2c-e-commerce-model). |

Architecture, tech stack, and the full B2C-model writeup: [`docs/REFERENCE.md`](docs/REFERENCE.md).

---

## Entity Relationship Diagram

**Requirement:** An ERD showing **entities**, **attributes**, **relationships**,
**primary keys (PK)**, **foreign keys (FK)**, **cardinality**, and **modality**.

Source of truth: `backend/prisma/schema.prisma`.

### Diagram (Crow's foot notation)

```mermaid
erDiagram
  User ||--o| TwoFactorSecret : "has 0..1"
  User ||--o{ OAuthAccount : "links 0..N"
  User ||--o{ RefreshToken : "owns 0..N"
  User ||--o{ PasswordResetToken : "requests 0..N"
  User ||--o{ Review : "writes 0..N"

  Category ||--o{ Category : "parent 0..N children"
  Category ||--o{ Product : "contains 1..N"
  Brand ||--o{ Product : "makes 1..N"
  Product ||--o{ ProductImage : "has 1..N"
  Product ||--o{ ProductAttribute : "has 0..N"
  Product ||--o{ Review : "receives 0..N"

  User ||--o{ Cart : "owns 0..N"
  Cart ||--o{ CartItem : "contains 0..N"
  Product ||--o{ CartItem : "in 0..N"

  User ||--o{ Order : "places 0..N"
  Order ||--o{ OrderItem : "contains 1..N"
  Product ||--o{ OrderItem : "in 0..N"
  Order ||--o| Payment : "has 0..1"

  User {
    uuid id PK
    string email UK
    string passwordHash "nullable"
    string firstName
    string lastName
    enum role
    bool isEmailVerified
    bool isActive
    datetime createdAt
    datetime updatedAt
  }
  TwoFactorSecret {
    uuid id PK
    uuid userId FK "unique, one row per user"
    string secret
    bool enabled
    string_array recoveryCodes
    datetime createdAt
    datetime confirmedAt "nullable"
  }
  OAuthAccount {
    uuid id PK
    enum provider UK "composite with providerAccountId"
    string providerAccountId UK "composite with provider"
    uuid userId FK
    datetime createdAt
  }
  RefreshToken {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    string familyId
    datetime expiresAt
    datetime revokedAt "nullable"
    string replacedById "nullable"
    string userAgent "nullable"
    string ip "nullable"
    datetime createdAt
  }
  PasswordResetToken {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    datetime expiresAt
    datetime usedAt "nullable"
    datetime createdAt
  }
  Category {
    uuid id PK
    string name
    string slug UK
    string description "nullable"
    uuid parentId FK "nullable self"
    datetime createdAt
  }
  Brand {
    uuid id PK
    string name UK
    string slug UK
    string description "nullable"
    string logoUrl "nullable"
    datetime createdAt
  }
  Product {
    uuid id PK
    string name
    string slug UK
    string description
    decimal price
    string currency
    int stockQuantity
    uuid categoryId FK
    uuid brandId FK
    int weightGrams "nullable"
    int lengthMm "nullable"
    int widthMm "nullable"
    int heightMm "nullable"
    float averageRating
    int ratingCount
    bool isActive
    datetime createdAt
    datetime updatedAt
  }
  ProductImage {
    uuid id PK
    uuid productId FK
    string url
    string altText "nullable"
    int position
    bool isPrimary
  }
  ProductAttribute {
    uuid id PK
    uuid productId FK "composite with name"
    string name UK "composite with productId"
    string value
  }
  Review {
    uuid id PK
    uuid productId FK "composite with userId"
    uuid userId FK "composite with productId"
    int rating
    string title "nullable"
    string body "nullable"
    datetime createdAt
  }
  Cart {
    uuid id PK
    uuid userId FK "nullable"
    datetime createdAt
    datetime updatedAt
  }
  CartItem {
    uuid id PK
    uuid cartId FK "composite with productId"
    uuid productId FK "composite with cartId"
    int quantity
    datetime createdAt
    datetime updatedAt
  }
  Order {
    uuid id PK
    uuid userId FK
    enum status
    decimal totalAmount
    string currency
    string shippingAddress "nullable"
    datetime createdAt
    datetime updatedAt
  }
  OrderItem {
    uuid id PK
    uuid orderId FK "composite with productId"
    uuid productId FK "composite with orderId"
    int quantity
    decimal unitPrice
  }
  Payment {
    uuid id PK
    uuid orderId FK "unique, one row per order"
    decimal amount
    string currency
    string provider
    enum status
    string transactionId "nullable"
    datetime createdAt
    datetime updatedAt
  }
```

### Notation legend

| Symbol / term | Meaning |
|---------------|---------|
| **PK** | Primary key — unique row identifier (`@id` in Prisma) |
| **FK** | Foreign key — references another entity's PK (`@relation`) |
| **UK** | Alternate unique key (`@unique` or `@@unique`) |
| **Cardinality** | Maximum multiplicity on each side (one vs many), shown on diagram edges |
| **Modality** | Minimum participation (optional `0` vs mandatory `1`) |

**Mermaid edge cheat sheet:** `\|\|--o\|` = 1 : 0..1 (child optional, at most one) · `\|\|--o{` = 1 : 0..N (child optional, many) · `\|\|--\|{` = 1 : 1..N (child mandatory, many).

### Relationships (cardinality + modality + FK)

| Relationship | Cardinality | Modality | Foreign key |
|--------------|-------------|----------|-------------|
| User → TwoFactorSecret | 1 : 0..1 | 2FA optional; if present, exactly one row per user | `TwoFactorSecret.userId` → `User.id` |
| User → OAuthAccount | 1 : 0..N | OAuth optional; user may link multiple providers | `OAuthAccount.userId` → `User.id` |
| User → RefreshToken | 1 : 0..N | Zero or many active/historical sessions | `RefreshToken.userId` → `User.id` |
| User → PasswordResetToken | 1 : 0..N | Zero or many reset requests over time | `PasswordResetToken.userId` → `User.id` |
| User → Review | 1 : 0..N | Shoppers may write zero or many reviews | `Review.userId` → `User.id` |
| Category → Category (tree) | 1 : 0..N | Root categories have `parentId` null | `Category.parentId` → `Category.id` |
| Category → Product | 1 : 0..N | Each product in exactly one category | `Product.categoryId` → `Category.id` |
| Brand → Product | 1 : 0..N | Each product has one brand | `Product.brandId` → `Brand.id` |
| Product → ProductImage | 1 : 0..N | Images optional; usually one or more | `ProductImage.productId` → `Product.id` |
| Product → ProductAttribute | 1 : 0..N | Facets optional (condition, size, colour) | `ProductAttribute.productId` → `Product.id` |
| Product → Review | 1 : 0..N | Reviews optional; aggregates on `Product` | `Review.productId` → `Product.id` |
| User → Cart | 1 : 0..N | Guest carts have null userId | `Cart.userId` → `User.id` |
| Cart → CartItem | 1 : 0..N | Carts contain zero or many items | `CartItem.cartId` → `Cart.id` |
| Product → CartItem | 1 : 0..N | Product can be in multiple carts | `CartItem.productId` → `Product.id` |
| User → Order | 1 : 0..N | Users place zero or many orders | `Order.userId` → `User.id` |
| Order → OrderItem | 1 : 1..N | Orders must contain at least one item | `OrderItem.orderId` → `Order.id` |
| Product → OrderItem | 1 : 0..N | Product can be in multiple orders | `OrderItem.productId` → `Product.id` |
| Order → Payment | 1 : 0..1 | At most one successful/active payment | `Payment.orderId` → `Order.id` |

ACID/transaction notes and DB scalability rationale: [`docs/REFERENCE.md`](docs/REFERENCE.md#acid-properties-in-e-commerce).

---

## Setup and installation

**Prerequisite:** Docker (with Compose v2) — see [Quick start](#quick-start-for-reviewers).
Everything else (Node, Postgres, Redis, nginx, the HTTPS cert) is provisioned
automatically. The Stripe CLI is only needed to exercise the payment-webhook
flow locally (`stripe listen --forward-to localhost:3001/api/v1/checkout/webhook`).

```bash
./start.sh      # foreground, URLs printed before logs
./start.sh -d   # detached
```

**Open http://localhost:8080** — the unified gateway serves both the SPA and
`/api/v1` from one origin, so cookies and OAuth work without cross-port
issues. Other URLs: web-only `:5173`, API/Swagger `:3001`. Change ports via
`PROXY_HOST_PORT` / `WEB_HOST_PORT` / `API_HOST_PORT` in `.env`, then re-run.

> Configure OAuth, reCAPTCHA, and SMTP by filling in the matching `.env`
> variables. Step-by-step CAPTCHA + 2FA guide: [`docs/review-guide-part-1.md`](docs/review-guide-part-1.md).
> Password-reset emails are caught by [Mailhog](http://localhost:18025).

**Share a public URL with remote reviewers** (optional — not needed to run
the app locally): `./scripts/install-ngrok.sh` once, then `./scripts/ngrok.sh`
each time you want a tunnel. Useful mainly so a reviewer can exercise OAuth
without configuring their own credentials.

**Without Docker:** Node 20+, PostgreSQL, and Redis running locally, then:
```bash
cd backend && npm install && cp ../.env.example .env  # adjust DATABASE_URL/REDIS_URL
npx prisma migrate deploy && npm run prisma:seed && npm run start:dev  # :3001
cd ../frontend && npm install && npm run dev                          # :5173
```

---

## Usage guide

After [setup](#quick-start-for-reviewers), open **http://localhost:8080** and
sign in with a seeded account.

1. **Browse & search** — type-ahead search, facet filters (category, price,
   brand, rating, size, condition), sort by relevance/price/rating/newest.
2. **Reviews & ratings** — read reviews on any product; signed-in users can
   leave a 1–5 star review (one per product). Ratings are computed live.
3. **Register / sign in** — email+password or OAuth; CAPTCHA shown if
   configured. Access token lives only in memory, never localStorage.
4. **Account page** — enable/disable optional TOTP 2FA, export data, or
   delete your account (GDPR).
5. **Admin** — sign in as admin to manage products/categories/brands (see Swagger).

**Quick reviewer walkthrough:**

| Step | Action |
|------|--------|
| 1 | `./start.sh -d` — wait until API, web, and proxy are up |
| 2 | Open **http://localhost:8080** — browse catalog, use facets and sort |
| 3 | Open a product — images, specs (metric + imperial), reviews |
| 4 | Sign in as `shopper@villi.test` / `Shopper!Passw0rd` |
| 5 | Account → optional 2FA; API docs at http://localhost:3001/api/docs |
| 6 | Run tests: `docker compose --profile test run --rm e2e` |

**Password reset demo:** Forgot password → enter an email → open
[Mailhog](http://localhost:18025) for the reset link → set a new password.

---

## Performance Analysis Report

- **Database & queries** — Redis caches catalog responses and facet
  aggregations to reduce Postgres load; B-Tree indexes on slugs, category
  lookups, and FKs keep nested-relation queries low-latency; high-concurrency
  writes run inside Prisma `$transaction` blocks for row-level consistency
  without heavy table locking.
- **Assets & frontend** — Vite code-splits the bundle so admin-only screens
  don't block initial load; static images are served as WebP with
  long-lived cache headers (`Cache-Control: public, max-age=31536000`) via
  nginx for fast LCP; CSS layout adapts via `minmax()` to avoid reflows.
- **Security & scalability overhead** — rate limiting uses a Redis-backed
  token-bucket (`common/throttler/token-bucket-throttler.storage.ts`, atomic
  via Lua script) so state is consistent across API replicas; JWTs are
  stateless, so horizontal scaling adds no per-request lookup cost. Real
  throughput/latency numbers: [`docs/load_test_report.md`](docs/load_test_report.md).

---

## More documentation

- [`docs/REFERENCE.md`](docs/REFERENCE.md) — tech stack, architecture, full
  API reference, security model, testing details, per-criterion review
  tables (auth, CAPTCHA/2FA, catalog, B2C/ERD), manual test checklist,
  project structure, roadmap, bonus features, and oral-exam talking points.
- [`docs/review-guide-part-1.md`](docs/review-guide-part-1.md) — step-by-step
  walkthroughs for every task1.txt checklist item.
- [`docs/load_test_report.md`](docs/load_test_report.md) — load test results.
