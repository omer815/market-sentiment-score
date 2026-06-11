export type CompositeScore = 0 | 33 | 67 | 100;

export type SignalKey = 'vix' | 'fg' | 'sp500';

export const TOTAL_SIGNALS = 3;

export interface Signal {
  key: SignalKey;
  label: string;
  triggered: boolean;
  value: number | null; // null when the source was unavailable
  available: boolean;
  rule: string;
}

export interface ScoreResult {
  score: CompositeScore | null; // null only when every source failed
  label: string;
  partial: boolean;
  asOf: string;
  signals: Signal[];
}

// One per source; the sp500 streak is computed in buildScoreResult, so the
// pipeline supplies raw closes here.
export interface PipelineInputs {
  vix: { ok: true; raw: number } | { ok: false };
  fg: { ok: true; raw: number } | { ok: false };
  sp500: { ok: true; closes: number[] } | { ok: false };
}
