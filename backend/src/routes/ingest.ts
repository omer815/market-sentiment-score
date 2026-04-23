import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import { createDb } from '../storage/client.js';
import { insertSnapshot } from '../storage/snapshots.js';
import type { SourceId } from '../fetchers/types.js';

const SourceIdSchema = z.enum(['vix', 'cnn_fg', 'sp500', 's5fi']);
const FetchStatusSchema = z.enum([
  'ok',
  'stale-source',
  'fetch-failed',
  'parse-failed',
  'rate-limited',
]);

const ReadingSchema = z.object({
  source_id: SourceIdSchema,
  raw_value: z.number().nullable(),
  flag_triggered: z.union([z.literal(0), z.literal(1)]).nullable(),
  normalised_value: z.union([z.literal(0), z.literal(25)]).nullable(),
  fetch_status: FetchStatusSchema,
  fetch_error: z.string().nullable(),
  fetched_at: z.string().datetime(),
});

const IngestSchema = z.object({
  slot_ts: z.string(),
  fetched_at: z.string().datetime(),
  composite_score: z
    .union([z.literal(0), z.literal(25), z.literal(50), z.literal(75), z.literal(100)])
    .nullable(),
  status: z.enum(['complete', 'partial', 'no-data']),
  failed_sources: z.array(SourceIdSchema),
  readings: z.array(ReadingSchema).min(1).max(4),
});

export const ingestRoute = new Hono<{ Bindings: Env }>();

ingestRoute.post('/ingest', async (c) => {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }

  const parsed = IngestSchema.safeParse(json);
  if (!parsed.success) {
    return c.json(
      { error: 'bad_request', message: parsed.error.issues.map((i) => i.message).join('; ') },
      400,
    );
  }
  const body = parsed.data;

  if (body.status === 'no-data' && body.composite_score !== null) {
    return c.json({ error: 'bad_request', message: 'no-data must have null composite_score' }, 400);
  }
  if (body.status !== 'no-data' && body.composite_score === null) {
    return c.json(
      { error: 'bad_request', message: 'non no-data status must have a composite_score' },
      400,
    );
  }

  const db = createDb(c.env.DB);
  const inserted = await insertSnapshot(db, {
    slotTs: body.slot_ts,
    fetchedAt: body.fetched_at,
    compositeScore: body.composite_score,
    status: body.status,
    failedSources: body.failed_sources as SourceId[],
    readings: body.readings.map((r) => ({
      sourceId: r.source_id,
      rawValue: r.raw_value,
      flagTriggered: r.flag_triggered,
      normalisedValue: r.normalised_value,
      fetchStatus: r.fetch_status,
      fetchError: r.fetch_error,
      fetchedAt: r.fetched_at,
    })),
  });

  return c.json({ slot_ts: body.slot_ts, inserted }, inserted ? 201 : 200);
});
