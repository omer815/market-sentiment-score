import type { SourceId } from '../lib/api-types.js';
import { copy } from '../lib/copy.js';

interface Props {
  failed: SourceId[];
}

export function PartialBadge({ failed }: Props) {
  if (failed.length === 0) return null;
  const names = failed.map((id) => copy.flag[id].name).join(', ');
  return (
    <span
      className="badge badge--partial"
      title={copy.badge.partialTitle(names)}
      aria-label={copy.badge.partialAria(names)}
    >
      {copy.badge.partial(failed.length)}
    </span>
  );
}
