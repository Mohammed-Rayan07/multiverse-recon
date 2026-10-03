/**
 * QA helper: renders numbered contact sheets of every curated panorama so a
 * human can spot interiors, watermarks or unusable images. Rejected page IDs go
 * into scripts/rejected.json and are skipped by curate-locations.mjs.
 *
 * Run: node scripts/contact-sheets.mjs  → .cache/sheets/sheet-XX.jpg
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const UA = 'MultiverseRecon/1.0 (https://github.com/Mohammed-Rayan07; QA contact sheets)';
const list = JSON.parse(readFileSync(process.argv[2] ?? 'src/data/locations.json', 'utf8'));
mkdirSync('.cache/thumbs', { recursive: true });
mkdirSync('.cache/sheets', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLS = 4, ROWS = 5, TW = 300, TH = 150;
for (let i = 0; i < list.length; i++) {
  const a = list[i];
  const file = `.cache/thumbs/${a.id}.jpg`;
  if (existsSync(file)) continue;
  const url = a.thumb.replace('/3840px-', '/500px-');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (res?.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      break;
    }
    await sleep(3000 * (attempt + 1));
  }
  await sleep(150);
}

const per = COLS * ROWS;
for (let s = 0; s * per < list.length; s++) {
  const items = list.slice(s * per, (s + 1) * per);
  const composites = [];
  for (let k = 0; k < items.length; k++) {
    const idx = s * per + k;
    const file = `.cache/thumbs/${items[k].id}.jpg`;
    const x = (k % COLS) * TW, y = Math.floor(k / COLS) * (TH + 18);
    if (existsSync(file)) {
      composites.push({ input: await sharp(file).resize(TW, TH, { fit: 'fill' }).toBuffer(), left: x, top: y + 18 });
    }
    const label = `${idx} ${items[k].country}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 38);
    composites.push({
      input: Buffer.from(`<svg width="${TW}" height="18"><rect width="100%" height="100%" fill="#000"/><text x="4" y="13" font-size="13" font-family="Arial" fill="#ffd400">${label}</text></svg>`),
      left: x,
      top: y,
    });
  }
  await sharp({ create: { width: COLS * TW, height: ROWS * (TH + 18), channels: 3, background: '#222' } })
    .composite(composites)
    .jpeg({ quality: 70 })
    .toFile(`.cache/sheets/sheet-${String(s).padStart(2, '0')}.jpg`);
}
console.log('sheets written');
