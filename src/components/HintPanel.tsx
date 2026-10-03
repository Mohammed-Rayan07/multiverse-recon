/**
 * Easy-mode hints (bonus 4.1 – Difficulty Levels: "Easy (hints allowed)").
 * Each hint costs a share of the round's points; the cost is shown up front.
 */
import { Globe2, Flag, Crosshair, Lightbulb } from 'lucide-react';
import { useGame } from '../game/store';
import { HINTS, hintFactor, type HintId } from '../lib/scoring';
import { flagUrl } from '../lib/locations';

const ICONS: Record<HintId, typeof Globe2> = { region: Globe2, country: Flag, zone: Crosshair };

export default function HintPanel() {
  const anomaly = useGame((s) => s.anomaly);
  const hints = useGame((s) => s.hints);
  const phase = useGame((s) => s.phase);
  const useHint = useGame((s) => s.useHint);
  if (!anomaly) return null;
  const factor = hintFactor(hints);

  return (
    <div className="hud-panel w-64 p-3" data-tour="hints">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] text-tva uppercase">
          <Lightbulb size={12} /> Intel
        </p>
        <p className="font-mono text-[10px] text-mute">round value ×{factor.toFixed(2)}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {HINTS.map((h) => {
          const used = hints.includes(h.id);
          const Icon = ICONS[h.id];
          return (
            <button
              key={h.id}
              disabled={used || phase !== 'guessing'}
              onClick={() => useHint(h.id)}
              className={`flex items-center gap-2 border px-2.5 py-2 text-left text-xs transition ${
                used ? 'border-tva/40 bg-tva/10 text-ink' : 'border-edge bg-void/40 text-mute hover:border-tva hover:text-ink'
              }`}
            >
              <Icon size={14} className={used ? 'text-tva' : ''} />
              <span className="flex-1">
                {used ? (
                  h.id === 'region' ? (
                    <b className="text-ink">{anomaly.region}</b>
                  ) : h.id === 'country' ? (
                    <span className="flex items-center gap-1.5">
                      {flagUrl(anomaly.iso) && <img src={flagUrl(anomaly.iso)!} alt="" className="h-3 w-auto" />}
                      <b className="text-ink">{anomaly.country}</b>
                    </span>
                  ) : (
                    <b className="text-ink">Zone drawn on map</b>
                  )
                ) : (
                  h.label
                )}
              </span>
              {!used && <span className="font-mono text-[10px] text-rift">−{Math.round((1 - h.keep) * 100)}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
