import { describe, expect, it } from 'vitest';
import { parseDaily } from '../../src/fetchers/sp500-daily.js';

const DAY = 24 * 60 * 60;

describe('parseDaily', () => {
  const now = Date.UTC(2026, 3, 23, 12, 0, 0); // 2026-04-23T12:00:00Z
  const nowSec = now / 1000;

  const mkBars = (count: number, valuesOldestFirst: number[]): Array<{ ts: number; close: number }> =>
    valuesOldestFirst
      .slice(0, count)
      .map((close, i) => ({ ts: nowSec - (count - i) * DAY, close }));

  it('drops the in-progress bar within the last 12h', () => {
    const bars = [
      { ts: nowSec - 3 * DAY, close: 5100 },
      { ts: nowSec - 2 * DAY, close: 5080 },
      { ts: nowSec - 1 * DAY, close: 5060 },
      { ts: nowSec - 1 * 60 * 60, close: 5055 }, // today, inside 12h → dropped
    ];
    const out = parseDaily(bars, '2026-04-23T12:00:00Z', now);
    expect(out.closes).toEqual([5100, 5080, 5060]);
  });

  it('returns closes oldest-first', () => {
    const bars = [
      { ts: nowSec - 1 * DAY, close: 5060 },
      { ts: nowSec - 3 * DAY, close: 5100 },
      { ts: nowSec - 2 * DAY, close: 5080 },
    ];
    const out = parseDaily(bars, 'now', now);
    expect(out.closes).toEqual([5100, 5080, 5060]);
  });

  it('throws if fewer than 2 completed bars', () => {
    const bars = [{ ts: nowSec - 1 * DAY, close: 5060 }];
    expect(() => parseDaily(bars, 'now', now)).toThrow(/not enough completed bars/);
  });

  it('sets latest_date from the most recent completed bar', () => {
    const bars = mkBars(3, [5100, 5080, 5060]);
    const out = parseDaily(bars, 'now', now);
    expect(out.latest_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('drops bars with non-finite closes', () => {
    const bars = [
      { ts: nowSec - 3 * DAY, close: 5100 },
      { ts: nowSec - 2 * DAY, close: Number.NaN },
      { ts: nowSec - 1 * DAY, close: 5060 },
    ];
    const out = parseDaily(bars, 'now', now);
    expect(out.closes).toEqual([5100, 5060]);
  });
});
