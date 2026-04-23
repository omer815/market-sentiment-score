import { getQuote } from '../tradingview.js';
import type { S5fiQuote } from '../types.js';

// S&P 500 Percent of Stocks Above 50-Day Moving Average.
// TradingView carries this under `INDEX:S5FI`.
const SYMBOL = 'INDEX:S5FI';

export async function fetchS5fi(): Promise<S5fiQuote> {
  const fetched_at = new Date().toISOString();
  const raw = await getQuote(SYMBOL);
  const clamped = Math.max(0, Math.min(100, raw));
  return { raw: clamped, fetched_at };
}
