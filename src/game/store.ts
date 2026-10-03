/**
 * Game state machine (Task 3.2 – Multi-Round Gameplay).
 *
 *   menu ──startGame──▶ game[loading ─panoReady─▶ guessing ─submit─▶ reveal] ×5 ──▶ results
 *                         ▲                                              │
 *                         └──────────────────── nextRound ───────────────┘
 *
 * Zustand keeps it in one place; components subscribe to the slices they need.
 */
import { create } from 'zustand';
import { normalizeLatLng, type DistanceUnit, type LatLng } from '../lib/geo';
import { ANOMALIES, getAnomaly, type Anomaly } from '../lib/locations';
import { dayKey, hashSeed, pickAnomalies } from '../lib/pick';
import {
  DIFFICULTIES,
  ROUNDS_PER_GAME,
  scoreRounds,
  totalPoints,
  type Difficulty,
  type HintId,
  type RoundResult,
} from '../lib/scoring';
import { startRankedSession, type Mode, type RankedSession } from '../lib/api';
import { load, save } from '../lib/storage';
import { setMuted, sfx } from '../lib/sound';

export type Screen = 'menu' | 'game' | 'results';
export type Phase = 'loading' | 'guessing' | 'reveal';

export interface RoundRecord {
  anomaly: Anomaly;
  /** Normalised guess (lng wrapped into [-180, 180]) or null if time ran out. */
  guess: LatLng | null;
  hints: HintId[];
  timeMs: number;
  timedOut: boolean;
}

interface GameState {
  screen: Screen;
  phase: Phase;
  difficulty: Difficulty;
  mode: Mode;
  /** Ranked session from the API, or null when playing offline / unranked. */
  session: RankedSession | null;
  starting: boolean;
  /** Five anomalies plus spares used if an image fails to load. */
  queue: Anomaly[];
  round: number;
  anomaly: Anomaly | null;
  /** Marker position as displayed on the map (may be on a wrapped world copy). */
  marker: LatLng | null;
  hints: HintId[];
  rounds: RoundRecord[];
  results: RoundResult[];
  /** Timer: absolute deadline while running, remaining ms while paused. */
  deadline: number | null;
  pausedRemaining: number | null;
  pauseReasons: string[];
  notice: string | null;

  startGame: (difficulty: Difficulty, mode: Mode) => Promise<void>;
  panoReady: () => void;
  panoFailed: () => void;
  setMarker: (p: LatLng | null) => void;
  useHint: (id: HintId) => void;
  submitGuess: (timedOut?: boolean) => void;
  nextRound: () => void;
  quitToMenu: () => void;
  pause: (reason: string) => void;
  resume: (reason: string) => void;
  timeLeftMs: () => number;
}

const RECENT_KEY = 'recent';
const MAX_RECENT = 60;

export const useGame = create<GameState>((set, get) => ({
  screen: 'menu',
  phase: 'loading',
  difficulty: load<Difficulty>('difficulty', 'medium'),
  mode: 'classic',
  session: null,
  starting: false,
  queue: [],
  round: 0,
  anomaly: null,
  marker: null,
  hints: [],
  rounds: [],
  results: [],
  deadline: null,
  pausedRemaining: null,
  pauseReasons: [],
  notice: null,

  async startGame(difficulty, mode) {
    if (get().starting) return;
    set({ starting: true, difficulty, mode, notice: null });
    save('difficulty', difficulty);
    const recent = load<string[]>(RECENT_KEY, []);

    // Ranked: the server picks the locations and signs them. Fallback: pick locally (unranked).
    let session: RankedSession | null = null;
    let queue: Anomaly[] = [];
    try {
      session = await startRankedSession(difficulty, mode, recent);
      queue = session.ids.map((id) => getAnomaly(id)).filter((a): a is Anomaly => !!a);
      if (queue.length < ROUNDS_PER_GAME) throw new Error('dataset mismatch');
    } catch {
      session = null;
      const seed = mode === 'daily' ? hashSeed(`daily-${dayKey()}`) : undefined;
      queue = pickAnomalies(ANOMALIES, { count: ROUNDS_PER_GAME + 3, seed, avoid: mode === 'daily' ? [] : recent });
    }

    sfx.portal();
    set({
      screen: 'game',
      phase: 'loading',
      session,
      starting: false,
      queue,
      round: 0,
      anomaly: queue[0],
      marker: null,
      hints: [],
      rounds: [],
      results: [],
      deadline: null,
      pausedRemaining: null,
      pauseReasons: [],
      notice: session ? null : 'Offline mode: this run is unranked',
    });
  },

  panoReady() {
    const { phase, difficulty, pauseReasons } = get();
    if (phase !== 'loading') return;
    const limit = DIFFICULTIES[difficulty].timeLimit * 1000;
    // The clock only starts once the panorama is actually visible.
    if (pauseReasons.length) set({ phase: 'guessing', deadline: null, pausedRemaining: limit });
    else set({ phase: 'guessing', deadline: Date.now() + limit, pausedRemaining: null });
  },

  panoFailed() {
    // Image failed to load: drop it and pull in the next spare location.
    const { queue, round, session } = get();
    const remaining = queue.filter((_, i) => i !== round);
    if (remaining.length >= ROUNDS_PER_GAME) {
      set({ queue: remaining, anomaly: remaining[round], notice: 'Anomaly unstable – rerouting to another location' });
      return;
    }
    // Out of spares (very unlikely): continue unranked with a fresh random location.
    const used = new Set(queue.map((a) => a.id));
    const extra = pickAnomalies(ANOMALIES.filter((a) => !used.has(a.id)), { count: 1 })[0];
    const next = [...remaining.slice(0, round), extra, ...remaining.slice(round)];
    set({ queue: next, anomaly: extra, session: session ? null : session, notice: 'Rerouted – this run is now unranked' });
  },

  setMarker(p) {
    if (get().phase !== 'guessing') return;
    set({ marker: p });
  },

  useHint(id) {
    const { hints, difficulty, phase } = get();
    if (!DIFFICULTIES[difficulty].hints || phase !== 'guessing' || hints.includes(id)) return;
    sfx.click();
    set({ hints: [...hints, id] });
  },

  submitGuess(timedOut = false) {
    const s = get();
    if (s.phase !== 'guessing' || !s.anomaly) return;
    const limit = DIFFICULTIES[s.difficulty].timeLimit * 1000;
    const timeMs = Math.min(limit, Math.max(0, limit - s.timeLeftMs()));
    const record: RoundRecord = {
      anomaly: s.anomaly,
      guess: s.marker ? normalizeLatLng(s.marker) : null,
      hints: s.hints,
      timeMs,
      timedOut,
    };
    const rounds = [...s.rounds, record];
    const results = scoreRounds(rounds.map((r) => ({ actual: r.anomaly, guess: r.guess, hints: r.hints })));
    const last = results[results.length - 1];

    if (timedOut && !record.guess) sfx.timeout();
    else sfx.lock();
    setTimeout(() => {
      sfx.reveal(last.base / 5000);
      if (last.multiplier > 1) setTimeout(sfx.streak, 350);
    }, 250);

    // Remember recently seen locations so the next game avoids them.
    const recent = [s.anomaly.id, ...load<string[]>(RECENT_KEY, []).filter((id) => id !== s.anomaly!.id)].slice(0, MAX_RECENT);
    save(RECENT_KEY, recent);

    set({ phase: 'reveal', rounds, results, deadline: null, pausedRemaining: null });
  },

  nextRound() {
    const { round, queue, phase, rounds, results, difficulty, mode } = get();
    if (phase !== 'reveal') return;
    if (round + 1 >= ROUNDS_PER_GAME) {
      sfx.finale();
      // Personal best + history (local only).
      const total = totalPoints(results);
      const bestKey = `best:${difficulty}:${mode}`;
      if (total > load<number>(bestKey, 0)) save(bestKey, total);
      const history = load<{ total: number; difficulty: Difficulty; mode: Mode; at: string }[]>('history', []);
      save('history', [{ total, difficulty, mode, at: new Date().toISOString() }, ...history].slice(0, 30));
      set({ screen: 'results', rounds });
      return;
    }
    sfx.portal();
    set({ round: round + 1, anomaly: queue[round + 1], phase: 'loading', marker: null, hints: [], notice: null });
  },

  quitToMenu() {
    set({ screen: 'menu', phase: 'loading', anomaly: null, marker: null, deadline: null, pausedRemaining: null, pauseReasons: [] });
  },

  pause(reason) {
    const { pauseReasons, deadline } = get();
    if (pauseReasons.includes(reason)) return;
    const next = [...pauseReasons, reason];
    if (deadline !== null) set({ pauseReasons: next, pausedRemaining: Math.max(0, deadline - Date.now()), deadline: null });
    else set({ pauseReasons: next });
  },

  resume(reason) {
    const { pauseReasons, pausedRemaining, phase } = get();
    const next = pauseReasons.filter((r) => r !== reason);
    if (next.length === 0 && pausedRemaining !== null && phase === 'guessing') {
      set({ pauseReasons: next, deadline: Date.now() + pausedRemaining, pausedRemaining: null });
    } else set({ pauseReasons: next });
  },

  timeLeftMs() {
    const { deadline, pausedRemaining, difficulty } = get();
    if (deadline !== null) return Math.max(0, deadline - Date.now());
    if (pausedRemaining !== null) return pausedRemaining;
    return DIFFICULTIES[difficulty].timeLimit * 1000;
  },
}));

/* ------------------------------------------------------------------ */
/* Player settings (persisted per browser)                             */
/* ------------------------------------------------------------------ */

interface SettingsState {
  unit: DistanceUnit;
  muted: boolean;
  tourSeen: boolean;
  playerName: string;
  setUnit: (u: DistanceUnit) => void;
  toggleMute: () => void;
  setTourSeen: (v: boolean) => void;
  setPlayerName: (n: string) => void;
}

const initialMuted = load<boolean>('muted', false);
setMuted(initialMuted);

export const useSettings = create<SettingsState>((set) => ({
  unit: load<DistanceUnit>('unit', 'km'),
  muted: initialMuted,
  tourSeen: load<boolean>('tourSeen', false),
  playerName: load<string>('playerName', ''),
  setUnit: (unit) => {
    save('unit', unit);
    set({ unit });
  },
  toggleMute: () =>
    set((s) => {
      save('muted', !s.muted);
      setMuted(!s.muted);
      return { muted: !s.muted };
    }),
  setTourSeen: (tourSeen) => {
    save('tourSeen', tourSeen);
    set({ tourSeen });
  },
  setPlayerName: (playerName) => {
    save('playerName', playerName);
    set({ playerName });
  },
}));

// Dev-only handle for debugging in the browser console.
if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;
