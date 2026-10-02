# Start and edge rules

**Built** on branch `feature/start-edge-rules` (PLAN §20 D151–D153, D164, D171; ROADMAP "Start and
edge rules"), a PR into `dev`, to be released as `start-edge-rules-done`. Generated maps change:
generator 0.6.1 (a link made with 0.6.0 opens with the note that the map may differ). 0.6.1, not
0.7.0: M9a's plan already names 0.7.0, and two generators must never share a version.

## No edge walls (D151)

- **`terrain.edge_wall`**, in both validators (`src/core/analysis/edges.ts`,
  `prototype/validate.py` `edge_walls`). Along each map edge, a tile is walled when the edge's
  outer two tiles there stand 2 or more levels above the highest of the next three tiles inward;
  an edge is walled when 60% of its tiles are; the check fails when any edge is walled. It reads
  the terrain only, so a wall one or two tiles thick is caught, and land that rises toward the edge
  in steps set back from it (highlands, terraces, a cliff) is not. Not applicable under 10 tiles a side.
- **A new check class, `principle`**, for Kyler's decided principles about how a map is built
  (D115 (2)): it blocks a generated map (the generator tries again) and the editor's export, and
  is information on an import, as D151 says. A problem an imported map already had never blocks its export: the
  export dialog lists it apart, as before. M9a's dam-wall check (D111) belongs here too.
- **Thresholds from the data** (`npx tsx tools/edge-walls.ts`; the official and workshop files
  are read locally and never committed):
  | Maps | With an edge wall | Most walled edge among the rest |
  |---|---|---|
  | Official, 19 | none | 38% (Canyon) |
  | Real places, 85 conversions | all 85 (the most walled edge 89–99%) | – |
  | Generated before this step, seeds 1–30 of every theme at 128² (180) | none | 36% |
  | Generated now, the same 180 | none | 36% |
  | Workshop maps, 141 files (information only) | 4, at 65–86% of one edge | 57% |

  The real places' wall is one tile thick and full height; a band of two tiles (a wall two thick
  too), a rise of 2 levels over the next three tiles and a share of 60% catch every one of them,
  and sit well above every official and generated map. One generated attempt in the batches met it (Delta 96²
  seed 85: a terrace's top shelf ran two tiles thick along 65% of the north edge) and was
  retried, as a blocking check should.
- **The fixture**: `tests/fixtures/edge-wall/near-aso-caldera.json.gz`, the terrain of one real
  place as converted for `real-places-done` (1.4 KB). Every edge is flagged; the same land with its
  outer ring lowered to the land inside passes.
- **The generator** adds no wall or rim along any edge: nothing needed removing.
- **Real places**: all 85 conversions fail it. `placeTimber` now refuses only load problems, so
  the gallery keeps serving them until Real places 2 converts them without walls; the contract
  tests pin the failure (`PLACES_HAVE_EDGE_WALLS`) so the rebuild must turn it off.

## Maps don't have to hold their water (D152)

Every water check, reviewed:
- **`water.settles`** already accepts a steady flow off the map: it asks the volume to change by
  under 0.2% and 99.5% of tiles by at most 0.005 between checks 128 ticks apart, so water that
  keeps leaving at a steady rate is steady. Unchanged in both validators; its message says
  "steady" now, and two unit tests hold it (`tests/unit/water.test.ts`: a channel pouring off the
  east edge settles and keeps losing all it pours; water from empty after one check fails).
- **`water.no_flood`** caps how much of the map is under water: it asks nothing to stay. Kept.
- **`water.clean_exists`** (2% of the map clean water) and **`water.clean_reach`** (a clean body
  of 40+ tiles) asked a map to keep an amount of water. They are targets now, with an advisory
  warning, in both validators: nothing about water is guaranteed but the start's own
  (`start.water`), and a real place needs only a source and the start requirements.
- **`water.outflow`** asks each source's water to reach an edge or a planned lake, so it never
  pools and floods: the opposite of holding water. Kept.
- **`water.badwater_contained`** (D57): the badwater basin's rim holds badwater, not the map's
  water. Kept, as decided.
- **`water.reservoir`** (storage near the start) is already a target (D85); a dam site whose
  reservoir would reach the map edge does not count, which is how water behaves, not a rule that
  it stay. `water.storage_possible` comes with M9a (D111).
- **Lake levels**: no check asks a lake to keep its level; a lake fills to its outlet's sill.
- **The generator** adds no rims or walls to keep water on the map. The sealed river mouths (a
  source on every channel tile of a river's mouth, and the strength-0 sources sealing a badwater
  mouth's leftover tiles) are how a river enters, and stay. Rivers leave by an edge at their own
  bed level; lakes spill over their outlets. The valley planner's margin that keeps the river's
  centre 0.2·H + 12 tiles off the north and south edges, and the planned basin's 4 tiles, only
  keep the dam site's reservoir off the edges; they go with the dam site in M9a (D111): pending
  below.

## Water sources start rivers (D171)

- **`water.source_in_flow`**, in both validators (`src/core/analysis/sources.ts` `sourcesInFlow`,
  callable from `src/core/places/`; `prototype/playability.py` `sources_in_flow`). The rule, on the
  map's terrain, its objects and its settled water:
  1. Every emitter (sources, seeps, aquifers, badtide drains) with its tiles and its strength as
     the water model runs it; emitters whose tiles touch (8-neighbour) are one group: a sealed
     mouth's row, a cluster side by side at a river's head, a BadwaterSource with its seals.
  2. Water runs down the spill levels (the canonical pre-fill's priority flood), across a flat of
     one spill level toward its way out (a tile beside lower ground, or a draining edge) and never
     back away from it, and all through a pool (a depression: spill level above its floor).
  3. A group's water goes from its tiles over the settled water (any depth), one such step at a
     time: down a river's bed, over its falls, through every pool and lake it passes; never up a
     stream, back up a flat reach or across dry ground.
  4. A group is inside an existing flow when the water of a running group reaches one of its
     sources and its own water does not reach that group back. Groups whose water reaches each
     other stand side by side (springs across one pool) and neither is flagged.
  Each WaterSource and BadwaterSource of such a group is flagged. A design check: it blocks a
  generated map, warns in the editor's export, and is information on an import. It settles
  nothing new: the validators' own settle is reused.
- **Why this rule**: the first version spread each source's water over every tile of a flat at
  its spill level, and flagged an official map's second river mouth (Meander's north row, which
  the east river's water "reached" by walking back up the flat channel) and sources on broad flat
  plains; a version that walked only toward the flat's way out missed a source beside the line
  down a wide channel. The final rule crosses a flat but never walks back up it.
- **Results**: generated maps: none (the batches below validate every accepted map with it).
  Official maps, as information: Beaverome (7 of 25: springs on the crater lake's floor that
  another spring's stream also fills), MountainRange (1 of 12), Pillars (1 of 8) and Terraces (3
  of 19, sources in a cave, which the top-surface model reads wrongly). Real places: 54 of 85
  conversions have 1 to 4 sources inside another's flow (28 have 1, 17 have 2, 7 have 3, 2 have
  4), Yosemite Valley among them (1 of 8); the contract tests pin the list
  (`PLACES_SOURCES_IN_FLOW`) for Real places 2 to empty.
- **The generator** already places sources only where water begins: the sealed mouth rows at the
  edge, each tributary's own mouth, the spring clusters of spring-fed rivers and streams, the
  badwater basin's spring at its own head, and ponds fed by their own spring. More flow comes from
  more mouth tiles or the strength per source (at most 8 a tile). Nothing needed changing.
- **Tests** (`tests/contract/sources.test.ts`, 7): a sealed mouth passes; a source downstream in
  the river is flagged; a cluster at a spring-fed river's head passes, and so does one strong
  source there, but a second one downstream is flagged; a spring in a lake the river fills is
  flagged, and a pond fed by its own spring is not; springs spread across one pool pass; a
  tributary with its own mouth passes; the check's class and severities in the three profiles.

## The start water rule (D153)

- **`start.water`**, in both validators (`src/core/analysis/walk.ts` `pumpShoreDistance`,
  `prototype/analysis.py` `pump_shore_distance`): the walk from the start's 3×3 (the walk the wood
  and bushes use: level moves, diagonals where both neighbours are level, and the map's Slope
  entities as links, never player stairs) to the nearest shore tile that touches clean water at
  least 0.3 deep whose surface a pump on that shore reaches (0–2 levels below the shore's own
  ground). The shore may be on any level the walk reaches. The old same-level function stays in
  `walk.ts` for the landscape survey's converter; no check uses it.
- **The generator**: the start's bench no longer runs to the bank (D97's strip only served the old
  same-level rule; a project saved with one keeps it). The bench stands a level above the
  floodplain (D26), and the colony walks down over the map's own slopes. The derived slope out of
  the start's own level now stands on the boundary pair nearest the start and the rivers' channels
  together (Chebyshev to the start plus 4-neighbour steps to a channel, integers only), not on the
  nearest pair alone, whose ties could put it on the far side of the bench (Canyon seed 7's first
  attempt walked 27.9 tiles to water; 6.2 now). The editor's start moves no longer run the bench
  to a bank either.
- **The editor**: the start's indicators and green or red footprint use the new walk. Where a
  generated map's start moves, the build will derive its slopes again, so the page predicts them
  (`placeSlopes` on the ground as it would be, round the objects that stand); at the start's own
  place it reads the map's slopes as they stand, so it agrees with the validator there.
- **Text**: the map card reads "Water without stairs: 6.2 tiles' walk (at most 20)"; the settings
  band "The walk to clean water a pump reaches, using only the map's own slopes. Official maps:
  most 12 tiles."; the README "Every map's start has clean water within a short walk, using only
  the map's own slopes."

## Starting wood (D164)

- **`start.wood`**, in both validators (`src/core/analysis/wood.ts`, `prototype/playability.py`
  `growth_of`, `tree_logs`): the logs of every grown Pine, Birch and Oak within 20 tiles' walk,
  alive or dead (a tree keeps its logs when it dies; only a succulent loses its yield), each by what
  its `Yielder:Cuttable` holds when that is logs, else its species' yield (oak 8, pine 2, birch 1).
  A sapling (a `Growable` whose `GrowthProgress` is below 1, read as a plain number, the parser's
  float or the older wrapped form; no Growable or no readable value is grown) does not count: its
  logs are reported apart, as wood still growing.
- **The defaults**, 120 / 80 / 40 logs (Easy / Normal / Hard), are Kyler's 60 / 40 / 20 trees at 2
  logs of grown wood a tree. On seeds 1–30 of every theme at 128² with the default settings, the
  trees the old rule counted gave 3.0 logs each (River Valley 2.76, Canyon 3.35, Highlands 2.87,
  Lake Basin 3.10, Delta 3.05, Islands 2.94; pine 51%, birch 28%, oak 22%; the default mix of 47 /
  27 / 20 gives 2.99), and 66% of those logs stood on grown trees (a third of living trees are
  saplings): 1.98 logs of grown wood a tree, rounded to 2. Official maps, which store no saplings:
  median 110 logs within 20 tiles' walk (14 measured), nearly all pine.
- **The setting**: **Minimum starting wood (logs)**, 0–800, share-link key `sl`; Designed for
  resets it. A link from before carries Minimum starting trees (`st`): it opens as 2 logs a tree
  (`st=25` → 50) unless it also has `sl`. A project file or autosave from before opens the same way
  (`upgradeSpec` in `decodeProject`): the saved River Valley fixture's 50 trees open as 100 logs.
- **The generator** never aims below the minimum: near-start groves grow until they give 1.35 ×
  Minimum starting wood in grown logs within the walk (each grove counted exactly, with the tile
  hash the forest's rasterizer uses for saplings), and never less than 40 trees' worth. Where the
  walk holds little moist land (a canyon floor), they draw their species by the wood they give as
  well as by the mix.
- **The page's sapling bug**, fixed here (Kyler's correction): `lifeOf` (`src/worker/api.ts`)
  read `GrowthProgress` with `Number()`, which gives NaN for the parser's float, so no sapling was
  ever marked young: the 3D view drew every sapling full size and the hover never said "young". It
  reads the growth with `isSapling` now; nothing else read it. Saplings are drawn at half size, as
  `entities3d.ts` always meant; the models need no sapling look of their own. Before and after
  captures of the 3D view, from two poses round the densest young grove of River Valley seed 4242
  at 128² (229 saplings in the file): `docs/map-look/saplings/river-valley-4242-{close,grove}-{before,after}.jpg`,
  with the poses and counts beside them (the page marked 0 objects young before, 237 after:
  the 229 saplings and 8 young succulents). `tools/capture-saplings.ts` makes them.
- **Where it shows**: the editor's indicators ("Starting wood: 86 logs, mostly pine, plus about 30
  growing (at least 80)"), the map card's start requirements (the same words), the settings band
  ("Logs from grown trees within 20 tiles' walk: an oak gives 8, a pine 2, a birch 1. Saplings
  count once grown. Official maps: most 110."). The "how it plays" text and the resource-timing
  axis belong to M9c and design version 2.

## Tall maps (D172 (1), after probe run 20260925-tall)

- **`terrain.max_height`** passes up to 22 in both validators (`GAME_MAX_HEIGHT` in
  `src/core/format/world.ts`; `prototype/validate.py`), with the top voxel layer left empty. Above
  16 its message notes that the in-game map editor edits only up to level 16. The generator's
  heights, the editor's height inputs, the features schema and Real places are unchanged.
- **Tests**: a map with a column at 22 passes and one at 23 fails, in both validators
  (`tests/contract/edges.test.ts`). No test pinned 16. `tools/probe-tall.ts` reports the limit it
  tested and leaves the stretched real place's edge wall aside (a principle, not loading).

## Checks

Blocking, under Kyler's lighter process: breakage, his decided principles, and what a player feels.

- `npm run typecheck` clean; `npm run test:quick`: 459 tests in 36 files pass; `npm run test:e2e`
  (the installed Chrome): 63 pass; `npm run test:heavy`, once locally: 44 tests in 4 files pass.
- **Oracle** (`npm run oracle`, full, after the last merge of dev): PASS. 150 maps (50 seeds at
  96², 128² and 256², every theme), no generation, load or round-trip failure; parity on 50
  generated maps (2,250 checks) and the 19 official maps, 0 disagreements.
- **Batches** (`tools/batch.ts`, 100 seeds a theme, Normal): 100% final at every size in every
  theme. First attempt at 96², 128², 192², 256², M8's in brackets:
  - River Valley 99, 99, 100, 100% (98, 99, 100, 100)
  - Canyon 99, 97, 100, 100% (100 at every size)
  - Highlands 92, 98, 95, 94% (96, 98, 95, 94)
  - Lake Basin 100% at every size (100)
  - Delta 99, 100, 100, 100% (100, 99, 100, 99)
  - Islands 100, 100, 100, 98% (100, 100, 100, 98)

  Easy and Hard, 30 seeds a theme at 128²: 100% final in every theme; first attempt 100% except
  Highlands Easy 90% and Highlands Hard 97% (M8: 87%, 93%). What failed a first attempt:
  `start.wood` (Canyon 96² 1, 128² 3; Highlands 96² 3, Easy 1; Islands 256² 1), `start.water`
  (Highlands 96² 1, 128² 2, 192² 2, 256² 1, Easy 2, Hard 1; Islands 256² 2), `start.dry`
  (Highlands 96² 4, River Valley 128² 1), `water.settles` (Highlands 96² 1, 192² 3, 256² 5; River
  Valley 96² 1) and `terrain.edge_wall` (Delta 96² 1, above). No accepted map fails `terrain.edge_wall` or `water.source_in_flow`: both
  block generation. Four runs that another agent's cleanup cut short (96² Lake Basin, 128²
  Highlands, 192² Canyon, 256² River Valley) were run again in full, on their own and one after
  another; these are the complete runs.
- **The settings suite's experiments** (`tools/settings-suite.ts`, 20 seeds at 96²): **Water
  without stairs** 8 → 20 moves the start's walk to water from 2.6 to 7.9 tiles; **Minimum
  starting wood** 40 → 240 moves the wood near the start from 196 to 354 logs; **Minimum starting
  bushes** 10 → 80 moves the bushes from 26 to 94. All three move.
- **Contact sheet** (D144): `docs/sheets/start-edge-rules.png`, seeds 1–30 of every theme at 128²,
  top-down, labelled with seed and theme, the start in red (545 KB; `tools/contact-sheet.ts` and
  `tools/contact-sheet.py`).
- **Generator 0.6.1**: every generated map may differ from 0.6.0's, so an older share link opens
  with the note that the map may differ. No test pins a generated map's hash (the water golden
  vectors do not depend on the generator). The live check's canonical file (River Valley 4242,
  128²) is now sha256 `e4f2f72c…`.
- **The Claude suite** (D134): 105 of 120 reference solutions pass (dev: 101). The start rule's
  entries now speak of wood in logs (`investigation/claude/lib/sites.ts`, `tools.ts`, `report.ts`,
  `compound.ts`); an export blocked by a principle counts as blocked (`summary.ts`). Four that
  failed on dev pass now (F07, F08, M01, W09). Three broke here and are fixed:
  - **W04** (a lake near where the south tributary rises): the lake finder's sites lay beside the
    tributary at its level, so the tributary fills them and their own spring stood in its flow
    (D171). A lake site that breaks only `water.source_in_flow` is now tried without a spring of
    its own, and offered that way when it passes: the river fills it.
  - **S05** (make the waterfall wider): on the regenerated map a 25-wide fall in place would cover
    a river. A standalone fall that grows into a river now grows away from it, its lip moving along
    itself by at most the width it gains.
  - **X04** (a dam site near the mouth and a badwater spring just upstream): the reference's extra
    "within 25 tiles of the river" left only basins below the river's water near its mouth, which
    the river floods (their spring inside its flow). The reference now asks "just upstream of the
    dam" alone; the basin it finds drains into the river above the dam, and the trade-off is named.
  The other 15 failures are dev's, setups tuned on M7's maps; they are re-tuned once this step
  and the resources step have both landed (docs/STATUS.md).

## Tests changed by Kyler's decisions (D148)

Updated to the current decisions, renamed where their names no longer said what they check; none
was deleted or weakened:
- `tests/contract/start.test.ts` (D153, D164):
  - "water reached only by a slope fails" became "water reached down a natural slope passes; the
    same step without one needs stairs and fails" (the same scene: with the map's slope the walk is
    20 tiles and passes, 19 fails; without the slope there is no water);
  - new: "the pump works from the shore it stands on: water too far below that shore fails, on any
    level";
  - the defaults test reads 120 / 80 / 40 logs, and checks they are the old tree counts at 2 logs a
    tree;
  - "trees below the minimum fail, and Minimum starting trees moves the result" became "wood below
    the minimum fails, and Minimum starting wood moves the result";
  - "trees too far away, dead trees, and trees on soil that kills them do not count" became "wood
    beyond 20 tiles' walk does not count; dead trees, and trees that will die, keep their logs"
    (they now count, by the game's rules);
  - "trees across a slope count" became "wood across a slope counts";
  - new: "each species gives its own yield", and "a sapling's logs are still growing: shown apart,
    never counted, whatever form its growth takes".
- `tests/contract/features.test.ts` (D152): a generated map may warn on `water.clean_exists` and
  `water.clean_reach`, targets now.
- `tests/contract/placesCommon.ts`, `tests/contract/places.test.ts` (D151, D171): every place passes
  every check but the conversion's known faults, which both validators flag: the edge wall on all
  85 (`PLACES_HAVE_EDGE_WALLS`) and a source inside a flow on 54 (`PLACES_SOURCES_IN_FLOW`); the
  export profile blocks on the edge wall, and the gallery's builder still serves the file.
- `tests/contract/spec.test.ts` (D164): the random specs carry `woodWithin20` (0–800); new: an old
  link's starting trees open as wood, and the wood key wins.
- `tests/contract/projects.test.ts` (D164): the saved River Valley project opens its 50 starting
  trees as 100 logs.
- `tests/contract/calibrated.test.ts` (D164): the Python table's `wood_r20` against the
  TypeScript defaults.
- `tests/contract/validate.test.ts` (D151): the check classes include `principle`.
- `tests/e2e/start.spec.ts` (D153, D164): the card's and the indicators' words; **Minimum starting
  wood (logs)** 75 moves the card's limit (`&sl=75`); the page's wood equals the validator's; the
  walk away from the river takes its direction from the water the validator found, since the
  bench no longer runs to a bank (the page's test hook now gives a check's tiles).
- `tests/e2e/tools.spec.ts` (D164): the indicators read "Starting wood: N logs".
- No test pinned 16 as the height limit; a new one checks 22 passes and 23 fails in both validators
  (D172 (1)).

## Pending, with defaults

For the orchestrator to number in docs/decisions-pending.md:
1. **Edge walls on the gallery until Real places 2.** `terrain.edge_wall` blocks the export profile
   the real places are built in, and all 85 conversions have the wall. Default: the builder refuses
   only load problems, so the gallery keeps serving the walled maps until the rebuild (the next
   step, D157); releasing this step before Real places 2 leaves them up for that time.
2. **`water.source_in_flow` in the editor's export.** D171 says blocking for generated maps and
   reported for imports; the editor's export of a player's own map is not named. Default: a design
   check, so a source a player places inside a river warns (confirm and note) rather than blocks,
   as D3 keeps a player's own edits blocked only by load problems.
3. **`water.clean_exists` and `water.clean_reach` are targets now** (D152: nothing about water is
   guaranteed but the start's). Default: advisory warnings; they never reject a map.
4. **The dam site's edge margins** (the valley planner keeps the river's centre 0.2·H + 12 tiles off
   the north and south edges, the planned basin 4 tiles off every edge) keep the dam site's
   reservoir off the edges. They are not walls. Default: they stay until M9a removes the dam site
   (D111).
5. **Flat reaches in `water.source_in_flow`.** The rule reads levels: a source downstream on a flat
   reach at its head's own level, off the water's way out, counts as a head. Default: accepted;
   Real places and Pick a place place sources only at heads by construction, and the check is
   their safety net.
6. **Generator 0.6.1**, not 0.7.0 (M9a's plan names 0.7.0). Default: 0.6.1.
