import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/tradingview.js', () => ({
  getQuote: vi.fn(),
}));

import { getQuote } from '../../src/tradingview.js';
import { fetchS5fi } from '../../src/fetchers/s5fi.js';

describe('fetchS5fi', () => {
  beforeEach(() => {
    vi.mocked(getQuote).mockReset();
  });

  it('clamps values above 100 down to 100', async () => {
    vi.mocked(getQuote).mockResolvedValue(152);
    const out = await fetchS5fi();
    expect(out.raw).toBe(100);
  });

  it('clamps negatives up to 0', async () => {
    vi.mocked(getQuote).mockResolvedValue(-12);
    const out = await fetchS5fi();
    expect(out.raw).toBe(0);
  });

  it('passes through normal values unchanged', async () => {
    vi.mocked(getQuote).mockResolvedValue(58.4);
    const out = await fetchS5fi();
    expect(out.raw).toBe(58.4);
    expect(out.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
