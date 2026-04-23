import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartialBadge } from './PartialBadge.js';

describe('<PartialBadge>', () => {
  it('renders nothing when no sources failed', () => {
    const { container } = render(<PartialBadge failed={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists failed sources by human name in aria-label', () => {
    render(<PartialBadge failed={['cnn_fg', 'vix']} />);
    const badge = screen.getByText(/Partial/);
    expect(badge).toHaveAttribute(
      'aria-label',
      expect.stringContaining('CNN Fear & Greed'),
    );
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('VIX'));
  });

  it('singular vs plural "source"', () => {
    const { rerender } = render(<PartialBadge failed={['vix']} />);
    expect(screen.getByText(/Partial · 1 source$/)).toBeInTheDocument();
    rerender(<PartialBadge failed={['vix', 'cnn_fg']} />);
    expect(screen.getByText(/Partial · 2 sources/)).toBeInTheDocument();
  });
});
