import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/tradingview.js', () => ({
  getQuote: vi.fn(),
}));

import { getQuote } from '../../src/tradingview.js';
import { fetchVix } from '../../src/fetchers/vix.js';

describe('fetchVix', () => {
  beforeEach(() => {
    vi.mocked(getQuote).mockReset();
  });

  it('returns the raw TradingView quote', async () => {
    vi.mocked(getQuote).mockResolvedValue(14.2);
    const out = await fetchVix();
    expect(out.raw).toBe(14.2);
    expect(out.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('propagates upstream errors', async () => {
    vi.mocked(getQuote).mockRejectedValue(new Error('symbol-not-found'));
    await expect(fetchVix()).rejects.toThrow(/symbol-not-found/);
  });
});
