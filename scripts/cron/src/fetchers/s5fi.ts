import { getQuote } from '../tradingview.js';
import { nowIso } from '../slot.js';
import type { FetchResult, S5fiPayload } from '../types.js';

// S&P 500 Percent of Stocks Above 50-Day Moving Average.
// TradingView carries this index under `INDEX:S5FI` (aliased from S&P Global).
const SYMBOL = 'INDEX:S5FI';

export async function fetchS5fi(): Promise<FetchResult<S5fiPayload>> {
  const fetched_at = nowIso();
  try {
    const lp = await getQuote(SYMBOL);
    const clamped = Math.max(0, Math.min(100, lp));
    return { status: 'ok', value: { raw: clamped }, fetched_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `S5FI: ${msg}` };
  }
}
