export interface Env {
  DB: D1Database;
  /** URL of the TradingView sidecar (Vercel Node fn). Set via `wrangler secret put`. */
  TRADINGVIEW_SIDECAR_URL: string;
  VIX_THRESHOLD?: string;
  FG_THRESHOLD?: string;
  S5FI_THRESHOLD?: string;
  SP500_RED_DAYS_MIN?: string;
}
