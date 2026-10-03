/**
 * Final Results Screen (Task 3.2): total score, rank, a map with all five
 * guesses vs actual locations, a per-round breakdown, leaderboard submission,
 * share and Play Again.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Flame, Home, RotateCcw, Send, Trophy } from 'lucide-react';
import { useGame, useSettings } from '../game/store';
import { formatDistance } from '../lib/geo';
import { flagUrl } from '../lib/locations';
import { MAX_GAME_POINTS, MAX_ROUND_POINTS, ROUNDS_PER_GAME, rankFor, totalPoints, DIFFICULTIES } from '../lib/scoring';
import { submitScore } from '../lib/api';
import { load } from '../lib/storage';
import { useCountUp } from '../hooks/useCountUp';
import ResultMap, { type Pair } from './ResultMap';
import LeaderboardModal from './LeaderboardModal';

export default function ResultsScreen() {
  const { rounds, results, difficulty, mode, session, startGame, quitToMenu, starting } = useGame();
  const { unit, playerName, setPlayerName } = useSettings();
  const [focus, setFocus] = useState<number | null>(null);
  const [name, setName] = useState(playerName);
  const [submit, setSubmit] = useState<{ state: 'idle' | 'sending' | 'done' | 'error'; msg?: string }>({ state: 'idle' });
  const [copied, setCopied] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  const total = totalPoints(results);
  const shown = useCountUp(total, 1600, 300);
  const rank = rankFor(total);
  const best = load<number>(`best:${difficulty}:${mode}`, 0);
  const isBest = total >= best && total > 0;

  const pairs = useMemo<Pair[]>(
    () => rounds.map((r, i) => ({ actual: r.anomaly, guess: r.guess, label: String(i + 1), tooltip: `${i + 1}. ${r.anomaly.country}` })),
    [rounds],
  );

  const dists = results.map((r) => r.distanceKm).filter((d): d is number => d !== null);
  const avgKm = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;
  const bestRound = results.reduce((b, r, i) => (r.points > results[b].points ? i : b), 0);
  const maxStreak = Math.max(0, ...results.map((r) => r.streak));
  const totalTime = rounds.reduce((s, r) => s + r.timeMs, 0) / 1000;

  const send = async () => {
    if (!session) return;
    setSubmit({ state: 'sending' });
    setPlayerName(name.trim());
    try {
      const res = await submitScore(
        session.token,
        name.trim(),
        rounds.map((r) => ({ id: r.anomaly.id, guess: r.guess, hints: r.hints, timeMs: Math.round(r.timeMs) })),
      );
      setSubmit({ state: 'done', msg: `Rank #${res.rank} of ${res.total} · verified ${res.score.toLocaleString('en-US')} pts` });
    } catch (e) {
      setSubmit({ state: 'error', msg: (e as Error).message });
    }
  };

  const share = async () => {
    // Wordle-style emoji summary: green = great, yellow = ok, red = miss.
    const squares = results.map((r) => (r.base >= 4000 ? '🟩' : r.base >= 2500 ? '🟨' : r.base > 0 ? '🟧' : '🟥')).join('');
    const text = `MULTIVERSE RECON ${mode === 'daily' ? `· Daily ${session?.day ?? new Date().toISOString().slice(0, 10)}` : ''} · ${DIFFICULTIES[difficulty].label}\n${squares}  ${total.toLocaleString('en-US')} pts · ${rank.title}\n${location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy your result:', text);
    }
  };

  return (
    <div className="bg-grid fixed inset-0 overflow-y-auto bg-void">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 sm:p-6">
        {/* Header */}
        <motion.header className="hud-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <motion.div
            className="grid h-24 w-24 shrink-0 place-items-center border-2 border-tva bg-tva/10 font-mono text-6xl font-bold text-tva text-glow"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 12 }}
            style={{ clipPath: 'polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)' }}
          >
            {rank.tier}
          </motion.div>
          <div className="flex-1">
            <p className="font-mono text-[10px] tracking-[0.35em] text-doom uppercase">
              TVA assessment complete · {DIFFICULTIES[difficulty].label} · {mode === 'daily' ? 'Daily Anomaly' : 'Classic'}
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">{rank.title}</h1>
            <p className="text-glow font-mono text-5xl font-bold text-doom sm:text-6xl">
              {shown.toLocaleString('en-US')}
              <span className="ml-2 text-base text-mute">/ {(MAX_ROUND_POINTS * ROUNDS_PER_GAME).toLocaleString('en-US')} base</span>
            </p>
            <p className="mt-1 font-mono text-xs text-mute">
              {isBest ? <span className="text-tva">★ New personal best</span> : <>Personal best {best.toLocaleString('en-US')}</>} · theoretical max with full streak{' '}
              {MAX_GAME_POINTS.toLocaleString('en-US')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:w-64">
            <Stat label="Avg distance" value={avgKm === null ? '—' : formatDistance(avgKm, unit)} />
            <Stat label="Best round" value={`#${bestRound + 1}`} />
            <Stat label="Max streak" value={String(maxStreak)} accent />
            <Stat label="Time" value={`${totalTime.toFixed(0)}s`} />
          </div>
        </motion.header>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Summary map */}
          <section className="hud-panel h-[46dvh] min-h-[300px] overflow-hidden !p-0 lg:h-auto lg:min-h-[480px]">
            <ResultMap pairs={pairs} focus={focus} />
          </section>

          {/* Round table */}
          <section className="hud-panel flex flex-col p-3 sm:p-4">
            <h2 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-mute uppercase">Anomaly log</h2>
            <ol className="flex flex-col gap-1.5">
              {rounds.map((r, i) => {
                const res = results[i];
                const flag = flagUrl(r.anomaly.iso);
                return (
                  <li
                    key={r.anomaly.id}
                    className={`flex cursor-pointer items-center gap-3 border px-3 py-2 transition ${focus === i ? 'border-doom bg-doom/5' : 'border-edge bg-void/40 hover:border-doom/50'}`}
                    onMouseEnter={() => setFocus(i)}
                    onClick={() => setFocus(i)}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center bg-tva font-mono text-xs font-bold text-void">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {flag && <img src={flag} alt="" className="h-3 w-auto" />}
                        {r.anomaly.country}
                      </p>
                      <p className="truncate font-mono text-[10px] text-mute">
                        {res.distanceKm === null ? 'no guess' : formatDistance(res.distanceKm, unit)}
                        {res.multiplier > 1 && (
                          <span className="text-tva">
                            {' '}
                            · <Flame size={9} className="inline" /> ×{res.multiplier.toFixed(1)}
                          </span>
                        )}
                        {r.hints.length > 0 && <> · {r.hints.length} intel</>}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-doom">{res.points.toLocaleString('en-US')}</span>
                  </li>
                );
              })}
            </ol>

            {/* Leaderboard submission */}
            <div className="mt-4 border-t border-doom/15 pt-3">
              <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] text-mute uppercase">
                <Trophy size={12} className="text-tva" /> Global leaderboard
              </h2>
              {!session ? (
                <p className="text-xs text-mute">This run was played offline, so it can't be verified for the global leaderboard. Your personal best is saved on this device.</p>
              ) : submit.state === 'done' ? (
                <p className="flex items-center gap-1.5 text-sm text-doom">
                  <Check size={15} /> {submit.msg}
                </p>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim().length >= 2) void send();
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 18))}
                    placeholder="Agent name"
                    aria-label="Your name for the leaderboard"
                    className="h-10 min-w-0 flex-1 border border-edge bg-void/60 px-3 font-mono text-sm outline-none focus:border-doom"
                    maxLength={18}
                  />
                  <button className="btn-doom h-10 px-4 text-xs" disabled={name.trim().length < 2 || submit.state === 'sending'}>
                    <Send size={13} /> {submit.state === 'sending' ? 'Verifying…' : 'Submit'}
                  </button>
                </form>
              )}
              {submit.state === 'error' && <p className="mt-1 text-xs text-rift">Couldn't submit: {submit.msg}</p>}
              <button className="mt-2 text-xs text-doom-dim underline-offset-2 hover:text-doom hover:underline" onClick={() => setBoardOpen(true)}>
                View leaderboard →
              </button>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pb-6 sm:flex-row sm:justify-center">
          <button className="btn-doom h-12 px-8 text-sm" onClick={() => startGame(difficulty, mode)} disabled={starting}>
            <RotateCcw size={16} /> Play again
          </button>
          <button className="btn-ghost h-12 px-6 text-sm" onClick={share}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied!' : 'Share result'}
          </button>
          <button className="btn-ghost h-12 px-6 text-sm" onClick={quitToMenu}>
            <Home size={16} /> Main menu
          </button>
        </div>
      </div>
      <LeaderboardModal open={boardOpen} onClose={() => setBoardOpen(false)} initialDifficulty={difficulty} initialMode={mode} highlight={name.trim()} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-edge bg-void/50 px-2 py-2">
      <p className="font-mono text-[9px] tracking-[0.2em] text-mute uppercase">{label}</p>
      <p className={`font-mono text-base font-bold ${accent ? 'text-tva' : 'text-ink'}`}>{value}</p>
    </div>
  );
}
