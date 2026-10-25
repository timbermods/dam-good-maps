# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-15, everything runs on the dedicated machine, on Kyler's new account (HANDOFF §7): the milestone session in
`C:\Users\krams\code\DamGoodMaps` and the renderer session in `DamGoodMaps-forces-play`. The machine is theirs alone
(D484): testing and probing need no asking, all 12 threads split between them as the work needs, Timberborn whenever it
helps, within D483. The page session is stopped (worktree `DamGoodMaps-page`); the probe folder is `DamGoodMaps-probe`.
Kyler's PC is idle.

## Released

Latest: `m9b-done` (2026-10-04; `main` at b407656, generator 0.8.0). After it, two releases that changed `main` only:
`roadmap-page-done` (the roadmap canvas at `/roadmap/`, noindex) and `needs-kyler-ping-done` (the label pings Kyler's phone).
Every released step's tag: `git tag -l '*-done'`. `dev` is far ahead of `main`: the next release is Kyler's call.

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It hands out
  decision numbers (**next free: D495**). Since 2026-10-14 it completes the whole order without Kyler (D484). It owns STATUS and HANDOFF. Since 2026-10-15 trivial and simple work goes to Haiku sub-agents at high effort wherever they can do it (Kyler).
- **The planning session** (Opus 5.5, high; worktree `DamGoodMaps-planning`; since 2026-10-14) coordinates: it merges
  every "ready to merge" posted on #236, releases to `main`, settles cross-session questions, and sends Kyler only the
  design questions his decisions don't settle.
- **The page session** is stopped (2026-10-07, on Kyler's word): "The page is the editor" is on dev (#347), `feature/page` holds
  nothing of its own, and nothing is queued until 3D's step 3 needs the Block tool's interface. To resume: the top of
  `docs/progress/page.md`; no page work starts without Kyler's yes. Worktree `DamGoodMaps-page`.
- **The renderer session "forces play"** (the dedicated machine, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play and builds the 3D view. Merged on 2026-10-15: #398, #407, #400, #420, #429, #430, #459, #437, #441, #444,
  #450, #452 and #462; #463 (Erode's dust and falling stones) is ready. Next: the 3D view's water per column
  (`feature/3d-view-water-columns`).
- **Codex** builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. A PR merges on its owner's verdict, a fresh reviewer agent's approval and its quick checks (D489);
the owning session may merge it itself (D490). The browser specs and the suites a change needs run on dev after the merge;
no full run by hand except for a release.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| (branch) | 3D in generation, part 1: spring caves, sheltering overhangs, arches | milestone | `feature/3d-generation` |
| (branch) | Real places' open edges | milestone | `fix/places-open-edges` |
| (branch) | The Block tool's preview answers ahead of the settle | milestone | `fix/block-preview-first` |
| (branch) | The `3d-foundations-done` release's probe batch | milestone | `probe/3d-foundations-gate`; the release also waits on the full run on dev and the nightly |
| #467 | Islands: first-visit and import checks (maps pass `water.no_flood` again; unblocks the deploy) | milestone | Open |
| #468 | Erode: its wear plays in the editor; its operation test follows force rolls (D488) | milestone | Open |
| #469, #470 | Real places: the tool runs again, and the nightly checks they stay current; an opened file's generator size uses each theme's smallest side | planning | Open |
| #463 | Erode: dust and falling stones | forces play | Ready to merge |
| #464 | CSS foundations: one set of colour tokens, motion tokens, safe overflow and focus (no layout change) | planning | In look review |
| #443 | Collaborative editing, part 6a: the Together panel, invite and join, pause, notes and the partner's cursor | page | Open; parts 1, 2, 4 and 5 are in dev (D486) |
| #404, #403 | Drought, Badtide and the drought line on cave imports (the stacked engine, #391); cave imports settle fast after an edit (#380) | milestone | Retargeted to dev after #370; dev being merged in |
| #399 | The 20-second tour (D377) | planning | Paused by D488 |
| #303 | Codex page hunt (draft) | Codex | Running |
| #279 | Dam sketch round 3 | milestone | Closed, out of the order (D485); branch kept |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler |

## Done, and next

1. **3D Foundations is complete** (#370 merged, #369's checks were in; stages 1 to 6 are in dev). Its release, `3d-foundations-done`,
   is under way: the full run on dev, the nightly and a D483 probe batch (`probe/3d-foundations-gate`).
2. **In dev from 2026-10-14 and 15:** the Block tool (core #432, #453; page #448); Erode (#447; page #454; dust and stones #463
   waiting); custom sizes part 2 (#451); Crop map to selection (#442, #445); the shelf with every 1.x object (#434); versions
   (#433); force rolls (#461); the companion mod (#431) and the probe's companion mode (#439); the polish pass; collaborative
   editing parts 1, 2, 4 and 5.
3. **Merge rules (D489, D490):** a PR merges on a fresh review plus quick checks, and the owner may merge it themselves; the
   full suites run on dev after the merge.
4. **Next in the order (D488, the three weeks to showcase-quality maps):** fixes first (Real places' open edges, Islands'
   checks, dev's red tests); 3D in generation part 1 (spring caves, sheltering overhangs, arches; in flight), with weather on
   cave imports (#404) and their fast settle (#403) brought onto dev; then generation with intent: Showcase mode, landmarks
   steered into view, ruins placed with meaning, the opening shot. The renderer and the page follow D488's (3) and (4).
   Paused until then: collaborative editing after #443, sizes above 256, the tour (#399), M13's passes, Pick a place, Real
   places' second round. The dam sketch is out of the order (D485); its branches are kept.

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

- `water.test.ts`'s save check (local only; the save is on Kyler's PC, so it can't run here): 975 ticks gave 0.00106
  against 0.001, after 0.00096 at M2 under the port's rules. Likely cause: the game's singleton order is known only to a
  tick (investigation/cycles/FIDELITY.md) and a filling river moves about 0.001 a tick there. Unchanged until it can be
  run; if the save comes to this machine, check 974–976 ticks before touching the bound, and the game's rules (D308) if
  none passes.
- `mechanics.test.ts` (local only): Oasis is no longer approximate because, since D337, aquifers are off at the start, so
  its settle matches its own water exactly (0% differ) and the rule finds no evidence. #370 rewrote this test (none
  approximate); its comment credits Oasis's change to the stacked pre-fill, but it is D337.

## Waiting for Kyler

One list: the [`needs-kyler` issues](https://github.com/timbermods/dam-good-maps/issues?q=label%3Aneeds-kyler+is%3Aopen) and
[pull requests](https://github.com/timbermods/dam-good-maps/pulls?q=is%3Apr+label%3Aneeds-kyler+is%3Aopen) (none on a PR
today). Also his: the merge-queue ruleset for `dev` (none exists; the clicks are in #57) and the `NTFY_TOPIC` secret if it
isn't set.

## Probe batches

Run on the dedicated machine without asking (D218); anywhere else only with Kyler's yes in chat (D117). Each batch and its
results are recorded here. Earlier batches: [archive/status-2026-10-01.md](archive/status-2026-10-01.md), "Probe batches".

- **The `3d-foundations-done` gate** (2026-10-15, D218; `docs/progress/3d-foundations.md`, "RESULTS"): a smoke run (`20261015-0947-smoke`: passed) and `20261015-1011-batch`, six cave edits as the app exports them (Hollows and Canyon edited, a roof stroke on Pillars, a Block dig in Hollows, an Erode cave on a generated map, unedited Hollows as the control), `--keep-mods`. **All passed:** water at the load and after a day 100% of wet columns within 0.1, roofed ones included (largest difference 0.033), soil per run 100%, nothing dropped. The gate is green.
- **Terrain 3D on 1.1.2.7** (2026-10-08, Kyler's yes in chat; #361, closed): a smoke run (`20261008-0857-smoke`, the M8 preview: passed) and
  the batch (`20261008-0859-batch`, T3–T7, with `--keep-mods`). **T7, the sink under a roof, passed:** 100% of 209 wet columns
  within 0.1 deep after 1, 3 and 3.18 days, the largest difference 0.001, 36 of 36 columns under pressure matching; so the
  stacked engine's sink rule is game-verified on 1.1.2.7. T3–T6 (replays) passed and are not looked at further (D483). The
  machine: only Unity's four per-launch registry values changed, compared from outside the sandbox.
- **The game updated to 1.1.2.7** (seen 2026-10-08). Done: the starting-logs floor recomputes to the same 178; the probe's
  smoke run and five Terrain 3D maps pass on it. `investigation/decompiled/` is regenerated for 1.1.2.7 on the dedicated machine (2026-10-14; the files are smaller only because the game no longer ships Unity's generated script-path tables). To do: `log-floor.json` and the
  writer's stamped version move together once a batch of what players get (D483) has played on 1.1.2.7; the sink fixture's
  reference text still says "not game-verified".
