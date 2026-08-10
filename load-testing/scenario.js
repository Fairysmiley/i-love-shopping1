import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';
import { randomIntBetween, randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Tracks checkout failures that are NOT the expected "out of stock" rejection
// (the fixture has deliberately bounded stock — see seed-load-test-fixture.ts
// — so once it sells out, further 400s are correct application behavior, not
// load-test failures). k6 tags are fixed at request time, so this can't be
// derived after the fact from http_req_failed{...} — it needs its own metric.
const checkoutUnexpectedErrorRate = new Rate('checkout_unexpected_error_rate');

// Villi load test — task3 requires "at least 3" scenarios that mimic real
// user behavior. This file implements 5, matching the spec's own examples:
// browsing catalogs, searching, adding to cart, completing checkout, and
// registration/login. Each runs as its own k6 `scenario` so they execute
// concurrently (as real traffic would mix), and each is reported separately
// in the summary.
const BASE_URL = __ENV.BASE_URL || 'https://localhost:3001/api/v1';
// Deliberately bounded stock (see seed-load-test-fixture.ts) — the checkout
// scenario is expected to exhaust it and get correctly-rejected 400s after.
const CHECKOUT_FIXTURE_SLUG = __ENV.CHECKOUT_FIXTURE_SLUG || 'load-test-fixture-item';
// Ample stock, separate from the checkout fixture — the cart scenario runs
// for the whole test duration and must never legitimately run out.
const CART_FIXTURE_SLUG = __ENV.CART_FIXTURE_SLUG || 'load-test-cart-fixture-item';

export const options = {
  insecureSkipTLSVerify: true, // self-signed cert (see certs/)
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      exec: 'browsing',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 15 },
        { duration: '40s', target: 15 },
        { duration: '10s', target: 0 },
      ],
    },
    searching: {
      executor: 'ramping-vus',
      exec: 'searching',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 12 },
        { duration: '40s', target: 12 },
        { duration: '10s', target: 0 },
      ],
    },
    cart_shopping: {
      executor: 'ramping-vus',
      exec: 'cartShopping',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 12 },
        { duration: '40s', target: 12 },
        { duration: '10s', target: 0 },
      ],
    },
    registration_login: {
      executor: 'ramping-vus',
      exec: 'registrationLogin',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '40s', target: 10 },
        { duration: '10s', target: 0 },
      ],
    },
    // Deterministic iteration count (rather than ramping VUs) so we can
    // compare "checkout attempts" against the fixture's known stock and
    // confirm the inventory system never oversells it under concurrency.
    checkout: {
      executor: 'per-vu-iterations',
      exec: 'checkout',
      vus: 20,
      iterations: 2,
      startTime: '10s',
      maxDuration: '55s',
    },
  },
  thresholds: {
    // "90% of user requests are processed within 2 seconds" (task3 objective).
    http_req_duration: ['p(90)<2000'],
    // "Error rate of less than 5% during load tests" — scoped per scenario
    // (built-in `scenario` tag) since checkout's expected stock-exhaustion
    // 400s would otherwise skew a single blanket http_req_failed threshold.
    'http_req_failed{scenario:browsing}': ['rate<0.05'],
    'http_req_failed{scenario:searching}': ['rate<0.05'],
    'http_req_failed{scenario:cart_shopping}': ['rate<0.05'],
    'http_req_failed{scenario:registration_login}': ['rate<0.05'],
    checkout_unexpected_error_rate: ['rate<0.05'],
  },
};

function headers(extra, tags) {
  return { headers: { 'Content-Type': 'application/json', ...extra }, ...(tags ? { tags } : {}) };
}

export function browsing() {
  group('Browse catalog', function () {
    const page = randomIntBetween(1, 3);
    const res = http.get(`${BASE_URL}/products?sort=relevance&page=${page}`, {
      tags: { name: 'browse_catalog' },
    });
    check(res, {
      'browse: status 200': (r) => r.status === 200,
      'browse: has data array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });
    sleep(randomIntBetween(1, 3));

    let slug = null;
    try {
      const body = JSON.parse(res.body);
      if (body.data && body.data.length > 0) {
        slug = body.data[randomIntBetween(0, body.data.length - 1)].slug;
      }
    } catch {
      // ignore
    }

    if (slug) {
      const productRes = http.get(`${BASE_URL}/products/${slug}`, { tags: { name: 'view_product' } });
      check(productRes, { 'product detail: status 200': (r) => r.status === 200 });
      sleep(randomIntBetween(1, 3));

      const reviewRes = http.get(`${BASE_URL}/products/${slug}/reviews`, { tags: { name: 'view_reviews' } });
      check(reviewRes, { 'product reviews: status 200': (r) => r.status === 200 });
    }
  });
  sleep(randomIntBetween(1, 2));
}

const SEARCH_TERMS = ['jacket', 'fleece', 'backpack', 'trousers', 'wool', 'shell', 'down'];

export function searching() {
  group('Search for products', function () {
    const term = SEARCH_TERMS[randomIntBetween(0, SEARCH_TERMS.length - 1)];

    const suggestRes = http.get(`${BASE_URL}/products/suggest?q=${term.slice(0, 3)}`, {
      tags: { name: 'search_suggest' },
    });
    check(suggestRes, { 'suggest: status 200': (r) => r.status === 200 });
    sleep(randomIntBetween(1, 2));

    const searchRes = http.get(`${BASE_URL}/products?q=${term}&sort=price_asc`, {
      tags: { name: 'search_results' },
    });
    check(searchRes, {
      'search: status 200': (r) => r.status === 200,
      'search: has data array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });

    const facetsRes = http.get(`${BASE_URL}/products/facets?q=${term}`, { tags: { name: 'search_facets' } });
    check(facetsRes, { 'facets: status 200': (r) => r.status === 200 });
  });
  sleep(randomIntBetween(1, 2));
}

export function cartShopping() {
  const guestId = `k6-guest-${__VU}-${__ITER}-${Date.now()}`;
  const opts = headers({ 'x-guest-cart-id': guestId });

  group('Guest shopping cart', function () {
    // Browsing a random catalog item first, for realism (most seeded
    // products are one-of-a-kind, stockQuantity: 1 by design — fine for
    // viewing, but not for exercising quantity updates).
    http.get(`${BASE_URL}/products?limit=10`, opts);

    // Cart add/update/remove use the ample-stock cart fixture (distinct from
    // the checkout scenario's deliberately-bounded fixture — see
    // seed-load-test-fixture.ts) so this scenario never legitimately runs
    // out of stock over the test's full duration.
    const fixtureRes = http.get(`${BASE_URL}/products/${CART_FIXTURE_SLUG}`, opts);
    let productId = null;
    try {
      productId = JSON.parse(fixtureRes.body).id;
    } catch {
      // ignore
    }
    if (!productId) return;

    const addRes = http.post(`${BASE_URL}/cart/items`, JSON.stringify({ productId, quantity: 1 }), {
      ...opts,
      tags: { name: 'cart_add' },
    });
    check(addRes, { 'cart add: status 200/201': (r) => r.status === 200 || r.status === 201 });
    sleep(randomIntBetween(1, 2));

    const updateRes = http.patch(`${BASE_URL}/cart/items/${productId}`, JSON.stringify({ quantity: 2 }), {
      ...opts,
      tags: { name: 'cart_update' },
    });
    check(updateRes, { 'cart update: status 200': (r) => r.status === 200 });
    sleep(randomIntBetween(1, 2));

    const getRes = http.get(`${BASE_URL}/cart`, { ...opts, tags: { name: 'cart_get' } });
    check(getRes, { 'cart get: status 200': (r) => r.status === 200 });

    const removeRes = http.del(`${BASE_URL}/cart/items/${productId}`, null, {
      ...opts,
      tags: { name: 'cart_remove' },
    });
    check(removeRes, { 'cart remove: status 200': (r) => r.status === 200 });
  });
  sleep(randomIntBetween(1, 2));
}

export function registrationLogin() {
  const unique = `k6-${__VU}-${__ITER}-${Date.now()}-${randomString(5)}`;
  const email = `${unique}@loadtest.example.com`;
  const password = 'LoadTest!Passw0rd1';

  group('Register and log in', function () {
    const regRes = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password, firstName: 'Load', lastName: 'Test' }),
      { ...headers({}), tags: { name: 'register' } },
    );
    check(regRes, { 'register: status 201': (r) => r.status === 201 });
    sleep(randomIntBetween(1, 2));

    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
      ...headers({}),
      tags: { name: 'login' },
    });
    check(loginRes, {
      'login: status 200': (r) => r.status === 200,
      'login: got access token': (r) => {
        try {
          return typeof JSON.parse(r.body).accessToken === 'string';
        } catch {
          return false;
        }
      },
    });
  });
  sleep(randomIntBetween(1, 2));
}

export function checkout() {
  const guestId = `k6-checkout-${__VU}-${__ITER}-${Date.now()}`;
  const opts = headers({ 'x-guest-cart-id': guestId });

  group('Guest checkout (bounded-stock fixture)', function () {
    const productRes = http.get(`${BASE_URL}/products/${CHECKOUT_FIXTURE_SLUG}`, opts);
    if (productRes.status !== 200) return;
    const productId = JSON.parse(productRes.body).id;

    const deliveryRes = http.get(`${BASE_URL}/delivery-options?activeOnly=true`, opts);
    let deliveryOptionId = null;
    try {
      const options = JSON.parse(deliveryRes.body);
      deliveryOptionId = options[0] && options[0].id;
    } catch {
      // ignore
    }
    if (!deliveryOptionId) return;

    http.post(`${BASE_URL}/cart/items`, JSON.stringify({ productId, quantity: 1 }), {
      ...opts,
      tags: { name: 'checkout_cart_add' },
    });
    sleep(1);

    const checkoutRes = http.post(
      `${BASE_URL}/checkout`,
      JSON.stringify({
        paymentMethodId: 'tok_visa',
        deliveryOptionId,
        email: `${guestId}@loadtest.example.com`,
        shippingAddress: { street: '1 Load Test St', city: 'Helsinki', postalCode: '00100', country: 'Finland' },
      }),
      { ...opts, tags: { name: 'checkout_submit' } },
    );

    // A 400 "out of stock" once the fixture's bounded stock is exhausted is
    // the CORRECT behavior under concurrency (no overselling) — expected,
    // not a load-test failure. Recorded on a separate custom metric instead
    // of the built-in http_req_failed, which can't be tagged after the fact.
    const succeeded = checkoutRes.status === 201;
    // Both are the inventory system correctly refusing to oversell the
    // fixture once stock is exhausted — "Only N in stock" from the upfront
    // check, or the transactional "Race condition detected: Oversold" guard
    // that fires if two concurrent checkouts both pass the upfront check
    // before either commits. Neither is a load-test failure.
    const isExpectedStockRejection =
      checkoutRes.status === 400 && /stock|inventory|oversold|race condition/i.test(checkoutRes.body || '');
    checkoutUnexpectedErrorRate.add(!succeeded && !isExpectedStockRejection);
    if (!succeeded && !isExpectedStockRejection) {
      console.log(`UNEXPECTED checkout failure: status=${checkoutRes.status} body=${checkoutRes.body}`);
    }

    check(checkoutRes, {
      'checkout: succeeded or correctly rejected for stock': () => succeeded || isExpectedStockRejection,
    });
  });
}
