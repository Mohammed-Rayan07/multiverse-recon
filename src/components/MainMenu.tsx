/**
 * Main menu: pick Classic or the Daily Anomaly, choose a difficulty and start.
 * A random panorama slowly rotates behind the menu as a live backdrop.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, CalendarDays, Globe2, Loader2, Play, Ruler, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { useGame, useSettings } from '../game/store';
import { ANOMALIES, panoramaUrl } from '../lib/locations';
import { dayKey } from '../lib/pick';
import { DIFFICULTIES, type Difficulty } from '../lib/scoring';
import type { Mode } from '../lib/api';
import { load } from '../lib/storage';
import { sfx } from '../lib/sound';
// three.js is heavy: load the 360° backdrop after the menu has painted.
const PanoViewer = lazy(() => import('./PanoViewer'));
import LeaderboardModal from './LeaderboardModal';
import ScoringModal from './ScoringModal';

const COUNTRIES = new Set(ANOMALIES.map((a) => a.country)).size;
const CONTINENTS = new Set(ANOMALIES.map((a) => a.continent)).size;

export default function MainMenu() {
  const { startGame, starting, difficulty: lastDifficulty } = useGame();
  const { unit, setUnit, muted, toggleMute } = useSettings();
  const [difficulty, setDifficulty] = useState<Difficulty>(lastDifficulty);
  const [mode, setMode] = useState<Mode>('classic');
  const [board, setBoard] = useState(false);
  const [rules, setRules] = useState(false);
  const backdrop = useMemo(() => ANOMALIES[Math.floor(Math.random() * ANOMALIES.length)], []);
  const best = load<number>(`best:${difficulty}:${mode}`, 0);

  // Prefetch the game screen chunk while the player is choosing a mode.
  useEffect(() => {
    const id = window.setTimeout(() => void import('./GameScreen'), 1200);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="fixed inset-0 overflow-y-auto">
      {/* Live 360° backdrop */}
      <div className="fixed inset-0 opacity-45">
        {backdrop && (
          <Suspense fallback={null}>
            <PanoViewer url={panoramaUrl(backdrop, 1920)} fov={80} lockZoom={false} autoRotate interactive={false} />
          </Suspense>
        )}
      </div>
      <div className="bg-grid scanlines fixed inset-0 bg-gradient-to-b from-void/70 via-void/55 to-void" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 animate-scan bg-gradient-to-b from-transparent via-doom/5 to-transparent" />

      <main className="relative mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-6 px-4 py-8 sm:gap-8 sm:py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="animate-flicker font-mono text-[11px] tracking-[0.45em] text-doom uppercase">Silicon Maze · Doomsday Edition</p>
          <h1 className="text-glow mt-2 text-5xl leading-[0.9] font-extrabold tracking-tight sm:text-7xl md:text-8xl">
            MULTIVERSE
            <br />
            <span className="text-doom">RECON</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-ink/80 sm:text-lg">
            The multiverse is collapsing. You'll be dropped into a real 360° panorama somewhere on Earth. Find it on the Nexus Map before the timeline fractures.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-mute">
            <span className="flex items-center gap-1">
              <Globe2 size={12} className="text-doom" /> {ANOMALIES.length} anomalies
            </span>
            <span>{COUNTRIES} countries</span>
            <span>{CONTINENTS} continents</span>
            <span>5 rounds · 25,000 base pts</span>
          </p>
        </motion.div>

        <motion.section
          className="hud-panel hud-glow p-4 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          {/* Mode */}
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { id: 'classic', icon: Zap, title: 'Classic', text: 'Five random anomalies from across the globe.' },
                { id: 'daily', icon: CalendarDays, title: 'Daily anomaly', text: `Same five places for every agent today (${dayKey()}). One shared board.` },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  sfx.click();
                  setMode(m.id);
                }}
                className={`flex items-start gap-3 border p-3 text-left transition ${mode === m.id ? 'border-doom bg-doom/10' : 'border-edge bg-void/40 hover:border-doom/50'}`}
                aria-pressed={mode === m.id}
              >
                <m.icon size={18} className={mode === m.id ? 'text-doom' : 'text-mute'} />
                <span>
                  <span className="block font-bold tracking-wide">{m.title}</span>
                  <span className="block text-xs text-mute">{m.text}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Difficulty */}
          <p className="mt-5 mb-2 font-mono text-[10px] tracking-[0.3em] text-mute uppercase">Threat level</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
              const c = DIFFICULTIES[d];
              const active = difficulty === d;
              const color = d === 'easy' ? 'doom' : d === 'medium' ? 'tva' : 'rift';
              return (
                <button
                  key={d}
                  onClick={() => {
                    sfx.click();
                    setDifficulty(d);
                  }}
                  aria-pressed={active}
                  className={`relative border p-3 text-left transition ${active ? '' : 'border-edge bg-void/40 hover:border-ink/30'}`}
                  style={active ? { borderColor: `var(--color-${color})`, background: `color-mix(in srgb, var(--color-${color}) 10%, transparent)` } : undefined}
                >
                  <span className="flex items-baseline justify-between">
                    <span className="text-lg font-bold">{c.label}</span>
                    <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: `var(--color-${color})` }}>
                      {c.codename}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-mute">{c.blurb}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              className="btn-doom h-14 px-10 text-base sm:min-w-64"
              disabled={starting || ANOMALIES.length === 0}
              onClick={() => startGame(difficulty, mode)}
            >
              {starting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              {starting ? 'Opening portal…' : 'Enter the multiverse'}
            </button>
            <p className="font-mono text-[11px] text-mute">
              Personal best ({DIFFICULTIES[difficulty].label}, {mode}): <span className="text-tva">{best.toLocaleString('en-US')}</span>
            </p>
          </div>
        </motion.section>

        <motion.nav className="flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <button className="btn-ghost h-10 px-4 text-xs" onClick={() => setBoard(true)}>
            <Trophy size={14} className="text-tva" /> Leaderboard
          </button>
          <button className="btn-ghost h-10 px-4 text-xs" onClick={() => setRules(true)}>
            <BookOpen size={14} /> How scoring works
          </button>
          <button className="btn-ghost h-10 px-4 text-xs" onClick={() => setUnit(unit === 'km' ? 'mi' : 'km')} aria-label="Toggle distance unit">
            <Ruler size={14} /> {unit === 'km' ? 'Kilometres' : 'Miles'}
          </button>
          <button className="btn-ghost h-10 px-4 text-xs" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />} Sound {muted ? 'off' : 'on'}
          </button>
        </motion.nav>

        <footer className="font-mono text-[10px] leading-relaxed text-mute/80">
          Panoramas: Wikimedia Commons contributors (CC licences, credited after each round) · Map © Esri, © OpenStreetMap contributors · Built for Silicon Maze 2026, Web Enthusiasts' Club NITK
        </footer>
      </main>

      <LeaderboardModal open={board} onClose={() => setBoard(false)} initialDifficulty={difficulty} initialMode={mode} />
      <ScoringModal open={rules} onClose={() => setRules(false)} />
    </div>
  );
}
