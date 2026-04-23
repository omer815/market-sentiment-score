import { describe, expect, it } from 'vitest';
import { formatRelative } from './relative-time.js';

const NOW = Date.UTC(2026, 3, 23, 20, 0, 0);

describe('formatRelative', () => {
  it('returns "just now" for < 45 s', () => {
    expect(formatRelative(new Date(NOW - 5_000).toISOString(), NOW)).toBe('just now');
    expect(formatRelative(new Date(NOW - 44_000).toISOString(), NOW)).toBe('just now');
  });

  it('returns minutes for < 1 h', () => {
    expect(formatRelative(new Date(NOW - 60_000).toISOString(), NOW)).toBe('1 m ago');
    expect(formatRelative(new Date(NOW - 3 * 60_000).toISOString(), NOW)).toBe('3 m ago');
    expect(formatRelative(new Date(NOW - 59 * 60_000).toISOString(), NOW)).toBe('59 m ago');
  });

  it('returns hours for < 1 d', () => {
    expect(formatRelative(new Date(NOW - 60 * 60_000).toISOString(), NOW)).toBe('1 h ago');
    expect(formatRelative(new Date(NOW - 5 * 60 * 60_000).toISOString(), NOW)).toBe('5 h ago');
  });

  it('returns days beyond that', () => {
    expect(formatRelative(new Date(NOW - 24 * 60 * 60_000).toISOString(), NOW)).toBe('1 d ago');
    expect(formatRelative(new Date(NOW - 3 * 24 * 60 * 60_000).toISOString(), NOW)).toBe('3 d ago');
  });

  it('handles invalid ISO gracefully', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('unknown');
  });

  it('clamps future timestamps to "just now" (not negative)', () => {
    expect(formatRelative(new Date(NOW + 10_000).toISOString(), NOW)).toBe('just now');
  });
});
