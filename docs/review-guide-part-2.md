# Review Guide — Part 2: Commerce

Answers every mandatory checklist item at the bottom of `task2.txt` (the
assignment brief — not checked into this repo), in the same order, against
the running codebase. Code paths are relative to the repo root; API routes
are relative to `https://localhost:3001` (direct) or `http://localhost:8080`
(unified proxy). Seeded accounts: `admin@villi.test` / `Admin!Passw0rd` and
`shopper@villi.test` / `Shopper!Passw0rd`. Payments run against real Stripe
test-mode sandbox keys — see README → "Payments and Stripe CLI setup" for
the one-time `stripe listen` step needed before any checkout completes.

---

**The README file contains updated project overview, entity relationship diagram, setup instructions, and usage guide for the commerce functionality**

[`README.md`](../README.md)'s `## Entity Relationship Diagram` includes
`Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, and `DeliveryOption`
alongside the Foundation entities, with the same PK/FK/cardinality notation.
`## Usage guide` covers adding to cart, guest vs. logged-in checkout, and
order management. `## Setup and installation` documents the Stripe CLI as a
second host prerequisite alongside Docker.

> Open [README.md](../README.md) and confirm the ERD's Mermaid block includes the Commerce entities and that the setup section mentions the Stripe CLI.

---

**The database schema includes tables and relationships to support the shopping cart functionality, including guest carts and persistent carts for logged-in users.**

`Cart`/`CartItem` (`backend/prisma/schema.prisma:270-294`) hold the
persistent, logged-in-user cart — `Cart.userId` nullable-but-unique-per-user,
`CartItem` unique on `(cartId, productId)`. Guest carts intentionally have
**no** table: they live in Redis under `cart:guest:<guestId>` with a 7-day
TTL (`CartService.guestCartKey()`, `cart.service.ts:18-20,135`) — an
ephemeral, unauthenticated cart has no reason to occupy durable relational
storage, and Redis's TTL gives "temporary" for free instead of a cron job.

> `docker exec -it <postgres container> psql -U villi -d villi -c '\d "Cart"'` shows the persistent table; `docker exec -it <redis container> redis-cli KEYS 'cart:guest:*'` shows guest carts after adding to cart while logged out.

---

**The shopping cart displays product information for each item, including name, price, and a thumbnail image.**

`CartService.getCart()` (`cart.service.ts:22-76`) enriches each raw
`{productId, quantity}` pair with `product.name`, `product.price`, and
`image: p.images[0]?.thumbnailUrl || p.images[0]?.url || null` (line 68) —
prefers the dedicated 320px thumbnail variant, falling back to the full-size
URL only if no thumbnail was generated. Rendered by `CartSidebar.tsx` and
`CartPage.tsx`.

> Add any product to cart and open the cart sidebar: name, unit price, and a thumbnail all appear. Unit coverage: `'prefers the dedicated thumbnailUrl over the full-size url when present'` / `'falls back to the full-size url when no thumbnailUrl is set'` / `'sets image to null when the product has no primary image'`, `backend/src/cart/cart.service.spec.ts:431,449,461`.

---

**Users can add, remove, and update quantities of items in the cart with real-time total calculations.**

`POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:productId`,
`DELETE /api/v1/cart/items/:productId` (`cart.controller.ts`) map to
`addItem`/`updateItem`/`removeItem`. Every one of them returns
`this.getCart(...)` (e.g. `cart.service.ts:138,177,197`), which recomputes
`itemTotal`/`total` from current `product.price` on every call — the total
is never a stored, staleness-prone field.

> On `/cart`, change a quantity or remove an item: the line total and cart total both update immediately with no page reload. Unit coverage: `'returns enriched items with real-time total for a logged-in user'`, `cart.service.spec.ts:370`.

---

**A guest cart is implemented for non-registered users, saving their selections temporarily.**

Confirmed above (Redis, 7-day TTL). `CartPage`/`CartSidebar` work identically
whether or not `useAuth()` returns a user — the guest path is driven by an
`x-guest-cart-id` header generated client-side and never requires
registration.

> Open an incognito window, add items to cart without logging in, close and reopen the tab (same browser session) — the cart persists. Unit coverage: the "Guest User (Redis)" `describe` blocks throughout `cart.service.spec.ts` (e.g. lines 164, 175, 268).

---

**A persistent cart is implemented for logged-in users, retaining items across sessions.**

Logged-in cart rows live in Postgres (`Cart`/`CartItem`), keyed by
`userId` — unaffected by token expiry, browser restarts, or device changes.
`CartService.mergeCart()` (`cart.service.ts:211-251`) additionally folds a
guest cart into the account's persistent cart on login, clamping merged
quantities to live stock (`Math.min(..., product.stockQuantity)`,
line 233) rather than trusting the pre-login guest quantity blindly.

> Add items while logged out, then log in: guest items appear merged into the account cart. Log out and back in again: the cart is still there. Unit coverage: `'copies guest items into the user's DB cart and clears the guest cart'` / `'clamps the merged quantity to the product stock'`, `cart.service.spec.ts:479,524`.

---

**The system handles out-of-stock scenarios gracefully when users attempt to add items to the cart.**

Server: `addItem`/`updateItem` (`cart.service.ts:82-86,145-149`) throw a
`BadRequestException` with the exact remaining quantity the moment a
requested amount would exceed `product.stockQuantity` — never a silent clamp
or a generic 500. Client: `ProductCard.tsx:49` and `ProductPage.tsx:190`
disable the **Add to Cart** button (`disabled={!product.inStock || adding}`)
and swap its label/`aria-label` to reflect "Sold", so a zero-stock item can't
even be submitted from the UI in the first place.

> Set a seeded product's `stockQuantity` to 0 via Prisma Studio or the admin panel; its **Add to Cart** button becomes disabled and reads "Sold" on both the grid card and product page. Unit coverage: `'throws BadRequestException if requested quantity exceeds stock'`, `cart.service.spec.ts:130`.

---

**The system implements a single-page checkout process.**

`/checkout` (`frontend/src/pages/CheckoutPage.tsx`) is one route/component
handling address entry, delivery-option selection, and payment — no
multi-step wizard, no route change between "shipping" and "payment". The
Stripe `PaymentElement` renders inline on the same page once the order is
created; `stripe.confirmPayment()` is called with `redirect: 'if_required'`
(`StripePaymentForm.tsx:30`) so a card payment (this app's only enabled
method) never navigates away — confirmation happens in place.

> Walk through checkout end to end: address form → payment form → confirmation, all without the browser URL ever leaving `/checkout` until the final redirect to `/order-confirmation/:id`.

---

**The checkout page collects basic information, address input, and payment selection.**

Basic info: guest email field (`CheckoutPage.tsx:186-197`, logged-in users
skip this — see prefill below). Address: `ShippingAddressDto`-backed form
(street/city/postal code/country/phone). Payment: Stripe `PaymentElement`
rendered once the order is created (currently configured for card,
`stripe-payment.service.ts:46`).

> Load `/checkout` with items in cart: email (guests only), address fields, delivery option, and a payment form are all present on one screen.

---

**For logged-in users, known information is pre-filled in the checkout form.**

`useEffect` at `CheckoutPage.tsx:53-67`: on mount, if `user` is set, it
populates `email` from `user.email` and calls `GET /api/v1/addresses`,
pre-selecting the address marked `isDefault` (or the first one) into the
form fields. A dropdown (`CheckoutPage.tsx:207-222`) lets the user pick a
different saved address or enter a brand-new one.

> Log in as `shopper@villi.test` (has a saved address from seed data) and open `/checkout`: address fields and a saved-address dropdown are pre-populated without typing anything.

---

**The system validates entered shipping address for accuracy.**

Two layers: **client** — `handlePlaceOrder` (`CheckoutPage.tsx:112-131`)
blocks submission with specific inline errors for empty required fields and
a malformed phone number (`PHONE_PATTERN`, line 33) before any network call.
**Server** — `ShippingAddressDto` (`backend/src/checkout/dto/checkout.dto.ts:20-46`)
re-validates every field: `@MaxLength`, a postal-code `@Matches` regex, and
`@IsPhoneNumber()` for the phone — the authoritative check, since client
validation can be bypassed.

> Submit checkout with an empty city or a phone number like `"abc"`: inline error before any request fires. Then POST the same malformed payload directly to `/api/v1/checkout` (e.g. via Swagger) to confirm the server independently returns `400`. Automated: `'fails with 400 on an incomplete/invalid shipping address'` / `'fails with 400 on an invalid phone number format'`, `backend/test/commerce.e2e-spec.ts:299,314`.

---

**An order summary is provided during checkout, displaying all items, quantities, and costs.**

The right-hand column of `/checkout` (`CheckoutPage.tsx`, order-summary
panel) lists every cart item with quantity and line price, the selected
delivery option's cost, and the running total — kept live via `useCart()`,
with quantity/remove controls wired through a `runCartAction` wrapper so an
edit mid-checkout immediately recalculates the total shown before payment.

> On `/checkout`, change an item's quantity in the order-summary panel: the total updates immediately, before you've paid.

---

**The system sends an email confirmation to the user after a successful order placement.**

Not sent by the checkout request itself — sent asynchronously once the
payment queue confirms success: `OrderStatusConsumerService.applyStatus()`
calls `this.mail.sendOrderConfirmation(message.email, message.orderId)`
(`order-status-consumer.service.ts:105-106`) after the DB transaction
commits. `MailService.sendOrderConfirmation()` (`mail.service.ts`) renders
the order link. Locally, caught by **Mailhog** (`http://localhost:18025`)
instead of a real SMTP provider.

> Complete a real checkout with `stripe listen` running, then check `http://localhost:18025` — an "Order Confirmation - `<orderId>`" email appears once the webhook round-trips. Automated: `'Critical Flow: register -> add to cart -> checkout -> order -> deduct inventory'`, `backend/test/commerce.e2e-spec.ts:94` (asserts the full flow including the async status settling).

---

**The checkout process handles and displays appropriate error messages for invalid inputs or failed transactions.**

`handlePlaceOrder`/`handlePaymentError`/`runCartAction` in `CheckoutPage.tsx`
all funnel into one `error` state rendered as `<div className="alert
alert-error">`, sourced from `err instanceof ApiError ? err.message : '...'`
— the server's specific validation message is shown verbatim, not a generic
"something went wrong". Stripe declines surface through
`StripePaymentForm`'s own `errorMessage` state (`StripePaymentForm.tsx:36-39`),
driven directly by Stripe's `error.message`.

> Trigger each of: an empty required field, an invalid phone number, and a declined test card (`4000000000009995`) — each produces a distinct, specific message in the UI, not a blank screen or console-only error.

---

**Verify specific error messages for: missing required fields, invalid formats (email, phone, address), payment validation, and network errors.**

| Scenario | Message source |
|---|---|
| Missing required field | `'Please fill in your full shipping address.'` (client) / per-field `class-validator` message (server), `checkout.dto.ts` |
| Invalid email | `'Please enter a valid email address for your order confirmation.'` (client) / `@IsEmail` DTO message (server) |
| Invalid phone | `'Please enter a valid phone number (e.g. +358 40 1234567).'` (client) / `'Phone number format looks invalid.'` (`@IsPhoneNumber`, server) |
| Invalid address | `'Postal code format looks invalid.'` (`@Matches`, server) |
| Payment validation | Stripe's own `error.message` on the PaymentElement (e.g. "Your card number is invalid.") |
| Network error | `ApiError`-wrapped fetch failures surface through the same `error` alert rather than an unhandled promise rejection — `frontend/src/api/client.ts` |

> Reproduce each row directly; all six are distinct, human-readable strings, not raw error objects or generic fallbacks.

---

**The payment system integrates with Stripe, PayPal or other similar simulation sandbox APIs.**

Real Stripe **test-mode** integration (`sk_test_.../pk_test_...`), not a
hand-rolled mock. `StripePaymentService` (`backend/src/checkout/stripe-payment.service.ts`)
wraps the official `stripe` Node SDK for `paymentIntents.create()`,
`refunds.create()`, and `webhooks.constructEvent()`. Webhook events are
forwarded locally by the real **Stripe CLI** (`stripe listen`), exercising
the actual signature-verification path, not a stub.

> With `stripe listen --forward-to localhost:8080/api/v1/checkout/webhook` running, complete a checkout with test card `4242424242424242` and watch the CLI terminal log real `payment_intent.*` events as they arrive.

---

**The payment form uses the payment provider's secure form elements instead of handling card details directly.**

`<PaymentElement />` (`StripePaymentForm.tsx:61`) from `@stripe/react-stripe-js`
renders Stripe's own hosted iframe for card input. No `<input>` for card
number/expiry/CVV exists anywhere in this codebase — `grep -r "cardNumber\|cvv" frontend/src` returns nothing. `stripe.confirmPayment()` is the only
place card data is referenced, and it never leaves Stripe's iframe boundary
to touch application JavaScript.

> DevTools → Elements on `/checkout`'s payment step: the card fields live inside `<iframe>`s served from `js.stripe.com`, confirming the app's own JS never has access to raw input values.

---

**The card validation system checks number format, expiry date, and CVV before form submission.**

Delegated entirely to Stripe's `PaymentElement`, which validates Luhn
checksum, expiry (not-in-the-past), and CVV length/format live as the user
types, disabling submission until the fields are valid — this is
Stripe-hosted validation, safer than reimplementing it, since raw card data
never reaches application code to validate against in the first place.

> Type an invalid card number (e.g. `4242 4242 4242 4241`, bad checksum) into the payment form: Stripe flags it inline before **Pay Now** can be pressed.

---

**Student can explain the concept of PCI DSS compliance and why sensitive payment data should not be stored on application servers.**

Covered in [`docs/REFERENCE.md`](REFERENCE.md) → "Payments: theoretical
concepts". Short version for the review conversation: PCI DSS is the card
networks' security standard for anyone who stores, processes, or transmits
cardholder data; the scope (and audit burden) of that standard shrinks
enormously if your servers never touch raw card data at all. Using Stripe
Elements/PaymentElement means card numbers go straight from the customer's
browser to Stripe over TLS — this app only ever sees a `PaymentIntent` id
and status, which is why `Payment.transactionId` (an opaque Stripe id, not a
card number) is the only payment-related value we store, and even that is
encrypted at rest.

> Be ready to explain this verbally per the checklist's own instruction — no code artifact demonstrates a "concept."

---

**The order system updates status appropriately upon receiving callbacks from payment provider (successful or failed payments).**

`POST /api/v1/checkout/webhook` (`checkout.controller.ts:46-62`) verifies
the Stripe signature, then `handleStripeWebhook()` (`checkout.service.ts:230-289`)
processes exactly the two event types that matter —
`payment_intent.succeeded` and `payment_intent.payment_failed` — ignoring
every other event Stripe delivers (e.g. `payment_intent.created`, which
fires immediately on intent creation and, if misclassified, would cancel
every order before the customer even paid). It records a `Payment` row,
then hands off to the queue; `Order.status` itself is only ever changed by
`OrderStatusConsumerService`, on the other side of that queue.

> Pay with `4242424242424242` (succeeds) and `4000000000009995` (declines) in two separate checkouts; watch `Order.status` land on `PAID` and `CANCELLED` respectively after the webhook round-trips. Automated: `'applies PENDING -> PAID / CANCELLED via a signed Stripe webhook, asynchronously through the queue'`, `backend/test/commerce.e2e-spec.ts:358`.

---

**The payment system publishes status updates to a message queue.**

`PaymentQueueService.publishStatusUpdate()` (`payment-queue.service.ts:23-33`)
publishes onto a durable RabbitMQ queue (`payment.status.updates`,
`RabbitmqService.PAYMENT_STATUS_QUEUE`), called from
`handleStripeWebhook()` right after the `Payment` row is written
(`checkout.service.ts:283-288`) — matching the brief's own diagram
(Payment Service → Message Queue → Order Service) exactly: the webhook
handler is the "Payment Service" side and never touches `Order.status`
itself.

> `docker compose exec rabbitmq rabbitmqctl list_queues` shows `payment.status.updates`; the RabbitMQ management UI (`http://localhost:15672`, guest/guest by default) shows message throughput spike during a checkout.

---

**Manage payment statuses (Pending/Success/Failure) linked to the order state / The Order Service consumes the message to update the order based on the payment status.**

`OrderStatusConsumerService.onModuleInit()` (`order-status-consumer.service.ts:28-35`)
consumes `payment.status.updates` and `applyStatus()` (lines 72-110) maps
`'succeeded' → OrderStatus.PAID`, `'failed' → OrderStatus.CANCELLED`, inside
a Prisma transaction. `Order.status` starts at `PENDING` the moment
`processCheckout()` creates the row (`checkout.service.ts:142`, `status:
OrderStatus.PENDING`) — before payment is even attempted — matching the
brief's required "Pending Payment" → "Payment Successful"/"Payment Failed"
lifecycle precisely. `PaymentStatus` (`PENDING|COMPLETED|FAILED|REFUNDED`,
the `Payment` row) tracks the gateway-level state separately from
`OrderStatus`, so a payment's own history is preserved even after refund.

> Track `Order.status` through Prisma Studio across a full checkout: `PENDING` immediately on order creation, then `PAID` or `CANCELLED` a few seconds later once the webhook + queue settle.

---

**Notify the customer via email of the order status and adjust inventory accordingly.**

Both happen inside `OrderStatusConsumerService.applyStatus()`
(`order-status-consumer.service.ts:72-110`), driven by the same message:
- **Success** → `sendOrderConfirmation()`. Stock was already decremented at order-creation time (reserved), so nothing further happens to inventory.
- **Failure** → stock is *restored* (`stockQuantity: { increment: item.quantity }`, lines 96-102) for every item, then `sendPaymentFailed()` (`mail.service.ts:87-96`) is sent, explicitly telling the customer "Your items have been released back into stock."

> Force a declined payment (`4000000000009995`): check Mailhog for a "Payment Failed" email, and confirm the product's `stockQuantity` in Prisma Studio returns to its pre-checkout value. Automated: `'fails with 400 ... reverts stock'` path in `commerce.e2e-spec.ts:391-427` asserts exactly this reversion.

---

**The payment system responds to specific failure scenarios. System must handle: insufficient funds error, invalid card number error, expired card error, and payment gateway timeout**

`describeStripeFailure()` (`checkout.service.ts:34-47`) maps Stripe's
`decline_code`/`code` to a specific, human string:

| Scenario | Stripe test card / trigger | Mapped message |
|---|---|---|
| Insufficient funds | `4000000000009995` | `'Insufficient funds'` |
| Invalid card number | `incorrect_number`/`invalid_number` | `'Invalid card number'` |
| Expired card | `4000000000000069` | `'Card expired'` |
| Gateway timeout | any Stripe call exceeding 10s | `'Payment gateway timeout: Stripe did not respond in time.'` — a `withTimeout()` wrapper (`stripe-payment.service.ts:83-89`) races every Stripe call against a 10s timer via `Promise.race`, so a hung/unreachable gateway surfaces as this explicit error instead of hanging the checkout request indefinitely. |

> Run each Stripe test card above through a real checkout and confirm the corresponding message reaches the customer (UI alert for an immediate decline; the "Payment Failed" email for anything settled asynchronously via webhook). Unit coverage: `'reads last_payment_error from the PaymentIntent itself, not a top-level data.error'`, `backend/src/checkout/checkout.service.spec.ts:261`.

---

**The inventory system prevents overselling during concurrent payments. Multiple simultaneous payments for the same product should not result in overselling inventory**

Stock is decremented **at order-creation time** (`processCheckout()`,
`checkout.service.ts:159-170`), inside a Postgres transaction, using an
atomic `{ decrement: item.quantity }` update rather than a
read-then-write — two concurrent checkouts for the last unit both issue
`UPDATE ... SET stock = stock - 1` and Postgres serializes them at the row
level, so the second one to commit sees the *already-decremented* value.
An explicit guard (`if (updatedProduct.stockQuantity < 0) throw
BadRequestException(...)`, lines 165-169) catches the case atomicity alone
wouldn't: it rolls the whole transaction back rather than allowing a
negative-stock row to ever be visible, even transiently.

> Manual concurrency test: with a product at `stockQuantity: 1`, fire two `POST /api/v1/checkout` requests at the same instant (`curl` with `&` backgrounding, or two browser tabs) for carts that each want that unit — exactly one succeeds; the other gets `400 Race condition detected: Oversold product ...`, and the DB never shows negative stock.

---

**The order filtering system allows users to sort by date and order status.**

`OrderFilterDto` (`backend/src/orders/dto/order.dto.ts:4-24`): `status`
(validated `@IsEnum(OrderStatus)`), `startDate`/`endDate`
(`@IsDateString`), `sortBy` restricted to `@IsIn(['createdAt', 'status'])`,
`sortOrder` restricted to `@IsIn(['asc', 'desc'])` — an out-of-range value
is rejected with `400` rather than silently ignored or crashing the query.
`OrdersService.getUserOrders()` (`orders.service.ts:20-44`) applies all of
it directly to the Prisma `where`/`orderBy`.

> On `/account/orders`, use the status filter and the sort-by-date control together; the order list updates accordingly. Try `GET /orders?sortBy=totalAmount` directly (an unlisted field) and confirm `400`, not a 500 or a silently-ignored sort.

---

**The order details page displays full order information including status updates.**

`GET /api/v1/orders/:id` → `OrdersService.getOrderById()`
(`orders.service.ts:76-86`) returns items (with product details), current
`status`, delivery option, timestamps, decrypted shipping address, and
payment status — rendered by `frontend/src/pages/OrderDetailsPage.tsx`,
including a human-formatted address (parsed from the stored JSON string,
not raw JSON dumped to the page).

> Open any past order at `/orders/:id`: item list, current status badge, shipping address, and payment status are all visible and legible.

---

**The order cancellation system allows cancellations for unprocessed orders.**

`POST /api/v1/orders/:id/cancel` → `OrdersService.cancelOrder()`
(`orders.service.ts:134-184`): permitted only while `status` is `PENDING`
or `PAID` (line 144-148) — a `SHIPPED`/`DELIVERED` order is rejected with an
explicit "It may have already shipped" message, and an already-`CANCELLED`
one is rejected as a duplicate. If the order had already been charged
(`payment.status === COMPLETED`), a **real Stripe refund** is issued
*before* the DB is touched (lines 150-156), so a cancellation is never
recorded while the customer's money is still actually held.

> Cancel a `PENDING` order from `/account/orders` — succeeds instantly. Manually flip an order to `SHIPPED` via the admin panel and try to cancel it — rejected. Unit coverage: `'refunds via Stripe when cancelling an order that was already paid'` / `'rejects cancelling an already-cancelled order'`, `backend/src/orders/orders.service.spec.ts:138,181`.

---

**The inventory system updates stock levels when orders are placed or cancelled.**

**Placed**: stock reserved (decremented) at order-creation time,
`checkout.service.ts:159-170` (see the oversell-prevention item above).
**Cancelled**: `cancelOrder()` restores it (`stockQuantity: { increment:
item.quantity }`, `orders.service.ts:171-176`) inside the same transaction
that flips `status` to `CANCELLED` — the two never happen independently, so
stock can't drift out of sync with order state.

> Note a product's stock, place an order for it (stock drops), then cancel that order (stock returns to the original value) — verifiable in Prisma Studio or the admin product panel. Unit coverage: `'restores stock for every item when refunding a still-active order'`, `orders.service.spec.ts:66`.

---

**All sensitive data stored in database is encrypted at rest for order and payment data. Check encryption implementation for: order details, shipping addresses, and payment transaction records**

AES-256-GCM (`backend/src/common/utils/encryption.util.ts:1-28`), same
primitive used for user PII in Project 1. Applied to:

| Field | Model | Encrypted at |
|---|---|---|
| `shippingAddress` | `Order` | `checkout.service.ts:145` (`encrypt(JSON.stringify(dto.shippingAddress))`) |
| `guestEmail` | `Order` | `checkout.service.ts:141` |
| `transactionId` | `Payment` (the Stripe PaymentIntent id) | `checkout.service.ts:271,275` |

Each encrypted value is a random-IV ciphertext (`iv:authTag:ciphertext`
hex triple) — two orders shipped to the identical address never produce
matching bytes in the DB, so the ciphertext itself leaks nothing by
comparison. `OrdersService.decryptOrder()` (`orders.service.ts:291-306`)
is the single point where these are ever turned back into plaintext, always
at the service boundary, never in a raw Prisma query result handed
upstream.

> `docker exec -it <postgres container> psql -U villi -d villi -c 'SELECT "shippingAddress", "guestEmail" FROM "Order" LIMIT 3;'` and `SELECT "transactionId" FROM "Payment" LIMIT 3;` — every value is an unreadable `hex:hex:hex` blob, never plaintext JSON or a real Stripe id (`pi_...`).

---

**Student can explain their approach to testing cart functionality, checkout flows, and payment integration.**

Three layers, each targeting a different kind of bug:
1. **Unit** (`cart.service.spec.ts`, `checkout.service.spec.ts`, `orders.service.spec.ts`) — Prisma/Redis/Stripe mocked out, so these run in milliseconds and pin down business-logic edge cases (stock clamping, decimal precision, guest-vs-user branching) precisely.
2. **API integration** (`test/commerce.e2e-spec.ts`) — real Postgres/Redis/RabbitMQ in Docker, real HTTP requests through Nest's full pipeline, asserting on actual DB state after the async webhook→queue→consumer chain settles.
3. **Manual, live-Stripe** — every payment-related item in this guide was additionally verified end-to-end against real Stripe test-mode keys and a running `stripe listen` forwarder during this project's development, not just against mocks — see the webhook-misclassification bug this caught (below).

> Be ready to explain this verbally per the checklist's own instruction, and to point at the specific `describe`/`it` blocks referenced throughout this guide on request.

---

**Automated tests exist for Unit tests (cart functionality, order calculations) and Critical User Flow tests (registration, checkout process).**

Current live counts:

| Layer | Count | Files |
|---|---|---|
| **Unit** | 108, 12 suites | `backend/src/**/*.spec.ts`, including `cart.service.spec.ts` (34 cases — add/update/remove/get/merge, guest and logged-in), `checkout.service.spec.ts` (11 cases — totals, stock, guest checkout, Stripe failure-detail parsing), `orders.service.spec.ts` (cancellation/refund logic) |
| **API integration / Critical Flow** | 63, 2 suites | `test/app.e2e-spec.ts` (52 — Foundation) and `test/commerce.e2e-spec.ts` (11 — full register→cart→checkout→order flow, guest checkout, and checkout resilience/edge cases) |

> `npm test` (backend/, unit only, ~19s, no DB needed — 108/108 passing as of this guide) and `docker compose --profile test run --rm e2e` (all 171 unit+e2e tests against a fully isolated, throwaway Postgres/Redis/RabbitMQ — see `docker-compose.yml`'s `test` profile, which never touches dev data).

---

**Project application is containerized using Docker. / Docker and payment simulation CLI are the only prerequisites for running and reviewing this project.**

`docker-compose.yml` defines every service this project needs
(`postgres`, `redis`, `rabbitmq`, `mailhog`, `api`, `web`, `proxy`) plus an
isolated `test` profile with dedicated `postgres-test`/`redis-test`/
`rabbitmq-test` containers. `./start.sh` builds and runs the whole stack in
one command; its `check_stripe_setup()` (`start.sh:41-61`) loudly warns —
rather than letting a reviewer discover it as a silent 500 — if
`STRIPE_SECRET_KEY` is unset or the Stripe CLI isn't installed, and reminds
the reviewer to run `stripe listen` for the payment step specifically to
work. Every other dependency (Postgres, Redis, RabbitMQ, Node, npm
packages) is fully contained inside Docker.

> Fresh clone → `./start.sh` → follow the printed Stripe reminder → full app reachable at `http://localhost:8080` with no other host installs beyond Docker + the Stripe CLI.
