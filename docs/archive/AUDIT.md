# Plan audit: PLAN.md and EDITOR_PLAN.md against the investigation

Audit of 2026-09-23 on branch `audit/plan-integration`. It checks the generator plan
([PLAN.md](../../PLAN.md)) and the editor plan ([EDITOR_PLAN.md](../../EDITOR_PLAN.md)) against the
investigation's findings and against each other, and merges their milestones into
[ROADMAP.md](../../ROADMAP.md).

**Inputs.** All five named inputs were found:
- [investigation/REPORT.md](../../investigation/REPORT.md), [investigation/calibration.json](../../investigation/calibration.json), [FORMAT.md](../../FORMAT.md), [PLAN.md](../../PLAN.md) and [EDITOR_PLAN.md](../../EDITOR_PLAN.md);
- the notes in `investigation/notes/`, the Python prototype in `prototype/`, and the local-only `investigation/raw/` and `investigation/decompiled/`.

Nothing is missing.

## Summary

### Most significant changes

1. **The generator is now built from the editor's features.** PLAN.md produced a finished map
   plus *detected* features for labels. EDITOR_PLAN.md needs the *parametric* objects the map was
   built from, and would have had to retrofit them into a finished generator.
   - Now the generator plans a feature list, and one shared pipeline builds every map from it
     (PLAN §7, §19.8).
   - All shared foundations are defined once, in the new PLAN §19. EDITOR_PLAN §11 only points to
     it.
2. **One validation contract.** PLAN offered a download only when every check passed. The editor
   blocked only errors. Neither plan handled imported maps with caves, with terrain above 16, or
   in pre-1.1 formats, and the shared modules would have refused official maps such as Pillars.
   - Checks now have a class (load, playability, design), and profiles (generate, export, import)
     decide what each class does (PLAN §19.5).
3. **Set pieces follow measured limits** (PLAN §9.2, §9.9, §9.10).
   - The waterfall drop is at most 15 levels with editor-safe terrain, and about 12 in a real
     layout.
   - A wide fall only spreads over its whole lip when a header pool one level below the lip feeds
     it. Without one, a 20-wide lip carried water on 3 tiles.
   - A 20-wide fall that looks like an official one needs about 8 blocks/s. That is more than the
     whole Normal flow of a 128² map (3.6).
   - Dam-site reservoirs are limited by map size: Hard difficulty does not fit on 48².
4. **Claude delivery had to change.**
   - An artifact cannot call the Anthropic API or any other host. It calls Claude through the
     `sample` capability: 64 KiB of input, no system prompt, and tools written as page functions.
   - It cannot save a `.timber`: that extension is not on the downloads allowlist.
   - The plan now uses real tools instead of a text protocol, builds the API adapter first, and
     runs a spike before the artifact edition (EDITOR §7, decision D8).
5. **The editor's water features now obey the water model.**
   - Water is flat, so a lake's level is its outlet sill.
   - River mouths on the map edge must be sealed. In an audit experiment, an unsealed mouth lost
     all its water back off the edge.
   - A river's bed depth sets how far it moistens the soil: 16, 10, 4 or 0 tiles.
   - Pre-1.0 imports must have their source strengths halved, or the exported map runs double
     water.
6. **Water performance was optimistic.** A JavaScript port of the simulation took 6.5–11 s to
   settle a 256² map from empty, against a 1.5 s budget. The budgets were revised, the active set
   must be exact, and previews warm-start while exports use a canonical settle (PLAN §10,
   EDITOR §9).
7. **Edits survive regeneration.**
   - Feature ids are hashed from the feature's role in the plan, not its position in a list.
   - Entity ids are hashed from the feature that owns them.
   - Each feature has its own random stream, so changing one forest no longer reshuffles every
     other feature (PLAN §19.4, §19.7).
8. **One roadmap.** The 3D renderer, the set pieces and validation were each planned twice; each
   is now built once. Automatic slopes move ahead of the first in-game check of edited maps. M1
   is the smallest end-to-end slice, and it already writes editor-ready maps.
9. **"Fair multiplayer" symmetry dropped.** A 1.1 map keeps exactly one StartingLocation.
   Symmetry stays as a creative tool (EDITOR §2, §5, §9).

### Decisions for Kyler

Each has a safe default, already written into the plans (PLAN §20). Nothing waits on these, but
they are yours to overrule.

1. **D8: Claude delivery order.**
   - *Default:* build the Claude bridge against the Messages API first. It also runs the
     automated request suite. Ship bring-your-own-key as an advanced option. Ship the Claude
     artifact edition second, after the M3 spike proves Web Workers, file open, `.zip`
     downloads and sharing on your plan.
   - *Alternatives:* artifact only (no key handling at all), or bring-your-own-key only.
2. **D10: the artifact edition downloads a `.zip`** that contains the `.timber`, so players have
   one extra "extract" step. The alternative is to skip the artifact edition.
3. **D6: waterfall flow policy.**
   - *Default:* a fall takes the flow of its river. A standalone fall adds at most 100% of the
     map's flow budget; beyond that it becomes a thinner sheet and the report says so. An exact
     flow set in advanced mode may exceed the cap, with a warning.
   - The width cap is 40% of the side along the lip.
   - In-game check F1 (a 20-wide fall at 2 and at 8 blocks/s) will show whether thin sheets read
     as waterfalls.
4. **D4: terrain limit 16.**
   - *Default:* 16, the in-game editor's limit, which gives falls of up to 15 levels.
   - Allowing 17–22 would permit falls of up to 21 levels, but the in-game editor could no longer
     edit those maps, and that is untested (PLAN §18 E1).
5. **D5: symmetry without multiplayer.** Usability task 5 ("symmetric for two players") became
   "mirror-symmetric while keeping one valid start". If you meant co-op mods (the investigation's
   256² co-op save was made with BeaverBuddies), say so, and a mod-aware option can be planned
   later.
6. **D3: edited maps can be exported with playability warnings.** This was already EDITOR_PLAN's
   rule and is now explicit. Generated maps still have to pass every check except the advisory
   `plants.drought`.
7. **D9: prototype calibration drift.** `prototype/calibrated.py` keeps badwater at 30 / 20 / 12
   tiles from the start, and PLAN §5.6 at 40 / 30 / 15. It also requires 750 reachable tiles
   where the default setting is 1,300.
   - *Default:* PLAN's values, applied to the prototype in M1. This audit changed no code.
8. **Small-map guards.** *Default:* the settings panel disables drought-reserve combinations
   whose reservoir would exceed 15% of the map. This only affects custom sizes under 89²: the
   smallest sides that fit are Normal with Plenty 51, Hard with Scarce 52, Hard with the Normal
   reserve 63, and Hard with Plenty 89. Every size preset (96² and up) fits every combination.
9. **D7: share links carry the spec only.** Edited maps are shared as project files.
10. **Still open from PLAN §17:** the site's address, whether Hard maps with Scarce reserves are
    refused, and GitHub-issue ratings.

### Method

- **Read:** both plans, REPORT.md and FORMAT.md in full; three notes in full and `format_1_1.md` in part; the key prototype modules
  (`generate.py`, `terrain.py`, `watersim.py`, `validate.py`, `playability.py`, `calibrated.py`,
  `analysis.py`) and the structure and per-map values of calibration.json.
- **Findings the plans rely on**, re-checked against the game files. All held:
  - `MapSize.blueprint.json`: MaxMapEditorTerrainHeight 16, MaxGameTerrainHeight 22, map size
    4–256;
  - the Slope blueprint's navigation edges: the low exit is +y at z, the high exit −y at z+1;
  - `Orientation.Transform` (Cw90 = (y, −x), Cw180 = (−x, −y), Cw270 = (−y, x)), at
    `Timberborn.Coordinates.cs:1060`;
  - `WaterMapBoundary` (edge cells next to a source are blocked);
  - `WaterSimulationMigrator` (`ScaleRatio 0.5`);
  - `SoilMoistureSimulator.blueprint.json` (`VerticalSpreadCostMultiplier 6`).
- **Experiments**, run in the session scratchpad and not committed:
  - waterfall limits with the prototype's water port (`prototype/watersim.py`);
  - lip widths and depths of the official waterfalls (`investigation/raw/builtin`);
  - a Node 24 benchmark of the water rules on 128² and 256² prototype terrain.

  The results are in the evidence appendix.
- **Anthropic's documentation** was checked on official pages on 2026-09-23 (Sources, below). A
  research subagent collected the pages, and the key claims were re-fetched directly. The
  artifact runtime's type definitions (contract 0.2.54, shipped with Claude Code 2.1.280) were
  read for the exact call limits.

Severity: **critical** means building on the plan as written would force a redesign;
**major** means a wrong result, a broken rule or a blocked feature; **minor** means an inaccuracy
or a small gap. "Applied" says where the change went.

---

## 1. Contradictions with the findings

**F1.1 A lake's water level is not a free parameter.** *Major.*
- *Evidence:* water surfaces settle flat, and lake levels equal their spill level (water notes
  Q2, "How close can a simplified model get?"). The game does no pre-settling. Pre-filled lakes
  without a source slowly evaporate (format notes §7), at 0.0535 levels a day on water at least 3
  wide (water notes Q2 step 4). Map edges drain, except next to a source (Q2, "Map edges are
  sinks").
- *EDITOR assumed:* `Lake { outline, waterLevel, outlet }` with a settable level.
- *Change:*
  - `Lake { basin, floorDepth, outlet {at, sill, to}, inflow }`, with the level derived from the
    sill;
  - a warning when there is no inflow;
  - the basin kept off the map edge.
- *Applied:* yes. EDITOR §1, §3 and §4; PLAN §19.2.

**F1.2 River depth decides moisture, and the flow decides the water depth.** *Major.*
- *Evidence:* each bank level above the ceiled water surface costs 6 tiles of the 16-tile reach
  (water notes Q3, "Reach"). A river carved 1 deep keeps all 16 tiles, 2 deep leaves 10, 3 deep
  4, and 4 deep none. Water in a channel draining to an edge is about 0.3·S/w deep (Q2; audit
  runs in the evidence appendix).
- *EDITOR assumed:* `River { depth }` as a free carve parameter with no stated effect.
- *Change:* `bedDepth` defaults to 1 (range 1–4), and the inspector shows the moisture band. The
  water depth follows from flow and outlet.
- *Applied:* yes. EDITOR §3; PLAN §19.2.

**F1.3 River mouths at the map edge must be sealed.** *Major.*
- *Evidence:*
  - Only the out-of-map padding next to a source cell is a wall; every other border cell drains
    (water notes Q1 and Q2; `WaterMapBoundary` verified).
  - Audit run: a 20-wide channel whose north-edge row held 4 sources, at 2 blocks/s, kept **0**
    wet tiles; 12 sources at 6 blocks/s did hold water.
  - PLAN §7.6 said "rows across each river's entry channel", without saying the row must fill
    the whole mouth.
- *Change:* sources fill the whole mouth, or the mouth is walled and fed by inland springs. The
  editor's river tool seals the mouth automatically.
- *Applied:* yes. PLAN §1 and §7.6; EDITOR §1 and §4; new in-game check F2.

**F1.4 Symmetry "for fair multiplayer maps" and "two players" are impossible in 1.1.** *Major.*
- *Evidence:* only one StartingLocation survives a load, and there is no
  multiplayer/`StartingLocationPlayer` code in 1.1 (blocks notes §3). A 0.6 multiplayer map's 3
  starts load as 1.
- *Change:* symmetry stays as a creative tool, and multiplayer starts are a non-goal. Usability
  task 5 is reworded. Decision D5.
- *Applied:* yes. EDITOR §2, §5 and §9; PLAN §20.

**F1.5 "Gentle" edges and terrain edits strand the colony without slopes.** *Major.*
- *Evidence:*
  - Beavers cannot cross even a 1-voxel step without a Slope or stairs (navigation notes 1a).
  - Stairs cost 70 science.
  - 62% of official steps are 1 level (REPORT §4, Terrain).
  - EDITOR's E3 in-game check exported edited maps before E4 added automatic slopes.
- *Change:* edge styles are defined in whole levels:
  - gentle = 1-level steps at least 3 apart, with slopes;
  - terraced = 1-level bands 6–12 deep;
  - cliff = a step of 2 or more levels, impassable.

  Slopes are derived after every terrain change, with pin and remove overrides, from the first
  terrain-tool milestone (M5).
- *Applied:* yes. EDITOR §1, §3 and §10; PLAN §19.2 and §19.8; ROADMAP M5.

**F1.6 Height limits, and what they mean for set pieces.** *Major.*
- *Evidence:*
  - `MapSizeSpec`: in-game editor 16, game 22 (verified).
  - Every official map tops out at 16.
  - Workshop maps reach 22.
  - EDITOR said only that "the maximum drop is bounded by the terrain height limit". PLAN §9.2
    said "at most 12", assuming beds between 2 and 14.
- *Change:* concrete limits: a drop of at most 15 with editor-safe terrain (measured 14.98), 12
  practical, and 21 with the game's limit (measured 20.9), which stays out of scope. Terrain above
  16 is a non-goal for tools, and imported maps with terrain up to 22 are preserved. Decision D4.
- *Applied:* yes. PLAN §9.2, §9.10 and §20; EDITOR §2 and §3.

**F1.7 The shared validation would have refused the official and workshop maps the editor must
import.** *Major.*
- *Evidence:*
  - `terrain.single_floor` (the prototype's `water.model`) fails any map with caves or overhangs:
    1% of official columns, up to 13% on Pillars, and a workshop median of 30% (REPORT §4).
  - `terrain.max_height` (16) fails Beavers Endgame and Lost Valley, which reach 22.
  - `file.version` fails 1.0 maps.
  - All these maps load in the game.
- *Change:* the check classes and profiles (see F2.5).
- *Applied:* yes. PLAN §11 and §19.5.

**F1.8 Importing pre-1.0 maps doubles their water on export.** *Major.*
- *Evidence:* without `WaterSimulationMigrator {IsMigrated:true}` the game halves every source's
  strength and every saved outflow on load (verified: `ScaleRatio 0.5` in
  `Timberborn.WaterSystem`). The 0.x workshop maps lack the flag (water notes Q1). The writer
  always adds it.
- *Change:* the importer halves strengths and outflows when the flag is missing or false, and
  lists the change. New in-game check F3.
- *Applied:* yes. PLAN §17, §18 F3 and §19.6; EDITOR §9.

**F1.9 Stamps, mirroring and symmetry need the game's transform rules for entities.** *Minor.*
- *Evidence:* a cell is `Coordinates + R(F(local))`. `Flipped` is honoured only for flippable
  templates. A slope's orientation encodes its high side (blocks notes §1 and §4).
- *Change:*
  - a mirror remaps orientations and recomputes Coordinates from the minimum corner;
  - asymmetric, non-flippable footprints (BadtideDrain, the upper layer of LargeRelic) are
    re-placed rather than mirrored;
  - slopes are re-derived.
- *Applied:* yes. EDITOR §5.

**F1.10 A badwater toggle on a river has side effects.** *Minor.*
- *Evidence:*
  - Only BadwaterSource (3×3, flat, on the lowest terrain column) and the badwater seeps emit
    badwater.
  - Badwater gives no moisture and contaminates soil up to 7 tiles away.
  - Plants die on contaminated soil in 0.2–0.3 days (water notes Q3–Q5).
  - Official badwater sources are never on the edge.
- *Change:* the toggle converts the sources and warns that forests along the river will die.
- *Applied:* yes. EDITOR §4.

**F1.11 Non-square maps.** *Minor.*
- *Evidence:* official 100×50 and 256×150 maps, and a 151×251 workshop map.
- *Change:* rotate-4 symmetry needs a square map. The region resolver uses fractions of each side.
- *Applied:* yes. EDITOR §3, §5 and §7.

**F1.12 PLAN and the prototype disagree on calibrated thresholds.** *Minor.*
- *Evidence:*
  - `calibrated.py` sets `badwater_min` to 30 / 20 / 12, against PLAN §5.6's 40 / 30 / 15.
  - `START.reach_min_tiles` is 750, the Tight value, against the Normal default of 1,300 in §5.2.
  - PLAN §4 claims a test asserts the tables are equal.
  - Inside PLAN, §5.5 said Normal 48 and Hard 60 bushes near the start, while §5.6 said 40 and
    40. They are a generation target and a validation minimum, which PLAN now says.
- *Change:* PLAN's values are the intent, and `calibrated.py` is aligned in M1. This audit
  changed no code. Decision D9.
- *Applied:* partly: in the plan (PLAN §4, §5.5, §20), not in the code.

**F1.13 The prototype's playability module mishandles imported maps.** *Minor.*
- *Evidence:* `prototype/playability.py`:
  - `map_sources` gives BadwaterSource tiles as Coordinates + (0..2, 0..2) whatever the
    orientation;
  - it ignores seeps, drains and aquifers;
  - the walking `blocked` mask marks only the origin tile of multi-tile objects.

  This is fine for generated maps, which use Cw0 and single tiles. It is wrong for official ones.
- *Change:* the TypeScript port uses footprints for everything, with a parity test on all 19
  official maps.
- *Applied:* yes. PLAN §11.5; EDITOR §9.

**F1.14 Delayed sources and emitters active only in certain weather.** *Minor.*
- *Evidence:* 20 of 170 official sources are delayed (`TimeActivatedComponent`). Seeps stop at
  0.8 deep. Badtide drains run only in badtide. Aquifers run only under a powered drill (water
  notes Q1 and Q6).
- *Change:* the preview models them (off, capped, or drill-only). Advanced mode shows "turns on
  at cycle N".
- *Applied:* yes. EDITOR §4 and §6.

---

## 2. The generator contract (EDITOR_PLAN §11)

Every item existed in both plans with a different definition, or in only one. Each is now
defined once, in PLAN §19; EDITOR §11 is a table pointing to it.

| Item | PLAN (before) | EDITOR_PLAN (before) | Mismatch | Single definition |
|---|---|---|---|---|
| Map spec | `Settings` (§5) plus seed, version, attempt and candidate. URL fragment codec only. No JSON schema. | `MapSpec` "from PLAN.md": settings, seed, archetype, set pieces, constraints. A documented JSON schema is a prerequisite. | Different names. Archetype and premise are implicit in PLAN. PLAN has no set-piece requests or constraints. The accepted attempt is not recorded. PLAN has no schema, although EDITOR requires one. | §19.1 `MapSpec` v1 schema. `SpecPatch` is a JSON Merge Patch. |
| Parametric features | `features` are *detected* after the build, for labels and names. | Parametric objects are the primary editing model. | The generator does not build from features, so the editor would receive descriptions, not the objects that made the map. | §19.2, one schema. Generation plans features, then builds from them (§7). Detected features become `derived`. |
| Set-piece builders | `plan(layout, rng)` / `apply(heights, masks)` on a constraint field. Set pieces are dam site (incl. gorge), waterfall on a river bed, terraced cliffs, obstacle, badwater, spillway, ruins, second district. | Waterfall with its own sources, dam site and gorge. Builders clear entities, clamp and report. | Different interface and context (layout vs a live map). The waterfall's water comes from different places. The gorge is separate in one plan. The lists differ. EDITOR clamps, which contradicts "operations reject". | §19.3 `limits` / `plan` / `rasterize`, with context = layout or map. Two waterfall modes. A new gorge builder (§9.9). Reject outside hard bounds; reduce and report beyond what the map allows. |
| Stable ids | Feature ids "from the seed and its stage". Entity GUIDs from one sequential stream. | "From the seed, their kind and their generation order". | Different inputs. Order-based ids rename everything after an inserted feature. Sequential entity GUIDs reshuffle on any upstream change, and each tree's look with them. | §19.4: role keys, stored UUIDs for user features, entity ids hashed from their owner. |
| Validation | Download only when every check passes. Result `{id, ok, value, limit, message}`. | Errors block, warnings allow export. Needs severity, location, fixes and dirty-region runs. | Different blocking semantics. No severity, location or fix fields. No thresholds for maps without a spec. Imported maps blocked (F1.7). | §19.5 classes and profiles. The full result shape. `meta.designedFor` for imports. |
| Format I/O | A 1.1 writer, a reader for round-trip tests, generated fixtures. | Import any `.timber`. "Exports unchanged". | "Unchanged" is not definable when the writer re-stamps the version, upgrades tokens and drops keys. Legacy formats and migrator halving are unplanned. Project-file contents are not specified. | §19.6: reader scope, import normalization, what "exports unchanged" means, and the project file with its base. |
| Determinism | Per-stage RNG streams, IEEE-exact arithmetic, fixed file bytes, versioned deploys. | The same spec and edits give the same bytes from either path. Local rebuilds. | Per-stage streams make local edits non-local. Incremental rebuilds could diverge from full ones. A warm-started water preview is not reproducible. The project file does not store the base, so documents drift across generator versions. | §19.7: per-feature streams, `build(doc)` pure, incremental = full, the canonical settle, stored base and `generatorVersion`. |
| Build order *(extra)* | Stages 4–7: terrain, slopes, water, detail. | Landforms → water features → resources → start → edits. | Two orders for the same operation. Slopes are not placed. Sculpt edits come after water. | §19.8, one pipeline for both. |

**F2.1 The generator did not produce the editor's parametric features.** *Critical.*
- *Evidence:* PLAN §7.10 ("`features` drives the preview layers, the map card and the name"),
  compared with EDITOR §3 ("Generated maps expose their rivers, landforms, ruin fields and set
  pieces as features from the start") and §11.
- *Change:* features first.
  - Stages 1–3 plan the `Feature[]`, and the shared pipeline builds it.
  - `GeneratedMap` returns `spec` and `features`, with the detected features kept as `derived`.
  - Generated maps expose rivers, lakes and planned basins, landforms, set pieces, forests (one
    per grove), berry patches, ruin fields, map objects and the start.
- *Applied:* yes. PLAN §7, §7.10, §19.2 and §19.8; EDITOR §3; ROADMAP M1.

**F2.2 No single map spec.** *Major.* Details in the table.
- *Applied:* yes. PLAN §7.0 and §19.1; EDITOR §3 and §11.

**F2.3 Set-piece builders defined twice, and differently.** *Major.* Details in the table.
- *Applied:* yes. PLAN §7.3, §9 and §19.3; EDITOR §3 and §11.

**F2.4 Id schemes orphan edits on regeneration.** *Major.* Details in the table.
- *Applied:* yes. PLAN §2.1 and §19.4; EDITOR §3.

**F2.5 Two validation contracts.** *Critical.* Details in the table and F1.7.
- *Applied:* yes. PLAN §11, §11.6 and §19.5; EDITOR §0 and §6; decision D3.

**F2.6 Format I/O: what "unchanged" means, and legacy imports.** *Major.* Details in the table
and F1.8.
- *Applied:* yes. PLAN §19.6; EDITOR §3 and §9.

**F2.7 Determinism across both paths.** *Major.* Details in the table.
- *Applied:* yes. PLAN §2.1, §10 and §19.7; EDITOR §3 and §6.

**F2.8 Two build orders.** *Major.* Details in the table.
- *Applied:* yes. PLAN §19.8; EDITOR §3.

**F2.9 Regeneration could not honour the editor's conflict rules.** *Major.*
- *Evidence:* EDITOR says regeneration "never touches ... user-created features" and "keeps the
  player's own features". PLAN's planner had no input for existing features or locks, so a
  regenerated river could run through a player's plateau.
- *Change:* `MapSpec.constraints` (locks, keep-out regions, features to keep) goes into §7.0,
  and the planner builds around them.
- *Applied:* yes. PLAN §7.0 and §19.1; EDITOR §3.

**F2.10 EDITOR's prerequisite waited for the whole generator plan.** *Minor.*
- *Evidence:* EDITOR §0 said "The core site from PLAN.md works end to end", which conflicts with
  building shared foundations early.
- *Change:* the prerequisites follow ROADMAP (M1–M2 before M3).
- *Applied:* yes. EDITOR §0.

---

## 3. Set pieces: what the game's limits allow

**Achievable ranges** (full table in PLAN §9.10). The drop does not depend on map size.

| | 48² | 96² | 128² | 192² | 256² |
|---|---|---|---|---|---|
| Waterfall drop: hard max / practical / typical | 15 / 12 / 3–8 | same | same | same | same |
| Waterfall width cap (40% of the side; hydraulic limit about side − 8) | 19 | 38 | 51 | 76 | 102 |
| The map's whole Normal flow (blocks/s) | 1.2 | 3.0 | 3.6 | 4.4 | 7.2 |
| Flow for a 20-wide fall: minimum / official-looking | over the cap | 0.5 / 8 | 0.5 / 8 | 0.5 / 8 | 0.5 / 8 |
| Dam-site basin cap (15% of the area) | 345 | 1,382 | 2,457 | 5,529 | 9,830 |
| Reservoir for Normal with Plenty (759 blocks ≈ 380 tiles at 2 deep) | no (16.5%) | yes | yes | yes | yes |
| Reservoir for Hard with the Normal reserve (1,761 blocks ≈ 587 tiles at 3 deep) | no (25%) | yes (6.4%) | yes | yes | yes |
| Reservoir for Hard with Plenty (3,522 blocks ≈ 1,174 tiles) | no | yes (12.7%) | yes | yes | yes |

**F3.1 Waterfall drop.** *Major.*
- *Evidence:* audit runs of the prototype port (appendix A). A lip bed at 15 with banks at 16,
  over a plunge pool at level 0 draining to an edge, measured a 14.98 surface drop. With beds at
  2 and 14: 11.9. With the game's limit (bed 21, banks 22): 20.9. The official maximum is 12.8
  (Diorama, a 50² map), and the median of each map's highest fall is 4.8. Workshop maps reach
  14.7 at the 16 cap (calibration.json).
- *Change:* PLAN §9.2 and §9.10 state 15 / 12 / 3–8, the same on every size. EDITOR's example
  report became realistic.
- *Applied:* yes.

**F3.2 Waterfall width needs a header pool and flow.** *Major.*
- *Evidence:* appendix A.
  - A lip fed straight from a flat channel wetted only the tiles near the sources: 3 of 20 at
    0.5 blocks/s, 18 of 20 at 2.
  - With a header pool one level below the lip, the whole lip carried water: 20 of 20 at 0.5, and
    200 of 200 on a 256-wide map at 2.
  - The lip is about 0.3·S/W deep: 0.089 at S = 6, W = 20.
  - Official falls (appendix C) are 2–8 tiles wide at most per map, with lips 0.12–0.29 deep. Counting sheets
    under 0.1 deep, Canyon reaches 10 and Craters 15, and Pressure has 22.
- *EDITOR assumed:* "a 20-block-wide waterfall needs far more flow" (true, but unquantified), and
  the fall builds "the channel and sources above it" (without a pool, the fall doesn't spread).
- *Change:*
  - the waterfall builder gets a header pool and two modes (on a river, standalone);
  - the flow rule is S ≥ 0.025·W to stay wet and S ≈ 0.4·W to look like an official fall;
  - the width cap is 40% of the side;
  - the flow policy is decision D6;
  - in-game check F1 judges the thin-sheet visuals.
- *Applied:* yes. PLAN §9.2, §9.10, §18 F1 and §20; EDITOR §3 and §7.

**F3.3 Dam sites.** *Major.*
- *Evidence:* useful dam height is capped by pump reach. The Folktails WaterPump reaches 2 below
  its base, the LargeWaterPump 4, and the Iron Teeth DeepWaterPump 6 (water notes Q7). Hard needs
  reservoirs at least 3 deep because evaporation takes 1.6 over 30 days. Reservoir sizes follow
  PLAN §11.4. PLAN's 150–1,500-tile basin would cover 65% of a 48² map.
- *Change:*
  - a useful crest of 1–3 (4 at most);
  - a basin cap of 15% of the map;
  - a feasibility table by size;
  - the settings panel disables combinations above the 15% cap, which only affects custom sizes: Normal with Plenty needs a side of at least 51, Hard 52–89 depending on the reserve;
  - the reservoir never touches an edge.
- *Applied:* yes. PLAN §5.3, §9.1 and §9.10.

**F3.4 Gorge.** *Minor.*
- *Evidence:* EDITOR had a gorge set piece, while PLAN folded gorges into the dam site. Beavers
  cannot climb walls, and water 3 or more levels below the rims gives them no moisture (F1.2).
- *Change:* PLAN §9.9 Gorge:
  - 3–9 wide;
  - walls from 2 levels up to 16 minus the bed level;
  - a stair notch with a slope chain when the gorge is on the colony's route;
  - no roofs.
- *Applied:* yes.

**F3.5 Downstream capacity.** *Minor.*
- *Evidence:* friction is negligible (Δh ≈ 0.0015·F per tile, water notes Q2). A channel draining
  to an edge holds about 0.3·S/w of water.
- *Change:* banks 1 level high hold up to S ≈ 3·w, for example 10 blocks/s in a 3-wide channel.
  Builders check this instead of "keeping downstream channels able to carry it".
- *Applied:* yes. PLAN §9.2; EDITOR §3.

---

## 4. Claude integration

**F4.1 An artifact cannot call external APIs. Claude comes through `sample`, with its own
limits.** *Critical.*
- *Evidence:*
  - `fetch`, XHR and WebSocket reach only the page's own origin (code.claude.com/docs/en/artifacts,
    "Page constraints").
  - The runtime types for `sample`:
    - input is a string or a list of turns, 64 KiB at most;
    - there is no system prompt the page controls;
    - the page chooses `modelTier` quick / default / complex, not a model id;
    - page functions can be offered as tools, with an input schema of at most 4 KB and results
      of at most 32 KB;
    - "a handful of rounds" per call;
    - `sample.json` parses without checking a schema;
    - the viewer pays, consent is asked on the first call, and floods are rate-limited.
  - Help center: usage counts against each user's own plan, and users sign in.
- *EDITOR assumed:* a request/response protocol "that works with plain text completions", and an
  unspecified page-to-Claude call.
- *Change:*
  - queries become tools in both routes, with a text protocol only as a fallback;
  - the map summary is feature-level (about 16 KB at most);
  - the loop is capped at 3 rounds and about 10 tool calls;
  - every tool checks its own inputs.
- *Applied:* yes. EDITOR §7.

**F4.2 `.timber` cannot be downloaded from an artifact.** *Major.*
- *Evidence:*
  - "The artifact viewer on claude.ai blocks any download the page starts itself", including
    `data:` and `blob:` links (code.claude.com/docs/en/artifacts).
  - The `downloads` capability allows only gif, png, jpg, jpeg, webp, mp4, webm, txt, json, md,
    docx, pptx, epub, csv, ttf, html, svg, pdf, xlsx and zip (`downloads.d.ts`).
  - The game only lists files whose extension is exactly `.timber` (FORMAT.md §1).
- *Change:* the artifact edition saves a `.zip` holding the `.timber`, plus an extract step in the
  install help (decision D10). Project files are `.json`.
- *Applied:* yes. EDITOR §7; PLAN §19.9 and §20; ROADMAP M12 and M13.

**F4.3 Artifact packaging, storage and sharing constraints.** *Major.*
- *Evidence:*
  - **Packaging:**
    - a single self-contained page, "16 MiB or smaller";
    - scripts only from cdnjs, unpkg, jsDelivr (selected paths), and the Tailwind and jQuery CDNs;
    - "Relative links do not resolve";
    - served from a sandboxed `*.claudeusercontent.com` origin (code.claude.com/docs/en/artifacts).
  - **Storage:**
    - 20 MB per artifact, text only, on paid plans (support article 9487310);
    - declaring `db` makes an artifact "organization-internal" (`db.d.ts`), as do `assets` and
      `mcp`.
  - **Sharing:**
    - everyone needs a Claude account, except for legacy published artifacts;
    - artifacts that use Claude "can't use 'Anyone with the link'" on Team and Enterprise
      (support article 9547008);
    - the Claude Code docs say a public link is the only way to share on Pro and Max, and needs
      no sign-in. The two sources disagree.
  - **Workers:** not documented. One unofficial source observed `script-src ... blob:` in the
    CSP, which suggests blob workers work (unverified).
- *Change:*
  - one codebase and two builds through platform adapters;
  - the artifact build is one inlined HTML file with workers as blobs;
  - it declares only `sample` and `downloads`;
  - it autosaves to browser storage, never `db`;
  - an M3 spike proves workers, file open, downloads and sharing on Kyler's plan.
- *Applied:* yes. EDITOR §7 and §8; PLAN §2, §19.9; ROADMAP M3 and M12.

**F4.4 Bring-your-own-key works, with mitigations.** *Major.*
- *Evidence:*
  - The TypeScript SDK disables browsers by default and enables them with
    `dangerouslyAllowBrowser: true`.
  - Its docs warn that credentials in a browser can be extracted and misused. They call it
    low-risk only for internal tools and short-lived development keys (TypeScript SDK page,
    "Browser usage").
  - Anthropic's SDK repository adds the `anthropic-dangerous-direct-browser-access` header when
    that option is set (PR #504).
  - Structured outputs are generally available: `output_config.format` with `json_schema`, and
    `strict: true` for tools. They do not support numeric or string length constraints, recursive
    schemas, or complex array constraints.
  - The models overview names `claude-opus-5-5` as the default starting point and
    `claude-sonnet-5` as faster and cheaper.
- *Change:*
  - the key stays in memory by default, with an opt-in "remember";
  - a strict CSP;
  - advise an expiring key;
  - strict tools, with the bounds kept in the app;
  - a configurable model;
  - a prompt-cached prefix.
- *Applied:* yes. EDITOR §7.

**F4.5 Which route to build first.** *Major.*
- *Evidence:* the Claude request suite must run automatically. Only the Messages API can do that
  from Node, and the artifact route has open questions (F4.3).
- *Change:* build the API adapter first; ship bring-your-own-key as an advanced option; ship the
  artifact edition after the spike. The site works fully without Claude. Decision D8.
- *Applied:* yes. EDITOR §7, §9 and §10; PLAN §20; ROADMAP M3 and M12.

**F4.6 Size words need grounded ranges.** *Minor.*
- *Evidence:* "giant" was defined only as "relative to the map's size and limits". The limits
  are now measured (section 3).
- *Change:* size words resolve against the builders' `limits`; a giant waterfall is 30–40% of the
  side, capped. The request suite expects the reduction to 19 on 48².
- *Applied:* yes. EDITOR §7 and §9.

---

## 5. Feasibility

**F5.1 The water settle budget was not achievable from a cold start.** *Major.*
- *Evidence:* appendix B. A Node 24 port of the rules, cold from empty, took 11.3 s over the full
  grid at 256² (3,000 ticks), and 6.5 s with a naive active set. At 128² (1,500 ticks) it took
  1.0 s and 0.7 s. PLAN §10 budgeted ≤ 1.5 s at 256² and ≤ 0.4 s at 128². EDITOR budgeted "water
  preview under 2 s".
- *Change:*
  - canonical-settle targets of ≤ 3 s at 256² and ≤ 0.6 s at 128², using an exact active list
    and a deterministic priority-flood and river pre-fill computed from the document alone;
  - an M2 benchmark gate, with K = 1 at 256² if needed;
  - the editor re-settles from its previous state, with ≤ 2 s for a local edit.
- *Applied:* yes. PLAN §10 and §17; EDITOR §6 and §9; ROADMAP M2 and M8.

**F5.2 The active set must be exact.** *Major.*
- *Evidence:* appendix B. An active set computed once per tick, instead of every substep, changed
  the settled volume by 5% (1,669 against 1,765). The file's water feeds tree placement, so the
  error would change the map.
- *Change:* wet cells plus their neighbours, recomputed every substep.
- *Applied:* yes. PLAN §10.

**F5.3 Warm-started previews are not reproducible.** *Major.*
- *Evidence:* steady states can depend on history. Thin sheets at the 0.1 spill threshold stay
  wet or dry depending on how they were reached (water notes Q2, the spill threshold).
- *Change:* the canonical settle writes every file; previews may warm-start.
- *Applied:* yes. PLAN §2.1 and §19.7; EDITOR §6.

**F5.4 How closely the preview can match the game.** *Major.*
- *Evidence:*
  - On heightfield terrain the port matches the game's own save within 0.001 depth, with
    identical wet and moist tiles, and matches Diorama and Waterfalls exactly (REPORT §3).
  - Under roofs, the overlap drops to 0.25–0.7 locally: Cliffside has 24 roofed wet cells, Canyon
    180, Terraces 473 (water notes Q2).
  - The comparison save was made with mods active (format notes §6.4).
- *Change:*
  - the editor states the fidelity: exact on heightfields, which covers every generated map;
  - it keeps the file's water under roofs, marked approximate;
  - the preview shows the steady state of temperate weather, with drought analytic;
  - stacked-column water is scheduled "Later";
  - in-game checks F4 and B.
- *Applied:* yes. PLAN §10 and §18; EDITOR §6.

**F5.5 3D editing of 256² maps in the browser is feasible.** *Minor.*
- *Evidence:*
  - 65,536 columns; about 40k greedy quads (PLAN §2).
  - Voxel geometry is needed only where columns have several solid runs: 1% of official
    columns, up to 58% on one workshop map (calibration.json).
  - A 16 ms per-frame budget for committing a large feature edit (rasterize and remesh 10–20
    chunks) is not realistic.
- *Change:* budgets split into:
  - 16 ms for feedback, with proxies while dragging;
  - ≤ 100 ms to commit;
  - ≤ 5 ms per chunk remesh;
  - a voxel mesher for multi-run columns only.
- *Applied:* yes. EDITOR §8 and §9.

**F5.6 No threads on GitHub Pages.** *Minor.*
- *Evidence:* `SharedArrayBuffer` needs COOP/COEP response headers, which GitHub Pages cannot
  set.
- *Change:* parallelism comes only from independent workers (for example, one per candidate).
- *Applied:* yes. PLAN §2.

---

## 6. Gaps

**F6.1 The editor had no tools for the map objects every official map uses.** *Major.*
- *Evidence:* all 19 official maps have 1–4 UndergroundRuins (mine sites). Relics are on 9 maps,
  geothermal fields on 7, Thorns on 8, NaturalDam on 6 and Blockage on 15 (REPORT §3; the 1.0
  entities table). EDITOR only had forests, berries and ruin fields, plus advanced single-entity
  placement.
- *Change:* map-object features:
  - mine sites, relics and geothermal fields, with their distance rules;
  - thorn belts, weirs (NaturalDam lines) and plugs (Blockage lines);
  - bridges (NaturalOverhang pairs) and unstable cores, preserved and advanced-only.
- *Applied:* yes. PLAN §19.2; EDITOR §3 and §4; ROADMAP M7.

**F6.2 PLAN's set pieces were missing from the editor.** *Major.*
- *Evidence:* PLAN §9.3–9.8 (terraced cliffs, obstacle with payoff, badwater basin, plugged
  spillway, second district) had no editor counterpart.
- *Change:* all of them are set-piece kinds with shared builders.
- *Applied:* yes. PLAN §19.2 and §19.3; EDITOR §3.

**F6.3 Plants that die in a drought were not checked.** *Minor.*
- *Evidence:* sources stop in drought. Blueberries die after 9 × U(0.9, 1.1) days on dry soil,
  and Normal droughts last up to 9 days (water notes Q4 and Q7). `plants.survive` checks only the
  steady state.
- *Change:* a new `plants.drought` check for the berries near the start. It is advisory: it
  never blocks, in any profile.
- *Applied:* yes. PLAN §11.5; EDITOR §6.

**F6.4 Terrain support after sculpting next to preserved overhangs.** *Minor.*
- *Evidence:* the game deletes voxels more than 3 tiles sideways from support, and the objects
  on them (blocks notes §5).
- *Change:* terrain support joins the instant checks. Multi-run columns are locked to the sculpt
  tools.
- *Applied:* yes. EDITOR §3 and §6.

**F6.5 Faction-only plants in imported maps.** *Minor.*
- *Evidence:* Maple, ChestnutTree, Mangrove, Dandelion and CoffeeBush fail to load for the other
  faction and in the in-game editor (blocks notes §2).
- *Change:* they are flagged at import, with a one-click removal.
- *Applied:* yes. PLAN §19.6.

**F6.6 Imported maps have no thresholds and no features.** *Minor.*
- *Change:* `meta.designedFor` (default Normal) sets the thresholds. "Make editable" detection of
  rivers, lakes and plateaus is planned for Later.
- *Applied:* yes. PLAN §11 and §19.5; EDITOR §3 and §10; ROADMAP Later.

**F6.7 Sharing edited maps.** *Minor.*
- *Evidence:* PLAN's share link carries settings only, and nothing covered edited maps.
- *Change:* spec-only links, and project files for edited maps (decision D7).
- *Applied:* yes. PLAN §14.5 and §20.

**F6.8 New in-game checks were needed.** *Minor.*
- *Change:* PLAN §18 F:
  - F1, waterfall visibility at two flows;
  - F2, sealed river mouths;
  - F3, halved pre-1.0 imports;
  - F4, roofed water in edited imports.
- *Applied:* yes.

---

## 7. Sequencing

**F7.1 PLAN's milestones built the generator without the feature model.** *Critical.*
- *Evidence:* PLAN milestones 1–6 never mentioned parametric features. EDITOR E1 would have
  added them to a finished generator.
- *Change:* ROADMAP M1 builds the shared core and a feature-first River Valley, and downloads a
  project file. The generator is editor-ready from its first milestone.
- *Applied:* yes. ROADMAP; PLAN §16.

**F7.2 Foundations were planned twice.** *Major.*
- *Evidence:* the 3D renderer was in PLAN milestone 6 and EDITOR E2; set pieces in PLAN
  milestone 3 and EDITOR E3; validation in PLAN milestones 1–2 and EDITOR E5.
- *Change:* each is built once: 3D in M4, set pieces in M5, validation in M1–M2, and the editor
  preview in M8.
- *Applied:* yes. ROADMAP.

**F7.3 Automatic slopes came after the first in-game check of edited maps.** *Major.*
- *Evidence:* E3's in-game check exported edited maps before E4 added automatic slopes (F1.5).
- *Change:* slopes move into M5.
- *Applied:* yes. ROADMAP M5; EDITOR §10.

**F7.4 The delivery spike must come early.** *Minor.*
- *Evidence:* artifact constraints shape the build: a single file, inlined workers, bundled data
  (F4.3).
- *Change:* M1 keeps the artifact build possible, and the spike runs in M3.
- *Applied:* yes. ROADMAP M1 and M3.

---

## Evidence appendix

### A. Waterfall limits (prototype water port, `prototype/watersim.py`)

Synthetic layout:
- a plateau (banks at 16) with a channel of width W and bed 15, fed by inland springs;
- the channel's last row is the lip;
- an 8-row plunge pool (bed 0) below, then an outflow channel to the south edge;
- a 1,500-tick warm-up, then `settle()`.

"Fall width" counts lip tiles with water on both sides and a drop of at least 1.5.

| Map (x × y) | W | S (blocks/s) | Layout | Fall width | Max drop | Lip depth |
|---|---|---|---|---|---|---|
| 48 × 64 | 3 | 0.5 | channel | 3 | 15.00 | 0.049 |
| 48 × 64 | 3 | 1.5 | channel | 3 | 15.00 | 0.149 |
| 48 × 64 | 20 | 0.5 | channel | 3 | 15.00 | 0.043 (wet tiles) |
| 48 × 64 | 20 | 2.0 | channel | 18 | 14.90 | 0.032 |
| 48 × 64 | 20 | 6.0 | channel | 20 | 14.68 | 0.089 |
| 64 × 64 | 40 | 2.0 | channel | 16 | 14.91 | 0.035 |
| 64 × 64 | 40 | 6.0 | channel | 40 | 14.64 | 0.044 |
| 48 × 64 | 20 | 2.0 | bed 21, banks 22 | 18 | 20.90 | 0.032 |
| 48 × 64 | 20 | 2.0 | bed 14, pool 2 | 18 | 11.90 | 0.032 |
| 48 × 64 | 20 | 0.5 | header pool one level below the lip | **20** | 14.98 | 0.006 |
| 256 × 48 | 200 | 2.0 | header pool | **200** | 14.90 | 0.002 |

In the first version of this experiment, sources sat on the north-edge row of the channel. At
2 blocks/s, the non-source edge tiles drained every drop and the map held **0** wet tiles. That
run is the evidence for sealed mouths (F1.3).

### B. Water rules in JavaScript (Node 24, Float64Array, cold start from empty)

Terrain: `prototype/terrain.py` River Valley, with sources per the calibrated flow (7 at 128², 14
at 256²).

| Map | Ticks | Full grid | Active set per tick | Volume (full / active) |
|---|---|---|---|---|
| 128² | 1,500 | 984 ms | 708 ms | 558.5 / 553.2 |
| 256² | 3,000 | 11,289 ms | 6,506 ms | 1,765.2 / 1,669.4 |

### C. Official waterfalls (saved water, lip tiles with a drop of at least 1.5)

Largest connected lip, in tiles, then the median lip depth, measured on wet tiles (depth ≥ 0.1):

| Map | Largest lip | Median lip depth |
|---|---|---|
| Beaverome | 8 | 0.14 |
| Canyon | 6 (10 counting sheets under 0.1 deep) | 0.14 |
| Cliffside | 4 | 0.21 |
| Craters | 2 (15 counting sheets under 0.1 deep) | 0.18 |
| Diorama | 3 | 0.29 |
| HelixMountain | 4 | 0.19 |
| Hollows | 5 | 0.27 |
| Lakes | 3 | 0.15 |
| Meander | 6 | 0.24 |
| MountainRange | 6 | 0.14 |
| Nomads | 4 | 0.15 |
| Plains | 2 | 0.12 |
| Pressure | 22 | 1.00 |
| Terraces | 5 | 0.15 |
| ThousandIslands | 5 | 0.14 |
| Waterfalls | 6 | 0.16 |

Oasis, Pillars and Spillage have no falls.

## Sources

Official Anthropic pages, fetched on 2026-09-23:
- [What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them): artifacts made before 16 Sep 2026 are legacy; Claude-powered artifacts bill each user's plan and need sign-in; storage is 20 MB, text only, on paid plans; connectors.
- [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts): sharing by plan; everyone needs a Claude account (except legacy published artifacts); artifacts that use Claude can't use "Anyone with the link" on Team and Enterprise.
- [Claude Code: share session output as artifacts](https://code.claude.com/docs/en/artifacts): page constraints (16 MiB, the CDN allowlist, own-origin fetch only, no page-started downloads, relative links, the `claudeusercontent.com` sandbox); sharing; connectors never public.
- [TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript): browser use via `dangerouslyAllowBrowser`, and its risk note.
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): `output_config.format`, `strict: true`, the unsupported schema features, grammar caching.
- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview): model ids, prices, and the recommended default.
- [anthropic-sdk-typescript PR #504](https://github.com/anthropics/anthropic-sdk-typescript/pull/504): the `anthropic-dangerous-direct-browser-access` header (Anthropic's own repository).
- Reported by the research subagent from official pages and not re-fetched in this session: [Authentication](https://platform.claude.com/docs/en/manage-claude/authentication) (keys with expiry), [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) (a minimum of 512 tokens on Opus 5.5), and [Build artifacts](https://claude.com/blog/build-artifacts) (storage and MCP added in October 2025).

Artifact runtime type definitions, contract 0.2.54, shipped with Claude Code 2.1.280 (not a
public page): `sample.d.ts` (64 KiB input, tools, model tiers, no system prompt, the viewer
pays), `downloads.d.ts` (the extension allowlist), `db.d.ts` (organization-internal, 256 KiB
documents).

Unofficial, labelled as such: an observed artifact CSP that includes `blob:` in `script-src`
(pluto.security, 6 Aug 2026). It is used only to justify the spike, not as a fact.

## Files changed on this branch

- `AUDIT.md` (new): this report.
- `ROADMAP.md` (new): the merged milestone order.
- `PLAN.md`:
  - new §19 Shared foundations, new §20 Editor decisions, and "Changes from audit";
  - changes to §1–5, §7, §9–11 and §14–18.
- `EDITOR_PLAN.md`: every section updated, §11 replaced by a pointer table, and "Changes from
  audit".
- `README.md`: the file table lists the new documents.

The prototype, FORMAT.md and the investigation are unchanged.
