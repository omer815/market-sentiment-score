import { nowIso } from '../lib/time.js';
import { FetchFailure } from '../lib/errors.js';
import type { FetchResult, VixPayload } from './types.js';

const URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=30m&range=1d';

export async function fetchVix(): Promise<FetchResult<VixPayload>> {
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
        error: `VIX HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }
    const json = (await res.json()) as YahooChartResponse;
    const meta = json?.chart?.result?.[0]?.meta;
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const lastClose = findLastNumber(closes);
    const value = lastClose ?? meta?.regularMarketPrice;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new FetchFailure('parse-failed', 'VIX: no usable numeric value in response');
    }
    return { status: 'ok', value: { raw: value }, fetched_at };
  } catch (err) {
    return toFailure(err, fetched_at, 'VIX');
  }
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
}

function findLastNumber(xs: Array<number | null>): number | undefined {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function toFailure(err: unknown, fetched_at: string, label: string): FetchResult<never> {
  if (err instanceof FetchFailure) {
    return { status: err.status, fetched_at, error: `${label}: ${err.message}` };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { status: 'fetch-failed', fetched_at, error: `${label}: ${msg}` };
}
