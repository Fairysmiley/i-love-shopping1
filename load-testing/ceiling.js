import http from 'k6/http';
import { check } from 'k6';

// Supplementary ceiling-finding run (task3 objectives: max concurrent users
// before p95 > 5s, and the load that pushes CPU/memory past 90%). scenario.js
// mixes 5 realistic flows at moderate concurrency (≤69 VUs) and stays
// comfortably under capacity throughout — it doesn't find a breaking point.
// This script ramps a single read-heavy endpoint (catalog browse, the
// highest-traffic real page) much higher to locate where the system
// actually degrades.
const BASE_URL = __ENV.BASE_URL || 'https://localhost:3001/api/v1';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    ceiling: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '20s', target: 200 },
        { duration: '20s', target: 300 },
        { duration: '20s', target: 400 },
        { duration: '20s', target: 0 },
      ],
    },
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/products?sort=relevance&page=1`, { tags: { name: 'ceiling_browse' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
