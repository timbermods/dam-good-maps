# Status

The current state, for Kyler and for a session starting fresh. Rewritten at every step and stop; no history. The running log
is the "Progress log" issue ([#57](https://github.com/timbermods/dam-good-maps/issues/57)); messages between sessions are on
the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)); how to start and how things are run
is [HANDOFF.md](HANDOFF.md); the decisions are in [docs/decisions/](decisions/README.md); the order of work is the top of
[ROADMAP.md](../ROADMAP.md). The earlier STATUS is [archive/status-2026-10-01.md](archive/status-2026-10-01.md).

As of 2026-10-27, everything runs on the dedicated machine, on Kyler's new account (HANDOFF §7): the milestone session in
`C:\Users\krams\code\DamGoodMaps`, the planning session in `DamGoodMaps-planning` and the renderer session in
`DamGoodMaps-forces-play`. Timberborn runs on the dedicated machine only through the DGM Probe runner, and only where an
implementation looks wrong in the game (Kyler, 2026-10-29; HANDOFF §5, "Probes"). The page session is stopped (worktree
`DamGoodMaps-page`); the probe folder is `DamGoodMaps-probe`. Kyler's PC is idle.

## Released

Latest: `lake-islands-done` (2026-11-21 19:58Z, PR #1277): dev 0fc2390b released into `main` at 27c6a836, generator 0.10.56 →
0.10.61: Lake Basin's lake the land holds (#1273, 0.10.60) and Islands' coast above 128² (#1275, 0.10.61). Deploy run
44943786131 succeeded and the site answered 200.
Before it: `ruin-brush-done` (2026-11-21 13:15Z, PR #1271): dev 5cb017b4 released into `main` at f389ec6d, generator 0.10.55 →
0.10.56: the start's first food on every map (#1269) and the ruin brush painting ruins as trees land, their height asked
(D548, #1270). The live check passed and the site answered 200; recorded on #57.
Before it: `ruins-in-view-done` (2026-11-20, PR #1268): dev cc351e38 released into `main` at 9ca0997e, generator 0.10.53 →
0.10.55: a stand of the map's own ruins in the opening view (#1266) and Islands' start above 128² walking its island, its
berries topped up to Easy's food row (#1267). The live check passed and the preview was republished; recorded on #57.
Released in `lake-islands-done`: Islands' land above 128² (#1275, merged at dev 0fc2390b on 2026-11-21, generator 0.10.61):
a mainland framing the sea, the start on a headland, 8–11 islands, the sea's bed one level under its spill and its exit
away from every river (D547, [design/uplands.md](design/uplands.md)). The bed alone, on 0.10.48's land (Islands 256² seeds
1–6, Normal), missed its Hard bar on three: the sea's p50 at the Hard wet season's end 1.02 of 1.16, 0.65 of 1.21 and
0.29 of 1.01 on seeds 1, 2 and 4, as seed 4's river entered at the exit; the new land holds it, the start's water back to
its settled count at every Hard wet season's end on seeds 1–12. Short: the start's food row on seeds 2, 4, 7 and 10 (only
the shore bench stays moist through a drought), seed 6's sea at 0.45 of 1.11 after a Hard wet season (its river's mouth 55
tiles from the exit; the start's water whole). Its second round is in flight (`gen/islands-land-2`, 0.10.62): the food
row on 12 of 12 from a wider shore bench in the start's walk, the mainland's banded back broken, and three kinds of island.
Before it: `highlands-done` (2026-11-20, PR #1265): dev a0a3c83c released into `main` at 46b5e71, generator 0.10.37 →
0.10.53; 56 PRs since `tilt-forms-done`: the land above 128² drawn in rings (D547) with Highlands standing up (#1263), the
start picked for its level room (D545, #1256, #1261), ruled water (#1162), floodplain steps 5 and 6 and Save as.
Before it: `tilt-forms-done` (2026-11-16, PR #1211): dev eda351c9 released into `main` at e4a403e, generator 0.10.23 → 0.10.37;
the deploy and the live check passed (run 43939200291). Phones' two-finger tilt (#1196), rivers kept to their courses (#1145),
round forms at their meant size and Verticality reaching again (#1102, #1205), Generous's reach and the 48² starved start
(#1208). The Nightly on eda351c9 was green on every job. The scheduled Nightly checks out dev.
Before it: `places-water-done` (2026-11-15, PR #1171): dev 256c63ec into `main` at b28357fe, run 43737217595; 55 PRs since
`phone-pages-done`: Real places under the game's water rules, caves and blocks, drawn as the game draws (D496, D497). The
release tool was mended in #1179.
Before it: `phone-pages-done` (2026-11-14, PR #1100): dev b7415d78 into `main` at 221c977a, run 43559009084: the menu's
pages on a phone (#1074) and Real places regenerated on today's land.
Before it: `phone-layouts-done` (2026-11-13, PR #1093): dev 78e71d52 released into `main` at 4d04c0ee.
The full notes of each release are on the Progress log (#57).
Before it: `naturalize-done` (2026-11-09, PR #896, dev d5d44fd2 into `main` at 8d31cefa): 36 PRs, #851 to #893. Naturalize runs
in its own worker, so the land follows the brush within two frames (p50 702 to 13-15 ms), undo waits for a stroke still
landing, and forces keep clock time on slow views. It also carries the game's look for grass, dry land, shadow edges, bloom
and the water's films, fronts, falls and skirts. The deploy and the live check passed (run 42599735525).
Before it: `game-look-done` (2026-11-08, dev 0e413609 through #850, `main` at 92b97bdb, generator 0.10.11): both looks draw
the game's water, badwater, light and contamination; arches and overhangs come from generation (D503); the map's picture
lands where it looks best (D506). The deploy and the live check passed (run 42460977222).
Amendments that went with them (all in docs/decisions/, D496's rule): D154 now has falls as the game draws them (D201), as
the water below's slope, the water's depth along the view, and thin water as water with no film. D446 now has the foam
threads, wakes and seams in the Flow view alone (D497). D201's own text is not in docs/decisions/; D154 carries its amendment.
Before those: `high-look-fix-2-done` (2026-10-29), a patch release for the High look's fix (#641): dev 82a2bd14 plus the deploy
tool's fix #652 (tagged at 0deeec96), #653 merged to `main` as c9402a39, the deploy and the live check passed (run
40843431988); the live site runs generator 0.10.5. Its gates: dev's CI at 82a2bd14 (run 40788748417) and the nightly there
(run 40832798319). The release PRs merged before their CI ran (`tools/release.sh` passed on the first skipped checks, as
it had for #616; fixed in #656): #653's full CI passed afterwards (run 40843420297); #651's failed, the collab specs stale
since generator 0.10.5 (#657) and water.spec's 256² timing test timed out once. The first try, `high-look-fix-done`
(82a2bd14, #651), merged but its deploy stopped at "First-visit maps": the maps with caves were checked as imports (#652).
**No D483 probe batch, by Kyler's call:** generated caves, overhangs and arches at the default Verticality (#478, #579,
#611), strokes that hold a cave's rock (#623, #625), the 1.1.2.8 stamp (#621) and the opening shot (#515) are unplayed in the
game until probes run again.
Before it: `3d-foundations-done` (2026-10-27, `main` at 60f79a97, generator 0.10.2), `m9b-done` (2026-10-04, `main` at
b407656, generator 0.8.0), then `roadmap-page-done` and `needs-kyler-ping-done`.
Every released step's tag: `git tag -l '*-done'`. `dev` is ahead of `main` by what is under "Done, and next".

## The sessions (D388, D398, D468, D470)

- **The milestone session** (Opus 5.5, high) does everything except the page and the renderer: the core, the water, the
  generator, the Rust order, the Codex adoptions and the documents. It hands out
  decision numbers (the next free one is kept in [decisions/README.md](decisions/README.md)). Since 2026-10-14 it completes the whole order without Kyler (D484). It owns STATUS and HANDOFF. Since 2026-10-15 trivial and simple work goes to Haiku sub-agents at high effort wherever they can do it (Kyler).
- **The planning session** (Fable, high, since 2026-11-10; worktree `DamGoodMaps-planning`) leads the work: it sets the
  order, judges every look, releases to `main`, owns the page's work, settles cross-session questions, and sends Kyler only
  the design questions his decisions don't settle.
- **The page session** is stopped (2026-10-07, on Kyler's word): "The page is the editor" is on dev (#347), `feature/page` holds
  nothing of its own, and nothing is queued until 3D's step 3 needs the Block tool's interface. To resume: the top of
  `docs/progress/page.md`; no page work starts without Kyler's yes. Worktree `DamGoodMaps-page`.
- **The renderer session "forces play"** (the dedicated machine, worktree `DamGoodMaps-forces-play`, its own usage) gives every force
  Carve's smooth play and builds the 3D view. Its last item was Lake Basin's land (#1273, merged); it takes no new item
  (planning, #236 7066273969).
- **Codex** builds investigations on `investigation/<name>`, each with an adoption patch split by owner and an
  eight-line report; Kyler decides each adoption; the milestone session adopts its part.
- **Other Claude Code sessions** Kyler starts (the theme critique, the Canyon session) open real PRs into `dev`.

## Open pull requests

Merge order and owner. A PR merges on its owner's verdict, a fresh reviewer agent's approval and its quick checks (D489);
the owning session may merge it itself (D490). The browser specs and the suites a change needs run on dev after the merge;
no full run by hand except for a release.

At the release of 2026-11-21, one PR is in flight and the rest are parked. The parked PRs stay open; nothing is closed or
deleted (planning, #236 7059356767).

| PR | Work | State, and why |
|---|---|---|
| #1183 | The water tree above 128² | Parked (planning, 2026-11-16): #1162's joins give the same read of each river system, and the tree laid over them doubled leaks (9 → 18). It comes back only as a tree built on the joins. |
| #1178 | Nightly test: every generator control's move changes the map (D527, fix 5) | `hold`: it merges after #1177, the last of the settings fixes it follows. |
| #1177 | Starting berries folds into Berries near start (D527, fix 1) | Approved at b9c7e2f0. `hold` until planning's conditions hold: dev's rescue rounds and premises kept, and trees within 3 % (#236 6895067611). |
| #1170 | Intentions PR 1: offered at 8 of 12, badwater-rich removed (0.10.24) | `hold`: counted on #1145's land before #1145 merged, never re-pinned. It comes back on the new land, with the landmark by design (#236 6996806923). |
| #1157 | The Gate's dry side: no knobs, no one-tile pits | Approved at 0926cafb, but its quick suite failed there (`test (1/2)`). No session owns it; labelled `hold` (planning, 2026-11-21). |
| #1127 | The land stage in Rust: the hydrology's hollow flood | `hold`: same bytes, but a gain inside the noise does not pay for a second copy of the hollow flood before the land stage is redesigned (#236 6880377008). It merges if the flood survives that redesign as it is. |
| #928 | Naturalize: cut banks slump | Draft, `hold`: paused work in progress (usage). It becomes rule 7 when it resumes (D514). |
| #927 | The first ten cycles as a report | Draft, `hold`: paused work in progress, not yet typechecked or run. |
| #914 | Glaciate: one trough at the valley's width | `hold`: its look review fell short; #1054 built Glaciate's five asks and merged. Kept as a record. |
| #709 | Companion: the first in-game run | `hold`: the companion mod is set aside (ROADMAP). Its last code review asked for changes (the restore is skipped in one case). When it resumes, it recognises our files by a metadata field (#1243's note on the PR). |
| #672 | 128² maps' water on four threads | Draft, `hold`: speed comes after map quality (D453). It waits for the WebKit thread measure. |
| #1121 | Dependabot: npm minor and patch (Playwright 1.65.0, vite) | `hold`: Playwright 1.65 needs new browser downloads on the dedicated machine, which wait for Kyler's yes. |
| #1203 | Dependabot: collab-worker minor and patch (workers-types, wrangler) | Quick checks green, mergeable. A minor and patch bump merges on green CI (D150); planning keeps it open through the release. |

## Done, and next

The release `lake-islands-done` (2026-11-21, main 27c6a836) shipped Lake Basin #1273 and Islands #1275. A release
follows whenever a round lands; the order of the rounds is in [ROADMAP.md](../ROADMAP.md), "The order of work from the
release of 2026-11-21" (Kyler, 2026-11-21: no round budgets, no stopping point).

1. **Released in `lake-islands-done`:** Lake Basin's hydro pass and shore bench (#1273, generator 0.10.60) and Islands'
   land above 128² (#1275, generator 0.10.61).
2. **In flight:** Islands' second round (#1278, `gen/islands-land-2`, generator 0.10.62).
3. **Then:** planning releases each round to `main` as it lands.
4. **Not shipped, kept as findings branches:** the start's food row where water lasts (`gen/food-row-lasting-water`,
   #1272 closed), Highlands round 6c (`findings/highlands-6c`), Delta round 2 (`findings/delta-1`, #1274 closed), the
   great form (`findings/great-form`), Lake Basin's earlier rounds (`findings/lake-basin-8`, `findings/lake-basin-7c`)
   and Islands' earlier land (`findings/islands-land-11`, `findings/islands-feed`). Each theme's state as released, its
   shortfall and its next step are in [design/uplands.md](design/uplands.md), "State at the release of 2026-11-21".
5. **Generator versions never used on dev:** 0.10.57 (the food row where water lasts) and 0.10.59 (Highlands 6c); 0.10.58
   too, which Islands held before it landed at 0.10.61.
6. **Not yet played in the game:** Real places' open edges (#493's four places, files in
   `C:\dgm-probe\places-open-edges\`), generated caves and the opening shot (D483), and the cycle-10 run for Showcase's
   winners (#507's `--cycles`). A batch runs only where an implementation looks wrong in the game.

## Expected failures, in one place

Tests marked as expected failures, each a named gap. One comes off the list only when its gap is closed, never by moving it.

| Test | Gap | Since |
|---|---|---|
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
