# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-07, the milestone session runs on Kyler's PC (clone `C:\Users\Kyler\code\DamGoodMaps`), shared with the renderer
session, which comes first: local runs use about half the threads and CI does the rest; probe batches need Kyler's yes in
chat (D117). The page session runs in the worktree `DamGoodMaps-page`; the probe folder is
`DamGoodMaps-probe`.

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0). After it, two releases that changed `main` only:
`roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex) and `needs-kyler-ping-done` (the label pings Kyler's phone).
Every released step's tag: `git tag -l '*-done'`. `dev` is far ahead of `main`: the next release is Kyler's call.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It reviews every PR, merges, releases and hands out
  decision numbers (**next free: D482**). It owns STATUS and HANDOFF.
- **The page session** (Opus 5.5, high, D468; worktree `DamGoodMaps-page`, `feature/page`, restarted from dev after #347) builds "The page is the
  editor".
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
| (branch) | 3D, step 1: Foundations (D481, D280 (1)) | milestone | `feature/3d-foundations`, worktree `DamGoodMaps-3d-foundations`, `build` agents; the stages are in `docs/progress/3d-foundations.md`. **Stage 1 is merged** (#354, 2026-10-07: the terrain in memory as runs; 84 generated maps and all 22 official maps byte-identical through import, project, reopen, strokes and export). **Stage 2 is PR #355** (`needs-kyler`: the support check on every map and floor-aware slope and start checks; generated maps' rows identical; on imports no check newly fails, and Slopes connect and the start's two checks turn from failing to passing on Cliffside and four workshop maps; full run 37708965440 green). **Stage 3** (four new check rows) waits for Kyler's word on the wording proposed on #355. **Stage 4 is merged** (#356, 2026-10-07: the multi-slot writer, the engine's core binding `src/core/sim/stackWater.ts`, the T1–T6 writers; nothing in the app calls them). T1 and T2 are byte for byte the files the game played; T3–T6 differ only in water tokens (nine digits since #310, seven in the played files; at most 6e-7), so they go into stage 6's probe batch. **Stage 5 in work** on `feature/3d-foundations-5`. Then: 5 the engine wired in on the one-column path; 6 cave imports on the engine (player-visible; needs the page's and the renderer's lines and a probe batch of 3–4 maps, about 15 minutes, asked under D117 then); 7 closing. It stays out of the generator's files and pinned tests until #261 is merged |
| #261 | Canyon and Highlands height | milestone | `approved`; re-pinned as generator 0.8.8 (b046d7be). Green: the nightly (37708658504), the full run's other jobs, the PR's other checks. **Blocked on one browser test,** look-high.spec.ts:297 (the eruption in High): on this round's Highlands 96² seed 4242 the eruption shows about 1,600 lava pixels on CI against the bar of 2,000 (about 13,000 on dev's map; it swings by spot: 8 from the top bench). The test and the look are the renderer session's: asked on #236 to say why and to choose the spot or seed, bar kept. Merge when green. All three outcomes of 20: Canyon 14 / 15 / 13, Highlands 14 / 17 / 16; no map fails an absolute or lacks a start |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Parked until after the Weather view |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler |

## Left for the next milestone session, in order

1. **Merged on 2026-10-07:** #344 (Naturalize rule 5, D479) and #343 (@types/node 26). Nothing else merges unless green
   and approved.
2. **Islands round 6 is merged** (#235, generator 0.8.7, 2026-10-07; all three outcomes of 30: 96² 28, 128² 27, 256² 30).
   Generation takes more attempts than the round Kyler approved (96² mean 13.2 against 4.9): a look for later.
   **River Valley round 2 is merged** (#346, generator 0.8.5, 2026-10-07; Kyler approved). Held with it: naturalizeNature's
   River Valley 6 beside Lake Basin 3, one known gap under D479. Kyler's two looks for later, not blocking: seed 9's start
   beside an all-badwater main river (it missed readable water before the round too) and seed 20's new badwater pool. Then Islands round 6 (#235), then
   Canyon and Highlands (#261), one re-pin each with sheets.
3. **The page is on dev** (2026-10-07): #163 squashed as #347 (merge 59b4f1e9, from feature/page 5faf94d8), #163 closed. The
   350 earlier captures are in the pre-release `page-design-2026-10-07`, linked from DESIGN.md; D352 is amended (Glaciate last;
   1 Select, 2–6 the brushes, Shift+1–7 the forces, M Markers). The page session restarts `feature/page` from dev. Still to
   fold into docs/decisions/: the page's other decisions in DESIGN.md and docs/progress/page.md.
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

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (today:
#329, #348, #355, #352: whether the story should drop a main water that is mostly badwater). Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it isn't
set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".
