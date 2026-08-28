# Review Guide — Part 3: Experience

This walks through every mandatory item at the bottom of `task3.txt` (the
assignment brief — not checked into this repo) in the same order it appears
there, so you can go down the list and check things off as you go. Each
item says where the relevant code lives, then gives you something concrete
to click through or run to see it working yourself.

A few things worth knowing before you start:

- Code paths are relative to the repo root. API routes are relative to `https://localhost:3001` (hitting the API directly — genuinely HTTPS, see the TLS item below) or `http://localhost:8080` (the unified proxy — what you'll normally use for the storefront itself).
- Seeded accounts: `admin@villi.test` / `Admin!Passw0rd` and `shopper@villi.test` / `Shopper!Passw0rd`.
- Writing a review requires having actually paid for the product first — there's no seeded "already purchased" data for `shopper@villi.test`, so to demo the review form you'll need to complete a real checkout first (see `docs/review-guide-part-2.md` for the Stripe CLI setup), then go back to that product's page.
- Mandatory admin 2FA is already covered in `docs/review-guide-part-1.md`'s "Two-factor authentication" item — this guide doesn't repeat that walkthrough, just confirms it applies specifically to the ADMIN role where task3 asks for it.
- The `docker exec`/`docker compose` commands below assume the stack was started with `./start.sh` or `docker compose up`, which names the containers `i-love-shopping-postgres-1`, `i-love-shopping-api-1`, etc. If you renamed the project folder, swap in whatever `docker ps` shows you.

---

**The README file contains complete project overview, entity relationship diagram, performance analysis report, setup instructions, and usage guide.**

Open [README.md](../README.md) — `## Project overview`, `## Entity
Relationship Diagram`, `## Setup and installation`, `## Usage guide`, and a
`## Performance Analysis Report` section are all present as top-level
headings, with the last one linking out to
[`docs/PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md) and
[`docs/load_test_report.md`](load_test_report.md) for the full k6 results.

> Just read through the README top to bottom — nothing to run here.

---

**Star rating system is implemented with the average star rating calculated from all reviews.**

`ReviewsService.recomputeAggregates()` (`backend/src/catalog/reviews.service.ts:26-47`)
runs a Prisma `aggregate()` over every review row for a product and writes
the result onto `Product.averageRating`/`ratingCount` — inside the same
transaction as the write that triggered it, so the denormalized number can
never drift from the actual rows. `list()` (`reviews.service.ts:71-98`)
also computes the same average live from the full review set as a
double-check, returned alongside the review list itself.

> Open any product with reviews — the star rating and numeric average shown on both the product card and the product page come straight from this aggregate, recalculated every time a review is added, edited, or deleted.

---

**The review system allows users to submit text reviews for purchased products.**

`ReviewsService.upsertForUser()` (`reviews.service.ts:105-134`) now checks
`hasPurchased()` (`reviews.service.ts:52-64`) before accepting a review —
it looks for an `OrderItem` for that product on an `Order` belonging to
that `userId` with status `PAID`, `SHIPPED`, or `DELIVERED` (a still-`PENDING`
or `CANCELLED` order doesn't count, since the customer never actually
received anything). If there's no such order, the request is rejected with
`403 "You can only review products you have purchased."` A
`GET /products/:idOrSlug/can-review` endpoint (`reviews.controller.ts:52-57`)
lets the frontend check this ahead of time, so `ProductReviews.tsx` shows
either the write-review form, a "Purchase this product to leave a review."
message, or a sign-in prompt, instead of showing a form that would just
fail on submit.

> Log in as `shopper@villi.test`, open a product you haven't bought, and confirm you see "Purchase this product to leave a review." instead of the form. Then complete a real checkout for that product (`docs/review-guide-part-2.md` has the Stripe setup), reopen its page, and the write-review form now appears. Automated: `'blocks review creation for a product the user never purchased (403)'` and `'creates a review and recomputes the product rating aggregates'` (after seeding a paid order directly), `backend/test/app.e2e-spec.ts:697,707`.

---

**The review sorting system orders reviews by helpfulness votes.**

`ReviewsService.list()` orders reviews by `[{ helpfulVotes: 'desc' }, { createdAt: 'desc' }]`
(`reviews.service.ts:76-79`). `POST /products/:idOrSlug/reviews/:reviewId/helpful`
(`reviews.controller.ts:78-86` → `voteHelpful()`, `reviews.service.ts:149-179`)
toggles a helpful vote — one per user per review, enforced by a unique
`ReviewHelpfulVote` row — incrementing or decrementing `Review.helpfulVotes`
inside a transaction so the counter can't drift from the actual vote rows.

> On a product with several reviews, click "Helpful" on the review furthest down the list a few times (as different logged-in accounts, since it's one vote per user), reload the page, and watch it move up past reviews with fewer votes.

---

**The system enforces 2FA for all admin accounts.**

`AuthService.login()` (`backend/src/auth/auth.service.ts:78`) checks
`['ADMIN', 'SUPPORT', 'SALES'].includes(user.role) && !isTwoFactorEnabled`
— a privileged account without TOTP configured can't complete a normal
login at all; it's issued a narrowly-scoped setup-only token instead (full
walkthrough in `docs/review-guide-part-1.md`'s 2FA item). This is the same
mechanism as the optional 2FA available to regular `USER` accounts, just
made mandatory and unskippable for the three staff roles.

> Log out of `admin@villi.test` and log back in — the TOTP prompt is unavoidable, unlike for a regular shopper account where 2FA is opt-in. Automated: `'gates ADMIN role behind mandatory 2FA, via a scoped bootstrap token that can only enroll'`, `app.e2e-spec.ts:492`.

---

**The product management system allows CRUD operations for products with all required fields.**

| Operation | Endpoint | Notes |
|---|---|---|
| Create | `POST /products` | `products.controller.ts:121-128`, admin-only, `CreateProductDto` validates all required fields |
| Update | `PATCH /products/:id` | `:130-137`, partial update |
| Delete | `DELETE /products/:id` | `:139-147`, soft delete |
| Image upload | `POST /products/:id/images` | `:63-113`, generates thumbnail/medium/full variants (see the images item below) |

All four are guarded by `@Roles(Role.ADMIN)` + `RolesGuard`, so they're
rejected server-side for any other role even if someone bypasses the UI.

> In the admin panel's Products tab, create a product, edit it, and delete it — each change reflects immediately in both the admin list and the public catalog.

---

**Admins can add, edit, delete, update and manage products, categories, orders and refunds.**

- **Products** — covered above.
- **Categories** — full CRUD at `/categories`, admin-only (`categories.controller.ts:43,51,59`).
- **Orders** — `PATCH /orders/:id/status` (`orders.controller.ts:51-56`), admin-only, moves an order through the `OrderStatus` lifecycle.
- **Refunds** — `POST /orders/:id/refund` (`orders.controller.ts:58-63`) → `OrdersService.processRefund()` — a dedicated admin endpoint (not a reuse of the customer-facing cancel flow), which issues a real Stripe refund, restores stock, and marks the payment `REFUNDED`.

> In the admin panel, exercise each tab: create/edit/delete a category (Category & Brand tab), advance an order's status (Orders tab), and issue a refund on a paid order — confirm the payment status changes and stock is restored.

---

**Admins can manage delivery options and order status updates.**

Delivery options get full CRUD at `/delivery-options`
(`delivery-options.controller.ts:46,55,64`), admin-only — fields include
name, price, and estimated delivery window, plus an `active` flag so a
retired option stops appearing at checkout without deleting its history.
There's no separate "fulfillment status" field — `OrderStatus`
(`schema.prisma:312-318`) already spans `PENDING → PAID → SHIPPED →
DELIVERED` (plus `CANCELLED`), and admins move an order through all of
those stages, shipping included, via the same `PATCH /orders/:id/status`.

> In the admin panel's Delivery Options tab, create a new option and toggle it inactive — confirm it disappears from the checkout page's delivery selector. Then in the Orders tab, advance a paid order to Shipped and then Delivered, and confirm the customer sees the updated status on their order details page.

---

**Admins can view all users and assign roles.**

`GET /users` (`users.controller.ts:57-64`, admin-only) lists every
registered account with decrypted email and current role. `PATCH
/users/:id/role` (`:66-73`) changes it.

> In the admin panel's Users tab, find a non-admin account and change its role — log in as that user afterward (or check `GET /users/me`) to confirm the new role actually took effect, not just in the list view.

---

**Platform supports bulk upload products via JSON/CSV files.**

Both formats are real, separate endpoints sharing one underlying
`bulkCreate()`: `POST /products/bulk` (`products.controller.ts:149-158`,
JSON array body) and `POST /products/bulk-csv` (`:160-196`,
`multipart/form-data`), both admin-only. Both upsert by SKU, so re-uploading
the same file updates existing products instead of duplicating them.

> In the admin panel's Bulk Upload tab, upload a small CSV with `sku,name,brand,price,stock,categorySlug` columns and a couple of rows — the import count is shown on success, and the products appear immediately in the catalog.

---

**Home page showcases featured products and collections.**

`LandingPage.tsx` renders a "Featured Today" grid of top-rated products
(`:39-43,125-152`, sorted by rating) and a "Shop by category" section
showing the first several categories from the category tree
(`:45-49,104-123`), each linking straight into the filtered shop view.

> Open `http://localhost:8080/` — the featured products grid and the category shortcuts are both visible above the fold.

---

**Product listing page includes product details, ratings, filters, grid/list views, search, and sorting options.**

`CatalogPage.tsx` (the `/shop` route) shows each product's thumbnail,
name, brand, price, and star rating via `ProductCard`; a filter sidebar for
category/brand/price/rating/attributes (`:181-360`); a grid/list view
toggle (`:378-395`, `viewMode` state with `⊞`/`☰` buttons); a sort
dropdown; and pagination (`:437-469`).

> On `/shop`, apply a category and price filter together, switch to list view, change the sort order, and page through results — everything narrows the same grid without a full page reload.

---

**Product detail page shows complete product information, images, reviews, CTA and related/recommended products.**

`ProductPage.tsx` shows an image gallery with a thumbnail strip
(`:60-98`), a full specs table (`:137-185`), the `<ProductReviews>`
component (`:208`), an Add to Cart CTA (`:187-204`), and a "You might also
like" grid of up to four other products from the same category
(`:210-230`).

> Open any product page and scroll through — gallery, specs, reviews with the star rating, Add to Cart button, and related products are all there in one page.

---

**Shopping cart page lists items with thumbnails, prices, quantities, allows updates/removals, displays total (excluding shipping), and provides clear CTA.**

`CartPage.tsx` lists each item with thumbnail, price, and a quantity
stepper (`:64-108`), and the running total is explicitly labeled
"Subtotal (excluding shipping)" (`:116`) rather than a bare "Total" that
might be mistaken for the final charge — shipping is only added once a
delivery option is picked at checkout. "Proceed to Checkout" is the primary
CTA (`:123-129`).

> Add a few items to your cart, adjust a quantity, remove one, and confirm the "Subtotal (excluding shipping)" label and number update instantly — no shipping cost appears until you actually reach `/checkout`.

---

**Checkout page contains guest/signed-in user order summary, address input, shipping, and payment selection.**

`CheckoutPage.tsx` is the same single-page checkout covered in detail in
`docs/review-guide-part-2.md` — order summary, address form, delivery
option selector, and the Stripe payment form all on one screen, working
identically for guests and logged-in users (with pre-fill for the latter).
See that guide for the full walkthrough and demo steps; this item is the
same page, just checked off from the Project 3 "pages" list rather than
the Project 2 "checkout process" list.

> See `docs/review-guide-part-2.md`'s checkout-related items for the full demo.

---

**Order confirmation page displays order summary, estimated delivery and reference number.**

`OrderConfirmationPage.tsx` shows the order's UUID as a reference number
(`:129`), an estimated delivery window computed from the order's
`createdAt` plus the chosen delivery option's `estimatedDaysMax`
(`:112`), and an itemized list of everything ordered.

> Complete a checkout and land on the confirmation page — the order reference (UUID), an estimated delivery date, and the full item list are all shown.

---

**Search results page includes filtering, sorting, result count and pagination.**

There's no separate search-results route — `CatalogPage.tsx` doubles as
both. When a `?q=` query param is present, the same page applies it as an
additional filter on top of category/brand/price/rating, with the same
sort dropdown and pagination still functional, and a result count above
the grid (`:367-376`).

> Use the header search box to search for a term, then apply a category filter and change the sort on the results — the result count updates and all the same controls from the plain `/shop` page keep working on top of the search.

---

**Admin page provides CRUD functionality for products, order management, user management, review moderation, and bulk uploads.**

`/admin` is a tabbed panel (`frontend/src/pages/Admin/`), visible only to
`ADMIN`/`SUPPORT`: `ProductManagementPanel`, `CategoryBrandManagementPanel`,
`OrderManagementPanel` (status updates + refunds), `UserManagementPanel`
(role assignment), `ReviewManagementPanel` (moderation — see below), and
`BulkUploadPanel`. Every tab is backed by the admin-only, role-guarded
endpoints described in the items above.

> Log in as `admin@villi.test`, open `/admin`, and confirm every listed tab is present and opens its corresponding management screen.

---

**Contact/Support page includes functioning contact form.**

`ContactPage.tsx` submits to `POST /contact`
(`backend/src/contact/contact.controller.ts:15-21` →
`contact.service.ts:9-11` → `MailService.sendContactMessage`), rate-limited
to 5 submissions per 60 seconds (`contact.controller.ts:14`) to stop the
form being used to spam the mail service.

> Fill in and submit the form at `/contact`, then check Mailhog at `http://localhost:18025` — the message shows up as a real email.

---

**About page includes company information, mission, team and links to social media.**

`AboutPage.tsx` has a mission statement, a values grid, a team section
with named members, and social media links (Instagram confirmed among
them, `:71+`) with proper `rel="noopener noreferrer"` on external links.

> Open `/about` and confirm the mission, team, and social links sections are all present.

---

**Error page (404) includes catch-all error message.**

`<Route path="*" element={<NotFoundPage />} />` (`frontend/src/App.tsx:90`)
catches anything that doesn't match another route. `NotFoundPage.tsx`
shows a friendly explanatory message rather than a blank screen or a raw
router error.

> Navigate to `http://localhost:8080/this-page-does-not-exist` — a friendly 404 page renders instead of a blank screen.

---

**Quick cart preview (pop-up/drop-down or similar) is implemented.**

`CartSidebar.tsx` is a slide-out dialog (`role="dialog"`, `:36`) triggered
from the cart button in `Navbar.tsx`, which is part of the global layout —
so it's reachable from every page, not just the cart page itself. It shows
each item's thumbnail, quantity, and the running subtotal, plus
Checkout/View Cart CTAs, without leaving the current page.

> From any page (not just `/cart`), click the cart icon in the header — a slide-out panel with your cart contents appears without navigating away.

---

**Quick search with dynamic suggestions is implemented.**

The header search box in `Navbar.tsx` debounces keystrokes and calls
`GET /products/suggest?q=<term>` (`:52`), showing up to 8 matching product
names in a dropdown. The dropdown supports full keyboard navigation —
arrow keys to move, Enter to select, Escape to close (`:88-101`) — not
just mouse interaction.

> Start typing a product name (e.g. "jacket") into the header search box on any page — a dropdown of matching suggestions appears after a couple of characters, and you can navigate it with the arrow keys.

---

**Product images are stored and served in multiple sizes to support different views (e.g., thumbnails, full-size images).**

`ImageService.processProductImage()` (`backend/src/catalog/image.service.ts:21-57`)
uses `sharp` to generate three WebP variants in parallel for every uploaded
image — `thumbnail` (320px), `medium` (768px), and `full` (1440px) — each
saved separately with its own URL. The frontend picks the right one for
the context rather than always loading the largest: `ProductCard.tsx:29`
and the gallery thumbnail strip on `ProductPage.tsx:91` both use
`thumbnailUrl`, while the main product image and cart/related-product
thumbnails use the full-size `url`.

> Open DevTools → Network → filter by "Img" while browsing `/shop` — the product grid loads the small `thumbnail` variant, not the full-size image. Open a product page and compare: the gallery thumbnail strip still uses the small variant, while the large image you clicked loads the bigger one.

---

**Platform maintains functionality across various (320px, 768px, 1024px, 1440px) viewports.**

The actual `@media` breakpoints in `frontend/src/styles.css` sit at 480,
520, 767, 820, 860, and 900px, with the page container capped at
`max-width: 1180px` — not exactly the four numbers named in the brief, but
close enough in intent: 767px covers the 768px case, and everything from
900px up to very wide screens uses the same centered desktop layout
without breaking (relative units and flex-wrap throughout mean there's no
hard-coded layout that would snap or overflow at exactly 1024px or 1440px).

> Open DevTools → Device Toolbar and manually set the viewport to 320, 768, 1024, and 1440px in turn on `/shop`, `/cart`, and `/checkout` — confirm nothing overlaps, clips, or requires horizontal scrolling at any of the four.

---

**Self signed TLS certificate is configured.**

`start.sh:21` and `scripts/generate-dev-certs.sh:15` both run
`openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out
certs/cert.pem -days 365 -nodes -subj "/CN=localhost"` on first run. The
API doesn't just have the cert sitting on disk — `main.ts:15-25` passes it
directly to `NestFactory.create()` as `httpsOptions`, so the NestJS server
itself terminates TLS with it on port 3001. (The unified proxy on `:8080`
and the frontend dev server on `:5173` are plain HTTP for local
convenience — TLS is applied at the API layer, which is where the brief's
"secure connections" concern actually lives: it's where credentials,
session cookies, and payment data cross the wire.)

> Open `https://localhost:3001/api/v1/health` directly in a browser — you'll get a self-signed certificate warning (click through it / "Proceed anyway"), and the connection padlock will show it's a self-signed cert once accepted, not a real CA-issued one.

---

**All sensitive data stored in database is encrypted at rest. Check encryption implementation for: user credentials, personally identifiable information, shipping addresses, order details and session tokens**

Everything reversible is AES-256-GCM (`backend/src/common/utils/encryption.util.ts`,
random IV per value, so identical plaintexts never produce matching
ciphertext):

| Data | Where |
|---|---|
| User credentials (password) | `User.passwordHash` — one-way argon2, never reversible at all (`schema.prisma:40`) |
| User PII (email, name) | `User.email`/`firstName`/`lastName` — AES-256-GCM; `User.emailHash` is a separate deterministic SHA-256 used only for login lookups, never the plaintext |
| 2FA secret | `TwoFactorSecret.secret` — AES-256-GCM (`two-factor.service.ts:37-38`, decrypted only at the moment of TOTP verification, `:49,75`); recovery codes are separately one-way argon2-hashed |
| Shipping address | `Order.shippingAddress` — AES-256-GCM (confirmed in `docs/review-guide-part-2.md`) |
| Order details | `Order.guestEmail`, `Payment.transactionId` — AES-256-GCM (same guide) |
| Session tokens | `RefreshToken.tokenHash` — SHA-256 hash; the raw refresh token is never stored anywhere, only ever held by the browser as an httpOnly cookie. Access tokens are never persisted at all — memory-only on the client (`docs/review-guide-part-1.md`) |

The 2FA secret is a change made directly in this review pass — it was
previously stored as plaintext base32, which is now fixed to match the
same encrypt-at-rest standard as everything else sensitive in the schema.

> Look at the raw rows directly:
> ```
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c 'SELECT email, "firstName" FROM "User" LIMIT 3;'
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c 'SELECT secret FROM "TwoFactorSecret" LIMIT 3;'
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c 'SELECT "tokenHash" FROM "RefreshToken" LIMIT 3;'
> ```
> Every value should come back as an unreadable hex blob, never a plaintext email, name, or base32 TOTP secret.

---

**Token bucket rate limiting is implemented.**

`TokenBucketThrottlerStorage` (`backend/src/common/throttler/token-bucket-throttler.storage.ts:22-47`)
backs NestJS's global `ThrottlerGuard` (wired in `app.module.ts`) with a
real Redis-based token bucket rather than a simple fixed window: 120
tokens per 60-second window per client by default
(`THROTTLE_LIMIT`/`THROTTLE_TTL`, `configuration.ts:92-93`), refilling
continuously rather than resetting all at once, so a burst right at the
window boundary can't double the effective limit the way a naive
fixed-window counter would. Sensitive endpoints override that default with
a much tighter per-route bucket via `@Throttle(...)` — e.g. `forgot-password`
is capped at 5 requests/minute (`auth.controller.ts:168-169`), since that's
an endpoint worth throttling hard regardless of the general site-wide
limit. High-traffic public reads like the product catalog go the other
way and opt out entirely with `@SkipThrottle()` (`products.controller.ts:39-40`),
a deliberate choice so normal browsing never gets anywhere near a limit
meant for abuse, not legitimate page loads.

> ```
> for i in {1..8}; do curl -sk -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}'; done
> ```
> The first 5 responses are `202`; the rest come back `429`. Automated: `'enforces rate-limiting on authentication endpoints (429)'`, `app.e2e-spec.ts:599-609`.

---

**Student can explain CIA (Confidentiality, Integrity, Availability) principles.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

---

**The platform implements basic SEO best practices including title tags under 60 characters, proper heading hierarchy (H2-H6), logical URL structure, and descriptive alt text for images.**

Every page sets its title via `usePageTitle()`/`<SEO title=...>`
(`frontend/src/components/SEO.tsx:37,131-139`), formatted as `"<page> |
Villi"`. A few real examples: "Sign In | Villi" (16 chars), "Shopping Cart
| Villi" (21), "Order Confirmed | Villi" (23), "Page Not Found | Villi"
(22) — all comfortably under 60. Heading hierarchy is real, not just
visual: `ProductPage.tsx` has a single `<h1>{product.name}</h1>` (`:106`)
followed by `<h2>Specifications</h2>` (`:137`); `CatalogPage.tsx` has a
visually-hidden-but-present `<h1 className="sr-only">Catalog</h1>`
(`:365`) so screen readers still get exactly one page heading. URLs are
lowercase and descriptive throughout (`/shop`, `/product/:id`, `/cart`,
`/checkout`, `/order-confirmation`), with no query-string-only "pages".
`SEO.tsx` also sets a meta description and OpenGraph/Twitter tags on every
page (`:71,83-118`) — beyond what's strictly required here, but relevant
context for the same SEO item.

> Open a few pages and check the browser tab title against the table above. Open DevTools → Elements on `/product/:id` and `/shop` and confirm exactly one `<h1>` per page with `<h2>`s following it, not skipped levels.

---

**All meaningful images include descriptive alt text.**

`ProductCard.tsx:30` sets `alt={img?.altText || \`Photograph of
${product.name}\`}` — a real fallback, not an empty string — and
`ProductPage.tsx` does the same for gallery images. Every product image
across the grid, product page, cart, and cart preview carries the actual
product name, not a generic "image" placeholder.

> DevTools → Elements → inspect any product `<img>` — the `alt` attribute contains the real product name, not a filename or empty string.

---

**Text remains readable when zoomed to 200%.**

`styles.css` uses `rem` for font sizing throughout — zero `px`-based
`font-size` declarations were found across the whole stylesheet. Layouts
use `flex`/`grid` with wrapping rather than fixed pixel widths, so text
reflows rather than overflowing or getting clipped as the effective
viewport shrinks under zoom.

> Press `Ctrl` `+` (or `Cmd` `+` on Mac) repeatedly until the browser reaches 200% zoom on `/shop`, `/product/:id`, and `/checkout` — text should reflow and stay fully readable with no horizontal scrollbar on the page body.

---

**Student can explain the importance of semantic HTML for accessibility.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

---

**Student can explain their approach to testing, integration of automated and usage of manual tests throughout the development process.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

---

**Automated tests exist for Unit, API integration, User flow and Security tests. Ask the student to explain and demonstrate the functionality of the tests.**

| Layer | Where | Covers |
|---|---|---|
| Unit | `backend/src/**/*.spec.ts` | JWT issue/rotate/reuse (`tokens.service.spec.ts`), product data model validation (`catalog/dto/product.dto.spec.ts`), user input validation (`auth/dto/auth.dto.spec.ts`), plus cart/checkout/order/units/captcha specs — 108 tests, 12 suites |
| API integration | `backend/test/app.e2e-spec.ts`, `commerce.e2e-spec.ts` | Endpoint responses, DB persistence, product search (`app.e2e-spec.ts:139,194`), reviews (`:644-`) — 64 tests, 2 suites |
| Security | `app.e2e-spec.ts` `'security: input validation & injection'` block | Malformed/SQLi-shaped input, auth bypass attempts, and a dedicated rate-limiting test (`'enforces rate-limiting on authentication endpoints (429)'`, `:599-608`) that hits the throttle 15x and asserts a `429` shows up |
| User flow | `commerce.e2e-spec.ts` | Full register → cart → checkout → order lifecycle end to end |

172 tests total across both suites.

> Unit suite (no database needed, ~10 seconds):
> ```
> cd backend && npm test
> ```
> Everything — unit + API integration + security + user flow, 172 tests, against a fully isolated throwaway Postgres/Redis/RabbitMQ that never touches dev data:
> ```
> docker compose --profile test run --rm e2e
> ```
> To see a test actually fail and prove it's real: open `backend/test/app.e2e-spec.ts`, flip any `.expect(429)` in the rate-limiting test to `.expect(200)`, rerun, watch it fail with a clear diff, then revert.

---

**Load test report identifies maximum concurrent users before response times exceed 5 seconds.**

Full report: [`docs/load_test_report.md`](load_test_report.md) §4. Using
k6's `ceiling.js` script against the real Docker stack, concurrency was
ramped to 400 VUs against the catalog browse endpoint. **No breaking point
was found** — p95 latency stayed at 388.2ms (well under the 5s threshold)
with a 0% error rate even at the 400-VU peak, so the true ceiling is
higher than what this environment could reach. The report is explicit
about this rather than inventing a number: §4's "Honest limitations"
section explains that the load generator shared the same 4-core host as
the app under test, which caps how far this specific run can be trusted.

> Read `docs/load_test_report.md` §4 for the full stage-by-stage results table and the resource-utilization numbers (`docker stats` output) captured during the run.

---

**Load test report shows transaction throughput.**

`docs/load_test_report.md` §2 and §4: **34.4 req/s** sustained across five
realistic mixed user flows at 69 peak VUs (comfortably over the brief's 10
TPS objective), and **1,074 req/s** on the dedicated read-heavy ceiling run
at 400 VUs. §2 also captures a live concurrency proof of the
overselling-prevention requirement: 40 simultaneous checkout attempts
against 25 units of stock — 25 succeeded, 15 were correctly rejected, and
final stock landed exactly on 0.

> The throughput figures and the full per-scenario breakdown (browsing, searching, cart, registration/login, checkout) are in `docs/load_test_report.md` §2 and §4.

---

**Student has identified potential bottlenecks and can propose solutions.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

---

**Project application is containerized using Docker. / The project uses Docker to containerize the application and its dependencies. Host prerequisites are limited to Docker and payment simulation CLI — all other dependencies are managed within containers.**

`docker-compose.yml` defines every service — Postgres, Redis, RabbitMQ,
Mailhog, the API (which also terminates TLS, per the item above), the web
frontend, and the unified proxy — plus a separate `test` profile with its
own throwaway database. `./start.sh` generates the self-signed cert if it
doesn't exist yet, builds, and runs the whole stack in one command.
Nothing beyond Docker and the Stripe CLI needs to be installed on the host.

> From a fresh clone:
> ```
> ./start.sh
> ```
> Open `http://localhost:8080` — the whole app is reachable with nothing else installed on your machine.
