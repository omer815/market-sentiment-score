export interface Env {
  DB: D1Database;
  /** Shared secret required on POST /api/cron/ingest. Set via `wrangler secret put CRON_SECRET`. */
  CRON_SECRET?: string;
  VIX_THRESHOLD?: string;
  FG_THRESHOLD?: string;
  S5FI_THRESHOLD?: string;
  SP500_RED_DAYS_MIN?: string;
}
