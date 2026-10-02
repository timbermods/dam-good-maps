# Archive: PLAN.md

What `PLAN.md` held at D390 (2026-10-02) that the document prune (PLAN §20 D390) took out of the living plan: what was
superseded, finished or history, and the full text of every section that was condensed rather than moved, **verbatim**
(headings are one level deeper than they were; relative links are re-based to this folder; nothing else changed).
Each entry says what became of it. §20, the decision log, is in [decisions.md](decisions.md). The living plan is
[../../PLAN.md](../../PLAN.md); [../../EDITOR_PLAN.md](../../EDITOR_PLAN.md) and [editor-plan.md](editor-plan.md) hold the
editor's side.

## From PLAN.md: Header (the opening paragraphs)

*The living PLAN.md opens with a shorter version.*

## Dam Good Maps: website plan

A static website where a player picks settings, generates a Timberborn map, sees it in the browser
and downloads a `.timber` file that loads and plays in Timberborn 1.1. This plan is meant to be
implemented directly. The facts it rests on are in
[investigation/REPORT.md](../../investigation/REPORT.md), [FORMAT.md](../../FORMAT.md) and
[investigation/calibration.json](../../investigation/calibration.json). The Python prototype in
[prototype/](../../prototype/) already implements a large part of it: one archetype, the exact water
model, the validator and the file writer.

The generator is the first half of one app. [EDITOR_PLAN.md](../../EDITOR_PLAN.md) plans the map editor
and the Claude integration, and [ROADMAP.md](../../ROADMAP.md) orders the work of both plans. The
foundations the two halves share (map spec, parametric features, set-piece builders, stable ids,
validation, format I/O, determinism and the build order) are defined once, in
[§19](#19-shared-foundations-with-the-editor). Every generated map is built from parametric
features, from the first milestone on, and the editor keeps them with the map as its plan (for
the analysis and Claude's steering); the player shapes the land with the brushes (D182). Edits
never replay onto new land: every Generate makes a new map (D336). [AUDIT.md](AUDIT.md) records why each part
changed during the plan audit.

## From PLAN.md: §1 What the investigation changed

*Moved whole: the findings are history; each is applied where it belongs in the living sections.*

### 1. What the investigation changed

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

## From PLAN.md: §2 Architecture and tech stack

*Condensed in the living §2 (the tests and second-build rows and §2.3's decision history are shortened).*

### 2. Architecture and tech stack

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

#### 2.1 Determinism

"Same seed and settings gives an identical file" must hold across Chrome, Firefox, Safari and
Node:

- **Random numbers.** `sfc32`, seeded through `splitmix32`. Layout planning draws from per-stage
  streams, `hash(seed, stageName, candidate, attempt)`. Everything placed *by a feature* (trees
  of a forest, columns of a ruin field, sources of a river) draws from that feature's own stream,
  `hash(seed, featureId, purpose)` (§19.7). Changing one forest's density then reshuffles
  neither the terrain nor the other forests, and an edit in the editor stays local.
- **Arithmetic.** Anything that affects output uses only `+ − × ÷`, `Math.floor`, `Math.round`,
  `Math.abs`, `Math.min` and `Math.max`, which IEEE-754 makes exact across engines, and the portable
  maths (`core/math/portable.ts`, D366).
  - `Math.sin/cos/tan/exp/log/pow/hypot/atan2/sqrt` and `**` are implementation-approximated in the
    language, and engines do differ (D366 measured it: Glaciate's heights, Craterize's fallen trees,
    the Badtide's contamination). None of them appears in `src/core/`: `tests/unit/portable.test.ts`
    rejects one, with a short allow-list.
  - `portable.ts`: the polynomial sine, cosine and exp of `core/math/detmath.ts` (an odd polynomial
    through x¹⁷ on an argument reduced to [−π/2, π/2], error below 1e-13; D15), and fixed-order
    `atan`, `atan2`, `log`, `log2`, `hypot`, `tanh` and `pow` (an integer power multiplies; any other
    is exp(y·log x)), with `sqrt` from WebAssembly's correctly rounded `f64.sqrt`. They are for finite
    map arguments, not a general maths library.
  - Sorts keep their input order for ties (the language's sort is stable), and a comparator returns
    zero for equal keys.
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

#### 2.2 Runtime flow

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

#### 2.3 Problem reports without a server

A plain **Report a problem** link opens the repository's GitHub issues
(`github.com/timbermods/dam-good-maps/issues`), for bug reports. There is no rating form and no
`tools/ratings.ts` (Kyler, 2026-09-25; §20 D145, superseding D14). The vote-based in-site feedback
once proposed for M9c (D137) is dropped (D278); "Another like this" (D278) makes a sibling of the
current map instead, and the score keeps its default weights only where it is still used (M9 drops
it as a candidate-choice mechanism, D278).

## From PLAN.md: §3 Project structure

*Replaced in the living §3 by a short map; the folder READMEs under src/ describe each folder.*

### 3. Project structure

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
│  │  │               session.ts (apply, undo and redo, export: what the editor runs)
│  │  ├─ land/        genome.ts (the genome, the themes as priors, Any)  field.ts  levels.ts  drainage.ts  hydro.ts  hazards.ts
│  │  │               narrows.ts (the natural-narrows builder)  intentions.ts: the processes the land grows from (M9a)
│  │  ├─ gen/         generate.ts (the field, its water, then build, retries)  settler.ts (the start)  readback.ts (features
│  │  │               read back out of the field)  weir.ts  extras.ts (objects, district sites, rises)  resources.ts
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

## From PLAN.md: §4 How the prototype and calibration carry over

*Condensed in the living §4 (the planned M1 alignment of calibrated.py is done).*

### 4. How the prototype and calibration carry over

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

## From PLAN.md: §5 Settings (with §5.8, the settings planned from the workshop study)

*Condensed in the living §5; §5.8 (planned for M9, not built) moved whole.*

### 5. Settings

Defaults are for the River Valley theme at Normal. A theme preset (§6) overwrites them, and the
player can then change anything. Each setting maps to generator targets. **Size-aware** means the
value is a multiplier on the official size-class median, interpolated in log(area) between
small (50–100²), medium (128²), large (192²) and max (256²).

#### 5.1 Basics

| Setting | Values | Default | Notes |
|---|---|---|---|
| Seed | 0 – 4,294,967,295 | random | Shown as a number; also accepted as text, hashed to a number, so "beaver" is a valid seed. |
| Size | Small 96², Medium 128², Large 192², Max 256², Custom | Medium | 128² is the game's default new-map size. Custom width and height are each 48–256 (the game allows 4–256, but under 48 there is no room for a start zone and a river). Non-square is allowed, as in official maps. |
| Theme | River Valley, Canyon, Highlands, Lake Basin, Delta, Islands | River Valley | Pre-fills everything below (§6). |
| Designed for | Easy, Normal, Hard | Normal | The in-game difficulty the map is balanced for. It sets starting-area rules and drought sizing (§5.6). The map works on any difficulty, and the card warns if you pick Hard for a map designed for Easy. |

#### 5.2 Terrain

| Setting | Range | Default | Maps to (official calibration) |
|---|---|---|---|
| Relief | Gentle 0 – 100 Dramatic | 55 | Height range p5–p95 = 7 + 0.08·relief levels (7–15; official 9–15, median 13). Cliff-tile share 0.06 + 0.0018·relief (0.06–0.24; official 0.07–0.24, median 0.16). |
| Highest terrain | 10 – 16 | 16 | Terrain never exceeds this. 16 is the in-game map editor's limit and every official map's top. Heights 17–22 come only with high Verticality (§5.9) and tall Real places (§20 D172); the in-game editor cannot edit them, and each tall map's description says so. |
| Terracing | Smooth 0 – 100 Distinct | 50 | The share of height steps that are one level: 0.86 − 0.0059·terracing (0.86–0.27; official median 0.62). Higher terracing gives wider flat benches and more cliffs. |
| Buildable land | Tight, Normal, Generous | Normal | Land walkable from the start through slopes of at least 750 / 1,300 / 2,500 tiles (official min 765, median 1,296, p90 4,523), and flat share 0.40 / 0.52 / 0.60. As built (M6, D59): the valley floor's width, how jagged the terrace edges are, and where the terraces' cliffs go (Tight: at the valley floor's edge; Generous: above every one-level rise). |

#### 5.3 Water

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Rivers | 0 – 3 | theme | Number of rivers entering on the map edge. 0 means only lakes, springs and seeps. As built (M6, D60): in River Valley and Canyon the first is the main river and the others are tributaries from the north or south edge, each bringing a quarter of the main river's flow; in Lake Basin they feed the lake. With 0 a spring feeds the main river (Lake Basin: the lake). |
| River style | Straight, Meandering, Braided | Meandering | Straight: meander amplitude ≤ 0.05·H. Meandering: 0.12–0.2·H with 1–3 bends per 100 tiles. Braided: the channel splits into 2–4 parallel channels around islands over a wide flat stretch (Delta). |
| River flow | Trickle, Normal, Strong, Lush | Normal | Total clean source strength: 0.6× / 1× / 2× / 4× the size-aware official median (medium 2.2, large 1.2, max 1.1 per 10k tiles). Lush is about the workshop median. Sources are mostly 0.5 each, in rows of 3–8 across a channel, as in official maps. This controls river size and how fast reservoirs refill, **not** drought survival. |
| Drought reserve | Scarce, Normal, Plenty | Normal | Minimum stored water near the start, as a multiple of the colony's drought need (§11.4): 1× / 1.5× / 3×. Also sets the number of dam sites and natural basins the layout aims for. Since M9a stored water near the start is information the generator prefers, never a guard (#67): a reserve larger than the theme's own adds valley lakes along the rivers and has the generator try up to four more attempts for a map with a dam site or natural water holding the need (the same field once, then new land); a smaller one takes valley lakes away (decisions-pending #88). This setting is what makes droughts forgiving. **Not every combination fits a small map** (§9.1, §9.10). Reservoirs are 2 deep on Easy and Normal and 3 deep on Hard, so Hard with the Normal reserve needs about 590 tiles and Hard with Plenty about 1,170. The panel disables combinations whose reservoir would exceed 15% of the map area and says why. The smallest sides that fit are: Normal with Plenty 51, Hard with Scarce 52, Hard with Normal 63, Hard with Plenty 89. Every size preset (96² and up) fits every combination, so the guard only affects custom sizes. |
| Lakes and basins | None, Few, Some, Many | Some | Natural basins of 20+ tiles that hold water without a dam: 0 / 0.5× / 1× / 2× the official median for the size (small 1.5, medium 4, large 15.5, max 15; `basins_ge20` in the calibration table). As built (M6, D61): riverside ponds, dug two levels below a river's bed beside it and joined to it by a short cut, so the river keeps them full and they keep their water through a drought. |
| Waterfalls | Off, Few, Many | Few | Number of bed drops of 2+ levels: 0 / 1–2 / 3–6. Drop height, width and flow ranges in §9.2. Generated falls sit on rivers and carry that river's flow, so they are 1–9 tiles wide, like official falls. Wider "landmark" falls are a set piece the player or Claude adds. |

#### 5.4 Hazards

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Badwater | No badwater, Low, Normal, High | Normal (Highlands and Islands: Low) | Every map has at least one badwater source, a late-game resource like the mine site, unless the player picks **No badwater** for a peaceful map: none is placed, badtides still turn every source bad, and the share link (`bw=0`) and the map's description record it (D200). As built (D200): the sources and their total strength are the official maps' for the size (`investigation/official-baselines.json`: 1 / 2 / 4 / 3.5 sources and 1.25 / 3.5 / 5.5 / 6.5 strength for small / medium / large / max maps, joined in ln(area)), moved within the official typical range by the seed, then × 0.5 / 1 / 1.5 (sources) and × 0.5 / 1 / 1.75 (strength) for Low / Normal / High; each source 1–3 strong (official median 1.5). Each is a BadwaterSource 3×3 in a side basin (§9.5), in a hollow or a side valley first. Where fewer hollows fit than the budget asks (a small map), the ones placed share its total, each up to 3 (M9a). Before D200 (M6, D62): the rivers' flow × 0 / 0.3 / 0.65 / 1.2 (the official badwater-to-clean ratio, 0.18–2.2, median 0.71), in basins of 1–3 each. |
| Badwater distance | 8 – 60 (12 – 60 before M8) | 15 (Easy 30, Hard 8), Kyler's decision (D85; the workshop study's W4); before M8 30 (Easy 40, Hard 15) | Distance from the start to badwater or contaminated soil the generator aims for (official p10 12, median 30). The basins are placed about 14 tiles beyond it (D62). Since M9a a hollow aims at the distance + 11 tiles from where the start is expected; the start is then chosen, among the places nearly as good as the best, nearest there, and the hollows are planned again from the real start when their badwater lands within the distance or more than 26 tiles beyond it (D200 (2)). The start rule "No badwater within" (§5.6) is the same value: the panel sets both, and validation uses the larger. Since M8 it is a target with an advisory warning, never a reason to reject (D85). The workshop study measured the official maps' nearest badwater to the start: median 14.8, p25 10. |
| Thorn belts | Off, Some | Some (Highlands, River Valley) | 1–3 belts of 13–40 thorns across corridors or plateaus, never within 20 tiles of the start. As built (M7, D75, D81): each belt crosses the way from the start to a relic or a geothermal field, 5–8 tiles in front of it (with none left, a stretch of dry ground), 9–17 tiles across and 2–3 deep, every thorn 22+ tiles from the start; a belt that would cut the colony's land in two is left out. |
| Unstable cores | Off, On | Off | Advanced. 1–4 cores, 40+ tiles from the start, first countdown at cycle 5+, radius 2–3, never within radius + 2 of each other or of a dam site (no chain reactions). As built (M7, D81): countdown in cycle 5–12, 10.5 days in (the official maps' value). |

#### 5.5 Resources

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

#### 5.6 Start and difficulty

**Start requirements** (Kyler, 2026-09-24, amended the same day; D85; built at the start of M8;
amended by Kyler on 2026-09-25: the water rule walks over the map's own slopes, D153, and starting
wood counts logs, D164). They are the only start rules that reject a map (§11.4). Each threshold is a
setting under "Start rules", with the difficulty's default:

| Requirement | Easy | Normal | Hard | Rule | Setting |
|---|---|---|---|---|---|
| Water without stairs | 12 | 20 | 28 | Clean pumpable water (depth ≥ 0.3, contamination < 0.05) touches a shore tile the start reaches on foot within this many tiles' walk, over the map's own ground and its natural slopes (the map's Slope entities; never stairs the player builds). Levels may change along the walk, through slopes. Rivers, lakes and ponds count. A pump on that shore reaches the surface (0–2 levels below the shore). Since D302 the water must be fed by a running source or be a lake that lasts the difficulty's drought (9 / 30 days at Normal / Hard; water a pump reaches still within the walk after it), never a sealed puddle. | the water-distance rule (`sw`, 4–40) |
| Starting wood | 250 | 200 | none (0) | At least this many logs of grown trees within 20 tiles' walk of the start (slopes allowed), each tree by its species' yield (oak 8, pine 2 and resin, birch 1; maple 6, chestnut 4 and mangrove 2 on imported maps: the game's blueprints, `src/core/data/log-floor.json`; the file's own logs where it stores them), alive or dead. A sapling's logs count only once it has grown; the indicators and the map card show them apart, as wood still growing (D164). "How comfortable is it": Hard has no minimum nearby beyond the floor below (D227; M9a replaced D164's 120 / 80 / 40). | **Minimum starting wood (logs)** (`sl`, 0–800) |
| The starting-logs floor | 178 | 178 | 178 | At least the floor of logs, counted as Starting wood counts them, within about 40 tiles' walk of the district center, over the map's ground and its natural slopes, at every difficulty ("can I survive": enough to build a Forester by the worst still-viable route, plus a water pump, a dwelling and, for Iron Teeth, a Breeding Pod, plus 10%; D224, D227). Computed from the game's own blueprints by `tools/log-floor.ts` and pinned with the game version in `src/core/data/log-floor.json` (178 for 1.1.2.4); recomputed when the game's version changes. Absolute: generated maps, Real places and Pick a place must meet it; the editor shows it on the quiet dot without blocking export. | none (never configurable) |
| Starting bushes | 40 | 30 | 20 | At least this many living berry bushes within 20 tiles' walk of the start (slopes allowed), across any number of patches. | **Minimum starting bushes** (`sb`, 0–200) |

"Living" means the plant survives at steady state. Changing Designed for resets the three to the
difficulty's defaults (D66). The generator never aims below a minimum, and any target that sits
lower rises to it (Easy's Berries near start becomes 40); near-start groves aim at 1.35 × Minimum
starting wood in grown logs, and where the walk holds little moist land they draw their species by
the wood they give as well as by the mix. The map's own groves and patches come first; the start
rules add only what those leave short within the walk, spread over it the way the land offers it,
so no two starts get the same ring (D252, §7.7). The start's bench stands a level above the floodplain
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
| Start area | Small, Normal, Large (on the panel: Prefer tight, Normal, Prefer roomy) | Normal. A preference, never a stamped bench (D211): the land leans toward a tighter or roomier bench (radius about 5 / 6 / 8) and the start prefers a matching one; the map card shows the start's bench (level tiles within 8 of the district center). |

#### 5.7 The 1.0+ map features

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

#### 5.8 Settings from the workshop study (M9)

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

#### 5.9 Verticality (M9a; 3D forms from 3D-b)

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
  reachable land, with natural ramps (slopes) between levels where the land needs them. A ramp
  climbs the cliff where two grounds meet: its route is no longer than the ramp needs (two tiles a
  level) and never runs over higher or lower ground than its ends, so no ramp becomes a road across
  the land or a straight slot through a plateau (D209, M9a). Heights reachable only by building
  stairs are allowed, as rewards for expanding. The vertical-reach
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

## From PLAN.md: §6 Theme presets

*Condensed in the living §6 (the Target water share row and the planned M9 notes are here).*

### 6. Theme presets

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
14). The water share cap up to 0.70 (#33) no longer follows a premise's water budget: premises are
folded into intentions for M9b (D275, D278); which intentions carry a higher water share is for
M9b to work out.

## From PLAN.md: §7 Generation pipeline

*The living §7 describes the generator as it is now; §7.1 Concept, §7.2 Macro layout, §7.3 Set pieces and §7.4 Terrain (the layout-band planners, replaced by the processes of M9a, D208 and D209) and the older text of §7.5–§7.10 are here.*

### 7. Generation pipeline

Composed maps: intent first, then layout, set pieces, terrain around them, and detail last. Noise
only adds natural variation to edges. The Python `prototype/generate.py` implements this pipeline
for River Valley.

**Features first.** Stages 1–3 *plan*. Their output is a list of parametric feature objects
(§19.2): the rivers with their bed profiles, lakes and basins, landforms (valley floor, terraces,
highlands, plateaus, islands), set pieces with resolved parameters, forests, berry patches, ruin
fields, map objects and the start. Stages 4–7 *build* the map from that list with the shared build
pipeline (§19.8), the same code the editor runs after every edit. The terrain, water and entities
of a generated map are therefore exactly what its features rasterize to. "Refine this map" hands
the editor that feature list as the map's plan, for the analysis
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

#### 7.0 Normalise

- Validate the `MapSpec` (§19.1) against its schema. Clamp every setting and resolve size-aware
  targets: `target = multiplier × density(key, W·H)`.
- Derive the difficulty rules.
- Take the spec's constraints: locked regions, keep-out regions and the ids of features to keep.
  The planner treats them as occupied and protected. (They served regeneration around the player's
  edits, which D336 removed: edits never replay onto new land. The spec and share links still
  carry them.)
- Derive seed streams: `layout`, `terrain`, `setpieces`, `water`, `veg`, `ruins`, `extras` and
  `names`, each `hash(seed, stream, candidate, attempt)`.

#### 7.1 Concept

The archetype comes from the theme. Roll a **premise variant**: each archetype has 2–4 (§8), for
example River Valley's "gorge-dammed basin", "twin falls" and "oxbow bend". The variant decides which
set pieces are mandatory. The premise also fixes the macro parameters: the flow axis (one of 8
edge-to-edge directions, so maps are not always west to east), the meander phase, and the
anchor positions as fractions of the map.

**Changed for M9** (D275, D278; drops the premises-per-theme plan of D87 and §8's catalogue):
premises are folded into intentions, checked by outcome, not drawn as a layout variant (§6 of
`docs/m9-design.md`, D274). Flow-direction variety no longer comes from drawing a flow axis during
layout (D67); a finished map is rotated or mirrored into one of its 8 orientations instead, so all 8
appear and none over a quarter (D275).

#### 7.2 Macro layout

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

#### 7.3 Set pieces

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

#### 7.4 Terrain

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
   Mine-site pads are lowered by at most one level and ease into the land around them (D363).
6. **Integrity pass.**
   - Remove single-tile pits and spikes (a tile differing from all 4 neighbours).
   - Enforce bed profiles non-increasing downstream.
   - Ensure every channel tile has lower or equal neighbours downstream, so water always has a path
     to an edge or a planned basin.

#### 7.5 Connect: slopes

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

Slopes are derived at generation, before the land is shown; the player's pinned and removed slopes apply
on top. An edited map keeps the generation's slopes that still stand and never derives any again (D368
(10): only the player places objects); an imported map keeps its own slopes and gets none, the ground its
edits changed included (D52 amended). What an edit leaves out of reach is reported by the checks, never
repaired.

#### 7.6 Water

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

#### 7.7 Detail

Every placement uses the footprints in `footprints.json` and marks occupied cells, so objects never
overlap.

1. **Start**: one `StartingLocation` on the bench, the door facing the river. Keep clear a
   Chebyshev radius of 3 around it and the 3×3 in front of the entrance.
2. **Berries**: patches of blueberry bushes across the map (median 20–40, beside water) up to the
   density target, the start's share kept back; then, where they leave the start short of its target
   within 20 tiles' walk, 1–3 patches on moist soil beside clean water, on the side and at the
   distance the start's layout draws (item 3); what they leave of the start's share goes to the rest
   of the map. Bushes are ripe (`GatherableYieldGrower 1.0`) near the start and 55% ripe elsewhere,
   as in official maps.
3. **Forests**:
   - Groves are single-species blobs grown with a compactness of about 0.8, sized log-normal around
     the grove-size median.
   - The map's groves come first: living groves on moist soil up to about a quarter of it, then dead
     groves on dry soil, the start's share kept back.
   - Then the start's own groves add the wood the map's leave short of the start's target within 20
     tiles' walk (at least 40 living trees' worth; D252). Each map draws a layout from its own stream:
     a side and a distance for its groves (a bearing and a walk of 6–17 tiles they gather round) and
     for its berries (beside the groves or off to one side), a grove size (1–3 × the Grove size
     median) and an opening (as the mix, oak-rich or a pine forest; D164's lever). Each grove draws
     a kind of place from the land within the walk, as the floor's wood does (D229): a river's banks,
     across the water, a plateau, a side valley or open ground, weighted by its room on the layout's
     side and by how natural it is, its species leaning to the place. The start's yard (6 tiles) stays
     clear where the walk has room elsewhere; standing dead groves on its dry ground only where the
     moist land runs out. Where the walk's moist land is short of what the start needs, the map's
     groves and patches keep out of it and the start's groves draw their species by the wood they give.
     Then the rest of the map's trees.
   - Succulent groves go on dry soil and are alive.
   - Living trees: 35% saplings (`Growable` 0.2–0.95).
   - Dead trees: `LivingNaturalResource.IsDead`.
4. **Ruins**: §9.7.
5. **Extras**: mine sites, relics, geothermal fields and thorn belts, by distance band from the
   start, on flat dry ground outside flood reach. As built (M7, D69, D75): they are planned on the
   layout's settled water before the resources, stand at build step 9, and keep a ring of level
   ground round them; an object that cuts the colony's land in two is left out.

#### 7.8 Validate and retry

Run every check in §11. On failure, retry the whole candidate with `attempt + 1`: a new layout
stream and so a new map from the same seed. After 12 attempts, show the best failing candidate with
its report and a "Try another seed" button. Prototype pass rates are 88% (96²) and 62% (128²) on
the first attempt and 100% within 6.

#### 7.9 Candidates and score

Build K = 3 valid candidates (candidate index 0, 1, 2 in the seed streams) and keep the highest
score (§12). K is 1 on 256² when the first build took over 6 s; the card then says "single
candidate". The M2 benchmark left the 256² settle well under 3 s (§10, D33), so K = 3 stays the
default at every size.

How the candidates are chosen (D223, replacing D87's no-clone ranking and pending #53's default): **the best
candidate wins, by the map's quality score.** Variety breaks near ties only: when the scores are close, the candidate
least like the theme's usual maps (the variety score against the theme's reference maps: seeds 1–30 at default settings,
stored as 16×16 signatures and feature vectors, about 4 KB per theme) is preferred. A clearly better candidate never
loses for being more ordinary. Only true near-duplicates of other maps are rejected; resemblance is otherwise
information (the largest look-alike cluster), never a reason to reject a good map.

#### 7.10 Output

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

## From PLAN.md: §8 Archetypes

*Moved whole: the per-theme planners are gone (M9a, D208, D209); the living §8 says how themes work now.*

### 8. Archetypes

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
premise until M9 (Staircase, Many mouths, Archipelago). From M9a (D208, D209) the land and its water
grow from processes (the genome, the field, the hydrology; docs/m9-design.md), each theme only leans
the genome's ranges, and Any, the default, draws from all of them; the planners above are gone.

**Dropped from M9's plan** (D275, D278; supersedes D87's premises-per-theme catalogue above): M9
doesn't add a per-theme premises table or planner variants named for landmarks (Gorge-dammed basin,
Island in a moat, Spiral mountain, Heart lake, Heart islands and the rest). The named premises that
became intentions are in design version 2 §6 and D274; the rest are dropped. No dam ridge is built
anywhere (D111), so the old "every premise that lists a dam site keeps it" no longer applies.

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

## From PLAN.md: §9 Set pieces (with §9.11, the builders planned from the workshop study)

*Condensed in the living §9; §9.11 (dropped or unscheduled, D253, D278) moved whole.*

### 9. Set pieces

Each set piece lists what it builds, the ranges the game's limits allow, and the constraint that
validation proves. "Levels" are terrain levels. The terrain budget is 0–16: 0 is an empty column
(ground at level 0, used by official maps as river outlets), and 16 is the in-game editor's limit
(up to 22 on maps at high Verticality, §5.9).
Every builder here is a shared set-piece builder (§19.3). The generator calls it, and Claude
reaches it by steering the generator (D139); the editor's set-piece tools, built in M5 and M7,
go with Live editing (D182, D184). Each builder publishes its achievable ranges for the current
map (§9.10). Values outside the schema's hard bounds are rejected. Values inside them but beyond
what the map allows are reduced to the nearest achievable value, and the reduction is reported.

#### 9.1 Dam site (gorge and basin)

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

#### 9.2 Waterfall and cascade (power spot)

- **What it builds:** a bed drop of D levels over one tile. Water wheels want fast, narrow flow; an
  on-river fall keeps its river's width for now (the 1–3-tile narrows above the drop wait for
  in-game check C2, D48), and a standalone fall's outflow channel is 1, 3 or 5 tiles wide.
- **Two modes (one builder):**
  - *On a river* (what the generator makes). It splits the river's bed profile at the lip, and the
    river's own flow goes over it.
  - *Standalone* (a landmark away from a river: the editor's old Waterfall tool placed one, and
    under D139 and D182 a steered landmark may). It builds its own cliff, a
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

#### 9.3 Terraced cliffs (vertical building)

- **What it builds:** a stair of 3–6 bands, each 1 level high and 6–12 tiles deep, facing water. A
  slope chain climbs it at one end.
- Official maps have 18 plateaus per map (small 3, max 24). This supplies wide, flat benches at
  several levels for tall builds with water close below.
- **Stair (M6, D63):** with `stair: true` the builder makes a narrow flight: 2–8 steps 1–5 tiles
  deep and 1–12 wide, a slope on each (its chain starts on the ground in front); steps one tile
  deep make a chain of slopes. Canyon puts one up its wall beside the start.

#### 9.4 Obstacle with payoff

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
  validation check. The ridge worth tunnelling waits for M9b's intentions (D274 folds premises into
  intentions; this one wasn't among the candidates Kyler picked, so it stays an open idea, not
  built).

#### 9.5 Badwater with counterplay

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
- **As built (D200, badwater on every map):** as many basins as the official maps have sources for
  the size (§5.4), each where the ground 4–6 tiles round its floor stands higher (a hollow or a side
  valley, as 84% of the official sources stand) before open ground, at the same distances. A map
  that asks for badwater and finds no basin by the usual search tries every spot far enough from
  the start; one still without a source fails `resources.badwater_source` and is generated again.
  Real places and Pick a place get springs from `planMapResources` (`src/core/resources/badwater.ts`):
  a flat, dry 3×3 in a hollow or side valley on their ground as it stands, at least the badwater
  distance + 14 tiles from the start, the water settled again with them, and a spring dropped when
  its badwater comes nearer the start than the badwater distance.

#### 9.6 Plugged spillway

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

#### 9.7 Ruin fields

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

#### 9.8 Second district site

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

#### 9.9 Gorge

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

#### 9.10 Achievable ranges by map size

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

#### 9.11 Builders planned from the workshop study

Planned (D87; `investigation/WORKSHOP-INTEGRATION.md` §3). Each in D47's shape: `request` (hard
bounds), `limits(ctx)`, `plan`, `check`, `rasterize`, `footprint`, and `slopes`, `clears` and `area`
where it has them. The study's recipes (`investigation/workshop/recipes/`) are reference
implementations built from today's operations. **The four rows marked M9 below are dropped**
(D278): M9 doesn't add these builders; struck through, kept only for the record.

| Builder | Milestone | Request | Limits | Checks | Acceptance |
|---|---|---|---|---|---|
| ~~`spiral` (landform kind or set piece)~~ | dropped (D278) | at, radius 8–48, turns 0.75–3, levels 3–12, direction up / down, ramp width 3–12 | levels ≤ 16 − ground (up) or ground − 1 (down); radius ≤ 40% of the shorter side | a slope at every step (`slopes.connect`), planned with the ramp; terrain 0–16 | 100 plans on 96², 128², 256²: every step walkable from the foot of the ramp |
| ~~`cone` (landform edge style)~~ | dropped (D278) | outline, height, crater radius and depth, spill direction | height ≤ 16; crater depth ≤ height − 2 | a crater with water has an outlet (`water.outflow`) | the volcano premises pass their batches |
| ~~`mesaField` (set piece)~~ | dropped (D278) | at, radius 10–40, count 3–15, rise 2–6, ruins on 0–3 tops | mesas 2+ tiles apart; tops of 12+ tiles for ruins | the payoff needs one player stair (§9.4's rule) | as obstaclePayoff's range tests |
| ~~sealed `sea` (Islands variant)~~ | dropped (D278) | the sea's outline to the map edge | the edge sealed by a rim or sources along it | `water.outflow`, `water.settles`; water share ≤ the premise's budget (#33) | the Lone island premise passes its batches |
| `riverFork` | unscheduled (D253) | river, from, to (arc), island width 6–40 | arms 2+ tiles apart; both arms ≥ 3 wide | both arms carry ≥ 30% of the flow; the island stays dry | 100 forks on random rivers settle and keep both arms wet |
| lake `outlets` (2–4) | unscheduled (D253) | lake, outlets [{at, to}] | outlets 8+ tiles apart, all at the sill | every outlet carries water; none drains back into the lake | 50 hub lakes settle with every spoke wet |
| river `switchback` | unscheduled (D253) | a river path with hairpins | a wall ≥ 3 tiles thick and ≥ 2 levels above the lower reach between reaches | reaches at different levels do not leak into each other | D53's property test with hairpins allowed |
| `damSite` spurs mode | refinement | river, at, crest 1–3, gap 3–12 (and help ready / some, only if Kyler adopts Reservoir help, #31) | gap ≥ channel + 2; the spurs scale with the ground | the reservoir holds need × reserve behind a dam of `gap` tiles; the naturalness targets (ROADMAP, refinement phase) | River Valley, Canyon, Highlands batches ≥ 98% with it |

Under D139 and D182 these builders serve the generator, and Claude reaches them by steering; the
editor has no set-piece tools. In the editor, forks, outlets and switchbacks come from smart Lower
(D184). `riverFork`, lake `outlets` and river `switchback` are unscheduled (D253 removed the M11
stamps they served; ROADMAP's M9 doesn't yet cover them). The generator builds no dam site (D111),
so the spurs mode is unscheduled too (D253 removed the stamps it served).

The recipes also found that a builder must re-check the rules its change can break: a lake added
near the badwater basin brought contaminated soil 19–27 tiles from the start (`start.badwater`), a
lake beside a relic or mine site left it within 2 tiles of water (`extras.placement`), and the
spiral's slopes must be planned with its ramp.

## From PLAN.md: §10 Water simulation

*Condensed in the living §10 (the audit's performance measurements and the M2 and M6 benchmark tables are here).*

### 10. Water simulation

`sim/water.ts` is a port of the game's rules for heightfield terrain, from
[notes/water_and_soil.md, "Simplified water simulation spec"](../../investigation/notes/water_and_soil.md).

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
   with sums in index order so the Python oracle stops on the same tick); at most 6 game days (D358; 4 before 2026-10-01).
   From 3D-a (D120) the checks count columns (air gaps): at most 0.5% of the map's tiles' worth may
   still move. Only real flow is the water still changing (D222): at each check the water of a
   sealed basin that only lost water (the oxbow lake above, while no running source and no map
   edge is in it) is left out of the test, and the first check that passes then marks the water
   as settled (`steadyTicks`, `waterSteady`); the settle still runs on to its own test, so the
   water it gives, and every file, is the same as without the rule.
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
    0.05% of the map still moves by more than 0.05 (64-tick checks, one day at most), or when only
    a sealed basin's evaporation still changes it (D222). Local edits
    at 256² take at most 1.76 s in Node and 1.4–1.7 s in Chrome (Islands and Lake Basin); the
    canonical settle follows in the background, in slices, and before every export.

## From PLAN.md: §11 Validation

*Condensed in the living §11 (the rules and history of 'from M8' and 'before M8' are here).*

### 11. Validation

A generated map is offered for download only when **every** check passes (apart from the advisory
checks: `plants.drought`, §11.5; from M8 the start targets of §11.4, D85, with `water.storage_possible` in
place of `water.reservoir` from M9a (information the generator prefers, #67); and
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

#### 11.1 File

| Id | Rule |
|---|---|
| `file.size` | 4 ≤ W, H ≤ 256 (generator: 48 or more) |
| `file.layers` | exactly 23 voxel layers |
| `file.version` | `GameVersion` and `version.txt` equal `1.1.2.4-52e959e-sw` (any `1.1.x` accepted when validating external files) |
| `file.singletons` | MapSize, TerrainMap, WaterMapNew, SoilMoistureSimulator, SoilContaminationSimulator, WaterEvaporationMap and `WaterSimulationMigrator{IsMigrated:true}` present |
| `file.arrays` | every packed array holds exactly `W·H·Levels` tokens; `Levels` is at least the terrain's floor count |
| `file.metadata` | all 8 keys; Width/Height equal MapSize |
| `file.thumbnail` | 960×540 JPEG |

#### 11.2 Terrain and objects: emulating the game's loader

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

#### 11.3 Water

The canonical settle (§10) of the map's own sources. A water tile is one deeper than 0.05;
clean water has contamination under 0.05.

| Id | Rule |
|---|---|
| `water.settles` | Steady within 6 game days (D358): volume change under 0.2% and 99.5% of tiles within 0.005 between 128-tick checks. A steady flow off the map is steady: maps need not hold their water (D152); what fails is water that never settles. Only real flow counts (D222): a sealed basin that is only evaporating (a carve's oxbow lake: the water round its kept tiles, 4-connected, with no running source's tile and no map-edge tile in it; its tiles that lost water) is left out of both measures, so a map whose drying lake is all that still changes has settled. Both validators apply it (`sim/water.ts` `steadyApartFromSealed`, `prototype/watersim.py` `steady_apart_from_sealed`); a `.timber` alone records no sealed basin, so there it changes nothing, and it never changes a generated map. |
| `water.no_flood` | Wet share ≤ 0.35 (≤ 0.55 for Lake Basin and Any; ≤ 0.70 for Islands, D369); official p90 0.40. Decisions-pending #33's premise-based cap (up to 0.70 for water premises) is dropped with the premises (D278); workshop maps: median 0.27, p90 0.67. |
| `water.clean_exists` | Clean wet tiles ≥ 2% of the map. Since D152 a target with an advisory warning: maps need not hold their water, and the start's water is `start.water`'s. |
| `water.outflow` | Every running source's water reaches an edge or a planned basin: its connected wet region (depth > 0) touches a map-edge tile that drains (not a walled source tile) or a lake feature. Not applicable without features (imports). |
| `water.clean_reach` | At least one connected (4-neighbour) body of clean water of 40+ tiles. Since D152 a target with an advisory warning, as `water.clean_exists`. |
| `water.source_in_flow` | Sources start rivers (Kyler, 2026-09-25, D171): no WaterSource or BadwaterSource stands where water from another source comes down to it. Emitters whose tiles touch are one group (a sealed mouth, a cluster at a river's head). Water runs down the spill levels, across a flat toward its way out and never back, and all through a pool; a group's water goes from its tiles over the settled water. A group is inside a flow when a running group's water reaches one of its sources and its own water does not reach that group back. Design class. |
| `water.badwater_contained` | With the planned outlet channel's tiles blocked (a levee, §9.5), the water rising in each planned badwater basin cannot leave the basin (its 7×7 floor and two-tile rim) or reach a map edge below the rim's level. A source never stops, so this proves the outlet is the basin's only way out, not that a levee holds forever (D57, pending Kyler). Not applicable without a basin with a planned outlet. |
| `water.storage_possible` | From M9a, in place of `water.reservoir` (D111): the start's pump shore is fed by running clean water (at least need ÷ two days) and a dam site, natural pools or levees within 40 tiles hold the need (need × drought reserve, §5.3). Dam sites are sampled as before (every second clean water tile within 60 tiles of the start, crests 1–3, or 1–4 with Hard's depth rule); natural pools are the water kept through the worst drought (§10); levees raise clean water within 40 tiles 1–3 levels, up to the start's own level, behind a short line of levees. Information the generator prefers, never a reason to reject (#67, D209). Both validators. |
| `terrain.dam_wall` | From M9a (D111, D115): no built ridge that is a dam in all but name, a straight wall across a valley with a gap for the river (`analysis/ridge.ts`). A principle (D115): it blocks in `generate` and `export` and is information on an import. Both validators. |

#### 11.4 Start and playability

These use the start requirements and difficulty targets of §5.6. "Near" means reachable by walking.
From the start of M8 (D85) the three start requirements reject a map, and the start targets are
advisory: the generator aims for them, and the map card warns when a map misses one. The last
column says which; until M8 every row rejects, with the rule before M8 given in the row.

| Id | Rule | From M8 |
|---|---|---|
| `start.dry` | No water within Chebyshev 2 of the start centre after settling. From 3D-a (investigation/terrain3d I-11), water under a roof counts only where it stands at or above the start's floor (the floor rule; Kyler, D145). Open water keeps the rule above until Refinement item 8 has measured whether the floor rule should apply to it too, which would let lakeside starts pass (D107). | rejects |
| `start.water` | Requirement 1, water without stairs (amended by Kyler, 2026-09-25, D153): clean water (depth ≥ 0.3, contamination < 0.05) touches a shore tile the start reaches on foot within the water-distance rule's walk (12 / 20 / 28), over the map's own ground and its Slope entities (never player stairs), and a pump on that shore reaches the surface (0–2 levels below the shore). Since D302 (Kyler, 2026-09-28) only water in a body (4-connected, over 0.001 deep) that a running source feeds (an emitter of strength over 0 in it), or that lasts the rule's drought (after `droughtStorage` for the difficulty's drought days, one of its tiles a pump reaches within the walk still is), counts: never a sealed puddle (`startWaterShore`, `start_water_shore`); the generator plans a start again when its water is only such a puddle. As built in M8, the walk stayed on the start's own level; before M8: water 0–2 levels below the start within 10 / 16 / 22 tiles, straight distance. | rejects |
| `start.reach_water` | Before M8: that water borders land walkable from the start. From M8 it is part of `start.water`. | — |
| `start.wood` | Requirement 2, starting wood (D164, D227): the logs of the grown trees within 20 tiles' walk (slopes allowed), alive or dead, by species ≥ Minimum starting wood (250 / 200 / 0 from M9a; 120 / 80 / 40 before); saplings' logs are reported apart. As built in M8: living trees ≥ 60 / 40 / 20; before M8: trees within 20 tiles and reachable ≥ 80 / 50 / 40. | rejects |
| `start.wood_floor` | The starting-logs floor (D224, D227; from M9a): the same logs within about 40 tiles' walk (the pin's `withinWalk`) ≥ the floor (178 for 1.1.2.4, `src/core/data/log-floor.json`), at every difficulty. Never approximate: its logs are counted over the ground and its slopes, never the water. Both validators. | rejects (the editor: on the quiet dot, never blocking export) |
| `start.food` | Requirement 3: living berry bushes within 20 tiles' walk (slopes allowed) ≥ Minimum starting bushes (40 / 30 / 20). Before M8: within 20 tiles and on or beside reachable land ≥ 20 / 40 / 40. | rejects |
| `start.badwater` | No badwater water or contaminated soil within the badwater distance (from M8: 30 / 15 / 8). | advisory |
| `start.reach` | Dry tiles walkable from the start (same level, plus slope links; blocked by Thorns, Blockage, NaturalDam, relics, cores, geothermal and mine sites) ≥ the buildable-land target (750 / 1,300 / 2,500). | advisory |
| `start.ruins_clear` | No ruin column within 20 / 15 / 12. | advisory |
| `plants.survive` | Every living tree and bush stands on moisture > 0, no water and clean soil. Every living succulent is on moisture 0. | rejects |
| `resources.scrap`, `resources.trees`, `resources.bushes` | Totals ≥ 0.5 × the size-aware official median × the setting multiplier (about the official p10). Information since "Resources like the official maps" (D167–D170). | advisory |
| `resources.mine_site` | At least one mine site (D167). | rejects |
| `resources.badwater_source` | At least one BadwaterSource or BadwaterSeep, unless the map is set to No badwater: its Badwater setting, or, for a map without its settings, its description saying No badwater (D200). | rejects |
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

#### 11.5 What the prototype already checks

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

#### 11.6 Report

Each check yields `{id, class, severity, ok, value, limit, message, where?, fix?, advisory?,
applicable?}` (§19.5, `validate/report.ts`): `where` is the tiles, feature or entities involved,
and `fix` an optional list of edit operations the editor offers as a one-click fix (M2 proposes
`deleteEntities` for plants that would die and ruins next to the start; the M3 operations engine
applies them). Severity follows the profile: load failures are errors everywhere; playability and
design failures are errors in `generate`, warnings in `export`, and warnings and information in
`import`; advisory checks warn. The map card groups them into File, Terrain and objects,
Water, and Start and resources. Failures are explained in player terms, for example
"The start is 23 tiles from pumpable clean water; Normal allows 16 (beavers go thirsty on day 6)."

## From PLAN.md: §12 Interestingness score

*Moved whole: dropped for M9 (D278); the code has no score.*

### 12. Interestingness score

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

**Dropped from M9's plan** (D278, amending D223): M9 no longer ports a 12-component score, and
`score/score.ts` above is not used to choose among M9's candidates. A seed's candidate is chosen by
whether it meets D273's five outcomes (the theme's signature, at least one standout intention,
readable water), within a capped number of attempts, not by a score; the permanent measures (no
clones, no archetypes, play variety, no approximation of workshop maps) stay as information on
every milestone. `fit-score.ts` and `ratings.json` were already dropped (D137).

## From PLAN.md: §13 Names and premises

*Replaced by the living §13 (names and descriptions as they are now).*

### 13. Names and premises

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
- **Changed for M9** (D274, D278; drops the catalogue premise plan from D87): premises are gone;
  M9's names and its one-line "how it plays" description come from the map's standout intention
  (design version 2 §6, D274) and its read-back features, checked on 30 hand-checked maps (10 at
  Variety 100). The catalogue's landmark word list above (*island in a moat*, *spiral mountain* and
  the rest) is not adopted into M9's naming.

## From PLAN.md: §14 Website features

*Condensed in the living §14.*

### 14. Website features

#### 14.1 Layout

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
    editor's export check. Generating again makes a new map; the edited one stays saved and one step
    away (D336).
  - **Open a map**: any `.timber` or project file opens in the editor.
- **Generate** is always visible. Seed has a dice button. Changing a setting marks the preview stale
  and offers "Generate"; auto-regenerate is optional (default off at 256²).

#### 14.2 Preview

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

#### 14.3 Map card

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

#### 14.4 Download

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
- **Internal only:** a file without pre-filled water, for the in-game A/B check (§18), the probe and the tests; not in the
  player's interface (D237: its page button goes with "The page is the editor").

#### 14.5 Shareable links

- **State in the URL fragment:**
  `#v=<generatorVersion>&s=<seed>&t=<theme>&z=<size>&d=<difficulty>` plus only the settings that
  differ from the theme preset, in short keys (`rl=70`, `fl=2`). Base64url for custom species
  weights.
- **Old versions:** a link whose `v` is older than the current generator shows
  "Made with v1.2 — open in v1.2 (exact) or generate with v1.3" (a new map; edits never replay
  onto new land, D336). The first option goes to
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

#### 14.6 Report a problem

As §2.3: a plain **Report a problem** link to GitHub issues, for bug reports (M13; D145).

## From PLAN.md: §15 Testing

*Condensed in the living §15.*

### 15. Testing

| Layer | What | When |
|---|---|---|
| **Unit** (Vitest) | RNG streams; sine polynomial error < 1e-9; noise; C#-style float formatting; world.json encoding; footprint transform (all templates × 4 orientations vs `footprints.json`); slope orientation; region labelling; dam-site finder; score normalisation. | every push |
| **Round trip** | Read → write → read on every fixture map (official maps are not redistributable, so CI uses generated fixtures plus a local job for `investigation/raw`); byte-identical `world.json`. | every push (generated); local (official) |
| **Water golden vectors** | TS sim vs Python fixtures (`tests/golden/water.json.gz`) after 50/200/975 ticks within 1e-6; moisture mask exact; pre-fill, canonical settle and drought storage; the analytic drought within 5% of the simulated one; the game's own save reproduced within 0.001 (local only). | every push |
| **Determinism** | `tools/determinism/` (D366): generation (every theme, 128² and 256²), every brush, every force at three Powers and Sizes, long mixed sequences, placements with undo, redo and reopening, the water and the Badtide give the same full-state SHA-256 checkpoints in Chromium, Firefox, WebKit and Node; a force's record is the same however fast it was planned. No native approximate maths in `src/core/` (the guard in the quick suite). | every push (the short list, one Linux runner); nightly (the full list on Linux x64 and ARM64, Windows and macOS ARM64, compared across hosts) |
| **Oracle** | The Node CLI writes 50 seeds × 3 sizes; Python `validate.py --load-only` and `roundtrip_test.py` must pass; on 50 of them, and on the 19 official maps when present, each TS check verdict must equal the Python verdict. | every push (5 seeds); full at each milestone |
| **Contract** (§19) | The `MapSpec` schema accepts every preset and rejects out-of-bound values. Features survive a JSON round trip. `build(features)` equals the generated map byte for byte. An incremental rebuild after a feature edit equals a full rebuild. Feature and entity ids stay the same when an unrelated feature is added or removed. Import normalization (migrator halving, 4-field water, legacy `Heights`) is checked on the investigation maps. | every push |
| **Golden maps** | 12 pinned seeds (2 per theme; 96² and 256²): sha256 of the `.timber` plus key metrics (score, check values). Any change must be intentional: `npm run golden:update`, and the diff shows the metric changes. | every push |
| **Batch pass rates** | `tools/batch.ts`: 100 seeds per theme per size at Normal, plus 30 at Easy and Hard. Report first-attempt and final pass rates, failing checks, score distribution and timings, with generated metrics beside the official ranges. Blocking: final pass rate ≥ 98% within 12 attempts. Reported as numbers (D115, D145): first attempts (60% as the target) and the median 256² time (8 s as the target). | nightly and before release |
| **End-to-end** (Playwright) | Generate → preview → download on 128²; share link round trip; layer toggles; worker cancel. | every push |
| **In-game** | §18, once per milestone that changes the file format or the generator's physical rules, recorded in `docs/ingame-log.md`. **Deferred (D11):** Kyler skips in-game checks for now. Each milestone lists its checks in the log as *pending* and does not wait for them; the automated validation and tests above carry the gate until the checks are played. | per milestone (pending) |

## From PLAN.md: §16 Milestones

*Moved whole: ROADMAP.md owns the steps.*

### 16. Milestones

**The order of work is now [ROADMAP.md](../../ROADMAP.md)**, which merges these milestones with the
editor's. The shared foundations (§19) come first. From its first milestone the generator writes
maps whose features the editor can open. The table keeps the original scope of each generator
milestone and says where it went. Effort: S under a day, M 1–3 days, L 3–7 days of focused work.

| # | Milestone | Delivers | Acceptance | Roadmap |
|---|---|---|---|---|
| **1** | **End-to-end slice** (L) | Vite + TS + Preact app shell. `core/format` (writer, footprints, C# float format, fflate, jpeg-js). RNG streams. River Valley ported from the prototype *without* the water sim: sources placed, water left as zeros. Slopes and start rules. File and placement validation (§11.1–11.2). 2D preview (terrain, start, entities). Settings: seed, size preset, difficulty. Download. GitHub Pages deploy. **Added:** `MapSpec` v1, the feature schema v1 and the feature-first River Valley (§19), stable ids, per-feature RNG streams, the reader as well as the writer, the project file download, and the `calibrated.py` alignment (§4). | 50 seeds × 3 sizes pass Python `validate.py` file and placement checks and `roundtrip_test.py`; identical sha256 in Node and Chromium for 10 seeds; 128² generates in < 3 s; **added:** rebuilding from the project file reproduces the `.timber` byte for byte; **in-game check A** (§18). | M1 |
| **2** | **Water and playability** (L) | `sim/*` exact port with golden vectors; steady-state water, moisture and contamination; pre-filled water in the file; vegetation placed from moisture; all §11.3–11.4 checks; retry loop; map card with validation report; water, moisture and reach layers. **Added:** the exact active list and the canonical settle, validation classes and profiles (§19.5), and the water benchmark that fixes the §10 budget. | Golden vectors pass; the game's save reproduced within 0.001; batch 100 seeds at 128² Normal: final pass ≥ 98%, first attempt ≥ 60%; **in-game check B** (pre-filled water, tree survival). | M2 |
| **3** | **Settings, sharing, themes I** (L) | The full settings panel (§5) with reference bands; URL codec; Canyon and Lake Basin archetypes; set pieces dam site, waterfall, terraced cliffs, badwater counterplay; the dam-site layer. | Each setting moves its measured target in batch runs (a test per setting); share links reproduce byte-identical files; batch per theme ≥ 98% final pass; **in-game check C** (build a dam at a generated dam site; a waterfall runs a water wheel). | Set pieces and in-game check C: M5 (built once, shared with the editor). Settings, sharing and themes: M6. |
| **4** | ~~**Interestingness**~~ (M) | `score.ts` calibrated on official maps; K = 3 candidates with progressive preview; names and premises; score on the card. **Superseded for M9 by D278**: candidates are chosen by D273's five outcomes, not a score; names and a one-line description come from the map's standout intention. | The official score distribution is documented; recommended official maps in the top third; the name and premise match the detected features on 30 hand-checked maps; 256² with K = 3 ≤ 20 s. | M9 |
| **5** | **Themes II and 1.0 features** (L) | Highlands, Delta, Islands; second district; obstacle-with-payoff set pieces; NaturalDam weir; plugged spillway; thorn belts; relics; geothermal; mine sites. | Batch per theme ≥ 98%; every new object passes the placement emulation; **in-game check D** (the new objects load with no loading issues; demolish a spillway plug). | M7 (with the editor's resources and map-object tools) |
| **6** | **3D, ratings, polish** (M) | Lazy three.js view; ratings flow and `tools/ratings.ts`; install help; the Impeccable design pass with the timbermods design system; accessibility (keyboard, contrast) and mobile layout; versioned deploys `/v/<version>/`. | 3D builds in < 1.5 s at 256²; a Lighthouse performance score ≥ 90 on desktop; a rating issue created from the page with every field filled; an old-version link reproduces its file. | 3D view: M4 (one renderer for preview and editor). The rest: M13, without the ratings flow (D145). |
| **7** | **Later** | NaturalOverhang bridges; seeps and an arid theme; caves with stacked-column water; aquifers; badtide drains; unstable cores out of Advanced. | Each behind a feature flag until its own in-game check passes. | Later |

## From PLAN.md: §17 Risks and open questions

*Moved whole: resolved risks and answered questions.*

### 17. Risks and open questions

| Risk or question | Impact | Mitigation |
|---|---|---|
| **Pre-filled water behaves differently in game** (the loader copies depth by slot and recomputes floors; untested with our tokens). | Rivers surge or drain at start. | In-game check B compares the pre-filled file with the empty-water file of the same map (the prototype writes both). Fallback: ship empty water; the game fills rivers in about a day, and living trees are within moisture reach of the *settled* river, so they survive (their dry timers reset). |
| Cross-browser floating point in the water sim. | Share links reproduce a different map. | Only IEEE-exact operations and the portable maths on output paths (§2.1, D366); the cross-engine determinism check on every push and the CPU matrix nightly. The water result feeds placement, so a divergence would move trees; the golden tests catch it. |
| Generator changes break old share links. | Players lose maps. | Versioned deploys `/v/<version>/`; the version in the link and the map description. |
| JS performance of the Dijkstra moisture pass and the sim at 256². | Slow generation. | Budgets in §10; a binary heap over typed arrays; active-set simulation; a priority-flood initial state; progressive candidates. |
| Official calibration is 19 maps (2 small, 3 medium). | Small-map targets are noisy. | Blend with workshop numbers for small maps; tune from the objective measures and the in-site feedback on generated maps (D137). |
| Heights above 16. | Unknown editor behaviour. | The probe batch confirmed that maps up to 22 load and keep their terrain, water and objects (§18 E1; D172, run 20260925-tall). Kept at 16 except at high Verticality (§5.9, D132) and on tall Real places (D172); the in-game editor edits only up to 16, and each tall map's description says so. |
| Aquifer drills only work in temperate weather (per code). | Would mislead if used. | Left out (§5.7). |
| Map name is the file name. | Players rename files and lose the name. | Also stored in `MapDescription`. |
| Iron Teeth's district center on the StartingLocation. | Iron Teeth starts fail on some maps. | Same 3×3×5 footprint and entrance per the blueprints; in-game check A covers one Iron Teeth start. |
| The water sim is slower in JS than §10 first assumed (audit: 6.5–11 s cold at 256² unoptimized). | Slow generation at 256²; a sluggish editor preview. | Exact active list and the deterministic pre-fill; warm starts for editor previews; M2 benchmark gate; K = 1 at 256²; the editor re-settles only what changed (§10). |
| Features first is a bigger port than "port the prototype". | M1 takes longer. | It is the price of a generator whose plan the editor and Claude build on (the analysis, steering; D139, D182). The prototype's layout already has the structure (river path, bed profile, gorge, basin, falls); M1 only makes it explicit. |
| Thin waterfall lips may not read as falls in game. | Claude's "giant waterfall" looks like a wet cliff. | In-game check F1; the waterfall builder reports lip depth; flow policy (§9.2). |
| Imported pre-1.0 maps lack `WaterSimulationMigrator`. | Re-exported maps would run at double strength. | Halve strengths and outflows at import, as the game does on load (§19.6). |

Kyler answered the open questions on 2026-09-24 (§20, D12–D14):
1. The address is the `dam-good-maps` repository in the timbermods organization:
   `timbermods.github.io/dam-good-maps/`.
2. Hard maps are warned, never refused: a Hard-designed map with a Scarce reserve generates, and
   the map card says so ("that's part of the fun").
3. GitHub issue ratings are fine (superseded by D145: no rating form, only a "Report a problem"
   link).

## From PLAN.md: §18 In-game checklist

*Condensed in the living §18.*

### 18. In-game checklist

Short, and needs you. Each item names the file to use from `out/` (or the milestone's batch
output), what to do, and what should happen. Record the result in `docs/ingame-log.md`.

**Deferred (D11).** Kyler is skipping in-game checks for now. Milestones do not stop or wait for
them: each milestone lists the checks it would have needed in
[docs/ingame-log.md](ingame-log.md) as *pending*, names the files to play, and relies on the
automated validation and tests in §15. The checks below stay the definition of each one.

**A. Load and start** (roadmap M1, with `out/m1/River Valley (4242).timber`; see
[docs/ingame-log.md](ingame-log.md))
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

## From PLAN.md: §19 Shared foundations with the editor

*Condensed and merged with EDITOR_PLAN's Part 2 in the living §19 (the as-built histories of the builders and the old project-file notes are here).*

### 19. Shared foundations with the editor

The generator and the editor are one app. This section is the only definition of what they
share. [EDITOR_PLAN.md, Contract with the generator](../../EDITOR_PLAN.md#contract-with-the-generator)
points here and adds nothing of its own. If either plan disagrees with this section, this section wins, and any change
to it is recorded in §20.

#### 19.1 Map spec

`MapSpec` is a TypeScript type and a versioned JSON Schema (`core/spec/mapspec.schema.json`). The
settings panel, the URL codec and Claude all produce it.

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
  rejected, never clamped. A patched spec makes a new map; it never regenerates a document under
  its edits (D336).
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

#### 19.2 Parametric features

One schema (`core/features/schema.ts`) covers every feature. The fields every feature has are
`{id, kind, origin: "generated" | "user" | "claude", params, locked}`. The generator's
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
| `mapObject` | kind (mineSite / relic small, medium, large / geothermal / thornBelt / weir, a NaturalDam line / plug, a Blockage line / bridge, a NaturalOverhang pair / unstableCore), placement (a single object: its footprint's south-west corner and facing; a line: its tiles as runs), core (an unstable core's radius 0–5 and countdown cycle) | Footprints, OccupyAllBelow and first-column rules (§11.2). As built (M7, D69): one placement rule for the generator, the tools and the preview: level ground for single objects, dry and off rivers (weirs and plugs go across them), free of other objects, caves and the start. The bridge waits (§5.7). |
| `carve` kinds (3D-b, D118): `tunnel`, `arch`, `skyBridge`, `cave`, `ledgePath`, `overhang`, `undergroundRiver` | a path or area plus a z range; width, height, profile; ends and floors | Built only by their builders, which keep the support rule by construction; the build's rule pass drops 0 voxels. Floors are run tops. |
| `start` | position (centre tile), orientation, bench radius, player (0–3, default 0) | A flat 3×3 with 5 free layers, and the entrance tile free at the same level. Exactly one per map in vanilla. `player` is reserved for Timber Together maps (D5): one start per colony, numbered from 0. |

- **Derived layers** are rebuilt every time and never edited as features: slopes (pinned or
  removed slopes are stored as edits), water, soil moisture and soil contamination.
- **What a generated map's plan holds** (for the analysis and
  Claude's steering; the editor does not show them as objects, D182): every river, lake and
  planned basin; the landforms of its
  layout (valley floor, terrace bands, highlands, plateaus, islands); every set piece; every
  grove, as a forest; every berry patch, ruin field and map object; and the start.
- Every entity the build places records its owning feature. The ownership is kept in the document,
  not in the `.timber`.

#### 19.3 Set-piece builders

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

#### 19.4 Stable ids

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
- Edits refer to ids. An edit whose target no longer exists after another edit becomes orphaned and
  is shown to the player, never dropped. Edits never replay onto new land (D336).

#### 19.5 Validation

One set of modules (`core/validate/`) with the calibrated thresholds serves generation retries,
the editor's live checks and export gating.

- **Check result:** `{id, class, severity, ok, value, limit, message, where?, fix?}`. The classes
  are `load`, `playability` and `design` (§11). A check marked advisory (today only
  `plants.drought`; from M8 also the start targets of §11.4, D85, and from M9a `water.storage_possible`) is
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

#### 19.6 Format I/O

There is one reader and one writer (`core/format`), verified by the round-trip tests.

- **Writer:** always the native 1.1 format of [FORMAT.md](../../FORMAT.md), with deterministic bytes.
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
  features, edits, meta, `generatorVersion` and built base. The base is the whole map:
  surface heights, the multi-run columns verbatim, and world.json's exact text without its
  terrain array (D37). From format 3 (M9a, D119) the terrain is stored as heights plus runs: every
  tile that is not one plain run from z = 0, as its solid runs, in both `field` and `base`; maps
  without 3D forms store an empty list. A document opens exactly even after the generator has
  changed: it shows its stored base until the player rebuilds it with the current generator. M1
  and M2 files (format 1, heights only) still open, rebuilt from their features.

#### 19.7 Determinism

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

#### 19.8 Build order

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

Generation plans the features (§7.1–7.3), then runs this pipeline. An old project's land kept
under a lock (before D253) stays untouched by steps 1–13.

#### 19.9 Platform adapters

The core never touches the DOM or a platform API. Five adapters let one codebase build both the
website and the Claude artifact edition (EDITOR_PLAN.md, Claude integration):

- **files:** save and open (a file input or a drop, read as bytes);
- **storage:** autosave (IndexedDB on the website; every call fails quietly when browser storage is
  unavailable, D44);
- **workers:** a module URL on the website, an inlined blob in the artifact;
- **claude:** the Messages API, or the artifact's `sample` capability;
- **download naming:** `.timber` on the website; a `.zip` holding the `.timber` in the artifact,
  whose downloads allowlist has no `.timber`.

## From PLAN.md: Changes from audit

*Moved whole: the list of the audit's changes (docs/archive/AUDIT.md records why).*

### Changes from audit

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
13. §16: milestones mapped to the merged [ROADMAP.md](../../ROADMAP.md). M1 now includes the feature
    model and the project file.
14. §17: new risks (JS water performance, features-first port size, thin waterfall lips, pre-1.0
    imports). §18: new in-game checks F1–F4.
