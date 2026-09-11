# Performance & Load Testing Report

This report outlines the procedures for executing the k6 load testing suite against the Villi Commerce API, finding critical performance boundaries, and provides a CDN strategy for serving static assets.

## 1. Running the Load Test Suite

The critical user flow (Browsing the catalog, viewing a product, and adding it to the cart) is modeled in the `load-testing/scenario.js` script.

### Prerequisites
*   Ensure the local environment is running via Docker Compose (`docker compose up -d`).
*   Install [k6](https://k6.io/docs/get-started/installation/) on your machine.

### Execution
Run the baseline scenario with the following command:

```bash
k6 run load-testing/scenario.js
```

You can optionally override the target API URL:
```bash
BASE_URL="http://your-production-url.com/api" k6 run load-testing/scenario.js
```

---

## 2. Testing Objectives & Metrics

Use the k6 script to iteratively answer the following questions. You can manipulate the `options.stages` directly in `load-testing/scenario.js` or via CLI flags (e.g., `k6 run --vus 200 --duration 1m load-testing/scenario.js`) to stress the system.

### A. Expected Throughput (TPS)
**Goal:** Determine the maximum steady-state Transactions Per Second (TPS).
*   **Procedure:** Run the test with a high but stable number of VUs (e.g., 50-100). Look at the `http_reqs` metric in the final k6 output.
*   **Metric to Record:** `http_reqs` (rate/s).
*   **Result:** **34.4 req/s** sustained across 5 mixed realistic flows at 69 peak VUs; **548.6 req/s** on a read-heavy (catalog browse) run ramped up to 3,000 VUs (an earlier, lower-VU version of that run measured 1,074 req/s at its 400-VU peak, before it was extended to actually find the ceiling in §B below). Full breakdown in [`docs/load_test_report.md`](./load_test_report.md).

### B. Concurrent User Limit (< 5s Response Time)
**Goal:** Find the exact number of concurrent Virtual Users (VUs) before the `http_req_duration` (p95) exceeds 5.0 seconds.
*   **Procedure:** Slowly ramp up the VUs (e.g., 100, 200, 500, 1000). Monitor the `http_req_duration` output.
*   **Metric to Record:** VUs at which `http_req_duration` `p(95) > 5000ms`.
*   **Result:** **Found at ~1,600 concurrent VUs** — that's where connection-level failures (`dial: i/o timeout`) begin and escalate, with individual response times reaching 6.16s. See `load-testing/ceiling.js` and §4 of `docs/load_test_report.md` for the full run and why the run's *aggregate* p95 (1.58s) doesn't show this ceiling on its own.

### C. Resource Exhaustion (90% CPU/Memory)
**Goal:** Determine the load required to push the API or Database containers beyond 90% CPU or Memory utilization.
*   **Procedure:** 
    1. Open a separate terminal and run `docker stats` to monitor container resources.
    2. Execute aggressive ramp-up stages in k6.
    3. Note the exact VU count and Request Rate when `i-love-shopping-api-1` or `i-love-shopping-postgres-1` crosses the 90% threshold.
*   **Metric to Record:** Target VUs and RPS causing >90% usage.
*   **Result:** **Not reached at up to 400 concurrent VUs** (the only run resource utilization was captured for) — peak CPU was ~113% (`api`) and ~124% (`rabbitmq`) out of 400% total host capacity (4 cores), i.e. under 31% of the host either way; peak memory usage stayed under 4% for every container. This predates the higher-concurrency (3,000-VU) run that found the ~1,600-VU connection ceiling above, so it doesn't rule out resource exhaustion at that higher concurrency — just that it wasn't the *first* thing to break. See §4–5 of `docs/load_test_report.md` for the resource table and bottleneck analysis (RabbitMQ's management-plugin overhead was the most notable finding, disproportionate to actual message volume).

---

## 3. CDN Strategy for Static Product Images

To significantly reduce the load on the backend application and optimize frontend delivery globally, we propose the following Content Delivery Network (CDN) strategy for static product images.

### Architecture
1.  **Object Storage (Origin):** Store all raw product images in a dedicated object storage bucket (e.g., AWS S3, Google Cloud Storage, or Cloudflare R2).
2.  **CDN Edge Network:** Place a CDN (e.g., Cloudflare, AWS CloudFront, Fastly) in front of the object storage bucket. 
3.  **Database References:** Update the `ProductImage.url` in the PostgreSQL database to point to the CDN endpoint (e.g., `https://cdn.villi-store.com/products/image-123.webp`) rather than serving them directly from the NestJS backend.

### Key Optimizations
*   **Image Transformation at the Edge:** Utilize CDN image optimization services (like Cloudflare Image Resizing or CloudFront Functions) to automatically serve modern formats (WebP/AVIF), compress images dynamically, and resize them based on the client's device viewport (e.g., generating 300px thumbnails for the `ProductCard` and 1200px hero images for the `ProductPage`).
*   **Aggressive Caching (`Cache-Control`):** Product images are immutable. Apply strict cache headers (`Cache-Control: public, max-age=31536000, immutable`). When an image needs to be updated, append a cache-busting query parameter or generate a new filename hash.
*   **Lazy Loading:** Ensure the React frontend continues to use `loading="lazy"` (already implemented in `ProductCard`) so the CDN is only hit when images enter the viewport, saving user bandwidth and egress costs.
