/**
 * Time Dilation (bonus 4.1): circular countdown for the current round.
 * When it reaches zero the current marker is locked in automatically
 * (or the round scores 0 if no marker was placed).
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { DIFFICULTIES } from '../lib/scoring';
import { sfx } from '../lib/sound';

export default function Timer() {
  const phase = useGame((s) => s.phase);
  const difficulty = useGame((s) => s.difficulty);
  const paused = useGame((s) => s.pauseReasons.length > 0);
  const timeLeftMs = useGame((s) => s.timeLeftMs);
  const submitGuess = useGame((s) => s.submitGuess);
  const limit = DIFFICULTIES[difficulty].timeLimit * 1000;
  const [left, setLeft] = useState(limit);
  const lastTick = useRef(-1);

  useEffect(() => {
    if (phase !== 'guessing') {
      // Loading: show a full clock. Reveal: keep showing the time that was left at lock-in.
      if (phase === 'loading') setLeft(limit);
      lastTick.current = -1;
      return;
    }
    const id = window.setInterval(() => {
      const ms = timeLeftMs();
      setLeft(ms);
      const secs = Math.ceil(ms / 1000);
      if (secs <= 10 && secs > 0 && secs !== lastTick.current) {
        lastTick.current = secs;
        sfx.tick();
      }
      if (ms <= 0) {
        window.clearInterval(id);
        submitGuess(true);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, limit, timeLeftMs, submitGuess]);

  const secs = Math.ceil(left / 1000);
  const frac = Math.max(0, Math.min(1, left / limit));
  const danger = secs <= 10 && phase === 'guessing';
  const R = 22;
  const C = 2 * Math.PI * R;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div
      className="relative grid h-14 w-14 shrink-0 place-items-center"
      data-tour="timer"
      role="timer"
      aria-label={`${secs} seconds left`}
      title={paused ? 'Timer paused' : 'Time left this round'}
    >
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r={R} fill="rgb(4 7 10 / 0.7)" stroke="rgb(43 255 136 / 0.15)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke={danger ? 'var(--color-rift)' : frac < 0.4 ? 'var(--color-tva)' : 'var(--color-doom)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`relative font-mono text-[13px] font-bold ${danger ? 'animate-pulse text-rift' : 'text-ink'}`}>
        {mm}:{ss}
      </span>
      {paused && phase === 'guessing' && (
        <span className="absolute -bottom-4 font-mono text-[9px] tracking-widest text-tva uppercase">paused</span>
      )}
    </div>
  );
}
