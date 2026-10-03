# Coherence review: the exact core before the Rust port (D386, D461)

Dead code, duplication, inconsistent patterns and things built twice in `src/core/` and `src/worker/`, and in
`tools/` where a script re-implements core logic. Ranked by what fixing them saves the Rust port (D381: the water,
the five forces, their planning and the checks, then the generator), then by the bugs a fix prevents. A report and a
plan only; nothing outside this folder changed.

**Base:** `feature/m9b` at `fe3ed80f` (dev `8b066342` is already an ancestor, so merging dev in was a no-op and
clean). Reviewed in a fresh clone (`C:\Users\Kyler\code\DamGoodMaps-review`; the prompt's `C:\Users\krams` does not
exist on this PC).

**Method:** a whole-word reference sweep over `src`, `tests`, `tools`, `investigation`, `rust`, `prototype` and the
configs seeded seven reading agents (water and sim; forces; doc, features, spec and format; generator and land;
checks and analysis; worker; tools). Every finding below was confirmed by reading both places (duplication) or by
listing every call site including tests and tools (dead code). Candidates that did not confirm are left out. The
sweep script is `sweep.mjs` in this folder; it writes nothing.

**Not findings, stated once:** the Rust water (`rust/water`) is a deliberate twin of `sim/water.ts` and its README
already says it is re-ported to M9b's water once M9b is on dev. The three Rust binding files (`waterWasm.ts`,
`rustWater.ts`, `waterRust.ts`) each have one job. `prefill.ts` is the water's own flood, on purpose. The Naturalize
`weather*` worker messages and `raster/remoteStroke.ts` have no caller today, but their page wiring is a pending
patch (`docs/progress/naturalize/brushes-worker.patch`, D424), so they are not dead.

"Bytes" says whether the fix moves any generated map, saved project rebuild or file water. **Yes** items need a
re-pin (D308) and are flagged.

## 1. Findings

### A. The water (ported first)

**A1. The soil `port` rules are unreachable; the water `port` rules serve only parked Real places.** `sim/soil3d.ts`
`moisture3d`, `contamination3d` and the `port` branch (about 350 of 744 lines), `sim/soil.ts` `SOIL_MODE`, and the
options `BuildOptions.rules`, `ValidateOptions.waterRules`/`soilRules`, `PlayabilityInput.soilRules`: no product
caller passes any of them (only `tools/soil-compare.ts` and `tests/unit/soilGame.test.ts`). `WaterRules "port"` in
`sim/water.ts` (the `this.game`/`edgeSpill` branches) is reached only by `places/place.ts:212` (D311) and one tool.
Fix: delete the soil port path and the dead options now; decide the water `port` fork at the Rust re-port (it must
carry the fork or Real places 2 moves to game rules). Bytes: soil, no; water fork removal, **yes** for Real places.

**A2. `preview.ts` `drainUnfedAfter` is a second `fed.ts` `withoutUnfed`, and it writes `D`/`C` on a running sim**,
which `sim/README.md` forbids (bookkeeping stale for one substep). Fix: one drain, `withoutUnfed`, in both the
canonical run and the preview. Bytes: preview water only, possibly a bit; file water, no.

**A3. Two warm-start drivers:** `preview.ts` `previewSettle` (1-day cap; `build.ts:1039`, `generate.ts:2402`) and
`PreviewJob.advance` (4-day cap; the worker) run the same steps. Fix: one driver with one cap. Bytes: **yes** if the
generator's start-pad judgement takes the longer cap.

**A4. The evaporation modifier `0.0595·t²+0.101·t+0.72` and cluster saturation are written five times:** `water.ts`,
`fill.ts` `modifiers`, `drought.ts:77`, `format/world.ts:234`, `moisture.ts` `clusterSaturation`. Fix: one
`evapModifier(sat)` beside `clusterSaturation`; `water.ts` keeps its pinned incremental form. Bytes: no.

**A5. Dead:** `sim/columns.ts` `changesWaterColumns`, `isOpenField`, `masksToVoxels`, `voxelMasks`, `slotAt`,
`isRoofed`; `drought.ts` `EVAPORATION_PER_DAY` (`calibrated.ts:192` writes the literal); `features/hollow.ts`
`hollowAt` (a third priority flood; only its test and `investigation/claude`); `WaterSimOptions.edgeSpill` is never
passed. `columns.ts` `OBSTACLES` re-states `model.ts`'s footprints with `0.65` as a literal beside
`NATURAL_DAM_HEIGHT`. Bytes: no.

**A6. Small:** `outletWear.ts` and `moisture.ts` carry their own `N4`/`DIRS4` (the latter in a different order, so
not merge-safe without a check); `SECONDS_PER_DAY` is defined in `fill.ts` and `drought.ts`; drought days are pinned
equal in `calibrated.ts` and `weather.ts`.

### B. The forces (ported second)

**B1. Force planning and result assembly live in the worker, not in `core/forces/`** (D342). `worker/session.ts`
`startForce` (keep mask, point refusals, per-verb intents), `naturalRequest` (the verb dispatch `nature.ts` lacks),
`forceAgain`, `recordOf`, `forceStop` with `withOwned`, `glacierSprings`, `featherForce`, `carryStart`,
`sessionForceMap`: about 500 lines that a Rust forces port would leave in TypeScript or port twice.
`tools/determinism/cases.ts` and `tests/contract/randomOps.ts` hand-write the same per-verb record. Ids come from
`crypto.randomUUID()` inside the worker; core planners take ids as parameters. Fix: `planForce`, `forceRecordOf`,
`fullForceMapOf` and `natureOf(verb, …)` in `core/forces/`, ids supplied by the caller. Bytes: no if moved verbatim.

**B2. Two identical priority floods:** `forces/drainage.ts` is `land/drainage.ts` minus `outlet`, `eight` and
`area` (same loop, same direction order, same `MinHeap` tie-break; read side by side). Callers:
`carve/course.ts:86`, `carve/edge.ts:21`, both `drainage(h,W,H,0.0001)` = `land/drainage(h,W,H,{epsilon:0.0001})`.
Five more inline 4-neighbour spill floods do what `drainage(…,{eight:false}).filled` does: `land/levels.ts`
`fillDryHollows`, `carveOutlets`, `unreachedLakes`, `edgeSpill`; `water/outletWear.ts` `spillOf`. Fix: one flood.
Bytes: no (spill levels are order-independent; every caller has an outlet).

**B3. `water/edgeSources.ts` is a placeholder that never runs.** `EDGE_LIP` is `null`, so `keepSourcesOnMap` always
returns `changed: []`; Carve and Glaciate store `edgeLeaks`, which nothing reads. The real lip (`water/edgeLip.ts`)
is called only by the generator; `water/README.md` says the forces call it. Fix: delete `edgeSources.ts`, its test,
the fields and the two call sites; wiring `edgeLip` into the forces is a separate decision. Bytes: delete, no; wire,
**yes** for force output.

**B4. Carve keeps its pre-D220 operation beside `forceResult`.** `carve/op.ts` (`CarveParams`, `carveProblems`, a
strict subset of `forceProblems`), `carve/result.ts` `carveParams`, `doc/ops.ts` `carve` cases (287, 374, 627–641),
the `carve` label and `$defs.carve` in `ops.schema.json`. The worker emits only `forceResult`, but builds the legacy
shape first and converts it (`carveForceParams` → `forceOfCarve` → `literalOf` again for rock). Fix: build
`ForceResultParams` directly; migrate `carve` to `forceResult` at load if pre-D220 saves must open (D158, Kyler's
call), then delete the branches. Bytes: no (`forceOfCarve` is already the apply path's conversion).

**B5. Settings validated two to three times in three shapes.** `forces/op.ts` `forceSettingsProblems` (string[],
reached from `doc/ops.ts`), start-time `validateCrater`/`validateErupt`/`validateQuake` and `carve/run.ts` (throw
generic text), `glaciate/model.ts` `glaciateProblem` (string|null). Ranges are literals in `op.ts` beside named
constants, and `ops.schema.json` `forceResult.settings.size` is 4–180 for every verb while the code allows 6–140
(Erupt) and 4–64 (Glaciate). Only the `forceSettingsProblems` path meets D342's one-line-reason rule. Fix: one
per-verb table used by every path; the schema checked against it. Bytes: no if the ranges stay.

**B6. Glaciate carries round 4's older path.** `plan.ts` `finish = false` (about 15 arms) is selected only by
`run.ts`'s `VITE_GLACIATE_ROUND4` env read, which only `tools/capture-glaciate.ts` sets, plus tests.
`glaciate/measure.ts` (266 lines) has no product caller (one tool, two tests). `GlaciateRun` copies `runs.ts`
`Staged`'s `step`/`planAll`/`finishAll` (not exported) differing only in `PLAN_MS`. Fix: drop `finish` and the env
read; `GlaciateRun extends Staged`; move `measure.ts` to tools or leave it out of the port. Bytes: no.

**B7. Two result builders and three footprints.** `force.ts` `forceResult` (Carve only) and `result.ts`
`literalOf` run the same changed-tiles loop; `ForceResult.added` and `CarveRun.added` are never read; `ForceRun`
has one implementor. `force.ts` `entityTiles` and `forces/objects.ts` `footprint(margin 0)` are identical;
`features/edits.ts` `entityTiles` uses the occupied blocks and can differ. The warm-state literal is written three
times in forces plus `sim/preview.ts:347`; `modelOf`/`modelFor`/`build.ts:1282` are one expression. Fix: Carve uses
`literalOf`; one `warmState`, one `modelOf`, `entityTiles` calls `footprint`. Bytes: no (switching forces to
block-based tiles would be **yes**; not proposed).

**B8. Dead in forces:** `carve/op.ts` `carveBounds`, `isCarve`; `op.ts` `isForceResult`; `runs.ts`
`craterNaturalSize`; `quake.ts` `paintWater`; `random.ts` `mixSeed` (the live copy is `carve/character.ts`);
`force.ts` `forceCeiling` ignores its argument; `unleash.ts` `strengthOfWidth` is tests-only. `clamp` is defined
six times in forces (eight in core), `smooth` twice, `N4`/`N8` tables locally. `objects.ts` `isPlant` lists five
species where three other lists have eight. Keep as they are: `random.ts` `hash`, `glaciate/model.ts` `noise` and
the two next-seed series (unifying them moves maps).

### C. Planning, analysis and the checks (ported third)

**C1. The colony's walk graph (blocked footprints plus Slope links) is hand-written 17 times** across
`validate/playability.ts` (×3), `gen/generate.ts` (×4), `gen/extras.ts` (×2), `gen/resources.ts`, `gen/valley.ts`,
`gen/settler.ts`, `resources/plan.ts`, `doc/waterFix.ts`, `analysis/vertical.ts`, `forces/glaciate/plan.ts`,
`features/slopes.ts`. `WALK_BLOCKERS` lives in the validator and is imported by analysis, gen, doc and resources
(inverted layering). Variants to keep as options: no blockers (`walkLabels`, settler), wet tiles blocked
(`startWalk`). Fix: one `walkWorld(entities, W, H, opts)` in `analysis/walk.ts` with `WALK_BLOCKERS` beside it.
Bytes: no.

**C2. `analysis/legend.ts` and `analysis/levers.ts` are used by tests only**, and `PlayabilityAnalysis.walkReach`
and `.levers` are computed on every validation for no product reader (`worker/api.ts` copies them; no page code
reads them). The page's legend is `src/ui/legendMap.ts`, with its own `legendTiles` and a regex table repeating
`LEGEND_KINDS`. `levers.ts`'s header still says M9b "is not on dev yet". The same holds for `library/strip.ts`,
`library/saver.ts` and `library/when.ts` (salvaged for the page session, D395). Fix: Kyler and the page session
decide whether the card and strip wire to these or they go; until then they are dead weight in the port. Bytes: no.

**C3. `analysis/vertical.ts` `vertical()`, `Vertical`, `pctLin` have no caller** and repeat `metrics.ts`
`measure()` line for line (`pctLin` is `percentile`); `metrics.ts`'s falls block equals `fallsOf`. Only `fallsOf`
and `reachWalk` are live. Fix: delete; `metrics.ts` calls `fallsOf`. Bytes: no.

**C4. Four 4-connected wet floods** (`regions.ts` `components`, `story.ts` `wetSystems`, `walk.ts`
`startWaterShore`, `storage.ts` `runningFlow` with `0.001` as a literal beside `WATER_BODY`); **the start's middle
tile five ways** (`playability.ts` `startMiddleTile`, `resources/measure.ts` `startCentreOf`, `mechanics.ts` twice,
`doc/tools.ts` `startCentre` closed form, plus two tools); **"does this check fail/block" six ways**
(`report.ts` `blocks`, `firstVisit.ts` ×2, `waterFix.ts`, `place.ts`, worker `instantCheck`), with `!approximate`
dead after `!ok` everywhere since `Collector.approximate` forces `ok: true`. Fix: `components`, one `startMiddle` in
`format/footprints.ts`, `failing(c)` exported from `report.ts`. Bytes: no (the closed-form start centre must be
shown equal to the footprint average for all four orientations).

**C5. One name, two values:** `analysis/storage.ts` `SECONDS_PER_DAY = 460` (the oracle's `storage.py`) against
`sim/drought.ts`/`fill.ts` `460.8`. `water.storage_possible` uses the 460; `generate.ts:2676` reads that check into
`replannable`. Fix: rename the storage constant, or move the oracle to 460.8 and share one. Bytes: rename, no;
unify, **yes** at the margin.

**C6. Ruler-straight is a generator stage with an invented check id.** `generate.ts` pushes
`"water.straight_channel"` to `failedIds`; no check emits it, the validator never runs `straightness`, so imported
and edited maps are never measured against it, and `analysis/README.md` lists `straight.ts` among the rules behind
checks. Fix: make it a check (design class) or document it as generator-only and drop the id. Bytes: as a check,
no for generated maps (they already pass it) but the Python oracle needs the id.

**C7. Small:** `land/hydro.ts` `STORY_REACH = 0.14` copies `story.ts` `REACH`; `checks.ts` `lowerTheWall`
re-scans what `edges.ts` `edgeWalls` scans; `isDead`/`isYoung` three ways (`resources/measure.ts`, `analysis/wood.ts`,
`playability.ts`); `walk.ts` `tileShoreWalk` = `pumpShoreDistance` for one tile, with a third copy in
`tools/start-water-fed.ts`; `analysis/walk.ts` `shoreDistance` has no caller in src (investigations only);
`analysis/startPlanting.ts` is a tool-only measure; dead `ValidateOptions.soilRules`/`waterRules` (A1),
`EntityScan.startCells`, the `export { OCC }`. Logs per tree: one table, but "mean logs for a species mix" exists
twice with different numbers (`gen/resources.ts` `logsPerTree` folds succulents onto the heaviest species;
`baseline.ts` `woodPerTree` drops them). Bytes: unifying the last, **yes**.

### D. The document and the features build (editor operations port only if the audit justifies it)

**D1. The editor's feature planners are unreachable from the page.** The page sends only `{tool:"entity"}` to
`applyTool`/`footprintCheck` (`editor/shelf/useShelf.ts`, `editor/sources/useSourcePointer.ts`). So `doc/tools.ts`
`planRiver`, `planLake`, `planLandform`, `planPiece`, `riverWidthFor`, `deleteEdit` and most of `moveEdit` (about
700 of 1,168 lines), `doc/placing.ts` `planObject`, `moveObject`, `planArea`, `planRiverBadwater`, `acrossRiver`
(about 300 of 641), `doc/narrows.ts`, `features/route.ts` `routeChannel`/`channelWidth`, and the worker's `river`,
`lake`, `setPiece`, `object`, `spillway`, `riverBadwater` requests and `deleteFeature` are alive only through
tests, `tools/ingame-files.ts` and `tools/bench-preview.ts`. Their tools are retired (`retired-terms.json`,
EDITOR_PLAN §10). Flow→width is written three times with different numbers (`riverWidthFor`, `channelWidth`,
`land/hydro.ts` `widthFor`; only the last is live). `doc/tools.ts` also holds live start helpers the forces and
the build import (`startProblem`, `startClears`, `startCarry`, `moveStartNear`). Fix: move the start helpers to
their own module; delete the planners and their request branches; keep the rasterisers that replay old documents
(D158). Bytes: no.

**D2. Six set-piece builders and the plan side of the other three are unreachable.** The generator reaches only
`secondDistrict` (planned), `obstaclePayoff` and `badwaterBasin` (built directly; `badwaterBasin.plan` and
`mode:"marsh"` are dead). `damSite`, `gorge`, `naturalNarrows`, `plugSpillway`, `terracedCliffs`, `waterfall` (about
1,500 lines) are reached only through D1's dead planners; `limits` is implemented nine times and called nowhere;
`gorgeNarrows` has no reference; `land/narrows.ts` `planNarrows` is called only by the dead `naturalNarrows`
(`tests/contract/features.test.ts:56` asserts generated maps hold only the three). Fix: after D1, drop `plan`,
`limits` and `request` from the six; whether their replay sides stay is a D158 call (no fixture holds one). Bytes:
no for the plan code; removing a replay side changes old documents that hold one.

**D3. Options carried and read by nothing:** `GenerateOptions.context` (`PlanContext`, about 20 `ctx?.locked`/
`protect` sites in `generate.ts`, `gen/resources.ts` `ResourceConstraints`, `land/hydro.ts`/`hazards.ts` `protect`
and `avoid`) is never passed (locks and keep-outs removed, D253, D270, D336); `doc/tools.ts` `PlanContext.locked`
is always `null`, so `ctx.locked` is dead in every set piece and `objects.ts`. `MapSpec.setPieces` and
`constraints.keepOut`/`keep` (plus codec keys `sp`, `k`) are read only by `generate.ts:444`'s emptiness check: a share
link can carry them and silently get nothing. Fix: remove the option and branches; drop the two spec fields and link
keys with a tolerant schema. Bytes: no.

**D4. Dead and duplicated in doc/features/spec/format:** `terrain/runs.ts` `ColumnTerrain` (never constructed);
`features/slopes.ts` `rimSlopes`/`RIM_SPACING` (tests only; ramped edges retired, replay in `build.ts:787` stays);
`doc/ops.ts` `ENTITY_OPS`, `SLOPE_OPS`, `WATER_OPS` (no reference), `LOG_OPS` (tests); `features/geometry.ts`
`nearestOnPath`, `features/objects.ts` `singleParams`, `schema.ts` `FEATURE_SCHEMA_VERSION`, `byKind` (tests),
`spec/mapspec.ts` `SPEC_VERSION`; `spec/differ.ts` `settingsDiffer`/`settingsKey` (the page compares encoded
fragments inline, `ui/App.tsx:181`; the README says `differ.ts` drives the dot). Distance to a polyline is written
eight times with the same operations (`doc/tools.ts` `nearPath`, `route.ts` `nearPath`, `badwaterBasin.ts`
`distToPath`, `gorge.ts` `nearest`, `geometry.ts` `nearestOnPath`, `raster/terrain.ts` `mouthTilesOf`, `land/num.ts`
`polyDist`, `generate.ts:~790`). `doc/base.ts` `baseFromFile`/`baseTerrain`/`joinTerrain` re-do `terrain/runs.ts`
`terrainData`/`terrainColumns` and `world.ts` `voxelsFromHeights`; `spec/codec.ts` repeats `format/base64.ts`'s
bit-packing with another alphabet. Fix: delete the dead, one `polyDist` in `math/`, `BaseMap` built on `TerrainData`.
Bytes: no.

**D5. Source-group member ids derived three ways:** `water/sourceGroups.ts` `groupIds`
(`"sourceGroup"`, place along row), `carve/run.ts:329` (`"carve-source"`, tile), `glaciate/plan.ts` `memberId`
(x, y, k with a collision loop). One geometry (D314), three id rules. Fix: one `groupMemberId` in `sourceGroups`.
Bytes: **yes** for newly planned forces (stored ids stay).

**D6. `raster/weather.ts` `flood`/`waterLevels` is a third priority flood** (bucket queue, LIFO per level) that
documents itself as `land/drainage` with 4-neighbour flow. Fix: call `drainage` once a differential check shows the
`area` tree agrees on Naturalize's cases. Bytes: **yes** if `area` differs (Naturalize replay is pinned).

### E. The generator (ported last)

**E1. Dead files:** `gen/layout.ts` (224 lines; no importer anywhere; `land/genome.ts` replaced it), `gen/valley.ts`
and `gen/riverValley.ts` (`PlanConflict` has no importer; `startWalkable` is used only by frozen investigation
prototypes, and `generate.ts` has its own). `gen/README.md` still lists all three. Bytes: no.

**E2. Options and arms nobody reaches:** `GenerateOptions.secondStart`, `.drought` (no caller; `DroughtPolicy "off"`
arms in `settler.ts:243`, `generate.ts:1616`), `SHEET_REJECT = false` (its arm at 1770), `SPRING_STRENGTH = [2]`
(a one-element loop), `outcomes.ts` `PLAN_MARGIN` all 1s; `GenerationInfo.badwater` and `.ramps` written and read
nowhere; `gen/blobs.ts` `groupSizes`, `calibrated.ts` `BADWATER_RATIO` and four unread object members,
`land/num.ts` `DIR_NAMES`, `r2`, `library/yourMaps.ts` `newMapId`; the intention `safe-water-uphill` is out of
`ACTIVE` but keeps its title, text, weights, nudge and check (reachable only from a share link). Bytes: no (removing
`safe-water-uphill` makes such a link fail validation).

**E3. Two spring-placing rules with one comment claiming they agree:** `generate.ts` `springByStart` (912–980,
"As `doc/waterFix.ts` places it") and `doc/waterFix.ts` `waterFix`: same candidate loop and score, different tries
(3 vs 6), strengths, extra pad-level and edge filters, different walk. `waterFix` itself is referenced only by its
test (the page's fix waits on #92); the worker's `waterFixOps` has no reference. Fix: one `springCandidates(…)` with
each caller's options kept. Bytes: extraction, no; making them agree, **yes** (maps that needed a spring move).

**E4. Resources composed twice, and only one composition ships.** `resources/baseline.ts` `planBaseline`,
`baselineEntities`, `succulentsOf`, `woodPerTree`, `isYoungAt`, `resources/plan.ts` `planMapResources` (all 201
lines) and `resources/badwater.ts` `pickBadwaterSprings`/`springEntities` have no caller outside tests (Real places 2
parked, D319). `gen/resources.ts` `planResources` composes the same primitives and disagrees in four places (logs per
tree, succulent share, the sapling hash `(seed,"resources","young")` vs `(seed,id,"young")`, `NEAR_WALK` defined
twice). Fix: one composition; one `woodPerTree`, one sapling hash. Bytes: no for shipped maps.

**E5. Byte-identical duplicates, safe to merge:** `land/intentions.ts` `distanceTo` = `math/grid.ts` `distanceFrom`;
`resources/budget.ts` and `badwater.ts` `between`; `calibrated.ts` `density` = `officialPerMap(DENSITY[key])`;
`land/levels.ts` `footComponents` = `analysis/regions.ts` `landRegions` plus sizes; `levels.ts` `cleanPitsAndSpikes`
re-implements `raster/terrain.ts` `integrityLevel`; `land/intentions.ts` `clashes` duplicates the inline test in
`drawIntentions` and is tested instead of it; `FLOOD_MARGIN+1` as a hard-coded `3` in `minePads.ts` beside
`objectKeepOff`'s mask (copied again in `resources/plan.ts`, `playability.ts:1159`); `N4`/`N8` declared locally in
eight files. `calibrated.ts` `lnDet` (60-term series) and `math/portable.ts` `log` (24 terms) are the same series;
`math/README.md` says `detmath` holds the deterministic transcendentals, and it has no `log`. Bytes: no, except
`lnDet`→`log` which feeds every map's targets and needs one bit-for-bit check first.

**E6. Same rule, different numbers (bytes yes if unified):** `gen/settler.ts` `shoreWalkFrom` hand-types 0.35,
0.03, 1.9 where `PUMP_*` are 0.3, 0.05, 2 (`pumpShores`, `walk.ts` use the constants); `gen/names.ts` `landNoun`
restates `outcomes.ts` `PROMISES.holds` thresholds (canyon 20 vs max(16,…), valley 0.2 vs size-scaled), and three
theme→phrase tables exist (`PROMISES.text`, `versions.ts` `PROMISE_WORDS`, `landNoun`). Fix: name the margins, key
one table. Bytes: **yes** (starts; Any-theme names).

**E7. Four `.timber` writers against "the one path to file bytes":** `gen/pack.ts` `toTimberFile`/`toWorld`,
`places/place.ts` `buildPlace`, `doc/session.ts:956`, `tools/probe-maps/assemble.ts`. Fix: one `worldOf(…)` in
`pack.ts`; Real places' recorded sha256s must stay identical. Bytes: no if lifted straight.

### F. The worker beyond the forces (D342)

**F1. Editing logic in the worker:** `removeAt` (about 75 lines deciding Remove's ops), `plantAt`, `strokeClearing`,
`applySelection` (a start-carry retry loop with its own undo), `moveStartTo`/`placeStart`, `withSpringPools` (runs
only inside `applyAll`, so `apply`/`applySelection`/`strokeClearing` give a badwater source no spring pool),
`entitiesAt`. Fix: `planRemove`, `planPlant`, `planStart`, `planSelection`, `entitiesAtTile` in `doc/`;
`withSpringPools` a step of `MapSession.applyAll`. Bytes: no if verbatim; unifying `withSpringPools` into every
path, **yes** for projects that placed a badwater source through them.

**F2. Checks grouped and fixed in the worker:** `itemOf` attaches start-move fixes after the check ran while
`checks.ts`/`playability.ts` attach the others; `instantCheck` re-does `MapSession.validate("export",{loadOnly})` by
hand (results equal); `blankThumbnail` is a character-for-character copy of `doc/session.ts:1041`; `exportCheck`/
`settleNow` are an older synchronous twin of `backgroundCheck` kept alive by seven tests and `tools/probe-ceiling.ts`,
so the tests exercise a path the page never runs. `MapFacts` re-sums clean/badwater flow and counts wet at `> 0.05`
where `metrics.waterShare` uses `0.1`. `startWeather` steps the hazard sim itself (`tools/determinism/cases.ts`
re-writes the badtide loop); `columnsWaterOf`/`soilOf` repeat `world.ts` `mixedSimulationSingletons` on view arrays.
Fix: `checkItems(…)` in core; tests on `backgroundCheck`; core `mapFacts`, `HazardRun`, `shownWater()`. Bytes: no
(the card's "Under water" may change if thresholds unify).

**F3. Dead messages and fields:** `check`, `deleteFeature`, `moveFeature`, `describeTile`, `instantCheck`,
`planTool` (one e2e test) messages; the `carve*` aliases and `SessionInfo.carveAgain` (tests only; the page uses
`force*`); `waterFixOps`, `carveAgainReady`, `trailOf`; `api.ts` `stopVersionSearch` and `findVersion`'s `stop`,
`tries`, `onTry`, `generate` options (the page terminates the worker instead); `setEditorWaterMode` (71 callers all
pass the default); `MapFacts.bestDam`, `.naturalStorage`, `GenerateResponse.edits`, `SessionInfo.mode`, `.premise`,
`.projectName`, `ExportCheck.playability` (constant true). Four shapes for "view changed + info + settled"
(`SessionUpdate`, `BackgroundResult`, `ForceTakenBack`, the `settled` event); `e.raw ? e.raw.Components : …` written
six times; `levers.ts` and `strip.ts` keep "written out to match" type copies of `PlayabilityAnalysis` and
`gen/versions.ts`. Bytes: no.

### G. Tools that re-implement the core

**G1. `tools/probe-maps/assemble.ts` is `places/place.ts` `buildPlace` copied, and already differs:** it settles
under game rules without `out`, so the stored outflow is all zero, and pairs game water with the flat port soil,
which no product path does. `tools/waterfall-gallery.ts` repeats the soil half. Fix: one `buildFileFromHeights` in
core (E7). Bytes: **yes** for the probe's tall and sizes maps (their sha256s change).

**G2. Core logic copied into tools:** `tools/start-water-fed.ts` `startWaterBodies` re-implements `walk.ts`
`startWaterShore` plus the walk graph (C1) and `startMiddleTile`; `tools/batch.ts:121–138` recounts trees, bushes
and scrap instead of `measure`/`measureResources` (and skips its bounds checks); `tools/official-baselines.ts`
`CLASS_AREA`/`curveAt` re-declare `calibrated.ts` `SIZE_ANCHORS` and `density`; `tools/real-places.ts` `cardJpeg`
is `render/shade.ts` `thumbnailRgba` at a fixed size; `tools/ingame-files.ts` has an older "nearest pumpable water"
rule; `assemble.ts` `tilesOf` = `footprintTiles` with a fallback. Fix: import the core function in each. Bytes: no.

**G3. Core measuring code alive only through tools and tests** (about 1,000 lines the port would carry for
nothing): `analysis/metrics.ts` `measure` and `MapMetrics` (`settings-suite.ts`); `resources/measure.ts`
`measureResources`, `groundOfFile`, `groupsWithin`, `startCentreOf`, `sourceLowness` (three tools);
`forces/glaciate/measure.ts` (B6); `glaciate/plan.ts` `makePlan`; `analysis/startPlanting.ts`; `force.ts`
`fullMap`; `math/noise.ts` `fbmField`; `places/place.ts` `encodeHeights`/`encodeTiles` (the writer half);
`setpieces/waterfall.ts` `measureLip`. Fix: move to `tools/` or a folder marked "not ported". Bytes: no.

### Stale documentation found on the way (fix with the PR that touches each)

`forces/README.md` ("the shared core, and Carve"; `carveParams` as the operation); `force.ts`/`op.ts`/`result.ts`
headers ("four forces"); `water/README.md` (the forces call `edgeLip`); `edgeSources.ts` header; `sim/README.md`
("never writing `D` or `C`"; no `soil*`, `columns`, `rust*` entries); `water.ts` header on `edgeSpill`;
`analysis/README.md` (legend and levers drive the card; `straight.ts` behind a check; `vertical.ts` unlisted);
`levers.ts` header; `gen/README.md` (`layout.ts`, the remnants, "one path to file bytes"); `land/README.md` and
`num.ts` ("Math.sqrt" allowed; the code uses `portable.sqrt`); `math/README.md` (`log` in `detmath`; `portable.ts`
unlisted); `library/README.md`, `render/README.md`, `resources/README.md` (page and Real places use); `doc/README.md`
(`waterFix` is "the automatic water fix"); `features/README.md` (set pieces "shared by the generator, the editor and
Claude"; `hollow.test.ts`); `spec/README.md`/`mapspec.ts`/`mergepatch.ts` (`SpecPatch`, Claude); `doc/bake.ts`
header (the generator makes landforms); `doc/ops.ts` comments (`doc/water.ts`); `features/build.ts:2`
(`gen/riverValley.ts`); `tools/README.md` ("tools have no tests"; `tools/rust/` unlisted). `src/worker/` has no
README.

## 2. The cleanup plan

Each group is one PR on `dev`, in this order; every PR updates the READMEs it touches (D188) and runs the quick
suite plus CI's byte checks. Groups marked **re-pin** change bytes and need D308's one deliberate re-pin, with the
contact sheet.

1. **Dead code, no bytes** (one PR, mechanical): A5, B8's dead names, D4's dead names, `ColumnTerrain`,
   `rimSlopes` planner, E1 (`layout.ts`, `valley.ts`, `riverValley.ts`), E2, F3, `analysis/vertical.ts`
   `vertical()`, `hollow.ts`, `edgeSources.ts` (B3, delete form), `glaciate/measure.ts` to tools, G3's moves,
   `soil3d` port path and the dead `rules`/`soilRules`/`waterRules` options (A1 soil half), `tools/soil-compare.ts`.
2. **One flood** (B2): `forces/drainage.ts` deleted, the five inline spill floods on `land/drainage`; `N4`/`N8`,
   `clamp`, `smooth` from one place (B8, A6, E5).
3. **The forces' shared core** (B4 build-direct, B5 one settings table with the schema checked against it, B6
   `finish`/`ROUND4` and `Staged`, B7): no bytes. B4's `carve`-op migration needs Kyler's D158 answer first.
4. **Force planning into the core** (B1): `planForce`, `forceRecordOf`, `fullForceMapOf`, `natureOf`; ids as
   parameters; `determinism/cases.ts` and `randomOps.ts` on the core record. Before the forces' Rust port.
5. **Water** (A2, A4, E7/G1's one `.timber` writer, `drainUnfedAfter` → `withoutUnfed`): A3's one settle driver as
   its own commit with a byte check on the generator (**re-pin** if the cap changes); the water `port` fork
   decided at the Rust re-port (A1 water half).
6. **Analysis and checks** (C1 `walkWorld`, C3, C4, C5 rename, C7's small merges, C6 as documentation unless Kyler
   wants the check): no bytes. C2 and the `library/` trio wait for the page session's answer.
7. **The editor's planners and set pieces** (D1, D2, D3): the start helpers out of `doc/tools.ts` first, then the
   planners, request branches and dead options; the six builders' replay sides per Kyler's D158 answer.
8. **Generator duplicates** (E3 extraction, E4 one composition, E5, D4's `polyDist` and `BaseMap`): the `lnDet`
   merge behind one bit-for-bit check; E6's margins named, not changed (unifying them is a **re-pin** for later).
9. **Worker editing and checks into the core** (F1, F2, F3's shapes): tests moved from `exportCheck` to
   `backgroundCheck`; `withSpringPools` left as is unless Kyler wants every path to add pools (**re-pin**).
10. **Tools on the core** (G2): `start-water-fed`, `batch`, `official-baselines`, `real-places`, `ingame-files`;
    `assemble.ts` on the shared writer (**the probe maps' hashes change**, G1).
11. **Separate decisions for Kyler, not in the PRs above:** wire `edgeLip` into the forces (B3) · `carve` ops in
    old saves (B4) · the six set pieces' replay (D2) · legend/levers/strip/saver versus the page's own (C2) ·
    `D5` one id rule (new forces' ids change) · `D6` Naturalize's flood on `drainage` (pinned replay) · `safe-water-
    uphill` (E2) · the water `port` fork (A1).

## 3. Base

`feature/m9b` at `fe3ed80f9076789093eec5b5dddcc7a122bf88c4`; `origin/dev` (`8b066342`) merged in cleanly (already
an ancestor, no changes).
