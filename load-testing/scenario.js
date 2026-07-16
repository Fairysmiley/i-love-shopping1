import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp-up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users for 1 min
    { duration: '30s', target: 150 }, // Ramp-up to 150 users
    { duration: '1m', target: 150 },  // Stay at 150 users for 1 min
    { duration: '30s', target: 0 },   // Ramp-down to 0 users
  ],
  thresholds: {
    // 95% of requests must complete below 500ms
    http_req_duration: ['p(95)<500'],
    // Less than 1% of requests should fail
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';

export default function () {
  group('Critical User Flow: Browse, View, Add to Cart', function () {
    // 1. Browse Catalog (Faceted Search)
    const browseRes = http.get(`${BASE_URL}/products?sort=relevance&minRating=4&page=1`);
    
    check(browseRes, {
      'Browse status is 200': (r) => r.status === 200,
      'Browse returns data array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });

    sleep(randomIntBetween(1, 3)); // Simulate user thinking time

    let productSlug = '';
    let productId = '';

    try {
      const parsedBody = JSON.parse(browseRes.body);
      if (parsedBody.data && parsedBody.data.length > 0) {
        // Pick a random product from the list
        const randomIdx = randomIntBetween(0, parsedBody.data.length - 1);
        productSlug = parsedBody.data[randomIdx].slug;
        productId = parsedBody.data[randomIdx].id;
      }
    } catch (e) {
      // Ignore parsing errors for flow continuation logic
    }

    // 2. View Product Details
    if (productSlug) {
      const productRes = http.get(`${BASE_URL}/products/${productSlug}`);
      check(productRes, {
        'Product details status is 200': (r) => r.status === 200,
      });

      sleep(randomIntBetween(1, 4));

      // Fetch reviews for the product
      const reviewRes = http.get(`${BASE_URL}/products/${productSlug}/reviews`);
      check(reviewRes, {
        'Product reviews status is 200': (r) => r.status === 200,
      });

      sleep(randomIntBetween(1, 2));

      // 3. Add to Cart (Guest session)
      // Simulating the guest cart flow by adding the item to a temporary session cart.
      if (productId) {
        const payload = JSON.stringify({
          productId: productId,
          quantity: 1,
        });

        const params = {
          headers: {
            'Content-Type': 'application/json',
          },
        };

        const cartRes = http.post(`${BASE_URL}/cart/items`, payload, params);
        
        check(cartRes, {
          'Add to cart status is 200 or 201': (r) => r.status === 200 || r.status === 201,
        });
        
        sleep(randomIntBetween(1, 3));
      }
    }
  });
}
