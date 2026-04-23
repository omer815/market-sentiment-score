import { nowIso } from '../lib/time.js';
import { FetchFailure } from '../lib/errors.js';
import type { FetchResult, Sp500DailyPayload } from './types.js';

const URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=10d';

export async function fetchSp500Daily(): Promise<FetchResult<Sp500DailyPayload>> {
  const fetched_at = nowIso();
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (market-sentiment-dashboard)' },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        status: res.status === 429 ? 'rate-limited' : 'fetch-failed',
        fetched_at,
        error: `S&P 500 daily HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }
    const json = (await res.json()) as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];

    return parseDaily(timestamps, closes, fetched_at);
  } catch (err) {
    if (err instanceof FetchFailure) {
      return { status: err.status, fetched_at, error: `S&P 500 daily: ${err.message}` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `S&P 500 daily: ${msg}` };
  }
}

/** Exposed for unit tests. */
export function parseDaily(
  timestamps: number[],
  closes: Array<number | null>,
  fetched_at: string,
): FetchResult<Sp500DailyPayload> {
  const completed: Array<{ ts: number; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const c = closes[i];
    if (typeof ts !== 'number' || typeof c !== 'number' || !Number.isFinite(c)) continue;
    completed.push({ ts, close: c });
  }

  // Yahoo may include the current "live" bar for today — strip any bar
  // whose timestamp is within the last 12 hours (treat as incomplete).
  const cutoff = Date.now() / 1000 - 12 * 60 * 60;
  const completedOnly = completed.filter((b) => b.ts < cutoff);

  if (completedOnly.length < 2) {
    return {
      status: 'fetch-failed',
      fetched_at,
      error: `S&P 500 daily: not enough completed bars (${completedOnly.length})`,
    };
  }

  const closesSeq = completedOnly.map((b) => b.close);
  const latestTs = completedOnly[completedOnly.length - 1]!.ts;
  const latestDate = new Date(latestTs * 1000).toISOString().slice(0, 10);

  return {
    status: 'ok',
    value: { closes: closesSeq, latestDate },
    fetched_at,
  };
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}
