import { nowIso } from '../lib/time.js';
import type { FetchResult } from './types.js';

const URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=30m&range=5d&includePrePost=false';

export interface Sp500Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Sp500IntradayPayload {
  candles: Sp500Candle[];
}

export async function fetchSp500Intraday(): Promise<FetchResult<Sp500IntradayPayload>> {
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
        error: `S&P 500 intraday HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }
    const json = (await res.json()) as YahooChartResponse;
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0];
    const opens = q?.open ?? [];
    const highs = q?.high ?? [];
    const lows = q?.low ?? [];
    const closes = q?.close ?? [];

    const candles: Sp500Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const o = opens[i];
      const h = highs[i];
      const l = lows[i];
      const c = closes[i];
      if (
        typeof ts !== 'number' ||
        typeof o !== 'number' ||
        typeof h !== 'number' ||
        typeof l !== 'number' ||
        typeof c !== 'number'
      ) {
        continue;
      }
      candles.push({ ts, open: o, high: h, low: l, close: c });
    }

    return { status: 'ok', value: { candles }, fetched_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `S&P 500 intraday: ${msg}` };
  }
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}
