import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import { createDb } from '../storage/client.js';
import {
  getLatestSnapshot,
  getReadingsForSlot,
  getSnapshotsBetween,
} from '../storage/snapshots.js';

export const snapshotsRoute = new Hono<{ Bindings: Env }>();

snapshotsRoute.get('/latest', async (c) => {
  const db = createDb(c.env.DB);
  const snap = await getLatestSnapshot(db);
  if (!snap) return c.json({ error: 'no_snapshots', message: 'No snapshots yet.' }, 404);

  const readings = await getReadingsForSlot(db, snap.slotTs);

  return c.json({
    slot_ts: snap.slotTs,
    fetched_at: snap.fetchedAt,
    composite_score: snap.compositeScore,
    status: snap.status,
    failed_sources: snap.failedSources ? snap.failedSources.split(',').filter(Boolean) : [],
    readings: readings.map((r) => ({
      source_id: r.sourceId,
      raw_value: r.rawValue,
      flag_triggered: r.flagTriggered,
      normalised_value: r.normalisedValue,
      fetch_status: r.fetchStatus,
      fetch_error: r.fetchError,
      fetched_at: r.fetchedAt,
    })),
  });
});

const rangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  resolution: z.enum(['raw', '2h', '1d']).default('raw'),
});

snapshotsRoute.get('/', async (c) => {
  const parse = rangeQuery.safeParse({
    from: c.req.query('from'),
    to: c.req.query('to'),
    resolution: c.req.query('resolution'),
  });
  if (!parse.success) {
    return c.json({ error: 'bad_request', message: parse.error.message }, 400);
  }
  const to = parse.data.to ?? new Date().toISOString();
  const from = parse.data.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const db = createDb(c.env.DB);
  const rows = await getSnapshotsBetween(db, from, to);

  return c.json({
    from,
    to,
    resolution: parse.data.resolution,
    points: rows.map((r) => ({
      slot_ts: r.slotTs,
      composite_score: r.compositeScore,
      status: r.status,
    })),
  });
});
