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

// The 400-VU run (docs/load_test_report.md §4) never broke 5s (p95=388ms at
// its peak), so this pushes substantially further — up to 3000 VUs — with an
// abort-on-fail threshold so the run stops itself the moment p95 actually
// crosses 5s, instead of guessing a target ahead of time.
export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    ceiling: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 400 },
        { duration: '15s', target: 800 },
        { duration: '15s', target: 1200 },
        { duration: '15s', target: 1600 },
        { duration: '15s', target: 2000 },
        { duration: '15s', target: 2500 },
        { duration: '15s', target: 3000 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: true }],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/products?sort=relevance&page=1`, { tags: { name: 'ceiling_browse' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
