/**
 * First-time game tour (Task 1.1 – "optional first-time walkthrough that can be skipped").
 *
 * - Opens automatically the first time a panorama loads, then never again
 *   (remembered in localStorage). Reopen any time from the ? button.
 * - Spotlights each part of the HUD by looking up `[data-tour="…"]`.
 * - Skip button / Esc on every step; ← → keys to navigate.
 * - The round timer is paused while the tour is open.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Step {
  target: string | null;
  title: string;
  body: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  hasHints: boolean;
  isMobile: boolean;
}

export default function Tour({ open, onClose, hasHints, isMobile }: Props) {
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [
      {
        target: null,
        title: 'Agent, the multiverse is collapsing',
        body: 'Five anomalies have torn open across Earth. Each one drops you into a real 360° panorama. Work out where you are and pin it on the Nexus Map to stabilise the timeline.',
      },
      {
        target: 'viewer',
        title: 'The anomaly',
        body: isMobile
          ? 'Drag to look around in every direction, pinch to zoom. Look for signs, languages, plants, cars and architecture.'
          : 'Drag to look around in every direction. Scroll or use + / − to zoom, arrow keys also work. Look for signs, languages, plants and architecture.',
      },
      {
        target: 'map',
        title: 'The Nexus Map',
        body: isMobile
          ? 'Open the map and tap to drop your marker. Tap again or drag the marker to move it. Only one marker is allowed.'
          : 'Click to drop your marker. Click again or drag it to move it. Hover the map to enlarge it, or use the buttons above it to resize and pin it.',
      },
      {
        target: 'lock',
        title: 'Lock coordinates',
        body: 'When you are confident, lock in (Space or Enter also works). The closer you are, the more points you get: up to 5,000 per round, and zero beyond 7,000 km.',
      },
      {
        target: 'timer',
        title: 'Time dilation',
        body: 'Every round has a countdown. When it hits zero, your marker is locked in automatically. With no marker placed, the round scores zero.',
      },
      {
        target: 'streak',
        title: 'Nexus streak',
        body: 'Score 3,500+ base points (about 500 km or closer) in consecutive rounds to build a streak. Each streak step multiplies your round score, up to ×1.4.',
      },
    ];
    if (hasHints) {
      list.push({
        target: 'hints',
        title: 'Intel (Easy mode)',
        body: 'Stuck? Buy intel: the region, the country or a 1,000 km search zone. Each one costs a share of this round’s points.',
      });
    }
    list.push({
      target: 'help',
      title: 'You are ready',
      body: 'Replay this tour any time from the ? button. The clock starts when you close it. Good luck, agent.',
    });
    return list;
  }, [hasHints, isMobile]);

  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Measure the highlighted element (and keep measuring while things animate/resize).
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? r : null);
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [open, step]);

  const next = useCallback(() => (i >= steps.length - 1 ? onClose() : setI(i + 1)), [i, steps.length, onClose]);
  const prev = useCallback(() => setI(Math.max(0, i - 1)), [i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, next, prev, onClose]);

  // Position the card next to the spotlight, clamped to the viewport.
  const card = (() => {
    const W = Math.min(340, window.innerWidth - 24);
    if (!rect || step.target === 'viewer') return { left: (window.innerWidth - W) / 2, top: window.innerHeight * 0.32, width: W };
    const below = rect.bottom + 16;
    const fitsBelow = below + 200 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(12, rect.top - 216);
    const left = Math.min(window.innerWidth - W - 12, Math.max(12, rect.left + rect.width / 2 - W / 2));
    return { left, top, width: W };
  })();

  const pad = 8;
  const spotlight = rect && step.target !== 'viewer';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[3000]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Game tour">
          {/* Dim everything except the target using a giant box-shadow "hole". */}
          {spotlight ? (
            <motion.div
              className="pointer-events-none absolute rounded-md border-2 border-doom"
              animate={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              style={{ boxShadow: '0 0 0 9999px rgb(2 5 7 / 0.78), 0 0 30px rgb(43 255 136 / 0.5)' }}
            />
          ) : (
            <div className="absolute inset-0 bg-void/70" />
          )}
          {/* Click-catcher so the game underneath can't be used mid-tour. */}
          <div className="absolute inset-0" onClick={next} />

          <motion.div
            key={i}
            className="hud-panel hud-glow absolute p-4"
            style={card}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-doom uppercase">
              Briefing {i + 1}/{steps.length}
            </p>
            <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{step.body}</p>
            <div className="mt-3 flex gap-1">
              {steps.map((_, k) => (
                <span key={k} className={`h-1 flex-1 ${k <= i ? 'bg-doom' : 'bg-edge'}`} />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button className="text-xs tracking-widest text-mute uppercase hover:text-rift" onClick={onClose}>
                Skip tour
              </button>
              <div className="flex gap-2">
                {i > 0 && (
                  <button className="btn-ghost h-9 px-3 text-xs" onClick={prev} aria-label="Previous step">
                    <ChevronLeft size={14} />
                  </button>
                )}
                <button className="btn-doom h-9 px-4 text-xs" onClick={next}>
                  {i >= steps.length - 1 ? 'Start' : 'Next'} <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
