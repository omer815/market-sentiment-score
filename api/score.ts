import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../lib/pipeline.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const result = await runPipeline();
  if (result.score === null) {
    res.status(502).json({ error: 'all_sources_failed', ...result });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.status(200).json(result);
}
