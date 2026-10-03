/**
 * Read-only map that shows guesses vs actual locations, joined by animated
 * great-circle lines. Used after each round (one pair) and on the Final
 * Results Screen (all five pairs).
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '../lib/geo';
import { animateGreatCircle, COLORS, createBaseMap, fitPoints, pinIcon } from './mapKit';

export interface Pair {
  actual: LatLng;
  guess: LatLng | null;
  label?: string;
  tooltip?: string;
}

interface Props {
  pairs: Pair[];
  /** Optional: highlight one pair (results table hover). */
  focus?: number | null;
  animate?: boolean;
  /** Extra padding (px) so pins aren't hidden under overlaid HUD elements. */
  padTop?: number;
}

export default function ResultMap({ pairs, focus = null, animate = true, padTop = 48 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = createBaseMap(el.current);
    L.control.zoom({ position: 'topleft' }).addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.layerGroup().addTo(m);
    const cancels: (() => void)[] = [];
    const timers: number[] = [];

    pairs.forEach((p, i) => {
      const delay = animate ? i * 350 : 0;
      timers.push(
        window.setTimeout(() => {
          const actual = L.marker([p.actual.lat, p.actual.lng], { icon: pinIcon(COLORS.actual, p.label), zIndexOffset: 500 }).addTo(group);
          if (p.tooltip) actual.bindTooltip(p.tooltip, { className: 'recon-tip', direction: 'top', offset: [0, -14] });
          if (p.guess) {
            L.marker([p.guess.lat, p.guess.lng], { icon: pinIcon(COLORS.guess), interactive: false }).addTo(group);
            const line = animateGreatCircle(m, p.guess, p.actual, { ms: animate ? 900 : 0 });
            group.addLayer(line.layer);
            cancels.push(line.cancel);
          }
        }, delay),
      );
    });

    // Fit everything in view (guesses + actuals). Wrap-safe because guesses are normalised.
    const pts = pairs.flatMap((p) => (p.guess ? [p.actual, p.guess] : [p.actual]));
    // Defer so the container has its final size (it may be animating in).
    timers.push(window.setTimeout(() => fitPoints(m, pts, pairs.length === 1 ? 14 : 6, { tl: [48, padTop], br: [48, 56] }), 60));

    return () => {
      timers.forEach(clearTimeout);
      cancels.forEach((c) => c());
      group.remove();
    };
  }, [pairs, animate, padTop]);

  // Focus a single pair when hovering the results table.
  useEffect(() => {
    const m = map.current;
    if (!m || focus === null || !pairs[focus]) return;
    const p = pairs[focus];
    fitPoints(m, p.guess ? [p.actual, p.guess] : [p.actual], 10, { tl: [48, padTop], br: [48, 56] });
  }, [focus, pairs, padTop]);

  return <div ref={el} className="h-full w-full" />;
}
