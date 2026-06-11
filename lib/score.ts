import type { ScoringConfig } from './config.js';
import type { CompositeScore, PipelineInputs, ScoreResult, Signal } from './types.js';
import { TOTAL_SIGNALS } from './types.js';

// Length of the tail run of red days (close[i] < close[i-1]).
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

export function labelForScore(score: CompositeScore | null): string {
  switch (score) {
    case null:
      return 'No data';
    case 0:
      return 'No signal';
    case 33:
      return 'Weak buy signal';
    case 67:
      return 'Moderate buy signal';
    case 100:
      return 'Strong buy signal';
  }
}

// Maps the firing count to the discrete 0/33/67/100 scale.
function scoreForFiring(triggered: number): CompositeScore {
  return Math.round((triggered / TOTAL_SIGNALS) * 100) as CompositeScore;
}

// Pure: maps fetched inputs + thresholds into the public ScoreResult contract.
export function buildScoreResult(
  inputs: PipelineInputs,
  cfg: ScoringConfig,
  asOf: string,
): ScoreResult {
  const signals: Signal[] = [
    buildScalar('vix', 'VIX', inputs.vix, `VIX > ${cfg.VIX_THRESHOLD}`, (raw) => raw > cfg.VIX_THRESHOLD),
    buildScalar('fg', 'Fear & Greed', inputs.fg, `F&G < ${cfg.FG_THRESHOLD}`, (raw) => raw < cfg.FG_THRESHOLD),
    buildSp500(inputs.sp500, cfg),
  ];

  const available = signals.filter((s) => s.available);
  const partial = available.length < signals.length;

  if (available.length === 0) {
    return { score: null, label: labelForScore(null), partial: true, asOf, signals };
  }

  const firing = available.filter((s) => s.triggered).length;
  const score = scoreForFiring(firing);
  return { score, label: labelForScore(score), partial, asOf, signals };
}

function buildScalar(
  key: 'vix' | 'fg',
  label: string,
  input: { ok: true; raw: number } | { ok: false },
  rule: string,
  triggers: (raw: number) => boolean,
): Signal {
  if (!input.ok) {
    return { key, label, triggered: false, value: null, available: false, rule };
  }
  return { key, label, triggered: triggers(input.raw), value: input.raw, available: true, rule };
}

function buildSp500(
  input: { ok: true; closes: number[] } | { ok: false },
  cfg: ScoringConfig,
): Signal {
  const rule = `>= ${cfg.SP500_RED_DAYS_MIN} consecutive red days`;
  if (!input.ok) {
    return { key: 'sp500', label: 'S&P 500 streak', triggered: false, value: null, available: false, rule };
  }
  const streak = redDayTailStreak(input.closes);
  return {
    key: 'sp500',
    label: 'S&P 500 streak',
    triggered: streak >= cfg.SP500_RED_DAYS_MIN,
    value: streak,
    available: true,
    rule,
  };
}
