/**
 * Vercel serverless function — POST /fetch.
 *
 * Fans out to the three TradingView fetchers in parallel, returns a combined
 * payload. Per-source failures are represented by omitting that key from the
 * response (HTTP 200). HTTP 502 is only returned when every fetcher failed.
 *
 * Called by the Worker's /api/snapshots/refresh orchestrator
 * (see backend/src/fetchers/sidecar.ts).
 *
 * Contract:
 *   POST /fetch  (no request body)
 *   → 200 { vix?, sp500?, s5fi?, errors?: {source, reason}[] }
 *   → 502 { error: 'upstream_failed', errors: {source, reason}[] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchVix } from '../src/fetchers/vix.js';
import { fetchS5fi } from '../src/fetchers/s5fi.js';
import { fetchSp500Daily } from '../src/fetchers/sp500-daily.js';
import type { VixQuote, S5fiQuote, Sp500DailyPayload } from '../src/types.js';

export interface SidecarFetchResponse {
  vix?: VixQuote;
  sp500?: Sp500DailyPayload;
  s5fi?: S5fiQuote;
  errors?: Array<{ source: 'vix' | 'sp500' | 's5fi'; reason: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const [vixResult, sp500Result, s5fiResult] = await Promise.allSettled([
    fetchVix(),
    fetchSp500Daily(),
    fetchS5fi(),
  ]);

  const body: SidecarFetchResponse = {};
  const errors: Array<{ source: 'vix' | 'sp500' | 's5fi'; reason: string }> = [];

  if (vixResult.status === 'fulfilled') body.vix = vixResult.value;
  else errors.push({ source: 'vix', reason: errorMessage(vixResult.reason) });

  if (sp500Result.status === 'fulfilled') body.sp500 = sp500Result.value;
  else errors.push({ source: 'sp500', reason: errorMessage(sp500Result.reason) });

  if (s5fiResult.status === 'fulfilled') body.s5fi = s5fiResult.value;
  else errors.push({ source: 's5fi', reason: errorMessage(s5fiResult.reason) });

  if (errors.length === 3) {
    res.status(502).json({ error: 'upstream_failed', errors });
    return;
  }

  if (errors.length > 0) body.errors = errors;
  res.status(200).json(body);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Exposed for integration tests. */
export { handler as _handler };
