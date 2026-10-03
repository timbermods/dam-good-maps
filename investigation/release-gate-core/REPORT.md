# The release gate's core: a bug hunt (D385)

> **Fixed (2026-10-03, PR #196):** water 1–3 and editor-core 1–6 and 8–11. Their tests moved into
> `tests/contract/` (the names below are the originals). Still here: water 4 (Kyler's call) and editor-core 7
> (a project-format decision).

The water and the editor's core, hunted for reproducible wrong results on 2026-10-03.

- **Editor core:** tested on `dev` at 6b9175a1.
- **Water:** tested on `feature/m9b` at **4c7223fa** (PR #70), that sha all night.
  Every water test also fails on dev at 6b9175a1, so the water findings are shared code: fix once on dev.

Each test asserts the correct behaviour and fails today: 6 water tests, 23 editor-core tests (one more is a passing
control). They use the core's entry points:
- MapSession operations, undo/redo, the project file, `importMap`;
- the planners in `doc/tools.ts` and `doc/waterEdits.ts`;
- the preview job and `WaterSim` for the water;
- the six `forces-`/`brushes-` tests marked † drive a force the editor's way, through the headless worker
  (`src/worker/session.ts`), as `tests/contract/deleteStart.test.ts` does.

## Running the tests

From a dev checkout (this branch):

```
npx vitest run --config investigation/release-gate-core/vitest.config.ts --maxWorkers=1 investigation/release-gate-core/editor-core/
```

From a feature/m9b checkout, with this folder copied in (`cp -r <this checkout>/investigation/release-gate-core investigation/`):

```
npx vitest run --config investigation/release-gate-core/vitest.config.ts --maxWorkers=1 investigation/release-gate-core/water/
```

The same water command runs on dev. Each set takes under a minute.

Random sequences: `npx tsx investigation/release-gate-core/tools/fuzz.ts <seed> <defer|preview|canonical> <live|import> [ops] [side] [theme]`
(one map, a few minutes); `tools/reduce.ts` cuts a failing run to its fewest operations. Its output stays in `local/`.

## Water (shared code: fails on M9b and on dev)

1. **A Fill below the rim of a stepped pit writes water from nowhere into the file.** Lower a 5×5 pit 1 deep, a 3×3
   pit inside it 1 deeper, then Fill to the inner pit's rim (M9b's seed 34 fixture, (41, 11)). The file holds all
   16 ring tiles 1.0 deep, a level above the Fill; the game then levels them together. Only the Fill's 9 tiles should
   hold water. Cause: the pre-fill fills the whole depression, the ring counts as fed by the Fill, and `keepSealed`
   (`sim/prefill.ts`) restores the sealed basin's pre-fill start. Breaks D385/D420, D394, D413.
   `water/fillSteppedPit.test.ts`.
2. **A Fill whose hollow is later widened is stored brimming beside dry ground.** Fill an 8×8 pit to 8, then Lower
   the ground beside it by 1. The live water fills the new ground (0.87), but adopting the canonical settle dries it
   and stores the pit at exactly 8. The game spills it within 150 ticks. Same `keepSealed` restore, from before the
   edit. Breaks D413 and "a stored lake keeps its water only while its hollow holds it". Carve's oxbow lakes take the
   same path (not tested). `water/fillWidened.test.ts`.
3. **Deleting a pit's only source leaves its pool in the live water.** Dig a dry pit, place a 0.25 source, settle,
   then delete the source. The preview's stopped water keeps the pit about 1.97 deep under "Water settled". The
   canonical settle (and the export) drains it a few seconds later. Another river's pre-fill walk links the pit to
   fed water in `preview.ts`'s warm start. Breaks D260 and D385. `water/sourceDeletedPit.test.ts`.
4. **An imported map's unfed pond: the live water keeps it, the canonical settle drops it.** Import a map with a pond
   no source feeds, raise ground 13 tiles away: the live water keeps the pond 1.94 deep, and the background settle
   and every export remove it. The two must agree; which way is D260 against D385/D420, Kyler's call.
   `water/importUnfedPond.test.ts`.

## Editor core (dev)

1. **A project opened by a newer generator drops every edit to a generated feature.** A frozen document orphans
   them ("the map keeps what generator … made as it was saved"), a rule from D37, whose rebuild D336 (2) removed.
   - M9b moves `GENERATOR_VERSION` from 0.7.0 to 0.8.0, so at the next release every saved or autosaved project
     opens this way.
   - A moved start goes back to the generator's spot, while the objects cleared for it stay gone.
   - A deleted generated river comes back.
   - Breaks D336 (2): "an old map opens exactly as it was saved". `editor-core/olderGenerator.test.ts`.
2. **A changed generated forest, berry patch or ruin field is ignored in the session until the project is
   reopened.** The cause is `MapSession.generatedResources()`:
   - It caches the generation's objects per feature, keyed on `this.st.features`.
   - `updateFeature` changes that array in place, so the cache never notices.
   - Once anything has read the map, e.g. the Move planner, a change is ignored.
   - Moving a berry patch (seed 11, 96²) shows 18 bushes; reopened, 23.
   - A forest's density changed after any edit keeps all 15 oaks; reopened, 6.
   - Breaks D404/D425, D366 and saving and reopening exactly. `editor-core/movedResources.test.ts`.
   - This is also the known "reopened project loses dead blueberry bushes" (`properties.test.ts`). Clearing the cache
     in a probe made the session match its reopened project on 3 of 4 random seeds; the fourth keeps one difference,
     which looks like finding 9's cause on a generated map.
3. **Glaciate clicked again in the same valley plays to its end, then is thrown away with a raw ID error.** On the
   third click at Highlands 64² seed 3 (32, 33): "an entity with the Id e6c8ab6d-… already exists". It happens on
   4 of 4 themes. `glaciate/plan.ts` `newId` skips only the ids standing now, not ones the log still holds. Breaks
   D257 and D342 (4). `editor-core/forces-glaciateAgain.test.ts` †.
4. **Try another keeps the first try's start carry.** After a Quake Slide carries the start (Highlands 64² seed 4,
   (42, 1)), Try another leaves the start at (44, 5) and the 9 objects the first carry cleared stay gone. The new try
   never touches the start's ground. `forceAgain`/`forceStop` replace only the `forceResult`, not the carry's
   `deleteEntities` and `updateFeature` in the same step. Breaks D220 (Try another replaces the force).
   `editor-core/forces-tryAnotherStart.test.ts` †.
5. **An object a force carries can vanish.** After any Slide, delete or move one hand-planted Pine of a row; a second
   Slide carrying the row drops Pine 03, though the operation lists it as moved. `applyEntityEdits`
   (`features/edits.ts`) builds its taken-tiles map once, at the log's first quiet move, and never updates it.
   Breaks D425 ("carried objects land where the force put them"). `editor-core/forces-carriedVanish.test.ts` †.
6. **The start carry changes land the force left alone, and land outside the working area or above the cut.**
   `moveStartNear` (`doc/tools.ts`) lays the start's bench (radius 2) beyond the level it checked, and ignores the area
   and the cut. Three cases:
   - A Quake Lift raises (17, 19) from 1 to 6 (River Valley 64² seed 11).
   - An Erupt inside an area carries the start onto locked land and removes 7 trees there.
   - A Craterize under a cut at level 5 does the same above the cut.
   - Breaks D254/D259 and D207 ("everything outside is locked, exactly as it is") and D368 (9).
     `editor-core/forces-startBench.test.ts` †, `editor-core/forces-areaStart.test.ts` †.
7. **After reopening, one undo no longer takes back a whole step.** Undo history isn't saved, so each operation of a
   step undoes on its own after a reopen (Your maps, the autosave's recovery). Examples: a source changed (delete and
   place), a stroke with Sources: Clear, a force with its objects. One undo then leaves a map the player never had.
   Breaks EDITOR_PLAN "every stroke or placement is one instant undo step" and PERFECT "one undo fixes it".
   `editor-core/undoAfterReopen.test.ts`.
8. **Naturalize inside a selection breaks the feathered edge.** A weathering stroke drops tiles on the area's edge by
   3 levels (River Valley 64² seed 5), and one 7 steps in by 11 (Canyon seed 2). Breaks D254.
   `workingArea.test.ts` only tests the old non-weathering stroke. `editor-core/brushes-naturalizeFeather.test.ts`.
9. **An imported map edited in the editor's water mode exports objects a replay doesn't have.**
   - Steps: add a ruin field, then a Raise stroke beside it, in "defer" mode (64² seed 2, exported and opened).
   - The editor keeps 111 ruin columns; its own full build and a canonical replay have 109. The export carries 111.
   - Objects placed against the carried-over water aren't placed again when the settle is adopted.
   - Breaks D366 and PERFECT water 1. `editor-core/deferWaterObjects.test.ts`.
10. **Select's actions can silently do nothing, still adding an undo step.**
    - Raise, Lower, Cut down and Fill up on a one-tile selection: the integrity pass removes the one-tile change
      (`sculpt` without `exact`).
    - Raise on ground at the ceiling (22): nothing changes. On mixed ground it flattens the top without a word.
    - Breaks D342 (1)(4) and EDITOR_PLAN ("reject invalid ones instead of clamping silently"; Select is exact).
      `editor-core/brushes-selectOneTile.test.ts` †, `editor-core/ceiling.test.ts`.
11. **Operations the check accepts that it should refuse.** No player path today; it matters for Claude's steps, share
    links and the Rust port's tests. Breaks D342 (1)(4).
    - A source strength that isn't a number passes, then throws in the rebuild. It stays in the log, and the saved
      project never reopens.
    - Deleting a generated start's own object passes. No start can be placed again afterwards.
    - A brush stroke without `rigid` leaves a badwater source floating (a load error). The page works `rigid` out
      itself.
    - Tests: `editor-core/opChecks.test.ts`, `editor-core/brushes-badwaterRides.test.ts`.

## Covered and clean

- **Determinism:** the same operations give the same bytes across the canonical, preview and defer water modes, in a
  fresh session, and in the settle run in slices of 1 to 1,000 ticks. The one exception is editor-core 9.
- **Undo and redo:** the incremental build equals a full build after random undos and redos; undo-all returns the
  original. Covered: 7 themes, generated and imported maps, 64² and 96², about 600 random operations.
- **Save and reopen:** clean apart from editor-core 1, 2 and 7. Also clean: the map's name and saved views.
- **Fill and Remove unfed water:** Fill inside a Fill, refusals (at or below ground, spilling off the map, water
  already there, off the map), undo and redo, a source added after a removal, and maps 4² to 8².
- **Floors and ceiling:** Floors 0, 1 and 22 for Fills. Every force at Power 0, 60 and 100 on plains at 0, 1, 2, 21
  and 22, and at corners and edges: never below the floor or above 22. Brushes at targets 0, 1, 21 and 22.
- **No edit adds an object (D425):** random brush, force and operation sequences on every theme. Only Carve's and
  Glaciate's sources were added, as designed.
- **Generated maps keep no unfed water:** 7 themes, seeds 1–3, 64².
- **Edits never replay onto new land (D336):** the core has no path that does.

## Known, confirmed

- **A reopened project loses dead blueberry bushes:** seen with dead birches, oaks and succulents too. The cause is
  editor-core 2.
