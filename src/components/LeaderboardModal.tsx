/**
 * Global leaderboard (bonus 4.1). Scores come from shared Postgres storage via
 * /api/scores, so every player sees the same board. Separate boards per
 * difficulty, for all-time Classic and for today's Daily Anomaly.
 */
import { useEffect, useState } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import { fetchLeaderboard, type LeaderboardRow, type Mode } from '../lib/api';
import { DIFFICULTIES, type Difficulty } from '../lib/scoring';
import { formatDistance } from '../lib/geo';
import { useSettings } from '../game/store';

interface Props {
  open: boolean;
  onClose: () => void;
  initialDifficulty?: Difficulty;
  initialMode?: Mode;
  highlight?: string;
}

export default function LeaderboardModal({ open, onClose, initialDifficulty = 'medium', initialMode = 'classic', highlight }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const unit = useSettings((s) => s.unit);

  useEffect(() => {
    if (open) {
      setDifficulty(initialDifficulty);
      setMode(initialMode);
    }
  }, [open, initialDifficulty, initialMode]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setError(null);
    fetchLeaderboard(difficulty, mode)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setDay(r.day);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, difficulty, mode, nonce]);

  return (
    <Modal open={open} onClose={onClose} title="Global leaderboard" kicker="TVA records division" wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex border border-edge">
          {(['classic', 'daily'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold tracking-widest uppercase ${mode === m ? 'bg-doom text-void' : 'text-mute hover:text-ink'}`}
            >
              {m === 'classic' ? 'All-time' : 'Daily'}
            </button>
          ))}
        </div>
        <div className="flex border border-edge">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 py-1.5 text-xs font-semibold tracking-widest uppercase ${difficulty === d ? 'bg-tva text-void' : 'text-mute hover:text-ink'}`}
            >
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </div>
        <button className="icon-btn ml-auto !h-8 !w-8" onClick={() => setNonce(nonce + 1)} aria-label="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>
      {mode === 'daily' && day && <p className="mb-2 font-mono text-[11px] text-mute">Daily Anomaly for {day} (UTC). Everyone plays the same five locations.</p>}

      {error ? (
        <p className="py-8 text-center text-sm text-rift">Leaderboard unreachable ({error}). Check your connection and try again.</p>
      ) : rows === null ? (
        <div className="space-y-1.5 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse bg-edge/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-mute">No records yet. Be the first agent on this board.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-[0.2em] text-mute uppercase">
              <th className="py-1 text-left">#</th>
              <th className="py-1 text-left">Agent</th>
              <th className="hidden py-1 text-right sm:table-cell">Avg dist</th>
              <th className="py-1 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${r.createdAt}`} className={`border-t border-edge/60 ${highlight && r.name === highlight ? 'bg-doom/10' : ''}`}>
                <td className="py-2 font-mono text-mute">{i === 0 ? <Crown size={14} className="text-tva" /> : i + 1}</td>
                <td className="py-2 font-semibold">{r.name}</td>
                <td className="hidden py-2 text-right font-mono text-xs text-mute sm:table-cell">{r.avgKm === null ? '—' : formatDistance(r.avgKm, unit)}</td>
                <td className="py-2 text-right font-mono font-bold text-doom">{r.score.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-mute">Every score is re-calculated on the server from the submitted guesses, with timer and hint rules enforced and one submission per game, so a total can't be inflated by editing the page.</p>
    </Modal>
  );
}
