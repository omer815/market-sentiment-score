// All Phase-1 data sources over plain HTTP/JSON. No WebSocket, no extra deps.
// Yahoo + CNN both require a browser-shaped User-Agent (bot/empty UAs get
// 403/418/429). Node's fetch handles gzip/br decompression automatically.

// CNN returns HTTP 418 for bot-ish UAs and 200 only for a realistic browser UA
// (verified 2026-06-11).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const COMMON_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Per-request timeout. The Vercel function caps at 10s; an 8s per-source budget
// lets a slow/hanging source fail fast so the other signals still produce a
// (partial) score instead of the whole response timing out.
const FETCH_TIMEOUT_MS = 8000;

// ---- Yahoo Finance chart endpoint ----
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export interface YahooChart {
  regularMarketPrice: number | null;
  bars: Array<{ ts: number; close: number }>;
}

// Pure. Throws if the payload has no result row.
export function parseYahooChart(json: unknown): YahooChart {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        meta?: { regularMarketPrice?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }
    | undefined;
  if (!result) throw new Error('Yahoo: empty chart result');

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars: Array<{ ts: number; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (typeof ts === 'number' && typeof close === 'number' && Number.isFinite(close)) {
      bars.push({ ts, close });
    }
  }
  const rmp = result.meta?.regularMarketPrice;
  return {
    regularMarketPrice: typeof rmp === 'number' && Number.isFinite(rmp) ? rmp : null,
    bars,
  };
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  fetchImpl: typeof fetch,
): Promise<YahooChart> {
  // The caret in ^VIX / ^GSPC must be URL-encoded in the path.
  const url = `${YAHOO_CHART}${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetchImpl(url, {
    headers: COMMON_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Yahoo ${symbol} HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return parseYahooChart(await res.json());
}

export async function fetchVix(fetchImpl: typeof fetch = fetch): Promise<{ raw: number }> {
  const chart = await fetchYahooChart('^VIX', '5d', fetchImpl);
  const raw = chart.regularMarketPrice ?? chart.bars.at(-1)?.close;
  if (typeof raw !== 'number') throw new Error('VIX: no usable price from Yahoo');
  return { raw };
}

export interface Sp500Daily {
  closes: number[];
}

export async function fetchSp500Daily(fetchImpl: typeof fetch = fetch): Promise<Sp500Daily> {
  const chart = await fetchYahooChart('^GSPC', '1mo', fetchImpl);
  return parseDaily(chart.bars);
}

// Pure. Drops any bar within the last 12h (today's unfinished candle).
export function parseDaily(
  bars: Array<{ ts: number; close: number }>,
  nowMs: number = Date.now(),
): Sp500Daily {
  const cutoff = nowMs / 1000 - 12 * 60 * 60;
  const completed = bars
    .filter((b) => Number.isFinite(b.close) && b.ts < cutoff)
    .sort((a, b) => a.ts - b.ts);
  if (completed.length < 2) {
    throw new Error(`S&P 500 daily: not enough completed bars (${completed.length})`);
  }
  return { closes: completed.map((b) => b.close) };
}

// ---- CNN Fear & Greed (direct) ----
const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export type CnnParse = { ok: true; raw: number } | { ok: false; error: string };

export async function fetchCnnFearAndGreed(fetchImpl: typeof fetch = fetch): Promise<CnnParse> {
  try {
    const res = await fetchImpl(CNN_URL, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `CNN F&G HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    return parseCnn(await res.json());
  } catch (err) {
    return { ok: false, error: `CNN F&G: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Pure.
export function parseCnn(json: unknown): CnnParse {
  const score = (json as { fear_and_greed?: { score?: number } })?.fear_and_greed?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { ok: false, error: 'CNN F&G: no usable score in response' };
  }
  return { ok: true, raw: score };
}
