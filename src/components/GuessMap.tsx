/**
 * Interactive Nexus Map (Task 1.2).
 *
 * - Click / tap anywhere to drop the guess marker.
 * - Only ONE marker exists: clicking again moves it, and it can also be dragged.
 * - Easy-mode "search zone" hint is drawn as a circle.
 *
 * The map instance is created once and kept alive between rounds; when its
 * container is resized (expand / collapse / mobile sheet) we call
 * invalidateSize() so tiles don't render grey or offset.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '../lib/geo';
import { COLORS, createBaseMap, pinIcon } from './mapKit';

interface Props {
  marker: LatLng | null;
  onPlace: (p: LatLng) => void;
  disabled?: boolean;
  /** Easy-mode hint: circle that contains the true location. */
  zone?: { center: LatLng; radiusKm: number } | null;
  /** Changes on every new round → map view resets. */
  resetKey: string | number;
}

export default function GuessMap({ marker, onPlace, disabled, zone, resetKey }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.Marker | null>(null);
  const zoneLayer = useRef<L.Circle | null>(null);
  const handlers = useRef({ onPlace, disabled });
  handlers.current = { onPlace, disabled };

  // Create map once.
  useEffect(() => {
    if (!el.current) return;
    const m = createBaseMap(el.current);
    L.control.zoom({ position: 'topleft' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (handlers.current.disabled) return;
      handlers.current.onPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;

    // Keep Leaflet's idea of its size in sync with the (animated) container.
    const ro = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      markerLayer.current = null;
      zoneLayer.current = null;
    };
  }, []);

  // New round: zoom back out to the whole world.
  useEffect(() => {
    map.current?.setView([20, 10], 1, { animate: false });
  }, [resetKey]);

  // Sync the single guess marker.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!marker) {
      markerLayer.current?.remove();
      markerLayer.current = null;
      return;
    }
    if (!markerLayer.current) {
      const mk = L.marker([marker.lat, marker.lng], {
        icon: pinIcon(COLORS.guess),
        draggable: true,
        keyboard: true,
        title: 'Your guess (drag to adjust)',
        autoPan: true,
      }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        handlers.current.onPlace({ lat: p.lat, lng: p.lng });
      });
      markerLayer.current = mk;
    } else {
      markerLayer.current.setLatLng([marker.lat, marker.lng]);
    }
  }, [marker]);

  useEffect(() => {
    if (disabled) markerLayer.current?.dragging?.disable();
    else markerLayer.current?.dragging?.enable();
  }, [disabled, marker]);

  // Easy-mode search zone.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    zoneLayer.current?.remove();
    zoneLayer.current = null;
    if (zone) {
      zoneLayer.current = L.circle([zone.center.lat, zone.center.lng], {
        radius: zone.radiusKm * 1000,
        color: COLORS.zone,
        weight: 2,
        dashArray: '6 6',
        fillColor: COLORS.zone,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(m);
      m.fitBounds(zoneLayer.current.getBounds(), { padding: [20, 20] });
    }
  }, [zone]);

  return <div ref={el} className="h-full w-full" aria-label="World map. Click to place your guess." />;
}
