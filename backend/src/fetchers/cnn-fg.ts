import { nowIso } from '../lib/time.js';
import type { CnnFgPayload, FetchResult } from './types.js';

// CNN's own dataviz JSON. Undocumented-but-public endpoint backing their
// own Fear & Greed page. Requires a browser-shaped User-Agent — empty /
// bot UAs are rejected with HTTP 403.
const URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export async function fetchCnnFearAndGreed(
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult<CnnFgPayload>> {
  const fetched_at = nowIso();
  try {
    const res = await fetchImpl(URL, {
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
    return parseCnn(json, fetched_at);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fetch-failed', fetched_at, error: `CNN F&G: ${msg}` };
  }
}

/** Exposed for unit tests. */
export function parseCnn(json: unknown, fetched_at: string): FetchResult<CnnFgPayload> {
  const score = (json as CnnFgResponse)?.fear_and_greed?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return {
      status: 'parse-failed',
      fetched_at,
      error: 'CNN F&G: no usable score in response',
    };
  }
  return { status: 'ok', value: { raw: score }, fetched_at };
}

export interface CnnFgResponse {
  fear_and_greed?: {
    score?: number;
    rating?: string;
    timestamp?: string;
    previous_close?: number;
  };
}
