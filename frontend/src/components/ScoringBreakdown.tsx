import type { SourceReading } from '../lib/api-types.js';
import { SOURCE_ORDER } from '../lib/copy.js';
import { FlagRow } from './FlagRow.js';

interface Props {
  readings: SourceReading[];
}

export function ScoringBreakdown({ readings }: Props) {
  const byId = new Map(readings.map((r) => [r.source_id, r]));
  return (
    <section aria-label="Scoring breakdown" className="breakdown">
      {SOURCE_ORDER.map((id) => {
        const r = byId.get(id);
        if (!r) return null;
        return <FlagRow key={id} reading={r} />;
      })}
    </section>
  );
}
