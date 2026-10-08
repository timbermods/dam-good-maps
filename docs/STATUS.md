# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-07, the milestone session runs on Kyler's PC (clone `C:\Users\Kyler\code\DamGoodMaps`), shared with the renderer
session, which comes first: local runs use about half the threads and CI does the rest; probe batches need Kyler's yes in
chat (D117). The page session is stopped (its worktree is `DamGoodMaps-page`); the probe folder is
`DamGoodMaps-probe`.

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0). After it, two releases that changed `main` only:
`roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex) and `needs-kyler-ping-done` (the label pings Kyler's phone).
Every released step's tag: `git tag -l '*-done'`. `dev` is far ahead of `main`: the next release is Kyler's call.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It reviews every PR, merges, releases and hands out
  decision numbers (**next free: D483**). It owns STATUS and HANDOFF.
- **The page session** is stopped (2026-10-07, on Kyler's word): "The page is the editor" is on dev (#347), `feature/page` holds
  nothing of its own, and nothing is queued until 3D's step 3 needs the Block tool's interface. To resume: the top of
  `docs/progress/page.md`; no page work starts without Kyler's yes. Worktree `DamGoodMaps-page`.
- **The renderer session "forces play"** (Kyler's PC, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play: #311, #322 (Craterize), #275, #225 and #323 (#312's renderer part) are merged. Next: #329 (the lake
  jump), #312's worker part now the page part is on dev, and Deposit's outline (#348, on `fix/deposit-outline`; its Rust is a core
  change, reviewed with a full CI run when its PR comes).
- **Codex** (both machines) builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. Everything merges through the milestone session's review and green CI; human-facing ones need
`approved` (D470); Rust and core PRs also need a full CI run by hand (`gh workflow run ci.yml --ref <branch>`), since a PR
into `dev` runs only the light set and the merge-queue ruleset doesn't exist yet.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| #329 | A force starts from the water on screen (the lake jump) | forces play | `needs-kyler`: at /preview/ since 2026-10-07 (25f7eca8, dev and the page editor merged in; checked live). After Kyler's try: merge if he approves, and put the page editor's own preview back (D477) |
| #348 | Deposit: nothing changes outside its outline (#341) | forces play | `needs-kyler`. Kyler judges it by using it: only once his verdict on #329 is in, publish #348 at /preview/ with the page editor (D477) and ping him. Its Rust is a core change: review with a full CI run before it merges |
| (branch) | 3D, step 1: Foundations (D481, D280 (1)) | milestone | `feature/3d-foundations`, worktree `DamGoodMaps-3d-foundations`, `build` agents; the stages are in `docs/progress/3d-foundations.md`. **Stage 1 is merged** (#354, 2026-10-07: the terrain in memory as runs; 84 generated maps and all 22 official maps byte-identical through import, project, reopen, strokes and export). **Stage 2 is merged** (#355, 2026-10-08, `approved`: the support check on every map with terrain above terrain; slope and start checks read the floor an object stands on). **Stage 3 is PR #369** (`needs-kyler`; worktree `DamGoodMaps-3d-foundations-3`): the floor graph in `rust/checks`, three new rows live (walking between levels, a sealed water source, room above plants) and D482; generated maps unchanged, all new rows passing on them; on imports "Slopes connect" turns into a warning on seven maps and the sealed-source warning shows on three. Five small choices are Kyler's on the PR (the walking row isn't visible in today's editor; the 400-tile area size; singular wording; the dropped-ground row built but not yet fed by the build; a broken slope on an import only in the full check). Full run 37751415225. `checksWasm.ts` must be rebuilt from the merged Rust when stage 6's rest merges after it. **Stage 4 is merged** (#356, 2026-10-07: the multi-slot writer, the engine's core binding `src/core/sim/stackWater.ts`, the T1–T6 writers; nothing in the app calls them). T1 and T2 are byte for byte the files the game played; T3–T6 differ only in water tokens (nine digits since #310, seven in the played files; at most 6e-7), so they go into stage 6's probe batch. **Stage 5 is merged** (#357, 2026-10-08: the stacked engine behind one switch in the canonical settle, `WaterModel.stacked`; the terrain decides the path, and no map the app builds takes it yet; 84 generated and all 32 official, workshop and user maps byte-identical through export, a stroke, save and reopen). **Stage 6, first part, is merged** (#358) (`feature/3d-foundations-6`: a sink in the stacked engine, from the game's own code, not yet played; nothing a player sees; merged 2026-10-08). **Stage 6, the rest, in work** on `feature/3d-foundations-6b` (worktree `DamGoodMaps-3d-foundations-8`, a fresh `build` agent): imported caves' water simulated, with Kyler's choices (#359, recorded under D280): on cave maps only the water settles in the background with progress; Drought and Badtide, Fill and Remove unfed water refused with one line; the notice and the layer renamed "Caves and overhangs" (the milestone session edits the page's three files for it). It ends as a `needs-kyler` PR. The probe's Terrain 3D group is on dev (#360: predictions from the Rust engine; T3–T7 written to `C:\dgm-probe\terrain3d-2\`; the sink is the ninth identity fixture, marked not game-verified). **The batch (#361) had Kyler's yes but did not run:** Timberborn on this PC updated to 1.1.2.7 and the runner refuses a batch until a smoke run passes. Asked again in chat (2026-10-08) for the smoke run (1 map, a few minutes) and then the batch with `--allow-new-version` (5 maps, about 12 minutes): two launches. Run only on his yes, from merged dev (`npm --prefix investigation/probe run batch -- --group "Terrain 3D" --keep-mods` prints the plan and a one-time code). A second batch (an edited Hollows and Canyon) follows #359. |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Parked until after the Weather view |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler |

## Left for the next milestone session, in order

1. **Merged on 2026-10-07:** #344 (Naturalize rule 5, D479) and #343 (@types/node 26). Nothing else merges unless green
   and approved.
2. **Canyon and Highlands is merged** (#261, generator 0.8.8, 2026-10-08): the main river's walls at Canyon 128² a median 6.3
   levels (2.8 before); all three outcomes of 20 at 96² / 128² / 256²: Canyon 14 / 15 / 13, Highlands 14 / 17 / 16. The
   generator queue is empty. D480's extension is merged too (#366, generator 0.8.9: the main water is never dropped from the
   story for being mostly badwater; no map's land or water changed). **Islands round 6 is merged** (#235, generator 0.8.7, 2026-10-07; all three outcomes of 30: 96² 28, 128² 27, 256² 30).
   Generation takes more attempts than the round Kyler approved (96² mean 13.2 against 4.9): a look for later.
   **River Valley round 2 is merged** (#346, generator 0.8.5, 2026-10-07; Kyler approved). Held with it: naturalizeNature's
   River Valley 6 beside Lake Basin 3, one known gap under D479. Kyler's two looks for later, not blocking: seed 9's start
   beside an all-badwater main river (it missed readable water before the round too) and seed 20's new badwater pool. Then Islands round 6 (#235), then
   Canyon and Highlands (#261), one re-pin each with sheets.
3. **The page is on dev** (2026-10-07): #163 squashed as #347 (merge 59b4f1e9, from feature/page 5faf94d8), #163 closed. The
   350 earlier captures are in the pre-release `page-design-2026-10-07`, linked from DESIGN.md; D352 is amended (Glaciate last;
   1 Select, 2–6 the brushes, Shift+1–7 the forces, M Markers). The page session restarts `feature/page` from dev. Folded into docs/decisions
   (#362): the page's rules are amendments to D184, D205, D235, D330, D352 and D133; DESIGN.md stays the look's record.
4. **TypeScript 7 is merged** (#342, 2026-10-07, ec107345; full run and nightly green); every clone and worktree needs
   `npm ci`. **#329** is at /preview/ for Kyler's try, as in the table.
5. Then (D481): 3D Foundations first, in work; after it the Weather view, custom map sizes (D357; #313's "every side from 4" question is Kyler's then), the dam sketch after the
   Weather view.

Done on 2026-10-05 and 06 (details on #57): #319, #304, #321 (tag `ts-checks-final`), #311, #265, #322, #324, #325, #275,
#225, #323, #327, #328, #331, #333, #326 and #332 (records), #334, #336 (record), #337, #330 (D476), #338, #340, #339; Drought
reserve held for settings round 2 and Designed for off that list (D466).

## Expected failures, in one place

Tests marked as expected failures, each a named gap. One comes off the list only when its gap is closed, never by moving it.

| Test | Gap | Since |
|---|---|---|
| naturalizeNature: Lake Basin 3 and River Valley 6 at Terracing 100 | Naturalize on cliffs whose foot can't rise (farmland, D418). Both come off together, the next time Naturalize gets real work, judged on a sheet; first check whether the level-edge count scores a stepped slope as younger than the tall cliff it came from (D479) | #339, #346 |
| maxWaterDepth: seed 5's pit ends 0.07 over the number | The pit's water past the bound (seed 3 until 0.8.5, the same shortfall) | M9b |
| draftWaterQuiet: Lake Basin seed 7's lake still fills at the four-day preview cap | A draft's water that never ends settled on that map | before 2026-10-07 (missed in this list's first version) |
| startPlanting: "no two starts get the same ring" (0.442, bar 0.45) | Sea-map starts: two Any maps that roll a sea layout lean less. Kyler, 2026-10-07 | #235 |
| settings experiments (nightly): Verticality, Drought reserve, Lakes and basins, Waterfalls | Settings round 2 (D466) | 2026-10-03 |

## To look into (the milestone session)

- `tests/e2e/start-edit.spec.ts:64` (a thorns click not registering) fails on this PC about four runs in six alone, on dev's own code; CI passes it. No test stays known-flaky (D341): find the cause.
- Two local-only tests fail on dev with the official maps present (CI skips them): `mechanics.test.ts` (Oasis is not reported approximate) and `water.test.ts` (975 ticks gives 0.00106, limit 0.001).

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (today:
#329, #348, #369). The probe's smoke run and batch (#361) have his yes and run once this PC is quiet. Closed with his answers: #352, #359. Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it isn't
set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".

- **Not run** (2026-10-08, #361): Terrain 3D, T3–T7. Kyler said yes; the runner refused before launching (the game is 1.1.2.7, not 1.1.2.4). A smoke run and then the batch are asked again; nothing was launched. A settings export from outside the sandbox is in `C:\dgm-probe\settings-backup\outside\`.
- **The game updated to 1.1.2.7** (seen 2026-10-08). Done: the starting-logs floor recomputes to the same 178. To do: regenerate `investigation/decompiled/`; re-read the sink rule (`UpdateWaterSourcesTask`, `WaterDepthSetter`) against it; `log-floor.json` and the writer's stamped version move together once 1.1.2.7 is verified in the game.
