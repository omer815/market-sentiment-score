import type { Env } from './env.js';
import { createRouter } from './router.js';
import { runCron } from './cron.js';

const app = createRouter();

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCron(env)
        .then((r) => {
          console.log(
            `[cron] slot=${r.slotTs} inserted=${r.inserted} status=${r.status} composite=${r.compositeScore} failed=${r.failedSources.join('|') || 'none'}`,
          );
        })
        .catch((err) => {
          console.error('[cron] runCron failed', err);
          throw err;
        }),
    );
  },
};
