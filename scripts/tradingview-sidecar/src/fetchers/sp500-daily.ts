import { getCandles } from '../tradingview.js';
import type { Sp500DailyPayload } from '../types.js';

// S&P 500 cash index (not futures).
const SYMBOL = 'CBOE:SPX';
const BARS = 10;

export async function fetchSp500Daily(): Promise<Sp500DailyPayload> {
  const fetched_at = new Date().toISOString();
  const candles = await getCandles(SYMBOL, 'D', BARS);
  return parseDaily(
    candles.map((c) => ({ ts: c.time, close: c.close })),
    fetched_at,
  );
}

/** Exposed for unit tests. */
export function parseDaily(
  bars: Array<{ ts: number; close: number }>,
  fetched_at: string,
  nowMs: number = Date.now(),
): Sp500DailyPayload {
  // Drop any bar whose timestamp is within the last 12 hours — that's
  // today's still-forming candle, not a completed close.
  const cutoff = nowMs / 1000 - 12 * 60 * 60;
  const completed = bars
    .filter((b) => Number.isFinite(b.close) && b.ts < cutoff)
    .sort((a, b) => a.ts - b.ts);

  if (completed.length < 2) {
    throw new Error(`S&P 500 daily: not enough completed bars (${completed.length})`);
  }

  const closes = completed.map((b) => b.close);
  const latestTs = completed[completed.length - 1]!.ts;
  const latest_date = new Date(latestTs * 1000).toISOString().slice(0, 10);

  return { closes, latest_date, fetched_at };
}
