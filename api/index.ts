import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../lib/pipeline.js';
import { renderHtml } from '../lib/render.js';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const result = await runPipeline();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.status(200).send(renderHtml(result));
}
