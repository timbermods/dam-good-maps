# Dam Good Maps: website plan

A static website where a player picks settings, generates a Timberborn map, sees it in the browser
and downloads a `.timber` file that loads and plays in Timberborn 1.1. This plan is meant to be
implemented directly. The facts it rests on are in
[investigation/REPORT.md](investigation/REPORT.md), [FORMAT.md](FORMAT.md) and
[investigation/calibration.json](investigation/calibration.json). The Python prototype in
[prototype/](prototype/) already implements a large part of it: one archetype, the exact water
model, the validator and the file writer.

The generator is the first half of one app. [EDITOR_PLAN.md](EDITOR_PLAN.md) plans the map editor
and the Claude integration, and [ROADMAP.md](ROADMAP.md) orders the work of both plans. The
foundations the two halves share (map spec, parametric features, set-piece builders, stable ids,
validation, format I/O, determinism and the build order) are defined once, in
[§19](#19-shared-foundations-with-the-editor). Every generated map is built from parametric
features, from the first milestone on, and the editor keeps them with the map as its plan (for
"Generate, keeping my edits" and Claude's steering); the player shapes the land with the brushes
(D182). [AUDIT.md](AUDIT.md) records why each part
changed during the plan audit.

## Contents

0. [Product principles](#product-principles)
1. [What the investigation changed](#1-what-the-investigation-changed)
2. [Architecture and tech stack](#2-architecture-and-tech-stack)
3. [Project structure](#3-project-structure)
4. [How the prototype and calibration carry over](#4-how-the-prototype-and-calibration-carry-over)
5. [Settings](#5-settings)
6. [Theme presets](#6-theme-presets)
7. [Generation pipeline](#7-generation-pipeline)
8. [Archetypes](#8-archetypes)
9. [Set pieces](#9-set-pieces)
10. [Water simulation](#10-water-simulation)
11. [Validation](#11-validation)
12. [Interestingness score](#12-interestingness-score)
13. [Names and premises](#13-names-and-premises)
14. [Website features](#14-website-features)
15. [Testing](#15-testing)
16. [Milestones](#16-milestones)
17. [Risks and open questions](#17-risks-and-open-questions)
18. [In-game checklist](#18-in-game-checklist)
19. [Shared foundations with the editor](#19-shared-foundations-with-the-editor)
20. [Editor decisions](#20-editor-decisions)
21. [Changes from audit](#changes-from-audit)

---

## Product principles

**Maps are created, not copied** (Kyler, 2026-09-25; §20 D108). It binds M9 and every later
milestone.

> Dam Good Maps creates maps. It never approximates existing maps, and it never produces a few archetypes with a little noise. That would make the product useless. Its maps come from generative processes and composition, inspired by real landscapes, Timberborn's mechanics and good play design. Two maps must play differently, not only look different: a different place to settle, a different first dam, a different way through the first drought, different threats, different paths outward, and something to discover. Workshop and official maps are evidence of what's playable and of Kyler's taste, never a template.

**Claude steers the generator; it never hand-builds the map** (Kyler, 2026-09-25; §20 D139).

> When a request asks for character or new features ("make this valley harsher", "give me a huge dam opportunity halfway down", "put the start under a cliff"), Claude turns it into intentions (outcomes, not recipes) and settings, regenerates the affected area steered toward them, with locks on what the player wants kept, checks the result with the analysis, and reports honestly what emerged and what didn't. Editor operations are for precise edits the player asks for ("move the start here", "widen this river by two", "delete that forest", "lock this area"), as brush-style operations, never landform objects (§20 D187).


**The north-star player journey** (Kyler, 2026-09-25; §20 D161). Find a striking place (for
example in Google Earth), turn it into a Timberborn map (Pick a place), watch how its droughts
and badtides play out (the Weather view), make a few changes (Live editing), and play it as a
functional, validated, interesting map (export, later one-click play). It checks priorities:
each step must feel smooth, and a gap anywhere breaks the experience.
---

## 1. What the investigation changed

Your brief was the starting point. These findings changed it; each is explained where it applies.

| Finding | Consequence for the website |
|---|---|
| Beavers cannot cross even a 1-voxel step without a Slope or stairs (stairs cost 70 science). | Terracing is also a reachability decision. The generator places Slopes to join every level the colony needs early, and validation measures reachable land, not "flat land". |
| All water sources stop in drought. | "Total flow strength" does not make droughts forgiving; stored water does. Flow and drought resilience become separate settings. |
| Normal starts with 130 food and **no water**; thirst deaths begin around day 5.7; a Folktails pump reaches 2 levels down. | Clean water within pump reach of the start is a hard rule, scaled by difficulty. |
| Moisture reaches 16 tiles from wide clean water at bank level, 6 fewer per level of bank. Living plants need moisture > 0. | Forests and berries are placed from simulated moisture. Living trees go on moist soil, dead stands on dry soil, exactly as the official maps store them. |
| The game's water rules are simple enough to port exactly for heightfield maps; the Python port matches the game's own save to 0.001 depth. | The preview shows the water the player will see, validation uses the same water, and maps ship pre-filled with settled water like the official ones. |
| Terrain is 23 layers; the editor caps terrain at 16; official maps all top out at 16. | "Max height" becomes a relief setting within 16 levels. Waterfalls and cliffs are bounded by that budget (§9). |
| Density depends strongly on map size (small maps carry 3–4× the scrap, trees and berries per tile). | Every amount is a size-aware rate interpolated from the official size classes, then scaled by the player's setting. |
| Official ruin fields: 97% of columns in fields of 10+, fill 0.56 of the bounding box, heights in clumps, only a weak lean of tall columns inward. | Ruins are generated as clumped blobs with a mild inward bias (§9.7), not a strong radial gradient. |
| Only Pine, Birch, Oak, Succulent and BlueberryBush load for both factions and in the editor. | The species mix offers exactly these five. |
| Pre-0.7 heightmaps and caves need extra format and water work; the 1.0+ objects differ widely in risk. | 1.0+ features are sorted into settings, theme ingredients and later/left out (§5.7). |
| Map edges drain, except the padding next to a source cell. Water surfaces settle flat at their spill level. (Audit experiment: a channel mouth wider than its row of edge sources lost all its water back off the edge.) | River mouths on the edge are sealed: sources fill the whole mouth, or the mouth is walled and fed by inland springs (§7.6). A lake's level is its outlet sill, not a free number, and a lake without inflow slowly evaporates. |
| A waterfall's width needs flow: lip depth is about 0.3·S/W. Official falls are 2–8 tiles wide on nearly every map, with lips 0.12–0.3 deep. The terrain budget allows a drop of at most 15 levels. | Waterfalls are sized by measured rules (§9.2): the header pool, the flow per tile of width, and the achievable drop. |

---

## 2. Architecture and tech stack

A fully client-side static site. There is no server; everything runs in the player's browser.

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for UI, generator, worker and Node tools. The generator is a large algorithmic codebase that benefits from types. |
| Build | Vite | Fast dev server, worker bundling (`new Worker(new URL(…), {type:"module"})`), code-splitting for the 3D view. Static output. |
| UI | Preact + `@preact/signals` | About 5 KB. React-style components for the settings panel, map card and layers, with fine-grained updates while the worker streams progress. |
| Generator core | Plain TypeScript package (`src/core`) with no DOM access | Runs identically in the Web Worker, in Node (tests, batch runs) and in Vitest. |
| Worker RPC | Comlink (about 1 KB) | Typed calls into the worker; `transfer()` hands typed arrays over without copying. |
| 2D preview | Canvas 2D with an `ImageData` buffer | 256² tiles is 65k pixels: one `putImageData` per layer change, scaled up with smoothing off. No library needed. |
| 3D preview | three.js, lazy-loaded chunk | Only downloaded when the player opens 3D. Terrain columns are meshed as top faces plus side walls with greedy merging (about 40k quads on a 256² map); trees are instanced. |
| Zip | fflate `zipSync` with a fixed `mtime` | Small, fast and synchronous in the worker. A fixed mtime makes the zip byte-reproducible. |
| JPEG thumbnail | `jpeg-js` encoder in the worker (0.4.4, vendored as an ES module that returns a `Uint8Array`, D20) | Canvas `toBlob` encoders differ between browsers; a JS encoder gives the same bytes everywhere, keeping downloads byte-identical per seed. |
| Tests | Vitest (unit, golden files), Playwright (end-to-end and cross-browser determinism), plus the Python prototype as an oracle in CI | See §15. |
| Hosting | GitHub Pages from GitHub Actions: `timbermods.github.io/dam-good-maps/` | Free, the same place as the other timbermods sites, and no server to run. GitHub Pages cannot set response headers (no COOP/COEP), so `SharedArrayBuffer` threads are unavailable: parallel work runs as independent workers. |
| Second build target | A single-file build for publishing as a Claude artifact (EDITOR_PLAN.md, Claude integration) | The same code with platform adapters swapped (§19.9). Keep it possible from the start: data is bundled, not fetched at runtime; workers can be inlined; libraries come from npm, since the artifact can load scripts only from cdnjs/jsDelivr/unpkg. |
| Visual design | The org's Impeccable site flow and the timbermods design system (walnut lodge palette, `DESIGN.md`) | Keeps it part of the family; done as its own milestone once the tool works. |

### 2.1 Determinism

"Same seed and settings gives an identical file" must hold across Chrome, Firefox, Safari and
Node:

- **Random numbers.** `sfc32`, seeded through `splitmix32`. Layout planning draws from per-stage
  streams, `hash(seed, stageName, candidate, attempt)`. Everything placed *by a feature* (trees
  of a forest, columns of a ruin field, sources of a river) draws from that feature's own stream,
  `hash(seed, featureId, purpose)` (§19.7). Changing one forest's density then reshuffles
  neither the terrain nor the other forests, and an edit in the editor stays local.
- **Arithmetic.** Anything that affects output uses only `+ − × ÷`, `Math.sqrt`, `Math.floor`,
  `Math.round`, `Math.abs`, `Math.min` and `Math.max`, which IEEE-754 makes exact across engines.
  - `Math.sin/cos/exp/log/pow/atan2` are implementation-defined in precision, so they are not used
    on output paths.
  - Meanders use a polynomial sine (`core/math/detmath.ts`: an odd polynomial through x¹⁷ on an
    argument reduced to [−π/2, π/2], error below 1e-13). `exp` and `ln`, which the log-normal
    draws and the size-aware densities need, are built the same way from basic operations
    (D15).
  - Noise uses integer-hash value noise with a smoothstep fade.
- **Iteration order.** Always over typed arrays in index order. Priority queues break ties by
  index. No iteration over `Object` keys on output paths.
- **File bytes.** Entity Ids are GUIDs hashed from their owning feature (§19.4), `Timestamp` is a
  constant, zip mtimes are fixed and the JPEG encoder is deterministic.
- **Water.** The settled water written into the file always comes from the canonical settle
  (§19.7). It starts from a state computed only from the terrain and sources (empty, or the
  documented priority-flood pre-fill) and runs a fixed schedule. It never comes from an
  interactive, warm-started preview, because a warm start can end in a slightly different steady
  state (for example, thin sheets held at the 0.1 spill threshold).
- **Versioned reproduction.** A share link carries the generator version (§14.5). Every release is
  also deployed to `/v/<version>/`, so old links still reproduce their exact map after the
  generator changes.

### 2.2 Runtime flow

```
UI (main thread)                          Worker (core)
────────────────                          ─────────────
settings form ── URL ─┐
                      ├── generate(spec) ─────────▶ plan features → build (§19.8) → validate
                      │                              ◀── progress events (stage, attempt, %)
                      │                              ◀── candidate #1 (valid) → preview
                      │                              ◀── candidates #2..K, scores → best
map card, layers ◀────┴── result {spec, features, heights, water, entities, report, score, name}
download ── pack(result) ──────────────────▶ writer → Uint8Array (.timber) ── Blob → save
"Refine this map" ── result as a MapDocument (§19) ──▶ editor (EDITOR_PLAN.md)
```

The first valid candidate is shown at once. The remaining candidates are scored in the background,
and the preview switches to the best one with a short notice. The map card says "best of 3".

### 2.3 Problem reports without a server

A plain **Report a problem** link opens the repository's GitHub issues
(`github.com/timbermods/dam-good-maps/issues`), for bug reports. There is no rating form and no
`tools/ratings.ts` (Kyler, 2026-09-25; §20 D145, superseding D14). Feedback on generated maps is
the in-site feedback proposed for M9c (D137), which steers each theme's priors and the Variety
setting; the score keeps its default weights.

---

## 3. Project structure

```
dam-good-maps/
├─ PLAN.md  FORMAT.md  README.md  LICENSE
├─ package.json  vite.config.ts  tsconfig.json  vitest.config.ts  playwright.config.ts
├─ index.html
├─ src/
│  ├─ core/                        pure TS, no DOM: runs in worker, Node and tests
│  │  ├─ math/        rng.ts (splitmix32, sfc32, streams)  hash.ts (murmur3, ids)  noise.ts  detmath.ts (sin, exp, ln)
│  │  │               grid.ts (typed 2-D helpers, chamfer distance, level regions, heap)
│  │  ├─ format/      timber.ts (read/write zip)  world.ts (world.json encode/decode)  json.ts (C# float format)
│  │  │               entities.ts (templates, component builders)  footprints.ts (generated from notes/footprints.json)
│  │  │               normalize.ts (import normalization, §19.6)  base64.ts
│  │  │               vendor/jpeg-encoder.js (jpeg-js encoder)
│  │  ├─ render/      shade.ts (top-down colours, the thumbnail)
│  │  ├─ sim/         water.ts (exact single-layer port, active list, settle test)  prefill.ts (pre-fill, canonical settle)
│  │  │               model.ts (emitters and obstacles by footprint)  moisture.ts  contamination.ts  drought.ts
│  │  ├─ analysis/    regions.ts (walk regions with slopes, components)  damsites.ts
│  │  │               later: features.ts (rivers, falls, islands, plateaus)
│  │  ├─ spec/        mapspec.schema.json  mapspec.ts (MapSpec, defaults, presets, URL codec, merge patch)  §19.1
│  │  │               schema.ts (the eval-free schema checker, D16)  mergepatch.ts (RFC 7396)
│  │  ├─ features/    schema.ts (every feature kind and its params, §19.2)  features.schema.json  ids.ts (§19.4)
│  │  │               geometry.ts (river paths, bed profiles, polygons)  slopes.ts (derived slopes, §7.5)
│  │  │               raster/*.ts (one rasterizer per kind)  setpieces/*.ts (shared builders, §19.3)
│  │  │               build.ts (the one build pipeline, §19.8, with dirty-region rebuilds)  target.ts  edits.ts (entity and slope edits)
│  │  ├─ doc/         document.ts (MapDocument, project files)  base.ts (the stored map)  ops.ts (edit operations)
│  │  │               session.ts (apply, undo and redo, regenerate, export: what the editor runs)
│  │  ├─ gen/         generate.ts (spec → features, then build, retries)  riverValley.ts (one planner per archetype)
│  │  │               calibrated.ts (size-aware densities)  blobs.ts (ruin and grove shapes)  pack.ts (file, name, thumbnail)
│  │  ├─ validate/    checks.ts (load and design classes, placement emulation, validateMap)  playability.ts
│  │  │               report.ts (result shape, severity per profile, blocking, groups; §19.5)
│  │  ├─ score/       score.ts  naming.ts
│  │  └─ data/        footprints.json (the calibration subset lives in gen/calibrated.ts, tested against calibrated.py)
│  ├─ platform/       adapters: files (save/open), storage, workers, claude (§19.9)
│  ├─ render3d/       the one 3D renderer, used by the generator preview and the editor: model.ts (the map view)
│  │                  mesh.ts (32×32 chunks, voxel columns)  waterMesh.ts  entities3d.ts (instancing)  pick.ts
│  │                  materials.ts  renderer.ts (camera, overlays, the orbit benchmark)
│  ├─ worker/         generator.worker.ts (Comlink API: generate, and the editor's document)  api.ts  session.ts
│  ├─ ui/             App.tsx  SettingsPanel.tsx  Preview2D.tsx  Preview3D.tsx (lazy)  View3D.tsx  MapCard.tsx  Layers.tsx
│  │                  Download.tsx  Share.tsx  InstallHelp.tsx  state.ts (signals)
│  ├─ editor/         the editor UI (EDITOR_PLAN.md, Part 1 and Architecture): Editor.tsx (lazy)  panels.tsx  features.ts  tools.ts
│  └─ styles/
├─ tools/            gen.ts (batch generation)  oracle.ts (Python oracle)  bench.ts  bench3d.ts  ingame-files.ts  export-footprints.ts
│                    batch.ts (Node: N seeds → first-attempt and final pass rates)  golden.ts
│                    export-fixtures.py (Python → tests/golden/water.json.gz)
├─ tests/            unit/  contract/ (§15)  golden/ (fixed seeds → sha256 + key metrics)  e2e/ (Playwright)
├─ prototype/        Python reference implementation and test oracle (kept, see §4)
├─ investigation/    report, calibration, notes, scripts (raw/ and decompiled/ stay local)
├─ out/              prototype test map and batch results; m1/ and later: the files for the in-game checks
└─ .github/          workflows/ci.yml (typecheck, unit, contract, oracle, bench, e2e) · deploy.yml (Pages, /v/<version>/)
```

---

## 4. How the prototype and calibration carry over

The Python prototype is not thrown away. It becomes the **reference implementation and the
oracle** the TypeScript port is tested against.

| Python (prototype/) | TypeScript (src/core/) | How it is kept in step |
|---|---|---|
| `tbmap.py` writer and reader | `format/*` | CI generates maps with the Node CLI, and the Python `roundtrip_test.py` and `validate.py` must pass on them. |
| `watersim.py` (water, moisture, contamination) | `sim/*` | `tools/export-fixtures.py` writes golden vectors: terrain, sources and the state after 50/200/975 ticks, plus steady-state moisture, soil contamination, the pre-fill, the canonical settle and the drought storage, on a dozen small terrains. TS must match within 1e-6 (depth) and exactly on the moist/dry mask; it matches bit for bit. The game's own save is a local-only test (it is not ours to commit): 975 ticks from empty reproduce it within 0.001. |
| `analysis.py` (distances, regions, basins, dam sites) | `analysis/*` | The same fixtures carry expected region sizes and dam-site volumes. |
| `validate.py`, `playability.py` | `validate/*` | Check ids are identical. The oracle job runs both validators on the same 50 maps; their verdicts must agree check by check. |
| `generate.py`, `terrain.py`, `ruins.py`, `vegetation.py` | `gen/*` | Ported as the River Valley archetype for roadmap milestone M1, as feature planners (§7, §19). Not byte-compatible (numpy RNG differs from sfc32); compared through their calibration metrics instead. |
| `calibrated.py` | `data/calibrated.ts` | One table (§5, §11). A test asserts the TS table equals `prototype/calibrated.py`. **The two disagree today.** The difficulty rules in §5.6 are the design intent; `calibrated.py` still has badwater minimum distances of 30 / 20 / 12 (§5.6: 40 / 30 / 15) and a 750-tile minimum reach, which is the Tight value (the §5.2 default, Normal, is 1,300). Align `calibrated.py` to this plan in milestone M1, before the equality test is written. |
| `investigation/analyze_maps.py` | `tools/batch.ts` reuses `analysis/*` | Generated maps are measured with the same yardstick as the official maps, so the batch report can print "generated vs official" side by side. |

`investigation/calibration.json` is the source of truth for every target. `data/calibration.json`
is a trimmed runtime copy with the aggregates and size-class medians only (about 20 KB).
Re-running `analyze_maps.py` after a game update regenerates both.

---

## 5. Settings

Defaults are for the River Valley theme at Normal. A theme preset (§6) overwrites them, and the
player can then change anything. Each setting maps to generator targets. **Size-aware** means the
value is a multiplier on the official size-class median, interpolated in log(area) between
small (50–100²), medium (128²), large (192²) and max (256²).

### 5.1 Basics

| Setting | Values | Default | Notes |
|---|---|---|---|
| Seed | 0 – 4,294,967,295 | random | Shown as a number; also accepted as text, hashed to a number, so "beaver" is a valid seed. |
| Size | Small 96², Medium 128², Large 192², Max 256², Custom | Medium | 128² is the game's default new-map size. Custom width and height are each 48–256 (the game allows 4–256, but under 48 there is no room for a start zone and a river). Non-square is allowed, as in official maps. |
| Theme | River Valley, Canyon, Highlands, Lake Basin, Delta, Islands | River Valley | Pre-fills everything below (§6). |
| Designed for | Easy, Normal, Hard | Normal | The in-game difficulty the map is balanced for. It sets starting-area rules and drought sizing (§5.6). The map works on any difficulty, and the card warns if you pick Hard for a map designed for Easy. |

### 5.2 Terrain

| Setting | Range | Default | Maps to (official calibration) |
|---|---|---|---|
| Relief | Gentle 0 – 100 Dramatic | 55 | Height range p5–p95 = 7 + 0.08·relief levels (7–15; official 9–15, median 13). Cliff-tile share 0.06 + 0.0018·relief (0.06–0.24; official 0.07–0.24, median 0.16). |
| Highest terrain | 10 – 16 | 16 | Terrain never exceeds this. 16 is the in-game map editor's limit and every official map's top. Heights 17–22 come only with high Verticality (§5.9) and tall Real places (§20 D172); the in-game editor cannot edit them, and each tall map's description says so. |
| Terracing | Smooth 0 – 100 Distinct | 50 | The share of height steps that are one level: 0.86 − 0.0059·terracing (0.86–0.27; official median 0.62). Higher terracing gives wider flat benches and more cliffs. |
| Buildable land | Tight, Normal, Generous | Normal | Land walkable from the start through slopes of at least 750 / 1,300 / 2,500 tiles (official min 765, median 1,296, p90 4,523), and flat share 0.40 / 0.52 / 0.60. As built (M6, D59): the valley floor's width, how jagged the terrace edges are, and where the terraces' cliffs go (Tight: at the valley floor's edge; Generous: above every one-level rise). |

### 5.3 Water

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Rivers | 0 – 3 | theme | Number of rivers entering on the map edge. 0 means only lakes, springs and seeps. As built (M6, D60): in River Valley and Canyon the first is the main river and the others are tributaries from the north or south edge, each bringing a quarter of the main river's flow; in Lake Basin they feed the lake. With 0 a spring feeds the main river (Lake Basin: the lake). |
| River style | Straight, Meandering, Braided | Meandering | Straight: meander amplitude ≤ 0.05·H. Meandering: 0.12–0.2·H with 1–3 bends per 100 tiles. Braided: the channel splits into 2–4 parallel channels around islands over a wide flat stretch (Delta). |
| River flow | Trickle, Normal, Strong, Lush | Normal | Total clean source strength: 0.6× / 1× / 2× / 4× the size-aware official median (medium 2.2, large 1.2, max 1.1 per 10k tiles). Lush is about the workshop median. Sources are mostly 0.5 each, in rows of 3–8 across a channel, as in official maps. This controls river size and how fast reservoirs refill, **not** drought survival. |
| Drought reserve | Scarce, Normal, Plenty | Normal | Minimum stored water near the start, as a multiple of the colony's drought need (§11.4): 1× / 1.5× / 3×. Also sets the number of dam sites and natural basins the layout aims for. This setting is what makes droughts forgiving. **Not every combination fits a small map** (§9.1, §9.10). Reservoirs are 2 deep on Easy and Normal and 3 deep on Hard, so Hard with the Normal reserve needs about 590 tiles and Hard with Plenty about 1,170. The panel disables combinations whose reservoir would exceed 15% of the map area and says why. The smallest sides that fit are: Normal with Plenty 51, Hard with Scarce 52, Hard with Normal 63, Hard with Plenty 89. Every size preset (96² and up) fits every combination, so the guard only affects custom sizes. |
| Lakes and basins | None, Few, Some, Many | Some | Natural basins of 20+ tiles that hold water without a dam: 0 / 0.5× / 1× / 2× the official median for the size (small 1.5, medium 4, large 15.5, max 15; `basins_ge20` in the calibration table). As built (M6, D61): riverside ponds, dug two levels below a river's bed beside it and joined to it by a short cut, so the river keeps them full and they keep their water through a drought. |
| Waterfalls | Off, Few, Many | Few | Number of bed drops of 2+ levels: 0 / 1–2 / 3–6. Drop height, width and flow ranges in §9.2. Generated falls sit on rivers and carry that river's flow, so they are 1–9 tiles wide, like official falls. Wider "landmark" falls are a set piece the player or Claude adds. |

### 5.4 Hazards

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Badwater | Off, Low, Normal, High | Normal | Badwater-to-clean strength ratio 0 / 0.3 / 0.65 / 1.2 (official 0.18–2.2, median 0.65). Sources are BadwaterSource 3×3 at strength 1–3, inland on mid-height ground (as in official maps: none are on the edge). As built (M6, D62): the total is split into basins of 1–3 each (§9.5), so High is higher than Normal on every map size. |
| Badwater distance | 8 – 60 (12 – 60 before M8) | 15 (Easy 30, Hard 8), Kyler's decision (D85; the workshop study's W4); before M8 30 (Easy 40, Hard 15) | Distance from the start to badwater or contaminated soil the generator aims for (official p10 12, median 30). The basins are placed about 14 tiles beyond it (D62). The start rule "No badwater within" (§5.6) is the same value: the panel sets both, and validation uses the larger. Since M8 it is a target with an advisory warning, never a reason to reject (D85). The workshop study measured the official maps' nearest badwater to the start: median 14.8, p25 10. |
| Thorn belts | Off, Some | Some (Highlands, River Valley) | 1–3 belts of 13–40 thorns across corridors or plateaus, never within 20 tiles of the start. As built (M7, D75, D81): each belt crosses the way from the start to a relic or a geothermal field, 5–8 tiles in front of it (with none left, a stretch of dry ground), 9–17 tiles across and 2–3 deep, every thorn 22+ tiles from the start; a belt that would cut the colony's land in two is left out. |
| Unstable cores | Off, On | Off | Advanced. 1–4 cores, 40+ tiles from the start, first countdown at cycle 5+, radius 2–3, never within radius + 2 of each other or of a dam site (no chain reactions). As built (M7, D81): countdown in cycle 5–12, 10.5 days in (the official maps' value). |

### 5.5 Resources

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Forest density | 50% – 200% | 100% | Trees per 10k tiles, size-aware (small 1,715, medium 1,061, large 544, max 559), each map placed by its seed within the official typical range (×0.92–1.17). About a third alive (official 0.27–0.43), on moist ground; the rest stored dead on dry ground. |
| Grove size | Scattered, Normal, Big woods | Normal | Grove size median 20 / 40 / 80 trees (a grove: trees within 2 tiles of each other; official median 40), capped at 120 / 250 / 400, with clearings between groves. Near the start, groves of 9 / 15 / 30. Groves are single-species, as every official grove of 20+ is. |
| Species mix | weights for Pine, Birch, Oak, Succulent | 47 / 27 / 20 / 6 | The only species that load for both factions and in the editor. Succulents go on dry soil only. |
| Berries near start | 20 – 100 | by difficulty (Easy 40, Normal 48, Hard 60; Easy was 20 before M8, D85): the generation target, never below Minimum starting bushes (§5.6), which validation enforces | Living bushes within 20 tiles' walk of the start, in 2–3 patches beside water, grown within the colony's walk first (D97). |
| Berry bushes elsewhere | 50% – 300% | 100% | Bushes per 10k tiles, size-aware (small 265, medium 92, large 40, max 44), each map placed within the official typical range (×0.98–1.07), in a few patches of about 44 along the banks. |
| Ruins and scrap | 25% – 300% | 100% | Scrap per 1k tiles, size-aware (small 840, medium 705, large 236, max 235), each map placed within the official typical range (×0.75–1.41). |
| Relics | Off, Some | Some | 0–3 small (13–70 tiles out), 0–2 medium (40–140), 0–1 large (140+, maps ≥ 192²). As built (M7, D81): 1–3 small, 1–2 medium from 128² (0–1 below), one large from 192². |
| Geothermal fields | Off, Some | Some | 1–3 per map, 30–120 tiles out, flat, dry, outside flood reach. As built: 1 / 2 / 3 by size (under 128², from 128², from 192²). |
| Mine sites (UndergroundRuins) | 1 – 4 | 1 / 2 / 3 / 3 by size | Every map has at least one (Kyler, 2026-09-25): old links with 0 open with 1. Flat 5×5 with a level ring, dry, 60+ tiles out (official 24–173, median 89): 80+ where there is room, and on ground the colony walks to when there is any at that distance. |

As built ("Resources like the official maps", Kyler, 2026-09-25): the amounts and layouts come from
`investigation/official-baselines.json` (`tools/official-baselines.ts`), the official maps measured
by size without Nomads and Oasis, and `src/core/resources/` places them for generated maps and Real
places alike. The resource amount checks are information: a warning under half the official median
at the map's settings, never a reason to reject a map.

On maps under 128² the distance bands of relics, geothermal fields and mine sites shrink by the
map's longer side ÷ 128 (a 96² map has no tile 140 out); thorn belts and cores keep theirs (D75).

### 5.6 Start and difficulty

**Start requirements** (Kyler, 2026-09-24, amended the same day; D85; built at the start of M8;
amended by Kyler on 2026-09-25: the water rule walks over the map's own slopes, D153, and starting
wood counts logs, D164). They are the only start rules that reject a map (§11.4). Each threshold is a
setting under "Start rules", with the difficulty's default:

| Requirement | Easy | Normal | Hard | Rule | Setting |
|---|---|---|---|---|---|
| Water without stairs | 12 | 20 | 28 | Clean pumpable water (depth ≥ 0.3, contamination < 0.05) touches a shore tile the start reaches on foot within this many tiles' walk, over the map's own ground and its natural slopes (the map's Slope entities; never stairs the player builds). Levels may change along the walk, through slopes. Rivers, lakes and ponds count. A pump on that shore reaches the surface (0–2 levels below the shore). | the water-distance rule (`sw`, 4–40) |
| Starting wood | 120 | 80 | 40 | At least this many logs of grown trees within 20 tiles' walk of the start (slopes allowed), each tree by its species' yield (oak 8, pine 2 and resin, birch 1; the file's own logs where it stores them), alive or dead. A sapling's logs count only once it has grown; the indicators and the map card show them apart, as wood still growing (D164). | **Minimum starting wood (logs)** (`sl`, 0–800) |
| Starting bushes | 40 | 30 | 20 | At least this many living berry bushes within 20 tiles' walk of the start (slopes allowed), across any number of patches. | **Minimum starting bushes** (`sb`, 0–200) |

"Living" means the plant survives at steady state. Changing Designed for resets the three to the
difficulty's defaults (D66). The generator never aims below a minimum, and any target that sits
lower rises to it (Easy's Berries near start becomes 40); near-start groves aim at 1.35 × Minimum
starting wood in grown logs, and where the walk holds little moist land they draw their species by
the wood they give as well as by the mix. The start's bench stands a level above the floodplain
(D26), and the colony walks down to the river over the map's own slopes: the derived slope out of
the start's own level stands on the boundary nearest the start and the river together (§7.5). The
bench no longer runs to the bank (D97's strip, which only the old same-level rule needed); a
project saved with one keeps it. Imported maps use their difficulty's defaults. The walk to the
water is measured to the shore tile (D104); trees are Pine, Birch and Oak, bushes BlueberryBush;
the panel's names are **Water without stairs (tiles)**, **Minimum starting wood (logs)** and
**Minimum starting bushes**, and the map card lists the three, starting wood with the species that
give it ("mostly oak") and the logs still growing. Share links keep `sw` and `sb`; starting wood is
`sl`, and a link or project file from before D164 opens its Minimum starting trees (`st`) as 2 logs
a tree. Sources: the water distances are the workshop study's (official median 13, p90 20.4,
walking on the start's level; with slopes, the 11 official starts that can be measured: median 12);
starting wood's defaults are Kyler's tree counts (60 / 40 / 20) at 2 logs of grown wood a tree: the
trees the old rule counted gave 3.0 logs each on seeds 1–30 of every theme at 128² with the default
settings (2.8–3.4 by theme), and 66% of those logs stood on grown trees (a third of the living
trees are saplings). Official maps: median 110 logs within 20 tiles' walk (14 measured), nearly all
pine. The bush thresholds are Kyler's (official p10 / median / p90 within 20 tiles' walk: living
bushes 23 / 57 / 79).

**Difficulty targets.** The difficulty preset sets these; each can be overridden under "Start
rules". From M8 they are generation targets: the generator aims for them, and the map card shows
an advisory warning when a map misses one, but they no longer reject a map (D85). Until then the
start rules reject maps as built in M2–M7: pumpable water within 10 / 16 / 22 tiles by straight
distance, trees within 20 tiles 80 / 50 / 40 (dead ones included), living bushes within 20 tiles
20 / 40 / 40, and no badwater within 40 / 30 / 15.

| Target | Easy | Normal | Hard | Source |
|---|---|---|---|---|
| Berries near start (§5.5) | 40 | 48 | 60 | Official median 47. Never below Minimum starting bushes, so Easy's 20 becomes 40. Near-start groves aim at 1.35× Minimum starting wood, in grown logs (D59, D164). |
| No badwater within | 30 | 15 | 8 | The workshop study: official maps' nearest badwater median 14.8, p25 10 (W4, decided by Kyler in D85). Before M8: 40 / 30 / 15. |
| No ruins within | 20 | 15 | 12 | Official p10 22; scrap within 40 is 0 on the median official map. |
| Drought sized for | 4 days, 40 beavers | 9 days, 50 beavers | 30 days, 50 beavers | Game mode durations. |
| Stored water needed near start | 86 | 253 | 1,174, at 3+ deep | §11.4 formula. |
| Start bench | radius 6 | radius 6 | radius 5 | A levelled pad around the district center. |

Walkable land from the start (`start.reach`) follows Buildable land (§5.2) and is a target too.

| Setting | Values | Default |
|---|---|---|
| Start area | Small, Normal, Large | Normal: bench radius 5 / 6 / 8, reachable land ×0.6 / ×1 / ×1.8 |

### 5.7 The 1.0+ map features

| Feature | Decision | Why |
|---|---|---|
| Slopes | **Always**, generated (§7.5) | Required for walking between levels. |
| NaturalDam | Theme ingredient: the "pre-built weir" variant of the dam site (Lake Basin, River Valley). As built (M7, D72): on half the maps, where the river's water per tile stays in its channel over the weir: the dam site, else a tributary, Highlands' stream or a Lake Basin inflow | A 0.65 weir across a 1-deep channel; the heightfield water model supports partial obstacles. |
| Blockage | Theme ingredient: "plugged spillway" set piece (§9.6). As built (M7, D71): Lake Basin and Islands | A demolish-to-release water event; simple full-height obstacle. |
| Thorns | Setting (Thorn belts) | A cheap, readable soft wall with a cost to clear. |
| Relics | Setting | A science reward scaled by distance; pure payoff for exploring. |
| GeothermalField | Setting | Free 400 hp power; a strong mid-map objective. |
| UndergroundRuins | Setting (Mine sites) | Every official map has 1–4; the late-game scrap source. |
| UnstableCore | Advanced setting, off by default | Destroys terrain and objects and cannot be removed; fun on purpose, disastrous by accident. |
| NaturalOverhang bridges | 3D-b (ROADMAP, D118): over channels, now that stacked water validates water under a slab | The water under the slab is simulated per column (investigation/terrain3d, D120). |
| WaterSeep / BadwaterSeep | Later: "oasis" ingredient for an arid theme | They cap at 0.8 depth and stop in drought; they need their own tuning. |
| Aquifer + AncientAquiferDrill | Left out for now | Water only while a powered drill stands on it, and per the code only in temperate weather (needs an in-game check). Adds little to a generated map. |
| BadtideDrain | 3D-b: in cliff notches at high Verticality | A drain's notch is terrain above terrain, and its water is simulated per column. It runs only in badtide. |
| Caves and terrain overhangs | 3D-a–3D-c: the Verticality setting (§5.9; D118–D127) | Stacked water, the support rule and the floor graph make them valid and playable (investigation/terrain3d/DESIGN.md). Until 3D-a the heightfield model cannot validate them. |
| Reserve stockpiles | Left out | Used by one official map; faction-good pitfalls. |

### 5.8 Settings from the workshop study (M9)

Planned (D87; `investigation/WORKSHOP-INTEGRATION.md` §4). The data for the calibration table is
in `investigation/workshop/settings-bands.json`, with the evidence for each change. New `DENSITY`
rows (arrays are small, medium, large, max, as `SIZE_ANCHORS`):

| Row | Values | Use |
|---|---|---|
| `workshop_trees_per_10k` | see the file | the top of Forest density (300% = about the workshop p90) |
| `workshop_bushes_per_10k` | see the file | the top of Berry bushes elsewhere |
| `workshop_water_strength_per_10k` | 8.8, 4.9, 3.5, 3.2 | River flow's Lush reaches it |
| `waterfalls_per_map_workshop` | 5, 6, 7, 9.5 | Many and Cascading |
| `springs_per_map_workshop` | 2, 3, 4, 8 | the new Springs setting |
| `lakes_per_map_workshop` | 2, 3, 5, 10 | Lakes and basins at Many |

| Setting | Today | Planned | Milestone |
|---|---|---|---|
| Terracing | one-level share 0.86–0.27 | theme defaults 25–35 (§6); Smooth reaching 0.92 waits for Kyler (decisions-pending #37, D59) | M9 |
| Buildable land | Tight, Normal, Generous | a Rugged level (flat share 0.30, walkable land 500) waits for Kyler (#37, D59) | — |
| Relief | River Valley 50 | 70, and similar +15–20 elsewhere (§6; #37) | M9 |
| Springs (new, `sg`) | — | None / Few (1–3) / Many (4–10) inland springs feeding streams | M9 |
| Waterfalls | Off, Few 1–2, Many 3–6 | Many 3–10; Cascading (new code `c`) 10–20; typical drop 3–7 | M9 |
| Target water share, `water.no_flood` | cap 0.35 (0.55) | the premise's budget, up to 0.70 (#33) | M9 |
| Forest density | 50–200% | 50–300% | M9 |
| Berry bushes elsewhere | 50–300% | 50–500%, default 150% | M9 |
| Badwater distance | 40 / 30 / 15 | 30 / 15 / 8, decided by Kyler (D85) | start of M8 |
| Variety (new, `vy`) | — | 0–100, default 70 (#32) | M9 |
| Verticality (new, `vt`) | — | 0–100 beside Variety; above 16 only at high values (§5.9, D132) | M9a (3D forms: 3D-b) |
| Reservoir help (new, `rh`) | — | none / some / ready: only if Kyler adopts it (#31; it conflicts with D25, D30, D58, D85) | — |
| Flow direction (new, advanced, `fx`) | — | any (default) or one of 8 (§7.1) | M9 |

### 5.9 Verticality (M9a; 3D forms from 3D-b)

**Verticality** (`vt`, 0–100) sets how vertical the land is (Kyler, 2026-09-25; §20 D132, D123). It
sits beside Variety, with its share-link key. Its default gives ordinary maps at the relief design
version 2 targets (the official and workshop medians, tall parts up to 16). Higher values bring
crazy vertical landscapes. Surprise me and high Variety may occasionally reach the extremes; most
maps never do.

- **Height.** Only at high Verticality (70 and above) may generated terrain go above 16, up to the
  game's 22 levels with layer 22 kept empty (FORMAT.md). At the default and below, maps stay within
  16, like the official maps and the in-game editor. The setting and heights above 16 come with M9a
  (D145), but above 16 stays locked until a DGM Probe batch confirms that such maps load and keep
  their terrain, water and objects (§18 E1; the Probe's T6).
- **Vertical parts and processes**, used more as Verticality rises: spires and hoodoo stacks, sheer
  escarpments with hanging valleys, stepped canyons and deep gorges, towering mesas with summit
  lakes, cascades of falls with plunge pools, cliff-bench terraces. All emergent, never stamped.
- **Vertical but traversable** at any Verticality. The start and its first resources stand on
  reachable land, with natural ramps (slopes) between levels where the land needs them. Heights
  reachable only by building stairs are allowed, as rewards for expanding. The vertical-reach
  measure compares land reachable on foot with land reachable only with stairs.
- **Measures** (design version 2, at the default and at high Verticality): relief range, levels
  used, share of land above 16, tallest fall, cliff share and vertical reach, against the official
  and workshop maps.
- **3D forms** (3D-b, D123): terrain above terrain, found in the land by processes
  (investigation/terrain3d/DESIGN.md §5.2):

| Value | Relief | 3D forms (at 128²) |
|---|---|---|
| 0 | as the surface processes make it | none |
| 1–39 | within 16 | 0–2 small forms: a tunnel, an undercut, a spring cave |
| 40–69 | within 16 | 2–5, plus ledges, a cliff path, an arch, overhangs up to 3 |
| 70–100 | up to 22 (after the probe batch, §18 E1) | 5–12: overhanging cliffs, arches, sky bridges, cliffside caves and ledges, multi-level valleys, water through mountains |

  - Cave starts are allowed only from 70.
  - Every level has a way up without stairs (ramps, tunnels, ledges, bridges), except the planned
    rewards, which need player stairs.
  - Theme defaults proposed by the terrain design: Canyon 40, Highlands 45, River Valley 20, Lake
    Basin 10, Delta 10, Islands 20. Design version 2 checks that each default gives the ordinary
    relief above.

---

## 6. Theme presets

Each preset pre-fills the settings and picks the archetype layout (§8). Anchors are the official
maps whose measured numbers the preset follows.

| Setting | River Valley | Canyon | Highlands | Lake Basin | Delta | Islands |
|---|---|---|---|---|---|---|
| Anchors | Meander, Plains | Canyon, Waterfalls, Cliffside | MountainRange, Hollows, HelixMountain | Lakes, Beaverome, Craters | Spillage, Lakes | ThousandIslands |
| Relief | 50 | 80 | 90 | 40 | 20 | 35 |
| Terracing | 45 | 75 | 60 | 40 | 25 | 30 |
| Buildable land | Normal | Tight | Tight | Normal | Generous | Normal |
| Rivers / style | 1 meandering | 1 straight | 2 meandering | 2–3 into a lake | 1 braided | 0 (sea) + 1–2 inflows |
| River flow | Normal | Normal | Normal | Strong | Strong | Lush |
| Drought reserve | Normal | Normal | Normal | Plenty | Scarce | Plenty |
| Lakes and basins | Some | Few | Some | Many | Few | None |
| Waterfalls | Few | Many | Many | Few | Off | Off |
| Target water share | 0.12 | 0.10 | 0.08 | 0.30 | 0.25 | 0.45 |
| Badwater | Normal | Normal | Low | Normal | Normal | Low |
| Thorn belts | Some | Off | Some | Off | Off | Off |
| Forest density | 100% | 80% | 90% | 100% | 120% | 100% |
| Ruins and scrap | 100% | 120% | 100% | 100% | 80% | 100% |

Target water share comes from the anchors' saved water: Meander 0.14, Canyon 0.10, MountainRange
0.08, Lakes 0.14, Beaverome 0.45 and ThousandIslands 0.50. It is a layout target; validation caps it
at 0.35, and at 0.55 for Islands and Lake Basin.

Planned for M9 (D87, the workshop study): River Valley's relief 70 and the other themes' +15–20,
and terracing defaults of 25–35 (decisions-pending #37: generated maps are flatter and lower than
official and workshop maps: flat share 0.69 against 0.52 and 0.44, height range 10 against 13 and
14). The water share cap follows the premise's water budget, up to 0.70 (#33).

---

## 7. Generation pipeline

Composed maps: intent first, then layout, set pieces, terrain around them, and detail last. Noise
only adds natural variation to edges. The Python `prototype/generate.py` implements this pipeline
for River Valley.

**Features first.** Stages 1–3 *plan*. Their output is a list of parametric feature objects
(§19.2): the rivers with their bed profiles, lakes and basins, landforms (valley floor, terraces,
highlands, plateaus, islands), set pieces with resolved parameters, forests, berry patches, ruin
fields, map objects and the start. Stages 4–7 *build* the map from that list with the shared build
pipeline (§19.8), the same code the editor runs after every edit. The terrain, water and entities
of a generated map are therefore exactly what its features rasterize to. "Refine this map" hands
the editor that feature list as the map's plan, for "Generate, keeping my edits", regenerate area
and Claude's steering; the editor does not show the features as objects to grab (D182, D184): the
player shapes the land with the brushes. The detected features in §7.10 (`derived`) are
measurements for labels, names and scoring.

**3D forms** (3D-b, D118) are planned after the surface, from the surface and its drainage: tunnels,
arches, sky bridges, ledges, caves, overhangs and underground rivers are features like the rest.
The build carves them at step 4b (§19.8).

```
spec ──▶ 0 normalise ──▶ 1 concept ──▶ 2 macro layout ──▶ 3 set pieces   ═══▶ Feature[] (§19.2)
                                                                                   │
                     build (§19.8): 4 terrain ▸ 5 connect ▸ 6 water ▸ 7 detail ◀──┘
                                                                                   │
  result ◀── 10 name ◀── 9 score (K candidates) ◀── 8 validate / retry ◀───────────┘
```

### 7.0 Normalise

- Validate the `MapSpec` (§19.1) against its schema. Clamp every setting and resolve size-aware
  targets: `target = multiplier × density(key, W·H)`.
- Derive the difficulty rules.
- Take the spec's constraints: locked regions, keep-out regions and the ids of features to keep
  (user and Claude features on regeneration). The planner treats them as occupied and protected,
  so regeneration never routes a river through ground the player has shaped.
- Derive seed streams: `layout`, `terrain`, `setpieces`, `water`, `veg`, `ruins`, `extras` and
  `names`, each `hash(seed, stream, candidate, attempt)`.

### 7.1 Concept

The archetype comes from the theme. Roll a **premise variant**: each archetype has 2–4 (§8), for
example River Valley's "gorge-dammed basin", "twin falls" and "oxbow bend". The variant decides which
set pieces are mandatory. The premise also fixes the macro parameters: the flow axis (one of 8
edge-to-edge directions, so maps are not always west to east), the meander phase, and the
anchor positions as fractions of the map.

Planned for M9 (D87, the workshop study): at least three premises per theme (§8), drawn by the
Variety setting (§5.8, decisions-pending #32); the valley themes and Lake Basin's outlet draw their
flow axis from the 8 directions (D67). The planners lay out in a west-to-east frame, and the
feature list is turned by one of the 8 symmetries of the square (paths, outlines, set-piece plans,
orientations), or they plan natively. Today 74% of generated maps whose water leaves the map flow
west to east (workshop 10%, official 0%).

### 7.2 Macro layout

A small graph of **zones** placed by rules, before any heights exist:

| Zone | Rule |
|---|---|
| Start zone | 40–60% of the way along the main river, on the inside of a bend. Its centre is 6–10 tiles from the channel edge (the prototype uses 6–9), so pump reach and the calibrated water distance hold. It stays 25+ tiles from the map edge on maps ≥ 128². The start bench level is one above the floodplain. Since M8 (D85, D97) the start reaches water on its own level: the bench runs to the bank, a strip from the start to the river's course at the bench's level. |
| River paths | Polylines from entry edge to exit edge. Each carries a **bed profile**: a non-increasing level per segment, with steps only at planned cascades or waterfalls. Upstream reaches sit higher than any downstream dam crest (§9.1), so reservoirs never drain back to the entry edge. |
| Highlands | 1–3 regions away from the start, raised 3–8 levels, holding plateaus and dry dead-forest benches. |
| Expansion zones | A second district site (§9.8) 60+ tiles from the start on maps ≥ 128². |
| Hazard zones | Badwater sources inland, downstream of the start in water terms: their water must drain to an edge without passing the start's river reach, or be held in a closed basin with a narrow outlet (§9.5). |
| Set-piece anchors | Tiles where §9 builders run: the dam site between the start zone and the next falls, waterfalls on bed steps, ruin fields on flat dry ground 20–40% / 40–70% / 70–100% of the way to the far edge. |

Zones are checked for spacing before any terrain exists. A layout that cannot satisfy them is
re-rolled from the `layout` stream, which is much cheaper than failing validation later.

### 7.3 Set pieces

Each set piece (§9) is a shared builder (§19.3). The generator plans it, and Claude reaches it by
steering the generator (D139); the editor has no set-piece tools (D182, D184).
`plan(request, context)` resolves its anchor and footprint and clamps its parameters to the
achievable ranges, reporting every adjustment. `rasterize(plan, target)` writes into:
- the terrain: exact levels for its body, and levels it only raises (walls, rims, banks);
- a **protected mask**: tiles later stages may not change;
- its water sources, its own slopes (stairs, chains) and the tiles it keeps clear of resources.

In generation the context is the macro layout, and a piece that needs terrain (River Valley's
badwater marsh) is planned on the layout's built ground; in the editor it is the current map. The
resolved parameters are stored in the set-piece feature, so rebuilding never re-plans it (D47). For example, the
dam site protects its abutments and basin floor. Set pieces are planned in order of priority
(start, dam site, waterfalls, second district, ruins-on-plateau, badwater basin), so the important
ones get space first. Planning priority only decides who gets space. Build order is §19.8.

### 7.4 Terrain

1. **Base field.** For every tile, the level implied by the layout:
   - river channel = bed profile;
   - floodplain = bed + 1;
   - terraces rise with distance from the floodplain in bands 9–16 tiles wide;
   - highlands have their own base level;
   - set-piece constraints override all of these.
2. **Terracing.** Band rises are 1 level with probability `p1` (the terracing setting); otherwise
   2 or 3 levels (cliffs, 70/30).
3. **Edge wiggle.** Band edges follow a noisy distance: distance plus value noise of amplitude 3–5
   tiles, with a feature size of 24 and 8 tiles. Noise never changes levels directly, so plateaus
   stay flat.
4. **Relief fit.** Rescale band rises until the p5–p95 height range and the cliff share meet the
   relief targets (±1 level). Clip to the highest-terrain setting (at most 16). Layer 22 stays
   empty. As built (M6, D59): the lowest reach's floodplain is set `range` below the highest
   terrain, the bands climb from the basin's floodplain to the top 80% of the way to the map edge
   (so they are narrower than 9–16 tiles when the relief asks for a lot), and the built terrain is
   measured and shifted up or down at most twice until its range is within one level of the
   target. The cliff share follows the band rises; it is not fitted.
5. **Flat pads.** Level the start bench (radius 5–8) and every set-piece footprint that needs flat
   ground: ruin fields, mine sites, geothermal fields, badwater source 3×3s.
6. **Integrity pass.**
   - Remove single-tile pits and spikes (a tile differing from all 4 neighbours).
   - Enforce bed profiles non-increasing downstream.
   - Ensure every channel tile has lower or equal neighbours downstream, so water always has a path
     to an edge or a planned basin.

### 7.5 Connect: slopes

Beavers cannot cross a 1-level step. Stairs cost 70 science, and 2+ level cliffs need player stairs
or ramps anyway.

1. Label same-level regions (4-connected).
2. Build the region graph: an edge exists wherever two regions differ by exactly one level along
   a boundary.
3. From the start's region, grow a spanning tree over the regions whose boundary lies within 40
   tiles of the start (Chebyshev). The pumpable water edge and the near-start groves and berries
   lie inside it (within 20 tiles; the playability checks confirm); the second district joins it
   when M7 plans one. For each tree edge, place one Slope on the boundary pair nearest the start;
   out of the start's own region, on the pair nearest the start and the rivers' channels together
   (the fewest steps: Chebyshev to the start plus 4-neighbour steps to a channel), so the colony's
   way down leads to its water (the water rule, D153).
   - The low tile must be free, and the tile behind its low side must be at the same level.
   - Orientation comes from the high side: Cw0 if the high side is south (y−1), Cw90 west,
     Cw180 north, Cw270 east.
   - Long boundaries (60+ pairs) get a second slope. Every slope stands at least 12 tiles
     (Manhattan) from the others.
   - Targets are joined wherever they are: the regions of a landform with gentle or terraced edges
     (its steps are "joined by slopes", §19.2) and, on an edited import, the ground the edits
     changed.
   - Slopes that already stand join their regions without another: a set piece's own stairs and
     chains, and an imported map's own slopes.
4. Beyond 40 tiles, add one slope per region of 400+ tiles toward its lowest neighbour (the next
   lowest when no slope fits there), nearest the start first.
5. Leave 1–2 plateaus deliberately unconnected when a set piece asks for it: the "ruins on a
   plateau need stairs" payoff (the obstacle set piece, M7).
6. Target density is 2–6 slopes per 10k tiles on large maps and up to 20 on small ones (official:
   max-size maps 1.9, small 18). Measured on River Valley (seeds 1–10): 13–16 per 10k at 96²,
   7–10 at 128², 4–5 at 192² and 3–4 at 256² (D52).

Slopes are derived again after every terrain change, in generation and in the editor; the player's
pinned and removed slopes apply on top. An imported map keeps its own slopes, and only the ground its
edits changed gets new ones (D52).

### 7.6 Water

1. Place sources:
   - Clean sources are 1×1 `WaterSource`s at 0.5 (0.25–1.0), in rows across each river's entry
     channel on the map edge. Edge padding next to a source is a wall, so edge sources don't leak.
     **The row must fill the whole mouth**: every channel tile on the border row is a source, or
     the bank is higher than the water there. The padding next to any other border tile is a sink.
     In an audit run of the water port, a 20-wide mouth with 4 sources lost all its water back off
     the edge. Inland springs avoid the problem.
   - Springs are inland sources on highland plateaus feeding cascades.
   - Badwater sources are 3×3 at 1.0–3.0 strength, placed per §9.5.
   - Total strength follows the flow setting.
   - **Sources start rivers** (Kyler, 2026-09-25, D171): a source stands only where water begins,
     at a river's mouth on the map edge or as a spring at a valley's head or below a ridge, never
     inside a river or lake another source already fills and never downstream. More flow comes
     from more sources side by side at the head, or from their strength. Each tributary has its
     own source at its own head. Today's planners already do this (mouth rows, spring clusters,
     the badwater basin's spring, ponds fed by their own spring); `water.source_in_flow` (§11.3)
     checks it.
   - **Maps need not hold their water** (Kyler, 2026-09-25, D152): rivers leave the map at their own
     level, lakes may drain, and nothing is built along the map's edges to keep water in (no edge
     walls, D151, `terrain.edge_wall`, §11.2). The sealed mouths above are how a river enters, not a
     wall. The badwater basin's rim holds badwater, not the map's water, and stays (D57).
2. Run the canonical settle (§10, §19.7): the exact simulation to steady state from the
   deterministic pre-fill. A steady flow off the map is a steady state.
3. Compute moisture and soil contamination at steady state.
4. If the water share exceeds the theme target by 50%, or the settled rivers are not where the
   layout put them (overlap with the planned channel mask below 0.8), adjust strength once and
   re-run. Otherwise re-roll the layout.

### 7.7 Detail

Every placement uses the footprints in `footprints.json` and marks occupied cells, so objects never
overlap.

1. **Start**: one `StartingLocation` on the bench, the door facing the river. Keep clear a
   Chebyshev radius of 3 around it and the 3×3 in front of the entrance.
2. **Berries**: 2–3 patches of blueberry bushes within 16 tiles of the start on moist soil beside
   clean water, until the difficulty minimum is met. Then patches elsewhere (median 20–40, beside
   water) up to the density target. Bushes are ripe (`GatherableYieldGrower 1.0`) near the start and
   55% ripe elsewhere, as in official maps.
3. **Forests**:
   - Groves are single-species blobs grown with a compactness of about 0.8, sized log-normal around
     the grove-size median.
   - Near-start groves come first: at least 40 living trees within 18 tiles.
   - Then living groves on moist soil up to about 40% of the tree target, then dead groves on dry
     soil.
   - Succulent groves go on dry soil and are alive.
   - Living trees: 35% saplings (`Growable` 0.2–0.95).
   - Dead trees: `LivingNaturalResource.IsDead`.
4. **Ruins**: §9.7.
5. **Extras**: mine sites, relics, geothermal fields and thorn belts, by distance band from the
   start, on flat dry ground outside flood reach. As built (M7, D69, D75): they are planned on the
   layout's settled water before the resources, stand at build step 9, and keep a ring of level
   ground round them; an object that cuts the colony's land in two is left out.

### 7.8 Validate and retry

Run every check in §11. On failure, retry the whole candidate with `attempt + 1`: a new layout
stream and so a new map from the same seed. After 12 attempts, show the best failing candidate with
its report and a "Try another seed" button. Prototype pass rates are 88% (96²) and 62% (128²) on
the first attempt and 100% within 6.

### 7.9 Candidates and score

Build K = 3 valid candidates (candidate index 0, 1, 2 in the seed streams) and keep the highest
score (§12). K is 1 on 256² when the first build took over 6 s; the card then says "single
candidate". The M2 benchmark left the 256² settle well under 3 s (§10, D33), so K = 3 stays the
default at every size.

Planned for M9 (D87, the workshop study): **no clones**. Among the candidates within 5 points of
the best score, the one farthest (the variety score) from the theme's reference maps wins. The
reference maps are seeds 1–30 of the theme at default settings, stored as 16×16 signatures and
feature vectors (about 4 KB per theme). From D137 the score, with its default weights, is only a
mild tiebreaker among a seed's candidates; how they are chosen first is decisions-pending #53.

### 7.10 Output

```ts
interface GeneratedMap {
  spec: MapSpec;                       // §19.1, with `accepted: {attempt, candidate}` filled in
  features: Feature[];                 // §19.2: the parametric objects the map was built from, stable ids (§19.4)
  size: { x: number; y: number };
  heights: Uint8Array;                 // surface level per tile
  water: { depth: Float32Array; contamination: Float32Array; moisture: Float32Array; soilContamination: Float32Array };
  entities: EntitySpec[];              // template, x, y, z, orientation, flipped, components, ownerFeatureId
  derived: DetectedFeatures;           // measured: falls, dam sites, plateaus, islands, groves (labels, names, score)
  report: ValidationReport;            // §19.5: every check with id, class, severity, ok, value, limit, message, where, fix
  score: ScoreBreakdown;
  name: string; premise: string;
  generatorVersion: string;
}
```

`features` is what the editor opens: `toDocument(result)` wraps it with the spec and the built
base into a `MapDocument` (EDITOR_PLAN.md, The map document) without any conversion. `derived`
drives the preview labels, the map card and the name.

---

## 8. Archetypes

Each archetype is a layout function (`gen/layout/<name>.ts`) plus its premise variants. The
variant's must-have set pieces are listed in brackets.

| Archetype | Layout rules | Premise variants |
|---|---|---|
| **River Valley** (prototype) | One river crosses the map along the flow axis, inside a valley floor 0.35–0.45·H wide. Terraces rise to highlands at both sides. The bed descends in 2–3 steps. The start is on a bench above the widest basin. | *Gorge-dammed basin* [dam site, falls]; *Twin falls* [2 waterfalls, dam site]; *Oxbow bend* [natural basin in a cut-off loop, dam site] |
| **Canyon** | The river runs 4–8 levels below a plateau in a canyon 12–25 tiles wide. Rims are 1–2 terraces wide, with side canyons every 40–70 tiles. The start is on a canyon-floor bench, with slope chains up the walls near the start. | *Narrows* [dam site in a narrows, 2+ waterfalls]; *Rim settlement* [start on the rim, water reached by a slope chain; stored water in rim basins] |
| **Highlands** | 2–4 plateaus at different levels, joined by cliffs. Inland springs on the highest plateau feed streams that cascade to a lowland river or lake. The start is on a mid plateau beside a stream. | *Staircase* [3+ waterfalls, terraced cliffs]; *Twin plateaus* [ruins on a plateau needing stairs, dam site on the upper stream] |
| **Lake Basin** | A central lake at spill level, fed by 2–3 rivers from the edges, with one outlet to an edge through a narrow gap: the prime dam site, which raises the whole lake. The start is on a shore bench 1 above the lake. | *Rising lake* [outlet dam site with a huge ratio, NaturalDam weir variant]; *Crater lakes* [2–3 basins at different levels joined by falls] |
| **Delta** | A wide low plain in the downstream half. The river braids into 2–4 channels around islands and exits along 30–60% of one edge. The start is at the head of the delta on a bench. | *Many mouths* [4+ small dam sites, islands]; *Salt marsh* [badwater marsh in the lower delta, containable per §9.5] |
| **Islands** | A sea or lake filling 45–55% of the map, held by a rim with 1–2 outlets. Inflow rivers come from the edges. 6–25 islands of 100+ tiles, with the start on the largest island or shore. Islands without slopes are reachable over shallow water (water never blocks walking). | *Archipelago* [islands of varied heights, relics on far islands]; *Atoll* [ring island around a lagoon, dam site at the lagoon mouth] |

Layout parameters per archetype live in `gen/layout/<name>.ts` as a typed table, so they can be
tuned without code changes (from the objective measures and, later, the in-site feedback on
generated maps; D137). As built (M6): River Valley and Canyon share one
planner with a typed table (`gen/valley.ts`, D59, D63), Lake Basin has its own (`gen/lakeBasin.ts`,
D64). Each theme builds one premise until names and premises (M9): River Valley's gorge-dammed
basin, Canyon's Narrows, Lake Basin's Rising lake. River Valley and Canyon still flow west to east,
and Lake Basin's outlet runs east (D67). As built (M7): Highlands and Delta are rows of the valley
planner's table (D73, D74), and Islands is the Lake Basin planner with a sea (D70); each builds one
premise until M9 (Staircase, Many mouths, Archipelago).

**Planned for M9** (D87, the workshop study): at least three premises per theme, each a planner
variant that lays its landmark out first and the rest around it, from the study's recipes
(`investigation/workshop/recipes/`, which pass their batches on River Valley bases) and the
premises above. River Valley: Gorge-dammed basin, Island in a moat, Oxbow bend, Twin falls, Spiral
mountain or quarry. Canyon: Narrows, Rim settlement, Hanging lake on a mesa, Mesa field. Highlands:
Staircase, Twin plateaus, Badwater volcano, Spiral mountain. Lake Basin: Rising lake, Crater lakes,
Caldera with an island, Heart lake (rare). Delta: Many mouths, Salt marsh, Oxbow delta. Islands:
Archipelago, Atoll, Volcano island, Heart islands (rare). Rare premises are drawn only at Variety
60 and above (§5.8). Every premise that lists a dam site keeps it until Kyler decides Reservoir
help (decisions-pending #31).

**Canyon as built (M6, D63):** a canyon floor 18–25 tiles wide; walls 4–6 levels by the relief,
then one-level rim terraces up to the plateau; the dam site in a narrows (a gorge 3–5 wide round
the ridge); falls on the river by the Waterfalls setting; the start on a bench on the floor, with a
flight of one-level steps and slopes up the wall beside it (the terraced cliffs builder's stair,
§9.3). Tributaries run in side canyons; dry side canyons wait.

**Lake Basin as built (M6, D64):** a central lake of 18–24% of a 128² map (a smaller share on
larger maps), its water at the outlet's sill, 2 deep (3 with a Plenty reserve, 4 on Hard); rings of
terraces from the shore up to the highest terrain at the map's edges; inflows from the west, north
and south edges falling to the lake's level, one on each side at most; the outlet to the east edge
through a narrow gap with the dam site (crest 1, so the shore bench stays dry when the lake rises);
the start on the shore bench one level above the lake, away from the rivers' mouths.

**Highlands as built (M7, D73):** the valley planner with 2–4 round plateaus on the terraces, each
2–4 levels above the ground under it with a cliff all round and at least 8 + its radius from the
river; a stream from a spring on the highest plateau, planned by the river planner (which the
editor's drawn rivers used until D184), falls over its cliff and the terraces to the main river; ruins on a plateau (§9.4). The start is on
a bench in the valley, not on a mid plateau.

**Delta as built (M7, D74):** the valley planner with the dam site's gorge 30–40% of the way across;
below it the river ends in a head pool 2 deep, and 2–4 channels leave the pool at its level and fan
out across a plain one level above them to the east edge, their mouths over 30–60% of it. The start
is on a bench between the dam site's ridge and the head pool. Badwater basins drain to a map edge.
Braided (§5.3) builds this delta in any valley theme but Canyon.

**Islands as built (M7, D70):** the Lake Basin planner with a sea of 40–48% of a 128² map (a
smaller share beyond), a ring of land round it, 6–25 islands of 100+ tiles rising 1–3 levels above
the sea, clear of the rivers' mouths, and a second outlet to another edge. The start is on the shore
bench.

---

## 9. Set pieces

Each set piece lists what it builds, the ranges the game's limits allow, and the constraint that
validation proves. "Levels" are terrain levels. The terrain budget is 0–16: 0 is an empty column
(ground at level 0, used by official maps as river outlets), and 16 is the in-game editor's limit
(up to 22 on maps at high Verticality, §5.9).
Every builder here is a shared set-piece builder (§19.3). The generator calls it, and Claude
reaches it by steering the generator (D139); the editor's set-piece tools, built in M5 and M7,
go with Live editing (D182, D184). Each builder publishes its achievable ranges for the current
map (§9.10). Values outside the schema's hard bounds are rejected. Values inside them but beyond
what the map allows are reduced to the nearest achievable value, and the reduction is reported.

### 9.1 Dam site (gorge and basin)

- **What it builds:**
  - A basin of 150–1,500 tiles on the river upstream of a narrows.
  - The narrows: a ridge 3–6 tiles thick across the valley, cut by the channel, 3–9 tiles wide at
    the crest line.
  - Ridge top at crest + 2 or more. It extends at least 10 tiles past the valley floor into the
    terraces, so the reservoir cannot leak around it.
- **Crest options:** a player dam of 0.65, levees of 1 per level, 1–3 levels above the bed.
- **Upstream bed:** the river entering the basin must sit at crest level or higher. Otherwise the
  raised water backs up to the entry edge and drains off the map; the prototype failed exactly this
  way before the cascade was added.
- **Achievable reservoir:** volume = basin tiles × mean depth. With crest 2 above the bed: about
  150–3,000 blocks (official best dam-site volume per dam tile: median 470, p90 4,479).
- **Limits (audit):**
  - Dam height (crest above the bed) is useful at 1–3 levels, 4 at most. A Folktails WaterPump
    reaches 2 levels below its base, a LargeWaterPump 4, and the Iron Teeth DeepWaterPump 6.
    Water deeper than that is storage the colony cannot pump. The ridge top can go up to 16.
  - The basin is capped at 15% of the map area: 48² ≤ 345 tiles, 96² ≤ 1,382, 128² ≤ 2,457. The
    150–1,500 range above is for 128² and larger; on smaller maps it scales with area.
  - The reservoir must never touch a map edge. Edges drain, except next to a source.
  - The reservoir a difficulty needs, and so the minimum map size, is in §9.10.
- **Validated:** a straight dam line through a channel tile holds `need × drought reserve`
  within 40 tiles of the start. The flood fill must not reach an edge or go around the line
  (`analysis/damsites.ts`).
- **Variants:**
  - *Natural weir*: a `NaturalDam` line across the narrows channel pre-holds 0.65.
  - *Plugged spillway*: §9.6.

### 9.2 Waterfall and cascade (power spot)

- **What it builds:** a bed drop of D levels over one tile. Water wheels want fast, narrow flow; an
  on-river fall keeps its river's width for now (the 1–3-tile narrows above the drop wait for
  in-game check C2, D48), and a standalone fall's outflow channel is 1, 3 or 5 tiles wide.
- **Two modes (one builder):**
  - *On a river* (what the generator makes). It splits the river's bed profile at the lip, and the
    river's own flow goes over it.
  - *Standalone* (a landmark away from a river: the editor's old Waterfall tool placed one, and
    under D139 and D182 a steered landmark or a stamp may). It builds its own cliff, a
    **header pool** one level below the lip, inland springs feeding the pool, the plunge pool, and
    an outflow to an edge or an existing river. As built (D48): the header pool is 3 rows deep,
    the plunge pool 4 rows at the ground in front of the lip (lowered so the lip stays at 15 or
    below), the springs are 0.5 each along the pool's back row, and the outflow channel is routed
    to the nearest map edge, river or lake and carved with a bed that never rises.
- **Achievable drops** (measured with the prototype water port in the audit, §9.10). The drop does
  not depend on map size.
  - The hard maximum with editor-safe terrain is **15 levels**. The lip is a bed at 15 with banks
    at 16, and the plunge pool is at level 0, draining to an edge at level 0. The port measured a
    surface drop of 14.98.
  - Practical within a layout is **12**: keep beds between 2 and 14, so there is a floodplain
    below and banks above. Typical is 3–8.
  - With the game's own limit of 22 (not editable in the in-game editor, §17), the drop could reach
    21; the port measured 20.9. It stays out of scope.
  - Official median highest fall is 4.8, maximum 12.8 (Diorama, a 50² map). Workshop maps reach
    14.7 at the 16 cap.
- **Achievable width:**
  - The lip depth is about **0.3·S/W**: all the flow S spread over the lip width W. Every lip tile
    drains completely each substep.
  - **The whole lip carries water only if a pool feeds it.** Without the header pool, water spreads
    sideways only where the sheet builds past the 0.1 spill threshold. The port wetted 3 of 20
    lip tiles at S = 0.5, and 18 of 20 at S = 2. With a header pool one level below the lip, it
    wetted 20 of 20 at S = 0.5, and 200 of 200 on a 256-wide map at S = 2.
  - Hydraulically, the width is limited only by the map: the dimension along the lip minus about 8
    tiles for side walls. The builder caps it at 40% of that dimension so the map stays playable
    (§9.10).
  - Official falls are narrow: the widest lip on an official map is 2–8 tiles. Counting sheets under 0.1 deep, Canyon
    reaches 10 and Craters 15; Pressure has 22, measured on a map whose water also runs through
    roofed tunnels. Official lips are 0.12–0.29 deep
    (medians per map).
- **Flow for a given width:**
  - The minimum is S ≥ 0.025·W plus the header pool's evaporation (about 0.00012 per pool tile).
    Below that, the lip dries out.
  - A lip that looks like an official fall (at least 0.12 deep) needs S ≈ 0.4·W. For a 20-wide fall
    that is about 8 blocks/s, more than the whole Normal flow budget of a 128² map (3.6). Whether a
    thinner sheet (S ≈ 0.1·W, lip about 0.03 deep) still reads as a waterfall in game needs an
    in-game check (§18 F).
  - The builder takes flow from the river it sits on. Standalone, it adds springs of at most 0.5
    each, and at most 8 per tile (the game's cap), up to 100% of the map's flow budget. Beyond that
    it builds the thinner sheet and reports it. An exact flow typed in advanced mode (or asked for
    explicitly) can exceed the cap, with a warning. In-game check F1 uses that override.
- **Downstream:** friction is negligible, so any channel carries the flow. The water depth in a
  channel draining to an edge is about 0.3·S/w, so banks 1 level high hold up to S ≈ 3·w (for
  example, 10 blocks/s in a 3-wide channel).
- **Validated:** the settled water surface drops at least 1.5 between neighbouring wet tiles at the
  fall (detected as a waterfall feature). Tiles below it are not flooded above the bench. The
  measured width, for Claude's intent checks, is the number of lip tiles with any water (depth > 0.001) and a
  drop of at least 1.5.
- **Counts:** from the waterfall setting, with 12+ tiles between falls.

### 9.3 Terraced cliffs (vertical building)

- **What it builds:** a stair of 3–6 bands, each 1 level high and 6–12 tiles deep, facing water. A
  slope chain climbs it at one end.
- Official maps have 18 plateaus per map (small 3, max 24). This supplies wide, flat benches at
  several levels for tall builds with water close below.
- **Stair (M6, D63):** with `stair: true` the builder makes a narrow flight: 2–8 steps 1–5 tiles
  deep and 1–12 wide, a slope on each (its chain starts on the ground in front); steps one tile
  deep make a chain of slopes. Canyon puts one up its wall beside the start.

### 9.4 Obstacle with payoff

- **Ridge worth tunnelling:** a ridge 3–5 thick and 2+ levels above both sides, separating the
  start zone from a flat, moist expansion zone. It has one long detour route (slopes) and a short
  path that needs player stairs or a tunnel.
- **Ruins on a plateau:** a ruin field on a plateau 2–4 levels up, deliberately left without slopes
  (§7.5, step 5), so reaching it needs player stairs (70 science) or platforms.
- **Thorn-barred valley:** a thorn belt across a corridor to a relic or geothermal field.
- **Validated:** the payoff is reachable from the start *if* the player builds one stairs (a
  region graph check with one allowed 2-level edge), and unreachable otherwise.
- **As built (M7, D76):** ruins on a plateau (River Valley, Highlands, Delta) and the thorn-barred
  valley (§5.4). The plateau is a disc of radius 4–5 exactly 2 levels above the highest ground
  round it, with a cliff all round, 35–70% of the way from the start to the farthest ground, and a
  ruin field on top. The one-stair rule holds by construction and is a contract test, not a
  validation check. The ridge worth tunnelling waits for M9's premises.

### 9.5 Badwater with counterplay

- **What it builds:** the badwater source (3×3) sits in a side basin with a single outlet 1–3
  tiles wide, whose sill is 1 level above the basin floor. The outlet channel joins the main river
  downstream of the start reach, or runs to its own edge.
- **Counterplay:**
  - A levee or dam across the outlet (1–3 tiles) contains it.
  - Thorn tiles along the basin rim block its soil contamination (7-tile reach).
- **Validated:**
  - No badwater or contaminated soil within the badwater-distance setting of the start.
  - The start's pumpable water stays clean (contamination under 0.05).
  - At least one clean river reach of 40+ tiles exists.
  - Blocking the outlet tiles in a re-simulation keeps the badwater inside the basin: the
    "containable" proof.
- **Badtide:** every clean source emits badwater during badtide, so only stored water stays clean.
  The map card says so when the drought reserve is Scarce.
- **As built (M5, D51):** the builder's `basin` mode makes a 7×7 floor one level below the ground,
  a rim two levels above the floor, one outlet 1 or 3 tiles wide (by strength) with its sill one
  above the floor, and a channel to a river or a map edge that keeps 12 tiles beyond the start's
  zone. A source never stops (notes Q1), so a levee on the outlet holds the badwater only while the
  basin fills: the "containable" proof cannot pass at steady state. `water.badwater_contained`
  therefore stays not applicable until M6 places basins from the badwater settings and defines
  the rule (decisions-pending #11). River Valley keeps its marsh (D24), now planned by the builder.
- **As built (M6, D57, D62):** every theme places its badwater in basins from the settings: the
  total strength in basins of 1–3 each, about the badwater distance + 14 tiles from the start, each
  outlet joining the main river below the first step downstream of the start's reach and beyond
  where the river keeps its distance (Lake Basin: below the outlet's fall, or a map edge), and 2
  tiles clear of other rivers. River Valley's marsh is replaced. The containment rule is §11.3's
  `water.badwater_contained`: with the outlet blocked, the basin holds its water below its rim.

### 9.6 Plugged spillway

A 1-deep side channel from a basin to a lower valley, closed by a line of 2–9 `Blockage` tiles
flush with the banks. Demolishing it drains or diverts the basin: a strategic choice. Validation
proves the map with the plug is valid. The map card notes the effect of removing it; that is
simulated once.

As built (M7, D71): a channel 3 wide from a lake to a map edge or lower ground, its bed one level
below the lake's sill; the plug is every channel tile beside the lake's water, its top at the sill,
so the lake spills over it as over its own outlet. The report's release is the lake's area × one
level, not a second settle. Lake Basin and Islands place one beside a river's mouth, far from the
start, where it leaves the colony's land whole. The editor's Plugged spillway tool, which placed
one from a click on a lake's shore, goes with Live editing (D184): the left shelf places the
blockage itself.

### 9.7 Ruin fields

- **Totals:**
  - Scrap follows the ruins setting × the size-aware median (small 840, medium 705, large/max
    236 per 1k tiles).
  - Fields per map: small 2–3, medium 4–6, large 4–5, max 8–9.
  - Field sizes are drawn around the size median (21 / 31 / 40 / 41) with a factor of 0.6–1.9.
  - At most 5% of columns stand outside fields.
- **Shape:** blob growth on one flat level, with frontier weight = (neighbours in field)². Grow
  `n / (1 − 0.05)` tiles, then punch 5% interior holes. This gives fill 0.56 and about 9% holes,
  the official medians. There is a one-tile moat between fields.
- **Heights:**
  - Sample from the official shares: H1 28%, H2 22%, H3 17%, H4 10%, H5 8%, H6 5%, H7 4%, H8 4%.
  - Assign them by a key of smooth noise (lattice 2.5 tiles) + 0.35·(1 − r/rmax) + a small jitter,
    tallest to the highest key.
  - The result is clumps of similar height and a mild inward lean. The target Spearman correlation
    is about −0.2: the official median is −0.06 and the workshop median −0.18.
- **Where:**
  - On dry, non-moist ground, so moist land is kept for farms and forests.
  - At least the difficulty's ruin distance from the start, and 18+ tiles between field centres.
  - Distance bands: 1 field 20–40% of the way to the far edge, most at 40–70%, the largest at the
    frontier. On the median official map scrap within 40 tiles of the start is 0, and 43% of scrap
    lies 64–128 tiles out.
- **Each column:** `RuinModels.VariantId` A–E uniform, random Orientation, `Yielder:Ruin` 15·h.
  Each needs an 8-neighbour at its own level, which the one-level rule guarantees.
- **As built** ("Resources like the official maps", Kyler, 2026-09-25; `src/core/resources/baseline.ts`):
  scrap per map within the official typical range for the size; fields of about 19 / 32 / 39 / 42
  columns by size, grown in an ellipse of aspect 1–2 with 4–10% holes; each field has its own
  tallness, the official storey shares tilted so a field averages 2.4 to 3.8 storeys; heights placed
  by a mildly clumped key (neighbours differ by about 2 storeys, official 1.8), so a few towers of
  6+ stand among shorter columns; models A 26%, B–E 18–19% each, and turns mostly Cw0 (59%), as the
  official maps have them. The ruins on a plateau are a taller field.

### 9.8 Second district site

On maps of 128² and up: a zone 60–120 tiles from the start. It has its own clean water (a spring,
or a river reach with pump reach), 600+ tiles of same-level land, 40+ trees, 20+ bushes and a dam
site or natural basin. It is connected to the start's region by slopes, and it is the anchor for the
premise "a second valley beyond the ridge".

As built (M7, D77): a set piece that marks the site and changes no terrain: 60–120 tiles from the
start's middle, on 600+ tiles of level land, with clean water a pump reaches within 16 tiles; the
derived slopes join it to the start's network, and the generator plants a grove (48 trees) and
berries (24 bushes) within 20 tiles of it. It has no dam site or basin of its own yet. The generator
places it only where such a site exists (of 20 maps at 128², Delta 20, Lake Basin 13, River Valley
8, Highlands 7, Islands 7, Canyon 0; of 10 at 192², Delta and Lake Basin 10, Islands 9, River Valley
and Highlands 6, Canyon 3).

### 9.9 Gorge

The gorge is its own set piece, with its own builder (it was the editor's Gorge tool until
D182; Claude reaches it by steering, D139). The Canyon archetype uses it for its narrows (M6). The dam site keeps its own ridge (D25) for its narrows, and
a dam site can be placed inside a gorge (D49).

- **What it builds:** a channel 3–9 tiles wide between walls at least 2 levels above the bed,
  6–40 tiles long, with the river's bed profile running through it.
- **Limits:**
  - Wall height is 2 up to 16 − bed.
  - A 3–9 wide gorge is also a dam site with a high volume per dam tile.
  - Beavers cannot climb the walls. When the gorge floor is part of the colony's route, the
    builder cuts a stair notch: a 1-wide staircase of 1-level steps with a slope chain (§7.5). As
    built (D49): a two-tile landing beside the water at the floodplain level, then steps up to the
    ground behind the wall, square to the river along the nearest map axis, each with a chained
    slope; where that ground is no higher than the floodplain (a wide valley), the notch is a plain
    cut through the wall.
  - A gorge sits on a river and narrows it to its width along its length (the river's rasterizer
    reads the narrows). A gorge without a river is a canyon landform.
  - Rims 3 or more levels above the ceiled water surface get no moisture from the gorge water
    (6 tiles of reach are lost per level). A gorge therefore has dry rims unless another water body
    feeds them.
  - No roofs: slot canyons with overhangs are out of scope, because the water model does not cover
    water under roofs.
- **Validated:** the channel carries the settled flow without flooding its rims. If the gorge is
  on the colony's route, reachability passes (§11.4).

### 9.10 Achievable ranges by map size

Audit measurements (prototype water port, `prototype/watersim.py`) and the rules above. The
builders publish these ranges for the current map, and Claude uses them to resolve words such as
"giant" when it steers (D139).

| | 48² | 96² | 128² | 192² | 256² |
|---|---|---|---|---|---|
| Waterfall drop, hard max (editor-safe terrain) | 15 | 15 | 15 | 15 | 15 |
| Waterfall drop, practical in a layout / typical | 12 / 3–8 | 12 / 3–8 | 12 / 3–8 | 12 / 3–8 | 12 / 3–8 |
| Waterfall width cap (40% of the side along the lip; hydraulic limit about side − 8) | 19 | 38 | 51 | 76 | 102 |
| Normal flow budget for the whole map (blocks/s, §5.3) | 1.2 | 3.0 | 3.6 | 4.4 | 7.2 |
| Flow for a 20-wide fall: minimum / official-looking | over the width cap | 0.5 / 8 | 0.5 / 8 | 0.5 / 8 | 0.5 / 8 |
| Dam-site basin cap (15% of the area, tiles) | 345 | 1,382 | 2,457 | 5,529 | 9,830 |
| Reservoir, Normal difficulty with Normal reserve: 380 blocks ≈ 190 tiles at 2 deep | fits (8%) | fits | fits | fits | fits |
| Reservoir, Normal difficulty with Plenty: 759 blocks ≈ 380 tiles | too big (16.5%) | fits | fits | fits | fits |
| Reservoir, Hard with Scarce: 1,174 blocks ≈ 391 tiles at 3 deep | too big (17%) | fits | fits | fits | fits |
| Reservoir, Hard with Normal reserve: 1,761 blocks ≈ 587 tiles | too big (25%) | fits (6.4%) | fits | fits | fits |
| Reservoir, Hard with Plenty: 3,522 blocks ≈ 1,174 tiles | too big | fits (12.7%) | fits | fits | fits |
| Gorge wall height | 2–16 − bed | same | same | same | same |

A standalone waterfall needs a footprint of about (W + 4) × 12 tiles, plus an outflow route.
Claude's example in EDITOR_PLAN.md, a 20-wide fall on 128², fits. Its lip would be about 0.03
deep at S = 2, or about 0.12 deep at S = 8. S = 8 is more than twice the map's Normal flow, so
it needs the advanced override (decision D6). When Claude steers toward such a fall (D139), the
S = 2 sheet is the default, and its report says so.

### 9.11 Builders planned from the workshop study

Planned (D87; `investigation/WORKSHOP-INTEGRATION.md` §3). Each in D47's shape: `request` (hard
bounds), `limits(ctx)`, `plan`, `check`, `rasterize`, `footprint`, and `slopes`, `clears` and `area`
where it has them. The study's recipes (`investigation/workshop/recipes/`) are reference
implementations built from today's operations.

| Builder | Milestone | Request | Limits | Checks | Acceptance |
|---|---|---|---|---|---|
| `spiral` (landform kind or set piece) | M9 | at, radius 8–48, turns 0.75–3, levels 3–12, direction up / down, ramp width 3–12 | levels ≤ 16 − ground (up) or ground − 1 (down); radius ≤ 40% of the shorter side | a slope at every step (`slopes.connect`), planned with the ramp; terrain 0–16 | 100 plans on 96², 128², 256²: every step walkable from the foot of the ramp |
| `cone` (landform edge style) | M9 | outline, height, crater radius and depth, spill direction | height ≤ 16; crater depth ≤ height − 2 | a crater with water has an outlet (`water.outflow`) | the volcano premises pass their batches |
| `mesaField` (set piece) | M9 | at, radius 10–40, count 3–15, rise 2–6, ruins on 0–3 tops | mesas 2+ tiles apart; tops of 12+ tiles for ruins | the payoff needs one player stair (§9.4's rule) | as obstaclePayoff's range tests |
| sealed `sea` (Islands variant) | M9 | the sea's outline to the map edge | the edge sealed by a rim or sources along it | `water.outflow`, `water.settles`; water share ≤ the premise's budget (#33) | the Lone island premise passes its batches |
| `riverFork` | M11 | river, from, to (arc), island width 6–40 | arms 2+ tiles apart; both arms ≥ 3 wide | both arms carry ≥ 30% of the flow; the island stays dry | 100 forks on random rivers settle and keep both arms wet |
| lake `outlets` (2–4) | M11 | lake, outlets [{at, to}] | outlets 8+ tiles apart, all at the sill | every outlet carries water; none drains back into the lake | 50 hub lakes settle with every spoke wet |
| river `switchback` | M11 | a river path with hairpins | a wall ≥ 3 tiles thick and ≥ 2 levels above the lower reach between reaches | reaches at different levels do not leak into each other | D53's property test with hairpins allowed |
| `damSite` spurs mode | refinement | river, at, crest 1–3, gap 3–12 (and help ready / some, only if Kyler adopts Reservoir help, #31) | gap ≥ channel + 2; the spurs scale with the ground | the reservoir holds need × reserve behind a dam of `gap` tiles; the naturalness targets (ROADMAP, refinement phase) | River Valley, Canyon, Highlands batches ≥ 98% with it |

Under D139 and D182 these builders serve the generator, and Claude reaches them by steering; the
editor has no set-piece tools. In the editor, forks, outlets and switchbacks come from smart Lower
(D184), and a builder may shape one of M11's stamps, laid as plain land. The generator builds no
dam site (D111), so the spurs mode serves only M11's dam stamps.

The recipes also found that a builder must re-check the rules its change can break: a lake added
near the badwater basin brought contaminated soil 19–27 tiles from the start (`start.badwater`), a
lake beside a relic or mine site left it within 2 tiles of water (`extras.placement`), and the
spiral's slopes must be planned with its ramp.

---

## 10. Water simulation

`sim/water.ts` is a port of the game's rules for heightfield terrain, from
[notes/water_and_soil.md, "Simplified water simulation spec"](investigation/notes/water_and_soil.md).

- One column per tile: floor = terrain surface; state = depth, contamination and 4 stored outflows.
- Substep dt = 0.3 s, 2 per tick; 768 ticks per game day.
- Flow: `f = 0.999·f_prev + 0.675·(H_c − H_n)`, minus 0.1 when spilling onto dry ground at the same
  floor. Flows are kept positive, then scaled so a tile never gives more than it has. The stored
  outflow is `max(0, f − 0.8·f_back)`.
- The port mirrors `prototype/watersim.py` operation for operation and agrees with it bit for bit
  on the golden fixtures; only `+ − × ÷`, `min`, `max` and `ceil` are used (§2.1).
- Evaporation: `1e-4` per second (`1e-3` under 0.02 deep), times the cluster-saturation modifier.
- Sources add `dt·S/N` per cell. **Map edges drain; the edge beside a source cell is a wall.**
- Partial obstacles (NaturalDam 0.65) follow the dam rules in the spec. Blockage and a badtide
  drain's back wall are full obstacles: the column floor rises by one (D28).
- Emitters come from the map's objects through their footprints (`sim/model.ts`): WaterSource,
  BadwaterSource (S/9 on its rotated 3×3), seeps (off above 0.8 deep at their anchor, back on below
  0.72), and aquifers and badtide drains, which are off at map start. Delayed sources are off.
- Contamination moves with flow as a volume-weighted mix.
- Moisture and soil contamination are computed at steady state with a max-heap propagation:
  - moisture: 2·sat on water, then −1 orthogonal / −1.414 diagonal, −6 per level climbed;
  - soil contamination: from water with contamination ≥ 0.5, reaching 7 tiles;
  - Thorns block both (a 4-connected barrier).

**The canonical settle** (`sim/prefill.ts`, D27). It is what files store and what validation
checks:
1. **Pre-fill.** A priority flood from the draining map edge (edge tiles that emit water are
   walled, so they are not outlets; a weir raises its tile by 0.65) gives every tile its spill
   level. Water from each running emitter walks downhill or level on that filled surface. Every
   depression on the path starts full at its spill level. Every other tile of the path starts at
   `min(1, 0.3·Q/w)`: Q is the flow through it, and w the shorter of the row and column runs of
   such tiles through it. The contamination starts at the badwater share of Q. A carve's sealed
   oxbow lake (D216), a basin no source feeds, starts with the water the carve stored for it (the
   water the game settled there just before its mouths closed, up to the surface it had), so it
   holds water and then evaporates as an unfed lake does in the game.
2. **Settle.** The exact simulation, checked every 128 ticks, until the total volume changes by
   under 0.2% and at least 99.5% of tiles move by at most 0.005 (the §11.3 rule, counted exactly,
   with sums in index order so the Python oracle stops on the same tick); at most 4 game days.
   From 3D-a (D120) the checks count columns (air gaps): at most 0.5% of the map's tiles' worth may
   still move.
3. **The file** stores the settled depth and contamination (`depth:cont:0:floor:depth`, 7
   significant digits, depths under 1e-6 dry), outflows 0, soil moisture and contamination at
   steady state, and the evaporation modifiers of the settled water.

**Fidelity.**
- On heightfield maps the port matches the game:
  - the game's own save of a generated map after 975 ticks, to 0.001;
  - Diorama exactly, and Waterfalls at 0.98 overlap.
  So the preview's water *is* the water the player sees once the map has run for a day.
- Maps are also written pre-filled with that settled water, as official maps are.
- What it does not model: water under roofs (caves, tunnels, overhang slabs, badtide drains).
  The generator does not produce those (§5.7), and the `generate` validation profile refuses maps
  with more than one terrain floor per tile. Imported maps can have them (Cliffside has 24 wet
  cells under roofs, Canyon 180, Terraces 473, where the single-layer port's overlap drops to
  0.25–0.7). There the editor keeps the file's saved water and marks the preview as approximate
  (EDITOR_PLAN.md, Checks and water).
- Water under roofs from 3D-a (D120): `sim/water.ts` simulates every air gap of a tile, split by
  terrain and the objects' obstacles, with the game's stacked-column rules: sideways flow between
  overlapping gaps, pressure (overflow × 8), the overflow cap of (34 − ceiling)/8, and roofs.
  - On heightfields it moves no wet tile; depths change by at most 0.033.
  - On the official cave maps it matches their stored water: wet columns agree at IoU ≥ 0.99 on
    17 of 19. The other two, Oasis and Spillage, hold aquifer and seep water that no steady state
    shows.
  - The pre-fill is a priority flood over the graph of gaps, identical to the old one on
    heightfields.
- Transients are exact too, but only the steady state is used.
- The port was checked against a game save written while mods were active (LateGamePerformance,
  BeaverBuddies, HungryPathing, MixedStorage). None of them is known to touch water, but in-game
  check B confirms the result on vanilla.

**Drought.** Sources ramp to 0 for the whole drought. The drought check is analytic
(`sim/drought.ts`, D29):
- water below each basin's spill level stays, and water above it drains through the edges (a
  weir's own tile drains over its lowest neighbour);
- each pool (4-connected water at one spill level) loses what its surface evaporates: 1e-4 per
  second times each tile's saturation modifier, shared over the flat pool. That is 0.0535 a day on
  wide water, more at a small pool's corners;
- colony drinking is 0.424 per beaver per day.

A test compares this against running the sim with sources off for 9 days on the fixtures with
basins (a lake, a valley basin and a weir pool): they agree within 5% of the stored volume
(measured 0.7%, 0.4% and 2.7%).

**Performance.**
- A 256² map needs about 1,500–3,000 ticks to settle, starting from empty.
- Two things cut the work:
  1. start from the priority-flood fill (basins at spill level), which roughly halves it;
  2. update only an active set: wet tiles and their neighbours, typically 10–25% of the map.
- The first estimate, now superseded by the measurement below: with Float64Array state and a
  flat loop, about 65k × 0.2 × 4,000 substeps ≈ 50M cell updates, 0.5–1.5 s in a worker.
- **Audit measurement** (Node 24, a straightforward Float64Array port of `watersim.py`, cold start
  from empty, prototype River Valley terrain):

  | Map | Ticks | Full grid | Naive active set |
  |---|---|---|---|
  | 128² | 1,500 | 0.98 s | 0.71 s |
  | 256² | 3,000 | 11.3 s | 6.5 s |

  The naive active set was computed once per tick, and it changed the settled volume by 5%. **The
  active set must be exact**: wet cells plus their 4-neighbours, recomputed every substep and kept
  as an index list rather than a full-grid scan.
- **Budget** (revised from 1.5 s / 0.4 s, which the measurement does not support for a cold
  start), **fixed by the M2 benchmark (D33):**
  - A canonical settle of **≤ 3 s at 256² and ≤ 0.6 s at 128²**, with the exact active list and
    the deterministic pre-fill (above), both computed from the document alone (§19.7).
  - **M2 measurement** (`npm run bench:water`, Node 24 on Kyler's machine, River Valley at
    Normal, seeds 1–10, the settle alone, from the pre-fill):

    | Map | Ticks | Median | Max |
    |---|---|---|---|
    | 128² | 640–768 | 0.07 s | 0.07 s |
    | 256² | 1,152–1,408 | 0.39 s | 0.51 s |

    With other work running on the machine the same benchmark measured 0.15 s and 0.77 s. A whole
    256² generation (plan, build, settle, validate, pack) takes a median 0.95 s in Chrome's worker
    (seeds 1–5) and 0.86 s in Node; 128² takes about 0.2 s.
  - The budget holds with room to spare, so K = 3 candidates stay the default at 256² (§7.9).
    CI reports the 256² settle median on every push, as a number that never fails a build (D145).
  - **M6 measurement** (generator 0.4.0, the same benchmark with `--theme`, seeds 1–10): River
    Valley 0.16 s at 128² and 0.95 s at 256² (riverside ponds and a taller relief); Canyon 0.06 s
    and 0.45 s; Lake Basin 1.15 s at 128² (1,408–1,664 ticks) and 3.0 s at 256² (1,664–2,048
    ticks), over the budget (D68). CI's measurement runs River Valley.
  - The editor's interactive preview re-settles from the previous state (EDITOR_PLAN.md, Checks
    and water). The file always gets the canonical settle (§2.1, §19.7). As built in M8 (D99): the warm start keeps
    the settled water away from the edit and pre-fills round it; the preview stops when at most
    0.05% of the map still moves by more than 0.05 (64-tick checks, one day at most). Local edits
    at 256² take at most 1.76 s in Node and 1.4–1.7 s in Chrome (Islands and Lake Basin); the
    canonical settle follows in the background, in slices, and before every export.

---

## 11. Validation

A generated map is offered for download only when **every** check passes (apart from the advisory
checks: `plants.drought`, §11.5; from M8 the start targets of §11.4 and `water.reservoir`, D85; and
since D152 `water.clean_exists` and `water.clean_reach`: maps need not hold their water). Check ids match
`prototype/validate.py` and `prototype/playability.py`. Thresholds come from
`data/calibrated.ts`, generated from `prototype/calibrated.py`.

The same modules serve the editor. Each check has a class, and a profile decides what the class
does (§19.5):
- **load**: anything the game would crash on, silently drop, or break at start. That is all of
  §11.1, and §11.2 except the two design checks below. It blocks the download in `generate` and
  the export in `export`. On import it is reported, and the importer fixes what the game itself
  would fix.
- **playability**: §11.3–11.4. In the `generate` profile it must pass (the generator retries). In
  the editor's `export` profile it is a warning on the quiet dot, never a pop-up, and it never
  blocks export (D184); the warning is noted in the map description.
- **design**: `terrain.max_height` (22 since D172 (1); the generator keeps to 16 until Verticality, §5.9),
  `terrain.single_floor` (from 3D-a, `caves.headroom` in its place) and `water.source_in_flow`
  (sources start rivers, D171). They must pass in `generate`; in `export` they warn. For an
  imported map they are only information, because official and workshop maps with caves, or with
  terrain up to 22, load fine in the game. `water.source_in_flow` does not apply in `export`:
  in the editor sources go anywhere (D184).
- **principle** (2026-09-25): a principle Kyler has decided about how a map is built (D115 (2)):
  `terrain.edge_wall` (no edge walls, D151), beside the dam-wall check M9a adds (D111). It must pass
  in `generate` and blocks the export in `export`; for an imported map it is information, and a
  problem an imported map already had never blocks its export (the export dialog lists it apart).

Imported maps have no spec, so thresholds come from the document's "designed for" difficulty
(default Normal) and default settings. Checks that need a planned feature, such as
`water.badwater_contained` (a badwater basin's outlet) or `water.outflow` (a planned lake), report
"not applicable" when no such feature exists: the result passes, carries `applicable: false` and
says why (D31). The playability class runs on every map. On maps with caves or overhangs it uses
the top surface, which is an approximation that `terrain.single_floor` reports (D28). Since M8
(D87, D98; the workshop study, decisions-pending #36), maps whose water a steady state cannot show
report their water and start checks as "approximate", with the reason, in both validators: a cause
(caves on 5% or more of tiles; delayed sources or aquifers carrying a quarter or more of the clean
water, seeps half of the running water; a start under a roof) with evidence that the settle
disagrees with the map's own water (it floods more of the start's ring than the map's water does,
or its wet tiles differ on 10% or more of the map; a start under a roof needs none). Of the 19
official maps, Hollows, Pressure, Oasis and Nomads are approximate: the canonical settle floods
their starts (Hollows 9 deep, Nomads 7, Oasis 2.8). The study also named Beaverome, whose water our
settle matches within 1% of the map; its `start.dry` fails by its own design (decisions-pending
#48).

### 11.1 File

| Id | Rule |
|---|---|
| `file.size` | 4 ≤ W, H ≤ 256 (generator: 48 or more) |
| `file.layers` | exactly 23 voxel layers |
| `file.version` | `GameVersion` and `version.txt` equal `1.1.2.4-52e959e-sw` (any `1.1.x` accepted when validating external files) |
| `file.singletons` | MapSize, TerrainMap, WaterMapNew, SoilMoistureSimulator, SoilContaminationSimulator, WaterEvaporationMap and `WaterSimulationMigrator{IsMigrated:true}` present |
| `file.arrays` | every packed array holds exactly `W·H·Levels` tokens; `Levels` is at least the terrain's floor count |
| `file.metadata` | all 8 keys; Width/Height equal MapSize |
| `file.thumbnail` | 960×540 JPEG |

### 11.2 Terrain and objects: emulating the game's loader

| Id | Rule |
|---|---|
| `terrain.max_height` | surface ≤ 22, layer 22 empty (D172 (1), after DGM Probe run 20260925-tall: heights up to 22 load and keep their terrain, water, sources, flow, objects and start). Above 16 the check notes that the in-game map editor edits only up to level 16. Before: ≤ 16, or ≤ 22 at Verticality 70 and above (§5.9, D132). |
| `terrain.top_layer_free` | voxel layer 22 empty |
| `terrain.supported` | no voxel more than 3 sideways steps from support (0 on heightfields). From 3D-a: every map, every run not starting at z = 0 checked: no voxel the game's load rule would delete |
| `terrain.single_floor` | one floor per tile (the water model's scope); retired for generated maps in 3D-a |
| `terrain.edge_wall` | No edge walls (Kyler, 2026-09-25, D151, extending D111): no map raises a wall along its edges to hold water. Along each edge, a tile is walled when its outer two tiles stand 2+ levels above the highest of the next three; an edge is walled when 60% of its tiles are. Principle class (D151). From the data: the 85 real places as converted for `real-places-done` (a full-height wall one tile thick round the map) have 89–99% of their most walled edge walled; the 19 official maps at most 38% (Canyon's rim), 180 generated maps at 128² at most 36%. Not applicable under 10 tiles a side. |
| `terrain.dropped` | from 3D-a, `generate`: the build's support rule pass dropped 0 voxels (D121) |
| `plants.clearance` | from 3D-a: every plant's blocks fit under the terrain above it (3 cells for pine and oak, 2 for birch and succulent, 1 for bushes) |
| `entities.templates` | only common templates (§5.7) |
| `entities.enums` | Orientation ∈ {Cw0, Cw90, Cw180, Cw270}, exact case |
| `entities.components` | RuinModels + Yielder:Ruin on ruins; WaterSource (+WaterDepthStrengthModifier on seeps); UnstableCore on cores |
| `entities.ids` | unique lowercase GUIDs |
| `entities.placement` | For every object, each occupied cell (`Coordinates + R(F(local))`) passes all of these: inside the map, z < 33, not in terrain, occupation flags disjoint from other objects, MatterBelow met (Ground: solid below; GroundOrStackable: solid or an overhang/drain top below), no object under an OccupyAllBelow block, water objects/geothermal/mine sites on the first terrain column. Result: 0 objects the game would delete. |
| `start.clear` | nothing overlaps the StartingLocation |
| `slopes.connect` | every Slope has ground at z+1 on its high side (Cw0 y−1, Cw90 x−1, Cw180 y+1, Cw270 x+1) and ground at z (or a chained slope at z−1) on its low side; from 3D-a, the floor at the object's z |
| `start.count` | exactly one StartingLocation |
| `start.flat` | 3×3 footprint flat at the start level (from 3D-a, the floor at the object's z) |
| `start.entrance` | entrance tile (Cw0 (X+1,Y−1), Cw90 (X−1,Y−1), Cw180 (X−1,Y+1), Cw270 (X+1,Y+1)) is free ground at the start level (from 3D-a, the floor at the object's z) |

### 11.3 Water

The canonical settle (§10) of the map's own sources. A water tile is one deeper than 0.05;
clean water has contamination under 0.05.

| Id | Rule |
|---|---|
| `water.settles` | Steady within 4 game days: volume change under 0.2% and 99.5% of tiles within 0.005 between 128-tick checks. A steady flow off the map is steady: maps need not hold their water (D152); what fails is water that never settles. |
| `water.no_flood` | Wet share ≤ 0.35 (≤ 0.55 for Islands and Lake Basin); official p90 0.40. Planned for M9 (decisions-pending #33): the cap follows the premise, 0.35 by default and up to 0.70 for water premises (moat, archipelago, lone island, lake world), which declare their water budget; workshop maps: median 0.27, p90 0.67. |
| `water.clean_exists` | Clean wet tiles ≥ 2% of the map. Since D152 a target with an advisory warning: maps need not hold their water, and the start's water is `start.water`'s. |
| `water.outflow` | Every running source's water reaches an edge or a planned basin: its connected wet region (depth > 0) touches a map-edge tile that drains (not a walled source tile) or a lake feature. Not applicable without features (imports). |
| `water.clean_reach` | At least one connected (4-neighbour) body of clean water of 40+ tiles. Since D152 a target with an advisory warning, as `water.clean_exists`. |
| `water.source_in_flow` | Sources start rivers (Kyler, 2026-09-25, D171): no WaterSource or BadwaterSource stands where water from another source comes down to it. Emitters whose tiles touch are one group (a sealed mouth, a cluster at a river's head). Water runs down the spill levels, across a flat toward its way out and never back, and all through a pool; a group's water goes from its tiles over the settled water. A group is inside a flow when a running group's water reaches one of its sources and its own water does not reach that group back. Design class. |
| `water.badwater_contained` | With the planned outlet channel's tiles blocked (a levee, §9.5), the water rising in each planned badwater basin cannot leave the basin (its 7×7 floor and two-tile rim) or reach a map edge below the rim's level. A source never stops, so this proves the outlet is the basin's only way out, not that a levee holds forever (D57, pending Kyler). Not applicable without a basin with a planned outlet. |
| `water.reservoir` | The better of these two ≥ need × drought reserve (Scarce 1×, Normal 1.5×, Plenty 3×; §5.3): (a) the best leak-free dam site within 40 tiles of the start; (b) natural water retained within 40 tiles after the drought (§10). Dam sites are sampled on every second clean water tile within 60 tiles of the start, with crests 1–3, and flood at most max(6,000, 15% of the map) tiles (D30). From M8 it is advisory, Hard's 3-deep rule included: a generation target with a warning on the map card, never a reason to reject (D85). |

### 11.4 Start and playability

These use the start requirements and difficulty targets of §5.6. "Near" means reachable by walking.
From the start of M8 (D85) the three start requirements reject a map, and the start targets are
advisory: the generator aims for them, and the map card warns when a map misses one. The last
column says which; until M8 every row rejects, with the rule before M8 given in the row.

| Id | Rule | From M8 |
|---|---|---|
| `start.dry` | No water within Chebyshev 2 of the start centre after settling. From 3D-a (investigation/terrain3d I-11), water under a roof counts only where it stands at or above the start's floor (the floor rule; Kyler, D145). Open water keeps the rule above until Refinement item 8 has measured whether the floor rule should apply to it too, which would let lakeside starts pass (D107). | rejects |
| `start.water` | Requirement 1, water without stairs (amended by Kyler, 2026-09-25, D153): clean water (depth ≥ 0.3, contamination < 0.05) touches a shore tile the start reaches on foot within the water-distance rule's walk (12 / 20 / 28), over the map's own ground and its Slope entities (never player stairs), and a pump on that shore reaches the surface (0–2 levels below the shore). As built in M8, the walk stayed on the start's own level; before M8: water 0–2 levels below the start within 10 / 16 / 22 tiles, straight distance. | rejects |
| `start.reach_water` | Before M8: that water borders land walkable from the start. From M8 it is part of `start.water`. | — |
| `start.wood` | Requirement 2, starting wood (D164): the logs of the grown trees within 20 tiles' walk (slopes allowed), alive or dead, by species ≥ Minimum starting wood (120 / 80 / 40); saplings' logs are reported apart. As built in M8: living trees ≥ 60 / 40 / 20; before M8: trees within 20 tiles and reachable ≥ 80 / 50 / 40. | rejects |
| `start.food` | Requirement 3: living berry bushes within 20 tiles' walk (slopes allowed) ≥ Minimum starting bushes (40 / 30 / 20). Before M8: within 20 tiles and on or beside reachable land ≥ 20 / 40 / 40. | rejects |
| `start.badwater` | No badwater water or contaminated soil within the badwater distance (from M8: 30 / 15 / 8). | advisory |
| `start.reach` | Dry tiles walkable from the start (same level, plus slope links; blocked by Thorns, Blockage, NaturalDam, relics, cores, geothermal and mine sites) ≥ the buildable-land target (750 / 1,300 / 2,500). | advisory |
| `start.ruins_clear` | No ruin column within 20 / 15 / 12. | advisory |
| `plants.survive` | Every living tree and bush stands on moisture > 0, no water and clean soil. Every living succulent is on moisture 0. | rejects |
| `resources.scrap`, `resources.trees`, `resources.bushes` | Totals ≥ 0.5 × the size-aware official median × the setting multiplier (about the official p10). | rejects |
| `ruins.fields` | ≥ 80% of columns in fields of 10+ touching columns (official median 97%). | rejects |
| `ruins.access` | Every column has an 8-neighbour on ground at its level, not blocked. | rejects |
| `walk.levels` | From 3D-a (D122): information: the levels the start reaches without stairs and how; the heights that need stairs, and what lies there. In `generate`, nothing planned stands in a pocket no stairs reach. | — |
| `water.sealed_source` | From 3D-a: no running source in a sealed air space (it fills, pressurises and loses water past the cap). | advisory |
| `extras.placement` | Relics, geothermal fields and mine sites sit on flat dry ground outside flood reach, at their distance bands. As built (M7, D75), in both validators: level ground; no water within 2 tiles (Chebyshev) and outside every planned reservoir; the generated ones in their bands (§5.5, scaled under 128²); generated thorn belts 20+ and unstable cores 40+ from the start, and cores their radius + 2 apart. Not applicable when the map has none, or on an import. | rejects |

**Stored water needed** (from `calibrated.reservoir_needed`):

```
drink    = colony × 0.424 × (drought_days + 0.5)
need     = drink + (drink / 2) × 0.0535 × (drought_days + 0.5)     (reservoir 2 deep)
```

That gives Easy 4 days × 40 beavers → 86; Normal 9 days × 50 → 253; Hard 30 days × 50 → 1,174.
Hard also requires the reservoir's mean depth to be at least 3, because evaporation takes 1.6 over
30 days. As built (M6, D58): on Hard the dam sites are sampled with crests 1–4 and count only when
their reservoir is at least 3 deep on average; the natural water kept through the drought counts as
before (it has lost the drought's evaporation already).

### 11.5 What the prototype already checks

Since M2, `prototype/validate.py` and `playability.py` implement every check above, with the same
ids, rules and "not applicable" cases as the TypeScript validator. A map with a project file beside
it (`<stem>.damgoodmaps.json`) is checked with its spec and features; any other map as an import.
`terrain.single_floor` replaced the prototype's `water.model` check.

The prototype's first playability module was written for generated maps and took three shortcuts
that imported maps break. The TypeScript port does not copy them, and the prototype was fixed to
match (D28):
- A BadwaterSource's tiles come from the footprint transform, whatever its orientation.
- WaterSeep, BadwaterSeep, BadtideDrain and Aquifer are emitters with their rules (§10).
- Multi-tile objects (mine sites, geothermal fields, relics, cores) block walking on their whole
  footprint.

The parity test (`npm run oracle`) runs both validators on 50 generated maps and on all 19
official maps (import profile), and fails on any disagreement.

A further check, `plants.drought`, is added. It is **advisory**: the one check that never blocks,
in any profile, including `generate`. It
flags living berry bushes within 20 tiles of the start whose moisture comes only from water that
drains during a drought longer than 0.9 × their DaysToDieDry (blueberry: 9 days, and Normal
droughts reach 9 days): their soil is dry in the moisture of the analytic drought water (§10).
Every River Valley map at Normal carries this warning today, because its bushes live on the river,
which drains in a drought (see docs/decisions-pending.md).

### 11.6 Report

Each check yields `{id, class, severity, ok, value, limit, message, where?, fix?, advisory?,
applicable?}` (§19.5, `validate/report.ts`): `where` is the tiles, feature or entities involved,
and `fix` an optional list of edit operations the editor offers as a one-click fix (M2 proposes
`deleteEntities` for plants that would die and ruins next to the start; the M3 operations engine
applies them). Severity follows the profile: load failures are errors everywhere; playability and
design failures are errors in `generate`, warnings in `export`, and warnings and information in
`import`; advisory checks warn. The map card groups them into File, Terrain and objects,
Water, and Start and resources. Failures are explained in player terms, for example
"The start is 23 tiles from pumpable clean water; Normal allows 16 (beavers go thirsty on day 6)."

---

## 12. Interestingness score

Computed for every valid candidate, in `score/score.ts`. Each component is normalised to 0–1
against the official maps. It uses the p10→0 and p90→1 of that component in `calibration.json`
unless stated, clamped.

| Component | Measure | Weight |
|---|---|---|
| **Dam value** D | log10 of the best dam site's volume per dam tile within 60 tiles of the start (official p10 65 → 0, p90 4,479 → 1), plus 0.1 per extra site with ratio ≥ 100, capped | 0.20 |
| **Height variety** H | 0.5 · norm(levels covering 1% of the map, 12 → 17) + 0.5 · (1 − abs(one-level step share − 0.62) / 0.35) | 0.15 |
| **Landmarks** L | 0.35 · min(1, waterfalls ≥ 1.5 / 4) + 0.25 · min(1, plateaus / size-class median) + 0.2 · gorge present + 0.2 · min(1, islands ≥ 100 / 3) | 0.15 |
| **River character** R | 0.5 · norm(sinuosity = channel length / straight length, 1.0 → 1.6) + 0.5 · norm(total channel length / map diagonal, 0.5 → 1.5) | 0.10 |
| **Resource pacing** P | 1 − mean, over living trees, bushes and scrap, of the earth-mover distance between the map's distance-ring shares and the official median rings (§4 of REPORT), normalised by the largest possible distance | 0.15 |
| **Regions** G | norm(distinct regions: level regions ≥ 1% of the map + water bodies ≥ 1% + groves ≥ 50 trees; official p10 → p90) | 0.10 |
| **Tradeoff** T | Share of the three largest flat regions whose pumpable water is more than 10 tiles away or which lie 2+ levels above it: the best land is not also the easiest to water | 0.10 |
| **Frontier** F | Share of total scrap plus the largest reservoir site beyond 50% of the start-to-far-edge distance | 0.05 |

`score = 100 · (0.20·D + 0.15·H + 0.15·L + 0.10·R + 0.15·P + 0.10·G + 0.10·T + 0.05·F)`

**Calibration.** Run `score.ts` on the 19 official maps (roadmap M9). The weights above are the starting
point. Adjust them so the recommended official maps (Plains, Lakes, Waterfalls) score in the top
third, and so the unconventional ones don't dominate. Report the official distribution on the map
card: "Score 71 (official maps: 48–79, median 63)". (D137: the weights are never fitted to
ratings.)

**Planned for M9** (D87, the workshop study, decisions-pending #35): the score is ported from
`investigation/workshop/lib/score.ts`, with 12 components, each 0–1: engineering (full marks when
storage takes real work; it replaces dam value D), height variety, landmarks, river character,
resource pacing, regions, trade-off, frontier, surprise (novelty), verticality, naturalness and
water. Its targets and weights are `data/score-params.json`, a copy of the study's default
`score-params.json`; `fit-score.ts` and `ratings.json` are not used (D137). With the default
parameters the recommended official maps rank 3rd, 6th and 7th of 19; the generated median at
default settings is 40 against the official 52. The score is only a mild tiebreaker: choosing
among a seed's candidates and ordering a contact sheet, never a gate on quality (D137).

---

## 13. Names and premises

Templated text from detected features; no AI calls. `score/naming.ts` holds about 40 name patterns
and 30 premise clauses. Each pattern has a predicate on `features`, and ties break by the `names`
seed stream.

- **Names:**
  - "Twin Falls" when there are 2 waterfalls ≥ 3.
  - "The Narrows" for a dam site with a length ≤ 5 and a ratio ≥ 1,000.
  - "Hundred Isles" for islands ≥ 10.
  - "<Adjective> <Landform>", from word lists keyed by theme, with the dominant tree species
    feeding the adjective ("Birchwood Terraces").
  - Ruin-heavy maps get "… Ruins".
- **Premise:** 1–2 clauses from the strongest score components, plus a warning clause for scarcity.
  - "A meandering river fills a basin that one short dam in the gorge could turn into a lake."
  - "Two waterfalls give power to spare, but the badwater marsh downstream spreads in badtide."
  - "Reserves are thin: plan for droughts early."
- **Map description** in `map_metadata.json`: premise + settings summary + "Made with Dam Good Maps
  <version>, seed N". The in-game map name is the download file name: `<Name> (<seed>).timber`.
- **Planned for M9** (D87, the workshop study): the templates grow with the catalogue's plain words
  for what a map has, keyed by the detected feature or the premise: *island in a moat*, *crater
  lake*, *caldera*, *spiral mountain*, *spiral quarry*, *volcano*, *hanging lake*, *mesa field*,
  *twin falls*, *oxbow lake*, *chain of lakes*, *great scarp*, *hub of channels*, *archipelago*,
  *branching rifts*, *concentric rings*. Examples: "Moat Isle", "Caldera Rest", "Spiral Quarry",
  "Twin Falls", "Mesa Reach".

---

## 14. Website features

### 14.1 Layout

A two-pane page. On mobile it stacks, with settings in a drawer.

- **Left:** the settings panel.
  - A theme preset strip (6 illustrated cards) on top, then Basics.
  - Terrain, Water, Hazards and Resources as collapsible sections, with Start rules under Advanced.
  - Every control shows its official reference range as a faint band, e.g. "official maps:
    4–35 sources".
- **Right:**
  - The preview canvas, with layer toggles and a 2D/3D switch.
  - The map card beneath: name, premise, score and the validation report.
  - Download, and **Refine this map**, which opens the same map in the editor (EDITOR_PLAN.md).
    "Download project file" (`.damgoodmaps.json`, §19.6) stays beside it. After the editor, the page shows the edited map; downloading it goes through the
    editor's export check, and generating again keeps the edits (D44).
  - **Open a map**: any `.timber` or project file opens in the editor.
- **Generate** is always visible. Seed has a dice button. Changing a setting marks the preview stale
  and offers "Generate"; auto-regenerate is optional (default off at 256²).

### 14.2 Preview

- **2D top-down:** elevation colour ramp with a hillshade from the north-west, so terraces read as
  steps. Contour lines are optional.
- **Layers:**

  | Layer | Shows |
  |---|---|
  | Terrain | always on |
  | Water | clean depth in blue shades |
  | Badwater | brown |
  | Moisture | green tint where soil is moist |
  | Contamination | purple tint |
  | Trees | living / dead / succulent dots |
  | Berries | purple dots |
  | Ruins | height-coloured squares |
  | Start | district center outline and entrance arrow |
  | Slopes | arrows pointing uphill |
  | Dam sites | dam line and the reservoir it would hold, with its volume |
  | Reach | land walkable from the start |
  | Features | labels for falls, gorge, plateaus and islands |

- **Hover:** tile tooltip with level, water depth, moisture and what stands there.
- **Zoom and pan:** wheel and drag, at 1–8× integer scaling.
- **3D (lazy):** three.js orbit view of the terrain columns, water surfaces as translucent quads at
  depth, and instanced trees and ruins. It is the editor's renderer (`render3d`, D45), with the
  editor's orbit and top-down views, compass and hover readout. Budget: under 1.5 s to build,
  60 fps on a mid-range laptop at 256² (measured in M4, D46). The preview opens in 2D; 3D is a
  switch, loaded on demand. Map look (after M8, D86, D110, D114, D115) colours the 3D view's ground by
  moisture, as the game does, with a toggle back to height colours and a legend; the 2D preview
  keeps its height colours. The water's colours, its opacity and how badwater blends into clean water
  (with their calibration on screen) live in one shared palette, `src/render3d/waterPalette.ts`,
  that every look's water reads (D177).

### 14.3 Map card

- The name and premise.
- Score with its component bars and the official range.
- Key facts:
  - size and theme;
  - sources and strength;
  - badwater;
  - trees, living share and bushes;
  - scrap and ruin fields;
  - the best dam site's volume;
  - the start's distance to water.
- The validation report: all green with a count, or the failures expanded.
- "Best of 3 candidates". The attempts used appear only in debug mode.

### 14.4 Download

- **The file:**
  - `<Name> (<seed>).timber`: a zip built in the worker, with the 960×540 thumbnail rendered from
    the preview palette.
  - Water, moisture and contamination are pre-filled.
  - Byte-identical per seed and settings.
- **Install help (shown after download):**
  1. Move the file to `Documents\Timberborn\Maps` (Windows). On macOS it is
     `~/Documents/Timberborn/Maps`.
  2. Start Timberborn → New game → the map is listed under your maps.
  3. The map editor can open it too.
  - Custom maps show their file name, which is why the name goes in the file name.
- **Optional:** "Download without pre-filled water", for the in-game A/B check (§18) and as a
  fallback while that check is open.

### 14.5 Shareable links

- **State in the URL fragment:**
  `#v=<generatorVersion>&s=<seed>&t=<theme>&z=<size>&d=<difficulty>` plus only the settings that
  differ from the theme preset, in short keys (`rl=70`, `fl=2`). Base64url for custom species
  weights.
- **Old versions:** a link whose `v` is older than the current generator shows
  "Made with v1.2 — open in v1.2 (exact) or regenerate with v1.3". The first option goes to
  `/v/1.2/#…`.
- **Buttons:** Copy link, and "Copy seed + settings" as text for Discord.
- **Edited maps:** a link encodes the `MapSpec` only, so it reproduces the generated map without
  the player's edits. An edited map is shared as its project file. Putting small edit lists into
  the link is a later option (ROADMAP.md, Later).
- **As built (M6, D65):** `core/spec/codec.ts`. Settings that differ from the theme preset at the
  link's difficulty and size, in a fixed order with two-letter keys (`rl` relief, `ht` highest
  terrain, `tr` terracing, `bl` buildable land, `rv` rivers, `rs` river style, `fl` flow, `dr` drought
  reserve, `lk` lakes, `wf` waterfalls, `bw` badwater, `bd` badwater distance, `tb`, `uc`, `fd`, `gs`,
  `sm` species (four bytes, base64url), `bn`, `bb`, `ru`, `rc`, `gt`, `ms`, `sa`, and `sw`, `st`,
  `sb`, `sx`, `sr` for the start rules), enum values as one letter; then `a` archetype, `p` premise,
  `c` colonies (reserved for Timber Together, D5) and `sp`, `k` for set pieces and constraints as
  base64url JSON, each only when set. A value the decoder cannot use is reported and the preset's
  value kept.

### 14.6 Report a problem

As §2.3: a plain **Report a problem** link to GitHub issues, for bug reports (M13; D145).

---

## 15. Testing

| Layer | What | When |
|---|---|---|
| **Unit** (Vitest) | RNG streams; sine polynomial error < 1e-9; noise; C#-style float formatting; world.json encoding; footprint transform (all templates × 4 orientations vs `footprints.json`); slope orientation; region labelling; dam-site finder; score normalisation. | every push |
| **Round trip** | Read → write → read on every fixture map (official maps are not redistributable, so CI uses generated fixtures plus a local job for `investigation/raw`); byte-identical `world.json`. | every push (generated); local (official) |
| **Water golden vectors** | TS sim vs Python fixtures (`tests/golden/water.json.gz`) after 50/200/975 ticks within 1e-6; moisture mask exact; pre-fill, canonical settle and drought storage; the analytic drought within 5% of the simulated one; the game's own save reproduced within 0.001 (local only). | every push |
| **Determinism** | The same 20 seeds × 6 themes give identical sha256 in Node, Chromium, Firefox and WebKit (Playwright), and across two runs. | every push (Node), nightly (browsers) |
| **Oracle** | The Node CLI writes 50 seeds × 3 sizes; Python `validate.py --load-only` and `roundtrip_test.py` must pass; on 50 of them, and on the 19 official maps when present, each TS check verdict must equal the Python verdict. | every push (5 seeds); full at each milestone |
| **Contract** (§19) | The `MapSpec` schema accepts every preset and rejects out-of-bound values. Features survive a JSON round trip. `build(features)` equals the generated map byte for byte. An incremental rebuild after a feature edit equals a full rebuild. Feature and entity ids stay the same when an unrelated feature is added or removed. Import normalization (migrator halving, 4-field water, legacy `Heights`) is checked on the investigation maps. | every push |
| **Golden maps** | 12 pinned seeds (2 per theme; 96² and 256²): sha256 of the `.timber` plus key metrics (score, check values). Any change must be intentional: `npm run golden:update`, and the diff shows the metric changes. | every push |
| **Batch pass rates** | `tools/batch.ts`: 100 seeds per theme per size at Normal, plus 30 at Easy and Hard. Report first-attempt and final pass rates, failing checks, score distribution and timings, with generated metrics beside the official ranges. Blocking: final pass rate ≥ 98% within 12 attempts. Reported as numbers (D115, D145): first attempts (60% as the target) and the median 256² time (8 s as the target). | nightly and before release |
| **End-to-end** (Playwright) | Generate → preview → download on 128²; share link round trip; layer toggles; worker cancel. | every push |
| **In-game** | §18, once per milestone that changes the file format or the generator's physical rules, recorded in `docs/ingame-log.md`. **Deferred (D11):** Kyler skips in-game checks for now. Each milestone lists its checks in the log as *pending* and does not wait for them; the automated validation and tests above carry the gate until the checks are played. | per milestone (pending) |

---

## 16. Milestones

**The order of work is now [ROADMAP.md](ROADMAP.md)**, which merges these milestones with the
editor's. The shared foundations (§19) come first. From its first milestone the generator writes
maps whose features the editor can open. The table keeps the original scope of each generator
milestone and says where it went. Effort: S under a day, M 1–3 days, L 3–7 days of focused work.

| # | Milestone | Delivers | Acceptance | Roadmap |
|---|---|---|---|---|
| **1** | **End-to-end slice** (L) | Vite + TS + Preact app shell. `core/format` (writer, footprints, C# float format, fflate, jpeg-js). RNG streams. River Valley ported from the prototype *without* the water sim: sources placed, water left as zeros. Slopes and start rules. File and placement validation (§11.1–11.2). 2D preview (terrain, start, entities). Settings: seed, size preset, difficulty. Download. GitHub Pages deploy. **Added:** `MapSpec` v1, the feature schema v1 and the feature-first River Valley (§19), stable ids, per-feature RNG streams, the reader as well as the writer, the project file download, and the `calibrated.py` alignment (§4). | 50 seeds × 3 sizes pass Python `validate.py` file and placement checks and `roundtrip_test.py`; identical sha256 in Node and Chromium for 10 seeds; 128² generates in < 3 s; **added:** rebuilding from the project file reproduces the `.timber` byte for byte; **in-game check A** (§18). | M1 |
| **2** | **Water and playability** (L) | `sim/*` exact port with golden vectors; steady-state water, moisture and contamination; pre-filled water in the file; vegetation placed from moisture; all §11.3–11.4 checks; retry loop; map card with validation report; water, moisture and reach layers. **Added:** the exact active list and the canonical settle, validation classes and profiles (§19.5), and the water benchmark that fixes the §10 budget. | Golden vectors pass; the game's save reproduced within 0.001; batch 100 seeds at 128² Normal: final pass ≥ 98%, first attempt ≥ 60%; **in-game check B** (pre-filled water, tree survival). | M2 |
| **3** | **Settings, sharing, themes I** (L) | The full settings panel (§5) with reference bands; URL codec; Canyon and Lake Basin archetypes; set pieces dam site, waterfall, terraced cliffs, badwater counterplay; the dam-site layer. | Each setting moves its measured target in batch runs (a test per setting); share links reproduce byte-identical files; batch per theme ≥ 98% final pass; **in-game check C** (build a dam at a generated dam site; a waterfall runs a water wheel). | Set pieces and in-game check C: M5 (built once, shared with the editor). Settings, sharing and themes: M6. |
| **4** | **Interestingness** (M) | `score.ts` calibrated on official maps; K = 3 candidates with progressive preview; names and premises; score on the card. | The official score distribution is documented; recommended official maps in the top third; the name and premise match the detected features on 30 hand-checked maps; 256² with K = 3 ≤ 20 s. | M9 |
| **5** | **Themes II and 1.0 features** (L) | Highlands, Delta, Islands; second district; obstacle-with-payoff set pieces; NaturalDam weir; plugged spillway; thorn belts; relics; geothermal; mine sites. | Batch per theme ≥ 98%; every new object passes the placement emulation; **in-game check D** (the new objects load with no loading issues; demolish a spillway plug). | M7 (with the editor's resources and map-object tools) |
| **6** | **3D, ratings, polish** (M) | Lazy three.js view; ratings flow and `tools/ratings.ts`; install help; the Impeccable design pass with the timbermods design system; accessibility (keyboard, contrast) and mobile layout; versioned deploys `/v/<version>/`. | 3D builds in < 1.5 s at 256²; a Lighthouse performance score ≥ 90 on desktop; a rating issue created from the page with every field filled; an old-version link reproduces its file. | 3D view: M4 (one renderer for preview and editor). The rest: M13, without the ratings flow (D145). |
| **7** | **Later** | NaturalOverhang bridges; seeps and an arid theme; caves with stacked-column water; aquifers; badtide drains; unstable cores out of Advanced. | Each behind a feature flag until its own in-game check passes. | Later |

---

## 17. Risks and open questions

| Risk or question | Impact | Mitigation |
|---|---|---|
| **Pre-filled water behaves differently in game** (the loader copies depth by slot and recomputes floors; untested with our tokens). | Rivers surge or drain at start. | In-game check B compares the pre-filled file with the empty-water file of the same map (the prototype writes both). Fallback: ship empty water; the game fills rivers in about a day, and living trees are within moisture reach of the *settled* river, so they survive (their dry timers reset). |
| Cross-browser floating point in the water sim. | Share links reproduce a different map. | Only IEEE-exact operations on output paths (§2.1); the nightly cross-browser determinism test. The water result feeds placement, so a divergence would move trees; the golden tests catch it. |
| Generator changes break old share links. | Players lose maps. | Versioned deploys `/v/<version>/`; the version in the link and the map description. |
| JS performance of the Dijkstra moisture pass and the sim at 256². | Slow generation. | Budgets in §10; a binary heap over typed arrays; active-set simulation; a priority-flood initial state; progressive candidates. |
| Official calibration is 19 maps (2 small, 3 medium). | Small-map targets are noisy. | Blend with workshop numbers for small maps; tune from the objective measures and the in-site feedback on generated maps (D137). |
| Heights above 16. | Unknown editor behaviour. | The probe batch confirmed that maps up to 22 load and keep their terrain, water and objects (§18 E1; D172, run 20260925-tall). Kept at 16 except at high Verticality (§5.9, D132) and on tall Real places (D172); the in-game editor edits only up to 16, and each tall map's description says so. |
| Aquifer drills only work in temperate weather (per code). | Would mislead if used. | Left out (§5.7). |
| Map name is the file name. | Players rename files and lose the name. | Also stored in `MapDescription`. |
| Iron Teeth's district center on the StartingLocation. | Iron Teeth starts fail on some maps. | Same 3×3×5 footprint and entrance per the blueprints; in-game check A covers one Iron Teeth start. |
| The water sim is slower in JS than §10 first assumed (audit: 6.5–11 s cold at 256² unoptimized). | Slow generation at 256²; a sluggish editor preview. | Exact active list and the deterministic pre-fill; warm starts for editor previews; M2 benchmark gate; K = 1 at 256²; the editor re-settles only what changed (§10). |
| Features first is a bigger port than "port the prototype". | M1 takes longer. | It is the price of a generator whose plan the editor and Claude build on ("Generate, keeping my edits", regenerate area, steering; D139, D182). The prototype's layout already has the structure (river path, bed profile, gorge, basin, falls); M1 only makes it explicit. |
| Thin waterfall lips may not read as falls in game. | Claude's "giant waterfall" looks like a wet cliff. | In-game check F1; the waterfall builder reports lip depth; flow policy (§9.2). |
| Imported pre-1.0 maps lack `WaterSimulationMigrator`. | Re-exported maps would run at double strength. | Halve strengths and outflows at import, as the game does on load (§19.6). |

Kyler answered the open questions on 2026-09-24 (§20, D12–D14):
1. The address is the `dam-good-maps` repository in the timbermods organization:
   `timbermods.github.io/dam-good-maps/`.
2. Hard maps are warned, never refused: a Hard-designed map with a Scarce reserve generates, and
   the map card says so ("that's part of the fun").
3. GitHub issue ratings are fine (superseded by D145: no rating form, only a "Report a problem"
   link).

---

## 18. In-game checklist

Short, and needs you. Each item names the file to use from `out/` (or the milestone's batch
output), what to do, and what should happen. Record the result in `docs/ingame-log.md`.

**Deferred (D11).** Kyler is skipping in-game checks for now. Milestones do not stop or wait for
them: each milestone lists the checks it would have needed in
[docs/ingame-log.md](docs/ingame-log.md) as *pending*, names the files to play, and relies on the
automated validation and tests in §15. The checks below stay the definition of each one.

**A. Load and start** (roadmap M1, with `out/m1/River Valley (4242).timber`; see
[docs/ingame-log.md](docs/ingame-log.md))
1. Copy the file to `Documents\Timberborn\Maps`. It appears under New game with its thumbnail and
   description.
2. Start Folktails on Normal:
   - no "Loading issues" panel;
   - the district center stands where the white square is on `out/m1/River Valley (4242).png`, with the door facing
     the river;
   - 9 adults and 4 children spawn.
3. Walk test:
   - beavers cannot step up a 1-level terrace edge where there is no slope;
   - they can climb the generated slopes both ways.
4. Open the map in the map editor: it opens without errors, and terrain edits and saving work.
5. Start Iron Teeth once: the district center fits and beavers spawn.

**B. Water and plants** (roadmap M2)
1. The pre-filled file: rivers flow on day 1 without a visible surge or drain, the lake levels stay
   put over the first day, and the berry bushes near the start are not flagged dry.
2. `… (empty water).timber`: rivers fill within about a day, and the same trees survive.
3. After 15 days, living groves near the river are alive and the dead stands are still dead with
   logs.
4. The badwater marsh stays downstream; the start's water stays clean.

**C. Set pieces** (roadmap M5)
1. Build a dam or levees across the gorge at the dam-site marker: the basin fills to about the
   crest without leaking round the ridge ends.
2. Place a water wheel at a generated waterfall: it turns.
3. Survive the first drought on Normal using the stored water.

**D. 1.0 objects** (roadmap M7): a map with NaturalDam, Blockage, Thorns, relics, a geothermal field
and a mine site loads with no loading issues. Demolishing the plug releases the water as the card
says.

**E. Open questions from the investigation** (any time)
1. Terrain above 16: can the game and the editor load and play it? A DGM Probe batch (the Probe's
   T6, investigation/terrain3d/DESIGN.md §8) answers it before M9a offers relief above 16 (D132).
   Answered: yes, the game loads maps up to 22 and keeps their terrain, water and objects (D172,
   run 20260925-tall); the in-game editor edits only up to 16.
2. Beavers walk *through* ruin columns, as the code says.
3. Aquifer + powered drill during drought: no water?
4. What a map with no StartingLocation does on a new game (for the error message).

**F. Added by the audit** (F2 in roadmap M1, F1 in M5, F3 and F4 in M8)
1. **Waterfall visibility.** Two 20-wide standalone falls: one at S = 2 (lip about 0.03 deep) and
   one at S = 8 (about 0.12 deep, set with the advanced flow override). Does the thin one read as a waterfall? Does a water wheel below
   each turn? The answer sets the waterfall flow policy (§9.2).
2. **Sealed river mouth.** A river entering on the edge with sources across its whole mouth keeps
   its water. The same river with a gap in the source row drains back off the edge.
3. **Imported pre-1.0 map.** Re-export a workshop map that has no `WaterSimulationMigrator` (the
   importer halves its strengths). Its rivers run at the same level as the original does in game.
4. **Imported map with roofed water** (Canyon or Terraces). Edit it away from the tunnels and
   export it: the tunnels keep flowing as in the original.

---

## 19. Shared foundations with the editor

The generator and the editor are one app. This section is the only definition of what they
share. [EDITOR_PLAN.md, Contract with the generator](EDITOR_PLAN.md#contract-with-the-generator)
points here and adds nothing of its own. If either plan disagrees with this section, this section wins, and any change
to it is recorded in §20.

### 19.1 Map spec

`MapSpec` is a TypeScript type and a versioned JSON Schema (`core/spec/mapspec.schema.json`). The
settings panel, the URL codec, the editor's `SpecPatch` and Claude all produce it.

```ts
interface MapSpec {
  specVersion: 1;
  generatorVersion: string;
  seed: number;                       // uint32; text seeds are hashed (§5.1)
  size: { x: number; y: number };     // 48–256 for generation (§5.1)
  theme: ThemeId;                     // the preset the settings started from (§6)
  archetype: ArchetypeId;             // the theme's archetype unless overridden (advanced)
  premise?: PremiseId;                // rolled from the seed when absent; recorded after generation
  designedFor: "easy" | "normal" | "hard";
  settings: Settings;                 // every §5 value, complete, never a diff
  colonies: {                         // room for Timber Together (D5); M1 accepts only {count: 1, mod: "none"}
    count: 1 | 2 | 3 | 4;             // colonies on one map; 2+ requires mod "timberTogether"
    mod: "none" | "timberTogether";   // "none" = vanilla: exactly one StartingLocation
  };
  setPieces: SetPieceRequest[];       // requested set pieces (Claude steering, D139): {kind, params, region?}
  constraints: {
    locks: Region[];                  // regeneration never changes these tiles
    keepOut: Region[];                // the planner places nothing here
    keep: FeatureId[];                // user and Claude features the planner builds around
  };
  accepted?: { attempt: number; candidate: number };   // filled in by the generator
}
```

- The URL fragment encodes a `MapSpec` as a diff from its theme preset (§14.5). The schema's hard
  bounds are the ranges in §5.
- A `SpecPatch` is a JSON Merge Patch (RFC 7396) on a `MapSpec`: objects merge and arrays are
  replaced whole. The patched spec is checked against the schema again. A patch that fails is
  rejected, never clamped.
- `accepted` lets a document reproduce its map without running the retry loop again.
- `colonies` reserves room for fair multi-colony maps for Timber Together (D5). With
  `mod: "timberTogether"` and `count` N, a later milestone will plan N `start` features
  (`player` 0..N−1), write each as a `StartingLocation` with a `StartingLocationPlayer
  {PlayerIndex}` component and `MaxPlayers: N` in `map_metadata.json`, and add fairness checks
  (each start's water, wood, food and reachable land within a tolerance of the others, and a
  minimum separation). Until then the schema accepts only `{count: 1, mod: "none"}`, and nothing
  may assume a map has one start in a way that would block this.
- Imported maps have no spec (`spec: null` in the document). Their difficulty comes from the
  document's `meta.designedFor`.

### 19.2 Parametric features

One schema (`core/features/schema.ts`) covers every feature. The fields every feature has are
`{id, kind, origin: "generated" | "user" | "claude" | "stamp", params, locked}`. The generator's
planner emits features, the build pipeline (§19.8) rasterizes them, and the document keeps them as
the map's plan. The editor does not edit them as objects (D182, D184): the player's strokes and
placements are edits on top (EDITOR_PLAN.md, The map document). Sizes are in blocks (tiles) and
heights in levels. The ranges each map allows are in §9.10.

| Kind | Params | Game rules it must respect |
|---|---|---|
| `river` | path (control points from source to outlet), width 1–9, bedDepth 1–4 (default 1), bedProfile (start level; steps with their drop), flow (gentle 1 / steady 2 / strong 4 blocks/s, or an exact value), style (straight / meandering / braided), meander, entry (edge / spring / lake id), exit (edge / lake id / river id), badwater, banks (the river planner raises the ground beside its channel to its banks, D53: the generator's highland streams, and the editor's drawn rivers until D184) | The bed never rises downstream. An edge mouth is sealed (§7.6). Moisture reach is 16 tiles at bedDepth 1, 10 at 2, 4 at 3 and 0 at 4 (6 tiles lost per bank level above the ceiled surface). At most 8 blocks/s per source tile. |
| `lake` | basin outline, floorDepth, outlet {at, sill level, to: edge / river / lake / none, and its planned channel: path, levels, width}, inflow (river ids or a spring strength) | The surface settles at the sill level: water is flat, so the level is not a free number. With no inflow the lake loses about 0.054 levels a day (warning). The basin never touches a map edge. |
| `landform` | kind (hill / plateau / ridge / canyon / valley / island / terraces), outline, height (levels), edgeStyle (gentle / terraced / cliff), base (the ground level its edge steps from), bandDepth (terraced, 6–12), bands | gentle = 1-level steps at least 3 tiles apart, joined by slopes; terraced = 1-level bands 6–12 deep; cliff = a step of 2+ levels, impassable without player stairs. Terrain stays within 0–16. |
| `setPiece` | kind (waterfall / damSite / gorge / terracedCliffs / badwaterBasin / plugSpillway / obstaclePayoff / secondDistrict), params per §9, resolved plan and report | Built only by its shared builder (§19.3). |
| `forest` | area, density, species mix, grove size, life (auto / alive / dead) | Alive only on moist, dry-footed, clean tiles. Succulents live only on dry soil. Common species only. |
| `berryPatch` | area, density, ripe share | As forests (BlueberryBush). |
| `ruinField` | area, scrap target, height mix | One level. Each column needs an 8-neighbour at its level. `RuinModels.VariantId` A–E. |
| `mapObject` | kind (mineSite / relic small, medium, large / geothermal / thornBelt / weir, a NaturalDam line / plug, a Blockage line / bridge, a NaturalOverhang pair / unstableCore), placement (a single object: its footprint's south-west corner and facing; a line: its tiles as runs), core (an unstable core's radius 0–5 and countdown cycle) | Footprints, OccupyAllBelow and first-column rules (§11.2). As built (M7, D69): one placement rule for the generator, the tools and the preview: level ground for single objects, dry and off rivers (weirs and plugs go across them), free of other objects, caves, locks and the start. The bridge waits (§5.7). |
| `carve` kinds (3D-b, D118): `tunnel`, `arch`, `skyBridge`, `cave`, `ledgePath`, `overhang`, `undergroundRiver` | a path or area plus a z range; width, height, profile; ends and floors | Built only by their builders, which keep the support rule by construction; the build's rule pass drops 0 voxels. Floors are run tops. |
| `start` | position (centre tile), orientation, bench radius, player (0–3, default 0) | A flat 3×3 with 5 free layers, and the entrance tile free at the same level. Exactly one per map in vanilla. `player` is reserved for Timber Together maps (D5): one start per colony, numbered from 0. |

- **Derived layers** are rebuilt every time and never edited as features: slopes (pinned or
  removed slopes are stored as edits), water, soil moisture and soil contamination.
- **Editor-only state** for symmetry and stamps (M10, M11) lives in the document, not in features;
  both are brush-first (D182; EDITOR_PLAN.md, Stamps and symmetry).
- **What a generated map's plan holds** (for "Generate, keeping my edits", regenerate area and
  Claude's steering; the editor does not show them as objects, D182): every river, lake and
  planned basin; the landforms of its
  layout (valley floor, terrace bands, highlands, plateaus, islands); every set piece; every
  grove, as a forest; every berry patch, ruin field and map object; and the start.
- Every entity the build places records its owning feature. The ownership is kept in the document,
  not in the `.timber`.

### 19.3 Set-piece builders

There is one module per kind in `core/features/setpieces/`. The generator's planner uses it, and
Claude reaches it by steering the generator (D139); the editor has no set-piece tools (D182,
D184).

```ts
interface SetPieceBuilder {
  kind: SetPieceKind;
  request: JSONSchema;                                   // hard bounds of a request: outside them, rejected
  limits(ctx: PlanContext, request?): AchievableRanges;  // §9.10 for this map and this place
  plan(request, ctx: PlanContext, id): PlanOutcome;      // anchor, footprint, values reduced to the limits, report; or why it cannot
  check(plan, W, H): string[];                           // a stored plan outside the hard bounds (an operation may bring one)
  rasterize(feature, target: BuildTarget): void;         // terrain, protected mask
  footprint(feature, target): Rect | "all" | null;       // what it reads and writes (dirty-region rebuilds)
  sources?, slopes?, clears?, area?                      // its springs, its own slopes, the tiles it keeps clear, what the editor shows
}
```

As built in M5 (D47): `PlanContext` is the map a piece is planned on (its surface, river channels,
taken tiles, the start's zone, locked and protected tiles, the objects on it). A set-piece feature
stores `{kind, request, plan, report}`; operations that add or change one are checked against the
builder's hard bounds, and the editor and Claude got plans from the builder
(`core/doc/tools.ts` planned every tool's edit, set pieces included; the generator still uses its
river and lake planners, and the editor's set-piece tools go with Live editing, D182, D184).

- `BuildContext` is the macro layout during generation and the current map in the editor. It is
  the same code with the same results.
- The resolved plan is stored in the feature. A rebuild rasterizes the stored plan and never plans
  again (§19.7). Planning again happens only on an explicit edit of the feature.
- The report lists:
  - every value that was reduced, and to what;
  - everything that was cleared or relocated (trees, ruins, bushes);
  - every source that was added.

  A builder never moves the start or touches a locked region. When it would have to, the plan
  fails with the reason.
- The kinds are waterfall (on-river and standalone modes, §9.2), damSite, gorge, terracedCliffs,
  badwaterBasin, plugSpillway, obstaclePayoff and secondDistrict. Ruin fields are ordinary
  features with their own placement rules (§9.7). M5 builds the first five; the plugged spillway
  and the obstacle arrive with the map objects (M7), the second district with its planner.

### 19.4 Stable ids

- **Generated features:** `id = "f-" + base32(hash64(seed, kind, roleKey))`.
  - `roleKey` is the feature's role in the plan, and does not depend on how many other features
    exist: `river/main`, `river/tributary/2`, `setpiece/damSite/primary`, `ruinField/band2/1`,
    `forest/grove/<anchor tile>`.
  - Adding a river therefore does not rename the ruin fields.
  - Retries (`attempt`) and candidates are not part of the id.
- **User and Claude features:** a random UUID, made when the feature is created and stored in the
  document.
- **Entities:** `Id = guid(hash128(ownerFeatureId, template, localIndex))`, written as a lowercase
  GUID.
  - An entity keeps its Id through edits elsewhere. The game seeds a tree's look from its Id, so
    the tree also keeps its look.
  - Entities placed by hand get a random GUID, stored in the document. Imported entities keep their
    original Ids.
- `entities.ids` still checks that every Id is unique. A collision is resolved by rehashing with a
  counter.
- Edits refer to ids. An edit whose target no longer exists after regeneration becomes orphaned and
  is shown to the player, never dropped.

### 19.5 Validation

One set of modules (`core/validate/`) with the calibrated thresholds serves generation retries,
the editor's live checks and export gating.

- **Check result:** `{id, class, severity, ok, value, limit, message, where?, fix?}`. The classes
  are `load`, `playability` and `design` (§11). A check marked advisory (today only
  `plants.drought`; from M8 also the start targets of §11.4 and `water.reservoir`, D85) is
  reported in every profile and never blocks.
- **Profiles:**

  | Profile | load | playability | design |
  |---|---|---|---|
  | `generate` (retry until all pass, then offer the download) | must pass | must pass | must pass |
  | `export` (editor export) | blocks | warns on the quiet dot, never blocking (D184), and it is noted in the map description | warns |
  | `import` (opening a file) | reported; the importer fixes what the game itself would fix (§19.6) | reported | information |

- **Scope:** every check runs on the whole map or on a dirty region. The instant subset
  (footprints, overlaps, start area, limits, slopes, terrain support) runs after each edit. The
  rest runs in a worker.
- **Thresholds** come from `spec.designedFor` and `spec.settings`. For imported maps they come from
  `meta.designedFor` (default Normal) and the default settings.
- **Check ids** match the prototype, which stays the oracle (§4).
- **Imported maps' own problems** (D43): a check that already failed, over the same entities or
  tiles, on the map as it was opened is listed at export but never blocks it and is not noted in
  the description. The editor never makes a map worse, and an unedited import exports unchanged,
  multi-colony starts included (D5).

### 19.6 Format I/O

There is one reader and one writer (`core/format`), verified by the round-trip tests.

- **Writer:** always the native 1.1 format of [FORMAT.md](FORMAT.md), with deterministic bytes.
- **Reader:** 1.1 and 1.0 voxel maps; 0.7 maps, whose keys are migrated the way the game migrates
  them; and 0.6 maps with `TerrainMap.Heights`, converted to voxels. Saves (`save_metadata.json`)
  are refused with a message.
- **Import normalization**, applied once and listed to the player:
  - No `WaterSimulationMigrator`, or `IsMigrated:false`: halve every `SpecifiedStrength` and
    saved outflow, as the game does on load, then write `IsMigrated:true`. Otherwise the exported
    map would run at double strength.
  - 4-field water tokens: set `OldWaterDepth = WaterDepth`.
  - More than 23 voxel layers: keep layers 0–21 and drop the rest, as the game does, with a
    warning. The writer then writes the standard 23 layers, with layer 22 empty.
  - Components 1.1 never reads (FORMAT.md §7) are dropped; `StartingLocationPlayer` is kept for
    Timber Together (D5). Old key shapes are migrated the way the game migrates them, and the
    version is stamped 1.1.2.4 (D36). Unknown components, unknown singletons,
    multi-slot water and moisture arrays, and key order are all preserved verbatim.
  - Faction-only plants are flagged, with a one-click removal. They fail to load for the other
    faction and in the in-game editor.
- **"Exports unchanged":** after normalization, exporting an unedited import reproduces the
  normalized `world.json` byte for byte and keeps the original thumbnail. An edited map gets a new
  thumbnail.
- **Project file** (`.damgoodmaps.json`, gzip-compressed): the `MapDocument` with its spec,
  features, edits, locks, meta, `generatorVersion` and built base. The base is the whole map:
  surface heights, the multi-run columns verbatim, and world.json's exact text without its
  terrain array (D37). From format 3 (M9a, D119) the terrain is stored as heights plus runs: every
  tile that is not one plain run from z = 0, as its solid runs, in both `field` and `base`; maps
  without 3D forms store an empty list. A document opens exactly even after the generator has
  changed: it shows its stored base until the player rebuilds it with the current generator. M1
  and M2 files (format 1, heights only) still open, rebuilt from their features.

### 19.7 Determinism

§2.1 applies to both halves. In addition:

- `build(document) → .timber bytes` is a pure function. The generator's download is `build` of its
  own document, and so is the editor's export.
- **RNG streams:** layout planning uses one stream per stage. Everything a feature places uses
  `hash(seed, featureId, purpose)`.
- **Incremental rebuilds** of dirty regions are an optimization. A property test checks that an
  incremental rebuild equals a full rebuild after random edits.
- **Water** written to a file comes from the canonical settle. It starts from a state computed only
  from the document (empty, or the documented priority-flood pre-fill, with any sealed oxbow lake's
  stored water, D216), runs a fixed tick schedule
  and stops on a deterministic test. Interactive previews may warm-start, but an export never uses
  their state.
- **Versions:** a document records its `generatorVersion` and its built base. A newer generator
  opens it from the stored base, exactly, and offers "rebuild with the current generator", which
  flags orphaned edits. Versioned deploys (`/v/<version>/`) keep old share links exact.

### 19.8 Build order

Generation and editing use one pipeline (`core/features/build.ts`):

1. base terrain: the layout's macro terrain, a heightmap import, or the imported map;
2. landforms, in document order;
3. set-piece terrain: cliffs, header pools, ridges, gorges, basins;
4. rivers and lakes: bed profiles carve; where a river crosses a landform, the river wins;
   4b. from 3D-b (D118): 3D forms: tunnels, caves, arches, sky bridges, ledges, overhangs and
   underground rivers, in document order;
5. the start bench and object pads;
6. sculpt edits, in order;
7. integrity pass: remove pits and spikes, keep beds non-increasing downstream; from 3D-a, apply
   the game's support rule (delete what the game would delete on load, and report it; D121);
8. slopes: derived, plus pinned and removed overrides;
9. water sources and map objects (their tiles are taken before the slopes of step 8, D69), then the
   entity edits whose targets exist by now (D38); from 3D-a every placement stands on a floor (a run
   top), by default the top surface;
10. water settle, soil moisture and soil contamination (canonical for export);
11. resources: berries, forests, ruin fields, placed using moisture;
12. the start entity;
13. the remaining entity edits, on resources and the start (place, move, delete, set properties);
14. validation.

Generation plans the features (§7.1–7.3), then runs this pipeline. On regeneration, steps 1–13
leave locked regions untouched.

### 19.9 Platform adapters

The core never touches the DOM or a platform API. Five adapters let one codebase build both the
website and the Claude artifact edition (EDITOR_PLAN.md, Claude integration):

- **files:** save and open (a file input or a drop, read as bytes);
- **storage:** autosave (IndexedDB on the website; every call fails quietly when browser storage is
  unavailable, D44);
- **workers:** a module URL on the website, an inlined blob in the artifact;
- **claude:** the Messages API, or the artifact's `sample` capability;
- **download naming:** `.timber` on the website; a `.zip` holding the `.timber` in the artifact,
  whose downloads allowlist has no `.timber`.

---

## 20. Editor decisions

EDITOR_PLAN.md §0 asks for every deviation and decision to be recorded here. The audit seeded the
list, and implementation adds to it.

| # | Decision | Why | Status |
|---|---|---|---|
| D1 | The shared foundations are defined once, in §19. EDITOR_PLAN.md §11 points to it. | Each contract item must have one definition. | Audit |
| D2 | Features first: the generator emits parametric features and builds the map from them. | The editor must edit what the generator made. | Audit |
| D3 | Validation classes and profiles (§19.5). Generated maps pass every check except the advisory `plants.drought`; edited maps are blocked only by load problems. Updated by D85: from M8 the start targets and `water.reservoir` are advisory too. | Resolves "every check passes" (PLAN) against "errors block, warnings warn" (EDITOR_PLAN). | Audit |
| D4 | Terrain stays at 16 or below in generated maps and editor tools. Imported maps with terrain up to 22 are preserved. | 16 is the in-game editor's limit; 17–22 is untested (§18 E1). | Audit default, accepted by Kyler; **amended by D123** (P3D-5); **superseded by D132** (Verticality) |
| D5 | **Revised by Kyler, 2026-09-24.** Vanilla maps have exactly one start, and symmetry is a creative tool. Dam Good Maps will *later* make fair maps for Kyler's Timber Together mod (separate colonies on one shared map). The spec and feature schema keep room for it now (`MapSpec.colonies`, §19.1; `start.player`, §19.2), and nothing multi-colony is built until a milestone schedules it. | Vanilla 1.1 keeps one StartingLocation. The mod (BeaverBuddies lineage) reads extra starts as `StartingLocation` entities with a `StartingLocationPlayer {PlayerIndex}` component, plus `MaxPlayers` in `map_metadata.json`. | Kyler |
| D6 | Waterfall flow policy (§9.2): a fall takes the flow of the river it sits on. A standalone fall adds at most 100% of the map's flow budget; beyond that it builds a thinner sheet and says so. An exact flow set in advanced mode may exceed the cap, with a warning. | An official-looking 20-wide fall needs about 8 blocks/s. | Audit default, accepted by Kyler; in-game check F1 pending |
| D7 | Share links carry the spec only. Edited maps are shared as project files. | An edit list does not fit reliably in a URL. | Audit default, accepted by Kyler |
| D8 | Claude: build the bridge against the Messages API first. It runs the request suite in Node and powers bring-your-own-key. The artifact edition follows. **M3 spike ([docs/spike-m3.md](docs/spike-m3.md)):** route B works. A browser request with `anthropic-dangerous-direct-browser-access: true` passes its preflight (204, the origin and headers allowed) and gets a readable 401. Without the header the response is blocked. Route A's building blocks work under the artifact's rules: the whole core runs in a blob worker (its file equals Node's byte for byte); a file input and FileReader open `.timber` files of every format; a `.zip` holds the map; `sample` takes page functions as tools. `sample`'s real latency and who can open the artifact (sharing, public links) wait for Kyler's run of the published spike page. | EDITOR_PLAN.md §7. | Audit default, accepted by Kyler; spike run M3, Kyler's live run pending |
| D9 | `prototype/calibrated.py` is aligned to §5.2 and §5.6 in M1. | The two tables disagree today (§4). | Audit, accepted by Kyler |
| D10 | The artifact edition downloads a `.zip` that contains the `.timber`. Project files save as `.json`. | `.timber` is not on the artifact downloads allowlist. **Confirmed in M3** by the platform's downloads contract (0.2.54): the allowlist is `gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip`, and other names reject with `rejected_extension`. The spike page's `.zip` holds the generated `.timber` byte for byte. | Audit default, accepted by Kyler; confirmed by the M3 spike |
| D11 | In-game checks are deferred. Milestones list the checks they would have needed in `docs/ingame-log.md` as *pending*, never stop or wait for them, and rely on the automated validation and tests (§15). | Kyler, 2026-09-24: "I'm skipping in-game checks for now." | Kyler; **exception: DGM Probe batches** (Kyler, 2026-09-25: D116, D117), launched only with Kyler's yes each time; the 3D stages' probe checks (D127) |
| D12 | The site lives in the `dam-good-maps` repository of the timbermods organization, served at `timbermods.github.io/dam-good-maps/`. The repository was renamed from `Dam-Good-Maps`; GitHub redirects the old name. | Kyler's answer to §17 question 1. | Kyler |
| D13 | Difficulty mismatches are warned, never refused. A Hard-designed map with a Scarce reserve generates, with a warning on the map card. | Kyler: "hard maps are warned (that's part of the fun)". | Kyler |
| D14 | Ratings use the pre-filled GitHub issue form (§2.3). | Kyler's answer to §17 question 3. | Kyler; **superseded by D145** (no rating form; a plain "Report a problem" link) |
| D15 | Deterministic `sin`, `exp` and `ln` in `core/math/detmath.ts`. `sin` is an odd polynomial through x¹⁷ after reduction to [−π/2, π/2] (measured error 4.4e-14), not a 7th-order minimax fit. `exp` and `ln` use range reduction and series. | A Taylor polynomial is exact to write down and easy to check. The extra terms cost nothing measurable. The log-normal draws and the size-aware density interpolation also need `exp` and `ln`. | M1 |
| D16 | The JSON schemas are checked at runtime by a small eval-free checker (`core/spec/schema.ts`) that covers the keywords the two schemas use. Ajv checks the same schemas in the contract tests only, and they must agree. | Ajv compiles validators with `new Function`, which the artifact edition's CSP may refuse, and it would add over 100 KB to the worker. | M1 |
| D17 | Entity `localIndex` (§19.4) is the entity's tile index, y·W + x. The ruin template in the hash is `RuinColumnH<h>`. | One owner never places two entities of one template on one tile. The id stays stable as long as that entity stays on its tile. | M1 |
| D18 | In M1 the project file's base holds heights only, and a project file is rebuilt from its features. Voxel overrides, and opening from the stored base across generator versions, come with import in M3. | Generated maps are heightfields. Rebuilding from features is the M1 acceptance: it reproduces the `.timber` byte for byte. | M1; replaced by D37 in M3 |
| D19 | The River Valley planner in M1 follows the prototype (M6: other flow directions still wait, D67): the river enters on the west edge and leaves on the east edge, and "highlands" are the upper bands of the two `terraces` landforms, not a separate feature. The planned lake basin runs from the basin start to 6 tiles above the gorge. There is no badwater (M2) and there are no map objects (M7). Every ruin column is in a field, within §9.7's "at most 5% outside fields". | Port the proven layout first and change one thing at a time. Other river directions come with the themes in M6. | M1 |
| D20 | The JPEG encoder is jpeg-js 0.4.4, vendored as an ES module (`core/format/vendor/`, BSD notice kept) that returns a `Uint8Array`. | The npm build is CommonJS and returns a Node `Buffer` when a `module` object exists, so Node and the worker would run different code paths. | M1 |
| D21 | In M1, slopes use the prototype's reach rule: every level region within ⌊0.6·max(W, H)⌋ tiles of the start is joined along the region tree (one slope per edge, a second on boundaries of 60+ pairs, at least 12 tiles apart). The §7.5 rules for the 40-tile core, the targeted regions and the 400-tile regions beyond come with `start.reach` and the playability class in M2. | The prototype's playability results were tuned with this rule. Measured over 10 seeds, it gives 14–21 slopes per 10k tiles at 96², 9–16 at 128² and 3–8 at 256². That is close to §7.5's target of up to 20 on small maps and 2–6 on large ones, slightly over at both ends. | M1; M2 kept it (below) |
| D22 | The browser test runs on the installed Chrome locally (`channel: "chrome"`) and on Playwright's Chromium in CI. CI runs the Python oracle on 5 seeds × 3 sizes on every push. The full 50 × 3 run is `npm run oracle`, run at each milestone. | Installing Playwright's browsers on Kyler's machine needs his go-ahead. The full oracle takes about a minute and CI keeps a fast subset. | M1 |
| D23 | The site deploys to Pages from `main` only (`deploy.yml`). CI runs on every branch. | Kyler reviews `dev` and merges. Pages shows what was merged. | M1 |
| D24 | (M6: replaced by basins from the settings, D62; the builder keeps the marsh mode for older documents.) River Valley gets the prototype's badwater, as a `badwaterBasin` set piece in a `marsh` mode: a BadwaterSource 3×3 below the falls, as far from the start as the valley allows, at the badwater ratio × the river's flow (0.65 at Normal, §5.4), clamped to 1–3. It sits in a pit one level below the floodplain, with a one-tile ditch to the river. `water.badwater_contained` is not applicable until the §9.5 side basin with its planned outlet arrives with the shared builder (M5). | M2 needs badwater for `start.badwater`, `water.clean_reach` and in-game check B4. The prototype's marsh on flat floodplain spread a thin badwater sheet over the whole lower valley: contaminated soil reached within 30 tiles of the start on 7% of maps, and sheets were the slowest water to settle. The pit and ditch send the badwater straight into the river. | M2 |
| D25 | The dam-site ridge is a straight band square to the valley's axis (the river's source-to-outlet line), as in the prototype. Each end runs on until it is 4 tiles into ground at least as high as the useful crest (the terrain of build step 2). The gorge goes on the gentlest stretch of the river within 8% of the map of its drawn place. M1's ridge, which followed the river's arc position, is replaced. | With the reservoir checked (`water.reservoir`), the M1 ridge leaked: on a bend its band broke up, and a fixed 40-tile span let the valley floor of a downstream loop wrap round its end. A river that runs along the axis crosses an axis-square band once, and sealing by terrain holds whatever the loop. A steep crossing left a gap no straight dam closes. | M2; **superseded by D111** (Kyler, 2026-09-25) |
| D26 | River Valley layout fixes that settled water exposed. (1) Floodplains step down 4 tiles below each bed step (`PLUNGE`), a short plunge gorge. (2) The channel widens with flow so its water stays about 0.55 deep: width = flow / (0.55 / (0.3 + 0.0015 · 0.8 · W)), from 4.4 to 8.4 (only 256² maps change today, to 7.95). (3) The start bench never fills channel tiles. (4) The start is 6–10 tiles from the channel's edge by true distance to the river path (§7.2), and within 34 tiles of the gorge. (5) The river's centre stays 0.2·H + 12 tiles off the north and south edges, and the planned basin 4 tiles. | (1) The upper channel's lip sat beside the lower floodplain, one level below its bed, and poured over the whole basin floor. (2) A 5-wide channel's surface rose 0.3 over a long 256² reach and overtopped its banks. (3) The bench dammed the river where the start was close. (4) The prototype's vertical offset put starts in the water where the river is steep, and a gorge more than 40 tiles away failed `water.reservoir`. (5) A basin touching the edge drains any dam. With D25, these take the 128² batch to 96% on the first attempt (100 seeds). Changed by D85 (M8): the start reaches water on its own level, so the bench runs to the bank or the start stands on the floodplain; as built, the bench runs to the bank (D97). | M2; changed in M8 (D97) |
| D27 | The canonical settle is defined in §10: a priority-flood basin pre-fill plus an open-channel pre-fill of `min(1, 0.3·Q/w)`, then the simulation until the §11.3 test passes, checked every 128 ticks for at most 4 days. The test counts "at least 99.5% of tiles within 0.005" exactly (not a percentile) and sums volumes in index order. Both validators run this settle on the file (the `generate` profile reuses the build's). Files store 7-significant-digit water tokens and the settled evaporation modifiers. | One definition, computed from the document alone (§19.7), which the Python oracle reproduces bit for bit, so the two validators stop on the same tick and agree on every verdict. From empty, River Valley settled in about 900 ticks at 128² and never within 4 days at 256² with the sheets of D26; from the pre-fill it takes 640–768 and 1,152–1,408. | M2 |
| D28 | The water model of map objects (`sim/model.ts`, and `prototype/playability.py` alike): emitters and walking blockers by footprint; Blockage and a badtide drain's back wall are full obstacles; NaturalDam follows the spec's partial-obstacle rules; seeps switch off above 0.8 deep and on below 0.72 without the game's real-time fade; aquifers, badtide drains and delayed sources are off; every emitter walls its map-edge padding, also when off. Roofs are not modelled: maps with caves or overhangs are simulated on their top surface, which `terrain.single_floor` reports (information on import). The prototype's three §11.5 shortcuts are fixed in the prototype too. | Parity needs one rule set in both validators. NaturalDam's rules and the seep hysteresis come from the code notes and are untested in game (the golden fixtures cover the port, not the game). Every official map has some multi-floor columns (3–4,790), so refusing the playability class on them would leave nothing to compare; the top-surface approximation is what the editor's preview will also show (EDITOR_PLAN §6). | M2; its roof rule **superseded by D120** (stacked water, 3D-a) |
| D29 | The analytic drought (§10) evaporates each pool by its tiles' own saturation modifiers, shared over the flat pool, instead of a flat 0.0535 a day, and a weir tile's own water drains over its lowest neighbour. | With the flat rate, a small weir pool kept 27% more than the simulation after 9 days (its corners evaporate 2.3× faster), outside the 5% the §10 test allows. Now the three fixtures agree within 0.4–2.7%. | M2 |
| D30 | `water.reservoir` needs the colony's drought need × the drought reserve (Normal 1.5×: 380 at Normal). Dam sites are sampled within 60 tiles of the start (the same sampling in both validators) and may flood max(6,000, 15% of the map) tiles. Hard's "mean depth ≥ 3" rule (§11.4) waits for M6. | §5.3 defines the reserve multiplier; the prototype used 1×. Sampling only near the start keeps the Python oracle fast without changing any site within 40 tiles. On 256² maps the gorge basin is larger than 6,000 tiles (the prototype's limit), and §9.1 caps basins at 15% of the map. A mean depth of 3 needs crest-4 dam sites and the Hard feasibility guards of §5.3, which M6 builds. | M2; Hard rule built in M6 (D58), pending Kyler; **superseded by D111** (Kyler, 2026-09-25) |
| D31 | Validation reports (`validate/report.ts`): a check that does not apply to a map is reported as passing with `applicable: false` and the reason (both validators). Severity follows the profile (§11.6). `fix` holds edit operations in the shape the M3 engine takes (today `deleteEntities` for plants that would die and ruins next to the start). The map card groups results as §11.6 says and shows advisory and export-profile failures as warnings. | Parity compares pass, fail and not applicable, so "not applicable" had to be a first-class result, not a missing check. | M2 |
| D32 | The generator version is 0.2.0. M1's 0.1.0 files (out/m1) stay as they were logged. | Every map changes in M2: settled water in the file, the layout fixes of D25 and D26, the badwater of D24. | M2 |
| D33 | **Water budget (the M2 benchmark, §10):** the canonical settle takes ≤ 3 s at 256² and ≤ 0.6 s at 128². Measured medians in Node: 0.39 s at 256² (max 0.51 s) and 0.07 s at 128² (max 0.07 s); a whole 256² generation takes a median 0.95 s in Chrome. K = 3 candidates stay the default at 256² (§7.9). CI checks the 256² median on every push. | The M2 acceptance asks for the budget to be measured and recorded here. The exact active list plus the pre-fill cut the audit's 6.5–11.3 s cold start at 256² to under 0.6 s. | M2; CI's check becomes a reported number, never failing a build (D145) |
| D34 | The M1 slope rule (the prototype's reach rule, D21) stays through M2. §7.5's 40-tile core, targeted regions and the 400-tile rule arrive with the slope tools in M5, which lists §7.5. | With it, `start.reach` passed on every one of 100 maps at 128² (12,000+ walkable tiles against 1,300 needed), so M2 had no reason to change a rule M5 rebuilds. | M2; replaced by D52 in M5 |
| D35 | Edit operations share one envelope, `{op, params}`, with camelCase names. Every EDITOR_PLAN §3 operation is covered: `addFeature`, `updateFeature` (a merge patch on `params` and `locked`), `deleteFeature`, `reorderFeature`, `sculpt`, `placeEntity`, `moveEntity`, `deleteEntities` (plural, so one fix removes many), `setEntityProps`, `pinSlope`, `removeSlope`, `setLock`, `regenerateRegion` and `specPatch`. The validation report's fixes are this envelope plus a label (D31). Operations are rejected with reasons when invalid, never clamped. Operations whose tools come later are rejected until their milestone: naturalize (M10), `regenerateRegion` (M11), adding set pieces (M5) and map objects (M7). The sculpt brushes keep terrain within 0–16, as the in-game editor's do. Hand-placed entities get a random GUID when the operation is made, stored in it. | One shape for the tools, the fixes and Claude (M12). Plural `deleteEntities` was already the fix shape. A brush that stops at the editor's limit is a defined tool, not a silent clamp of an invalid value. | M3; set pieces open in M5 (D47) |
| D36 | Import normalization (§19.6) applies the game's own load-time migrations once. It also stamps the native 1.1.2.4 version, and it halves `CurrentStrength` along with `SpecifiedStrength`. It drops only the components 1.1 never reads: `DryObject`, `ContaminatedObject` and `NaturalResourceModelRandomizer`. It keeps `BlockObjectState`, `WateredNaturalResource`, `LivingWaterNaturalResource` and `ContaminatedNaturalResource`, which 1.1 still reads. It keeps `StartingLocationPlayer` and every start of a multi-colony map (D5); `start.count` stays a vanilla load check until the Timber Together milestone. A map with fewer than 23 layers is padded, with a warning. `file.arrays` (both validators) checks each packed array against its own size field, as the loaders read them. | FORMAT.md §7 listed four live components as obsolete; the decompiled loaders read them. Timber Together reads `StartingLocationPlayer`. The halved `CurrentStrength` is what the game computes from the halved `SpecifiedStrength` on load. 0.6 maps store one soil slot beside two water levels. On all 30 voxel-format investigation maps the normalized world exports byte for byte, and it normalizes to itself. | M3 |
| D37 | A document is a generation plus an edit log. The generation is the spec, the planned features, what locks kept, and the built `base`. The base stores the whole map, for generated maps too: the surface heights, the multi-run columns verbatim, and world.json's exact text without its terrain array. A document from another generator version therefore opens exactly from its base ("frozen"). There the player's own edits apply, and edits to what the generator made wait for `rebuildWithCurrentGenerator`. Project files are format 2: `features` and `locks` are the log applied to the generation, checked on open, and `baseFeatures` is stored only when it differs. Format-1 files (M1, M2) still open: their base is rebuilt with the current generator, with a notice when the version differs. The log persists and still undoes after reopening; a regeneration's previous generation stays in the session only. | §19.7 asks a document to open exactly after the generator changes, and heights alone (D18) cannot do that. Storing world.json as text keeps every float's digits. Storing earlier generations would multiply the file's size for an undo that the log mostly covers. | M3, replaces D18 |
| D38 | Build order (§19.8): entity edits run in two passes. The first runs after the sources (step 9), on everything that exists by then: slopes, sources, an imported map's objects and hand-placed objects. A deleted source or a placed Blockage therefore changes the water. The second pass runs at step 13, on resources and the start. Hand-placed objects take their tiles before resources are placed. Incremental rebuilds (§19.7) rasterize terrain only inside the dirty region: the footprints of the changed features, old and new, the whole map when a river other features follow changes, and the sculpted cells. The region widens to the dam site's whole band and a smooth brush's cells when it touches them, and by one tile for the integrity pass. Slopes, the water settle, moisture and each resource feature are reused when their inputs are unchanged. | Step 13 alone would settle water around objects the player had deleted. Region-restricted rasterizers keep a feature edit cheap. The settle (0.4–0.75 s at 256²) is skipped for every edit that does not change terrain or water objects. The E1 property tests check that it equals a full build after every step. | M3 |
| D39 | Regeneration (a `specPatch`) plans around the player's features, locked regions and keep-out regions (§7.0). They form one protect mask. River Valley draws its layout again, up to 24 times per attempt, until the river with its bank, the basin, the dam ridge and the start keep off it; its marsh and resources keep off it too. The log is replayed on the new plan, and the retry loop validates the whole document in the `generate` profile. If no attempt passes, the last one is kept with its report. If no layout fits, the regeneration is refused and the document is unchanged. Locks keep the previous generation's generated content in their area: its surface and generated objects, but not its slopes or start. Generated features skip locked tiles, the player's edits replay on top, and water is derived again. Changing the map size while areas are locked is refused. | Nothing the player made is dropped, and nothing is silently lost: operations that no longer apply are flagged with reasons. Keeping the generation's content under a lock, not the final map, stops the player's own edits from being applied twice. | M3; locks are revisited with the lock tools in M11 |
| D40 | Editing imported maps: the file's own slopes are kept (no derived slopes), and the slope pin and remove operations still work. The sculpt tools refuse columns with caves or overhangs, and features leave them unchanged. The integrity pass and the terrain clip touch only tiles an edit changed. Imported objects move to the new ground when an edit changes the surface under them. The water is re-settled only on heightfield maps; maps with caves keep the file's water until M8 brings the roofed-water rule, with a notice. The thumbnail is redrawn only when terrain or water changed. | An unedited import must export byte for byte, and terrain up to 22 must survive (D4). A top-surface settle is an approximation under roofs (D28). The thumbnail shows only terrain and water. | M3; its slope rule replaced by D52 in M5, its cave water by D100 in M8; its cave rule **superseded by D125** in 3D-c |
| D41 | The artifact edition's build (the M3 spike): two Vite builds, with the worker bundled on its own and inlined as a string the page turns into a `blob:` URL, then the page script inlined into one HTML file. Fonts are the only thing fetched at run time. The page declares only `sample` and `downloads`, reaches the runtime through `window.claude.use()`, and renders without it. | The spike page proves the shape: 209 KB, of which the core is 189 KB, with no `eval`, under the artifact's rules. Vite's own inline worker falls back to a `data:` URL, which would hide whether blob workers work. | M3 spike |
| D42 | The editor's tools in M4 (the shell, EDITOR_PLAN §4). Rectangle tools make a plateau (Land: flat, cliff edges, 2 levels above the highest ground under it unless a height is picked) and a forest, berry patch or ruin field (Resources). Water has no drawing tool yet. A selected feature gets a move handle (drag it, or focus it and use the arrow keys, placed 0.7 s after the last key) and a delete handle. The start, resource areas, landforms with an outline, lakes of their own and rivers move; a river keeps the ends on the map edge on that edge, so its sealed mouth stays a mouth; the start's bench takes the ground level at its new place. Set pieces, the valley landforms that follow a river and a river's reservoir site do not move, and say why. Deleting a feature others build on is refused with their names. The inspector changes a forest's or berry patch's density, a plateau's height and the start's facing. | The roadmap puts the land and water tools in M5 and the resource tools in M7. The M4 acceptance needs the player's own edits made on the page, and these features were already built by the engine (D35), so the tools are the same operations those milestones extend. Features that follow a river are rebuilt from it; moving them alone would break what builds on them. | M4 |
| D43 | The export check (§19.5, `export` profile) in the editor. Load problems block; playability and design problems warn, and when the player exports anyway they are noted at the end of the map's description; advisory checks are listed and never noted. An imported map's own problems (a check that already failed, over the same entities or tiles, on the map as it was opened) are listed apart and never block or get noted. Imported maps get the load and design checks at export; their water and colony checks wait for the background validation of M8. The map's health pill runs the same check 0.7 s after each change. | 30 of the 32 investigation maps have problems of their own as they are. 12 fail a load check (`slopes.connect` on 10, `start.count` on 2 including the multi-colony map, `start.flat`, `start.entrance`, `entities.placement`), and 27 warn in the design class (caves or overhangs, `terrain.single_floor`; terrain above 16, `terrain.max_height`). Blocking them, or noting them in the description, would stop them exporting unchanged, and a multi-colony map must survive export (D5). A settle for the water checks takes 5–13 s on a 256² import. Noting the advisory check, which warns on every River Valley map, would change the bytes of an unedited export. | M4 |
| D44 | The page keeps one open map (the document in the worker). "Refine this map" opens the generated map; "Back to settings" shows the edited map, its card validated in the `export` profile; while it has edits, Generate becomes "Generate, keeping my edits" (a `specPatch`, D39) and "Discard edits" starts over. Opening another map or refining a new one asks first when the open map has edits, and offers its project file. The open map is autosaved to IndexedDB through the storage adapter (the project file, gzip level 6) 1.2 s after each change; a reload in the editor opens it again, and the settings page offers to continue it. The editor and the 3D view are separate chunks, loaded on demand. | EDITOR_PLAN §1 and §3: moving between the screens never loses work, and autosave recovers the last session. One map at a time keeps "which map am I editing" obvious. IndexedDB takes bytes and has room for 256² imports (up to 2 MB), where localStorage has about 5 MB of text. | M4 |
| D45 | `render3d` (EDITOR_PLAN §8): world X = x, Y = height, Z = −y, so the top-down view has north up. Terrain is shaded by height, with a tile grid on tops and level lines on walls that fade out when zoomed out, and no textures; colours are display values (no colour management). A per-tile overlay texture shows selections and previews without remeshing. Water is a flat quad per wet tile at its surface, with curtains where a neighbour's water or ground is lower. An unedited import, or one with caves, shows the file's own water (`WaterMapNew`, every level), which is what its export keeps (D40). Objects are our own low-poly models (trees, bushes, ruin columns, slopes, sources, the start), and every other template is boxes on the blocks of its footprint. Columns with caves or overhangs are picked by their surface. Updated by D86 (Map look, as built in D110, D114 and D115): the ground is coloured by moisture, with height on the walls and a toggle back to height colours; there is no tile grid, and the textures are drawn by a shader. | One light look for every map the game can load, cheap enough for 583,000 triangles (Beavertopia) to orbit at the display's rate on an integrated GPU. The overlay keeps tool feedback within a frame (EDITOR_PLAN §9). The game's assets are not ours to use (EDITOR_PLAN §2). | M4; its cave rule **superseded by D126** in 3D-c |
| D46 | The 3D budget (PLAN §14.2) is measured by `npm run bench:3d` in the installed Chrome, headed, on 256² maps (generated and the local 256² investigation maps). This machine is not a mid-range laptop (Ryzen 7 9800X3D, RTX 4080 SUPER), so the fps budget is judged on its integrated GPU (AMD Radeon Graphics, 2 compute units, weaker than a mid-range laptop's), picked with `--use-adapter-luid`, with the page's CPU also slowed 4× by Chrome's throttling. CI renders in software, so it checks the build with a 3 s bound (376 ms there), and correctness (`tests/e2e/render3d.spec.ts`). | The budget names a mid-range laptop. The integrated GPU and the throttled CPU are a lower bound for one; the dedicated GPU is reported too. | M4; **information only** (D115): run only when something 3D-heavy changes |
| D47 | The set-piece builders (§19.3) as built: each has `request` (the hard bounds of what may be asked, a JSON Schema checked by the eval-free checker), `limits`, `plan(request, context, id)`, `check(plan)`, `rasterize`, `footprint`, and optionally `sources`, `slopes` (its own stairs and chains), `clears` (tiles kept free of resources) and `area` (what the editor highlights). A plan is deterministic from the map, so it takes no random stream. The context (`PlanContext`) is the map: its surface, river channels, taken tiles, the start's zone, locked and protected tiles and the objects on it; a generation's macro layout has no terrain yet, and a piece that needs terrain is planned on the layout's built ground. A feature stores `{kind, request, plan, report}`; `addFeature` and `updateFeature` of a set piece are checked against its builder's bounds (a set piece keeps its kind), and `core/doc/tools.ts` gives the editor, and later Claude, the planned operations. | One place reduces values and reports it, and a stored plan outside the bounds (from a project file or a proposal) is rejected rather than built. A random stream would make the same request give different pieces in the tool and in a proposal. | M5 |
| D48 | Waterfalls (§9.2) as built. Standalone: a lip `width` tiles wide at level L facing one of four ways; a header pool 3 rows deep at L − 1 behind it; the plunge pool 4 rows deep in front at the ground's level, lowered so L stays at 15 or below; walls round both; springs of 0.5 along the pool's back row (more rows past its width), the whole flow capped at the map's budget unless `exactFlow` (D6), at least 0.025·W plus the pool's evaporation; the outflow channel routed from the plunge pool to the nearest map edge, river or lake (1, 3 or 5 wide by the flow) and carved with a bed that never rises and banks one above it. The width is capped at 40% of the side along the lip (48² 19, 96² 38, 128² 51, 192² 76, 256² 102) and the drop at 15, reported. On a river: a bed step, at least 12 tiles from the next fall and no deeper than the river's bed allows downstream. It keeps the river's width: the 1–3-tile narrows above the drop wait for in-game check C2. | The port wets all 20 lip tiles of a 20-wide fall at 0.5, 2 and 8 water/s with the header pool, 0.3·S/W deep, as the audit measured; the range tests check it on 96², 128² and 256² maps. Narrowing River Valley's falls would change every generated map's water for a benefit only the game can show. | M5 |
| D49 | The other builders as built. Dam site: the D25 ridge planned from the river, the place along it and the crest (1–4, the ridge top 3 above it, at most 16); on a map that exists, the plan measures the reservoir a dam across the gap holds, and says so. Its narrows stay the D25 ridge, not a gorge (§9.9 said the dam site uses the gorge builder): River Valley's reservoir checks are tuned on the ridge, and a dam site can be placed inside a gorge. Gorge: on a river only, narrowing it to 3–9 tiles for 6–40 tiles between walls 3 thick, 2 or more above the bed and at most 16; the stair notch is described in §9.9. Terraced cliffs: 3–6 bands 6–12 deep rising away from the way they face, from the lowest ground in front, with a slope chain at the end nearer the start; the step from the ground to the first band is left to the derived slopes. | A gorge without a river is a canyon landform, which the Land tab draws. A notch that climbed where the ground behind the wall is no higher than the floodplain would lead nowhere. | M5 |
| D50 | River Valley plans its dam site, its two falls and its badwater marsh with the shared builders (§7.3). The marsh's site search moved into the builder and reads the river's centre from its path, where the planner used its own curve. River Valley keeps one premise, a gorge-dammed basin with a cascade and falls; the other premises of §8 come with names and premises in M9. With the §7.5 slopes (D52) every generated map changes, so the generator is 0.3.0. | The roadmap asks the premises to switch to the builders; adding premises is M9's work. The batches stay at 100% final: 96² 97% first try, 128² 97%, 192² 99% and 256² 99% (100 seeds each). | M5 |
| D51 | Badwater basins (§9.5): the builder's `basin` mode (7×7 floor, rim two above it, one outlet 1 or 3 wide with its sill one above the floor, a channel to a river or edge kept 12 tiles beyond the start's zone) is built and offered by the editor's Badwater spring tool. `water.badwater_contained` stays not applicable: a source never stops emitting (notes Q1), so with its outlet blocked a basin holds the badwater only until it fills, and the §9.5 proof cannot pass at steady state. M6, which places basins from the badwater settings, defines the rule. | Checking a rule that can never pass would fail every map with a basin. The choice of a replacement rule (for example, how many days a levee must hold) is Kyler's, so it waits in decisions-pending #11. | M5; rule defined in M6 (D57), pending Kyler |
| D52 | Slopes follow §7.5 as written there: the 40-tile core, targets, one slope from each region of 400+ tiles beyond, 12 tiles apart, and standing slopes joining their regions for free. Targets are the regions of landforms with gentle or terraced edges and, on an edited import, the ground its edits changed; an unedited import gets no new slopes (D40 kept the file's slopes and derived none). The start's water, groves and berries lie inside the core, so they need no targets of their own. | §7.5 was deferred to M5 (D34). Measured on River Valley: 13–16 slopes per 10k tiles at 96², 7–10 at 128², 4–5 at 192², 3–4 at 256², inside §7.5's targets (the M1 rule gave 14–21, 9–16 and 3–8); the fewest tiles walkable from the start on seeds 1–10 are 6,659 (need 1,300). Without slopes on an import's changed ground, a gentle hill drawn on it would be a stair nobody can climb. | M5 |
| D53 | Rivers drawn in the editor. They start at the map edge (a point within 2.5 tiles snaps to it: a sealed mouth) or inland (a spring: sources of at most 8 on the channel tiles nearest it), and end at another edge, in another river or in a lake; anything else is refused. The bed is the lowest ground along the channel and its banks, less the bed depth, never rising downstream, one below any river it crosses (their water pours in and never back), and never below 0; `banks` raises the ground beside the channel to bed + depth. The width keeps the water inside its banks: w ≥ Q·(0.3 + 0.0015·L)/(depth − 0.35), with Q its flow plus the rivers it crosses and L its longest flat reach (D26's rule); the bed depth goes up when 9 tiles are not enough; below 1.25 water/s it is one tile wide, so the water is no thin sheet. Refused: loops and hairpin turns, a mouth within 8 tiles of another river on the map edge, a course through the start's area or along another map edge, and an end below the bed of the river it joins or below the level of the lake it joins. A lake it flows into gets its outlet planned again for the extra water. | EDITOR_PLAN §1: rivers always flow downhill to an outlet and keep their water. The property test draws rivers in random directions on 96², 128² and 256² maps; each rule above came from a case where the water pooled, spilled or never settled. | M5 |
| D54 | Lakes and landforms drawn in the editor. A lake is its basin: the water level is its outlet's sill, by default the lowest ground round it (1–15); the floor lies 1–4 below it (default 2); a rim two tiles wide stands one above the sill; an outlet channel is routed from the basin at the sill to an edge, a river or another lake; a spring (default 0.5 water/s) keeps it full. It keeps 3 tiles from the map edge and off rivers. A landform is its outline, a height and an edge style: `base` records the lowest ground on its edge when it was drawn, and gentle edges step one level every 3 tiles from it toward the height, terraced edges every 6–12; the inside ends at the height. A plateau drawn in M4 (no base) keeps its cliff. | The level of a lake is not a free number (settled water is flat), and a lake without an outlet overflows its rim wherever it is lowest. Storing the base keeps the rasterizer tile by tile, which the dirty-region rebuilds need. | M5 |
| D55 | The editor's tools in M5 (EDITOR_PLAN §4). Land: hill, plateau, ridge, canyon, valley, island (drag a rectangle or click the corners), terraced cliffs and slopes (click a step to pin one, a slope to remove it). Water: river (click from source to outlet), lake (as landforms), waterfall (on a river it adds a bed step, anywhere else a standalone fall), dam site and gorge (click a river), badwater spring, and a dam-site layer (the `water.reservoir` sampling, the 12 best). Every gesture is planned by the worker and shown with its report; Place applies it as one step. Moving a river, a lake or a set piece plans it again at its new place (an on-river piece moves along its river); the inspector plans it again with new values. The start's footprint shows green or red while it moves, with the water, trees and berries within 20 tiles by straight distance (the checks use walking distance); an imported start moves with a handle of its own. | See it before you commit (EDITOR_PLAN §1). Planning in the worker keeps one implementation for the tools and for Claude. The straight distance keeps the indicators within a frame while dragging. | M5 |
| D56 | Instant validation (§19.5, EDITOR_PLAN §6): after every edit the worker runs the load and design checks on the map as it now stands, about 25 ms at 256² (no water settle, no thumbnail), and marks the problems in the region the edit touched (its features' old and new footprints and the ground that changed). The page shows the load problems an edit made at once, with their fixes; the full export check still runs 0.7 s later. One-click fixes: move the start to the nearest good spot (start.flat, start.entrance, start.dry, start.clear), remove the slopes that join nothing (slopes.connect), and the M2 removals. Check items carry their fixes and the tiles of their entities. | The instant subset is cheap on the whole map, so checking all of it and marking what lies in the edited region gives the same answer as checking only that region, without a second implementation. | M5 |
| D57 | `water.badwater_contained` (§11.3), in both validators: for each badwater basin with a planned outlet, the outlet channel's bed tiles are blocked (the levee), and a flood from the source's 3×3 over tiles lower than the rim (floor + 2) must stay inside the basin's floor and rim (an 11×11 square) and off the map edge. The value is the number of basins that leak; not applicable without such a basin. The editor's Badwater spring tool and the generator make basins that pass; a later cut through a rim (a sculpt, another feature's carve) fails it. | A source never stops (notes Q1), so no rule can prove a levee holds forever: with a 1–3 water/s source a 7×7 basin fills from its sill to its rim in about 16–49 seconds of game time. What the rule proves is that the outlet is the basin's only way out below its rim, so the levee on the outlet is the counterplay §9.5 describes. How long a levee must hold is Kyler's call (decisions-pending #11). | M6; pending Kyler |
| D58 | Hard's reservoir rule (§11.4), in both validators: on Hard the dam sites are sampled with crests 1–4 and count only when their reservoir's volume ÷ area is at least 3; the natural water kept through the drought counts as before. The generator makes Hard maps that pass: in River Valley and Canyon the cascade above the basin drops 4, the first rise round the valley is a 3-level cliff, the dam site's crest is 4 and the start stands below the gorge (where a dam 4 high cannot flood it); Lake Basin's lake is 4 deep. | The plan's words, exactly (decisions-pending #1). A crest-4 reservoir over a floodplain basin is about 3.1 deep on average only when terraces do not add shallow margins and the river upstream does not flood (it must rise 4 at the cascade). Natural storage already loses the drought's 1.6 of evaporation. Measured: Hard passes 100% within 12 attempts on 30 seeds at 128² in all three themes (see [progress, M6](docs/progress/m6.md)). | M6; pending Kyler; **superseded by D111** (Kyler, 2026-09-25) |
| D59 | The settings move the layout (§5, §7.4). Relief: the lowest reach's floodplain sits `7 + 0.08·relief` below the highest terrain, and the built terrain is measured and shifted (at most three builds) until its p5–p95 range is within one level. Terracing: each band rise is one level with probability 0.86 − 0.0059·terracing, else a 2- or 3-level cliff. Bands climb to the highest terrain 80% of the way to the map edge, so they can be narrower than 9–16 tiles. Buildable land (Tight / Normal / Generous): the valley floor's half-width (0.16 / 0.2 / 0.25 of the side across; Canyon's drawn floor × 1 / 1.1 / 1.25, Tight being its preset; Lake Basin's shore bench 11 / 14 / 18 tiles), how far band edges wander (4.2 / 3.2 / 2.2 tiles) and how jagged they are (a fine wiggle of 0.9 / 0.3 / 0.15 of it, in cells of 5 / 8 / 8 tiles; Canyon's stays 0.3 in 8), and where the terraces' cliffs go: Tight moves the first cliff to the valley floor's edge (or the lake's shore bench), so the start's walkable land ends there, and Generous puts every cliff above the one-level rises (the same rises in another order, so the terracing's share stays). Start rules: the start's distance from the water follows the clean-water rule, near-start groves aim at 1.2× the trees rule, near-start berries at the larger of the setting and 1.15× the bushes rule, ruins keep the ruins rule + 7 tiles away, and near-start food and wood go on land the colony can walk to. Every map changes: generator 0.4.0. | The M6 acceptance: each setting moves its measured target (tests/contract/settings.test.ts, tools/settings-batch.ts). River Valley was far flatter than the official maps (height range 4–6 against the relief target 11, flat share 0.80 against 0.52); now its range meets the target. Walkable land from the start moves from 2,951 to 4,641 tiles (Tight to Generous, 20 seeds at 96²; 3,240 to 9,211 at 128²) with the cliffs moved; the floor's width alone moved it 306. Measured targets that move less than the formulas: flat share 0.52–0.59 for Tight–Generous at 96² (target 0.40–0.60), and larger maps are flatter at every setting (about 0.63–0.68 at 128², 0.73–0.76 at 192²), because the relief's levels are spread over a wider map; one-level share 0.68–0.44 for terracing 10–90 (target 0.80–0.33); cliff share about 0.1 (target 0.15): channel banks, ridges and falls add steps the settings do not set. | M6 |
| D60 | Rivers (§5.3) counts the rivers that enter on the map edge. In River Valley and Canyon the extra ones are tributaries from the north or south edge into the main river, clear of the start and the dam site, each in its own valley, climbing in 1-level steps (2-level falls when the waterfalls are Many), each bringing a quarter of the main river's flow; the main channel is sized for all of it. With 0, a spring three tiles in feeds the main river (Lake Basin: a spring in the lake). River flow sets the main river's strength (the tributaries add theirs). Braided waits for the Delta theme (M7): the panel offers it disabled and the planners treat it as meandering. A river under 90% of the Normal flow may be narrower than 4.4 tiles, down to 2.4, so its water stays deep enough to pump. | Splitting the budget between the rivers left the main river too shallow to pump from (0.1–0.2 deep) or its lower course, sized for its own share, overflowing its banks below the confluences. A Trickle river in a 4.4-wide channel was also too shallow (start.water failed on every attempt). | M6; pending Kyler |
| D61 | Lakes and basins (§5.3) are riverside ponds: an outline of 24+ tiles on a river's floodplain, off the start's zone, the reservoir basin and the dam site's band, dug to two levels below the river's bed (three on Hard), joined to the river by a cut at the bed's level, with no spring. The count is the multiplier × the official median for the size (new calibration row `basins_ge20`: 1.5, 4, 15.5, 15, in both calibration tables). Ponds stand only on reaches badwater never reaches. Lake Basin counts its lake as one. | Ponds with a spring and an outlet channel (the editor's lakes) took 2–3 game days to settle: a thin outflow running flat across a terrace, or backed up by the river, oscillates for days. Riverside ponds settle with the river (the canonical settle stayed at 768–1,024 ticks at 128²) and keep their water below the bed through a drought. The canonical pre-fill spreads badwater along a flat reach, and a dead-end pond is never flushed. | M6; pending Kyler |
| D62 | Badwater from the settings (§5.4, §9.5): the ratio × the main river's flow, split into basins of 1–3 (strength each total ÷ ⌈total ÷ 3⌉), placed nearest `badwater distance + 14` tiles from the start (at least distance + 12), planned by the basin builder, its outlet at least distance + 8 from the start; the outlet joins the main river below the first step downstream of the start's reach and beyond where the rest of the river keeps distance + 12 from the start, or runs to a map edge; it never crosses or runs beside (within 2 tiles) another river, the reservoir basin, the dam site's band or a pond. Lake Basin's outlets join the outlet river below its fall, or run to an edge; never within 4 tiles of the lake. River Valley's marsh (D24) is replaced. | The Badwater distance setting must move the measured distance (tools/settings-batch.ts). Joining the river on the start's own flat reach let the pre-fill carry badwater past the start; a meander could bring a joined reach back near the start; an outlet beside another river spilled into it (in Lake Basin, into the lake). | M6 |
| D63 | Canyon as built (§8): the valley planner with a canyon floor 9–12.5 tiles each side of the river, walls 4–6 levels (3 + 0.04·relief), then one-level rim terraces up to the plateau (terracing does not apply to Canyon's rims), band edges wandering 0.45× as much, a gorge 3–5 wide round the dam site (its walls one above the crest), and a basin reach at least 34 tiles long so the start and its stair fit on one level of the floor. The stair is the terraced cliffs builder's new `stair` variant: 2–8 steps 1–5 deep, 1–12 wide, a slope on each; Canyon's runs one tile wide along the wall's foot beside the start's bench, one level per tile. One premise (Narrows) until M9; tributaries run in side canyons, dry side canyons wait. | §8's "slope chains up the walls near the start". Derived slopes stand 12 tiles apart, so a stair needs its own slopes; terraced cliffs 6+ deep dug a trench whose top step met higher rim ground. With rim cliffs (terracing 75) the start's region ended at the first cliff (reach 700 against 750); the canyon floor between falls is too small alone. | M6; pending Kyler |
| D64 | Lake Basin as built (§8): premise Rising lake only (Crater lakes with M9, the NaturalDam weir with M7). The lake is a lake feature of its own at its outlet's sill (18–24% of the map up to 128², × (128² ÷ area)^0.75 beyond), floor 2 deep (3 with Plenty, 4 on Hard); the highlands and the rings of terraces are nested landforms (the whole map at the highest terrain, then each ring lower, one per band rise); inflow and outlet rivers cut valleys through the rings; the outlet's dam site has crest 1. | A lake fills by its outlet's head over its whole area: at 256² a lake of a fifth of the map took nearly all of the canonical settle's 3,072 ticks and often failed `water.settles`; at the smaller share (about 5,000 tiles) it settles in about 2,000. Crest 1 raises the lake to the shore bench's level, so the start stays dry. | M6; pending Kyler |
| D65 | The URL codec (§14.5) as built in `core/spec/codec.ts`, with Copy link and Copy seed + settings on the page. Share links carry the spec only (D7). | One fragment per spec, readable keys, and room for Timber Together's colonies (D5). | M6 |
| D66 | The settings panel (§14.1) as built: the theme strip (Highlands, Delta and Islands marked "Coming later"), Basics, Terrain, Water, Hazards, Resources, Advanced start rules, a Limits note for the map size, and "Reset to the theme's settings". Each control shows its band from the official maps. Guards: a drought reserve whose reservoir (need × reserve ÷ 2 deep, 3 on Hard) would cover more than 15% of the map is disabled with the reason; Hard with a Scarce reserve warns (D13); Many waterfalls says how many fit under the highest terrain. Thorn belts, unstable cores, relics, geothermal fields and mine sites are not offered ("come in a later version"): their objects arrive in M7, and until then those settings do not change a map. The colonies are not shown (D5). Changing the theme resets every setting to its preset; changing the difficulty resets the start rules, badwater distance and berries target. Updated in M7 (D81): the three themes and the map objects' settings are offered. D85 (M8) keeps this: changing the difficulty resets the three start requirements to its defaults. | PLAN §5.7 and ROADMAP M7 put the map objects in M7, so their settings cannot move a target in M6. | M6 |
| D67 | River Valley and Canyon still flow west to east (D19), and Lake Basin's outlet runs east. The eight flow axes of §7.1 wait for M9's premises. | Rotating a layout needs every planner and set piece in a common frame; the themes' batches and settings came first. | M6 |
| D68 | Lake Basin's canonical settle is over the §10 budget: a median 1.15 s at 128² (budget 0.6 s) and 3.0 s at 256² (budget 3 s); a whole Lake Basin generation takes a median 0.9 s at 128² and 3.0 s at 256² in Node. Accepted for M6; CI's settle gate stays on River Valley. | The pre-fill fills the lake to its outlet's sill, and the sim then raises the whole lake by the head its outlet's flow needs, over a long flat reach to the dam site: 1,400–2,000 ticks, each over 3,000–5,000 wet tiles. Faster options change the layout or the shared pre-fill (Python too): a short lip at the lake's mouth with the dam site on it, or a pre-fill that adds the outlet's head. The lake already shrinks on large maps (D64). Decisions-pending #22. | M6; pending Kyler |
| D69 | Map objects (§5.4–5.5, §5.7) are `mapObject` features. A single object (mine site, relic, geothermal field, unstable core) is placed by its footprint's south-west corner and a facing; a line (thorn belt, weir, plug) by its tiles, one object on each, turned and flipped by a tile hash as the in-game editor does. They stand at build step 9 with the water sources, and take their tiles before the derived slopes of step 8 and the resources of step 11. One rule (`features/objects.ts`, `fitProblems`) places them for the generator, the editor's tools and the footprint preview: on the map, level ground for single objects, dry and off rivers (weirs and plugs go across them), free of other objects, caves, locks and the start. A set piece may place objects of its own (`blocks`: the spillway's plug). | §19.8 put map objects with the resources at step 11, after the water settle. A weir and a plug hold water and thorns keep the soil under them dry, so they must stand before the settle, and a derived slope must not land under one. One rule keeps the preview, the refusal and the generator in agreement. | M7 |
| D70 | Islands as built (§8): the Lake Basin planner with a sea of 40–48% of a 128² map, × (128² ÷ area)^0.5 beyond, its radius at most 0.44 of the side, a ring of land 0.09 of the side round it; 6–25 islands (one per 900 tiles of sea) of radius 6.5 to 6.5 + 0.03 × the side, rising 1–3 levels above the sea, clear of the rivers' mouths; a second outlet to another edge carries half the sea's water. The start is on the shore bench. Premise Archipelago only. | A sea this size rises by its outlet's head over its whole area; with one outlet the head, and the settle, grew with the sea. Two outlets halve it. The sea shrinks more slowly than Lake Basin's lake on big maps, so the theme keeps its character (at 256² it is still about a fifth to a quarter of the map). | M7; pending Kyler |
| D71 | The plugged spillway (§9.6) as built: a channel 3 wide from a lake to a map edge or lower ground, its bed one level below the lake's sill, routed from the lake's water out through the shore near the point asked for; the plug is every channel tile beside the lake's water (2–9 Blockage tiles, or the plan fails), its top at the sill, so the lake spills over it as over its own outlet. The report's release is the lake's area × one level, an estimate. Lake Basin and Islands place one on nearly every map: from shore points 8–16 tiles from a river's mouth, the farthest from the start first, at most half the map's side long, kept only when the land the colony walks on from the start stays at 90% or more. | A plug one row across the channel leaked round its ends where the route ran along the shore, so the plug meets the lake along the whole mouth. The lake is flat, so the volume above the new sill is the release; a second canonical settle would double the water time of a Lake Basin map (already over budget, D68). In-game check D5 measures it. | M7; pending Kyler |
| D72 | NaturalDam weirs (§5.7) as built: on half the maps the generator tries a weir where its river's water per tile stays in the channel (0.65 + 0.35 × flow ÷ tiles ≤ 0.93): across the dam site's channel (River Valley, Highlands, Delta), else a tributary or Highlands' stream 8 or 14 tiles above its mouth; Lake Basin and Islands try each inflow. Not in a canyon's narrows, and not on a delta's channels. It is left out when its water floods the floodplain within 60 tiles upstream, or it cuts more than 60 tiles off the land the colony walks on. Weirs on generated maps (20 seeds, Normal): 96² (20 seeds): River Valley 1, Highlands 2, Lake Basin 9; 128² (20): Highlands 4, Lake Basin 7; 192² (10): Highlands 2; none in Canyon, Delta or Islands. The editor's **Weir** tool places one anywhere across a river. | A river's channel is sized for water about 0.55 deep, so a 0.65 weir raises it to about bank height, and at the dam site the weir also closes the only way through the ridge (a natural dam blocks walking). A weir fits where the river carries less water per tile than its channel was sized for: smaller rivers. A weir on one channel of a delta only stops it (the head pool sends the water down the others). Decisions-pending #23. | M7; pending Kyler |
| D73 | Highlands as built (§8): the valley planner (terracing, the dam site, falls, badwater) with 2–4 round plateaus on the terraces, radius 0.06 × the side × 0.8–1.2 (at least 5), each 2–4 levels above the ground under it with a cliff all round, 8 tiles plus its radius beyond the river's banks; a stream (a quarter of the river's flow) from a spring on the highest plateau, planned as the editor plans a drawn river, falls over its cliff and the terraces to the main river; ruins on a plateau (D76). The start is on a bench in the valley. Premise Staircase only. | The valley planner's start rules (water in reach, food, the drought reserve behind the dam site) hold in the valley, and every batch passes. A start on a mid plateau needs its own water and reservoir up there: the Twin plateaus premise (M9). Decisions-pending #24. | M7; pending Kyler |
| D74 | Delta as built (§8): the valley planner with the dam site's gorge 30–40% of the way across; below it the river ends in a head pool 2 deep, and 2–4 channels leave the pool at its level and fan out across a plain one level above them to the east edge, their mouths over 30–60% of it, each sized for its share of the water. The start is on a bench between the dam site's ridge and the head pool. Badwater basins drain to a map edge (a basin joined to a channel would carry badwater past the start). Braided (§5.3) builds the same delta in River Valley and Highlands; Canyon keeps its narrows. Premise Many mouths only, with one dam site. | Channels at the pool's level share the water by how it flows, as a braided river does, and the plain one level above keeps them apart. The canonical pre-fill spreads badwater along a flat reach, and the delta's channels are level with the start's pool. | M7 |
| D75 | `extras.placement` (§11.4) as built, in both validators: relics, geothermal fields and mine sites stand on level ground with no water within 2 tiles (Chebyshev) and outside every planned reservoir; the generated ones in their distance bands from the start (small relic 13–70, medium 40–140, large 140+, geothermal 30–120, mine site 60+; on maps under 128² × the longer side ÷ 128); generated thorn belts 20+ and unstable cores 40+ tiles from the start, and cores their radius + 2 apart. Objects the player places are held to the ground rules only. Not applicable when the map has none, or on imports. The generator places each object inside its band by a tile, with a ring of level ground round it, biggest first, and leaves out any that cuts the colony's land in two (thorn belts first). | A 96² map has no tile 140 out and few 60 out, so fixed bands would leave small maps without mine sites. The player may put a relic anywhere; the bands are the generator's promise. | M7 |
| D76 | Obstacle with payoff (§9.4) as built: ruins on a plateau (River Valley, Highlands, Delta): a disc of radius 4 (5 from 128²) exactly 2 levels above the highest ground round it, a cliff all round, 35–70% of the way from the start to the farthest ground it walks on, with a ruin field on top. One flight of player stairs reaches it, and no derived slope does. The thorn-barred valley is the thorn belts (§5.4). The one-stair rule holds by construction and is a contract test (`tests/contract/objects.test.ts`), not a validation check. The ridge worth tunnelling waits for M9's premises. | A region-graph check for "reachable with one stair" belongs with the premises that need it; the builder already guarantees the geometry. | M7 |
| D77 | The second district site (§9.8) as built: a set piece that marks a site and changes no terrain, 60–120 tiles from the start's middle, on 600+ tiles of level land, with clean water a pump reaches within 16 tiles; the derived slopes join it to the start's network, and the generator plants 48 trees and 24 berry bushes within 20 tiles of it. It has no dam site or basin of its own. Maps of 128² and up, where such a site exists: of 20 maps at 128², Delta 20, Lake Basin 13, River Valley 8, Highlands 7, Islands 7, Canyon 0; of 10 at 192², Delta and Lake Basin 10, Islands 9, River Valley and Highlands 6, Canyon 3. It is also where a second colony could start on a Timber Together map (D5). | Forcing a site where none fits would bend the layout, and a site the rules don't allow would mislead. The dam site near it comes with the premise "a second valley beyond the ridge" (M9). Decisions-pending #25. | M7; pending Kyler |
| D78 | Editor resources (EDITOR_PLAN §4) as built: forests, berry patches and ruin fields are drawn as areas (drag a rectangle or click the corners) and planned first. The preview shows where plants live (moist, clean soil, not water or objects), where trees would stand dead (with **Only where trees live** off) and what stays bare; the placed trees are exactly the preview's. A ruin area becomes fields of the calibrated shape (§9.7): one level each, 10+ columns, the official size factors, 5% holes, a one-tile moat, at least 30% of its box filled; free tiles only, off the start's zone. Resources placed earlier keep their tiles (berries, then forests, then ruins). M4's rectangle features are still accepted by the engine. | "Forests show where they'll survive" (EDITOR_PLAN §4) and the M7 acceptance (moisture reach and the calibrated clustering). A blob squeezed along a narrow ledge is not a field. | M7 |
| D79 | Editor map objects and advanced mode as built: mine sites, relics and geothermal fields (Resources), thorn belts (Land), weirs, plugs and the plugged spillway (Water). Every object shows its footprint under the pointer before the click, green or red with the reason, from the same rule that refuses the click (D69); `placeEntity` and `moveEntity` refuse what the game's loader would delete ("it can't stand there: …"). **Advanced** adds unstable cores and **Object** (the common templates by hand), and a click on the map opens the objects on that tile: move by a tile, turn, delete, a water source's strength (up to 8 per tile it covers), **Turns on later** (TimeActivatedComponent on, cycle and day, 10.5 days by default; CurrentStrength 0 while it waits, as official maps store it), and a core's radius and countdown. In advanced mode a click opens objects instead of selecting features. Brushes, locks and overlays come with their milestones. | EDITOR_PLAN §4 and the M7 acceptance "invalid placements are previewed and refused". The inspector changes an object in place with `setEntityProps`, so an edit survives regeneration like any entity edit (D38). | M7 |
| D80 | The badwater toggle as built: **Make it badwater** in a river's inspector, for rivers that enter at a map edge. Its mouth is split into groups of 3 edge tiles whose 3×3 inland is level, each a BadwaterSource of the river's flow ÷ groups (at most 72, 8 per tile); the mouth's other tiles keep a WaterSource of strength 0 to seal it (§7.6). The preview comes first, with its warnings: beavers can't drink it; the soil along it is contaminated and its trees and bushes die; the start is beside it (when it is within 24 tiles). A spring's badwater stays the Badwater spring tool (M5). | "Switching it on warns that the river will stop moistening the soil and that forests along it will die" (EDITOR_PLAN §4). A BadwaterSource is 3×3, so a mouth under 3 wide, or not level, is refused with the reason. | M7 |
| D81 | The settings panel (§14.1) as built in M7: Highlands, Delta and Islands are on the theme strip; Braided is offered in River style; Hazards gains **Thorn belts** and, under Advanced, **Unstable cores**; Resources gains **Relics**, **Geothermal fields** and **Mine sites**, each with its band from the official maps. Counts: thorn belts 1–3; cores 1–4, radius 2–3, countdown in cycle 5–12, 10.5 days in; relics 1–3 small, 1–2 medium from 128² (0–1 below), one large from 192²; geothermal fields 1 / 2 / 3 (under 128², from 128², from 192²); mine sites as set. `tools/settings-suite.ts` adds an experiment for each (thorns, cores, relics, geothermal, mine sites, braided); all move their target. Updates D66. | Their objects arrived in M7 (decisions-pending #20). | M7 |
| D82 | Generator 0.5.0: every map changes (the map objects, the resources planted round them, the second district, the obstacles, the new themes, weirs and spillways). A share link made with 0.4.0 opens with a note that the map may differ. | PLAN §19.7: a version bump whenever generated bytes change. | M7 |
| D83 | Islands' canonical settle is over the §10 budget: a median 0.92 s at 128² (budget 0.6 s) and 3.7 s at 256² (budget 3 s); a whole Islands map generates in a median 1.35 s at 128² and 5.3 s at 256² in Node. The other themes are within the budget: at 256² their settle takes a median 0.3–1.7 s (Lake Basin 1.7 s, down from 3.0 s in D68) and their generation 2.3–4.2 s; at 128² every theme but Islands generates in under 0.9 s. Accepted for M7; CI's settle gate stays on River Valley. | The sea rises by its outlets' head over a fifth to a half of the map: 1,150–2,200 ticks, each over many wet tiles. The faster options are D68's: a pre-fill that adds the outlets' head (shared with the Python oracle), or M8's warm-started preview; both change every Islands map. Decisions-pending #27. | M7; pending Kyler |
| D84 | **M12 handles compound, vague requests**, such as "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." Claude breaks such a request into bounded operations, and the engine tells it whether each idea is feasible. EDITOR_PLAN §7 gains: (1) places measured along a river's flow: upstream and downstream of something, a position along the course from its source ("halfway down" 0.4–0.6 by default), the start's bank and the opposite bank, and "this valley" (the selected feature's valley, otherwise the main river's), always resolved from the river's actual flow, never from the compass; (2) a judgement-word table (harsher/easier, huge/small dam opportunity, dangerous/safe badwater, lush/dry and the others the suite needs), each word with measured targets from `tools/settings-suite.ts` and the analysis metrics, a direction, and a size relative to the map's current value and the official range, with playability checks as guards that are never traded away; (3) compound requests: goals with their own expectations, settings changes and regeneration before placements, regeneration keeping Claude's features, every goal checked on the combined preview, interfering goals detected, the reason and the nearest feasible alternative returned for a goal that isn't feasible (offered in the report, never substituted silently), and a report naming every trade-off and every goal not met. EDITOR_PLAN §9's suite gains that request on 128² and 256², the same on a drawn river and a Delta map, an impossible request (a huge dam opportunity on 48²) and a conflicting one ("put a badwater spring just upstream of the start"). M9 builds the place vocabulary and the word table, because names and descriptions need them too, with the resolver tested on rivers flowing in every direction; M12 reuses both, and its acceptance adds the compound, impossible and conflicting requests. | The builders, limits, `dry_run` and intent checks cover single requests only. Every theme flows west to east today (D67), so "upstream = west" would pass every test and still be wrong for drawn rivers and for M7's Delta. | Kyler, 2026-09-24; the loop's budget for compound requests is pending (decisions-pending #28) |
| D85 | **Start requirements**, built at the start of M8 and released with `m8-done` (§5.6, §11.4); amended by Kyler the same day, before the workshop plan was adopted. Three requirements, with thresholds by difficulty (Easy / Normal / Hard), replace the start rules as reasons to reject a map: (1) water without stairs: clean pumpable water (depth ≥ 0.3, contamination < 0.05) touches a shore tile at the start's own level within 12 / 20 / 28 tiles' walk of the start without any slope, and a pump on that shore reaches the surface (0–2 levels below); rivers, lakes and ponds count; (2) at least 60 / 40 / 20 living trees within 20 tiles' walk, slopes allowed, across any number of groves; (3) at least 40 / 30 / 20 living berry bushes within 20 tiles' walk, slopes allowed, across any number of patches. "Living" means the plant survives at steady state. The thresholds are player settings with these defaults: the water-distance start rule (`sw`), and the trees and bushes controls renamed **Minimum starting trees** (`st`) and **Minimum starting bushes** (`sb`), keeping their ranges and share-link keys; changing Designed for resets them (D66 as before); imported maps use their difficulty's defaults. The generator never aims below a minimum, and a lower target rises to it (Easy's Berries near start, 20 → 40). The start reaches water on its own level: the bench moves to the bank, or the start onto the floodplain (changes D26), and batches stay ≥ 98% per theme under the new rules. The other start rules stop rejecting maps: the badwater and ruin distances, stored drought water near the start (`water.reservoir`, Hard's 3-deep rule included) and walkable land (`start.reach`); they stay settings and generation targets, the generator still aims for them, their controls and keys keep working, and the map card shows an advisory warning when a map misses one. The badwater distance defaults become 30 / 15 / 8 (the workshop study's W4), as targets with an advisory warning that never reject a map; the range widens to 8–60. Unchanged: the load checks the game needs (the start's footprint on flat ground, a free entrance, exactly one start) and the water checks that aren't about the start (settling, outflow, badwater containment). `start.dry`, which Kyler did not name, keeps rejecting (water on the start is a broken start); to confirm with Kyler. Build rules: both validators (TypeScript and the Python oracle) change together, with 0 disagreements; a unit test for each requirement (water reachable only by a slope, or beyond the walking distance, fails; only badwater fails; trees or bushes below the minimum, or too far away, fail; changing any of the three settings moves the result); the three settings in `tools/settings-suite.ts` with a measured target; the editor's start indicators, its green or red footprint and the map card follow the three requirements with the map's settings; the generator version goes up, and old share links change; batch pass rates are reported per theme at the defaults. | Kyler's decisions, not pending ones: the three requirements and their thresholds by difficulty (the water distances are the workshop study's), the thresholds as player settings, the generator never aiming below a minimum, the start reaching water on its own level, the badwater distances 30 / 15 / 8, and demoting stored drought water, walkable land and the badwater and ruin distances to warnings. They were recorded before the workshop plan was adopted, so its conflicts resolve toward them. The study found no water on the start's level on 82 of 180 generated maps at 128², because D26's bench stands a level above the floodplain. | Kyler, 2026-09-24 (amended the same day); amended by D153 (start water over natural slopes); trees requirement amended by D164 (starting wood) |
| D86 | **Map look**, a step after M8 and before M9 (ROADMAP). The 3D view looks much closer to Timberborn in game, while every map meaning stays readable: ground tops coloured by moisture as in game (moist green, dry sandy, contaminated soil with its own look), with a toggle back to height colours; height as layered bands per level on the block walls; baked ambient occlusion and soft sun shadows; warmer colour grading and light depth haze; water coloured and faded by depth, with a gently moving surface, foam on falls and shorelines, and badwater as dark murky water; our own models: trees by species with dead trees clearly dead, berry bushes, scrap-heap ruins and a district center of our own design; a default camera closer to the game's. **It changes the 3D view's colour meaning from height to moisture, approved by Kyler** (updates D45). It changes no map files: `src/core/render/shade.ts` (the 2D preview and the thumbnail) stays as it is, and every sha256 stays equal. Rules: none of the game's models, textures or art (textures are generated in the shader, so the artifact edition needs no image files); the M4 budgets hold (D46), Beavertopia included; every meaning is checked in greyscale and under colour-blindness simulation; the 2D preview keeps its height colours; the legend and hover text say what the colours mean; the 3D chunk stays lazy-loaded, with its size reported. Released inside the M9 release, or tagged `map-look-done` and released like a milestone (CLAUDE.md). | Kyler's screenshot of the current 3D view is hard to read: the ground is coloured by height, while the game colours it by moisture; there are no shadows or ambient occlusion; water is flat, and badwater in its open ditch looks like a brown dirt ramp; ruins are grey pillars, and the district center is a small box. | Kyler, 2026-09-24; **amended by D135** (a clean default look and an information layer) |
| D87 | **The workshop study's integration plan is adopted** (`investigation/WORKSHOP-INTEGRATION.md`, PR #4). Each item is built in the milestone it names (ROADMAP, marked "from the workshop study"). **Adopted:** start of M8: the study's start measurements, which Kyler's amended start requirements use (D85); M8: imports whose water a steady state cannot show report their water and start checks as approximate (W6, #36), and set pieces and lakes that reshape the ground clear or move the map objects on it; M9: at least three premises per theme (§8), 8 flow directions (D67), Variety `vy` with Surprise me (W2, #32), no clones (§7.9), the 12-component score (W5, #35; §12), the catalogue's names (§13), the settings bands (§5.8), the premise's water budget for `water.no_flood` (W3, #33), the relief and terracing presets (W7 in part, #37), and the `spiral`, `cone`, `mesaField` and sealed `sea` builders (§9.11); M10: the naturalize brush meets the naturalness targets; M11: built-in stamps from the catalogue and the `riverFork`, lake `outlets` and river `switchback` builders; refinement phase: the natural-containment targets and the dam site's spurs mode; design pass: Variety and Surprise me in the panel, the premise and its landmark on the map card; M12: the catalogue as Claude's vocabulary (ten suite requests); M13: ratings of fun and unique (1–5), in the shape `fit-score.ts` reads (§2.3); Later: the study's numbers for caves, terrain above 16, flood challenges and 1.0 objects. **Changed:** the study's start-rule acceptance (8 of 11 official starts pass its thresholds) becomes a report of how many of the 11 meet D85's requirements; the naturalness targets it gave Map look move to the refinement phase (#40); the parts that depend on Reservoir help (its panel control, its description clause, its M9 acceptance, the spurs mode's `help` and the "less obvious dam site" request's None) wait for #31. **Decided by Kyler** (D85, amended before this adoption): W4's badwater distances 30 / 15 / 8 (#34), and the start thresholds (#39): the study's water distances 12 / 20 / 28, Kyler's own tree and bush thresholds, and the bench reaching water on the start's level. **Kept as recorded, with the conflict pending:** Reservoir help and `water.storage_possible` (W1, #31; D25, D30, D58, D85); the Rugged level and Smooth terracing reaching 0.92 (W7, #37; D59); the naturalness targets in Map look (#40; D86). **Kept:** terrain at 16 or below (W8, #38; D4). **Rejected:** nothing else. | Kyler's direction in the study (2026-09-24): maps should diverge sharply and never look like clones, variety, novelty and verticality matter, reservoirs are the player's engineering, and an accessible water source stays a requirement. Kyler's instruction for adopting it: where it conflicts with a decision already recorded, keep the recorded decision and log the conflict as pending. | Kyler, 2026-09-24 (adoption); W1–W8 pending (#31–#38) except W4, decided by Kyler (D85); conflict #39 decided by Kyler (D85), #40 pending; the ratings and the fitted score **superseded by D137**; M13's rating form **dropped by D145** |
| D88 | **The Claude groundwork's M12 integration plan is adopted** (`investigation/claude/M12-INTEGRATION.md`, PR #5). M9 builds its vocabularies and M12 the rest (ROADMAP). **Adopted:** its ROADMAP text for M9 (river courses read from the actual flow, the place resolver, the judgement-word table with levers, targets and guards; the flow axes are also the workshop study's, D87) and for M12 (steps, tools, compound requests, the budget, the harness and prompts, the 120-request suite with reference solutions, a 90% pass rate with a key, the 64 KiB ceiling, and the compound request as a second in-game check); its decisions D-a to D-h as D89–D96; its EDITOR_PLAN §7 text (spatial language, judgement words, steps, loop, compound requests, other uses) and §9 suite; the files that move into `src/` and `tests/` and the `src/` changes M12 needs (ROADMAP M9 and M12). **Merged with D84** (Kyler's M12 update): where both say the same (flow-relative places, "halfway down" 40–60%, settings before placements, the nearest alternative offered, the compound request in the suite), one text is kept; D84's "this valley" (else the main river's valley) and its judgement-word sizes stand. **Settled by D84, not pending:** the groundwork's P1 (a goal not met as asked gets the nearest alternative offered, never built silently; a builder's reduction within tolerance is still built and reported, D92). **Merged into decisions-pending #28:** P2, the budget (D93). **Changed:** `lib/words.ts` checks only a target's direction, so M9 adds D84's sizes; D91's guards include the advisory start targets of D85; the Lake Basin reopen bug (its §8 item 4) was already fixed after M7 (9256161). **Kept as recorded, with the conflict pending:** P4, building a bent version of a request that breaks a start rule (#42: D84, D92); D-h's dam-site sizes (#46: D84); refusing a site on a map object (#47: D87). Pending with their defaults: P3 (#41), P5 (#43), P6 (#44), P7 (#45). | The groundwork played its 120 requests through the real engine: against dev at 5b17375, 106 of 120 reference solutions passed, and the failures came from M7's new maps and objects, not from the resolver or the tools. Its numbers come from a self-played pilot, not a model. | Kyler, 2026-09-24 (adoption); P3–P7 pending (#41–#45), conflicts #42, #46 and #47 |
| D89 | Claude proposes **steps**, not raw operations: 15 step kinds (`changeSettings`, `addSetPiece`, `changeSetPiece`, `changeFeature`, `addRiver`, `addLake`, `addLandform`, `addResource`, `removeResources`, `moveFeature`, `moveStart`, `deleteFeature`, `setRiverBadwater`, `sculpt`, `undoLast`), each with places and sizes in words or numbers, plus `addMapObject` and `addSetPiece` for M7's plugged spillway, obstacle with payoff and second district. The app expands each step into the engine's operations (D35's envelope, which the edit log keeps) with the same planners the editor's tools use (D47). At most 12 steps and 30% of the map per proposal. | EDITOR_PLAN §7 said Claude proposes "operations from section 3". Raw operations carry tile lists and plan records Claude cannot produce reliably, and would bypass the planners' checks. Steps keep every number the app's. | M12 plan (D88); pending Kyler (#41) |
| D90 | The app orders a proposal's steps: settings, deletions, the start, moves and changes, rivers, lakes and landforms, dam sites and gorges, falls and cliffs, badwater, sculpts, resources. It says so when the order differs from Claude's. It refines D84's rule: settings changes and regeneration first, then placements. | A settings change regenerates the map, so anything placed before it is placed on the old map; the start and the sites decide where hazards may go. | M12 plan (D88) |
| D91 | Guards: every check that passes before a proposal, and every start rule the validator applies, must pass after it. A proposal that breaks one is refused, naming the step that broke it. Rules that already failed are reported, not guarded. This covers D85's advisory start targets too: the generator may accept a map that misses one, but a proposal may not break one that passed. | EDITOR_PLAN §7 "Ambiguity" and "never make a map worse" (D3, decisions-pending #8); D84: playability checks are guards, never traded away. The rules are read from the validator at HEAD, so D85's start requirements need no change here. | M12 plan (D88) |
| D92 | A goal that cannot be met gets the nearest feasible alternative, **offered, not built**. The app builds it only when it is within the goal's tolerance: a builder's reduction from 20 to 19 wide is built and reported. | Silently substituting a different map for the one asked for is the failure the suite most needs to catch. It agrees with D84. | M12 plan (D88) |
| D93 | The loop's budget grows with the goals Claude declares in its first `dry_run` or `propose`: 3 rounds and 10 calls for one goal; +3 calls per further goal and +1 round per two; at most 6 rounds and 20 calls. It never shrinks, and every tool result carries the budget left. | EDITOR_PLAN §7's cap of 3 rounds and about 10 calls was set for one-goal requests. The ceiling is the artifact route's: a 17 KB prefix and six compound dry runs of about 7 KB fit in its 64 KiB. Proposed from a self-played pilot (`investigation/claude/pilot/PILOT.md`); M12's suite re-measures it. | M12 plan (D88); pending Kyler (#28, which records Kyler's other option too) |
| D94 | Judgement words ("harsher", "lush", "dangerous", …) change the map's settings, which regenerate the whole map; the player's own features stay. A word used about part of the map ("make this valley harsher") is applied map-wide and reported as map-wide. M11's regenerate-area comes before M12: if it can take settings for a region, M12 applies a regional word there. | Settings are map-wide today; a regional word needs `regenerateRegion`. | M12 plan (D88); pending Kyler (#43) |
| D95 | A settings change that moves the generated start is reported as a trade-off, with the new position. | A regenerated map places its start again (18 tiles away in one pilot request), and every distance to the start changes with it. | M12 plan (D88); pending Kyler (#44) |
| D96 | Size words follow the validator's and the builders' numbers: a giant waterfall is 30–40% of the side along its lip; a number means ±max(3, 15%) ("roughly 20" is 20 ±3). The groundwork also sized dam sites as multiples of the drought need `water.reservoir` uses (tiny 0.5×, small 1×, medium 1.5×, large 2.5×, huge 4×). That part conflicts with D84's judgement-word table, so D84's dam-opportunity sizes stand until Kyler answers. | One need everywhere: the summary, `limits`, `find_sites` and the check show the same number. | M12 plan (D88); the dam-site sizes pending Kyler (#46) |
| D97 | **The start reaches water on its own level: the bench runs to the bank** (D85; changes D26). The start keeps D26's place, 6–10 tiles from the channel's edge (fewer when the water rule is short: at most the rule less 4, at least 3), on its bench one level above the floodplain; the bench is its disc and a strip about 3 tiles wide from the start to a point on the river's course (`StartParams.bank`), stopping at the channel, so the start's own level touches the water about half a level below it. The point is the nearest one on a clean river whose bed lies 1–2 levels below the bench, sampled every half tile (`bankFor`): a bed step beside the start is passed by, and a strip that would pass water at the bench's level or above (a reach above a fall) is not taken. Where the drawn place has no bank, the start moves along the valley, up to 16 tiles, to the nearest place that has one (no farther from the gorge). Moving a start (a drag, the one-click fix) finds its bank again the same way, or drops it. Lake Basin and Islands need none: their shore bench is the lake's own shore. Near-start groves and berry patches grow within 20 tiles' walk first, in two passes (only beyond when the walk has too little moist land); where that land is short of 1.25 × both targets, the berries and groves share it by their minimums (1.1 × each). The obstacle's ruins keep the ruins target's distance from the start (D85: the generator still aims for its targets). | Kyler allowed either the bench to the bank or the start on the floodplain. On the floodplain a dam at the reservoir site (crest 2 above the bed, D25) would flood the district center; the bench one level up stays dry. The strip is the least change: first attempts at 128² went from 27–63% (Canyon, Highlands, the start rule alone) to 98–100% in every theme, and 94–100% at every size from 96² to 256² (100 seeds each; M7 had 69–100%). | M8 |
| D98 | **Approximate water on imports** (W6, decisions-pending #36) as built, in both validators: the study's causes (caves on 5%+ of tiles; sources that turn on later, or aquifers, carrying a quarter or more of the clean water; seeps half or more of the running water; the start under a roof) make the water and start checks approximate only with evidence that the settle cannot stand for the map's own water: it floods more of the start's ring (Chebyshev 2) than the map's water does, or its wet tiles differ from the map's on 10% or more of the map. A start under a roof needs no evidence. An approximate check passes, keeps its numbers and says why (`CheckResult.approximate`); the oracle compares it as its own verdict. Flagged: Hollows (caves 13%), Pressure (caves 5%), Oasis (aquifers, seeps) and Nomads (sources that turn on later). **Not flagged, against the acceptance's list: Beaverome.** Its water matches its own within 1% of the map, none of it within 56 tiles of the start, and no cause applies: its `start.dry` fails because its lake stands 0.7 below the start within two tiles, which is how the map was made (the study counted it because its start was not measurable). Spillage, Pillars and HelixMountain have the seep cause, but the settle models seeps (they stop at 0.8 deep) and keeps their starts dry and their water within 7% of their own, so they are unchanged. | The causes alone flag Spillage, Pillars and HelixMountain and miss Beaverome: neither matches "the 5 maps our steady state cannot show". Official maps without a cause differ from their own water by at most 9% (Craters); the four flagged ones by 15–50%, and on all four the settle floods the start. Whether `start.dry` should count only water that stands on the start's level or above, which would let Beaverome's lakeside start pass, is decisions-pending #48. | M8; Beaverome decided by Kyler (D107); the cave cause **retires in 3D-a** (D120) |
| D99 | **The editor's water** (EDITOR_PLAN §6) as built. After an edit that moves water the rebuild warm-starts (`sim/preview.ts`): the previous settled water and its outflows stay on every tile whose ground, water objects and 2-tile neighbourhood the edit left alone, the canonical pre-fill goes on the rest, and the exact simulation runs until, checked every 64 ticks, the volume changes by under 0.2% and at most 0.05% of the map moves by more than 0.05, for at most one game day. Moisture and the plants on it follow the preview's water. In the background, 0.7 s after the last edit and dropped when a newer one arrives, the worker runs the canonical settle in slices of 16 ticks (`SettleRun`: the same ticks and checks as the one-go settle, so the same bytes), puts it in place of the preview's water and runs every check; the health pill shows its progress. Export settles canonically first, with progress in the dialog: a file never gets the preview's water (§19.7). Imported maps get their water and colony checks too (decisions-pending #9); an unedited import is settled once for its checks and its own problems (D43). Measured at 256² (seed 1): local edits (ground lowered beside water, a 9×9 lake, a weir, a standalone fall, a grove removed) take at most 1.76 s in Node in every theme (generator 0.6.0), and 1.4–1.7 s in Chrome on Islands and Lake Basin, the slowest water (D83); the canonical settle follows in 0.5–5.4 s. The preview's water is within 0.2 deep of the canonical settle's on every tile. | The canonical settle alone takes 3.7–5 s on a 256² Islands map, over the 2 s the roadmap asks for a local edit. The canonical settle's own test passes almost at once after a local edit (0.5% of a 256² map is 327 tiles), and a counted move of 0.005 never ends on a lake or sea, whose level drifts by thousandths for a long time after an edit reaches it. | M8 |
| D100 | **Water under roofs** (EDITOR_PLAN §6; replaces D40's "maps with caves keep the file's water until M8"). On an imported map with caves or overhangs, the tiles under roofs (columns that are not one run from the ground up) keep the file's own water, outflows, moisture, contamination and evaporation, every slot, in the view and in the export; every other tile gets the settled water of the heightfield. A notice says so when the map opens, and **Show → Water under roofs** marks the tiles. The roofed columns are left as they are by every tool (D40), so they are not simulated again after an edit nearby. | The heightfield model cannot simulate water under a roof (D28), and keeping the whole file's water after an edit left the edit's own water out of the view and the export. | M8; **superseded by D120** in 3D-a, except that an unedited import still exports byte for byte |
| D101 | **The editor's water layers** (EDITOR_PLAN §4 overlays): **Show** in every tab offers **Soil moisture** (three greens by moisture), **Badwater** (badwater and the soil it spoils), **Drought** (the analytic drought of §10 over the map's drought days: blue water kept, orange water that dries up, with the totals) and, on imports, **Water under roofs**. They read the map's water as it stands (the preview's until the background check has settled it, which the legend says); an unedited import's come from the background check's settle. | M8 delivers the moisture and badwater overlays and the analytic drought view; one menu keeps them out of the tools' way. | M8; **extended by D133** (the Weather view) |
| D102 | **Objects on reshaped ground** (D87; decisions-pending #47's default): set pieces, lakes, landforms, rivers and moves that change the ground plan the map objects on it too. A single object whose ground stays level stands on the new ground (the report says it moves); one on uneven ground, in a river's channel or in the new feature's body is cleared (`deleteFeature`, or `deleteEntities` for an import's own objects and objects placed by hand), and the report says which and why. Lines (thorn belts, weirs, plugs) stand on each tile's ground. A property test places standalone waterfalls, lakes and landforms beside every kind of object on River Valley, Lake Basin and Highlands maps: no object is left floating. | EDITOR_PLAN §3's rule for trees, ruins and bushes, for objects. The planners still try sites off objects first. | M8; #47 pending Kyler |
| D103 | **Generated outlines past the map** (decisions-pending #30) as built: a generated landform's or lake's outline may reach one map side past each edge, and can be changed, moved (the handle stops a map side out) and locked; an unedited map's bytes do not change. Outlines the player draws stay on the map's tiles: to their outer edges at most (−0.5 to W − 0.5), which is what the drawing tools make of a rectangle over the edge tiles (the checker had refused them at 0). | Lake Basin's terrace rings and highlands reach past the map, and project files already store them. | M8 |
| D104 | **The start requirements' details** (D85) as built, in both validators. Water without stairs measures the walk to the shore tile (Kyler's words), one less than the study's walk to the water tile. Living means not dead and on soil where it survives at steady state (moist, dry-footed, clean). Starting trees counts Pine, Birch and Oak (a Succulent yields water, not logs); starting bushes counts BlueberryBush. Walks are bounded at 64 tiles. `start.reach_water` is folded into `start.water` and gone. The panel names the settings **Water without stairs (tiles)**, **Minimum starting trees** and **Minimum starting bushes**; the map card lists the three with their numbers; the Badwater distance slider starts at 8. Of the 11 official starts the study could measure, 5 meet all three at Normal (Canyon, Craters, Lakes, MountainRange, ThousandIslands): the water 8, the trees 8, the bushes 8. | The study's numbers stand behind Kyler's thresholds; measuring to the shore follows Kyler's definition. | M8 |
| D105 | **The editor's start indicators** (EDITOR_PLAN §4, D85): while the start moves, the page runs the validator's walks on the ground as it would be (the bench's disc and its strip to the bank at the bench's level) and counts trees and bushes that are not dead; the footprint is green only where the district center fits and all three requirements hold, with the map's own settings; the badwater and ruin distances and the walkable land show as warnings. Stored water waits for the health check after the move. | The indicators must keep within a frame while dragging; the soil under each plant after the move is the validator's to judge. | M8 |
| D106 | **Generator 0.6.0**: every map changes (the start's bench to the bank, the new difficulty defaults, the near-start resources). A share link made with 0.5.0 opens with the note that the map may differ. | PLAN §19.7: a version bump whenever generated bytes change. | M8 |
| D107 | **Beaverome is off M8's approximate-water list** (decisions-pending #48). M8's acceptance names four maps: Hollows, Pressure, Oasis and Nomads. `start.dry` stays as built for now. Whether it should count only water standing at or above the start's ground (so a lakeside start like Beaverome's passes) is a Refinement item, decided after measuring how many official, workshop and generated starts it changes. | Beaverome's water is modelled correctly and none of the approximate causes applies to it. | Kyler, 2026-09-25; confirmed by D145 (measure first; 3D-a applies the floor rule only under roofs) |
| D108 | **Product principle: maps are created, not copied** (see Product principles). Dam Good Maps creates maps. It never approximates existing maps, and it never produces a few archetypes with a little noise. That would make the product useless. Its maps come from generative processes and composition, inspired by real landscapes, Timberborn's mechanics and good play design. Two maps must play differently, not only look different: a different place to settle, a different first dam, a different way through the first drought, different threats, different paths outward, and something to discover. Workshop and official maps are evidence of what's playable and of Kyler's taste, never a template. | Kyler: a generator that approximates existing maps, or makes a few archetypes with a little noise, would make the product useless. | Kyler, 2026-09-25; binds M9 and every later milestone |
| D109 | **An M9 design step comes before M9** (ROADMAP M9). Instead of building M9 as written: a design (`docs/m9-design.md`) for a generator that invents by composition and emergence; measures against clones, archetypes, same-feeling openings and approximation of workshop maps (200 seeds per theme at 128²); a prototype under `investigation/generative/` with no `src/` changes (3+ themes, 30+ seeds each); and a blind local rating page of 40 prototype maps with a "how it plays" card each. The design is approved only when Kyler's Unique median for these maps is at least his Unique median for the workshop maps (`C:\dgm-workshop\ratings.json`). M9, M10 and M11 wait for his approval. The named premises become at most a few recipes inside the system; interest is judged intrinsically, never by similarity to workshop maps; the workshop's bands are a sanity range for playability that Variety may exceed where the checks pass. Every guard stays (batches ≥ 98% per theme and size, determinism, both validators, budgets, reproducible share links). | D108. | Kyler, 2026-09-25; **superseded by D112 (its gate)** (Kyler, 2026-09-25) |
| D110 | **Map look as built** (D86), tuned to Kyler's in-game reference screenshots (ML-1, local only). **Kyler's correction (2026-09-25):** dry ground is cracked earth, a warm grey-brown with a faint violet cast in shadow and visible cracks, not sandy (ROADMAP Map look, Delivers 1); the screenshots also set contaminated soil (rusty red-brown cracked earth with glowing orange cracks), badwater (murky red-brown water that blends into clean water where they meet), moist ground (vivid yellow-green grass whose edge bleeds onto the earth in patches), walls (dark charcoal-green cobbled stone), water (teal to navy, glints, see-through near the shore, pale ripples), the light (strong soft shadows, dark corners at the foot of walls, a blue-grey haze far off) and the objects (below). **Ground:** each top shows its soil, blended between tiles of one height (never over a cliff), every tile's middle its own; a dark bed under water. **Height colours**, a button on the view that the browser remembers, shows the old height ramp instead. **Walls:** cobbles of dark stone, a groove and a change of shade between levels (a little lighter higher up), and a lip of the top's ground; no tile grid on walls or tops. **Light:** a warm sun from the north-west, 50° up (the 2D preview's hillshade direction), and a cool sky light. Baked when the mesh is built and again when the ground or the objects change (`render3d/light.ts`): how much sky each tile sees (the ground within 5 tiles in 8 directions), and soft sun shadows from two sweeps with the sun 6° higher and lower, cast by the ground, trees, ruins and the start. The shader adds contact shadows at the foot of higher neighbours; shadows keep about half the light. Then the haze beyond the point looked at (none from straight above) and a warm grade. **Water:** colour and opacity by depth, each top's corners sharing depth and badwater with the tiles round them (so water thins toward the shore and badwater blends into clean water); ripples, pale streaks and small glints that move, at up to 30 frames a second, and hold still when the viewer prefers reduced motion, when the browser renders in software, and when the view is hidden. A foam line along shores; white water down each fall, drawn from the upper water to the lower in front of the cliff, and below it. Badwater: murky red-brown with slow glowing veins. **Models**, our own: pine (dark cones), birch (white trunk), oak and succulent, dead ones bare pale wood; berry bushes dark green with blue flowers; ruins as rusty scaffold storeys with beige panels, one per level of their height, with ivy where the ground is moist; badwater sources a brown swirl in a dark pit; mine sites a square pit in an orange frame; the district center a timber lodge with a banner on a deck, its door toward the entrance, a lit post on the entrance tile; slopes with two chevrons pointing uphill. **Camera:** the default is the game's angle (30° east of north, 70° down, from the game's camera settings), over the whole map. **No image files:** the patterns (value noise, the cracks, the cobbles) are drawn once by a shader into a small tiling texture when the view starts; reading it costs far less than computing them per pixel. **Software rendering:** where the browser draws WebGL in software (no GPU, CI), the view drops multisampling, the patterns, the shadows and the soil's blending, uses models of a few triangles (dead trees still bare), and the water holds still; it draws faster there than before Map look. **Readability:** the hover text names the soil (moist, dry, contaminated); the legend lists what each colour means; the generator's 3D preview marks the best dam site, as the 2D preview does; an imported map shows the soil its file stores (each tile's top slot), as it shows the file's water. The view's soil comes from the worker with the water, so it follows both of an edit's water updates (M8). | Kyler's list in D86, and his reference for how the game looks; the rest are the look's details. The sun keeps the 2D preview's direction. The game frames the district center at its default angle; a map maker needs the whole map first (decisions-pending #49). Per-pixel noise doubled the terrain's cost on the integrated GPU. | Kyler, 2026-09-25 (the correction); Map look; dry ground's colour **replaced by D135** (a cool grey-brown) |
| D111 | **No built dam walls** (Kyler, 2026-09-25). The dam-site ridge goes away completely: no official map has a wall built across a valley, and a stamped, spoon-fed dam is awful. The generator never builds a dam-site ridge, in any theme, difficulty or setting; there is no "Ready" option. Dam opportunities exist only where the terrain makes them: natural narrows, gorges and basin outlets that the generative processes form; the generator never adds terrain to create one. Reservoir help, if kept at all, only steers what the generator looks for (for example, on Easy, prefer layouts whose terrain naturally offers a good narrows near the start); it never builds one; default: no help on Normal and Hard; the M9 design decides whether the setting is worth keeping. `water.storage_possible` replaces `water.reservoir`, as the workshop study defines it; accessible clean water stays a hard start requirement (D85). The editor's **Dam site** tool never builds a straight ridge: the M9 design proposes either a natural narrows (hillside spurs of uneven thickness and height) or removing the tool. M9's acceptance gains zero built dam walls on every theme, size, difficulty and setting, with a check that catches ridge-like walls (a straight wall across a valley with a gap for the river). Supersedes D25, D30 and D58, and every premise or rule built on the ridge (Hard's 3-deep reservoir layout; the River Valley and Canyon dam sites as built); settles decisions-pending #31 (W1). | Kyler: no official map has a built wall across a valley; the ridge is stamped and spoon-fed. | Kyler, 2026-09-25; built from M9a; extended to map edges by D151 |
| D112 | **The M9 design's gate, a second design round, the M9a play test and permanent checks** (Kyler, 2026-09-25; supersedes D109's gate). (1) The gate for the design: the objective measures pass (no built dam walls, no clones, no archetypes, play variety within its targets, natural dam sites near the start at a rate comparable to the official maps, and batch pass rates); simulated play shows that prototypes play differently (each prototype's weather-cycle behaviour from `investigation/cycles` and its position on the strategy axes from `investigation/mechanics`); and a one-page brief for each of 10 prototype maps (terrain, a "how it plays" card, its cycle timeline, its position on the strategy axes). Kyler approves the direction from these briefs and the measures; the 10 maps are also exported as `.timber` files in `investigation/generative/out/`. The blind rating page is optional and decides nothing. (2) A second design round: after design version 1, fold in the three Codex investigations (`investigation/cycles`, `investigation/landscapes`, `investigation/mechanics`, when their PRs are ready) and produce design version 2, with new prototypes, measures and briefs. Kyler approves version 2, not version 1. (3) M9a, the first build stage, must pass Kyler's play test of at least two of its maps before it's released publicly, and before any public beta. (4) The principle is permanent: CI checks run on every milestone after M9: no built dam walls, no clones, no archetypes, no approximation of workshop maps, and play variety within its targets (part of M9's acceptance; ROADMAP M9). | Kyler: judging maps from pictures is too arbitrary, and the play test belongs to the first build stage. | Kyler, 2026-09-25; **(3) amended by D116** (a DGM Probe batch replaces Kyler's play test); under D115, (1)'s measures are information for Kyler's judgement and (4)'s checks are reported as information, the dam-wall check still blocking; the no-approximation measure corrected by D128 |
| D113 | **Frame pass** (ROADMAP, after the M9 build and before M10). It follows the impeccable-app-flow skill in redesign mode, scoped to the frame zone; this overrides the flow's gate, which waits for M11. The full design pass after M11 stays, and continues in update mode from the records this step creates. Released as `frame-pass-done`, like a milestone. | Kyler: Dam Good Maps should catch the eye as soon as its new generator exists, for sharing with testers, without redesigning an interface that M10 and M11 are still adding to. | Kyler, 2026-09-25 |
| D114 | **Map look: the review's fix round** (the independent review of the captures failed on ten findings, 2026-09-25; D110 stands otherwise). Every map meaning reads in colour, in greyscale and in the three colour-blindness simulations, never by colour alone. **Lightness:** from light to dark, dead trees (nearly white), moist ground (a lighter grass), clean water (lighter: light teal to blue), dry ground (a darker warm grey-brown), contaminated ground, badwater (red-black); living trees dark. Shadows keep about four fifths of the light (about half before), with a violet cast; the haze is lighter (0.16). **Dead trees** are ashen: a nearly white trunk, a pale grey body of bare wood and spiky bare branches poking out of it (the thin bare trees before could not be seen from afar). **Minimum sizes:** dead trees, the slopes' arrows and the start grow from afar in the object shader, when a unit of the model would take fewer than 16, 30 and 14 pixels (up to 4, 5 and 3 times), so a dead forest, a slope's direction and the start read in a view of the whole map. The legend says so. Birch crowns are darker, so living trees are dark against the grass. **Ruins:** solid rusty storeys with dark corner posts, a dark rim and beige panels, one per level: blocks from afar, never bare sticks (Kyler's reference had open scaffolds). **The start:** pale walls, a dark roof and a pale deck, a yellow banner. **Slopes:** the ramp, and pale arrows rimmed dark that point uphill. **Dam sites:** an overlay tile with alpha 255 is hatched: stripes in its colour (yellow) and near-black, solid light where a stripe would be under two pixels, a dark rim just outside, and the light line a pixel wider at small scales; the editor's dam sites and the preview's best dam site use it (no longer orange, which geothermal fields and mine sites use). **Water:** badwater keeps the ripples and reflections of water, with slow glowing bubbles, a thin shore line and little foam; water mixed with badwater is streaked with it, the streaks covering about the bad share; falls are a see-through veil of streaks; shallow water is more opaque. **Walls:** lighter grey-green stone in faint cobbles (no dark mortar lines), every other level 0.74 as light, a pale ledge at the top of each level over a dark groove at the foot of the next, each at least a pixel wide. **Floors under an overhang** (Beavertopia's slabs) show the top's soil, never its water, in shade. Where the browser draws in software (the light look, D110), a dead tree is a pale trunk, a bleached body and one branch, nothing grows from afar, and a dam site is plain yellow. **Legend:** every meaning the view draws, with small pictures: the ground, water, badwater, water mixed with badwater, walls, dead and living trees, the start, slopes and their direction, ruins, mine sites, water and badwater sources, geothermal fields, other objects, and dam sites where shown; its swatches differ in greyscale. **Captures:** the examples come from what the view draws (its heights, the water on each tile's top, the soil of each tile's top, its objects), at the visible point, each checked by picking; the first listing read every soil slot of Beavertopia's file, so contamination under a dry top (a badwater tunnel) counted as contaminated ground. The view's top-slot soil was right. | The review's findings. Where readability and Kyler's reference conflict, readability wins (the Map look rule): lighter walls, lighter shadows, solid ruins, objects that grow from afar. The fix costs about 1 ms of GPU time per frame on the integrated GPU for Beavertopia (A/B on one machine); the budgets hold. | Map look fix round; its marks and enlarged objects **move to the information layer** (D135); its mixed-water point amended by D177, its ruins point by D178 |
| D115 | **Kyler's one rule: the lighter process** (final version, 2026-09-25; it applies to every step). Acceptance criteria cover only what a player would notice or what would break. Only three kinds of thing block: (1) **breakage**: maps failing in the game, files or share links changing, lost edits, crashes; (2) **principles Kyler has already decided**: no built dam walls (D111) stays a blocking check, and so, from D118, do the 3D support rule (0 dropped voxels) and nothing stamped; (3) **what a player feels**: the page never freezes, and a first result appears quickly while the rest streams in. Measures and numeric budgets are information only; the 3D speed benchmark on the integrated GPU with a slowed CPU (D46) is information only, run only when something 3D-heavy changes. No more blind review rounds: for anything visual, Kyler is shown captures and decides. Claude stops and asks Kyler only for real decisions or real breakage; otherwise it keeps building, and logs everything else in `docs/STATUS.md`. Default to building and showing the result, not measuring it. ROADMAP applies it to every step's acceptance, marking **Blocking** and **Information**: the M9 design gate's measures are information for Kyler's decision (Kyler approves version 2 by judgement; the no-dam-wall check still blocks); M9a's 256² time is information, covered by "show progress, never feel stalled"; the Frame pass's Lighthouse score and 3D budgets are information; the Weather view's 256² timeline budget is replaced by "the first key days appear quickly, never feels stalled" (D133); M10's EDITOR_PLAN §9 budgets and M13's Lighthouse score are information; the permanent checks after M9 (D112 (4)) are reported on every milestone as information, apart from the dam-wall check, which blocks. **Map look's second fix round** (the second independent review failed narrowly, 2026-09-25). D114 stands, but for these. **Badwater meeting clean water** has its own pose, **meets**, on the maps where badwater flows into clean water (River Valley 4242 at 256², Beavertopia); every map gets a **cliff** pose, from in front of its tallest dry cliff; the before captures of both are made on `m8-done`'s code with the same tool. **Water partly bad:** each water top shows its own tile's badwater share (not the mean of the tiles round each corner): murkier than clean water all over, by the share (a cue in lightness at any share), and streaked with badwater as densely as it is bad, in a fine pattern; never all of it, so a partly bad tile never looks pure. **Clean water** is lighter (light teal to a mid blue), so at any depth it sits between dry ground and moist ground in lightness; dry ground is a little darker. **Slopes:** a level arrow, pale on a larger dark one, floats just above the slope's top and points uphill, so it reads from any camera angle and above any dam site's marker; from afar it grows (to 25 pixels per unit, up to 6 times) and rises over the trees. **Also:** dead trees grow at most 2.5 times (they covered water and arrows); a dam site's rim is a pixel from afar; a fall is a see-through veil of streaks for badwater too, with no sky reflection on it, and white water only where it comes down; badwater has brownish flow streaks and foam at its steps, so a badwater channel reads as flowing; ruins are grey-brown metal with rusty posts, apart from rusty contaminated ground; the legend says dam sites are drawn wider from afar. **`captures.md`** lists only dry walls three levels or more that face the camera, that the view shows first, with at least 6 pixels a level, and says where a pose has none (a view of the whole map shows levels as the steps of terraces: 1 to 4 pixels each); no example sits under a dam site's marker, under the start as drawn, or in the far haze. **The light look** (software rendering) bakes all of a model's objects into one mesh, drawn once: SwiftShader paid for each object it drew (a 256² map's frame took 30 ms here, 10 ms now), and the light dead trees are a trunk and a body, 6 triangles. | The one rule is Kyler's final version of the note that first came with this fix round (no more blind reviews, Kyler judges the look from the captures, the 3D benchmark is information only); it also settles how the gates and the lighter process fit together. The fix round: the second review's findings, and CI's thin margin for the software-rendered orbit (5–6 frames a second against more than 5 frames in 1.5 s; it failed once on PRs #11 and #12). | Kyler's decision, 2026-09-25 (the one rule); Map look, third round (the fix round); the one rule's reading **confirmed by D145** (ROADMAP's Blocking and Information lists; CI's timing tests become reported numbers) |
| D116 | **M9a's in-game gate is a DGM Probe batch** (amends D112 (3)). M9a no longer waits for Kyler's own play test. A DGM Probe batch, launched under the probe rule (D117), runs M9a's maps unattended in the real game and must pass: the maps load, their pre-filled water holds, their objects load, and droughts and badtides behave as the models predict, within tolerances the batch states before it runs. The probe's own review of its in-game screenshots must find nothing visibly broken. M9a is released publicly, and any public beta opened, only after the batch passes. PR #18 (`investigation/probe`, a draft) is merged at a boundary when it is ready, and its INTEGRATION.md adopted as proposals. | The probe plays the maps in the real game without costing Kyler's time, and it checks what a play test would catch first: maps that fail in the game. | Kyler's decision, 2026-09-25; 3D-b's gate becomes a probe batch too (D145) |
| D117 | **The probe rule** (amends CLAUDE.md's standing rule; decisions-pending #50). Claude never launches or drives Timberborn, with one exception: the DGM Probe runner may launch it for an automated probe batch, but only after asking Kyler explicitly and getting Kyler's yes in chat, every time. Before each batch, one message says how many maps, which checks, roughly how long it will take, and that it will launch Timberborn; Claude waits for the yes and never treats an earlier yes as covering a new batch. Once Kyler says yes, the batch runs unattended to the end. Never while Timberborn is already running; never touching Kyler's saves, settings or other mods (probe games never autosave into Kyler's folders, and any file they create is removed afterwards); and only when no other heavy work is running on the machine. While waiting for the yes, Claude carries on with any work that doesn't need the batch. Probe batches are the one exception to D11: the orchestrator asks Kyler when a step's batch is due (M9a's gate, D116). | Kyler's answer to the conflict between the DGM Probe, which launches the game to play maps unattended, and CLAUDE.md's rule "never launch or drive Timberborn". | Kyler's decision, 2026-09-25 |
| D118 | **Real 3D terrain is essential** (adopts `investigation/terrain3d/INTEGRATION.md`, PR #20, as Kyler's decisions, not proposals). Caves, overhangs, tunnels and arches must be possible to generate and to edit, not only to import and keep. P3D-1 to P3D-9 are D119–D127, with the older decisions they supersede or amend: D4 (with D132), D28, D40, D45, D100, and the parts of D11 and D98 they name. Its ROADMAP text is the 3D stages 3D-a, 3D-b and 3D-c, after the M9 build and the Frame pass and before the Weather view (D133) and M10, whose brushes then work in 3D; its PLAN text is in §5.7, §5.9, §7, §10, §11, §18 E and §19.2, §19.6 and §19.8. **I-1 (time-sensitive):** M9's project format 3 stores the terrain as heights plus runs (D119) from M9a on, so no format change is needed when 3D forms arrive. Under Kyler's one rule (D115) the 3D stages block only on breakage, on Kyler's principles (the support rule: 0 dropped voxels; nothing stamped) and on what a player feels (the page never stalls; progress is shown while water settles); budgets and measures are information. | Kyler: real 3D terrain is essential. 29 of the 35 workshop maps made for 1.0 or later have cave or overhang columns, and 46 of all 130 are built round caves (the workshop study, D87). | Kyler's decision, 2026-09-25 |
| D119 | **Terrain is runs per tile** (P3D-1): the game's `ColumnTerrainMap` form, kept in memory as a 23-bit mask per tile, with `heights` derived. Format 3's `field` and `base` store heights plus runs: the surface per tile, and the solid runs of every tile that is not one plain run from z = 0 (investigation/terrain3d/DESIGN.md §2.2). It replaces `BaseMap.columns`; generated maps without 3D forms store an empty list. | It is what the game stores; the water columns and the support rule derive directly; heightfields are the simple case. | Kyler's decision, 2026-09-25; format 3 in M9a (I-1), runs in memory in 3D-a |
| D120 | **Stacked-column water** (P3D-2) replaces the heightfield model: the game's rules on air gaps, including the five edge rules today's port simplified ("game" mode), in both the TypeScript and the Python oracle, with a generator version bump. The 3D pre-fill keeps D27's shape. Supersedes D28's "roofs are not modelled", D98's cave cause and D100 (an unedited import still exports byte for byte). | It reproduces the official cave maps' stored water (17 of 19 at IoU ≥ 0.99; the other two are aquifer and seep maps). On generated heightfields it moves no wet tile, and depths by at most 0.033. | Kyler's decision, 2026-09-25; built in 3D-a |
| D121 | **The build applies the support rule** (P3D-3) at its integrity step (§19.8 step 7), and generated maps must drop 0 voxels. | A file never holds a voxel the game deletes; carvers keep the rule, and the pass is the net. | Kyler's decision, 2026-09-25; 3D-a; a principle that blocks (D115) |
| D122 | **The floor graph for walking** (P3D-4) in every check that walks. The heights that need stairs are listed and planned as rewards. | The game's walking has no headroom rule and joins levels only by slopes and stairs. | Kyler's decision, 2026-09-25; 3D-a |
| D123 | **Verticality sets how much the map stacks** (P3D-5; amends D4). 3D forms are found by processes, never stamped. Relief above 16 only from Verticality 70, after the Probe's T6. Reconciled with D132 (Kyler's Verticality): one setting, `vt`, arrives with M9a for the surface's verticality, with relief above 16 at 70 and above once a probe batch confirms it; 3D-b extends it to 3D forms (§5.9's table). | Kyler: crazy verticality as an option, modest by default. | Kyler's decision, 2026-09-25; with D132; the stage confirmed by D145 |
| D124 | **The 3D stages come after the Frame pass and before M10** (P3D-6): 3D-a the model, water and checks; 3D-b generation; 3D-c the editor and the view. The Weather view follows them (D133). | M10's and M11's tools must be built on runs. | Kyler's decision, 2026-09-25 |
| D125 | **Editing caves** (P3D-7): Carve, Fill and feature tools with previews of what falls; 3D locks; imported caves editable. Supersedes D40's cave rule in 3D-c (it stands until then), and lifts EDITOR_PLAN §2's non-goal. | 3D editing that never produces a map the game changes on load. | Kyler's decision, 2026-09-25; 3D-c |
| D126 | **One mesher for every tile** (P3D-8): greedy faces per plane, undersides, 3D sky light, and a level-slice cutaway. Supersedes D45's cave rule in 3D-c. | It meets the budgets (DESIGN.md §7.4) and replaces the split of D45. | Kyler's decision, 2026-09-25; 3D-c |
| D127 | **The Probe verifies 3D** (P3D-9; DESIGN.md §8: T1–T7) in 3D-b and 3D-c: an exception to D11 for these stages. Every batch is launched under the probe rule (D117): Claude asks Kyler in chat each time. | The model matches stored water; the game is the judge of pressure, moisture, clearance and heights above 16. | Kyler's decision, 2026-09-25; T7 becomes a probe batch, not Kyler's play (D145) |
| D128 | **The no-approximation measure, corrected** (M9's measures, D112; `docs/m9-design.md` §10, M4). At most 10% of a theme's maps may be closer to their nearest workshop map than the workshop's p10 nearest-peer distance (0.591 on the variety scale). It replaces "every map at least that far". Information only (D115). | Kyler: the earlier "every map" rule was stricter than the workshop maps meet among themselves (by its definition, 10% of workshop maps are closer than p10 to their nearest peer). | Kyler's decision, 2026-09-25 |
| D129 | **The audit's findings routed** (`investigation/audit/AUDIT.md`, PR #13: no P0 or P1 findings). A1 (the Python validator accepts maps whose water sources the game will halve, P2) and A2 (`.timber` bytes change across time zones for a DST-gap timestamp, P2) go into M9a, which changes the validators and the writer anyway. A3 (`__proto__` singleton keys are rewritten, P3) and A4 (the JSON parser accepts raw control characters in strings, P3) go on the Refinement list. | A1 and A2 break validator parity and byte determinism; A3 and A4 need a hand-made malformed file. | Kyler's decision, 2026-09-25 |
| D130 | **Simulation speedups adopted as proposals** (`investigation/simspeed/INTEGRATION.md`, PR #17). The proven speedups to `src/core/sim/` go into M9a's build plan, since M9a's 256² time depends on them: the saturation count and the directional-loop expansion first, then the neighbour table if its memory cost and browser measurements justify it; the clearing and drought changes stay deferred. One change per commit, each re-checked. Every optimization adopted keeps its proof that results are bit for bit identical: every sha256, exact depth arrays, in Node and Chromium; golden hashes are never updated to accept a mismatch. The exact cycle model (`investigation/cycles`) gains nothing from them; its own speedups need new proof. Anything that conflicts with a recorded decision becomes a pending decision with a default (none found at adoption). | Design version 1's 256² generation was up to three times its budget (`docs/m9-design.md` §13); two settles take most of an attempt. | Kyler's decision, 2026-09-25 |
| D131 | **The techniques playbook as proposals** (`investigation/techniques/PLAYBOOK.md` and INTEGRATION.md, PR #19) for the M9 build (layouts, natural terrain, starts, world traits, rivers) and for the 3D terrain design (caves, overhangs, verticality). Borrow the ideas; generate all geometry ourselves. Its conflicts with recorded decisions are decisions-pending #51–#53, with defaults. | Its ideas are ranked by value to Dam Good Maps; its two experiments are early filters, not evidence that a gate passes. | Kyler's decision, 2026-09-25 |
| D132 | **Verticality** (supersedes D4; settles decisions-pending #38, W8; reconciled with D123). Dam Good Maps can generate crazy, varied vertical landscapes as an option for some maps, not for all of them. (1) A Verticality setting (0–100, `vt`) beside Variety, with its share-link key. Its default gives ordinary maps at the relief design version 2 already targets (the official and workshop medians, tall parts up to 16); higher values bring crazy vertical landscapes; Surprise me and high Variety may occasionally reach the extremes, and most maps never do. (2) Height: only at high Verticality (70 and above, D123) may generated terrain go above 16, up to the game's 22 levels with the top layer kept empty (FORMAT.md). At the default and below, maps stay within 16, like the official maps and the in-game editor. Before M9a offers it, a DGM Probe batch must confirm that maps above 16 load and keep their terrain, water and objects (asked under D117). (3) Vertical parts and processes, used more as Verticality rises: spires and hoodoo stacks, sheer escarpments with hanging valleys, stepped canyons and deep gorges, towering mesas with summit lakes, cascades of falls with plunge pools, cliff-bench terraces; all emergent, never stamped. (4) Vertical but traversable, at any Verticality: the start and its first resources on reachable land; natural ramps (slopes) between levels where the land needs them; heights reachable only by building stairs are allowed, as rewards for expanding. A vertical-reach measure compares land reachable on foot with land reachable only with stairs. (5) Measures in design version 2, at the default and at high Verticality: relief range, levels used, share of land above 16, tallest fall, cliff share and vertical reach, against the official and workshop maps. Built in M9a (the setting, the processes, the probe batch for heights above 16), with Surprise me and Variety in M9b; 3D-b extends it to 3D forms (§5.9). | Kyler: crazy vertical landscapes as an option, not for every map. 19 of 130 workshop maps already go above 16; no official map does. | Kyler's decision, 2026-09-25; the stage confirmed by D145 (the setting and heights above 16 in M9a, above 16 locked until the probe batch confirms it) |
| D133 | **Weather view** (a step after the 3D stages and before M10; ROADMAP "Weather view"; released as `weather-view-done`; extends D101). Players see how a map behaves through droughts and badtides before they play it, and what that means for their colony. The exact cycle model (`investigation/cycles/`, PR #15) makes it possible, with its INTEGRATION.md's proposals, and the verified mechanics catalogue (`investigation/mechanics/`: CATALOGUE.md, VERIFIED.md, AXES.md; PR #11) turns the weather into play consequences. Delivers: (1) a Weather view in the generator's preview and in the editor: Normal, Drought and Badtide, a day slider and a play button, a legend that says in words what each colour means, and a plain-language summary; (2) the summary says what the weather means for play, not only where the water goes: the day the start's shore leaves a pump's reach (storage against access), how much fertile land stays moist and when it dries, how much a water wheel loses as flow drops (by the game's wheel rule), whether a badtide reaches farmland or the water supply, and aquifers and drills where the map has them; (3) the map card says in one or two lines how the map fares in its first drought and badtide; (4) every claim traces to the model and a verified rule, says "can't tell from the map" where that is the truth, and never promises colony survival (the catalogue's limit: economic timing is unverified); (5) the weather behaviour feeds the strategy axes, so M9's play-variety measure counts how maps behave through droughts and badtides; (6) speed: an instant estimate first (the analytic drought), then the full timeline in a cancellable background worker, streaming key days, with the simulation speedups where adopted (D130); (7) cave water: stacked-layer water from the 3D stages (D120), so caves and overhangs behave correctly; (8) calibrated against the real game with a DGM Probe batch (D117); (9) every meaning readable, as Map look requires: words as well as colour, greyscale and colour-blind checks. **Live water** (Kyler's addition): when the water settles (after generating, after an edit in the editor, or when a weather phase starts), the 3D view shows it flowing as it happens (spreading down channels, filling basins, spilling over falls), streamed from the worker at a steady frame rate. The final water is exactly the same as today: live display only, never a different settle or a change to map bytes. It can be skipped: a "show result" option, and reduced motion, jump straight to the settled water. It stays within the 3D budgets and the editor stays responsive; a new edit cancels the live display and starts again. Acceptance, under the one rule (D115): blocking: the summary's claims match the model and the verified rules and never promise survival (Kyler's honesty principle); no map file changes; the final water is identical with live display; the first key days appear quickly and it never feels stalled (this replaces the 256² timeline budget); the editor stays responsive. Information: the probe batch's timing comparison (unless it reveals breakage), and the 3D budgets. Kyler approves the look, live water included, from captures. | Kyler: players should see how a map behaves through droughts and badtides before playing it, and what that means for their colony. | Kyler's decision, 2026-09-25; D186: the editor's Drought and Badtide buttons show each event; the Weather view is the separate full-cycle timeline |
| D134 | **Keep M12 ready as we go.** Every milestone and step before M12 that adds or changes a way to edit or understand maps (M9a–c, the 3D stages, the Weather view, M10, M11, the refinement phase) also: (1) exposes that capability to M12's Claude layer as a bounded, validated operation or query tool entry, in the shape of the Claude groundwork's tools (`investigation/claude/`), with its limits and its refusal reasons (for example "carve a tunnel", "make it more vertical", "what happens in a drought?", "lock this area"); (2) adds requests for it to the Claude request suite (`investigation/claude/requests.json`), with measurable expectations and reference solutions; (3) re-runs every reference solution against the step's code, and fixes or re-tunes any that broke, so the suite stays green. No model or API key is needed; the harness waits for M12. Each step's progress entry records the suite's pass count. | M12 then builds on tools that already exist and pass, instead of reaching back into every milestone at the end. | Kyler's decision, 2026-09-25 |
| D135 | **Map look: appeal matters as much as readability** (amends D86, D110, D114 and D115). A clean default look as close to the game as possible: slopes drawn as ramps; dead trees as pale bare trunks at their true size; no hazard tape, no arrows, no inflated objects; dry ground the cool grey-brown of Kyler's reference, not reddish brown (it replaces D110's warm grey-brown). In the clean view the core meanings still read in colour, in greyscale and under colour blindness: water and badwater, badwater meeting clean water, moist, dry and contaminated ground, living and dead trees, the start. An information layer, off by default and turned on by a toggle or by a tool that needs it, holds the dam-site marks, the slope arrows and the objects enlarged from afar (D114, D115); the strict readability rules apply to it. Gate, with the one rule (D115): no blind review. Kyler approves the appeal from the clean view's captures beside Kyler's reference screenshots (`C:\dgm-reference\`, local only) and beside the DGM Probe's in-game shots of the same maps once they exist; `map-look-done` waits for that approval. The clean-look round is built on branch `look/clean`. | Kyler: appeal matters as much as readability. The fix rounds (D114, D115) had added hatched dam sites, arrows and objects grown from afar to the default view. | Kyler's decision, 2026-09-25 |
| D136 | **Real places** (a small step right after Map look is released; released as `real-places-done`). A gallery of the landscape survey's 88 playable real-terrain maps (`investigation/landscapes/library/`, PR #16). Each card shows our own render, its name ("Near Yosemite Valley"), its landform family, size and scale, and a short plain line about how it plays, from the existing analysis. The player downloads the `.timber` (with pre-filled water) or opens it in the editor to refine it. Every map is built through the existing pipeline (build, settle, validate, write), so its file is always the same bytes. Attribution per `investigation/landscapes/ATTRIBUTION.md`, on the gallery page and in each map's in-game description: derived from public elevation data, not an exact copy of the place. Kept separate from the generator: real places are content, never templates (the product principle, D108). Checks: only that every map passes the validators and exports, and that the page works on desktop and phone. When the probe is available, Kyler may approve a batch that loads a few of them in the game (D117). | The survey already converted and validated them. | Kyler's decision, 2026-09-25 |
| D137 | **Drop the Steam-map ratings** (supersedes the ratings parts of D87 and decisions-pending #35, and the fitted weights of §2.3 and §12). Rating workshop maps from pictures didn't give a useful signal. `fit-score.ts` and `ratings.json` are not used in M9 or anywhere else. The score keeps its default weights (`score-params.json`) and is only a mild tiebreaker: choosing among a seed's candidates (decisions-pending #53) and ordering a contact sheet; never a gate on quality. M9's acceptance loses the score check on the recommended official maps and the generated median against the official median. Map quality is judged by the objective measures (variety, archetypes, play variety, naturalness, weather behaviour, strategy axes), DGM Probe batches, and Kyler's own look when Kyler chooses to. **Later, after M9a, proposed for Kyler's approval (ROADMAP M9c): feedback on generated maps**, built into the site: "More like this" and "Less like this" buttons on the generator page and in the editor, plus occasional quick A-or-B picks ("which would you rather play?"); each vote is recorded with the map's genome, locally, and later from testers; the votes steer each theme's priors and the Variety setting, not a general score. | Kyler: rating workshop maps from pictures didn't give a useful signal. | Kyler's decision, 2026-09-25; the feedback is a proposal |
| D138 | **Maps should feel authored** (M9 design version 2). Each map gets one or two deliberate intentions, chosen from a varied set and steered into being by the processes (never stamped, never a dam wall): for example a signature landmark, or a meaningful relation such as "the best farmland lies past the gorge", "the only safe water is uphill", "a waterfall shields the start". The mix varies from map to map, and some maps have none, so it never becomes a template. A simple check that the intention actually exists on the finished map; if not, re-steer or drop it. Prototyped in version 2, whose briefs name each map's intention; player or Claude controls for it wait until it proves itself. Three principles: (1) intentions describe outcomes, never construction recipes ("a waterfall shields the start" is an intention; "build a wall of height 4 here" is not allowed); (2) failure is allowed: if an intention can't emerge naturally while every hard check passes, it is dropped, never forced by mutilating the map; how often each intention is dropped is recorded, and one that almost never emerges leaves the set; (3) the same intention must have many structural realizations: the no-archetype and no-clone measures (D109, M9's measures) run within each intention, not only across the whole generator, on the normal batch or contact-sheet maps. | Kyler: maps should feel authored, and intentions must never become templates or stamps (D108, D111). | Kyler's decision, 2026-09-25 |
| D139 | **Claude steers the generator; it never hand-builds the map** (a product principle; EDITOR_PLAN §7; amends D84 and D89 for character and feature requests). When a request asks for character or new features ("make this valley harsher", "give me a huge dam opportunity halfway down", "put the start under a cliff"), Claude turns it into intentions (outcomes, not recipes; D138) and settings, regenerates the affected area steered toward them (M11's regenerate area, with locks on what the player wants kept), checks the result with the analysis, and reports honestly what emerged and what didn't. Editor operations are for precise edits the player asks for ("move the start here", "widen this river by two", "delete that forest", "lock this area"). Design version 2 turns Kyler's own one-sentence intentions (to come) into intentions under D138's principles. **M12 gains "describe the map you want"**: a player types a sentence; Claude turns it into intentions; the generator makes several candidates steered toward them; the analysis checks which really have them; Claude shows the ones that do and says honestly what didn't emerge; editor operations only for small touches the player asks for. Its acceptance: the first good candidate appears quickly, and more stream in behind it while the player looks; waiting never feels like a stall; progress is shown and the player can act on the first result. The Claude request suite (`investigation/claude/`): reference solutions for character and feature requests, Kyler's flagship request included, steer the generator instead of building features with planners; requests whose steered solution needs a capability that doesn't exist yet (M9's intentions, M11's regenerate area) are marked "waiting for capability", not failed, and are checked from the step that provides it. M11's regenerate area and locks are designed for this use. | Kyler's decision. It carries the product principle (D108) and the rule against built features (D111) into Claude's requests. | Kyler's decision, 2026-09-25; which requests steer: D145; D187: Claude is a summoned chat box; precise edits use brush-style operations |
| D140 | **M12's model layer is provider-neutral.** The engine, the tools, the checks and the steering principle (D139) don't depend on the model; only a thin adapter talks to the model API. Claude is the default and the only provider built in M12. The design leaves room for an OpenAI adapter (a player's own OpenAI API key) later, tested with the same Claude request suite before it's offered. | Kyler's decision. | Kyler's decision, 2026-09-25 |
| D141 | **A Dam Good Maps MCP server, after M12** (ROADMAP Later). M12's tools (generate, steer with intentions, regenerate area, edit, validate, export) packaged as an MCP server, so Claude Desktop, claude.ai or other MCP-capable assistants can build Timberborn maps with the same engine, tools and steering principle as the app. A thin wrapper over M12's tool layer that inherits the same honesty and "steer, don't hand-build" rules (D139). | Kyler's decision. | Kyler's decision, 2026-09-25; after M12 |
| D142 | **The agent guide, after M9a**: how a Claude Code session generates, edits, validates and exports maps, and runs the contact sheet and the DGM Probe (under the probe rule, D117). Written once M9a has settled the generator's code. | Kyler's decision. | Kyler's decision, 2026-09-25; after M9a |
| D143 | **Variations of this map** (ROADMAP M9c). A button on the generator page and in the editor makes several siblings of the current map: the same theme, settings and intentions, with a genome close to the original but different land. Each variation is its own map with its own share link, and none is a clone (the no-clone check applies between siblings). It pairs with the "More like this" feedback (D137). | Kyler's decision. | Kyler's decision, 2026-09-25 |
| D144 | **A contact-sheet image at every map-changing step** (a standing rule; CLAUDE.md). Every milestone or step that changes generated maps commits one small contact-sheet image to `docs/sheets/<step>.png`: seeds 1–30 of every built theme at 128², top-down, each labelled with its seed and theme; our own generated maps only; under 1 MB. Design version 2's prototypes get one too. `npm run sheet` makes it from M9a (the prototype's own sheet tool before); its HTML pages stay uncommitted. | A record of how the maps looked at each step, for Kyler's eyes. | Kyler's decision, 2026-09-25 |
| D145 | **Kyler's answers to the eight flags (2026-09-25)**, raised in docs/STATUS.md when D116–D144 were recorded. (1) **Verticality's stage:** the setting and heights above 16 come with M9a, with above 16 locked until a DGM Probe batch confirms it (D132, D123); 3D-b extends Verticality to 3D forms; "high" Verticality is 70 and above. (2) **3D-b's gate is a probe batch**, like M9a's (D116): the Probe plays high-verticality maps (T7) under the probe rule (D117), in place of Kyler's own play of two maps. (3) **`start.dry`: measure first.** Lakeside starts stay Refinement item 8 (D107); 3D-a applies the floor rule (water counts only at or above the start's floor) only to water under roofs (§11.4). (4) **The one rule's reading stands** (D115): ROADMAP's Blocking and Information lists as written. Blocking: batches ≥ 98% final (a seed that makes no map is breakage), names that match the map, and the place resolver's and judgement words' direction tests; also the no-built-dam-wall check (D111) and the support rule (0 dropped voxels, D121). Information: first-attempt rates, no clones, no archetypes, play variety, no approximation (D128) and M12's pass rate with a key. (5) **CI's timing tests become reported numbers**, never failing a build: the 256² settle median (D33) and the editor's 2 s re-preview test. (6) **M9's staging is approved**: M9a, M9b and M9c. What goes into each stage waits for Kyler's approval of design version 2. (7) **Which Claude requests steer** (D139): new landforms, water features and dam opportunities, Kyler's flagship requests included (the giant waterfall, S01–S04, and the compound request, M01); and requests that change the map's character ("harsher", "more vertical", "more varied"), through settings and regenerating. Resources, map objects, the start, drawn rivers and precise follow-ups ("make it wider") stay operations (investigation/claude/M12-INTEGRATION.md §13). (8) **M13's rating-issue form is dropped**, with `tools/ratings.ts`; a plain "Report a problem" link to GitHub issues stays, for bug reports (§2.3, §14.6). Supersedes D14. | Kyler's answers. (1), (3), (4) and (5) confirm the defaults the plans used; (2) makes T7 a probe batch; (6) approves the stages, not yet their contents; (7) adds character requests to what steers; (8) drops the form. | Kyler's decision, 2026-09-25 |
| D146 | **Map quality checkpoint** (ROADMAP), after the M9 build (M9a–c) and before Map look 2 and the Frame pass: contact sheets for every theme at a few Variety and Verticality settings, a DGM Probe batch of generated maps (asked for first, D117), the measures as information, and a short list of the weakest patterns with examples and likely causes; then tuning rounds (fix, regenerate, show Kyler) until Kyler says go. Only breakage and Kyler's decided principles block. | Kyler wants to judge and tune the new generator's maps before the look and the frame are polished. | Kyler's decision, 2026-09-25 |
| D147 | **Map look 2: water and shadows** (ROADMAP; made smaller by Kyler on 2026-09-25), after the Map quality checkpoint and just before the Frame pass: a graphics quality setting (High, chosen automatically on capable GPUs; Standard, today's clean look; Light, the software look). High adds only the two biggest effects: a proper water shader (colour by depth, clear shallows, gentle ripples catching the light, shore and fall foam, badwater distinct; fewer, subtler sparkle flecks than the clean look, more depth and transparency) and soft real-time shadows from a warm sun. Today's grass and dirt textures stay as they are. Ambient occlusion, colour grading, richer textures, softened edges, full-resolution anti-aliasing, more detailed models and stronger far-off contaminated cracks move to a later, optional list. Our own art only; never game assets. Judged by eye against Kyler's reference screenshots from captures; speed is information only, but no mode may feel sluggish on the machines it's chosen for. Released as `map-look-2-done`. | Kyler: the two effects that matter most, and he likes today's textures. | Kyler's decision, 2026-09-25; D201 adds mist, spray and splash rings at falls to High mode |
| D148 | **Stale tests follow Kyler's decisions** (standing rule, CLAUDE.md): when a test still passes but no longer checks what its name says, because a decision of Kyler's changed the thing it tested, update it to check the current decision, rename it if needed, and note it in the progress log, without asking first. Never weaken a test to make it pass. First applied: `look-readable.test.ts` and `look.test.ts` now compare the water's body colours (`waterBody`), and the palette alias `WATER.deep` is gone. | Kyler: tests must keep meaning what they say as the decisions change. | Kyler's decision, 2026-09-25 |
| D149 | **DGM Probe integration, as proposals** (PR #18, merged 2026-09-25; `investigation/probe/INTEGRATION.md`). Adopted as proposals, not decisions: the runner in `tools/probe/` and the mod in `mod/probe/` on `dev`, reusing `src/core`, with `npm run probe` and `npm run probe:smoke`; the cycle model taken from the cycles study until it moves to `src/core/sim/cycles/` with the Weather view; a probe batch after every milestone that changes maps (its check files, the Map look maps, the calibration games), before the tag, and always asked for first (D117); a failed probe check blocks the tag like a failed test (breakage), unless Kyler waives it; proposed statuses for `docs/ingame-log.md` (pass/fail (probe), applied by hand); the generic map checks as permanent tests once a few runs agree; the cycle model's calibration notes; game-side screenshots of our own maps at the Map look poses as a local reference (never committed); later, a scripted bot colony; and a smoke run after each game update. Two proposals conflict with recorded decisions and are pending (decisions-pending #54, #55); the recorded decisions stay. | Kyler asked for the probe's INTEGRATION.md to be adopted as proposals. | Proposals, 2026-09-25; the two conflicts decided by Kyler: results go to `C:\dgm-probe\` (#54), and the probe batch alone is M9a's gate (#55, D116) |
| D150 | **Dependency updates** (standing rule, CLAUDE.md). Dependency updates (Kyler, standing rule): merge GitHub Actions updates and minor or patch npm updates when CI is green (CI's byte checks catch anything that changes a map). Hold major upgrades (TypeScript 7.0, @types/node 26, and any future major) for a deliberate upgrade step at a quiet time, such as the refinement phase, with the full nightly suite; never mid-milestone. Dependabot groups its updates into one weekly pull request per ecosystem. Also: the live check no longer runs from a `workflow_run` trigger (CodeQL flagged a privileged checkout of another run's commit); `deploy.yml` calls it, as a reusable workflow, with the commit it deployed, and it keeps its daily and manual runs against main. | Kyler: keep dependencies current without surprises mid-milestone. | Kyler's decision, 2026-09-25 |
| D151 | **No edge walls** (extends D111). No generated or converted map may raise a wall along its edges to hold water; every real place was enclosed by a full-height wall around the whole map edge, a stamped container no official map has. A blocking check in both validators, beside D111's dam-wall check (generate and export profiles; reported on import). The generator and the M9 build handle edges the same way: rivers enter and leave naturally. | Kyler: a wall around the edge is a stamped container. | Kyler's decision, 2026-09-25 |
| D152 | **Maps don't have to hold their water** (replaces the second point of Kyler's first edge note). Timberborn is about engineering water; draining is the player's challenge, not a defect. No walls or rims are added to keep water on the map, in real places or the generator: rivers leave naturally, lakes may drain, and water may go off the map. The settle check accepts a steady flow off the map. A real place needs only at least one water source plus the start requirements; places are not dropped for draining. Nothing else about water is guaranteed. | Kyler: draining is the player's challenge. | Kyler's decision, 2026-09-25 |
| D153 | **The start water rule** (amends D85 and D104). Clean water no longer needs to be at the start's own level: it counts if there is a walking path from the start to a shore tile over the map's own terrain and natural slopes (no player-built stairs), within the difficulty's walking distance (12 / 20 / 28), where a pump on that shore reaches the water. Both validators, the editor's start indicators and the start text change together; the trees and bushes requirements stay. Generated maps change (a generator version bump). | Kyler: a start by a lower river is fine if its slopes lead there. | Kyler's decision, 2026-09-25 |
| D154 | **Contaminated ground is a layer, as in the game** (Map look). The ground keeps its own look (moist stays grass, dry stays cracked earth); contamination adds red-orange crack veins over it, denser and brighter as contamination rises, with no solid rust fill; wet contaminated and dry contaminated are clearly different; it stays readable through the crack pattern in greyscale and for colour blindness. Kyler decides from before and after captures; approved by Kyler on 2026-09-25 and released as `look-contamination-done`, with a thin outline where contaminated ground ends, drawn only when **Markers** is on (the clean view keeps its gradual fade); for Map look 2, the dry contaminated cracks become a little more visible from far away. | Kyler: match the game's contamination. | Kyler's decision, 2026-09-25 |
| D155 | **Real places, second round.** In-game descriptions are short: the title, one line (inspired by the land near its namesake, at Timberborn's scale; not a replica) and "Credits: <link to a credits page>"; the full notices are on the gallery page and a credits page, and only notices whose terms require it stay in the file (each provider checked). The maps are built once at deploy time and served as finished `.timber` files (instant downloads), rebuilt whenever the engine changes. The byte check of every real place runs nightly and in the release check. Titles drop "Near" and "(… sample)" suffixes (kept in the metadata) and read plainly ("Grand Canyon"). Per-map "how it plays" lines wait for M9c's names and descriptions. | Kyler's review of the live gallery. | Kyler's decision, 2026-09-25 |
| D156 | **Real places thumbnails**: rendered with the Map look 3D view (the clean look, Standard quality or better), an angled overview that shows each landform at its best, at twice the card's display size, as compressed WebP; rendered on a machine with a GPU (CI would give the Light look), committed, and re-rendered whenever the engine changes, like the prebuilt maps; lazy-loaded. Kyler decides from before and after. | Kyler: the 2D thumbnails undersell the maps. | Kyler's decision, 2026-09-25 |
| D157 | **More real places**: the landscape survey's conversions are re-run (all existing patches, no new downloads) under the current rules (no perimeter walls or rims, water may drain off the map, the new start-water rule, a settle check that accepts a steady flow off the map), and additions are chosen as the original 88 were (maps that pass, distinct from each other, spread across landform families), up to about 150 in all including the 88 rebuilt without walls (the three random-land controls stay out), with clean titles. Kyler sees a contact sheet of the whole gallery and says if any should go. Released with the second round (`real-places-2-done`). | Kyler wants a larger, cleaner gallery. | Kyler's decision, 2026-09-25 |
| D158 | **Live editing** (ROADMAP step, alongside the M9 design; the most important feature before M12). Responsiveness, a native feel and ease of use, to the highest standard: the editor should feel like Cities: Skylines' terrain tools and at home to anyone who knows Timberborn's own map editor. Principles: responsive above all (every input visibly answered at once); direct manipulation (no confirm steps, no Place button, no waiting); everything reversible (undo, not dialogs); show, don't ask (live previews, limits and problems, never interruptions); good defaults. Delivers: terrain brushes (raise, lower, flatten to a level, smooth, naturalize; whole levels, natural slopes at the edge; brought forward from M10) with a projected brush cursor, Cities-style controls (left-drag paints; right/middle-drag and wheel move the camera; Shift inverts; Ctrl-click samples a level; [ and ] size; Alt+scroll strength; number keys switch brushes; Ctrl+Z/Ctrl+Y; Esc cancels a stroke) and a compact brush bar; water that never blocks (terrain instantly, water re-settles and flows live in the background; an option pauses it); live shape tools (the result grows as you drag, placed on release, then handles; limits shown live); one undo step per stroke or placement with clear labels, every stroke recorded as an operation that replays exactly and survives regeneration and format 3; quiet background checks; only changed chunks rebuilt; keyboard access and screen-reader labels; a one-line first-use hint. Its first phase is a quick triage of the current editor (Kyler's notes: placement never waits on water; limits show before or while placing and the result matches what was shown; the placed hill looked like a flat slab; the legend covers half the map when open and disappears when minimized, so it becomes a slim panel beside the map that collapses to a small always-visible strip, lists only what's on the current map, and highlights those things when an entry is clicked (styling waits for the design pass); and the generator page said "You are editing …" while its preview showed a different map, so it must be obvious which map is shown and which is edited). Judged by Kyler trying it himself on a preview address, https://timbermods.github.io/dam-good-maps/preview/ (noindex), refreshed after every iteration. Blocking: responsiveness as defined (the change visible within one or two frames, the display's frame rate while painting on 256², no main-thread stalls, cancel and undo at once) and breakage (strokes replay exactly, undo and redo always correct, no crash, no edit lost). The brush system is built on the terrain model so the 3D steps extend it to caves and tunnels; M10 keeps symmetry and advanced extras. Released as `live-editing-done`. | Kyler: the editor feels like a form, not a tool. | Kyler's decision, 2026-09-25; D179 makes Live editing the editor's core principle: every editing action is live; D180 adds the smooth camera, Demolish, water-aware sampling, the river tool's rules, source strength, carving water, natural or exact rivers, water time controls and local-first water; D181 adds valleys carved by water, moisture and badtides shown live, and optional water sounds; D182: the brush kit is the core of the editor; the landform tools are eliminated; D183 adds live dimensions; D184 sets the editor's design principles and layout; it replaces the triage's legend panel (the legend shows only while an overlay is on); D193 adds hold to dig with a stop level; D194: Carve is a force of nature with its own top-bar button next to Source (Unleash and Aim, Defy gravity, Power from creek to catastrophe); PR #47 held until Kyler says it is ready; D196: sources always findable, water never an object, seeing underwater (T, Clear water), Alt+scroll slices layers, Shift+scroll sets strength, water in the hover readout; D197: water near an edit moves within a frame or two; a speed control (slower, normal, faster, instant), brisk by default; D199: Carve's full feature set, kept whole when #47 lands; D202 adds Craterize, its own top-bar button next to Carve; D203 adds Quake and groups Carve, Craterize and Quake as the forces, built on one shared forces core; D204: Flatten from the stroke's start, cut and fill, Cliff or Ramped edges, a "start fits here" hint, objects ride the ground; tools read intent; D205: drag to resize (F), juice, a minimap, camera bookmarks; a build time-lapse later; D206 adds Erupt to the forces group; every force's options row starts with its mode switch; all four share one forces core; D207: visible layers identical to Timberborn (a layer widget, slicing, the layer pick, tools on the visible land) |
| D159 | **M11's heightmap import uses the landscape survey's conversion pipeline**, not just raw heights: vertical mapping, rivers from the drainage, water sources, a start by Kyler's rules (D85, D153), and the current water rules (no walls or rims, draining allowed; D151, D152). | Kyler: a raw heightmap doesn't make a playable map. | Kyler's decision, 2026-09-25 |
| D160 | **Pick a place** (placement and interface replaced by D175 on 2026-09-25): choose any spot on the real world, frame it, and get a playable map built from open elevation data with attribution, through the landscape survey's conversion pipeline (M11's heightmap import, D159), with designed water (D166). Never Google's own data. It comes right after M11 and before the refinement phase. | Kyler: real places on demand. | Kyler's decision, 2026-09-25 |
| D161 | **The north-star player journey** (PLAN, Product principles): find a striking place (for example in Google Earth), turn it into a Timberborn map (Pick a place), watch how its droughts and badtides play out (the Weather view), make a few changes (Live editing), and play it as a functional, validated, interesting map (export, later one-click play). Used to check priorities: each step must feel smooth, and a gap anywhere breaks the experience. | Kyler: the whole path must work, not just its parts. | Kyler's decision, 2026-09-25 |
| D162 | **Save to Timberborn** (a small step, soon; the first half of one-click play): using the browser's folder access (Chrome and Edge), the player picks `Documents\Timberborn\Maps` once, the site remembers it, and the button saves the map straight there, from the generator, the editor's export and the Real places gallery; other browsers keep the normal download with install help. Released as `save-to-timberborn-done`. | Kyler: the north-star journey ends at play, not at a downloads folder. | Kyler's decision, 2026-09-25 |
| D163 | **Later, proposed: a companion mod for one-click play**: a small mod that lists newly saved Dam Good Maps maps in the game's main menu and starts one in one click, building on what the DGM Probe mod already does to open a map. | Kyler: the second half of one-click play. | Kyler's decision to propose it, 2026-09-25; built only after his approval |
| D164 | **Starting wood** (amends D85 and D104's trees requirement). Tree species yield very different wood (oak 8 logs, pine 2 plus resin, birch 1; dead trees still yield), so the start requirement counts the logs within the start's walking distance by each species' real yield, not trees. Today's per-difficulty defaults (60 / 40 / 20 trees) convert to log amounts by the default species mix, so each difficulty stays about as generous, measured correctly. Both validators, the setting ("Minimum starting trees" renamed "Minimum starting wood"), the editor's start indicators and the start text change; old share links decode sensibly. Wood by species shows where it helps: the start indicators, the "how it plays" text ("mostly oak: plenty of wood, slow to regrow") and the resource-timing strategy axis. Only grown trees count (saplings can't be cut until they grow; `GrowthProgress` read correctly, a missing value meaning grown); saplings' future wood shows separately where it helps ("plus about N logs growing") in the start indicators and the "how it plays" text; each difficulty stays about as generous as now, measured correctly (Kyler's addition, 2026-09-25). Species variety becomes a lever the generator can use for different openings (oak-rich and slow against birch-rich and fast). | Kyler: counting trees misjudges the opening. | Kyler's decision, 2026-09-25 |
| D165 | **Kyler's own intentions** (for D138, in his words, each an outcome with a simple check; the three intention principles apply: outcomes not recipes, failure allowed, many realizations with no-archetype checks within each intention): (1) "I love when the start sits under a cliff with water below." (2) "I want a snaking river going down a hill": a river that winds back and forth as it descends a slope, dropping a level at several bends (steps or small falls), so the water settles; check: its course turns at least three times while it descends at least a few levels. (3) "I want a large crater where multiple rivers converge": a large crater basin that two or more rivers flow into, forming a lake, with the water leaving through a gap in the rim (a natural dam opportunity); check: a closed rim around a large basin, two or more inflowing rivers, one outlet through the rim. (4) "I want a cliffside with a waterfall that goes into a large circular lake": a tall cliff with a waterfall plunging into a large, roughly round lake at its foot, with a natural, uneven shore, never a perfect circle; check: a fall of several levels ending in a large lake whose shape is broadly round. Design version 2 also drafts 10–15 candidate intentions (from the workshop patterns, the landscape families and the mechanics axes) for Kyler to pick from; only those he picks join the list. | Kyler's intentions. | Kyler's decision, 2026-09-25 |
| D166 | **Pick a place: designed water** (shapes the Pick a place step and D160). The land comes from the real world; the water is designed. A place never fails for lack of native water: the engine places water sources where they make sense for that land (valley heads, springs below ridges, where drainage carries a river through the most interesting terrain: down a canyon, over a cliff, into a crater), and may use intentions to choose ("a river over this cliff into a lake"). It always meets Kyler's start requirements, placing the start where the designed water gives a good opening. If a spot still can't work, it quietly tries other sizes, scales and nearby offsets, and shows the best result or clear nearby suggestions; the player never sees a failed attempt. The player can then move, add or remove water sources in the editor, and see the result in the Weather view. "Real water" from open data (OpenStreetMap rivers and lakes, global surface-water maps) is an optional mode for later, not a requirement. `investigation/pickplace` (#34; held by Kyler until its Codex designed-water follow-up is finished and green, then merged) is adopted with this change: its failures from missing or misplaced water become cases for designed water, not rejections. | Kyler: a striking place must always become a playable map. | Kyler's decision, 2026-09-25; #34 merged on 2026-09-25 and its INTEGRATION.md adopted as proposals for Pick a place (where `investigation/pickplace-water2` differs, its designed water replaces #34's); when the quiet retries change the player's framing, size or scale, the page says so plainly (Kyler); #56 decided by Kyler: a failed map is never shown; the page offers nearby choices that passed, or says what to try |
| D167 | **Metal on every map.** At least one mine site on every map: generated maps, Real places and Pick a place. The Mine sites setting becomes 1 to 4 (no 0), keeping today's size defaults; old links with 0 decode to 1. Real places get mine sites placed by the generator's rules (flat, dry 5×5 ground, away from water, reachable, at a sensible distance from the start). A blocking check that every map has one. Scrap ruins scale with map size like the official maps (measured ruin density by size, the default for generated maps and Real places, the Ruins setting moving around it); Real places use it, not their own density. | Kyler: no map should lack metal. | Kyler's decision, 2026-09-25 |
| D168 | **Tree counts roughly like the official maps** (the number of trees; starting wood stays as in D164). Measured by map size from the official maps, leaving out exceptional maps (Nomads, Oasis and any clear outlier, named with why): trees per tile area, the living and dead share (roughly two-thirds of official pines, oaks and birches are dead) and the species mix. The default for generated maps, Real places and Pick a place: each map's count scales with its size and lands within the official typical range (for example the 25th–75th percentiles), varying from map to map; the Forests setting moves around that baseline. Trees are placed naturally within the budget: living on moist ground, dead on dry. | Kyler: Yosemite Valley had far more trees than any official map of its size. | Kyler's decision, 2026-09-25 |
| D169 | **Resources come in clusters, roughly like the official maps**: berry bushes in patches, trees in groves with clearings between them, not spread evenly over every moist tile, by the official maps' measured clustering by size (patches and groves per map, their sizes and spacing), used roughly and varying from map to map, for generated maps, Real places and Pick a place. The start requirements stay as decided. | Kyler: resources were spread evenly across the land. | Kyler's decision, 2026-09-25 |
| D170 | **Ruins look and vary like the official maps**: measured column heights (1 to 8 storeys), how heights vary within a field (a few tall towers among shorter columns), field shapes and sizes, and the variant mix (A to E); irregular fields, varied heights and mixed variants, placed as the game's rules allow, for generated maps, Real places and Pick a place. Ruin density is measured in scrap (15 per storey), so varied heights don't change a map's metal, and kept roughly within the official range for the map's size. | Kyler: Yosemite Valley had uniform heights in rectangular blocks. | Kyler's decision, 2026-09-25 |
| D171 | **Water sources start rivers.** A source is where water begins, never in the middle of a flow. Sources go only where water starts: where a river enters from the map edge, or as springs at valley heads and below ridges; never inside an existing river or lake. For more flow, several sources cluster side by side at the river's head (as official maps do), or their strength rises; never sources downstream. Each tributary gets its own source at its own head. For generated maps, Real places and Pick a place (the Real places rebuild in their current round), with a check that flags any source sitting inside an existing flow (blocking for generated maps; reported for imports). | Kyler: the Yosemite Valley real place had sources downstream inside an already-flowing river. | Kyler's decision, 2026-09-25; in the editor, sources may be placed anywhere (D184); the rule applies to generated maps |
| D172 | **Tall maps** (height up to 22 levels, the top layer empty; important for fun maps). (1) As soon as a DGM Probe batch confirms that maps above 16 load and keep their terrain, water and objects (asked for first, D117), both validators allow heights above 16, without waiting for M9a. (2) Real places and Pick a place get a height option: standard (up to 16) or tall (up to 22). Dramatic places (for example Yosemite Valley, the fjords, the Grand Canyon, the volcanoes and the escarpments) default to tall; tall versions of the Real places come in the round after the probe confirms. (3) The generator's Verticality setting keeps its plan (M9a; above 16 from 70; D132, D145). (4) Each tall map's description notes that the in-game map editor only edits up to level 16. | Kyler: height is important for fun maps. | Kyler's decision, 2026-09-25; (1)'s probe batch passed on 2026-09-25 (run 20260925-tall) |
| D173 | **The exact-weather follow-up (PR #33, `investigation/simspeed-cycles/`), adopted as proposals for the Weather view**: the bit-identical speedups to the cycle model (the soil descriptor cache; a scalar water kernel compiled once per Weather worker, with the JavaScript path kept as a fallback; sparse water support; the soil saturation cache only if its results justify its memory), each re-proved after every cumulative step without accepting a changed hash; and the product scheduling from WEATHER-PRODUCT.md: the first drought first when it's on screen, a background start after generation when resources permit, caching lossless results under the full input, configuration and model-version hash, and cancellable bounded batches. These change availability and waiting times, never a simulated result. | Kyler asked for #33 to be merged and adopted as Weather view proposals. | Proposals, 2026-09-25 |
| D174 | **Real places, Kyler's review of the second round.** Thumbnails: the 3D direction approved; each place shows two views, the 3D overview (framed tighter, the land filling most of the card) and a 2D top-down upgraded to the clean look (moist grass, cracked earth, water by depth, contaminated ground as a layer), crisp at full resolution, not upscaled and not the old height palette; Kyler picked the minimap layout (the 3D view with the 2D top-down as a corner inset that swaps to the full 2D view on hover, focus or tap); the 2D view is turned to match the 3D overview's camera direction, and both show a small north arrow; every picture re-rendered after the rebuild without walls. The survey's raw elevation patches may be re-downloaded from Terrain Tiles on AWS (public data) so the gallery can grow to about 150. Credits: CC BY 4.0 for Austria; the New Zealand notice stays in the file. Titles: "Lower Mississippi" → "Mississippi Oxbows", "Taklimakan Fan" → "Kunlun Alluvial Fan", "Plitvice" → "Plitvice Lakes". The rebuild waits for the start, edge and resource rules. | Kyler's review. | Kyler's decision, 2026-09-25 |
| D175 | **Pick a place: the full experience** (replaces D160's earlier interface notes and its placement right after Live editing). One smooth flow inside Dam Good Maps: (1) explore a 3D map (fly, tilt, rotate) with shaded terrain from the same AWS Terrarium elevation the conversion uses, OpenFreeMap vector tiles for context (rivers, lakes, forests, roads, place names; no key; attribution shown), place search with OpenStreetMap's Nominatim on Enter only within its usage policy, no satellite imagery for now, never Google's data, pasted coordinates still accepted, and a planned fallback tile source (for example VersaTiles or Maptoolkit); (2) frame with a square that drags and rotates, whose size sets the scale within sensible limits, showing its real size ("7.7 km across"); (3) a live preview inside the square of the land already turned into Timberborn blocks at Timberborn's levels; (4) confirm with as little as possible: map size (96, 128, 256) and height (auto: tall when the relief deserves it, once the probe confirms tall maps), with scale, difficulty and water (designed by default) in an optional More drawer; (5) one click, "Build my map": a short progress strip (terrain, rivers, start, forests, checks), then the map in the usual 3D view with its name (from the place, no "Near") and a "how it plays" line, with the Weather view, Refine, Save to Timberborn, Download and a share link that rebuilds exactly this map (storing the place, framing, settings and the elevation data's version); (6) it never fails in front of the player: it quietly tries nearby framings and scales and shows the best, or highlights better spots; (7) phones get a simpler version (a flatter view, a lighter preview); (8) credits as in Real places (D155). It follows every current rule (designed water D166 and D171, with #34's designed-water prototype once complete; no walls or rims; maps may drain; the start requirements; official-like trees, ruins, mines and clusters). It comes right after M11 and before the refinement phase, as one of the final features, reusing M11's heightmap import pipeline; the design pass restyles it later. | Kyler: from exploring the real world to a finished map in one click. | Kyler's decision, 2026-09-25 |
| D176 | **Design timing.** The Frame pass and the design pass stay where they are. To avoid redoing work: until the Frame pass creates the design records, new interface (Live editing, the Real places gallery, the legend, Save to Timberborn, and anything else) is built with the existing shared styles and components, with no one-off styling, so the design pass restyles it rather than rebuilds it; after the Frame pass, all new interface follows its records (DESIGN.md and the tokens); M12's and M13's new interface is built to those records, with the impeccable-app-flow's finish review on the new screens, and no second full design pass. | Kyler: avoid redoing interface work. | Kyler's decision, 2026-09-25 |
| D177 | **Map look: badwater blends into clean water** (amends D114's mixed-water point, the streaks covering the bad share). In the Standard look each water tile is coloured by its contamination level, sliding smoothly from the clean water colour toward murky red-brown (about #4B3C37 on screen, measured in game), interpolated between tiles so a front is a soft gradient over several tiles, never blotches or streaks. Badwater stays clearly distinct from clean water in greyscale and for colour blindness; the two colours are about equally light, so a cue beyond hue carries it. The High look (#38, D147) does the same, and the two stay consistent. Rendering only. Built on `look/badwater-blend`; Kyler decides from before and after captures; released as `look-badwater-done`. | Kyler: mixed water showed dark red blotches that read like stains; in the game badwater blends smoothly into clean water. | Kyler's decision, 2026-09-25; Kyler's review of #41 (2026-09-25): not approved yet. (1) Badwater's colour and opacity come from the High prototype (#38), which Kyler is tuning toward a redder, more crimson, more opaque badwater; no values are picked until he approves #38's badwater, then its final colours (body, troughs, streaks) and opacity are taken from #38's calibration (#4B3C37 read as muddy grey-brown). (2) Partly contaminated water reads as poisoned at a glance: the warm red tint scales with contamination, so a mixed river looks tainted, not just darker blue. (3) One shared water palette: clean and badwater colours, opacity, the contamination blend and its calibration in one place, used by the Standard look now and by the High look when Map look 2 adopts #38, so the two never drift apart; #41's smooth blending stays. Deep badwater: option A (darkening with depth). The three loosened readability margins are accepted if the light-to-dark order still holds with the final colour (re-checked). The shallow-badwater weak spot is acceptable; Kyler approved #38's badwater the same day (at e63a3ff): its final colours and opacity go into the shared water palette for #41; Kyler approved #41 (2026-09-26) with one change before release: mixed water blends through a warm midpoint (from teal toward the game's measured mixing zone, about #2E444C, then warm brown, then crimson), never purple or mauve-grey, and the tint is a little steeper so 10–25% bad already reads warm; the three loosened margins accepted, the dry-ground one noted as fragile; released as `look-badwater-done` without another review unless it looks off; Kyler, 2026-09-26: with #38's crimson, badwater is now lighter than the mine pit (#373A34), matching the game; both colours stay, and the greyscale test requires the pit at least about 5 L* darker than badwater |
| D178 | **Map look: mine sites and ruins, models of our own** (amends D114's ruins point; never game assets). **Mine sites**, true to the game's footprint: a sunken square pit with real depth and a dark earthy interior with roots, rubble and cracks (about #373A34); a rusty frame in dull brown-orange (about #844D2F); scaffolding at each corner with small platforms, pale wooden crates and planks (about #A78E65), and a few beams over the edge. **Ruins**, ruined scaffold towers, one column per tile and one storey per level: thin rusty corner posts (about #8D5631), a beam at every storey and diagonal braces on some faces; beige slab panels (about #B8A775) on some storeys and faces, some missing, a few tilted or broken, the top storey often partial; ivy (about #405634) climbing and hanging from beams on columns on moist ground, bare columns on dry ground; the variants A–E differ in bracing and panels, so neighbouring columns never look identical. Both stay recognisable from afar (Markers may still outline them); ruins use shared geometry and a simpler far version, so maps with many ruins stay smooth. Rendering only: the map files don't change. Built on `look/mine-site`; Kyler decides from before and after captures; released as `look-mine-ruins-done`. | Kyler: the mine site is a flat black square with a bright orange outline and ruins look like stacked wireframe boxes; in the game both are small structures. | Kyler's decision, 2026-09-25; Kyler's review of #42 (2026-09-25): ruins approved with two tweaks: more rust kept in the far-away version (the orange scaffolding makes ruins recognisable from afar; plain tan reads as sandstone), and more ivy on moist columns (more coverage, with a slightly brighter green variant), like his in-game screenshot. Mine site: one more round: the frame runs around almost the whole 5 × 5 footprint with the pit filling most of it (1.6 levels deep stays); the corner scaffolds sit on the frame's corners as one structure, with beams reaching across the pit, not standing outside it like separate sheds; more of the dark, rooty interior shows; Markers' outline stays. Then the mine is shown again on #42, and both are released together as `look-mine-ruins-done` |
| D179 | **Live editing is how you edit a map** (the editor's core principle; extends D158; replaces EDITOR_PLAN §1's "see it before you commit" and every plan-confirm-place flow). Every editing action is live, and no plan-confirm-place flow remains anywhere. Every tool follows Live editing's principles: direct manipulation, instant visual response, water catching up, one undo step, background checks, and the responsiveness rules. (1) **Water.** Rivers are drawn freehand: the channel carves in under the cursor, stepping down with the terrain, and water flows in behind as the player draws, spilling over drops as natural waterfalls; the source goes at the head where the stroke started (the source rule, D171), or the river joins an existing river if the stroke starts from one; width and depth follow the brush controls; handles reshape the course afterwards. Lakes: paint a shore, or click a basin to fill it, and watch it fill. Water and badwater sources: placing one starts water spreading from it at once, and badwater's spread is visible. (2) **Water flows visibly** after every edit, in the editor now (not waiting for the Weather view): it advances at a pace the eye can follow (filling a new channel, creeping downstream tile by tile, spilling over drops, spreading into basins) over a few seconds, with a speed setting and "skip to result". The final water is exactly today's settled result; the animation is only the journey, and the brush never waits for it. (3) **Brushes:** circle and square shapes, toggled on the brush bar (square aligned with the tile grid); a precise mode (hard edges, no falloff: at size 1 exactly one tile, each click exactly one level), which covers single-tile editing; straight strokes (click, then Shift-click: the brush runs a straight line between the two points, for channels and dam lines). (4) **One Select tool:** rectangle, freehand and "same level" (all connected ground at the clicked height); Shift adds, Alt subtracts. Actions on a selection: raise or lower by N levels, flatten or set to a level, dig out down to a chosen level, clear trees and objects; results show live, water flows into the new shape, and each action is one undo step. (5) **Landforms:** the live shape tools (drag a hill and watch it grow; handles afterwards). (6) **Resources:** forest and berry brushes that paint naturally clustered trees and bushes at official-like densities (D167–D170), and a clear brush. (7) **Objects:** ruins, mine sites, relics, slopes and the start are dragged into place with a live footprint (green, or red with the reason). (8) The old tools' limits, reasons and checks appear live while dragging, never as dialogs afterwards; each plan-confirm-place flow is retired once its live version exists. (9) Heavy operations (regenerating an area, "Generate, keeping my edits") show their result growing progressively, never a frozen wait. (10) Every future editing tool is built live from the start: M10's symmetry and advanced brushes, M11's stamps, locks and regenerate area, and the 3D terrain steps' carving tools. The interface stays simple: shapes and precise mode are options on the existing brush bar, and selection is one Select tool, not a new set of buttons. Built in pushes, water first, each put on the preview for Kyler to try. | Kyler, trying the preview: the live brushes keep 256² responsive and undo is one instant step; the remaining plan-confirm-place tools, water above all, feel unusable by comparison. | Kyler's decision, 2026-09-25; its clear brush is replaced by D180's Demolish tool; its (5), the live landform tools, is removed by D182: the brush kit shapes the land; D184 replaces its water tools (1), its resource brushes (6) and its object dragging (7): smart Lower and Source, and the left shelf's live ghosts |
| D180 | **Live editing: additions** (extends D158 and D179). (1) **Smooth camera:** while keys are held the camera moves every frame (key state tracked, not key-repeat events), scaled by frame time, with a quick ease-in and a short glide to a stop; speed scales with zoom (slower up close, faster zoomed out). Timberborn's own controls, so it feels native: WASD to move, Q and E to rotate, scroll to zoom, Shift to move faster; the arrow keys also move. Keys never act while typing in a text field and never clash with the brush shortcuts. (2) **A Demolish tool** (replaces D179's separate clear brush): a click removes one object (tree, bush, ruin, water or badwater source, slope, mine site, relic); a drag removes everything under the brush (circle or square, with size); hovering highlights in red exactly what will be removed; filters choose what it affects (trees, bushes, ruins, water sources, other objects, or all); the Delete key removes whatever is selected; each click or stroke is one undo step; water re-flows live when a source or blockage is removed. It never changes terrain (digging stays with Lower, Flatten and the Select tool's dig out). A removal that would break a rule (removing the start, say) is refused live, with the reason. It stays instant on 256²: objects found through a per-tile index, only the affected models updated, removals batched while dragging. The Select tool's "clear trees and objects" stays for large selections. (3) **Water-aware level sampling:** Ctrl-click on a water tile sets the target level to that water's bed (the ground under it), not its surface, so a channel dug or flattened to it connects and the water flows in; the sampled level shows live on the cursor ("riverbed: level 7"). (4) **The river tool's rules.** Start: on dry land, a new river with a water source at the start point (the head, D171); in existing water, a branch with no new source, its bed starting at that water's bed level. End: in existing water, it joins as a tributary; at the map edge, it flows off the map; in a basin, it fills it into a lake. Bed: never goes uphill; on flat ground the channel is dug a set depth (1 level by default, adjustable) at the brush's width; ground higher than the bed is cut straight through at the bed's level, leaving a gorge with vertical walls, the cut depth shown live on the cursor ("cutting 6 levels deep here"); where the land drops below the bed, the bed steps down and a waterfall forms. The water flows behind the cursor while drawing, and the whole river, cuts included, is one undo step. (5) **Source strength is the player's:** set while drawing a river or placing a source (the same controls as brush strength), and adjustable on any existing water or badwater source by selecting it, the water responding live; up to the highest strength the game handles well; beyond the official maps' range a friendly note ("stronger than any official map"), never a block. Crazy strong waterfalls are allowed and fun. (6) **"Let the water carve":** place a source, switch on carving, and watch the water find its own way downhill, eroding its channel as it runs (deeper where fast, falling over ledges, pooling in hollows) until stopped; it reuses the M9 generator's erosion processes, stays in whole levels and looks natural, not noisy; the whole run is one undo step. (7) **Natural or exact rivers,** a toggle on the river tool (remembered between uses; Natural by default): Natural gives drawn rivers slight meanders, banks that widen and narrow, a plunge pool at the foot of each waterfall and small bays; Exact keeps the channel exactly as drawn (for canals). (8) **Water time controls:** pause, speed up and replay the flow (to watch a lake fill again, say); an optional camera that follows the water front; a "drought" button to watch the new water dry out (tying into the Weather view, D133). (9) **Local first:** the water near the edit is simulated and shown first, then the rest of the map, so big rivers on 256² never lag the tools. (10) However it is shown, the final water always matches the game's settled result: what the player watches is what they'll play. Each lands on the preview for Kyler to try. | Kyler, trying the preview: WASD stutters while mouse dragging is smooth; the water and river tools need rules, strength and a way to watch the water. | Kyler's decision, 2026-09-25; D184 removes its river rules (4), the river's strength control (5) and Natural or exact (7), and renames Demolish to Remove; the camera (1), Remove (2), sampling (3), source strength on hover (5), carving (6), time controls (8), local first (9) and (10) stay; D196: a source's strength is set with Shift+scroll |
| D181 | **Live editing: more for water** (extends D180). (1) **"Let the water carve" forms valleys, not just gorges:** it simulates the channel cutting down (fast water deepens it) and the sides giving way toward it (walls slumping into stepped terraces), so a cut widens into a valley the longer it runs, plus deposition where the water slows (flat floodplains in the valley bottom, a small delta where it meets a lake or basin). A walls setting steers it: steep (gorges and canyons) or wide (broad valleys). It runs in the background, shown step by step near the source first, and never lags the tools. (2) **The land comes alive with the water:** after new water arrives, moisture visibly spreads from it, the dry, cracked earth turning to grass along its banks over a few seconds; in a drought it fades back. The final state always matches the settled moisture. (3) **A "badtide" button** beside "drought" in the water time controls, to watch badwater surge from its sources, spread through the water and poison the ground, then recover. (4) **Optional water sounds,** off by default: a soft rush near waterfalls and a trickle along streams, quieter as the camera zooms out. Our own sounds (made in the page), never the game's. | Kyler: the water should shape the land and bring it to life, not only fill it. | Kyler's decision, 2026-09-25 |
| D182 | **The brush kit is the core of the editor** (Kyler's feedback on Live editing's push 0; amends D158, D179 (5) and EDITOR_PLAN §1's "edit features, not blocks"). The brushes feel like painting: the player can't mess up and only sees the landscape change as a result of their own actions; the landform tools felt awful and failed half the time. **All landform tools are eliminated completely:** hill, plateau, ridge, canyon, valley, island, lake and resource-area objects, and their handles, and anything in the editor that only existed to support them. No presets. Editing is done with the brush kit and brush-first tools: the brushes (Raise, Lower, Flatten, Smooth, Naturalize, with circle and square shapes, precise mode and straight strokes); the Select tool; the water tools (the river tool, sources, lakes, "Let the water carve"), Demolish, and the forest and berry brushes, as decided (D179–D181). New: a **Terrace brush** (painting over a slope turns it into clean stepped terraces, flat shelves one level apart, with a step-width setting); a **Ramp brush** (painting along an edge between levels places the game's natural slopes, so beavers can climb; the start-reach indicators update live); **pen pressure** (on a drawing tablet, pressure controls brush strength; mice are unaffected); **level lines** (an optional toggle showing faint contour lines at each level while sculpting). Every future editing tool is brush-first and has the same feel: M10's symmetry mirrors strokes live, and M11's stamps are painted onto the land. The generator and analysis still recognise landforms by reading the terrain. Built right after the smooth camera push and the water push. | Kyler, after push 0: the brushes feel amazing, like painting; the landform tools feel awful and fail half the time. | Kyler's decision, 2026-09-25; D184 makes Terrace a Flatten option ("in steps") and Ramp a Smooth option ("make walkable"), and replaces the forest and berry brushes with the left shelf's trees and bushes |
| D183 | **Live dimensions** (an addition to the brush kit, D158, D182): for precision, the tools show their dimensions live: the selection's size in tiles while selecting ("12 × 8 tiles"), the length of a straight stroke while drawing it, the target level on the cursor for Flatten and Terrace ("level 7"), and the river tool's width and depth ("3 wide, 1 deep"). | Kyler: precision needs numbers while working. | Kyler's decision, 2026-09-25; D184 removes the cursor readouts; only the level number while flattening stays; the editor vision (EDITOR_PLAN.md, 2026-09-25) keeps live dimensions for the precision tools: a selection's size, a straight line's length, the level while flattening |
| D184 | **The editor's design principles** (Kyler; recorded in D158 as the editor's design; replaces any earlier editor decision that conflicts, including live water part 1's river and lake tools, the Channel tool, the separate plant brushes and the Demolish name). **Principles:** the land is the interface: the map is the hero, the interface small and quiet, and feedback comes from the land itself (water moving, ground greening, a waterfall appearing), not from panels, dialogs or readouts. Direct manipulation: everything happens where the cursor is. Few tools, each obvious, each doing one thing beautifully; if two overlap, one goes; a new idea must earn a button or make an existing tool smarter. Smart defaults instead of settings: tools do the right thing without asking; options exist but stay hidden until wanted. Forgiveness: undo is instant and Esc always backs out. One grammar everywhere: pick, paint or place, see the result; size with [ and ], strength with scroll, for every tool. Things just work: performance and responsiveness come first; painting never waits on water and stays at full frame rate on 256². Hills, plateaus, ridges, valleys and islands come from the brushes, not from buttons. (1) **The top bar** (shaping land and water): Raise, Lower, Flatten, Smooth, Naturalize | Source | Remove; a small row beneath shows only the picked tool's options. The size ring is drawn on the land; strength shows only while scrolling it. Square shape, precise mode, straight lines and level lines are small toggles in the options row, off by default. Terrace becomes a Flatten option ("in steps"); Ramp becomes a Smooth option ("make walkable"). Select opens with a key, or by dragging with a modifier; it takes no permanent slot. (2) **Water**, the whole design: water is a reflection of the land being painted; make a valley, put a water source, and there's a river. Smart Lower: a Lower stroke that starts in or next to water carves a bed that keeps flowing downhill, so the water follows the brush; anywhere else it is an ordinary Lower; the ring turns softly blue when this happens; no Channel tool. Source: click to place, and water spreads at once; its only options are clean or bad, and strength; hover any source and scroll to change its strength live (a friendly note past the official range, never a block); drag to move it. Sources can be placed anywhere in the editor; "sources only where water begins" (D171) applies to generated maps. Everything else emerges from the land: lakes fill hollows by themselves, waterfalls form at drops, rivers join where they meet, branches form wherever the land is cut from water. Removed: the river tool with its start and end rules, the Natural or exact modes, the river width, depth and strength controls, the lake click-fill and the cursor readouts (only the level number while flattening stays). Kept: live water part 2 (the paced journey with pause, speed, skip, replay, follow, drought and badtide; moisture spreading as the land greens; the optional sounds) and "Let the water carve", since those are how water behaves, not tools. Water reacts locally first (around the stroke or source), then settles the rest of the map in the background; the final water always matches the game's settled result. (3) **The left shelf** (placing things): a clean grid of icons, nothing else: no tabs full of text, no Advanced checkbox, no Show dropdown, no help paragraphs. It holds only the game's placeable objects: the start (district center), trees (pine, birch, oak), berry bushes, ruins, the mine site, relics, natural slopes, and the other placeable objects (blockages, geothermal fields, thorns). Each icon is a small render of the actual object, in the map's look. Picking one shows a live ghost that follows the cursor smoothly, sitting on the terrain, its footprint glowing green where it fits and red where it doesn't, with the reason in a quiet word ("needs flat ground"); click places it, R rotates, Esc puts it back. Trees and bushes: click places one, drag paints many, naturally clustered at official-like densities. (4) **The view buttons:** Orbit, Top-down, Reset view, Height colours and Markers, plus the overlays (moisture, contamination, drought) moved here from the old Show dropdown; the legend appears only while an overlay is on. (5) **The header:** Undo and Redo as two small icons, with their shortcuts; one primary button, Save to Timberborn; everything else (Open, Save project, Download .timber, History, New map) in one small menu. (6) **Quiet checks:** "Ready to play" becomes a small dot, green when all's well and amber when something needs a look; clicking it lists the problems, each highlighted on the map; never a pop-up. (7) **The start:** its requirements (water, wood and berries in reach) appear around it while the district center is hovered or dragged, then fade. (8) **Remove** (formerly Demolish), as decided in D180 (click one, drag many, filters, a red highlight on hover, instant on 256²), under the friendlier name. (9) **First run:** three one-line hints (paint the land, place things, add water), then never again. Built in pushes, water first, each on the preview for Kyler to try. | Kyler: the editor's design, so every tool is small, obvious and answered by the land itself. | Kyler's decision, 2026-09-25; Kyler, the same day: plain scroll always zooms and Alt+scroll sets strength for brushes and a hovered source (#58); **Download .timber** takes the primary button's place until Save to Timberborn lands and in browsers that can't save to a folder; Save to Timberborn (PR #40) is finished, merged at the next boundary and made the primary button; D194 adds Carve to the top bar, next to Source; D196 moves strength to Shift+scroll; Alt+scroll slices the layers as in the game (replaces #58); D202 adds Craterize to the top bar, next to Carve; D203: the top bar's forces group (Carve, Craterize, Quake), visually distinct |
| D185 | **The editor is desktop-first:** it is designed around a desktop screen, a mouse or a drawing tablet (pen pressure) and a keyboard. It is deliberately a studio for creating maps, different from the game's own editor, a precision workshop; players can still fine-tune in the game's editor. (Replaces EDITOR_PLAN's "tablet and touch support" as a later goal.) | Kyler: the editor vision. | Kyler's decision, 2026-09-25 |
| D186 | **Drought, Badtide and the Weather view are separate:** in the editor, the Drought button shows what a drought looks like on this map and the Badtide button what a badtide looks like (D180, D181). The Weather view (D133) is separate: a fuller timeline of the whole cycle, opened when wanted. | Kyler: the editor vision. | Kyler's decision, 2026-09-25 |
| D187 | **Claude is a summoned chat box** (M12): a small chat box summoned with a key, which disappears when done. Many players won't use it, so it never takes permanent space. Claude steers the generator for character and uses the editor's tools only for precise edits (D139), through brush-style operations, never landform objects. | Kyler: the editor vision. | Kyler's decision, 2026-09-25 |
| D188 | **Docs are part of done** (a standing rule, in CLAUDE.md). (1) Any change that alters how something works updates its living document in the same pull request (EDITOR_PLAN.md for the editor, PLAN.md for the product, ROADMAP.md for steps, CLAUDE.md for the rules, STATUS.md for the current state); a pull request that changes behaviour without its doc isn't finished. (2) At every milestone boundary, the living docs are skimmed against what was just built and any drift is fixed and noted in the progress log. (3) A guard: a list of retired terms (starting with "landform tool", "river tool", "lake tool", "Channel tool", "Plant brush"), which CI flags if they reappear in the living docs, the interface text or the editor code; terms are added when features are retired. (4) A docs index, `docs/README.md`, says which documents are living and authoritative (EDITOR_PLAN, PLAN, ROADMAP, CLAUDE, STATUS) and which are history (progress logs, investigations, the decision log). EDITOR_PLAN.md is rewritten to open with the editor's vision and is required reading before any editor work. | Kyler: EDITOR_PLAN.md still described the old editor and could lead agents to rebuild what he removed. | Kyler's decision, 2026-09-25 |
| D189 | **Design version 2's scope is frozen:** everything already decided goes in; anything new from here goes into the M9a, M9b or M9c builds instead. | Kyler: get version 2 to review. | Kyler's decision, 2026-09-25 |
| D190 | **Pending #51–#53, the defaults accepted.** #51: the playbook's world traits are candidate intentions, one mechanism with D138's intentions, each an outcome with its emergence check. #52: 3D-b may generate wet caves (spring caves, underground rivers); dry caves only are the fallback for any wet form whose probe checks disagree with the model. #53: every candidate must pass the checks; the one farthest from the theme's reference signatures wins; the score breaks near ties; opening coverage is information. | Kyler accepted the defaults. | Kyler's decision, 2026-09-25 |
| D191 | **Save to Timberborn keeps both** (amends D162): a map is never overwritten by one with the same name; the new one is saved as "Name (2)" (then (3), …) with a quiet note ("Saved as 'River Valley (2)'"). The bytes are the download's exactly. | Kyler: saving must never lose a map. | Kyler's decision, 2026-09-25 |
| D192 | **Pick a place: signature water and ESA WorldCover** (PR #45, `investigation/pickplace-water2`, merged at the next boundary; its designed water replaces #34's where they differ, D166). It adds ESA WorldCover (observed water, CC BY 4.0) as a data source: its attribution goes in the Pick a place credits and in each map's credits, like the elevation data. Hard cases that still fail (for example the Mississippi birdfoot, the Kansas prairie) are offered with nearby alternatives, never shown as failures (#56). | Kyler: #45 looks great. | Kyler's decision, 2026-09-26 |
| D193 | **Hold to dig, with a stop level** (an addition to the brush kit, D158; no new tool). (1) In precise mode, holding Lower (or Raise) keeps it working: the ground under the brush drops (or rises) one level at a time at a steady, watchable pace tied to strength, until the player lets go, with vertical walls; each hold is one undo step. (2) An optional "stop at" level, off by default: a floor for Lower and a ceiling for Raise; when on, holding stops at that level however long the hold. It is set by Ctrl-clicking a tile (its level) or water (the riverbed's level), as with Flatten. (3) While holding with a stop level, a faint plane shows at that level, and the brush ring pulses once when the ground reaches it. (4) Protected automatically: never below the map's bottom, and never digging out from under the start or other placed objects. | Kyler: digging a channel or pit to an exact depth. | Kyler's decision, 2026-09-26 |
| D194 | **Carve becomes a force of nature** (amends D180 (6), D181 (1) and D184's top bar). Codex is redesigning the carving prototype on `investigation/carve` (PR #47): Carve has Unleash and Aim modes, Defy gravity, and a Power slider from creek to catastrophe, and gets its own top-bar button next to Source. PR #47 is held: it is not merged at the next boundary, only once Kyler says it is ready; Live editing's carving waits for it. | Kyler: carving should feel like unleashing a force of nature. | Kyler's decision, 2026-09-26; Kyler, 2026-09-26: he loves #47; it stays held for one more Codex round (Wander, Width separate from Power, variation within each carve, "Try another path") until he says it's ready to merge; then it becomes the Carve button in Live editing, next to Source |
| D195 | **What investigations commit** (a standing rule, in CLAUDE.md and `investigation/README.md`): commit reports, code, small samples and a few captures; keep large generated results (bulk JSON, thousands of files, anything over a few MB) out of git, in a gitignored folder (`investigation/<name>/local/`) or attached to a GitHub Release, with the report saying how to regenerate them. History is not rewritten for what's already merged. Every future Codex and Claude investigation prompt includes this rule. | #45 added about 98 MB of generated results to the repository. | Kyler's decision, 2026-09-26 |
| D196 | **Live editing push 1: water is never an object; sources, seeing underwater, the game's controls** (extends D158, D184). (1) **Sources are always findable,** even underwater: a subtle upwelling at each source (bubbles, a gentle surface ring) visible through the water at all times; with the Source tool picked or when hovering near one, a clear marker with its strength; Markers shows every source. (2) **Water is never an object;** it is the result of sources and land. The old River object is removed completely: water is never selectable or deletable; clicking water with Remove or Delete does nothing; no "River" panel or river selection (no yellow selection stripes) ever appears. The useful controls belong to sources: a river's flow is its sources' strength, and clean or bad is a property of each source. Water changes only through its causes: removing, moving or weakening a source, or reshaping the land. Generated maps' rivers are just their sources (visible and editable, including inflows at the map edge) and their land; the generator's river objects are never exposed in the editor. Deleting a source (select it and press Delete, or Remove) makes its water recede live. (3) **Seeing underwater, like the game:** whenever a tool is picked (any brush, Source, Remove), water turns transparent automatically, so the bed, submerged terraces, ledges and sources show clearly; with no tool picked, water looks normal, and T toggles it transparent (the game's own key), with a matching "Clear water" view button; in transparent mode badwater stays clearly distinguishable from clean water (a visible tint or outline), including for colour-blind players. (4) **Controls like the game** (replaces #58's Alt+scroll for strength): Alt+scroll changes the visible layers, slicing the world from the top down as in Timberborn; Alt+click on a tile jumps to its layer (the game's layer pick); strength moves to Shift+scroll, for brushes and for a hovered source (Shift with WASD still moves the camera faster); plain scroll still zooms. (5) **The hover readout covers water:** hovering water quietly shows its depth, the bed level and its contamination, in the same corner readout as "Height 11, dry soil". (6) **Hovering water highlights the sources feeding it,** subtly and only while hovering, so it is clear where that water comes from. Each fix goes on the preview. | Kyler, trying water push 1: sources vanish under water, the old River object is still exposed, and the controls should be the game's. | Kyler's decision, 2026-09-26 |
| D197 | **Water responsiveness** (live water part 2; extends D179 (2) and D180 (8)–(10)). (1) Water reacts immediately: when terrain changes next to water, the water near the edit starts moving within a frame or two (simulated around the edit first, then the rest of the map); nothing waits for the whole map before it shows. (2) A water speed control: slower, normal, faster, instant. The default is brisk: small edits settle nearby in a second or two; big changes (a new river, a breach) still flow visibly. Instant skips straight to the settled result. (3) The final water is always the game's settled result, at any speed. | Kyler: the water must answer the edit at once. | Kyler's decision, 2026-09-26 |
| D198 | **Smart Lower's cue** (a small fix to D184): the faint blue fill was easy to miss over water and dark ground. When smart Lower is active, the brush ring itself turns a clear water-blue and slightly thicker, with the faint fill kept as a second cue; ordinary Lower keeps the white ring. It stays readable over water, badwater and every ground type, and in colour-blind views. | Kyler: the cue must be seen. | Kyler's decision, 2026-09-26 |
| D199 | **Carve's full feature set** (extends D194; kept whole when #47 becomes the Carve button in Live editing): Unleash (click a spot) and Aim (origin to end point), with Defy gravity for aimed carves that climb uphill; the Power slider (creek to catastrophe), and Width (following Power by default, or set by hand for slot canyons or wide lazy rivers); Wander (straight to winding), natural variation within each carve, and "Try another path"; Steep or Wide walls; Keep river or Dry canyon; a camera that follows the river's head (optional), with the visible carving effects (a surging head, crumbling blocks, dust, muddy water); Stop keeps what's carved, and Esc or undo reverts the whole carve instantly. | Kyler: keep all of Carve when it lands. | Kyler's decision, 2026-09-26; Kyler, the same day: with Keep river (the default), the source left at the origin gets a strength that follows the river's Width (how much water it carries), not its Power (how hard it cut), so slot canyons keep a modest stream and wide rivers a big one; Dry canyon leaves no source; the source is editable afterwards like any other |
| D200 | **Badwater on every map** (like the mine-site rule, D167). Badtides turn all water sources bad on every map, but a permanent badwater source is also a late-game resource (badwater makes Extract, and from it Catalyst, Grease and Explosives), so every map needs at least one. (1) At least one badwater source on every map: generated maps, Real places and Pick a place. (2) Placed naturally (a spring in a hollow or side valley, never at random), at the per-difficulty distance targets from the start (30 / 15 / 8 tiles). (3) Count and strength roughly like the official maps for the map's size, measured from the official maps (checking whether every official map really has at least one), as done for trees, ruins and mines. (4) Included in the Real places rebuild. | Kyler: badwater is a late-game resource, not only a hazard. | Kyler's decision, 2026-09-26; Kyler, the same day: players can deliberately choose "No badwater" for peaceful maps, an explicit option in the badwater setting (the default is always at least one badwater source); with "No badwater" the map places no badwater sources, and badtides still happen (they turn all water sources bad); share links and the map's description record the choice; generated maps, Real places and Pick a place all respect it |
| D201 | **Map look: waterfalls with shape and volume** (a Map look fix, judged by Kyler from captures). Falls looked flat: streaky sheets painted on each block's face, clinging to the stone. (1) In the Standard look, falls get shape and volume: water leaves the lip and arcs outward and down (further for stronger, faster flow), as a curved translucent ribbon with thickness, its texture rushing downward fast, with white foam at the lip and whitewater where it lands; stepped cascades read as a series of small falls, each with its own lip and splash. (2) In Map look 2's High mode, add mist and spray at the base and splash rings across the pool below. Falls stay cheap enough for 256² maps with many falls. Rendering only. Built on `look/waterfalls`; released as `look-waterfalls-done` once Kyler approves. | Kyler, from the preview: falls cling to the stone instead of pouring off it. | Kyler's decision, 2026-09-26 |
| D202 | **Craterize** (a new tool; its own top-bar button next to Carve: two verbs, two tools). A force of nature that simulates a giant impact: Strike or Aim (a glancing drag for oval craters); Power; Size (auto or set); Steep or Terraced walls; Centre (Auto, Bowl, Peak, Ring, Flat); Debris (Light or Heavy, with or without Rays); Try another; the impact moment with radial tree knockdown; overlapping impacts overprint older ones; it refuses to strike where the start sits; it never adds water; one undo step; Esc reverts. Codex is prototyping it on `investigation/craterize`: when its PR is open it is held until Kyler says it's ready, then merged and used as the starting point for the Craterize button. | Kyler: a crater is its own force of nature, not a kind of carving. | Kyler's decision, 2026-09-26 |
| D203 | **Quake, and the forces group** (a new tool). Quake gets its own top-bar button next to Carve and Craterize, in a visually distinct "forces" group on the bar. It splits the land along a drawn fault line: Lift or Slide; Power; Sheer or Stepped scarp; Try another (including a natural tilt); objects ride with the land; it refuses a fault through the start; it never adds water; one undo step; Esc reverts. Codex is prototyping it on `investigation/quake`, building on Carve and Craterize: when its PR is open it is held until Kyler says it's ready. When the forces are adopted into the editor, all three (Carve, Craterize, Quake) are built on one shared forces core. | Kyler: the forces of nature are a family. | Kyler's decision, 2026-09-26; D206: Erupt joins the forces; all four share one forces core |
| D204 | **Flatten improvements, and "tools read intent"** (the brush kit, D158, D182). (1) By default Flatten's target is the height where the stroke starts (like Cities: Skylines); Ctrl-click still samples any other level. (2) Flatten cuts and fills: it raises low tiles up to the level as well as cutting high tiles down, so one stroke makes a clean plateau. (3) An Edges option: Cliff (default) or Ramped, where the flattened area's rim steps down to the surrounding land with natural slopes so beavers can reach it. (4) A quiet "the start fits here" hint when the flattened area is big and flat enough for the district center, and a stronger one when that spot would also meet the start requirements (water reachable, wood, berries). (5) Trees and objects ride the ground when Flatten raises or lowers it, instead of being buried or left floating. (6) A principle for every tool, in EDITOR_PLAN.md: **tools read intent.** Small quality-of-life tricks remove decisions the player would otherwise make (smart Lower, flatten from the stroke's start, clear water when a tool is picked, a stop level for holding, sampling a riverbed on water); whenever a player would hesitate, switch tools or do something twice, look for a way the tool could have known what they meant. | Kyler: every tool should know what the player meant. | Kyler's decision, 2026-09-26 |
| D205 | **Editor additions: drag to resize, juice, a minimap, camera bookmarks, and a build time-lapse later** (D158). Clean, simple and without friction: each should feel obvious the first time, add nothing to the screen unless it's in use, and never make the editor feel sluggish. (1) Resize the brush by dragging (from Blender): hold F and move the mouse; the ring grows or shrinks live under the cursor; click to set; [ and ] still work. (2) Juice: small satisfying feedback on every action, like Townscaper and Dorfromantik: a soft thud as land rises, a puff of dust when it's lowered, a pop and a little wiggle when a tree or object is placed, a gentle splash when a source starts, and fitting touches for Carve, Craterize and Quake. Quiet, optional sounds with a volume and an off switch; micro-animations off with reduced-motion settings. (3) A minimap: a small top-down view of the whole map in a corner (reusing the Real places top-down rendering), refreshed after edits settle, with an outline of what the camera sees; click or drag on it to move the camera there. On by default for 256² maps, off for smaller ones, with a toggle among the view buttons. (4) Camera bookmarks: Ctrl+Shift+1 to 9 saves the current view (position, angle, zoom) to a slot; Shift+1 to 9 glides the camera smoothly back to it; the number keys alone stay the brush shortcuts; bookmarks are saved with the project and in autosave. (5) A time-lapse of how a map was built, as a later roadmap step with the sharing features near M13: the edit history replayed at speed from the generated map, a camera that glides to each edit, saved as a video file (WebM) to share. | Kyler: the editor should feel good in the hand. | Kyler's decision, 2026-09-26 |
| D206 | **Erupt** (a new tool, in the forces group with Carve, Craterize and Quake). It raises a volcano: Mode (Vent or Fissure); Power; Shape (Steep or Broad); Summit (Auto, Peak, Crater, Caldera); Flows (Light or Heavy, with or without Ridges); Try another. Fresh volcanic rock is hard for Carve; flows can dam rivers; objects ride the rising ground; overlapping eruptions build volcanic fields; it refuses to erupt where the start sits; it never adds water; one undo step; Esc reverts. Every force's options row starts with its mode switch. Codex is prototyping it on `investigation/erupt`, building on the other forces: when its PR is open it is held until Kyler says it's ready. When the forces are adopted into the editor, all four are built on one shared forces core. | Kyler: volcanoes join the forces of nature. | Kyler's decision, 2026-09-26 |
| D207 | **Visible layers, identical to Timberborn** (D158; builds on D196's Alt+scroll and Alt+click). A layer widget like the game's: the current visible level, ∞ when everything is shown, with up and down arrows; placed with the view buttons, compact, sitting quietly at ∞ until used; no new corner of the screen. Slicing like the game: everything above the chosen level is hidden (terrain, water, objects), and the cut surfaces show clearly as the tops of what remains. The layer pick like the game: on a tile, it slices to that tile's level; again on the same level, it returns to ∞. Tools respect the slice: brushes and placement act on the visible land, never on hidden terrain above the cursor. Esc never resets the slice; the widget's ∞ does. It matches the game's behaviour exactly wherever the decompiled code or the game shows how it works (`Timberborn.LevelVisibilitySystem`, `LevelVisibilitySystemUI`; read for answers only, never copied). | Kyler: layers must work exactly as in the game. | Kyler's decision, 2026-09-26 |
| D208 | **Themes become optional leanings, not templates** (for M9b; design version 2 is frozen, D189). The generator's default is "Any" (Surprise me): it combines landforms, water features and intentions freely across the whole space. Choosing a theme only leans the generator toward that kind of land, still varied within by Variety and intentions. Measured: "Any" maps stay coherent and playable, and no theme's maps cluster into an archetype (D108). | Kyler: themes shouldn't be templates. | Kyler's decision, 2026-09-26; D209 brings "Any" forward to M9a |
| D209 | **Design version 2 approved; the M9a build starts** (D112, D189). Conditions: (M9a) rivers and badwater streams never run ruler-straight: many maps had perfectly straight channels at 45 or 90 degrees with parallel, canal-like sides; rivers follow the land naturally, and the longest straight run is measured against real terrain and the official maps. (M9b) Islands' sameness fixed as proposed: archipelagos across the whole map, a sea off one edge, island chains, atolls (today nearly every Islands map is a round central sea). (M9b) Kyler's crater intention (26%) and waterfall-lake intention (16%) emerge more often, through the steering. **"Any" comes forward to M9a** (replaces D208's M9b): M9a ships with "Any" (Surprise me) as the default, the genome drawn from broad ranges across all themes, combining landforms, water features and intentions freely; choosing a theme only leans the ranges. "Any" maps are measured in M9a like each theme (coherent, playable, no clones, no archetypes) and included in the contact sheets. M9b keeps the rest of the variety work. **Pending decisions:** the defaults accepted for #59, #60, #61, #62, #64, #65 and #68; #63: no Dam site tool in the editor (landform tools are gone), the natural-narrows builder kept only as an internal operation for M12's Claude; #67: `water.storage_possible` becomes information the generator prefers, not a blocking guard (engineering water is the player's job); #66: Kyler picks the candidate intentions later. | Kyler approved design version 2. | Kyler's decision, 2026-09-26 |
| D210 | **Models and priority for M9.** The M9a build runs on Opus 5.5 at xhigh effort; M9b and M9c on Opus 5.5 at high; routine work around them (tests, contact sheets, docs, watching CI) on Sonnet 5 at medium. When work competes for the machine, M9a comes first. | Kyler: M9a matters most. | Kyler's decision, 2026-09-26 |

---

## Changes from audit

The audit of 2026-09-23 ([AUDIT.md](AUDIT.md)) changed this plan as follows:

1. Added §19, the single definition of the foundations shared with the editor (map spec,
   parametric features, set-piece builders, stable ids, validation, format I/O, determinism, build
   order, platform adapters), and §20 Editor decisions.
2. §7: the generator plans parametric features first and builds the map from them with the shared
   pipeline. §7.0 takes regeneration constraints. §7.3 uses the shared set-piece builders. §7.10
   returns the spec and features, and keeps detected features apart as `derived`.
3. §7.6 and §1: river mouths on the map edge must be sealed. Lake levels follow their outlet sill.
4. §9: measured limits for waterfalls (drop at most 15 editor-safe and 12 practical; width needs a
   header pool and flow of about 0.025·W to 0.4·W blocks/s), dam sites (useful crest 1–3, basin
   capped at 15% of the map, reservoir feasibility by size), a new §9.9 Gorge, and a new §9.10
   table of achievable ranges by map size. Set-piece values are rejected outside hard bounds and
   reduced, with a report, beyond what the map allows.
5. §5.3: generated waterfalls are 1–9 wide and landmark falls are set pieces. Drought reserve
   combinations that cannot fit small maps are disabled.
6. §10: fidelity notes (roofed water in imported maps, the modded save) and the measured JS
   performance. The budget is revised to ≤ 3 s at 256², with an exact active list, and M2 fixes it
   by benchmark.
7. §11: check classes (load, playability, design) and profiles (generate, export, import); the
   report gains severity, location and fixes; imported-map thresholds; three prototype shortcuts
   the port must not copy; the new `plants.drought` warning.
8. §2 and §2.1: per-feature RNG streams, ids hashed from features, the canonical water settle, no
   COOP/COEP on GitHub Pages, and a second build target for the Claude artifact.
9. §3: new `core/spec`, `core/features`, `core/doc`, `platform`, `render3d` and `editor` modules.
10. §4: recorded the drift between `calibrated.py` and §5.6, to be fixed in M1.
11. §14: "Refine this map" (or a project-file download until the editor ships). Share links carry
    the spec only.
12. §15: contract tests (schema, feature round trip, build equality, incremental equals full, id
    stability, import normalization).
13. §16: milestones mapped to the merged [ROADMAP.md](ROADMAP.md). M1 now includes the feature
    model and the project file.
14. §17: new risks (JS water performance, features-first port size, thin waterfall lips, pre-1.0
    imports). §18: new in-game checks F1–F4.
