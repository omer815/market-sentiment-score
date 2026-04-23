/**
 * Refresh orchestrator.
 *
 * Given an Env + request context, fetches CNN F&G directly over HTTPS and
 * VIX / S&P 500 daily / S5FI via the TradingView sidecar, evaluates the four
 * flags, computes the composite, and writes one snapshot to D1. Idempotent
 * on the clock-aligned `slot_ts` via D1 PK.
 *
 * Called from `POST /api/snapshots/refresh` (routes/refresh.ts).
 */

import type { Env } from './env.js';
import { loadConfig } from './config.js';
import { createDb } from './storage/client.js';
import { insertSnapshot, getLatestSnapshot, getReadingsForSlot } from './storage/snapshots.js';
import type { ReadingRow } from './storage/snapshots.js';
import { fetchCnnFearAndGreed } from './fetchers/cnn-fg.js';
import { fetchFromSidecar } from './fetchers/sidecar.js';
import type { SidecarFetchResults } from './fetchers/sidecar.js';
import {
  evaluateFg,
  evaluateS5fi,
  evaluateSp500,
  evaluateVix,
} from './scoring/flags.js';
import { computeComposite } from './scoring/composite.js';
import type { CompositeResult, SourceContribution } from './scoring/composite.js';
import { currentSlot } from './lib/slot.js';
import { nowIso } from './lib/time.js';
import type { SourceId } from './fetchers/types.js';
import type {
  CnnFgPayload,
  FetchResult,
  S5fiPayload,
  Sp500DailyPayload,
  VixPayload,
} from './fetchers/types.js';

export interface OrchestratorDeps {
  fetchImpl?: typeof fetch;
  /** Overrides for tests. If omitted, the real fetchers are called. */
  sources?: Partial<{
    cnn: () => Promise<FetchResult<CnnFgPayload>>;
    sidecar: () => Promise<SidecarFetchResults>;
  }>;
  now?: Date;
}

export interface OrchestratorResult {
  inserted: boolean;
  snapshot: SnapshotBody;
  composite: CompositeResult;
}

export interface SnapshotBody {
  slot_ts: string;
  fetched_at: string;
  composite_score: number | null;
  status: 'complete' | 'partial' | 'no-data';
  failed_sources: SourceId[];
  readings: Array<{
    source_id: SourceId;
    raw_value: number | null;
    flag_triggered: 0 | 1 | null;
    normalised_value: 0 | 25 | null;
    fetch_status: ReadingRow['fetchStatus'];
    fetch_error: string | null;
    fetched_at: string;
  }>;
}

export async function runRefresh(env: Env, deps: OrchestratorDeps = {}): Promise<OrchestratorResult> {
  const cfg = loadConfig(env as unknown as Record<string, unknown>);
  const fetched_at = nowIso();
  const slot_ts = currentSlot(deps.now);
  const fetchImpl = deps.fetchImpl ?? fetch;

  const [cnnResult, sidecarResults] = await Promise.all([
    deps.sources?.cnn ? deps.sources.cnn() : fetchCnnFearAndGreed(fetchImpl),
    deps.sources?.sidecar
      ? deps.sources.sidecar()
      : fetchFromSidecar(env.TRADINGVIEW_SIDECAR_URL, { fetchImpl }),
  ]);

  const readings: ReadingRow[] = [];
  const contribs: SourceContribution[] = [];

  // VIX
  pushReading(readings, contribs, 'vix', sidecarResults.vix, (ok) => evaluateVix(ok.raw, cfg));

  // CNN F&G
  pushReading(readings, contribs, 'cnn_fg', cnnResult, (ok) => evaluateFg(ok.raw, cfg));

  // S&P 500 daily
  pushReading(readings, contribs, 'sp500', sidecarResults.sp500, (ok) =>
    evaluateSp500(ok.closes, cfg),
  );

  // S5FI
  pushReading(readings, contribs, 's5fi', sidecarResults.s5fi, (ok) => evaluateS5fi(ok.raw, cfg));

  const composite = computeComposite(contribs);

  const db = createDb(env.DB);
  const inserted = await insertSnapshot(db, {
    slotTs: slot_ts,
    fetchedAt: fetched_at,
    compositeScore: composite.composite_score,
    status: composite.status,
    failedSources: composite.failed_sources,
    readings,
  });

  // If the slot already existed, return the stored snapshot so the caller can
  // reply with `{inserted: false, snapshot}` (per openapi.yaml).
  const snapshot = inserted
    ? buildBody(slot_ts, fetched_at, composite, readings)
    : await loadExistingBody(env, slot_ts);

  return { inserted, snapshot, composite };
}

function pushReading<T extends { raw?: number; closes?: number[] }>(
  readings: ReadingRow[],
  contribs: SourceContribution[],
  sourceId: SourceId,
  result: FetchResult<T> | FetchResult<VixPayload> | FetchResult<S5fiPayload> | FetchResult<Sp500DailyPayload> | FetchResult<CnnFgPayload>,
  evaluate: (ok: T) => { triggered: 0 | 1; raw: number; points: 0 | 25 },
): void {
  if (result.status === 'ok' || result.status === 'stale-source') {
    const ok = result.value as unknown as T;
    const r = evaluate(ok);
    readings.push({
      sourceId,
      rawValue: r.raw,
      flagTriggered: r.triggered,
      normalisedValue: r.points,
      fetchStatus: result.status,
      fetchError: null,
      fetchedAt: result.fetched_at,
    });
    contribs.push({ sourceId, ok: true, points: r.points });
    return;
  }
  readings.push({
    sourceId,
    rawValue: null,
    flagTriggered: null,
    normalisedValue: null,
    fetchStatus: result.status,
    fetchError: result.error,
    fetchedAt: result.fetched_at,
  });
  contribs.push({ sourceId, ok: false, points: 0 });
}

function buildBody(
  slot_ts: string,
  fetched_at: string,
  composite: CompositeResult,
  readings: ReadingRow[],
): SnapshotBody {
  return {
    slot_ts,
    fetched_at,
    composite_score: composite.composite_score,
    status: composite.status,
    failed_sources: composite.failed_sources,
    readings: readings.map((r) => ({
      source_id: r.sourceId,
      raw_value: r.rawValue,
      flag_triggered: r.flagTriggered,
      normalised_value: r.normalisedValue,
      fetch_status: r.fetchStatus,
      fetch_error: r.fetchError,
      fetched_at: r.fetchedAt,
    })),
  };
}

async function loadExistingBody(env: Env, slot_ts: string): Promise<SnapshotBody> {
  const db = createDb(env.DB);
  const snap = await getLatestSnapshot(db);
  if (!snap || snap.slotTs !== slot_ts) {
    throw new Error(`Expected existing snapshot for slot ${slot_ts} but none was found.`);
  }
  const readings = await getReadingsForSlot(db, slot_ts);
  return {
    slot_ts: snap.slotTs,
    fetched_at: snap.fetchedAt,
    composite_score: snap.compositeScore,
    status: snap.status,
    failed_sources: snap.failedSources ? snap.failedSources.split(',').filter(Boolean) as SourceId[] : [],
    readings: readings.map((r) => ({
      source_id: r.sourceId,
      raw_value: r.rawValue,
      flag_triggered: r.flagTriggered as 0 | 1 | null,
      normalised_value: r.normalisedValue as 0 | 25 | null,
      fetch_status: r.fetchStatus,
      fetch_error: r.fetchError,
      fetched_at: r.fetchedAt,
    })),
  };
}
