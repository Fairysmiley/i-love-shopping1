**Student can explain CIA (Confidentiality, Integrity, Availability) principles.**

- **Confidentiality** — keeping data away from anyone who shouldn't see it. AES-256-GCM encryption on everything sensitive at rest (user PII, 2FA secrets, shipping addresses, order/payment details — `backend/src/common/utils/encryption.util.ts`), access tokens held in memory only rather than `localStorage` (limits what an XSS payload could steal), refresh tokens as httpOnly cookies (invisible to JavaScript entirely), and role checks on every admin route (`RolesGuard`) so even a logged-in customer can't reach admin data by guessing a URL.
- **Integrity** — making sure data is accurate and hasn't been tampered with. JWTs are HMAC-signed, so altering a token's payload invalidates the signature instantly. Refresh-token rotation with reuse detection (`docs/review-guide-part-1.md`) treats a replayed old token as evidence of theft, not a retry. Database transactions (`prisma.$transaction`) keep multi-step writes — like decrementing stock and creating an order — atomic, so a crash mid-write can't leave half-applied state. Foreign keys and unique constraints stop structurally invalid data (an order item pointing at a deleted product, two reviews from the same user on the same product) from ever being written at all.
- **Availability** — keeping the system reachable for legitimate users. Token-bucket rate limiting (`docs/review-guide-part-3.md`) throttles abusive clients before they can exhaust backend capacity, without punishing a normal user's burst of page loads. RabbitMQ decouples payment processing from the checkout HTTP response, so a slow downstream step never blocks the customer. Redis caching absorbs read-heavy catalog/search traffic. Docker health checks make sure the API doesn't start accepting traffic before Postgres/Redis/RabbitMQ are actually ready to serve it.

> **Verbal**

---

**Student can explain the importance of semantic HTML for accessibility.**

Semantic elements (`<nav>`, `<main>`, `<button>`, `<h1>`-`<h6>`, `<article>`)
carry meaning a `<div>` doesn't — and that meaning is what assistive
technology and browsers actually rely on:

- **Screen readers build a page outline from landmarks** — `<nav>`, `<main>`, `<aside>` (used for the shop's filter sidebar, `CatalogPage.tsx`) let a screen-reader user jump straight to the content they want instead of tabbing through every element on the page in order.
- **Native elements come with behavior for free.** A `<button>` is focusable, triggers on both Enter and Space, and gets an implicit `role="button"` with no extra code. A `<div onClick>` styled to look like a button needs `tabindex`, a manual `role`, and hand-written keyboard handlers to reach the same baseline — every one of those is a place to get it wrong. The header search suggestions dropdown (`Navbar.tsx`) uses real `role="option"` list items with full arrow-key navigation for exactly this reason.
- **Heading hierarchy (`<h1>`→`<h2>`→…) is a navigation tool, not just styling** — screen readers can jump heading-to-heading, so a page with one clear `<h1>` and logically nested `<h2>`s (as on `ProductPage.tsx`) is genuinely faster to navigate non-visually, not just "more correct."
- **The same markup that helps accessibility helps SEO** — search engines parse heading hierarchy and semantic landmarks the same way assistive tech does, so getting this right is a single investment that pays off in both places at once (see `docs/review-guide-part-3.md`'s SEO item).

> **Verbal**

---

**Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process.**

Four layers, used throughout development rather than bolted on at the end:

- **Unit tests** — fast, no I/O, run on every save during development. Pin down business-logic edge cases precisely: token rotation, DTO validation rules, unit conversion, cart/checkout math (`backend/src/**/*.spec.ts`).
- **API integration tests** — spin up the real NestJS app against a real Postgres/Redis/RabbitMQ in Docker and hit it over HTTP, so what's actually asserted is persisted database state and real response shapes, not mocked behavior (`backend/test/app.e2e-spec.ts`, `commerce.e2e-spec.ts`).
- **Security tests** — live in the same e2e suite: malformed/SQLi-shaped input, auth bypass attempts on role-guarded routes, and the rate-limiter actually returning `429` under a real burst of requests, not just asserted against a mock.
- **Manual testing against the live stack** — anything that depends on a real third-party service (Stripe test-mode webhooks, actual browser zoom/viewport behavior, screen-reader landmark navigation) was verified by hand against the running Docker stack, since those are impractical to fully automate and the guides in `docs/review-guide-part-*.md` were themselves built by doing exactly that.

New features got unit + integration coverage as they were built, and two real bugs this project's own review process surfaced (a payment-retry data-loss bug and an order-cancel response-shape crash, both fixed and covered by regression tests) were caught by combining automated coverage with actually clicking through the live app rather than trusting the test suite alone.

> **Verbal**

---

**Student has identified potential bottlenecks and can propose solutions.**

From `docs/load_test_report.md` §5 — even without finding a hard breaking
point at 400 concurrent users, the load test data points at where load
would start to matter first:

- **RabbitMQ CPU relative to message volume** — peak CPU (113-124% of one core) was disproportionate to how few messages actually flowed through it. This looks like overhead from the management/stats-polling plugin, not real message throughput. *Proposed fix:* disable stats polling in production, or drop the `management` image tag for a plain `rabbitmq:3.13-alpine` with lower baseline overhead.
- **Unverified connection pool tuning** — Postgres CPU stayed low throughout, but Prisma's pool size was never explicitly tuned against Postgres's `max_connections`. *Proposed fix:* set `connection_limit`/`pool_timeout` explicitly in `DATABASE_URL` before a genuine production-scale test, so scaling the API to multiple replicas later doesn't silently exhaust connections.
- **Load-generator/target co-location** — k6 and the app under test shared the same 4-core host, so some of the measured capacity was actually consumed by the tool doing the measuring. *Proposed fix:* run k6 from a separate machine (or k6 Cloud) against a deployed instance so the full target host's CPU is available to the app.

> **Verbal**

---

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
| API integration / Critical Flow | 64 tests, 2 suites | `backend/test/app.e2e-spec.ts` and `backend/test/commerce.e2e-spec.ts` — full register → cart → checkout → order flow, guest checkout, and checkout edge cases |

> Ask to see it run live. Unit suite (no database needed, about 20 seconds):
> ```
> cd backend && npm test
> ```
> Or everything — unit and integration together, 172 tests, against a fully isolated throwaway Postgres/Redis/RabbitMQ that never touches dev data:
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
