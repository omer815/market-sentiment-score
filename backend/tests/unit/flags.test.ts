import { describe, it, expect } from 'vitest';
import {
  evaluateVix,
  evaluateFg,
  evaluateS5fi,
  evaluateSp500,
  redDayTailStreak,
} from '../../src/scoring/flags.js';
import type { ScoringConfig } from '../../src/config.js';

const cfg: ScoringConfig = {
  VIX_THRESHOLD: 30,
  FG_THRESHOLD: 20,
  S5FI_THRESHOLD: 20,
  SP500_RED_DAYS_MIN: 3,
};

describe('evaluateVix', () => {
  it('triggers strictly above threshold', () => {
    expect(evaluateVix(30.0001, cfg).triggered).toBe(1);
    expect(evaluateVix(30, cfg).triggered).toBe(0);
    expect(evaluateVix(29.9, cfg).triggered).toBe(0);
  });
  it('points = 25 when triggered, 0 otherwise', () => {
    expect(evaluateVix(32, cfg).points).toBe(25);
    expect(evaluateVix(10, cfg).points).toBe(0);
  });
});

describe('evaluateFg', () => {
  it('triggers strictly below threshold', () => {
    expect(evaluateFg(19.9, cfg).triggered).toBe(1);
    expect(evaluateFg(20, cfg).triggered).toBe(0);
    expect(evaluateFg(25, cfg).triggered).toBe(0);
  });
});

describe('evaluateS5fi', () => {
  it('triggers strictly below threshold', () => {
    expect(evaluateS5fi(19, cfg).triggered).toBe(1);
    expect(evaluateS5fi(20, cfg).triggered).toBe(0);
    expect(evaluateS5fi(55, cfg).triggered).toBe(0);
  });
});

describe('redDayTailStreak', () => {
  it('returns 0 when fewer than 2 closes', () => {
    expect(redDayTailStreak([])).toBe(0);
    expect(redDayTailStreak([100])).toBe(0);
  });
  it('counts trailing consecutive red days only', () => {
    // ups then 3 reds
    expect(redDayTailStreak([90, 95, 100, 99, 98, 97])).toBe(3);
    // one red then one up tail
    expect(redDayTailStreak([100, 99, 100])).toBe(0);
    // all reds
    expect(redDayTailStreak([110, 105, 100, 95])).toBe(3);
    // flat bar stops the streak (close < prior close required)
    expect(redDayTailStreak([100, 99, 99])).toBe(0);
  });
});

describe('evaluateSp500', () => {
  it('triggers when tail-streak >= min', () => {
    expect(evaluateSp500([100, 99, 98, 97], cfg).triggered).toBe(1);
    expect(evaluateSp500([100, 99, 98, 97, 96], cfg).triggered).toBe(1);
  });
  it('does not trigger for streak < min', () => {
    expect(evaluateSp500([100, 99, 98], cfg).triggered).toBe(0);
    expect(evaluateSp500([95, 100, 99], cfg).triggered).toBe(0);
  });
});
