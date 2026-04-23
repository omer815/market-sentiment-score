import { describe, it, expect } from 'vitest';
import { currentSlot, roundToSlot, isSlotAligned, SLOT_INTERVAL_MS } from '../../src/lib/slot.js';

describe('slot', () => {
  it('rounds down to the most recent 30-min mark (UTC)', () => {
    expect(roundToSlot(new Date('2026-04-23T14:17:42Z'))).toBe('2026-04-23T14:00:00Z');
    expect(roundToSlot(new Date('2026-04-23T14:45:00Z'))).toBe('2026-04-23T14:30:00Z');
    expect(roundToSlot(new Date('2026-04-23T14:30:00Z'))).toBe('2026-04-23T14:30:00Z');
    expect(roundToSlot(new Date('2026-04-23T00:00:00Z'))).toBe('2026-04-23T00:00:00Z');
  });

  it('isSlotAligned accepts aligned and rejects misaligned', () => {
    expect(isSlotAligned('2026-04-23T14:00:00Z')).toBe(true);
    expect(isSlotAligned('2026-04-23T14:30:00Z')).toBe(true);
    expect(isSlotAligned('2026-04-23T14:15:00Z')).toBe(false);
  });

  it('currentSlot is aligned and non-decreasing through wall-clock time', () => {
    const s = currentSlot(new Date('2026-04-23T14:29:59Z'));
    expect(s).toBe('2026-04-23T14:00:00Z');
    const ms = new Date(s).getTime();
    expect(ms % SLOT_INTERVAL_MS).toBe(0);
  });
});
