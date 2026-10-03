import { describe, expect, it } from 'vitest';
import {
  basePoints,
  hintFactor,
  MAX_GAME_POINTS,
  MAX_ROUND_POINTS,
  scoreRounds,
  streakMultiplier,
  ZERO_POINTS_KM,
} from './scoring';

describe('basePoints', () => {
  it('awards the maximum for a perfect guess', () => {
    expect(basePoints(0)).toBe(MAX_ROUND_POINTS);
    expect(basePoints(0.04)).toBe(MAX_ROUND_POINTS);
  });

  it('awards zero at and beyond the threshold', () => {
    expect(basePoints(ZERO_POINTS_KM)).toBe(0);
    expect(basePoints(ZERO_POINTS_KM + 1)).toBe(0);
    expect(basePoints(20000)).toBe(0);
  });

  it('decreases strictly as distance grows', () => {
    let prev = Infinity;
    for (let km = 1; km < ZERO_POINTS_KM; km += 250) {
      const p = basePoints(km);
      expect(p).toBeLessThan(prev);
      prev = p;
    }
  });

  it('rejects invalid input', () => {
    expect(basePoints(-5)).toBe(0);
    expect(basePoints(Number.NaN)).toBe(0);
  });
});

describe('streaks and hints', () => {
  it('ramps the multiplier and caps it', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBeCloseTo(1.1);
    expect(streakMultiplier(5)).toBeCloseTo(1.4);
    expect(streakMultiplier(50)).toBeCloseTo(1.4);
  });

  it('stacks hint penalties multiplicatively and ignores duplicates', () => {
    expect(hintFactor([])).toBe(1);
    expect(hintFactor(['region'])).toBeCloseTo(0.85);
    expect(hintFactor(['region', 'country', 'region'])).toBeCloseTo(0.85 * 0.7);
  });

  it('breaks the streak on a bad or missing guess', () => {
    const at = { lat: 10, lng: 10 };
    const res = scoreRounds([
      { actual: at, guess: at, hints: [] },
      { actual: at, guess: at, hints: [] },
      { actual: at, guess: null, hints: [] },
      { actual: at, guess: at, hints: [] },
    ]);
    expect(res.map((r) => r.streak)).toEqual([1, 2, 0, 1]);
    expect(res.map((r) => r.points)).toEqual([5000, 5500, 0, 5000]);
  });

  it('computes the theoretical max game score', () => {
    expect(MAX_GAME_POINTS).toBe(5000 + 5500 + 6000 + 6500 + 7000);
  });
});
