# Status

The current state, for Kyler. Rewritten at every step and stop; no history. The running log is the "Progress log" issue
([#57](https://github.com/timbermods/dam-good-maps/issues/57)); how to start and how things are run is
[HANDOFF.md](HANDOFF.md); the decisions are in [PLAN.md §20](../PLAN.md#20-editor-decisions); the order of work is the top
of [ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

## Released

Latest, all 2026-10-01 and live: `forces-done` (D375), `map-look-2-done` (D378, the High look) and `licence-agpl-done`
(D379, `main` at 87c73a0, generator 0.7.0). Every released step's tag: `git tag -l '*-done'`.

## The three sessions (D388, D398)

- **The milestone session** (Opus 5.5, high; the main clone, this machine) does everything except the page: the core, the
  water, the generator, the editor-core items, the Codex adoptions and the documents. It owns PLAN §20's numbering (next
  free: D451), STATUS and HANDOFF.
- **The page session** (Fable 5.1, high; `C:\Users\krams\code\DamGoodMaps-page`, `feature/page`) does only "The page is
  the editor" and its design (D384). PR #163 is a draft and the build is under way: the one-window page (header, New map drawer, Your maps, File menu, the address as
  the share link, Select always in hand) and Naturalize's worker wiring, its latest commit the browser tests on that page. Its Editor.tsx split (#169) is on `dev`. It records its decisions in `DESIGN.md` and `docs/progress/page.md`; the milestone
  session folds them into PLAN when its work merges. A control the core's items need is agreed through Kyler.
- **The renderer session** (Opus 5.5, high; Kyler's PC; `feature/moving-water`) builds moving water and the Flow view, then
  renderer R1. #165 is merged (247dd78a, D446) after its 6-cell check passed 6 of 6. It never edits PLAN, STATUS or HANDOFF.
  Next on its own PR: post-release items 1 and 2 (the quick-click bug; tests for an eruption in High and the highlight
  on High's basin sources, D378), merged when CI is green and its 6-cell check passes if it ran one.

## In flight

Worktrees are beside the main clone (`C:\Users\krams\code\DamGoodMaps-<name>`).

**The milestone session's work now:**
- **M9b's quiet window** (D414): runs at 02:00 on Saturday 2026-10-03; heavy work pauses for it.
- **The Rust adoptions** (D442; a `build` sub-agent in `C:\Users\krams\code\DamGoodMaps-rust`): (a) the toolchain is built
  (`feature/rust-toolchain`: Rust 1.90.0 pinned, `rust/portable`, `tools/rust/check.ts`, CI's `rust` job, the whole-source
  guard); (b) the Rust water is wired, not switched on (`feature/rust-water`: `rust/water`, its Wasm committed,
  `RustWaterSim`, the native batch binary); the switch waits for M9b on dev (the Rust is re-ported to M9b's
  water.ts then); whether the artifact page keeps a TypeScript water without WebAssembly is Kyler's call. Rust is installed on this machine for the user only (rustup, host
  `x86_64-pc-windows-gnu`, as there are no Visual Studio C++ tools).
- **Flakes and a timeout:** `sources.spec` and `waterView.spec` (D341; `fix/sources-flake`); the `properties.test` 256² timeout
  (`fix/properties-timeout`).
- **A latent NaN in `pickStart`** (`src/core/gen/settler.ts`): fixed after the quiet window.
- **Naturalize's sound** (D387 (5)): not started.
- **M9b follow-ups:** brushKit back on seed 34; the dodged spring test restored; look-waterfalls' High lip case back as an
  expected failure; the Header.tsx title change Kyler allowed as a one-time exception.

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| M9b | `feature/m9b` | #70 draft | `-m9b` | Islands (safe version, D430, D432) and Delta (D416) accepted; re-pins done, CI green at 49d87d74 or later; the 840-map measures are running (96² and 128² done, 0 failing absolutes); then the quiet window and the D148 re-pins |
| The page | `feature/page` | #163 draft | `-page` | Page session; the build is under way (see above) |
| Naturalize | `feature/naturalize` | #170 merged | none | On `dev` (D399–D424); its sound is not started |
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
| #158 | rust-forces | Draft; round 3 is there (portable maths, the 1% pilot passes all cells); its 99,000-check corpus waits for a window Kyler names, so adoption waits (D400) |
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

## Queued after tonight's quiet window (02:00, then the Naturalize bench, D434)

1. **A dev bug from the nightly suite:** a reopened project file loses the dead blueberry bushes that edits leave standing
   (D425), so its export differs (`properties.test.ts`, all four presets; dev at 478fefad fails too).
2. **An M9b bug:** after a force edit, a spring river's source row gets a new id (`groupIds`, #172), when the land shifts
   the row a tile (`editSequences`, every theme on M9b's maps); a fix may move source ids in every file (D382 allows it).
3. **M9b's Delta** (D447, blocks M9b's release): the water outcome misses on 5 of 20 at every size (planned river courses
   partly dry): trace from e3130755, fix with a failing test first, re-measure only what the fix reaches.
4. **`pickStart`'s latent NaN** (src/core/gen/settler.ts) where a tile has no walkable-land label.
5. **The gallery shows every Real place again** (D445).
6. **The third waterView.spec flake** (line ~144, the selected source group not visible after a click; D341).
7. **Resume:** the Rust adoptions (D442), M9b's release steps, #182, #184, #186 and #183 (merging as CI turns green).

## Waiting for Kyler

1. **The quiet window** (about 2 hours) runs at 2:00 on Saturday 2026-10-03 (Pacific; D414) and covers everything; this session pauses its heavy work for it.
2. **The README's three new lines on the forces** (keys, Power and Size, **Slow forces**): read them once as a player.
3. **Defaults he can overrule:** `docs/decisions-pending.md` (the High look's, #83 and #110-#117).
4. **Held Dependabot majors** #24 (TypeScript 7.0) and #25 (@types/node 26): a quiet housekeeping slot (D150, D283).

5. **The Rust water and the artifact spike (D381, D442):** the spike page (`tests/e2e/spike.spec.ts`, M12-era, D277)
   runs under the Claude artifact CSP, which refuses WebAssembly. Choose, before the TypeScript water is deleted (which
   waits for M9b on dev): (1) skip spike.spec with a note pointing at D277; or (2) keep the TypeScript simulation as a
   no-Wasm fallback for that page only. The Rust water's wiring lands first with TypeScript still running; the identity run,
   the switch to Rust and the deletion wait for M9b on dev (Kyler, 2026-10-03).

## The release gate (D385–D387)

Done: water from nowhere (#177), the settle fix (#175), Naturalize's land effect (#170), Islands (D430, D432; a known
shortfall: 12 of 30 seeds at 128² have no island to expand to, fixed by a round after the release) and the Real places
gallery (D421; amended by D445: show every place again, with a "No reachable water" note, queued after the quiet
window, before the release). Still blocking, per ROADMAP's "Before the next release": **Naturalize's sound** (D387 (5), not started);
**the coherence review** (D386), once Kyler is satisfied; and **M9b's own release steps** (the quiet window, the measures,
the re-pins, the tag).

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
