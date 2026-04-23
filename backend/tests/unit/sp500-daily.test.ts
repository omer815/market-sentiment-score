import { describe, it, expect } from 'vitest';
import { parseDaily } from '../../src/fetchers/sp500-daily.js';

const now = Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

describe('parseDaily', () => {
  it('strips bars within the last 12 hours (current live bar)', () => {
    const timestamps = [now - 4 * DAY, now - 3 * DAY, now - 2 * DAY, now - 1 * DAY, now - 60];
    const closes = [100, 99, 98, 97, 96];
    const r = parseDaily(timestamps, closes, '2026-04-23T14:00:00Z');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.value.closes).toEqual([100, 99, 98, 97]);
      expect(r.value.latestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('fails when fewer than 2 completed bars remain', () => {
    const timestamps = [now - 60];
    const closes = [100];
    const r = parseDaily(timestamps, closes, '2026-04-23T14:00:00Z');
    expect(r.status).toBe('fetch-failed');
  });

  it('skips null closes', () => {
    const timestamps = [now - 5 * DAY, now - 4 * DAY, now - 3 * DAY, now - 2 * DAY];
    const closes = [100, null, 98, 97];
    const r = parseDaily(timestamps, closes, '2026-04-23T14:00:00Z');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.value.closes).toEqual([100, 98, 97]);
    }
  });
});
