# Review Guide — Part 2: Commerce

This walks through every mandatory item at the bottom of `task2.txt` (the
assignment brief — not checked into this repo) in the same order it appears
there, so you can go down the list and check things off as you go. Each
item says where the relevant code lives, then gives you something concrete
to click through or run to see it working yourself.

A few things worth knowing before you start:

- Code paths are relative to the repo root. API routes are relative to `https://localhost:3001` (hitting the API directly) or `http://localhost:8080` (the unified proxy — what you'll normally use).
- Seeded accounts: `admin@villi.test` / `Admin!Passw0rd` and `shopper@villi.test` / `Shopper!Passw0rd`.
- Payments run against a real Stripe **test-mode** sandbox, not a fake payment form. Before you can complete a checkout, run `stripe listen --forward-to localhost:8080/api/v1/checkout/webhook` in a separate terminal (see the README's "Payments and Stripe CLI setup" section) — without it, the order gets created but never flips out of "Pending".
- The `docker exec` commands below assume the stack was started with `./start.sh` or `docker compose up`, which names the containers `i-love-shopping-postgres-1`, `i-love-shopping-redis-1`, etc. If you renamed the project folder, swap in whatever `docker ps` shows you.
- Wherever this guide says "check it in Prisma Studio," that's a suggestion, not a requirement — Postgres isn't exposed to your host machine by default, so `npx prisma studio` from outside Docker won't connect out of the box. The `docker exec ... psql` commands throughout this guide check the same data with zero setup and work identically on any OS, so default to those. If you'd still rather use Prisma Studio's GUI, add `ports: ['5555:5555']` under the `api:` service in `docker-compose.yml`, restart (`docker compose up -d api`), then run `docker exec -it i-love-shopping-api-1 npx prisma studio --hostname 0.0.0.0` and open `http://localhost:5555`.
- Once a payment on a given order fails (e.g. testing the `4000000000009995` decline), don't try a different card on that same order — the checkout page deliberately won't let you (it shows the failure and a "Start a new order" button instead of the payment form). That order is already dead server-side the moment it fails: the webhook has cancelled it and released its stock, so a second attempt on the same order/PaymentIntent has nothing left to update even if Stripe would technically accept it. To retry, place a brand new order.

---

**The README file contains updated project overview, entity relationship diagram, setup instructions, and usage guide for the commerce functionality**

Open [README.md](../README.md). The Entity Relationship Diagram section
includes `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, and
`DeliveryOption` alongside the Foundation entities, in the same
Mermaid diagram with PK/FK/cardinality notation. The usage guide covers
adding to cart and both guest and logged-in checkout, and the setup section
calls out the Stripe CLI as a second host prerequisite next to Docker.

> Just read through the README top to bottom — nothing to run here.

---

**The database schema includes tables and relationships to support the shopping cart functionality, including guest carts and persistent carts for logged-in users.**

`Cart`/`CartItem` (`backend/prisma/schema.prisma:270-294`) hold the
persistent, logged-in-user cart. Guest carts deliberately don't get their
own table — they live in Redis under `cart:guest:<a random id>` with a
7-day expiry (`CartService.guestCartKey()`, `cart.service.ts:18-20,135`).
An anonymous cart doesn't need durable relational storage, and Redis's
built-in expiry gives you "temporary" for free instead of a cleanup job.

> Look at the persistent side:
> ```
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c '\d "Cart"'
> ```
> Then add something to your cart while logged out and check the guest side:
> ```
> docker exec -it i-love-shopping-redis-1 redis-cli KEYS 'cart:guest:*'
> ```

---

**The shopping cart displays product information for each item, including name, price, and a thumbnail image.**

`CartService.getCart()` (`cart.service.ts:22-76`) enriches each raw
`{productId, quantity}` pair with the product's name and price, plus
`image: p.images[0]?.thumbnailUrl || p.images[0]?.url || null` (line 68) —
it uses the dedicated 320px thumbnail if one was generated, and only falls
back to the full-size image otherwise.

> Add any product to your cart and open the cart sidebar — name, unit price, and a thumbnail should all be visible right away.

---

**Users can add, remove, and update quantities of items in the cart with real-time total calculations.**

The cart endpoints (`cart.controller.ts`) all route through
`addItem`/`updateItem`/`removeItem` in `cart.service.ts`, and every one of
them returns a freshly recomputed cart (e.g. `cart.service.ts:138,177,197`)
— the total is calculated from the current product price on every request,
never stored and left to go stale. `updateItem` (`cart.service.ts:145-173`)
validates the new quantity against live stock before writing it.

Because every listing is pre-loved and one-of-a-kind, seeded stock is always
`1` (`backend/prisma/seed.ts:812,821`), so day-to-day there's only ever one
unit to select — the `+` button on `/cart` correctly refuses to go to `2`
("Only 1 in stock"). To actually exercise the "up and down" part of the
control, temporarily give one product some stock (this and the other snippets
below use `jq` to pull the id out of the API's JSON response — install it
first if you don't have it: `sudo apt install jq`):
> ```
> PRODUCT_ID=$(curl -s "http://localhost:8080/api/v1/products?limit=1" | jq -r '.data[0].id')
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c "UPDATE \"Product\" SET \"stockQuantity\" = 5 WHERE id = '$PRODUCT_ID';"
> ```
> Add that product to your cart, open `/cart`, and bump its quantity up and down and remove an item — the line total and the cart total should update instantly with no page reload. Re-seeding (or setting the stock back to `1`) restores the normal one-of-a-kind state.

---

**A guest cart is implemented for non-registered users, saving their selections temporarily.**

Confirmed above — it's Redis-backed with a 7-day TTL, and works identically
to the logged-in cart from the UI's point of view. The only difference is
an `x-guest-cart-id` header generated client-side instead of a session.

> Open an incognito window, add a few items without logging in, close the tab, and reopen `/cart` in a new incognito window using the same browser profile — the cart should still be there.

---

**A persistent cart is implemented for logged-in users, retaining items across sessions.**

Logged-in cart rows live in Postgres, keyed by `userId`, so they survive
token expiry, browser restarts, or switching devices.
`CartService.mergeCart()` (`cart.service.ts:211-251`) also folds a guest
cart into the account cart the moment you log in, clamping the merged
quantity to whatever is actually in stock rather than trusting a stale
guest-side number.

> Add items while logged out, then log in — they should show up merged into your account cart. Log out and back in again and they should still be there.

---

**The system handles out-of-stock scenarios gracefully when users attempt to add items to the cart.**

On the server, `addItem`/`updateItem` reject a quantity that would exceed
stock with a specific message telling you exactly how many are left,
instead of a generic error or a silent clamp. On the client, the **Add to
Cart** button on both the product grid and the product page is disabled and
relabeled "Sold" the moment `product.inStock` is false, so you can't even
submit a request for a sold-out item.

> Set a product's stock to 0 (Prisma Studio or the admin product panel), then visit its page — the Add to Cart button is disabled and reads "Sold".

---

**The system implements a single-page checkout process.**

`/checkout` (`frontend/src/pages/CheckoutPage.tsx`) is one page for
shipping, delivery, and payment — there's no multi-step wizard and no route
change between steps. The Stripe payment form renders inline once the
order is created, and confirming a card payment happens in place rather
than redirecting out to another site.

> Walk through a full checkout — the URL stays on `/checkout` the entire time, right up until you're redirected to the order confirmation page at the end.

---

**The checkout page collects basic information, address input, and payment selection.**

Guest checkouts get an email field; logged-in users skip straight past it
(see prefill below). Address is a structured form (street, city, postal
code, country, phone). Payment is the Stripe form, which appears once the
order's been created.

> Load `/checkout` with something in your cart — email (if you're a guest), the address form, delivery options, and the payment form are all right there on one screen.

---

**For logged-in users, known information is pre-filled in the checkout form.**

On mount, if you're logged in, `CheckoutPage.tsx` fills in your email and
fetches your saved addresses, pre-selecting whichever one is marked as
default (or the first one if none is). A dropdown lets you switch to a
different saved address or type in a new one.

> Log in as `shopper@villi.test` (has a saved address from seed data) and open `/checkout` — the address fields and a saved-address dropdown are already filled in.

---

**The system validates entered shipping address for accuracy.**

Client-side, the form blocks submission with a specific inline message for
empty required fields or a badly formatted phone number, before any request
is sent. Server-side, `ShippingAddressDto` re-validates everything
independently — length limits, a postal-code pattern, and phone-number
format — since the client check can always be bypassed.

> Try submitting checkout with an empty city, or a phone number like `abc` — you'll get an inline error before anything hits the network. Automated: `'fails with 400 on an incomplete/invalid shipping address'` and `'fails with 400 on an invalid phone number format'` in `backend/test/commerce.e2e-spec.ts` (lines 299 and 314).

---

**An order summary is provided during checkout, displaying all items, quantities, and costs.**

The right-hand panel on `/checkout` lists every cart item with quantity and
price, the chosen delivery cost, and the running total. It's wired to the
same cart state as the rest of the app, so editing a quantity there
recalculates the total before you've paid anything.

> On `/checkout`, change an item's quantity in the order summary panel — the total updates immediately.

---

**The system sends an email confirmation to the user after a successful order placement.**

The email isn't sent by the checkout request itself — it goes out once the
payment queue confirms success, from `OrderStatusConsumerService`, after the
order's status has actually settled in the database. Locally, it's caught
by Mailhog instead of going out over real SMTP.

> Complete a real checkout with `stripe listen` running, then open `http://localhost:18025` — an order confirmation email shows up once the webhook has round-tripped (usually a couple of seconds).

---

**The checkout process handles and displays appropriate error messages for invalid inputs or failed transactions. Verify specific error messages for: missing required fields, invalid formats (email, phone, address), payment validation, and network errors.**

Form and cart errors all render as a red alert box with the server's actual
message, not a generic "something went wrong". Stripe declines surface
through the payment form's own error state, using Stripe's message
directly. Specifically:

| Scenario | What you'll see |
|---|---|
| Missing required field | "Please fill in your full shipping address." |
| Invalid email | "Please enter a valid email address for your order confirmation." |
| Invalid phone | "Please enter a valid phone number (e.g. +358 40 1234567)." |
| Invalid address | "Postal code format looks invalid." (from the server, if you bypass the client check) |
| Payment validation | Stripe's own message on the payment form (e.g. "Your card number is invalid.") |
| Network error | Shown in the same error alert as the others, not an unhandled crash |

> Try each of: an empty required field, an invalid phone number, a bad postal code, and a declined test card (`4000000000009995`) — reproduce each row directly on `/checkout` and confirm every one gives a distinct, readable sentence, never a blank screen.

---

**The payment system integrates with Stripe, PayPal or other similar simulation sandbox APIs.**

This is a real Stripe **test-mode** integration — not a hand-rolled mock.
`StripePaymentService` wraps the official Stripe SDK for creating payment
intents, issuing refunds, and verifying webhook signatures. Webhooks are
forwarded locally by the real Stripe CLI, so you're exercising Stripe's
actual signature verification, not a stub of it.

> With `stripe listen --forward-to localhost:8080/api/v1/checkout/webhook` running in a terminal, complete a checkout with test card `4242 4242 4242 4242` and watch real `payment_intent.*` events scroll by in that same terminal.

---

**The payment form uses the payment provider's secure form elements instead of handling card details directly.**

The payment step uses Stripe's `PaymentElement`, which renders Stripe's own
hosted iframe for card input. There's no plain `<input>` for card number,
expiry, or CVV anywhere in the app — the app's own JavaScript never sees
raw card data at all.

> Open DevTools → Elements while on the payment step of checkout — the card fields live inside iframes served from `js.stripe.com`, not the app's own DOM.

---

**The card validation system checks number format, expiry date, and CVV before form submission.**

This is handled entirely by Stripe's hosted form — it checks the card
number's checksum, whether the expiry date is in the past, and CVV
length/format live as you type, and won't let you submit until everything's
valid. That's safer than reimplementing this check ourselves, since it
means raw card data never has to reach our own code to be validated.

> Type an invalid card number (e.g. `4242 4242 4242 4241` — one digit off, fails the checksum) into the payment form — Stripe flags it before you can click Pay Now.

---

**Student can explain the concept of PCI DSS compliance and why sensitive payment data should not be stored on application servers.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

---

**The order system updates status appropriately upon receiving callbacks from payment provider (successful or failed payments).**

The webhook endpoint verifies Stripe's signature, then only acts on
`payment_intent.succeeded` and `payment_intent.payment_failed` — every
other event Stripe sends (like `payment_intent.created`, which fires the
instant the intent is made, well before the customer has actually paid) is
ignored. It records a payment row, then hands off to the queue — the order's
status itself only ever changes on the other side of that queue.

> Pay with `4242 4242 4242 4242` (succeeds) and `4000 0000 0000 9995` (declines) in two separate checkouts. The decline card fails synchronously — Stripe's own payment form shows "Your card has insufficient funds" immediately, before anything else happens — but that's Stripe telling the browser the card was declined, not our backend. Don't try a working card on that same order afterward — the form is replaced by a "Start a new order" button precisely because the order is already dead server-side at that point (see the note near the top of this guide).
>
> A separate consumer service is what actually applies the status: it maps `succeeded` → the order becomes Paid, `failed` → the order becomes Cancelled, inside a database transaction. Every order starts out Pending the moment it's created — before payment is even attempted — matching the brief's required "Pending Payment" → "Payment Successful"/"Payment Failed" lifecycle exactly. Payment status (Pending/Completed/Failed/Refunded) is tracked separately from order status, so a payment's history survives even after a later refund.
>
> Racing to open Prisma Studio or the admin panel *after* placing an order is basically impossible — the whole thing settles in a couple of seconds. Open the watch loop below **first**, leave it running, then place the order in another window — you'll watch it flip from `PENDING` to `PAID`/`CANCELLED` live, no timing needed:
> ```
> watch -n 1 'docker exec i-love-shopping-postgres-1 psql -U villi -d villi -c "SELECT id, status, \"updatedAt\" FROM \"Order\" ORDER BY \"createdAt\" DESC LIMIT 1;"'
> ```
> (No `watch` command on your machine, e.g. plain macOS? Just rerun the `docker exec ...` line inside the quotes by hand every second or two instead.)
>
> Automated: `'applies PENDING -> PAID / CANCELLED via a signed Stripe webhook, asynchronously through the queue'`, `backend/test/commerce.e2e-spec.ts:358`.

---

**The payment system publishes status updates to a message queue.**

Once the webhook records the payment, it publishes a message onto a
durable RabbitMQ queue (`payment.status.updates`) — matching the brief's
own diagram (Payment Service → Message Queue → Order Service) directly:
the webhook handler is the "Payment Service" side and never touches the
order's status itself.

> A healthy consumer drains the queue within milliseconds, so an empty `rabbitmqctl list_queues` on its own doesn't prove a publish happened — watch it happen live instead:
> ```
> docker compose logs -f api | grep -i "Published payment status"
> ```
> Leave that running, complete a checkout in the browser, and a `Published payment status update for order <id> (status=succeeded)` line appears the moment the webhook fires. The management UI's live "Message rates" graph (`http://localhost:15672`, guest/guest, on the queue's detail page) shows the same spike visually.
>
> `docker exec -it i-love-shopping-rabbitmq-1 rabbitmqctl list_queues` is still worth running once, just to confirm the queue itself exists and is durable (survives a RabbitMQ restart).

---

**The notification system sends appropriate emails for both successful and failed payment scenarios.**

Both of these happen together, driven by the same queue message:

- On success — a confirmation email goes out. Stock was already reserved (decremented) when the order was placed, so nothing further happens to inventory.
- On failure — stock is put back for every item, and a "Payment Failed" email goes out that explicitly says the items have been released back into stock.

> Force a declined payment with `4000 0000 0000 9995`, then check Mailhog for the failure email and confirm the product's stock count in Prisma Studio is back to where it started. Leave it there — don't retry with a working card on that same order; place a new one instead if you want to also demo the success path.

---

**The payment system responds to specific failure scenarios. System must handle: insufficient funds error, invalid card number error, expired card error, and payment gateway timeout**

Each scenario maps to a specific message shown to the customer:

| Scenario | Stripe test card | Message |
|---|---|---|
| Insufficient funds | `4000 0000 0000 9995` | "Insufficient funds" |
| Invalid card number | `4242 4242 4242 4241` (bad checksum) | "Invalid card number" |
| Expired card | `4000 0000 0000 0069` | "Card expired" |
| Gateway timeout | — (see below) | "Payment gateway timeout: Stripe did not respond in time." |

Every Stripe call is wrapped with a 10-second timeout, so a hung or
unreachable gateway surfaces that exact message instead of just leaving the
checkout request hanging forever.

> Run each test card above through a real checkout and confirm the matching message shows up — either right away in the payment form, or via the "Payment Failed" email for anything that settles asynchronously through the webhook.

---

**The inventory system prevents overselling during concurrent payments. Multiple simultaneous payments for the same product should not result in overselling inventory**

Stock is decremented at order-creation time, inside a database transaction,
using an atomic "decrement by N" update rather than reading the count and
writing it back — so two checkouts racing for the last unit both issue an
atomic decrement, and Postgres serializes them at the row level. On top of
that, an explicit check rejects the whole transaction outright if stock
would ever go negative, so a negative-stock row is never even briefly
visible.

> This script sets a real product's stock to 1, adds it to two separate guest carts, and fires both checkouts at the same instant — copy-paste the whole thing, nothing to fill in:
> ```
> PRODUCT_ID=$(curl -s "http://localhost:8080/api/v1/products?limit=1" | jq -r '.data[0].id')
> DELIVERY_ID=$(curl -s "http://localhost:8080/api/v1/delivery-options" | jq -r '.[0].id')
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c "UPDATE \"Product\" SET \"stockQuantity\" = 1 WHERE id = '$PRODUCT_ID';"
>
> ADDR='"shippingAddress":{"street":"Testikatu 1","city":"Helsinki","postalCode":"00100","country":"Finland","phone":"+358401234567"}'
>
> curl -s -X POST http://localhost:8080/api/v1/cart/items -H "Content-Type: application/json" -H "x-guest-cart-id: reviewer-buyer-1" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
> curl -s -X POST http://localhost:8080/api/v1/cart/items -H "Content-Type: application/json" -H "x-guest-cart-id: reviewer-buyer-2" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
>
> curl -s -o buyer1.json -w "buyer1: %{http_code}\n" -X POST http://localhost:8080/api/v1/checkout -H "Content-Type: application/json" -H "x-guest-cart-id: reviewer-buyer-1" -d "{\"paymentMethodId\":\"card\",\"deliveryOptionId\":\"$DELIVERY_ID\",\"email\":\"buyer1@example.com\",$ADDR}" &
> curl -s -o buyer2.json -w "buyer2: %{http_code}\n" -X POST http://localhost:8080/api/v1/checkout -H "Content-Type: application/json" -H "x-guest-cart-id: reviewer-buyer-2" -d "{\"paymentMethodId\":\"card\",\"deliveryOptionId\":\"$DELIVERY_ID\",\"email\":\"buyer2@example.com\",$ADDR}" &
> wait
>
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c "SELECT \"stockQuantity\" FROM \"Product\" WHERE id = '$PRODUCT_ID';"
> ```
> One of `buyer1`/`buyer2` should print `201`, the other `400` (check `buyer1.json`/`buyer2.json` for the "oversold" message), and the final `stockQuantity` should be `0`, never negative.

---

**The order filtering system allows users to sort by date and order status.**

Order filtering accepts a status, a date range, and a sort field/direction
— and the sort field is restricted to an explicit allow-list
(`createdAt`/`status`, ascending/descending), so an unexpected value comes
back as a clean 400 instead of a silent no-op or a crash.

> On `/account/orders`, use the status filter and the sort-by-date control together and confirm the list updates. Then try `GET /api/v1/orders?sortBy=totalAmount` directly (a field that isn't allowed) and confirm you get a 400, not a 500 or a filter that's just ignored.

---

**The order details page displays full order information including status updates.**

The order details page shows the item list, current status, delivery
option, timestamps, shipping address, and payment status — with the
address shown as a readable, formatted block rather than a raw JSON dump.

> Open any past order at `/orders/:id` — item list, status badge, shipping address, and payment status are all there and legible.

---

**The order cancellation system allows cancellations for unprocessed orders.**

Cancellation is only allowed while an order is Pending or Paid — a shipped
or delivered order gets rejected with an explicit "it may have already
shipped" message, and cancelling twice gets rejected too. If the order had
already been charged, a real Stripe refund goes out before anything changes
in the database, so a cancellation never gets recorded while the customer's
money is still actually held.

> Cancel a Pending order from `/account/orders` — works instantly. Then flip an order to Shipped from the admin panel and try to cancel it — rejected.

---

**The inventory system updates stock levels when orders are placed or cancelled.**

Stock is reserved (decremented) the moment an order is placed, and restored
(incremented) in the same transaction that marks a cancelled order as
cancelled — so stock can never end up out of sync with the order's actual
state.

> Note a product's stock count, place an order for it (stock drops), then cancel that order (stock returns to the original number) — check it in Prisma Studio or the admin product panel.

---

**All sensitive data stored in database is encrypted at rest for order and payment data. Check encryption implementation for: order details, shipping addresses, and payment transaction records**

Shipping addresses, guest emails, and Stripe transaction IDs are all
encrypted with AES-256-GCM before they're written to the database — the
same approach used for user PII elsewhere in the app. Each encrypted value
uses a random IV, so two orders shipped to the identical address never
produce matching ciphertext, meaning nothing leaks even by comparing rows.
Decryption happens in exactly one place, right before an order is handed
back to a caller — never inside a raw query result passed further up the
stack.

> Look at the raw rows directly:
> ```
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c 'SELECT "shippingAddress", "guestEmail" FROM "Order" LIMIT 3;'
> docker exec -it i-love-shopping-postgres-1 psql -U villi -d villi -c 'SELECT "transactionId" FROM "Payment" LIMIT 3;'
> ```
> Every value should come back as an unreadable blob, never plaintext JSON or a real Stripe id starting with `pi_`.

---

**Student can explain their approach to testing cart functionality, checkout flows, and payment integration.**

Verbal item — see [`docs/Verbal.md`](Verbal.md).

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
