import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createDb } from '../storage/client.js';
import { getLatestSnapshot } from '../storage/snapshots.js';

export const healthRoute = new Hono<{ Bindings: Env }>();

/**
 * GET /api/health  (see contracts/openapi.yaml Health schema)
 *
 * `status` = `ok` if the most recent snapshot is `complete` or `partial`;
 * `degraded` if it's `no-data` or if no snapshot exists yet.
 */
healthRoute.get('/', async (c) => {
  const db = createDb(c.env.DB);
  const latest = await getLatestSnapshot(db);

  if (!latest) {
    return c.json({
      status: 'degraded',
      last_cycle_at: null,
      last_cycle_status: null,
    });
  }

  const status = latest.status === 'no-data' ? 'degraded' : 'ok';
  return c.json({
    status,
    last_cycle_at: latest.slotTs,
    last_cycle_status: latest.status,
  });
});
