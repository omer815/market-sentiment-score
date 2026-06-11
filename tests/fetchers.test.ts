import { describe, expect, it } from 'vitest';
import { parseYahooChart, parseDaily, parseCnn } from '../lib/fetchers.js';

const NOW = Date.parse('2026-06-11T14:00:00Z');
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('parseYahooChart', () => {
  it('extracts regularMarketPrice and (ts, close) pairs, dropping null closes', () => {
    const json = {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 34.2 },
            timestamp: [
              sec('2026-06-09T20:00:00Z'),
              sec('2026-06-10T20:00:00Z'),
              sec('2026-06-11T13:00:00Z'),
            ],
            indicators: { quote: [{ close: [100, 99, null] }] },
          },
        ],
      },
    };
    const out = parseYahooChart(json);
    expect(out.regularMarketPrice).toBeCloseTo(34.2);
    expect(out.bars).toEqual([
      { ts: sec('2026-06-09T20:00:00Z'), close: 100 },
      { ts: sec('2026-06-10T20:00:00Z'), close: 99 },
    ]);
  });

  it('throws on a malformed payload', () => {
    expect(() => parseYahooChart({ chart: { result: [] } })).toThrow();
  });
});

describe('parseDaily', () => {
  const day = (n: number) => sec(`2026-06-${String(n).padStart(2, '0')}T20:00:00Z`);

  it('drops the still-forming candle (within 12h) and returns completed closes oldest-first', () => {
    const bars = [
      { ts: day(8), close: 100 },
      { ts: day(9), close: 99 },
      { ts: day(10), close: 98 },
      { ts: Math.floor(NOW / 1000) - 3600, close: 97 }, // today, unfinished -> dropped
    ];
    const out = parseDaily(bars, NOW);
    expect(out.closes).toEqual([100, 99, 98]);
  });

  it('throws when fewer than 2 completed bars', () => {
    expect(() => parseDaily([{ ts: day(10), close: 98 }], NOW)).toThrow();
  });
});

describe('parseCnn', () => {
  it('extracts the fear & greed score', () => {
    const r = parseCnn({ fear_and_greed: { score: 41.2 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.raw).toBeCloseTo(41.2);
  });

  it('fails when no usable score', () => {
    const r = parseCnn({ fear_and_greed: {} });
    expect(r.ok).toBe(false);
  });
});
