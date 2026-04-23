import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/fetchers/vix.js', () => ({ fetchVix: vi.fn() }));
vi.mock('../../src/fetchers/s5fi.js', () => ({ fetchS5fi: vi.fn() }));
vi.mock('../../src/fetchers/sp500-daily.js', () => ({ fetchSp500Daily: vi.fn() }));

import { fetchVix } from '../../src/fetchers/vix.js';
import { fetchS5fi } from '../../src/fetchers/s5fi.js';
import { fetchSp500Daily } from '../../src/fetchers/sp500-daily.js';
import handler from '../../api/fetch.js';

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(body: unknown): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  return res;
}

describe('sidecar POST /fetch', () => {
  beforeEach(() => {
    vi.mocked(fetchVix).mockReset();
    vi.mocked(fetchS5fi).mockReset();
    vi.mocked(fetchSp500Daily).mockReset();
  });

  it('returns 200 with all three payloads when every fetch succeeds', async () => {
    vi.mocked(fetchVix).mockResolvedValue({ raw: 14.2, fetched_at: '2026-04-23T20:00:00.000Z' });
    vi.mocked(fetchS5fi).mockResolvedValue({ raw: 58.4, fetched_at: '2026-04-23T20:00:00.000Z' });
    vi.mocked(fetchSp500Daily).mockResolvedValue({
      closes: [5100, 5080, 5060],
      latest_date: '2026-04-22',
      fetched_at: '2026-04-23T20:00:00.000Z',
    });

    const res = makeRes();
    // @ts-expect-error lightweight mock req
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      vix: { raw: 14.2, fetched_at: '2026-04-23T20:00:00.000Z' },
      sp500: {
        closes: [5100, 5080, 5060],
        latest_date: '2026-04-22',
        fetched_at: '2026-04-23T20:00:00.000Z',
      },
      s5fi: { raw: 58.4, fetched_at: '2026-04-23T20:00:00.000Z' },
    });
  });

  it('omits a key and lists it under errors when one fetcher fails', async () => {
    vi.mocked(fetchVix).mockRejectedValue(new Error('VIX symbol not found'));
    vi.mocked(fetchS5fi).mockResolvedValue({ raw: 58.4, fetched_at: 't' });
    vi.mocked(fetchSp500Daily).mockResolvedValue({
      closes: [1, 2],
      latest_date: 'd',
      fetched_at: 't',
    });

    const res = makeRes();
    // @ts-expect-error lightweight mock req
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      vix?: unknown;
      s5fi?: unknown;
      sp500?: unknown;
      errors?: Array<{ source: string; reason: string }>;
    };
    expect(body.vix).toBeUndefined();
    expect(body.s5fi).toBeDefined();
    expect(body.sp500).toBeDefined();
    expect(body.errors).toEqual([{ source: 'vix', reason: 'VIX symbol not found' }]);
  });

  it('returns 502 when every fetcher fails', async () => {
    vi.mocked(fetchVix).mockRejectedValue(new Error('a'));
    vi.mocked(fetchS5fi).mockRejectedValue(new Error('b'));
    vi.mocked(fetchSp500Daily).mockRejectedValue(new Error('c'));

    const res = makeRes();
    // @ts-expect-error lightweight mock req
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toBe('upstream_failed');
  });

  it('rejects non-POST methods', async () => {
    const res = makeRes();
    // @ts-expect-error lightweight mock req
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});
