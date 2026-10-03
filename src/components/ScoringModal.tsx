/**
 * "How scoring works": makes the rules of Task 3.1 and the bonus mechanics
 * visible to players and judges. The curve is plotted from the real
 * basePoints() function, so the chart can never drift from the code.
 */
import { useState } from 'react';
import Modal from './Modal';
import {
  basePoints,
  DECAY_KM,
  DIFFICULTIES,
  HINTS,
  MAX_ROUND_POINTS,
  PERFECT_RADIUS_KM,
  STREAK_THRESHOLD,
  streakMultiplier,
  ZERO_POINTS_KM,
  type Difficulty,
} from '../lib/scoring';
import { formatDistance } from '../lib/geo';
import { useSettings } from '../game/store';

const W = 560;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

export default function ScoringModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unit = useSettings((s) => s.unit);
  const [probe, setProbe] = useState<number | null>(null);
  const maxKm = 8000;
  const x = (km: number) => PAD.l + (km / maxKm) * (W - PAD.l - PAD.r);
  const y = (pts: number) => PAD.t + (1 - pts / MAX_ROUND_POINTS) * (H - PAD.t - PAD.b);
  const path = Array.from({ length: 161 }, (_, i) => (i / 160) * maxKm)
    .map((km, i) => `${i ? 'L' : 'M'}${x(km).toFixed(1)},${y(basePoints(km)).toFixed(1)}`)
    .join(' ');

  return (
    <Modal open={open} onClose={onClose} title="TVA assessment protocol" kicker="How scoring works" wide>
      <div className="space-y-5 text-sm leading-relaxed">
        <section>
          <h3 className="mb-1 font-semibold text-doom">1 · Distance</h3>
          <p className="text-ink/85">
            The distance between your pin and the true location is the great-circle distance from the <b>Haversine formula</b> (Earth radius 6,371 km).
            The reveal screen also shows the survey-grade <b>Vincenty distance</b> on the WGS-84 ellipsoid for comparison.
          </p>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/60 p-3 font-mono text-[11px] text-mute">
{`a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
d = 2R · atan2(√a, √(1−a))`}
          </pre>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-doom">2 · Base points (max {MAX_ROUND_POINTS.toLocaleString('en-US')} per round)</h3>
          <p className="text-ink/85">
            Points decay exponentially with distance and reach exactly <b>0 at {formatDistance(ZERO_POINTS_KM, unit)}</b>. Within{' '}
            {formatDistance(PERFECT_RADIUS_KM, unit)} you get the full {MAX_ROUND_POINTS.toLocaleString('en-US')}.
          </p>
          <pre className="mt-2 overflow-x-auto border border-edge bg-void/60 p-3 font-mono text-[11px] text-mute">
{`points(d) = 5000 · (e^(−d/${DECAY_KM}) − e^(−${ZERO_POINTS_KM}/${DECAY_KM})) / (1 − e^(−${ZERO_POINTS_KM}/${DECAY_KM}))   for d < ${ZERO_POINTS_KM} km
points(d) = 0                                                   for d ≥ ${ZERO_POINTS_KM} km`}
          </pre>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-3 w-full touch-none border border-edge bg-void/50"
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const km = (((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r) * maxKm;
              setProbe(km >= 0 && km <= maxKm ? km : null);
            }}
            onPointerLeave={() => setProbe(null)}
            role="img"
            aria-label="Chart of points versus distance"
          >
            {[0, 1250, 2500, 3750, 5000].map((p) => (
              <g key={p}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} stroke="rgb(43 255 136 / 0.08)" />
                <text x={PAD.l - 6} y={y(p) + 3} textAnchor="end" fontSize="9" fill="#7c9a8f" fontFamily="JetBrains Mono">
                  {p}
                </text>
              </g>
            ))}
            {[0, 2000, 4000, 6000, 8000].map((km) => (
              <text key={km} x={x(km)} y={H - 10} textAnchor="middle" fontSize="9" fill="#7c9a8f" fontFamily="JetBrains Mono">
                {km / 1000}k km
              </text>
            ))}
            <line x1={x(ZERO_POINTS_KM)} x2={x(ZERO_POINTS_KM)} y1={PAD.t} y2={H - PAD.b} stroke="#ff3d6e" strokeDasharray="4 4" />
            <text x={x(ZERO_POINTS_KM) - 4} y={PAD.t + 10} textAnchor="end" fontSize="9" fill="#ff3d6e" fontFamily="JetBrains Mono">
              zero beyond {ZERO_POINTS_KM} km
            </text>
            <path d={path} fill="none" stroke="#2bff88" strokeWidth="2.5" />
            {probe !== null && (
              <g>
                <line x1={x(probe)} x2={x(probe)} y1={PAD.t} y2={H - PAD.b} stroke="#ffb21e" strokeOpacity="0.6" />
                <circle cx={x(probe)} cy={y(basePoints(probe))} r="4" fill="#ffb21e" />
                <text x={Math.min(x(probe) + 6, W - 120)} y={Math.max(y(basePoints(probe)) - 8, 20)} fontSize="10" fill="#ffb21e" fontFamily="JetBrains Mono">
                  {formatDistance(probe, unit)} → {basePoints(probe)} pts
                </text>
              </g>
            )}
          </svg>
          <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[11px] sm:grid-cols-6">
            {[1, 50, 250, 1000, 2500, 5000].map((km) => (
              <div key={km} className="border border-edge bg-void/40 px-2 py-1 text-center">
                <p className="text-mute">{formatDistance(km, unit)}</p>
                <p className="font-bold text-doom">{basePoints(km)}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-doom">3 · Nexus streak multiplier</h3>
          <p className="text-ink/85">
            Each round with at least <b>{STREAK_THRESHOLD.toLocaleString('en-US')} base points</b> (about 500 km or closer) extends your streak. A weaker guess resets it.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px]">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="border border-tva/40 bg-tva/5 px-2 py-1">
                streak {n}: <b className="text-tva">×{streakMultiplier(n).toFixed(1)}</b>
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-doom">4 · Difficulty levels</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="font-mono text-[10px] tracking-widest text-mute uppercase">
                <tr>
                  <th className="py-1 text-left">Mode</th>
                  <th className="py-1 text-left">Timer</th>
                  <th className="py-1 text-left">View</th>
                  <th className="py-1 text-left">Intel</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
                  const c = DIFFICULTIES[d];
                  return (
                    <tr key={d} className="border-t border-edge/60">
                      <td className="py-1.5 font-semibold">
                        {c.label} <span className="text-mute">· {c.codename}</span>
                      </td>
                      <td className="py-1.5 font-mono">{c.timeLimit}s</td>
                      <td className="py-1.5">{c.lockZoom ? `zoomed in (${c.fov}° FOV), zoom locked` : 'free look & zoom'}</td>
                      <td className="py-1.5">
                        {c.hints ? HINTS.map((h) => `${h.label.replace('Reveal ', '').replace('Show ', '')} −${Math.round((1 - h.keep) * 100)}%`).join(', ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-doom">5 · Round score</h3>
          <pre className="overflow-x-auto border border-edge bg-void/60 p-3 font-mono text-[11px] text-mute">round = round( base × intel factor × streak multiplier )</pre>
        </section>
      </div>
    </Modal>
  );
}
