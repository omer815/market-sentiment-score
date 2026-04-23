import { getCandles } from '../tradingview.js';
import { nowIso } from '../slot.js';
import type { FetchResult, Sp500DailyPayload } from '../types.js';

// S&P 500 index (spot). Use CBOE:SPX — the cash index, not the futures.
const SYMBOL = 'CBOE:SPX';
const BARS = 10; // last ~10 daily bars so we can take the completed ones

export async function fetchSp500Daily(): Promise<FetchResult<Sp500DailyPayload>> {
  const fetched_at = nowIso();
  try {
    const candles = await getCandles(SYMBOL, 'D', BARS);
    return parseDaily(candles.map((c) => ({ ts: c.time, close: c.close })), fetched_at);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `S&P 500 daily: ${msg}` };
  }
}

/** Exposed for unit tests. */
export function parseDaily(
  bars: Array<{ ts: number; close: number }>,
  fetched_at: string,
): FetchResult<Sp500DailyPayload> {
  // Strip any bar whose timestamp is within the last 12 hours (incomplete).
  const cutoff = Date.now() / 1000 - 12 * 60 * 60;
  const completed = bars
    .filter((b) => Number.isFinite(b.close) && b.ts < cutoff)
    .sort((a, b) => a.ts - b.ts);

  if (completed.length < 2) {
    return {
      status: 'fetch-failed',
      fetched_at,
      error: `S&P 500 daily: not enough completed bars (${completed.length})`,
    };
  }

  const closes = completed.map((b) => b.close);
  const latestTs = completed[completed.length - 1]!.ts;
  const latestDate = new Date(latestTs * 1000).toISOString().slice(0, 10);

  return { status: 'ok', value: { closes, latestDate }, fetched_at };
}
