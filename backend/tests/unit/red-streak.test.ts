import { describe, expect, it } from 'vitest';
import { redDayTailStreak } from '../../src/scoring/flags.js';

describe('redDayTailStreak — exhaustive boundary cases', () => {
  it('returns 0 for empty or single-element arrays', () => {
    expect(redDayTailStreak([])).toBe(0);
    expect(redDayTailStreak([100])).toBe(0);
  });

  it.each([
    [[100, 99], 1],
    [[100, 99, 98], 2],
    [[100, 99, 98, 97], 3],
    [[100, 99, 98, 97, 96], 4],
    [[100, 99, 98, 97, 96, 95], 5],
  ])('counts %j as streak %i', (closes, expected) => {
    expect(redDayTailStreak(closes)).toBe(expected);
  });

  it('treats an equal close as non-red (breaks the streak)', () => {
    expect(redDayTailStreak([100, 99, 99])).toBe(0);
    expect(redDayTailStreak([100, 99, 98, 98])).toBe(0);
  });

  it('treats an up close as non-red', () => {
    expect(redDayTailStreak([100, 99, 98, 100])).toBe(0);
  });

  it('counts only the trailing streak, not embedded ones', () => {
    //         down down  up  down down down
    expect(redDayTailStreak([100, 99, 98, 100, 99, 98, 97])).toBe(3);
  });

  it('works for small streaks with noisy history', () => {
    expect(redDayTailStreak([50, 60, 55, 56, 55])).toBe(1);
  });
});
