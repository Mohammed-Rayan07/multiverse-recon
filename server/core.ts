/**
 * Leaderboard backend (bonus 4.1 – Leaderboards with shared persistent storage).
 *
 * Two endpoints, written as standard Web `Request -> Response` handlers so the
 * same code runs as Vercel Functions in production and as Vite middleware in dev:
 *
 *   POST /api/session  → server picks the 5 locations for a ranked game and
 *                        returns them with an HMAC-signed token.
 *   GET  /api/scores   → top scores for a difficulty / mode (and day for daily).
 *   POST /api/scores   → submit a finished game. The server NEVER trusts a
 *                        client-sent score: it verifies the token, checks the
 *                        rules (timer limits, hints only in Easy, no replays)
 *                        and re-computes every distance and point itself.
 *
 * Storage: Neon serverless Postgres when DATABASE_URL is set, otherwise an
 * in-memory store so `npm run dev` works with zero configuration.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { ANOMALIES, getAnomaly } from '../src/lib/locations';
import { dayKey, hashSeed, pickAnomalies } from '../src/lib/pick';
import {
  DIFFICULTIES,
  ROUNDS_PER_GAME,
  scoreRounds,
  totalPoints,
  type Difficulty,
  type HintId,
} from '../src/lib/scoring';

export type Mode = 'classic' | 'daily';

/** Spare locations included in each session in case an image fails to load. */
const SPARES = 3;
/** A ranked session must be submitted within this window. */
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
/** Network / rendering slack added to every round's time limit. */
const TIME_GRACE_MS = 8000;

const SECRET = process.env.LEADERBOARD_SECRET || 'dev-only-secret-change-me';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const isDifficulty = (d: unknown): d is Difficulty => d === 'easy' || d === 'medium' || d === 'hard';
const isMode = (m: unknown): m is Mode => m === 'classic' || m === 'daily';

/** The signed part of a session. Everything the server must later trust lives here. */
interface SessionClaims {
  sid: string;
  difficulty: Difficulty;
  mode: Mode;
  day: string | null;
  ids: string[];
  iat: number;
}

function encodeToken(c: SessionClaims): string {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decodeToken(token: unknown): SessionClaims | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sign(body), sig)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionClaims;
  } catch {
    return null;
  }
}

/** Keep names printable and short; no HTML ever reaches other players. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.normalize('NFKC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return cleaned.length >= 2 ? cleaned : null;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export interface ScoreRow {
  name: string;
  score: number;
  difficulty: Difficulty;
  mode: Mode;
  day: string | null;
  avgKm: number | null;
  createdAt: string;
}

interface Store {
  insert(sessionId: string, row: ScoreRow, rounds: unknown): Promise<'ok' | 'duplicate'>;
  top(difficulty: Difficulty, mode: Mode, day: string | null, limit: number): Promise<ScoreRow[]>;
  rank(difficulty: Difficulty, mode: Mode, day: string | null, score: number): Promise<{ rank: number; total: number }>;
}

function memoryStore(): Store {
  const rows: (ScoreRow & { sid: string })[] = [];
  const match = (r: ScoreRow, d: Difficulty, m: Mode, day: string | null) =>
    r.difficulty === d && r.mode === m && (m === 'classic' || r.day === day);
  return {
    async insert(sid, row) {
      if (rows.some((r) => r.sid === sid)) return 'duplicate';
      rows.push({ ...row, sid });
      return 'ok';
    },
    async top(d, m, day, limit) {
      return rows.filter((r) => match(r, d, m, day)).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    async rank(d, m, day, score) {
      const list = rows.filter((r) => match(r, d, m, day));
      return { rank: list.filter((r) => r.score > score).length + 1, total: list.length };
    },
  };
}

function neonStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  // Create the table on first use – no migration step needed for judges.
  const init = () =>
    (ready ??= sql`
      CREATE TABLE IF NOT EXISTS scores (
        id          BIGSERIAL PRIMARY KEY,
        session_id  TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        score       INTEGER NOT NULL,
        difficulty  TEXT NOT NULL,
        mode        TEXT NOT NULL,
        day         TEXT,
        avg_km      REAL,
        rounds      JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`.then(() => sql`CREATE INDEX IF NOT EXISTS scores_board_idx ON scores (difficulty, mode, day, score DESC)`));

  const toRow = (r: Record<string, unknown>): ScoreRow => ({
    name: String(r.name),
    score: Number(r.score),
    difficulty: r.difficulty as Difficulty,
    mode: r.mode as Mode,
    day: (r.day as string) ?? null,
    avgKm: r.avg_km === null ? null : Number(r.avg_km),
    createdAt: new Date(r.created_at as string).toISOString(),
  });

  return {
    async insert(sid, row, rounds) {
      await init();
      const res = await sql`
        INSERT INTO scores (session_id, name, score, difficulty, mode, day, avg_km, rounds)
        VALUES (${sid}, ${row.name}, ${row.score}, ${row.difficulty}, ${row.mode}, ${row.day}, ${row.avgKm}, ${JSON.stringify(rounds)})
        ON CONFLICT (session_id) DO NOTHING
        RETURNING id`;
      return res.length ? 'ok' : 'duplicate';
    },
    async top(d, m, day, limit) {
      await init();
      const res =
        m === 'daily'
          ? await sql`SELECT * FROM scores WHERE difficulty=${d} AND mode=${m} AND day=${day} ORDER BY score DESC, created_at ASC LIMIT ${limit}`
          : await sql`SELECT * FROM scores WHERE difficulty=${d} AND mode=${m} ORDER BY score DESC, created_at ASC LIMIT ${limit}`;
      return res.map(toRow);
    },
    async rank(d, m, day, score) {
      await init();
      const res =
        m === 'daily'
          ? await sql`SELECT count(*) FILTER (WHERE score > ${score})::int AS above, count(*)::int AS total FROM scores WHERE difficulty=${d} AND mode=${m} AND day=${day}`
          : await sql`SELECT count(*) FILTER (WHERE score > ${score})::int AS above, count(*)::int AS total FROM scores WHERE difficulty=${d} AND mode=${m}`;
      return { rank: Number(res[0].above) + 1, total: Number(res[0].total) };
    },
  };
}

let store: Store | null = null;
function getStore(): Store {
  return (store ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : memoryStore());
}

/* ------------------------------------------------------------------ */
/* POST /api/session                                                   */
/* ------------------------------------------------------------------ */

export async function createSession(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { difficulty?: unknown; mode?: unknown; avoid?: unknown };
  const difficulty = isDifficulty(body.difficulty) ? body.difficulty : 'medium';
  const mode = isMode(body.mode) ? body.mode : 'classic';
  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];

  const day = mode === 'daily' ? dayKey() : null;
  // The daily anomaly uses the date as its seed, so every player gets the same five places.
  const picks = pickAnomalies(ANOMALIES, {
    count: ROUNDS_PER_GAME + SPARES,
    seed: day ? hashSeed(`daily-${day}`) : undefined,
    avoid: day ? [] : avoid,
  });

  const claims: SessionClaims = {
    sid: randomUUID(),
    difficulty,
    mode,
    day,
    ids: picks.map((p) => p.id),
    iat: Date.now(),
  };
  return json({ ...claims, token: encodeToken(claims) });
}

/* ------------------------------------------------------------------ */
/* /api/scores                                                         */
/* ------------------------------------------------------------------ */

interface SubmittedRound {
  id: string;
  guess: { lat: number; lng: number } | null;
  hints: HintId[];
  timeMs: number;
}

export async function getScores(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const difficulty = url.searchParams.get('difficulty');
  const mode = url.searchParams.get('mode') ?? 'classic';
  if (!isDifficulty(difficulty) || !isMode(mode)) return json({ error: 'bad query' }, 400);
  const day = mode === 'daily' ? (url.searchParams.get('day') ?? dayKey()) : null;
  try {
    const rows = await getStore().top(difficulty, mode, day, 25);
    return json({ rows, day, storage: process.env.DATABASE_URL ? 'postgres' : 'memory' });
  } catch (err) {
    console.error(err);
    return json({ error: 'leaderboard unavailable' }, 503);
  }
}

export async function submitScore(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { token?: unknown; name?: unknown; rounds?: unknown } | null;
  if (!body) return json({ error: 'invalid body' }, 400);

  const claims = decodeToken(body.token);
  if (!claims) return json({ error: 'invalid or tampered session token' }, 403);
  if (Date.now() - claims.iat > SESSION_TTL_MS) return json({ error: 'session expired' }, 410);

  const name = cleanName(body.name);
  if (!name) return json({ error: 'name must be 2–18 letters or numbers' }, 400);

  const rounds = body.rounds as SubmittedRound[];
  if (!Array.isArray(rounds) || rounds.length !== ROUNDS_PER_GAME) return json({ error: 'a game has exactly 5 rounds' }, 400);

  const cfg = DIFFICULTIES[claims.difficulty];
  const ids = new Set<string>();
  let totalMs = 0;
  for (const r of rounds) {
    // Every location must come from this session's signed set, no repeats.
    if (!r || typeof r.id !== 'string' || !claims.ids.includes(r.id) || ids.has(r.id)) {
      return json({ error: 'round location not part of this session' }, 400);
    }
    ids.add(r.id);
    if (r.guess !== null) {
      const { lat, lng } = r.guess ?? {};
      if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) {
        return json({ error: 'invalid guess coordinates' }, 400);
      }
    }
    if (!Array.isArray(r.hints) || (!cfg.hints && r.hints.length > 0)) return json({ error: 'hints are not allowed in this mode' }, 400);
    if (typeof r.timeMs !== 'number' || r.timeMs < 0 || r.timeMs > cfg.timeLimit * 1000 + TIME_GRACE_MS) {
      return json({ error: 'round exceeded the time limit' }, 400);
    }
    totalMs += r.timeMs;
  }
  // Wall-clock sanity check: you cannot finish faster than the time you claim to have spent.
  if (Date.now() - claims.iat + TIME_GRACE_MS < totalMs) return json({ error: 'timing does not add up' }, 400);

  // Authoritative re-scoring with the exact same code the client uses.
  const results = scoreRounds(
    rounds.map((r) => {
      const a = getAnomaly(r.id)!;
      return { actual: { lat: a.lat, lng: a.lng }, guess: r.guess, hints: r.hints };
    }),
  );
  const score = totalPoints(results);
  const dists = results.map((r) => r.distanceKm).filter((d): d is number => d !== null);
  const avgKm = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;

  const row: ScoreRow = {
    name,
    score,
    difficulty: claims.difficulty,
    mode: claims.mode,
    day: claims.day,
    avgKm,
    createdAt: new Date().toISOString(),
  };

  try {
    const s = getStore();
    const status = await s.insert(claims.sid, row, rounds.map((r, i) => ({ ...r, points: results[i].points })));
    if (status === 'duplicate') return json({ error: 'this game was already submitted' }, 409);
    const { rank, total } = await s.rank(claims.difficulty, claims.mode, claims.day, score);
    return json({ ok: true, score, rank, total });
  } catch (err) {
    console.error(err);
    return json({ error: 'leaderboard unavailable' }, 503);
  }
}
