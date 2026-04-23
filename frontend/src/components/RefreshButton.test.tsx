import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../lib/api.js', () => ({
  refreshSnapshot: vi.fn(),
}));

import { refreshSnapshot } from '../lib/api.js';
import { RefreshButton } from './RefreshButton.js';

function withClient(node: ReactNode, client = new QueryClient()) {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe('<RefreshButton>', () => {
  beforeEach(() => {
    vi.mocked(refreshSnapshot).mockReset();
  });

  it('renders the idle label initially', () => {
    render(withClient(<RefreshButton />));
    expect(screen.getByRole('button', { name: /Fetch a new snapshot now/ })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent(/Refresh/);
  });

  it('enters busy state while the refresh is in flight and calls onSuccess', async () => {
    let resolve!: () => void;
    vi.mocked(refreshSnapshot).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = () => r({ inserted: true } as never);
        }),
    );
    const onSuccess = vi.fn();
    render(withClient(<RefreshButton onSuccess={onSuccess} />));
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent(/Refreshing/);

    await act(async () => {
      resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(button).not.toBeDisabled());
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(refreshSnapshot).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error alert when the refresh fails', async () => {
    vi.mocked(refreshSnapshot).mockRejectedValueOnce(new Error('boom'));
    render(withClient(<RefreshButton />));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveAttribute('title', 'boom');
  });

  it('ignores double-clicks while busy', async () => {
    let resolve!: () => void;
    vi.mocked(refreshSnapshot).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = () => r({ inserted: true } as never);
        }),
    );
    render(withClient(<RefreshButton />));
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(refreshSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
  });
});
