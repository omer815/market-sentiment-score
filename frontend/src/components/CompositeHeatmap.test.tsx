import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompositeHeatmap } from './CompositeHeatmap.js';

describe('<CompositeHeatmap>', () => {
  it.each([0, 25, 50, 75, 100] as const)('renders numeric + label for %i', (score) => {
    render(<CompositeHeatmap score={score} />);
    expect(screen.getByText(String(score))).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining(`${score} of 100`),
    );
  });

  it('renders all 5 heatmap cells, marking the active one', () => {
    render(<CompositeHeatmap score={50} />);
    const cells = document.querySelectorAll('.heatmap__cell');
    expect(cells.length).toBe(5);
    const active = document.querySelectorAll('.heatmap__cell--active');
    expect(active.length).toBe(1);
  });
});
