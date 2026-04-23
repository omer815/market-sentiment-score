import type { SourceId } from '../fetchers/types.js';

export type CompositeScore = 0 | 25 | 50 | 75 | 100;
export type SnapshotStatus = 'complete' | 'partial' | 'no-data';

export interface SourceContribution {
  sourceId: SourceId;
  ok: boolean;
  /** 0 or 25 when `ok`; not counted when !ok. */
  points: 0 | 25;
}

export interface CompositeResult {
  composite_score: CompositeScore | null;
  status: SnapshotStatus;
  failed_sources: SourceId[];
}

/**
 * Combine per-source contributions into the snapshot's composite score.
 *
 * Rules:
 * - Each successful source contributes 0 or 25 points.
 * - Failed sources contribute 0 and are listed in `failed_sources`.
 * - status='complete' when all sources ok, 'partial' when some ok, 'no-data' when all failed.
 */
export function computeComposite(contribs: ReadonlyArray<SourceContribution>): CompositeResult {
  const failed: SourceId[] = [];
  let sum = 0;
  for (const c of contribs) {
    if (c.ok) sum += c.points;
    else failed.push(c.sourceId);
  }

  if (failed.length === contribs.length) {
    return { composite_score: null, status: 'no-data', failed_sources: failed };
  }

  const status: SnapshotStatus = failed.length === 0 ? 'complete' : 'partial';
  // sum is a multiple of 25 in [0, 100] by construction.
  return { composite_score: sum as CompositeScore, status, failed_sources: failed };
}
