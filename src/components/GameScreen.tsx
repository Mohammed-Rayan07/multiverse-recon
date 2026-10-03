/**
 * The in-game screen: panorama viewer + HUD + Nexus Map dock + reveal overlay.
 *
 * Desktop: GeoGuessr-style map dock in the bottom-right that grows on hover
 * and can be pinned at three sizes.
 * Mobile: the map lives in a bottom sheet opened with a floating button,
 * so the panorama keeps the full screen while looking around.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CircleHelp,
  Crosshair,
  Flame,
  LogOut,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Ruler,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useGame, useSettings } from '../game/store';
import { destinationPoint, formatCoords, normalizeLatLng } from '../lib/geo';
import { hashSeed, mulberry32 } from '../lib/pick';
import { panoramaUrl } from '../lib/locations';
import { preloadPanorama } from '../lib/panoramaCache';
import { DIFFICULTIES, ROUNDS_PER_GAME, STREAK_THRESHOLD, totalPoints } from '../lib/scoring';
import { sfx } from '../lib/sound';
import { useCountUp, useIsMobile } from '../hooks/useCountUp';
import PanoViewer from './PanoViewer';
import GuessMap from './GuessMap';
import Timer from './Timer';
import HintPanel from './HintPanel';
import RevealPanel from './RevealPanel';
import Tour from './Tour';

type DockSize = 's' | 'm' | 'l';
const DOCK: Record<DockSize, string> = {
  s: 'w-[300px] h-[200px]',
  m: 'w-[480px] h-[340px]',
  l: 'w-[min(760px,60vw)] h-[min(540px,62vh)]',
};

/** Prefer the lighter 1920px panorama on small or data-saving devices. */
function preferredWidth(): 1920 | 3840 {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /2g|3g/.test(conn?.effectiveType ?? '')) return 1920;
  return Math.max(window.screen.width, window.screen.height) * (window.devicePixelRatio || 1) < 1600 ? 1920 : 3840;
}

export default function GameScreen() {
  const s = useGame();
  const { unit, setUnit, muted, toggleMute, tourSeen } = useSettings();
  const isMobile = useIsMobile();
  const cfg = DIFFICULTIES[s.difficulty];
  const [dock, setDock] = useState<DockSize>('s');
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const width = useMemo(preferredWidth, []);

  const url = s.anomaly ? panoramaUrl(s.anomaly, width) : null;
  const total = totalPoints(s.results);
  const shownTotal = useCountUp(total, 900, s.phase === 'reveal' ? 600 : 0);
  const streak = s.results.length ? s.results[s.results.length - 1].streak : 0;
  const nextMultiplier = Math.min(1.4, 1 + 0.1 * streak);

  // Preload the next round's panorama in the background.
  useEffect(() => {
    const next = s.queue[s.round + 1];
    if (!next || s.phase !== 'guessing') return;
    preloadPanorama(panoramaUrl(next, width));
  }, [s.queue, s.round, s.phase, width]);

  // First-time walkthrough starts automatically once the first panorama is visible.
  useEffect(() => {
    if (!tourSeen && s.phase === 'guessing' && s.round === 0) setTourOpen(true);
  }, [tourSeen, s.phase, s.round]);

  // Pause the clock while the tour is open.
  useEffect(() => {
    if (tourOpen) s.pause('tour');
    else s.resume('tour');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen]);

  // Close the mobile sheet when the round ends.
  useEffect(() => {
    if (s.phase !== 'guessing') setSheetOpen(false);
  }, [s.phase]);

  // Keyboard: Space / Enter locks the guess.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tourOpen || s.phase !== 'guessing') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === ' ' || e.key === 'Enter') && s.marker) {
        e.preventDefault();
        s.submitGuess();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, tourOpen]);

  // Easy-mode search zone: a 1000 km circle that contains the target but isn't centred on it.
  const zone = useMemo(() => {
    if (!s.anomaly || !s.hints.includes('zone')) return null;
    const rnd = mulberry32(hashSeed(s.anomaly.id));
    return { center: destinationPoint(s.anomaly, rnd() * 360, rnd() * 600), radiusKm: 1000 };
  }, [s.anomaly, s.hints]);

  const place = (p: { lat: number; lng: number }) => {
    sfx.pin();
    s.setMarker(p);
  };

  const lockButton = (
    <button
      className="btn-doom h-12 w-full text-sm"
      disabled={!s.marker || s.phase !== 'guessing'}
      onClick={() => s.submitGuess()}
      data-tour="lock"
    >
      <Crosshair size={16} />
      {s.marker ? 'Lock coordinates' : 'Place your marker'}
    </button>
  );

  const map = (
    <GuessMap marker={s.marker} onPlace={place} disabled={s.phase !== 'guessing'} zone={zone} resetKey={`${s.round}-${s.anomaly?.id}`} />
  );

  const expanded = pinned ? dock : hover ? (dock === 's' ? 'm' : dock) : dock;

  return (
    <div className="fixed inset-0 overflow-hidden bg-void">
      <PanoViewer url={url} fov={cfg.fov} lockZoom={cfg.lockZoom} onReady={s.panoReady} onError={s.panoFailed} />

      {/* ---------------- Top HUD ---------------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto hud-panel flex items-center gap-3 px-3 py-2 sm:gap-5 sm:px-4">
          <div className="hidden leading-tight sm:block">
            <p className="font-mono text-[9px] tracking-[0.3em] text-doom uppercase">Multiverse Recon</p>
            <p className="text-xs text-mute">
              {cfg.label} · {s.mode === 'daily' ? 'Daily Anomaly' : 'Classic'}
              {!s.session && <span className="text-tva"> · unranked</span>}
            </p>
          </div>
          <div className="text-center leading-tight" data-tour="round">
            <p className="font-mono text-[9px] tracking-[0.25em] text-mute uppercase">Round</p>
            <p className="font-mono text-lg font-bold">
              {s.round + 1}
              <span className="text-mute">/{ROUNDS_PER_GAME}</span>
            </p>
          </div>
          <div className="text-center leading-tight" data-tour="score">
            <p className="font-mono text-[9px] tracking-[0.25em] text-mute uppercase">Score</p>
            <p className="font-mono text-lg font-bold text-doom">{shownTotal.toLocaleString('en-US')}</p>
          </div>
          <div
            className="text-center leading-tight"
            data-tour="streak"
            title={`Nexus Streak: base score ≥ ${STREAK_THRESHOLD} keeps it alive`}
          >
            <p className="font-mono text-[9px] tracking-[0.25em] text-mute uppercase">Streak</p>
            <p className={`flex items-center justify-center gap-1 font-mono text-lg font-bold ${streak > 0 ? 'text-tva' : 'text-mute'}`}>
              <Flame size={15} className={streak > 1 ? 'animate-pulse' : ''} />
              {streak}
              <span className="text-[10px] font-normal text-mute">→×{nextMultiplier.toFixed(1)}</span>
            </p>
          </div>
          <Timer />
        </div>

        <div className="pointer-events-auto flex gap-1.5">
          <button className="icon-btn" onClick={() => setUnit(unit === 'km' ? 'mi' : 'km')} title="Toggle km / miles" aria-label="Toggle distance unit">
            <span className="flex items-center gap-0.5 font-mono text-[10px] font-bold">
              <Ruler size={12} />
              {unit}
            </span>
          </button>
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="icon-btn" onClick={() => setTourOpen(true)} aria-label="Show tour" title="How to play (tour)" data-tour="help">
            <CircleHelp size={16} />
          </button>
          <button
            className="icon-btn hover:!border-rift hover:!text-rift"
            onClick={() => {
              if (confirm('Abandon this timeline? Your progress will be lost.')) s.quitToMenu();
            }}
            aria-label="Quit to menu"
            title="Quit to menu"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Notices (offline / rerouted) */}
      <AnimatePresence>
        {s.notice && s.phase !== 'reveal' && (
          <motion.div
            className="absolute top-24 left-1/2 z-[1000] -translate-x-1/2 sm:top-24"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p className="hud-panel px-3 py-1.5 font-mono text-[11px] text-tva">{s.notice}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Easy-mode hints */}
      {cfg.hints && s.phase !== 'reveal' && (
        <div className={`absolute z-[950] ${isMobile ? 'top-24 left-2 origin-top-left scale-90' : 'bottom-4 left-4'}`}>
          <HintPanel />
        </div>
      )}

      {/* ---------------- Map: desktop dock ---------------- */}
      {!isMobile && s.phase !== 'reveal' && (
        <div
          className="absolute right-4 bottom-4 z-[950] flex flex-col items-end gap-2"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div className={`flex gap-1 transition-opacity ${hover || pinned ? 'opacity-100' : 'opacity-60'}`}>
            <button className="icon-btn !h-8 !w-8" onClick={() => setDock(dock === 'l' ? 'm' : dock === 'm' ? 's' : 's')} aria-label="Smaller map" title="Smaller map">
              <Minimize2 size={13} />
            </button>
            <button className="icon-btn !h-8 !w-8" onClick={() => setDock(dock === 's' ? 'm' : 'l')} aria-label="Bigger map" title="Bigger map">
              <Maximize2 size={13} />
            </button>
            <button
              className={`icon-btn !h-8 !w-8 ${pinned ? '!border-tva !text-tva' : ''}`}
              onClick={() => setPinned(!pinned)}
              aria-label={pinned ? 'Unpin map size' : 'Pin map size'}
              title={pinned ? 'Unpin (shrink when not hovered)' : 'Pin open'}
            >
              {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </div>
          <div
            className={`hud-panel hud-glow overflow-hidden !p-0 transition-all duration-300 ease-out ${DOCK[expanded]}`}
            data-tour="map"
          >
            {map}
          </div>
          <div className="w-full">{lockButton}</div>
          {s.marker && (
            <p className="font-mono text-[10px] text-mute">{formatCoords(normalizeLatLng(s.marker), 3)}</p>
          )}
        </div>
      )}

      {/* ---------------- Map: mobile bottom sheet ---------------- */}
      {isMobile && s.phase !== 'reveal' && (
        <>
          {!sheetOpen && (
            <div className="absolute inset-x-3 bottom-3 z-[950] flex gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button className="btn-ghost h-12 flex-1 text-sm" onClick={() => setSheetOpen(true)} data-tour="map">
                <MapIcon size={16} /> {s.marker ? 'Adjust guess' : 'Open Nexus Map'}
              </button>
              {s.marker && (
                <button className="btn-doom h-12 px-4 text-sm" onClick={() => s.submitGuess()} data-tour="lock">
                  <Crosshair size={16} /> Lock
                </button>
              )}
            </div>
          )}
          <AnimatePresence>
            {sheetOpen && (
              <motion.div
                className="absolute inset-x-0 bottom-0 z-[1100] flex h-[68dvh] flex-col border-t border-doom/30 bg-abyss"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="font-mono text-[10px] tracking-[0.3em] text-doom uppercase">Nexus Map · tap to pin</p>
                  <button className="icon-btn !h-8 !w-8" onClick={() => setSheetOpen(false)} aria-label="Close map">
                    <X size={14} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">{map}</div>
                <div className="p-3">{lockButton}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ---------------- Reveal ---------------- */}
      {s.phase === 'reveal' && <RevealPanel />}

      <Tour
        open={tourOpen}
        hasHints={cfg.hints}
        isMobile={isMobile}
        onClose={() => {
          setTourOpen(false);
          useSettings.getState().setTourSeen(true);
        }}
      />
    </div>
  );
}
