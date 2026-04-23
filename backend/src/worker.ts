import { createRouter } from './router.js';

const app = createRouter();

// The 30-minute cron now runs as a GitHub Actions workflow that POSTs a
// computed snapshot to /api/cron/ingest. The Worker's own `scheduled`
// handler is therefore intentionally not exported — see specs/*/HANDOFF.md
// §Architecture for the rationale (TradingView npm package needs Node).
export default {
  fetch: app.fetch,
};
