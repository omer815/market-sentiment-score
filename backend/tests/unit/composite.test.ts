import { describe, it, expect } from 'vitest';
import { computeComposite } from '../../src/scoring/composite.js';

describe('computeComposite', () => {
  it('sums to 0 when nothing triggered', () => {
    const r = computeComposite([
      { sourceId: 'vix', ok: true, points: 0 },
      { sourceId: 'cnn_fg', ok: true, points: 0 },
      { sourceId: 's5fi', ok: true, points: 0 },
      { sourceId: 'sp500', ok: true, points: 0 },
    ]);
    expect(r.composite_score).toBe(0);
    expect(r.status).toBe('complete');
    expect(r.failed_sources).toEqual([]);
  });

  it('sums to 100 when all triggered', () => {
    const r = computeComposite([
      { sourceId: 'vix', ok: true, points: 25 },
      { sourceId: 'cnn_fg', ok: true, points: 25 },
      { sourceId: 's5fi', ok: true, points: 25 },
      { sourceId: 'sp500', ok: true, points: 25 },
    ]);
    expect(r.composite_score).toBe(100);
    expect(r.status).toBe('complete');
  });

  it('partial when some sources fail, excluding failed points', () => {
    const r = computeComposite([
      { sourceId: 'vix', ok: true, points: 25 },
      { sourceId: 'cnn_fg', ok: true, points: 25 },
      { sourceId: 's5fi', ok: false, points: 0 },
      { sourceId: 'sp500', ok: true, points: 0 },
    ]);
    expect(r.composite_score).toBe(50);
    expect(r.status).toBe('partial');
    expect(r.failed_sources).toEqual(['s5fi']);
  });

  it('no-data when all sources fail', () => {
    const r = computeComposite([
      { sourceId: 'vix', ok: false, points: 0 },
      { sourceId: 'cnn_fg', ok: false, points: 0 },
      { sourceId: 's5fi', ok: false, points: 0 },
      { sourceId: 'sp500', ok: false, points: 0 },
    ]);
    expect(r.composite_score).toBeNull();
    expect(r.status).toBe('no-data');
    expect(r.failed_sources).toEqual(['vix', 'cnn_fg', 's5fi', 'sp500']);
  });
});
