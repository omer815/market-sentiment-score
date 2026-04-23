import { describe, expect, it } from 'vitest';
import { parseSidecar } from '../../src/fetchers/sidecar.js';

const NOW = '2026-04-23T20:00:00.000Z';

describe('parseSidecar', () => {
  it('maps a full ok response to three ok FetchResults', () => {
    const out = parseSidecar(
      {
        vix: { raw: 14.2, fetched_at: 'a' },
        sp500: { closes: [5100, 5080, 5060], latest_date: '2026-04-22', fetched_at: 'b' },
        s5fi: { raw: 58.4, fetched_at: 'c' },
      },
      NOW,
    );
    expect(out.vix.status).toBe('ok');
    expect(out.sp500.status).toBe('ok');
    expect(out.s5fi.status).toBe('ok');
    if (out.vix.status === 'ok') expect(out.vix.value.raw).toBe(14.2);
    if (out.sp500.status === 'ok') expect(out.sp500.value.closes).toEqual([5100, 5080, 5060]);
    if (out.s5fi.status === 'ok') expect(out.s5fi.value.raw).toBe(58.4);
  });

  it('maps a missing key to fetch-failed with the errors[] reason', () => {
    const out = parseSidecar(
      {
        sp500: { closes: [1, 2], latest_date: 'd', fetched_at: 'b' },
        s5fi: { raw: 58, fetched_at: 'c' },
        errors: [{ source: 'vix', reason: 'VIX timeout' }],
      },
      NOW,
    );
    expect(out.vix.status).toBe('fetch-failed');
    if (out.vix.status === 'fetch-failed') {
      expect(out.vix.error).toContain('VIX timeout');
    }
  });

  it('maps missing keys with no errors[] to fetch-failed with a fallback reason', () => {
    const out = parseSidecar({}, NOW);
    expect(out.vix.status).toBe('fetch-failed');
    expect(out.sp500.status).toBe('fetch-failed');
    expect(out.s5fi.status).toBe('fetch-failed');
  });

  it('rejects sp500 with fewer than 2 closes as fetch-failed', () => {
    const out = parseSidecar(
      { sp500: { closes: [100], latest_date: 'd', fetched_at: 'b' } },
      NOW,
    );
    expect(out.sp500.status).toBe('fetch-failed');
  });

  it('rejects non-finite vix raw as fetch-failed', () => {
    const out = parseSidecar({ vix: { raw: Number.NaN, fetched_at: 'a' } }, NOW);
    expect(out.vix.status).toBe('fetch-failed');
  });
});
