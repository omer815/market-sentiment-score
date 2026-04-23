import { describe, expect, it } from 'vitest';
import { parseCnn } from '../../src/fetchers/cnn-fg.js';

const NOW = '2026-04-23T20:00:00.000Z';

describe('parseCnn', () => {
  it('extracts fear_and_greed.score on a well-formed response', () => {
    const result = parseCnn({ fear_and_greed: { score: 42.7, rating: 'Fear' } }, NOW);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.raw).toBe(42.7);
      expect(result.fetched_at).toBe(NOW);
    }
  });

  it('returns parse-failed when fear_and_greed is missing', () => {
    const result = parseCnn({}, NOW);
    expect(result.status).toBe('parse-failed');
  });

  it('returns parse-failed when score is missing', () => {
    const result = parseCnn({ fear_and_greed: { rating: 'Fear' } }, NOW);
    expect(result.status).toBe('parse-failed');
  });

  it('returns parse-failed when score is non-numeric', () => {
    const result = parseCnn({ fear_and_greed: { score: 'not-a-number' } }, NOW);
    expect(result.status).toBe('parse-failed');
  });

  it('returns parse-failed when score is NaN', () => {
    const result = parseCnn({ fear_and_greed: { score: Number.NaN } }, NOW);
    expect(result.status).toBe('parse-failed');
  });

  it('accepts integer 0 and 100 (extreme fear / extreme greed)', () => {
    const lo = parseCnn({ fear_and_greed: { score: 0 } }, NOW);
    const hi = parseCnn({ fear_and_greed: { score: 100 } }, NOW);
    expect(lo.status).toBe('ok');
    expect(hi.status).toBe('ok');
  });
});
