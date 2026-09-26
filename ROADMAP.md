# Dam Good Maps roadmap

One milestone order for both plans: the generator website ([PLAN.md](PLAN.md)) and the map editor
with Claude integration ([EDITOR_PLAN.md](EDITOR_PLAN.md)). It came out of the plan audit of
2026-09-23 ([AUDIT.md](AUDIT.md)). Where either plan's own milestone list orders things
differently, this file wins.

**How the order was chosen**
- **Shared foundations first, built once.** These are the map spec, parametric features,
  set-piece builders, stable ids, validation, format I/O, determinism and the build pipeline, all
  defined in [PLAN.md §19](PLAN.md#19-shared-foundations-with-the-editor). The 3D renderer, the
  set pieces and validation were each planned twice (once in each plan). Each is now one milestone
  that serves both halves.
- **Editor-ready from the first milestone.** M1 already generates maps *from* parametric features
  and offers them as a project file, so the editor opens every generated map with its plan kept,
  for "Generate, keeping my edits", regenerate area and Claude's steering. No generator code is
  retrofitted later. (The editor showed those features as objects with handles until Live
  editing; the brushes shape the land now, D182, D184.)
- **Every milestone ends with its blocking criteria met and its tests green.**
- **Kyler's one rule** (Kyler, 2026-09-25; PLAN §20 D115). Acceptance covers only what a player
  would notice or what would break. Only three kinds of thing block: **breakage** (maps failing
  in the game, files or share links changing, lost edits, crashes); **principles Kyler has
  already decided** (no built dam walls, D111; from the 3D stages, the support rule's 0 dropped
  voxels and nothing stamped); and **what a player feels** (the page never freezes, and a first
  result appears quickly while the rest streams in). Measures and numeric budgets are
  information; the 3D speed benchmark on the integrated GPU with a slowed CPU runs only when
  something 3D-heavy changes. No blind review rounds: for anything visual, Kyler is shown
  captures and decides. Stop and ask Kyler only for real decisions or real breakage; otherwise
  keep building, log the rest in [docs/STATUS.md](docs/STATUS.md), and show the result rather
  than measure it. Each step from Map look on lists its acceptance as **Blocking** and
  **Information**; M1–M8 keep their record as written. Kyler confirmed the lists' reading (D145):
  they stand as written, and the no-built-dam-wall check (D111) and the support rule (0 dropped
  voxels) always block. CI's timing tests (the 256² settle median, D33; the editor's 2 s
  re-preview) are reported numbers, never a failed build.
- **In-game checks are deferred** (PLAN §20, D11). Kyler is skipping them for now. A milestone
  marked **in-game check** does not stop or wait: it lists the checks it would have needed in
  [docs/ingame-log.md](docs/ingame-log.md) as *pending*, with the files to play, and relies on the
  automated validation and tests. The game stays the final judge once the checks are played.
  The one exception is a **DGM Probe batch** (D116, D117): an automated run of maps in the real
  game, launched only after Claude asks Kyler in chat and Kyler says yes, every time (CLAUDE.md,
  Standing rules). A step whose gate is a probe batch waits for it.
- **Effort** is the recommended Claude effort level for building the milestone: **xhigh** for
  architecture-setting or algorithm-heavy work, **high** for the rest.
- **Keep M12 ready as we go** (Kyler, 2026-09-25; PLAN §20 D134). Every step before M12 that adds
  or changes a way to edit or understand maps (M9a–c, the 3D stages, the Weather view, M10, M11,
  the refinement phase) also: (1) exposes that capability to M12's Claude layer as a bounded,
  validated operation or query tool entry, in the shape of the Claude groundwork's tools
  (`investigation/claude/`), with its limits and its refusal reasons (character and new features
  steer the generator, D139; precise edits are brush-style operations, never landform objects,
  D187); (2) adds requests for it to
  the Claude request suite (`investigation/claude/requests.json`), with measurable expectations
  and reference solutions; (3) re-runs every reference solution against the step's code, and
  fixes or re-tunes any that broke, so the suite stays green. No model or API key is needed; the
  harness waits for M12. Each step's progress entry records the suite's pass count. Each of those
  steps below has a **Keep M12 ready** line naming its capabilities.
- **A contact-sheet image at every map-changing step** (Kyler, 2026-09-25; D144; CLAUDE.md). Every
  milestone or step that changes generated maps commits one small image to
  `docs/sheets/<step>.png`: seeds 1–30 of every built theme at 128², top-down, each labelled with
  its seed and theme; our own generated maps only; under 1 MB.

## Overview

| # | Milestone | From | In-game check (logged as pending, D11) | Effort |
|---|---|---|---|---|
| M1 | Shared core and end-to-end slice | PLAN §2–4, §5.1, §7, §11.1–11.2, §14.1, §14.4, §19 · EDITOR §11 | yes (A, F2) | xhigh |
| M2 | Water, playability and validation profiles | PLAN §10, §11.3–11.6, §14.2–14.3, §19.5, §19.7 | yes (B) | xhigh |
| M3 | Map document and operations engine (headless), delivery spike | EDITOR §3, §7 (spike), E1 · PLAN §19.4, §19.6 | no | xhigh |
| M4 | Shared 3D view and editor shell | EDITOR §4, §8, E2 · PLAN §14.2 (3D) | no | high |
| M5 | Set pieces, land and water tools, slopes, fixes | PLAN §7.3, §7.5, §9.1–9.3, §9.5, §9.9–9.10, §19.3 · EDITOR §3, §4, §6, E3 | yes (C, F1, edited maps) | xhigh |
| M6 | Full settings, sharing, themes I | PLAN §5, §6, §8 (Canyon, Lake Basin), §9.5, §14.5 | yes (short) | high |
| M7 | Resources, map objects, themes II | PLAN §5.7, §8 (Highlands, Delta, Islands), §9.4, §9.6–9.8 · EDITOR §4, E4 | yes (D) | high |
| M8 | Water preview and background validation in the editor; start requirements first | EDITOR §6, E5 · PLAN §5.6, §10, §11.4, §19.7 | yes (preview vs game, F3, F4) | xhigh |
| Look | Map look, after M8, before M9 | Kyler's plan (PLAN §20, D86, D135) · EDITOR §8 · PLAN §14.2 (3D) | no (Kyler approves the look from captures) | high |
| Places | Real places, right after Map look is released | the landscape survey (investigation/landscapes/) · PLAN §20 D136 | optional (a probe batch, if Kyler approves one) | high |
| M9 | Interestingness, names, candidates, premises and variety (staged M9a–M9c) | PLAN §7.1, §7.9, §8, §12, §13 · the workshop study (D87) · EDITOR_PLAN, Claude integration: spatial language and judgement words (D84) · the M9 design (D112) | a probe batch for M9a (D116) | xhigh |
| Quality | Map quality checkpoint, after the M9 build: contact sheets, a probe batch, tuning rounds until Kyler says go | PLAN §20 D146 | yes (a probe batch, asked first) | high |
| Look 2 | Map look 2: water and shadows (a High quality mode), after the checkpoint | PLAN §20 D147 | no | high |
| Frame | Frame pass, after Map look 2, before the 3D stages | the impeccable-app-flow skill · PLAN §20 D113 | no | high |
| 3D-a | Terrain above terrain: model, water and checks | investigation/terrain3d/DESIGN.md §2–4, §9 · PLAN §10, §11, §19.6, §19.8 · D118–D122 | no (the Probe's test maps are written) | xhigh |
| 3D-b | Terrain above terrain: generation and Verticality | DESIGN.md §5 · PLAN §5.9 · D123, D132 | a probe batch (T1–T4, T6, T7; D145) | xhigh |
| 3D-c | Terrain above terrain: the editor and the view | DESIGN.md §6–7 · EDITOR_PLAN Part 1 §9 (carving is a brush), Architecture · D125, D126, D182 | a probe batch (T5, T2 on edited maps) | xhigh |
| Weather | Weather view: the full cycle's timeline, after the 3D stages, before M10 | investigation/cycles/, investigation/mechanics/ · PLAN §20 D133, D186 | a probe batch (calibration) | xhigh |
| M10 | Symmetry, and the brushes' extras (the brushes came with Live editing) | EDITOR_PLAN Part 1 §4, §9; Stamps and symmetry · D158, D182 | no | high |
| M11 | Stamps painted as brushes, heightmap import, regenerate area, locks | EDITOR_PLAN: The map document (conflict rules), Stamps and symmetry · D182 | no | high |
| Refine | Refinement phase, after M11, before the design pass | Kyler's refinement notes · decisions-pending #2, #12, #21, #29 (#13 is moot: D184 removed drawn rivers) | short (a dam at a new narrows holds) | xhigh |
| Design | Design pass, after M11 and the refinement phase | the impeccable-app-flow skill (timbermods/.github, `claude-skills/`) · old milestone 6 | no | high |
| M12 | Claude integration | EDITOR_PLAN: Claude integration, Testing (the Claude suite) · PLAN §19.9 · the Claude groundwork (D88) · the workshop study (D87) · steering, a provider-neutral layer, the summoned chat box and brush-style edits (D139, D140, D187) | yes (the waterfall and compound requests) | xhigh |
| M13 | Usability, problem reports, versioned deploys | EDITOR_PLAN: Testing (usability tasks) · PLAN §2.3, §14, §15, old milestone 6 | yes (full journey) | high |
| Later | See the end of this file | PLAN §5.7, old milestone 7 · EDITOR_PLAN Part 1 §9 | per item | — |

In the rows for M1–M8 and Look, "EDITOR §n" and E1–E9 name EDITOR_PLAN.md's sections and
milestones before its rewrite of 2026-09-25 (D188; its git history has them). Later rows name its
current sections. M3–M8 below record the editor as built then; its tools with handles, drawn
rivers and lakes are superseded by Live editing (D182, D184; EDITOR_PLAN.md Part 3).

**Release points** (suggested):
- after M2: a public generator beta (River Valley, validated water);
- after M6–M7: all themes;
- after M8: the editor, with the new start requirements;
- Map look: inside the M9 release, or tagged `map-look-done` and released like a milestone, once
  Kyler approves the clean look (D135);
- Real places: tagged `real-places-done`, right after Map look;
- M9's stages: tagged `m9a-done`, `m9b-done` and `m9c-done`; M9a goes public only after its probe
  batch passes (D116);
- the Frame pass: tagged `frame-pass-done`;
- 3D-a: no visible change (tagged `3d-a-done`); 3D-b: Verticality's 3D forms (tagged `3d-b-done`,
  public only after its probe batch passes, T7 included; D145); 3D-c: 3D editing (tagged
  `3d-c-done`);
- the Weather view: tagged `weather-view-done`;
- the refinement phase and the design pass: tagged `design-done`;
- after M12: Claude.

M9 depends only on M2 and can run alongside M8. The 3D stages follow the M9 build and the Frame
pass, and the Weather view follows them. M10 and M11 follow the Weather view, so their tools are
built on runs from the start; they can swap places. The refinement phase stays before the design
pass, M12 and M13.

**Investigations adopted after M7.** Their items are built in the milestones below, each marked
with its source:
- **The workshop study** (PLAN §20, D87): [investigation/WORKSHOP-INTEGRATION.md](investigation/WORKSHOP-INTEGRATION.md),
  with the findings in [WORKSHOP.md](investigation/WORKSHOP.md), the numbers in
  [workshop.json](investigation/workshop.json) and the tools, recipes and parameters in
  [investigation/workshop/](investigation/workshop/). Port only what a milestone needs, into
  `src/` or `tools/`, with tests: `lib/measures.ts` (mechanics flags, start quantities, score
  inputs), `lib/naturalness.ts`, `lib/variety.ts`, `lib/score.ts` and `obviousness.ts`. The recipes
  are reference implementations for the premises, builders and stamps, not code to ship as they
  are. Other creators' maps, renders and per-map numbers stay in `C:\dgm-workshop`; never commit
  them. Its decisions W1–W8 are decisions-pending #31–#38 (Kyler decided W4, #34, in D85),
  and its conflicts with recorded decisions #39 (decided by Kyler in D85) and #40.
- **The Claude groundwork** (PLAN §20, D88–D96):
  [investigation/claude/M12-INTEGRATION.md](investigation/claude/M12-INTEGRATION.md), with the
  report in [REPORT.md](investigation/claude/REPORT.md) and the self-played pilot in
  [pilot/PILOT.md](investigation/claude/pilot/PILOT.md). M9 builds its vocabularies (places and
  words) and M12 the rest; each milestone below lists the files that move into `src/` and
  `tests/`. Its numbers come from a self-played pilot, not from a model: re-measure them with the
  real suite before fixing them in the plan. Its pending decisions P3–P7 are decisions-pending
  #41–#45 (P1 is settled by D84, P2 is #28), and its conflicts with recorded decisions #42, #46
  and #47.
- **Terrain above terrain** (PLAN §20, D118–D127; Kyler's decisions, not proposals):
  [investigation/terrain3d/INTEGRATION.md](investigation/terrain3d/INTEGRATION.md), with the design
  in [DESIGN.md](investigation/terrain3d/DESIGN.md). Its text is the 3D stages below, format 3's
  runs in M9a (I-1), and M10's and M11's work on runs.
- **Simulation speedups** (D130, proposals):
  [investigation/simspeed/INTEGRATION.md](investigation/simspeed/INTEGRATION.md). The proven
  speedups join M9a's build plan, each with its bit-for-bit proof.
- **The techniques playbook** (D131, proposals):
  [investigation/techniques/PLAYBOOK.md](investigation/techniques/PLAYBOOK.md), for the M9 build
  and the 3D design. Its conflicts are decisions-pending #51–#53.
- **The first-pass audit** (D129): [investigation/audit/AUDIT.md](investigation/audit/AUDIT.md). A1
  and A2 go into M9a, A3 and A4 onto the Refinement list.

---

## M1. Shared core and end-to-end slice

The smallest slice that goes settings → generate → preview → download of a valid map, built on the
shared core, so its maps are editor-ready.

**Delivers**
- Vite + TypeScript + Preact app shell, GitHub Pages deploy from Actions. Data (footprints,
  calibration) is bundled, not fetched, and workers can be inlined, so the artifact build (M12)
  stays possible.
- `core/spec`: `MapSpec` v1 schema, defaults and URL codec for seed, size preset, difficulty and
  theme (River Valley only) (PLAN §19.1).
- `core/features`: the feature schema v1 (PLAN §19.2) for `river` (with bed profile), `lake`
  (planned basins), `landform` (valley floor, terrace bands, highlands), `setPiece`, `forest`,
  `berryPatch`, `ruinField` and `start`.
  - `setPiece` covers the dam site and the on-river waterfall, in the generation context only,
    as the prototype builds them.
  - Rasterizers and the build pipeline steps 1–5, 7–9, 11–12 and 14 (PLAN §19.8).
  - Stable ids (§19.4) and per-feature RNG streams (§19.7).
- River Valley ported from the prototype as a *feature planner*: it emits the feature list, then
  builds with the shared pipeline.
  - No water simulation yet. Sources are placed with sealed mouths (PLAN §7.6), and water is left
    as zeros in the file.
  - Moisture for tree placement comes from the exact moisture rule applied to the planned water
    (a priority-flood estimate), which M2 replaces with the simulation.
- `core/format`:
  - writer and reader (1.1 native writer; reader for 1.0/1.1 voxel maps);
  - C#-style floats, fflate with fixed mtimes, footprints, jpeg-js thumbnail.
- Validation modules with classes and profiles in place: the load class (PLAN §11.1–11.2) and
  the design class (`terrain.max_height`, `terrain.single_floor`), in the `generate` profile
  (§19.5).
- 2D preview (terrain, start, entities, feature outlines with hover labels).
- Download of the `.timber` and of the project file (`.damgoodmaps.json`: spec, features and built
  base).
- `prototype/calibrated.py` aligned with PLAN §5.2 and §5.6 (§4, decision D9).

**Acceptance**
- 50 seeds × 3 sizes pass the Python `validate.py` load checks and `roundtrip_test.py`.
- Identical sha256 in Node and Chromium for 10 seeds.
- Rebuilding from the downloaded project file reproduces the `.timber` byte for byte.
- Removing one ruin field from a document and rebuilding leaves every other feature and entity id
  unchanged.
- 128² generates in < 3 s.
- The contract tests of PLAN §15 that apply (schema, feature round trip, build equality) are
  green.

**In-game check:** A (PLAN §18): load, start, walk test, open in the in-game editor, an Iron
Teeth start. Add F2: sealed river mouth. Deferred (D11): logged as pending in
[docs/ingame-log.md](docs/ingame-log.md) with the files to play.

**Effort:** xhigh.

**Status:** done, 2026-09-24, on branch `m1-core`. Every acceptance criterion passes:
- the Python oracle: 150/150 maps;
- Node = Chromium on 10 seeds;
- the project rebuild and the id stability tests;
- 128² in 85 ms median;
- the contract tests.

The deviations are PLAN §20 D15–D23. In-game checks A1–A5 and F2 are pending.

---

## M2. Water, playability and validation profiles

**Delivers**
- `sim/*`: the exact single-layer water port with golden vectors from the Python prototype.
  - Exact active list, recomputed per substep.
  - The deterministic priority-flood and analytic river pre-fill for the canonical settle.
  - The canonical settle for files (PLAN §19.7).
- Moisture and soil contamination at steady state; pre-filled water, moisture and contamination
  in the file; vegetation placed from simulated moisture.
- All playability checks (PLAN §11.3–11.4), plus the new advisory `plants.drought` check.
- The full check-result shape: class, severity, where, fix.
- The `export` and `import` profiles.
- The TypeScript validator handles every emitter and blocker by its footprint (PLAN §11.5).
- The retry loop; the map card with the validation report; water, moisture and reach layers.
- The water benchmark that fixes the budget in PLAN §10 (target ≤ 3 s for the canonical settle at 256²).

**Acceptance**
- Golden vectors pass, and the game's own save is reproduced within 0.001.
- The Python and TypeScript validators agree check by check on 50 generated maps and on all 19
  official maps (import profile).
- Batch of 100 seeds at 128² Normal: final pass ≥ 98%, first attempt ≥ 60%.
- The 256² settle time is measured, and the budget is recorded in PLAN §10 and "Editor
  decisions".

**In-game check:** B (PLAN §18): pre-filled water, tree survival, the empty-water A/B file.

**Effort:** xhigh.

**Status:** done, 2026-09-24, on branch `dev` (generator 0.2.0). Every acceptance criterion passes:
- golden vectors: the port matches the Python reference bit for bit on 12 fixtures, and 975 ticks
  from empty reproduce the game's own save within 0.001 (0.00096, the same 470 wet tiles);
- validator parity: 0 disagreements on 50 generated maps and on all 19 official maps;
- batch at 128² Normal: 96% on the first attempt, 100% final (100 seeds);
- the canonical settle: a median of 0.39 s at 256² and 0.07 s at 128²; the budget (≤ 3 s at 256²,
  ≤ 0.6 s at 128²) is in PLAN §10 and D33.

The deviations are PLAN §20 D24–D34. In-game checks B1–B4 are pending.

---

## M3. Map document and operations engine (headless), delivery spike

**Delivers**
- `core/doc`: `MapDocument` (EDITOR §3), operations with undo data, undo and redo with
  snapshots, orphan detection.
- Incremental rebuild over dirty regions, checked against a full rebuild.
- Project files that store the generator version and the built base (PLAN §19.6).
- Regeneration with constraints: user features, locks and keep-out regions go into the
  generator's planner (PLAN §7.0), and the conflict rules apply.
- Import of any map, with normalization (PLAN §19.6):
  - 0.6 `Heights`, 0.7, 1.0 and 1.1;
  - `WaterSimulationMigrator` halving;
  - 4-field water;
  - truncation of maps with more than 23 layers;
  - preservation of unknown components;
  - flags for faction-only plants.
- **Delivery spike** (EDITOR §7). A published test artifact checks:
  - a blob Web Worker;
  - reading a local `.timber` from a file input;
  - `downloads.save` of a `.zip`;
  - `sample` with tools on the quick and default tiers, with latency;
  - who can open it on Kyler's plan.

  A test page checks a direct browser call to the Messages API with CORS. The results go to
  "Editor decisions" (D8, D10).

**Acceptance**
- The E1 property tests pass on generated maps of every size preset:
  - random operations, then export, re-import and compare;
  - undo all;
  - incremental equals full.
- Every voxel-format investigation map imports and re-exports its normalized world byte for byte.
- The two 0.6 maps import.
- Generate, add a user feature, change a setting, regenerate: the user feature survives and
  nothing is silently dropped.
- The spike report answers each open question with evidence.

**In-game check:** no. Import normalization is checked in game at M8 (F3).

**Effort:** xhigh.

**Status:** done, 2026-09-24, on branch `dev` (the generator stays 0.2.0). Every acceptance
criterion passes:
- the E1 property tests on 96², 128², 192² and 256², covering all 12 kinds of edit:
  - the incremental rebuild equals a full rebuild after every step, undo and redo included;
  - export, re-import and export again gives the same bytes;
  - undoing everything gives back the generator's own file;
- all 30 voxel-format investigation maps re-export their normalized world byte for byte, and the
  two 0.6 maps import;
- regeneration keeps the player's features and flags every edit that no longer applies, with
  its reason;
- the spike report answers the open questions with evidence.

Two spike questions need Kyler's own run of the published page: `sample`'s latency with tools,
and who can open the artifact. The deviations are PLAN §20 D35–D41, and D8 and D10 are updated.

---

## M4. Shared 3D view and editor shell

**Delivers**
- `render3d`, used by the generator preview (its 3D toggle, from old PLAN milestone 6) and by
  the editor:
  - chunked 32×32 meshing with dirty-chunk remesh;
  - a voxel mesher only for multi-run columns;
  - instanced trees, bushes and ruins;
  - water surfaces;
  - heightfield picking.
- The editor shell:
  - "Refine this map" / "Back to settings";
  - import of any `.timber`;
  - orbit and top-down views;
  - hover readout;
  - feature selection with move and delete handles;
  - the four tabs;
  - history panel;
  - export from every screen (`export` profile);
  - autosave through the storage adapter.

**Acceptance**
- Every investigation map imports, renders and exports unchanged.
- The 3D view builds in < 1.5 s at 256² and orbits at 60 fps on a mid-range laptop.
- Generate → refine → back to settings → regenerate → refine keeps user edits.

**In-game check:** no.

**Effort:** high.

**Status:** done, 2026-09-24, on branch `dev` (the generator stays 0.2.0). Every acceptance
criterion passes:
- all 32 investigation maps open through the page, draw in the 3D view and export unchanged,
  byte for byte;
- the 3D view builds a 256² map in at most 445 ms and orbits at the display's rate, with 0 of
  46,631 frames longer than 1/60 s. This machine is a high-end desktop, not a mid-range laptop, so
  the budget was judged on its integrated GPU with the CPU slowed 4× on a laptop-sized screen
  (D46);
- generate → refine → back to settings → regenerate → refine keeps the player's edits, tested
  through the page.

The deviations are PLAN §20 D42–D46.

---

## M5. Set pieces, land and water tools, slopes, fixes

Set pieces are built once here and used by the generator (River Valley premises) and the editor
alike. This takes the set-piece half of old PLAN milestone 3 and all of E3.

**Delivers**
- The shared set-piece builders (PLAN §19.3), each with `limits`, `plan` and `rasterize`, and
  reports of every reduction:
  - waterfall, in on-river and standalone modes, with the header pool;
  - dam site;
  - gorge;
  - terraced cliffs;
  - badwater basin.

  The ranges are those of PLAN §9.10.
- The generator's River Valley premises switch to these builders.
- Editor tools:
  - landforms with edge styles;
  - rivers with sealed mouths, bed profiles and flow presets;
  - lakes by basin and outlet sill;
  - set pieces with handles;
  - the start with footprint and entrance preview;
  - the dam-site layer.
- Slopes derived automatically after every terrain change, with pin and remove overrides (moved
  here from E4).
- Instant validation on dirty regions, with one-click fixes.

**Acceptance**
- Feature property tests pass; drawn rivers always drain and keep their water.
- Set-piece range tests pass:
  - a 20-wide waterfall fits on 96², 128² and 256²;
  - on 48² it is reduced to 19, with a report;
  - drops above 15 are reduced;
  - lip width is measured as defined in PLAN §9.2.
- Generator batches for River Valley stay ≥ 98% final pass with the new builders.

**In-game check:** C and F1 (PLAN §18). Export three edited maps and play them:
- a 20-wide standalone waterfall at S = 2 and at S = 8, to judge visibility and whether a water
  wheel turns;
- a dam site: build the dam and check the basin fills without leaking;
- a gorge with a stair notch.

**Effort:** xhigh.

**Status:** done, 2026-09-24, on branch `dev` (generator 0.3.0). Every acceptance criterion
passes:
- the feature property tests pass on all four size presets with the new tools among the random
  edits, and rivers drawn in random directions on 96², 128² and 256² maps all drain, carry water
  along their whole course and keep their mouths sealed;
- a 20-wide waterfall keeps all 20 lip tiles wet on 96², 128² and 256², 0.03 deep at 2 water/s;
  on 48² it is reduced to 19, with a report; drops above 15 are reduced to 15; the lip width is
  measured as PLAN §9.2 defines it;
- River Valley's batches stay at 100% final with the builders: 100 seeds each at 96², 128², 192²
  and 256².

The in-game checks C and F1 are skipped for now (D11): the files are in `out/m5/`, and the checks
are pending in [docs/ingame-log.md](docs/ingame-log.md). The deviations are PLAN §20 D47–D56.

---

## M6. Full settings, sharing, themes I

**Delivers**
- The full settings panel (PLAN §5), with reference bands and the feasibility guards: drought
  reserve against map size (§5.3), and waterfall and set-piece limits.
- The URL codec for the full `MapSpec`, and share links (spec only, decision D7).
- Canyon and Lake Basin as feature planners; the badwater settings (§5.4), placing the badwater
  basin builder from M5 (§9.5).

**Acceptance**
- Each setting moves its measured target in batch runs (a test per setting).
- Share links reproduce byte-identical files.
- Batch per theme ≥ 98% final pass.

**In-game check:** short. One Canyon and one Lake Basin map load, and their dam site holds.

**Effort:** high.

**Status:** done, 2026-09-24, on branch `dev` (generator 0.4.0). Every acceptance criterion
passes:
- each of the 27 settings experiments moves its measured target (`tests/contract/settings.test.ts`,
  and `tools/settings-batch.ts` on 20 seeds at 96² and 10 at 128²); at 192² all but Buildable
  land's flat share do (it moves 0.029, walkable land moves 15,606 tiles);
- share links reproduce the same bytes in Node and through the page in Chromium, in all three
  themes;
- 100 seeds per theme at 96², 128², 192² and 256² pass 100% final (River Valley, Canyon, Lake
  Basin); Easy and Hard at 128² pass 100% too.

The in-game check is skipped for now (D11): the files are in `out/m6/`, and checks M6-1a to M6-1c
are pending in [docs/ingame-log.md](docs/ingame-log.md). The deviations are PLAN §20 D57–D68.

---

## M7. Resources, map objects, themes II

This combines old PLAN milestone 5 and E4.

**Delivers**
- Editor resources: forests, berry patches and ruin fields as areas, with a survival preview.
- Editor map objects:
  - mine sites (UndergroundRuins), relics and geothermal fields;
  - thorn belts, weirs (NaturalDam) and plugs (Blockage), and the plugged spillway;
  - the badwater toggle with its warnings.
- Advanced mode: individual entity placement with footprint preview, and numeric fields,
  including delayed sources.
- Generator: Highlands, Delta and Islands; the second district; obstacles with payoff; NaturalDam
  weirs; plugged spillways; thorn belts; relics; geothermal fields; mine sites.

**Acceptance**
- Resource areas respect moisture reach and the calibrated clustering.
- Invalid placements are previewed and refused.
- Every new object passes the placement emulation.
- Batch per theme ≥ 98%.

**In-game check:** D (PLAN §18). The objects load with no loading issues, and demolishing a
spillway plug releases the water.

**Effort:** high.

**Status:** done, 2026-09-24, on branch `dev` (generator 0.5.0). Every acceptance criterion
passes:
- resource areas: a drawn forest plants trees only where its preview showed them alive (moist,
  clean soil), bushes only on moist ground, and ruin areas become fields of one level, 10+ columns,
  in the official shape (`tests/contract/objects.test.ts`, `tests/e2e/objects.spec.ts`);
- invalid placements: the footprint under the pointer is red with the game's reason, and the same
  rule refuses the click, the tools and `placeEntity` (contract and browser tests);
- placement emulation: `entities.placement` and `extras.placement` pass on every generated map of
  the six themes and on the editor's objects; the oracle shows 0 disagreements between the TS and
  Python validators on 50 generated and 19 official maps;
- 100 seeds per theme at 96², 128², 192² and 256² pass 100% final (River Valley, Canyon,
  Highlands, Lake Basin, Delta, Islands); Easy and Hard at 128² pass 100% too.

The in-game check is skipped for now (D11): the file is in `out/m7/`, and checks D1–D5 are pending
in [docs/ingame-log.md](docs/ingame-log.md). The deviations are PLAN §20 D69–D83.

---

## M8. Water preview and background validation in the editor

**Start requirements, built first** (Kyler, 2026-09-24, amended the same day; PLAN §5.6, §11.4,
§20 D85). Released with `m8-done`. Amended by Kyler on 2026-09-25 and built in the start and edge
rules step (`docs/progress/start-edge-rules.md`): the water rule walks over the map's own slopes
(D153), and starting wood counts logs (D164). The requirements as they stand:

Three start requirements, with thresholds by difficulty (Easy / Normal / Hard). They replace the
start rules as reasons to reject a map:
1. **Water without stairs.** Clean pumpable water (depth ≥ 0.3, contamination < 0.05) touches a
   shore tile the start reaches on foot within 12 / 20 / 28 tiles' walk, over the map's own ground
   and its natural slopes (the map's Slope entities; no stairs the player would build). Levels may
   change along the walk, through slopes. Rivers, lakes and ponds all count. A pump on that shore
   must reach the water surface (0–2 levels below the shore), so the colony can actually drink
   it. (As built in M8, the walk stayed on the start's own level, without any slope.)
2. **Starting wood** (D164): at least 120 / 80 / 40 logs of grown trees within 20 tiles' walk of
   the start (slopes allowed), each tree by its species' yield (oak 8, pine 2, birch 1), alive or
   dead. A sapling's logs are shown apart, as wood still growing. (As built in M8: 60 / 40 / 20
   living trees.)
3. **Starting bushes:** at least 40 / 30 / 20 living berry bushes within 20 tiles' walk of the
   start (slopes allowed), counted across any number of patches.

"Living" means the plant survives at steady state, as now.

- **The thresholds are player settings,** with these defaults for each difficulty: the existing
  water-distance start rule (`sw`, 4–40), and the Advanced start rules controls
  **Minimum starting wood (logs)** (`sl`, 0–800; before D164 **Minimum starting trees**, `st`,
  0–400, which old links and project files still carry and open as 2 logs a tree) and **Minimum
  starting bushes** (`sb`, 0–200). Changing **Designed for** resets them to that difficulty's defaults (D66, as before).
  Imported maps, which have no settings, use their difficulty's defaults (Normal unless the
  document says otherwise).
- **The generator never aims below a minimum.** Any target that sits lower rises to it: Easy's
  Berries near start target goes from 20 to 40.
- **The start reaches water on its own level** (as built in M8, D97: the bench ran to the bank).
  The workshop study found none on 82 of 180 generated maps at 128²: the bench stands one level
  above the floodplain, 6–10 tiles from the channel (D26). Since the amendment (D153) the
  bench no longer runs to the bank: the colony walks down to the river over the map's own slopes,
  and the slope out of the start's own level goes toward the river. Batches stay ≥ 98% per theme
  with the new rules.
- **Everything else:** the other start rules stop rejecting maps: the badwater and ruin
  distances, stored drought water near the start (`water.reservoir`, including Hard's 3-deep
  rule) and walkable land from the start (`start.reach`). They stay as settings and generation
  targets: the generator still aims for them, their controls and share-link keys keep working,
  and the map card shows an advisory warning when a map misses one.
- **Badwater distance defaults become 30 / 15 / 8** (the workshop study's W4, decided by Kyler),
  as generation targets with an advisory warning; they never reject a map. The range widens from
  12–60 to 8–60 (the Hazards setting `bd` and the start rule `sx`), so Hard's 8 fits and old
  links still decode.
- **Unchanged:** the load checks the game needs (the start's footprint on flat ground, a free
  entrance, exactly one start), and the water checks that aren't about the start (settling,
  outflow, badwater containment).
- **Build rules:**
  - Change both validators together (TypeScript and the Python oracle), with 0 disagreements.
  - A unit test for each requirement: water beyond the walking distance fails; only badwater
    fails; trees or bushes below the minimum, or too far away, fail; changing any of the three
    settings moves the result. As M8 built it, water reachable only by a slope failed; since D153
    water down a natural slope passes and water that needs stairs fails, and since D164 wood below
    the minimum fails, each species counting its own logs.
  - The three settings have a measured target in `tools/settings-suite.ts`, like the M6 settings
    (the water distance's experiment measures the walk; since D153 over the map's own slopes).
  - The editor's start indicators and its green or red footprint follow the three requirements,
    using the map's settings. The map card lists them.
  - This changes which attempt wins and where the start stands: bump the generator version and
    note that old share links change.
  - Report batch pass rates per theme at the defaults; first-attempt rates should rise.

Its acceptance:
- Both validators apply the three requirements and the advisory targets, with 0 disagreements on
  the full oracle (50 generated and 19 official maps).
- The unit tests above pass, and the three settings move their measured targets.
- Every accepted map's start reaches water on its own level, and batches per theme are ≥ 98%
  final at the defaults (100 seeds at 96², 128², 192² and 256²), with the first-attempt rates per
  theme reported beside M7's.
- The editor's start indicators, its footprint and the map card follow the requirements (a
  browser test).

From the workshop study (D87):
- The data behind the requirements: `workshop.json` `overall.start*`, measured by
  `lib/measures.ts` (`startStats`: walking distance on one level, diagonals when both neighbours
  are level, slopes as links). Kyler took the study's water distances (12 / 20 / 28) and set their
  own tree and bush thresholds; the study proposed 60 / 20 / 10 and 40 / 25 / 15
  (decisions-pending #39, decided).
- Report how many of the 11 official starts the study could measure meet the three requirements
  at Normal.

**Also first: editing generated outlines that leave the map** (decisions-pending #30). Generated
features' outlines may run up to one map side past each edge (the schema's bound since the Lake
Basin reopen fix); they are clipped to the map when rasterized, and the editor can change and
lock them. Today `featureGeometryProblems` (`src/core/doc/ops.ts`) refuses them ("the landform's
outline leaves the map"), so a Lake Basin terrace ring or a highlands landform that reaches past
the edge can't be edited or locked. Outlines the player draws stay inside the map. Acceptance: such
a ring can be edited and locked, and an unedited map's bytes don't change.

**Delivers**
- The worker simulation with warm-start re-settling after edits.
- Detection of roofed water: the file's water is kept there, with a "preview approximate"
  overlay.
- Background full validation, debounced and cancellable.
- Export rules for errors and warnings; the canonical settle on export, with progress.
- Moisture and badwater overlays; the analytic drought view.
- From the workshop study (D87):
  - Maps whose water a steady state cannot show are recognised on import
    (`analysis/mechanics.ts`): caves on 5% or more of tiles, delayed sources, aquifers or seeps
    carrying a quarter or more of the clean water (seeps half of the running water), or a start
    under a roof. Their water and start checks report "approximate" with the reason, in both
    validators, and the preview shows the file's water there (the roofed-water rule already does
    this for caves). Decisions-pending #36 (W6); the rule as written in
    `investigation/workshop/lib/measures.ts` (`mechanics`) and `lib/table.ts` (`waterReliable`).
  - Set pieces and lakes that reshape the ground clear the map objects standing on it, as they
    clear trees, ruins and bushes (`clears`), or the objects move to the new ground and are
    checked again (EDITOR_PLAN §3). The recipes found it: a standalone waterfall or a lake drawn
    beside a relic, a geothermal field or a mine site left the object floating
    (`entities.placement`, `extras.placement`) in 16 attempts over 46 runs of the twin-falls and
    oxbow recipes.

**Acceptance**
- Validation parity between editor and generator.
- A local edit re-previews in ≤ 2 s at 256².
- The export of an unedited generated map equals the generator's own file byte for byte.
- Hollows, Pressure, Oasis and Nomads report their water checks as approximate with a reason; the
  other 15 official maps are unchanged. (Kyler took Beaverome off the list on 2026-09-25, PLAN §20
  D107: its water is modelled correctly and none of the causes applies.)
- A property test places standalone waterfalls, lakes and landforms beside every kind of map
  object on generated maps: no object is left floating.

**In-game check:** compare the preview with the game on three edited maps, including one
imported official map with roofed water (F4) and one pre-1.0 workshop map (F3). Record the
differences in "Editor decisions".

**Effort:** xhigh.

**Status:** done, 2026-09-25, on branch `dev` (generator 0.6.0). Every acceptance criterion passes,
the approximate-water item as amended by Kyler (D107):
- start requirements: both validators apply them, with 0 disagreements on the full oracle (50
  generated and 19 official maps); the unit tests pass and the three settings move their targets;
  every accepted map's start reaches water on its own level, and 100 seeds per theme at 96², 128²,
  192² and 256² pass 100% final, 94–100% on the first attempt; the browser test passes; 5 of the
  11 measurable official starts meet all three at Normal;
- a generated ring past the map edge is edited and locked, and the unedited map's bytes stay;
- validation parity: the editor's verdicts after a warm-started preview equal the generator's
  validator on the exported file;
- a local edit re-previews in at most 1.76 s at 256² (Node, six themes) and 1.66 s in Chrome;
- the export of an unedited generated map equals the generator's file byte for byte;
- the property test leaves no object floating;
- Hollows, Pressure, Oasis and Nomads report approximate water, with the reason, and the other 15
  official maps are unchanged. Beaverome was on the list as first written; Kyler took it off
  (D107, decisions-pending #48).

The in-game check is skipped for now (D11): the River Valley file is in `out/m8/`, and checks
M8-1a to M8-1c are pending in [docs/ingame-log.md](docs/ingame-log.md). The deviations are PLAN §20
D97–D106.

---

## Map look

After M8 and before M9 (Kyler, 2026-09-24; PLAN §20, D86). The 3D view should look much closer to
Timberborn in game, while every map meaning stays readable. It changes no map files:
`src/core/render/shade.ts` (the 2D preview and the thumbnail) stays exactly as it is, and every
sha256 stays equal.

**Appeal matters as much as readability** (Kyler, 2026-09-25; PLAN §20 D135). The default view is
a clean look as close to the game as possible, in which the core meanings still read. An
information layer, off by default, carries the marks and the enlarged objects.

**Why:** Kyler's screenshot of the current 3D view is hard to read. The ground is coloured by
height, while the game colours it by moisture. There are no shadows or ambient occlusion. Water is
flat: badwater in its open ditch looks like a brown dirt ramp. Ruins are grey pillars, and the
district center is a small box.

**Delivers**
1. Ground tops coloured by moisture as in game: moist ground green; dry ground cracked earth, the
   cool grey-brown of Kyler's reference, not reddish brown (D135; it replaces D110's warm
   grey-brown); contaminated soil with its own look. A toggle switches back to height colours.
   This changes the 3D view's colour meaning from height to moisture (approved by Kyler, D86).
2. Height shown on the block walls: layered bands per level, so levels can be counted.
3. Baked ambient occlusion and soft sun shadows, computed when the mesh is built.
4. Warmer colour grading and light depth haze.
5. Water: colour and opacity by depth; a gently moving surface; foam on waterfalls and at
   shorelines; badwater as dark murky water, clearly water and clearly not clean.
6. Models: trees by species (pine, birch with white trunks, oak, succulent), with dead trees
   clearly dead; berry bushes; scrap-heap ruins instead of pillars; a recognisable district
   center of our own design.
7. A default camera angle closer to the game's.
8. **A clean default look** (D135): slopes drawn as ramps; dead trees as pale bare trunks at their
   true size; no hazard tape, no arrows, no inflated objects.
9. **An information layer** (D135), off by default, turned on by a toggle or by a tool that needs
   it: the dam-site marks, the slope arrows, and objects enlarged from afar (D114, D115).

**Rules**
- None of the game's models, textures or art. Everything is our own, and any textures are
  generated in the shader, so the artifact edition needs no image files.
- The M4 budgets (`npm run bench:3d`: build under 1.5 s at 256², and 60 fps on the integrated GPU
  with the CPU slowed 4×, including Beavertopia, D46) are information (D115).
- In the clean view the core meanings read in colour, in greyscale and under colour-blindness
  simulation: water and badwater, badwater meeting clean water, moist, dry and contaminated
  ground, living and dead trees, the start. The strict readability rules (slopes and their
  direction, dam sites, objects far off) apply to the information layer.
- The 2D preview keeps its height colours, and the 3D view's legend and hover text say what the
  colours mean.
- The 3D chunk stays lazy-loaded, and its size is reported.

**Acceptance** (Kyler's one rule, D115; the gate of D135)
- Blocking:
  - no map file changes: every sha256 stays equal, and every existing test passes unchanged;
  - **Kyler approves the appeal** from the clean view's captures of the same maps (seed 4242 in
    every theme, one 256² map and Beavertopia), beside Kyler's reference screenshots
    (`C:\dgm-reference\`, local only) and, once they exist, beside the DGM Probe's in-game shots
    of the same maps. No blind review. `map-look-done` waits for that approval.
- Information: the captures' greyscale and colour-blind versions and the information layer's
  captures, for Kyler; the 3D budgets.

**Reference:** Kyler's in-game screenshots ([docs/ingame-log.md](docs/ingame-log.md), ML-1) arrived
on 2026-09-25 and tuned the colours, lighting, water and models. They stay on Kyler's machine:
never ship game screenshots.

**Not in this step:** the workshop study's naturalness targets for generated terrain (straight
steps, shorelines, ridge crests). Map look changes no map file, so they go to the refinement phase
(decisions-pending #40).

**In-game check:** no; the reference screenshots are Kyler's. The DGM Probe's in-game shots of the
same maps join them once they exist (P-ML in [docs/ingame-log.md](docs/ingame-log.md)).

**Effort:** high.

**Release:** inside the M9 release, or tagged `map-look-done` and released like a milestone
(CLAUDE.md, Deploying), once Kyler approves the clean look (D135).

**Status:** done, 2026-09-25: **Kyler approved the clean look** (D135), and `map-look-done` is
tagged and released. The default view is the clean look, close to the game; an information layer
(**Markers**, off by default) holds dam sites, slope arrows and enlarged far-off objects; the
water is the game's deep teal to navy with clear shallows, and the grass a muted, yellower green
(see [docs/map-look/CLEAN.md](docs/map-look/CLEAN.md)). The generator stays 0.6.0; no map file
changes. History of the rounds before the clean look:
Tuned to Kyler's in-game reference (ML-1), which corrected Delivers 1. The first independent review
of the captures failed on ten findings (fixed in D114), the second narrowly on four (fixed in
D115); Kyler judges the look from the new captures (no more blind reviews), and the 3D
benchmark is information only:
- before and after captures of seed 4242 in every theme, River Valley 4242 at 256² and
  Beavertopia, from the same camera poses, with greyscale and colour-blind versions of every
  after pose; [docs/map-look/captures.md](docs/map-look/captures.md) says where each meaning is;
- the 3D view builds a 256² map in at most 626 ms and orbits at 100 fps or more, Beavertopia
  included, on the integrated GPU with the CPU slowed 4×;
- no existing test changed; all pass in CI, and locally but for one timing budget that a busy
  machine pushes over for the second round's code too; every sha256 stays equal.

The deviations are PLAN §20 D110, D114 and D115; decisions-pending #49 (the default camera).

**The clean-look round** (D135) is being built on branch `look/clean`: the clean default view and
the information layer. Kyler approves the look from its captures; `map-look-done` waits for it.

**Fix rounds after the clean look,** each on its own branch, judged by Kyler from before and after
captures and released under its own tag; rendering only, so the map files don't change:
contaminated ground as a layer (D154, `look-contamination-done`, released); badwater blending
smoothly into clean water, with #38's approved crimson badwater and a warm tint for partly bad water,
in one shared water palette (D177, `look/badwater-blend`, `look-badwater-done`); and mine sites and
ruins as models of our own (D178, `look/mine-site`, `look-mine-ruins-done`); and waterfalls with shape and
volume (D201, `look/waterfalls`, `look-waterfalls-done`): falls that leave the lip and arc down as
a translucent ribbon, foam at the lip, whitewater below, cascades as small falls.

---

## Real places

A small step right after Map look is released (Kyler, 2026-09-25; PLAN §20 D136).

**Why:** the landscape survey (`investigation/landscapes/`, PR #16) turned 88 real terrains into
playable, validated maps. Players can play them as they are, or refine one in the editor.

**Delivers**
1. A gallery of the survey's 88 playable real-terrain maps (`investigation/landscapes/library/`).
   Each card shows our own render, its name ("Near Yosemite Valley"), its landform family, size
   and scale, and a short plain line about how it plays, from the existing analysis.
2. Download the `.timber` (with pre-filled water), or open it in the editor to refine it.
3. Every map is built through the existing pipeline (build, settle, validate, write), so its file
   is always the same bytes.
4. Attribution per `investigation/landscapes/ATTRIBUTION.md`, on the gallery page and in each
   map's in-game description: derived from public elevation data, not an exact copy of the place.
5. Kept separate from the generator: real places are content, never templates (the product
   principle, D108).

**Acceptance** (blocking): only that every map passes the validators and exports, and that the page
works on desktop and on a phone.

**In-game check:** optional. When the probe is available, Kyler may approve a batch that loads a
few of them in the game (D117).

**Effort:** high.

**Release:** tagged `real-places-done` and released like a milestone (CLAUDE.md, Deploying).

**Status:** done, 2026-09-25 (PR #23; `real-places-done`). A gallery of 85 real places (the survey's 88
minus its three random-land controls), reached by **Real places** at the top of the generator: our own
top-down render of each map with its settled water, its name, landform, size, scale and a "how it
plays" line; **Download** builds the `.timber` in a worker, with progress; **Refine** opens it in the
editor. The page and every map's in-game description say it is inspired by the land near its
namesake at Timberborn's scale, not a replica, with the full attribution. Every map passes both
validators and is byte-identical in Node and Chromium; the page works on desktop and phone. See
[docs/progress/real-places.md](docs/progress/real-places.md).

---

## Start and edge rules

A small step after Real places (Kyler, 2026-09-25; PLAN §20 D151–D153), built on branch
`feature/start-edge-rules` and released as `start-edge-rules-done`:
- **No edge walls** (D151): a blocking check, in both validators, beside D111's dam-wall check; the
  generator raises no wall along a map edge.
- **Maps don't have to hold their water** (D152): no walls or rims to keep water on the map; rivers
  leave naturally and lakes may drain; the settle check accepts a steady flow off the map.
- **Water sources start rivers** (D171): sources only at river heads (map-edge inflows, springs at
  valley heads and below ridges), clustered at the head for more flow, never inside an existing
  flow; a check flags any source inside one.
- **The start water rule** (D153): clean water counts if a walking path over the map's own terrain
  and natural slopes reaches a pumpable shore within 12 / 20 / 28 tiles; both validators, the
  editor's start indicators and the start text change together. Generated maps change: the
  generator version goes up.
- **Starting wood** (D164): the logs of the grown trees within 20 tiles' walk, by species, replace
  the tree count; **Minimum starting wood (logs)**, with saplings' wood shown apart as growing, and
  the page reading a tree's growth correctly (before and after captures of saplings for Kyler).
- **Tall maps** (D172 (1), after probe run 20260925-tall): both validators allow heights up to 22,
  with a note above 16 that the in-game map editor edits only up to level 16.

**Blocking:** breakage (batches ≥ 98% final per theme and size, byte checks, crashes), D111 and
D151, and what a player feels.

**Status:** built on `feature/start-edge-rules` (docs/progress/start-edge-rules.md), a PR into
`dev`; generator 0.6.1.

---

## Real places, second round

After the start and edge rules (Kyler, 2026-09-25; PLAN §20 D155–D157), built on branch
`feature/real-places-2` and released as `real-places-2-done`: short in-game descriptions with a
link to a credits page; the maps built at deploy time and served as finished files; the byte check
nightly and in the release check; clean titles; 3D thumbnails rendered on a GPU and lazy-loaded;
every place rebuilt without perimeter walls, water free to drain; and the gallery grown to about
150 places. Kyler sees a contact sheet of the whole gallery and says if any should go.

**Blocking:** every map passes the validators and exports, the page works on desktop and phone,
and D151 (no edge walls).

**Tall places** (D172): Real places and Pick a place get a height option, standard (up to 16) or
tall (up to 22, top layer empty); dramatic places default to tall. Tall versions come in the round
after a probe batch confirms maps above 16 load and keep their terrain, water and objects; each
tall map's description notes that the in-game editor only edits up to level 16.
---

## Resources like the official maps

A step after the start and edge rules (Kyler, 2026-09-25; PLAN §20 D167–D170), built on branch
`feature/resources`: the official maps' measured baselines by size (trees with their living and
dead share and species mix, groves and berry patches, ruin scrap, heights, field shapes and
variants, mine sites), leaving out exceptional maps; one shared resource baseline in `src/core`
used by the generator, Real places and Pick a place; at least one mine site on every map (a
blocking check; the Mine sites setting 1–4); trees, bushes and ruins in natural clusters within
the official ranges, varying from map to map. Generated maps change (a generator version bump).
Real places rebuild on it in their second round.

**Blocking:** breakage (batches ≥ 98% final per theme and size, placement passes the game's rules,
byte checks) and the mine-site guarantee. Resource amounts in or out of the official range are
information.

**Status:** built on `feature/resources` (docs/progress/resources.md), PR #43 into `dev`, merged
with the start and edge rules; generator 0.6.2.

---

## Badwater on every map

A small step right after Resources like the official maps, and before the Real places rebuild
(Kyler, 2026-09-26; PLAN §20 D200), built on branch `feature/badwater-source`:
- at least one permanent badwater source on every map (generated maps, Real places, Pick a place),
  a late-game resource like the mine site;
- placed naturally (a spring in a hollow or side valley, never at random), at the per-difficulty
  distance targets from the start (30 / 15 / 8 tiles);
- count and strength like the official maps for the map's size, measured from the official maps
  (first checking whether every official map has one);
- a check in both validators, like `resources.mine_site`.
- **No badwater**, an explicit option in the badwater setting for peaceful maps (the default is always
  at least one source): no badwater sources are placed, badtides still happen, and the share link and
  the map's description record the choice; generated maps, Real places and Pick a place respect it.

**Blocking:** breakage (batches ≥ 98% final per theme and size, byte checks), and every map having its
badwater source. Generated maps change (a generator version bump and a contact sheet, D144).

---

## Live editing

Alongside the M9 design, and the most important feature before M12 (Kyler, 2026-09-25; PLAN §20
D158, D179–D184). Built on branch `feature/live-editing`, tried by Kyler on the preview address
<https://timbermods.github.io/dam-good-maps/preview/> (noindex; refreshed after every push), and
released as `live-editing-done` when Kyler says it feels right.

**Before `live-editing-done`** (Kyler, 2026-09-26; D212): sources move to the left shelf as two items after
Start (Water source, Badwater source); clear water only under or around the brush when it's over water,
and still reading as water (a faint blue tint, ripples, a soft bright shoreline). Then released. Next:
Carve, Craterize, Erupt and Quake (with both Lift and Slide) merged and built as buttons on one shared
forces core (D216, D219), put on the preview, and released only after Kyler has tried them. Both
changes are built, and Carve is on the preview (`docs/progress/live-editing.md`).

**The design** (D184, Kyler's editor design principles; it replaces earlier editor decisions where
they conflict):
- **Principles:** the land is the interface (feedback from the land itself, not from panels,
  dialogs or readouts); direct manipulation; few tools, each obvious; smart defaults, with options
  hidden until wanted; forgiveness (instant undo, Esc always backs out); one grammar (pick, paint or
  place, see the result; [ and ] for size, Shift+scroll for strength, in every tool; plain scroll
  always zooms, Alt+scroll slices the visible layers, as in the game, D196); things just work (painting never waits on water and keeps
  full frame rate on 256²); landforms come from the brushes, never from buttons (D182);
  desktop-first: a desktop screen, a mouse or a drawing tablet, and a keyboard (D185).
1. **Top bar:** the shaping tools, Raise, Lower, Flatten, Smooth, Naturalize | the forces (Carve,
   Craterize, Quake, Erupt; a visually distinct group, D203, D206) | Remove (the sources are on the
   left shelf, D212). Every force's options row starts with its mode switch. The forces go to the
   preview and are released only after Kyler has tried them (D219): until then the public site shows
   no forces group (one switch, `src/editor/release.ts`). Erupt raises a volcano (Vent or Fissure,
   Power, Steep or Broad, a summit, flows, Try
   another); built from `investigation/erupt` once Kyler says it's ready. Quake splits the land along a drawn fault (Lift
   or Slide, Power, Sheer or Stepped scarp, Try another); built from `investigation/quake` once Kyler
   says it's ready. All four forces share one forces core.
   Craterize (D202) simulates a giant impact (Strike or Aim, Power, Size, walls, centre, debris, Try
   another); built from `investigation/craterize` once Kyler says it's ready. A small row
   beneath shows only the picked tool's options. The size ring is drawn on the land; strength shows
   only while Shift+scrolling. Toggles, off by default: square shape, precise mode, straight lines,
   level lines. Flatten has "in steps" (terraces); Smooth has "make walkable" (the game's natural slopes;
   the start's reach updates live). Select opens with a key or a modifier-drag, with no permanent
   slot. Pen pressure sets strength on a drawing tablet.
   Hold to dig (D193): in precise mode, holding Lower or Raise keeps working a level at a time,
   with an optional "stop at" level (a faint plane, a pulse on arrival); never below the map's bottom
   or under placed objects.
   Flatten (D204) starts from the stroke's own height, cuts and fills, has Cliff or Ramped edges,
   hints where the start fits, and carries trees and objects with the ground.
   Hold F to resize the brush by dragging (D205); the camera's old R and F zoom are gone (D212).
2. **Water:** a reflection of the land being painted.
   - **Smart Lower:** a stroke that starts in or next to water carves a bed that keeps flowing
     downhill, so the water follows the brush; the ring turns softly blue. Anywhere else it is an
     ordinary Lower.
   - **Water source and Badwater source** (D212): on the left shelf, right after the start; click
     to place, and water spreads at once; the row beneath sets the next one's strength.
     Shift+scroll over any source changes its strength live (a friendly note past the official
     range, never a block); drag to move it; a click selects it (its strength, clean or bad,
     Remove); Delete or Remove makes its water recede. Anywhere in the editor (D171 is for generated
     maps). Always findable, even underwater (an upwelling; a marker with its strength when near or
     with a source picked on the shelf; Markers shows all) (D196).
   - **Water is never an object** (D196): no river selection, panel or deletion; flow and clean or
     bad belong to sources; generated rivers are their sources and land. Hovering water shows its
     depth, bed level and contamination, and highlights the sources feeding it.
   - **Seeing underwater** (D196, D212): only the water under and right round the brush turns
     clear, and only while the brush is over water already there (painting a submerged bed); on
     dry land the water stays as it is. T or **Clear water** clears all of it. Clear water still
     reads as water (a faint blue tint, its ripples, a soft bright shoreline); badwater stays
     distinct, for colour-blind players too.
   - **Everything else emerges:** lakes fill hollows, waterfalls form at drops, rivers join where
     they meet, and branches form wherever the land is cut from water.
   - **How water behaves:** water near an edit moves within a frame or two, then the rest of the
     map; a speed control (slower, normal, faster, instant; brisk by default: small edits settle
     nearby in a second or two) (D197); the journey with pause, skip, replay and follow; the
     Drought and Badtide buttons, each showing what that event looks like on this map (the game's
     badtide rules, from `investigation/cycles`; the whole cycle's timeline is the separate
     Weather view, D186); moisture spreading as the land greens; optional sounds of our own. The
     final water is always the game's settled result, at any speed.
   - **Carve** (D194, D216): a force of nature, the first of the forces group (key 7): Unleash and
     Aim modes, Defy gravity, a Power slider from creek to catastrophe; it forms gorges and valleys
     (D181). Built from `investigation/carve` (#47), keeping its full feature set (D199): Width,
     Wander, variation (bends wider and deeper on the outside, narrower on the straights), Try
     another path, Steep or Wide walls, Keep river or Dry canyon, oxbow lakes sealed by sediment, a
     following camera with carving effects, Space to pause, Stop, Esc or Ctrl+Z to undo it
     instantly. On the preview until Kyler has tried it (D219).
3. **Left shelf:** a clean grid of icons, each a small render of the object in the map's look: the
   start, the water source and the badwater source (D212), pine, birch, oak, berry bushes, ruins,
   the mine site, relics, natural slopes, blockages, geothermal fields and thorns. Picking one shows a live ghost on the terrain, its footprint green
   where it fits and red where it doesn't, with a quiet reason ("needs flat ground"). Click places,
   R rotates, Esc puts it back. Trees and bushes: click places one, drag paints many, naturally
   clustered at official-like densities.
4. **View buttons:** Orbit, Top-down, Reset view, Height colours, Markers, and the overlays
   (moisture, contamination, drought). The legend appears only while an overlay is on.
   Visible layers exactly as in Timberborn (D207): a compact layer widget (∞ until used), slicing
   that hides everything above the level, the layer pick, and tools that act on the visible land.
   Also (D205): a corner minimap (on by default at 256², a toggle among the view buttons), small
   satisfying feedback on every action with quiet sounds (on by default, with a volume and an off
   switch, D212) and reduced-motion support, and camera bookmarks (Ctrl+Shift+1–9 to save,
   Shift+1–9 to glide back). The layer pick is Alt+middle-click (the game's) and Alt+click.
5. **Header:** Undo and Redo icons with their shortcuts; one primary button, **Save to Timberborn**
   (merged in #40; in browsers that can't save to a folder, **Download .timber** takes its place);
   everything else (Open, Save project, Download .timber, History, New map) in one small menu.
6. **Quiet checks:** a small dot, green or amber; a click lists the problems, each highlighted on
   the map. Never a pop-up.
7. **The start:** its water, wood and berry reach appears around it while hovered or dragged, then
   fades.
8. **Remove:** click one, drag many; filters; a red highlight on hover; Delete removes a selection;
   one undo step each; water re-flows live; never changes terrain; a removal that breaks a rule is
   refused live; instant on 256².
9. **First run:** three one-line hints (paint the land, place things, add water), then never again.

<!-- retired-terms:allow -->
**Removed:** the landform tools and their handles (D182); the river tool with its start and end
rules, Natural or exact, width, depth and strength controls; the lake click-fill; the Channel tool;
separate plant brushes; the cursor readouts (only the level number while flattening stays); the
text tabs, the Advanced checkbox, the Show dropdown and the help paragraphs.
<!-- /retired-terms:allow -->

**Kept:** the smooth camera (D180, approved by Kyler); every edit live, as one undo step, with
limits shown while dragging, never dialogs afterwards (D179); the Select tool (rectangle, freehand,
same level; Shift adds, Alt subtracts; raise or lower by N levels, flatten or set to a level, dig
out, clear trees and objects); Ctrl-click samples a level (on water, its bed); heavy operations
(regenerate an area, "Generate, keeping my edits") shown growing, never a frozen wait; every stroke
an operation that replays exactly and survives regeneration and format 3; only changed chunks
rebuilt; keyboard access and screen-reader labels; saved projects keep their land exactly (any
landforms already in a project open as plain terrain); Keep M12 ready (D134): Claude tool entries
for every tool, as brush-style operations (strokes, sources, placements, Remove, the Select tool's
actions), never landform objects (D187). Until the Frame pass, new interface uses the existing
shared styles and components (D176).

Built in pushes, water first, each put on the preview for Kyler.

**Blocking:** responsiveness (visible within one or two frames of the input; the display's frame
rate while painting on 256²; no main-thread stalls; cancel, undo and tool switches at once), and
breakage (strokes replay exactly; undo and redo always correct; nothing crashes; no edit lost; after
any edit the water ends exactly at the settled result, so exports are unchanged). Kyler decides when
it feels right.

**Later:** every future editing tool is live and brush-first from the start (D179, D182): M10's
symmetry mirrors strokes live, M11's stamps are painted onto the land, and the 3D terrain steps
extend the same brushes to caves and tunnels.

---

## Save to Timberborn

A small step, soon (Kyler, 2026-09-25; PLAN §20 D162), the first half of one-click play. A **Save
to Timberborn** button: using the browser's folder access (Chrome and Edge), the player picks
`Documents\Timberborn\Maps` once, the site remembers it, and the button saves the map straight
there, from the generator page, the editor's export and the Real places gallery. Other browsers
keep the normal download with install help. Released as `save-to-timberborn-done`.

**Blocking:** breakage (the saved file is the same bytes as the download; nothing else in the folder
is touched) and what a player feels (one click, clear feedback, a plain fallback).

---

## M9. Interestingness, names, candidates, premises and variety

**M9 design step first** (Kyler, 2026-09-25; PLAN §20 D108, D109). M9 is not built as written
below until Kyler approves a design that meets the product principle (PLAN, Product principles):
Dam Good Maps creates maps, never approximations of existing ones and never a few archetypes with
a little noise, and two maps must play differently, not only look different.

1. **`docs/m9-design.md`: a generator that invents.**
   - Composition: parts with continuous parameters that combine by rules, so combinations nobody
     authored appear: the river network (count, sources, confluences, splits, loops, direction),
     relief at several scales (plateaus, basins, ridges, mesas, escarpments, terraces), the water
     systems along it (lakes, falls, marshes, springs), hazards and landmarks.
   - Emergence: macro terrain from deterministic processes (for example warped noise, uplift and
     erosion, snapped to game levels), rivers from the terrain's drainage, and dam sites, falls and
     lakes found where the terrain makes them, not stamped. Say how this meets the naturalness
     refinement note.
   - Inspiration beyond maps: real geomorphology (canyons, deltas, calderas, oxbows, karst,
     fjords, badlands, mesas, braided rivers, alluvial fans, and more); Timberborn's mechanics as
     sources of decisions (droughts and badtides, water physics, dams and floodgates, vertical
     building, contamination); play design (trade-offs, risk and reward, pacing, frontiers,
     surprise); playful, whimsical forms that still read as landscapes.
   - The named premises below become at most a few recipes inside this system, never the space
     itself. Interest is judged intrinsically (the objective measures, play variety, DGM Probe
     batches, and Kyler's own look when Kyler chooses; never a score fitted to ratings, D137),
     never by similarity to workshop maps. The workshop's bands are a sanity range for
     playability; Variety may go beyond them where the checks pass.
   - Keep M9's good parts: 8 flow directions, the Variety setting and Surprise me, no clones, the
     score and names. Keep every guard: batches ≥ 98% per theme and size, determinism (exact
     arithmetic, D15), both validators, share links that reproduce; the budgets are information
     (D115).
   - Say what it costs: which planners stay, the generator version, and the risks.
2. **Measures against archetypes**, on 200 seeds per theme at 128²:
   - no clones: every map's nearest other seed ≥ 0.25 away, median ≥ 0.40 (variety scale);
   - no archetypes: cluster the maps' signatures and feature vectors; no cluster holds more than
     15% of a theme's maps, and the river networks and relief structures show many distinct
     shapes (report the counts);
   - play variety: describe each map's opening from the analysis (where the start's water is and
     how it behaves in a drought, the nearest good dam site, the nearest threat, the directions
     and kinds of land to expand into, what lies hidden further out); no cluster of openings holds
     more than 15%; report the spread;
   - no approximation (corrected by Kyler, D128): at most 10% of a theme's maps are closer to their
     nearest workshop map than the workshop's p10 nearest-peer distance.
3. **A prototype** under `investigation/generative/`, with no `src/` changes: at least 3 themes,
   30+ seeds each at 128². Report renders, the measures above, the score and batch pass rates,
   compared with the current M9 plan.
4. **The gate** (Kyler, 2026-09-25, D112; under Kyler's one rule, D115). Kyler approves version 2
   by judgement, from:
   a. the objective measures, as information for that decision: no clones, no archetypes, play
      variety within its targets, natural dam sites near the start at a rate comparable to the
      official maps, no approximation (D128), and the batch pass rates. **The no-dam-wall check
      blocks:** zero built dam walls;
   b. simulated play shows that prototypes play differently: each prototype's weather-cycle
      behaviour (`investigation/cycles`) and its position on the strategy axes
      (`investigation/mechanics`), once those investigations are ready;
   c. a one-page brief for each of 10 prototype maps: its terrain, a "how it plays" card, its
      cycle timeline and its position on the strategy axes. Kyler approves the direction from these
      briefs and the measures.
   The ten maps are also exported as `.timber` files (`investigation/generative/out/`). The blind
   rating page is optional and decides nothing.
5. **Two design rounds.** Design version 1 (`docs/m9-design.md`, PR from
   `investigation/generative`) comes first. Version 2 folds in the three Codex investigations
   (`investigation/cycles`, `investigation/landscapes`, `investigation/mechanics`) when their PRs
   are ready, with new prototypes, measures and briefs. **Kyler approves version 2, not version 1.**
   Version 2 also measures Verticality (D132), at the default and at high Verticality: relief
   range, levels used, share of land above 16, tallest fall, cliff share and vertical reach (land
   reachable on foot against land reachable only with stairs), against the official and workshop
   maps. And:
   - **Maps feel authored** (Kyler, 2026-09-25; D138). Each map gets one or two deliberate
     intentions, chosen from a varied set and steered into being by the processes (never stamped,
     never a dam wall): a signature landmark, or a relation such as "the best farmland lies past
     the gorge", "the only safe water is uphill", "a waterfall shields the start". The mix varies
     from map to map, and some maps have none. A simple check that the intention exists on the
     finished map; if not, re-steer or drop it. Each brief names its intention. The three
     principles: intentions describe outcomes, never construction recipes; failure is allowed
     (drop it, never mutilate the map; record how often each is dropped, and one that almost never
     emerges leaves the set); and each intention has many structural realizations (the
     no-archetype and no-clone measures run within each intention, on the normal batch or
     contact-sheet maps). Player or Claude controls wait until it proves itself.
   - **Kyler's own one-sentence intentions** (to come) become intentions under those principles
     (D139).
   - The techniques playbook as proposals (D131), and the corrected no-approximation measure
     (D128).
   - A contact-sheet image of its prototypes, `docs/sheets/m9-design-v2.png` (D144).
   Version 2 is built on branch `investigation/generative-v2` (not yet started).

M9, M10 and M11 wait for that approval.

**Design version 2 is approved** (Kyler, 2026-09-26; PLAN §20 D209). M9a builds on it, with:
- **"Any" (Surprise me) as the default** (D208, D209): the genome drawn from broad ranges across all
  themes, combining landforms, water features and intentions freely; a chosen theme only leans the
  ranges. "Any" is measured like each theme (coherent, playable, no clones, no archetypes; the ≥98%
  rule blocks) and is in the contact sheets.
- **No ruler-straight rivers** (D209): rivers and badwater streams follow the land; the longest straight
  run is measured against real terrain and the official maps, and a channel straighter than they ever
  are blocks.
- **Badwater on every map** (D200), and every rule since version 2 (D151–D153, D164, D167–D171, D172).
- **The pending decisions:** #59, #60, #61, #62, #64, #65 and #68 as their defaults; no Dam site tool
  (the natural narrows stays an internal operation for M12, #63); `water.storage_possible` is
  information the generator prefers, not a guard (#67); Kyler picks the candidate intentions later
  (#66).
- **Models and priority** (D210): the M9a build on Opus 5.5 at xhigh, M9b and M9c at high, routine work
  on Sonnet 5 at medium; M9a comes first when work competes for the machine.

**Staging: M9a, M9b and M9c, approved by Kyler** (2026-09-25; PLAN §20 D145). From design version 1
(`docs/m9-design.md` §16). M9 is built in three stages, each with its own deliverables, acceptance
and release, tagged and released like a milestone. What goes into each stage waits for Kyler's
approval of design version 2; the lists below are design version 1's. The text under the stages
("Delivers" and below) is M9 as first planned; the stages replace its order, and its premises
become recipes inside the system (design §3).

- **M9a: terrain and water from processes** (tag `m9a-done`).
  - Delivers: the genome and the themes as priors; the field (uplift, erosion, levels) and the
    hydrology (rivers from the drainage, lakes, falls, pools, splits, deltas) in `src/core`;
    features read back out of the field (rivers, natural lakes, badwater hollows, the start,
    objects, resources); the settler; `water.storage_possible` in place of `water.reservoir` and the
    dam-wall check, in both validators; the document model (a stored field, project format 3); the
    generator version 0.7.0; K = 1.
  - **Format 3's terrain holds runs** (I-1, D119; time-sensitive): the document's `field` and
    `base` store heights plus runs: the surface per tile, and the solid runs of every tile that is
    not one plain run from z = 0 (investigation/terrain3d/DESIGN.md §2.2). It replaces
    `BaseMap.columns`. Generated maps without 3D forms store an empty list, so format 3 needs no
    change when terrain above terrain arrives.
  - **The proven simulation speedups** (D130; investigation/simspeed/INTEGRATION.md) in
    `src/core/sim/`, since M9a's 256² time depends on them: the saturation count and the
    directional-loop expansion first, then the neighbour table if its memory and browser
    measurements justify it. One change per commit, each proved bit for bit identical: every
    sha256, exact depth arrays, Node and Chromium; golden hashes are never updated to accept a
    mismatch.
  - **The audit's A1 and A2** (D129): the Python validator requires
    `WaterSimulationMigrator.IsMigrated` as the TypeScript one does, with the mutated file in the
    parity checks; the writer derives ZIP entry times without local-time normalization, so a
    DST-gap timestamp writes the same bytes in every time zone.
  - **Verticality** (`vt`, 0–100, beside Variety; D132, PLAN §5.9): its default gives ordinary maps
    at design version 2's relief (tall parts up to 16), higher values crazy vertical landscapes.
    The vertical parts and processes (spires and hoodoo stacks, escarpments with hanging valleys,
    stepped canyons and deep gorges, mesas with summit lakes, cascades with plunge pools,
    cliff-bench terraces) emerge more as it rises; never stamped. Traversable at any value: the
    start and its first resources on reachable land, natural ramps where the land needs them;
    stairs-only heights allowed as rewards. Terrain above 16, up to 22 with layer 22 empty, only
    at high Verticality (70+). It is built in M9a but stays locked until a DGM Probe batch
    confirms such maps load and keep their terrain, water and objects (asked under D117; Kyler
    confirmed this stage, D145). 3D-b extends Verticality to 3D forms. The vertical-reach measure
    joins the batch tools.
  - **Keep M12 ready** (D134): generating from the processes, and "make it more vertical"
    (Verticality), as tool entries with their limits and refusal reasons; the read-back features
    as a query ("what's on this map?"); suite requests for them; every reference solution re-run.
  - **The techniques playbook as proposals** (D131; investigation/techniques/): independent
    spatial controls, protected contours and channels before snapping, starts chosen by
    guarantees and opportunity vectors, catchments and spill levels kept. Each is tried against
    the same genomes and kept only if it helps.
  - Also delivers **a contact-sheet command, `npm run sheet`: a tool for Kyler's eyes, not a gate**
    (Kyler, 2026-09-25). By default it generates seeds 1–30 of every built theme at 128² and renders
    each as a small top-down shaded image, one grid per theme, labelled with its seed, theme and,
    once they exist, the map's name and score. Options: `--theme`, `--seeds` (a range), `--size`,
    `--variety`, `--designed-for`, and `--compare <git ref>`, which puts the same seeds from another
    version side by side; the other version is built in a temporary worktree (or similar) without
    touching the working tree. Output: one HTML page per run in `.scratch/sheets/`, opened
    automatically, never committed; a click on a map opens it in the app with its share link. It
    also writes the small PNG each map-changing step commits to `docs/sheets/` (D144). It
    must be quick: 30 seeds × 6 themes at 128² in a couple of minutes on Kyler's machine, one process
    at a time. No checks and no reports; its only acceptance is that it runs and is as quick as
    stated.
  - Acceptance (Kyler's one rule, D115):
    - Blocking: **zero built dam walls on every theme, size, difficulty and setting** (the
      dam-wall check on every batch map, and a contract test that no planned feature list holds a
      dam-site ridge), and nothing stamped; batches ≥ 98% final per theme at 96², 128², 192² and
      256² (a seed that makes no map is breakage); the same bytes for the same seed in Node and
      Chrome, and share links that reproduce; 0 disagreements with the Python oracle, A1's file
      included, and A2's timestamp writing the same bytes in every time zone; every speedup
      proved bit for bit; every editor test still passes, generated fields added to the
      incremental-rebuild property test; generating shows its progress and never feels stalled;
      the probe batch (Release, below).
    - Information: first attempts (60% as a target); generation times (128² under 3 s, 256² within
      its budget), covered by "show progress, never feel stalled"; the Verticality measures.
  - Release: **M9a's in-game gate is a DGM Probe batch** (Kyler, 2026-09-25; PLAN §20 D116,
    amending D112's play test). The batch runs M9a's maps unattended in the real game and must
    pass: the maps load, their pre-filled water holds, their objects load, and droughts and
    badtides behave as the models predict, within the tolerances the batch states before it runs.
    The probe's own review of its in-game screenshots must find nothing visibly broken. M9a is
    released publicly, and any public beta opened, only after it passes. The orchestrator asks
    Kyler before launching it (the probe rule, D117). PR #18 (`investigation/probe`) is merged at
    a boundary when it is ready, and its INTEGRATION.md adopted as proposals.
- **After M9a: the agent guide** (Kyler, 2026-09-25; D142): how a Claude Code session generates,
  edits, validates and exports maps, and runs the contact sheet and the DGM Probe (under the
  probe rule, D117), written once M9a has settled the generator's code.
- **M9b: composition and variety** (tag `m9b-done`).
  - Delivers: the recipes (the named premises as forced parts), Variety (`vy`) and Surprise me, the
    8 flow directions (all appear in 100 seeds of each theme, none over 25%), river-network variety
    (splits, deltas, meanders and oxbows), no clones (K candidates ranked against reference
    signatures), the openings with the weather-cycle signature and the strategy axes (design
    version 2), and the measures as permanent measures (information, D115; the dam-wall check
    blocks). Surprise me and high Variety may reach high Verticality now and then; most maps
    never do (D132).
  - **From Kyler's approval of version 2** (D209): Islands' sameness fixed (archipelagos across the
    whole map, a sea off one edge, island chains, atolls), and his crater (26%) and waterfall-lake
    (16%) intentions emerging more often through the steering. ("Any" moved to M9a.)
  - **Keep M12 ready** (D134): "make it more surprising", Variety, the recipes and the flow
    direction as tool entries; suite requests for them; every reference solution re-run.
  - Acceptance (D115): blocking: M6, the dam-wall check, finds no built wall; information: the
    design's measures M1–M5 on 200 seeds per theme at 128², against their targets.
- **M9c: score, names and candidates** (tag `m9c-done`).
  - Delivers: the 12-component score with its default weights, only a mild tiebreaker among a
    seed's candidates and for ordering a contact sheet, never a gate on quality (D137; how
    candidates are chosen first is decisions-pending #53); K = 3 candidates with progressive
    preview; names and descriptions from the read-back features and the opening ("how it
    plays"); the place resolver and judgement words (D84, D88); the settings bands.
  - **Variations of this map** (Kyler, 2026-09-25; D143): a button on the generator page and in
    the editor makes several siblings of the current map: the same theme, settings and
    intentions, with a genome close to the original but different land. Each is its own map with
    its own share link, and none is a clone (the no-clone check applies between siblings).
  - **Proposed for Kyler's approval: feedback on generated maps** (D137). "More like this" and
    "Less like this" buttons on the generator page and in the editor, plus occasional quick
    A-or-B picks ("which would you rather play?"). Each vote is recorded with the map's genome,
    locally, and later from testers. The votes steer each theme's priors and the Variety
    setting, not a general score. It pairs with Variations.
  - **Keep M12 ready** (D134): "describe this map" and "how does it play?" (names, descriptions,
    the opening) as query tool entries, and "show me variations of this map" as an operation;
    suite requests for them; every reference solution re-run.
  - Acceptance: the rest of M9's acceptance below that the stages do not cover.

**Delivers:** old PLAN milestone 4.
- `score.ts` calibrated on the official maps.
- K = 3 candidates with progressive preview (K = 1 at 256² if the M2 benchmark requires it).
- Names and premises built from the features.
- The score on the map card.
- The words M12 reuses, built here because names and descriptions need them too (D84, D88):
  - river courses read from the actual flow: each river's path in flow order, from its settled
    water surface (else its bed), with its tributaries, and a name for each ("the main river",
    "the north tributary", "the river from the east edge");
  - the place resolver (EDITOR_PLAN.md, Claude integration, "Spatial language"): compass places,
    places relative to a feature, and flow-relative places (upstream and downstream, a position
    along a river's course from its source, the start's bank and the opposite bank, "this
    valley"), always read from the river's actual flow, never from a compass direction; it returns
    the area, its reading and its assumptions;
  - the judgement-word table (EDITOR_PLAN.md, Claude integration, "Judgement words"): each word's
    levers, measured targets, direction, size and guards. The groundwork's `lib/words.ts` checks
    only a target's direction; M9 adds D84's sizes.
  - From the Claude groundwork, these files move: `investigation/claude/lib/view.ts` and
    `lib/flow.ts` → `src/core/analysis/view.ts` and `flow.ts` (shared with names and premises);
    `lib/places.ts` → `src/core/places/resolve.ts` (the editor's region tools can use it too);
    `lib/words.ts` → `src/core/places/words.ts`; `tests/places.test.ts` and `tests/words.test.ts`
    → `tests/unit/`.

From the workshop study (D87), M9 grows from "the score" to "maps that diverge":
- **Premises.** At least three per built theme, drawn from the study's recipes
  (`investigation/workshop/recipes/`) and the catalogue, each a planner variant that lays its
  landmark out first and the rest around it (PLAN §8):

  | Theme | Premises (existing in bold) |
  |---|---|
  | River Valley | **Gorge-dammed basin**; Island in a moat; Oxbow bend; Twin falls; Spiral mountain or quarry |
  | Canyon | **Narrows**; Rim settlement (PLAN §8); Hanging lake on a mesa; Mesa field |
  | Highlands | **Staircase**; Twin plateaus (PLAN §8); Badwater volcano; Spiral mountain |
  | Lake Basin | **Rising lake**; Crater lakes (PLAN §8); Caldera with an island; Heart lake (rare) |
  | Delta | **Many mouths**; Salt marsh (PLAN §8); Oxbow delta |
  | Islands | **Archipelago**; Atoll (PLAN §8); Volcano island; Heart islands (rare) |

  Rare premises are drawn only at Variety 60 and above.
- **River directions** (D67). The valley themes (River Valley, Canyon, Highlands, Delta) and Lake
  Basin's outlet draw their flow axis from 8 directions (PLAN §7.1). The planners lay out in a
  west-to-east frame and the feature list is turned by one of the 8 symmetries of the square
  (paths, outlines, set-piece plans and orientations), or they plan natively. The north–south
  recipe builds a valley, its dam site and its falls along a north–south river with today's
  builders.
- **Variety** (`vy`, 0–100, default 70; decisions-pending #32, W2) and **Surprise me**. Variety
  sets how the premise is drawn (0: the theme's first; higher: all of the theme's, then the rare
  ones at 60+, then one catalogue landmark from another theme's list at 85+), how far the
  settings' targets wander within the workshop's p10–p90 bands (`settings-bands.json`) as a share
  of Variety, and the flow axis (always drawn at 30+). Surprise me draws a theme and sets Variety
  to 100; the share link carries the resolved spec, so the map reproduces.
- **No clones.** The K candidates (PLAN §7.9) are ranked by score, and among those within 5
  points of the best, the one farthest (variety score, `variety-scale.json`) from the theme's
  reference maps wins (D137 makes the score a mild tiebreaker; decisions-pending #53). The
  reference maps are seeds 1–30 of the theme at default settings, stored as 16×16 signatures and
  feature vectors (about 4 KB per theme).
- **The score** (`score/score.ts`), ported from `investigation/workshop/lib/score.ts`: 12
  components (engineering, height variety, landmarks, river character, resource pacing, regions,
  trade-off, frontier, surprise, verticality, naturalness, water), each 0–1 (decisions-pending
  #35, W5; PLAN §12). Its parameters are `data/score-params.json`, a copy of the study's default
  `score-params.json`: `fit-score.ts` and `ratings.json` are not used (Kyler, 2026-09-25; D137).
  The score is only a mild tiebreaker. The score's inputs from a
  built map (plateaus, gorges, the main watercourse through the settled water, resource rings,
  regions, trade-off, frontier, dam sites near the start) move into `analysis/` from
  `lib/measures.ts` (`scoreInputs`), and the naturalness metric from `lib/naturalness.ts` (the
  refinement phase extends it).
- **Names and descriptions** from the catalogue's plain words, keyed by the detected feature or
  the premise (PLAN §13): *island in a moat*, *crater lake*, *caldera*, *spiral mountain*,
  *spiral quarry*, *volcano*, *hanging lake*, *mesa field*, *twin falls*, *oxbow lake*, *chain of
  lakes*, *great scarp*, *hub of channels*, *archipelago*, *branching rifts*, *concentric rings*.
  Examples: "Moat Isle", "Caldera Rest", "Spiral Quarry", "Twin Falls", "Mesa Reach".
- **Settings bands** (PLAN §5.8): the new calibration rows and settings from
  `investigation/workshop/settings-bands.json`, the premise's water budget for `water.no_flood`
  (decisions-pending #33, W3), and the relief and terracing presets (#37, W7 in part).
- **New builders** (PLAN §9.11): `spiral`, `cone`, `mesaField` and the sealed `sea`.
- **Reservoir help and `water.storage_possible`** (decisions-pending #31, settled by D111): no dam
  ridge is built anywhere, and `water.storage_possible` replaces `water.reservoir` in M9a. Reservoir
  help, if the design keeps it, only steers what the generator looks for.

Why both variety targets below: a landmark on an unchanged River Valley base adds at most 0.02 to
the theme's V2 (the north–south valley, a new skeleton, 0.075); counted as landmarks, the eleven
recipes lift V3 from 0.20 to 0.53. Maps diverge when the premise changes the skeleton too (the
flow axis, where the valley runs, the relief, the water budget). Risk: variety bought with broken
maps; the per-premise batch gate is the guard.

**Acceptance** (Kyler's one rule, D115; each stage above takes its part)

Blocking:
- **Zero built dam walls on every theme, size, difficulty and setting** (Kyler's no-dam-ridge
  decision, 2026-09-25): the dam-wall check (design §10) finds none on any batch map, and no planned
  feature list holds a dam-site ridge. It runs on every milestone after M9 and blocks there too.
- Names and premises match the features on 30 hand-checked maps, 10 of them at Variety 100.
- The place resolver is tested on rivers flowing in every direction (the four edge directions
  and the diagonal flow axes), a curved river, a river the test lays in any direction (with the
  river planner the generator keeps; the editor has no drawn rivers since D184) and a tributary, so
  "upstream" is never read as "west".
- Every judgement word moves its measured targets in its direction on three maps (two River
  Valley sizes and a Canyon), keeps every guard, and says so when its settings are already at
  their limits or its theme is marked weak.
- Each premise passes a batch of 100 seeds at 96², 128², 192² and 256² at ≥ 98% final, in the
  `generate` profile.
- The first candidate shows at once, with progressive preview, and generating never feels
  stalled.

Information:
- **Permanent measures**, reported on every milestone after M9 so no later milestone brings
  archetypes back unseen (design §10, §16; D112 (4)): no clones (every seed's nearest other seed
  of its theme ≥ 0.25 on the variety scale, median ≥ 0.40); no archetypes (no cluster of whole
  maps, river networks, relief or openings over 15% of a theme); play variety within its targets
  (openings); no approximation of workshop maps (at most 10% of a theme's maps closer to their
  nearest workshop map than the workshop's p10 nearest-peer distance, D128; run locally in each
  milestone's full check, since workshop maps never reach CI).
- 256² with K = 3 takes ≤ 20 s, or K = 1 is recorded.
- Each judgement word's move against its size.
- From the workshop study:
  - first attempts ≥ 60% per premise, and at least 3 premises in every built theme;
  - in 100 seeds of each valley theme, all 8 flow directions appear and none exceeds 25%;
  - variety (`lib/variety.ts`, scale in `variety-scale.json`), seeds 1–30 at 128², default
    settings, as shares of the workshop's: the shape and numbers alone (V2) each theme ≥ 0.45
    (today 0.15–0.36), all themes together ≥ 0.80 (today 0.56); with landmarks counted (V3,
    `patternP0` in the scale file) each theme ≥ 0.60 at default Variety and ≥ 0.80 at Variety 100
    (River Valley today 0.20);
  - no clones: within a theme, every seed's nearest other seed is ≥ 0.25 away and the median
    ≥ 0.40 (today 0.06–0.19 and 0.08–0.26; workshop maps sit 0.59 (p10) and 0.67 (median) from
    their nearest peer);
  - each new builder meets its acceptance (PLAN §9.11);
  - only if Kyler adopts Reservoir help (#31): the obviousness measure
    (`investigation/workshop/obviousness.ts`) matches each level on ≥ 98% of maps, and Normal with
    Reservoir help None passes its batches at ≥ 98%.

**In-game check:** a DGM Probe batch for M9a (D116), asked under the probe rule (D117).

**Effort:** xhigh (was high: the premises and the 8-direction layout frame set architecture).

---

## Map quality checkpoint

After the M9 build (M9a–c) and before Map look 2 and the Frame pass (Kyler, 2026-09-25; PLAN §20
D146).

1. **Prepare what Kyler needs to judge the maps:**
   - contact sheets for every theme at a few Variety and Verticality settings;
   - a DGM Probe batch of generated maps in the real game (ask Kyler before launching, D117);
   - the measures, as information;
   - a short list of the weakest patterns (samey, flat, dull or broken maps), each with examples
     and a likely cause.
2. **Tuning rounds:** fix the weakest patterns in the generator, regenerate, and show Kyler
   again. Repeat until Kyler says go. Only breakage and Kyler's decided principles block.
3. **Kyler looks, and may play a few maps.** The next step starts only after Kyler says go.

---

## Map look 2: water and shadows

After the Map quality checkpoint and just before the Frame pass (Kyler, 2026-09-25; PLAN §20 D147,
made smaller by Kyler the same day).

**Delivers**
- A graphics quality setting: **High** (chosen automatically on capable GPUs), **Standard**
  (today's clean look) and **Light** (the existing software-rendering look).
- High adds only the two biggest effects:
  - a proper water shader: colour by depth, clear shallows, gentle ripples catching the light,
    shore and fall foam, badwater distinct; Kyler's direction: fewer, subtler sparkle flecks
    than the clean look, and more depth and transparency;
  - soft real-time shadows from a warm sun.
- High's water reads the shared water palette (`src/render3d/waterPalette.ts`, D177): the same
  colours, opacity, badwater blend and calibration as Standard, so the two never drift apart.
- Today's grass and dirt textures stay exactly as they are (Kyler likes them).

**Later, optional** (not part of this step): ambient occlusion, colour grading, richer or
higher-resolution textures, softened block edges and grass lips, full-resolution rendering and
anti-aliasing, more detailed tree, bush and ruin models, and dry contaminated ground's cracks a
little more visible from far away.

**Rules:** still our own art only, generated or modelled by us; never game assets. No map file
changes.

**Acceptance:** judged by eye against Kyler's reference screenshots: captures are shown to Kyler
and he decides. Speed numbers are information only, but no mode may feel sluggish on the machines
it's chosen for (blocking: what a player feels).

**Release:** tag `map-look-2-done` and release it like a milestone.
---

## Frame pass

**Before and after it** (D176): until this step creates the design records, new interface is built
with the existing shared styles and components, with no one-off styling, so the design pass
restyles it rather than rebuilds it; after it, all new interface follows its records.

After the M9 build (all its stages), the Map quality checkpoint and Map look 2, and before the
3D stages and M10 (Kyler, 2026-09-25; PLAN §20 D113, D146, D147). It follows
the impeccable-app-flow skill (timbermods/.github, `claude-skills/impeccable-app-flow/`) in
redesign mode, scoped to the frame zone. This overrides the flow's gate, which waits for M11. The
full design pass after M11 stays, and continues in update mode from the records this step creates.

**Why:** Dam Good Maps should catch the eye as soon as its new generator exists, for sharing with
testers, without redesigning an interface that M10 and M11 are still adding to.

**Delivers**
1. The flow's records: PRODUCT.md, MEANING.md (for the surfaces that exist after M9), DESIGN.md
   and `.impeccable/design.json`.
2. The flow's freeze-meaning step before any restyle: the capture tool, ARIA snapshots, the map
   palette module and its test.
3. A direction of the app's own. Its own accent (pine is the hub's), clear of the data palette and
   the state colours, and clear of every sibling site's world. Show Kyler 2–3 candidate directions
   with captures, and wait for his pick.
4. The frame redesigned: the masthead, the generator page's first viewport, install help,
   first-run and empty states, the footer with credits, and the 404.
5. A hero that shows the product: a live 3D view of a freshly generated map from the new
   generator, captioned with its seed and settings, with a way to roll another. For speed, show a
   still render made by our own renderer first, and load the live 3D view lazily behind it. Never
   game art or screenshots.
6. The instruments (settings, map card, the editor's bars and shelf, reports) keep their layout
   and components. They may take the new tokens' colours only where the guard tests and contrast
   checks pass. The map is never styled.

**Rules:** every hard limit in impeccable-app-flow holds. No map changes, `shade.ts` untouched,
contracts byte for byte, no state shown by colour alone, the test hooks kept.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - the guard tests pass unchanged;
  - Kyler approves the frame from before and after captures of every frame surface, in light and
    dark, desktop and phone.
- Information: Lighthouse on desktop (90 or more as the target) with the live hero; the flow's
  finish review, for Kyler; the 3D budgets.

**Release:** tag `frame-pass-done` and release it like a milestone.

---

## Terrain above terrain (3D-a, 3D-b, 3D-c)

Carving is a brush, live from the start (D179, D182; EDITOR_PLAN.md Part 1, §9).

After the M9 build and the Frame pass, and before the Weather view and M10 (Kyler, 2026-09-25;
PLAN §20 D118–D127). Real 3D terrain is essential: caves, overhangs, tunnels and arches must be
possible to generate and to edit, not only to import and keep (83% of the 1.0+ workshop maps use
them). The design is `investigation/terrain3d/DESIGN.md`, with the game's rules in
`GAME_RULES.md`, the maps' use of caves in `MAPS.md`, and the repository's heightfield assumptions
in `INVENTORY.md`. Each stage is released like a milestone.

**Why this order.** The brushes came with Live editing, on heights, built on the terrain model so
the 3D stages extend them (D158): 3D-a moves them onto runs, and 3D-c adds carving. M10's and
M11's tools (symmetry, stamps, regenerate area, locks) are then built on runs from the start.
Building them on heights and retrofitting would redo their core.

**What blocks** (Kyler's one rule, D115): breakage; Kyler's principles (the support rule: 0
dropped voxels; nothing stamped); and what a player feels (the page never stalls; progress is shown
while water settles). Budgets and measures are information.

### 3D-a. Terrain model, water and checks

**Delivers**
1. Runs per tile (`core/terrain`) as the build's, the document's and the kept content's terrain,
   with `heights` derived (D119). Formats 1 and 2 convert on read.
2. Stacked-column water with the game's rules (air gaps, overlap flow, pressure ×8, the overflow
   cap, roofs, and the five edge rules today's port simplified), with a fast path for one-column
   tiles; the 3D pre-fill and the canonical settle; the multi-slot writer (D120).
3. Soil moisture and contamination per run top.
4. The Python oracle's stacked water and moisture, bit-identical, with voxel golden fixtures.
5. Checks:
   - the support rule on every map, and the build's rule pass (D121);
   - the floor graph in both validators (D122);
   - plant clearance and first-run placement;
   - floor-aware slope and start checks; `start.dry` applies the floor rule (water counts only at
     or above the start's floor) to water under roofs only, and open water keeps today's rule
     until Refinement item 8 has measured it (Kyler, D145);
   - `walk.levels`, `terrain.dropped`, `water.sealed_source`;
   - `terrain.single_floor` retired for generated maps.
6. Imports: roofed water simulated (D100's exception retires); the cave cause of approximate
   water retires (D98). Caves stay locked to the brushes until 3D-c.
7. The Live editing brushes and every recorded stroke move onto runs: on a map with no 3D forms a
   stroke gives the same terrain as before.
8. The Probe's test maps T1–T6 (DESIGN.md §8), written, not played.
9. **Keep M12 ready** (D134): "which levels can I reach without stairs?" and "where does water
   stand under a roof?" as query tool entries; suite requests; every reference solution re-run.

**Acceptance**
- Blocking:
  - every generated map is identical to the previous release except its water's last digits: no
    wet tile differs, and depths are within 0.05 (the full batch; the generator version is bumped);
  - TypeScript and Python agree bit for bit on water and moisture, on heightfields and on the voxel
    fixtures;
  - the support check and the floor-aware slope and start checks are fixed and tested;
  - an unedited import still exports byte for byte;
  - projects saved before 3D-a open with the same land, and their strokes replay exactly;
  - while water settles, progress shows and the page never stalls.
- Information:
  - on the official cave maps, the canonical settle matches each map's own water at least as well
    as the investigation measured, and moisture per run matches the stored slots on at least 18 of
    19;
  - budgets: the settle ≤ 3 s at 256² on generated maps (D33), and no slower than today's on the
    official maps; the instant checks ≤ 50 ms at 256² with the support rule (EDITOR_PLAN.md,
    Testing); generation times.

**In-game check:** none. **Effort:** xhigh.

### 3D-b. Generation and Verticality

**Delivers**
1. Verticality (`vt`, in the spec, share links and the panel from M9a, D132) extends to 3D forms
   (PLAN §5.9's table; D123). Themes carry their own defaults.
2. The 3D processes (DESIGN.md §5.2), run on M9's fields and drainage, each a feature kind with a
   builder:
   - tunnels between valleys on one level;
   - arches in fins;
   - sky bridges over gorges;
   - cliff paths of ledges;
   - cliffside caves;
   - undercut shelters;
   - overhanging cliffs;
   - spring caves;
   - underground rivers;
   - collapses.
3. Traversal: derived slopes on the floor graph, and rewards planned on stairs-only heights.
4. Relief to 22 at Verticality 70 and above comes with M9a, locked until a probe batch confirms it
   (D132, D145). If it is still locked, the Probe's T6 here unlocks it once it passes.
5. NaturalOverhang bridges and badtide drains in cliff notches (from Later).
6. The 3D measures in the batch and the M9 measure suite.
7. **Keep M12 ready** (D134): "make it more vertical" with 3D forms, and "add caves" through
   Verticality, as tool entries; suite requests; every reference solution re-run.

**Acceptance**
- Blocking:
  - the rule pass drops 0 voxels on every batch map, and every 3D form comes from a process
    (nothing stamped);
  - every map passes `walk.levels`: the start and its first resources stand on land reachable
    without stairs;
  - at the default Verticality, relief stays within 16 (D132);
  - batches ≥ 98% final per theme and size at Verticality 20 and 80;
  - the same bytes for the same seed in Node and Chrome, and share links reproduce;
  - a whole generation shows progress and never feels stalled;
  - the Probe's batch (asked under D117): T1–T4 and T6 agree with the model within the tolerances
    stated before the run; and T7, like M9a's batch (D116): the Probe plays high-verticality maps,
    which load, keep their water and objects, and behave through droughts and badtides as the
    models predict, with nothing visibly broken in its screenshots. 3D-b is released publicly only
    after the batch passes (Kyler, D145; it replaces Kyler's own play of two maps).
- Information:
  - first attempts (≥ 60% as a target);
  - at Verticality 20: at most 2 small 3D forms at 128², relief within 16; at 80: the median map has
    ≥ 5 forms of ≥ 3 kinds;
  - the M9 measures, with the 3D inputs;
  - a whole 128² generation ≤ 3 s at Verticality 80.

**In-game check:** yes (a probe batch). **Effort:** xhigh.

### 3D-c. The editor and the view

**Delivers**
1. One mesher for every tile (greedy faces per plane, undersides), sky light and sun visibility in
   3D, water per column, and Map look per run top (D126).
2. 3D picking and selections (the Select tool in 3D), and a level-slice cutaway.
3. **Cave carving is a brush** (D182; EDITOR_PLAN.md Part 1, §9). D125's Carve cuts into the land
   under the cursor, into a cliff face or beneath the ground, and its Fill fills a hollow back in.
   They keep the brushes' grammar: the size ring, Shift+scroll for strength, one undo step per
   stroke. Tunnels, arches, caves, ledge paths and overhangs come from carving, as hills and valleys
   come from the brushes, never from buttons (D184; D182 makes D125's feature tools brush-first).
   While painting, the stroke shows live what the support rule would drop (D125). The top bar's
   Carve is the water's force (D194), so whether cave carving extends it, makes Lower and Raise
   smarter, or earns its own button is decided when the stage is built (D184).
4. Undo, generate-keeping-edits and 3D locks. Imported caves become editable (D40 retires).
5. Claude and 3D: new 3D forms steer the generator (Verticality and the 3D processes, D139);
   precise carving uses carve and fill strokes (D187). The words land with M12.
6. **Keep M12 ready** (D134): "carve a tunnel", "cut an arch here", "fill this cave" and "lock this
   cave" as bounded brush-style operations (carve and fill strokes, a lock), never feature objects
   (D187), with their limits and refusal reasons (the support rule's); suite requests; every
   reference solution re-run.

**Acceptance**
- Blocking:
  - every stroke's result drops 0 voxels: what would fall shows while painting, and is refused
    with its reason;
  - undo restores the exact runs, and an incremental build equals a full build after random carve
    and fill edits;
  - unedited imports export byte for byte;
  - the editor stays responsive: tool feedback within a frame, and slower work in the background.
- Information:
  - `bench:3d` with 3D maps, in its budget configuration (a build < 1.5 s at 256², ≥ 60 fps with
    and without the cutaway), run because this stage is 3D-heavy;
  - a stroke committed (rasterize, remesh, re-light) ≤ 100 ms at 256²; a dirty-chunk remesh
    ≤ 5 ms (EDITOR_PLAN.md, Testing);
  - usability: "dig a tunnel between two valleys" and "cut away to see a cave" in under 2 minutes
    without help.

**In-game check:** yes (a probe batch: T5, and T2 on edited maps). **Effort:** xhigh.

---

## Weather view

After the 3D stages and before M10 (Kyler, 2026-09-25; PLAN §20 D133). The refinement phase stays
before the design pass, M12 and M13.

**Why:** players should see how a map behaves through droughts and badtides before playing it, and
what that means for their colony. The exact cycle model (`investigation/cycles/`, merged from PR
#15) proves it's possible, and its INTEGRATION.md has the proposals. The verified mechanics
catalogue (`investigation/mechanics/`: CATALOGUE.md, VERIFIED.md, AXES.md; PR #11) turns the weather
into play consequences.

**What it is, beside the editor's buttons** (D186): the editor's **Drought** and **Badtide**
buttons (Live editing, D180, D181) each show one event: what a drought, or a badtide, looks like on
this map. The Weather view is separate: a fuller timeline of the whole cycle, opened when wanted.
It builds on the same water journey and the same cycle model, and replaces neither button.

**Delivers**
1. A Weather view, opened when wanted from the generator's preview and from the editor: a
   timeline of the whole cycle, with its **Normal**, **Drought** and **Badtide** phases in the
   order the game plays them, a day slider and a play button, a legend that says what each colour
   means in words, and a plain-language summary.
2. The summary explains what the weather means for play, not only where the water goes:
   - the day the start's shore leaves a pump's reach (storage against access);
   - how much fertile land stays moist, and when it dries;
   - how much a water wheel loses as flow drops, by the game's wheel rule;
   - whether a badtide reaches farmland or the water supply;
   - aquifers and drills, where the map has them.

   For example: "In a 7-day drought the river dries below the falls by day 3. The start's pumps
   lose their water on day 4, but the lake upstream keeps most of its water. Farmland by the river
   dries by day 5."
3. The map card says, in one or two lines, how the map fares in its first drought and badtide.
4. Every claim traces to the model and a verified rule. It says "can't tell from the map" where
   that's the truth, and never promises colony survival (the catalogue's limit: economic timing is
   unverified).
5. The weather behaviour feeds the strategy axes, so M9's play-variety measure counts how maps
   behave through droughts and badtides.
6. Speed: an instant estimate first (the analytic drought, D101), then the full timeline in a
   cancellable background worker, streaming key days, using the simulation speedups where adopted
   (D130).
7. Cave water: stacked-layer water from the 3D stages (D120), so caves and overhangs behave
   correctly.
8. Calibrated against the real game with a DGM Probe batch (asked under D117).
9. Every meaning readable, as Map look requires: words as well as colour, greyscale and
   colour-blind checks.
10. **Live water** (Kyler's addition). The editor already shows water flowing after every edit
    (Live editing's paced journey, D179 (2)). This step brings the same live water to the
    generator's preview, after generating, and to each phase of the timeline: the 3D view shows it
    flowing as it happens (water spreading down channels, filling basins, spilling over falls),
    streamed from the worker at a steady frame rate, instead of only the finished result.
    - The final water is exactly the same as today: live display only, never a different settle or
      a change to map bytes.
    - It can be skipped: a **show result** option, and reduced motion, jump straight to the settled
      water.
    - It stays within the 3D budgets, and the editor stays responsive; a new edit cancels the live
      display and starts again.
11. **Keep M12 ready** (D134): "what happens in a drought?" and "when does the start lose its
    water?" as query tool entries with their limits and refusal reasons; suite requests; every
    reference solution re-run.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - the summary's claims match the model and the verified rules, and never promise survival
    (Kyler's honesty principle);
  - no map file changes;
  - the final water is identical with live display on and off;
  - the first key days appear quickly, and it never feels stalled (this replaces the 256² timeline
    budget);
  - the editor stays responsive, and its Drought and Badtide buttons keep working as they did
    (D186).
- Kyler approves the look from captures, live water included.
- Information: the probe batch's timing comparison with the model (unless it reveals breakage); the
  3D budgets.

**In-game check:** a probe batch for the calibration (D117). **Effort:** xhigh.

**Release:** tagged `weather-view-done` and released like a milestone (CLAUDE.md, Deploying).

**Proposals adopted from PR #33** (D173): the bit-identical speedups to the cycle model, each
re-proved step by step, and the scheduling: the first drought first when it's on screen, a
background start after generation, caching under the full input hash, cancellable batches.
---

## M10. Symmetry, and the brushes' extras

The brushes are largely done: Live editing brought them forward from M10 (D158, D182, D184).
Raise, Lower (smart near water), Flatten ("in steps"), Smooth ("make walkable") and Naturalize,
circle and square shapes, precise mode, straight lines, level lines, pen pressure and the Select
tool are built there, and 3D-a moves them onto runs. M10 adds symmetry, live and brush-first (D179,
D182), and the extras the brushes still lack.

**Delivers**
- **Symmetry mirrors strokes live** (D182): every stroke, source, placement from the shelf and
  removal is mirrored as it is made, as one undo step with the original.
  - a mirror on any map, rotation-4 on square maps;
  - entities' orientations remapped by the game's footprint rule (EDITOR_PLAN.md, Stamps and
    symmetry);
  - one start kept: the start is never mirrored (Timberborn 1.1 keeps one).
  - Where it lives on screen follows D184: few tools, options hidden until wanted.
- **The brushes' extras** (D158: M10 keeps symmetry and the advanced extras): whatever Kyler's
  trials of the Live editing preview leave for later, each an option of an existing brush where it
  can be, not a new button (D184).

Symmetry also serves the workshop catalogue's symmetric layouts (6 workshop maps).

- **Keep M12 ready** (D134): "naturalize this area", "raise this hill by two" and "make it
  symmetric" as bounded brush-style operations (strokes, Select actions, the symmetry setting),
  never landform objects (D187), with their limits and refusal reasons; suite requests; every
  reference solution re-run.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - symmetry works on runs (D118): caves, overhangs and arches survive strokes elsewhere, are
    mirrored exactly, and the build's rule pass drops 0 voxels after any mirrored stroke;
  - mirrored strokes stay exactly symmetric, entities included, replay exactly, and undo as one
    step;
  - Naturalize never breaks `slopes.connect` or a set piece's protected tiles;
  - the editor stays as responsive with symmetry on as Live editing requires: the display's frame
    rate while painting on 256², feedback within a frame, slower work in the background.
- Information:
  - the performance budgets (EDITOR_PLAN.md, Testing);
  - from the workshop study (D87): Naturalize, on a generated map's terrain, against the official
    median of steps in straight runs of 8+ (0.066) and a ridge crest variation of 0.25 or more (the
    naturalness metric M9 ports).

**In-game check:** no.

**Effort:** high.

---

## M11. Stamps, heightmap import, regenerate area, locks

Built live and brush-first (D179, D182): stamps are painted onto the land like a brush; locks and
regenerate area follow Live editing's principles; regenerating an area shows its result growing,
never a frozen wait.

**Delivers**
- **Stamps, painted as brushes** (D182): a stamp is a brush whose tip is a shape of land (runs,
  D118) with its water sources, objects and slopes. Picking one shows its ghost on the land under
  the cursor; a click lays it, a drag paints it along the stroke (a line of mesas), R rotates and
  a mirror flips it (the entity transform rules in EDITOR_PLAN.md, Stamps and symmetry). It blends
  into the ground around it, the water responds at once, and each stamp is one undo step. What it
  lays is ordinary land, shaped further with the brushes: no stamp object or handles remain.
- User stamps: a Select tool selection saved as a stamp, with export and import.
- Heightmap import scaled to 0–16, through the landscape survey's conversion pipeline, not just raw
  heights (Kyler, 2026-09-25; PLAN §20 D159): vertical mapping, rivers from the drainage, water
  sources, a start by Kyler's rules (D85/D153), and the current water rules (no walls or rims,
  draining allowed; D151, D152). It also serves the workshop catalogue's real-geography maps (4
  workshop maps).
- Regenerate an area, with constraints.
- Locks and the conflict rules.
- From the workshop study (D87):
  - The built-in stamps draw on the catalogue's best patterns: island in a moat, crater lake with
    an island, spiral mountain and spiral quarry, heart-shaped lake (and other outlines: star,
    crescent), badwater volcano, hanging lake on a mesa, mesa field, twin waterfalls, oxbow lake,
    and dam narrows between two spurs; plus the earlier plan's waterfall basin, gorge dam site,
    terraced cliff, ruin district and island lake. The dam stamps follow D111: a natural narrows,
    never a wall. Each stamp carries its own terrain, sources, objects and slopes; the recipes in
    `investigation/workshop/recipes/` are their reference, and the builders (PLAN §9.11) may make
    a stamp's shape, which is laid as plain land.
  - The water builders `riverFork`, lake `outlets` and river `switchback` (PLAN §9.11) serve the
    generator, and Claude through it (D139); in the editor, forks, outlets and switchbacks come
    from smart Lower (D184).
- Locks, stamps and regenerate-area on 3D regions (tiles and a z range); stamps carry runs (D118).
- **Keep M12 ready** (D134): "lock this area", "regenerate the east third" and "put a spiral
  mountain here" (a stamp painted by the app) as bounded operations with their limits and refusal
  reasons; suite requests; every reference solution re-run.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - hand edits survive regeneration per the conflict rules;
  - stamps round-trip through export and import;
  - a stamp paints as responsively as a brush: its ghost follows the cursor within a frame, and it
    lays as one undo step that replays exactly;
  - a rotated or mirrored stamp passes the load checks;
  - from the workshop study: each built-in stamp, laid rotated and mirrored at 20 random free
    spots on 96², 128² and 256² maps of every theme, passes the load checks every time; each new
    builder's output passes the load checks.
- Information: how often a stamped map still passes the `generate` profile (90% as the target);
  each new builder's numbers (PLAN §9.11).

**In-game check:** no.

**Effort:** high.

---

## Pick a place

Right after M11 and before the refinement phase, as one of the final features (Kyler, 2026-09-25;
PLAN §20 D160, D166, D175; this replaces the earlier placement right after Live editing). It reuses
M11's heightmap import pipeline (D159), and the design pass later restyles it with everything else.
One smooth flow inside Dam Good Maps, from exploring the real world to a finished map in one click:

1. **Explore:** a **Pick a place** page beside Generate and Real places, with a 3D map to fly, tilt
   and rotate. Terrain comes from the same AWS Terrarium elevation the conversion uses (shaded 3D
   terrain), with OpenFreeMap vector tiles for context (rivers, lakes, forests, roads, place names;
   no key, attribution shown). Search by place name with OpenStreetMap's Nominatim, on Enter only,
   within its usage policy. No satellite imagery for now. Never Google's data; pasting coordinates
   (for example from Google Earth) stays available. A planned fallback tile source (for example
   VersaTiles or Maptoolkit) if OpenFreeMap changes.
2. **Frame:** a square shows exactly what the map will cover. Drag and rotate it; resizing it
   changes the scale (metres per tile) within sensible limits; its real size shows ("7.7 km
   across").
3. **Live preview inside the square:** while framing, the land inside is already shown turned into
   Timberborn blocks at Timberborn's levels, so the player sees the map, not just the place, before
   building.
4. **Confirm with as little as possible:** map size (96, 128 or 256) and height (auto by default:
   tall when the relief deserves it, once the probe confirms tall maps). Scale, difficulty and
   water (designed by default) sit in an optional **More** drawer.
5. **One click, "Build my map":** a short progress strip (terrain, rivers, start, forests, checks),
   then the map appears in the usual 3D view with its name (from the place, no "Near") and a "how
   it plays" line, and everything works from there: the Weather view, Refine (Live editing), Save
   to Timberborn, Download, and a share link that rebuilds exactly this map. The share link stores
   the place, the framing, the settings and the elevation data's version.
6. **It never fails in front of the player:** if the framing won't make a good map, it quietly
   tries nearby framings and scales and shows the best; if nothing nearby works, it highlights
   better spots on the map.
7. **Phones** get a simpler version: a flatter view and a lighter preview.
8. **Credits** as in Real places (D155): a short credit and link in each map's in-game description,
   the full notices on the credits page, and any region-specific notice the data's provider
   requires; ESA WorldCover (observed water, CC BY 4.0, D192) is credited like the
   elevation data, on the Pick a place credits and in each map's credits.

It follows every current rule: designed water (sources only where water begins, D166, D171; the
designed-water prototype from `investigation/pickplace`, PR #34, merged, its INTEGRATION.md adopted as
proposals; where `investigation/pickplace-water2` differs, its designed water replaces #34's), no
walls or rims (D151), maps may drain (D152), Kyler's start requirements (D153, D164), and
official-like trees, ruins, mines and clusters (D167–D170). When the quiet retries change the
player's framing, size or scale, the page says so plainly.

**Blocking:** breakage (the map passes the validators and exports; the share link rebuilds it
exactly; attribution present; no edge walls) and what a player feels (the explore view and the
live preview stay smooth; progress while it builds; never a frozen page; never a failed attempt
shown).

---

## Refinement phase

After M11 and before the design pass. It works through Kyler's refinement notes: things to
improve once every tool exists. Each note is its own item, with its own tests.

**Kyler's notes**
1. Pending decision [#2](docs/decisions-pending.md): `plants.drought` warns on every River Valley
   map, because the berry bushes near the start grow on water that drains in a drought.
2. Pending decision [#12](docs/decisions-pending.md): narrow a generated fall's channel to 1–3
   tiles above the drop, for water wheels.
3. Pending decision [#13](docs/decisions-pending.md): a river drawn across another river. Moot
   since D184 removed drawn rivers from the editor: rivers join where they meet.
4. Pending decision [#21](docs/decisions-pending.md): the measured targets that move less than
   their formulas (flat share, one-level share, cliff share).
5. The river-pond crossing fix (a queued task): moot since D184 removed drawn rivers from the
   editor. `tests/e2e/tools.spec.ts`'s map without ponds (`&lk=0`) goes with the old tools.
6. The load checks (Kyler, 2026-09-25): the validators' load-class checks that real maps fail
   even though the game loads them. 12 of the 32 investigation maps fail one (unconnected slopes,
   a start on uneven ground, Meander Multiplayer's three starts; decisions-pending
   [#8](docs/decisions-pending.md)). Keep a load check only where the decompiled game really
   rejects or breaks the map; otherwise make it a warning. Change both validators together.
7. Containment should look natural (below; decisions-pending [#29](docs/decisions-pending.md)).
8. `start.dry` and lakeside starts (Kyler, 2026-09-25; PLAN §20 D107, D145): should `start.dry`
   count only water standing at or above the start's ground, so a lakeside start like Beaverome's
   passes? Measure how many official, workshop and generated starts it changes before deciding.
   Until then the floor rule applies only to water under roofs (3D-a).
9. The audit's A3 and A4 (PLAN §20 D129; investigation/audit/AUDIT.md), both P3: a `__proto__`
   key in an imported singleton is rewritten as forged sibling data (parse into null-prototype
   records, write own keys only); and the JSON parser accepts raw control characters inside
   strings (reject them, as `JSON.parse` does). Each with its round-trip test.
10. The deliberate upgrade step (PLAN §20 D150): the held major dependency upgrades (TypeScript
    7.0, @types/node 26, and any future major; list them with `npm outdated`), one at a time, each
    with the full nightly suite, at a quiet time and never mid-milestone.

**Containment should look natural** (Kyler's note, 2026-09-24)

What Kyler measured (River Valley, seed 4242, 128², Normal):
- The dam site (D25) is a straight terrain wall with a gap. At y = 40 the valley floor is 7, and
  the ridge rises to 11, 5 tiles thick (x 60–64), with floor on both sides. Its plan: thickness 5,
  halfSpan 128, topLevel 11, crest 2, wobble 1.25. It runs straight across the whole valley,
  square to the river, until it meets high ground.
- The badwater basin is a square 7 × 7 box with a two-level rim. Its outlet ditch runs straight:
  x = 94 from y = 50 to y = 76.
- Lake Basin is a bullseye: an elliptical lake with evenly spaced ring terraces, and a straight
  walled outlet corridor.
- Canyon's dam site is a squared-off narrows.
- Drawn rivers in the editor raise their banks (D53), which can read as levees on sloped ground.
  (D184 removed drawn rivers from the editor; the generator's highland streams use the same river
  planner and raise the same banks.)

Keep what the water physics requires: sealed edge mouths; a lake's level set by its outlet sill;
a rim on every badwater basin (`water.badwater_contained`); reservoirs that meet high ground at
both ends. Change only the shapes.

**Delivers**
1. Measure first. A naturalness metric in the batch tools: the longest straight run of a height
   step, and how much a ridge's or rim's thickness and height vary along its length. Measure it
   on the 19 official maps and on generated maps, and set the targets from the official maps.
2. (Changed by Kyler's no-dam-ridge decision, PLAN §20 D111, and by D182 and D184: the generator
   builds no dam site at all from M9a on, and the editor has no set-piece tools, so this item
   applies only to M11's dam stamps.) Dam sites: a narrows between hillsides (two spurs closing
   in), with uneven thickness and height. Not a straight ridge across the valley.
3. Badwater basins: an irregular pit and a winding ditch, still passing
   `water.badwater_contained`.
4. Lake Basin: uneven terraces, not even rings; an outlet that isn't a straight corridor.
5. Canyon's narrows: a rock-like outline, not rectangles.
6. The river planner's banks (D53), which the generator's highland streams use: blend them into
   the ground beside them.
7. Notes 1–6 and 8–9 above, each closed with Kyler's answer (or its default) and a test.
8. **Keep M12 ready** (D134): the changed checks and shapes in the tools' answers ("why does this
   fail validation?"); suite requests; every reference solution re-run.

**Rules**
- Every check keeps passing (`water.storage_possible` included, D111).
- Batches stay at 98% or better.
- The Python oracle changes with the TypeScript, with 0 disagreements.
- This changes every map, so bump the generator version and note that old share links change
  (versioned deploys come in M13).

**Related work:** M9's interestingness score can use the same naturalness metric. M10's naturalize
brush is the editor version; consider sharing its smoothing with the generator.

**From the workshop study** (D87). Step 1 extends the naturalness metric M9 ports
(`investigation/workshop/lib/naturalness.ts`). The study already measured these on the official
and workshop maps (`workshop.json` `overall`; seeds 1–30 per theme at 128²); step 1 measures them
again with the batch tools and records the final targets:

| Measure | Official median | Workshop median | Generated today | Starting target |
|---|---|---|---|---|
| Steps in straight runs of 8+ (whole map) | 0.066 | 0.031 | 0.138 (Canyon 0.373) | ≤ 0.066 in every theme (#40) |
| Longest straight step run (whole map) | 18 | 17 | 27 (Delta 33.5) | ≤ 25, the official p90 (#40) |
| Ridge thickness variation along a ridge (CV) | 0.30 | 0.36 | 0.32 | ≥ 0.30 |
| Ridge crest height variation (std, levels) | 0 (p90 0.46) | 0.40 | 0 | ≥ 0.25 |
| Basin rim thickness variation (CV) | 0.25 | 0.31 | 0.18 | ≥ 0.25 |
| Dam-site reservoir rim thickness variation (CV) | 0.38 | 0.37 | 0.34 | ≥ 0.35 |
| Narrows shoulders: thickness variation (CV) | 0.45 | 0.43 | 0.42 | ≥ 0.40 |
| Narrows shoulders: height variation (std, levels) | 0.31 | 0.22 | 0 (River Valley, Highlands, Delta) | ≥ 0.2 |
| Shoreline in straight runs of 8+ | 0.12 | 0.06 | 0.22 (Canyon 0.46) | ≤ 0.12 |
| Water in 1–2-tile ditches (share of water) | 0.021 | 0.053 | 0.009 | report only |

The whole-map rows came from Map look, which changes no map file (decisions-pending #40). The shapes
this phase changes meet them; whole-map targets beyond those shapes (every terrace edge) wait for
Kyler.

**The dam site's spurs mode** (a `damSite` builder mode, PLAN §9.11) is how step 2 builds a narrows
between hillsides. The study's prototype (`investigation/workshop/recipes/narrows.ts`) replaces the
dam site with two tapered, bent spurs, each with a gentle apron, a cliff core and a cliff crown, of
different heights. Over 23 maps: the reservoir still holds on 22 (the miss: a 96² valley too
shallow for spurs that size, so the builder's limits must scale with the ground); a dam of 5 tiles
or fewer holds a Normal drought's water on 35% of maps (today 77%); the shoulders vary in
thickness (CV 0.37), but each crown is flat, so the crest heights within 12 tiles vary less than
today (std 0.45 against 1.56). Stepped crowns fix that: each spur falls 1–3 levels from root to
tip, in gentle or terraced steps, and the two spurs differ.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - every check passes on every batch map; batches per theme ≥ 98% final; the oracle shows 0
    disagreements; no built dam walls, nothing stamped;
  - Kyler approves the new shapes from captures.
- Information:
  - the naturalness metric for the 19 official maps and for the generated maps of every theme,
    with the targets set from the official maps recorded in PLAN §20;
  - the badwater basins, Lake Basin terraces and outlet, Canyon narrows, the highland streams'
    banks and M11's dam stamps against those targets;
  - the spurs mode, if the dam stamps use it: shoulder height std ≥ 0.25 and crest height std
    within 12 tiles ≥ 1 as targets (official medians 0.47 and 1.75).

**In-game check:** short, logged as pending (D11): build a dam at a new narrows and check that
the basin fills without leaking round the spurs.

**Effort:** xhigh.

**Release:** CLAUDE.md names no tag for this phase. It reaches `main` with the design pass
(`design-done`), which follows it.

---

## Design pass

After M11 and the refinement phase, and before M12. It is the Impeccable design pass with the
timbermods design system, moved here from M13. It follows the impeccable-app-flow skill
(timbermods/.github, `claude-skills/impeccable-app-flow/`) and leaves a DESIGN.md and a
MEANING.md behind.

From the workshop study (D87): the panel gains Variety and a **Surprise me** button beside
Generate (and Reservoir help, if Kyler adopts it: decisions-pending #31); the map card names the
premise and its landmark. Copy uses the catalogue's words (M9's list).

---

## M12. Claude integration

**Design** (D176): M12's new interface is built to the Frame pass's records (DESIGN.md and the
tokens), with the impeccable-app-flow's finish review on the new screens; no second full design
pass.

**The model** (Kyler, 2026-09-25; D139, D145 (7), D187; EDITOR_PLAN.md, Claude integration):
- **A summoned chat box.** A small chat box summoned with a key, which disappears when done. Many
  players won't use it, so it never takes permanent space.
- **Claude steers the generator** for character and new features: intentions and settings, then
  regenerate area with locks, checked with the analysis (below).
- **Precise edits are brush-style operations,** the editor's own: strokes (Raise, Lower with smart
  Lower near water, Flatten, Smooth, Naturalize; a size, a level, a path), sources (place, move,
  strength, clean or bad), placements from the shelf (the start, trees and bushes, ruins and the
  other objects), Remove, the Select tool's actions, and locks. Never landform, river, lake,
  set-piece or resource-area objects (D182, D184).

**Delivers:** the delivery choices from the M3 spike, built on the Claude groundwork (D88;
`investigation/claude/`).
- The chat box is built in the design flow's update mode, from the DESIGN.md and MEANING.md the
  design pass leaves behind.
- The step schema (EDITOR_PLAN.md, Claude integration, "Steps"; D89), revised to the model above,
  and how each step becomes operations; a feature-level map summary (at most about 16 KB; 3–7 KB
  measured). The groundwork's step kinds map as follows:
  - kept: `changeSettings` (steering), `undoLast`;
  - steering instead: `addSetPiece`, `changeSetPiece`, `addLandform`, `addLake` and new rivers
    become intentions and regenerate area (D139, D145 (7));
  - brush-style instead: `sculpt` becomes strokes; a precise new channel (`addRiver`) becomes smart
    Lower strokes and a source; `setRiverBadwater` becomes switching the river's sources to bad;
    `addResource` and `addMapObject` become placements from the shelf (trees and bushes painted in
    clusters); `removeResources` and `deleteFeature` on objects become Remove; `moveStart` places
    the start;
  - retired: `changeFeature`, `moveFeature` and `deleteFeature` on landforms, rivers, lakes, set
    pieces and resource areas: the editor no longer edits the generator's features as objects
    (D182). A follow-up on something Claude made re-steers it, or refines it with brush-style
    steps.
- The tools: `resolve_region`, `find_sites`, `measure`, `list_features`, `limits`, `dry_run`,
  `propose`. Each checks its own arguments and returns at most 32 KB. `find_sites` finds where a
  steered area, a stamp or a placement fits and checks each candidate with a real build;
  `list_features` summarises what's on the map, read back from the land and the generator's plan.
- The size-word resolver on top of PLAN §9.10 (D96), and M9's place resolver and judgement words.
- Compound requests (EDITOR_PLAN.md, Claude integration; D84): goals with their own expectations;
  settings and regeneration before placements, in the app's step order (D90); every goal checked
  on the combined preview; interference between goals detected and named; guards held for the whole
  proposal (D91); the nearest feasible alternative offered for every goal not met, never
  substituted (D92).
- Intent checks, and the loop's budget: 3 rounds and 10 tool calls for one goal, growing with the
  goals Claude declares, up to 6 rounds and 20 calls (D93; decisions-pending #28).
- **Claude steers the generator; it never hand-builds the map** (Kyler, 2026-09-25; PLAN, Product
  principles; D139). A request for character or new features ("make this valley harsher", "give
  me a huge dam opportunity halfway down", "put the start under a cliff") becomes intentions
  (outcomes, not recipes; D138) and settings; Claude regenerates the affected area steered toward
  them (M11's regenerate area, with locks on what the player wants kept), checks the result with
  the analysis, and reports honestly what emerged and what didn't. Requests that change the map's
  character ("harsher", "more vertical", "more varied") steer too, through settings and
  regenerating (Kyler, D145). Editor operations are for precise edits the player asks for ("move
  the start here", "widen this river by two", "delete that forest", "lock this area") and for
  precise follow-ups ("make it wider"), always as brush-style operations (D187). Which of the
  suite's requests steer is in M12-INTEGRATION.md §13; its operations for drawn rivers, lakes,
  landforms and resource areas are superseded by the model above.
- **"Describe the map you want"** (D139): a player types a sentence; Claude turns it into
  intentions; the generator makes several candidates steered toward them; the analysis checks
  which really have them; Claude shows the ones that do and says honestly what didn't emerge;
  editor operations only for small touches the player asks for.
- **A provider-neutral model layer** (Kyler, 2026-09-25; D140): the engine, tools, checks and the
  steering principle don't depend on the model; only a thin adapter talks to the model API.
  Claude is the default and the only provider built here: the Messages API adapter
  (bring-your-own-key, strict tools, prompt caching, configurable model, server-side fallbacks)
  and the suite runner. The design leaves room for an OpenAI adapter (a player's own OpenAI API
  key) later, tested with the same Claude request suite before it's offered.
- The artifact edition: a single-file build declaring `sample` and `downloads` only, and a `.zip`
  download.
- The Claude request suite (120 requests in 13 kinds, and those each earlier step added, D134)
  running in Node, with reference solutions (EDITOR_PLAN.md, Testing). The reference solutions for
  character and feature requests, Kyler's flagship requests included (the giant waterfall,
  S01–S04, and the compound request, M01; D145), steer the generator instead of building features
  with planners (D139); precise requests use brush-style steps (D187); requests marked "waiting
  for capability" are checked from the step that provides it. The requests whose reference
  solutions still add landforms, lakes, drawn rivers or resource areas get new ones in this model
  when the editor's old tools are removed; `docs/progress/docs-sweep.md` lists them, and which
  planners the generator and the groundwork still need.
- From the workshop study (D87): the catalogue is Claude's vocabulary. Each pattern a player might
  ask for is steered (an intention, and the generator's builder behind it, with regenerate area),
  or, when the player names an exact shape at an exact place, painted as a stamp (M11); never
  added as a landform object. The suite (EDITOR_PLAN.md, Testing) gains these requests:
  - "Add a spiral mountain in the north" → steer toward `spiral` up in the north third; "dig a
    spiral quarry" → `spiral` down.
  - "Put an island in a moat near the east edge" → steer, or the island-in-a-moat stamp.
  - "Make the lake heart-shaped" → the heart-shaped lake stamp painted over the lake, its level
    kept.
  - "Add a volcano that spills badwater, far from the start" → steer toward `cone` with a crater
    and a badwater source; the badwater distance rule decides "far".
  - "Twin waterfalls on the south cliffs" → steer toward two falls, the same facing, side by side.
  - "A hanging lake on a mesa that pours into the river" → steer toward a mesa with a lake on it,
    its outlet running down.
  - "A field of mesas with ruins on top" → steer toward `mesaField` with ruins on 2 tops.
  - "Split the river round a big island" → steer toward `riverFork`, or smart Lower strokes that
    cut a second arm.
  - "Make the dam site less obvious" → steer toward a less obvious natural narrows (dam
    opportunities only emerge from the terrain, D111); with Reservoir help, if Kyler adopts it
    (decisions-pending #31), help `some`, or none.
  - "Make this map more surprising" → a `specPatch` raising Variety, with the premise drawn again.

**From the Claude groundwork** (M12-INTEGRATION.md §1, §6, §8–§11). Build items:
- **Files that move** (the rest go in M9):
  - `lib/metrics.ts` → `src/core/analysis/features.ts` (`reservoirTiles`, `reservoirIsClean` and
    the lip measures move to the builders once they return them);
  - `lib/sites.ts`, `lib/steps.ts`, `lib/compound.ts`, `lib/intent.ts`, `lib/report.ts`,
    `lib/summary.ts`, `lib/tools.ts`, `lib/conversation.ts` → `src/claude/` (EDITOR_PLAN.md,
    Architecture: `claude-bridge`, headless, no UI); `steps.ts` and `sites.ts` move revised to the
    step kinds above, without the landform, lake and drawn-river steps;
  - `harness/bridge.ts`, `harness/loop.ts`, `harness/prompts.ts` → `src/platform/claude/` (a
    platform adapter, PLAN §19.9; route A's adapter joins it);
  - `harness/run-suite.ts` → `tools/claude-suite.ts` (nightly with a key; `--scripted` in CI);
  - `requests.json` and `bin/corpus.ts` → `tests/claude/requests.json` and
    `tools/claude-corpus.ts` (the corpus source stays code; the JSON is its output);
  - `bin/reference.ts` → `tests/claude/reference.test.ts` (a vitest suite, sharded by kind: it
    takes about 10 minutes in one process);
  - `lib/fixtures.ts` and `lib/synthetic.ts` → `tests/claude/fixtures.ts` (drop the Lake Basin
    fallback: the reopen bug was fixed after M7);
  - `bin/cli.ts` → `tools/claude-cli.ts` (for playing requests by hand);
    `bin/add-workshop-requests.ts` → `tools/claude-workshop-requests.ts`.
- **`src/` changes, made first** (§8):
  1. One undo entry for a whole proposal: `MapSession` gets a grouped entry (begin and end, or
     `applyAll` taking a `specPatch` first), so an accepted proposal undoes as one edit.
  2. Stable preview ids: a feature's id seeds its build (a dam site's ridge wobble), so
     `planPiece` previews take an explicit id, or the wobble is seeded from the request. (Only if
     steering still previews a set piece: the dam-site ridge is gone, D111, and Claude no longer
     places set pieces, D139.)
  3. Builders return what they measure: the dam site's reservoir tiles, the waterfall's lip, the
     badwater basin's footprint and outlet tiles (for the analysis and the intent checks on
     steered results).
  4. The Lake Basin reopen bug: fixed after M7 (9256161).
  5. The river badwater step: allowed for rivers that enter at a map edge (D80 builds them),
     refused with the reason for rivers that start inland. In the model above it switches the
     river's sources to bad, as the editor's Source does (D184).
  6. Step wrappers for M7's objects (§9): placements from the shelf, `addMapObject {kind, where,
     size}` for mine sites, relics, geothermal fields, thorns, weirs, plugs and unstable cores,
     with a site finder per kind and M7's placement emulation as the check. The planned
     `addSetPiece` wrappers for `plugSpillway`, `obstaclePayoff` and `secondDistrict` steer the
     generator instead (D139).
  7. Flow axes: nothing here; the resolver never assumes west to east, and M9 builds them.
  8. `regenerateRegion` (M11) for regional judgement words (D94; decisions-pending #43).
  9. Map objects in the way: the planners and `find_sites` try sites off map objects first; a
     piece that lands on one moves or clears it and lists it in the report (M8's rule, D87;
     decisions-pending #47).
  10. Performance at 256²: `find_sites` for a dam site takes about 3.7 s, and a three-goal
      compound reference about 24 s, mostly verifying candidates with real builds. A cached
      settle per candidate or a cheaper pre-filter comes before the artifact route, where each
      call blocks the page.
- **Re-tune the corpus** for M7's maps and objects. Against dev at 5b17375, 106 of 120 reference
  solutions passed; the 14 failures were new map objects in a creek's or a site's way (P08, C01,
  W05, W06, W07, X04, M04), regenerated maps whose sites changed (S03, S04, M02, V02), and the
  headline request's "start upstream" breaking `water.reservoir` on the harsher map (M01, and F07
  and F08, which use it). Give the start search a pre-filter for `water.reservoir`, as it has for
  water, trees and berries (since D85 it is a target with an advisory warning, and still a guard
  when it passed before the proposal, D91). None of the failures was the resolver or the tools
  misreading a request. Then move every reference solution to the model above: steering for
  character and new features, brush-style steps for precise edits (the requests and the planners
  they use: `docs/progress/docs-sweep.md`).
- **The workshop slot:** fill `requests.json`'s `workshopSlot` from the workshop catalogue
  (`investigation/workshop.json` `catalogue`) with `tools/claude-workshop-requests.ts`, then run
  the reference solutions of kind `workshop`.
- **Prompts and harness** (§6): one prompt pack for both routes. The instructions travel in the
  first user message (route A has no system prompt), then the map summary in a `<map_summary>`
  block (the cached prefix on route B; the map's own text in it is labelled as data), then the
  request in a `<player_request>` block with the selection. The Messages API request sets the
  model (configurable, default `claude-opus-5-5`, D8), adaptive thinking with its effort set,
  `tool_choice` auto, prompt caching on the last tool and the summary block, and server-side
  fallbacks, and handles the stop reasons refusal, `max_tokens` and `pause_turn`. The loop is
  append-only, measures its input every turn, and stops at 64 KiB with the artifact limits on.
  `tools/claude-suite.ts --scripted` replays the reference solutions through the same loop and
  grader, so CI covers the harness without a key.

**Acceptance** (Kyler's one rule, D115)
- Blocking:
  - malformed or out-of-bounds proposals are rejected cleanly, with the reason;
  - an accepted proposal undoes as one edit, like a normal edit;
  - every reference solution passes on its map (96², 128², 256², and 48² for the reductions),
    including the 20-block waterfall with the reported reduction on 48², the compound,
    impossible and conflicting requests (EDITOR_PLAN.md, Testing), and the workshop study's
    requests on 96², 128² and 256² maps (the intent checks measure the landmark: its extent, its
    levels, the slopes joining a spiral's steps, the fork's two wet arms);
  - every report says honestly what was built and what didn't emerge: every compound request's
    report names every trade-off and every goal not met;
  - no request's input passes 64 KiB with the artifact limits on;
  - no step adds a landform, river, lake, set-piece or resource-area object: character and new
    features steer the generator, and precise edits are brush-style operations (D139, D187);
  - results are ordinary land, editable with the brushes, and follow-ups change the right thing;
  - the chat box appears only when summoned and is gone when done; it never takes permanent space
    (D187);
  - the artifact edition passes a manual smoke test on the same requests;
  - "describe the map you want": the first good candidate appears quickly, and more stream in
    behind it while the player looks; waiting never feels like a stall; progress is shown and
    the player can act on the first result (D139).
- Information: with a key, the suite's pass rate with the artifact limits on (90% overall and in
  every kind as the target).

**In-game check:** play the map produced by "add a giant waterfall in the north part of the map
that is roughly 20 blocks wide", and the one produced by the compound request ("Make this valley
harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a
dangerous badwater route on the opposite side.").

**Effort:** xhigh.

---

## M13. Usability, problem reports, versioned deploys

**Design** (D176): M13's new interface is built to the design records, with the finish review on
the new screens; no second full design pass.

**Delivers**
- The usability tasks (EDITOR_PLAN.md, Testing), a shortcuts reference, a help page, an
  accessibility pass and a final performance pass. The first-run hints came with Live editing
  (D184).
- The rest of old PLAN milestone 6 (its design pass is now the Design pass step, before M12):
  - install help, including the extract step of the artifact edition;
  - a mobile layout for the generator page and the Real places gallery; the editor is
    desktop-first (D185);
  - versioned deploys at `/v/<version>/`.
- A plain **Report a problem** link to the repository's GitHub issues, for bug reports (PLAN
  §2.3). The rating form and `tools/ratings.ts` are dropped (Kyler, 2026-09-25; D145, which
  supersedes the workshop study's two-question form, D87).

**Acceptance** (Kyler's one rule, D115)
- Blocking: an old-version link reproduces its file; the **Report a problem** link opens the
  repository's GitHub issues.
- Information: the usability tasks' times (under 2 minutes each for a first-time user, and the
  full journey under 10, as targets); Lighthouse performance on desktop (≥ 90 as the target).

**In-game check:** yes, the full journey (EDITOR_PLAN.md, Testing, usability task 7): generate,
refine, ask Claude, export, load in Timberborn.

**Effort:** high.

---

## Build time-lapse

Near M13, with the sharing features (Kyler, 2026-09-26; PLAN §20 D205): replay a map's edit history
at speed from the generated map, with a camera that glides to each edit, and save it as a WebM video
to share. The history is already a list of operations that replay exactly (D158), so this reads it;
it adds nothing to the editor's screen until used.

**Blocking:** the replay matches the map exactly at its end; the page never freezes while recording.

---

## Later

**Later, proposed: a companion mod for one-click play** (Kyler, 2026-09-25; D163). A small mod
that lists newly saved Dam Good Maps maps in the game's main menu and starts one in one click,
building on what the DGM Probe mod already does to open a map. For Kyler's approval before it's
built.

**After M12: a Dam Good Maps MCP server** (Kyler, 2026-09-25; D141). M12's tools (generate, steer
with intentions, regenerate area, edit, validate, export) packaged as an MCP server, so Claude
Desktop, claude.ai or other MCP-capable assistants can build Timberborn maps with the same engine,
tools and steering principle as the app. A thin wrapper over M12's tool layer that inherits the
same honesty and "steer, don't hand-build" rules.

Each item below stays behind a feature flag until its own in-game check passes:
- seeps and an arid theme;
- aquifers;
- unstable cores out of Advanced;
- share links that carry small edit lists;
- a shared online stamp gallery;
- flood challenges: 4 workshop maps start flooded or in a badwater sea; they need a challenge
  profile that relaxes `start.dry` and `water.no_flood`, with a warning.

No longer planned: touch support (the editor is desktop-first, D185; pen pressure on drawing
tablets came with Live editing), and "make editable" detection for imported maps (the brushes edit
any map as it is, D182).

The workshop study's numbers for these (D87):
- **Caves, overhangs and tunnels** moved into 3D-a–3D-c (investigation/terrain3d; D118). Within the
  35 workshop maps made for 1.0 or later, 29 (83%) have cave or overhang columns; 46 of all 130
  are built round caves. NaturalOverhang bridges and badtide drains moved into 3D-b.
- **Terrain 17–22** moved into M9a, at high Verticality only, once a probe batch confirms it (D132).
  19 of 130 workshop maps (7 of the 35) reach above 16; no official map does.
- **1.0 objects are common in the workshop.** Within the 35: relics 91%, geothermal 86%, plugs
  94%, thorns 74%, seeps 74%, weirs 69%, aquifers 66%, unstable cores 63%, badtide drains 60%
  (official: 47%, 37%, 79%, 42%, 42%, 32%, 11%, 16%, 37%).
