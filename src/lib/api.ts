/**
 * Client for the leaderboard API (see server/core.ts).
 * Every call fails soft: if the API is unreachable the game keeps working
 * as an unranked session and scores are kept locally.
 */
import type { Difficulty, HintId } from './scoring';

export type Mode = 'classic' | 'daily';

export interface RankedSession {
  sid: string;
  difficulty: Difficulty;
  mode: Mode;
  day: string | null;
  ids: string[];
  iat: number;
  token: string;
}

export interface LeaderboardRow {
  name: string;
  score: number;
  difficulty: Difficulty;
  mode: Mode;
  day: string | null;
  avgKm: number | null;
  createdAt: string;
}

export interface SubmitRound {
  id: string;
  guess: { lat: number; lng: number } | null;
  hints: HintId[];
  timeMs: number;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export function startRankedSession(difficulty: Difficulty, mode: Mode, avoid: string[]): Promise<RankedSession> {
  return request('/api/session', { method: 'POST', body: JSON.stringify({ difficulty, mode, avoid }) }, 4000);
}

export function fetchLeaderboard(difficulty: Difficulty, mode: Mode): Promise<{ rows: LeaderboardRow[]; day: string | null; storage: string }> {
  return request(`/api/scores?difficulty=${difficulty}&mode=${mode}`);
}

export function submitScore(token: string, name: string, rounds: SubmitRound[]): Promise<{ ok: true; score: number; rank: number; total: number }> {
  return request('/api/scores', { method: 'POST', body: JSON.stringify({ token, name, rounds }) });
}
