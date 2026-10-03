# MULTIVERSE RECON · Doomsday Edition

**The multiverse is collapsing.** You're dropped into a **real 360° street-level panorama** somewhere on Earth. Look around, read the clues, and pin the spot on the Nexus Map before the timeline fractures. You get five anomalies per game. The closer your guess, the more of the timeline you stabilise.

> Built for **Silicon Maze 2026 – Doomsday Edition** (Web Enthusiasts' Club, NITK), Development Track.
> Task: [Silicon Maze: Multiverse Recon](https://github.com/WebClub-NITK/GDG-SM-2026-Tasks/blob/main/SM-Geoguesser.md)

### ▶ Play it: **https://multiverse-recon.vercel.app**

### 🎬 Video walkthrough (approach + code): **https://youtu.be/s1hSyKfZbSM**

[![Watch the walkthrough on YouTube](https://img.shields.io/badge/%E2%96%B6%20Watch%20the%20walkthrough-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/s1hSyKfZbSM) [![Play live](https://img.shields.io/badge/Play%20live-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://multiverse-recon.vercel.app)

---

## 📋 Submission at a glance

| Task | Subtask | Pts | Status | Details |
|---|---|---|---|---|
| **1 · Interface & Map** | 1.1 Location Viewer (responsive, themed, optional skippable tour) | 25 | ✅ | [↓](#task-1-the-observation-deck) |
| | 1.2 Interactive Nexus Map (clickable, single movable marker) | 25 | ✅ | [↓](#task-1-the-observation-deck) |
| **2 · Game Logic** | 2.1 Anomaly Generation (random from a predefined list) | 20 | ✅ | [↓](#task-2-timeline-stabilization) |
| | 2.2 Convergence Calculation (Haversine, km / mi) | 40 | ✅ | [↓](#task-2-timeline-stabilization) |
| **3 · Scoring & Progression** | 3.1 Scoring System (inverse to distance, max + zero-point distance) | 25 | ✅ | [↓](#task-3-the-tva-assessment) |
| | 3.2 5 rounds, cumulative score, Final Results map, Play Again | 25 | ✅ | [↓](#task-3-the-tva-assessment) |
| **4 · Bonus** | Timers · Streak multiplier · Easy/Medium/Hard · Shared leaderboard | 20 | ✅ all 4 | [↓](#task-4-multiversal-anomalies-bonus) |
| **5 · Deploy & Docs** | 5.1 Deployment (Vercel) | 10 | ✅ | [live](https://multiverse-recon.vercel.app) |
| | 5.2 README (description, tech stack, local setup) | 10 | ✅ | [stack](#-tech-stack) · [setup](#-run-it-locally) |
| | **Video explanation** (task-repo guidelines) | – | ✅ | [YouTube](https://youtu.be/s1hSyKfZbSM) |

---

## For judges: quick facts

- **Real panoramas, no API key needed.** 225 hand-checked, geotagged **360° equirectangular panoramas** from Wikimedia Commons, covering **82 countries on all 7 continents**. You can drag to look around in every direction and zoom, like Street View. There is no Google billing key that could expire during judging.
- **Exact distance math, unit-tested.** Scoring uses the Haversine great-circle distance. The reveal screen also shows the survey-grade **Vincenty (WGS-84 ellipsoid)** distance. **33 automated tests** cover city pairs, the antimeridian, antipodal points, wrapped Leaflet longitudes, a geodesy reference case, scoring edge cases and the leaderboard's anti-cheat rules.
- **All four bonus mechanics are built:** Time Dilation (timers), Nexus Streaks (multiplier), three Difficulty Levels (Easy hints, Hard zoomed-in with a strict timer), and a **global leaderboard in shared Postgres** that **re-scores every game on the server**, so a total can't be inflated by editing the page or the request.
- **Built from scratch.** All game logic is my own TypeScript: the distance maths (Haversine and Vincenty), the scoring curve, the round/streak/timer state machine, seeded location picking, the panorama loader, the leaderboard API with its anti-cheat checks, and the data pipeline. No game template or GeoGuessr clone was used. Libraries only draw things: Photo Sphere Viewer for the 360° image, Leaflet for the map, React for the UI. The code is commented to explain the reasoning, especially in [`geo.ts`](src/lib/geo.ts), [`scoring.ts`](src/lib/scoring.ts) and [`server/core.ts`](server/core.ts).
- **Runs locally with zero setup.** `npm install && npm run dev` gives you the full game, leaderboard included (it uses an in-memory store when no database is configured).

---

## ✅ Task coverage, point by point

### Task 1: The Observation Deck

**1.1 Location Viewer** (25 pts)

| Requirement | How it's met | Where |
|---|---|---|
| Street-view panorama / high-quality image | Full **360° spherical panoramas** in [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) (three.js/WebGL). Drag, inertia, wheel / pinch / `+` `−` zoom, arrow keys and a reset-view button. Each round starts facing a **random direction**, so the best view isn't handed to you | [`PanoViewer.tsx`](src/components/PanoViewer.tsx) |
| Smooth loading | Our own loader: **streamed download with a real % progress**, a timeout and one retry. The **next round is preloaded** in the background. Phones and data-saver connections get the 1920 px version, desktops get 3840 px | [`panoramaCache.ts`](src/lib/panoramaCache.ts) |
| No answer leaks | The file title (which usually names the place) is **never in the DOM during a round**: no alt text, no caption. Title, author and licence appear only on the reveal | [`RevealPanel.tsx`](src/components/RevealPanel.tsx) |
| Thematic (multiverse / Avengers) | "Doomsday" HUD: Doom-green and TVA-amber palette, clipped tech panels, scanlines, a live **auto-rotating 360° backdrop** on the menu, synthesized sound effects (Web Audio) and TVA-style ranks (*Pruned → Sorcerer Supreme*) | [`index.css`](src/index.css), [`MainMenu.tsx`](src/components/MainMenu.tsx) |
| Desktop **and** mobile | Desktop: GeoGuessr-style map dock that grows on hover, with three sizes and a pin. Mobile: the panorama fills the screen and the map is a **bottom sheet** with its own lock button; the HUD is compact and respects safe areas | [`GameScreen.tsx`](src/components/GameScreen.tsx) |
| Accessibility | Keyboard play (`Space`/`Enter` locks the guess, `Enter`/`N` goes to the next round, `Esc` closes dialogs), ARIA labels and roles (`timer`, `dialog`), visible focus rings, `prefers-reduced-motion` support | throughout |
| **Optional first-time tour, skippable** | Starts automatically when your first panorama loads. **7–8 spotlight steps** (viewer, map, lock, timer, streak, intel, help). **Skip** button on every step, `Esc`, and `←` `→` keys. The **timer is paused** while the tour is open. Shown once (remembered in localStorage) and can be **replayed from the ? button** | [`Tour.tsx`](src/components/Tour.tsx) |

**1.2 Interactive Nexus Map** (25 pts)

| Requirement | How it's met | Where |
|---|---|---|
| Clickable world map | **Leaflet** with Esri World Street Map tiles (keyless). If tiles start failing it **switches to OpenStreetMap automatically** | [`mapKit.ts`](src/components/mapKit.ts) |
| Single, movable marker | Click or tap to drop the guess. Clicking again **moves the same marker**, and you can also **drag** it. There is only ever one marker. Lock is disabled until it's placed | [`GuessMap.tsx`](src/components/GuessMap.tsx) |
| Robustness | Longitudes from wrapped world copies (e.g. 200°) are **normalised to [-180, 180)** before any maths. `invalidateSize()` runs on every resize, so tiles never go grey when the dock or sheet animates | [`geo.ts`](src/lib/geo.ts) |

### Task 2: Timeline Stabilization

**2.1 Anomaly Generation** (20 pts)

| Requirement | How it's met | Where |
|---|---|---|
| Random locations from a predefined list | A curated catalogue of **225 lat/lng locations** built from Wikimedia Commons by a reproducible pipeline (below). Each game picks **5 distinct locations**, **never two from the same country**, spread across as many continents as possible, and **avoids places you've seen recently** | [`pick.ts`](src/lib/pick.ts), [`locations.json`](src/data/locations.json) |
| Ranked games are server-generated | For leaderboard games, the **server picks the locations** and signs them, so a client can't choose easy ones. The **Daily Anomaly** is seeded from the date (mulberry32 PRNG), so **everyone gets the same five places** each day | [`server/core.ts`](server/core.ts) |
| Viewer updates seamlessly | Each new round swaps the panorama in place, with the next one already preloaded. If an image ever fails, the round **re-routes to a spare location** (each session carries 3 spares) without breaking the game | [`store.ts`](src/game/store.ts) |

**2.2 Convergence Calculation** (40 pts)

| Requirement | How it's met | Where |
|---|---|---|
| Distance between actual and guessed coordinates | **`haversineKm()`**: the Haversine formula with the IUGG mean Earth radius, using the numerically stable `atan2` form. It's heavily commented | [`geo.ts`](src/lib/geo.ts) |
| km **or** miles | **Unit toggle** (km / mi) on the menu and in the HUD, remembered per player. Formatting adapts (m / km, ft / mi) | [`geo.ts → formatDistance`](src/lib/geo.ts) |
| Going further | **`vincentyKm()`**: Vincenty's inverse formula on the **WGS-84 ellipsoid**, accurate to well under a millimetre, shown next to Haversine. Also the **initial bearing** ("the target lay NW of your pin") and **antimeridian-safe great-circle paths** drawn on the reveal map | [`geo.ts`](src/lib/geo.ts) |
| Verified | Tests: Paris–London, London–New York, NITK–Bengaluru, 1° of latitude, **antimeridian** (179.5°E→179.5°W = 111 km, not 39,000), **antipodal** and pole-to-pole, wrapped longitudes, metre-scale precision, and the classic **Flinders Peak → Buninyong** geodesy test (54,972.271 m) | [`geo.test.ts`](src/lib/geo.test.ts) |

```
a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
d = 2R · atan2(√a, √(1−a))          R = 6371.0088 km
```

### Task 3: The TVA Assessment

**3.1 Scoring System** (25 pts)

| Requirement | How it's met |
|---|---|
| Closer = more points | Exponential decay: points fall quickly for small errors and flatten out for far misses, which feels fair at both city and continent scale |
| Maximum points per round | **5,000** (full points within 50 m) |
| Distance where zero points are awarded | **7,000 km**. The curve is rescaled so it reaches **exactly 0** there and stays continuous (no sudden cliff) |
| Transparent | An in-game **"How scoring works"** panel plots the real `basePoints()` curve (hover to probe), with sample values, the streak table and the difficulty table |

```
points(d) = 5000 · (e^(−d/1500) − e^(−7000/1500)) / (1 − e^(−7000/1500))    for d < 7000 km
points(d) = 0                                                               for d ≥ 7000 km
```

| Distance | 1 km | 50 km | 250 km | 1,000 km | 2,500 km | 5,000 km | ≥ 7,000 km |
|---|---|---|---|---|---|---|---|
| Points | 4,997 | 4,835 | 4,225 | 2,544 | 906 | 133 | **0** |

Code: [`scoring.ts`](src/lib/scoring.ts), tests: [`scoring.test.ts`](src/lib/scoring.test.ts)

**3.2 Multi-Round Gameplay & Results** (25 pts)

| Requirement | How it's met | Where |
|---|---|---|
| 5 distinct rounds | A Zustand state machine: `menu → [loading → guessing → reveal] × 5 → results` | [`store.ts`](src/game/store.ts) |
| Cumulative score shown as you play | HUD shows round x/5, an animated running score, the streak and the timer | [`GameScreen.tsx`](src/components/GameScreen.tsx) |
| Per-round reveal | Map with your pin, the true pin and an animated **great-circle line**. Shows points (count-up), the breakdown (base × intel × streak), Haversine and ellipsoid distance, bearing, country flag, place name and photo credit | [`RevealPanel.tsx`](src/components/RevealPanel.tsx) |
| **Final Results Screen**: total score | Big total with a rank badge (S–F), personal best, average distance, best round, max streak and total time | [`ResultsScreen.tsx`](src/components/ResultsScreen.tsx) |
| **Visual summary of all guesses vs actual** | One map with all **5 numbered guess → actual pairs** joined by great-circle lines. Hover or tap a row in the anomaly log to fly the map to that pair | [`ResultMap.tsx`](src/components/ResultMap.tsx) |
| **"Play Again"** | Starts a fresh game (new locations, same mode), plus Main Menu and **Share** (a Wordle-style emoji summary copied to the clipboard) | |

### Task 4: Multiversal Anomalies (Bonus)

| Mechanic | Implementation |
|---|---|
| ⏱ **Time Dilation** | Circular countdown per round (Easy 3:00, Medium 1:30, Hard 0:45). It turns amber, then red with ticking sounds in the last 10 s. At zero your current marker is **auto-locked** (or the round scores 0). The clock only starts once the panorama is visible and **pauses during the tour** |
| 🔥 **Nexus Streaks** | Each consecutive round with ≥ 3,500 base points (about 500 km or closer) grows the streak: **×1.0 → ×1.1 → ×1.2 → ×1.3 → ×1.4**. A weak guess resets it. The HUD previews the next multiplier |
| 🎚 **Difficulty Levels** | **Easy** (*Variant*): long timer plus paid **intel hints**: region (−15%), country with flag (−30%), and a **1,000 km search zone** drawn on the map (−25%). The zone is placed off-centre so it doesn't give away the answer. **Medium** (*Minuteman*): 90 s, no hints. **Hard** (*Hunter*): **45 s**, **zoomed-in 38° view with zoom-out locked**, no hints |
| 🏆 **Leaderboards (shared persistent storage)** | **Neon serverless Postgres** behind Vercel Functions. Separate boards per difficulty, for **all-time** and for **today's Daily Anomaly**. See *Anti-cheat* below |
| ➕ Extras | Daily Anomaly mode, personal bests, recently-seen avoidance, km/mi, sound with a mute toggle, share card, offline fallback |

**Anti-cheat: what the server enforces**

1. `POST /api/session`: the server picks the locations and returns them in an **HMAC-SHA256 signed token**.
2. `POST /api/scores`: the client sends only raw guesses, hints and times. The server:
   - verifies the signature and that every location belongs to that session,
   - enforces the rules (time limit per round, hints only on Easy, 5 distinct rounds, wall-clock plausibility),
   - **re-computes every distance and point with the same `scoring.ts` the game uses**, ignoring any client total,
   - rejects **replays** (unique session id) and sanitises names.

> **Honest limit:** like any client-side geo game, the browser has to know the locations to show them, so the *guesses* themselves are client-reported. The server guarantees the score is computed correctly from those guesses, within the rules, once per session. It cannot prove a human made them.

All of this is covered by [`server/core.test.ts`](server/core.test.ts) (a tampered token gives 403, a foreign location 400, hints on Hard 400, over-time 400, a replay 409).

### Task 5: Deployment & Documentation

**5.1 Deployment** (10 pts)

- **Live and publicly playable:** https://multiverse-recon.vercel.app, hosted on **Vercel**: a static Vite build plus two serverless functions (`/api/session`, `/api/scores`) backed by Neon Postgres.
- Works on desktop and mobile browsers with no login or API key. It has been checked end to end in production: playing a game and submitting a server-verified score.

**5.2 Documentation** (10 pts)

This README covers everything the task asks for:

- **Project description:** [intro](#multiverse-recon--doomsday-edition) and [task coverage](#-task-coverage-point-by-point).
- **Tech stack:** [🧰 Tech stack](#-tech-stack).
- **How to run and test it locally:** [🚀 Run it locally](#-run-it-locally) (`npm install && npm run dev`, `npm test`).
- **Video walkthrough** of the approach and code: https://youtu.be/s1hSyKfZbSM.

---

## 🧰 Tech stack

| Layer | Choice |
|---|---|
| UI | **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, Motion (animations), lucide icons |
| 360° viewer | **Photo Sphere Viewer 5** (three.js / WebGL) |
| Map | **Leaflet** with Esri World Street Map (OSM fallback) |
| State | **Zustand** |
| Backend | **Vercel Functions** (Web `Request → Response` handlers), **Neon Postgres** (`@neondatabase/serverless`) |
| Tests | **Vitest** (33 tests) |
| Data | Wikimedia Commons API, Natural Earth borders (offline reverse geocoding), sharp (QA contact sheets) |

## 🗺 The location pipeline

Commons has thousands of geotagged 360° panoramas, but many are interiors, labelled panoramas or skewed. The game ships a curated set built by [`scripts/`](scripts):

1. **Harvest** ([`harvest-commons.mjs`](scripts/harvest-commons.mjs)): pages through every `{{Pano360}}` file (about 46,000 candidates). It keeps only images with GPS coordinates and a true **2:1 equirectangular** ratio. It's polite to the API (sequential, backs off on 429) and resumable.
2. **Curate** ([`curate-locations.mjs`](scripts/curate-locations.mjs)):
   - drops answer-leaking or ungeolocatable titles and categories (labelled, interior, museum, cave…),
   - **looks up country and continent offline** with a point-in-polygon test against Natural Earth borders,
   - **balances** the set with per-continent and per-country caps (scaled for big countries) and 25 km minimum spacing.
3. **Visual QA** ([`contact-sheets.mjs`](scripts/contact-sheets.mjs)): renders numbered contact sheets of every image. Each one was **reviewed by eye**. Interiors, dual-fisheye images and photo series with logo or text banners (which give away the country) were rejected ([`rejected.json`](scripts/rejected.json) plus an author blacklist).

Result: **225 locations · 82 countries · 7 continents**, with author and licence kept for attribution.

## 🚀 Run it locally

Requirements: **Node.js 20.19+ or 22.12+** (required by Vite 8).

```bash
git clone https://github.com/Mohammed-Rayan07/multiverse-recon.git
cd multiverse-recon
npm install
npm run dev          # http://localhost:5173 (full game + leaderboard API, in-memory store)
```

Optional: use a real Postgres for the leaderboard. Copy `.env.example` to `.env` and set:

```bash
DATABASE_URL=postgresql://...      # any Postgres; the table is created automatically
LEADERBOARD_SECRET=some-long-random-string
```

Other scripts:

```bash
npm test             # 33 unit tests (geo maths, scoring, anti-cheat API)
npm run build        # bundle API functions + type-check + production build
npm run preview      # serve the production build
npm run data:harvest # (optional) re-harvest Commons panoramas → .cache/raw.json
npm run data:curate  # (optional) rebuild src/data/locations.json
```

## 📁 Project structure

```
src/
  lib/geo.ts            Haversine, Vincenty, bearing, great-circle paths, formatting   (+ geo.test.ts)
  lib/scoring.ts        points curve, difficulties, hints, streaks, game scoring       (+ scoring.test.ts)
  lib/pick.ts           seeded random location selection (shared with the server)
  lib/panoramaCache.ts  streaming panorama loader + preload cache
  game/store.ts         game state machine (Zustand)
  components/           PanoViewer, GuessMap, ResultMap, GameScreen, RevealPanel,
                        ResultsScreen, MainMenu, Tour, Timer, HintPanel, modals
  data/locations.json   curated anomaly catalogue
server/core.ts          leaderboard + session handlers (+ core.test.ts)
api/*.js                bundled Vercel Functions (generated by scripts/build-api.mjs)
scripts/                data pipeline + API bundler
```

## 🙏 Credits

- **Panoramas:** Wikimedia Commons contributors, used under their CC licences. Each photographer and licence is credited on the reveal screen, with a link to the source.
- **Map tiles:** © Esri and contributors; © OpenStreetMap contributors. **Borders:** Natural Earth (public domain). **Flags:** flagcdn.com.
- Inspired by GeoGuessr and the reality-bending events of *Avengers: Doomsday*. Fan project for a hackathon; not affiliated with Marvel.
