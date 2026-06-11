import { describe, expect, it } from 'vitest';
import { renderHtml } from '../lib/render.js';
import type { ScoreResult } from '../lib/types.js';

const base: ScoreResult = {
  score: 67,
  label: 'Moderate buy signal',
  partial: false,
  asOf: '2026-06-11T14:00:00Z',
  signals: [
    { key: 'vix', label: 'VIX', triggered: true, value: 34.2, available: true, rule: 'VIX > 30' },
    { key: 'fg', label: 'Fear & Greed', triggered: false, value: 41, available: true, rule: 'F&G < 20' },
    {
      key: 'sp500',
      label: 'S&P 500 streak',
      triggered: true,
      value: 3,
      available: true,
      rule: '>= 3 consecutive red days',
    },
  ],
};

describe('renderHtml', () => {
  it('shows the score, label, and a row per signal', () => {
    const html = renderHtml(base);
    expect(html).toContain('67');
    expect(html).toContain('Moderate buy signal');
    expect(html).toContain('VIX');
    expect(html).toContain('S&amp;P 500 streak'); // HTML-escaped
    expect(html).toContain('✓');
    expect(html).toContain('✗');
  });

  it('renders unavailable signals as (unavailable)', () => {
    const partial: ScoreResult = {
      ...base,
      partial: true,
      signals: [
        { ...base.signals[0]!, triggered: false, value: null, available: false },
        ...base.signals.slice(1),
      ],
    };
    const html = renderHtml(partial);
    expect(html).toContain('unavailable');
  });

  it('renders No data when score is null', () => {
    const html = renderHtml({ ...base, score: null, label: 'No data' });
    expect(html).toContain('No data');
  });
});
