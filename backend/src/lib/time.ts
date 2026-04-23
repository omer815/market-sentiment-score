export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(date: Date | number): string {
  return new Date(date).toISOString();
}

export function minutesAgo(iso: string, referenceMs: number = Date.now()): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((referenceMs - then) / 60_000));
}

export function hoursSince(iso: string, referenceMs: number = Date.now()): number {
  return minutesAgo(iso, referenceMs) / 60;
}
