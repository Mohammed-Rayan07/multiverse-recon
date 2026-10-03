/**
 * The anomaly catalogue (Task 2.1).
 *
 * `src/data/locations.json` is generated at build time by
 * scripts/harvest-commons.mjs + scripts/curate-locations.mjs: real geotagged
 * 360° panoramas from Wikimedia Commons, filtered (no labelled or indoor
 * shots), tagged with their country offline and balanced across continents.
 */
import raw from '../data/locations.json';

export interface Anomaly {
  id: string;
  lat: number;
  lng: number;
  country: string;
  /** ISO 3166-1 alpha-2 code (may be "-99" for disputed areas) */
  iso: string;
  continent: string;
  region: string;
  /** Commons file title – only shown AFTER the guess, it usually names the place. */
  title: string;
  /** Equirectangular thumbnail at 3840 px wide. */
  thumb: string;
  /** Commons file page (attribution / licence). */
  page: string;
  author: string;
  license: string;
}

export const ANOMALIES: Anomaly[] = raw as Anomaly[];

const byId = new Map(ANOMALIES.map((a) => [a.id, a]));

export function getAnomaly(id: string): Anomaly | undefined {
  return byId.get(id);
}

/**
 * Commons serves fixed thumbnail widths. Phones and slow connections get the
 * 1920 px version (~0.8 MB) instead of 3840 px (~2.5 MB).
 */
export function panoramaUrl(a: Anomaly, width: 1920 | 3840 = 3840): string {
  return width === 3840 ? a.thumb : a.thumb.replace(/\/3840px-/, '/1920px-');
}

/** Small flag image for the reveal card (Windows does not render flag emoji). */
export function flagUrl(iso: string): string | null {
  if (!/^[A-Z]{2}$/.test(iso)) return null;
  return `https://flagcdn.com/w40/${iso.toLowerCase()}.png`;
}
