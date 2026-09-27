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
  for "Generate, keeping my edits" and Claude's steering. No generator code is
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
- **"Keep M12 ready as we go" is suspended** (Kyler, 2026-09-25; PLAN §20 D134, D256; suspended by
  D277 until M12 begins). The rule had been: every step before M12 that adds or changes a way to
  edit or understand maps also exposes that capability to M12's Claude layer as a bounded,
  validated operation or query tool entry (the Claude groundwork's tools, `investigation/claude/`),
  adds requests for it to the Claude request suite, and re-runs every reference solution so the
  suite stays green. While Kyler refines Dam Good Maps, no step does this (D277); the suite leaves
  the regular checks and stays in the repository unmaintained. M12's first part, when it begins, is
  catching Claude up to the tools as they are then (see M12 below).
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
| M9 | Terrain, water and variety (staged M9a–M9b; M9c removed, D278) | PLAN §7.1, §7.9, §8, §12, §13 · the workshop study (D87) · the M9 design (D112) | a probe batch for M9a (D116) | xhigh |
| Look 2 | Map look 2: the High look, right after the forces' release, alongside "The page is the editor" (moved up, D284; folds in the Frame pass's touch-up, D283) | PLAN §20 D147, D284 | no | high |
| 3D-1 | Terrain above terrain, step 1: Foundations, starting alongside M9b | investigation/terrain3d/DESIGN.md §2–4, §9 · PLAN §10, §11, §19.6, §19.8 · D118–D122, D279, D280, D286 | the golden-fixture probe batch | xhigh until the lapse, then high |
| 3D-2 | Terrain above terrain, step 2: the view, after Map look 2 | DESIGN.md §6–7 · D126, D280, D281 | no | high |
| 3D-3 | Terrain above terrain, step 3: creating them (Erode, the block tool), after the view | EDITOR_PLAN Part 1 §9 · D182, D257, D258, D279–D281 | a probe batch (T5, T2 on edited maps) | high |
| 3D-4 | Terrain above terrain, step 4: generation, once M9b has settled | DESIGN.md §5 · PLAN §5.9 · D123, D132, D138, D280 | a probe batch (T1–T4, T6, T7; D145) | high |
| Weather | Weather view: the drought line and a map-card line, after the 3D stages (slimmed, D285) | investigation/cycles/, investigation/mechanics/ · PLAN §20 D133, D186, D253, D267, D269, D285 | none beyond D267's buttons | high |
| Design | Design pass, straight after Kyler's editor UI audit of the combined page (D236), alongside M9b | the impeccable-app-flow skill (timbermods/.github, `claude-skills/`) · old milestone 6 | no | high |
| M12 | Claude integration (deferred until Kyler resumes it, D277) | EDITOR_PLAN: Claude integration, Testing (the Claude suite) · PLAN §19.9 · the Claude groundwork (D88) · the workshop study (D87) · steering, a provider-neutral layer, the summoned chat box and brush-style edits (D139, D140, D187) | yes (the waterfall and compound requests) | xhigh |
| M13 | Problem reports, shortcuts and help, a final performance pass (slimmed, D285) | PLAN §2.3, §14, §15, old milestone 6 | none | high |
| Later | See the end of this file, now including versioned deploys, mobile layouts and the build time-lapse (D285) | PLAN §5.7, old milestone 7 · EDITOR_PLAN Part 1 §9 | per item | — |

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
- M9's stages: tagged `m9a-done` and `m9b-done` (M9c removed, D278); M9a goes public only after its
  probe batch passes (D116);
- the forces' release (Live editing), then Map look 2 (the High look) tagged `map-look-2-done`,
  right alongside "The page is the editor" (D284; folds in the Frame pass's touch-up, D283 (2); the
  Frame pass and its own tag are cut);
- the four 3D terrain steps: 1 Foundations (tagged `3d-foundations-done`), 2 the view (tagged
  `3d-view-done`), 3 creating them (tagged `3d-creating-done`), 4 generation (tagged
  `3d-generation-done`) — D279–D281, D286 (3), replacing the earlier `3d-a-done`/`3d-b-done`/
  `3d-c-done` split;
- the Weather view (slimmed to the drought line and a map-card line, D285 (2)): tagged
  `weather-view-done`;
- the design pass: tagged `design-done` (straight after Kyler's editor UI audit, D236);
  **housekeeping** (the former refinement phase's remaining items, D283 (3)) has no milestone, gate
  or tag — each item ships on its own, when convenient;
- after M12: Claude.

M9 depends only on M2 and can run alongside M8. Map look 2 (the High look) now comes right after the
forces' release, alongside "The page is the editor" (D284), instead of after the M9 build. The 3D
terrain steps run in their own new order (D280): step 1 (Foundations) starts alongside M9b; step 2
(the view) waits for Map look 2; step 3 (creating them) waits for step 2; step 4 (generation) waits
for M9b. The Weather view follows the 3D steps. Housekeeping has no fixed place; it is picked up
when convenient (D283 (3)).

**Investigations adopted after M7.** Their items are built in the milestones below, each marked
with its source:
- **The workshop study** (PLAN §20, D87): [investigation/WORKSHOP-INTEGRATION.md](investigation/WORKSHOP-INTEGRATION.md),
  with the findings in [WORKSHOP.md](investigation/WORKSHOP.md), the numbers in
  [workshop.json](investigation/workshop.json) and the tools, recipes and parameters in
  [investigation/workshop/](investigation/workshop/). Port only what a milestone needs, into
  `src/` or `tools/`, with tests: `lib/measures.ts` (mechanics flags, start quantities, score
  inputs), `lib/naturalness.ts`, `lib/variety.ts`, `lib/score.ts` and `obviousness.ts`. The recipes
  are reference implementations for the premises and builders, not code to ship as they
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
  in [DESIGN.md](investigation/terrain3d/DESIGN.md). Its text is the 3D stages below, and format 3's
  runs in M9a (I-1).
- **Simulation speedups** (D130, proposals):
  [investigation/simspeed/INTEGRATION.md](investigation/simspeed/INTEGRATION.md). The proven
  speedups join M9a's build plan, each with its bit-for-bit proof.
- **The techniques playbook** (D131, proposals):
  [investigation/techniques/PLAYBOOK.md](investigation/techniques/PLAYBOOK.md), for the M9 build
  and the 3D design. Its conflicts are decisions-pending #51–#53.
- **The first-pass audit** (D129): [investigation/audit/AUDIT.md](investigation/audit/AUDIT.md). A1
  and A2 go into M9a; A3 and A4 are housekeeping (D283 (3)).
- **Erode** (D281, held until Kyler has tried it, like the other forces' investigations):
  `investigation/erode`. A new force (wind and water wear rock into caves, alcoves, overhangs and
  arches) and a mesher for runs with undersides, both proposals for terrain above terrain's steps 2
  and 3. Built by the milestone session, not Codex, to save Kyler's Codex allowance.

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
   living trees. From M9a, D224 and D227: 250 / 200 / none within 20 tiles, and the starting-logs
   floor, 178 logs within 40 tiles' walk at every difficulty, which rejects every map below it.)
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
a translucent ribbon, foam at the lip, whitewater below, cascades as small falls. Built in the
Standard look; after Kyler's review (D215) one continuous sheet round the corners of a lip, with more
whitewater and splash where it lands, then released without another review unless it looks off
(`docs/look/waterfalls/`); Map look 2's High mode adds mist, spray and splash rings on the same falls.

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
D151 (no edge walls), and the starting-logs floor (D224, D227: at least 178 logs within 40 tiles' walk of the start).
Only those, and the file playing exactly as the editor shows it, gate a place (D245): a place is never dropped or moved to
other land for a playability check; its card notes, in a few plain words, only what would sink a player (no water a
pump can reach, too little wood near the start, water that keeps moving).

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

**Status:** built on `feature/badwater-source` (docs/progress/badwater-source.md), a PR into `dev`;
generator 0.6.3.

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
changes are built, and Carve with them, for the preview (`docs/progress/live-editing.md`).

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
   another); built from `investigation/erupt` (#50, ready, D216). Quake splits the land along a drawn fault (Lift
   or Slide, Power, Sheer or Stepped scarp, Try another); built from `investigation/quake` (#52, ready with Lift and
   Slide, D219). All four forces share one forces core, built on `investigation/forces-core` (#59, D220).
   Craterize (D202) simulates a giant impact (Strike or Aim, Power, Size, walls, centre, debris, Try
   another); built from `investigation/craterize` (#51, ready, D216). A small row
   beneath shows only the picked tool's options. The size ring is drawn on the land; strength shows
   only while Shift+scrolling. Toggles, off by default: square shape, precise mode, straight lines (level lines moved
   to the view buttons, D248). Flatten has "in steps" (terraces) and Ramped edges; a natural slope goes exactly where the player
   puts the shelf's Slope (D247 removed Smooth's walkable option; the start's reach updates live). Select opens with a key or a modifier-drag, with no permanent
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
   - **Glaciate** (D246), after the forces round 2: a fifth force that turns a valley into a glacial valley (a level floor
     between steep walls, a chain of lakes, hanging valleys, moraines and an outwash plain); Flow or Aim, Power, Size,
     Meltwater, Try another; about five seconds in two acts. Codex's `investigation/glaciate` is held until Kyler has tried
     its demo, then adopted onto the shared forces core.
   - **One height ceiling** (D244): after an in-game probe check of editor-made tall maps, every tool can raise land to
     D172's tall maximum on any map; a map above 16 becomes tall, and standard again at 16 or below; built with Unleash,
     on the preview, not released until Kyler has tried it.
   - **Unleash, on a source** (D239, with or right after the forces round 2): a selected source's small Unleash action
     (or U) carves its own river with Carve's engine, breaking out of a pool at its rim's lowest point; drag to aim;
     strength sets width, a quick Power sets how hard it cuts; Try another; one undo step; Esc stops it.
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
     map, at one brisk pace (small edits settle nearby in a second or two; D197, D268); the journey
     with pause, skip and replay (no follow: the camera only moves when the player moves it, D265);
     the Drought and Badtide buttons, day by day since D267 (the worst day at once, a day strip with
     play and Speed, the start's-water marker; an edit ends the hazard view, D269; the game's rules,
     from `investigation/cycles`); moisture spreading as the land greens; optional sounds of our own. The
     final water is always the game's settled result, at any speed.
   - **Carve** (D194, D216): a force of nature, the first of the forces group (key 7): Unleash and
     Aim modes, Defy gravity, a Power slider from creek to catastrophe; it forms gorges and valleys
     (D181). Built from `investigation/carve` (#47), keeping its full feature set (D199): Width,
     Wander, variation (bends wider and deeper on the outside, narrower on the straights), Try
     another path, Steep or Wide walls, Keep river or Dry canyon, oxbow lakes sealed by sediment, carving
     effects (no following camera, D265), Space to pause, Stop, Esc or Ctrl+Z to undo it
     instantly. On the preview until Kyler has tried it (D219).
3. **Left shelf:** a clean grid of icons, each a small render of the object in the map's look: the
   start, the water source and the badwater source (D212), pine, birch, oak, berry bushes, ruins,
   the mine site, relics, natural slopes, blockages, geothermal fields and thorns. Picking one shows a live ghost on the terrain, its footprint green
   where it fits and red where it doesn't, with a quiet reason ("needs flat ground"). Click places,
   R rotates, Esc puts it back. Scatter-type items (trees, bushes, ruins, thorns) place like a brush (D235, after the
   forces round 2): size and density, natural scatter only where the game allows it, gap filling, an Age option for
   trees, one undo step a stroke; unique landmarks stay single. Trees and bushes: click places one, drag paints many, naturally
   clustered at official-like densities.
4. **View buttons:** Orbit, Top-down, Reset view, Height colours, Level lines (D248), Markers, and the overlays
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
9. **Select, and the working area** (D254, D259; on `feature/forces` with the forces round 2, for Kyler's
   forces sitting): Select gets a small button on the bar beside the brushes (M and Ctrl+drag still open
   it), with Circle and Brush beside Rectangle and Freehand, and Same level becomes Wand, which also selects a river's or lake's visible water (D261); Set level reaches the map's
   ceiling, and Ctrl+click takes a tile's level as the target. Its actions stay exact, with hard edges.
   The working area is Select's open selection, with no second way of marking an area: while it is
   open every tool (the brushes, the forces, Clear sources) works only inside it, and land
   outside is locked, exactly as it is. Ctrl+drag with a brush out makes the selection and the same
   brush keeps painting inside it; with a brush or force picked, the Select row shrinks to a chip
   ("Working inside 40 × 40 · Esc to clear"), never two full rows; the selection stays open after a
   Select action until Esc or the × closes it. A feathered edge tapers a tool's effect toward the boundary, so
   edited land meets locked land naturally, never a cliff. To the forces, locked land is unbreakable
   rock: Carve turns away from it, lava pools against it, a crater's rim stops at it. Water is never
   locked: it follows the land inside and out. The locked land is visibly dimmed while the selection is
   open, and Esc clears it. Marking or clearing the area is not an edit; every edit inside it is
   still one undo step.
   **Water no source feeds recedes at once** (D260, on `feature/forces`): after an edit that changes what
   water is fed, the water no running source can reach drains away as part of the edit's own journey
   (within about a second on 128², two on 256², at once at Instant), a removed source's marker and label
   go the moment it is removed, and a stored oxbow lake keeps its water only while its hollow holds it.
   The preview's water once it stops still matches the canonical settle's.
10. **First run:** three one-line hints (paint the land, place things, add water), then never again.

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
("Generate, keeping my edits") shown growing, never a frozen wait; every stroke
an operation that replays exactly and survives regeneration and format 3; only changed chunks
rebuilt; keyboard access and screen-reader labels; saved projects keep their land exactly (any
landforms already in a project open as plain terrain). Until the design pass, new interface uses the existing
shared styles and components (D176, amended by D236). **Kept from M10** (D253): Naturalize never breaks
`slopes.connect` or a set piece's protected tiles, as tests on the brush as it is now; the
naturalness measurement against the official maps stays as information.

Built in pushes, water first, each put on the preview for Kyler.

**Alive, not mechanical** (D240, after the forces round 2, alongside the other editor work): short, visual-only animations
for the land (grow, sink and crumble, a ripple from the brush's centre, grass creeping over fresh earth, rock layers in
new walls), the water (gliding surfaces, a foaming front, rising basins, bursting falls, wet sheen and damp ground,
pulsing sources) and the moments (Generate's reveal, pops and topples, undo in reverse, a breathing brush ring, Save to
Timberborn's send-off, optional cloud shadows); synced with the sounds; off with reduced motion; GPU effects with capped
particles, measured on dense 256² maps and scaled down on weaker hardware. The final map and water never change.

**Blocking:** responsiveness (visible within one or two frames of the input; the display's frame
rate while painting on 256²; no main-thread stalls; cancel, undo and tool switches at once), and
breakage (strokes replay exactly; undo and redo always correct; nothing crashes; no edit lost; after
any edit the water ends exactly at the settled result, so exports are unchanged). Kyler decides when
it feels right.

**Later:** every future editing tool is live and brush-first from the start (D179, D182): the 3D
terrain steps extend the same brushes to caves and tunnels.

---

## The page is the editor (D232–D234)

After the forces round 2 and M9a's release (Kyler, 2026-09-26). **3D everywhere** (D232): the 2D toggle removed, with an
automatic fallback for computers that can't run 3D well. **The landing page's map is the editor** (D233): editable right
after Generate, the essentials around it (brushes, Water source and Badwater source, the forces), an expand button to the
full editor in true full screen (Keyboard Lock in Chrome and Edge; the browser window elsewhere), Generate and settings
changes undoable with a quiet note, a collapsed Legend button, Save to Timberborn from both, Real places opened the same
way, view-only on phones. **Your maps** (D234): the last 30 edited maps in this browser, stars kept forever, reopened
exactly as left, with rename, copy, undoable delete and a saved-to-Timberborn mark. The export row loses "Without
pre-filled water" (D237): the capability stays internal (the worker, the tools, the probe and the tests). Put on the preview; then Kyler runs
his editor UI audit, and the design pass comes straight after it (D236), so both judge the combined page and editor.
M9b doesn't wait for this step: it runs in parallel with it and takes the machine first when the two compete
(D236).

**Blocking:** breakage (no edit or map lost: expanding, returning, Generate over edits and Your maps keep every edit; undo
always brings the previous map back; storage failures said plainly) and what a player feels (expanding needs no reload;
the page never freezes; the editor never slows for the history).

---

## Map look 2: the High look

**Right after the forces' release, alongside "The page is the editor"** (Kyler, 2026-09-27; PLAN §20 D284; amends D147
and Map look 2's earlier place after the Map quality checkpoint, both cut, D283). High becomes the default on computers
that run it smoothly, with an automatic fallback to Standard (like the 3D view's fallback, D232); Standard stays exactly
as it is, and every High effect stays switchable. Measured on this machine's RTX 2070 SUPER to set where the fallback
starts. **Folds in the Frame pass's touch-up** (D283 (2)): the light update of the frame to the High look, done as part
of this adoption rather than as its own step. The 3D view (3D terrain step 2, "The view") follows it.

**Map look 3 and the vegetation are approved** (D241, D242): Codex's phase 1 of a higher-fidelity High look (#65,
`investigation/maplook3`) and its vegetation (#66, `investigation/vegetation`) are merged as investigations and adopted
into High here, with #38's water and soft shadows. Phase 3, "finish the world" (#67, `investigation/maplook-finish`: the
diorama edge, water's finishing touches including D231's three waterfall issues, refreshed objects and landmarks,
visible seasons for drought and badtide, the High poisoned soil), is approved too (D250) and adopted here, following its
INTEGRATION.md, with two additions: in a badtide, plants on contaminated ground wither as plants on dry ground do in a
drought (by the ground's own contamination); and every stage's cost measured on this machine's RTX 2070 SUPER on dense
256² maps, orbiting and painting, with which effects the lower-cost mode drops.

**Visible seasons** (phase 3's stage) waits until the Drought and Badtide branch has merged (D286 (4)), then joins,
built on that branch's day-by-day display, so the seasons aren't drawn twice.

**Queued for the next look pass on waterfalls** (D231; here or with Map look 3): the crown's per-tile curls (a repeating
pattern); the straight edge where a fall meets the pool (make it irregular and natural); froth that reads milky rather
than bubbly.

**Delivers**
- A graphics quality setting: **High** (chosen automatically on capable GPUs), **Standard**
  (today's clean look) and **Light** (the existing software-rendering look).
- High, each effect switchable (D242):
  - a proper water shader (#38): colour by depth, clear shallows, gentle ripples catching the light,
    shore and fall foam, badwater distinct; Kyler's direction: fewer, subtler sparkle flecks
    than the clean look, and more depth and transparency;
  - soft real-time shadows from a warm sun (#38);
  - Map look 3's lighting and materials (#65): warm sunlight, ambient occlusion, the colour-preserving tone mapping and
    colour grade, the subtle distance haze, the sky, rock strata, soil edges and colour variation;
  - the new vegetation (#66): distinct pine, birch and oak, blue-berried bushes, white birch trunks, bare dead branches,
    with its sway, its colours tuned to this lighting; the shelf icons and placement ghosts use the same models (D241).
- **Standard stays exactly as it is** (D242). Its trees switch to #66's models, without the sway, only if they cost little
  on real hardware (D241; the threshold is pending #83).
- High's water reads the shared water palette (`src/render3d/waterPalette.ts`, D177): the same
  colours, opacity, badwater blend and calibration as Standard, so the two never drift apart.
- Today's grass and dirt textures stay exactly as they are (Kyler likes them).

**Later, optional** (not part of this step): richer or higher-resolution textures, softened block edges and grass lips,
full-resolution rendering and anti-aliasing, more detailed bush and ruin models, and dry contaminated ground's cracks a
little more visible from far away. (Ambient occlusion, colour grading and the new trees came into this step with D241 and
D242.)

**Rules:** still our own art only, generated or modelled by us; never game assets. No map file
changes.

**Acceptance:** judged by eye against Kyler's reference screenshots: captures are shown to Kyler
and he decides. Speed numbers are information only, but no mode may feel sluggish on the machines
it's chosen for (blocking: what a player feels). **High's frame rate is measured on dense 256² maps before release**
(D242, D284), on this machine's GPU and with the automatic fallback checked.

**Release:** tag `map-look-2-done` and release it like a milestone.

---

## Design pass

Straight after Kyler's editor UI audit of the combined page and editor, which follows "The page is the editor" on the
preview (Kyler, 2026-09-26; PLAN §20 D236; before that it came after M11 and the refinement phase). It runs alongside
M9b, which takes the machine first. It is the Impeccable design pass with the timbermods design system, moved
from M13 and then forward to here. It follows the impeccable-app-flow skill
(timbermods/.github, `claude-skills/impeccable-app-flow/`) and leaves a DESIGN.md and a
MEANING.md behind: the design records every later interface follows (D176, D236).

From the workshop study (D87): the panel gains Variety and a **Surprise me** button beside
Generate (and Reservoir help, if Kyler adopts it: decisions-pending #31); the map card names the
premise and its landmark. Copy uses the catalogue's words (M9's list).

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

## M9. Terrain, water and variety

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

M9 waits for that approval.

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
- **Models and priority** (D210, amended by D262 and D278): the M9a build on Opus 5.5 at xhigh; M9b
  on `m9b-build` (Opus 5.5, xhigh, D262); routine work on Sonnet 5 at medium; M9a comes first when
  work competes for the machine. M9c is removed (D278): `m9-build` stays defined but unused.

**Staging: M9a and M9b, approved by Kyler** (2026-09-25; PLAN §20 D145; M9c folded into M9b, D278).
From design version 1 (`docs/m9-design.md` §16). M9 is built in two stages, each with its own
deliverables, acceptance and release, tagged and released like a milestone. What goes into each
stage waits for Kyler's approval of design version 2; M9b's own list below is D273–D278's, not
design version 1's.

- **M9a: terrain and water from processes** (tag `m9a-done`).
  - **Status (2026-09-27):** built on `feature/m9a` (PR #56), generator 0.7.0, with Kyler's answers
    D211 (settings), D213 (the last badwater spring), D224, D227 and D229 (the starting-logs floor,
    met the way the land offers it) and D252 (1) (starts stop looking alike: the map's own groves and
    patches first, the start rules' planting spread over the walk the way the land offers it,
    `tests/contract/startPlanting.test.ts`); natural ramps only climb cliffs and badwater ditches
    wind (D209); `dev` merged in (Live editing, the forces, the waterfalls). The generator is frozen
    again after D252 (1) (788c145); every batch on it is at 98% final or better, and the probe maps
    are rebuilt on it; the Claude suite is no longer an M9a gate (D277) (docs/progress/m9a.md). Kyler
    said yes on D252 (2)'s review set (D294). Left: the DGM Probe batch, then the release.
  - Delivers: the genome and the themes as priors; the field (uplift, erosion, levels) and the
    hydrology (rivers from the drainage, lakes, falls, pools, splits, deltas) in `src/core`;
    features read back out of the field (rivers, natural lakes, badwater hollows, the start,
    objects, resources); the settler; `water.storage_possible` in place of `water.reservoir`
    (information the generator prefers, not a guard, #67) and the dam-wall check, in both validators; the document model (a stored field, project format 3); the
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
    at high Verticality (70+): unlocked, since the tall-maps probe batch confirmed such maps load and
    keep their terrain, water and objects (run 20260925-tall, D172), and both validators allow up
    to 22. 3D-b extends Verticality to 3D forms. The vertical-reach measure joins the batch tools.
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
      dam-site ridge), and nothing stamped; **the starting-logs floor on every map** (D224, D227: at least
      the floor, 178 logs for 1.1.2.4, within 40 tiles' walk of the start, at every difficulty; Minimum
      starting wood counts within 20 tiles: Easy 250, Normal 200, Hard none beyond the floor); batches ≥ 98% final per theme at 96², 128², 192² and
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
- **The agent guide** (Kyler, 2026-09-25; D142): how a Claude Code session generates,
  edits, validates and exports maps, and runs the contact sheet and the DGM Probe (under the
  probe rule, D117). Waits with M12 (D277, D283 (4)), not written after M9a as first planned.
- **M9b: composition and variety** (tag `m9b-done`; M9c folded in, D278). **Read
  [docs/PERFECT.md](docs/PERFECT.md) and D252 first** (D225, D252): rewritten around five outcomes, judged
  by Kyler's eye against PERFECT, not only by the batches and the measures (D273).
  - **Status (2026-09-27):** in progress on `feature/m9b` (draft PR #70), generator 0.8.0, on M9a's
    frozen generator. Built: one readable water system (the main river first, tributaries joining
    it, courses checked to hold water end to end), Islands' sea in six layouts, the themes steered
    toward their promises and checked, the candidate choice, the ten new intentions, the 8
    orientations, names and the how-it-plays line, Another like this, Variety as a setting, and
    D298's game soil in the build and both validators (docs/progress/m9b.md). Left: the
    intentions' emergence, the Canyon and Islands promises, generation time, chaos, the tests for
    0.8.0, the contact sheet and the first review set. Defaults: decisions-pending #100 to #109 and #130 to #133.
  - **Delivers, judged as five outcomes** (D273; the measures below are information, not gates):
    1. **A readable water story:** a map's water can be followed at a glance, from where it starts,
       into a main river or lake system, to where it leaves; a few tributaries, never a tangle of
       small channels (information: the main system's share of the map's water).
    2. **Themes keep their promise:** each theme's signature must emerge, checked like an
       intention; a candidate without it is not chosen. River Valley: a main river through a broad
       valley. Canyon: a river cut deep between cliffs for a real stretch. Highlands: high, rugged
       ground with plateaus and valleys among it. Lake Basin: big lakes that dominate the water.
       Delta: a river splitting into several channels as it reaches low ground. Islands: land
       broken by water into islands, in many different layouts — its sameness is fixed here
       (archipelagos across the whole map, a sea off one edge, island chains, atolls; D209). Any:
       no promise.
    3. **Every map has a character:** at least one standout intention on every map, and its
       one-line description (D278) says something specific about it.
    4. **Any handful differs:** across any six maps of a theme, different openings, water stories
       and standouts, no two alike (information: no-clone and no-archetype).
    5. **Nothing looks stamped:** no perfect circles (irregular crater rims and round lakes), no
       ruler-straight lines, no theme stuck in one template.
    6. **Chaos:** Any at Variety 100 and Verticality 100 meets the same five outcomes too — wild
       land, still readable water, still a describable map; the batch pass-rate rule holds there
       as well; every review set includes four such maps at 256² (D252).
  - **Intentions** (D274, settles decisions-pending #66): Kyler's four (D165) and the seven already
    in the set, plus ten of design version 2 §6's fourteen candidates — the river loops back and
    leaves an oxbow lake; lakes step down the valley, each spilling into the next; the river splits
    around a big island and joins again below it; two waterfalls pour side by side over the same
    cliff; a long cliff splits the map into an upper and a lower world; side valleys hang above a
    wide valley floor, their streams falling in; two ways to grow (open farmland one way, wood and
    ruins up the cliffs the other); badwater spills through the richest land; a relic waits on a
    pinnacle; a plug holds back a lake. Left out: round bowls clustering, rice terraces, the
    strongest current far from home, the broad dry plateau over deep water. Each keeps Kyler's
    three principles (outcomes, failure allowed, many realizations, D138); one that almost never
    emerges leaves the set.
  - **Simplifications** (D275): recipes are folded into intentions — one concept, checked by
    outcome; the named premises that aren't already intentions become intentions or are dropped.
    Flow-direction variety comes from rotating or mirroring each finished map into one of its 8
    orientations, not from separate machinery: all 8 appear, none over a quarter.
  - **Candidate choice, names and Another like this** (D278, folded in from M9c): (a) the generator
    makes candidates until one meets the outcomes above (the theme's signature, at least one
    standout intention, readable water), within a capped number of attempts, showing the first
    candidate at once and progress after it, never a frozen wait; this replaces the 12-component
    score and K = 3; generation times at 128² and 256² are reported. (b) A name and a one-line "how
    it plays" description come from the map's standout intention and its read-back features, on
    the map card; outcome 3 above uses the description; names match the features on 30 hand-checked
    maps, 10 of them at Variety 100. (c) **Another like this:** one button on the generator page and
    in the editor makes one sibling per click (the same theme, settings and intentions, different
    land), with its own share link, never a clone (the no-clone check between siblings).
  - **Deferred** (D276): difficulty through terrain (PERFECT's Challenge section) is not part of
    M9b; it moves to a later step with its own design. The starting-logs floor and the start's
    guards stay exactly as they are.
  - **Also moved to M12, deferred with it** (D277, D278): the place resolver, the judgement-word
    table and river-course naming beyond what descriptions need (D84, D88); see M12 below.
  - **Kept** (D276): the Variety setting and Surprise me; river-network variety through the
    intentions and outcome 1 above; the openings, the weather-cycle signature and the strategy axes
    as information; the dam-wall check as blocking; Surprise me and high Variety may reach high
    Verticality now and then, most maps never do (D132).
  - Acceptance (D115, D252, D273): blocking: M6, the dam-wall check, finds no built wall; names
    match the features on 30 hand-checked maps (10 at Variety 100); the first candidate shows at
    once, with progress after it, and generating never feels stalled; Kyler's eye against PERFECT's
    Maps and Water sections on the review set (a contact sheet, 12 random maps in 3D, and the four
    Any maps at Variety 100 and Verticality 100 at 256², D252) — anything he names is fixed or
    explicitly accepted. Information: the design's measures M1–M5 on 200 seeds per theme at 128²,
    against their targets; the **permanent measures** (no clones, no archetypes, play variety, no
    approximation of workshop maps), reported on every milestone after M9 so no later milestone
    brings archetypes back unseen (design §10, §16; D112 (4); D278 (3)); in 100 seeds of each theme,
    all 8 orientations appear and none exceeds a quarter (D275).

---

## Terrain above terrain: Foundations, the view, creating them, generation

Carving is a brush, live from the start (D179, D182; EDITOR_PLAN.md Part 1, §9).

**In four steps** (Kyler, 2026-09-27; PLAN §20 D279–D281, amending D124's order and the three-stage
split this section used to have). The generator makes caves, overhangs and arches; the player
creates them with a force for the magic (**Erode**) and a **block tool** for precision; the water
engine makes water under roofs and between floors behave as in the game; the view draws it all. The
design is `investigation/terrain3d/DESIGN.md`, with the game's rules in `GAME_RULES.md`, the maps'
use of caves in `MAPS.md`, and the repository's heightfield assumptions in `INVENTORY.md`. Each step
is released like a milestone. Steps run on `build` (Opus 5.5, high; D281: one definition for all
building, no new one for 3D) except where noted.

**Testing throughout is kept to what a player would see go wrong** (D279): water that isn't what
the game does, generated maps changing when they shouldn't, saved projects not opening, terrain the
game would drop; no exhaustive measurement beyond that.

**Temporary reordering while Kyler's Claude allowance is high** (D286 (3), until Tuesday 2026-09-29
8:00 PDT, except this order, which stays after the lapse): step 1 starts now, but only its new
pieces that touch no existing module, so it doesn't collide with the water and generator code other
branches (the forces, M9b) are changing at the same time; the conversion of existing code to runs
waits until the forces and M9b have merged into `dev`.

### 1. Foundations (tag `3d-foundations-done`)

Starting now, on its own branch `feature/terrain3d-a`, alongside M9b (M9a and M9b keep the machine
first, D280 (1), D286 (1)–(3)).

**Now, new modules only, no existing module changed** (D286 (3)): the stacked-column water engine
as its own module, verified against the game itself — a DGM Probe batch of the test maps T1–T6 and
the official cave maps' own saved water (asked under D117, when the machine is free) — with its
results saved as **golden fixtures that CI checks on every push**; and the support-rule check. Runs
on Opus 5.5 at xhigh until the lapse, then on `build`.

**After the forces and M9b have merged into `dev`:** converting `core/terrain`, the build and the
TypeScript validator to runs, and wiring the new engine in (`build`).

**No Python copy of the stacked water engine** (D279; drops the item below that asked for one): 3D
water is verified against the game, not a second engine kept in step. The Python validator treats
water under roofs as information, with a note pointing to D279; heightfield water keeps its Python
check exactly as today.

**Delivers**
1. Runs per tile (`core/terrain`) as the build's, the document's and the kept content's terrain,
   with `heights` derived (D119). Formats 1 and 2 convert on read.
2. Stacked-column water with the game's rules (air gaps, overlap flow, pressure ×8, the overflow
   cap, roofs, and the five edge rules today's port simplified), with a fast path for one-column
   tiles; the 3D pre-fill and the canonical settle; the multi-slot writer (D120).
3. Soil moisture and contamination per run top.
4. Checks:
   - the support rule on every map, and the build's rule pass (D121);
   - the floor graph in both validators (D122);
   - plant clearance and first-run placement;
   - floor-aware slope and start checks; `start.dry` applies the floor rule (water counts only at
     or above the start's floor) to water under roofs only, and open water keeps today's rule
     until it's measured (Housekeeping, below; Kyler, D145);
   - `walk.levels`, `terrain.dropped`, `water.sealed_source`;
   - `terrain.single_floor` retired for generated maps.
5. Imports: roofed water simulated (D100's exception retires); the cave cause of approximate
   water retires (D98). Caves stay locked to the brushes until step 3.
6. The Probe's test maps T1–T6 (DESIGN.md §8): written now, played to produce the golden fixtures
   above.
7. ~~Moving the Live editing brushes and recorded strokes onto runs~~ moves to step 3 (D280 (1)).

**Acceptance** (D280 (1), replacing the full-batch acceptance this step used to have)
- Blocking:
  - generated maps are unchanged except their water's last digits, checked on a sample of seeds per
    theme, not full batches;
  - the golden fixtures agree with the engine's own output on every push;
  - the support check and the floor-aware slope and start checks are fixed and tested;
  - an unedited import still exports byte for byte;
  - saved projects open with the same land, and their strokes replay exactly;
  - progress shows while water settles, and the page never stalls.
- Information: on the official cave maps, the canonical settle matches each map's own water at
  least as well as the investigation measured, and moisture per run matches the stored slots on at
  least 18 of 19; budgets: the settle ≤ 3 s at 256² on generated maps (D33), no slower than today's
  on the official maps; the instant checks ≤ 50 ms at 256² with the support rule.

**In-game check:** the golden-fixture probe batch, asked under D117. **Effort:** xhigh until the
lapse (D286 (3)), then high (`build`).

### 2. The view (tag `3d-view-done`)

After the High look is adopted (Map look 2, above), so there is only one mesher to build (D280 (2)).

**Delivers**
1. One mesher for runs with undersides, in both looks, sky light and sun visibility in 3D, water
   per column, and Map look per run top (D126) — starting from the Erode investigation's mesher
   as a proposal (D280 (2), D281).
2. 3D picking and selections (the Select tool in 3D), and a level-slice cutaway.

**Acceptance**
- Blocking: unedited imports export byte for byte; the editor stays responsive (tool feedback
  within a frame, slower work in the background).
- Information: `bench:3d` with 3D maps, in its budget configuration (a build < 1.5 s at 256²,
  ≥ 60 fps with and without the cutaway).

**In-game check:** none. **Effort:** high (`build`).

### 3. Creating them (tag `3d-creating-done`)

After the view (D280 (3)).

**Delivers**
1. **Erode**, a new force, adopted from its investigation (`investigation/erode`, D281) onto the
   forces core, under the forces' principles (D257: bound only by nature; D258: no predicted route
   or outline). Wind and water wear rock: a cave or alcove at a cliff's foot, an overhang where hard
   rock caps softer rock, an arch through a thin ridge; the land decides which; every shape obeys
   the support rule; a click or a drawn sweep; Power, Size, Try another; two to four seconds of
   dust and rubble with CC0 sounds. Built by the milestone session, not Codex (D281); held, like the
   other forces' investigations, until Kyler has tried it.
2. **A block tool**, for precision: point at a block's face and click to add a block against it,
   drag to paint a layer outward from that face; remove blocks to hollow a cave; sized like the
   brushes; shows at once any block the game's support rule would drop.
3. **The brushes, forces and every recorded stroke move onto runs** (moved here from step 1, D280
   (1)): on a map with no 3D forms a stroke gives the same terrain as before. This supersedes the
   plan for cave carving to extend the top bar's Carve force (D182, D184; that plan is dropped —
   Erode is the magic tool and the block tool is the precision one, D279).
4. Undo and generate-keeping-edits. Imported caves become editable (D40 retires).
5. Claude and 3D (deferred with M12, D277): new 3D forms would steer the generator, and precise
   carving would use the block tool; the words land whenever M12 resumes.

**Acceptance**
- Blocking:
  - every stroke's or force's result drops 0 voxels: what would fall shows live, and is refused
    with its reason;
  - undo restores the exact runs, and an incremental build equals a full build after random edits;
  - unedited imports export byte for byte;
  - the editor stays responsive: tool feedback within a frame, and slower work in the background.
- Information: a stroke committed (rasterize, remesh, re-light) ≤ 100 ms at 256²; a dirty-chunk
  remesh ≤ 5 ms; usability: "dig a tunnel between two valleys" and "cut away to see a cave" in under
  2 minutes without help.

**In-game check:** yes (a probe batch: T5, and T2 on edited maps). **Effort:** high (`build`).

### 4. Generation (tag `3d-generation-done`)

Once M9b has settled (D280 (4)).

**Delivers**
1. **3D features as intentions**, under Kyler's three principles (D138: outcomes, failure allowed,
   many realizations) — "a natural arch", "a cave with a spring in it", "an overhang shading the
   start" — grown by the processes below and checked like M9b's other intentions, not built from a
   fixed feature-kind list.
2. The processes (DESIGN.md §5.2), run on M9's fields and drainage:
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
3. Verticality (`vt`, in the spec, share links and the panel from M9a, D132) extends to these forms
   (PLAN §5.9's table; D123). Themes carry their own defaults.
4. Traversal: derived slopes on the floor graph, and rewards planned on stairs-only heights.
5. Relief to 22 at Verticality 70 and above comes with M9a, unlocked: the tall-maps probe batch
   passed (run 20260925-tall, D172).
6. NaturalOverhang bridges and badtide drains in cliff notches (from Later).
7. The 3D measures in the batch and the M9 measure suite.

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
    models predict, with nothing visibly broken in its screenshots. This step is released publicly
    only after the batch passes (Kyler, D145; it replaces Kyler's own play of two maps).
- Information:
  - first attempts (≥ 60% as a target);
  - at Verticality 20: at most 2 small 3D forms at 128², relief within 16; at 80: the median map has
    ≥ 5 forms of ≥ 3 kinds;
  - the M9 measures, with the 3D inputs;
  - a whole 128² generation ≤ 3 s at Verticality 80.

**In-game check:** yes (a probe batch). **Effort:** high (`build`).

---

## Weather view

After the 3D stages (Kyler, 2026-09-25; PLAN §20 D133, D253; **slimmed by D285 (2)**, 2026-09-27:
the separate timeline and its plain-language summary are dropped; the strategy axes move to M9b as
information instead).

**Builds on** the editor's **Drought** and **Badtide** day-by-day buttons (D267, folding in D186's
separate view): a day strip, Speed, the start's-water marker and hover notes, built on their own
branch (`feature/weather-days`) and merged separately (D267 (9)). This step adds only the two things
below on top of those buttons.

**Delivers**
1. **The drought line** (D269's proposal): every lake and
   river shows a faint line on its shore where its water will stand on the last day of a drought
   (the length set in the day strip); a lake that would dry out shows a faint dry tint over its bed;
   the start's water is marked a little more strongly. It updates in the background after each
   edit, like the checks, and never blocks: feedback from the land itself, not a readout (D184).
2. **A map-card line** about the first drought and badtide, in one or two lines, from the model
   ("In a 7-day drought the river dries below the falls by day 3.").

**Dropped** (D285 (2)): the separate Weather-view timeline (Normal/Drought/Badtide phases, a day
slider, a legend and a plain-language summary) and the live-water timeline; the strategy axes stay
useful, but as information reported in M9b rather than fed from a Weather-view-specific pipeline.
Every claim still traces to the model and a verified rule, and never promises colony survival (the
catalogue's limit: economic timing is unverified).

**Acceptance** (Kyler's one rule, D115)
- Blocking: no map file changes; the drought line and the map-card line trace to the model and the
  verified rules; the drought line updates in the background and never blocks editing.
- Information: the probe batch's timing comparison with the model, if measured.

**In-game check:** none beyond what D267's buttons already have. **Effort:** high.

**Release:** tagged `weather-view-done` and released like a milestone (CLAUDE.md, Deploying).

**Proposals adopted from PR #33** (D173): the bit-identical speedups to the cycle model, each
re-proved step by step, and the scheduling: the first drought first when it's on screen, a
background start after generation, caching under the full input hash, cancellable batches.
---

## Pick a place

After the design pass, as one of the final features (Kyler, 2026-09-25; PLAN §20 D160, D166, D175,
D255; this replaces the earlier placement right after Live editing). It no longer waits for M11's
heightmap import (D253 removed M11): its conversion (real elevation to a Timberborn map — heights,
rivers, sources, the start, the starting-logs floor) is built for it from Real places' existing
conversion, running in the browser (D255). It is built to the design pass's records (D176, D236).
**Simplified** (D285 (3), 2026-09-27): a 2D map with shaded relief, not a flyable 3D view; the
preview builds when the player lets go of the square, not live while dragging; desktop only. Its
flow (search, frame, one click, share link, credits, D255's keep-the-land rule) is otherwise kept.

1. **Explore:** a **Pick a place** page beside Generate and Real places, with a 2D map, shaded
   relief drawn from the same AWS Terrarium elevation the conversion uses, and OpenFreeMap vector
   tiles for context (rivers, lakes, forests, roads, place names; no key, attribution shown). Search
   by place name with OpenStreetMap's Nominatim, on Enter only, within its usage policy. No
   satellite imagery for now. Never Google's data; pasting coordinates (for example from Google
   Earth) stays available. A planned fallback tile source (for example VersaTiles or Maptoolkit) if
   OpenFreeMap changes.
2. **Frame:** a square shows exactly what the map will cover. Drag and rotate it; resizing it
   changes the scale (metres per tile) within sensible limits; its real size shows ("7.7 km
   across").
3. **Preview inside the square, built on release:** when the player lets go of the square (not live
   while dragging, D285 (3)), the land inside is shown turned into Timberborn blocks at Timberborn's
   levels, so the player sees the map, not just the place, before building.
4. **Confirm with as little as possible:** map size (96, 128 or 256) and height (auto by default:
   tall when the relief deserves it, once the probe confirms tall maps). Scale, difficulty and
   water (designed by default) sit in an optional **More** drawer.
5. **One click, "Build my map":** a short progress strip (terrain, rivers, start, forests, checks),
   then the map appears in the usual 3D view with its name (from the place, no "Near") and a "how
   it plays" line, and everything works from there: the Weather view, Refine (Live editing), Save
   to Timberborn, Download, and a share link that rebuilds exactly this map. The share link stores
   the place, the framing, the settings and the elevation data's version.
6. **The framed land is kept** (D245, D255): only correctness and the starting-logs floor gate the
   map; anything short of the preference checks ships with a plain note saying what it lacks. The
   quiet retries never replace the player's framing, size or scale to pass the preference checks:
   it builds what they framed, with its notes, and may suggest nearby framings that would play
   better, which the player can take or ignore. Only a correctness failure makes it look elsewhere,
   and then it says so plainly.
7. **Desktop only** (D285 (3)); a phone version is not planned.
8. **Credits** as in Real places (D155): a short credit and link in each map's in-game description,
   the full notices on the credits page, and any region-specific notice the data's provider
   requires; ESA WorldCover (observed water, CC BY 4.0, D192) is credited like the
   elevation data, on the Pick a place credits and in each map's credits.

A "use my own heightmap" upload is not planned (D255); it could be added later on the same
conversion if Kyler asks.

It follows every current rule: designed water (sources only where water begins, D166, D171; the
designed-water prototype from `investigation/pickplace`, PR #34, merged, its INTEGRATION.md adopted as
proposals; where `investigation/pickplace-water2` differs, its designed water replaces #34's), no
walls or rims (D151), maps may drain (D152), Kyler's start requirements (D153, D164), and
official-like trees, ruins, mines and clusters (D167–D170).

**Blocking:** breakage (the map passes the validators and exports; the share link rebuilds it
exactly; attribution present; no edge walls; the starting-logs floor, D224, D227) and what a player feels (the explore view and the
live preview stay smooth; progress while it builds; never a frozen page; never a failed attempt
shown).

---

## Housekeeping (done when convenient, each with its test)

**The refinement phase stops being a milestone** (Kyler, 2026-09-27; PLAN §20 D283 (3), amending
D113, D142, D146, D238 and the phase's place in this file). Its **containment items** (the dam-site
wall, the badwater box, Lake Basin's rings, Canyon's narrows, the drawn rivers' banks — the shapes
the old "Containment should look natural" note and its naturalness targets covered) are **superseded
by M9a's processes and M9b's "nothing looks stamped"** (D273 outcome 5): the new generator's land
doesn't need a separate naturalness pass over stamped shapes, because nothing in it is stamped.
decisions-pending #29 (containment should look natural) and #13 (moot since D184) go with them.

Its remaining small items become housekeeping: no milestone, no release, no gate — each is fixed
when convenient, with its own test, on `chore/housekeeping` (routine, Sonnet 5, medium, D286 (5)):
- pending decision [#2](docs/decisions-pending.md): `plants.drought` warns on every River Valley
  map, because the berry bushes near the start grow on water that drains in a drought;
- pending decision [#12](docs/decisions-pending.md): narrow a generated fall's channel to 1–3
  tiles above the drop, for water wheels;
- pending decision [#21](docs/decisions-pending.md): the measured targets that move less than
  their formulas (flat share, one-level share, cliff share);
- **the load checks** (Kyler, 2026-09-25): the validators' load-class checks that real maps fail
  even though the game loads them (12 of 32 investigation maps fail one; decisions-pending
  [#8](docs/decisions-pending.md)). Keep a load check only where the decompiled game really rejects
  or breaks the map; otherwise make it a warning. Change both validators together;
- **`start.dry` and lakeside starts** (Kyler, 2026-09-25; PLAN §20 D107, D145): should `start.dry`
  count only water standing at or above the start's ground, so a lakeside start like Beaverome's
  passes? Measure how many official, workshop and generated starts it changes before deciding.
  Until then the floor rule applies only to water under roofs (3D terrain step 1);
- **done: the audit's A3 and A4** (PLAN §20 D129; investigation/audit/AUDIT.md; #72): `parse`
  (`src/core/format/json.ts`) now reads objects into null-prototype records, so a `__proto__` key
  stays its own data property, and rejects raw control characters inside strings, as `JSON.parse`
  does; each with its round-trip test (`tests/unit/format.test.ts`);
- **the held dependency upgrades** (PLAN §20 D150): TypeScript 7.0, `@types/node` 26, and any
  future major (list them with `npm outdated`), one at a time, each with the full nightly suite, at
  a quiet time and never mid-milestone;
- **done: the unused lock and regional-regrowth code** (#91; #72): D253 dropped locking part of a
  map and regrowing it region by region; their operations, fields and the stamp origin are removed,
  and an old project holding a lock still opens with its land as it was kept.

Every blocking check keeps passing (`water.storage_possible` is information the generator prefers,
#67); batches stay at 98% or better; the Python oracle changes with the TypeScript, with 0
disagreements, wherever an item touches generated maps.

---

## M12. Claude integration

**All work on M12 is deferred, its preparation included** (D277): no step before M12 builds or
maintains anything for Claude while Kyler refines Dam Good Maps — no new tool entries, suite
requests or reference-solution re-runs; the "Keep M12 ready" line each earlier step had is
withdrawn (D134 suspended). The Claude reference suite leaves the regular checks (CI, batches,
release checks) and stays in the repository unmaintained; a test that depends on it and breaks is
skipped with a note pointing to D277, not fixed. M12's first part, when it begins, is catching
Claude up to the tools as they are then.

**Moved here from M9, deferred with M12** (D277, D278): the words M9c would have built beyond names
and descriptions (D84, D88), left in `investigation/claude/` as they are until M12 resumes:
- river courses read from the actual flow: each river's path in flow order, from its settled water
  surface (else its bed), with its tributaries, and a name for each ("the main river", "the north
  tributary", "the river from the east edge");
- the place resolver (EDITOR_PLAN.md, Claude integration, "Spatial language"): compass places,
  places relative to a feature, and flow-relative places (upstream and downstream, a position along
  a river's course from its source, the start's bank and the opposite bank, "this valley"), always
  read from the river's actual flow, never from a compass direction; it returns the area, its
  reading and its assumptions;
- the judgement-word table (EDITOR_PLAN.md, Claude integration, "Judgement words"): each word's
  levers, measured targets, direction, size and guards.

**Design** (D176, amended by D236): M12's new interface is built to the design pass's records (DESIGN.md and the
tokens), with the impeccable-app-flow's finish review on the new screens; no second full design
pass.

**The model** (Kyler, 2026-09-25; D139, D145 (7), D187, D256; EDITOR_PLAN.md, Claude integration):
- **A summoned chat box.** A small chat box summoned with a key, which disappears when done. Many
  players won't use it, so it never takes permanent space.
- **Claude steers whole-map generation** for character and new features ("describe the map you
  want" and its candidates), and uses the forces for local change ("make the north mountainous"
  becomes Quake's Lift or Erupt; "add a big waterfall" becomes Carve or Unleash), checked with the
  analysis (below); the force steps B22–B27 are the model for local change (D256).
- **Precise edits are brush-style operations only,** the editor's own: strokes (Raise, Lower with
  smart Lower near water, Flatten, Smooth, Naturalize; a size, a level, a path), sources (place,
  move, strength, clean or bad), placements from the shelf (the start, trees and bushes, ruins and
  the other objects), Remove, and the Select tool's actions. Never landform, river, lake,
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
    become intentions, steering whole-map generation or the forces for local change (D139, D145 (7),
    D256);
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
  steered area or a placement fits and checks each candidate with a real build;
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
  principles; D139, D256). A request for character or new features ("make this valley harsher", "give
  me a huge dam opportunity halfway down", "put the start under a cliff") becomes intentions
  (outcomes, not recipes; D138) and settings, steering whole-map generation ("describe the map you
  want" and its candidates); Claude checks the result with the analysis and reports honestly what
  emerged and what didn't. A request for local change ("make the north mountainous", "add a big
  waterfall") uses the forces instead (Quake's Lift or Erupt, Carve or Unleash), on the model of the
  force steps B22–B27. Requests that change the map's
  character ("harsher", "more vertical", "more varied") steer too, through settings and
  regenerating (Kyler, D145). Editor operations are for precise edits the player asks for ("move
  the start here", "widen this river by two", "delete that forest") and for
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
  ask for is steered (an intention, and the generator's builder behind it); never added as a
  landform object or a stamp (D253, D256). The suite (EDITOR_PLAN.md, Testing) gains these requests:
  - "Add a spiral mountain in the north" → steer toward `spiral` up in the north third; "dig a
    spiral quarry" → `spiral` down.
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
  8. Regional judgement words: `regenerateRegion` is gone (D253); a word used about part of the map
     stays applied map-wide and reported as map-wide (D94; decisions-pending #43).
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

## M13. Problem reports, shortcuts and help, a final performance pass

**Slimmed** (Kyler, 2026-09-27; PLAN §20 D285 (1), amending old PLAN milestone 6 and this step's
earlier "Usability, problem reports, versioned deploys"). The formal usability tasks and their
timed targets are dropped; versioned deploys and the mobile layouts for the generator page and the
Real places gallery move to Later.

**Design** (D176): M13's new interface is built to the design records, with the finish review on
the new screens; no second full design pass.

**Delivers**
- A shortcuts reference, a help page, an accessibility pass and a final performance pass. The
  first-run hints came with Live editing (D184).
- Install help, including the extract step of the artifact edition.
- A plain **Report a problem** link to the repository's GitHub issues, for bug reports (PLAN
  §2.3). The rating form and `tools/ratings.ts` are dropped (Kyler, 2026-09-25; D145, which
  supersedes the workshop study's two-question form, D87).

**Acceptance** (Kyler's one rule, D115)
- Blocking: the **Report a problem** link opens the repository's GitHub issues.
- Information: Lighthouse performance on desktop (≥ 90 as the target).

**In-game check:** none.

**Effort:** high.

---

## Later

**Difficulty through terrain, its own design** (Kyler, 2026-09-27; D276, deferred out of M9b).
PERFECT's Challenge section (a harder map makes trees, easy land and easy dam sites hard to come by
early, through interesting terrain; Hard slows expansion and never starves the start; the puzzle
pays off) is not part of M9b's five outcomes. It needs a design step of its own, the way M9 did
(D108, D109); the starting-logs floor and the start's guards stay exactly as they are until then.
`docs/m9-design.md` §11's "difficulty as positions on the axes" is one proposal for it to consider.

**Versioned deploys and mobile layouts** (Kyler, 2026-09-27; D285 (1), moved out of M13): versioned
deploys at `/v/<version>/`, so an old-version link reproduces its file; and a mobile layout for the
generator page and the Real places gallery (the editor stays desktop-first, D185).

**The build time-lapse** (Kyler, 2026-09-26; PLAN §20 D205, moved out of M13 by D285 (4)): replay a
map's edit history at speed from the generated map, with a camera that glides to each edit, and save
it as a WebM video to share. The history is already a list of operations that replay exactly
(D158), so this reads it; it adds nothing to the editor's screen until used. Blocking, when built:
the replay matches the map exactly at its end; the page never freezes while recording.

**Later, proposed: a companion mod for one-click play** (Kyler, 2026-09-25; D163). A small mod
that lists newly saved Dam Good Maps maps in the game's main menu and starts one in one click,
building on what the DGM Probe mod already does to open a map. For Kyler's approval before it's
built.

**After M12: a Dam Good Maps MCP server** (Kyler, 2026-09-25; D141). M12's tools (generate, steer
with intentions, the forces, edit, validate, export) packaged as an MCP server, so Claude
Desktop, claude.ai or other MCP-capable assistants can build Timberborn maps with the same engine,
tools and steering principle as the app. A thin wrapper over M12's tool layer that inherits the
same honesty and "steer, don't hand-build" rules.

Each item below stays behind a feature flag until its own in-game check passes:
- seeps and an arid theme;
- aquifers;
- unstable cores out of Advanced;
- share links that carry small edit lists;
- flood challenges: 4 workshop maps start flooded or in a badwater sea; they need a challenge
  profile that relaxes `start.dry` and `water.no_flood`, with a warning.

No longer planned: touch support (the editor is desktop-first, D185; pen pressure on drawing
tablets came with Live editing); "make editable" detection for imported maps (the brushes edit
any map as it is, D182); and a shared online stamp gallery (D253 removed stamps).

The workshop study's numbers for these (D87):
- **Caves, overhangs and tunnels** moved into 3D-a–3D-c (investigation/terrain3d; D118). Within the
  35 workshop maps made for 1.0 or later, 29 (83%) have cave or overhang columns; 46 of all 130
  are built round caves. NaturalOverhang bridges and badtide drains moved into 3D-b.
- **Terrain 17–22** moved into M9a, at high Verticality only, once a probe batch confirms it (D132).
  19 of 130 workshop maps (7 of the 35) reach above 16; no official map does.
- **1.0 objects are common in the workshop.** Within the 35: relics 91%, geothermal 86%, plugs
  94%, thorns 74%, seeps 74%, weirs 69%, aquifers 66%, unstable cores 63%, badtide drains 60%
  (official: 47%, 37%, 79%, 42%, 42%, 32%, 11%, 16%, 37%).
