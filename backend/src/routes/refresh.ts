import { Hono } from 'hono';
import type { Env } from '../env.js';
import { runRefresh } from '../orchestrator.js';

export const refreshRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /api/snapshots/refresh  (see contracts/openapi.yaml)
 *
 *  201 — new snapshot inserted; body is the Snapshot with `inserted: true`
 *  200 — slot already had a snapshot; body `{slot_ts, inserted: false, snapshot}`
 *  502 — every upstream failed; an `no-data` row is still persisted
 *
 * Unauthenticated. Writes are idempotent on `slot_ts` (D1 PK).
 */
refreshRoute.post('/refresh', async (c) => {
  try {
    const result = await runRefresh(c.env);

    if (result.composite.status === 'no-data') {
      return c.json(
        {
          error: 'upstream_failed',
          detail: `All sources failed for slot ${result.snapshot.slot_ts}`,
        },
        502,
      );
    }

    if (result.inserted) {
      return c.json({ inserted: true, ...result.snapshot }, 201);
    }

    return c.json(
      {
        slot_ts: result.snapshot.slot_ts,
        inserted: false,
        snapshot: result.snapshot,
      },
      200,
    );
  } catch (err) {
    console.error('[refresh] error', err);
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'internal', detail: msg }, 500);
  }
});
