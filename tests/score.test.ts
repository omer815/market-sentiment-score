import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';
import { redDayTailStreak, buildScoreResult, labelForScore } from '../lib/score.js';
import type { PipelineInputs } from '../lib/types.js';

const cfg = loadConfig({}); // defaults: VIX>30, FG<20, streak>=3
const AS_OF = '2026-06-11T14:00:00Z';

describe('redDayTailStreak', () => {
  it('counts the trailing run of lower closes', () => {
    expect(redDayTailStreak([10, 9, 8, 7])).toBe(3);
  });
  it('stops at the first non-red day from the tail', () => {
    expect(redDayTailStreak([10, 8, 9, 8, 7])).toBe(2);
  });
  it('returns 0 for fewer than 2 closes', () => {
    expect(redDayTailStreak([5])).toBe(0);
  });
});

describe('labelForScore', () => {
  it('maps each stop to a label', () => {
    expect(labelForScore(0)).toBe('No signal');
    expect(labelForScore(33)).toBe('Weak buy signal');
    expect(labelForScore(67)).toBe('Moderate buy signal');
    expect(labelForScore(100)).toBe('Strong buy signal');
    expect(labelForScore(null)).toBe('No data');
  });
});

describe('buildScoreResult', () => {
  const allInputs = (o: Partial<PipelineInputs> = {}): PipelineInputs => ({
    vix: { ok: true, raw: 35 },
    fg: { ok: true, raw: 15 },
    sp500: { ok: true, closes: [10, 9, 8, 7] },
    ...o,
  });

  it('scores 100 when all three signals trigger', () => {
    const r = buildScoreResult(allInputs(), cfg, AS_OF);
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.signals.every((s) => s.triggered && s.available)).toBe(true);
  });

  it('scores 0 when no signal triggers', () => {
    const r = buildScoreResult(
      allInputs({
        vix: { ok: true, raw: 12 },
        fg: { ok: true, raw: 60 },
        sp500: { ok: true, closes: [7, 8, 9, 10] },
      }),
      cfg,
      AS_OF,
    );
    expect(r.score).toBe(0);
    expect(r.label).toBe('No signal');
  });

  it('scores 67 when two of three trigger', () => {
    const r = buildScoreResult(allInputs({ sp500: { ok: true, closes: [7, 8, 9, 10] } }), cfg, AS_OF);
    expect(r.score).toBe(67); // vix + fg fire, sp500 does not
  });

  it('marks partial and excludes failed sources (denominator stays 3)', () => {
    const r = buildScoreResult(allInputs({ vix: { ok: false } }), cfg, AS_OF);
    expect(r.partial).toBe(true);
    expect(r.score).toBe(67); // fg + sp500 fire of 3 -> round(2/3*100)
    const vix = r.signals.find((s) => s.key === 'vix')!;
    expect(vix.available).toBe(false);
    expect(vix.triggered).toBe(false);
    expect(vix.value).toBeNull();
  });

  it('returns null score and No data when every source fails', () => {
    const r = buildScoreResult(
      { vix: { ok: false }, fg: { ok: false }, sp500: { ok: false } },
      cfg,
      AS_OF,
    );
    expect(r.score).toBeNull();
    expect(r.label).toBe('No data');
    expect(r.partial).toBe(true);
  });

  it('exposes the sp500 streak as the signal value', () => {
    const r = buildScoreResult(allInputs(), cfg, AS_OF);
    const sp = r.signals.find((s) => s.key === 'sp500')!;
    expect(sp.value).toBe(3);
    expect(sp.rule).toContain('3');
  });
});
