/**
 * Geospatial math for Multiverse Recon (Task 2.2 – Convergence Calculation).
 *
 * Everything here is pure and framework-free so it can be unit tested
 * (see geo.test.ts) and shared with the serverless leaderboard, which
 * re-computes every distance itself instead of trusting the browser.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in km (IUGG value), the standard radius for the Haversine formula. */
export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_MILE = 1.609344;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Wrap any longitude into the canonical [-180, 180) range.
 * Leaflet lets the world repeat horizontally, so a click on the "second copy"
 * of the map can report lng = 200. Without this, distances would be wrong.
 */
export function normalizeLng(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Clamp latitude to the valid range and wrap longitude. */
export function normalizeLatLng(p: LatLng): LatLng {
  return { lat: Math.max(-90, Math.min(90, p.lat)), lng: normalizeLng(p.lng) };
}

/**
 * Great-circle distance between two points using the Haversine formula.
 *
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   c = 2 · atan2(√a, √(1−a))
 *   d = R · c
 *
 * φ = latitude, λ = longitude (radians), R = Earth's mean radius.
 * Haversine stays numerically stable for tiny distances (unlike the spherical
 * law of cosines) and the atan2 form stays stable for antipodal points.
 *
 * @returns distance in kilometres
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const p1 = normalizeLatLng(a);
  const p2 = normalizeLatLng(b);
  const φ1 = toRad(p1.lat);
  const φ2 = toRad(p2.lat);
  const Δφ = toRad(p2.lat - p1.lat);
  const Δλ = toRad(p2.lng - p1.lng);

  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  // Clamp guards against floating point drift pushing h a hair above 1.
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_KM * c;
}

/**
 * Ellipsoidal distance on the WGS-84 ellipsoid (Vincenty's inverse formula).
 *
 * The Earth is not a perfect sphere – it is ~21 km fatter at the equator –
 * so Haversine can be off by up to ~0.5%. Vincenty iterates on the ellipsoid
 * and is accurate to well under a millimetre. We show it on the reveal screen
 * as the "survey-grade" figure alongside the Haversine distance used for scoring.
 *
 * Returns null if the iteration fails to converge (only happens for nearly
 * antipodal points); callers fall back to Haversine.
 *
 * @returns distance in kilometres, or null
 */
export function vincentyKm(a: LatLng, b: LatLng): number | null {
  const p1 = normalizeLatLng(a);
  const p2 = normalizeLatLng(b);
  const A = 6378137.0; // semi-major axis (m)
  const F = 1 / 298.257223563; // flattening
  const B = A * (1 - F); // semi-minor axis (m)

  const L = toRad(p2.lng - p1.lng);
  const U1 = Math.atan((1 - F) * Math.tan(toRad(p1.lat))); // reduced latitudes
  const U2 = Math.atan((1 - F) * Math.tan(toRad(p2.lat)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let λ = L;
  let λPrev: number;
  let sinσ = 0, cosσ = 0, σ = 0, cos2α = 0, cos2σm = 0;
  let iterations = 0;

  do {
    const sinλ = Math.sin(λ), cosλ = Math.cos(λ);
    sinσ = Math.sqrt((cosU2 * sinλ) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosλ) ** 2);
    if (sinσ === 0) return 0; // coincident points
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
    σ = Math.atan2(sinσ, cosσ);
    const sinα = (cosU1 * cosU2 * sinλ) / sinσ;
    cos2α = 1 - sinα ** 2;
    cos2σm = cos2α !== 0 ? cosσ - (2 * sinU1 * sinU2) / cos2α : 0; // equatorial line
    const C = (F / 16) * cos2α * (4 + F * (4 - 3 * cos2α));
    λPrev = λ;
    λ = L + (1 - C) * F * sinα * (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm ** 2)));
  } while (Math.abs(λ - λPrev) > 1e-12 && ++iterations < 200);

  if (iterations >= 200) return null;

  const u2 = (cos2α * (A ** 2 - B ** 2)) / B ** 2;
  const bigA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const bigB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const Δσ =
    bigB *
    sinσ *
    (cos2σm +
      (bigB / 4) *
        (cosσ * (-1 + 2 * cos2σm ** 2) - (bigB / 6) * cos2σm * (-3 + 4 * sinσ ** 2) * (-3 + 4 * cos2σm ** 2)));

  return (B * bigA * (σ - Δσ)) / 1000;
}

/** Initial compass bearing (0° = north, clockwise) to travel from a to b. */
export function initialBearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `km` from `start` along initial `bearingDeg` on a great circle. */
export function destinationPoint(start: LatLng, bearingDeg: number, km: number): LatLng {
  const δ = km / EARTH_RADIUS_KM;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(start.lat), λ1 = toRad(start.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: normalizeLng(toDeg(λ2)) };
}

/** 16-point compass label for a bearing, e.g. 47° -> "NE". */
export function compassLabel(bearing: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(bearing / 22.5) % 16];
}

/**
 * Points along the great circle between a and b (spherical interpolation),
 * split into segments wherever the path crosses the antimeridian (±180°).
 *
 * A naive straight line between, say, Fiji and Hawaii would be drawn across
 * the whole map. Splitting keeps every line on the short side of the globe.
 */
export function greatCircleSegments(a: LatLng, b: LatLng, steps = 96): [number, number][][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng);
  const φ2 = toRad(b.lat), λ2 = toRad(b.lng);
  const d = haversineKm(a, b) / EARTH_RADIUS_KM; // angular distance

  const points: [number, number][] = [];
  if (d < 1e-9) return [[[a.lat, a.lng], [b.lat, b.lng]]];

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }

  // Break the polyline where consecutive longitudes jump by more than 180°.
  const segments: [number, number][][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (Math.abs(cur[1] - prev[1]) > 180) {
      // Interpolate the latitude at the crossing so both halves meet the map edge.
      const edge = prev[1] > 0 ? 180 : -180;
      const curShifted = cur[1] + (prev[1] > 0 ? 360 : -360);
      const t = (edge - prev[1]) / (curShifted - prev[1]);
      const latAtEdge = prev[0] + t * (cur[0] - prev[0]);
      segments[segments.length - 1].push([latAtEdge, edge]);
      segments.push([[latAtEdge, -edge], cur]);
    } else {
      segments[segments.length - 1].push(cur);
    }
  }
  return segments;
}

export type DistanceUnit = 'km' | 'mi';

export function convertKm(km: number, unit: DistanceUnit): number {
  return unit === 'km' ? km : km / KM_PER_MILE;
}

/** Human readable distance: "12 m", "4.37 km", "1,204 km" (or miles/feet). */
export function formatDistance(km: number, unit: DistanceUnit = 'km'): string {
  if (unit === 'mi') {
    const mi = km / KM_PER_MILE;
    if (mi < 0.1) return `${Math.round(mi * 5280).toLocaleString('en-US')} ft`;
    if (mi < 10) return `${mi.toFixed(2)} mi`;
    if (mi < 100) return `${mi.toFixed(1)} mi`;
    return `${Math.round(mi).toLocaleString('en-US')} mi`;
  }
  if (km < 1) return `${Math.round(km * 1000).toLocaleString('en-US')} m`;
  if (km < 10) return `${km.toFixed(2)} km`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** "48.8584° N, 2.2945° E" */
export function formatCoords(p: LatLng, digits = 4): string {
  const lat = `${Math.abs(p.lat).toFixed(digits)}° ${p.lat >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(p.lng).toFixed(digits)}° ${p.lng >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}
