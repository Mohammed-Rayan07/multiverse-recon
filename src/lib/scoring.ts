/**
 * TVA Assessment – scoring rules (Task 3.1) plus the bonus mechanics of
 * Task 4 (time limits, Nexus streak multiplier, difficulty levels, hints).
 *
 * Pure functions only. The browser uses them to show the score instantly and
 * the leaderboard API runs the exact same code to re-score a submitted game,
 * so a tampered client cannot post a fake total.
 */
import { haversineKm, type LatLng } from './geo';

/** Maximum base points a single round can award. */
export const MAX_ROUND_POINTS = 5000;
/** Guesses at or beyond this distance score exactly zero. */
export const ZERO_POINTS_KM = 7000;
/** Guesses within this radius are a "perfect convergence" and get full points. */
export const PERFECT_RADIUS_KM = 0.05; // 50 metres
/** How quickly points fall off. Smaller = harsher. */
export const DECAY_KM = 1500;
export const ROUNDS_PER_GAME = 5;

/**
 * Base points for a guess `km` away from the true location.
 *
 * Exponential decay feels fair: being 50 km off in the right city is very
 * different from being 50 km off by 3000 km, while far misses all feel
 * equally "lost". The raw curve 5000·e^(−d/1500) never reaches zero, so we
 * rescale it to hit exactly 0 at ZERO_POINTS_KM:
 *
 *   points(d) = 5000 · (e^(−d/s) − e^(−C/s)) / (1 − e^(−C/s))      for d < C
 *   points(d) = 0                                                  for d ≥ C
 *
 * with s = DECAY_KM and C = ZERO_POINTS_KM. Inverse-proportional to distance,
 * continuous, capped at 5000, and zero past the threshold – exactly what 3.1 asks for.
 */
export function basePoints(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  if (km <= PERFECT_RADIUS_KM) return MAX_ROUND_POINTS;
  if (km >= ZERO_POINTS_KM) return 0;
  const floor = Math.exp(-ZERO_POINTS_KM / DECAY_KM);
  const raw = (Math.exp(-km / DECAY_KM) - floor) / (1 - floor);
  return Math.round(MAX_ROUND_POINTS * raw);
}

/* ------------------------------------------------------------------ */
/* Difficulty levels (bonus 4.1)                                       */
/* ------------------------------------------------------------------ */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  codename: string;
  blurb: string;
  /** Seconds per round – Time Dilation. */
  timeLimit: number;
  /** Hints available in this mode (Easy only). */
  hints: boolean;
  /** Starting horizontal field of view in degrees (smaller = more zoomed in). */
  fov: number;
  /** If true the player cannot zoom out from the starting field of view. */
  lockZoom: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    codename: 'Variant',
    blurb: '3:00 per round · free look & zoom · paid intel (region, country, search zone)',
    timeLimit: 180,
    hints: true,
    fov: 90,
    lockZoom: false,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    codename: 'Minuteman',
    blurb: '1:30 per round · free look & zoom · no intel',
    timeLimit: 90,
    hints: false,
    fov: 90,
    lockZoom: false,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    codename: 'Hunter',
    blurb: '0:45 per round · zoomed-in view, zoom locked · no intel',
    timeLimit: 45,
    hints: false,
    fov: 38,
    lockZoom: true,
  },
};

/* ------------------------------------------------------------------ */
/* Hints (Easy mode)                                                   */
/* ------------------------------------------------------------------ */

export type HintId = 'region' | 'country' | 'zone';

/** Each hint keeps a fraction of the round's points. They stack multiplicatively. */
export const HINTS: { id: HintId; label: string; keep: number }[] = [
  { id: 'region', label: 'Reveal region', keep: 0.85 },
  { id: 'country', label: 'Reveal country', keep: 0.7 },
  { id: 'zone', label: 'Show 1000 km search zone', keep: 0.75 },
];

export function hintFactor(hints: HintId[]): number {
  return [...new Set(hints)].reduce((f, id) => f * (HINTS.find((h) => h.id === id)?.keep ?? 1), 1);
}

/* ------------------------------------------------------------------ */
/* Nexus Streaks (bonus 4.1)                                           */
/* ------------------------------------------------------------------ */

/** A round counts toward the streak if its base score reaches this (≈ within ~500 km). */
export const STREAK_THRESHOLD = 3500;
export const STREAK_STEP = 0.1;
export const STREAK_MAX = 1.4;

/** Multiplier for a streak of `n` consecutive accurate rounds (1 → ×1.0, 2 → ×1.1 … 5 → ×1.4). */
export function streakMultiplier(n: number): number {
  if (n <= 1) return 1;
  return Math.min(STREAK_MAX, 1 + STREAK_STEP * (n - 1));
}

/* ------------------------------------------------------------------ */
/* Round + game evaluation                                             */
/* ------------------------------------------------------------------ */

export interface RoundInput {
  actual: LatLng;
  /** null when the timer expired without a guess. */
  guess: LatLng | null;
  hints: HintId[];
}

export interface RoundResult {
  distanceKm: number | null;
  base: number;
  hintFactor: number;
  streak: number;
  multiplier: number;
  /** Final points for the round after hints and streak. */
  points: number;
}

/**
 * Score a whole sequence of rounds. The streak depends on previous rounds,
 * so rounds are always evaluated in order.
 */
export function scoreRounds(rounds: RoundInput[]): RoundResult[] {
  let streak = 0;
  return rounds.map((r) => {
    const distanceKm = r.guess ? haversineKm(r.actual, r.guess) : null;
    const base = distanceKm === null ? 0 : basePoints(distanceKm);
    streak = base >= STREAK_THRESHOLD ? streak + 1 : 0;
    const multiplier = streakMultiplier(streak);
    const hf = hintFactor(r.hints);
    return {
      distanceKm,
      base,
      hintFactor: hf,
      streak,
      multiplier,
      points: Math.round(base * hf * multiplier),
    };
  });
}

export function totalPoints(results: RoundResult[]): number {
  return results.reduce((s, r) => s + r.points, 0);
}

/** Highest total a game can reach: five perfect rounds with a full streak. */
export const MAX_GAME_POINTS = Array.from({ length: ROUNDS_PER_GAME }, (_, i) =>
  Math.round(MAX_ROUND_POINTS * streakMultiplier(i + 1)),
).reduce((a, b) => a + b, 0);

/** Letter grade used on the results screen. */
export function rankFor(total: number): { tier: string; title: string } {
  const pct = total / (MAX_ROUND_POINTS * ROUNDS_PER_GAME);
  if (pct >= 0.9) return { tier: 'S', title: 'Sorcerer Supreme' };
  if (pct >= 0.75) return { tier: 'A', title: 'Timeline Guardian' };
  if (pct >= 0.55) return { tier: 'B', title: 'TVA Field Agent' };
  if (pct >= 0.35) return { tier: 'C', title: 'Nexus Drifter' };
  if (pct >= 0.15) return { tier: 'D', title: 'Lost Variant' };
  return { tier: 'F', title: 'Pruned' };
}
