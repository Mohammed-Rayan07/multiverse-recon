/**
 * Leaderboard API tests: run against the in-memory store.
 * They check that the server re-scores games itself and rejects tampering.
 */
import { beforeAll, describe, expect, it } from 'vitest';

let core: typeof import('./core');
let locations: typeof import('../src/lib/locations');

beforeAll(async () => {
  delete process.env.DATABASE_URL; // force the in-memory store
  core = await import('./core');
  locations = await import('../src/lib/locations');
});

const post = (path: string, body: unknown) =>
  new Request(`http://test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

async function newSession(difficulty = 'medium', mode = 'classic') {
  const res = await core.createSession(post('/api/session', { difficulty, mode }));
  return (await res.json()) as { sid: string; ids: string[]; token: string; iat: number };
}

function perfectRounds(ids: string[]) {
  return ids.slice(0, 5).map((id) => {
    const a = locations.getAnomaly(id)!;
    return { id, guess: { lat: a.lat, lng: a.lng }, hints: [], timeMs: 0 };
  });
}

describe('session + score submission', () => {
  it('issues 5 + spare distinct locations', async () => {
    const s = await newSession();
    expect(s.ids.length).toBe(8);
    expect(new Set(s.ids).size).toBe(8);
  });

  it('gives every player the same daily locations', async () => {
    const a = await newSession('medium', 'daily');
    const b = await newSession('hard', 'daily');
    expect(a.ids).toEqual(b.ids);
  });

  it('re-computes the score on the server and ignores any client total', async () => {
    const s = await newSession();
    const res = await core.submitScore(post('/api/scores', { token: s.token, name: 'Loki', rounds: perfectRounds(s.ids), score: 99999999 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.score).toBe(5000 + 5500 + 6000 + 6500 + 7000); // perfect game with full streak
  });

  it('rejects a tampered token', async () => {
    const s = await newSession();
    const bad = s.token.slice(0, -2) + (s.token.endsWith('A') ? 'BB' : 'AA');
    const res = await core.submitScore(post('/api/scores', { token: bad, name: 'Kang', rounds: perfectRounds(s.ids) }));
    expect(res.status).toBe(403);
  });

  it('rejects locations that were not part of the session', async () => {
    const s = await newSession();
    const other = locations.ANOMALIES.find((a) => !s.ids.includes(a.id))!;
    const rounds = perfectRounds(s.ids);
    rounds[0] = { id: other.id, guess: { lat: other.lat, lng: other.lng }, hints: [], timeMs: 0 };
    const res = await core.submitScore(post('/api/scores', { token: s.token, name: 'Kang', rounds }));
    expect(res.status).toBe(400);
  });

  it('rejects hints outside Easy mode and over-time rounds', async () => {
    const s = await newSession('hard');
    const hinted = perfectRounds(s.ids).map((r) => ({ ...r, hints: ['country'] }));
    expect((await core.submitScore(post('/api/scores', { token: s.token, name: 'Sylvie', rounds: hinted }))).status).toBe(400);
    const slow = perfectRounds(s.ids).map((r) => ({ ...r, timeMs: 10 * 60 * 1000 }));
    expect((await core.submitScore(post('/api/scores', { token: s.token, name: 'Sylvie', rounds: slow }))).status).toBe(400);
  });

  it('rejects replaying the same session', async () => {
    const s = await newSession();
    const body = { token: s.token, name: 'Mobius', rounds: perfectRounds(s.ids) };
    expect((await core.submitScore(post('/api/scores', body))).status).toBe(200);
    expect((await core.submitScore(post('/api/scores', body))).status).toBe(409);
  });

  it('sanitises player names', () => {
    expect(core.cleanName('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(core.cleanName('  Doctor   Doom  ')).toBe('Doctor Doom');
    expect(core.cleanName('x')).toBeNull();
  });

  it('serves the leaderboard sorted by score', async () => {
    const res = await core.getScores(new Request('http://test/api/scores?difficulty=medium&mode=classic'));
    const { rows } = await res.json();
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  });
});
