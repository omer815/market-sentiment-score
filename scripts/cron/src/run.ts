import { currentSlot, nowIso } from './slot.js';
import {
  loadConfig,
  evaluateVix,
  evaluateFg,
  evaluateS5fi,
  evaluateSp500,
  computeComposite,
  type SourceContribution,
} from './scoring.js';
import { fetchVix } from './fetchers/vix.js';
import { fetchS5fi } from './fetchers/s5fi.js';
import { fetchSp500Daily } from './fetchers/sp500-daily.js';
import { fetchCnnFearAndGreed } from './fetchers/cnn-fg.js';
import type { IngestBody, IngestReading } from './post.js';
import { postIngest } from './post.js';

async function main(): Promise<void> {
  const workerUrl = required('WORKER_URL');
  const secret = required('CRON_SECRET');
  const cfg = loadConfig(process.env);

  const slotTs = currentSlot();
  const fetched_at = nowIso();
  console.log(`[cron] slot=${slotTs} config=${JSON.stringify(cfg)}`);

  const [vix, fg, s5fi, sp500] = await Promise.all([
    fetchVix(),
    fetchCnnFearAndGreed(),
    fetchS5fi(),
    fetchSp500Daily(),
  ]);

  const readings: IngestReading[] = [];
  const contribs: SourceContribution[] = [];

  // VIX
  if (vix.status === 'ok' || vix.status === 'stale-source') {
    const r = evaluateVix(vix.value.raw, cfg);
    readings.push({
      source_id: 'vix',
      raw_value: r.raw,
      flag_triggered: r.triggered,
      normalised_value: r.points,
      fetch_status: vix.status,
      fetch_error: null,
      fetched_at: vix.fetched_at,
    });
    contribs.push({ sourceId: 'vix', ok: true, points: r.points });
  } else {
    readings.push({
      source_id: 'vix',
      raw_value: null,
      flag_triggered: null,
      normalised_value: null,
      fetch_status: vix.status,
      fetch_error: vix.error,
      fetched_at: vix.fetched_at,
    });
    contribs.push({ sourceId: 'vix', ok: false, points: 0 });
  }

  // CNN F&G
  if (fg.status === 'ok' || fg.status === 'stale-source') {
    const r = evaluateFg(fg.value.raw, cfg);
    readings.push({
      source_id: 'cnn_fg',
      raw_value: r.raw,
      flag_triggered: r.triggered,
      normalised_value: r.points,
      fetch_status: fg.status,
      fetch_error: null,
      fetched_at: fg.fetched_at,
    });
    contribs.push({ sourceId: 'cnn_fg', ok: true, points: r.points });
  } else {
    readings.push({
      source_id: 'cnn_fg',
      raw_value: null,
      flag_triggered: null,
      normalised_value: null,
      fetch_status: fg.status,
      fetch_error: fg.error,
      fetched_at: fg.fetched_at,
    });
    contribs.push({ sourceId: 'cnn_fg', ok: false, points: 0 });
  }

  // S5FI
  if (s5fi.status === 'ok' || s5fi.status === 'stale-source') {
    const r = evaluateS5fi(s5fi.value.raw, cfg);
    readings.push({
      source_id: 's5fi',
      raw_value: r.raw,
      flag_triggered: r.triggered,
      normalised_value: r.points,
      fetch_status: s5fi.status,
      fetch_error: null,
      fetched_at: s5fi.fetched_at,
    });
    contribs.push({ sourceId: 's5fi', ok: true, points: r.points });
  } else {
    readings.push({
      source_id: 's5fi',
      raw_value: null,
      flag_triggered: null,
      normalised_value: null,
      fetch_status: s5fi.status,
      fetch_error: s5fi.error,
      fetched_at: s5fi.fetched_at,
    });
    contribs.push({ sourceId: 's5fi', ok: false, points: 0 });
  }

  // S&P 500 daily streak
  if (sp500.status === 'ok' || sp500.status === 'stale-source') {
    const r = evaluateSp500(sp500.value.closes, cfg);
    readings.push({
      source_id: 'sp500',
      raw_value: r.raw,
      flag_triggered: r.triggered,
      normalised_value: r.points,
      fetch_status: sp500.status,
      fetch_error: null,
      fetched_at: sp500.fetched_at,
    });
    contribs.push({ sourceId: 'sp500', ok: true, points: r.points });
  } else {
    readings.push({
      source_id: 'sp500',
      raw_value: null,
      flag_triggered: null,
      normalised_value: null,
      fetch_status: sp500.status,
      fetch_error: sp500.error,
      fetched_at: sp500.fetched_at,
    });
    contribs.push({ sourceId: 'sp500', ok: false, points: 0 });
  }

  const composite = computeComposite(contribs);

  const body: IngestBody = {
    slot_ts: slotTs,
    fetched_at,
    composite_score: composite.composite_score,
    status: composite.status,
    failed_sources: composite.failed_sources,
    readings,
  };

  console.log(
    `[cron] composite=${composite.composite_score} status=${composite.status} failed=${composite.failed_sources.join('|') || 'none'}`,
  );

  await postIngest(workerUrl, secret, body);
  console.log('[cron] ingest POST ok');
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

main().catch((err) => {
  console.error('[cron] failed', err);
  process.exit(1);
});
