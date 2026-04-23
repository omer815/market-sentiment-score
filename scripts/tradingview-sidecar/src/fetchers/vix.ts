import { getQuote } from '../tradingview.js';
import type { VixQuote } from '../types.js';

const SYMBOL = 'CBOE:VIX';

export async function fetchVix(): Promise<VixQuote> {
  const fetched_at = new Date().toISOString();
  const raw = await getQuote(SYMBOL);
  return { raw, fetched_at };
}
