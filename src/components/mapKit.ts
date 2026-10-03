/**
 * Shared Leaflet helpers: base map factory, themed pin icons and an animated
 * great-circle line used on the reveal and results maps.
 */
import L from 'leaflet';
import { greatCircleSegments, type LatLng } from '../lib/geo';

export const COLORS = {
  guess: '#2bff88',
  actual: '#ffb21e',
  line: '#ffb21e',
  zone: '#ff3d6e',
};

/** Base map factory shared by the guess, reveal and results maps. */
export function createBaseMap(el: HTMLElement, opts: L.MapOptions = {}): L.Map {
  const map = L.map(el, {
    center: [20, 10],
    zoom: 1,
    minZoom: 1,
    maxZoom: 18,
    worldCopyJump: true,
    zoomControl: false,
    attributionControl: true,
    zoomSnap: 0.25,
    // Keep the player from panning off into the grey void above/below the poles.
    maxBounds: [
      [-88, -1080],
      [88, 1080],
    ],
    maxBoundsViscosity: 1,
    ...opts,
  });
  addTiles(map);
  map.attributionControl.setPrefix(false);
  return map;
}

/**
 * Basemap with automatic failover: Esri World Street Map (keyless, readable
 * labels in every country) and, if its tiles start failing, OpenStreetMap.
 */
function addTiles(map: L.Map) {
  const primary = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  let failures = 0;
  primary.on('tileerror', () => {
    if (++failures !== 6) return; // a few failed tiles = provider trouble → switch once
    map.removeLayer(primary);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  });
}

/** Pulsing round pin. `label` is an optional tag drawn above it (e.g. round number). */
export function pinIcon(color: string, label?: string): L.DivIcon {
  return L.divIcon({
    className: 'recon-pin',
    html: `<div style="color:${color};position:absolute;inset:0">
             <div class="pin-ring"></div><div class="pin-core"></div>
             ${label ? `<div class="pin-label"><span>${label}</span></div>` : ''}
           </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Draws a great-circle path that "flies" from `from` to `to` over `ms`. */
export function animateGreatCircle(
  map: L.Map,
  from: LatLng,
  to: LatLng,
  opts: { color?: string; ms?: number; dash?: string; weight?: number } = {},
): { layer: L.LayerGroup; cancel: () => void } {
  const { color = COLORS.line, ms = 900, dash = '8 8', weight = 3 } = opts;
  const segments = greatCircleSegments(from, to, 128);
  const all = segments.flat();
  const group = L.layerGroup().addTo(map);
  const lines = segments.map(() => L.polyline([], { color, weight, dashArray: dash, opacity: 0.95, interactive: false }).addTo(group));

  let raf = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    const count = Math.max(2, Math.round(eased * all.length));
    // Fill segments in order until we've used `count` points.
    let left = count;
    segments.forEach((seg, i) => {
      const n = Math.max(0, Math.min(seg.length, left));
      lines[i].setLatLngs(seg.slice(0, n));
      left -= seg.length;
    });
    if (t < 1) raf = requestAnimationFrame(step);
  };
  if (ms <= 0) segments.forEach((seg, i) => lines[i].setLatLngs(seg));
  else raf = requestAnimationFrame(step);

  return { layer: group, cancel: () => cancelAnimationFrame(raf) };
}

/** Fit the view to a set of points, handling the "single point" case. */
export function fitPoints(map: L.Map, points: LatLng[], maxZoom = 12, pad: { tl: [number, number]; br: [number, number] } = { tl: [48, 48], br: [48, 48] }) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], Math.min(maxZoom, 5));
    return;
  }
  map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, maxZoom, animate: true });
}
