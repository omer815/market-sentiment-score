import type { SourceId } from './types.js';

export const POINTS_ON_TRIGGER = 25;

export interface ScoringConfig {
  VIX_THRESHOLD: number;
  FG_THRESHOLD: number;
  S5FI_THRESHOLD: number;
  SP500_RED_DAYS_MIN: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): ScoringConfig {
  return {
    VIX_THRESHOLD: num(env.VIX_THRESHOLD, 30),
    FG_THRESHOLD: num(env.FG_THRESHOLD, 20),
    S5FI_THRESHOLD: num(env.S5FI_THRESHOLD, 20),
    SP500_RED_DAYS_MIN: Math.max(1, Math.floor(num(env.SP500_RED_DAYS_MIN, 3))),
  };
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface FlagResult {
  triggered: 0 | 1;
  raw: number;
  points: 0 | 25;
}

export function evaluateVix(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw > cfg.VIX_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

export function evaluateFg(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw < cfg.FG_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

export function evaluateS5fi(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw < cfg.S5FI_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

export function evaluateSp500(closes: ReadonlyArray<number>, cfg: ScoringConfig): FlagResult {
  const streak = redDayTailStreak(closes);
  const triggered = streak >= cfg.SP500_RED_DAYS_MIN ? 1 : 0;
  return { triggered, raw: streak, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

export function redDayTailStreak(closes: ReadonlyArray<number>): number {
  if (closes.length < 2) return 0;
  let streak = 0;
  for (let i = closes.length - 1; i >= 1; i--) {
    const cur = closes[i]!;
    const prev = closes[i - 1]!;
    if (cur < prev) streak++;
    else break;
  }
  return streak;
}

export type CompositeScore = 0 | 25 | 50 | 75 | 100;
export type SnapshotStatus = 'complete' | 'partial' | 'no-data';

export interface SourceContribution {
  sourceId: SourceId;
  ok: boolean;
  points: 0 | 25;
}

export interface CompositeResult {
  composite_score: CompositeScore | null;
  status: SnapshotStatus;
  failed_sources: SourceId[];
}

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
  return {
    composite_score: sum as CompositeScore,
    status: failed.length === 0 ? 'complete' : 'partial',
    failed_sources: failed,
  };
}
