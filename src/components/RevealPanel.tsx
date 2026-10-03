/**
 * Round reveal: the true location, the player's guess, the great-circle line
 * between them and a breakdown of how the points were calculated
 * (distance → base points → hint factor → streak multiplier).
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Camera, ExternalLink, Flame, Timer as TimerIcon } from 'lucide-react';
import { useGame, useSettings } from '../game/store';
import { compassLabel, formatCoords, formatDistance, initialBearing, vincentyKm } from '../lib/geo';
import { MAX_ROUND_POINTS, ROUNDS_PER_GAME, ZERO_POINTS_KM } from '../lib/scoring';
import { flagUrl } from '../lib/locations';
import { useCountUp } from '../hooks/useCountUp';
import ResultMap, { type Pair } from './ResultMap';

export default function RevealPanel() {
  const round = useGame((s) => s.round);
  const rounds = useGame((s) => s.rounds);
  const results = useGame((s) => s.results);
  const nextRound = useGame((s) => s.nextRound);
  const unit = useSettings((s) => s.unit);

  const record = rounds[round];
  const result = results[round];
  const points = useCountUp(result?.points ?? 0, 1100, 450);

  const pairs = useMemo<Pair[]>(
    () => (record ? [{ actual: record.anomaly, guess: record.guess, tooltip: record.anomaly.country }] : []),
    [record],
  );

  // Enter / Space / N continues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'n') && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        nextRound();
      }
    };
    const id = window.setTimeout(() => window.addEventListener('keydown', onKey), 400); // avoid the lock keypress carrying over
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [nextRound]);

  if (!record || !result) return null;
  const a = record.anomaly;
  const km = result.distanceKm;
  const ellipsoid = record.guess ? vincentyKm(record.guess, a) : null;
  const bearing = record.guess ? initialBearing(record.guess, a) : null;
  const last = round + 1 >= ROUNDS_PER_GAME;
  const flag = flagUrl(a.iso);
  const quality = result.base / MAX_ROUND_POINTS;
  const verdict =
    km === null
      ? 'Signal lost – no coordinates locked'
      : km < 1
        ? 'Perfect convergence!'
        : quality > 0.9
          ? 'Timeline stabilised'
          : quality > 0.7
            ? 'Strong convergence'
            : quality > 0.4
              ? 'Partial convergence'
              : quality > 0
                ? 'Weak signal'
                : `Beyond ${formatDistance(ZERO_POINTS_KM, unit)} – timeline fractured`;

  return (
    <motion.div className="absolute inset-0 z-[900] flex flex-col bg-void" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="relative min-h-0 flex-1">
        <ResultMap pairs={pairs} padTop={150} />
        <div className="pointer-events-none absolute top-24 left-1/2 z-[1000] hidden -translate-x-1/2 sm:block">
          <div className="hud-panel px-4 py-1.5 font-mono text-[11px] tracking-[0.25em] text-tva uppercase">
            Anomaly {round + 1} / {ROUNDS_PER_GAME} · revealed
          </div>
        </div>
      </div>

      <motion.section
        className="hud-panel relative z-[1000] mx-auto -mt-6 mb-3 w-[min(980px,calc(100%-1.5rem))] p-4 sm:mb-5 sm:p-5"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 28 }}
      >
        <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr_auto] sm:items-center">
          {/* Points */}
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-mute uppercase">{verdict}</p>
            <p className="text-glow font-mono text-5xl font-bold text-doom sm:text-6xl">
              {points.toLocaleString('en-US')}
              <span className="ml-2 text-base text-mute">pts</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden bg-edge/60">
              <motion.div
                className="h-full bg-gradient-to-r from-rift via-tva to-doom"
                initial={{ width: 0 }}
                animate={{ width: `${quality * 100}%` }}
                transition={{ delay: 0.4, duration: 1 }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-mute">
              base {result.base.toLocaleString('en-US')}
              {result.hintFactor < 1 && <> · intel ×{result.hintFactor.toFixed(2)}</>}
              {result.multiplier > 1 && (
                <span className="text-tva">
                  {' '}
                  · <Flame size={11} className="inline -translate-y-px" /> streak ×{result.multiplier.toFixed(1)}
                </span>
              )}
              {record.timedOut && <span className="text-rift"> · time ran out</span>}
            </p>
          </div>

          {/* Distance + location */}
          <div className="space-y-2 text-sm">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-mute uppercase">Distance (Haversine)</p>
              <p className="font-mono text-2xl font-bold text-tva">{km === null ? '—' : formatDistance(km, unit)}</p>
              {km !== null && (
                <p className="font-mono text-[11px] text-mute">
                  WGS-84 ellipsoid: {ellipsoid === null ? 'n/a' : formatDistance(ellipsoid, unit)}
                  {bearing !== null && km > 1 && <> · target lay {compassLabel(bearing)} of your pin</>}
                </p>
              )}
            </div>
            <div className="flex items-start gap-2">
              {flag && <img src={flag} alt="" className="mt-1 h-4 w-auto shadow" />}
              <div className="min-w-0">
                <p className="font-semibold">
                  {a.country} <span className="font-normal text-mute">· {a.region}</span>
                </p>
                <p className="truncate text-xs text-mute" title={a.title}>
                  {a.title}
                </p>
                <p className="font-mono text-[10px] text-mute/80">{formatCoords(a)}</p>
              </div>
            </div>
          </div>

          {/* Next */}
          <div className="flex flex-col gap-2 sm:items-end">
            <button className="btn-doom h-12 px-6 text-sm" onClick={nextRound} autoFocus>
              {last ? 'Final assessment' : 'Next anomaly'} <ArrowRight size={16} />
            </button>
            <p className="hidden items-center gap-1 font-mono text-[10px] text-mute sm:flex">
              <TimerIcon size={11} /> {(record.timeMs / 1000).toFixed(1)}s · press Enter
            </p>
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-1 border-t border-doom/10 pt-2 text-[10px] text-mute">
          <Camera size={11} /> Panorama by {a.author} · {a.license} ·
          <a href={a.page} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-doom-dim hover:text-doom">
            Wikimedia Commons <ExternalLink size={10} />
          </a>
        </p>
      </motion.section>
    </motion.div>
  );
}
