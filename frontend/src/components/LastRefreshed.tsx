import { useEffect, useState } from 'react';
import { formatRelative } from '../lib/relative-time.js';
import { copy } from '../lib/copy.js';

interface Props {
  /** ISO-8601 timestamp of the most recent successful fetch. */
  fetchedAt: string;
  /** How often to re-render (ms). Defaults to 30 s so "3 m ago" stays fresh. */
  intervalMs?: number;
}

export function LastRefreshed({ fetchedAt, intervalMs = 30_000 }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const rel = formatRelative(fetchedAt, now);
  return (
    <span
      className="last-refreshed"
      aria-label={copy.lastRefreshed.ariaLabel(rel)}
      title={fetchedAt}
    >
      {copy.lastRefreshed.prefix}: <time dateTime={fetchedAt}>{rel}</time>
    </span>
  );
}
