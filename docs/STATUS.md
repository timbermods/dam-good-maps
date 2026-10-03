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
  free: D455), STATUS and HANDOFF.
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
- **Timing cut (D453):** no quiet window, no timings; Lake Basin round 2 is adopted on its merits.
- **The Rust adoptions** (D442; a `build` sub-agent in `C:\Users\krams\code\DamGoodMaps-rust`): (a) the toolchain is built
  (`feature/rust-toolchain`: Rust 1.90.0 pinned, `rust/portable`, `tools/rust/check.ts`, CI's `rust` job, the whole-source
  guard); (b) the Rust water is wired, not switched on (`feature/rust-water`: `rust/water`, its Wasm committed,
  `RustWaterSim`, the native batch binary); the switch waits for M9b on dev (the Rust is re-ported to M9b's
  water.ts then); whether the artifact page keeps a TypeScript water without WebAssembly is Kyler's call. Rust is installed on this machine for the user only (rustup, host
  `x86_64-pc-windows-gnu`, as there are no Visual Studio C++ tools).
- **Flakes and a timeout:** `sources.spec` and `waterView.spec` (D341; `fix/sources-flake`); the `properties.test` 256² timeout
  (`fix/properties-timeout`).
- **A latent NaN in `pickStart`** (`src/core/gen/settler.ts`): fixed after M9b's measures.
- **Naturalize's sound** (D387 (5)): not started.
- **M9b follow-ups:** brushKit back on seed 34; the dodged spring test restored; look-waterfalls' High lip case back as an
  expected failure; the Header.tsx title change Kyler allowed as a one-time exception.

| Work | Branch | PR | Worktree | State |
|---|---|---|---|---|
| M9b | `feature/m9b` | #70 draft | `-m9b` | Islands (safe version, D430, D432) and Delta (D416) accepted; re-pins done, CI green at 49d87d74 or later; the 840-map measures are running (96² and 128² done, 0 failing absolutes); then the D148 re-pins |
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
4. **Waiting:** the Rust forces (#158 READY), the Rust water's switch and the TypeScript deletion (M9b on dev; the artifact
   spike's answer).

## Decisions open for Kyler (word for word)

1. **Byte-exact reopening (release gate, editor-core 1).** A project stores the unedited generated map plus the list of
   edits, never the edited map, so every reopen rebuilds the edits with the code that's running. When the build or the
   water changes between versions (M9b changes both), a project saved under 0.7.0 with any edit, the player's own strokes
   included, can export slightly different bytes under 0.8.0. An unedited project stays exact. #196 keeps the edits (a
   moved start stays moved, a deleted river stays gone) but can't make them byte-exact.
   - **(a)** Store the built map in the project at each save. A project then opens exactly as saved under any version, and
     later edits build on it. A project-format change; undo below the save point is either dropped or replays with the new
     code and doesn't come back exactly. Matches D367 part 1 (opening a stored map loads its stored state). Recommended.
   - **(b)** Keep what #196 does: the edits are kept and rebuilt by today's code, close but not guaranteed exact. D382
     allows it (no outside users; Kyler's maps keep opening).
   - **(c)** Versioned deploys (/v/<version>/, D285, in Later): an old project opens in its own version's code.
2. **Undo after a reopen (release gate, editor-core 7).** After a reopen (Your maps, the autosave's recovery), one undo
   takes back a single operation, not a whole step, because the project never stored which operations make one step.
   - **(a)** Save the step grouping in the project (an optional field per logged operation: where its step begins, and the
     step's label). Old projects open as today; an older app ignores the field. Recommended.
   - **(b)** Keep today's behaviour and say so in EDITOR_PLAN.
   - **(c)** A reopened map starts with no undo history (changes D1).
3. **Water 4.** An imported map's pond that no source feeds: the live water keeps it, the canonical settle and every export
   drop it. Which way should they agree: keep it (D260) or drop it (D385, D420)?
4. **Lake Basin round 2:** the permission system refused the M9b agent's step to bring its ported patch onto feature/m9b
   (flagged as integrating untrusted code). Allow it, or apply `investigation/m9b/quiet-window/lake-basin-round2.patch`
   (on `chore/m9b-quiet-window`) yourself.
5. **Naturalize's sound (D387 (5)):** its sound is chosen in `src/editor/juice/palette.ts` and `calibration.ts`, the page
   session's files. The page session, or this session as a one-time exception?

## Waiting for Kyler

1. **The README's three new lines on the forces** (keys, Power and Size, **Slow forces**): read them once as a player.
2. **Defaults he can overrule:** `docs/decisions-pending.md` (the High look's, #83 and #110-#117).
3. **Held Dependabot majors** #24 (TypeScript 7.0) and #25 (@types/node 26): a quiet housekeeping slot (D150, D283).

## The release gate (D385–D387)

Done: water from nowhere (#177), the settle fix (#175), Naturalize's land effect (#170), Islands (D430, D432; a known
shortfall: 12 of 30 seeds at 128² have no island to expand to, fixed by a round after the release) and the Real places
gallery (D421; amended by D445: show every place again, with a "No reachable water" note, queued before the release). Still blocking, per ROADMAP's "Before the next release": **Naturalize's sound** (D387 (5), not started);
**the coherence review** (D386), once Kyler is satisfied; and **M9b's own release steps** (the measures,
the re-pins, the tag).

## Probe batches

Run on this machine without asking (D218); each batch and its results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
