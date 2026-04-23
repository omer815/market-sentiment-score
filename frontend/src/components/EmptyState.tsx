import { copy } from '../lib/copy.js';

interface Props {
  /** Copy variant. `firstLoad` = an auto-refresh is in flight; `failed` = last attempt errored. */
  variant?: 'firstLoad' | 'failed';
}

export function EmptyState({ variant = 'firstLoad' }: Props) {
  const text = variant === 'failed' ? copy.empty.firstLoadFailed : copy.empty.firstLoad;
  return (
    <div className="card state-box" role="status" aria-live="polite">
      {text}
    </div>
  );
}
