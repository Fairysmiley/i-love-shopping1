# Load Test Report

**Requirement:** Load test report identifies maximum concurrent users before response times exceed 5 seconds, shows transaction throughput, and identifies potential bottlenecks with proposed solutions. (Task 3)

> This report reflects a real, reproducible run — not projected numbers. Tool: **k6** (`load-testing/scenario.js` + `load-testing/ceiling.js`), run via `docker run grafana/k6` against the actual `docker compose` stack on this machine (4 CPU cores, 7.75GB RAM). Raw console + JSON summary output is in `/tmp` during the session that produced this report; the commands to reproduce are below.

## 1. Methodology

### Scenarios (5, exceeding the "at least 3" requirement)
`load-testing/scenario.js` runs five k6 `scenarios` concurrently, each mimicking a real user flow named in the spec:

| Scenario | Flow | Peak VUs |
|---|---|---|
| `browsing` | Catalog browse → product detail → reviews | 15 |
| `searching` | Search suggestions → filtered/sorted search → facets | 12 |
| `cart_shopping` | Guest cart add → update quantity → get → remove | 12 |
| `registration_login` | Register a new account → log in | 10 |
| `checkout` | Guest checkout (add to cart → checkout) against a stock-bounded fixture product | 20 (deterministic: 2 iterations × 20 VUs = 40 attempts) |

Combined peak concurrency: **69 VUs**, comfortably over the "50 concurrent users" objective.

Two synthetic fixture products (`backend/prisma/seed-load-test-fixture.ts`, `npm run seed:load-test`) back the cart/checkout scenarios — every real catalog item is intentionally one-of-a-kind (`stockQuantity: 1`, pre-loved marketplace model), which isn't meaningful for a checkout scenario. The checkout fixture is seeded with a **deliberately bounded stock of 25** specifically so we can verify the anti-overselling guarantee under concurrency (see §3); the cart fixture has ample stock (100,000) since that scenario must never legitimately run out.

### Reproduce it
```bash
docker compose up -d
docker compose run --rm --no-deps e2e sh -c "npm ci && npx prisma generate && npm run seed:load-test"
docker run --rm --network host -e BASE_URL=https://localhost:3001/api/v1 \
  -v "$(pwd)/load-testing:/scripts" grafana/k6 run /scripts/scenario.js
docker run --rm --network host -e BASE_URL=https://localhost:3001/api/v1 \
  -v "$(pwd)/load-testing:/scripts" grafana/k6 run /scripts/ceiling.js
```

## 2. Results — realistic mixed traffic (`scenario.js`, 5 flows, 69 peak VUs, ~67s)

| Metric | Value |
|---|---|
| Total HTTP requests | 2,312 |
| Throughput | **34.4 req/s** |
| Iterations (full user flows) completed | 744 (11.1/s) |
| `http_req_duration` p90 | **148.6ms** |
| `http_req_duration` p95 | 218.1ms |
| `http_req_duration` max | 637.9ms |
| Checks passed | 100% (2,461 / 2,461) |
| Error rate — browsing/searching/cart/registration+login | **0.00%** each |
| Error rate — checkout (incl. expected stock rejections) | 37.5% (15/40) — see §3 |
| Error rate — checkout, *unexpected* failures only | **0.00%** (0/40) |

**90% of requests under 2 seconds — met by a wide margin** (p90 was 148.6ms, over 13x under the objective). p95/p99 never approached 5 seconds either.

### Throughput vs. the "≥10 TPS" objective
34.4 req/s of general traffic clears the 10 TPS objective comfortably. Checkout-specific throughput in this run was intentionally capped at ~0.6/s because the fixture's stock (25 units) was exhausted almost immediately — that's a load-test design choice (see §3), not a system limit. §3's concurrency result shows checkout writes complete in well under a second each; a fixture with unlimited stock would sustain a much higher checkout TPS, bounded by database transaction throughput rather than anything observed here.

## 3. Checkout concurrency — no overselling under contention

The checkout scenario ran 40 concurrent guest-checkout attempts (20 VUs × 2 iterations) against a fixture seeded with exactly 25 units of stock:

- **25 succeeded** (`201`, order created, stock atomically decremented).
- **13 were correctly rejected** with `400 "Only N in stock"` (the upfront per-request check).
- **2 were correctly rejected** with `400 "Race condition detected: Oversold product..."` — the transactional guard in `checkout.service.ts` that catches the rare case where two concurrent requests both pass the upfront check before either commits, and rolls back rather than letting stock go negative.
- **0 unexpected failures.**
- Final stock: confirmed `0`, never negative.

This is a direct, empirical confirmation of the mandatory requirement *"the inventory system prevents overselling during concurrent payments"* — including a live capture of the race-condition safety net actually firing under real concurrent load, not just in a unit test.

## 4. Ceiling-finding run (`ceiling.js`) — max concurrent users before 5s responses

`scenario.js`'s mixed-traffic run stayed far under capacity throughout (p90 148ms at 69 VUs), so it doesn't answer "where does this break?" on its own. `ceiling.js` ramps a single high-traffic, read-only endpoint (`GET /products`, the catalog browse) much higher to find that point directly:

| Stage | Target VUs |
|---|---|
| 1 | 100 |
| 2 | 200 |
| 3 | 300 |
| 4 | 400 |
| 5 (ramp-down) | 0 |

**Result up to 400 concurrent users:**

| Metric | Value |
|---|---|
| Total requests | 107,394 |
| Throughput | **1,074 req/s** |
| `http_req_duration` p90 | 346.8ms |
| `http_req_duration` p95 | **388.2ms** |
| `http_req_duration` max | 2.60s |
| Errors | **0%** (107,394 / 107,394 succeeded) |

**We did not find a breaking point at up to 400 concurrent users.** p95 latency (388ms) never approached the 5-second threshold, and the error rate stayed at 0% throughout every stage, including the 400-VU peak. The true ceiling is higher than what this run reached.

### Resource utilization during the ceiling run (`docker stats`, this host: 4 CPU cores / 7.75GB RAM)

| Container | Peak CPU | Peak memory |
|---|---|---|
| `api` (NestJS) | 113% *(~28% of total 400% host capacity)* | 260.6MiB (3.5%) |
| `rabbitmq` | 124% *(~31% of total host capacity)* | 178.3MiB (2.3%) |
| `postgres` | 3.7% | 76.2MiB (1.0%) |
| `redis` | 8.5% | 15.2MiB (0.2%) |

**We did not find the load that pushes CPU or memory over 90%** on this host. Memory usage stayed under 4% everywhere, and no container used more than ~31% of the total available CPU even at 400 concurrent users / 1,074 req/s.

### Honest limitations of this ceiling result
- **The load generator shared the same 4-core host as the system under test** (single Docker Compose stack, no separate load-generation machine). The k6 process itself used up to 50% of a core at peak, meaning some of the available capacity was consumed by the tool doing the measuring, not the app. A dedicated load-generation host would let this run push further before the *generator* becomes the bottleneck.
- This host (4 cores / 7.75GB) is a fraction of realistic production capacity; these numbers describe *this environment*, not a deployment target.
- **We could not, within the scope of this test session, exhaust either 5s response times or 90% CPU/memory.** Rather than fabricate a plausible-looking breaking point, we're reporting that honestly — the next step to actually answer those two spec objectives is a longer/higher-VU run on dedicated hardware separate from the system under test (e.g., a distributed k6 run or a cloud-hosted target).

## 5. Bottleneck identification & proposed solutions

Even without finding a hard ceiling, the data points at where load would start to matter first:

### RabbitMQ CPU relative to message volume
RabbitMQ's peak CPU (113–124% of one core) was disproportionate to how few messages actually flowed through it (checkout only publishes on payment-webhook events, and this run never even simulated a real Stripe webhook). This overhead looks like it's coming from RabbitMQ's own management/stats-polling plugin rather than message throughput.
- **Proposed solution:** disable the management plugin's built-in stats polling in production (or drop its interval), and revisit whether the `management` image tag is needed outside local development — the plain `rabbitmq:3.13-alpine` image without the management UI has meaningfully lower baseline overhead.

### No connection pool tuning verified under load
Postgres CPU stayed low throughout, but Prisma's default connection pool size was not explicitly tuned or verified against `docker-compose.yml`'s `postgres` container limits.
- **Proposed solution:** before a genuinely production-scale load test, set `connection_limit`/`pool_timeout` explicitly in `DATABASE_URL` and confirm Postgres' `max_connections` comfortably covers `pool_size × api replica count`, so a future horizontal scale-out of the `api` service doesn't silently exhaust connections under load.

### Load-generator/target co-location
As noted in §4, running k6 and the app on the same host caps how far this specific test can push before conclusions become unreliable.
- **Proposed solution:** for a genuine ceiling-finding run, run k6 from a separate machine (or k6 Cloud) against a deployed instance, so 100% of the target host's CPU is available to the application under test.

## 6. Summary against the spec's stated objectives

| Objective | Result |
|---|---|
| 90% of requests under 2s | ✅ Met — p90 was 148.6ms (mixed traffic) / 346.8ms (400-VU ceiling run) |
| Supports ≥50 concurrent users without noticeable degradation | ✅ Met — 69 VUs mixed traffic at 148ms p90; 400 VUs read-heavy at 388ms p95 |
| Throughput ≥10 TPS | ✅ Met — 34.4 req/s sustained; 1,074 req/s on the read-heavy ceiling run |
| ≥98% of transactions succeed under high traffic | ✅ Met — 100% success on all real (non-business-rule) requests across both runs |
| Error rate <5% | ✅ Met, once expected business-rule rejections (out-of-stock 400s) are excluded — see §3 |
| Max concurrent users before p95 > 5s | ⚠️ **Not found** — held at 400 VUs / 1,074 req/s with p95 = 388ms; true ceiling is higher than tested here |
| Load that pushes CPU/memory > 90% | ⚠️ **Not found** — peak CPU ~31% of host capacity, peak memory ~3.5%, at 400 concurrent users |
