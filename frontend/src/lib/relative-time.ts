/**
 * Format an ISO timestamp as a short human-relative age, updating the shown
 * value as time passes. Intentionally uses English short units (s, m, h, d)
 * rather than Intl.RelativeTimeFormat so the copy is consistent with the
 * rest of the dashboard and stable across locales.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diff = Math.max(0, now - then);

  if (diff < 45_000) return 'just now';
  if (diff < HOUR) {
    const m = Math.max(1, Math.round(diff / MIN));
    return `${m} m ago`;
  }
  if (diff < DAY) {
    const h = Math.round(diff / HOUR);
    return `${h} h ago`;
  }
  const d = Math.round(diff / DAY);
  return `${d} d ago`;
}
