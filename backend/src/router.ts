import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env.js';
import { healthRoute } from './routes/health.js';
import { sourcesRoute } from './routes/sources.js';
import { snapshotsRoute } from './routes/snapshots.js';

export function createRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    '/api/*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.route('/api/health', healthRoute);
  app.route('/api/sources', sourcesRoute);
  app.route('/api/snapshots', snapshotsRoute);

  app.notFound((c) => c.json({ error: 'not_found', message: 'Route not found' }, 404));
  app.onError((err, c) => {
    console.error('[api error]', err);
    return c.json({ error: 'internal', message: 'Internal server error' }, 500);
  });

  return app;
}
