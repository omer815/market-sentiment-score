import { createRouter } from './router.js';

const app = createRouter();

// MVP trigger is on-demand via POST /api/snapshots/refresh (FR-018).
// US2 re-lands the scheduled handler with an automatic 30-min cadence.
export default {
  fetch: app.fetch,
};
