import type { ScoringConfig } from '../config.js';

export const POINTS_ON_TRIGGER = 25;

export interface FlagResult {
  triggered: 0 | 1;
  raw: number;
  points: 0 | 25;
}

/** VIX > threshold (default 30) triggers the flag. */
export function evaluateVix(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw > cfg.VIX_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

/** CNN Fear & Greed < threshold (default 20) triggers the flag. */
export function evaluateFg(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw < cfg.FG_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

/** S5FI < threshold (default 20) triggers the flag. */
export function evaluateS5fi(raw: number, cfg: ScoringConfig): FlagResult {
  const triggered = raw < cfg.S5FI_THRESHOLD ? 1 : 0;
  return { triggered, raw, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

/**
 * S&P 500 flag: tail-streak of consecutive "red days" (close < prior close)
 * of length >= SP500_RED_DAYS_MIN (default 3).
 *
 * `closes` must be the oldest-first sequence of most recent completed daily closes.
 * At least 2 closes are required; otherwise this is caller error and returns
 * triggered=0 with raw=streak length observed.
 */
export function evaluateSp500(closes: ReadonlyArray<number>, cfg: ScoringConfig): FlagResult {
  const streak = redDayTailStreak(closes);
  const triggered = streak >= cfg.SP500_RED_DAYS_MIN ? 1 : 0;
  return { triggered, raw: streak, points: (triggered * POINTS_ON_TRIGGER) as 0 | 25 };
}

/** Length of the tail run of red days (close[i] < close[i-1]). Exposed for tests. */
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
