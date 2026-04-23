import { nowIso } from '../lib/time.js';
import { FetchFailure } from '../lib/errors.js';
import type { CnnFgPayload, FetchResult } from './types.js';

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
    const value = json?.fear_and_greed?.score;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new FetchFailure('parse-failed', 'CNN F&G: no usable score in response');
    }
    return { status: 'ok', value: { raw: value }, fetched_at };
  } catch (err) {
    if (err instanceof FetchFailure) {
      return { status: err.status, fetched_at, error: `CNN F&G: ${err.message}` };
    }
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
