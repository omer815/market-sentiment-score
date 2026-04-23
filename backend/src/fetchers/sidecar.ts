/**
 * HTTP client for the TradingView sidecar (Vercel Node fn).
 *
 * Contract mirror of scripts/tradingview-sidecar/api/fetch.ts.
 * The Worker calls `POST ${TRADINGVIEW_SIDECAR_URL}/fetch` and gets back a
 * combined payload `{vix?, sp500?, s5fi?, errors?}`. Absence of a key → that
 * source failed; this module maps those absences into `FetchResult.fetch-failed`
 * so the orchestrator can treat sidecar-sourced failures identically to CNN's.
 */

import { nowIso } from '../lib/time.js';
import type {
  FetchResult,
  S5fiPayload,
  Sp500DailyPayload,
  VixPayload,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;

type SidecarVix = { raw: number; fetched_at: string };
type SidecarS5fi = { raw: number; fetched_at: string };
type SidecarSp500 = { closes: number[]; latest_date: string; fetched_at: string };

interface SidecarResponse {
  vix?: SidecarVix;
  sp500?: SidecarSp500;
  s5fi?: SidecarS5fi;
  errors?: Array<{ source: 'vix' | 'sp500' | 's5fi'; reason: string }>;
}

export interface SidecarFetchResults {
  vix: FetchResult<VixPayload>;
  sp500: FetchResult<Sp500DailyPayload>;
  s5fi: FetchResult<S5fiPayload>;
}

export async function fetchFromSidecar(
  baseUrl: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SidecarFetchResults> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetched_at = nowIso();

  const trimmed = baseUrl.replace(/\/$/, '');
  const url = `${trimmed}/fetch`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let json: SidecarResponse;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason = `sidecar HTTP ${res.status}: ${body.slice(0, 120)}`;
      return allFailed(reason, fetched_at);
    }
    json = (await res.json()) as SidecarResponse;
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error ? err.message : String(err);
    return allFailed(`sidecar unreachable: ${reason}`, fetched_at);
  }

  return parseSidecar(json, fetched_at);
}

/** Exposed for unit tests. */
export function parseSidecar(json: SidecarResponse, fetched_at: string): SidecarFetchResults {
  const errorsBySource: Record<string, string> = {};
  for (const e of json.errors ?? []) errorsBySource[e.source] = e.reason;

  return {
    vix: toVix(json.vix, errorsBySource['vix'], fetched_at),
    sp500: toSp500(json.sp500, errorsBySource['sp500'], fetched_at),
    s5fi: toS5fi(json.s5fi, errorsBySource['s5fi'], fetched_at),
  };
}

function allFailed(reason: string, fetched_at: string): SidecarFetchResults {
  return {
    vix: { status: 'fetch-failed', fetched_at, error: `VIX: ${reason}` },
    sp500: { status: 'fetch-failed', fetched_at, error: `S&P 500 daily: ${reason}` },
    s5fi: { status: 'fetch-failed', fetched_at, error: `S5FI: ${reason}` },
  };
}

function toVix(
  payload: SidecarVix | undefined,
  errorReason: string | undefined,
  fallback_fetched_at: string,
): FetchResult<VixPayload> {
  if (payload && Number.isFinite(payload.raw)) {
    return { status: 'ok', value: { raw: payload.raw }, fetched_at: payload.fetched_at };
  }
  return {
    status: 'fetch-failed',
    fetched_at: fallback_fetched_at,
    error: `VIX: ${errorReason ?? 'missing from sidecar response'}`,
  };
}

function toS5fi(
  payload: SidecarS5fi | undefined,
  errorReason: string | undefined,
  fallback_fetched_at: string,
): FetchResult<S5fiPayload> {
  if (payload && Number.isFinite(payload.raw)) {
    return { status: 'ok', value: { raw: payload.raw }, fetched_at: payload.fetched_at };
  }
  return {
    status: 'fetch-failed',
    fetched_at: fallback_fetched_at,
    error: `S5FI: ${errorReason ?? 'missing from sidecar response'}`,
  };
}

function toSp500(
  payload: SidecarSp500 | undefined,
  errorReason: string | undefined,
  fallback_fetched_at: string,
): FetchResult<Sp500DailyPayload> {
  if (payload && Array.isArray(payload.closes) && payload.closes.length >= 2) {
    return {
      status: 'ok',
      value: { closes: payload.closes, latestDate: payload.latest_date },
      fetched_at: payload.fetched_at,
    };
  }
  return {
    status: 'fetch-failed',
    fetched_at: fallback_fetched_at,
    error: `S&P 500 daily: ${errorReason ?? 'missing from sidecar response'}`,
  };
}

