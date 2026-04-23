import { nowIso } from '../lib/time.js';
import { FetchFailure } from '../lib/errors.js';
import type { FetchResult, S5fiPayload } from './types.js';

const URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ES5FI?interval=1d&range=5d';

export async function fetchS5fi(): Promise<FetchResult<S5fiPayload>> {
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
        error: `S5FI HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }
    const json = (await res.json()) as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const lastClose = findLastNumber(closes);
    const value = lastClose ?? meta?.regularMarketPrice;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new FetchFailure('parse-failed', 'S5FI: no usable numeric value in response');
    }
    // S5FI is a percentage (0..100). Clamp to that range.
    const clamped = Math.max(0, Math.min(100, value));
    return { status: 'ok', value: { raw: clamped }, fetched_at };
  } catch (err) {
    if (err instanceof FetchFailure) {
      return { status: err.status, fetched_at, error: `S5FI: ${err.message}` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `S5FI: ${msg}` };
  }
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

function findLastNumber(xs: Array<number | null>): number | undefined {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}
