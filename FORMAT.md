# The `.timber` map format (Timberborn 1.1)

What a native Timberborn 1.1 map file contains, and what a generator must write so the game loads
it without dropping anything. Verified against game build `1.1.2.4-52e959e-sw`. The sources are the
game's decompiled loaders, its blueprints, the 19 official maps (saved by 1.1.2.1 and 1.1.2.3), 9
workshop maps (0.6 to 1.0) and two 1.1.2.4 saves. The detailed evidence is in
[investigation/notes/format_1_1.md](investigation/notes/format_1_1.md),
[blocks_and_placement.md](investigation/notes/blocks_and_placement.md) and
[water_and_soil.md](investigation/notes/water_and_soil.md).

> The first FORMAT.md was written from four 0.7/1.0 workshop maps and was lost along with the
> first prototype. This version is rebuilt from the 1.1 files and the game's code, and it ends with
> the full list of differences from the 0.7/1.0 format.

`prototype/tbmap.py` implements this format. Reading and re-serializing any voxel-format map
reproduces its `world.json` byte for byte; `prototype/roundtrip_test.py` checks that on 34 files.

## 1. Container

A `.timber` file is a ZIP archive. The game reads entries by exact, case-sensitive file name, and a
missing entry reads as empty.

| Entry | Required | Content |
|---|---|---|
| `map_metadata.json` | yes (the map editor throws on a malformed one) | size and description |
| `map_thumbnail.jpg` | no (blank thumbnail) | 960×540 baseline JPEG |
| `version.txt` | yes (an empty file crashes) | game version, one line ending in CRLF |
| `world.json` | yes | terrain, simulation state and entities |

- The game writes the entries in the order above, using Deflate. Stored entries also load. Put
  every entry at the zip root; extra entries are ignored.
- User maps live in `Documents\Timberborn\Maps\*.timber`. The extension check is case-sensitive.
  The map's name in the game is the file name without `.timber`.
- Saves use the same container with `save_metadata.json` and `save_thumbnail.jpg` instead.

## 2. `version.txt` and `GameVersion`

Write `1.1.2.4-52e959e-sw` followed by `\r\n`, and the same string in `world.json` `GameVersion`.

- The version is checked only when a map is picked in the menu or opened in the editor. On the
  stable (`-sw`) branch any 1.1.x map loads silently on any 1.1.x game. Maps older than 0.7.6.0
  get a confirmation dialog, and maps older than 0.1.1.1 are refused.
- **No loader reads the version.** Every migration is triggered by missing or old keys, so a
  1.0-stamped file and a 1.1-stamped file with the same content load identically.
- A `-xsw` suffix marks an experimental build. A player on an older experimental build gets the
  "semi-compatible" dialog for a newer `-sw` map; that is cosmetic.

## 3. `map_metadata.json`

```json
{"Width":96,"Height":96,"MapNameLocKey":"","MapDescriptionLocKey":"","MapDescription":"…","IsRecommended":false,"IsUnconventional":false,"IsDev":false}
```

Write all eight keys. For user maps the game shows the file name and `MapDescription`; the
`*LocKey`, `IsRecommended`, `IsUnconventional` and `IsDev` flags only matter for built-in maps.
`Width`/`Height` must equal `MapSize`. Extra keys (such as a mod's `MaxPlayers`) are ignored.

## 4. `world.json`

### 4.1 Encoding

- Compact UTF-8 JSON without a BOM: `{"GameVersion":…,"Timestamp":…,"Singletons":{…},"Entities":[…]}`.
  `GameVersion`, `Singletons` and `Entities` are required. `Timestamp` (`yyyy-MM-dd HH:mm:ss`) is
  written but never read.
- Numbers use the invariant culture. Floats are printed the way C# prints them, with an upper-case
  exponent (`6.80089E-05`); either case parses. Write ints for int fields and `true`/`false` for
  booleans. NaN and Infinity are not allowed.
- Enums are name strings in exact case (`"Cw90"`). A wrong name (`"cw90"`) makes the whole load fail.
- A key missing from a present object crashes the load. Optional parts are optional as whole
  components or singletons, not as keys.

### 4.2 Packed arrays

Terrain, water, moisture and contamination are stored as `{"Array": "<tokens>"}`: tokens separated
by single spaces, with no leading, trailing or double spaces.

- Index order: `index = level·X·Y + y·X + x`. For terrain, `level` is the voxel layer z. For
  water, evaporation, moisture and contamination it is the column slot, counted from the bottom.
- Length must be at least `X·Y·levels`. A shorter array crashes; extra entries are ignored.
- Grid axes: x is east, y is north, z is up. Entity `Coordinates` use the same axes.

### 4.3 Singletons

| Singleton | Required | Write for a new map |
|---|---|---|
| `MapSize` | **yes** (crash) | `{"Size":{"X":W,"Y":H}}` |
| `TerrainMap` | no (flat 4-layer terrain) | `{"Voxels":{"Array": W·H·23 tokens "0"/"1"}}` |
| `HazardousWeatherHistory` | no | `{"HistoryData":[]}` |
| `WaterEvaporationMap` | no | `{"Levels":L,"EvaporationModifiers":{"Array": W·H·L × "1"}}` |
| `WaterSimulationMigrator` | **effectively yes** | `{"IsMigrated":true}` |
| `WaterMapNew` | no (no water) | `{"Levels":L,"WaterColumns":{…},"ColumnOutflows":{…}}` |
| `SoilMoistureSimulator` | no (dry) | `{"Size":S,"MoistureLevels":{…}}` |
| `SoilContaminationSimulator` | no (clean) | `{"Size":S,"ContaminationCandidates":{…},"ContaminationLevels":{…}}` |
| `NumberedEntityNamerService` | no | `{"NextNumbers":[]}` |
| `WindService` | no | `{"WindStrength":0.0,"WindDirection":{"X":0.0,"Y":0.0},"NextWindChangeTime":0.0}` |
| `MapThumbnailCameraMover` | no (editor only; the editor uses a default camera) | omit |

**`WaterSimulationMigrator` is the trap.** Without it, or with `IsMigrated:false`, the game halves
every water source's strength and every stored outflow on load (the 0.7→1.0 rescale).

**`MapSize`**: in 1.1 only `Size` is read. The vertical size is a game constant: 23 terrain
layers (`MaxGameTerrainHeight` 22 + 1) and 33 total layers (10 above the terrain). The 1.0-era
`MapHeight` key is ignored and dropped on re-save. Size limits are 4–256 per axis (enforced only by
the New Map dialog). Non-square maps are fine. Larger maps load too: the unmodded game plays the Map Resizer mod's maps
up to 399×399 and 29×599 (investigation/WORKSHOP.md); 512 a side is D357's probe batch (group `Sizes`).

**`TerrainMap`**: one token per voxel, `1` solid. The array must hold exactly `X·Y·23` tokens: fewer
crash, more are truncated to 22 layers with a warning. Limits:
- The map editor caps terrain at height 16 (voxels 0–15), and every official map tops out at
  exactly 16. The game allows up to 22. Keep layer 22 empty.
- z = 0 may be air. An empty column is ground at level 0, and official maps use height-0 border
  cells as river outlets.
- Terrain physics on load deletes voxels more than 3 sideways steps from support (overhangs), and
  then the objects that stood on them.
- The pre-0.7 `Heights` array (`y·X+x`, surface height per column) is still migrated on load.

**`WaterMapNew`**:
- `Levels` = the largest number of water columns in any cell (one per air gap above a floor). A
  plain heightmap needs 1. It may be larger than needed but not smaller.
- `WaterColumns` token: `"0"` for an empty column, otherwise
  `WaterDepth:Contamination:Overflow:Floor:OldWaterDepth`. Depth is in blocks above the column
  floor; contamination is the badwater fraction 0–1; overflow is pressurised water in a full cave
  column (0 in the open); floor is informational and recomputed on load; write old depth = depth.
- `ColumnOutflows` token: `"0"`, or `Bottom:Left:Top:Right[:extra]` where each part is `"0"` or
  `targetIndex|flow`. The target is the neighbour's index in the game's grid padded by one tile on
  every side (`MapIndexService`: `(y + 1) · (X + 2) + x + 1` for slot 0; Bottom is y − 1, Left
  x − 1, Top y + 1, Right x + 1). The flow is the water's momentum toward that neighbour: the game
  keeps 0.999 of it every step, so it is not rebuilt from scratch. All-`"0"` outflows load, but the
  game then restarts every river from rest: most water returns to where it was within a day, yet a
  map whose flow can settle more than one way (a delta's channels) may not (M9a's probe batch
  20260927-0853-batch: Delta 128² seed 1 kept 78.5% of its wet tiles within 0.1). **Write the
  settled water's own outflows** with its depths, as generator 0.7.0 does (`settledSimulationSingletons`,
  7 significant digits; a flow under 1e-6 and a dry tile's flows are `"0"`).
- All-`"0"` water is safe: the game fills rivers from the sources within about a game day.
  Official maps instead ship with settled water, which the prototype also writes
  (`TimberMap.set_simulation_state`), so rivers run and trees stand on moist soil from the first
  tick.

**`SoilMoistureSimulator` / `SoilContaminationSimulator`**: `Size` counts terrain column slots
(1 for a heightmap), not water `Levels`, although the two are equal in every observed map. Values:
moisture 0–16, contamination 0–1. All-zero is safe; the game recomputes both within about 20 ticks.

**`WaterEvaporationMap`** is a cache the game recomputes every tick; write `1`s.

### 4.4 Entities

```json
{"Id":"0f8b…","Template":"Pine","Components":{"BlockObject":{"Coordinates":{"X":12,"Y":40,"Z":9}},"CoordinatesOffsetter":{"Random":true},"Yielder:Cuttable":{"Yield":{"Good":"Log","Amount":2}},"Yielder:Gatherable":{"Yield":{"Good":"PineResin","Amount":0}}}}
```

- `Id` is a GUID in lowercase `D` format. **Ids must be unique**: a duplicate crashes the load. The
  Id also seeds a tree's visual offset, scale and rotation, so reproducible Ids give reproducible
  looks.
- `Template` must be a template every game has. Use only the common set: trees `Pine`, `Birch`,
  `Oak`, `Succulent`; `BlueberryBush`; and the map objects listed in §5. Faction-only plants (Maple,
  ChestnutTree, Mangrove, Dandelion, CoffeeBush) fail to load in the editor and for the other
  faction. An unknown template is skipped with a loading-issue panel.
- Unknown components are ignored. Missing components use defaults, except the ones marked
  required in §5, which crash the load.

**`BlockObject`**: `{"Coordinates":{"X","Y","Z"},"Orientation":"Cw90","Flipped":true}`.
- `Z` is the first air layer above the ground the object stands on.
- `Orientation` ∈ `Cw0|Cw90|Cw180|Cw270`, omitted for `Cw0`. `Flipped` is written only when true
  and is honoured only for flippable templates.
- **Footprint:** `Coordinates` is where blueprint block (0,0,0) lands; it is *not* the minimum corner
  of the rotated footprint. Each block's cell is `Coordinates + R(F(local))`, where
  `F(x,y,z) = (SizeX−1−x, y, z)` when flipped, and `R` is Cw0 `(x,y)`, Cw90 `(y,−x)`, Cw180
  `(−x,−y)`, Cw270 `(−y,x)`. A 3×3 at min corner (Mx,My) therefore has Coordinates (Mx,My) for Cw0,
  (Mx,My+2) for Cw90, (Mx+2,My+2) for Cw180 and (Mx+2,My) for Cw270. This rule predicted all
  58,388 official objects with zero conflicts; the alternatives did not.
- Blueprint blocks are ordered z, then y, then x. Every template's blocks, ground rules and
  orientation footprints are in
  [investigation/notes/footprints.json](investigation/notes/footprints.json).

## 5. Map templates

Components marked **required** crash the load when missing. Everything else falls back to the
blueprint default.

| Template | Size | Components to write | Placement |
|---|---|---|---|
| `StartingLocation` | 3×3×5 | `BlockObject` | exactly one; flat 3×3, 5 free layers, entrance tile at the same level (§6) |
| `Pine`, `Birch`, `Oak` | 1×1×3 (Birch 1×1×2) | `CoordinatesOffsetter{Random:true}`, optional `LivingNaturalResource{IsDead:true}`, optional `Growable{GrowthProgress<1}`, `Yielder:Cuttable{Log: Pine 2, Birch 1, Oak 8}`, Pine also `Yielder:Gatherable{PineResin, 0}` | on any solid ground; alive only on moist soil |
| `Succulent` | 1×1×2 | as a tree, `Yielder:Cuttable{Water,2}`, `DeadCuttableYieldRemover{IsBlocked:false}` | alive only on **dry** soil |
| `BlueberryBush` | 1×1×1 | `CoordinatesOffsetter`, `Yielder:Gatherable{Berries,3}`, `GatherableYieldGrower{GrowthProgress:1.0}` (ripe) | moist soil |
| `RuinColumnH1`…`H8` | 1×1×h | **`RuinModels{VariantId:"A".."E"}`**, `Yielder:Ruin{ScrapMetal, 15·h}` | on ground; needs an 8-neighbour at the same level to be scavenged |
| `WaterSource` | 1×1×1 | **`WaterSource{SpecifiedStrength,CurrentStrength}`**, `TimeActivatedComponent{IsEnabled:false,CyclesUntilCountdownActivation:5,DaysUntilActivation:10.0,DaysPassed:0.0}` | on the lowest terrain column; nothing below |
| `BadwaterSource` | 3×3×1 | same as WaterSource (emits on all 9 tiles) | flat 3×3, lowest terrain column |
| `Slope` | 1×1×2 | `BlockObject` with `Orientation` | on the low tile of a 1-level step (§6) |
| `Blockage` | 1×1×1 | `BlockObject` | a full water plug, walkable on top at bank level |
| `NaturalDam` | 1×1×1 | `BlockObject` | holds water 0.65 above its base; blocks walking |
| `Thorns` | 1×1×1 | `BlockObject` | blocks walking, moisture and contamination on its tile |
| `NaturalOverhang2x1/3x1/4x1` | 1×N×1 | `BlockObject` | natural bridge slab; its top is walkable and takes paths |
| `UndergroundRuins` | 5×5×1 | `BlockObject` | flat, no cave below; the Mine's understructure |
| `SmallRelic` / `MediumRelic` / `LargeRelic` | 2×1 / 3×2 / 3×3×2 | `BlockObject` | flat ground; 200 / 800 / 3,000 science |
| `GeothermalField` | 3×3×1 | `BlockObject` | flat, dry, lowest column; powers a 400 hp engine |
| `UnstableCore` | 2×2×1 | **`UnstableCore{ExplosionRadius:0..5}`**, `TimeActivatedComponent{IsEnabled:true,…}` | removes terrain and objects when it explodes |
| `WaterSeep` / `BadwaterSeep` | 2×2×1 | **`WaterSource`**, **`WaterDepthStrengthModifier{CurrentModifier}`**, `TimeActivatedComponent` | flat, lowest column; stops under 0.8 of water |
| `Aquifer` | 3×3×1 (plus shape) | **`WaterSource`** | produces only under a powered drill |
| `AncientAquiferDrill` | 3×3×5 | `BlockObject` | must cover an Aquifer exactly |
| `BadtideDrain` | 1×3×1 | **`WaterSource`**, `TimeActivatedComponent` | a spout in a cliff notch; runs only in badtide |
| `ReservePile` / `ReserveTank` / `ReserveWarehouse` | 2×2×2 / 2×2×3 / 2×2×1 | **`FixedStockpile`** plus the Nomads component set | goods common to both factions only |

`CurrentStrength` is recomputed on load; official maps store 0 for delayed sources. Strength is
volume per second spread over the source's tiles (1 = about 460 blocks of water per game day), capped
at 8 per tile.

## 6. What the game checks on load

Every block object is validated when a map loads. Failures are **deleted** and listed in a
"Loading issues" panel:
- out of the map, or above z 32;
- inside terrain;
- overlapping another object (their occupation flags intersect; in practice every map template
  excludes every other in its base cell);
- floating (`Ground` blocks need solid voxel below; `GroundOrStackable` also accepts the top of an
  overhang or badtide drain);
- an object under an `OccupyAllBelow` block (water sources, seeps, aquifers, drains, geothermal
  fields and underground ruins claim their whole column);
- a water object or geothermal field or underground ruins not on the lowest terrain column (not on
  an overhang or cave roof);
- anything placed over the `StartingLocation` (the start is always the one lost).

These make the **whole load fail**: a duplicate `Id`, an invalid enum string, a voxel array with fewer
than 23 layers, and a missing required component (§5).

Nothing checks slope direction, water in cells, or reachability. The generator must:
- **Slopes:** a Slope at `Coordinates.Z = z` stands on a tile at level z and leads up to level z+1.
  The high side is Cw0 south (y−1), Cw90 west (x−1), Cw180 north (y+1), Cw270 east (x+1). Beavers
  cannot walk across even a 1-voxel step without a slope or stairs.
- **Start entrance:** the district center that replaces the StartingLocation opens toward
  Cw0 −y, Cw90 −x, Cw180 +y, Cw270 +x. The entrance tile must be free ground at the start's level, or
  no beavers spawn. That tile is at (X+1,Y−1), (X−1,Y−1), (X−1,Y+1) and (X+1,Y+1) respectively.

## 7. Changes from the 0.7 / 1.0 format

| | 0.6 | 0.7 | 1.0 | 1.1 |
|---|---|---|---|---|
| Version string | `0.6.9.x-…` | `0.7.x-…` | `1.0.12.3-db72a8c-sw` | `1.1.2.x-…` (write `1.1.2.4-52e959e-sw`) |
| Terrain | `TerrainMap.Heights` (2-D) | `Voxels` | `Voxels` | `Voxels`, exactly 23 layers |
| `MapSize.MapHeight` | – | some maps (`{23,33}`) | `{23,33}` | **not written, ignored** |
| Water column token | 4 fields | 4 fields | 4 fields | **5 fields** (adds `OldWaterDepth`) |
| `WaterSimulationMigrator` | – | – | `true` | `true` (**missing halves water strength**) |
| `NumberedEntityNamerService`, `WindService` | – | – | added | same |
| `ExplosionService` | – | – | – | present in maps with unstable cores (optional) |
| `SteamWorkshopMapDataService` | workshop uploads | workshop uploads | workshop uploads | not in official maps (editor only) |
| Orientation | `{"Value":"Cw90"}` | `"Cw90"` | `"Cw90"` | `"Cw90"` (old form still accepted) |
| Tree offset component | `CoordinatesOffseter{CoordinatesOffset}` | both | `CoordinatesOffsetter{Random}` | `CoordinatesOffsetter{Random}` |
| Components 1.1 never reads | `DryObject`, `ContaminatedObject`, `NaturalResourceModelRandomizer`, `StartingLocationPlayer` (Timber Together reads it) | some | – | ignored if present; do not write |
| Old components 1.1 still reads | `BlockObjectState`, `WateredNaturalResource` (`DryingProgress` becomes `DyingProgress`), `LivingWaterNaturalResource`, `ContaminatedNaturalResource`, `CoordinatesOffseter` (becomes `Random` when its offset is not zero) | some | – | read and migrated on load |
| Map templates added | – | – | Thorns, NaturalDam, UnstableCore, BadtideDrain, GeothermalField, WaterSeep, BadwaterSeep, Aquifer, relics | Succulent, ReservePile/Tank/Warehouse, AncientAquiferDrill |

A 1.0-format file loads in 1.1 with one migration: 4-field water columns get
`OldWaterDepth = WaterDepth`. That is why the first prototype's 1.0-stamped maps played fine. The
singleton set, component shapes, outflow format and metadata are otherwise identical between 1.0 and
1.1 (checked against the 1.0 map *Beavers Endgame*).

## 8. Writer checklist

1. Zip: `map_metadata.json`, `map_thumbnail.jpg` (960×540 JPEG), `version.txt`, `world.json`;
   Deflate; fixed entry dates if the file must be reproducible.
2. `GameVersion` and `version.txt`: `1.1.2.4-52e959e-sw`.
3. Singletons as in §4.3, including `WaterSimulationMigrator {IsMigrated:true}`.
4. Terrain: exactly 23 layers, height ≤ 16, layer 22 empty, no unsupported overhangs.
5. Water: `Levels` ≥ the terrain's floors; all `"0"`, or settled columns with the 5-field token.
6. Entities: unique GUIDs, common templates, exact enum case, required components, footprints
   inside the map and on valid ground, nothing overlapping, exactly one StartingLocation with a free
   entrance.

## Map-editor parity objects (D337–D339)

Seeps write WaterSource, BlockObject, WaterDepthStrengthModifier, TimeActivatedComponent, in that order. BadtideDrain writes WaterSource, BlockObject, TimeActivatedComponent; its data footprint is 1×3. Aquifer writes BlockObject then WaterSource, with CurrentStrength 0 and no countdown; AncientAquiferDrill writes BlockObject alone. A delayed source writes CurrentStrength 0 and the four countdown fields IsEnabled, CyclesUntilCountdownActivation, DaysUntilActivation and DaysPassed; days and strengths are floats. UnstableCore writes BlockObject, TimeActivatedComponent (always enabled), UnstableCore; its default radius is 5, cycle 5, countdown 10.5 days. Reserves write BlockObject, FixedStockpile, SingleGoodAllower, Inventory:Stockpile, StockpileVisualizers, Inventory:ConstructionSite; the stock is one allowed good up to capacity, and construction stock records 10 ScrapMetal. `tests/contract/parityObjects.test.ts` checks complete file and project round trips and the load checks for every new object.
