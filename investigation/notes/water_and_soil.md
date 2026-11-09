# Water, soil moisture, contamination & weather rules (Timberborn 1.1.2.4)

Research notes for the Dam Good Maps generator and validator.

**Sources.** Decompiled assemblies in `investigation/decompiled/`. Blueprints in `investigation/raw/blueprints/`. 19 official 1.1 maps, 9 workshop maps and 2 saves (1.1.2.4) in `investigation/raw/`.

**How the claims were checked.** Two pieces of analysis code were written to test the rules against real map data:
- `replica.py` is a steady-state port of the soil-moisture system. It matches the saved `MoistureLevels` exactly (within 0.02) on 100 % of tiles on 9 official maps, at least 99.4 % on 9 more, and 97.2 % on Beaverome. Across about 180 000 moist tiles it disagrees on whether a tile is moist or dry for only 14 tiles.
- `simwater.py` / `simwater2.py` are a single-layer numpy port of the water simulator. Starting from an empty map, it reproduces the saved water of the 1.1 save `generated-river-valley-day1-2` to within 0.001 m in every cell after the same number of ticks (975). It also matches Diorama and Waterfalls exactly, and Meander at IoU 0.99.

The scripts are in the session scratchpad, not in the repo. The algorithms are described in full below.

## Key constants

| What | Value | Source |
|---|---|---|
| Tick | 0.6 s, with 2 water substeps per tick, so dt = 0.3 s | `TickTime.blueprint`, `WaterSimulationTaskStarter.SubstepCount=2` |
| Day | 768 ticks = 460.8 s | `DayNightCycleSpec.ConfiguredDayLengthInTicks`, `DayNightCycle.DayLengthInSeconds` |
| Terrain height | 23 voxel layers (`MaxGameTerrainHeight` 22 + 1) | `MapSizeSpec` |
| Total height | 33 = 23 + `MaxHeightAboveTerrain` 10 | `MapSizeSpec` |
| Open-column ceiling | 34 | `WaterSimulator._maxColumnHeight = TotalSize.z + 1` |
| Water units | 1 = one tile × one height level ("m³"). A water source strength S adds S m³ per second, which is S × 460.8 m³ per day. | |

---

## Q1. WaterSource and BadwaterSource

### Answer

| | WaterSource | BadwaterSource |
|---|---|---|
| Footprint | 1×1×1 ("Ground/All") | 3×3×1 (all cells "Floor, Bottom, Corners, Path, Middle") |
| Emits at | its single cell | all 9 cells, S/9 each |
| `DefaultStrength` | 1.0 | 3.0 |
| Contamination | 0 (becomes badwater during badtide) | 1.0 always |
| Max strength | 8 | 72 (8 per cell) |
| `TimeActivatedComponent` | yes | yes |
| Badtide controller | `BadtideWaterSourceContaminationControllerSpec` | none |

Both types sit on terrain: solid voxel at z−1, air at z. This held for all 170 WaterSources and 69 BadwaterSources in the official maps. 29 WaterSources also have solid directly above them, meaning they are placed in tunnels or caves. The BadwaterSource centre "cutout" is only a rendering hole (`TerrainService.SetCutout` is used only by rendering and selection code). No voxel changes.

**Where water enters.** `WaterSource.InitializeEntity` computes the emitting cells as `TransformTile(spec coords)` at z = `BlockObject.z + BaseZ`. Each substep, `UpdateWaterSourcesTask` adds `dt · CurrentStrength / N` to the water column that contains z (`MutableWaterColumnRetriever.GetColumn`). Some consequences:
- The source cell itself is not a water obstacle.
- A source under a lake keeps emitting.
- If the column is full, for example in a sealed cave, the extra water becomes Overflow (pressure).
- Rotation maps a block offset (dx, dy) to `Coordinates + rot(dx, dy)`, where Cw90 → (dy, −dx), Cw180 → (−dx, −dy) and Cw270 → (−dy, dx).

**What the strength numbers mean.**
- `SpecifiedStrength` is the designer value: volume per second of game time, spread over the source's cells. It is not a height per tick.
- `CurrentStrength` = `SpecifiedStrength` × the product of all `IWaterStrengthModifier`s (see below), clamped to `8 × cells`.
- `CurrentStrength` is saved, but it is recomputed on `PostInitializeEntity` and on every tick. The value written into a map therefore does not matter.
- Official maps store it as 0 for sources that are delayed or conditional (aquifers, drains, delayed sources).

Two things a generated map must get right:
- **Write `Singletons.WaterSimulationMigrator = {"IsMigrated": true}`.** Without it, `WaterSimulationMigrator` halves every source's `SpecifiedStrength` and all stored outflows on load (`ScaleRatio 0.5`). All 1.1 official maps have the flag. The 0.x workshop maps do not.
- **Map-edge sources do not leak.** `WaterMapBoundary` is decorated onto every `IWaterSource`. For each source cell, it turns the out-of-map padding cells that are 4-neighbours into solid cells (`FullyBlockCell`). This is what lets 63 official sources sit on the map border (the Meander river enters at y = 127).

**Modifiers applied to every WaterSource** (these are decorators in `WaterSourceSystemConfigurator` / `GameWaterSourceSystemConfigurator`):
- `DroughtWaterStrengthModifier` (all sources, clean and bad):
  - Returns 0 for the whole hazardous period of a drought cycle, and 1 during badtide.
  - Ramps down before a drought, starting T = S / (DayLengthInSeconds × 0.0058) = S / 2.673 days before it. For S = 1 that is 0.37 days, for S = 3 it is 1.1 days.
  - The ramp shape is `1 − (p/T)·(0.85·p/T + 0.15)`.
  - It ramps up the same way at the start of the next cycle.
  - (`WaterStrengthSpec`: MaxWaterSourceChangePerSecond 0.0058, MinWaterSourceChangeScaler 0.15.)
- `WaterSourceActivator` gives 0 until the `TimedComponentActivator` fires, if the activator is enabled.
- `BadtideWaterSourceContaminationController` only exists on sources whose blueprint has the spec: WaterSource, WaterSeep, BadwaterSeep, Aquifer and DevWaterSource.
  - During badtide it sets the emitted contamination to `0.5 + 0.5·sech(17(t − 0.5))`. That is 0.5 at the moment the badtide starts, 1.0 after half a day, back to 0.5 in the last half day, and 0 when it ends.
  - The source keeps full strength, so clean sources emit badwater during badtide.

**`TimeActivatedComponent`** (`ActivatorSystem.TimedComponentActivator`, saved under the key "TimeActivatedComponent"):
- Fields: `IsEnabled` (bool), `CyclesUntilCountdownActivation` (int, default 5), `DaysUntilActivation` (float, default 10), `DaysPassed` (float).
- The spec has `IsOptionallyActivable: true`, so `IsEnabled` defaults to false and the source is active from day 1.
- If `IsEnabled` is true, the source is off (strength 0) until Cycle ≥ N and `DaysPassed + dayProgress ≥ DaysUntilActivation`. `DaysPassed` increases by 1 at each day start once Cycle ≥ N, except on cycle N day 1, when the countdown event fires. In practice the source turns on around cycle N, day D+1.
- `IsHazardousActivator` only changes the UI.
- Official maps: 150 of 170 WaterSources have `IsEnabled: false`. 20 are delayed (N = 3–19, D = 10.5). Nomads uses 20 delayed sources.

**Strengths used in official maps**

| Type | Values (count) | Typical |
|---|---|---|
| WaterSource | 0.25 (11), 0.5 (105), 0.75 (6), 1.0 (43), 1.25 (3), 1.5 (2) | 0.5 |
| BadwaterSource | 0.5 (4), 0.75 (1), 1.0 (17), 1.5 (26), 2.0 (9), 3.0 (12) | 1.5 |

Total clean strength active at start, per map: 2.0–10.5 m³/s (ThousandIslands 27). Maps: Canyon 2.0 on 128², Meander 5.5 on 128², Plains 4.5 on 256², Lakes 7.0, Terraces 7.75. Sources are usually 1×1 WaterSources placed in rows of 3–8, for example Meander's 8 sources at y = 127.

### Evidence
`WaterSourceSystem`: `WaterSource`, `DroughtWaterStrengthModifier`, `BadtideWaterSourceContaminationController`, `WaterStrengthService`. `WaterSystem`: `UpdateWaterSourcesTask.Run`, `WaterMapBoundary`, `WaterSimulationMigrator`. `ActivatorSystem`: `TimedComponentActivator`. `GameWaterSourceSystem`: `WaterSourceActivator`. Blueprints `MapEditor/Water/*`, `Configurations/WaterStrength`. Entity survey of all official maps.

**Confidence:** high.

### Implications
- Emit per cell as S/N.
- In validation, set strength to 0 for delayed sources and for the whole drought, including the ramp.
- Put `WaterSimulationMigrator.IsMigrated = true` in world.json.
- Edge sources are safe, and rivers can enter from the border.
- Budget 2–10 m³/s of clean water per map, like the official maps.
- During badtide every clean source turns bad, so a generator cannot promise clean surface water during badtide except from stored reservoirs.

---

## Q2. Water simulation

### Answer: the algorithm (`Timberborn.WaterSystem`)

**Grid and columns**
- The index space is padded by 1 cell on every side: stride = X+2 and verticalStride = (X+2)(Y+2) (`MapIndexService.Margin = 1`).
- Each (x, y) holds a stack of water columns, which are the vertical air gaps: `Floor` = first air z and `Ceiling` = next solid z, or 34 if nothing is above.
- Stacks are built by starting from column (0, 34) and applying `AddFullObstacle` for every terrain voxel and for every entity water obstacle:
  - `Blockage`: a full block.
  - `NaturalOverhang*`: a support block plus horizontal obstacles one level up, which forms a roof.
  - `BadtideDrain`: a back wall plus a roof over the emitter.
  - `NaturalDam`: a *partial* obstacle 0.65 high (`WaterObstacle.AddToWaterService`).
- Horizontal obstacles split a column at z without filling a voxel.
- Ruins, Slope, relics and other buildings do not obstruct water, because they have no `WaterObstacleSpec`.
- Water never moves vertically between the stacked columns of one cell. It only moves horizontally, between columns of 4-neighbour cells whose z-ranges overlap.

**Column state.** `WaterColumn` holds Floor, Ceiling, WaterDepth, OldWaterDepth, Contamination and Overflow.
- `Overflow` is the water above the ceiling of a full column (pressurised caves).
- `OverflowPressureFactor` = 8: overflow counts ×8 in the head, and its share of a flow is divided by 8.
- Maximum overflow is `(34 − ceiling)/8`.

**Serialisation** (`WaterColumnPackedListSerializer`)
- 1.1 writes `depth:contamination:overflow:floor:oldDepth`, or `"0"` if depth, contamination and overflow are all 0.
- 1.0 and 0.7 write only the first 4 fields. `OldWaterDepth` then defaults to depth on load (`[BackwardCompatible(2026,4,29)]`).
- Arrays are packed as `slot·X·Y + y·X + x`, where slot is the k-th column from the bottom of that cell. It is not z.
- **On load only depth, oldDepth, contamination and overflow are copied, by slot.** Floor is recomputed from terrain and obstacles (`WaterSimulator.PostLoad`). A generator must therefore put water in the right slot. On a heightfield map with no entity obstacles, that is always slot 0.
- `Levels` = the maximum slot count at save time. Official maps use 2–4. A pure heightfield can use 1.
- The pre-Nov-2023 singleton `WaterMap` (`WaterDepths` and `Outflows` "B:L:T:R") is still loaded by `WaterMapLoader`.

**`ColumnOutflows`** hold the flow "momentum" per column.
- Format: `Bottom:Left:Top:Right[:extra…]`. Each entry is `"0"` or `index3D|flow`, where `index3D = slot·(X+2)(Y+2) + (y+1)(X+2) + (x+1)` in padded indexing.
- Extra entries exist when a column flows into several stacked columns of one neighbour.
- Bottom = −y, Left = −x, Top = +y, Right = +x.
- **Writing all `"0"` is safe.** Momentum rebuilds within a few ticks.

**One substep** (dt = 0.3 s, run twice per tick in parallel tasks in this order: `OutflowsUpdateTask` → `WaterParametersUpdateTask` → `SimulateContaminationTask` → `UpdateContaminationTask` → `UpdateWaterSourcesTask`; `UpdateWaterChangesTask` then runs once per tick for pumps and other buildings):

1. **Outflows** (`OutflowsUpdateTask.GetOutflow`).
   - For every column c with d + o > 0 and every 4-neighbour column n that overlaps it (`n.Ceiling > c.Floor` and `n.Floor < c.Floor + d_c`):
     - `H = floor + depth`, and `P = overflow·8`.
     - `Δ = (H_c + P_c) − (H_n + P_n)`. The pressure part of Δ is divided by 8 (see the code snippet below).
     - `f = 0.999·f_prev(c→n) + 2.25·dt·Δ_eff`, where `2.25·dt` = 0.675.
     - Spill threshold: if n is dry, has no height limit and has the same floor as c, `Δ_eff −= 0.1`.
     - Direction limiters (from `DirectionalWaterSource`) and inflow limits from buildings apply.
   - Only f > 0 is kept. Negative flows are dropped, so each side handles its own direction.
   - Normalise: if `Σf·dt > d_c + o_c`, scale all of c's outflows by `(d_c + o_c)/(Σf·dt)`. A column can empty in one substep, but never go below 0.
2. **Partial obstacles (dams and weirs, crest h_lim).** For a flow into a target whose floor has a height limit, with `hd = H_c + P_c − floor_n`:
   - If `hd < h_lim`, then `f = 0.995·f_prev − 0.02·clamp01(clamp01((h_lim−hd)/0.1) · clamp(1 − 2.25·(H_c − floor_c − oldDepth_c), 0.5, 2))`. The flow decays; no new flow is added.
   - If `hd − h_lim < 0.1`, the new-flow term is scaled by `(hd − h_lim)/0.1`.
   - Otherwise the flow is normal, with `f_prev ×0.995`.
3. **Depth update** (`WaterParametersUpdateTask.ProcessWaterDepthChanges`).
   - `net = Σ inflow − Σ outflow`.
   - `depth += (net − evap)·dt`, through `WaterDepthSetter`: depth is clamped at 0, and anything beyond the column height becomes Overflow.
   - The stored momentum for the next substep is `out(c→n) = max(0, f(c→n) − 0.8·f(n→c))` (`OutflowBalancingScaler` 0.8). This damps sloshing.
4. **Evaporation per second:**
   - Rate: `(depth < 0.02 ? 0.001 : 0.0001) × EvaporationModifier[column]`.
   - The modifier is recomputed every tick from the soil-moisture cluster saturation: 1 if sat = 0, otherwise `0.0595(10−sat)² + 0.101(10−sat) + 0.72`.
   - For sat 1…8 that gives 6.45, 5.34, 4.34, 3.47, 2.71, 2.08, 1.56 and 1.16.
   - Daily depth loss (×460.8 s): lakes at least 3 wide (sat 8) lose 0.0535 m/day, a 2-wide channel (sat 6) 0.096, a 1-wide channel (sat 3) 0.20 and an isolated cell 0.30. Films under 0.02 lose 10× that.
   - `WaterEvaporationMap.EvaporationModifiers` (Levels + one value per slot) is only a cache. Writing 1s is fine.
   - Evaporation does **not** depend on the weather. No weather reference exists in `WaterSystem` or `SoilMoistureSystem`.
5. **Contamination.**
   - Contamination is a concentration that moves with the flows as a volume-weighted mix (`SimulateContaminationTask`).
   - It also diffuses between adjacent columns when the net flow is below 0.125 and the surfaces differ by less than 0.1, at a rate of 0.45.
   - It is capped at 1.
   - Sources mix their own contamination into the cell they emit into.
6. **Sources:** `d += dt·S/N` on each source cell.

Key formula (`OutflowsUpdateTask.GetOutflow`):
```csharp
float num5 = num + num2 - (num3 + num4);          // head diff incl. overflow*8
if (num5 > 0f) { ... num10 = num5 - num9 + num9 / overflowPressureFactor; }
float num16 = _waterFlowRetriever.GetFlow(targetIndex3D, in outflows) * 0.999f;
...
else if (targetColumn.WaterDepth + targetColumn.Overflow == 0f && floor == floor2)
    num10 -= _waterSpillThreshold;                  // 0.1
return num16 + _waterFlowFactor * num10;          // _waterFlowFactor = 2.25*dt
```

**Maximum flow.**
- There is no explicit maximum. Flow is limited only by volume: total outflow ≤ (d+o)/dt = 3.33·d per second.
- There are also per-cell `InflowLimits` (buildings; the default is unlimited) and the source cap of 8 per cell.
- Friction is tiny: steady uniform flow F needs only Δh ≈ 0.001·F/0.675 ≈ 0.0015·F per cell. **Water surfaces are almost flat**, and rivers behave like chains of level pools joined by waterfalls.

**Map edges are sinks.**
- Padding cells are open columns (floor 0, ceiling 34) that are never updated: their depth is always 0 and they have no outflow.
- Water that reaches an edge cell flows into the void with head `H_c − 0`, so it drains, limited by volume.
- The saved outflows confirm this: every official map's off-map outflow roughly equals its active source strength (Cliffside 3.93 of 4.0, Canyon 3.77 of 4.0, Meander 6.22 of 6.5, Terraces 11.9 of 13.25). The generated save has 5 edge cells at x = 95 with flow ≈ depth/0.3.
- The exception is padding next to source cells, which is solid (Q1).
- Terrain that is higher at the border holds water in. The edge only drains cells whose water can reach them.

### How close can a simplified model get?
- **Pure heightfield maps** (no caves, overhang objects, dams or blockages): a single-layer port of the rules above (no overflow, no stacks) is essentially exact.
  - Generated save: max |Δd| = 0.001 after 975 ticks from empty.
  - Diorama and Waterfalls: IoU 1.00. Meander, with NaturalDam, Blockage and edge sources added: IoU 0.99, volume within 1.5 %.
- **Maps that route water through tunnels or caves** (Cliffside 24 wet cells under a roof, Canyon 180, Terraces 473): a single-layer model blocks the tunnels and floods basins that really drain (IoU 0.25–0.7). Either keep the generator's terrain free of water tunnels, or implement stacked columns.
- **Time to steady state:** about 600–1 000 ticks (0.8–1.3 days) on a 96² or 128² map, with an overshoot. For example, the river-valley volume was 278 at tick 300 and 230 at tick 600. Large 256² maps with big basins take 2 000–3 000 ticks.
- **Cheaper still:** steady-state lake levels equal their spill level (priority-flood fill-and-spill), because surfaces are flat. Add about 0.1 m minimum sheet depth on flat ground (the spill threshold) and river depth of at least 0.3·S/width. This is good for lake extents. It says nothing about transients or how fast basins drain after sources stop.
- **Official maps are snapshots.** They ship with pre-simulated water and are mostly at steady state (their off-map outflow ≈ source strength).

**Confidence:** high for the algorithm (read from code and validated against saves). Medium for the contamination-diffusion details (summarised, not replicated).

### Implications
- A browser WebWorker can run the exact single-layer rule set at about 65 k cells × 1 536 substeps per game day.
- Validate with one to two game days of "sources on", then a drought of D days with sources off (after the ramp).
- Write the steady-state water into `WaterMapNew` so the map starts alive, like the official maps.
- Keep river beds free of stacked overhangs, or implement stacks.

---

## Q3. Soil moisture (`Timberborn.SoilMoistureSystem`)

### Answer
There is one moisture value per terrain column top (index 3D by terrain-column slot).

**Moisture value on and next to water**
- Cluster saturation of a wet water column: `WN = 1 + number of wet 8-neighbours` whose vertical range overlaps; `sat = min(8, max(WN, max over 4-neighbours of (WN_n − 1)))`.
  - A lake or river at least 3 wide gives sat 8, a 2-wide channel 6, a straight 1-wide channel 3 and a single puddle 1.
- The water's "range" = `2·sat`, so the maximum is 16.
  - If contamination c ≥ 0.01, range = `int(range·(1 − c/0.53))`, which is 0 for c ≥ 0.53. **Badwater gives no moisture.**
- A tile with clean water on it (c ≤ 0.01) gets exactly `2·sat`. This value is fixed and is not raised by its neighbours.
- A tile next to water (4-neighbour) gets `range − 6·max(0, tileZ − ceil(waterFloor + depth))`.
  - A tile under a full water-filled column (a roof over water) gets `range − 6·(roofThickness − 1)`.

**Spread**
- From 8-neighbours of the last tick: `m_n − cost − 6·max(0, tileZ − neighbourZ − ceil(neighbourWaterDepth))`, with cost 1 orthogonal and 1.414 diagonal.
- Going down costs nothing extra. **Each level up costs 6** (`VerticalSpreadCostMultiplier`).
- The steady-state value is `max(direct, fromNeighbours)`, then multiplied by `(1 − contamination of the water on the tile)`. Values below 0.01 become 0.
- The tile counts as moist (`SoilIsMoist`) if the value is > 0.

**Reach**
- Horizontal reach from a big clean lake at bank level: a tile at chamfer distance d from the water has `17 − d`, so **16 tiles**. A 1-wide stream reaches 6 tiles and a puddle 2.
- Vertical reach: every bank level above the *ceiled* water surface costs 6.
  - 1 level up gives 10 tiles, 2 levels 4 tiles, and 3 levels nothing.
  - Because the surface is ceiled, 0.5 m of water on floor h counts as surface h+1. **A river bed 1 below the banks gives the full 16. A bed 2 below with water under 1 m deep gives only 10.**

**What blocks moisture** (`SoilBarrierMap`, at the object's ground cell):
- `BlockFullMoisture` forces the tile to 0: Thorns (map object) and IrrigationBarrier.
- `BlockAboveMoisture`: water standing on or above that tile does not moisten it: Levee, ImpermeableFloor, ImpermeablePowerShaft, CompactMechanicalPump.
- Height differences and contaminated water also block it.
- Barrier lines must be 4-connected, because diagonal spread can leak past a diagonal line.
- Map edges do not wrap.
- `DesertMoistureThreshold` 5 only drives the dry texture.

**Speed**
- A tile next to water rises by `6.66·0.6 = 4` per tick.
- The front moves 1 tile per tick, so the full 16-tile band exists within about 20 ticks (12 s).
- Decay is `1.25·0.6 = 0.75` per tick, so a band **disappears about 20 ticks after its water is gone**. The moist zone follows the water almost instantly.

### Evidence
- Code: `ClusterSaturationCalculationTask`, `WateredNeighborsCountingTask`, `MoistureCalculationTask.CalculateMoistureForCell` / `GetMoistureFromWater` / `GetMoistureFromNeighbor`, `SoilMoistureSimulationTaskStarter`, `SoilBarrier`. Blueprint `SoilMoistureSimulator` (decay 1.25, spread 6.66, vertical ×6, MaxClusterSaturation 8, MaximumWaterContamination 0.53).
- Replica check against saved `MoistureLevels`:
  - 100 % exact on the 1.1 river-valley save and on 9 official maps (Meander, Plains, Terraces, ThousandIslands and others), at least 99.4 % on 9 more, and 97.2 % on Beaverome.
  - Mean absolute error at most 0.021.
  - Moist/dry disagreements: 14 tiles in total across all maps.
- Maximum chamfer distance from moistening water (c < 0.53) to a moist tile, on every official map: **16.14–16.48**, 99th percentile 11–16.
- Save `generated-river-valley`:
  - All 291 bank cells are exactly 1 level above ceil(surface).
  - Moisture next to the water is 10, then falls by 1 per tile. Maximum reach is 10.48.
  - Values by distance: d = 1 → 10, 2 → 9, 3 → 8, 4 → 7, 5 → 6 … up to d ≈ 10.5.
- Official maps: 87 % of tiles at distance 1 from clean water are moist, 60 % at 5, 39 % at 10, 13 % at 16 and about 6 % at ≥ 17 (those near partially contaminated water).

**Confidence:** very high.

### Implications for the validator
- Compute moisture with the exact steady-state rule (Dijkstra/max-plus propagation is fine; see the spec).
- Keep river water surfaces within 1 level of the land that should be fertile. Beds 1 deep, or 2 deep with water above 1 m.
- Farm and forest land must lie within 16 tiles and at most about 2 levels above a sat-8 water body that **persists through drought**.

---

## Q4. What trees and bushes need

### Mechanisms (`Timberborn.NaturalResourcesMoisture`, `NaturalResourcesContamination`, `NaturalResourcesLifecycle`)
- **Dry.** `WateredNaturalResource` starts a timer of `DaysToDieDry × U(0.9, 1.1)` days when the tile's moisture is 0 (`DryObject` checks `SoilIsMoist(CoordinatesAtBaseZ)`). There is **no minimum moisture above 0**. If moisture returns, the timer **resets** fully instead of pausing.
- **Flood** (`FloodableNaturalResourceSpec`, `LivingWaterObject`).
  - `WaterAboveBase = ceil(floor + depth) − z`. Any water at all on the tile counts as 1.
  - Outside `[MinWaterHeight, MaxWaterHeight]`, a `DaysToDie` timer runs.
  - All land species use 0..0, so any water on the tile floods them.
- **Arid** (Succulent): `AridNaturalResourceSpec.DaysToDieWet` = 8. The succulent dies if its tile is **moist**. Planting also requires the tile to be dry (`PlantingSoilValidator`).
- **Contamination:** soil contamination > 0 on the tile kills any plant in 0.2–0.3 days (`ContaminatedNaturalResource`). Planting and spawning are blocked there.
- **While dying, growth pauses**, and so do gatherable regrowth and reproduction.
- **When dead:**
  - Trees keep their **cuttable logs**. Only Succulent loses its yield (`DeadCuttableYieldRemover`).
  - Gatherable yield (berries, resin, syrup, chestnuts) is removed.
  - Dead plants never grow or reproduce, and foresters may replace them (`TreeComponent.CanBeReplaced`).
  - The saved form is `LivingNaturalResource: {"IsDead": true}`.
- **Map editor:** `InstantNaturalResource` kills a plant *instantly* when it is dry, flooded or contaminated (wet for arid species), and revives it when conditions return.
  - This is why every official map stores dry-soil trees as dead: 13 944 dead pines on dry soil against 6 291 living pines, all on moist soil. All 2 805 succulents sit on dry soil.
- **In game** a living tree placed on dry soil dies after about DaysToDieDry. In the save after 1.27 days, dry Oak/Birch/Pine had DyingProgress 0.086/0.118/0.100, which is 1.27/15, 1.27/11 and 1.27/13.
- **Reproduction** (`NaturalResourceReproducer`):
  - Every living, grown, non-dying plant marks its 4 neighbours at the same z.
  - For each species, the chance per tick is `ReproductionChance × count × dtDays`, spawning one plant per tick at a random marked spot. For example, 0.03 means about 3 % per spot per day.
  - A spawn must pass these checks (`SpawnValidationService`): on ground, **moist**, not a field, not underwater (floodable species need their water range), not contaminated, and unobstructed.
- **Map-placed plants do spread** (they are ordinary `Reproducible`s). Succulent has no `ReproducibleSpec`.

### Per species (blueprints `NaturalResources/*`)

| Species | Faction | DaysToDieDry | Flood Min..Max / DaysToDie | Other | Grow (days) | Reproduce/day | Yield |
|---|---|---|---|---|---|---|---|
| Pine | common | 13 | 0..0 / 12 | | 12 | 0.03 | 2 logs; resin 2 / 7 d |
| Birch | common | 11 | 0..0 / 14 | | 7 | 0.03 | 1 log |
| Oak | common | 15 | 0..0 / 10 | | 30 | 0.01 | 8 logs |
| Maple | Folktails | 12 | 0..0 / 10 | | 28 | 0.01 | 6 logs; syrup 3 / 12 d |
| ChestnutTree | Folktails | 8 | 0..0 / 10 | | 23 | 0.03 | 4 logs; chestnut 3 / 8 d |
| Mangrove | IronTeeth | 6 | **1..1** / 16 | needs 0 < water depth ≤ 1 on its tile | 10 | 0.03 | 2 logs; fruit 4 / 10 d |
| Succulent | common | — | 0..0 / 4 | **Arid: dies if moist** (DaysToDieWet 8) | 65 | none | 2 Water; injury chance |
| BlueberryBush | common | 9 | 0..0 / 7 | | 12 | 0.02 | berries 3 / 12 d |
| Dandelion | Folktails | 8 | 0..0 / 4 | | 3 | 0.01 | 1 / 3 d |
| CoffeeBush | IronTeeth | 8 | 0..0 / 4 | | 9 | 0.02 | bean 1 / 3 d |

Every species also has `ContaminatedNaturalResourceSpec`, which kills it in 0.2–0.3 days on contaminated soil. Faction membership comes from `TemplateCollection.NaturalResources.*`. Species outside the chosen faction's collection probably cannot load (see the in-game check list).

**Confidence:** high.

### Implications
- Place living plants only on tiles where steady-state moisture is > 0, no water is on the tile, and soil contamination is 0.
- Succulents need moisture = 0. Mangroves need 0 < depth ≤ 1 on the tile.
- For "dead forest" log caches, write `LivingNaturalResource.IsDead = true`, as the official maps do. The logs stay harvestable.
- For forests to **survive a drought**, their moisture must come from water that persists, or the drought must be shorter than 0.9 × DaysToDieDry.
  - Normal droughts (up to 9 days) threaten Chestnut, Dandelion, Coffee (8) and Mangrove (6), and Blueberry (9) is borderline.
  - Hard droughts (15–30 days) kill everything that loses its water.

---

## Q5. Soil contamination (`Timberborn.SoilContaminationSystem`)

### Answer
- Only water with contamination **≥ 0.5** contaminates soil (`MinimumWaterContamination` 0.5).
- A tile next to such water gets the candidate value `2·(c − 0.5) − (5/7)·levelsAboveCeiledSurface`. A tile under a full water column gets the same, with `(5/7)·(roofThickness − 1)`.
- Spread: neighbour value − 1/7 orthogonal (√2/7 diagonal), − 5/7 per level up (`MaxRangeFromSource` 7, `VerticalSpreadCostMultiplier` 5).
- **Reach from pure badwater is 7 tiles.** Measured maximum chamfer distance on all official maps: 7.83. Soil is 60 % contaminated at d = 1, 20 % at 7 and 0 % at ≥ 8.
- Candidate values rise by up to 0.0396 and decay by 0.0198 per tick. The actual level moves toward the candidate at +0.021 or −0.006 per tick. Below 0.001 it becomes 0.
- The soil counts as contaminated if the level is > 0. It turns on within a few ticks and takes about 170 ticks (0.2 days) per 1.0 of level to clear.
- **Effects:**
  - Plants die in 0.2–0.3 days, and planting and spawning are refused.
  - Badwater also gives no moisture, and it scales the moisture of a tile it covers by (1 − c).
  - **Beavers are not affected by soil.** Only standing in water with c ≥ 0.05 matters: per tick the chance is c·0.01 (`ContaminationApplier`), followed by a 3-day incubation, then the `BadwaterContamination` need, which an antidote cures.
- **Counter-measures:**
  - Contamination barriers: Thorns (map object) and IrrigationBarrier (IronTeeth) block both contamination and moisture. ContaminationBarrier (Folktails) blocks contamination only.
  - Keep badwater out: levees and dams.
  - Buildings on a BadwaterSource: BadwaterDome (Folktails, open/close regulator), BadwaterRig (disables the source entirely), BadwaterPressurizer (IronTeeth, regulator that also ignores drought).
  - Pillars has 1 473 Thorns, and its contaminated soil never lies more than 2 tiles from badwater. This is probably because of the Thorns, though most of that map is covered by badwater.

### Evidence
`ContaminationCandidatesCountingTask`, `ContaminationsUpdateTask`, `SoilContaminationSimulationTaskStarter`, blueprints `SoilContaminationSimulator` and `SoilContaminationMap`, `BeaverContaminationSystem.ContaminationApplier` and `ContaminationIncubator`. Data check on the official maps as above.

**Confidence:** high.

### Implications
- Keep fertile, forest and start areas at least 8 tiles from any badwater, including where badwater will spread (downstream of BadwaterSources) and seasonal badtide flows.
- Thorns lines (4-connected) are the map-level fix.

---

## Q6. 1.0+ water entities

| Entity | Footprint / emitter | world.json components | Official values | Behaviour and placement |
|---|---|---|---|---|
| **WaterSeep** | 2×2×1, emits over all 4 cells (S/4 each). The 4 cutouts are only visual. | `WaterSource`, `BlockObject`, `WaterDepthStrengthModifier{CurrentModifier}`, `TimeActivatedComponent` | S = 1.0 (17), 2.0 (3). Craters 2, Helix 3, Lakes 1, Oasis 1, Pillars 4, Pressure 1, Spillage 8 | `WaterDepthStrengthModifier` (`DepthLimit` 0.8) turns it off when water depth at its anchor cell is > 0.8 and back on below 0.72, fading in at 0.5 per second of `Time.deltaTime`. **It cannot fill anything deeper than about 0.8 m over its floor.** It stops in drought and emits badwater in badtide. Place on flat ground (all 4 cells at the same z). |
| **BadwaterSeep** | same as WaterSeep | same | S = 1.0 (6). Nomads 1 (delayed to cycle 13), Spillage 5 | Same as WaterSeep, with contamination 1 and `IsHazardousActivator` true. |
| **Aquifer** | 3×3×1, emits only at the centre (1,1) at surface z | `BlockObject`, `WaterSource` (no activator) | S = 1.0 (11). Oasis 10, Pillars 1 | `UndergroundWaterSource` sets strength 0 unless a *finished drill* occupies it. That can be the map-placed **AncientAquiferDrill** or the player's **AquiferDrill** (400 science; 40 planks, 25 gears, 15 metal blocks). Output = S × the drill's `PowerEfficiency`. The ancient drill needs **200 hp**, the player drill **400 hp**, and both are **unpowered at map start**, so the player must connect power. The drill is **blocked during any hazardous weather** (`UndergroundWaterSourceDrill.Block` then `MechanicalNode.Active` false). It gives 0 in badtide, and the aquifer's own drought modifier gives 0 in drought. **Code says aquifers only produce in temperate weather** (needs in-game check). Also emits badwater in badtide, but the drill is off then anyway. |
| **AncientAquiferDrill** | 3×3×5 building | `BlockObject` only | Oasis 2 | `UnderstructureConstraint` requires an Aquifer with exactly the same 3×3 footprint (any orientation; see the Oasis pairs). `PlaceFinished: true`. Mechanical input transputs at block (1,0,0) and (1,0,1). |
| **BadtideDrain** | 1×3×1. (0,0) is a full water obstacle (back wall). (0,1) is the emitter, with a roof (horizontal obstacle at z+1). (0,2) is the open outlet. | `WaterSource`, `BlockObject{Orientation}`, `TimeActivatedComponent` | S = 1.0 (59), 0.5 (2). Canyon 3, Craters 2, Meander 3, Oasis 18, Pillars 15, Spillage 18, Waterfalls 2 | `HazardousWeatherWaterSource` makes it active only while the current hazardous weather is badtide. Contamination is 1. `DirectionalWaterSource` limits the emitter cell to the orientation axis (Cw0 → +y, Cw90 → +x, Cw180 → −y, Cw270 → −x), so water only exits forward. **Official placement (all 61):** cells (0,0) and (0,1) sit in a 1-high notch in a cliff (solid at z−1 and z+1), and (0,2) is open air with **no ground below**, a spout over a drop. |
| **GeothermalField** | 3×3×1; the centre cutout is visual only | `BlockObject` only | 26 placed (Beaverome 3, Canyon 1, MountainRange 2, Oasis 4, Pillars 6, Spillage 7, ThousandIslands 3) | No water effect. `FloodableObject` with its water check at the centre: if flooded, it and the GeothermalEngine on it (both factions, 400 hp output, 160 science) are blocked. Place on flat, dry ground outside flood and badtide paths. |

All of these, except GeothermalField and the drill, are `WaterSource`s, so they share the Q1 rules: `DroughtWaterStrengthModifier`, `WaterMapBoundary`, the strength cap of 8 per cell, and the migration halving.

**Evidence:** blueprints `MapEditor/Water/*` and `MapEditor/Objects/GeothermalField`, `Buildings/Water/AquiferDrill`, `Buildings/Power/GeothermalEngine`. Code: `GameWaterSourceSystem` (`UndergroundWaterSource`, `UndergroundWaterSourceDrill`, `HazardousWeatherWaterSource`), `WaterSourceSystem` (`WaterDepthStrengthModifier`, `DirectionalWaterSource`), `WaterObjects` (`WaterObstacle`, `HorizontalWaterObstacle`, `FloodableObject`), `MechanicalSystem.MechanicalNode.Active`. Placement survey of all official maps, with rotation applied.

**Confidence:** high, except the aquifer's drought behaviour (medium: the code is clear but it contradicts intuition).

---

## Q7. Weather and reservoir calibration

### Durations (`NewGameModes/GameMode.*`, `HazardousWeatherSystem`, `WeatherSystem`)

| Mode | Temperate (days) | Drought (days) | Drought handicap | Badtide | Badtide duration | Badtide handicap | Water consumption |
|---|---|---|---|---|---|---|---|
| Easy | 16–19 | 2–4 | ×0.25, full after 8 droughts | from cycle 6, 40 % | 1–3 | ×0.3, 6 | ×0.4 |
| Normal | 13–17 | 5–9 | ×0.38, full after 5 | from cycle 5, 40 % | 4–8 | ×0.15, 5 | ×1.0 |
| Hard | 5–8 | 15–30 | ×0.2, full after 12 | from cycle 4, 40 % | 15–30 | ×0.4, 9 | ×1.0 |

- Each cycle is temperate then hazardous. `HazardousWeatherStartCycleDay = temperate + 1`.
- Duration = `round(U(min, max) × lerp(handicap, 1, (n−1)/handicapCycles))`, where n is the index of that weather type. The first Normal drought is therefore 2–3 days.
- The badtide chance is adjusted for streaks (`HazardousWeatherRandomizer`).

**Sources in hazardous weather**
- Drought: every WaterSource-based entity gives 0 for the whole drought, after a pre-drought ramp of S/2.67 days, and ramps back up over the same time at the next cycle. That covers WaterSource, BadwaterSource, both seeps and aquifers. The only exception is a BadwaterSource under an IronTeeth BadwaterPressurizer.
- Badtide: sources keep flowing, but clean ones emit badwater. BadtideDrains switch on. Aquifer drills stop.
- **Evaporation is the same in every weather.** Drought only removes inflow.

### Water use

**Per beaver.** Thirst `DailyDelta` is −0.7 and 1 Water gives 0.33, so a beaver drinks 2.12 Water per day. 1 Water good = **0.2 m³** of map water (`WaterGoodToWaterAmountConverter`). That is **0.424 m³ per beaver per day** on Normal and Hard, and 0.170 on Easy. Bots do not drink. Industry uses more: Coffee, Biofuel, Algae and the Discharge building's FlowingWater. Clean pumps scale their output by (1 − contamination) at the intake.

**Reservoir surface loss** is `e·A` per day: e = 0.0535 m/day for bodies at least 3 wide, and 0.1–0.3 for thin channels.

**Required volume**

  `V ≥ P·0.424·(D + ~0.5) + A·e·(D + ~0.5)`

With usable depth h and area A = V/h:

  `A ≥ P·0.424·(D+0.5) / (h − e·(D+0.5))`

| Mode | Drought used | Drink per beaver | Evaporation depth | Area per beaver at h = 2 | h = 3 | h = 4 |
|---|---|---|---|---|---|---|
| Easy | 4 | 0.77 m³ | 0.24 m | 0.44 | 0.28 | 0.20 |
| Normal, typical | 7 | 3.2 m³ | 0.40 m | 2.0 | 1.2 | 0.88 |
| Normal, worst | 9 | 4.0 m³ | 0.51 m | 2.7 | 1.6 | 1.1 |
| Hard, typical | 22.5 | 9.8 m³ | 1.23 m | 12.7 | 5.5 | 3.5 |
| Hard, worst | 30 | 12.9 m³ | 1.63 m | 35 | 9.4 | 5.4 |

Example: 50 beavers on Normal (worst case) with a 2 m-deep usable reservoir need about 135 cells, about 270 m³: about 200 m³ is drunk and about 70 m³ evaporates.

**Hard needs reservoirs at least 3 m deep.** Otherwise evaporation over a 30-day drought (1.6 m) eats most of the water.

Usable depth is also capped by pump reach, from the `WaterInputPipeSpec.MaxDepth` values:

| Pump | MaxDepth |
|---|---|
| WaterPump | 2 |
| LargeWaterPump | 4 |
| DeepWaterPump (IronTeeth) | 6 |

Treat badtide (Normal 4–8, Hard 15–30) as a second "no clean inflow" period for any reservoir the player can seal off.

For scale: one S = 1 source delivers 460 m³/day. Refilling a 300 m³ reservoir therefore takes well under a day of temperate flow, if the reservoir is on the flow path.

**Confidence:** high for the numbers taken from code and blueprints. Medium for the per-beaver behaviour (needs are refilled from 2.12 drinks per day on average, and idle drinking patterns may vary).

---

## Q8. How the game draws contaminated water (1.1.2.8)

Read from the game's own files, not run: the water material's saved properties in `resources.assets`, and the
`Shader Graphs/PhysicalWaterURP_Opaque` and `_Transparent` shaders' D3D11 programs (the shader blob is LZ4; Windows'
`d3dcompiler_47` `D3DDisassemble` reads the programs; the `UnityPerMaterial` offsets come from the pass's
vector-parameter table). The C# (`Timberborn.WaterSystemRendering`) only uploads each column's contamination as a
byte texture (`_OldContaminations`, `_NewContaminations`, eased by `_TickProgress`).

- **Colour space: Gamma.** `globalgamemanagers` PlayerSettings `m_ActiveColorSpace` is 0, and the terrain shader
  converts its ambient light to sRGB before use (URP's `SampleSH` under `UNITY_COLORSPACE_GAMMA`). So the water's maths
  below runs on display values: textures are sampled raw (an sRGB flag does nothing), material colours are used as
  stored, and every lerp, overlay and desaturation happens on display values, as does the framebuffer's blending.
- **Per pixel:** the tile's contamination, eased toward its neighbours' average near tile edges, then one tint
  `t = min(1, smoothstep(0.01, 1, c) ^ 0.25)` (`_MinContaminationThreshold` 0.01, `_MaxContaminationThreshold` 1,
  `_ContaminationNonlinearity` 0.25). t: 0.26 at 5 %, 0.39 at 10 %, 0.56 at 20 %, 0.84 at 50 %.
- **Colour:** albedo = lerp(clean, contaminated, t), on display values (Gamma). Clean = `_Color` #446C71 toward
  `_AlbedoAtMaxDepth` #000F48 over `_MaxDepth` 5 levels. Contaminated = a noise pattern between
  `_Base_Contamination_Color_A` (near black, #050505) and `_B` (#801F0B), times 1.75 up to 60 % and easing to 1.0 at
  100 % (`_Base_Contamination_Intensity_Low` / `_High`): partly bad water is a brighter crimson than pure badwater.
- **Surface:** smoothness goes to 0.15 by t × pattern (matte), metallic to 0 and normal strength up to ×2 linearly in c,
  the shallow albedo glow (the contaminated colour toward itself × (3, 1.5, 0) by G ^ 10, `BADWATER.glow`) gated by
  saturate(1 − c / 0.6) (Q9, ps 708-715: that glow only, not the highlights, nor the emissive detail); an emissive
  detail between `_Detail_Contamination_Color_A` #D99053 and `_B` #E09C65 comes in by t (the pink-orange light).
- **Depth (`_DepthGradients`, texture slot 7, pathID 763 in `resources.assets`, 32×32 BC7 sRGB):** both pixel programs sample it
  at (depth / `_MaxDepth`, 0.5). Its R runs 245 to 0 and its G 245 to 22 over the 5 levels. Clean albedo = lerp(`_Color`,
  `_AlbedoAtMaxDepth`, u) × R × 2; the contaminated colour × G, both on display values (the texture sampled raw, in
  Gamma). G relative to a quarter level deep: 1.25 at no depth, 0.80 at half a level, 0.68 at 1, 0.46 at 2, 0.31 at 3,
  0.18 at 4.25 (an earlier reading linearised it: 1.64, 0.61, 0.43, 0.19, 0.08, 0.03; `BADWATER.ramp` follows the raw values). Clean
  albedo × R × 2 reaches near black by 3 levels; on screen the sky's reflection holds deep clean water up (its smoothness is the soft-lit gloss map's, about 0.25,
  not the material's leftover `_Smoothness` 0.672; `WATER_SURFACE.smoothness`).
  Badwater keeps a reflection too, with no depth in it: its metallic goes to 0 (F0 0.04), about 0.6 of clean water's
  reflection, and its emissive detail (`_Detail_Contamination_Color_*` × t) has no depth term either, so deep badwater
  never goes black on screen. `BADWATER.floor` stands for that share on display values: 0.37 of the display colour
  (option A's own `badDeep` / `bad`), a stand-in until an in-game measurement sets it (the game adds its reflection and
  emission with their own colours; they are not a share of the albedo).
  - **A fit from the probe's Badtide shots (2026-10-30), no clear answer yet.** The 2026-10-02 probe batch's Badtide ends
    (`C:/dgm-probe/results/20261002-1610-batch/*-badtide2-end.snapshot.json.gz` and `shots/…-badtide2-end-water.jpg`): on
    five maps with enough pure badwater over a depth range (Chaos 256² s2, Highlands 128² s1, Islands 128² s1 and s2, Lake
    Basin 128² s1), each interior tile of pure badwater (contamination over 0.95, its eight neighbours the same water, not
    hidden behind ground from the camera) is sampled (a 7-pixel median of the red channel) and fitted as A × G(depth) + B,
    G the raw `_DepthGradients` ramp, the worst 15% dropped and refitted; the floor read is B / (A × G(0.25) + B). To
    cancel what the game folds in (its see-through to a dark bed, shadows, its sky's term), our own render of the same
    snapshots from the same camera (`setMap`, Standard) is fitted the same way at two floors and the floor found where the
    two fits meet. With the probe's `standardPoses` water pose as the game's camera, that gives 0.435 (0.38 to 0.49, a
    paired bootstrap over the maps). **But the game's shots are not at that pose**: fitting each shot's camera to the
    map's outline against the teal void round it (0.96 to 0.99 of the outline's pixels agreeing, against 0.56 to 0.87 at
    the pose) puts its field of view at 31° to 37° and its distance 1.0 to 1.35 times the pose's; with those cameras the
    floor comes out at 0.72 (0.59 to 0.77; per map 0.50 to 0.79), and the samples still land a tile or two off the
    water's edges (checked on Lake Basin's shot). The two cameras disagree by more than either error bar, so the fit sets
    no floor: `BADWATER.floor` stays 0.37. What would: the probe writing each shot's camera (its world-to-screen matrix)
    beside it, or a dedicated shot of a synthetic badwater bed of known depths; both wait for a probe batch.
- **See-through (the High-quality variant, `opaque/p036`; Medium and above set `_HIGH_QUALITY_WATER_ENABLED`):** in play
  every tile uses the opaque material (`WaterMesh.GetWaterMaterial`; the transparent one only while a tool hides the
  water, at a flat 0.4). The High-quality program samples `_CameraOpaqueTexture` behind the water and mixes it in, alpha
  staying 1, all on display values: the ground behind, overlaid 80 % with the water's colour (`_TransparencyBlending` 0.8) and desaturated to
  30 % (`_TransparencySaturation`), at a share 0.35 × 0.5 × (1 − d / 5) (`_TransparencyDepth`, `_TransparencyDepthModifier`,
  `_MaxDepth`), d the vertical depth to the ground: about 0.17 at a film's 0.087 deep and at a shore's edge, 0 at
  5 levels; falls 0.1 × (1 − d / 5). The Low variant (`p032`) shows no ground. The contaminated tint, the depth ramp
  and the reflection are the same in both variants. A film is drawn like any water; the game clips hard at the floor.
  Followed by `WATER_SURFACE.seeThrough` (both looks; the light look as Low).
- **Badwater's depth-independent share (`BADWATER.floor`):** no in-game capture yet ties badwater's on-screen colour to a
  known depth reliably: the probe's Badtide shots (`C:\dgm-probe\shots\*\*-badtide2-*-water.jpg`) have the depths in
  their snapshots and their pose id, from which the pose is rebuilt (`catalog.ts` `standardPoses`), but the shots are not
  taken at that camera (fitted to the maps' outlines, 2026-10-30: see the fit under the depth ramp above), so a pixel
  lands a few tiles off. `investigation/probe/WATER-LOOK-SPEC.md` asks the probe to write each shot's camera beside it
  and adds a badwater pool in terraces of known depth, to set it.
- **Opacity:** none by contamination: `_WaterOpacity` is 1 (0.4 while a tool hides the water).
- Used by `src/render3d/waterPalette.ts` `WATER_BLEND` (2026-10-29).

## Q9. The water shader term by term (Timberborn 1.1.2.8-ffc2de0-sw)

Read from the game's own files with `python tools/game-water-shader.py` (2026-11-07; read-only). It finds both water
shaders in `resources.assets`, decompresses their D3D11 programs, disassembles the forward pass's vertex and pixel
programs with `d3dcompiler_47` `D3DDisassemble` into `investigation/water-shader/local/` (gitignored), names every
`cb#[n]` and `t#` at the end of its line, and prints the `UnityPerMaterial` slots with the water material's values and
the textures. The variant is the one the game plays: the opaque material `PhysicalWater_Opaque` (its keyword
`_CALCULATE_OUTFLOWS`), `_HIGH_QUALITY_WATER_ENABLED` (water quality on, Medium and up), and URP's
`_ADDITIONAL_LIGHTS`, `_MAIN_LIGHT_SHADOWS_CASCADE`, `_SHADOWS_SOFT`, `FOG_EXP` (these four change only URP's own
shadow and fog code). Programs: blob entry 32 (vs_4_0) and 176 (ps_4_0); "vs n" and "ps n" below are lines of
`opaque-forward-vs.asm` and `opaque-forward-ps.asm` as the tool writes them. `UnityPerMaterial` is cb4. T is
`_NonlinearTime` (real seconds × √game speed, decompiled `NonlinearAnimationManager`). Q8's and `waterPalette.ts`'s
"p036 n" lines are an earlier extraction of the same program.

### The game's terms

- **V1, the flow.** The vertex reads `_OldOutflows` and `_NewOutflows` (one RGFloat per column: the simulation's
  outflow ÷ 14, `MaxOutflow`), averages its column's with its linked neighbours' (edge and corner links), eases old to
  new by `_TickProgress` (vs 116-272) and hands the pixel (f + 1) / 2 (vs 496), interpolated over the triangle. The
  vertex reads it once more (V3). The material's `_FlowSpeed`, `_FlowStrength`, `_FlowTiling` are not in cb4: leftovers.
- **V2, the surface.** Its height from `_Old/_NewWaterHeights` by `_TickProgress`; water appearing in or leaving a
  column starts up to 0.9 (or 0.54) levels low, × `_TickProgress`^0.25 (vs 301-304). Geometry, not shading.
- **V3, still films moved sideways at the shore.** A shore vertex (one with a missing link) whose water is a film and still
  moves sideways (vs 381-395, added at vs 486): by 0.15 tile × saturate(2 − 20 d) × max(0, 1 − 100 |f|) along its
  corner's direction, d the vertex's depth over its column's floor eased old to new by `_TickProgress`, |f| (capped at 1)
  the flow above. So it is full at 0.05 deep or less and gone at 0.1, full in still water and gone from |f| 0.01 (an
  outflow of 0.14). Geometry: the film's outline at a shore shifts by up to 0.15 tile. Read exactly (fix/water-shore):
  the vertex moves toward its own tile's middle, an edge's middle vertex straight across its open side by 0.15, a corner
  across its one open side by 0.15 or, both its sides open, along its diagonal by −2n × 0.15 (0.21 a side), a corner
  between two linked sides not at all; a neighbour is linked when it has water; the Low quality's program is the same.
  Followed (`shoreFilm.ts`): our mesh's four corners a tile take the shift × the depth's share, the vertex shader the
  flow's share, and the terrain draws the margin the film leaves as dry ground on the same outline; a corner with both
  sides open is cut a little deeper than the game's sixteen vertices cut it, and the map's edge counts as linked.
- **P1, falls.** High quality only: four taps of `_OldWaterfalls`/`_NewWaterfalls` (t15, t16, `FindWaterfalls`'
  output, which the game makes only with High-quality water) ±0.075 round the pixel, old to new by `_TickProgress`,
  sharpened (ps 148-276). This mask w takes off the refraction (P2) and the camera highlight (P12), × (1 − w), and
  moves the see-through from `_TransparencyDepth` 0.35 to `_TransparencyWaterfallDepth` 0.2 (ps 883-884). The other
  `_Waterfall*` values (speed, strength, noise, colour, jagged edge, thresholds) are not in cb4: #740 holds for those,
  not for `FindWaterfalls`, whose textures are read. No whitewater, no foam. The compute shader
  (`WaterColumnPostprocessor`, read for fix/water-refraction): `CalculateHeights` gives each tile's water mesh sixteen
  heights (four by four: an edge vertex takes a linked neighbour's surface, an inner one max(its own, a linked
  neighbour's − 0.3), none under its own); `FindWaterfalls` keeps smoothstep(0.35, 0.6, max(highest − lowest,
  highest − its own surface)) per tile and column, so the highest linked neighbour's rise over its own surface. A
  neighbour is linked when their columns overlap, no barrier stands between, it has water and its surface is under the
  tile's ceiling (`ProcessColumns`); a corner link breaks where a tile between is unlinked or wet (`BreakCornerLinks`).
  So the mask covers the whole tile a fall lands in, whole from a step of 0.6; the pixel's four taps weigh |dx| × |dz|
  from the nearest tile corner and leave out a tile without that column. Not read: which column a tap takes on a tile
  with several (ours: the surface water), the barriers (no building stands in our water).
- **P2, refraction.** The screen position behind is offset by `PerlinNoise3` (t10) at (xz + T × `_DistortionSpeed`
  0.075) × `_DistortionScale` 1.1, × `_DistortionWeights` (0.003, 0.004) of the screen; full within 40 units of the
  camera, none past 60 (`_DistortionDistanceFalloff`), × (1 − w); kept only where it lands behind the water (ps
  285-313). The offset is one scalar, (2n − 1) of the noise's R, along (0.003, 0.004): not a normal. The test compares
  the opaque scene's depth at the moved and the pixel's own position (the water is not in it). PerlinNoise3 (2048²,
  R = G = B): 10 % of its texels 0 and 7 % 255, its autocorrelation's half-width 78 texels; (2n − 1) a mean of −0.064
  and a spread of 0.607.
- **P3, depth.** From the camera's depth texture: the gap between the water and what is behind it, × the view's sine,
  a vertical depth d; u = saturate(d / `_MaxDepth` 5) (ps 315-347). It goes to 0 at every shore and against a
  submerged wall.
- **P4, clean colour.** lerp(`_Color` #446C71, `_AlbedoAtMaxDepth` #000F48, u) × `DepthGradients`.R(u) × 2 (ps
  348-352; Q8).
- **P5, textures carried by the flow.** Two phases of T × `_AlbedoFlowSpeed` 0.4 (2.5 s each), half a cycle apart,
  mixed by |2 frac − 1|; each samples at xz × `_MainTexTiling` 0.06 − f × frac × `_AlbedoFlowStrength` 2, jumping by
  (0.3, 0.42) or (0.58, 0.73) each cycle (ps 419-437). The textures move downstream at about 13 f tiles a second.
  Three ride these coordinates: `PhysicalWaterAlbedo` (t4, `_MainTex`, 2048² BC7) multiplies the colour, `Water_N`
  (t6, `_BumpMap`, 4096² BC7) is the normal, `WaterContaminationAlbedoEmissionSource` (t9) is badwater's pattern.
  Still water's textures stay put, cross-fading between the jumped copies. Nothing else is drawn along the flow: no
  streak term; any streak is the albedo texture stretched by the flow.
- **P6, detail albedo.** `PhysicalWaterDetailAlbedo` (t5) at xz × 0.015 (67 tiles a repeat), still
  (`_DetailAlbedoSpeed` 0), overlaid on colour × albedo (ps 462-477). Read exactly (fix/water-detail): a = P4's colour
  × P5's albedo, per channel r, g, b against the detail's r, g, b: 2 a d where a ≤ 0.5, 1 − 2 (1 − a)(1 − d) above (a
  standard overlay, no weight, no depth or contamination gate; clean water's a is far under a half, so it is × 2d);
  then P7's source lift. Badwater's base colour takes the same sample the same way, mixed in by (1 − c / 2) × (1 − the
  source mask) (ps 690-712). The overlay is straight in d, so the pattern leaves the mean where the texture's mean put
  it. The game's Low quality (no `_HIGH_QUALITY_WATER_ENABLED`; its ps, blob entry 180) samples t5 and overlays it
  identically (and samples `_MainTex` and `_BumpMap` by the flow's two phases too, so the light look's flat flow
  textures are ours, not the game's Low quality). The texture (`--textures`; 2048², BC7): mean 69.7/88.7/95.3, spread
  9.9/8.9/3.7; broad clouds (its first principal component, a greenish brightness along (0.73, 0.66, 0.19), 96 % of
  the variance, spread 13.6, skew +2.0: mostly dim, sparse bright patches with a fine swirl inside; its power by
  wavelength 2 % at 32–64 tiles, 17 % 16–32, 29 % 8–16, 23 % 4–8, 12 % 2–4, 7 % 1–2, 10 % under a tile; half-width
  1.5 tiles), its second (blue against red, spread 2.7) a quadratic of the first but for 0.89, its third nothing.
  Ours (`waterTextures.ts` `makeDetailField`): a Gaussian field from that spectrum, remapped by rank to its
  percentiles, in badwater's texture's B (512², 7.7 texels a tile: the game's 31 a tile show only close up; at the
  opening camera the game's own mips are as coarse), the second component by the quadratic; both looks and the light
  look draw it.
- **P7, water sources.** In play `WaterSourceRenderingService` marks each source's footprint in `_WaterSourceMask`
  (t18); the shader draws `WaterSourceShape` (t12) in polar coordinates round its centre, scrolling outward at 0.04 T,
  fading with distance (ps 356-418): it lifts the albedo (half way to max(colour, pattern × detail), ps 477) and tints
  badwater's emission by `_Water_Source_Color` × `_Water_Source_Strength` 0.8. Read exactly (fix/water-shore; the
  decompiled `Timberborn.WaterSourceRendering`): only the seeps (2 × 2) and the badwater source (3 × 3) carry a
  `WaterSourceRendererSpec`, the plain water source none; a seep shows it while it can run (not in a drought, past its
  activation), a badwater source while its strength is over 0. Over the footprint, v the point from its middle in
  footprints and r = |v|, k = max(0, 1 − 2r): s = saturate(8 × shape × k² + min(1, 2.5 k⁶)), the shape's R at (2r −
  0.04 T, atan / 2π), its top mip. Badwater's emission pattern goes from t9's G to its B by s, × (1 + s × (colour ×
  strength − 1)); its detail overlay × (1 − s), its distortion × max(1 − s, 0.1). The shape (1024², grey): mean 62.9,
  spread 61.8, a quarter under 6, its power mostly at 4–16 cycles a repeat, half-width 27 texels; t9's B mean 188.9.
  Followed (`GAME_WATER_SOURCE`, `makeSourceShape`, `waterSourcePattern`): in every look, under our rings; t9's B at
  its mean (ours carries the detail albedo there); not yet its distortion held back over the source, nor a seep's
  activation day.
- **P8, smoothness and metallic.** `WaterMetalAndGloss` (t7) twice at xz × 0.01, panned by T × (−0.008, −0.002) and
  (0.01, 0.004): metallic R1 + R2, smoothness soft-light(A1, A2) (ps 480-499; `WATER_SURFACE.smoothness`).
- **P9, contamination.** Q8 confirmed (ps 500-790), with one correction: saturate(1 − c / 0.6) gates the orange glow
  only; the camera highlight goes from `_ClearReflectionIntensity` 1.1 to `_ContaminatedReflectionIntensity` 0.4 by t
  (ps 857-858). Also read here: the contamination is sampled at four points jittered by
  `WaterContaminationBlendingMarginNoise` (t11), so tile edges blend irregularly; the base colour lerp(A, B, t9.x) ×
  the intensity is overlaid with the detail albedo (t5, P6's; not the flow's albedo: ps 690-712), less as c rises
  (mixed in by (1 − c / 2)), then × `_DepthGradients` G and the glow; the emission is lerp(`_Detail_Contamination_Color_A`,
  `_B`, `_ContaminationVisualizationNoise`) × t9.y (t9.z on a source's mask) × t × a soft modulation on a 10-tile grid
  (F1² + 0.1 c held to 0.25–0.55, its nodes unjittered) × 4.5 easing to 1.2 by c = 0.4
  (`_Detail_Contamination_Intensity_*`); badwater's normals are × (1 + c) (`_Contamination_Normal_Strength` 2).
  Followed since (`fix/water-badwater`): the pattern (our own texture at t9's measured statistics) and the emission in
  both looks; the colour formula is built behind `BADWATER_FORMULA`, but the pixel judge found it farther from the
  game's frames than our calibrated crimson (it draws pure badwater a dark crimson, L* 8 a level deep lit, where the
  frames show a lighter red-brown), so ours ships until that gap is explained (docs/progress/3d-view.md). The gap was
  the judge's (`fix/water-judge`): those frames fall at sunrise and near sunset, which the judge drew in the day's
  light. Re-judged in each frame's own light, the formula is closer in Standard (8.6 against ours' 17.0) and not in
  High (11.0 against 9.7), and draws badwater about as light as clean water on screen where the game's frames show it
  5 L* lighter; ours still ships.

  **How the judge is validated** (`tools/water-pixel-judge.ts`, 2026-11-07): ours is drawn in the game's light at each
  shot's hour and weather (`tools/game-day-light.ts`: `Sun.blueprint`'s four stages blended as `DayStageCycle` does,
  their sun, Trilight SH and fog swapped into the shaders), from the camera fitted on the map's start shot, and its
  land (level dry tops by soil, and cliff faces, clear of objects ours doesn't draw and of shade) must sit within the
  floor, two game samples' distance at the game's own spread, before its water rulings count: on the badwater shots
  9.2 against a floor of 11.4 (34.8 in the day's light), on the clean start shots 12.2 against 13.6. Also found there:
  the game sets `RenderSettings.reflectionIntensity` to its stage's 1 every frame (`Sun.UpdateColors`), not the
  scene's 0.65; both looks take 1 since `fix/water-light`.
- **P10, selection.** `_HighlightMask` (t17, screen space, `SelectionSystem`) mixes the selection's colour in, up to
  `_HighlightMaskLimit` 0.4 (ps 788-793): the game's own editing aid.
- **P11, normal.** `Water_N` from P5, xy × (1 + c), renormalized, into the world by the mesh's tangent frame: the
  normal URP's light takes, the ambient, the sun, its GGX and the reflection (ps 782-785, 904-910). × `_NormalBoost` 4
  more only for P12's camera highlight (ps 794-813). (*Corrected 2026-11-09, `fix/fall-streaks`: this read the boost
  as the light's too, and both looks lit the boosted normal, the fall's sheet's streaks about twice the game's.*)
- **P12, camera highlight.** As `WATER_SURFACE.highlight` says (ps 814-862), × (1 − w), × the sun's colour, into the
  albedo and the emission. Our port matches it term for term.
- **P13, see-through.** Q8 confirmed (ps 866-889): `_CameraOpaqueTexture` at P2's position, overlaid with the albedo
  (with its highlight) by 0.8, desaturated to 0.3, at lerp(0.35, 0.2, w) × (1 − u) × 0.5. It replaces part of the
  albedo, so the ground behind is lit a second time by the water's light.
- **P14, floor clip.** A pixel below its column's floor is discarded (ps 891-904).
- **P15, light.** URP Lit (ps 905-1251), read term by term (fix/water-sky, 2026-11-07). The albedo it lights is P4's
  colour × P5's albedo (overlaid with P6's detail), the highlight × `_MainLightColor` in it (P12, ps 862) and the ground
  behind mixed in (P13, ps 866-889); metallic m (0 on the water: `WaterMetalAndGloss` red, `_Contamination_Metallic`), smoothness s
  (P8), perceptual roughness pr = 1 − s, roughness r = max(pr², 0.0078125).
  - Diffuse: albedo × 0.96 (1 − m) (ps 954), × (the SH probe by the normal, `unity_SHAr`..`SHC`, turned to display
    values, ps 935-953) for the ambient, × (`_MainLightColor` × N·L × the soft cascaded shadow × `unity_LightData.z`,
    ps 1132-1177) for the sun; additional lights the same in a loop (ps 1198-1241; none by day).
  - Environment (ps 1146-1173): `unity_SpecCube0` sampled at reflect(−V, N), mip pr × (1.7 − 0.7 pr) × 6, decoded by
    `unity_SpecCube0_HDR` (x the intensity), × (f0 + (grazing − f0) × (1 − N·V)^4) / (r² + 1), f0 = lerp(0.04,
    albedo, m) = 0.04, grazing = saturate(s + 1 − 0.96 (1 − m)) = saturate(s + 0.04); added to the ambient's diffuse
    (ps 1173). No occlusion. The probe is the scene's baked one (`sharedassets1.assets`
    "TimberbornEnvironmentRelfectionProbe", the terrain's too), the same at every hour: the day only sets
    `RenderSettings.reflectionIntensity` (1 at every stage). By the reflected direction's height at the water's mips
    (4.4 to 5.6) it is lighter toward the horizon (its haze: 0.46/0.55/0.62 at mip 5, 0.15 up) than straight up
    (0.37/0.46/0.61) and darker below (the ground); `waterPalette.ts` `WATER_PROBE`, `tools/reflection-probe.ts`.
  - The sun's GGX (ps 1178-1193): f0 × r² / (d² × max(0.1, (L·H)²) × (4r + 2)), d = (N·H)² (r² − 1) + 1.00001, × the
    sun's radiance above; the highlight and badwater's glowing lines are the emission (ps 863, 890), added unlit; then the
    exponential fog (ps 1245-1249).
  - So the two terms #839 found (the diffuse share 0.96, the environment's head-on part f0 / (1 + r²)) are this same
    lighting, not separate terms.
  Ours: both looks draw all of it (`WATER_LIGHT`: the probe by direction, its head-on part, the GGX and the game's
  sun colour on the highlight and glint, the 0.96), with P6's detail overlay at its mean: the light alone lifted
  clean water, already lighter than the game's in the shallows, further away, and P6's missing overlay was that
  excess; together they read nearer the game than dev in both looks (docs/progress/3d-view.md, fix/water-sky). Not read from the game, assumed: the HDR decode values the game uploads
  (intensity 1, no RGBM: the probe is BC6H); that the water's `unity_SpecCube0` in play is that probe (no reflection
  probe component in the decompiled C#, no frame capture); the probe's turn against the editor's map axes (its side
  faces differ by about a tenth: averaged round the turn); the SH the game uploads (D497's frame capture still to do);
  the cube's seamless filtering across faces (sampled within a face).
- **The edge where water meets land.** No foam, no shore line, no intersection or depth-fade term: only P3's depth
  (the colour lightens toward the shore) and P13's see-through (17.5 % at most, at the shore). `_Foam*`,
  `_ShorelineThreshold`, `_InvFade`, `_FadeLimit` are not in cb4: leftovers. #715 confirmed.
- **The transparent material** (entry 92; only while a tool hides the water) has the same flow, albedo, contamination
  and light, without the camera highlight, refraction, see-through and fall mask.

### Ours against the game

S = Standard (`materials.ts` `waterMaterial`), H = High (`high/shaders.ts` `measuredSurfaceWater` and its water
hook). (a) follows the game's term; (b) ours only; (c) the game's, missing or different in ours.

| Our term | Look | Verdict | The game's term, evidence |
|---|---|---|---|
| Depth: the column's, shallower toward a bank (`waterSeenDepth`, 0.3 over 0.45 tile; H 0.1 over 0.55) | S, H | (a), approximate | P3, from the depth buffer (ps 315-347) |
| Clean colour: shallow to teal by 1 − e^(−4d), to navy over 0.6-2.8 (`cleanWaterBody`) | S | (c) | P4: lerp(#446C71, #000F48, d/5) × R × 2 (ps 348-352); ours fitted to screenshots (D304, D310, D324) |
| Clean colour: `HW_SHALLOW`, `HW_BODY`, `HW_DEEP` by depth | H | (c) | P4; ours from references (D334) |
| Grazing colour (`HW_GRAZING`) and streak colours by view angle | H | (b) | none: the game's change with angle is P15's reflection |
| Pale streaks (`pale`, `WATER_PALE` × 0.22, noise stretched along the map's axes), on the surface and fall faces | S | (b) | none: no streak term (P5) |
| Crests' light teal (`WATER_CREST` × 0.3 by the ripples' slope) | S | (b) | none |
| `chop` streaks in the streak colours (× 0.45) | H | (b) | none |
| Light network (`cracks`), ribbons, broad swells, rolling packets, × (0.8 + 0.4 broad), darker with speed, `hlRough` | H | (b) | none: the only light terms are P12 and P15 |
| Albedo texture carried by the flow | S, H | (c), missing | P5: `PhysicalWaterAlbedo` × colour (ps 419-437) |
| Ripple normals: cosines carried by our drift (calm 0.07) | S | (c) | P5, P11: `Water_N` carried by the flow, lit as it is, × 4 for the highlight alone (ps 438-446, 782-813, 904-910) |
| Ripple normals: three cosines rippling in place over time (`hlRippleNormal(g, time)`), not carried by the flow | H | (c) | P11 |
| Drift: the current × 0.65, two 12 s phases | S, H | (a) in form, (c) in rate | P5: 2.5 s phases, about 13 f tiles a second |
| Still water's drift (0.018, −0.012) | H | (b) | P5: still textures stay put |
| Badwater's ripples at half speed (`slow`; High's `hlT` slows only its fall strands and `bt` only its bubbles) | S | (b) | none; the game makes badwater's normals × 2 instead (P9, ps 780) |
| Shore vertices of a still film drawn sideways | S, H, light | (a): drawn back toward their tile's middle, the ground left dry (`shoreFilm.ts`, fix/water-shore); a corner open on both sides a little deeper than the game's | V3 (vs 381-395, 486) |
| Detail albedo | S, H, light | (a): its 67-tile pattern, our own texture at the game's statistics (`waterDetailAt`, `waterDetailOverlay`, fix/water-detail) | P6 (ps 462-477) |
| Gloss: our noise round 0.25, ± 0.6 of its swing, panned | S | (a), approximate | P8 (ps 480-499) |
| Light: sky × 1.2 + sun × 0.3 × N·L × shadow | S | (a), approximate | P15 |
| Light: `rippleLight` over `referenceLight` | H | (a) under the formula (its clean and badwater colours are lit by `gameWaterLight`); (c) for our crimson | P15 |
| Sky reflection and sun glint | S | (a): the game's (`waterEnvironment` by `WATER_PROBE`, `waterSunGlint`, the sun's colour; fix/water-sky); the probe read as heights round the turn, not by direction round the vertical | P15 (ps 1146-1193) |
| Sky reflection and sun glint | H | (a): as Standard (fix/water-sky) | P15 |
| Camera highlight (`waterCameraHighlight`), before and after the light | S, H | (a) | P12 (ps 814-862); ours drops it on faces by their normal, the game by the fall mask |
| See-through share (`cleanWaterAlpha`, 0.175 × (1 − d/5)) | S, H | (a) | P13 (ps 879-889) |
| Ground behind overlaid and desaturated (`waterGroundBehind`) | S, H | (a) (fix/water-tints-behind): in the water's shader, on the half-size copy with its grade undone, overlaid with the water's albedo, × its diffuse light, fogged and graded with it, on whatever lies behind (a fall's dry cliff too); the terrain's own only where no copy is made (software, pictures) | P13: the lit albedo, and the ground lit again |
| Refraction of the ground behind (`waterComposite`, refraction.ts) | S, H | (a): the game's weights, drift, scale and falloff; our noise at its statistics; a shore test in place of its depth test (fix/water-refraction) | P2 (ps 285-313) |
| The composite: the see-through's share of the lit albedo replaced, the reflection, glint and emission on top, graded once, opaque (`waterComposite`) | S, H | (a) (fix/water-composite) where the frame makes the copy; a film's sliver blends by its curve (our anti-aliasing); the water alone blended where no copy is made (software, pictures, the bloom's source) | P13, P15: the water drawn opaque, its colour one composite |
| The fall mask (`waterFallMask`, fallMask.ts): see-through 0.35 to 0.2, no highlight, no refraction on the tile a fall lands in | S, H | (a) (fix/water-refraction) | P1 (ps 148-276, 883-884), `FindWaterfalls` |
| Fall faces: see-through 0.1, no highlight, the shallowest colour | S, H, light | (a), approximate: ours by the face | P1 (ps 883-884): the game's mesh slopes over the step, masked on the tile below |
| Badwater's colour, ramp, glow, tint, blend | S, H | (a); `BADWATER.floor` 0.37 ours until measured (Q8); blue kept from purple ours (D154) | P9 |
| Badwater's troughs and light patches (mottled noise) | S, H | (c); followed (`fix/water-badwater`) | P9: lerp(A, B, t9's pattern) carried by the flow |
| Badwater's bubbles (orange dots, `BADWATER_VEIN` × 0.55) | S, H | (c); followed (`fix/water-badwater`) | P9: its emission is a flowing texture pattern, not dots |
| A film's fade under 0.03 levels (`waterFilm`); High's sheen lifting a film's opacity | S, H | (b), our anti-aliasing (`WATER_FILM`) | P14: a hard clip |
| No foam, no shore line | S, H | (a) | none (#715) |
| Sources welling: rings and bubbles in `WATER_FOAM` × 0.55 | S (both draw it) | editing aid (D196), drawn over the game's own pattern | P7: the game draws its own in play (ps 356-418) |
| The sources' own pattern over seeps and badwater sources | S, H, light | (a): our shape at the game's statistics, its lift, emission tint and overlay held back (`waterSourcePattern`, fix/water-shore); t9's B at its mean | P7 (ps 356-418, 477, 700-720) |
| High's poisoned bed (the ground's own contamination under badwater, #38) | H | (b); gone (fix/water-shore, D496 as amended): the bed every look draws | none: the game's terrain shader has no underwater input |
| Source glow, highlighted source, clear water, overlays, hatches | S, H | editing aids (D497) | P10 is the game's own |
| The side and section at the map's edge | S, H | ours by need (no cut edge in the game) | none |

### What to change, ranked

The game's textures cannot ship; a fix draws our own texture or noise in the game's role, with the game's numbers.

Ours only, most visible first:
1. High's light network, ribbons, swells, rolling packets and their brightness swing: over every water surface (D334 put
   them in from references; removing them amends it).
2. Standard's pale streaks and crests' light; High's `chop` streaks and grazing colours.
3. Small: Standard's slowed badwater ripples, High's still-water drift, a film's lifted opacity.

The game's, missing or different:
1. The flow: an albedo texture and a normal map (× 4 for the highlight) carried by the outflow in two 2.5 s phases (P5, P11), in place of
   our noise; High's normals ripple in place and do not move with the flow.
2. Clean water's colour by the game's formula on its depth (P3, P4), in both looks.
3. High's sky reflection and GGX (P15); both looks' simplified light. Done (fix/water-sky), with P6's mean below: the
   game's light alone lifted clean water further from the game's, P6's overlay was its excess.
4. Badwater's flowing pattern and emissive detail (P9) in place of mottles and bubbles; its normals × 2.
5. The still detail albedo, 67 tiles a repeat (P6): done (fix/water-detail), its pattern in every look.
6. The sources' own pattern in play (P7), under our rings: done (fix/water-shore), with V3's still films drawn back from
   the shore.
7. Refraction of the ground behind (P2), and the fall mask by tile from `FindWaterfalls` (P1): done
   (fix/water-refraction), in Standard and High.

## Q10. The terrain shader's albedo (Timberborn 1.1.2.8-ffc2de0-sw)

Read the same way as Q9 (`python tools/game-water-shader.py --shader "Shader Graphs/TerrainURP" --keywords ...`,
2026-11-08; the disassembly stays in a gitignored folder). The terrain's five materials pick their variants by keyword:
`Grass` (every top) `_USELAYERTOOL`; `Cliff` `_SAMPLE_SPLATMAP _USELAYERTOOL _USE_TRIPLANAR_SPLATMAP`; `CliffEdge`
`_SAMPLE_SPLATMAP _USELAYERTOOL`; `SlopeCliff` `_SAMPLE_SPLATMAP _USE_TRIPLANAR_SPLATMAP`; `SlopeCliffEdge`
`_SAMPLE_SPLATMAP`; URP's `FOG_EXP _ADDITIONAL_LIGHTS _MAIN_LIGHT_SHADOWS_CASCADE` on all.

- **A top's albedo** (the `Grass` variant's pixel program): grass = `_BaseAlbedoTex` ("Grass") at world xz ×
  `_ProjectionUVScale` × the grass altitude ramp at y / `_AltitudeCeiling` × 2; desert = `_DesertTex` × its ramp × 2;
  blended by the desert intensity (the 2D-array map's slice at the top's level, four taps `_BlendingMargin` round the
  point, eased by `_TickProgress`, + `_BlendingNoiseMultiplier` × (noise − 0.5), then (v − 0.5) × `_BlendingSoftness` +
  0.5, saturated); the field textures by the field map the same way; then × `_DetailAlbedoTex` ("GrassDetailsAlbedo",
  at the same uv × `_DetailScale` 0.5) × 2; then contamination's pattern laid over (D154). **No moisture term**: soil
  moisture reaches the shader only through the desert intensity, so grass with none of the desert in it is the same at
  every moisture (ours ran deeper by the water until `fix/land-tone`).
- **A wall's albedo** (the `Cliff` variant): the top's albedo as above, then lerped toward `_SplatAlbedoTex`
  ("CliffDetail", triplanar at world × `_Albedo_Triplanar_Tile` 0.45, weights |n| / Σ|n|) × `_SplatAlbedoColor` (1) ×
  lerp(`_SplatGradientMin`, `_SplatGradientMax`, y / `_AltitudeCeiling`) by `_SplatFilterTex` (the mesh's uv); the
  normal from `Cliff_N`, triplanar at × 0.125. No detail texture on the cliff's own colour.
- **The light** (both variants): URP's Lit under Gamma, as D497 has it: albedo × (0.96 − 0.96 × `_Metallic` 0.05) ×
  (SampleSH(n), turned to sRGB + `_MainLightColor` × the shadow × saturate(n·L)) + the environment's and the sun's
  specular (smoothness `_Glossiness` 0.05 × the splat filter), then `unity_FogParams.x` fog by exp2. Nothing in it
  differs between grass and dry ground but the albedo.
- **The textures' means by mip** (BC7, read raw, display 0–255; the start shots, 70–110 away, read about the 64²–128²
  mips): `Grass` 67.0/72.5/24.4 at 4096², 67.4/72.9/24.8 at 64²; `Desert` 61.2/51.3/40.9 and 62.5/52.2/41.7;
  `GrassDetailsAlbedo` 140.1/140.8/140.6 and 140.3/141.0/140.8; `CliffDetail` 67.3/61.8/51.7 (2048²) and 67.5/62.0/51.9.
  Every mip within 2 % of the top's, so a texture's mean holds at every distance.
- **On the probe's start shots** (`tools/water-pixel-judge.ts --samples`, the six clean-water start shots, Standard),
  these terms with no specular, through the game's fog and post chain, against the game's pixels: dry tops 113/116/111
  modelled, 120/122/115 in the game; grass 113/140/80 modelled, 119/146/84 in the game. The game sits the same 6–7 over
  the model on both, its specular and what the model leaves out: so grass and dry ground take the same light, and our
  grass's darkness was ours (dev drew grass 107/135/80 there, dry 120/122/117).
- Used by `src/render3d/palette.ts` `GROUND.grass` and `materials.ts` `groundColor` (`fix/land-tone`).
- **The `Grass` material's other values** (read 2026-11-08, `fix/grass-light`), for a term that might set grass apart
  from dry ground: `_EmissionColor` 0 and `_Grayscale` 0 (the emission the program adds after the light is 0),
  `_Normalmap_Strength` 0 and no normal texture in the variant (a top's normal is its mesh's), smoothness
  `_Glossiness` × the splat filter (0 on a top), `_SplatGradientMin`/`Max` 1. Nothing but the albedo differs between
  grass and dry ground. The variant with `_SHADOWS_SOFT` exists too (URP's 9-tap filter over a few shadow-map texels).
- **The judge with the game's texture taken out** (`tools/land-texture-check.py`, 2026-11-08): the game's textures are
  world-anchored (base at world xz / 16, detail at xz / 32; world x, z the tile's x, y, the orientation that correlates
  with the game's pixels, 0.58 on grass and 0.56 on dry against 0.23 or less for any other), so its pixels at a cluster
  of samples sit over or under its light by where the cluster falls on the texture. On the six start shots the game's
  grass texture is 4.1 % over its mean at riverValley-128-1's 108 grass samples (+2.7 luma on screen), 3.3 % under at
  riverValley-128-2's 36 (−2.1). Taken out, and with ours drawn on the texture means (`GROUND_MEANS`), the game's pixels
  sit +1.3 luma over ours on grass and +1.0 on dry in Standard (+1.6 and +1.0 in High): grass and dry ground take the
  game's light in ours to within a luma of each other.

## Simplified water simulation spec (browser implementation)

This spec is for heightfield terrain (one water column per cell). It is exact for maps without caves or overhang objects, as validated against the 1.1 save.

```
Grid X×Y. Per cell: floor F (int, the z of the first air voxel), depth D ≥ 0, contamination C ∈ [0,1],
stored outflow Out[k] for k ∈ {0:−y, 1:−x, 2:+y, 3:+x}. Optional per cell: hlim (dam crest; -1 = none;
NaturalDam = 0.65 at its cell), full obstacles are simply F += 1 (Blockage).
Out-of-map neighbour: F = 0, D = 0 always (a sink) — EXCEPT the 4 out-of-map neighbours of every
source cell, which are walls (no flow).
Constants: dt = 0.3 s; K = 2.25*dt = 0.675; SPILL = 0.1; KEEP = 0.999; BAL = 0.8;
EVAP = 1e-4/s (1e-3/s if D < 0.02); 1 tick = 2 substeps = 0.6 s; 1 day = 768 ticks.

Each tick:
  sat/evapMod from current wet mask:
    WN = wet ? 1 + (#wet 8-neighbours) : 0
    sat = wet ? min(8, max(WN, max_4nbr(WN_n − 1))) : 0
    evapMod = sat == 0 ? 1 : 0.0595*(10−sat)^2 + 0.101*(10−sat) + 0.72
  repeat 2 substeps:
    H = F + D                                             (all reads use start-of-substep state)
    for each cell c with D>0, each dir k, neighbour n:
       if n is a wall, or F_n >= H_c: f=0; continue       (never flow onto floor at/above own surface)
       prev = KEEP*Out_c[k]
       e = H_c − H_n
       if hlim_n >= 0 and F_n < ceil(H_c):                 (dam in target cell)
           hd = H_c − F_n
           if hd < hlim_n: f = 0.995*prev − 0.02*clamp01(clamp01((hlim_n−hd)/0.1)
                                        * clamp(1 − 2.25*(H_c − (F_c+Dold_c)), 0.5, 2))
           else: if hd−hlim_n < 0.1 and e > 0: e *= (hd−hlim_n)/0.1
                 f = 0.995*prev + K*e
       else:
           if D_n == 0 and F_n == F_c: e −= SPILL
           f = prev + K*e
       f_k = max(f, 0)
    s = Σ_k f_k ; if s*dt > D_c: f_k *= D_c/(s*dt)
    for each cell c:
       in_k = f(n_k → c)
       net = Σ in_k − Σ f_k
       Out_c[k] = max(0, f_k − BAL*in_k)
       Dold_c = D_c
       D_c = max(0, D_c + (net − EVAP(D_c)*evapMod_c)*dt)
       C_c = mass-weighted mix of (C_c*(D_c−outflowed) + Σ in_k*dt*C_n) / D_new   (clamp 0..1)
    for each source (cells P_i, strength S, contamination Cs):
       for each cell: D += dt*S/N ; C mixed with Cs
Sources: S = 0 while delayed (TimedComponentActivator), during drought (with the pre-drought ramp
  m(p)=1−(p/T)(0.85p/T+0.15), T=S/2.673 days), Aquifer unless drilled+powered and temperate,
  BadtideDrain except during badtide (then C=1 and outflow only along its orientation),
  Seep: off while D at its anchor > 0.8, back on < 0.72. Clean sources emit C≈1 during badtide.
Steady state: ~1 day of ticks for 128² maps (expect a transient overshoot); lakes end flat at spill level.
Validated: 1.1 save generated-river-valley (975 ticks from empty) max |ΔD| = 0.001; Diorama/Waterfalls
exact; Meander IoU 0.99 (with dams/blockage/edge-source walls). NOT valid where water passes under
roofs (caves, tunnels, NaturalOverhang, BadtideDrain interiors): implement stacked columns there
(columns = air gaps; flow between neighbour columns whose [floor, ceiling) overlap and whose floor
< origin surface; full columns store Overflow with head ×8 and flow share ÷8).

Soil moisture (exact steady state; validated ≥ 99.4 % tile-exact on 18/19 official maps, 97.2 % on Beaverome):
  on each terrain top tile t (height z):
    if full barrier: M=0 (fixed)
    if clean water (C≤0.01, D>0) on t: M = 2*sat (fixed)
    direct = max over 4-neighbours with water of  R(n) − 6*max(0, z − ceil(F_n + D_n))
             (skip if ceil(F_n+D_n) <= floor of t's terrain column), R = 2*sat, or
             int(2*sat*(1−C/0.53)) if C≥0.01 (0 if C≥0.53)
    propagate (Dijkstra, max-heap): M_t = max(direct_t, M_n − cost − 6*max(0, z − z_n − ceil(D on n)))
             cost 1 (orthogonal) / 1.414 (diagonal); multiply by (1 − C of water on t); <0.01 → 0
  moist ⇔ M > 0.
Soil contamination (same pattern): source 2*(C−0.5) (C≥0.5) − (5/7)*levels up; spread −1/7 (diag √2/7),
  −5/7 per level up; contaminated ⇔ > 0 (effectively reach 7 tiles).

world.json writing: WaterSimulationMigrator {IsMigrated:true}; WaterMapNew {Levels:1 for heightfields,
  WaterColumns "depth:cont:0:floor:depth" or "0", ColumnOutflows all "0"}; WaterEvaporationMap all 1;
  SoilMoistureSimulator/SoilContaminationSimulator may be zeros (recomputed in ~20 ticks) but writing the
  steady state avoids a first-tick "dry" flag on trees.
```

---

## Needs in-game check

1. **Aquifer in drought.** The code says aquifer drills are blocked in every hazardous weather, and the aquifer's own drought modifier gives 0. Check that an ancient drill with power gives no water during drought and badtide.
2. **Units.** Check that S = 1.0 fills about 460 m³ per game day. Time the filling of a closed basin of known volume.
3. **Evaporation.** Check that a sealed lake at least 3 wide loses about 0.054 m/day in any weather, and a 1-wide channel about 0.2 m/day.
4. **Dry trees at game start.** Check that a map with living trees on dry tiles loads with dying timers and not instant death. The save suggests timers. The map editor kills them instantly.
5. **Zero moisture at load.** Check that trees survive a map whose `MoistureLevels` are all 0 but whose water is pre-filled. `DryObject` starts dry, then resets the next tick. Also check this when water arrives only after hours.
6. **Badtide contamination curve.** Check that it jumps to 0.5 at the start, reaches 1 after half a day, and that clean pumps drop to (1−c).
7. **Seeps.** Check the 0.8 m cap, the 0.72 m restart, and whether the fade is in real time or game time (it uses `Time.deltaTime`).
8. **Edge sources.** Check that a source on the map border does not lose water straight off-map (`WaterMapBoundary`).
9. **BadtideDrain.** Check that water leaves only through the front cell, and how a drain behaves when its front cell has ground below.
10. **Pump reach.** Check the pump reach (MaxDepth 2/4/6) against the "usable depth" used in the reservoir sizing.
11. **Reproduction.** Check the rate on a map-placed forest edge: about ReproductionChance per open neighbour spot per day, only onto moist tiles.
12. **Faction species.** Check whether Folktails maps can contain IronTeeth-only species (Mangrove, CoffeeBush) and the reverse. The template collections suggest they may fail to load or get dropped.
13. **Tunnels.** Check how pressurised stacked columns in tunnels behave (Overflow, ×8 head), if DGM ever routes water under roofs.
