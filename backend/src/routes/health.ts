import { Hono } from 'hono';
import type { Env } from '../env.js';
import { nowIso } from '../lib/time.js';

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/', (c) => {
  return c.json({ status: 'ok', now: nowIso() });
});
