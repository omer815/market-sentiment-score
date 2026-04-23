import { getQuote } from '../tradingview.js';
import { nowIso } from '../slot.js';
import type { FetchResult, VixPayload } from '../types.js';

const SYMBOL = 'CBOE:VIX';

export async function fetchVix(): Promise<FetchResult<VixPayload>> {
  const fetched_at = nowIso();
  try {
    const lp = await getQuote(SYMBOL);
    return { status: 'ok', value: { raw: lp }, fetched_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `VIX: ${msg}` };
  }
}
