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
Actions (`timbermods.github.io/dam-good-maps/`); Pages cannot set response headers, so the site's one service worker
(`public/sw.js`, D397) adds COOP/COEP and a first visit reloads once (`src/platform/isolation.ts`): the page is then
cross-origin isolated and, in Chromium and Firefox, the live water of maps 256² and up runs on several threads over
`SharedArrayBuffer` (`src/core/sim/parallel.ts`, byte-identical to one thread); other parallel work runs as independent
workers. A second build target, a single-file build for a
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
  - The forces are planned in Rust (`rust/forces`, D381): one call per force, byte for byte the TypeScript
    it replaced (tag `ts-forces-final`); their byte fixtures give the same results natively, in Node and in
    each engine (CI's `rust` job). The request, Keep, the build's last touches, the record and the showing stay
    in TypeScript (`src/core/forces/README.md`).
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
| Highest terrain | 10 – 22 | 16; 22 at Verticality 70+ | Terrain never exceeds this; 16 is the in-game map editor's limit and every official map's top. Heights 17–22 come only with high Verticality (§5.9) and tall Real places (D172). The default follows Verticality (16 below 70, 22 from 70; M9b, decisions-pending #139); a link from before 0.8.0 at Verticality 70+ with 16 reads as 22. |
| Terracing | Smooth 0 – 100 Distinct | 50 | The share of height steps that are one level: 0.86 − 0.0059·terracing (official median 0.62). |
| Buildable land | Tight, Normal, Generous | Normal | Land walkable from the start through slopes of at least 750 / 1,300 / 2,500 tiles (official median 1,296), flat share 0.40 / 0.52 / 0.60; it shapes the valley floor's width, the terrace edges and where the cliffs go. |
| Variety | 0 – 100 | 70 | How far the land strays from its theme's ranges (`vy`, M9b, D276); at 100 anything goes. A spec stored before it opens with 70. |

### 5.3 Water

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Rivers | 0 – 3 | theme | Rivers entering on the map edge; 0 means only lakes, springs and seeps (a spring feeds the main river). Tributaries each bring a quarter of the main river's flow. |
| River style | Straight, Meandering, Braided | Meandering | Meander amplitude ≤ 0.05·H / 0.12–0.2·H with 1–3 bends per 100 tiles / a channel splitting into 2–4 around islands (Delta). Rivers follow the land's drainage and never run ruler-straight (D209). |
| River flow | Trickle, Normal, Strong, Lush | Normal | Total clean source strength: 0.6× / 1× / 2× / 4× the size-aware official median (medium 2.2, large 1.2, max 1.1 per 10k tiles; Lush is about the workshop median), in sources mostly 0.5 each, in rows of 3–8 across a channel. It sets river size and how fast reservoirs refill, **not** drought survival. |
| Drought reserve | Scarce, Normal, Plenty | Normal | Minimum stored water near the start, as a multiple of the colony's drought need (§11.4): 1× / 1.5× / 3×. This is what makes droughts forgiving. It is information the generator prefers, never a guard (#67): a larger reserve than the theme's adds valley lakes and has the generator try up to four more attempts for natural water or a dam site holding the need; a smaller one takes valley lakes away. Not every combination fits a small map: reservoirs are 2 deep on Easy and Normal and 3 on Hard (Hard with Normal needs about 590 tiles, with Plenty 1,170), so the panel disables combinations whose reservoir would exceed 15% of the map area and says why (smallest sides: Normal with Plenty 51, Hard with Scarce 52, Hard with Normal 63, Hard with Plenty 89); every size preset fits every combination. |
| Lakes and basins | None, Few, Some, Many | Some | Natural basins of 20+ tiles that hold water without a dam: 0 / 0.5× / 1× / 2× the official median for the size (small 1.5, medium 4, large 15.5, max 15), as riverside ponds the river keeps full and that keep their water through a drought. |
| Sources | Placed, None | Placed | **None** (D330, D331; the UI brief §8): the map as generated, then every water and badwater source and its water removed, keeping the dry valleys, basins and pits they carved, the trees and bushes as generated. Item 47's water must-haves don't apply: the water checks say "No water source" as information until a source runs. Share link `so=n`; Real places take it too. |
| Waterfalls | Off, Few, Many | Few | Bed drops of 2+ levels: 0 / 1–2 / 3–6, on rivers, carrying their flow, 1–9 tiles wide like official falls (§9.2). |

### 5.4 Hazards

| Setting | Range | Default | Maps to |
|---|---|---|---|
| Badwater | No badwater, Low, Normal, High | Normal (Highlands and Islands: Low) | Every map has at least one badwater source, a late-game resource like the mine site, unless the player picks **No badwater** (a peaceful map: none is placed, badtides still turn every source bad; the share link `bw=0` and the description record it, D200). Sources and strength are the official maps' for the size (`official-baselines.json`: 1 / 2 / 4 / 3.5 sources and 1.25 / 3.5 / 5.5 / 6.5 strength for small / medium / large / max, joined in ln(area)), moved within the official typical range by the seed, then × 0.5 / 1 / 1.5 (sources) and × 0.5 / 1 / 1.75 (strength) for Low / Normal / High; each source 1–3 strong, a BadwaterSource 3×3 in a side basin (§9.5). Where fewer hollows fit than the budget asks, the ones placed share its total, each up to 3. |
| Badwater distance | 8 – 60 | 15 (Easy 30, Hard 8) (D85) | Distance from the start to badwater or contaminated soil the generator aims for. A hollow aims at the distance + 11 tiles from where the start is expected; the start is chosen, among the places nearly as good as the best, nearest there, and the hollows are planned again from the real start when their badwater lands within the distance or more than 26 tiles beyond it (D200 (2)). The start rule "No badwater within" (§5.6) is the same value: the panel sets both, and validation uses the larger. For a generated map it is a rule: a start with badwater or contaminated soil nearer is never kept, and the land is planned again (Kyler, 2026-10-05, #265); on an edited or imported map, an advisory warning (D85). |
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
| Mine sites | 2 – 4 | 2 / 2 / 3 / 3 by size | Every map has at least two the colony reaches from its start without crossing water or climbing a cliff, at least 24 tiles out (item 47, D325, D363; old links with 0 or 1 open with 2); maps under 80² need only one reached (D333 (7)). Flat 5×5 with a level ring, dry, 60+ tiles out where there is room (official 24–173, median 89), their ground levelled while the land is shaped (D363, `land/minePads.ts`). |

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

Each map is turned into one of its 8 orientations, so all 8 appear and none over a quarter (D275, `land/orient.ts`): the
land is turned right after the field is made, from a random stream of its own, and the rivers, the start and the objects
are found on the turned land; a map that is not square takes the 4 orientations that keep its sides. The flow axis is not
drawn during layout. §7.1–§7.4 (concept, macro layout, set pieces, terrain) were
the layout-band planners the processes replaced; they are in the archive.

### 7.0 Normalise

Validate the `MapSpec` (§19.1) against its schema; clamp every setting and resolve size-aware targets
(`target = multiplier × density(key, W·H)`); derive the difficulty rules. Derive seed streams: `layout`, `terrain`,
`setpieces`, `water`, `veg`, `ruins`, `extras` and `names`, each `hash(seed, stream, candidate, attempt)`.

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
   - **A river's water runs its planned course** (D447): no lower water on a channel's bank takes it before its
     course ends. A course with another river's channel or a lake on its bank, lower than its bed, runs down to that
     water's level there; an arm of a fan or a split cut across a tributary takes the tributary down to its level
     from there; an oxbow lake keeps a bank to every water but at its join.
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

Each attempt builds one candidate (D278, D325, D329, D348; replacing the 12-component score and K = 3). The first
candidate that passes the absolutes (plays exactly right, the starting-logs floor, item 47's must-haves) is the map,
shown at once and never swapped. Its outcomes are measured (readable water, `analysis/story.ts`; the theme's promise,
`analysis/signature.ts`, `gen/outcomes.ts`; a standout intention); when it misses the promise or readable water, a worker
of its own looks for a sibling that meets all three (`gen/versions.ts`, up to 6), and only a missed promise gets a note
naming what the version has (D333 (5)). Only true near-duplicates are rejected; resemblance is otherwise information
(D223). Another like this makes one sibling per click (D278).

**The first land shown is the map** (D348, D370): a land is shown once it passes every check the land alone can judge,
and is never replaced. Those checks: its courses; no inflow's head under water held downstream; the Rivers count; no
source in a flow; no wall along an edge; a start on the planned water its land holds, a second place for one, and room
for the mine sites (D363); no slow sea over a shelf (D358); no ground above 16 unless tall; no ruler-straight channel or
dam wall on its planned water, its lakes' banks read alone, and no dam wall on the pre-fill alone (its water under 0.2
deep left out). At 128² and under (`SHOW_PROVED_MOST`, small starts, #153) it is shown only once its actual settled
start reaches its mine pair, so a land whose settled start fails can still be drawn again; above 128² it is shown at
once, for D278's time to editable land (a default for Kyler). A land whose planned water misses the promise or a
readable story is drawn again first (up to 6 lands at 128², 4 to 192², 3 above). The planned water is read as its land holds it (`plannedWater` with `held`). The badwater
hollows are dug and the mine sites' and start's pads levelled (`land/minePads.ts`) while the land is shaped. What needs
settled water is fixed on that land: the start moves to another on the same settled water (three in all), gets a spring
by it (D330), or is planned again; the mine sites the colony reaches are read by one function (`validate/playability.ts`
`colonyReach`, `minesReached`, D342) for the check and the generator alike. Water that does not settle (D350): outlets
are widened while the land is shaped (`levels.ts` `widenOutlets`, `carveOutlets`); a rising basin at 256² in River
Valley or Lake Basin, or a sea still rising at 256², is fed more gently (0.7, 0.49, 0.343 of its feeders, recorded in the features), and a prepared land
keeps its heights: the worn way out (`water/outletWear.ts`) no longer runs on generated maps (generation speed round 2,
#155; a default for Kyler against D350 (b)). The settle runs up to 6 game days (D358).

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
waterfall-lake intentions (D209). Islands and Delta are shaped by the same processes as every theme (D408): Islands
draws one of D209's sea layouts, islands with relief of their own and springs on them, inside a rim whose line wanders,
rounded at the corners; on three sea maps in four the sea lies off the middle and broad headlands break the land round
it, an inland sea in a ring of land on the fourth; its start may stand on an island that holds what it needs (D410,
D411), not required (D429). Delta's river
comes down from higher ground and splits into several channels, every one reaching the edge, across a fan whose place,
direction and size vary by seed (D412, D416). The river's own course below the fan's apex is one of those channels, as
narrow as an arm and falling as soon as they do, so it carries its share and never stands dry (D447).
Lake Basin's default map (Normal, one colony, the preset's settings, square from 96² to 256²) draws one valley
basin in a stronger radial catchment that brings several of the drainage's tributaries into it, a smaller lake with a
curved outlet valley on large maps; any other Lake Basin spec keeps the shared path (`land/lakeBasin.ts`, D453).

---

## 9. Set pieces

Each set piece lists what it builds, the ranges the game's limits allow, and the constraint validation proves.
"Levels" are terrain levels; the terrain budget is 0–16 (0 an empty column, used by official maps as river outlets;
16 the in-game editor's limit; up to 22 at high Verticality, §5.9). The generator's land processes
make the dam sites, falls and gorges (§7); three kinds have a set-piece builder (§19.3): the second district's site,
ruins on a rise and the badwater hollows. The builders the editor once planned with (waterfalls, dam sites, gorges,
terraced cliffs, plugged spillways and natural narrows) are retired (D462); the rules below stay where the
generator and the checks follow them. Values outside a builder's hard bounds are rejected. The measurements behind the ranges (the audit's runs of the water
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
  water stays clean (contamination under 0.05); at least one clean river reach of 40+ tiles; badwater may join rivers and lakes
  (D469; `water.badwater_contained`, §11.3, only counts basins whose water leaves). **Badtide:** every clean source emits
  badwater, so only stored water stays clean (the map card says nothing about badtides, D472).

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

These are the ranges for a map of each size; Claude uses them to resolve words such as "giant" when it steers (D139). At 48² / 96² / 128² / 192² / 256²: waterfall width cap (40% of the side along the lip; the hydraulic
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
- The simulation runs in Rust (`rust/water`, D381, D441, D442 (b)) in every engine and at every size: its Wasm is
  committed (`sim/waterWasm.ts`, bound by `sim/rustWater.ts`; `WaterSim` keeps its interface). Batch jobs run the
  whole canonical settle in the native binary (`tools/batch.ts`, `--wasm` to opt out). The TypeScript simulation
  is tagged `ts-water-final` and deleted. CI checks the same bytes natively, in Node and in each engine, the
  native settle against the app's (`tools/rust/water-identity.ts`), the pinned digests and D366's three-engine
  check. The artifact edition, whose policy refuses WebAssembly, can't settle water; its spike test is skipped
  until M12 (D452, D277).
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

**Performance.** The active set must be exact: wet cells plus their 4-neighbours, exact every substep and kept as
an index list rather than a full-grid scan (a once-per-tick set changed the settled volume by 5%); it is kept up to
date as tiles turn wet or dry rather than rebuilt (D359). The settle starts
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
| `water.badwater_contained` | With the planned outlet channel's tiles blocked (a levee, §9.5), the water rising in each planned badwater basin cannot leave the basin (its 7×7 floor and two-tile rim) or reach a map edge below the rim's level: the outlet is the basin's only way out, not proof that a levee holds forever (D57). Information only: badwater may join rivers and lakes, so the count never fails the map (D469). Not applicable without a basin with a planned outlet. |
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
| `start.badwater` | No badwater water or contaminated soil within the badwater distance (30 / 15 / 8). | blocking when generating (Kyler, 2026-10-05); advisory otherwise |
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
its name; D345, B10). The map card's name and one-line "how it plays" description (D274, D278, `gen/names.ts`) come from the standout
intention (a few titles each, some with the land's noun), chosen by the seed and never a title the names study forbids
(`core/data/forbiddenNames.json`); a map without a standout takes a plain name from its land. The line is the
standout's sentence and one thing read from the map (the start's water in the first drought, a dam site near the start,
where the badwater lies, the woods). The in-game file's name and description are unchanged.

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
- **Another like this** (D278 (1c)): a sibling of the map shown, one per click, on the page and in the editor's menu:
  the same theme, settings and intentions on different land (D143), with its own share link (`vr=`, `in=`); a sibling
  whose land matches the map it came from (85% of tiles within a level) is passed over for the next.
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
  `a` archetype, `p` premise and `c` colonies (reserved for Timber Together, D5), each only when set. A value the
  decoder cannot use is reported and the preset's value kept. A link from before D462 may carry `sp` and `k` (set
  pieces and constraints, which no map read): they are ignored, and the link opens the same map.

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
(`{count: 1–4, mod: "none" | "timberTogether"}`, room for Timber Together, D5) and `accepted` (`{attempt, candidate}`,
filled in by the generator so a document reproduces its map without running the retry loop again). A spec saved
before D462 also carries `setPieces` and `constraints`, which nothing read: a project opens with them dropped.

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
- M9b's fields: `settings.terrain.variety` (Variety, `vy`, 0–100, default 70; a spec stored before it opens with the
  default); `variation?` (Another like this: the sibling's index, `vr`) and `intentions?` (the intentions a sibling
  keeps, at most 2, `in`).

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
- `setPiece` (badwaterBasin / obstaclePayoff / secondDistrict, params per §9): built only by its builder (§19.3). A
  project holding one of the retired kinds (waterfall, damSite, gorge, terracedCliffs, plugSpillway, naturalNarrows)
  opens without it (D462).
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

There is one module per kind the generator makes in `core/features/setpieces/` (`index.ts` `BUILDERS`): the second
district's site, ruins on a rise and the badwater hollows. Claude reaches them by steering the generator (D139); the
editor has no set-piece tools (D182, D184), and the editor's own builders (waterfalls, dam sites, gorges, terraced
cliffs, plugged spillways, natural narrows) are retired with their replay (D462): a project that held one opens
without it (`doc/document.ts` `dropRetired`); the land a stored map holds stays as it was saved. A builder has a
`request` (a JSON Schema: the hard bounds of a request, outside them rejected), `check(plan, W, H)` (a stored plan
outside the hard bounds, which an operation may bring), `rasterize(feature, target)` (terrain and the protected
mask), `footprint(feature, target)` (what it reads and writes, for dirty-region rebuilds) and optionally `plan`
(the second district's: the anchor and values on the generated map, with a report; or why it cannot), its springs,
its own slopes, the tiles it keeps clear and what the editor shows.

A set-piece feature stores `{kind, request, plan, report}`; operations that add or change one are checked against
the builder's hard bounds. The generator plans ruins on a rise and the badwater hollows itself and stores their
plans; the second district's site is planned on the generated map (`PlanContext`: its surface, rivers, water and the
start's zone). The resolved plan is stored in the feature; a rebuild rasterizes it and never plans again (§19.7). A
builder never moves the start; when it would have to, the plan fails with the reason. Ruin fields are ordinary
features with their own placement rules (§9.7).

### 19.4 Stable ids

- **Generated features:** `id = "f-" + base32(hash64(seed, kind, roleKey))`. `roleKey` is the feature's role in the
  plan, not how many other features exist (`river/main`, `river/tributary/2`, `setpiece/secondDistrict/primary`,
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
built as it now says), and no rebuild keeps its edits (D336). A project also carries the map as it was saved
(`stored`, D367): it opens from it without rebuilding, and the log's replay, compared with it once on reopen, decides
whether undo may go below the save point (D455; EDITOR_PLAN.md, "Undo and redo"). Versioned deploys (`/v/<version>/`) keep old share links
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

The decisions in force are in [docs/decisions/](docs/decisions/README.md), one file per topic; start at its index.

---

## Changes from audit

The audit of 2026-09-23 ([AUDIT.md](docs/archive/AUDIT.md)) changed this plan in ways that are now part of it; the
list of changes is in [docs/archive/plan.md](docs/archive/plan.md).
