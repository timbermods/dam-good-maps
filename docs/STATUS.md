# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [PLAN.md §20](../PLAN.md#20-editor-decisions); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest: `m9b-done` (2026-10-04; exactly `m9b-rc1` at df70acce, generator 0.8.0; `main` at b407656, deployed, live
check passed). Before it, 2026-10-01: `forces-done` (D375), `map-look-2-done` (D378) and `licence-agpl-done` (D379). Every released step's tag: `git tag -l '*-done'`.

## The three sessions (D388, D398)

- **The milestone session** (Opus 5.5, high; the main clone, this machine) does everything except the page: the core, the
  water, the generator, the editor-core items, the Codex adoptions and the documents. It owns PLAN §20's numbering (next
  free: D467), STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; `C:\Users\krams\code\DamGoodMaps-page`, `feature/page`) does only "The page is
  the editor" and its design (D384). PR #163 is a draft and the build is under way: the one-window page (header, New map drawer, Your maps, File menu, the address as
  the share link, Select always in hand) and Naturalize's worker wiring, its latest commit the browser tests on that page. Its Editor.tsx split (#169) is on `dev`. It records its decisions in `DESIGN.md` and `docs/progress/page.md`; the milestone
  session folds them into PLAN when its work merges. A control the core's items need is agreed through Kyler.
- **The renderer session** (Opus 5.5, high; Kyler's PC; `feature/moving-water`) builds moving water and the Flow view, then
  renderer R1. #165 is merged (247dd78a, D446). It never edits PLAN, STATUS or HANDOFF.
  Next on its own PR: post-release items 1 and 2 (the quick-click bug; tests for an eruption in High and the highlight
  on High's basin sources, D378), merged when CI is green (D453).

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`).

**The milestone session's work now:**
- **Canyon and Highlands' height round** (the theme critique's first point; `investigation/canyon-highlands-height`,
  its PR into `dev`, labelled needs-kyler): a product change on both themes from 128² up, with the 96² round's rules,
  generator 0.9.0 and the contract tests re-pinned (D148); it waits for Kyler's eye on the sheets in `docs/sheets/`.

- **Timing cut (D453):** no quiet window, no timings; Lake Basin round 2 is adopted on its merits, on every Lake Basin
  map (Kyler, 2026-10-03: whatever its settings, intentions or siblings; `fix/m9b-generator-findings`, the release-gate
  generator hunt's fixes, `docs/progress/m9b.md`).
- **The Rust adoptions** (D442; a `build` sub-agent in `C:\Users\krams\code\DamGoodMaps-rust`): (a) the toolchain is built
  (`feature/rust-toolchain`: Rust 1.90.0 pinned, `rust/portable`, `tools/rust/check.ts`, CI's `rust` job, the whole-source
  guard); (b) the Rust water is wired, not switched on (`feature/rust-water`: `rust/water`, its Wasm committed,
  `RustWaterSim`, the native batch binary); the switch waits for M9b on dev (the Rust is re-ported to M9b's
  water.ts then); whether the artifact page keeps a TypeScript water without WebAssembly is Kyler's call. Rust is installed on this machine for the user only (rustup, host
  `x86_64-pc-windows-gnu`, as there are no Visual Studio C++ tools).
- **Flakes and a timeout:** `sources.spec` and `waterView.spec` (D341; `fix/sources-flake`); the `properties.test` 256² timeout
  (`fix/properties-timeout`).
- **A latent NaN in `pickStart`** (`src/core/gen/settler.ts`): fixed after M9b's measures.
- **Naturalize's sound** (D387 (5)): on dev (#198, D459): qubodup's "20 Rustles of dry leaves" (CC0), a stroke and a held-stroke bed; Kyler judges it by ear.
- **M9b follow-ups:** brushKit back on seed 34; the dodged spring test restored; look-waterfalls' High lip case back as an
  expected failure; the Header.tsx title change Kyler allowed as a one-time exception.

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| M9b | `feature/m9b` | #70 draft | `-m9b` | Islands (safe version, D430, D432) and Delta (D416) accepted; re-pins done, CI green at 49d87d74 or later; the 840-map measures are running (96² and 128² done, 0 failing absolutes); then the D148 re-pins |
| The page | `feature/page` | #163 draft | `-page` | Page session; the build is under way (see above) |
| Naturalize | `feature/naturalize` | #170 merged | none | On `dev` (D399–D424); its sound on dev (#198) |
| Parity with the game's editor | `feature/parity` | #95 draft | `-parity` | Follows M9b (D337-D339) |
| Drought and Badtide, day by day | `feature/weather-days` | #73 draft | `-weather` | Held for Kyler's sitting; after the page |
| 3D terrain, step 1 | `feature/terrain3d-a` | #71 draft | `-3d` | The reference: its TypeScript stacked engine is never adopted; Codex ports it into the Rust water crate after the Rust water's adoption, then the foundations step wires the Rust engine in (D448) |
| Real places, round 2 | `feature/real-places-2` | #35 | `-places` | Parked by Kyler (D319); CI red is expected |
| Source groups, the rule | `feature/source-groups` | #79 draft | `-groups` | Redundant: `sourceGroups.ts` is already on `dev` |

Merged into `dev` today: #159, #160, #161, #162, #164, #107, #166 (dam sketch round 2, not adopted, D403), #167 (Remove unfed
water and Fill), #168 (Rust threads, parked, D402), #169 (Editor.tsx split), #170 (Naturalize, D399–D424), #171 (portable
maths, adopted narrowed, D401), #172 (a re-derived spring keeps its id), #173 (the `forceKeys` flake), #174 (the roofed-map
notice), #175 (the sealed settle, D413), #176 (random operations include Fill and Remove unfed water), #177 (water from
nowhere, D385/D420), #178 (no edit adds objects, D425), #179 (Real places gallery, D421), #180 (Your maps sizes) and #181
(bench-brush on the worker path).

Codex's investigations (each on `investigation/<name>`; Codex builds, the milestone session merges and adopts; Kyler's
verdicts are in ROADMAP, "The Codex adoptions"):

| PR | Investigation | State |
|---|---|---|
| #158 | rust-forces | Draft; round 3 is there (portable maths, the 1% pilot passes all cells); no identity corpus (D453); adopted when CI's byte-identity checks and the suites pass |
| #156 | rust-water | Draft; approved; in the browser per HANDOFF's policy; unchanged |
| #155 | gen-speed | Approved; rounds 1 and 2 adopted on M9b |
| #153 | small-starts | Approved; adopted on M9b |
| #152 | perf-audit | Approved; its roadmap guides the speed work |
| #150 | short-codes | Approved; findings into COLLAB-BRIEF |
| #132 | scaling | Draft; round 4 approved for adoption |
| #130 | parallel-water | Draft; approved; the multi-core path |
| #157 | rust-analysis | Merged (#160), approved; adopted after M9b's release (D391) |
| #159, #166, #107, #168, #171 | dam-sketch 1 and 2, performance, rust-threads, portable-math | Merged as investigations; see above |

## What the page session needs from the milestone session (in order; Kyler is pinged as each lands on `dev`)

1. **The water-changed signal** (D387 (1)): on `dev` (#164).
2. **Remove unfed water and Fill** (D387 (2), (3), D394): on `dev` (#167): `unfedWater` and `planFill` in
   `src/core/doc/waterEdits.ts`; operations `removeUnfedWater` and `fillHollow`. The settle fix (#175) changed no API.
3. **Your maps' size field** (#180): on `dev`.
4. **The brush patches** in `docs/progress/naturalize/`: `brushes-worker.patch` replaces `brushes-coalesce.patch`.
5. **With M9b's release:** its candidate events, Sources: Placed - None, and the automatic water fix (APIs in
   `docs/progress/m9b.md`).
6. **Later:** the service worker for startup part 2 (D397), with multi-core water's adoption.

## The milestone session's queue

1. **Done today:** the reopened project's dead bushes and `pickStart`'s NaN (#194); the gallery (D445, #193); the flakes
   (#182, #184, #195 merging); the Rust toolchain (#187) and the Rust water's wiring (#189).
2. **M9b's Delta** (D447, blocks M9b's release): the main cause fixed (adb8037a: the fan's arms drained the main river);
   the remaining misses are tributaries skirting lower water in shared code; fixing that, re-measuring every theme it
   reaches, then the D148 re-pins.
3. **An M9b bug:** after a force edit, a spring river's source gets a new id (`groupIds`, #172) when the land shifts its row;
   fixed after Delta (D382 allows re-pinning source ids).
4. **Recorded 2026-10-03 (D455–D460):** D456's step grouping saved in the project and D457 (an imported map's own water
   kept), both fixing on `dev`; D458 (Lake Basin round 2 onto `feature/m9b`, M9b); D459 (Naturalize's sound, in
   `palette.ts` and `calibration.ts`; tell Kyler when it is on `dev`); D460 (the Dependabot majors, after M9b's release).
5. **Waiting:** the Rust forces (#158 READY), the Rust water's switch and the TypeScript deletion (M9b on dev; the artifact
   spike's answer).

## Decisions open for Kyler (word for word)

Nothing waiting. His answers are PLAN §20 D455–D460.

## Waiting for Kyler

Nothing waiting. The coherence review (D386) waits for his word, when he is satisfied.

## The release gate (D385–D387)

Passed: M9b released as `m9b-done` (2026-10-04, [#217](https://github.com/timbermods/dam-good-maps/pull/217)). The coherence cleanup
keeps merging into `dev` in order (D462, D463); Islands' known shortfall (12 of 30 seeds at 128² with no island to
expand to) is fixed by a round after the release.

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
