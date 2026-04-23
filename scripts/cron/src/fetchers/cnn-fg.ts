import { nowIso } from '../slot.js';
import type { CnnFgPayload, FetchResult } from '../types.js';

// CNN's own dataviz JSON. TradingView does not carry the CNN Fear & Greed
// composite, so this endpoint remains the source of truth.
const URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export async function fetchCnnFearAndGreed(): Promise<FetchResult<CnnFgPayload>> {
  const fetched_at = nowIso();
  try {
    const res = await fetch(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (market-sentiment-dashboard)',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        status: res.status === 429 ? 'rate-limited' : 'fetch-failed',
        fetched_at,
        error: `CNN F&G HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }
    const json = (await res.json()) as CnnFgResponse;
    const score = json?.fear_and_greed?.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return {
        status: 'parse-failed',
        fetched_at,
        error: 'CNN F&G: no usable score in response',
      };
    }
    return { status: 'ok', value: { raw: score }, fetched_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `CNN F&G: ${msg}` };
  }
}

interface CnnFgResponse {
  fear_and_greed?: {
    score?: number;
    rating?: string;
    timestamp?: string;
    previous_close?: number;
  };
}
