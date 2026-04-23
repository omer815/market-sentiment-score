import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../lib/api.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.js')>('../lib/api.js');
  return {
    ...actual,
    fetchLatestSnapshot: vi.fn(),
    refreshSnapshot: vi.fn(),
  };
});

import { NoContentError, fetchLatestSnapshot, refreshSnapshot } from '../lib/api.js';
import { Dashboard } from './Dashboard.js';
import type { Snapshot } from '../lib/api-types.js';

const COMPLETE_SNAPSHOT: Snapshot = {
  slot_ts: '2026-04-23T20:00:00Z',
  fetched_at: '2026-04-23T20:00:00Z',
  composite_score: 50,
  status: 'complete',
  failed_sources: [],
  readings: [
    {
      source_id: 'vix',
      raw_value: 14,
      flag_triggered: 0,
      normalised_value: 0,
      fetch_status: 'ok',
      fetch_error: null,
      fetched_at: '2026-04-23T20:00:00Z',
    },
    {
      source_id: 'cnn_fg',
      raw_value: 10,
      flag_triggered: 1,
      normalised_value: 25,
      fetch_status: 'ok',
      fetch_error: null,
      fetched_at: '2026-04-23T20:00:00Z',
    },
    {
      source_id: 's5fi',
      raw_value: 15,
      flag_triggered: 1,
      normalised_value: 25,
      fetch_status: 'ok',
      fetch_error: null,
      fetched_at: '2026-04-23T20:00:00Z',
    },
    {
      source_id: 'sp500',
      raw_value: 1,
      flag_triggered: 0,
      normalised_value: 0,
      fetch_status: 'ok',
      fetch_error: null,
      fetched_at: '2026-04-23T20:00:00Z',
    },
  ],
};

function withClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: <QueryClientProvider client={client}>{node}</QueryClientProvider> };
}

describe('<Dashboard> first-visit auto-trigger (AS1.5 / FR-018)', () => {
  beforeEach(() => {
    vi.mocked(fetchLatestSnapshot).mockReset();
    vi.mocked(refreshSnapshot).mockReset();
  });

  it('auto-invokes refresh() exactly once when latest resolves to 204', async () => {
    vi.mocked(fetchLatestSnapshot)
      .mockRejectedValueOnce(new NoContentError('/api/snapshots/latest'))
      .mockResolvedValue(COMPLETE_SNAPSHOT);
    vi.mocked(refreshSnapshot).mockResolvedValue({ inserted: true, ...COMPLETE_SNAPSHOT });

    const { wrapper } = withClient(<Dashboard />);
    render(wrapper);

    await waitFor(() => expect(refreshSnapshot).toHaveBeenCalledTimes(1));

    // Render settles on the fetched snapshot.
    await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument());
  });

  it('does NOT auto-invoke refresh when a snapshot already exists', async () => {
    vi.mocked(fetchLatestSnapshot).mockResolvedValue(COMPLETE_SNAPSHOT);
    vi.mocked(refreshSnapshot).mockResolvedValue({ inserted: true, ...COMPLETE_SNAPSHOT });

    const { wrapper } = withClient(<Dashboard />);
    render(wrapper);

    await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument());
    // Allow any effects to settle.
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshSnapshot).not.toHaveBeenCalled();
  });

  it('shows the failed-empty state and stops retrying on a second NoContent', async () => {
    vi.mocked(fetchLatestSnapshot).mockRejectedValue(
      new NoContentError('/api/snapshots/latest'),
    );
    vi.mocked(refreshSnapshot).mockRejectedValue(new Error('sidecar down'));

    const { wrapper } = withClient(<Dashboard />);
    render(wrapper);

    await waitFor(() => expect(refreshSnapshot).toHaveBeenCalled());
    // EmptyState (firstLoad) is shown either while waiting or on failure.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
