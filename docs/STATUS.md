# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-27, everything runs on the dedicated machine, on Kyler's new account (HANDOFF §7): the milestone session in
`C:\Users\krams\code\DamGoodMaps`, the planning session in `DamGoodMaps-planning` and the renderer session in
`DamGoodMaps-forces-play`. **There is no Timberborn on the dedicated machine since 2026-10-25 (Kyler):** no probe batch and no
game launch until he lifts it. The page session is stopped (worktree `DamGoodMaps-page`); the probe folder is
`DamGoodMaps-probe`. Kyler's PC is idle.

## Released

Latest: `high-look-fix-2-done` (2026-10-29), a patch release for the High look's fix (#641): dev 82a2bd14 plus the deploy
tool's fix #652 (tagged at 0deeec96), #653 merged to `main` as c9402a39, the deploy and the live check passed (run
40843431988); the live site runs generator 0.10.5. Its gates: the nightly at 82a2bd14 (run 40832798319) and each release PR's
full CI. The first try, `high-look-fix-done` (82a2bd14, #651), merged but its deploy stopped at "First-visit maps": the maps
with caves were checked as imports (#652). **No D483 probe batch, by Kyler's call:** generated caves, overhangs and arches at
the default Verticality (#478, #579, #611), strokes that hold a cave's rock (#623, #625), the 1.1.2.8 stamp (#621) and the
opening shot (#515) are unplayed in the game until probes run again.
Before it: `3d-foundations-done` (2026-10-27, `main` at 60f79a97, generator 0.10.2), `m9b-done` (2026-10-04, `main` at
b407656, generator 0.8.0), then `roadmap-page-done` and `needs-kyler-ping-done`.
Every released step's tag: `git tag -l '*-done'`. `dev` is ahead of `main` by what is under "Done, and next".

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It hands out
  decision numbers (**next free: D495**). Since 2026-10-14 it completes the whole order without Kyler (D484). It owns STATUS and HANDOFF. Since 2026-10-15 trivial and simple work goes to Haiku sub-agents at high effort wherever they can do it (Kyler).
- **The planning session** (Opus 5.5, high; worktree `DamGoodMaps-planning`; since 2026-10-14; active since 2026-10-25) coordinates: it merges
  every "ready to merge" posted on #236, releases to `main` (it cut `3d-foundations-done` and `high-look-fix-2-done`), now owns the page's work (Showcase's page #520 and #535, #555), settles cross-session questions, and sends Kyler only the
  design questions his decisions don't settle.
- **The page session** is stopped (2026-10-07, on Kyler's word): "The page is the editor" is on dev (#347), `feature/page` holds
  nothing of its own, and nothing is queued until 3D's step 3 needs the Block tool's interface. To resume: the top of
  `docs/progress/page.md`; no page work starts without Kyler's yes. Worktree `DamGoodMaps-page`.
- **The renderer session "forces play"** (the dedicated machine, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play and builds the 3D view. Last seen 2026-10-27: #615 (a force's own water on maps with caves) merged.
- **Codex** builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. A PR merges on its owner's verdict, a fresh reviewer agent's approval and its quick checks (D489);
the owning session may merge it itself (D490). The browser specs and the suites a change needs run on dev after the merge;
no full run by hand except for a release.

| PR | Work | Owner | State and what's next |
|---|---|---|---|
| #611 | 3D forms at each theme's default Verticality (the gate comes off), 0.10.4 | milestone | Merging dev in; comes off hold next |
| #599 | Say when a map is kept and where a replaced map went; Help findable; Rename in Your maps | planning | Open |
| #549 | Finisher fixes: Show marks the problem, Markers labels water objects, kept version note, seep label fits | planning | Open |
| #617 | Dependabot: collab-worker minor and patch group | planning | Open |
| #399 | The 20-second tour (D377) | planning | Paused by D488 |
| #303 | Codex page hunt (draft) | Codex | Running |
| #211, #210, #152, #132 | Theme critique, Islands round 2, perf audit, scaling round 4 | records | Kept open as references; #132's round 4 is approved for adoption |
| #73, #71, #35 | Weather days, 3D step 1, Real places 2 | parked drafts | Parked by Kyler |

## Done, and next

1. **Released:** `3d-foundations-done`, then the patch `high-look-fix-2-done` (above).
2. **In dev since 2026-10-24 (milestone's):** Showcase mode's core and worker with three tuning rounds (#504, #516, #526, #588) and
   planning's page (#520, #535); the opening shot and landmarks into view (#515, D493, 0.10.2); ruins with meaning (#527, 0.10.1);
   3D in generation part 1 (#478, 0.10.0) and its follow-ups (#579, 0.10.3); objects in caves (#490, D491) with follow-ups (#531), forces around caves (#496),
   Fill/Remove unfed water on caves (#498, D494), sealed basins at rest (#534 via #567), live water on maps with caves (#606,
   D280 amended in #610) and for forces (#615); the start and painted plants under a roof (#553, #572); removed or moved relics
   measured where they stand (#584); Real places' open edges (#493) and dying plants (#576); long shapes (#545, #603);
   large-map retries and attempt reasons (#570); the map description (#541, planning's field #555); the water's thread budget
   (#590); Generate speed (#605); CI: seven browser shards (#608) and flake fixes (#505, #554, #560, #589, #593); first-dry
   and first-bad days (#566, #573).
3. **Merge rules (D489, D490):** a PR merges on a fresh review plus quick checks, and the owner may merge it themselves; the
   full suites run on dev after the merge.
4. **Next (milestone):** lift the gate (#611: merging dev in, off hold next); #532 (cave outflows in exports) later. Next decision number: D495.
5. **Held until Kyler lifts the no-Timberborn hold:** Real places' open edges (#493's four places, files ready in
   `C:\dgm-probe\places-open-edges\`), the release's D483 batch for generated caves and the opening shot, and the cycle-10 run for
   Showcase's winners (#507's `--cycles`).

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

- **Objects in caves, D491** (2026-10-25, D218; #490): Hollows edited through the core and exported (`hollows-cave-source`, a water source on a cave's floor at (78, 6, 1) under a roof up to 7; `hollows-cave-ruin`, a RuinColumnH3 at (180, 9, 1) under a roof up to 8; written by the Terrain 3D writer, both validators' export profile failing only what unedited Hollows fails), `--keep-mods`, on the game's new **1.1.2.8** (Unity 6000.5.11): a smoke run (`20261025-0917-smoke`: passed) and `20261025-1008-batch`. **All passed:** 2381 of 2381 objects at their tile and level on both maps (none dropped or moved); water at the load and after 1 and 1.18 days 100% of 4117 wet columns within 0.1, the 988 roofed ones included, IoU 1.000, 23 of 23 pressurised columns matching, largest difference 0.005 (source) and 0.013 (ruin); the source adds about 10 units to its cave as the stacked engine predicts (that cave already holds water in the official file). On 1.1.2.8, two of four launches hung at engine start (no heartbeat in 300 s; the runner's next launch played). Still to do for 1.1.2.8: `investigation/decompiled/`.
- **The game updated to 1.1.2.8** (seen 2026-10-25): only beaver death handling changed; the starting-logs floor stays 178. Done (2026-10-27): the writer's stamped version and `log-floor.json` moved to 1.1.2.8-ffc2de0-sw together, after `20261025-1008-batch` played edited exports on it; only the version string changed in every re-pinned file.
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
