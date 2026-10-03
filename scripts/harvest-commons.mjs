/**
 * Stage 1 of the location pipeline: harvest raw candidates from Wikimedia Commons.
 *
 * Every file tagged with the {{Pano360}} template is a full spherical
 * (equirectangular) panorama. We page through search results and keep the
 * ones that carry GPS coordinates and have a ~2:1 aspect ratio (anything else
 * cannot be wrapped onto a sphere). Output: .cache/raw.json
 *
 * The script is deliberately polite to the Wikimedia API (sequential requests,
 * a pause between them, back-off on HTTP 429) and resumable: progress is saved
 * after every query, so re-running continues where it stopped.
 *
 * Run: node scripts/harvest-commons.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'MultiverseRecon/1.0 (https://github.com/Mohammed-Rayan07; one-off build-time harvest for a hackathon game)';
const PAUSE_MS = 1200;
const RAW = '.cache/raw.json';
const STATE = '.cache/harvest-state.json';

// Generic query first, then region keywords so the pool is not only European.
const KEYWORDS = [
  '', 'Africa', 'Asia', 'America', 'Australia', 'India', 'Japan', 'Brazil', 'Chile', 'Mexico', 'Canada',
  'Russia', 'China', 'Indonesia', 'Thailand', 'Israel', 'Iran', 'Turkey', 'Egypt', 'Kenya', 'Argentina',
  'Peru', 'Iceland', 'Norway', 'California', 'Hawaii', 'Zealand', 'Korea', 'Vietnam', 'Philippines',
  'Morocco', 'Namibia', 'Colombia', 'Bolivia', 'Nepal', 'Antarctica', 'Texas', 'Arizona', 'Utah', 'Cuba',
  'Ecuador', 'Ethiopia', 'Tanzania', 'Georgia', 'Armenia', 'Kazakhstan', 'Uzbekistan', 'Singapore',
  'Malaysia', 'Taiwan', 'Sri Lanka', 'Jordan', 'Oman', 'Emirates', 'Tunisia', 'Ghana', 'Senegal',
];
const MAX_PAGES = { '': 12 }; // the generic query has ~10k hits; keywords have far fewer

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } }).catch(() => null);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json && !json.error) return json;
      if (json?.error?.code === 'maxlag') { await sleep(5000); continue; }
      return null; // e.g. search offset past the 10k cap
    }
    const wait = Number(res?.headers.get('retry-after')) * 1000 || 5000 * 2 ** attempt;
    console.warn(`  ! HTTP ${res?.status ?? 'network'} – waiting ${Math.round(wait / 1000)}s`);
    await sleep(Math.min(wait, 90000));
  }
  return null;
}

mkdirSync('.cache', { recursive: true });
const seen = new Map(existsSync(RAW) ? JSON.parse(readFileSync(RAW, 'utf8')).map((r) => [r.pageid, r]) : []);
const done = new Set(existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : []);

for (const kw of KEYWORDS) {
  if (done.has(kw)) continue;
  const q = `hastemplate:Pano360 filetype:bitmap ${kw}`.trim();
  let offset = 0;
  let pages = 0;
  while (offset !== null && pages < (MAX_PAGES[kw] ?? 4)) {
    const data = await api({
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: '6',
      gsrlimit: '500',
      gsroffset: String(offset),
      prop: 'coordinates|imageinfo',
      colimit: '500',
      iiprop: 'size',
    });
    if (!data) break;
    for (const p of data.query?.pages ?? []) {
      const c = p.coordinates?.[0];
      const ii = p.imageinfo?.[0];
      if (!c || !ii) continue;
      const ratio = ii.width / ii.height;
      if (ratio < 1.95 || ratio > 2.05 || ii.width < 4000) continue; // must be equirectangular
      seen.set(p.pageid, { pageid: p.pageid, title: p.title, lat: c.lat, lng: c.lon, w: ii.width, h: ii.height });
    }
    offset = data.continue?.gsroffset ?? null;
    pages++;
    await sleep(PAUSE_MS);
  }
  done.add(kw);
  writeFileSync(RAW, JSON.stringify([...seen.values()]));
  writeFileSync(STATE, JSON.stringify([...done]));
  console.log(`${(kw || '(all)').padEnd(14)} -> pool ${seen.size}`);
}

console.log(`Saved ${seen.size} raw candidates to ${RAW}`);
