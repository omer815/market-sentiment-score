import { currentSlot } from './lib/slot.js';
import { nowIso } from './lib/time.js';
import { loadConfig } from './config.js';
import type { Env } from './env.js';
import { createDb } from './storage/client.js';
import { insertSnapshot } from './storage/snapshots.js';
import type { ReadingRow, SnapshotWrite } from './storage/snapshots.js';
import { fetchVix } from './fetchers/vix.js';
import { fetchCnnFearAndGreed } from './fetchers/cnn-fg.js';
import { fetchS5fi } from './fetchers/s5fi.js';
import { fetchSp500Daily } from './fetchers/sp500-daily.js';
import { evaluateVix, evaluateFg, evaluateS5fi, evaluateSp500 } from './scoring/flags.js';
import { computeComposite } from './scoring/composite.js';
import type { SourceContribution } from './scoring/composite.js';
import type { SourceId } from './fetchers/types.js';

export interface CronResult {
  slotTs: string;
  inserted: boolean;
  status: 'complete' | 'partial' | 'no-data';
  compositeScore: 0 | 25 | 50 | 75 | 100 | null;
  failedSources: SourceId[];
}

/**
 * Fetch every source, evaluate its flag, compute the composite, and persist.
 * Called by the scheduled handler on the :00/:30 cron tick, and on-demand by
 * the admin-less `/api/cron/run-now` route (if enabled in future).
 */
export async function runCron(env: Env): Promise<CronResult> {
  const slotTs = currentSlot();
  const fetchedAt = nowIso();
  const cfg = loadConfig(env as unknown as Record<string, unknown>);
  const db = createDb(env.DB);

  const [vixRes, fgRes, s5fiRes, sp500Res] = await Promise.all([
    fetchVix(),
    fetchCnnFearAndGreed(),
    fetchS5fi(),
    fetchSp500Daily(),
  ]);

  const readings: ReadingRow[] = [];
  const contribs: SourceContribution[] = [];

  // VIX
  if (vixRes.status === 'ok' || vixRes.status === 'stale-source') {
    const r = evaluateVix(vixRes.value.raw, cfg);
    readings.push({
      sourceId: 'vix',
      rawValue: r.raw,
      flagTriggered: r.triggered,
      normalisedValue: r.points,
      fetchStatus: vixRes.status,
      fetchError: null,
      fetchedAt: vixRes.fetched_at,
    });
    contribs.push({ sourceId: 'vix', ok: true, points: r.points });
  } else {
    readings.push({
      sourceId: 'vix',
      rawValue: null,
      flagTriggered: null,
      normalisedValue: null,
      fetchStatus: vixRes.status,
      fetchError: vixRes.error,
      fetchedAt: vixRes.fetched_at,
    });
    contribs.push({ sourceId: 'vix', ok: false, points: 0 });
  }

  // CNN F&G
  if (fgRes.status === 'ok' || fgRes.status === 'stale-source') {
    const r = evaluateFg(fgRes.value.raw, cfg);
    readings.push({
      sourceId: 'cnn_fg',
      rawValue: r.raw,
      flagTriggered: r.triggered,
      normalisedValue: r.points,
      fetchStatus: fgRes.status,
      fetchError: null,
      fetchedAt: fgRes.fetched_at,
    });
    contribs.push({ sourceId: 'cnn_fg', ok: true, points: r.points });
  } else {
    readings.push({
      sourceId: 'cnn_fg',
      rawValue: null,
      flagTriggered: null,
      normalisedValue: null,
      fetchStatus: fgRes.status,
      fetchError: fgRes.error,
      fetchedAt: fgRes.fetched_at,
    });
    contribs.push({ sourceId: 'cnn_fg', ok: false, points: 0 });
  }

  // S5FI
  if (s5fiRes.status === 'ok' || s5fiRes.status === 'stale-source') {
    const r = evaluateS5fi(s5fiRes.value.raw, cfg);
    readings.push({
      sourceId: 's5fi',
      rawValue: r.raw,
      flagTriggered: r.triggered,
      normalisedValue: r.points,
      fetchStatus: s5fiRes.status,
      fetchError: null,
      fetchedAt: s5fiRes.fetched_at,
    });
    contribs.push({ sourceId: 's5fi', ok: true, points: r.points });
  } else {
    readings.push({
      sourceId: 's5fi',
      rawValue: null,
      flagTriggered: null,
      normalisedValue: null,
      fetchStatus: s5fiRes.status,
      fetchError: s5fiRes.error,
      fetchedAt: s5fiRes.fetched_at,
    });
    contribs.push({ sourceId: 's5fi', ok: false, points: 0 });
  }

  // S&P 500 daily streak
  if (sp500Res.status === 'ok' || sp500Res.status === 'stale-source') {
    const r = evaluateSp500(sp500Res.value.closes, cfg);
    readings.push({
      sourceId: 'sp500',
      rawValue: r.raw,
      flagTriggered: r.triggered,
      normalisedValue: r.points,
      fetchStatus: sp500Res.status,
      fetchError: null,
      fetchedAt: sp500Res.fetched_at,
    });
    contribs.push({ sourceId: 'sp500', ok: true, points: r.points });
  } else {
    readings.push({
      sourceId: 'sp500',
      rawValue: null,
      flagTriggered: null,
      normalisedValue: null,
      fetchStatus: sp500Res.status,
      fetchError: sp500Res.error,
      fetchedAt: sp500Res.fetched_at,
    });
    contribs.push({ sourceId: 'sp500', ok: false, points: 0 });
  }

  const composite = computeComposite(contribs);

  const snapshot: SnapshotWrite = {
    slotTs,
    fetchedAt,
    compositeScore: composite.composite_score,
    status: composite.status,
    failedSources: composite.failed_sources,
    readings,
  };

  const inserted = await insertSnapshot(db, snapshot);

  return {
    slotTs,
    inserted,
    status: composite.status,
    compositeScore: composite.composite_score,
    failedSources: composite.failed_sources,
  };
}
