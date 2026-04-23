import type { SourceReading } from '../lib/api-types.js';
import { copy } from '../lib/copy.js';

interface Props {
  reading: SourceReading;
}

export function FlagRow({ reading }: Props) {
  const meta = copy.flag[reading.source_id];
  const isTriggered = reading.flag_triggered === 1;
  const isMissing =
    reading.fetch_status !== 'ok' && reading.fetch_status !== 'stale-source';

  const rawLabel = formatRaw(reading);
  const points = reading.normalised_value ?? 0;

  const stateLabel = isMissing
    ? copy.flagState.missing
    : reading.fetch_status === 'stale-source'
      ? copy.flagState.stale
      : isTriggered
        ? copy.flagState.triggered
        : copy.flagState.ok;

  return (
    <div
      className={`flag-row${isTriggered ? ' flag-row--triggered' : ''}`}
      data-source-id={reading.source_id}
      data-state={stateLabel.toLowerCase()}
    >
      <div>
        <div>
          <strong>{meta.name}</strong>
        </div>
        <div className="flag-row__rule">{meta.rule}</div>
      </div>
      <div className="flag-row__raw" aria-label={`Raw value: ${rawLabel}`}>
        {rawLabel}
      </div>
      <div className="flag-row__points" aria-label={`Points contributed: ${points}`}>
        {isMissing ? '—' : `${points}`}
      </div>
    </div>
  );
}

function formatRaw(reading: SourceReading): string {
  if (reading.raw_value == null) return '—';
  switch (reading.source_id) {
    case 'vix':
      return reading.raw_value.toFixed(2);
    case 'cnn_fg':
      return reading.raw_value.toFixed(0);
    case 's5fi':
      return `${reading.raw_value.toFixed(1)}%`;
    case 'sp500':
      return `${reading.raw_value.toFixed(0)} red day${reading.raw_value === 1 ? '' : 's'}`;
  }
}
