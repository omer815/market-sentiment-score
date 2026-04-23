export const SLOT_INTERVAL_MS = 30 * 60 * 1000;

export function roundToSlot(date: Date): string {
  const ms = date.getTime();
  const slotMs = Math.floor(ms / SLOT_INTERVAL_MS) * SLOT_INTERVAL_MS;
  return new Date(slotMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function currentSlot(now: Date = new Date()): string {
  return roundToSlot(now);
}

export function isSlotAligned(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t % SLOT_INTERVAL_MS === 0;
}
