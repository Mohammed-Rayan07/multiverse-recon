/**
 * Stage 2 of the location pipeline: turn the raw Commons harvest into the
 * curated, balanced list the game ships with (src/data/locations.json).
 *
 *  1. Drop titles that leak the answer or can't be geolocated (labelled
 *     panoramas, interiors, attics, museums…).
 *  2. Look up the country + continent of every point OFFLINE with a
 *     point-in-polygon test against Natural Earth borders.
 *  3. Fetch categories + licence metadata, drop anything categorised as an interior.
 *  4. Balance the set: per-continent and per-country caps, and a minimum
 *     spacing so the same plaza doesn't appear five times.
 *
 * Run: node scripts/curate-locations.mjs   (after harvest-commons.mjs)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const UA = 'MultiverseRecon/1.0 (Silicon Maze 2026 hackathon; build-time location harvest)';
const raw = JSON.parse(readFileSync('.cache/raw.json', 'utf8'));
const world = JSON.parse(readFileSync('.cache/ne_50m.geojson', 'utf8'));
const rejected = existsSync('scripts/rejected.json') ? new Set(JSON.parse(readFileSync('scripts/rejected.json', 'utf8'))) : new Set();

// --- 1. Title filters ---------------------------------------------------------
const BAD_TITLE =
  /(beschrift|label|annotat|interior|innen|inside|indoor|inneres|intérieur|interno|wnętrze|interieur|dachstuhl|attic|cellar|keller|crypt|krypta|museum|exhibit|ausstellung|room|zimmer|saal|hall\b|halle|kitchen|küche|toilet|bath|office|büro|classroom|schule|school|gymnasium|church nave|kirchenschiff|chapel|kapelle|kirche innen|altar|organ|orgel|cave|höhle|tunnel|mine\b|bergwerk|stollen|hangar|stage|theater|theatre|cinema|library|bibliothek|shop|store|laden|factory|fabrik|werk\b|studio|lobby|foyer|corridor|flur|treppenhaus|staircase|parking garage|tiefgarage|basement|bunker|pool|hallenbad|sauna|test|logo|watermark|map\b|karte|night sky|milky way|sternenhimmel|underwater|unterwasser|refektor|refectory|sacristy|sakristei|choir|chor\b|bell|glocke|nave|cathedral|kathedrale|dom\b|church|kirche|kerk|kościół|église|chiesa|iglesia|mosque|moschee|synagogue|temple interior|tomb|grab\b|pyramid inside)/i;

// Interiors are also caught via their Commons categories in step 3.
const BAD_CATEGORY = /(interior|interiors|innenansicht|innenraum|inside|indoor|museum|naves|attics|organs|altars|crypts|caves|tunnels|mines|labelled|annotated)/i;

// Photo series found in visual QA to carry logos / text banners / interiors on every frame.
const BAD_AUTHOR = /(ost360vr|marker_geo1|GreenlandEcosystem|blackmapsmaksym|mahmoud12|Ashwin Kumar|Túllio F|Senado Federal)/i;

// --- 2. Offline reverse geocoding (ray-casting point in polygon) ----------------
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lng, lat, poly) {
  if (!pointInRing(lng, lat, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) return false; // holes
  return true;
}
const countries = world.features.map((f) => {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // Bounding box for a cheap pre-check
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of polys) for (const [x, y] of p[0]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const P = f.properties;
  const iso = P.ISO_A2_EH && P.ISO_A2_EH !== '-99' ? P.ISO_A2_EH : P.ISO_A2;
  return { name: P.NAME, iso, continent: P.CONTINENT, subregion: P.SUBREGION, polys, bbox: [minX, minY, maxX, maxY] };
});

function lookupCountry(lat, lng) {
  for (const c of countries) {
    const [x0, y0, x1, y1] = c.bbox;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    if (c.polys.some((p) => pointInPolygon(lng, lat, p))) return c;
  }
  // Coastal points can fall just outside the generalised 1:50m coastline:
  // nudge the point a little in 8 directions before giving up.
  for (const d of [0.05, 0.12]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
      for (const c of countries) {
        const [x0, y0, x1, y1] = c.bbox;
        const x = lng + dx, y = lat + dy;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (c.polys.some((p) => pointInPolygon(x, y, p))) return c;
      }
    }
  }
  return null;
}

// --- helpers --------------------------------------------------------------------
const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function shuffle(arr, seed = 42) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// --- run ------------------------------------------------------------------------
let pool = raw.filter((r) => !BAD_TITLE.test(r.title));
console.log(`raw ${raw.length} -> after title filter ${pool.length}`);

pool = pool
  .map((r) => {
    const c = lookupCountry(r.lat, r.lng);
    return c ? { ...r, country: c.name, iso: c.iso, continent: c.continent, subregion: c.subregion } : null;
  })
  .filter(Boolean);
console.log(`with a country: ${pool.length}`);

const byContinent = {};
for (const r of pool) (byContinent[r.continent] ??= []).push(r);
console.log(Object.fromEntries(Object.entries(byContinent).map(([k, v]) => [k, v.length])));

// Caps keep the game global instead of 80% Germany.
const CONTINENT_CAP = {
  Europe: 90,
  Asia: 75,
  'North America': 60,
  'South America': 40,
  Africa: 40,
  Oceania: 30,
  Antarctica: 6,
  'Seven seas (open ocean)': 0,
};
const COUNTRY_CAP = 6;
// Huge countries deserve more than one city-state's worth of rounds.
const BIG_COUNTRY_CAP = { US: 18, CA: 9, RU: 9, CN: 9, BR: 9, AU: 9, IN: 8, AR: 6, MX: 7, ZA: 6, JP: 7 };
const capFor = (iso) => BIG_COUNTRY_CAP[iso] ?? COUNTRY_CAP;
const MIN_SPACING_KM = 25;

// Pre-select ~2x the cap per continent, then metadata-filter, then trim.
const preselected = [];
for (const [cont, items] of Object.entries(byContinent)) {
  const cap = CONTINENT_CAP[cont] ?? 20;
  const perCountry = {};
  const chosen = [];
  for (const r of shuffle([...items], 7)) {
    if (chosen.length >= cap * 3) break;
    if (rejected.has(r.pageid)) continue; // manually rejected in visual QA (keeps the shuffle order stable)
    if ((perCountry[r.iso] ?? 0) >= capFor(r.iso) * 2) continue;
    if (chosen.some((c) => km(c, r) < MIN_SPACING_KM)) continue;
    perCountry[r.iso] = (perCountry[r.iso] ?? 0) + 1;
    chosen.push(r);
  }
  preselected.push(...chosen);
}
console.log(`preselected ${preselected.length}`);

// --- 3. Metadata: categories + licence + thumbnail url --------------------------
const meta = new Map();
for (let i = 0; i < preselected.length; i += 50) {
  const batch = preselected.slice(i, i + 50);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    pageids: batch.map((b) => b.pageid).join('|'),
    prop: 'imageinfo|categories',
    cllimit: 'max',
    iiprop: 'url|extmetadata',
    iiurlwidth: '3840',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|DateTimeOriginal',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  for (const p of data.query.pages) meta.set(p.pageid, p);
  await sleep(200);
  process.stdout.write('.');
}
console.log();

const final = [];
const perContinent = {};
const perCountry = {};
for (const r of preselected) {
  const m = meta.get(r.pageid);
  const ii = m?.imageinfo?.[0];
  if (!ii?.thumburl) continue;
  const cats = (m.categories ?? []).map((c) => c.title);
  if (cats.some((c) => BAD_CATEGORY.test(c))) continue;
  if (BAD_AUTHOR.test(stripHtml(ii.extmetadata?.Artist?.value))) continue;
  const cap = CONTINENT_CAP[r.continent] ?? 20;
  if ((perContinent[r.continent] ?? 0) >= cap) continue;
  if ((perCountry[r.iso] ?? 0) >= capFor(r.iso)) continue;
  perContinent[r.continent] = (perContinent[r.continent] ?? 0) + 1;
  perCountry[r.iso] = (perCountry[r.iso] ?? 0) + 1;

  // thumburl looks like .../thumb/a/ab/File.jpg/3840px-File.jpg – keep the stem so the
  // client can request a smaller width on phones.
  const md = ii.extmetadata ?? {};
  final.push({
    id: `c${r.pageid}`,
    lat: +r.lat.toFixed(6),
    lng: +r.lng.toFixed(6),
    country: r.country,
    iso: r.iso,
    continent: r.continent,
    region: r.subregion,
    title: r.title.replace(/^File:/, '').replace(/\.(jpe?g|png|tiff?)$/i, ''),
    thumb: ii.thumburl,
    page: ii.descriptionurl,
    author: stripHtml(md.Artist?.value).slice(0, 80) || 'Unknown',
    license: stripHtml(md.LicenseShortName?.value) || 'See source',
  });
}

console.log('final per continent', perContinent);
console.log(`final ${final.length} locations from ${Object.keys(perCountry).length} countries`);
writeFileSync('src/data/locations.json', JSON.stringify(final, null, 1));
