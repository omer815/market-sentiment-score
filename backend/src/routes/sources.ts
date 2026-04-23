import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env.js';
import { createDb } from '../storage/client.js';
import { listSources } from '../storage/sources.js';
import { getSourceSeries } from '../storage/snapshots.js';
import type { SourceId } from '../fetchers/types.js';

export const sourcesRoute = new Hono<{ Bindings: Env }>();

sourcesRoute.get('/', async (c) => {
  const db = createDb(c.env.DB);
  const rows = await listSources(db);
  return c.json(
    rows.map((r) => ({
      source_id: r.sourceId,
      display_name: r.displayName,
      description: r.description,
      flag_rule: r.flagRule,
      points_on_trigger: r.pointsOnTrigger,
      update_cadence: r.updateCadence,
    })),
  );
});

const sourceQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  resolution: z.enum(['raw', '2h', '1d']).default('raw'),
});

sourcesRoute.get('/:sourceId', async (c) => {
  const sourceId = c.req.param('sourceId') as SourceId;
  if (!['vix', 'cnn_fg', 'sp500', 's5fi'].includes(sourceId)) {
    return c.json({ error: 'not_found', message: `Unknown source_id: ${sourceId}` }, 404);
  }
  const parse = sourceQuery.safeParse({
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
  const rows = await getSourceSeries(db, sourceId, from, to);

  return c.json({
    source_id: sourceId,
    from,
    to,
    resolution: parse.data.resolution,
    points: rows.map((r) => ({
      slot_ts: r.slotTs,
      raw_value: r.rawValue,
      normalised_value: r.normalisedValue,
      fetch_status: r.fetchStatus,
    })),
  });
});
