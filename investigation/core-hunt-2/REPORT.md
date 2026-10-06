# The second core hunt

The bugs Kyler would hit using the editor, hunted on 2026-10-04 on `dev` at a91efc45 (after #274), then
da106b9e (Carve's Maturity, #278), with the water and the forces in Rust. Driven the editor's way: the worker session the page talks to
(`src/worker/session.ts`), so forces start, play, keep, skip, Esc and Try another as on the page.

## Findings

1. **Fixed: a force inside a working area pops at the end.** The keep eased the force to the locked land
   (D254), the showing didn't: Erupt's last frame was up to 5 levels off on 275 tiles, Lift's 7, Carve's 2.
   Breaks D368 (9). The showing now eases each tile as the keep does (`feathered` in `forces/start.ts`;
   `CarveRun.ease` read by `CarvePlay`). Rift and Deposit already eased theirs in Rust.
   `tests/contract/forceAreaPop.test.ts`.
2. **Fixed: a glacier drawn to the map's edge leaves a 6-tile pit.** The aimed route's search never steps on
   the border, so an end there was never reached. About one drawn glacier in five, even at Power 100.
   Breaks D356. Rust `glacier_route` now aims at the nearest inner tile; the 42 pinned force fixtures are
   unchanged. `tests/contract/glaciateEdge.test.ts`.
3. **Fixed: refusals that crash or blame the wrong thing.** A Quake with no fault threw a TypeError. A
   half-tile point was "off the map" or a bad Size. A Rift or Deposit under the layer cut, or outside the
   working area, blamed the Floor. A Quake beside the area said only "Nothing changed". Breaks D342.
   `tests/contract/forceRefusals.test.ts`.
4. **Handed over: Deposit leaves lone pillars and scattered tiles.** About one use in eight on every theme
   raises a tile 3 or more levels above all four neighbours (81 of 640 uses at 64²). On a short line it may
   refuse for one seed and keep for the next, a few lone tiles instead of a fan. Rust Deposit's shaping; to the milestone (#236).

## Covered and clean

- **Sequences:** 108 runs of 30 to 50 steps at 64² and 96², on six themes, live, frozen and imported (forces, brushes, Select's actions, the shelf, Remove, Clear-sources
  strokes, the first hunt's random operations, undo, redo, jumps). No empty or broken step. Undo then redo
  always gave the same map. Every save reopened to its stored map, the replay byte for byte.
- **Races:** Esc before a start, Esc while playing, Esc after the keep, Try another after an undo, an
  edit or undo arriving mid-play. Clean.
- **Frozen and older projects:** a project from an older generator opens with its stored land, slopes,
  trees, bushes and sources. Edits change only what they touch; the export keeps every source's timing. The
  six project fixtures (0.5.0 to 0.8.0, carves before D220, strokes before D322 and D399) open, undo, redo,
  take new forces and reopen.
- **The rules:** no force, brush or edit added an object or a source, apart from Carve's river and what the
  player placed. Drawn Carves at random places on two themes were clean.
- **The Rust boundary:** NaN, out-of-range, unknown and missing settings and fields, sent to every force's
  start and as a kept operation. All refused with one line or applied and reopened exactly, apart from
  finding 3.
- **Carve's Maturity:** Mature and Auto, clicked and drawn, 93 kept on three themes, some in a working
  area. No pop, no invisible carve, no added object; replays match, Try another keeps Mature, undo exact.

## Worth knowing

- **Older-generator projects.** A project saved by an older generator opens frozen (D336 (2)). Its replay
  is a frozen build, never byte-equal to the stored map, so D455 always stops undo at the save point. Once
  #265 bumps the generator, every 0.8.0 project reopens this way.
- **Settings a force doesn't have.** A start request with a setting that isn't the verb's (Deposit with
  `walls`) passes the start check, plays, then the keep refuses it with a schema path. The page never sends
  one, so it is left as it is.

## Running it

From this branch (`npm ci` first), output to `local/` (gitignored, D195):

```
npx tsx investigation/core-hunt-2/tools/hunt.ts <seed> [steps] [side] [theme] [live|frozen|import]
sh investigation/core-hunt-2/tools/batch.sh <round> <steps> <seeds...>   # three at a time
npx tsx investigation/core-hunt-2/tools/boundary.ts                        # odd starts, every force
npx tsx investigation/core-hunt-2/tools/opMutations.ts                     # mutated forceResult operations
npx tsx investigation/core-hunt-2/tools/depositSweep.ts <theme> [side] [uses]
npx tsx investigation/core-hunt-2/tools/maturity.ts <theme> [side] [uses]
```

`hunt.ts` prints one line per problem and writes its step log to `local/`; a seed and its step log
reproduce a run.
