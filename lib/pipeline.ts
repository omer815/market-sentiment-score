import { loadConfig } from './config.js';
import { fetchVix, fetchSp500Daily, fetchCnnFearAndGreed } from './fetchers.js';
import { buildScoreResult } from './score.js';
import type { PipelineInputs, ScoreResult } from './types.js';

// Fan out to all three sources in parallel; a rejected/failed source becomes
// {ok:false} and contributes 0 (buildScoreResult marks the result partial).
export async function runPipeline(env: Record<string, unknown> = process.env): Promise<ScoreResult> {
  const cfg = loadConfig(env);
  const asOf = new Date().toISOString();

  const [vix, sp500, fg] = await Promise.allSettled([
    fetchVix(),
    fetchSp500Daily(),
    fetchCnnFearAndGreed(),
  ]);

  const inputs: PipelineInputs = {
    vix: vix.status === 'fulfilled' ? { ok: true, raw: vix.value.raw } : { ok: false },
    sp500: sp500.status === 'fulfilled' ? { ok: true, closes: sp500.value.closes } : { ok: false },
    fg: fg.status === 'fulfilled' && fg.value.ok ? { ok: true, raw: fg.value.raw } : { ok: false },
  };

  return buildScoreResult(inputs, cfg, asOf);
}
