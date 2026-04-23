import { HEATMAP_STOPS, heatmapColor, type CompositeStop } from '../lib/heatmap.js';
import { copy } from '../lib/copy.js';

interface Props {
  score: CompositeStop;
}

export function CompositeHeatmap({ score }: Props) {
  return (
    <div
      className="composite"
      role="img"
      aria-label={`${copy.composite.ariaLabel}: ${score} of 100. ${copy.composite.label[score]}.`}
    >
      <div className="heatmap__value" style={{ color: heatmapColor(score) }}>
        {score}
        <span style={{ fontSize: '1.5rem', marginLeft: 6, color: 'var(--color-text-muted)' }}>
          /100
        </span>
      </div>
      <div className="heatmap" aria-hidden="true">
        {HEATMAP_STOPS.map((stop) => (
          <div
            key={stop}
            className={`heatmap__cell${stop === score ? ' heatmap__cell--active' : ''}`}
            style={{ background: heatmapColor(stop) }}
          />
        ))}
      </div>
      <div className="heatmap__label">{copy.composite.label[score]}</div>
    </div>
  );
}
