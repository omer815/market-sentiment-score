import { copy } from '../lib/copy.js';

interface Props {
  fetchedAt: string;
  now?: number;
}

export function StaleBadge({ fetchedAt, now = Date.now() }: Props) {
  const ageMs = now - new Date(fetchedAt).getTime();
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 45) return null;
  return (
    <span className="badge badge--stale" aria-label={copy.badge.staleAria(mins)}>
      {copy.snapshot.staleMinutes(mins)}
    </span>
  );
}
