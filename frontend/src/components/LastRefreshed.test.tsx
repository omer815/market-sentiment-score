import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LastRefreshed } from './LastRefreshed.js';

const NOW = new Date('2026-04-23T20:00:00.000Z').getTime();

describe('<LastRefreshed>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the age on mount', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    render(<LastRefreshed fetchedAt={iso} />);
    expect(screen.getByText(/5 m ago/)).toBeInTheDocument();
  });

  it('re-renders on interval tick', () => {
    const iso = new Date(NOW - 2 * 60_000).toISOString();
    render(<LastRefreshed fetchedAt={iso} intervalMs={1000} />);
    expect(screen.getByText(/2 m ago/)).toBeInTheDocument();
    act(() => {
      vi.setSystemTime(new Date(NOW + 4 * 60_000));
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/6 m ago/)).toBeInTheDocument();
  });

  it('sets aria-label and title for accessibility', () => {
    const iso = new Date(NOW - 60_000).toISOString();
    render(<LastRefreshed fetchedAt={iso} />);
    const el = screen.getByText(/1 m ago/).parentElement;
    expect(el).toHaveAttribute('aria-label', expect.stringContaining('Last refreshed'));
    expect(el).toHaveAttribute('title', iso);
  });
});
