/**
 * Location Viewer (Task 1.1): a draggable, zoomable 360° street-level panorama.
 *
 * Built on Photo Sphere Viewer (three.js). The equirectangular Commons image
 * is wrapped onto the inside of a sphere; the player can look around with
 * mouse / touch / keyboard arrows and zoom with wheel / pinch / +/-.
 *
 * Nothing that could leak the answer (file name, alt text, caption) is put in
 * the DOM while a round is running.
 */
import { useEffect, useRef, useState } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { loadPanorama } from '../lib/panoramaCache';

interface Props {
  url: string | null;
  /** Starting horizontal field of view in degrees. */
  fov: number;
  /** When true the player cannot zoom out wider than `fov` (Hard mode). */
  lockZoom: boolean;
  /** Slowly spin the camera (menu background). */
  autoRotate?: boolean;
  interactive?: boolean;
  onReady?: () => void;
  onError?: () => void;
  className?: string;
}

const MIN_FOV = 22;
const MAX_FOV = 100;

/** PSV zoom is a 0..100 level between maxFov (0) and minFov (100). */
const fovToLevel = (fov: number, minFov: number, maxFov: number) =>
  maxFov === minFov ? 0 : ((maxFov - fov) / (maxFov - minFov)) * 100;

export default function PanoViewer({ url, fov, lockZoom, autoRotate, interactive = true, onReady, onError, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  const maxFov = lockZoom ? fov : MAX_FOV;

  // Create the viewer once.
  useEffect(() => {
    if (!host.current) return;
    const v = new Viewer({
      container: host.current,
      navbar: false,
      loadingImg: undefined,
      loadingTxt: '',
      minFov: MIN_FOV,
      maxFov,
      defaultZoomLvl: fovToLevel(fov, MIN_FOV, maxFov),
      mousewheel: interactive,
      mousemove: interactive,
      keyboard: interactive ? 'always' : false,
      moveInertia: true,
      touchmoveTwoFingers: false,
      canvasBackground: '#04070a',
    });
    viewer.current = v;
    return () => {
      v.destroy();
      viewer.current = null;
    };
    // The viewer is created once; option changes are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep zoom limits in sync with the difficulty.
  useEffect(() => {
    viewer.current?.setOptions({ maxFov, minFov: MIN_FOV });
  }, [maxFov]);

  // Load a new panorama whenever the url changes.
  useEffect(() => {
    const v = viewer.current;
    if (!v || !url) return;
    let cancelled = false;
    setLoading(true);
    setProgress(0);
    // Download through our cache (real progress, retry, preloaded bytes), then show it.
    loadPanorama(url, (p) => !cancelled && setProgress(p))
      .then((blobUrl) => {
        if (cancelled || !viewer.current) return false;
        return viewer.current.setPanorama(blobUrl, {
          showLoader: false,
          transition: false,
          // Random starting direction so the "best" view isn't handed to the player.
          position: { yaw: Math.random() * Math.PI * 2, pitch: 0 },
          zoom: fovToLevel(fov, MIN_FOV, maxFov),
        });
      })
      .then((completed) => {
        // PSV resolves `false` (instead of rejecting) when a load is superseded/aborted.
        if (cancelled || completed === false) return;
        setLoading(false);
        callbacks.current.onReady?.();
      })
      .catch(() => {
        if (cancelled) return;
        callbacks.current.onError?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Optional slow auto-rotation (menu backdrop).
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const v = viewer.current;
      if (v && !loading) {
        const pos = v.getPosition();
        v.rotate({ yaw: pos.yaw + ((now - last) / 1000) * 0.035, pitch: 0.05 });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, loading]);

  const zoomBy = (delta: number) => {
    const v = viewer.current;
    if (!v) return;
    v.zoom(Math.max(0, Math.min(100, v.getZoomLevel() + delta)));
  };

  return (
    <div className={`relative h-full w-full ${className ?? ''}`} data-tour="viewer">
      <div ref={host} className="absolute inset-0" aria-label="360 degree panorama of the anomaly. Drag to look around." role="img" />

      {loading && url && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-void/80">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-doom/20 border-t-doom" style={{ animationDuration: '1.2s' }} />
              <div className="absolute inset-3 animate-spin rounded-full border-2 border-tva/20 border-b-tva" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
              <div className="absolute inset-0 grid place-items-center font-mono text-sm text-doom">{Math.round(progress)}%</div>
            </div>
            <p className="font-mono text-xs tracking-[0.3em] text-mute uppercase">Opening portal…</p>
          </div>
        </div>
      )}

      {interactive && !loading && (
        <div className="absolute top-1/2 left-3 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
          <button className="icon-btn" onClick={() => zoomBy(12)} aria-label="Zoom in" title="Zoom in (+)">
            <Plus size={16} />
          </button>
          <button className="icon-btn" onClick={() => zoomBy(-12)} aria-label="Zoom out" title="Zoom out (−)">
            <Minus size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => viewer.current?.animate({ yaw: viewer.current.getPosition().yaw, pitch: 0, zoom: fovToLevel(fov, MIN_FOV, maxFov), speed: '4rpm' })}
            aria-label="Reset view"
            title="Reset view"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
