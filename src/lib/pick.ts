/**
 * Random anomaly selection (Task 2.1).
 *
 * Shared by the browser (offline / casual games) and the /api/session endpoint
 * (ranked games), so both pick locations with the same rules:
 *   - 5 distinct locations, never two from the same country in one game
 *   - spread across as many continents as possible
 *   - avoid locations the player saw recently
 *   - optional seed → deterministic picks (the Daily Anomaly is identical for everyone)
 */
import type { Anomaly } from './locations';

/** mulberry32 – tiny, fast, good-enough seeded PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string (e.g. "daily-2026-10-04") into a 32-bit seed (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTC day key used for the daily challenge, e.g. "2026-10-04". */
export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface PickOptions {
  count: number;
  /** Deterministic seed. Omit for Math.random. */
  seed?: number;
  /** IDs to avoid (recently played). Ignored if it would leave too few candidates. */
  avoid?: Iterable<string>;
}

export function pickAnomalies(pool: Anomaly[], { count, seed, avoid }: PickOptions): Anomaly[] {
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  const avoidSet = new Set(avoid ?? []);
  let candidates = pool.filter((a) => !avoidSet.has(a.id));
  if (candidates.length < count * 4) candidates = [...pool];

  // Fisher–Yates shuffle
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Greedy pass: prefer unseen continents first, never repeat a country.
  const picked: Anomaly[] = [];
  const countries = new Set<string>();
  const continents = new Set<string>();
  for (const pass of [0, 1]) {
    for (const a of shuffled) {
      if (picked.length >= count) break;
      if (picked.includes(a) || countries.has(a.country)) continue;
      if (pass === 0 && continents.has(a.continent)) continue;
      picked.push(a);
      countries.add(a.country);
      continents.add(a.continent);
    }
  }
  // Final fallback for tiny pools.
  for (const a of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(a)) picked.push(a);
  }

  // Shuffle the final order so the continent-first pass doesn't create a pattern.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}
