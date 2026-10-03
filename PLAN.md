# Dam Good Maps: website plan

A static website where a player picks settings, generates a Timberborn map, sees it in the browser
and downloads a `.timber` file that loads and plays in Timberborn 1.1. The facts it rests on are in
[investigation/REPORT.md](investigation/REPORT.md), [FORMAT.md](FORMAT.md) and
[investigation/calibration.json](investigation/calibration.json). The Python prototype in
[prototype/](prototype/) is the reference implementation and test oracle (§4).

The generator is the first half of one app. [EDITOR_PLAN.md](EDITOR_PLAN.md) plans the map editor,
and [ROADMAP.md](ROADMAP.md) orders the work. The foundations the two halves share (map spec,
parametric features, set-piece builders, stable ids, validation, format I/O, determinism and the
build order) are defined once, in [§19](#19-shared-foundations-with-the-editor). Every generated map
is built from parametric features, and the document keeps them as the map's plan (for the analysis and
Claude's steering); the player shapes the land with the brushes (D182). Edits never replay onto new
land: every Generate makes a new map (D336). §20 holds the decisions in force. What was superseded or
finished, and how the product was first designed, is in [docs/archive/plan.md](docs/archive/plan.md): the
full text of every section below as it stood at D390, and whole sections 1, 12, 16 and 17 and "Changes from audit".

## Contents

0. [Product principles](#product-principles)
2. [Architecture and tech stack](#2-architecture-and-tech-stack)
3. [Project structure](#3-project-structure)
4. [The prototype and calibration](#4-the-prototype-and-calibration)
5. [Settings](#5-settings)
6. [Theme presets](#6-theme-presets)
7. [Generation pipeline](#7-generation-pipeline)
8. [Themes](#8-themes)
9. [Set pieces](#9-set-pieces)
10. [Water simulation](#10-water-simulation)
11. [Validation](#11-validation)
13. [Names and descriptions](#13-names-and-descriptions)
14. [Website features](#14-website-features)
15. [Testing](#15-testing)
18. [In-game checklist](#18-in-game-checklist)
19. [Shared foundations with the editor](#19-shared-foundations-with-the-editor)
20. [Editor decisions](#20-editor-decisions)
21. [Changes from audit](#changes-from-audit) (a pointer to the archive)

The numbers of the sections stay as they were (1, 12, 16 and 17 are in the archive), because the code and the
other documents cite them.

---

## Product principles

**Maps are created, not copied** (Kyler, 2026-09-25; §20 D108). It binds M9 and every later
milestone.

> Dam Good Maps creates maps. It never approximates existing maps, and it never produces a few archetypes with a little noise. That would make the product useless. Its maps come from generative processes and composition, inspired by real landscapes, Timberborn's mechanics and good play design. Two maps must play differently, not only look different: a different place to settle, a different first dam, a different way through the first drought, different threats, different paths outward, and something to discover. Workshop and official maps are evidence of what's playable and of Kyler's taste, never a template.

**Claude steers the generator; it never hand-builds the map** (Kyler, 2026-09-25; §20 D139).

> When a request asks for character or new features ("make this valley harsher", "give me a huge dam opportunity halfway down", "put the start under a cliff"), Claude turns it into intentions (outcomes, not recipes) and settings, steering whole-map generation toward them ("describe the map you want" and its candidates), checks the result with the analysis, and reports honestly what emerged and what didn't. A request for local change ("make the north mountainous", "add a big waterfall") uses the forces instead. Editor operations are for precise edits the player asks for ("move the start here", "widen this river by two", "delete that forest"), as brush-style operations, never landform objects (§20 D187, D256).

**The north-star player journey** (Kyler, 2026-09-25; §20 D161). Find a striking place (for
example in Google Earth), turn it into a Timberborn map (Pick a place), watch how its droughts
and badtides play out (the Weather view), make a few changes (Live editing), and play it as a
functional, validated, interesting map (export, later one-click play). It checks priorities:
each step must feel smooth, and a gap anywhere breaks the experience.

---

## 2. Architecture and tech stack

A fully client-side static site. There is no server; everything runs in the player's browser.

TypeScript (strict) for UI, generator, worker and Node tools; Vite; Preact + `@preact/signals`; Comlink for typed worker
calls; Vitest and Playwright, with the Python prototype as an oracle in CI (§15). The generator core (`src/core`) has no
DOM access, so it runs identically in the Web Worker, in Node (tests, batch runs) and in Vitest. The 2D preview is
Canvas 2D (an `ImageData` buffer); the 3D preview is three.js in a lazy-loaded chunk. The zip is fflate `zipSync` with a
fixed `mtime`, and the thumbnail comes from the `jpeg-js` encoder in the worker (0.4.4, vendored, D20), because canvas
`toBlob` encoders differ between browsers; both keep files byte-reproducible. Hosting is GitHub Pages from GitHub
Actions (`timbermods.github.io/dam-good-maps/`); Pages cannot set response headers (no COOP/COEP), so `SharedArrayBuffer`
threads are unavailable and parallel work runs as independent workers. A second build target, a single-file build for a
Claude artifact (deferred with Claude, D277), swaps the platform adapters (§19.9): data is bundled, workers can be
inlined, and libraries come from npm. The visual design is the org's Impeccable site flow and the timbermods design
system (walnut lodge palette, `DESIGN.md`), done as its own step.

### 2.1 Determinism

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
    the Badtide's contamination). None of them appears in the core, the workers or the tools that produce
    data: the whole-source guard (`tools/portable-guard.ts`, run by `tests/unit/portable.test.ts`, D401)
    rejects them and every way around it (aliases, `Math[…]`, strings a page evaluates, `eval`, unaudited
    WebAssembly). The renderer, the camera and the picture-making tools are outside it.
  - `portable.ts`: the polynomial sine, cosine and exp of `core/math/detmath.ts` (an odd polynomial
    through x¹⁷ on an argument reduced to [−π/2, π/2], error below 1e-13; D15), and fixed-order
    `atan`, `atan2`, `log`, `log2`, `hypot`, `tanh` and `pow` (an integer power multiplies; any other
    is exp(y·log x)), plus `tan`, `asin`, `acos`, `asinh` and `rem`, with `sqrt` from WebAssembly's
    correctly rounded `f64.sqrt` (or an exact integer square root where a page refuses WebAssembly). They
    are for finite map arguments, not a general maths library.
  - The Rust ports share one copy of the same maths, `rust/portable` (D401), built with Rust 1.90
    (`rust-toolchain.toml`) and strict floating point (no FMA, no libm). `tools/rust/check.ts` audits the
    Rust source, its optimized IR, assembly and Wasm, and compares every function with `portable.ts` bit
    for bit, natively and in Chromium, Firefox and WebKit; CI's `rust` job runs it.
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

### 2.2 Runtime flow

```
UI (main thread)                          Worker (core)
────────────────                          ─────────────
settings form ── URL ─┐
                      ├── generate(spec) ─────────▶ plan features → build (§19.8) → validate
                      │                              ◀── progress events (stage, attempt, %)
                      │                              ◀── candidate #1 (valid) → preview
                      │                              ◀── later candidates, in the background
map card, layers ◀────┴── result {spec, features, heights, water, entities, report, name}
download ── pack(result) ──────────────────▶ writer → Uint8Array (.timber) ── Blob → save
the result as a MapDocument (§19) ──▶ editor (EDITOR_PLAN.md)
```

The first valid candidate is shown at once, and the remaining candidates are produced in the background
(§7.9).

### 2.3 Problem reports without a server

A plain **Report a problem** link opens the repository's GitHub issues
(`github.com/timbermods/dam-good-maps/issues`), for bug reports. There is no rating form and no in-site
voting (D145, D278).

---

## 3. Project structure

Each folder under `src/core/`, and `tools/` and `prototype/`, has a short README: its purpose, rules, entry
points and tests. Start there. In short:

```
dam-good-maps/
├─ PLAN.md  EDITOR_PLAN.md  ROADMAP.md  FORMAT.md  CLAUDE.md  README.md
├─ src/
│  ├─ core/       pure TypeScript, no DOM: runs in the worker, Node and the tests
│  │              math/ (rng, hash, noise, portable maths, grids)   format/ (the .timber reader and writer, normalize)
│  │              sim/ (water, pre-fill and the canonical settle, moisture, contamination, drought)   water/ (source groups)
│  │              spec/ (MapSpec, presets, the URL codec, merge patch)   features/ (the feature schema, rasterizers,
│  │              set-piece builders, ids, slopes, the one build pipeline)   doc/ (MapDocument, operations, session)
│  │              land/ (genome, field, drainage, hydrology, hazards, intentions)   gen/ (generate, the start, resources,
│  │              extras, read-back, pack)   resources/ (official-map baselines, resource placement)
│  │              validate/ (checks, playability, report)   analysis/   forces/ (the forces core)   terrain/   places/ (Real places)
│  ├─ platform/   adapters: files, storage, workers, claude (§19.9)
│  ├─ render3d/   the one 3D renderer, used by the generator preview and the editor
│  ├─ worker/     the generator and editor worker (Comlink API)
│  ├─ ui/         the page: settings, preview, map card, layers, download, share
│  └─ editor/     the editor UI (EDITOR_PLAN.md)
├─ tools/         batch generation, the Python oracle, benchmarks, determinism, capture tools
├─ tests/         unit/  contract/  golden/  e2e/ (§15)
├─ prototype/     Python reference implementation and test oracle (§4)
├─ investigation/ reports, calibration, notes (the investigations' archive in place)
└─ .github/       workflows: ci.yml, nightly.yml, deploy.yml (Pages, `/v/<version>/`), live-check.yml
```

---

## 4. The prototype and calibration

The Python prototype is the **reference implementation and the oracle** the TypeScript port is tested against.

| Python (prototype/) | TypeScript (src/core/) | How it is kept in step |
|---|---|---|
| `tbmap.py` writer and reader | `format/*` | CI generates maps with the Node CLI, and the Python `roundtrip_test.py` and `validate.py` must pass on them. |
| `watersim.py` (water, moisture, contamination) | `sim/*` | `tools/export-fixtures.py` writes golden vectors: terrain, sources and the state after 50/200/975 ticks, plus steady-state moisture, soil contamination, the pre-fill, the canonical settle and the drought storage, on a dozen small terrains. TS must match within 1e-6 (depth) and exactly on the moist/dry mask; it matches bit for bit. The game's own save is a local-only test (it is not ours to commit): 975 ticks from empty reproduce it within 0.001. |
| `analysis.py` (distances, regions, basins, dam sites) | `analysis/*` | The same fixtures carry expected region sizes and dam-site volumes. |
| `validate.py`, `playability.py` | `validate/*` | Check ids are identical. The oracle job runs both validators on the same maps; their verdicts must agree check by check. |
| `generate.py`, `terrain.py`, `ruins.py`, `vegetation.py` | `gen/*` | The prototype's River Valley generator is not byte-compatible with the TypeScript generator (numpy RNG differs from sfc32); they are compared through their calibration metrics. |
| `calibrated.py` | `gen/calibrated.ts` | One table (§5, §11); `tests/contract/calibrated.test.ts` asserts the TS table equals `prototype/calibrated.py`. |
| `investigation/analyze_maps.py` | `tools/batch.ts` reuses `analysis/*` | Generated maps are measured with the same yardstick as the official maps. |

`investigation/calibration.json` is the source of truth for every target. Re-running `analyze_maps.py` after a
game update regenerates it.

---

## 5. Settings

Defaults are for the default theme (Any, §6) at Normal. A theme preset (§6) overwrites them, and the player can
then change anything. **Size-aware** means a multiplier on the official size-class median, interpolated in
log(area) between small (50–100²), medium (128²), large (192²) and max (256²). The official numbers are in
`investigation/calibration.json` and `official-baselines.json`; `gen/calibrated.ts` holds the table the code uses.

### 5.1 Basics

| Setting | Values | Default | Notes |
|---|---|---|---|
| Seed | 0 – 4,294,967,295 | random | Also accepted as text, hashed to a number ("beaver" is a valid seed). |
| Size | Small 96², Medium 128², Large 192², Max 256², Custom | Medium | Custom width and height are each 48–256 (the game allows 4–256; under 48 there is no room for a start zone and a river). Non-square is allowed. |
| Theme | Any (Surprise me), River Valley, Canyon, Highlands, Lake Basin, Delta, Islands | Any | A theme only leans the generator (§6, §8). |
| Designed for | Easy, Normal, Hard | Normal | The in-game difficulty the map is balanced for: it sets the start rules and drought sizing (§5.6). The map works on any difficulty; the card warns if you pick Hard for a map designed for Easy. |

### 5.2 Terrain

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Relief | Gentle 0 – 100 Dramatic | 55 | Height range p5–p95 = 7 + 0.08·relief levels (official 9–15, median 13); cliff-tile share 0.06 + 0.0018·relief (official 0.07–0.24, median 0.16). |
| Highest terrain | 10 – 16 | 16 | Terrain never exceeds this; 16 is the in-game map editor's limit and every official map's top. Heights 17–22 come only with high Verticality (§5.9) and tall Real places (D172). |
| Terracing | Smooth 0 – 100 Distinct | 50 | The share of height steps that are one level: 0.86 − 0.0059·terracing (official median 0.62). |
| Buildable land | Tight, Normal, Generous | Normal | Land walkable from the start through slopes of at least 750 / 1,300 / 2,500 tiles (official median 1,296), flat share 0.40 / 0.52 / 0.60; it shapes the valley floor's width, the terrace edges and where the cliffs go. |

### 5.3 Water

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Rivers | 0 – 3 | theme | Rivers entering on the map edge; 0 means only lakes, springs and seeps (a spring feeds the main river). Tributaries each bring a quarter of the main river's flow. |
| River style | Straight, Meandering, Braided | Meandering | Meander amplitude ≤ 0.05·H / 0.12–0.2·H with 1–3 bends per 100 tiles / a channel splitting into 2–4 around islands (Delta). Rivers follow the land's drainage and never run ruler-straight (D209). |
| River flow | Trickle, Normal, Strong, Lush | Normal | Total clean source strength: 0.6× / 1× / 2× / 4× the size-aware official median (medium 2.2, large 1.2, max 1.1 per 10k tiles; Lush is about the workshop median), in sources mostly 0.5 each, in rows of 3–8 across a channel. It sets river size and how fast reservoirs refill, **not** drought survival. |
| Drought reserve | Scarce, Normal, Plenty | Normal | Minimum stored water near the start, as a multiple of the colony's drought need (§11.4): 1× / 1.5× / 3×. This is what makes droughts forgiving. It is information the generator prefers, never a guard (#67): a larger reserve than the theme's adds valley lakes and has the generator try up to four more attempts for natural water or a dam site holding the need; a smaller one takes valley lakes away. Not every combination fits a small map: reservoirs are 2 deep on Easy and Normal and 3 on Hard (Hard with Normal needs about 590 tiles, with Plenty 1,170), so the panel disables combinations whose reservoir would exceed 15% of the map area and says why (smallest sides: Normal with Plenty 51, Hard with Scarce 52, Hard with Normal 63, Hard with Plenty 89); every size preset fits every combination. |
| Lakes and basins | None, Few, Some, Many | Some | Natural basins of 20+ tiles that hold water without a dam: 0 / 0.5× / 1× / 2× the official median for the size (small 1.5, medium 4, large 15.5, max 15), as riverside ponds the river keeps full and that keep their water through a drought. |
| Waterfalls | Off, Few, Many | Few | Bed drops of 2+ levels: 0 / 1–2 / 3–6, on rivers, carrying their flow, 1–9 tiles wide like official falls (§9.2). |

### 5.4 Hazards

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Badwater | No badwater, Low, Normal, High | Normal (Highlands and Islands: Low) | Every map has at least one badwater source, a late-game resource like the mine site, unless the player picks **No badwater** (a peaceful map: none is placed, badtides still turn every source bad; the share link `bw=0` and the description record it, D200). Sources and strength are the official maps' for the size (`official-baselines.json`: 1 / 2 / 4 / 3.5 sources and 1.25 / 3.5 / 5.5 / 6.5 strength for small / medium / large / max, joined in ln(area)), moved within the official typical range by the seed, then × 0.5 / 1 / 1.5 (sources) and × 0.5 / 1 / 1.75 (strength) for Low / Normal / High; each source 1–3 strong, a BadwaterSource 3×3 in a side basin (§9.5). Where fewer hollows fit than the budget asks, the ones placed share its total, each up to 3. |
| Badwater distance | 8 – 60 | 15 (Easy 30, Hard 8) (D85) | Distance from the start to badwater or contaminated soil the generator aims for. A hollow aims at the distance + 11 tiles from where the start is expected; the start is chosen, among the places nearly as good as the best, nearest there, and the hollows are planned again from the real start when their badwater lands within the distance or more than 26 tiles beyond it (D200 (2)). The start rule "No badwater within" (§5.6) is the same value: the panel sets both, and validation uses the larger. A target with an advisory warning, never a reason to reject (D85). |
| Thorn belts | Off, Some | Some (Highlands, River Valley) | 1–3 belts of 13–40 thorns, each across the way from the start to a relic or a geothermal field, 5–8 tiles in front of it, 9–17 tiles across and 2–3 deep, every thorn 22+ tiles from the start; a belt that would cut the colony's land in two is left out. |
| Unstable cores | Off, On | Off | Advanced. 1–4 cores, 40+ tiles from the start, countdown in cycle 5–12 (10.5 days in, the official value), radius 2–3, never within radius + 2 of each other or of a dam site. |

### 5.5 Resources

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Forest density | 50% – 200% | 100% | Trees per 10k tiles, size-aware (small 1,715, medium 1,061, large 544, max 559), each map within the official typical range (×0.92–1.17). About a third alive, on moist ground; the rest stored dead on dry ground. |
| Grove size | Scattered, Normal, Big woods | Normal | Median 20 / 40 / 80 trees (a grove: trees within 2 tiles of each other), capped at 120 / 250 / 400, with clearings between; near the start groves of 9 / 15 / 30. Groves are single-species, as every official grove of 20+ is. |
| Species mix | weights for Pine, Birch, Oak, Succulent | 47 / 27 / 20 / 6 | The only species that load for both factions and in the editor. Succulents go on dry soil only. |
| Berries near start | 20 – 100 | by difficulty (Easy 40, Normal 48, Hard 60) | The generation target, never below Minimum starting bushes (§5.6): living bushes within 20 tiles' walk of the start, in 2–3 patches beside water, grown within the colony's walk first (D97). |
| Berry bushes elsewhere | 50% – 300% | 100% | Bushes per 10k tiles, size-aware (small 265, medium 92, large 40, max 44), each map within the official typical range (×0.98–1.07), in a few patches of about 44 along the banks. |
| Ruins and scrap | 25% – 300% | 100% | Scrap per 1k tiles, size-aware (small 840, medium 705, large 236, max 235), each map within the official typical range (×0.75–1.41). |
| Relics | Off, Some | Some | 1–3 small (13–70 tiles out), 1–2 medium (40–140) from 128² (0–1 below), one large (140+) from 192². |
| Geothermal fields | Off, Some | Some | 30–120 tiles out, flat, dry, outside flood reach: 1 / 2 / 3 by size (under 128², from 128², from 192²). |
| Mine sites | 1 – 4 | 1 / 2 / 3 / 3 by size | Every map has at least one (old links with 0 open with 1). Flat 5×5 with a level ring, dry, 60+ tiles out (official 24–173, median 89): 80+ where there is room, and on ground the colony walks to when there is any at that distance. |

The resource amount checks are information: a warning under half the official median at the map's settings, never a
reason to reject a map (`src/core/resources/` places them for generated maps and Real places alike). On maps under
128² the distance bands of relics, geothermal fields and mine sites shrink by the map's longer side ÷ 128; thorn
belts and cores keep theirs (D75).

### 5.6 Start and difficulty

**Start requirements** (D85, D153, D164, D224, D227, D302) are the only start rules that reject a map (§11.4). Each
threshold is a setting under "Start rules", with the difficulty's default:

| Requirement | Easy | Normal | Hard | Rule | Setting |
|---|---|---|---|---|---|
| Water without stairs | 12 | 20 | 28 | Clean pumpable water (depth ≥ 0.3, contamination < 0.05) touches a shore tile the start reaches on foot within this many tiles' walk, over the map's own ground and its Slope entities (never stairs the player builds), levels changing through slopes. Rivers, lakes and ponds count. A pump on that shore reaches the surface (0–2 levels below the shore). The water must be fed by a running source or be a lake that lasts the difficulty's drought (9 / 30 days at Normal / Hard), never a sealed puddle (D302). | `sw`, 4–40 |
| Starting wood | 250 | 200 | none (0) | At least this many logs of grown trees within 20 tiles' walk of the start (slopes allowed), each tree by its species' yield (oak 8, pine 2 and resin, birch 1; maple 6, chestnut 4 and mangrove 2 on imported maps: the game's blueprints, `src/core/data/log-floor.json`; the file's own logs where it stores them), alive or dead. A sapling's logs count only once it has grown; the indicators and map card show them apart, as wood still growing (D164). Hard has no minimum nearby beyond the floor below (D227). | **Minimum starting wood (logs)**, `sl`, 0–800 |
| The starting-logs floor | 178 | 178 | 178 | At least the floor of logs, counted as Starting wood counts them, within about 40 tiles' walk of the district center, at every difficulty ("can I survive": enough to build a Forester by the worst still-viable route, plus a water pump, a dwelling and, for Iron Teeth, a Breeding Pod, plus 10%; D224, D227). Computed from the game's blueprints by `tools/log-floor.ts` and pinned with the game version in `src/core/data/log-floor.json` (178 for 1.1.2.4); recomputed when the game's version changes. Absolute: generated maps, Real places and Pick a place must meet it; the editor shows it on the quiet dot without blocking export. | never configurable |
| Starting bushes | 40 | 30 | 20 | At least this many living berry bushes within 20 tiles' walk of the start (slopes allowed), across any number of patches. | **Minimum starting bushes**, `sb`, 0–200 |

"Living" means the plant survives at steady state. Changing Designed for resets the three to the difficulty's
defaults (D66). The generator never aims below a minimum, and any target below one rises to it; near-start groves
aim at 1.35 × Minimum starting wood in grown logs, and where the walk holds little moist land they draw their
species by the wood they give as well as by the mix. The map's own groves and patches come first; the start rules add
only what those leave short within the walk, spread the way the land offers it, so no two starts get the same ring
(D252, §7.7). The start's bench stands a level above the floodplain (D26), and the colony walks down to the river
over the map's own slopes (§7.5). Imported maps use their difficulty's defaults. The walk to the water is measured to
the shore tile (D104); trees are Pine, Birch and Oak, bushes BlueberryBush. The panel's names are **Water without
stairs (tiles)**, **Minimum starting wood (logs)** and **Minimum starting bushes**, and the map card lists the three,
starting wood with the species that give it ("mostly oak") and the logs still growing. Share links keep `sw` and
`sb`; starting wood is `sl`, and a link or project file from before D164 opens its Minimum starting trees (`st`) as 2
logs a tree.

**Difficulty targets.** The difficulty preset sets these; each can be overridden under "Start rules". They are
generation targets, never a reason to reject a map (D85): the generator aims for them, and the map card shows an
advisory warning when a map misses one.

| Target | Easy | Normal | Hard | Source |
|---|---|---|---|---|
| Berries near start (§5.5) | 40 | 48 | 60 | Official median 47; never below Minimum starting bushes. |
| No badwater within | 30 | 15 | 8 | Official maps' nearest badwater median 14.8, p25 10 (D85). |
| No ruins within | 20 | 15 | 12 | Official p10 22. |
| Drought sized for | 4 days, 40 beavers | 9 days, 50 beavers | 30 days, 50 beavers | Game mode durations. |
| Stored water needed near start | 86 | 253 | 1,174, at 3+ deep | §11.4 formula. |
| Start bench | radius 6 | radius 6 | radius 5 | A levelled pad around the district center. |

Walkable land from the start (`start.reach`) follows Buildable land (§5.2) and is a target too. **Start area**
(Small, Normal, Large; on the panel Prefer tight, Normal, Prefer roomy) is a preference, never a stamped bench
(D211): the land leans toward a tighter or roomier bench (radius about 5 / 6 / 8) and the start prefers a matching
one; the map card shows the start's bench (level tiles within 8 of the district center).

### 5.7 The 1.0+ map features

Slopes are always generated (§7.5). Theme ingredients: NaturalDam, the "pre-built weir" variant of the dam site (a 0.65
weir across a 1-deep channel), on half the maps, where the river's water per tile stays in its channel over the weir
(D72); Blockage, the "plugged spillway" set piece (§9.6), in Lake Basin and Islands (D71). Settings: Thorn belts, Relics,
GeothermalField (free 400 hp power), UndergroundRuins (Mine sites, the late-game scrap source); UnstableCore is advanced
and off by default (it destroys terrain and objects and cannot be removed). Terrain above terrain (ROADMAP; D118–D127;
investigation/terrain3d/DESIGN.md): NaturalOverhang bridges, BadtideDrain in cliff notches at high Verticality, caves and
overhangs via Verticality (§5.9). Later: WaterSeep / BadwaterSeep, an "oasis" ingredient for an arid theme (they cap at
0.8 depth, stop in drought and need their own tuning). Left out: Aquifer + AncientAquiferDrill (water only while a
powered drill stands on it, per the code only in temperate weather) and Reserve stockpiles (used by one official map).
The settings the workshop study planned for M9 (Variety, Springs, Cascading falls, higher density tops, a Rugged level)
are not built; ROADMAP owns what is scheduled, and the study's table is in the archive (§5.8).

### 5.9 Verticality

**Verticality** (`vt`, 0–100; D132, D123) sets how vertical the land is. Its default gives ordinary maps (the official
and workshop medians, tall parts up to 16); higher values bring crazy vertical landscapes. Theme defaults (`VT_DEFAULT`):
Any 25, Canyon 40, Highlands 45, River Valley 20, Lake Basin 10, Delta 10, Islands 20. Only from 70 may generated terrain
go above 16, up to the game's 22 levels with layer 22 kept empty (FORMAT.md; heights up to 22 load and keep their
terrain, water and objects, §18 E1, D172); below, maps stay within 16. Vertical parts (spires and hoodoo stacks, sheer
escarpments with hanging valleys, stepped canyons and deep gorges, towering mesas with summit lakes, cascades of falls
with plunge pools, cliff-bench terraces) are emergent, never stamped, and used more as it rises. The land stays
traversable at any value: the start and its first resources stand on reachable land, with natural ramps (slopes)
between levels where the land needs them (a ramp's route is no longer than it needs, two tiles a level, and never runs
over higher or lower ground than its ends, D209); heights reachable only by building stairs are allowed, as rewards.
Measures (design version 2): relief range, levels used, share of land above 16, tallest fall, cliff share and vertical
reach, against the official and workshop maps.

**3D forms** (D123; investigation/terrain3d/DESIGN.md §5.2), found in the land by processes, at 128²: 0 none; 1–39
within 16, 0–2 small forms (a tunnel, an undercut, a spring cave); 40–69 within 16, 2–5, plus ledges, a cliff path, an
arch, overhangs up to 3; 70–100 up to 22, 5–12 (overhanging cliffs, arches, sky bridges, cliffside caves and ledges,
multi-level valleys, water through mountains). Cave starts only from 70. Every level has a way up without stairs
(ramps, tunnels, ledges, bridges), except the planned rewards, which need player stairs.

---

## 6. Theme presets

A theme preset pre-fills the settings (§5) and leans the generator (§8). Anchors are the official maps whose measured
numbers the preset follows. **Any** (Surprise me, the default) takes River Valley's values except Relief 55 and
Terracing 45. `THEME_PRESETS` in `src/core/spec/mapspec.ts` is the table the code reads.

| Setting | River Valley | Canyon | Highlands | Lake Basin | Delta | Islands |
|---|---|---|---|---|---|---|
| Anchors | Meander, Plains | Canyon, Waterfalls, Cliffside | MountainRange, Hollows, HelixMountain | Lakes, Beaverome, Craters | Spillage, Lakes | ThousandIslands |
| Relief | 50 | 80 | 90 | 40 | 20 | 35 |
| Terracing | 45 | 75 | 60 | 40 | 25 | 30 |
| Buildable land | Normal | Tight | Tight | Normal | Generous | Normal |
| Rivers / style | 1 meandering | 1 straight | 2 meandering | 2 into a lake | 1 braided | 1 meandering |
| River flow | Normal | Normal | Normal | Strong | Strong | Lush |
| Drought reserve | Normal | Normal | Normal | Plenty | Scarce | Plenty |
| Lakes and basins | Some | Few | Some | Many | Few | None |
| Waterfalls | Few | Many | Many | Few | Off | Off |
| Badwater | Normal | Normal | Low | Normal | Normal | Low |
| Thorn belts | Some | Off | Some | Off | Off | Off |
| Forest density | 100% | 80% | 90% | 100% | 120% | 100% |
| Ruins and scrap | 100% | 120% | 100% | 100% | 80% | 100% |

---

## 7. Generation pipeline

Maps are grown, not drawn (D108, D208, D209). `generate` (`src/core/gen/generate.ts`; the READMEs of `src/core/gen/` and
`src/core/land/` say where to start, and `docs/archive/m9-design.md` is the design):

1. **Normalise** (§7.0).
2. **Genome**, drawn from the theme's prior: a theme only leans its ranges, and Any, the default, draws from all of
   them (`land/genome.ts`).
3. **Land.** It grows on a height field from uplift, caprock, erosion and weathering, snapped to the game's levels
   (`land/field.ts`, `levels.ts`). Rivers, lakes, falls and badwater are found in its drainage (`land/hydro.ts`,
   `hazards.ts`, `drainage.ts`); no river is drawn. Intentions are steered, never stamped: a check on the finished map
   confirms one, and a failed one is dropped, never forced (D138).
4. **Features read back** out of the field (`gen/readback.ts`, §19.2): the map's plan, for the analysis and Claude's
   steering, which the editor keeps. The detected features in §7.10 (`derived`) are measurements for labels and names.
5. **Start and slopes:** the start is picked (`gen/settler.ts`, §5.6) and the slopes derived (§7.5).
6. **Water:** sources, the canonical settle, moisture and contamination (§7.6). **Detail:** berries, forests, ruins,
   mine sites, relics, geothermal fields and thorn belts (§7.7).
7. **Build, validate, retry** (§7.8–7.10). A generated map's terrain, water and entities are exactly what its
   features rasterize to: `build` is the shared pipeline of §19.8, the same code the editor runs after every edit.
   Set pieces (§9) are shared builders (§19.3).

Planned (M9b, D275): each finished map is rotated or mirrored into one of its 8 orientations, so all 8 appear and none
over a quarter; the flow axis is not drawn during layout. §7.1–§7.4 (concept, macro layout, set pieces, terrain) were
the layout-band planners the processes replaced; they are in the archive.

### 7.0 Normalise

Validate the `MapSpec` (§19.1) against its schema; clamp every setting and resolve size-aware targets
(`target = multiplier × density(key, W·H)`); derive the difficulty rules. Take the spec's constraints (locked regions,
keep-out regions, ids of features to keep), which the planner treats as occupied and protected (they served
regeneration around the player's edits, which D336 removed; the spec and share links still carry them). Derive seed
streams: `layout`, `terrain`, `setpieces`, `water`, `veg`, `ruins`, `extras` and `names`, each
`hash(seed, stream, candidate, attempt)`.

### 7.5 Connect: slopes

Beavers cannot cross a 1-level step; stairs cost 70 science, and 2+ level cliffs need player stairs or ramps anyway.

1. Label same-level regions (4-connected) and build the region graph: an edge wherever two regions differ by exactly
   one level along a boundary.
2. From the start's region, grow a spanning tree over the regions whose boundary lies within 40 tiles of the start
   (Chebyshev); the pumpable water edge and the near-start groves and berries lie inside it. For each tree edge, place
   one Slope on the boundary pair nearest the start; out of the start's own region, on the pair nearest the start and
   the rivers' channels together (the fewest steps), so the colony's way down leads to its water (D153). The low
   tile must be free, and the tile behind its low side must be at the same level; orientation comes from the high
   side (Cw0 if it is south (y−1), Cw90 west, Cw180 north, Cw270 east). Long boundaries (60+ pairs) get a second
   slope; every slope stands at least 12 tiles (Manhattan) from the others. Targets are joined wherever they are: the
   regions of a landform with gentle or terraced edges ("joined by slopes", §19.2) and, on an edited import, the
   ground the edits changed. Slopes that already stand (a set piece's own stairs and chains, an imported map's own)
   join their regions without another.
3. Beyond 40 tiles, add one slope per region of 400+ tiles toward its lowest neighbour (the next lowest when no slope
   fits there), nearest the start first.
4. Leave 1–2 plateaus deliberately unconnected when a set piece asks for it: the "ruins on a plateau need stairs"
   payoff (§9.3).
5. Target density: 2–6 slopes per 10k tiles on large maps and up to 20 on small ones (official: max-size maps 1.9,
   small 18).

Slopes are derived at generation, before the land is shown; the player's pinned and removed slopes apply on top. An
edited map keeps the generation's slopes that still stand and never derives any again (D368 (10): only the player
places objects); an imported map keeps its own slopes and gets none, the ground its edits changed included (D52
amended). What an edit leaves out of reach is reported by the checks, never repaired.

### 7.6 Water

1. Place sources. Clean sources are 1×1 `WaterSource`s at 0.5 (0.25–1.0), in rows across each river's entry channel on
   the map edge; edge padding next to a source is a wall, so edge sources don't leak. **The row must fill the whole
   mouth**: every channel tile on the border row is a source, or the bank is higher than the water there; the padding
   next to any other border tile is a sink (an audit run lost all the water of a 20-wide mouth with 4 sources back
   off the edge). Inland springs avoid the problem and feed cascades on highland plateaus. Badwater sources are 3×3 at
   1.0–3.0 strength (§9.5). Total strength follows the flow setting.
   - **Sources start rivers** (D171): a source stands only where water begins, at a river's mouth on the map edge or
     as a spring at a valley's head or below a ridge, never inside a river or lake another source already fills and
     never downstream; more flow comes from more sources side by side at the head, or from their strength; each
     tributary has its own source at its own head (`water.source_in_flow`, §11.3).
   - **Maps need not hold their water** (D152): rivers leave the map at their own level, lakes may drain, and nothing
     is built along the map's edges to keep water in (no edge walls, D151, `terrain.edge_wall`, §11.2). The sealed
     mouths above are how a river enters, not a wall. The badwater basin's rim holds badwater, not the map's water,
     and stays (D57).
2. Run the canonical settle (§10, §19.7); a steady flow off the map is a steady state. Compute moisture and soil
   contamination at steady state.
3. If the water share exceeds the theme target by 50%, or the settled rivers are not where the layout put them
   (overlap with the planned channel mask below 0.8), adjust strength once and re-run; otherwise re-roll the layout.

### 7.7 Detail

Every placement uses the footprints in `footprints.json` and marks occupied cells, so objects never overlap.

1. **Start:** one `StartingLocation` on the bench, the door facing the river; keep clear a Chebyshev radius of 3
   around it and the 3×3 in front of the entrance. The start's pad and every set-piece footprint that needs flat
   ground are levelled; mine-site pads are lowered by at most one level and ease into the land (D363).
2. **Berries:** patches of blueberry bushes across the map (median 20–40, beside water) up to the density target, the
   start's share kept back; then, where they leave the start short of its target within 20 tiles' walk, 1–3 patches
   on moist soil beside clean water, on the side and at the distance the start's layout draws; what they leave of the
   start's share goes to the rest of the map. Bushes are ripe (`GatherableYieldGrower 1.0`) near the start and 55%
   ripe elsewhere, as in official maps.
3. **Forests:** groves are single-species blobs grown with a compactness of about 0.8, sized log-normal around the
   grove-size median. The map's groves come first (living groves on moist soil up to about a quarter of it, then dead
   groves on dry soil, the start's share kept back); then the start's own groves add the wood the map's leave short
   of the start's target within 20 tiles' walk (at least 40 living trees' worth; D252). Each map draws a layout from
   its own stream: a side and a distance for its groves (a bearing and a walk of 6–17 tiles) and berries, a grove
   size (1–3 × the median) and an opening (as the mix, oak-rich or a pine forest; D164). Each grove draws a kind of
   place from the land within the walk (D229): a river's banks, across the water, a plateau, a side valley or open
   ground, weighted by its room and how natural it is, its species leaning to the place. The start's yard (6 tiles)
   stays clear where the walk has room elsewhere; standing dead groves go on its dry ground only where the moist land
   runs out; where the walk's moist land is short of what the start needs, the map's groves and patches keep out of
   it and the start's groves draw their species by the wood they give. Then the rest of the map's trees. Succulent
   groves go on dry soil and are alive; living trees are 35% saplings (`Growable` 0.2–0.95); dead trees carry
   `LivingNaturalResource.IsDead`.
4. **Ruins:** §9.7. **Extras:** mine sites, relics, geothermal fields and thorn belts, by distance band from the
   start, on flat dry ground outside flood reach; planned on the layout's settled water before the resources (D69,
   D75), standing at build step 9, keeping a ring of level ground; an object that cuts the colony's land in two is
   left out.

### 7.8 Validate and retry

Run every check in §11. On failure, retry the whole candidate with `attempt + 1`: a new layout stream and so a new
map from the same seed. After `MAX_ATTEMPTS` (12) attempts, show the best failing candidate with its report and a
"Try another seed" button.

### 7.9 Candidates

Each attempt builds one candidate. Planned (M9b; D273, D278, replacing the 12-component score and K = 3): the
generator makes candidates until one meets the five outcomes (the theme's signature, at least one standout
intention, readable water), within a capped number of attempts, showing the first candidate at once and progress
after it, never a frozen wait. Only true near-duplicates of other maps are rejected; resemblance is otherwise
information (D223). Another like this makes one sibling per click (D278).

### 7.10 Output

`generate` returns a `GeneratedMap` (`src/core/gen/`): the `spec` (§19.1, with `accepted: {attempt, candidate}` filled
in); the `features` it was built from (§19.2, stable ids §19.4); the size and per-tile `heights`; the `water` (depth,
contamination, moisture, soil contamination); the `entities` (template, x, y, z, orientation, flipped, components,
ownerFeatureId); `derived`, the measured falls, dam sites, plateaus, islands and groves (labels and names); the
validation `report` (§19.5); the `name` and `description`; and the `generatorVersion`. `toDocument(result)` wraps
`features` with the spec and the built base into the `MapDocument` the editor opens (EDITOR_PLAN.md, The map document)
without any conversion.

---

## 8. Themes

Themes are optional leanings, not templates (D208; "Any", Surprise me, is the default, D209): a theme leans the
genome's ranges, and Variety and intentions vary the land within. No theme's maps cluster into an archetype (D108).
The presets are §6's; there is no per-theme layout planner and no table of named premises or landmark variants (D275,
D278); the named premises that became intentions are in design version 2 §6 (`docs/archive/m9-design.md`) and D274.
No dam ridge is built anywhere (D111). M9b brings Islands' archipelagos, chains and atolls and the crater and
waterfall-lake intentions (D209).

---

## 9. Set pieces

Each set piece lists what it builds, the ranges the game's limits allow, and the constraint validation proves.
"Levels" are terrain levels; the terrain budget is 0–16 (0 an empty column, used by official maps as river outlets;
16 the in-game editor's limit; up to 22 at high Verticality, §5.9). Every builder is a shared set-piece builder
(§19.3). The generator calls it, and Claude reaches it by steering the generator (D139); the editor has no set-piece
tools (D182, D184). Each builder publishes its achievable ranges for the current map (§9.10). Values outside the
schema's hard bounds are rejected; values inside them but beyond what the map allows are reduced to the nearest
achievable value, and the reduction is reported. The measurements behind the ranges (the audit's runs of the water
port) are in the archive.

### 9.1 Dam site (gorge and basin)

The generator builds no dam-site ridge or other built dam wall, in any theme (D111); dam opportunities exist only
where the land's own processes make them. The builder's limits still fix what a dam site can hold, and
`analysis/damsites.ts` samples straight dam lines for `water.storage_possible` (§11.3).

- **Builds:** a basin of 150–1,500 tiles on the river upstream of a narrows (a ridge 3–6 tiles thick across the
  valley, cut by the channel, 3–9 tiles wide at the crest line, its top at crest + 2 or more and extending at least
  10 tiles past the valley floor so the reservoir cannot leak around it). Crest options: a player dam of 0.65,
  levees of 1 per level, 1–3 levels above the bed. Variants: *natural weir* (a `NaturalDam` line pre-holds 0.65) and
  *plugged spillway* (§9.6). The river entering the basin must sit at crest level or higher, or the raised water
  backs up to the entry edge and drains off the map.
- **Limits:** dam height is useful at 1–3 levels, 4 at most (a Folktails WaterPump reaches 2 levels below its base,
  a LargeWaterPump 4, the Iron Teeth DeepWaterPump 6; deeper water is storage the colony cannot pump); the ridge top
  can go up to 16. The basin is capped at 15% of the map area (48² ≤ 345 tiles, 96² ≤ 1,382, 128² ≤ 2,457; the
  150–1,500 range scales with area below 128²) and never touches a map edge. With crest 2 above the bed the
  reservoir holds about 150–3,000 blocks (official best dam-site volume per dam tile: median 470, p90 4,479). The
  reservoir a difficulty needs, and so the minimum map size, is in §9.10.
- **Validated:** a straight dam line through a channel tile holds `need × drought reserve` within 40 tiles of the
  start; the flood fill must not reach an edge or go around the line.

### 9.2 Waterfall and cascade (power spot)

- **Builds:** a bed drop of D levels over one tile. An on-river fall keeps its river's width for now (the 1–3-tile
  narrows above the drop wait for in-game check C2, D48); a standalone fall's outflow channel is 1, 3 or 5 tiles
  wide. *On a river* (what the generator makes): it splits the river's bed profile at the lip, and the river's flow
  goes over it. *Standalone* (a landmark; a steered one may place it, D139, D182): its own cliff, a **header pool**
  one level below the lip (3 rows deep), inland springs of 0.5 each along the pool's back row, the plunge pool (4
  rows at the ground in front of the lip, lowered so the lip stays at 15 or below), and an outflow channel routed to
  the nearest map edge, river or lake with a bed that never rises (D48).
- **Drops** (independent of map size): the hard maximum with editor-safe terrain is **15 levels** (the lip a bed at
  15 with banks at 16, the plunge pool at level 0 draining to an edge at level 0); practical within a layout **12**
  (beds between 2 and 14), typical 3–8. The game's own limit of 22 would allow 21 and stays out of scope. Official
  median highest fall 4.8, maximum 12.8; workshop maps reach 14.7.
- **Width and flow:** the lip depth is about **0.3·S/W** (all the flow S over the lip width W). **The whole lip
  carries water only if a pool feeds it:** a header pool one level below the lip wets the whole lip at S = 0.5; without
  it the sheet wets 3 of 20 lip tiles at S = 0.5 and 18 of 20 at S = 2. Hydraulically the width is limited only by
  the map; the builder caps it at 40% of the side along the lip (§9.10). Official falls are narrow (the widest lip on
  an official map is 2–8 tiles; lips are 0.12–0.29 deep). The minimum flow is S ≥ 0.025·W plus the header pool's
  evaporation (about 0.00012 per pool tile); a lip that looks like an official fall (at least 0.12 deep) needs
  S ≈ 0.4·W (for a 20-wide fall about 8 blocks/s, more than a 128² map's whole Normal flow, 3.6). Whether a thinner
  sheet (S ≈ 0.1·W, about 0.03 deep) reads as a waterfall in game needs an in-game check (§18 F). The builder takes
  flow from the river it sits on; standalone it adds springs of at most 0.5 each, at most 8 per tile (the game's
  cap), up to 100% of the map's flow budget, beyond which it builds the thinner sheet and reports it; an exact flow
  typed in advanced mode (or asked for explicitly) can exceed the cap, with a warning (check F1 uses it). Downstream,
  any channel carries the flow (depth about 0.3·S/w, so banks 1 level high hold up to S ≈ 3·w).
- **Validated:** the settled water surface drops at least 1.5 between neighbouring wet tiles at the fall (detected as
  a waterfall feature), and the tiles below are not flooded above the bench. The measured width, for Claude's intent
  checks, is the number of lip tiles with any water (depth > 0.001) and a drop of at least 1.5. **Counts:** from the
  waterfall setting, with 12+ tiles between falls.

### 9.3 Terraced cliffs, 9.4 Obstacle with payoff

- **Terraced cliffs** (vertical building): a stair of 3–6 bands, each 1 level high and 6–12 tiles deep, facing water,
  with a slope chain climbing it at one end (official maps have 18 plateaus per map: small 3, max 24). With
  `stair: true`, a narrow flight instead: 2–8 steps 1–5 tiles deep and 1–12 wide, a slope on each (D63).
- **Ruins on a plateau** (D76): a disc of radius 4–5 exactly 2 levels above the highest ground round it, a cliff all
  round, 35–70% of the way from the start to the farthest ground, with a ruin field on top and deliberately no
  slopes (§7.5), so reaching it needs player stairs (70 science) or platforms. **Thorn-barred valley:** a thorn belt
  across a corridor to a relic or geothermal field (§5.4). Validated: the payoff is reachable *if* the player builds
  one stairs (a region graph check with one allowed 2-level edge), and unreachable otherwise; this holds by
  construction and is a contract test, not a validation check. The "ridge worth tunnelling" (a ridge 3–5 thick
  between the start zone and a flat, moist expansion zone) was not among the intentions Kyler picked (D274): not
  built.

### 9.5 Badwater with counterplay

- **Builds:** the badwater source (3×3) in a side basin (a 7×7 floor one level below the ground, a rim two levels
  above the floor, D51) with a single outlet 1 or 3 tiles wide whose sill is 1 level above the floor; its channel
  joins the main river downstream of the start reach or runs to its own edge, keeping 12 tiles beyond the start's
  zone and 2 tiles clear of other rivers (D57, D62). **Counterplay:** a levee or dam across the outlet contains it
  (a source never stops, so only while the basin fills); thorn tiles along the rim block its soil contamination
  (7-tile reach).
- **Where** (D200): every map has badwater (§5.4), as many basins as the official maps have sources for the size,
  each where the ground 4–6 tiles round its floor stands higher (a hollow or a side valley, as 84% of the official
  sources stand) before open ground, at the badwater distance + 14 tiles from the start. A map that asks for badwater
  and finds no basin by the usual search tries every spot far enough from the start; one still without a source
  fails `resources.badwater_source` and is generated again. Real places and Pick a place get springs from
  `planMapResources` (`src/core/resources/badwater.ts`): a flat, dry 3×3 in a hollow or side valley on their ground
  as it stands, at least the badwater distance + 14 tiles from the start, the water settled again with them, and a
  spring dropped when its badwater comes nearer the start than the badwater distance.
- **Validated:** no badwater or contaminated soil within the badwater distance of the start; the start's pumpable
  water stays clean (contamination under 0.05); at least one clean river reach of 40+ tiles; with the outlet blocked
  the badwater stays inside the basin (`water.badwater_contained`, §11.3). **Badtide:** every clean source emits
  badwater, so only stored water stays clean; the map card says so when the drought reserve is Scarce.

### 9.6 Plugged spillway, 9.8 Second district site, 9.9 Gorge

- **Plugged spillway** (D71): a 1-deep side channel, 3 wide, from a lake to a map edge or lower ground, its bed one
  level below the lake's sill, closed by a line of 2–9 `Blockage` tiles flush with the banks (every channel tile
  beside the lake's water, its top at the sill), so the lake spills over it as over its own outlet. Demolishing it
  drains or diverts the basin: a strategic choice. Validation proves the map with the plug is valid; the card notes
  the effect of removing it (the lake's area × one level, not a second settle). Lake Basin and Islands place one
  beside a river's mouth, far from the start, where it leaves the colony's land whole.
- **Second district site** (D77), on maps of 128² and up: marks a site and changes no terrain, 60–120 tiles from the
  start's middle, on 600+ tiles of level land, with clean water a pump reaches within 16 tiles; the derived slopes
  join it to the start's network, and the generator plants a grove (48 trees) and berries (24 bushes) within 20
  tiles of it. No dam site or basin of its own yet; placed only where such a site exists.
- **Gorge** (D49; the dam site keeps its own ridge, D25, and can stand inside a gorge): a channel 3–9 tiles wide
  between walls at least 2 levels above the bed (up to 16 − bed), 6–40 tiles long, with the river's bed profile
  running through it; also a dam site with a high volume per dam tile. Beavers cannot climb the walls, so when the
  floor is on the colony's route the builder cuts a stair notch: a 1-wide staircase of 1-level steps with a slope
  chain (§7.5), a two-tile landing beside the water at the floodplain level, steps up to the ground behind the wall,
  square to the river along the nearest map axis (a plain cut where that ground is no higher than the floodplain). A
  gorge sits on a river and narrows it to its width (without a river it is a canyon landform). Rims 3 or more
  levels above the ceiled water surface get no moisture from it (6 tiles lost per level), so a gorge has dry rims
  unless another water body feeds them. No roofs: slot canyons with overhangs are out of scope, because the water
  model does not cover water under roofs. Validated: the channel carries the settled flow without flooding its
  rims, and reachability passes (§11.4).

### 9.7 Ruin fields

- **Totals:** scrap follows the ruins setting × the size-aware median, each map within the official typical range for
  the size (`src/core/resources/baseline.ts`); at most 5% of columns stand outside fields. **Shape:** fields of about
  19 / 32 / 39 / 42 columns by size, grown in an ellipse of aspect 1–2 with 4–10% holes, one tile of moat between
  fields. **Heights:** each field has its own tallness (the official storey shares tilted so a field averages 2.4 to
  3.8 storeys), placed by a mildly clumped key (neighbours differ by about 2 storeys), so a few towers of 6+ stand
  among shorter columns; only a weak inward lean (target Spearman about −0.2). The ruins on a plateau are a taller
  field.
- **Where:** on dry ground, so moist land is kept for farms and forests; at least the difficulty's ruin distance from
  the start and 18+ tiles between field centres; 1 field 20–40% of the way to the far edge, most at 40–70%, the
  largest at the frontier. **Each column:** `RuinModels.VariantId` A–E (A 26%, B–E 18–19%), turns mostly Cw0 (59%),
  `Yielder:Ruin` 15·h; each needs an 8-neighbour at its own level, which the one-level rule guarantees.

### 9.10 Achievable ranges by map size

The builders publish these ranges for the current map, and Claude uses them to resolve words such as "giant" when it
steers (D139). At 48² / 96² / 128² / 192² / 256²: waterfall width cap (40% of the side along the lip; the hydraulic
limit is about side − 8) 19 / 38 / 51 / 76 / 102; the Normal flow budget for the whole map 1.2 / 3.0 / 3.6 / 4.4 / 7.2
blocks/s (§5.3); the dam-site basin cap (15% of the area) 345 / 1,382 / 2,457 / 5,529 / 9,830 tiles. Waterfall drop:
hard max 15, practical 12, typical 3–8, at every size. Gorge wall height: 2 to 16 − bed. Reservoirs (blocks ≈ tiles at
the depth): Normal with Normal reserve 380 ≈ 190 tiles at 2 deep; Normal with Plenty 759 ≈ 380; Hard with Scarce
1,174 ≈ 391 at 3 deep; Hard with Normal 1,761 ≈ 587; Hard with Plenty 3,522 ≈ 1,174. Only the first fits 48² (8% of
it); every size from 96² up fits all five (Hard with Plenty takes 12.7% of 96²).

A standalone waterfall needs a footprint of about (W + 4) × 12 tiles, plus an outflow route. A 20-wide fall on 128²
fits; its lip would be about 0.03 deep at S = 2, or about 0.12 deep at S = 8, which is more than twice the map's
Normal flow and so needs the advanced override (D6). When Claude steers toward such a fall (D139), the S = 2 sheet
is the default, and its report says so. The other builders of the workshop study's plan (`riverFork`, lake outlets,
river switchbacks, a damSite spurs mode) are unscheduled (D253, D278); the plan is in the archive (§9.11). A builder
must re-check the rules its change can break: a lake added near the badwater basin brought contaminated soil 19–27
tiles from the start (`start.badwater`), and a lake beside a relic or mine site left it within 2 tiles of water
(`extras.placement`).

---

## 10. Water simulation

`sim/water.ts` is a port of the game's rules for heightfield terrain, from
[notes/water_and_soil.md, "Simplified water simulation spec"](investigation/notes/water_and_soil.md).

- One column per tile: floor = terrain surface; state = depth, contamination and 4 stored outflows. Substep dt = 0.3
  s, 2 per tick; 768 ticks per game day.
- Flow: `f = 0.999·f_prev + 0.675·(H_c − H_n)`, minus 0.1 when spilling onto dry ground at the same floor. Flows are
  kept positive, then scaled so a tile never gives more than it has. The stored outflow is `max(0, f − 0.8·f_back)`.
- The port mirrors `prototype/watersim.py` operation for operation and agrees with it bit for bit on the golden
  fixtures; only `+ − × ÷`, `min`, `max` and `ceil` are used (§2.1).
- The Rust water (`rust/water`, D381, D442 (b)) is wired but not switched on: its Wasm is committed
  (`sim/waterWasm.ts`, bound by `sim/rustWater.ts` and `sim/waterRust.ts`), and `tools/batch.ts --native` runs the
  canonical settle in its native binary. CI checks that it gives the same bytes natively, in Node and in each
  engine. The switch, the identity run against the app's water and the TypeScript's deletion wait until M9b is
  on dev; the Rust is then re-ported to M9b's `water.ts`.
- Evaporation: `1e-4` per second (`1e-3` under 0.02 deep), times the cluster-saturation modifier. Sources add `dt·S/N`
  per cell. **Map edges drain; the edge beside a source cell is a wall.**
- Partial obstacles (NaturalDam 0.65) follow the dam rules in the spec; Blockage and a badtide drain's back wall are
  full obstacles (the column floor rises by one, D28).
- Emitters come from the map's objects through their footprints (`sim/model.ts`): WaterSource, BadwaterSource (S/9 on
  its rotated 3×3), seeps (off above 0.8 deep at their anchor, back on below 0.72), and aquifers and badtide drains,
  which are off at map start. Delayed sources are off.
- Contamination moves with flow as a volume-weighted mix. Moisture and soil contamination are computed at steady
  state with a max-heap propagation: moisture 2·sat on water, then −1 orthogonal / −1.414 diagonal, −6 per level
  climbed; soil contamination from water with contamination ≥ 0.5, reaching 7 tiles; Thorns block both (a
  4-connected barrier).

**The canonical settle** (`sim/prefill.ts`, D27) is what files store and what validation checks:
1. **Pre-fill.** A priority flood from the draining map edge (edge tiles that emit water are walled, so they are not
   outlets; a weir raises its tile by 0.65) gives every tile its spill level. Water from each running emitter walks
   downhill or level on that filled surface. Every depression on the path starts full at its spill level; every other
   tile of the path starts at `min(1, 0.3·Q/w)` (Q the flow through it, w the shorter of the row and column runs of
   such tiles through it). The contamination starts at the badwater share of Q. A carve's sealed oxbow lake (D216), a
   basin no source feeds, starts with the water the carve stored for it (what the game settled there just before its
   mouths closed), so it holds water and then evaporates as an unfed lake does in the game. A Fill (D394) is stored
   and starts the same way, full to its level. Tiles whose unfed water the player removed (D387 (2)) are drained
   after step 2: their water no source feeds is taken, and the settle runs on, at most one more day.
2. **Settle.** The exact simulation, checked every 128 ticks, until the total volume changes by under 0.2% and at
   least 99.5% of tiles move by at most 0.005 (the §11.3 rule, counted exactly, with sums in index order so the Python
   oracle stops on the same tick); at most 6 game days (D358). With stacked columns (D120) the checks count columns
   (air gaps): at most 0.5% of the map's tiles' worth may still move. Only real flow is the water still changing
   (D222, D413): at each check the tiles of a sealed basin that only lost water (the oxbow lake or Fill above, while
   no running source and no map edge is in it) are left out of the test, the rest's volume measured against the
   rest, and the settle stops at the first check that passes (`steadyTicks`, `waterSteady`), the check where the
   map without the basin would stop. Every sealed basin at that check is stored with its lakes' water as the
   pre-fill started it: a Fill at exactly its level, an oxbow lake with the water its carve kept; the game
   evaporates them from there. Water would not stand as it started where an edit since widened the hollow below
   the lake's level (or a carve kept its lake mid-flow): there the lake's water is stored levelled into its hollow,
   up to its lowest rim. Other water the pre-fill's walk left in the basin is not the lake's and goes (D385). **No
   water from nowhere** (D385): the pre-fill's walk spreads level over flat ground in every direction, further than
   a source's water goes, so a hollow on a dry plateau it crossed would start full and keep that water. Once the
   water has settled, the water no running source and no stored lake reaches (`sim/fed.ts`: from their tiles, any
   wet neighbour whose floor stands no higher than the reached surface) is taken away, with any water Remove unfed
   water drained, and the water settles on from there, by the same test and limit; a map with none keeps its
   bytes. The Python oracle does the same (golden fixture `plateau_pit`). An imported map's own standing water that
   no source of its file feeds is a stored lake of the map (D457), kept like a Fill.
3. **The file** stores the settled depth and contamination (`depth:cont:0:floor:depth`, 7 significant digits, depths
   under 1e-6 dry), outflows 0, soil moisture and contamination at steady state, and the evaporation modifiers of the
   settled water.

**Fidelity.** On heightfield maps the port matches the game: the game's own save of a generated map after 975 ticks to
0.001; Diorama exactly, Waterfalls at 0.98 overlap. The preview's water *is* the water the player sees once the map
has run for a day, and maps are written pre-filled with it, as official maps are. Water under roofs (D120):
`sim/water.ts` simulates every air gap of a tile, split by terrain and the objects' obstacles, with the game's
stacked-column rules (sideways flow between overlapping gaps, pressure (overflow × 8), the overflow cap of (34 −
ceiling)/8, and roofs); on heightfields it moves no wet tile; on the official cave maps wet columns agree at IoU ≥ 0.99
on 17 of 19 (Oasis and Spillage hold aquifer and seep water no steady state shows); the pre-fill is a priority flood
over the graph of gaps. Imported maps can still have water the port cannot show (Cliffside 24 wet cells under roofs,
Canyon 180, Terraces 473): there the editor keeps the file's saved water and marks the preview approximate
(EDITOR_PLAN.md, Checks and water). Only the steady state is used. The port was also checked against a game save
written with mods active (none known to touch water); in-game check B confirms the result on vanilla.

**Drought.** Sources ramp to 0 for the whole drought. The drought check is analytic (`sim/drought.ts`, D29): water
below each basin's spill level stays, and water above it drains through the edges (a weir's own tile over its lowest
neighbour); each pool (4-connected water at one spill level) loses what its surface evaporates, 1e-4 per second times
each tile's saturation modifier, shared over the flat pool (0.0535 a day on wide water, more at a small pool's
corners); colony drinking is 0.424 per beaver per day. A test compares this with running the sim with sources off for
9 days on fixtures with basins: they agree within 5% of the stored volume.

**Performance.** The active set must be exact: wet cells plus their 4-neighbours, recomputed every substep and kept as
an index list rather than a full-grid scan (a once-per-tick set changed the settled volume by 5%). The settle starts
from the priority-flood fill, which roughly halves its ticks. The canonical settle is computed from the document alone (§19.7). Measured (M2): 0.07 s at 128² and 0.39 s at 256² for
River Valley at Normal; Lake Basin is the slow theme, 1.15 s at 128² and 3.0 s at 256² (D68). CI reports the 256²
settle median on every push as a number that never fails a build (D145). The editor's interactive preview re-settles
from the previous state (EDITOR_PLAN.md, Checks and water); the file always gets the canonical settle. The warm start
keeps the settled water away from the edit and pre-fills round it (D99), keeping the pre-fill's water only where a
running source, a stored lake or the water kept from before reaches it (D385); the preview stops when at most 0.05% of the
map still moves by more than 0.05 (64-tick checks, one day at most), or when only a sealed basin's evaporation still
changes it (D222). Local edits at 256² take at most 1.76 s in Node and 1.4–1.7 s in Chrome; the canonical settle
follows in the background, in slices, and before every export.

---

## 11. Validation

A generated map is offered for download only when **every** check passes, apart from the advisory checks:
`plants.drought` (§11.5), the start targets of §11.4 (D85), `water.storage_possible` (information the generator
prefers, #67) and, since D152, `water.clean_exists` and `water.clean_reach` (maps need not hold their water). Check
ids match `prototype/validate.py` and `prototype/playability.py`. Thresholds come from `gen/calibrated.ts`, which
mirrors `prototype/calibrated.py`.

The same modules serve the editor. Each check has a class, and a profile decides what the class does (§19.5):
- **load**: anything the game would crash on, silently drop, or break at start (§11.1, §11.2 except the design
  checks). It blocks the download in `generate` and the export in `export`; on import it is reported, and the
  importer fixes what the game itself would fix.
- **playability**: §11.3–11.4. In `generate` it must pass (the generator retries); in the editor's `export` profile
  it is a warning on the quiet dot, never a pop-up, and never blocks export (D184); the warning is noted in the map
  description.
- **design**: `terrain.max_height` (22 since D172 (1); the generator keeps to 16 until Verticality, §5.9),
  `terrain.single_floor` (from 3D-a, `caves.headroom` in its place) and `water.source_in_flow` (D171). They must pass
  in `generate`; in `export` they warn (`water.source_in_flow` not at all: in the editor sources go anywhere, D184);
  on an import they are only information, because official and workshop maps with caves, or terrain up to 22, load
  fine in the game.
- **principle** (D115 (2)): `terrain.edge_wall` (no edge walls, D151) and `terrain.dam_wall` (no built dam wall,
  D111). It must pass in `generate` and blocks the export in `export`; on an import it is information, and a problem
  an imported map already had never blocks its export (the export dialog lists it apart).

Imported maps have no spec, so thresholds come from the document's "designed for" difficulty (default Normal) and
default settings. Checks that need a planned feature (`water.badwater_contained`, `water.outflow`) report "not
applicable" when none exists: the result passes, carries `applicable: false` and says why (D31). The playability
class runs on every map; on maps with caves or overhangs it uses the top surface, an approximation
`terrain.single_floor` reports (D28). Maps whose water a steady state cannot show report their water and start checks
as "approximate", with the reason, in both validators (D87, D98; decisions-pending #36): a cause (caves on 5% or more
of tiles; delayed sources or aquifers carrying a quarter or more of the clean water, seeps half of the running water;
a start under a roof) with evidence that the settle disagrees with the map's own water (it floods more of the start's
ring than the map's water does, or its wet tiles differ on 10% or more of the map; a start under a roof needs none).
Of the 19 official maps, Hollows, Pressure, Oasis and Nomads are approximate; Beaverome's water matches within 1% but
its `start.dry` fails by its own design (decisions-pending #48).

### 11.1 File

`file.size` (4 ≤ W, H ≤ 256; the generator 48 or more); `file.layers` (exactly 23 voxel layers); `file.version`
(`GameVersion` and `version.txt` equal `1.1.2.4-52e959e-sw`; any `1.1.x` for external files); `file.singletons`
(MapSize, TerrainMap, WaterMapNew, SoilMoistureSimulator, SoilContaminationSimulator, WaterEvaporationMap and
`WaterSimulationMigrator{IsMigrated:true}` present); `file.arrays` (every packed array holds exactly `W·H·Levels`
tokens; `Levels` at least the terrain's floor count); `file.metadata` (all 8 keys; Width/Height equal MapSize);
`file.thumbnail` (960×540 JPEG).

### 11.2 Terrain and objects: emulating the game's loader

| Id | Rule |
|---|---|
| `terrain.max_height`, `terrain.top_layer_free` | surface ≤ 22 and voxel layer 22 empty (D172 (1), DGM Probe run 20260925-tall); above 16 the check notes that the in-game map editor edits only up to level 16 |
| `terrain.supported` | no voxel more than 3 sideways steps from support (0 on heightfields); with stacked terrain, every run not starting at z = 0 checked: no voxel the game's load rule would delete |
| `terrain.single_floor` | one floor per tile (the water model's scope); retired for generated maps with stacked terrain |
| `terrain.edge_wall` | No edge walls (D151, extending D111): a tile is walled when its outer two tiles stand 2+ levels above the highest of the next three; an edge is walled when 60% of its tiles are. Principle class. (Real places as converted: 89–99% of their most walled edge; official maps at most 38%; generated 128² at most 36%.) Not applicable under 10 tiles a side. |
| `terrain.dropped`, `plants.clearance` | `generate`: the build's support rule pass dropped 0 voxels (D121); every plant's blocks fit under the terrain above it (3 cells for pine and oak, 2 for birch and succulent, 1 for bushes) |
| `entities.templates`, `.enums`, `.components`, `.ids` | only common templates (§5.7); Orientation ∈ {Cw0, Cw90, Cw180, Cw270}, exact case; RuinModels + Yielder:Ruin on ruins, WaterSource (+WaterDepthStrengthModifier on seeps), UnstableCore on cores; unique lowercase GUIDs |
| `entities.placement` | each occupied cell of every object (`Coordinates + R(F(local))`) is inside the map, z < 33, not in terrain, with occupation flags disjoint from other objects, MatterBelow met (Ground: solid below; GroundOrStackable: solid or an overhang/drain top below), no object under an OccupyAllBelow block, water objects/geothermal/mine sites on the first terrain column: 0 objects the game would delete |
| `slopes.connect` | every Slope has ground at z+1 on its high side (Cw0 y−1, Cw90 x−1, Cw180 y+1, Cw270 x+1) and ground at z (or a chained slope at z−1) on its low side; with stacked terrain, the floor at the object's z |
| `start.count`, `.clear`, `.flat`, `.entrance` | exactly one StartingLocation; nothing overlaps it; its 3×3 footprint is flat at the start level; its entrance tile (Cw0 (X+1,Y−1), Cw90 (X−1,Y−1), Cw180 (X−1,Y+1), Cw270 (X+1,Y+1)) is free ground at the start level |

### 11.3 Water

The canonical settle (§10) of the map's own sources. A water tile is one deeper than 0.05; clean water has
contamination under 0.05.

| Id | Rule |
|---|---|
| `water.settles` | Steady within 6 game days (D358): volume change under 0.2% and 99.5% of tiles within 0.005 between 128-tick checks. A steady flow off the map is steady (D152); what fails is water that never settles. Only real flow counts (D222, D413): a sealed basin that is only evaporating (a carve's oxbow lake or a Fill: the water round its kept tiles, 4-connected, with no running source's tile and no map-edge tile in it; its tiles that lost water) is left out of both measures, the volume change measured against the rest; the canonical settle stops there (§10). Both validators apply it (`sim/water.ts` `steadyApartFromSealed`, `prototype/watersim.py` `steady_apart_from_sealed`); a `.timber` alone records no sealed basin, so there it changes nothing, and it never changes a generated map. |
| `water.no_flood` | Wet share ≤ 0.35 (≤ 0.55 for Lake Basin and Any; ≤ 0.70 for Islands, D369); official p90 0.40, workshop median 0.27, p90 0.67. The premise-based cap (decisions-pending #33) is dropped with the premises (D278). |
| `water.clean_exists`, `water.clean_reach` | Advisory (D152): clean wet tiles ≥ 2% of the map; a connected body of clean water of 40+ tiles. The start's water is `start.water`'s. |
| `water.outflow` | Every running source's water reaches an edge or a planned basin: its connected wet region touches a draining map-edge tile (not a walled source tile) or a lake feature. Not applicable without features (imports). |
| `water.source_in_flow` | Sources start rivers (D171): no WaterSource or BadwaterSource stands where water from another source comes down to it. Emitters whose tiles touch are one group (a sealed mouth, a cluster at a river's head). Water runs down the spill levels, across a flat toward its way out and never back, and all through a pool. A group is inside a flow when a running group's water reaches one of its sources and its own water does not reach that group back. Design class. |
| `water.badwater_contained` | With the planned outlet channel's tiles blocked (a levee, §9.5), the water rising in each planned badwater basin cannot leave the basin (its 7×7 floor and two-tile rim) or reach a map edge below the rim's level: the outlet is the basin's only way out, not proof that a levee holds forever (D57, pending Kyler). Not applicable without a basin with a planned outlet. |
| `water.storage_possible` | In place of `water.reservoir` (D111): the start's pump shore is fed by running clean water (at least need ÷ two days) and a dam site, natural pools or levees within 40 tiles hold the need (need × drought reserve, §5.3). Dam sites are sampled (every second clean water tile within 60 tiles of the start, crests 1–3, or 1–4 with Hard's depth rule); natural pools are the water kept through the worst drought (§10); levees raise clean water within 40 tiles 1–3 levels, up to the start's own level, behind a short line of levees. Information the generator prefers, never a reason to reject (#67, D209). Both validators. |
| `terrain.dam_wall` | (D111, D115) no built ridge that is a dam in all but name, a straight wall across a valley with a gap for the river (`analysis/ridge.ts`). Principle; both validators. |

### 11.4 Start and playability

These use the start requirements and difficulty targets of §5.6. "Near" means reachable by walking. The three start
requirements reject a map, and the start targets are advisory: the generator aims for them, and the map card warns
when a map misses one (D85).

| Id | Rule | Effect |
|---|---|---|
| `start.dry` | No water within Chebyshev 2 of the start centre after settling. Under a roof, water counts only where it stands at or above the start's floor (D145; investigation/terrain3d I-11). Open water keeps the rule above until Refinement item 8 has measured whether the floor rule should apply to it too, which would let lakeside starts pass (D107). | rejects |
| `start.water` | Requirement 1 (D153, D302): clean water touches a shore tile the start reaches on foot within the water-distance rule's walk (12 / 20 / 28), over the map's own ground and its Slope entities, and a pump on that shore reaches the surface (§5.6). Only water in a body (4-connected, over 0.001 deep) that a running source feeds, or that lasts the rule's drought (after `droughtStorage` for the difficulty's drought days, one of its tiles a pump reaches within the walk still is), counts: never a sealed puddle (`startWaterShore`, `start_water_shore`); the generator plans a start again when its water is only such a puddle. | rejects |
| `start.wood` | Requirement 2 (D164, D227): the logs of the grown trees within 20 tiles' walk (slopes allowed), alive or dead, by species ≥ Minimum starting wood (250 / 200 / 0); saplings' logs reported apart. | rejects |
| `start.wood_floor` | The starting-logs floor (D224, D227): the same logs within about 40 tiles' walk (the pin's `withinWalk`) ≥ the floor (178 for 1.1.2.4), at every difficulty. Never approximate: counted over the ground and its slopes, never the water. Both validators. | rejects (the editor: on the quiet dot, never blocking export) |
| `start.food` | Requirement 3: living berry bushes within 20 tiles' walk (slopes allowed) ≥ Minimum starting bushes (40 / 30 / 20). | rejects |
| `start.badwater` | No badwater water or contaminated soil within the badwater distance (30 / 15 / 8). | advisory |
| `start.reach` | Dry tiles walkable from the start (same level, plus slope links; blocked by Thorns, Blockage, NaturalDam, relics, cores, geothermal and mine sites) ≥ the buildable-land target (750 / 1,300 / 2,500). | advisory |
| `start.ruins_clear` | No ruin column within 20 / 15 / 12. | advisory |
| `plants.survive` | Every living tree and bush stands on moisture > 0, no water and clean soil; every living succulent on moisture 0. | rejects |
| `resources.scrap`, `.trees`, `.bushes` | Totals ≥ 0.5 × the size-aware official median × the setting multiplier (about the official p10) (D167–D170). | advisory |
| `resources.mine_site`, `resources.badwater_source` | At least one mine site (D167); at least one BadwaterSource or BadwaterSeep, unless the map is set to No badwater: its Badwater setting, or, for a map without its settings, its description saying so (D200). | rejects |
| `ruins.fields`, `ruins.access` | ≥ 80% of columns in fields of 10+ touching columns (official median 97%); every column has an 8-neighbour on ground at its level, not blocked. | rejects |
| `walk.levels` | (D122) information: the levels the start reaches without stairs and how; the heights that need stairs, and what lies there. In `generate`, nothing planned stands in a pocket no stairs reach. | — |
| `water.sealed_source` | No running source in a sealed air space (it fills, pressurises and loses water past the cap). | advisory |
| `extras.placement` | Relics, geothermal fields and mine sites sit on flat dry ground outside flood reach, at their distance bands (D75): level ground; no water within 2 tiles (Chebyshev) and outside every planned reservoir; the generated ones in their bands (§5.5, scaled under 128²); generated thorn belts 20+ and unstable cores 40+ from the start, and cores their radius + 2 apart. Both validators; not applicable when the map has none, or on an import. | rejects |

**Stored water needed** (`calibrated.reservoir_needed`):

```
drink    = colony × 0.424 × (drought_days + 0.5)
need     = drink + (drink / 2) × 0.0535 × (drought_days + 0.5)     (reservoir 2 deep)
```

That gives Easy 4 days × 40 beavers → 86; Normal 9 days × 50 → 253; Hard 30 days × 50 → 1,174. Hard also requires the
reservoir's mean depth to be at least 3, because evaporation takes 1.6 over 30 days: its dam sites are sampled with
crests 1–4 and count only when 3 deep on average; the natural water kept through the drought counts as before (D58).

### 11.5 Parity with the prototype, and `plants.drought`

`prototype/validate.py` and `playability.py` implement every check above, with the same ids, rules and "not
applicable" cases as the TypeScript validator. A map with a project file beside it (`<stem>.damgoodmaps.json`) is
checked with its spec and features; any other map as an import. The TypeScript port does not copy the prototype's
three first shortcuts (D28): a BadwaterSource's tiles come from the footprint transform, whatever its orientation;
WaterSeep, BadwaterSeep, BadtideDrain and Aquifer are emitters with their rules (§10); multi-tile objects (mine sites,
geothermal fields, relics, cores) block walking on their whole footprint. The parity test (`npm run oracle`) runs both
validators on generated maps and on all 19 official maps (import profile), and fails on any disagreement.

`plants.drought` is **advisory**: the one check that never blocks, in any profile. It flags living berry bushes within
20 tiles of the start whose moisture comes only from water that drains during a drought longer than 0.9 × their
DaysToDieDry (blueberry: 9 days, and Normal droughts reach 9 days): their soil is dry in the moisture of the analytic
drought water (§10). Every River Valley map at Normal carries it, because its bushes live on the river, which drains
in a drought (docs/decisions-pending.md).

### 11.6 Report

Each check yields `{id, class, severity, ok, value, limit, message, where?, fix?, advisory?, applicable?}` (§19.5,
`validate/report.ts`): `where` is the tiles, feature or entities involved, and `fix` an optional list of edit
operations the editor offers as a one-click fix (`deleteEntities` for plants that would die and ruins next to the
start). Load failures are errors everywhere; playability and design failures are errors in `generate`, warnings in
`export`, and warnings and information in `import`; advisory checks warn. The map card groups them into File, Terrain
and objects, Water, and Start and resources, and explains failures in player terms ("The start is 23 tiles from
pumpable clean water; Normal allows 16 (beavers go thirsty on day 6).").

---

## 13. Names and descriptions

A generated map's name in the game's list is its theme's, or "Dam Good Map" for Any (`gen/pack.ts` `mapName`). Its
description (`map_metadata.json`) says what it is, its size and difficulty, its badwater (the No badwater choice is
recorded, D200) and, on a map whose land rises above 16, that the game's map editor edits only up to level 16 (D172).
The saved file is `dgm-<theme>-<seed>.timber` (a seed typed as a word made file-safe; a real place or an opened file by
its name; D345, B10). Planned (M9b; D274, D278): a name and a one-line "how it plays" description from the map's
standout intention and its read-back features, checked on 30 hand-checked maps (10 at Variety 100).

---

## 14. Website features

### 14.1 Layout

The page follows [docs/UI-BRIEF.md](docs/UI-BRIEF.md) ("The page is the editor", D330): one workspace, a side panel for
the map as a whole (generate, Real places, Pick a place, the map card, Your maps) and rows over the map for the land.
Until it is built, the page is two panes (stacking on mobile, settings in a drawer): **left**, the settings panel (a
theme strip, Basics; Terrain, Water, Hazards and Resources as collapsible sections, Start rules under Advanced), every
control showing its official reference range as a faint band; **right**, the preview canvas (layer toggles, a 2D/3D
switch), the map card, Download (and the project file, §19.6) and the way into the editor. **Generate** is always
visible; changing a setting marks the preview stale. Generating again makes a new map; the edited one stays saved and
one step away (D336). Any `.timber` or project file opens in the editor.

### 14.2 Preview

- **2D top-down:** an elevation colour ramp with a hillshade from the north-west, so terraces read as steps; optional
  contour lines. Layers: Terrain (always on), Water (clean depth in blue), Badwater (brown), Moisture (green tint),
  Contamination (purple tint), Trees (living / dead / succulent dots), Berries, Ruins (height-coloured squares), Start
  (district center outline and entrance arrow), Slopes (arrows pointing uphill), Reach (land walkable from the start),
  Features (labels for falls, gorge, plateaus and islands). No dam site is drawn anywhere (D287). Hover gives a tile
  tooltip (level, water depth, moisture, what stands there); wheel and drag zoom and pan at 1–8× integer scaling.
- **3D (lazy):** three.js orbit view of the terrain columns, water surfaces as translucent quads at depth, and
  instanced trees and ruins: the editor's renderer (`render3d`, D45). The preview opens in 2D; 3D loads on demand. The 3D view colours the ground by
  moisture, as the game does (D86, D110, D114, D115), with a toggle back to height colours and a legend; 2D keeps height
  colours. The water's colours, opacity and badwater blend live in one shared palette, `src/render3d/waterPalette.ts`
  (D177). The two looks (Standard and High) are EDITOR_PLAN's §6.

### 14.3 Map card

- **Map card:** the name and description; key facts (size and theme, sources and strength, badwater, trees with their
  living share, bushes, scrap and ruin fields, the start's distance to water, the start rules of §5.6 with the starting
  wood and the logs still growing); the validation report, all green with a count or the failures expanded.

### 14.4 Download

- **The file:** `dgm-<theme>-<seed>.timber` (§13): a zip built in the worker, with the 960×540 thumbnail rendered from
  the preview palette; water, moisture and contamination pre-filled; byte-identical per seed and settings. **Install
  help** (after download): move the file to `Documents\Timberborn\Maps` (macOS `~/Documents/Timberborn/Maps`), then
  Timberborn → New game → the map is listed under your maps; the map editor can open it too. **Internal only:** a file
  without pre-filled water, for the in-game A/B check (§18), the probe and the tests (D237).

### 14.5 Shareable links

- **State in the URL fragment:** `#v=<generatorVersion>&s=<seed>&t=<theme>&z=<size>&d=<difficulty>` plus only the
  settings that differ from the theme preset (at the link's difficulty and size), in a fixed order with two-letter keys
  (the table is `core/spec/codec.ts`, D65; start rules `sw`, `sl`, `sb`, `sx`, `sr`; enum values as one letter), then
  `a` archetype, `p` premise, `c` colonies (reserved for Timber Together, D5) and `sp`, `k` for set pieces and
  constraints as base64url JSON, each only when set. A value the decoder cannot use is reported and the preset's value
  kept.

- **Old versions:** a link whose `v` is older than the current generator shows "Made with v1.2 — open in v1.2 (exact) or
  generate with v1.3" (a new map; edits never replay onto new land, D336); the first option goes to `/v/1.2/#…`.
  **Buttons:** Copy link, and "Copy seed + settings" as text for Discord. **Edited maps:** a link encodes the `MapSpec`
  only, so it reproduces the generated map without the player's edits; an edited map is shared as its project file.

### 14.6 Report a problem

As §2.3: a plain **Report a problem** link to GitHub issues, for bug reports (D145).

---

## 15. Testing

- **Unit** (Vitest, every push): RNG streams; sine polynomial error < 1e-9; noise; C#-style float formatting;
  world.json encoding; footprint transform (all templates × 4 orientations vs `footprints.json`); slope orientation;
  region labelling; dam-site finder.
- **Round trip** (every push on generated fixtures; local on `investigation/raw`, since official maps are not
  redistributable): read → write → read, byte-identical `world.json`. **Water golden vectors** (every push): TS sim vs
  the Python fixtures (`tests/golden/water.json.gz`) after 50/200/975 ticks within 1e-6, moisture mask exact, pre-fill,
  canonical settle and drought storage, the analytic drought within 5% of the simulated one, the game's own save within
  0.001 (local only).
- **Determinism** (`tools/determinism/`, D366): generation (every theme, 128² and 256²), every brush, every force at
  three Powers and Sizes, long mixed sequences, placements with undo, redo and reopening, the water and the Badtide
  give the same full-state SHA-256 checkpoints in Chromium, Firefox, WebKit and Node; a force's record is the same
  however fast it was planned; no native approximate maths in `src/core/` (the guard in the quick suite). Every push
  runs the short list on one Linux runner; nightly runs the full list on Linux x64 and ARM64, Windows and macOS ARM64,
  compared across hosts.
- **Oracle:** the Node CLI writes seeds × sizes; Python `validate.py --load-only` and `roundtrip_test.py` must pass;
  each TS check verdict must equal the Python verdict, on the official maps too when present (every push: 7 seeds × 3
  sizes; nightly: seeds 1–21, every theme and Any).
- **Contract** (§19, every push): the `MapSpec` schema accepts every preset and rejects out-of-bound values; features
  survive a JSON round trip; `build(features)` equals the generated map byte for byte, and an incremental rebuild equals
  a full rebuild; ids stay the same when an unrelated feature is added or removed; import normalization is checked on
  the investigation maps. **Golden maps:** pinned seeds (2 per theme; 96² and 256²): sha256 of the `.timber` plus key
  metrics; any change must be intentional (`npm run golden:update`).
- **Batch pass rates** (`tools/batch.ts`, nightly and before release): 100 seeds per theme per size at Normal, plus 30
  at Easy and Hard; first-attempt and final pass rates, failing checks, generated metrics beside the
  official ranges. Blocking: final pass rate ≥ 98% within 12 attempts. Reported as numbers (D115, D145): first attempts
  (60% target). **End-to-end** (Playwright, every push): generate → preview →
  download on 128²; share link round trip; layer toggles; worker cancel.
- **In-game** (§18, per milestone that changes the file format or the generator's physical rules; results in
  `docs/archive/ingame-log.md`): **deferred (D11).** Kyler skips in-game checks for now; each milestone lists its checks
  in the log as *pending* and does not wait for them, and the automated validation and tests above carry the gate.

---

## 18. In-game checklist

Short, and needs Kyler: each item names the file to use (`out/` or the milestone's batch output), what to do, and what
should happen; results go in [docs/archive/ingame-log.md](docs/archive/ingame-log.md). **Deferred (D11):** milestones do
not wait for these. They stay the definition of each check.

- **A. Load and start** (`out/m1/River Valley (4242).timber`): it appears under New game with its thumbnail and
  description; Folktails on Normal shows no "Loading issues" panel, the district center stands where the white square is
  on `out/m1/River Valley (4242).png` with the door facing the river, and 9 adults and 4 children spawn; beavers cannot
  step up a 1-level terrace edge without a slope and climb the generated slopes both ways; the map editor opens it, and
  edits and saving work; Iron Teeth once: the district center fits and beavers spawn.
- **B. Water and plants:** the pre-filled file: rivers flow on day 1 without a visible surge or drain, lake levels stay put
  over the first day, the berry bushes near the start are not flagged dry; the `… (empty water).timber` copy: rivers fill
  within about a day and the same trees survive; after 15 days living groves near the river are alive and the dead
  stands still dead with logs; the badwater marsh stays downstream and the start's water clean.
- **C. Set pieces:** a dam or levees across the gorge at the dam-site marker fill the basin to about the crest without
  leaking round the ridge ends; a water wheel at a generated waterfall turns; the first drought on Normal is survived
  using the stored water. **D. 1.0 objects:** a map with NaturalDam, Blockage, Thorns, relics, a geothermal field and a
  mine site loads with no loading issues; demolishing the plug releases the water as the card says.
- **E. Open questions** (any time): E1, terrain above 16, is answered (the game loads maps up to 22 and keeps their
  terrain, water and objects, D172, run 20260925-tall; the in-game editor edits only up to 16). E2: beavers walk
  *through* ruin columns, as the code says. E3: aquifer + powered drill during drought: no water? E4: what a map with no
  StartingLocation does on a new game (for the error message).
- **F. Added by the audit:** (1) **waterfall visibility:** two 20-wide standalone falls, one at S = 2 (lip about 0.03 deep)
  and one at S = 8 (about 0.12, with the advanced flow override): does the thin one read as a waterfall, and does a water
  wheel below each turn? The answer sets the flow policy (§9.2). (2) **Sealed river mouth:** a river entering on the edge
  with sources across its whole mouth keeps its water, and with a gap in the source row drains back off the edge. (3)
  **Imported pre-1.0 map:** re-export a workshop map without `WaterSimulationMigrator` (the importer halves its
  strengths): its rivers run at the same level as the original in game. (4) **Imported map with roofed water** (Canyon or
  Terraces): edit it away from the tunnels and export: the tunnels keep flowing as in the original.

---

## 19. Shared foundations with the editor

The generator and the editor are one app. This section is the one definition of what they share: the map spec,
parametric features, set-piece builders, stable ids, the validation classes and profiles, format I/O, determinism,
the build order and the platform adapters. [EDITOR_PLAN.md](EDITOR_PLAN.md) owns the rest of the editor's technical
side (the map document's structure, the operations, undo, persistence, the editor's checks and water, its
architecture and testing) and links here for these. Where the two disagree, a later decision in §20 says which is
current.

### 19.1 Map spec

`MapSpec` is a TypeScript type (`core/spec/mapspec.ts`) and a versioned JSON Schema (`core/spec/mapspec.schema.json`).
The settings panel, the URL codec and Claude all produce it. It holds `specVersion` (1), `generatorVersion`, the `seed`
(uint32; text seeds are hashed, §5.1), the `size` (48–256 for generation), the `theme` (the preset the settings started
from, §6: "any" or one of the six), the `archetype` (the theme: no per-theme layout planner, §8), an optional
`premise`, `designedFor` (easy, normal or hard), `settings` (every §5 value, complete, never a diff), `colonies`
(`{count: 1–4, mod: "none" | "timberTogether"}`, room for Timber Together, D5), `setPieces` (requested set pieces,
Claude steering, D139: `{kind, params, region?}`), `constraints` (`keepOut` regions the planner places nothing in, and
`keep` feature ids it builds around) and `accepted` (`{attempt, candidate}`, filled in by the generator so a document
reproduces its map without running the retry loop again).

- The URL fragment encodes a `MapSpec` as a diff from its theme preset (§14.5). The schema's hard bounds are the
  ranges in §5.
- A `SpecPatch` is a JSON Merge Patch (RFC 7396) on a `MapSpec`: objects merge and arrays are replaced whole. The
  patched spec is checked against the schema again; a patch that fails is rejected, never clamped. A patched spec
  makes a new map; it never regenerates a document under its edits (D336).
- `colonies` reserves room for fair multi-colony maps for Timber Together (D5): with `mod: "timberTogether"` and
  `count` N, a later milestone plans N `start` features (`player` 0..N−1), writes each as a `StartingLocation` with a
  `StartingLocationPlayer {PlayerIndex}` component and `MaxPlayers: N`, and adds fairness checks (each start's
  water, wood, food and reachable land within a tolerance, and a minimum separation). Until then the schema accepts
  only `{count: 1, mod: "none"}`, and nothing may assume a map has one start in a way that would block this.
- Imported maps have no spec (`spec: null` in the document); their difficulty comes from `meta.designedFor`.

### 19.2 Parametric features

One schema (`core/features/schema.ts`, `features.schema.json`) covers every feature. The fields every feature has are
`{id, kind, origin: "generated" | "user" | "claude", params, locked}`. The generator emits features, the build
pipeline (§19.8) rasterizes them, and the document keeps them as the map's plan; the editor does not edit them as
objects (D182, D184): the player's strokes and placements are edits on top (EDITOR_PLAN.md, The map document). Sizes
are in blocks (tiles) and heights in levels; the ranges each map allows are in §9.10. The kinds and the game rules each
must respect:

- `river` (path, width 1–9, bedDepth 1–4, bedProfile, flow, style, entry and exit, badwater, banks): the bed never rises
  downstream; an edge mouth is sealed (§7.6); moisture reach is 16 tiles at bedDepth 1, 10 at 2, 4 at 3, 0 at 4 (6 tiles
  lost per bank level above the ceiled surface); at most 8 blocks/s per source tile.
- `lake` (basin outline, floorDepth, outlet, inflow): the surface settles at the sill level (water is flat, so the level
  is not a free number); with no inflow it loses about 0.054 levels a day (warning); the basin never touches a map edge.
- `landform` (hill / plateau / ridge / canyon / valley / island / terraces, with an edgeStyle): gentle = 1-level steps at
  least 3 tiles apart, joined by slopes; terraced = 1-level bands 6–12 deep; cliff = a step of 2+ levels, impassable
  without player stairs; terrain stays within 0–16.
- `setPiece` (waterfall / damSite / gorge / terracedCliffs / badwaterBasin / plugSpillway / obstaclePayoff /
  secondDistrict, params per §9): built only by its shared builder (§19.3).
- `forest`, `berryPatch`: alive only on moist, dry-footed, clean tiles; succulents only on dry soil; common species only.
  `ruinField`: one level, each column needs an 8-neighbour at its level, `RuinModels.VariantId` A–E.
- `mapObject` (mineSite, relic small / medium / large, geothermal, thornBelt, weir, plug, bridge, unstableCore): the
  footprint, OccupyAllBelow and first-column rules (§11.2), with one placement rule for the generator, the tools and
  the preview (D69): level ground for single objects, dry and off rivers (weirs and plugs go across them), free of other
  objects, caves and the start. The bridge waits (§5.7).
- `carve` kinds (D118: tunnel, arch, skyBridge, cave, ledgePath, overhang, undergroundRiver): built only by their
  builders, which keep the support rule by construction (the build's rule pass drops 0 voxels); floors are run tops.
- `start` (position, orientation, bench radius, player 0–3, default 0, reserved for Timber Together, D5): a flat 3×3
  with 5 free layers and the entrance tile free at the same level; exactly one per map in vanilla.

**Derived layers** are rebuilt every time and never edited as features: slopes (pinned or removed slopes are stored as
edits), water, soil moisture and soil contamination. **A generated map's plan** holds every river, lake and planned
basin; the landforms of its layout; every set piece; every grove, as a forest; every berry patch, ruin field and map
object; and the start. Every entity the build places records its owning feature; the ownership is kept in the
document, not in the `.timber`.

### 19.3 Set-piece builders

There is one module per kind in `core/features/setpieces/` (`index.ts` `BUILDERS`). The generator's planner uses it, and
Claude reaches it by steering the generator (D139); the editor has no set-piece tools (D182, D184). A builder has a
`request` (a JSON Schema: the hard bounds of a request, outside them rejected), `limits(ctx)` (the ranges this map and
place allow, §9.10), `plan(request, ctx, id)` (the anchor, footprint and values reduced to the limits, with a report; or
why it cannot), `check(plan, W, H)` (a stored plan outside the hard bounds, which an operation may bring),
`rasterize(feature, target)` (terrain and the protected mask), `footprint(feature, target)` (what it reads and writes,
for dirty-region rebuilds) and optionally its springs, its own slopes, the tiles it keeps clear and what the editor
shows.

`PlanContext` is the map a piece is planned on (its surface, river channels, taken tiles, the start's zone, locked and
protected tiles, the objects on it; D47). A set-piece feature stores `{kind, request, plan, report}`; operations that
add or change one are checked against the builder's hard bounds. `BuildContext` is the generated land during
generation and the current map in the editor: the same code with the same results. The resolved plan is stored in the
feature; a rebuild rasterizes it and never plans again (§19.7); planning again happens only on an explicit edit of
the feature. The report lists every value that was reduced, everything that was cleared or relocated (trees, ruins,
bushes) and every source that was added. A builder never moves the start or touches a locked region; when it would
have to, the plan fails with the reason. Ruin fields are ordinary features with their own placement rules (§9.7).

### 19.4 Stable ids

- **Generated features:** `id = "f-" + base32(hash64(seed, kind, roleKey))`. `roleKey` is the feature's role in the
  plan, not how many other features exist (`river/main`, `river/tributary/2`, `setpiece/damSite/primary`,
  `ruinField/band2/1`, `forest/grove/<anchor tile>`), so adding a river does not rename the ruin fields; retries
  (`attempt`) and candidates are not part of the id.
- **User and Claude features:** a random UUID, made when the feature is created and stored in the document.
- **Entities:** `Id = guid(hash128(ownerFeatureId, template, localIndex))`, a lowercase GUID, so an entity keeps its
  Id (and, since the game seeds a tree's look from its Id, its look) through edits elsewhere. Entities placed by
  hand get a random GUID, stored in the document; imported entities keep their original Ids. `entities.ids` checks
  uniqueness; a collision is resolved by rehashing with a counter. A group of sources the build places itself (D314,
  a river head's row) is the one exception to the tile: its anchor keeps its tile's Id, and the others take Ids from
  the anchor's and their place along the row (`water/sourceGroups.ts` `groupIds`), so a spring an edit's ground moves
  along the row (a Quake Lift raising half of it) keeps its Id and is never counted as placed.
- Edits refer to ids. An edit whose target no longer exists after another edit becomes orphaned and is shown to the
  player, never dropped. Edits never replay onto new land (D336).

### 19.5 Validation

One set of modules (`core/validate/`) with the calibrated thresholds serves generation retries, the editor's live
checks and export gating.

- **Check result:** `{id, class, severity, ok, value, limit, message, where?, fix?}`. The classes are `load`,
  `playability`, `design` and `principle` (§11). A check marked advisory (`plants.drought`, the start targets of
  §11.4, `water.storage_possible`) is reported in every profile and never blocks.
- **Profiles:** `generate` (retry until all pass, then offer the download): load, playability and design must pass.
  `export` (editor export): load blocks; playability warns on the quiet dot, never blocking (D184), and is noted in
  the map description; design warns. `import` (opening a file): load is reported, and the importer fixes what the
  game itself would fix (§19.6); playability is reported; design is information.
- **Scope:** every check runs on the whole map or on a dirty region. The instant subset (footprints, overlaps, start
  area, limits, slopes, terrain support) runs after each edit; the rest runs in a worker. **Thresholds** come from
  `spec.designedFor` and `spec.settings`; for imported maps from `meta.designedFor` (default Normal) and the default
  settings. **Check ids** match the prototype, which stays the oracle (§4).
- **Imported maps' own problems** (D43): a check that already failed, over the same entities or tiles, on the map as
  it was opened is listed at export but never blocks it and is not noted in the description. The editor never makes
  a map worse, and an unedited import exports unchanged, multi-colony starts included (D5).

### 19.6 Format I/O

There is one reader and one writer (`core/format`), verified by the round-trip tests.

- **Writer:** always the native 1.1 format of [FORMAT.md](FORMAT.md), with deterministic bytes. **Reader:** 1.1 and
  1.0 voxel maps; 0.7 maps, whose keys are migrated the way the game migrates them; and 0.6 maps with
  `TerrainMap.Heights`, converted to voxels. Saves (`save_metadata.json`) are refused with a message.
- **Import normalization**, applied once and listed to the player:
  - No `WaterSimulationMigrator`, or `IsMigrated:false`: halve every `SpecifiedStrength` and saved outflow, as the
    game does on load, then write `IsMigrated:true` (otherwise the exported map would run at double strength).
  - 4-field water tokens: set `OldWaterDepth = WaterDepth`. More than 23 voxel layers: keep layers 0–21 and drop the
    rest, as the game does, with a warning (the writer then writes the standard 23, layer 22 empty).
  - Components 1.1 never reads (FORMAT.md §7) are dropped; `StartingLocationPlayer` is kept for Timber Together
    (D5). Old key shapes are migrated the way the game migrates them, and the version is stamped 1.1.2.4 (D36).
    Unknown components, unknown singletons, multi-slot water and moisture arrays, and key order are preserved
    verbatim.
  - Faction-only plants are flagged, with a one-click removal (they fail to load for the other faction and in the
    in-game editor).
- **"Exports unchanged":** after normalization, exporting an unedited import reproduces the normalized `world.json`
  byte for byte and keeps the original thumbnail; an edited map gets a new thumbnail.
- **Project file** (`.damgoodmaps.json`, gzip-compressed): the `MapDocument` (EDITOR_PLAN.md, The map document) with
  its spec, features, edits, meta, `generatorVersion` and built base; for imported maps the original file's data.
  The base is the whole map: surface heights, the multi-run columns verbatim, and world.json's exact text without its
  terrain array (D37). From format 3 (D119) the terrain is stored as heights plus runs (every tile that is not one
  plain run from z = 0, as its solid runs, in both `field` and `base`; maps without 3D forms store an empty list). A
  document opens exactly even after the generator has changed: it shows its stored base. M1 and M2 files (format 1,
  heights only) still open, rebuilt from their features.

### 19.7 Determinism

§2.1 applies to both halves. In addition: `build(document) → .timber bytes` is a pure function (the generator's
download is `build` of its own document, and so is the editor's export). Layout planning uses one RNG stream per
stage, and everything a feature places uses `hash(seed, featureId, purpose)`. Incremental rebuilds of dirty regions
are an optimization: a property test checks that one equals a full rebuild after random edits. **Water** written to a
file comes from the canonical settle, which starts from a state computed only from the document (empty, or the
documented priority-flood pre-fill, with any sealed oxbow lake's stored water, D216), runs a fixed tick schedule and
stops on a deterministic test; interactive previews may warm-start, but an export never uses their state.
**Versions:** a document records its `generatorVersion` and its built base; a newer generator opens it from the
stored base, exactly, its edits included (a generated feature the log changed leaves the stored base and is
built as it now says), and no rebuild keeps its edits (D336). Versioned deploys (`/v/<version>/`) keep old share links
exact.

### 19.8 Build order

Generation and editing use one pipeline (`core/features/build.ts`):

1. base terrain: the generated field, a heightmap import, or the imported map;
2. landforms, in document order;
3. set-piece terrain: cliffs, header pools, ridges, gorges, basins;
4. rivers and lakes: bed profiles carve; where a river crosses a landform, the river wins;
   4b. (D118) 3D forms: tunnels, caves, arches, sky bridges, ledges, overhangs and underground rivers, in document
   order;
5. the start bench and object pads;
6. sculpt edits, in order;
7. integrity pass: remove pits and spikes, keep beds non-increasing downstream; with stacked terrain, apply the
   game's support rule (delete what the game would delete on load, and report it; D121);
8. slopes: derived at generation, then kept as they stand (D368 (10)), plus pinned and removed overrides;
9. water sources and map objects (their tiles are taken before the slopes of step 8, D69), then the entity edits
   whose targets exist by now (D38); with stacked terrain every placement stands on a floor (a run top), by default
   the top surface;
10. water settle, soil moisture and soil contamination (canonical for export);
11. resources: berries, forests, ruin fields, placed using moisture;
12. the start entity;
13. the remaining entity edits, on resources and the start (place, move, delete, set properties);
14. validation.

A generated map starts from its stored field: the rivers, natural lakes, badwater hollows and rises read back out of
it are the field's own, so the build marks their channels and leaves their ground. Generation plans the features
(§7), then runs this pipeline.

### 19.9 Platform adapters

The core never touches the DOM or a platform API. Five adapters let one codebase build both the website and the
Claude artifact edition (deferred with Claude, D277): **files** (save and open: a file input or a drop, read as
bytes); **storage** (autosave: IndexedDB on the website; every call fails quietly when browser storage is
unavailable, D44); **workers** (a module URL on the website, an inlined blob in the artifact); **claude** (the
Messages API, or the artifact's `sample` capability); **download naming** (`.timber` on the website; a `.zip` holding
the `.timber` in the artifact, whose downloads allowlist has no `.timber`).

---

## 20. Editor decisions

These are the decisions in force, by topic. Every decision as recorded, with its reasons, date and amendments, is in [docs/archive/decisions.md](docs/archive/decisions.md); a number missing here is superseded or completed there.
New decisions are written here once, under their topic, with the next free number (D455; only the milestone session hands out numbers), and move to the archive when superseded or completed.

### How we work (sessions, models, reviews, documents, merging, releases)

- **D454** (tightens D316): No excessive tests, timings or validation, only when genuinely necessary or when Kyler asks; speed is judged by Kyler using the product. What stays: CI and the nightly suite (GitHub's machines), checks that catch real bugs, and a real check that the change works before reporting it done. Before adding any check, measurement or validation step, ask whether something is actually likely to break and whether Kyler would not see it anyway; if not, don't add it. Kyler, 2026-10-03 (`docs/archive/feedback/2026-10-03-no-excess-checks.md`).
- **D115** (with D112, D128, D145): Kyler's one rule, the lighter process, covers every step. Acceptance covers only what a player would notice or what would break; only three things block: (1) breakage (maps failing in the game, files or share links changing, lost edits, crashes; batches below 98% final; names that don't match the map); (2) principles Kyler has decided (no built dam walls, D111; the 3D support rule, 0 dropped voxels, and nothing stamped, D118); (3) what a player feels (the page never freezes; a first result appears quickly while the rest streams in). Measures and numeric budgets are information only, as are the permanent checks after M9 (no clones, no archetypes, no approximation of workshop maps, play variety; D128: at most 10% of a theme's maps closer to their nearest workshop map than the workshop's p10 nearest-peer distance, 0.591 on the variety scale), apart from the dam-wall check, which blocks. CI's timing tests are reported numbers and never fail a build. No blind review rounds: for anything visual Kyler is shown captures and decides. Claude stops and asks only for real decisions or real breakage, otherwise keeps building and logs the rest in `docs/STATUS.md`. ROADMAP marks every acceptance **Blocking** or **Information**.
- **D117** (with D11, D116, D127, D149, D218, D308, D333): The probe rule (CLAUDE.md has the text). Claude never launches or drives Timberborn, except the DGM Probe runner for an automated batch, only after asking Kyler (one message: how many maps, which checks, how long, that it launches Timberborn) and getting his explicit yes in chat, every time; one yes never covers a new batch, and closing Timberborn is not a yes. Never while Timberborn runs, never touching saves, settings or other mods, only when no other heavy work runs. On the dedicated machine only, a batch may run whenever the plan calls for one, without asking (D218; the game's settings backed up and verified afterwards; results in `C:\dgm-probe\`; each batch reported in `docs/STATUS.md` and the Progress log). A probe batch is the in-game gate for a stage that needs one, instead of Kyler's play test (the maps load, pre-filled water holds, objects load, droughts and badtides behave as the models predict within tolerances stated before the run, the screenshots show nothing broken); other in-game checks stay deferred, listed *pending* in `docs/archive/ingame-log.md`, never waited for (D11). A batch runs after every milestone that changes maps, before the tag, and a failed probe check blocks the tag unless Kyler waives it (D149); pending checks are pooled into one batch at a release candidate unless one blocks sooner (D308). The probe's screenshots are a local reference, never committed.
- **D148**: Stale tests follow Kyler's decisions (CLAUDE.md): a test that still passes but no longer checks what its name says, because a decision changed the thing it tested, is updated to the current decision (renamed if needed) and noted in the progress log, without asking. Never weaken a test to make it pass.
- **D341** (with D318): Green before merging: nothing merges into `dev` red, ever; no test stays known-flaky (a test that passes and fails on the same commit has its cause found, a real race or a timing dependence, and fixed). Every agent runs a real check that exercises a code change (run, build or type-check) before reporting it done, or says which check couldn't run and why.
- **D144**: A contact-sheet image at every map-changing step (CLAUDE.md): one small image `docs/sheets/<step>.png`, seeds 1–30 of every built theme at 128², top-down, labelled with seed and theme, our own generated maps only, under 1 MB (`npm run sheet`; its HTML pages stay uncommitted).
- **D150**: Dependency updates (CLAUDE.md): merge GitHub Actions updates and minor or patch npm updates when CI is green; hold major upgrades for a deliberate step at a quiet time (housekeeping) with the full nightly suite, never mid-milestone; Dependabot groups into one weekly pull request per ecosystem. `deploy.yml` calls the live check as a reusable workflow with the commit it deployed (no `workflow_run` trigger); it keeps its daily and manual runs against main.
- **D195**: Investigations commit reports, code, small samples and a few captures (CLAUDE.md, `investigation/README.md`); large generated results (bulk JSON, thousands of files, over a few MB) stay out of git in a gitignored `investigation/<name>/local/` or a GitHub Release, the report saying how to regenerate them; history is not rewritten for what's merged. Every Codex and Claude investigation prompt includes this rule.
- **D390** (replaces D326's item 34): The document prune is hard: the test for every document, section and rule is whether it changes what gets built, or how. Keep CLAUDE.md, PERFECT, STATUS, HANDOFF, ROADMAP, the active briefs and the decisions in force; archive, never delete, what is superseded or finished, with one index of what each investigation found and whether it was adopted; merge overlaps (PLAN and EDITOR_PLAN); delete stale text after checking nothing depends on it. Nothing about the product, its tests or its behaviour changes.
- **D188**: Docs are part of done (CLAUDE.md): a change that alters how something works updates its living document in the same PR (EDITOR_PLAN.md the editor, PLAN.md the product, ROADMAP.md steps, CLAUDE.md the rules, STATUS.md the current state); at every milestone boundary the living docs are skimmed against what was built and drift fixed and noted in the progress log; CI flags retired terms (`tools/retired-terms.json`) in the living docs, the interface text or the editor code, and a term is added when a feature is retired; `docs/README.md` says which documents are living and which history.
- **D221** (with D332): The "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)): a short plain comment each time a step finishes, something is released, a probe batch runs or something is parked for Kyler; STATUS stays the full record. Ping Kyler the moment his attention or input is needed (Windows toast `tools/notify.ps1`, two bells in chat, one Progress-log line): a decision only he can answer, anything ready for his eye, an approval (release, a merge needing his yes, a written brief), a probe batch waiting for his yes, work stuck on his side (machine, allowance, tokens or secrets, Timberborn running), anything broken that affects what he sees or plays. Not for progress, green CI or information-only findings. A ping says in one or two lines what's needed, where it is and what carries on meanwhile; non-urgent asks are batched; never wait silently.
- **D316** (with D380) *(tightened by D454; D380's speed gate superseded by D453)*: Compute is a resource, effort matches the stakes, quality is never compromised (top of CLAUDE.md and HANDOFF; every session, agent and investigation, and prompts from the planning chat and Codex). Invest in what compounds (reusable code, findings kept concise and findable, the project's history); spend little on what doesn't (one-off reports, ceremonial captures, re-verifying by hand what's verified, speculative edge cases, measures no decision uses); cheap automated checks stay broad (what's cut is agent time, not safety nets); verify deeply where failure is expensive and hard to see (the water matching the game, files the game loads, saved projects opening, determinism behind share links, release gates). Reports are short; a measure that drives no decision is information. Use the cheapest model and effort that does the job; before any report, measurement or manual check ask whether it will be used again or changes a decision, and where a prompt asks for more, follow it and say so in one line. Performance is part of what perfect means (D380; PERFECT.md, CLAUDE.md): every feature meets its speed budget before it ships, and a speed regression blocks a merge like a failing test (measured in a quiet window; the smoothness investigation's harness gates the renderer and moving water).
- **D301** (with D251, D317, D318, D341, D389): The model plan (the `.claude/agents/` definitions, which name full model ids, and HANDOFF's table): Opus where judgment is the product, Sonnet where the job is written down, scripts where it's only waiting. The milestone session is Opus 5.5 at high. `m9b-build` (Opus 5.5, xhigh) builds M9b; `build` (Opus 5.5, high) builds the forces, editor changes, the water and 3D engines, the generator's processes, Erode and the like (anything touching the water simulation, the generator or the forces stays there); `build-light` (Sonnet 5.5, high) builds from a written spec (mechanical merges and CI fix-ups without real conflicts, review sets and contact sheets, work touching layout or other work's tests, the document prune), going back to `build` if it needs judgment on the water, generator or forces; `build-light-medium` and `routine` (Sonnet 5.5, medium) take self-contained mechanical work (docs, routine fixes, re-pins, test updates within one area, recording decisions, STATUS, the Progress log). Waiting is done by background scripts that report when they finish, never by an agent polling. Never use Fable unless Kyler explicitly asks (he has, for the page session and D386's review); never raise any model's effort on your own; never start sub-agents at max. Screenshots and captures are downscaled before a model reads them unless the detail is what's judged.
- **D388** (with D384–D386): Two sessions. The milestone session handles everything except "The page is the editor" and its design; a page session (Fable 5.1, high) does only the page, in its own worktree and branch `feature/page`, started once the prune has landed. The page session owns the page, the editor's interface, Editor.tsx and its split; the milestone session owns the core, the water, the generator, its documents and PLAN §20's numbering, STATUS and HANDOFF; neither touches the other's files. The page session records its design decisions in DESIGN.md and `docs/progress/page.md`, folded into PLAN when its work merges. **D384:** the design pass is in step 1, built with "The page is the editor" with Kyler's sittings at each checkpoint: it defines Dam Good Maps' own look, guided by `docs/UI-BRIEF.md` and Timberborn's warmth as the High look carries it, using the impeccable-app-flow skill, leaving a DESIGN.md; it may borrow from the timbermods "walnut lodge" palette but isn't bound by it; 3D's own controls are designed when 3D arrives; the frame is styled once, in the design pass (D296). **D385:** the water and the editor's core must be perfect before the next release; anything Kyler finds in them blocks it. **D386:** once Kyler is satisfied with the quality, before the next release, a whole-codebase coherence review on Fable 5.1 at high (dead code, duplication, inconsistent patterns, things built twice) with a cleanup plan.
- **D395**: "The page is the editor" is rebuilt fresh under D384's design pass; part 1 (`feature/page-editor-1`, #92) is not its base. Its headless core is salvaged onto `dev` first as core work (the legend and levers, `src/core/library/`, the thumbnail, the spec differ, `src/platform/yourMaps.ts`, `tools/first-visit-maps.ts` with D343's deploy step, and their contract tests; none of `src/page/`, `page.css`, `workbench/` or the page's e2e test); #92 is closed as superseded and its branch kept as a record until the new page ships; `feature/page` starts from `dev`. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D396**: The `/preview/` slot belongs to the page session while it works; the milestone session asks Kyler before publishing anything else there. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D398** (amends D388): Post-release item 3, moving water and the Flow view and then renderer R1, is handed to a **renderer session** on a separate machine, on branch `feature/moving-water`. The milestone session doesn't build them; it merges that session's PR when it is green and Kyler says yes. The smoothness investigation (#107) is merged as an investigation, its harness only and none of its fixes, since that harness is the renderer session's gate. Kyler, 2026-10-02.
- **D415** (with D398): The renderer session's PR (#165) merges only on Kyler's yes, after his look at moving water and its gate (`tools/smooth/`) passing. Kyler, 2026-10-02.
- **D436** (amends D415) *(the 6-cell check superseded by D453)*: #165 (moving water, the Flow view, renderer R1) merges into `dev` once the renderer session has merged `dev` into it, CI is green (D341) and its 6-cell check (D435) passes on the merged branch; no full series, now or before the release (its earlier failures were all Firefox or the integrated GPU, now outside the gate). Not merged during a quiet window if it would touch anything the window measures. Kyler, 2026-10-02.
- **D446** (amends D353, with D398, D435, D436): Moving water and the Flow view are adopted (#165): the water worker sends the settle's own outflows, 4 per wet column, on every water view (an imported map's stored ones), and a fall's lip pours them (pinned to the settle by `fallOutflow.test.ts`); both looks read one flow texture made from the current in the renderer's bake worker; High's slope estimate (pending #111) is gone; foam threads, wakes and seams are always on, built in the bake worker, not the water worker; the Flow view's streaks are off by default (`renderer.setFlow`, `?flow=on` until the page places the switch); `VITE_DGM_CURRENT=off` is a measurement switch only. Renderer R1 lands with it (precomputed ambient occlusion, typed-array journey blends, uploads of changed rows only, remeshes into the chunk's own buffers), every change byte-identical. Merged on its 6-cell check (6 of 6). Kyler, 2026-10-02.
- **D342** (with D277): The editor is built so M12 is easy later (CLAUDE.md; nothing Claude-specific is built, D277). (1) Every change to a map is an operation in `ops.schema.json`, in plain terms (tiles, levels, strengths, seeds), validated and rejected with a reason when invalid, never silently clamped; no tool, force, Select action, placement or feature changes a map from the UI directly. (2) All editing logic lives in `src/core/` and runs headless in Node; `src/editor/` only turns input into operations and shows results. (3) Every question the editor answers (the checks dot's findings, what a force or core would clear, trees within walking reach, the difficulty levers, what's in an area, where things are) is a plain core function returning plain data. (4) Every refusal carries a plain one-line reason. (5) Contract tests exercise the core's operations and questions directly. Enforced in "The page is the editor" rebuild; existing code that breaks these is fixed when next touched.
- **D443** (with D342): Renaming a map is not a map operation: undo is for map operations only, so a rename never goes on the undo history and isn't added to `ops.schema.json`. The map's name is stored data, set by a plain core function that refuses an empty name with a one-line reason; the saved project file carries it, Save to Timberborn and the .timber download use it for the file name, and Your maps lists it. Kyler, 2026-10-02.
- **D351** (with D361, D368): An accurate tooltip on every control (CLAUDE.md): every tool, force, option in a settings row and in More, view toggle, shelf item and panel or ⋯ button has a tooltip of a short phrase of purpose and then its key as a small key cap at the end ("Flatten: level the ground" + key cap F), no second sentence. Whoever changes a control's behaviour updates its tooltip in the same commit; a test checks every interactive control has a non-empty tooltip.
- **D450** (amends D351): A setting's hover tooltip may carry the official maps' range as a short phrase ("Official maps: 9–15"), with the shortcut key cap after it; the grey explanation lines under settings are removed. Kyler, 2026-10-03.
- **D12** (with D22, D23, D343): The site lives in the `dam-good-maps` repository of the timbermods organization at `timbermods.github.io/dam-good-maps/`, deployed to Pages from `main` only (`deploy.yml`); CI runs on every branch. The browser test runs on the installed Chrome locally (`channel: "chrome"`) and on Playwright's Chromium in CI; CI runs the Python oracle on 5 seeds × 3 sizes on every push (the full 50 × 3 is `npm run oracle`, at each milestone). The first-visit maps are built during deploy, not committed (git holds only `tools/first-visit-maps.ts`), and the deploy runs a release's checks on them and stops if any fails (D343).
- **D349** (with D277, D384): The order of work (ROADMAP holds it): (1) finish the editor as players will know it: the forces release (done), M9b's release, the High look's release (done), the parity batch (D337–D339), "The page is the editor" with the design pass, the Weather view (closing step 1), custom map sizes (D357) and the dam sketch tool (D383); (2) 3D, terrain above terrain: the foundations, the view, then Erode and the Block tool (D279–D281, D335); (3) polish until mature (Kyler's editor UI audit, every feature feeling finished, M13 folded in); (4) collaborative editing, the next milestone (D362), since its first users must meet a polished editor; (5) M12 (Claude).
- **D283** (with D253, D285): Cut from the roadmap: the Map quality checkpoint; the Frame pass as its own step; the refinement phase as a milestone (its remaining small items, pending #2, #12 and #21, the load checks, `start.dry` and lakeside starts, the audit's A3 and A4, the held dependency upgrades and the unused lock and regenerate-area code #91, are housekeeping done when convenient, each with its test); the agent guide (waits with M12). M10 and M11 are removed (D253). M13 keeps the Report a problem link (a plain link to GitHub issues, no rating form), a shortcuts reference and help, and a final performance pass; versioned deploys and the mobile layouts for the generator page and gallery are Later (D285).
- **D225** (with D252, D282): What perfect means (`docs/PERFECT.md`, pointed to from CLAUDE.md, EDITOR_PLAN.md and CHAT-HANDOFF.md): Kyler's yardsticks for every piece of work and review; only "plays exactly right", "what you see is what you get" and the starting-logs floor (D224) are absolute, everything else is judged by Kyler's eye. Its Challenge section: the game's difficulty setting governs the game's difficulty; on the map, a harder map makes trees, easy growing or building land and easy dam sites hard to come by early, through interesting terrain; Hard slows expansion and never starves the start. Each M9 stage is judged by Kyler's eye against it before release, not only by batches and the probe; review sets are made only when his eye is needed for a decision or release (D308). The editor is where the magic happens and the generator provides the canvas (D282): M9 is judged as a great canvas, not a finished map.
- **D379** (with D382): The code's licence is the GNU Affero General Public License v3 or later (`LICENSE` the unedited official text; `package.json` `AGPL-3.0-or-later`); the README says it in a few plain lines (the maps people make belong to them; versions published before 2026-10-01 stay under MIT; copyright (c) 2026 Timbermods); both pages' footers link "Source" to the repository; third-party dependencies keep their own licences. No outside users for now (D382): Dam Good Maps is used only by Kyler, so compatibility with old share links, seeds' maps and project files is not a constraint (prefer the best design and re-pin freely), except that Kyler's own saved maps and projects keep opening or are converted automatically; revisit before promoting the tool to other players.

### The product and its principles

- **D108** (with D131): Maps are created, not copied. Dam Good Maps never approximates existing maps and never produces a few archetypes with a little noise; maps come from generative processes and composition, inspired by real landscapes, Timberborn's mechanics and good play design. Two maps must play differently, not only look different (a different place to settle, first dam, way through the first drought, threats, paths outward, something to discover). Workshop and official maps are evidence of what's playable and of Kyler's taste, never a template; borrow ideas (the techniques playbook), generate all geometry ourselves.
- **D111** (with D151, D152): No built dam walls. The generator never builds a dam-site ridge, in any theme, difficulty or setting (no "Ready" option); dam opportunities exist only where the terrain makes them (natural narrows, gorges, basin outlets formed by the processes) and the generator never adds terrain to create one; reservoir help, if kept, only steers what the generator looks for (default none on Normal and Hard). `water.storage_possible` replaces `water.reservoir` (information the generator prefers, not a blocking guard); accessible clean water stays a hard start requirement. Acceptance: zero built dam walls on every theme, size, difficulty and setting, with a check that catches ridge-like walls (a straight wall across a valley with a gap for the river).
- **D151** (with D152): No generated or converted map may raise a wall along its edges to hold water: a blocking check in both validators (generate and export profiles; reported on import); rivers enter and leave naturally. Maps don't have to hold their water (draining is the player's challenge): no walls or rims are added to keep water on the map, lakes may drain, water may go off the map, and the settle check accepts a steady flow off the map.
- **D13** (superseded by D449): Difficulty mismatches are warned, never refused: a Hard-designed map with a Scarce reserve generates, with a warning on the map card.
- **D449** (supersedes D13 and the "Designed for" setting, with D224, D382): "Designed for" (Easy / Normal / Hard) is removed: the editor isn't the authority on difficulty, the player shapes their own challenge (the Hard preset even made maps easier: 1,174 of stored water near the start against Normal's 253). A "Difficulty" section replaces "Advanced: start rules", holding Starting wood, Max walk to water, Starting berries, Start area and No ruins within, each a setting with today's Normal value as its default; everything else difficulty set (drought sizing, stored water needed, badwater and ruins distances, berries target, start bench) is fixed at today's Normal values. The starting-logs floor stays the one absolute. The core change comes after M9b's release: difficulty leaves the spec, the share link's `d` key, the generator's start rules, both validators (an imported map's designedFor is ignored and Normal's values apply) and the map description's wording; PLAN §5.6 is rewritten; re-pin freely (D382). The page session drops the control now and sends Normal meanwhile. Kyler, 2026-10-03.
- **D161**: The north-star player journey: find a striking place (for example in Google Earth), turn it into a Timberborn map (Pick a place), watch how its droughts and badtides play out (the Weather view), make a few changes (Live editing), and play it as a functional, validated, interesting map (export, later one-click play). Each step must feel smooth; a gap anywhere breaks the experience.
- **D5** (with D36): Vanilla maps have exactly one start; symmetry is a creative tool but not wanted (D253). Dam Good Maps will later make fair maps for Kyler's Timber Together mod (separate colonies on one shared map); the spec and feature schema keep room for it (`MapSpec.colonies`, §19.1; `start.player`, §19.2) and nothing multi-colony is built until a milestone schedules it. The mod reads extra starts as `StartingLocation` entities with a `StartingLocationPlayer {PlayerIndex}` component plus `MaxPlayers` in `map_metadata.json`.
- **D185**: The editor is desktop-first: a desktop screen, a mouse or drawing tablet (pen pressure) and a keyboard; a studio for creating maps, different from the game's precision editor. Phones get a view-only map; no tablet or touch editing goal.
- **D208** (with D209, D211): Themes are optional leanings, not templates. The default is "Any" (Surprise me): it combines landforms, water features and intentions freely; choosing a theme only leans its ranges, still varied within by Variety and intentions; "Any" maps are measured like each theme (coherent, playable, no clones, no archetypes). Rivers and badwater streams never run ruler-straight (the longest straight run is measured against real terrain and the official maps). The Start area setting is a preference ("prefer a roomy start" / "prefer a tight start"): it leans the land toward roomier or tighter benches and the start prefers a matching one, with no stamped bench; the map card shows the actual bench size; Flatten's "the start fits here" hint is how a player makes a bigger bench by hand.
- **D200** (with D167, D213): Metal and badwater on every map. At least one mine site on every map (generated, Real places, Pick a place): the Mine sites setting is 1 to 4 (no 0; old links with 0 decode to 1), placed by the generator's rules (flat, dry 5×5 ground, away from water, reachable, a sensible distance from the start), with a blocking check. At least one badwater source on every map (a permanent source is a late-game resource), placed naturally (a spring in a hollow or side valley, never at random) at the per-difficulty distance targets from the start (30 / 15 / 8 tiles), count and strength roughly like the official maps for the map's size. Players can choose "No badwater" (an explicit option; the default is at least one source): no badwater sources are placed (badtides still turn all water sources bad), and share links and the map's description record it; removing the last spring switches the map to No badwater with a quiet line, never a refusal.

### Core, files and validation

- **D1** (with D2, D7, D37): The shared foundations (the contract items) are defined once, in §19 (EDITOR_PLAN.md §11 points to it). Features first: the generator emits parametric features and builds the map from them, so the editor edits what the generator made. A document is a generation plus an edit log: the generation is the spec, the planned features and the built `base`, which stores the whole map (surface heights, multi-run columns verbatim, world.json's exact text without its terrain array), so a document from another generator version opens exactly from its base ("frozen"): the player's own edits apply, edits to what the generator made wait for `rebuildWithCurrentGenerator`. Project files are format 2 (`features` is the log applied to the generation, checked on open; `baseFeatures` stored only when it differs); format-1 files still open, their base rebuilt with the current generator, with a notice when the version differs. The log persists and undoes after reopening. Share links carry the spec only; edited maps are shared as project files.
- **D15** (with D16, D17, D20, D65): `core/math/detmath.ts` holds deterministic `sin` (odd polynomial through x¹⁷ after reduction to [−π/2, π/2]), `exp` and `ln` (range reduction and series). The JSON schemas are checked at runtime by a small eval-free checker (`core/spec/schema.ts`); Ajv checks the same schemas in the contract tests only, and they must agree. Entity `localIndex` (§19.4) is the entity's tile index, y·W + x; the ruin template in the hash is `RuinColumnH<h>`. The JPEG encoder is jpeg-js 0.4.4 vendored as an ES module (`core/format/vendor/`, BSD notice kept) returning a `Uint8Array`. The URL codec (§14.5, `core/spec/codec.ts`) has Copy link and Copy seed + settings: one fragment per spec, readable keys, room for Timber Together's colonies.
- **D36**: Import normalization (§19.6) applies the game's load-time migrations once: it stamps the native 1.1.2.4 version, halves `CurrentStrength` along with `SpecifiedStrength`, drops only the components 1.1 never reads (`DryObject`, `ContaminatedObject`, `NaturalResourceModelRandomizer`) and keeps `BlockObjectState`, `WateredNaturalResource`, `LivingWaterNaturalResource`, `ContaminatedNaturalResource`, `StartingLocationPlayer` and every start of a multi-colony map (`start.count` stays a vanilla load check until the Timber Together milestone). A map with fewer than 23 layers is padded, with a warning. `file.arrays` (both validators) checks each packed array against its own size field.
- **D35** (with D253): Edit operations share one envelope, `{op, params}`, camelCase: `addFeature`, `updateFeature` (a merge patch on `params`), `deleteFeature`, `reorderFeature`, `sculpt`, `placeEntity`, `moveEntity`, `deleteEntities` (plural, so one fix removes many), `setEntityProps`, `pinSlope`, `removeSlope`, `specPatch` (locks and `regenerateRegion` are removed). A validation report's fixes are this envelope plus a label. Operations are rejected with reasons when invalid, never clamped; sculpt brushes keep terrain inside the height limits (D244); hand-placed entities get a random GUID when the operation is made.
- **D38** (with D40): Build order (§19.8): entity edits run in two passes: after the sources (step 9), on everything that exists then (slopes, sources, an imported map's objects, hand-placed objects), so a deleted source or a placed Blockage changes the water; and at step 13, on resources and the start; hand-placed objects take their tiles before resources. Incremental rebuilds (§19.7) rasterize terrain only inside the dirty region (changed features' old and new footprints, the whole map when a river other features follow changes, the sculpted cells, widened for a smooth brush and by one tile for the integrity pass); slopes, the settle, moisture and each resource feature are reused when their inputs are unchanged; the result must equal a full build after every step. Editing imported maps (D40): the file's own slopes are kept (new ground gets D52's slopes); the integrity pass and terrain clip touch only tiles an edit changed; imported objects move to the new ground when an edit changes the surface under them; the thumbnail is redrawn only when terrain or water changed; an unedited import exports byte for byte.
- **D3** (with D31, D43, D56, D85, D111): Validation classes and profiles (§19.5): generated maps pass every check except the advisory ones; edited maps are blocked only by load problems; from M8 the start targets (badwater and ruin distances, walkable land) are advisory. A check that doesn't apply is reported passing with `applicable: false` and the reason (both validators); severity follows the profile (§11.6); `fix` holds edit operations in D35's envelope; the map card groups results as §11.6 says and shows advisory and export-profile failures as warnings. Export check (`export` profile): load problems block; playability and design problems warn and, if the player exports anyway, are noted at the end of the map's description; advisory checks are listed and never noted; an imported map's own problems (a check that already failed on the map as opened) are listed apart and never block or get noted, so an unedited export keeps its bytes. Instant validation (D56): after every edit the worker runs the load and design checks on the whole map (about 25 ms at 256², no settle, no thumbnail) and marks problems in the region the edit touched; one-click fixes move the start to the nearest good spot (start.flat, start.entrance, start.dry, start.clear) and remove slopes that join nothing (slopes.connect); the health pill runs the full export check 0.7 s after each change. Both validators (TypeScript and the Python oracle) change together, with 0 disagreements.
- **D57**: `water.badwater_contained` (§11.3), both validators: for each badwater basin with a planned outlet, the outlet channel's bed tiles are blocked (the levee) and a flood from the source's 3×3 over tiles lower than the rim (floor + 2) must stay inside the basin's floor and rim (an 11×11 square) and off the map edge; the value is the number of basins that leak; not applicable without such a basin. A source never stops, so the rule proves the outlet is the basin's only way out below its rim (the levee is the counterplay of §9.5), not that a levee holds forever.
- **D75**: `extras.placement` (§11.4), both validators: relics, geothermal fields and mine sites stand on level ground with no water within 2 tiles (Chebyshev) and outside every planned reservoir; generated ones lie in their bands from the start (small relic 13–70, medium 40–140, large 140+, geothermal 30–120, mine site 60+; under 128² the bands scale by the longer side ÷ 128); generated thorn belts 20+ and unstable cores 40+ tiles from the start, cores their radius + 2 apart. Objects the player places are held to the ground rules only. Not applicable when the map has none or on imports.
- **D69** (with D328): Map objects are `mapObject` features. A single object (mine site, relic, geothermal field, unstable core) is placed by its footprint's south-west corner and a facing; a line (thorn belt, weir, plug) by its tiles, one object each, turned and flipped by a tile hash as the in-game editor does. They stand at build step 9 with the water sources, taking their tiles before the derived slopes of step 8 and the resources of step 11. One rule (`features/objects.ts`, `fitProblems`) places them for the generator, the editor and the footprint preview: on the map, level ground for single objects (uneven ground is levelled, not refused, D328), dry and off rivers (weirs and plugs go across them), free of other objects, caves and the start.
- **D190**: Candidate intentions: the playbook's world traits are candidate intentions, one mechanism with D138's intentions, each an outcome with its emergence check.
- **D8** (with D10, D41): Claude and the artifact edition: the bridge is built against the Messages API first (it runs the request suite in Node and powers bring-your-own-key); the artifact edition follows. The M3 spike ([docs/archive/spike-m3.md](docs/archive/spike-m3.md)) showed a browser request with `anthropic-dangerous-direct-browser-access: true` passes preflight (blocked without the header), the core runs in a blob worker byte for byte like Node, and a file input opens `.timber` files; `sample`'s real latency and who can open the artifact wait for Kyler's run of the published spike page. The artifact edition downloads a `.zip` containing the `.timber` (its allowlist is `gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip`; `.timber` is rejected); project files save as `.json`. Its build is two Vite builds (the worker inlined as a string the page turns into a `blob:` URL, then the page script inlined into one HTML file); only fonts are fetched at run time; the page declares only `sample` and `downloads`, reaches the runtime through `window.claude.use()` and renders without it.

### The generator

- **D85** (with D104, D107, D153, D164, D227): The start requirements (§5.6, §11.4), with thresholds by difficulty (Easy / Normal / Hard), are the reasons to reject a map. (1) Water without stairs: clean pumpable water (depth ≥ 0.3, contamination < 0.05) with a walking path from the start to a shore tile over the map's own terrain and natural slopes (never player-built stairs) within 12 / 20 / 28 tiles' walk, measured to the shore tile, where a pump on that shore reaches the surface (0–2 levels below); rivers, lakes and ponds count (D153). (2) **Minimum starting wood** counts logs by each species' real yield (Pine 2, Birch 1, Oak 8, Maple 6, Chestnut 4, Mangrove 2; the Succulent yields water, not logs), only grown trees (saplings show separately, "plus about N logs growing"; dead grown trees count), within 20 tiles' walk: Easy 250, Normal 200, Hard none beyond the floor (D164, D227). (3) At least 40 / 30 / 20 living berry bushes (BlueberryBush) within 20 tiles' walk, slopes allowed, across any number of patches. "Living" means not dead and on soil where it survives at steady state (moist, dry-footed, clean); walks are bounded at 64 tiles. The thresholds are player settings (`sw`, Minimum starting wood `st`, Minimum starting bushes `sb`; changing Designed for resets them; imports use their difficulty's defaults) and the generator never aims below a minimum. The other start rules (badwater distance, defaults 30 / 15 / 8, range 8–60; ruin distance; stored drought water; walkable land `start.reach`) stay settings and generation targets with an advisory map-card warning and never reject a map. Unchanged load checks: the start's footprint on flat ground, a free entrance, exactly one start. `start.dry` keeps rejecting (water on the start is a broken start); lakeside starts stay a housekeeping item, and the floor rule (water counts only at or above the start's floor) applies only to water under roofs (D107, D145). `start.reach_water` is folded into `start.water`.
- **D224** (with D227, D229, D252): The starting-logs floor, a hard requirement like "plays exactly right": every map, at every difficulty, has at least **the floor** of logs reachable on foot from the district center (over the map's ground and natural slopes, never stairs) within about 40 tiles' walk; without enough logs to build a Forester the game is over. It is computed from the game's own data for the installed version: the worst still-viable route to a Forester across both factions, plus the first essentials (a water pump, a dwelling and, for Iron Teeth, a Breeding Pod), plus about 10%, never below 120. **For 1.1.2.4-52e959e-sw it is 178 logs** (Iron Teeth's route 99: Inventor 12, Industrial Lumber Mill 20, Large Power Wheel 50, Forester 10 logs and 7 planks; plus Deep Water Pump 12, Barrack 40, Breeding Pod 10; 161; plus 10%; Folktails 88). `tools/log-floor.ts` computes it from `Blueprints.zip` and pins it with the game version in `src/core/data/log-floor.json`, recomputed whenever the game version changes. It is not configurable (Minimum starting wood only goes up from it; Hard may place its wood a longer walk away). A blocking check for generated maps, Real places and Pick a place; the editor shows it on the quiet dot without blocking export. It is met in varied, natural ways (groves along a river, a forest across a stream, oaks on a plateau, pines in a side valley; never the same forest beside every start), and the start's wood and berry planting is spread over the 20-tile walk, reading the land, so no two starts get the same ring within about 10 tiles; the contact sheet and a start-area sheet are checked for starts that look alike.
- **D167** (with D168, D169, D170, D171): Resources like the official maps, for generated maps, Real places and Pick a place. Scrap ruins scale with map size (measured density by size, the Ruins setting moving around it), measured in scrap (15 per storey) so varied heights don't change a map's metal; ruins look and vary like the official maps (column heights 1 to 8 storeys, a few tall towers among shorter columns, irregular fields, the A to E variant mix). Trees: count per tile area, living and dead share (roughly two-thirds of official pines, oaks and birches are dead) and species mix scale with map size within the official typical range (25th–75th percentiles), varying from map to map, the Forests setting moving around that baseline; living on moist ground, dead on dry. Resources come in clusters by the official maps' measured clustering by size (berry bushes in patches, trees in groves with clearings between).
- **D171** (with D184, D314): Water sources start rivers: a source is where water begins, never in the middle of a flow. Generated maps, Real places and Pick a place place sources only where a river enters from the map edge or as springs at valley heads and below ridges, never inside an existing river or lake; for more flow several sources cluster side by side at the river's head or their strength rises, never downstream; each tributary gets its own source at its own head; a check flags any source inside an existing flow (blocking for generated maps, reported for imports). In the editor sources may be placed anywhere (D184). **D314:** sources come in rows and clusters as in Timberborn's own maps: one rule (`src/core/water/sourceGroups.ts`, for example a row of 3 or 4 across a river's head, the total strength shared) applies wherever a tool places sources itself (the generator, Real places' rivers and water-floor spring, Carve's source, Glaciate's meltwater); aquifers stay as they are; a source the player places from the shelf stays single, and Unleash places no new sources.
- **D59** (with D60, D61, D62, D66, D81): What the settings mean (§5; the old §7.4 terrain planner is in `docs/archive/plan.md`, D208). Relief puts the surface's p5–p95 range at `7 + 0.08·relief` levels; Terracing makes a band rise one level with probability 0.86 − 0.0059·terracing, else a 2- or 3-level cliff; Buildable land (Tight / Normal / Generous) sets the valley floor's width and how far band edges wander and how jagged they are. Near-start groves aim at 1.2× the trees rule, near-start berries at the larger of the setting and 1.15× the bushes rule, ruins keep the ruins rule + 7 tiles away, near-start food and wood go on land the colony can walk to. Rivers counts the rivers entering on the map edge (extra ones are tributaries bringing a quarter of the main river's flow each; with 0, a spring three tiles in feeds the main river; a river under 90% of the Normal flow may be narrower than 4.4 tiles, down to 2.4, so its water stays deep enough to pump; Braided waits for the Delta theme). Lakes and basins are riverside ponds: an outline of 24+ tiles on a river's floodplain, off the start's zone, dug two levels below the river's bed (three on Hard), joined by a cut at the bed's level, no spring; the count is the multiplier × the official median for the size (calibration row `basins_ge20`: 1.5, 4, 15.5, 15); only on reaches badwater never reaches. Badwater is the ratio × the main river's flow, split into basins of 1–3 (strength each total ÷ ⌈total ÷ 3⌉), placed nearest `badwater distance + 14` tiles from the start (at least distance + 12), outlets at least distance + 8 from it, joining the main river below the first step downstream of the start's reach or running to a map edge, never across or within 2 tiles of another river, the reservoir basin or a pond. The settings panel (§14.1): the theme strip, Basics, Terrain, Water, Hazards, Resources, Advanced start rules, a Limits note, "Reset to the theme's settings"; each control shows its band from the official maps; a drought reserve whose reservoir (need × reserve ÷ 2 deep, 3 on Hard) would cover more than 15% of the map is disabled with the reason; changing the theme resets every setting to its preset, changing the difficulty resets the start rules, badwater distance, berries target and the three start requirements; colonies are not shown (D5). Counts: thorn belts 1–3; unstable cores 1–4 (advanced), radius 2–3, countdown in cycle 5–12, 10.5 days in; relics 1–3 small, 1–2 medium from 128² (0–1 below), one large from 192²; geothermal fields 1 / 2 / 3 (under 128², from 128², from 192²). `tools/settings-suite.ts` has an experiment for each setting, measured against its target.
- **D26** (with D53): Channel width keeps the water inside its banks: for the generator's channels width = flow / (0.55 / (0.3 + 0.0015 · 0.8 · W)) (4.4 to 8.4 tiles, water about 0.55 deep), and in general w ≥ Q·(0.3 + 0.0015·L)/(depth − 0.35) (Q the flow plus the rivers it crosses, L its longest flat reach; the bed depth rises when 9 tiles are not enough; below 1.25 water/s a river is one tile wide). A river's centre stays 0.2·H + 12 tiles off the north and south edges and a planned basin 4 tiles.
- **D47** (with D6, D48, D49, D51, D52, D71, D72, D77): The set-piece builders (§19.3) plan deterministically from the map (no random stream), each with hard request bounds checked by the eval-free schema checker, and `core/doc/tools.ts` gives the editor, and later Claude, the planned operations. **Waterfalls** (§9.2): a standalone fall has a lip `width` wide at level L facing one of four ways, a header pool 3 rows deep at L − 1 behind it, a plunge pool 4 rows deep in front at the ground's level (lowered so L stays at 15 or below), walls round both, springs of 0.5 along the pool's back row, the whole flow capped at the map's budget unless `exactFlow` (at least 0.025·W plus the pool's evaporation), an outflow channel to the nearest map edge, river or lake (1, 3 or 5 wide by flow) with a bed that never rises and banks one above it; the width is capped at 40% of the side along the lip (48² 19, 96² 38, 128² 51, 192² 76, 256² 102) and the drop at 15, reported. Flow policy (D6): a fall takes the flow of the river it sits on; a standalone fall adds at most 100% of the map's flow budget, beyond that it builds a thinner sheet and says so; an exact flow in advanced mode may exceed the cap, with a warning (in-game check F1 pending). On a river a fall is a bed step at least 12 tiles from the next fall and no deeper than the river's bed allows downstream, keeping the river's width. **Gorge**: on a river only, narrowing it to 3–9 tiles for 6–40 tiles between walls 3 thick, 2 or more above the bed and at most 16. **Terraced cliffs**: 3–6 bands 6–12 deep rising away from the way they face, with a slope chain at the end nearer the start. **Badwater basin** (§9.5): 7×7 floor, rim two above it, one outlet 1 or 3 wide with its sill one above the floor, a channel to a river or edge kept 12 tiles beyond the start's zone. **Slopes** (§7.5): the 40-tile core, targets, one slope from each region of 400+ tiles beyond, 12 tiles apart, standing slopes joining their regions for free; targets are the regions of landforms with gentle or terraced edges and, on an edited import, the ground its edits changed; an unedited import gets no new slopes. **Plugged spillway** (§9.6): a channel 3 wide from a lake to a map edge or lower ground, bed one level below the lake's sill, plugged by 2–9 Blockage tiles beside the lake's water (or the plan fails) with their top at the sill. **NaturalDam weirs** (§5.7): on half the maps a weir where its river's water per tile stays in the channel (0.65 + 0.35 × flow ÷ tiles ≤ 0.93), left out when its water floods the floodplain within 60 tiles upstream or it cuts more than 60 tiles off the land the colony walks on. **Second district site** (§9.8): marks a site and changes no terrain, 60–120 tiles from the start's middle on 600+ tiles of level land with clean water a pump reaches within 16 tiles; derived slopes join it, and the generator plants 48 trees and 24 berry bushes within 20 tiles; maps of 128² and up where such a site exists; also where a second colony could start on a Timber Together map.
- **D273** (with D274, D276, D294): M9b's five outcomes, judged by Kyler's eye against `docs/PERFECT.md` (the measures are information). (1) A readable water story: the map's water can be followed at a glance from where it starts, into a main river or lake system, to where it leaves; a few tributaries, never a tangle (information: the share of the map's water carried by its main system). (2) Themes keep their promise, each signature emerging like an intention (a candidate without it is not chosen): River Valley a main river through a broad valley; Canyon a river cut deep between cliffs for a real stretch; Highlands high, rugged ground with plateaus and valleys among it; Lake Basin big lakes that dominate the water; Delta a river splitting into several channels as it reaches low ground; Islands land broken by water into islands in many layouts (archipelagos across the map, a sea off one edge, island chains, atolls); Any no promise. (3) Every map has a character: at least one standout intention, and its one-line description can say something specific. (4) Any handful differs: across any six maps of a theme, different openings, water stories and standouts. (5) Nothing looks stamped: no perfect circles (craters and round lakes get irregular rims), no ruler-straight lines, no theme stuck in one template. (6) Chaos: Any at Variety 100 and Verticality 100 meets the same outcomes, wild land but readable water and a describable map, with the batch pass-rate rule holding; every review set includes four such maps at 256². M9b starts from M9a's review-set shortfalls (D294): tangled water; Islands with no sea, Delta with no delta, River Valley, Highlands and Lake Basin blurring together; round craters and lakes, including the badwater hollows' round red discs in 3D; water in one corner with most of the land bare rock. 11 of 240 starts have a standing dead grove, accepted. M9b adopts the game's soil rules (D298) and runs on `m9b-build`. Deferred (D276): difficulty through terrain (PERFECT's Challenge) waits for a later step with its own design; the starting-logs floor and start guards stay. Kept from the M9b plan: the Variety setting and Surprise me, river-network variety through the intentions and outcome 1, the openings, weather-cycle signature and strategy axes as information, the dam-wall check as blocking.
- **D138** (with D165, D274, D275): Maps feel authored: each map gets one or two deliberate intentions, steered into being by the processes (never stamped, never a dam wall), such as a signature landmark or a meaningful relation ("the best farmland lies past the gorge", "the only safe water is uphill", "a waterfall shields the start"); the mix varies and some maps have none; a simple check that the intention exists on the finished map, else re-steer or drop it. Principles: (1) outcomes, never construction recipes; (2) failure is allowed: an intention that can't emerge naturally while every hard check passes is dropped, never forced by mutilating the map (how often each is dropped is recorded; one that almost never emerges leaves the set); (3) many structural realizations, the no-archetype and no-clone measures run within each intention. M9b's set: Kyler's four (D165: the start sits under a cliff with water below; a snaking river down a hill, its course turning at least three times while descending at least a few levels and dropping a level at several bends; a large crater that two or more rivers flow into forming a lake that leaves through a gap in the rim; a cliffside with a waterfall plunging into a large, roughly round lake with a natural uneven shore), the seven already in the set, and (D274) the river loops back and leaves an oxbow lake; lakes step down the valley, each spilling into the next; the river splits around a big island and joins again below; two waterfalls pour side by side over the same cliff; a long cliff splits the map into an upper and a lower world; side valleys hang above a wide valley floor, their streams falling in; two ways to grow (open farmland one way, wood and ruins up the cliffs the other); badwater spills through the richest land; a relic waits on a pinnacle; a plug holds back a lake (left out: round bowls clustering, rice terraces, the strongest current far from home, the broad dry plateau over deep water). Recipes are folded into intentions (one concept, checked by outcome, D275); flow-direction variety comes from rotating or mirroring each finished map into one of its 8 orientations (all 8 appear, none over a quarter).
- **D278** (with D143, D325, D329, D333, D348): Candidate choice and speed. The generator makes candidates until one meets the three outcomes (the theme's signature, a standout intention, readable water) within a capped number of attempts (the 12-component score, K = 3 and the "More like this" votes are gone). The first candidate that passes the absolutes is the map: shown and editable at once, never held back or swapped (D325 item 22, D329); if it misses an outcome a background worker searches on and offers the first version meeting all three in the candidates strip, notifying only where a theme promise is missed (D333; readable water doesn't notify while misses are common); no other candidates unless More is pressed. Land is never shown and then replaced (D348): every check judgeable from land alone runs before the land is shown (kept fast); checks needing settled water are fixed automatically afterwards. Every shaping step finishes before the first land is shown (D370), apart from the outlet wear (D350). Speed (D333): 128² 2 s typical / 5 s at the 90th percentile to a settled map; 256² 3 s / 6 s to editable land and 8 s / 20 s to settled water; at least two-thirds of first maps meet all three outcomes at 128² and 256², reported per theme. Names and a one-line "how it plays" description come from the standout intention and read-back features (names match the features on 30 hand-checked maps, 10 of them at Variety 100). **Another like this** (one button on the generator page and in the editor) makes one sibling per click (same theme, settings and intentions, different land, its own share link, never a clone). Item 47's must-haves (D319, D325, D331, D333): a base raise so the deepest riverbed stands at least 3 levels above the map's floor; an edge lip at a river's head (`water/edgeLip.ts`: its water flows into the map, never straight off it); two reachable mine sites at least 24 tiles from the start; a badwater source where a spring would rise with level ground for its 3×3, never where its stream reaches the start's water or first farmland; berries enough for an Iron Teeth start; a second district behind an obstacle at 40–70 tiles; at 48² they scale to one reachable mine site and no district-behind-an-obstacle intention; the absolutes never relax; the five difficulty levers (items 24, 47) are computed in M9b but shown only in "The page is the editor". The place resolver, the judgement-word table and river-course naming beyond descriptions moved to M12 (D277). M9c is removed; `m9-build` stays unused.
- **D363** (with D328, D369, D370, D373): Mine-site pads are levelled while the land is shaped, before it is shown (generation, not repair): about 49 tiles, lowered by at most one level, on dry ground clear of water, within the start's walk, as a small natural terrace easing into the land, never a crisp notch; requirements stay the same from 96² up. The start's pad is levelled the same way (D373 (3), the 96² starts). Total water cap per theme (D369): Islands up to about 65–70% water (cap 0.70), Lake Basin and Any 0.55, the rest 0.35 (`rulesFor`), item 47's land guarantees holding on Islands; islands in a lake can hold mine sites and objects. M9b's measures cover 96², 128² and 256². Theme audits (D370): shared fixes first (every shaping step finishes before the land is shown; badwater hollows admitted only where they survive settled flow; the mine-pair room check reserves the pair for the placement that follows; planned river joins that settle into separate systems; the canyon signature reads wide rivers' walls); Islands, Delta and River Valley's own shaping adopted one at a time, each theme re-measured after each; Canyon, Highlands and Lake Basin (weakest, 47%) wait for a re-audit after the shared fixes; the settings prototype is held and last (its round 2 on the new base); in the nightly settings experiment a setting that barely moves the map is fixed, never its target lowered, and a target is re-based only where a decision deliberately narrowed a range (D333 (6)).
- **D307**: A floodplain floods: a valley floor one level above its riverbed that floods when the river refills after a drought, or in a badtide, is a floodplain as the game plays it; the floor rule (the old PLAN §7.4, in `docs/archive/plan.md`: floodplain = bed + 1) and the channels' depth stay (wider, shallower channels are reverted); hovering flooded floor in the day-by-day Drought and Badtide view says "Floods when the river refills".
- **D405** (with D278, D380): Small starts' hidden land (#153): the first land shown waits for its settled start's mine pair only at 128² and under (`SHOW_PROVED_MOST`); above 128² the land shows at the land stage as before, since holding it back at 256² took the first look to about 7–8 s against D278's 3 s. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-m9b-review.md`).
- **D406** (amends D350 (b)): Generated maps have no worn way out: a rising basin that won't settle is fed more gently instead (generation speed round 2, #155). Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-m9b-review.md`).
- **D407** (with D209, D273, D370): Islands and Delta block M9b's release: on M9b's review set each is one map with minor differences, worse than M9a (Islands: a flat central island, a ring of round islets, a square sea and a land frame, no relief, no fresh water; Delta: one meandering river across a dead-flat plain, pale shallow sheets and edge strips, no fan, no relief), failing outcomes 4 and 5 and D273 (5). Redesign both, keeping the promise without the stamp. Islands: varied arrangements (a chain, two large islands with a strait, an atoll around a lagoon, a scatter of mid-sized islands, one large island with satellites), real relief and fresh water (springs, rivers, lakes) on the islands, starts on different kinds of island, no land frame unless the layout calls for one. Delta: a river entering from higher ground and splitting into several channels that fan out to a lake, the sea or the map's edge, islands and marsh between the channels, low but real relief (levees, terraces upstream, the higher ground the river comes from), the fan's position, direction and size varying by seed, no pale water sheets, no edge strips. The absolutes don't relax. Kyler judges the shape first on a 30-seed contact sheet of each at 128² beside M9a's, before outcome counts are tuned; the 840-map measures come after he accepts it. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-m9b-review.md`).
- **D408** (supersedes D370's Islands and Delta adoptions): D370's two templates are retired as the default shaping (`land/archipelago.ts`, `land/delta.ts`). D273 (2)'s promises stay the target, built from the generator's own processes: uplift, erosion, terraces, relief noise, drainage, the water. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-islands-delta.md`).
- **D409**: Islands' water cap (D369, 0.70) stays as a bound. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-islands-delta.md`).
- **D410** (with D209, pending #103): D209's sea layouts come back as the starting point for Islands, each with real relief and fresh water (springs, rivers, lakes) on the islands, as a range of layouts, not six new stamps. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-islands-delta.md`).
- **D411**: On Islands the start may sit on any island where everything it needs is on that island (its mine sites, food and logs), not only the main one. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-islands-delta.md`).
- **D412**: Delta has upland and relief across the whole map, not three flat bands; the river splits into several channels, with the fan's position, direction and size varying by seed. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-islands-delta.md`).
- **D416** (with D412): Delta's redesigned shape (sheets at 3d2d89ea) is accepted. Tuning: every seed reads as a fan (seeds 8, 15, 19, 28 and 29 read as an ordinary river valley), and the thin water across the fan on seeds 4 and 23 is fixed. Kyler, 2026-10-02.
- **D447** (with D385, D416): Delta's water outcome miss blocks M9b's release: on M9b, Delta misses its water outcome on 5 of 20 maps at every size because parts of its planned river courses stay dry, a visible water fault in a theme M9b releases. After the quiet window: trace it (first suspect e3130755; compare the measure's per-seed Delta rows before and after), fix the cause with a test that fails before the fix, re-measure only what the fix can reach (Delta's 60 maps for Delta's own code, every theme the changed code runs in if shared; not all 840 unless it reaches them all; no new timing runs, D439), then the D148 re-pins and M9b's other release steps. Kyler, 2026-10-03.
- **D417** (with D408, D410, D411): Islands needs another shape round before Kyler accepts it: the sea never reads as a square block in a frame (its outline doesn't run parallel to the map's edges with square corners; the rim the game needs stays, varied in width, broken into headlands and cliffs, with islands touching it); no hard rectangular patches or notches (seeds 3, 14, 20 and 26); the start on an island on most maps, not on the ring (islands are where the player builds); fewer, larger islands with real relief, keeping the variety of arrangements. Then a new 30-seed sheet at 128² beside M9a. Sea maps not drawing Hanging valleys or Farmland past a gorge is a default he can overrule (pending #155). Kyler, 2026-10-02.
- **D423** (amends D417): Islands' inland sea inside a ring of land may stay as at most about one map in four; the rest break the ring, as seeds 23–25 and 28–30 of 3fbb21f7 do. The start belongs on an island: Kyler decides how from a big-island sheet with straits beside the safe one. Delta keeps tuning seed 29 (still a lake) and seed 23's thin water. Kyler, 2026-10-02.
- **D426** (amends D423): Islands takes the safe sheet's layouts (de36b1ba) and grows one island in each large enough for the start: off-centre, in a different place each seed, never a central island in a moat inside a ring of land; where a layout truly can't hold one, the start falls back to the shore. The new sheet is judged beside the safe and big-island sheets. Pending #155–#157 are accepted (sea maps draw no Hanging valleys or Farmland past a gorge; a Delta draws no gathering crater; Delta's arms 0.4 of the river and its floors 1–4 tiles). Kyler, 2026-10-02.
- **D427** (amends D426, with D417, D423): The grown-island sheet (be9b645c) is not accepted: islands in a moat (13, 17, nearly 3), the ring of land on most maps, a square sea (29), maps reading as land with lakes (6, 9, 10, 22, 27, 30), 17 of 30 starts on the mainland, the promise down to 14. The cause is the safe layouts' centred sea inside a ring of land; the next round fixes the sea's layout so it breaks the ring on most maps (as seeds 23–25 and 28–30 of 3fbb21f7) and the grown island lies off-centre in open water, the ring at most about one map in four. Its sheet counts by seed the islands in a moat, ring-of-land maps, maps reading as land with lakes and island starts. If most starts can't go on an island with the promise near the safe version's 20, Kyler chooses between that sheet and releasing the safe version with island starts parked until after the release. Kyler, 2026-10-02.
- **D428** (with D411): An island start at 128² needs 1,200 walkable tiles (Buildable land's number), not 1,966 (12% of the map). Kyler, 2026-10-02.
- **D429** (supersedes D423's "the start belongs on an island", D426's island start, and D428, which lapses with the grown variant): The start on an island is not required. What Kyler wants from Islands is islands to expand to: every map has at least one island large enough to build on, reachable from the start across water as the game allows. Kyler, 2026-10-02.
- **D430** (with D407, D417): Islands releases in its safe version (all 30 seeds at 128² pass, the promise on 20, all three outcomes on 19); the grown and big-island variants are not adopted, their patches kept in `investigation/m9b/` as history. Islands no longer blocks M9b's release. Kyler, 2026-10-02.
- **D432** (overrides D407 for this one point, with D429, D430): Islands releases as the safe version as it is. Its 12 seeds at 128² without a reachable island of 150+ tiles to expand to (5, 8, 9, 11, 12, 14, 17, 19, 20, 22, 24, 27; neck-joined land isn't counted; 8, 9, 20, 24 and 27 read as land with lakes and rivers, 19 as one lake in a near-square frame, on most others the islands touch the shore) are a known shortfall, fixed after the release by an Islands round measured by `investigation/m9b/islands-reach.ts`: islands kept apart from the shore, and layouts that read as lakes or rivers redrawn. Nothing changes on M9b's Islands code now. Kyler, 2026-10-02.
- **D433** (with D429, D432): Islands at 96² (the promise on 2 of 20 maps; most seas read 0–2 islands where it needs 3) joins the known shortfall, fixed in the post-release Islands round, not before the release. That round reports, at 96² and 128², the 3-island promise and D429's measure (every map has at least one island large enough to build on, reachable from the start across water), with `investigation/m9b/islands-reach.ts`. Kyler, 2026-10-02.

### Water

- **D27** (with D358, D359): The canonical settle (§10): a priority-flood basin pre-fill plus an open-channel pre-fill of `min(1, 0.3·Q/w)`, then the simulation until the §11.3 test passes, checked every 128 ticks for at most 6 game days (D358; it stops at the first passing check, so every map that settled within 4 days keeps its exact bytes). The test counts "at least 99.5% of tiles within 0.005" exactly and sums volumes in index order. Both validators run this settle on the file; files store 7-significant-digit water tokens and the settled evaporation modifiers; the Python oracle reproduces it bit for bit. The faster settle (D359, `investigation/water-speed`) is identical byte for byte (about 1.25× faster at the median, 1.4× on 256² lakes and seas) and is adopted into the water engine with the full identity checks. Slow evaporation from sealed basins (a drying oxbow lake) doesn't count as "water still changing"; only real flow does, so the quiet dot settles once the water has (D222).
- **D120** (with D28, D29, D279, D293, D295, D297, D298, D303, D308, D311): One water model everywhere, the game's. Stacked-column water replaces the heightfield model: the game's rules on air gaps, including the five edge rules (a generator version bump), reproducing the official cave maps' stored water (17 of 19 at IoU ≥ 0.99; the other two are aquifer and seep maps). Once the stacked engine is wired in, the game's rule the heightfield port simplified (evaporation on a dry tile that receives water) joins `prototype/watersim.py` so the Python check keeps agreeing bit for bit; the game's edge-spill rule (a 0.1 spill threshold where a river leaves the map at the lowest level) and the game's soil rules (`sim/soil3d.ts`, matching the official maps' stored soil on 99.79–100% of slots; moisture in the Python check too) land with it. D308: one switch to the game's rules in M9b, one re-pin of the tests and golden fixtures, one set of batches; D311 accepts D297's line missed where thin sheets form less under the game's evaporation, with the pooled probe batch checking the water against the game itself. There is no Python copy of the stacked engine (D279): 3D water is verified against the game itself (probe test maps T1–T6 and the official cave maps' own saved water), then its results on those maps are saved as golden fixtures CI checks on every push; the Python validator treats water under roofs as information; heightfield water keeps its Python check. Acceptance line (D295, D297): a tile may change between wet and dry only where its depth under the game's rules is within 0.01 of the wet line, and the map's water volume stays within 0.1%; the probe's wet-tile counts are judged the same way. The water model of map objects (D28): emitters and walking blockers by footprint; Blockage and a badtide drain's back wall are full obstacles; NaturalDam follows the spec's partial-obstacle rules; seeps switch off above 0.8 deep and on below 0.72 without the game's real-time fade; aquifers, badtide drains and delayed sources are off; every emitter walls its map-edge padding, also when off. The analytic drought (D29) evaporates each pool by its tiles' own saturation modifiers, shared over the flat pool, a weir tile's own water draining over its lowest neighbour.
- **D350** (with D358, D360, D373): Water that won't settle on a shown land. First (d): outlets are widened while the land is shaped, before it is shown, so most basins settle; each channel below a confluence is cut as wide as all the water it carries there (D373). Then (b) for what's left: the stuck basin's outlet gets the smallest possible local cut as an automatic repair, part of the map arriving within the seconds after the land appears, never after the player has started editing near it; the cut is one contiguous shape following the water's path out (a smoothly widened mouth or channel as if water wore it, a smooth curve at bends, never blobs, isolated tiles, fragments, arms or stubs, and refused if it would have them), capped at about 200 tiles (real cuts are 62–102), a map needing more being fixed at the source (the slow sea, the straight channel). Never accept unsettled water as it is for generated maps (water still moving at save leaves a lake that keeps rising in the game); that stays for Real places only (D245 (6)). Before M9b's release the absolutes failing (6/70 at 128², 12/70 at 256²) reach zero. Redrawing the land when a river would flood a flat as a shallow sheet (D372) and a lake fill-time rule (D373 (2)) stay off; lakes too slow to settle would start full (stored at their settle level, as oxbow lakes already are), a design kept in M9b's progress log if one appears; a few slow-settling lake and sea maps join M9b's probe batch.
- **D99** (with D260, D197, D268): The editor's water. After an edit that moves water, the rebuild warm-starts (`sim/preview.ts`): the previous settled water and outflows stay on every tile whose ground, water objects and 2-tile neighbourhood the edit left alone, the canonical pre-fill goes on the rest, and the exact simulation runs until, checked every 64 ticks, the volume changes by under 0.2% and at most 0.05% of the map moves by more than 0.05, for at most one game day; moisture and plants follow the preview's water. In the background, 0.7 s after the last edit (dropped when a newer one arrives), the worker runs the canonical settle in slices of 16 ticks (`SettleRun`: the same ticks and checks, so the same bytes), replaces the preview's water and runs every check; the health pill shows progress. Export settles canonically first, with progress in the dialog: a file never gets the preview's water (§19.7); imports get their water and colony checks too. Water reacts immediately: water near an edit starts moving within a frame or two (simulated around the edit first, then the rest), nothing waits for the whole map; the final water is always the game's settled result (D197). After an edit water plays at its normal pace (a small edit settles nearby in a second or two); Skip goes straight to where it settles; Pause and Replay on the water bar; Speed (slower, normal, faster, instant) lives only beside the day strip (D268); forces keep their own pace. **Water no source feeds recedes at once (D260):** water changes only through its causes; deleting a source removes its water, including pools it filled; a lake a force deliberately stored (RetainedWater, such as Carve's oxbow lakes) is its own cause and stays while its hollow holds it (a breached hollow drains through the breach, a filled one loses its water). After every edit that can change what water is fed, the editor finds wet tiles no running source can reach and gives them the canonical start (dry) in the warm start, so they drain as part of the edit's journey (within a frame or two; gone within about 1 s at 128², 2 s at 256², at once at Instant); a removed source's upwelling, marker and strength label disappear the moment it is removed; the preview's water once it stops matches the canonical settle's.
- **D98**: Approximate water on imports, both validators: sources that turn on later or aquifers carrying a quarter or more of the clean water, or seeps half or more of the running water, make the water and start checks approximate only with evidence the settle cannot stand for the map's own water: it floods more of the start's ring (Chebyshev 2) than the map's water does, or its wet tiles differ from the map's on 10% or more of the map. An approximate check passes, keeps its numbers and says why (`CheckResult.approximate`); the oracle compares it as its own verdict. (The cave cause is retired by D120.)
- **D133** (with D173, D186, D267, D268, D269, D285): Weather: players see how a map behaves through droughts and badtides before playing it. The editor's **Drought** and **Badtide** buttons are a day-by-day view: a click shows the hazard's worst (last) day at once with progress shown, never a frozen page; clicking again returns to the map's own water. A day strip on the water bar runs Day 0 (the map as it is) through the last day, with previous and next (it can stay on any chosen day without cycling back), a click on any day, a play button and Speed; stepping animates that day's water at that speed, Instant jumps and stays. Length is 1 to 30 days per hazard, remembered, defaults Normal's longest (drought 9, badtide 8). The lakes and rivers the start's pumps would draw from are highlighted, and the strip carries a marker: in a drought the day the start's water leaves a pump's reach ("Day 6: your start's water is gone"), in a badtide the day badwater reaches the start's water or farmland; hovering any water says when it dries ("Dry on day 6", "Lasts the drought") or turns bad. Any edit ends the hazard view (D269): the map's own water returns and clicking again shows the new worst day. The model stays the game's (sources stop in a drought, water drains and evaporates; clean sources give badwater in a badtide and the ground is contaminated). The Weather step (end of step 1) keeps a **drought line** in the normal view (every lake and river shows a faint line on its shore where its water will stand on the last day of a drought of the strip's length, a lake that would dry out a faint dry tint over its bed, the start's water marked a little more strongly, updated in the background after each edit, never blocking) and a map-card line on how the map fares in its first drought and badtide; every claim traces to the model and a verified rule, says "can't tell from the map" where that is true and never promises colony survival; the strategy axes stay information in M9b. The Weather step brings the High look's contamination veins into the Badtide view and the Unstable Core's moment into its timeline. Exact-weather speedups (D173, `investigation/simspeed-cycles/`, proposals): bit-identical, re-proved after each cumulative step without accepting a changed hash; the first drought first when it's on screen, a background start after generation when resources permit, lossless caching under the full input, configuration and model-version hash, cancellable bounded batches; they change waiting times, never a simulated result.

### The editor and its tools

- **D158** (with D179, D184, D204): Live editing is how you edit a map (EDITOR_PLAN.md holds the vision): no plan-confirm-place flows, no Place button, no waiting. Responsive above all (every input answered in one or two frames; the display's frame rate while painting on 256²; no main-thread stalls; cancel and undo at once); direct manipulation; everything reversible; show, don't ask (live previews, limits and reasons while dragging, never dialogs afterwards); good defaults. The land is the interface: the map is the hero, the interface small and quiet, feedback from the land itself (water moving, ground greening, a waterfall appearing) rather than panels or readouts. Few tools, each obvious and doing one thing (if two overlap one goes); smart defaults instead of settings, options hidden until wanted; undo instant and Esc always backs out; one grammar everywhere (pick, paint or place, see the result). **Tools read intent** (D204): whenever a player would hesitate, switch tools or do something twice, look for a way the tool could have known what they meant. Blocking: responsiveness as defined, and breakage (strokes replay exactly, undo and redo always correct, no crash, no edit lost). Every stroke is an operation that replays exactly (the stroke record changes once for target, mode and sources, old strokes replaying unchanged, D322), one undo step per stroke or placement with a clear label; background checks are quiet; only changed chunks rebuild; keyboard access and screen-reader labels. Kyler judges the editor on a preview address (`https://timbermods.github.io/dam-good-maps/preview/`, noindex, refreshed after every iteration). Live dimensions where precision needs them (D183): a selection's size, a straight stroke's length, the level while flattening.
- **D182** (with D184, D198, D247, D248, D263): The brush kit is the core of the editor: brushes feel like painting and the player can't mess up. All landform tools are eliminated (hill, plateau, ridge, canyon, valley, island, lake and resource-area objects, their handles; no presets). The top bar holds Raise, Lower, Flatten, Smooth, Naturalize, Select (a small button; M or Ctrl+drag also open it) and the forces; a row beneath shows only the picked tool's options; the size ring is drawn on the land and strength shows only while changed. Circle and Square shapes (square aligned to the tile grid) and Straight lines (click, then Shift-click) are small toggles, off by default; Terrace is a Flatten option ("in steps"); pen pressure controls strength on a tablet; Level lines (a thin line wherever the ground steps down a level) are a view-bar switch beside Height colours, off by default. Smooth has no "Make walkable": walkable edges come from the shelf's Slope. **Flatten** (D204, D322) is the game editor's absolute, hard-edged flatten: its target is the height where the stroke starts (Ctrl-click samples another level, on water the bed's level, D180 (3)); it cuts and fills so one stroke makes a clean plateau; a quiet "the start fits here" hint when the area is big and flat enough for the district center, stronger when it would also meet the start requirements; trees and objects ride the ground. **Smart Lower** (D184, D263): a Lower stroke that starts in or next to water carves a bed that keeps flowing downhill, so the water follows the brush (no Channel tool); the ring turns a clear, slightly thicker water-blue (faint fill a second cue; ordinary Lower keeps the white ring, D198); a new channel's bed starts one level below the surface of the water the stroke starts from and never rises, stepping down where the land beside it falls lower (cut as deep as needed to keep flowing downhill, no deeper); holding never deepens it, only extends the river; a stroke along an existing channel deepens its bed by exactly one level; plain Lower away from water is unchanged. **Naturalize** (D368 (8), D387 (4)) weathers what the player paints, protected only where the map must stay correct (the start's pad and the ground under sources and objects; forces' results, brush strokes, rivers and set pieces are fair game): cliffs retreat into irregular slopes with scree at their feet, edges soften, contours stay coherent while becoming natural at a scale that follows Size and Strength, never single-tile speckle; it never breaks `slopes.connect` or a set piece's protected tiles.
- **D399** (amends D387 (4), D368 (8)): Naturalize's land effect is a new algorithm, not tuning: today's per-tile rule (`stepTile`, a 20% per-tile hash and four-neighbour rules, nothing depending on Size) makes single-tile speckle, wrong in every capture and both looks. The target: edges wander but don't fray (one continuous line curving in and out by a few tiles, the curves' size following Size and their wander Strength); cliffs of three or more levels retreat into stepped slopes with an irregular apron at their feet; the downhill order is kept (no new pits or sinks, no lone bumps, no neighbouring pair swapping which is higher); flat tops stay flat; no seam (the effect fades across the ring's outer part); repeating settles toward a natural profile, and Size 64, Strength 10 over the whole map looks like a believable older version of the same map; the protections, `slopes.connect`, set pieces' protected tiles and exact replay unchanged. Kept as contract tests on many seeds and random strokes (no changed tile above or below all four neighbours, no new closed depression, no pair reversing order, no new step at the boundary, ten repeated strokes changing less each time); cut and fill balance is information only. The stroke is versioned so strokes saved before keep replaying with the old rule. Shown with `tools/capture-naturalize.ts`, with a lower-Terracing reference column. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-naturalize.md`).
- **D404** (with D368 (10), D399): Trees keep the build's rule through every edit, brushes included: the build marks a tree dead or alive from the moisture under it after each edit, so the saved file matches the ground. Naturalize adds and moves nothing; where its weathered ground becomes moist, the same tree comes back alive. Kyler, 2026-10-02.
- **D425** (supersedes D345 B5 for generated maps, with D368 (10), D404): No edit or force adds an object (#178): an edited map keeps only the objects the generation placed; water never adds or removes one, so a generated forest flooded by a lake stands in it dead, as the game does it, instead of being hidden and growing back; a broken slope stays gone; carried objects land where the force put them. A nightly sweep of every brush and force in sequences of two or three edits fails on any new object id. On M9b, `forceTrees` expects 20 surviving trees, since craters no longer regrow them. Kyler, 2026-10-02.
- **D418** (amends D399): Naturalize never raises ground that is wet or moist out of the water's reach: low wet ground may take scree from a cliff above, but it stays wet, so farmland is never lost. Kept as a contract check across the sheet maps and random strokes. Kyler, 2026-10-02.
- **D419** (amends D399, with D380): Naturalize's stroke is weathered dab by dab, in the replay exactly as in the preview, so each dab touches only its own footprint and margin; new strokes record `weathering: 3`, older ones replay with their own rule. Target under about 8 ms per dab at Size 64; no Rust port or worker unless that can't reach it. Kyler, 2026-10-02.
- **D422** (amends D419, with D380, D381): Naturalize's weathering runs in the worker: the cursor and the brush ring answer within a frame; the land may trail by at most two frames at Size 64; default sizes (1–3 ms dabs) show no visible lag; the result and the replay stay exact (`weathering: 3`). The brush wiring in the page session's files goes to it as an exact patch; the Rust port comes later in its turn under D381. Kyler, 2026-10-02.
- **D424** (with D399, D418, D419, D422, D381): Naturalize round 4 is accepted (#170). The land's lag at the slow end, about 3 frames at 60 Hz at Size 64 against the target of 2, is recorded as a known shortfall, to be closed by the Rust port in its turn (D381). #170 merges when green; its page wiring goes to the page session as `docs/progress/naturalize/brushes-worker.patch`. Kyler, 2026-10-02.
- **D434** (with D380, D424) *(superseded by D453)*: Tonight's quiet window ends with a Naturalize bench (the land's lag at Size 64, with and without `brushes-worker.patch`, `tools/bench-brush.ts`), after M9b's timings. If the lag is clearly worse than the 3 frames accepted in D424, Kyler is pinged with the numbers and D424 is reopened until he decides. Kyler, 2026-10-02.
- **D451** (amends D414, D434, with D380, D439) *(timing work superseded by D453)*: M9b's timings measure only what a decision needs: M9b's tip against `dev` at 256² (D380), Lake Basin round 2 against the tip (its adoption), and the Naturalize bench (D434); small starts' first look and generation speed rounds 1 and 2 are dropped (both adopted; the 256² comparison catches any net slowdown). The runner accepts the Claude app's steady load: it starts when the mean load is 20% or less, records the load beside every timing and pauses on spikes; the runs stay paired against dev, so a steady load hits both alike. Its gate judges by load, not by which processes exist, and agents stop any server they start. No extra series (D439). It runs at the next point the queue allows; D424 stays accepted until the bench runs. Kyler, 2026-10-03.
- **D184** (with D180, D196, D205, D207, D322, D345, D361, D368): Controls. Plain scroll zooms; hold F and move the mouse to resize the brush (size also in the options row as a number and slider; { } too); F+scroll or [ and ] set strength (Power on every force, strength on Smooth and Naturalize, nothing on Raise, Lower and Flatten, which have a target level); Shift+scroll sets that target level; Ctrl+click samples a level; Shift+click does the opposite (Raise becomes Lower); Ctrl+scroll over a source changes its strength; Alt+scroll changes the visible layers and Alt+click picks a tile's layer, as in Timberborn's `LevelVisibilitySystem` (read for answers, never copied): the level control (▾ ∞ ▴) sits top right beside the compass, everything above the chosen level hidden, tools acting on the visible land, Esc never resetting the slice, only the ∞; X puts down the held tool, leaving a plain pointer that selects and drags every object (trees and bushes, the start too) with a hover highlight of exactly what will be picked, a bigger object winning over a tree or bush; Esc cancels a stroke; number keys switch brushes; Ctrl+Z/Ctrl+Y; the number shows beside the pointer while sizing or scrolling; when the window loses focus every held key is released and any stroke or gesture ends cleanly. View bar (D287, D345): a single **Top-down** toggle and Reset view, Height colours, Level lines, Markers (sources and slopes), Badwater and Under roofs overlays, Clear water (T), the **Flow** view (D353), **Slow forces** and a Sound speaker icon (crossed out when muted) under the level control; every camera view frames the map centred. The Dam sites, Moisture and Drought views are gone (D287: Timberborn has no dam-site concept; the analysis stays internal, never drawn). Water turns clear automatically only under or around the brush while it is over tiles that already have water (a faint blue tint, ripples and a soft bright shoreline so it still reads as water; badwater stays distinguishable); T toggles clear water for the whole map (D196, D212).
- **D265**: The camera only moves when the player moves it (an accessibility rule, motion sickness): no follow camera (the water bar's, Carve's, the force driver's; saved preferences with follow on are ignored), and no feature moves, tilts, zooms or shakes the camera on its own, now or later (every force, the water, the weather, the Real places gallery's map view, the Select tool); visual effects on the land are unaffected. While keys are held the camera moves every frame, scaled by frame time with a quick ease-in and short glide, speed scaling with zoom (WASD, Q and E rotate, Shift faster, arrows too; never while typing; D180).
- **D347** (with D196, D376, D387): The hover readout (bottom left) names whatever is under the pointer: height and soil, water depth, bed level and contamination, every object and plant with its key fact ("Ruin, 5 levels, 75 scrap metal", "Water source, 1 water/s", "Pine, grown"), both for an object on ground, with the plain pointer or any tool held; it refreshes live whenever the water under the pointer changes without re-hovering, and hovering water subtly highlights the sources feeding it. It comes from one plain core function describing a tile and what stands on it; every new object gets one. Trees an edit has dried out say so (D376): "Oak, grown · dry soil, will die", with a subtle mark with Markers on, never a change to the trees.
- **D249** (with D196, D212, D290, D315, D345, D361): Sources. Water is never an object; it is the result of sources and land (the generator's river objects are never exposed; clicking water selects nothing). **Water source** and **Badwater source** are two shelf items (shelf order: Water source, Badwater source, Start, Pine, then the rest); placing one starts water spreading at once; a source is always findable, even underwater (a subtle upwelling at each; a clear marker with strength with the tool picked or near one; Markers shows every source); drag to move; sources may be placed anywhere; clicking an existing source with the shelf tool never places a duplicate. A source's strength is one number everywhere (the map label, the settings row and the real strength always agree, live with every Ctrl+scroll notch; for a row both "this source 0.25 · row 1.0 water/s"); past the official range a friendly note ("stronger than any official map"), never a block. **Clear sources** is a toggle shared by Raise, Lower, Flatten, Smooth and Naturalize (off by default, remembered): on, every source the brush passes over is removed in the same undo step and its water recedes, with sources glowing red under the ring and a mark on the ring; off, sources ride the ground (a 3×3 BadwaterSource as one rigid level piece; no brush changes a source's strength or footprint or leaves one buried or floating). With any tool picked, the pointer over water or bare ground within about two tiles of a source targets it (a direct hit on another object wins; the nearest source wins); point and press Delete (or Backspace) removes it. A badwater source never refuses for uneven ground (D290): its nine tiles are cut down to the lowest of them (never filled, so water isn't dammed) as a small level spring pool, one undo step; it refuses only for the map's physical limits, with a plain one-line reason.
- **D337** (with D338, D339): Parity with Timberborn's fluid editing tools, rules and footprints from the game's data, never guessed: Water Seep and Badwater Seep (2×2, stopping while the water over them is deeper than 0.8 m), Aquifer (3×3) and Ancient Aquifer Drill (an aquifer gives no water at map start; it needs a powered drill), Badtide Drain (1×2, badwater only during badtides; runs in the day-by-day Badtide view); a start delay for every origin except aquifers in the source's More ("Starts: at once", the default, or after N cycles with the game's countdown days, written to TimeActivatedComponent; the water view shows a delayed source as not yet running); negative strength (a sink that drains water); the game's strength ceilings (8 m³/s per emitting tile, `MAX_STRENGTH_PER_TILE`, so a badwater source reaches 72 and a seep 32; the ops schema and options follow); defaults as the game's editor (a water source at 1, badwater 3, the rest from its data). Each new object gets an original model in both looks in the stone basins' style (never from the game's files), a Markers label, exact save and load round-trip in the game's component order, tests for each rule and a sample in the next probe batch.
- **D259** (with D254, D261, D264, D288, D315, D323, D345): Select is easy to find and use, and its selection is the working area. Modes: Rectangle, Circle (drag from the centre, radius shown), Freehand, Brush and **Wand** (a click on land selects the ground joined to it at that level; a click on water selects that river's or lake's visible water tiles connected to it, badwater counts, never thin films the view doesn't show; a snapshot at the click, never updating itself); Shift adds, Alt (and Alt+drag) subtracts in every mode. **Set level**: the list reaches the map's ceiling (22, D244): Set (cut and fill), Cut down (only lowers ground above the level), Fill up (only raises ground below it); Ctrl+click takes a level into the Level box without changing the selection; Shift+scroll dials it; Select all (Ctrl+A or a Whole map icon) works with every action; "Up 1" and "Down 1". **Max water depth** (D264): wherever the selection's water is deeper than the number the ground under it is raised so the water sits at that depth (shallower untouched; the report says so if any ended deeper). These precision tools are exact and hard-edged, objects and sources ride the ground, the start stays valid (moved to the nearest valid ground only if its own ground can no longer hold it), each one undo step with a clear label. **Delete** (D288, D323) removes everything inside the selection (objects and sources, underwater ruin columns included even if a ruin field is only partly inside; the start can be deleted, then the checks dot says "No start" and Save asks for one), one undo step; **Delete sources** (D315) removes only water and badwater sources (with Ctrl+A every source on the map); pointing at one object and pressing Delete removes it; there is no Remove tool. **Working area** (D254): while a selection is open the brushes, forces and Clear sources work only inside it, with a feathered edge (never a cliff or straight wall at the boundary), forces treating the land outside as unbreakable rock, the land outside dimmed, water never locked; Ctrl+drag with a brush out makes the selection and the same brush keeps painting inside it; when a brush or force is picked the Select row shrinks to a chip ("Working inside 40 × 40 · Esc to clear"); the selection stays open after a Select action until Esc or the × closes it; no second way of marking an area.
- **D340** (with D387, D394): **Crop map to selection**: with a rectangle selected (from 4×4, not necessarily square, up to the map's size) the map becomes exactly that rectangle, one undo step, recorded as an operation so share links rebuild it byte for byte; the full map stays in Your maps and undo brings it back; everything inside, edits included, comes along exactly (not a replay onto new land, D336); at the new edge rivers that reach it flow off it, a river's head left at the edge gets M9b's natural lip (`water/edgeLip.ts`), sources are kept, edge walls show as the checks dot's warning with its one-click fix, objects cut by the edge are removed, a start outside gives "No start"; the name and "how it plays" line are re-read. **Remove unfed water** (D387 (2)): map-wide from the ⋯ menu or within a selection, showing first what it will remove ("12 pools, 3,400 tiles of water"), one undo step; fed water untouched. **Fill** (D387 (3), D394): fills a hollow with standing water to a chosen level, with no source, built on the retained-water path (D216) so the settle's game rules evaporate it, showing roughly how long it will last; the ground dries normally once it is gone. Where an item needs an interface control its engine and tests are built in the core and its place in the page is agreed with the page session through Kyler.
- **D394** (amends D387 (3)): Fill is built on the existing retained-water path (D216), so the settle's game rules evaporate it (1e-4 per second, 1e-3 under 0.02 deep, times the saturation modifier; D29), not a hand-coded 0.05 a day; the sealed-basin rule in `water.settles` (D222) applies. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D413** (with D27, D222, D394; blocks the next release until it lands, D385): The canonical settle counts a sealed basin that is only evaporating as settled, as `water.settles` does (D222): a Fill is stored at exactly the level chosen and the game evaporates it from there, and oxbow lakes stop draining before saving; maps with oxbow lakes are re-pinned. Built as the follow-up to #167. Kyler, 2026-10-02.
- **D235** (with D184, D328, D338, D339): The shelf (placing things): a clean grid of icons (each a small render of the actual object in the map's look), no tabs, Advanced checkbox or help paragraphs; it holds the game's placeable objects (the start, trees Pine, Birch and Oak, Succulent, berry bushes, ruins, the mine site, relics, natural slopes, blockages, geothermal fields, thorns, the Unstable Core, the Reserve Pile, Warehouse and Tank, and a "Mixed woods" item painting the generator's own mix). Picking one shows a live ghost on the terrain (footprint green where it fits, red with a quiet reason where not); click places, R rotates, Esc puts it back. Scatter-type items (trees, bushes, ruins, thorns) place like a brush: a circle (F, [ and ], size in the options row, strength setting density from sparse to a dense grove), a drag scatters that exact item naturally and never overlapping, only where the game allows it; painting over objects fills gaps up to the density and never stacks; trees and bushes on dry ground tint the brush amber with "dry ground: these will die" (still allowed); an **Age** option for trees (Grown, the default, or Mixed; the floor counts only grown trees); a click places exactly one; unique landmarks (the start, mine site, relics, geothermal fields) stay single-placement; one undo step per stroke. A painted ruin field is grown as the generator grows one (`src/core/gen/blobs.ts` growth and `punchHoles`' gaps; `calibrated.ts`' height, variant and orientation shares and field sizes), a click places one column at the height in the options; thorns paint patches shaped like the official maps'; faction-only plants (Maple, Chestnut, Mangrove, Dandelion, Coffee, Spadderdock, Cattail) stay off the shelf. The Unstable Core (D338, D339) has its explosion radius and cycle in its options at the game's defaults and ranges and a **Show after it goes off** toggle drawing the map after the explosion (the land and objects it clears, the water re-settled; a view only, following the game's own rule exactly); the generator's "Unstable cores (advanced)" option stays off by default, with no core-based intentions; Reserve piles hold only goods the game allows up to capacity (a pile at most 160), written with FixedStockpile. Natural Overhangs 2×1, 3×1, 4×1 come with the Block tool (3D step 3). **Placed objects fit the land (D328):** ruins, mine sites, landmarks and the Start, placed on uneven ground, level their own footprint (to the level most of it already stands at, cutting above and filling below, never filling a wet tile or one water flows across, where it cuts; the edge meeting the land in short natural slopes) within the placement's one undo step; placement refuses only for the map's physical limits with one plain reason; water and badwater sources stay cut-only (D290). Only the player places objects (D368 (10)): no force, brush or editor action, nor anything triggered by one, places Slopes or any shelf object; generator-time repairs stay at generation; if an edit leaves something unreachable the checks dot reports it.
- **D330** (with D233, D234, D336, D343, D237): "The page is the editor" (UI brief `docs/UI-BRIEF.md`, word for word; built by the page session with the design pass, D384, enforcing D342). One workspace: the map fills the window from the first visit, with no separate editor, expand button, full screen or "Refine this map" step (3D is the default view everywhere, D232: the 2D toggle is gone, Top-down and the minimap remain, with an automatic fallback for computers that can't run 3D well). The side panel is the map (Generate · Real places · Pick a place, the candidates strip, the map card, Your maps); the rows over the map are the land. Save to Timberborn is always visible top right with the checks dot (green when all's well, amber when something needs a look; clicking lists the problems, each highlighted on the map, never a pop-up). Speed first: Generate only on the button or Enter; a first visit loads a ready-made 128² map (built at deploy, D343); Sources: Placed · None (None removes every water and badwater source and its water; real places keep their riverbeds and lake basins as dry valleys); the automatic water fix for a map edited before its water settled (brief §5); the legend is one row of icons with counts on the map card (it appears only while an overlay is on); header: Undo and Redo icons and a ⋯ menu (Open, Save project, Download .timber, History, New map); the generator page's Moist soil switch stays until then (D299). Phones get a view-only map. "Without pre-filled water" is not in the player-facing interface (D237; the capability stays internal). First run: three one-line hints (paint the land, place things, add water), then never again; the hint points at Carve. The start's requirements (water, wood, berries in reach) appear around it while the district center is hovered or dragged, then fade (D184 (7)); while it moves the page runs the validator's walks on the ground as it would be and counts trees and bushes that are not dead (D105); colour: green fits and meets every requirement, amber fits but misses some (listed), red can't be placed, changing only when something changed (D361 (4)). **Your maps** (D234): each map the player edits is kept in the browser (settings, seed, edits, a small top-down thumbnail), saved quietly after edits settle (unedited generated maps aren't kept); a calm list in the side panel (name, thumbnail, when last edited; click reopens exactly as left; rename by clicking the name, copy, undoable delete with a quiet note; a mark for maps already saved to Timberborn), the last 30 edited maps kept, a star keeping one forever, a plain message if storage runs out, and a plain statement that it lives in this browser; no folders, tags or search. **Edits never replay onto new land (D336):** every Generate makes a new map at any size or setting; a shown map with edits stays saved and one step away (Your maps and undo; after generating over edits a quiet note: "New map. Undo to get <map name> back."); there is no "Generate, keeping my edits", "Discard edits" or rebuilding an old map with a newer generator while keeping its edits (an old map opens exactly as saved); replaying edits onto the same land (undo, redo, reopening a project, share links) is unchanged. Saved file names are `dgm-<theme>-<seed>.timber` (a place `dgm-<place>`; imports and real places `dgm-<name>`, file-safe), numbered rather than overwritten (D345 B10, D360). "Refine this map", the expand button and the Legend button join the retired terms when the page is rebuilt.
- **D240** (with D181, D205, D313, D335): The editor feels alive, not mechanical: visual only (final map and water exactly as without), short animations that never delay the next action, off with reduced motion, scaled down on weaker hardware, GPU and shader effects where possible, particles and simultaneous pops capped, frame rate measured on dense 256² maps. Land: raised blocks grow up with a tiny overshoot, lowered ones sink and crumble with a puff of dust; changes ripple outward from the brush's centre over a few milliseconds; fresh ground starts as bare earth and grass creeps over it in about a second where moist; cutting down reveals rock layers. Water: the surface glides between states; advancing water has a thin foam line at its front; basins fill with a smoothly rising surface; water tipping over a new edge bursts into a waterfall with a splash; wet sheen where water touches ground; sources pulse gently, stronger for stronger sources; moisture visibly spreads from new water (dry cracked earth turning to grass along banks over a few seconds, fading back in a drought, the final state matching the settled moisture). Moments: Generate reveals the new map in about 1.5 s (land rising from flat, water flowing in, trees popping up; a click skips to the finished map); placed trees and bushes pop in with a little bounce, removed ones topple or shrink away, ruins crumble; undo plays the change quickly in reverse; the brush ring breathes gently; Save to Timberborn ends with a small send-off ("Ready to play in Timberborn"); optional soft cloud shadows. **Sounds** (D205, D313, `investigation/juice`; our own synthesised and CC0 recorded sounds, never the game's): small feedback on every action (a thud as land rises, a puff when lowered, a pop when something is placed, a splash when a source starts, a soft rush near waterfalls and a trickle along streams, quieter as the camera zooms out), on by default but quiet (default volume about a quarter below first set; a player's own volume is kept) with a volume control and off switch; Smooth's sound is a softer, gentler, higher, shorter relative of Flatten's; every sound's encoding is checked and anything over-compressed re-encoded from its CC0 original with the manifest updated; Naturalize's sound is a clean, high-quality CC0 recording of a soft scrape and settle of earth and gravel matched in loudness and character to the others (D387 (5)); Block's sounds are in D335.
- **D205** (with D207, D377): Also in the editor: a minimap (a small top-down view of the whole map in a corner, refreshed after edits settle, with an outline of what the camera sees; click or drag moves the camera; on by default for 256² maps, off for smaller, a toggle among the view buttons); camera bookmarks (Ctrl+Shift+1 to 9 saves the current view, Shift+1 to 9 glides back; saved with the project and in autosave; the number keys alone stay the brush shortcuts). A 20-second live tour of the editor's best controls (D377, in polish with M13's help; offered, never forced, by the first visit's one quiet hint "Watch a 20-second tour" and the ⋯ menu): a ghost cursor performs a choreographed sequence on a temporary copy of the current map (the player's map untouched; Esc ends it at any moment), keys shown on screen as they're pressed; two forces only (Carve, a river grown with F and the mouse; Craterize, a crater whose Power is scrolled up with F) and the brushes' flow (Raise a hill sized with F; Shift+click to lower; Ctrl+click a hilltop to take its level and Flatten a spot to it; Smooth the edges; Save to Timberborn); built from stored gestures replayed with keyboard shortcuts so it survives layout changes; recorded once as a GIF and video for the website; no click-Next walkthrough; per-tool "Show me" demos can follow on the same machinery.

### The forces

- **D257** (with D258, D203, D206, D344, D356, D361): The forces (Carve, Craterize, Erupt, Quake, Glaciate, and Unleash on sources) are nature's tools for redefining the world in a spectacular way: bound only by nature, they feel like magic, not machinery. A force obeys only what it physically is and the map's physical limits (its floor, D244's ceiling, the file format); it never refuses, stops short or reshapes its result for playability (the start, walkability, water and wood in reach, slopes and paths are not its concern). The editor makes the result compatible with a good start: the checks dot shows what a force broke, each with its one-click fix where one exists (move the start, plant groves for the floor). A map always keeps exactly one start: where a force carves, buries or moves the start's ground, the start is carried to the nearest valid level ground instead of the force refusing. **A force always has a visible effect** (D356, a standing rule in EDITOR_PLAN): never "nothing happened", never "not here"; it adapts to where it's used (a slope, flat ground, water, a peak), scaled by Power; a force that only works in one narrow situation becomes an option on another force or is dropped (Meander folded into Carve, the Landslide dropped); every adopted force gets a random-click check proving a click anywhere changes the terrain visibly. Power acts on every force and every mode; Size sets how far a force reaches, Power how strong it is within that: Power 0 gives the gentlest still-visible effect even at max Size, Power 100 the full force (D361). Only the player places objects (D368 (10)): no force changes shelf objects except by riding the ground.
- **D258** (with D312, D344, D361, D368): Clean, magic gestures: no force draws a predicted route, path, outline, footprint or wireframe on the land before or during its gesture (what a force decides, its reach and extent, is never drawn in advance); every click mode (Carve's Unleash, Craterize's Strike, Erupt's Vent, Unleash on a source) is one click and the force finds its own way; Aim is a drag in a direction with only a thin straight arrow while dragging, which disappears on release; a stroke the player draws stays visible as it's drawn, as a band of its width along the path (Carve, Glaciate, Quake's fault, Erupt's fissure; Quake's about as wide as its crack), a circle only for a click; the cursor shows a faint ring sized to the force's reach at the current Power and Size (a radius for Craterize, Erupt and Quake, the width for Carve and Glaciate), Quake's hover only a small cursor marker (D368 (2)); a short word by the pointer only when a force won't act at all. A drawn shape sets the force's extent (Size is for clicks) (D344 A6). Freehand path (D321 item 41, replacing the aim arrow and waypoints): Quake's fault and Erupt's fissure follow a freehand line (D327: Lift and Slide follow the curve, the fissure opens along it; a click behaves as before), and the travelling forces Carve and Glaciate follow a drawn path (Shift+click waypoints are replaced by it). Each force's row is Power, Size, at most one signature choice and Try another (D289): Carve keeps its river or leaves a dry canyon; Erupt's Vent or Fissure is decided by the gesture (a click vents, a drag opens a fissure); Glaciate keeps Meltwater; Quake's Left/Right is gone (X flips the side); a small **More** button opens each force's details (Carve's width, depth, walls and wander; Craterize's walls, centre, rays and debris; Erupt's summit, flows, ridges and shape; Quake's scarp and the rest), closed by default, remembering whether it was left open, as a compact grid panel (D345 B2); each detail starts on **Auto** (what `core/forces/nature.ts` picks from the land and the seed) and shows the value it just took after a force runs with one click to pin it; Try another re-rolls only the details still on Auto; pins are remembered with the player's other preferences and the operation keeps the values it used so replay and undo stay exact (D309). Power and Size are always shown as numbers ("Auto (68)"), F and { } set Size and F+scroll or [ ] set Power, taking them off Auto, with the number beside the cursor (D344 A1, A2, D368).
- **D344** (with D321, D341, D266, D374): Pace and animation. Every force plays at its own designed pace, whatever the water's speed (D266): in Fast about 2 s (Glaciate 3.5 s with easing: slow as the ice grips, steady through, settling gently; the ice spreads and carves together, the valley deepening as the glacier advances, so the land change takes most of the time; every force is checked for an opening effect that squeezes the land change into its last part, D374), and the Slow forces toggle plays them proportionally slower (D321 item 29, amends D266; the toggle was "Watch", renamed "Slow forces", D361). Erupt's terrain is final in about 2 s; its lingering effects never make the player wait (D312 (3)). Esc cancels a gesture while drawing, skips a playing force to its end, and undo takes it back at any moment, with the hint "Esc to skip · Ctrl+Z to undo" while a force plays (D344 A4). A new force clicked while another plays: the previous one skips to its end while the new one plays in full (to check for every force; Craterize clicked quickly sometimes skips the new crater's strike, D378). No force pops in at the end (D368 (9)): any part of a result applied as a separate step after the animation is fixed so the last animated frame equals the final land (Carve's banks form as the carving passes; Glaciate's land settles as its animation and sound end, D344 A7). Carve's river is born as it cuts (D371): the water front follows just behind the cutting edge, from upstream, handing off seamlessly to the real simulation's water and ending exactly where the real water settles (no jump, no pop, no water where the settled river won't be), in both looks, calm with reduced motion, no frame-rate cost at 256²; the same approach applies wherever forces move water. Carve's animation follows the stroke from where it started, the water flowing as the land dictates (D344 A5). Water shown for the force at the edge: item 27's check applies wherever a force places sources at an edge (Carve's source row, Glaciate's meltwater): the water flows into the map, never straight off it, using M9b's edge lip; a Carve click at the map's edge carves inward with a visible channel even at low Power (D360); on Carve the river's normal surface sits just below the bank top (D321 item 18). Esc on a playing force (D341 (2)) is a likely race: reproduced deterministically (Esc at every moment of a force's run, every force), fixed with a test that fails first.
- **D199** (with D194, D216, D217, D239, D355): Carve is the river force: Unleash (click) and Aim (drag), Power from creek to catastrophe, Keep river (the default: the source left at the origin gets a strength that follows the river's Width, how much water it carries, not its Power, so slot canyons keep a modest stream and wide rivers a big one; editable afterwards like any source) or Dry canyon (no source); Steep or Wide walls and Wander (straight to winding) live behind More; natural variation within each carve (bends wider and deeper on the outside, narrower on the straights, never a uniform worm-like tube); oxbows become lakes (a cut-off bend gets sediment at both ends so it holds water as a crescent lake, not a dry trench; an unfed oxbow evaporating over time is correct game physics); Stop keeps what's carved, Esc or undo reverts the whole carve instantly. Defy gravity is removed: an aimed carve goes where the player drags, cutting through rises. **Maturity** (D355, Later, after the forces release with the smoothness harness): Carve gains Young, Mature, Auto in More; Mature carves the river then ages it with Meander's engine (wider bends, oxbows, a floodplain between the bluffs), and Carve used along an existing river matures it. **Unleash on a source** (D239): selecting a placed water or badwater source shows a small Unleash action beside it (U too) that makes the source carve its own course downhill with Carve's engine; from a pool or lake it breaks out at the lowest point of its rim; dragging from the source to a point aims it; the source's strength sets the width, a quick Power sets how hard it cuts; Try another re-rolls; the source stays as the origin; one undo step; it places no new sources (D314).
- **D202** (with D203, D206, D246, D226): Craterize is a giant impact: Strike (click only: a drag makes exactly one crater where the press began at the current Size, D368 (7)); Power; Size; Steep or Terraced walls, Centre (Auto, Bowl, Peak, Ring, Flat), Debris and Rays behind More; radial tree knockdown, overlapping impacts overprint older ones, it never adds water. Quake splits the land along a drawn fault: Lift or Slide (Lift's click makes a short natural fault at the click, its direction chosen by the land, as Slide does; Try another varies it, D360), Power, Sheer or Stepped scarp; objects ride with the land; it never adds water. Erupt raises a volcano: a click vents, a drag opens a fissure along the drawn line; Power; Shape (Steep or Broad), Summit (Auto, Peak, Crater, Caldera), Flows (Light or Heavy, with or without Ridges) behind More; a volcano always keeps a peak within the headroom it has (near the ceiling it grows broader rather than taller, never flat-topped), overlapping eruptions build new cones on the flanks, the eruption always completes; fresh volcanic rock is hard for Carve, flows can dam rivers; it never adds water. **Glaciate** (D246, D291, D292, D368 (3)): turns a valley that's already there into a glacial valley (a broad, level floor between steep walls; basins that dip below their outlet forming a chain of lakes; hanging side valleys with waterfalls; moraines and an outwash plain from the material it cut; "Carve gives you water; Glaciate gives you land"); Flow (click high ground, it follows the valleys) or Aim; Power is how deep the ice carves (Power 0 a light scour, polished rounded rock, a shallow trough, perhaps a small tarn; the middle a shallower U-shaped valley; 100 the approved glacier: a clean U-shaped floor, its river in a channel), Size how wide; at every Power the floor stays clean and the water stays in a channel or tarns, never a sheet; the default is 60; Meltwater on by default; the floor's extra wet passages are led into the main river so the floor reads as one river; no ice-sheet mode. Smart 3D carving (D217): Lower aimed at a cliff face digs into it; Raise with a layer selected builds in the air.
- **D352** (with D354, D355, D364): The forces row's order, by prominence (UI brief §4): three clusters in one row, (1) Carve, Craterize, Erupt; (2) Rift, Quake, Glaciate; (3) Erode, Deposit; forces not yet adopted take their place when they arrive; the first-run hint points at Carve. The Landslide is dropped (its scarp is what Quake and the Rift make, its debris a lumpy Raise, a natural dam is already buildable with the shelf's Natural Dam or by raising ground across a river; its checks that dammed lakes settle at a spillway may help D350). Later: a **Rift** force (land cracking open and dropping, the opposite of Erupt's ridge). **Deposit** (approved as an investigation, `investigation/deposit`, adopted after the forces release by its INTEGRATION.md): a natural way to add land back after other forces removed it; when the Floor forbids every cut it says so plainly ("the Floor leaves nothing to take sediment from"), never silently doing nothing; on real maps a full-Power dry fan reads as a gentle cone, not a stepped plateau; it passes the smoothness harness and the random-click check. **Erode** (D281, 3D step 3) and the other later forces are built in Rust (D381).
- **D378**: Post-release items for the forces and High look: Craterize clicked quickly sometimes skips the new crater's strike animation (check every force); tests for an eruption in High and for the highlight on High's basin sources.

### The look

- **D135** (with D45, D86, D110, D114, D115, D147, D228, D230, D241, D242, D243, D250, D284, D334, D346, D378): The 3D view looks as close to Timberborn in game as it can while every map meaning stays readable; appeal matters as much as readability. Two looks, both switchable by the player and each High effect switchable: **Standard**, the clean look, and **High** (Map look 2: #38's water and soft shadows, #65's lighting and materials, #66's vegetation, phase 3's approved stages, released as `map-look-2-done`), the default on computers that can run it smoothly with an automatic fallback to Standard, and a **Light** look where the browser draws WebGL in software (no multisampling, patterns, shadows or soil blending, models of a few triangles, still water, objects baked into one mesh). Our own art only, never game assets; no image files (patterns are drawn by a shader into a small tiling texture); the 3D chunk stays lazy-loaded. Clean view: slopes drawn as ramps, dead trees as pale bare trunks at their true size, no hazard tape, no arrows, no inflated objects; ground tops coloured by moisture (moist vivid green, dry ground the game's cool, muted grey-brown mauve with grey patches, pulled greyer and less saturated in both looks), height as layered bands on walls, a toggle to Height colours; the information layer (Markers, off by default or on by a tool that needs it) holds the slope arrows and the objects enlarged from afar. Our High look adds warm sunlight, ambient occlusion, colour-preserving tone mapping and grade (exposure 1.00), a subtle distance haze, sky, rock strata, soil edges, colour variation, distinct vegetation (pine, birch, oak, blue-berried bushes, white birch trunks, bare dead branches; the shelf icons and ghosts use the same models), the diorama edge, water's finishing touches and visible seasons (in a badtide plants on contaminated ground wither as in a drought, following the same contamination); mist and spray at the base of falls and splash rings across the pool below. It follows Timberborn's own references (D334): colour-blind readability of water, badwater and contamination follows the game exactly, with its look and cues (badwater's pink caustics, bubbles and red glow at rock; contamination as orange-red veins, through grass too), accepting the readability the game has with no guaranteed lightness gap and no pattern rule beyond the game's; the tests that checked otherwise are re-based to this decision (D148), none deleted. The map is crisp in both looks with no sharpening or post-process filter: tile boundaries crisp with a narrow transition, anisotropic filtering at least 8× on repeating ground and rock textures, no pass, fog or lighting texture adding blur the game doesn't have. The grass is darker and less yellow toward the game's L* 50–55 in both looks; Standard's cliff faces sit toward the game's lighter blue-grey stone. High's frame rate is measured on dense 256² maps.
- **D154** (with D177, D304, D310, D324): Contaminated ground is a layer: the ground keeps its own look and contamination adds red-orange crack veins, denser and brighter as contamination rises, no solid rust fill, wet and dry contaminated clearly different; a thin outline marks where it ends, drawn only with Markers on. Water: clean water is one consistent teal-blue body fitted approximately to the game's own colours (the game's `#305965`; deep water only a little darker, the underwater terraces showing through as faint darker steps, shallows a slightly lighter teal, never grey, a calm surface with subtle ripples and small glints); the shallows stay see-through. Badwater comes from #38's approved calibration (crimson, more opaque, darkening with depth); each water tile is coloured by its contamination level, sliding smoothly from clean toward badwater and interpolated between tiles so a front is a soft gradient over several tiles, never blotches or streaks; mixed water blends through a warm midpoint (from teal toward the game's measured mixing zone, about `#2E444C`, then warm brown, then crimson), never purple or mauve-grey, with the tint a little steeper so 10–25% bad already reads warm; one shared water palette (`waterPalette.ts`) feeds both looks so they never drift; the mine pit (`#373A34`) stays at least about 5 L* darker than badwater, both colours held; badwater's bubbles and surface texture carry the difference if the faintest badwater comes close to black. Waterfalls have shape and volume (D201, D215, D231): water leaves the lip and arcs outward and down (further for stronger flow) as a curved translucent ribbon with thickness, its texture rushing downward, white foam at the lip and whitewater where it lands, stepped cascades as a series of small falls each with its own lip and splash, no V-shaped gap splitting a fall into two ribbons, a tall fall teal first with white only in streaks and at the landing, the foam soft white water (never dark bubble cells reading as cracked tiles); three foam issues stay queued for a look pass: per-tile curls on the crown, the straight edge where the fall meets the pool (to become irregular and natural), and froth that reads milky rather than bubbly. High's source basins follow Standard's design (a clean stone rim, water welling up; badwater's bubbles visible). Water moves (D353): the always-on moving water (surface advection, foam threads, wakes and joining seams) goes into both looks, and the optional **Flow** view joins the view bar (cool light on clean water, warm embers on badwater), its paths built in the water worker never synchronously on the main thread and passing the smoothness harness before it merges.
- **D178** (with D305, D334): Mine sites and ruins are models of our own, rendering only. Mine sites, true to the game's footprint: a sunken square pit about 1.6 levels deep with a dark earthy interior with roots, rubble and cracks (about `#373A34`), a rusty frame in dull brown-orange (about `#844D2F`) running round almost the whole 5 × 5 footprint with the pit filling most of it, scaffolding on the frame's corners as one structure with beams reaching across the pit and small platforms, pale wooden crates and planks (about `#A78E65`). Ruins are ruined scaffold towers, one column per tile and one storey per level: thin rusty corner posts (about `#8D5631`), a beam at every storey, diagonal braces on some faces, beige slab panels (about `#B8A775`) on some storeys and faces with some missing, tilted or broken, the top storey often partial, ivy (about `#405634`) on columns on moist ground and bare columns on dry ground, variants A–E differing in bracing and panels; the far version reads as the same ruin (bright orange with cream, near and far, D334), with shared geometry and a simple far version so maps with many ruins stay smooth; with the sacks (new geometry). Markers may outline them.
- **D114** (with D115): Readability rules that remain from the Map look fix rounds: every map meaning reads in colour, in greyscale and under colour-blindness simulation, never by colour alone (as D334 re-bases for water and contamination); the legend lists every meaning the view draws, with small pictures; hover text names the soil (moist, dry, contaminated); minimum sizes for small things from afar apply only in the information layer; a dam-site overlay no longer exists (D287). Captures show what the view draws (its heights, the water on each tile's top, the soil of each tile's top, its objects), at the visible point, each checked by picking; floors under an overhang show the top's soil, never its water, in shade. Dry ground in the clean view is the cool grey-brown of Kyler's reference (D135); Kyler decides the appeal from captures beside his reference screenshots (`C:\dgm-reference\`, local only) and the probe's in-game shots.

### Real places and Pick a place

- **D136** (with D155, D156, D157, D162, D163, D174, D191): Real places: a gallery of the landscape survey's playable real-terrain maps (`investigation/landscapes/library/`; up to about 150 in all, additions chosen as the original 88 were: maps that pass, distinct, spread across landform families, the three random-land controls out). Each card shows our own render, its plain name ("Grand Canyon", no "Near" or "(… sample)" suffixes, kept in the metadata; "Centre" suffixes replaced by names from a real feature or direction such as "North Rim", "Upper Valley"; "Lower Mississippi" is "Mississippi Oxbows", "Taklimakan Fan" "Kunlun Alluvial Fan", "Plitvice" "Plitvice Lakes"), landform family, size and scale, and a short plain line about how it plays; every first map built from an off-centre sample gets one line saying why (the centre failed a check, or the sample holds the signature better). The player downloads the `.timber` (pre-filled water) or opens it as an editable map. Every map is built through the existing pipeline (build, settle, validate, write); maps are built once at deploy time and served as finished `.timber` files, rebuilt whenever the engine changes; the byte check of every real place runs nightly and in the release check. In-game descriptions are short: the title, one line (inspired by the land near its namesake, at Timberborn's scale, not a replica) and "Credits: <link to a credits page>"; full notices are on the gallery page and the credits page, and only notices whose terms require it stay in the file (CC BY 4.0 for Austria; the New Zealand notice stays in the file); derived from public elevation data, not an exact copy (`investigation/landscapes/ATTRIBUTION.md`). Real places are content, never templates (D108). Thumbnails: two views, the 3D overview rendered with the Map look 3D view (clean look, Standard quality or better, angled, framed tighter with the land filling most of the card, at twice the card's display size, compressed WebP, rendered on a machine with a GPU, committed and re-rendered whenever the engine changes, lazy-loaded) and a 2D top-down in the clean look (moist grass, cracked earth, water by depth, contaminated ground as a layer; crisp, not upscaled, not the old height palette), laid out as the 3D view with the 2D top-down as a corner inset that swaps to the full 2D view on hover, focus or tap; the 2D is turned to match the 3D camera and both show a small north arrow. The survey's raw elevation patches may be re-downloaded from Terrain Tiles on AWS (public data). Save to Timberborn (D162, D191; released as `save-to-timberborn-done`): using the browser's folder access (Chrome and Edge) the player picks `Documents\Timberborn\Maps` once, the site remembers it, and the button saves the map straight there from the generator, the editor's export and the Real places gallery; a map is never overwritten by one with the same name (the new one is saved as "Name (2)", then (3), with a quiet note); the bytes are the download's exactly; Download .timber takes the primary button's place in browsers that can't save to a folder (other browsers keep the normal download with install help). Later, proposed (built only after Kyler's approval): a companion mod for one-click play that lists newly saved Dam Good Maps maps in the game's main menu and starts one in one click.
- **D245** (with D214, D271, D272, D300, D306, D319, D331): Real places are kept on their own land, and a canvas to reimagine. Kyler: the beauty of real places is the unique composition of terrain features; failing a playability check never drops a place, swaps its land for another part of its region, or changes its height mapping or scale. Only the absolutes gate a place: the file loads and plays exactly as the editor shows it (every correctness check, never weakened) and the starting-logs floor, met by planting groves, never by dropping or moving land; every other check becomes information; the start goes to the best spot its own land offers (moving it toward water is fine). A place's **note** (on its card, by the checks dot) covers only what would sink a player who goes straight to the game: no water a pump can reach from the start; too little wood near the start (Minimum starting wood within 20 tiles); water that keeps moving; a few plain words, no advice, and no note for the everyday advisories. Water that hasn't settled within the settle limit (D245 set 4 days, now up to 6, D358) keeps its own land and water (the file stores exactly the water the editor shows and the game rebuilds its flows from those depths every tick). **Water follows the real place (D271):** rivers and lakes where the real place has them (observed water, ESA WorldCover, D192, or OpenStreetMap rivers and lakes in the square, if the conversion doesn't already use them), so dry places stay dry except for their real rivers; where the water keeps moving D214's fewer, larger rivers come back (no sources at 8× the official strength: strengths stay near the official range; sources only, never land; D171 stays). Both land fixes (D300): the bed is lowered one level under real water (as Pick a place does) and most of the land's overall tilt is taken out before fitting the 16 levels, keeping enough for the water to run downhill along its real course; **a water floor**: every place has water a pump can reach from the start; where a place has no water in its square one natural spring stands where the land drains near the start, the smallest that works, with a plain card note, in D314's grouped sources. At 256² (D306) each place is built at 256² where the data allows, keeping its scale (metres per tile), its signature centred as the focal point with real land around it, heights fitted around the signature (full range of the 16 levels, land far above or below compressed toward the edges); a place whose data or land won't take 256² keeps its current size, noted; the tall versions (D172) are the next round. Kyler's drops (D271): places 43, 47, 73, 82, 93, 100, 106, 108, 110, 111, 119, 123, 129, 137 and 150 leave the gallery; held until the water is fixed and shown again: 2, 12, 41, 58, 60, 71, 90, 101, 103; the session checks the rebuild itself, with no new sheet for Kyler (D300 (4)): every place passes the blocking list, "No water a pump can reach" is zero, and the stripes are gone on 42, 48, 116 and 118; 42, 50, 128, 131 and 29 are for his eye on the new sheet. `docs/PERFECT.md`'s Real places lines: "It's a great Timberborn map within a few edits (a water source, a moved start, some trees), not just a pretty copy" and "It's a canvas to reimagine: every tool and force works on it like any map, so a player can put a crater in Yosemite Valley and build a mega dam." Item 47 is for generated maps (D331): the test for anything on a real place is whether it changes the real land; out for real places: the base raise, the second district behind an obstacle, high ground next to low; in, never changing the real land, gating or dropping a place: the starting-logs floor and the water floor as absolutes; objects where the land offers a natural spot as preferences (two reachable mine sites; a badwater source where a spring would rise, with level ground for its 3×3, never where its stream reaches the start's water or first farmland; berries enough for an Iron Teeth start), going without where no spot makes sense; the start where its wood, berries, water and first farmland are reachable on foot without stairs with enough level land for the first buildings, otherwise the best one; the five difficulty levers as information; Sources: Placed · None applies when a place loads, with no rebuild. **Real places is parked (D319):** the one rebuild (under VERSION 11; 37 of 136 places converted, cache attached to the draft release `cache-real-places-2-v11`) waits until the changes affecting every place have settled (the base raise, item 27's edge lip), and until the grouped-sources rule (D314) is in; Kyler says when it resumes; #35 stays open and unreleased; then the badwater stage and `real-places-2-done`.
- **D420** (with D385, D245): No map keeps water that nothing feeds (#177): the 68 re-pinned Real places keep their known-fault lists (starts reaching no fed water, plants on dry soil, berry shortfalls), never their unfed puddles. Kyler, 2026-10-02.
- **D421** (its hiding amended by D445; with D319; part of the release gate): Before the next release, the gallery leaves out every Real place whose start reaches no fed water (33 today) until Real places round 2 fixes them; they stay in the repository, only the gallery hides them. `tools/real-places.ts` is fixed on dev and the gallery cards re-rendered, so no card shows water its map doesn't have. Plants on dry soil and berry shortfalls wait for round 2. Kyler, 2026-10-02. **Done:** the index records each place's own faults (`faults`, written by `tools/real-places.ts` from the generate profile's checks); the page lists only places without `start.water` (`galleryIndex`, 33 of 85 left out, 52 shown); the tool's stale file-name check and its pass/fail rule (it counted the conversion's known faults as failures) are fixed, and the 68 cards re-rendered from the settled water without the unfed puddles.
- **D445** (amends D421, with D245): The Real places gallery shows every place again, including those whose start reaches no fed water (33 today): the real land's uniqueness is the appeal, and the editor lets a player make a start work (a water source, a moved start). `galleryIndex` stops leaving places out and keeps recording each place's faults; a place with the `start.water` fault carries the card note "No reachable water" (replacing D245's longer wording for this note; no other fault gets a note). D245's water floor for Real places round 2 is unchanged. Kyler, 2026-10-02.
- **D166** (with D160, D175, D192, D255, D285, D172, D306): Pick a place: choose any spot on the real world, frame it, and get a playable map built from open elevation data (AWS Terrarium) with attribution through Real places' conversion, running in the browser (D255; not M11's); never Google's data. The land comes from the real world; the water is designed: a place never fails for lack of native water; the engine places water sources where they make sense for that land (valley heads, springs below ridges, where drainage carries a river through the most interesting terrain) and always meets the start requirements; "real water" from open data (OpenStreetMap, global surface-water maps) and ESA WorldCover (observed water, CC BY 4.0; attribution in the Pick a place credits and each map's credits) are data sources; the player can then move, add or remove water sources in the editor and see the Weather view. It keeps the framed land (D255): only correctness and the starting-logs floor gate it, anything short of the preference checks ships with a plain note saying what it lacks, its quiet retries never replace the player's framing, size or scale (it may suggest nearby framings that play better, which the player can take or ignore; only a correctness failure may look elsewhere, saying so plainly; hard cases such as the Mississippi birdfoot and the Kansas prairie are offered with nearby alternatives, never shown as failures); no "use my own heightmap" upload planned. The flow (D175 simplified by D285): search (OpenStreetMap's Nominatim on Enter only, within its usage policy; pasted coordinates accepted), a 2D map with shaded relief (OpenFreeMap vector tiles for context, attribution shown; no satellite imagery; a planned fallback tile source such as VersaTiles or Maptoolkit), a framing square that drags and rotates (size sets the scale within sensible limits, showing its real size, "7.7 km across") with the preview built when the player lets go of the square, confirm with map size (96, 128, 256; the square defaults to 256² at the scale that frames its signature) and height (auto: tall when the relief deserves it) with scale, difficulty and water (designed by default) in an optional More drawer, one click "Build my map" (a short progress strip: terrain, rivers, start, forests, checks), then the map in the usual view with its name (from the place, no "Near") and a "how it plays" line, the Weather view, Save to Timberborn, Download and a share link that rebuilds exactly this map (storing the place, framing, settings and the elevation data's version); credits as in Real places; desktop only. It follows every current rule (designed water D166 and D171; no walls or rims; maps may drain; the start requirements; official-like trees, ruins, mines and clusters; metal and badwater on every map).

### 3D terrain

- **D118** (with D119–D127, D279, D280, D281): Real 3D terrain is essential: caves, overhangs, tunnels and arches must be possible to generate and to edit, not only to import and keep (design in `investigation/terrain3d/DESIGN.md`). Terrain is runs per tile (D119): the game's `ColumnTerrainMap` form, a 23-bit mask per tile in memory with `heights` derived; format 3's `field` and `base` store heights plus runs (the surface per tile and the solid runs of every tile that is not one plain run from z = 0), from M9a on. Stacked-column water is in Water (D120). The build applies the support rule at its integrity step (§19.8 step 7) and generated maps must drop 0 voxels (D121); every check that walks uses the floor graph (D122: no headroom rule, levels joined only by slopes and stairs; heights that need stairs are listed and planned as rewards); 3D forms are found by processes, never stamped (D123); 3D-b may generate wet caves (spring caves, underground rivers), dry caves only as the fallback for a wet form whose probe checks disagree with the model (D190). One mesher for every tile (D126): greedy faces per plane, undersides, 3D sky light and a level-slice cutaway. Testing is kept to what a player would see go wrong (D279): water that isn't what the game does, generated maps changing when they shouldn't, saved projects not opening, terrain the game would drop. The probe verifies 3D (test maps T1–T7).
- **D280** (with D281, D286, D335, D338, D365): 3D terrain in four steps, built on `build` (Opus 5.5, high). (1) **Foundations** (on `feature/terrain3d-a`): terrain as runs throughout the core, the build and the TypeScript validator; the stacked-column water engine by the game's rules; the support rule and floor-aware checks; imports' roofed water simulated; the test maps T1–T6; ordered (D286) so new pieces come first beside the existing code (the engine as its own module verified against the game with golden fixtures, and the support-rule check), and the conversion of the core, the build and the validator to runs, wiring the engine in, happens after the forces and M9b have merged into `dev`; moving the brushes and recorded strokes onto runs waits for step 3; acceptance: generated maps unchanged except their water's last digits, checked on a sample of seeds per theme, saved projects open with the same land and their strokes replay, progress shows while water settles. (2) **The view**, after the High look is adopted: one mesher for runs with undersides in both looks, from `investigation/3d-view` (D365, approved): the stone pattern stretching on ceilings and at corners fixed, cave interiors (a little murky) and deep water under roofs (very dark) tuned with Kyler on real maps, objects, slopes, falls and moving water integrated inside caves, passing the smoothness harness and the full-editor performance gates before it merges. (3) **Creating them**: **Erode** (wind and water wear rock: a cave or alcove at a cliff's foot, an overhang where hard rock caps softer rock, an arch through a thin ridge; the land decides which; every shape obeys the game's support rule; a click or a drawn sweep; Power, Size, Try another; two to four seconds of dust and rubble with CC0 sounds; `investigation/erode`, built by the milestone session, not Codex) adopted onto the forces core under the forces' principles, on the forces row; and the **Block tool** (D335, approved as an investigation, `investigation/block-tool`): on the tools row with Raise, Lower, Flatten, Smooth, Naturalize and Select, not the forces row; a click adds blocks against the face under the pointer, Shift+click removes, on any face; a square footprint 1×1 to 8×8, sized like the brushes; a drag paints one layer; holding Shift on a wall digs deeper step by step; a ghost previews exactly what changes; an action that would leave any block unsupported is refused with the blocks that would fall shown in red and a plain reason, never auto-supported (the support rule, `docs/FINDINGS.md`); its sounds (a stone set-down when adding, a chip when removing, a rhythmic chip per block while a Shift-hold digs, never harsh repeated, refused actions silent; CC0, through the editor's sound system); Natural Overhangs 2×1, 3×1 and 4×1 come with it (D338); the brushes, forces and recorded strokes move onto runs. (4) **Generation**, once M9b has settled: 3D features as intentions under Kyler's three principles ("a natural arch", "a cave with a spring in it", "an overhang shading the start"), grown by 3D-b's processes and checked like the others.
- **D132** (with D123, D145, D172, D244): Verticality: a setting (0–100, `vt`) beside Variety, with its share-link key; its default gives ordinary maps at the relief design version 2 targets (official and workshop medians, tall parts up to 16), higher values bring crazy vertical landscapes (Surprise me and high Variety may occasionally reach the extremes). Generated terrain goes above 16, up to the game's 22 levels with the top layer empty, only from Verticality 70 and above and once a probe batch confirmed such maps load and keep terrain, water and objects (passed 2026-09-25, run 20260925-tall). Vertical parts and processes (more as Verticality rises, all emergent, never stamped): spires and hoodoo stacks, sheer escarpments with hanging valleys, stepped canyons and deep gorges, towering mesas with summit lakes, cascades of falls with plunge pools, cliff-bench terraces. Vertical but traversable at any Verticality: the start and its first resources on reachable land, natural ramps where the land needs them, heights reachable only with stairs allowed as rewards; a vertical-reach measure compares land reachable on foot with land reachable only with stairs. **Tall maps** (D172): Real places and Pick a place get a height option, standard (up to 16) or tall (up to 22); dramatic places (Yosemite Valley, the fjords, the Grand Canyon, the volcanoes, the escarpments) default to tall; each tall map's description notes that the in-game map editor only edits up to level 16. **One height ceiling in the editor (D244):** every tool that raises land (the brushes and the forces) can go up to the tall maximum on any map, with nothing about it shown in the interface; a map whose land goes above 16 simply becomes a tall map (the note in its description, exported and validated as tall) and is a standard map again at 16 or below; generation is unchanged.

### Performance and the Rust order

- **D33** (with D46, D380, D130) *(D380's speed gate superseded by D453)*: Budgets: the canonical settle takes ≤ 3 s at 256² and ≤ 0.6 s at 128² (§10); CI's timing checks are reported numbers and never fail a build (D145), but a speed regression blocks a merge (D380). The 3D budget (PLAN §14.2) is measured by `npm run bench:3d` in the installed Chrome, headed, on 256² maps, judged on the integrated GPU (`--use-adapter-luid`, CPU slowed 4×); CI renders in software so it only checks the build with a 3 s bound and correctness (`tests/e2e/render3d.spec.ts`); information only, run when something 3D-heavy changes. Simulation speedups keep their proof (D130): every optimization is bit for bit identical (every sha256, exact depth arrays, Node and Chromium), golden hashes are never updated to accept a mismatch, one change per commit.
- **D435** (with D380, D341, D366, D398) *(the 6-cell gate superseded by D453)*: The smoothness gate (`tools/smooth/`) is a 6-cell check of about 15–20 minutes: Chrome on the discrete GPU (native), 256², Standard and High, orbit, brush and force, 3 runs each on `dev` and on the branch. A cell fails only on a clear regression: the branch's median p99 frame more than 20% worse than dev's, or more hitches than dev's highest run. Firefox's speed, integrated GPUs, a CPU slowed 4×, WebKit and 128² are no longer measured by default; Firefox stays in CI's correctness checks, D366's three-engine determinism check among them. Under D380 a speed regression still blocks a merge, judged by this check. Kyler, 2026-10-02.
- **D381** (with D366, D367): The Rust order. *(Firefox's Codex round dropped by D440; the Rust water runs in every engine and its speed gates are dropped by D441; order moved ahead by D442.)* The Rust water port (`investigation/rust-water`, byte-identical everywhere) is approved: native builds serve batch jobs now (M9b's measures, theme measures, nightly checks); in the browser Chromium uses the Rust settle (about 1.7–2.5× faster) while Firefox and WebKit keep TypeScript until a short Codex round explains Firefox's slowdown; threading stays experimental; Rust 1.90, the wasm32 target and the Rust build join CI and the setup command. The five released forces are ported to Rust, byte-identical (their TypeScript is tagged `ts-forces-final` and then deleted); the forces' planning and the analysis and checks move to Rust; the Rift, Deposit and Carve's Maturity are adopted directly in Rust and every later force (Erode, future Codex demos) is built in Rust; the generator after M9b's release; the editor's operations and undo only if the performance audit shows the boundary cost justifies it. The interface and the rendering stay in TypeScript. Each later port gets its own tag before its TypeScript is deleted, and passes the identity tests (D366) and its speed budget (D380).
- **D391**: The Rust analysis (`investigation/rust-analysis`, #157) is approved and merged as an investigation with only Codex's own commits (#160). It is adopted after M9b's release with its fixed six-kernel policy in every engine, Firefox included; the outcomes and M9b's descriptive rows stay on TypeScript. Before adoption the quiet window (the post-release list's item 11) re-times the improved port in Chromium, WebKit and native (only Firefox was re-timed) *(speed gate dropped by D441)*. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D393** *(dropped by D440, D441)*: The quiet window also re-times multi-core water's Firefox numbers (#130) with the corrected optimizing-tier setup from `investigation/rust-analysis/PROFILE_REPORT.md`: its evidence shows no sign of that setup, and the Firefox thread threshold (256² and up) rests on those numbers. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D414** (with D380) *(superseded by D453)*: M9b's quiet-window timings run after Kyler accepts the Islands and Delta sheets, so one run covers everything; if they aren't accepted by 2:00 on Saturday 2026-10-03 (Pacific), it runs then anyway, and only the timings the redesign changes are re-run once it is accepted. Kyler, 2026-10-02.
- **D400** *(the corpus gate superseded by D453)*: The Rust forces (#158): round 2's speed is accepted, provisional until a quiet window *(speed gate dropped by D441)*. Adoption waits for round 3's identity corpus (2,000 per force and size for native and Node-Wasm, 500 per browser engine) and the open gates; nothing to do until then. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-four.md`).
- **D437** (amends D400) *(the corpus superseded by D453)*: The Rust forces' identity corpus (#158 round 3) checks 256² only: 2,000 native and 2,000 Node-Wasm cases and 500 per browser engine, per force; 128² and 512² are dropped (no map is larger than 256²). Codex runs it on Kyler's PC; adoption follows when #158 reads ready, under D381. Kyler, 2026-10-02.
- **D438** (with D381, D281): New forces are built in Rust on top of the adopted Rust forces (#158), only after that adoption, never in TypeScript first. Erode waits for #158's adoption and is then built directly in Rust on the forces port (its investigation stays the reference). Kyler, 2026-10-02.
- **D444** (with D381, D438, D442, D366): New forces built in Rust keep the refining loop fast and have a defined check from their first commit. (1) The forces adoption (D442 (c)) includes a watch rebuild: saving a Rust force's source rebuilds its Wasm and reloads it in the running dev server with no manual steps, so changing a Rust force feels like changing a TypeScript one; the water adoption (D442 (b)) uses the same mechanism if it fits cheaply. (2) A force with no TypeScript original (Erode, the Rift, Deposit, Carve's Maturity) is correct when, from its first commit, native, Node-Wasm, Chromium, Firefox and WebKit produce the same bytes (checked in CI as part of D366's determinism check, at a cheap count) and it has its own contract tests in the core (D342), including D356's visible effect at Power 0 and D368 (10)'s no added objects; its Codex investigation is the reference for behaviour and look only. Kyler, 2026-10-02.
- **D448** (with D381, D438, D442, D279–D281, D286): The stacked-column water engine for terrain above terrain (#71, `feature/terrain3d-a`: `src/core/sim/stack.ts`, `stackModel.ts`, `stackPrefill.ts`, `columns.ts`, `src/core/format/stacked.ts`) is never wired into `dev` in TypeScript: it is new exact computation, so under D381 Codex ports it into the same Rust water crate, after the Rust water's adoption, with the one-column fast path being today's water unchanged. #71's golden fixtures, verified against the game, are its identity check in every engine, with D366's three-engine check in CI. The foundations step (converting `core/terrain`, the build and the validators to runs) then wires in the Rust stacked engine; #71's TypeScript engine stays as the reference (the PR stays open) and is never adopted. Nothing else in the 3D steps' order changes. Kyler, 2026-10-03.
- **D401** (with D366, D380): Portable maths (#171) is merged as an investigation and adopted narrowed: the one shared `portable.rs` for every Rust port, and the whole-source guard over `src/core/`, the workers and data-producing tools, as CI. Left out: the Vite plugin that rewrites Three.js and the renderer and camera parts (operations record their results, so picking maths never reaches a replay). Adopted only after a quiet-window timing shows no slowdown (D380) *(timing gate dropped by D441)*. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-four.md`).
- **D439** (with D316, D380, D435) *(timing work superseded by D453)*: No multi-hour measurement runs (profiling sessions, long timing series, extra quiet windows) unless Kyler says one is critical. Speed checks take minutes: the 6-cell smoothness check, or a short benchmark of the thing changed. Correctness and byte-identity checks run in CI or as needed. Tonight's 02:00 window (D414, D434) runs as planned. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-measuring-and-rust.md`).
- **D440** (with D435, D366): Firefox works and computes exactly the same maps as every other engine, and nobody spends time making it fast. It stays in every correctness check: CI's three-engine determinism check (D366) and every Rust port's identity checks; a mismatch is a real bug. Its speed is never measured, tuned or investigated: D381's Codex round on Firefox's slowdown is dropped, and Firefox-specific settings in the measuring tools stay only where a correctness check needs them. Integrated GPUs are not measured either: Kyler's own check on a real modest laptop before launch (D367) stands in. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-measuring-and-rust.md`).
- **D441** (amends D391, D393, D400, D401, D381, D414 where they set speed re-timing gates) *(the 6-cell check superseded by D453)*: The Rust ports' speed re-timing gates are dropped: D391's re-time of the analysis and its M9b batch comparison; D400's "provisional until a quiet window"; D401's quiet-window timing; the Rust water's corrected comparison against TypeScript; D393's Firefox re-time of multi-core water (which D440 also drops). A port is adopted when it is byte-identical (D366's checks, in CI) and passes the 6-cell check where it applies. The Rust water runs in Rust in every engine (Chromium, Firefox and WebKit) at every size, so its TypeScript is tagged and deleted under D381. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-measuring-and-rust.md`).
- **D452** (with D381, D277): When the TypeScript water is deleted, `spike.spec` (the artifact page, which refuses WebAssembly) is skipped with a note pointing at D277; no TypeScript water is kept as a fallback. Kyler, 2026-10-03.
- **D442** (with D381, D385): The Rust adoptions move ahead of the post-release list, except what the release gate needs, in this order: (a) Rust 1.90, the wasm32 target and the Rust build into CI and the setup command, with `portable.rs` (#171, narrowed, D401); (b) the Rust water (#156), native for batch jobs and in the browser; (c) the forces (#158) as soon as Codex's corpus reads ready; (d) the analysis (#157) and the generator, after M9b's release. They run as one `build` sub-agent in its own worktree, in parallel with M9b, keeping CPU use reasonable while the page session runs its checks. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-measuring-and-rust.md`).
- **D402**: Rust threads (#168) is merged as an investigation and parked: threaded Rust stays experimental until wasm atomics are stable in Rust; the TypeScript parallel water (#130) remains the multi-core path. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-four.md`).
- **D366**: Cross-browser determinism (`investigation/determinism`): the portable maths, a correctly rounded sqrt, the consistent weir comparator and deterministic force records are adopted (zero mismatches across 358 cases in Chromium, Firefox and WebKit); its cross-engine check is in CI (the three engines on every PR, the CPU matrix when available) and new native approximate maths is rejected.
- **D367** (with D397): Startup, maps open fast (`investigation/startup`): every first-visit map is editable in 1.30–1.44 s median cold on a typical connection. Adopted in two parts: (1) opening a stored map loads its stored state without rebuilding (legacy files and files with water still pending keep the rebuild fallback), the renderer warms its shaders and GPU state while the map loads, and the checks start after the first editable frame with every gate unchanged; (2) with "The page is the editor": the ready-made first-visit map picker and parallel loading, and the caching, merged into one service worker with the multi-core water investigation's isolation worker; budgets and a CI check are added; Kyler tests on a real modest laptop once it's adopted.
- **D397** (amends D367 (2)): Startup part 2 is split: the page session builds the first-visit map picker and parallel loading; the milestone session builds the one service worker (the caching and multi-core water's isolation) with multi-core water's adoption, plus its budgets and CI check. Startup part 1 stays on the post-release list. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).

- **D453** (with D380, D414, D434–D437, D439, D441, D447, D451): The timing and measurement work is cut. The quiet-window runner is cancelled: no M9b-against-dev timing, no Lake Basin round 2 timing, no Naturalize bench; Lake Basin round 2 is adopted on its merits and D424 stays accepted. D380's speed gate is dropped: no quiet windows, no measured budgets, no speed regression blocking a merge; speed is judged by Kyler using it, and something that feels slow is a bug like any other (CI's timing numbers stay as reported information). The 6-cell smoothness gate is dropped: renderer PRs merge when CI is green; `tools/smooth/` stays as a tool, run only when something feels slow. `bench:3d` runs stop. The Rust forces' identity corpus (#158 round 3) is dropped: the forces port is adopted when CI's byte-identity checks (D366's three engines) and the existing suites against the Rust pass, so Codex's post-M9b step is only the re-pin, the rebuild and those checks. Kept: CI, the nightly suite, M9b's measures scoped as D447 says, probe batches, and a real check before anything is reported done. Kyler, 2026-10-03 (`docs/archive/feedback/2026-10-03-no-timing.md`).

### Collaboration

- **D362** (amended by D431) (with D349, D336, D342, D356): Collaborative editing, the next milestone after polish (the brief is `docs/COLLAB-BRIEF.md`; nothing is built before then): two players edit one map live, sharing one ordered list of operations; each browser rebuilds the map from it, so both see identical terrain and water (every change is a deterministic operation). Pure serverless, peer to peer (WebRTC data channels), no server of ours or anyone's, a public STUN lookup only across the internet and no relay (if a network blocks the connection it says so plainly); joining is two copy-paste codes (the host's Invite gives a code; the guest pastes it and gets a reply code to send back; the host pastes the reply), compressed as short as possible, one-click copy, plainly worded. One player hosts and keeps the order of operations; forces are ordered as seeded gestures computed on the agreed map; rejoining sends the current map plus the edits since. (1) A map starts fully shared. (2) Claims are made in Select on unclaimed ground, released in whole or part or offered to the other; they never change how the map looks (a faint outline in the owner's colour, a toggle hides them) and never go into the saved map. (3) An edit reaching into the other's claim is refused, shown before release in their colour ("reaches into <name>'s area"), the claim stopping it like the Floor (D356 not breached); the warning while drawing is quick and cautious (the stroke's band plus the force's reach) and the exact footprint (190–690 ms at 256²) decides on release. (4) Water flows as the game would across claims; the other player gets a quiet note when their claim's water changes. (5) Undo takes back only one's own last 50 actions; an undo under the other's later edit is refused and named, never replayed onto changed land (D336); undo guards the ground and objects the other player has since touched, and water re-settles as the game would with the other notified (unchanged water would need a full settle per undo, about 9 s at 256²). (6) Presence: cursor with name and colour, the tool held, the stroke as it's drawn, then the force playing out; a "Go to <name>" button, never automatic. (7) A drop pauses the session read-only with a clear message; one's own copy can be saved; rejoining carries on exactly. (8) Both can Save to Timberborn at any time; the session is kept in Your maps. (9) Changing the whole map is the host's alone, with a quiet note first, both keeping the previous map in Your maps. Open questions for when it starts: undo with two people, presence; cross-browser sameness (D366).
- **D431** (amends D362): Collaborative editing always goes through a managed TURN relay (Cloudflare Realtime TURN the candidate), with no direct peer-to-peer path, so every session connects the same way on every network and neither player sees the other's address; the relay sees only encrypted traffic. Players join with a short room code: the host's Invite gives it, the guest types or pastes it. A small serverless function (a Cloudflare Worker the candidate) hands out the relay's short-lived credentials and passes the connection setup between the two browsers; it never carries map data, never holds the key in the page and keeps nothing once connected. Codes are short-lived and single-use. If the relay or the function is down, collaboration is unavailable and the page says so plainly; editing alone is unaffected. Everything else in the brief stands. This replaces "pure serverless, peer to peer", "no server of ours or anyone's in the conversation", "no relay" and the two copy-paste codes; the spike's two-code join (#109) and the short-codes findings (#150) are superseded. Nothing is built before the milestone (D349). Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-collab-relay.md`).

### Claude (M12, deferred)

- **D84** (with D89–D96): M12 handles compound, vague requests ("Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down…"): Claude breaks them into bounded operations and the engine says whether each idea is feasible. Places are measured along a river's flow, never from the compass (upstream and downstream of something; a position along the course from its source, "halfway down" 0.4–0.6 by default; the start's bank and the opposite bank; "this valley" is the selected feature's valley, otherwise the main river's). A judgement-word table (harsher/easier, huge/small dam opportunity, dangerous/safe badwater, lush/dry and others the suite needs) gives each word measured targets from `tools/settings-suite.ts` and the analysis metrics, a direction and a size relative to the map's current value and the official range; playability checks are guards never traded away. Compound requests: settings changes and regeneration before placements; every goal checked on the combined preview; interfering goals detected; a goal that isn't feasible gets the nearest feasible alternative, offered and never silently substituted (built only within the goal's tolerance: 20 → 19 wide is built and reported), with every trade-off and unmet goal named (D92). Proposals are steps the app expands into the engine's operations with the editor's planners, at most 12 steps and 30% of the map, ordered by the app (settings, deletions, the start, moves and changes, rivers, lakes, falls and cliffs, badwater, sculpts, resources), saying so when the order differs (D89, D90). Guards: every check that passes before a proposal, and every start rule the validator applies (advisory start targets included), must pass after; a proposal that breaks one is refused naming the step; rules that already failed are reported, not guarded (D91). The loop's budget grows with the goals declared in the first `dry_run` or `propose`: 3 rounds and 10 calls for one goal, +3 calls per further goal and +1 round per two, at most 6 rounds and 20 calls (pending Kyler, #28) (D93). Judgement words change the map's settings, regenerating the whole map with the player's features kept; a word used about part of the map is applied map-wide and reported so (D94); a settings change that moves the generated start is reported as a trade-off with the new position (D95). Size words follow the validator's and builders' numbers: a giant waterfall is 30–40% of the side along its lip; a number means ±max(3, 15%); D84's dam-opportunity sizes stand until Kyler answers (#46) (D96). The place resolver, the judgement-word table and river-course naming sit with M12 (D278).
- **D139** (with D145, D187, D256, D217): Claude steers the generator; it never hand-builds the map. For character and new features ("make this valley harsher", "put the start under a cliff") it turns the request into intentions (outcomes, not recipes, D138) and settings, steers whole-map generation toward them, checks the result with the analysis and reports honestly what emerged and what didn't; for local change it uses the forces ("make the north mountainous" becomes Quake's Lift or Erupt, "add a big waterfall" Carve or Unleash); brushes are for precise edits only ("move the start here", "widen this river by two", "delete that forest"), as brush-style operations, never landform objects. Claude no longer regrows or locks areas (removed from the planned requests: "lock this area", "regenerate the east third", "make it symmetric", "put a spiral mountain here"). M12 gains "describe the map you want": the player types a sentence, Claude turns it into intentions, the generator makes several candidates steered toward them, the analysis checks which really have them, and Claude shows the ones that do and says honestly what didn't emerge; the first good candidate appears quickly and more stream in behind it. Requests whose steered solution needs a capability that doesn't exist yet are marked "waiting for capability", not failed. Resources, map objects, the start, drawn rivers and precise follow-ups stay operations. Claude is a summoned chat box (D187): a small chat box summoned with a key that disappears when done, never taking permanent space. The M12 mapping from the docs sweep is accepted as long as it follows D139 (D217). M12's model layer is provider-neutral (D140): the engine, tools, checks and steering principle don't depend on the model, only a thin adapter talks to the API; Claude is the default and the only provider built in M12; the design leaves room for an OpenAI adapter (a player's own key) later, tested with the same request suite before it's offered. After M12 (ROADMAP Later), a Dam Good Maps MCP server (generate, steer with intentions, edit, validate, export) as a thin wrapper over M12's tool layer inheriting the same honesty and "steer, don't hand-build" rules (D141); the agent guide (D142: how a Claude Code session generates, edits, validates and exports maps and runs the contact sheet and the probe) waits with M12.
- **D277** (with D134, D342, D349): All M12 work is deferred, its preparation included: no step builds or maintains anything for Claude until M12 begins (no new Claude steps or limits, no suite requests, no re-runs of reference solutions, no query tool entries); the Claude reference suite is out of the regular checks, its files and code stay unmaintained, and a test that depends on them and breaks is skipped with a note pointing here, not fixed; M12 is the last roadmap step (after collaborative editing) and when it begins its first part is catching Claude up to the tools as they are then. D342's architecture rule stands.

### Future and deferred

- **D357**: Custom map sizes (built at the end of D349's step 1, after the Weather view; nothing before then except the probe test): players choose any width and height from the game's minimum (4) up to 512 on either side, including outside Timberborn's standard sizes for unique layouts (for example 128×512, a long river dividing the map into two narrow halves). The size setting offers the standard sizes, a few named shapes ("Long river" 128×512, "Strip" 64×512, "Wide valley" 512×256) and custom width and height boxes; share links carry the exact size. The generator uses the shape, never just stretching: a long map gets a long river along it, a chain of islands down a strip, a canyon running its length; every theme's intentions adapt to the proportions; the start suits the shape (at one end for a journey, or in the middle with two directions to expand), chosen per theme. Item 47's must-haves scale with the map as for 48² (fewer mine sites and no district intention on small or very thin maps, more on large ones); the absolutes never relax. What grows with area may take longer beyond the standard sizes; what the player feels stays at the standard (brushes and forces smooth, input shown within a frame, the smoothness harness at every size, the page never freezing, the first land shown as soon as it exists, the map playing correctly in the game). The camera, Reset view, Top-down and the minimap fit any shape; beyond 256 on either side the size setting says plainly that Timberborn's own map editor can't open this size and the game may run slower, warning, never refusing; consistent with the crop tool (D340) and later Pick a place (any rectangle of the real world within the same limits). The unmodded game loads maps up to 399×399 (`investigation/WORKSHOP.md`): before building, a probe batch loads 512×512, 128×512, 64×512 and 512×256 maps, checks their water against our model, measures how smoothly the game runs and reports the practical limits; it waits for Kyler's YES, from the dedicated probe folder.
- **D383**: The dam sketch tool, and later the reservoir finder (D349's step 1, after the Weather view; needs the Rust water, D381, and "The page is the editor"; replaces D287's guessed dam sites): the player draws a wall of any shape and height using the game's dam, levee and floodgate rules, and the reservoir fills behind it simulated with the game-exact water; it reports the water held, the days of drought covered, the tiles needed and what it floods. Nothing is suggested or guessed, and nothing is saved unless real objects are placed. Later, on the same engine, **the reservoir finder** shows each basin's storable water and the exact tiles to wall, every candidate checked by simulation.
- **D392**: The dam sketch engine (`investigation/dam-sketch`, #159) is approved as an investigation and merged, not adopted. Adoption at its step needs (a) a calibration probe batch on the dedicated machine: a few sketched walls (a dam, a levee, a floodgate, a stacked wall) built in the game, comparing level, volume and dry-out day with the engine; (b) browser timings in a worker in Chromium, Firefox (the corrected optimizing-tier setup) and WebKit, at 128² and 256², while dragging a wall. Its Node numbers (first preview 16 / 67 ms, full fill 0.67 / 2.94 s, under shared load) support a progressive fill, not an instant answer. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-verdicts.md`).
- **D403** (with D392): Dam sketch round 2 (#166) is merged as an investigation, not adopted; no round 3 before the release. Its calibration needs a Probe wall-building bridge, and its stacked-dams scene (which predicts dry) is fixed first when it resumes. Kyler, 2026-10-02 (`docs/archive/feedback/2026-10-02-codex-four.md`).
- **D285** (with D205): Later (not scheduled): the build time-lapse (the edit history replayed at speed from the generated map, a camera that glides to each edit, saved as a WebM; near M13's sharing features), versioned deploys, and the mobile layouts for the generator page and the gallery; launch needs versioned deploys and Kyler's go-ahead (CLAUDE.md).

---

## Changes from audit

The audit of 2026-09-23 ([AUDIT.md](docs/archive/AUDIT.md)) changed this plan in ways that are now part of it; the
list of changes is in [docs/archive/plan.md](docs/archive/plan.md).
