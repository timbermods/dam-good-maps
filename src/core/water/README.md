# Water sources in groups: wiring the rule in

`sourceGroups.ts` is the one placement rule for sources placed automatically (PLAN §20 D314; the numbers
are from `investigation/source-groups/REPORT.md`). It is pure and takes nothing from the callers, so each
branch takes the two files whole (`sourceGroups.ts`, this note) and its test (`tests/unit/sourceGroups.test.ts`).
Wiring it into a caller comes after, in that caller's branch.

## The call

```ts
const g = placeSourceGroup(
  { kind: "water" | "badwater", x, y, strength, seed, flow?: [dx, dy], count? },
  { W, H, heights, occupied?, objects?, depth?, outflow?, step? },
);
// g.sources: [{ x, y, z, strength, tiles }], entity coordinates (orientation Cw0; a badwater
// source's corner), strengths to a thousandth, summing to g.total
// g.refused: a plain reason when not even one source fits, else null
```

- `x, y` is the tile the group stands on: a clean source's own tile (always one of the row), or the
  **middle** of a badwater source's 3×3.
- `seed`: mix the caller's own identity in (a feature id, a force's origin), as `hash32(seed, id)`, so two
  groups on one map don't draw alike. The request's kind and tile are mixed in by the module.
- `flow` is the downstream direction. Leave it out and the module reads it from the map edge, then
  `outflow`, then the ground (5×5 downhill); with none of them (a still pool) the row takes whichever
  axis fits more sources.
- `occupied` must hold everything already placed, **but not the caller's own reservation for this
  source** (the build reserves its spring and mouth tiles before step 9: leave those out, or call the
  module where the reservation is made and reserve `groupTiles(g)` instead).
- Ids: one entity per source, from `groupIds(anchorId, request, g)`: the anchor (the source at `x, y`)
  keeps the caller's existing id, and the others' ids derive from it and their place along the row
  (their offset from the anchor, counted round the rule's count), never their tiles. A replay gives
  the same ids, and a group the build places again on ground an edit changed keeps them: a Quake
  Lift that raises one side of a river head's row moves a spring to the row's other end, and it
  keeps its id (a tile's id would be new, an object the player never placed, D368 (10)). A caller
  that stores its ids in its operation (Carve's row, Glaciate's springs) keeps the ones it stored.
- The fallback keeps the strength; `g.clamped` is true only where the fewer sources would pass the
  game's cap (8 a tile).

## The generator (M9b, in its single rules switch, D308)

Every generated map changes, so it goes in with the one switch and its one re-pin.

- **Inland springs** (`features/build.ts`, the springs map at the reservation step and step 9's
  "springs: a river's first channel tiles"): one call per river with a spring entry, at the spring's
  tile (`springTiles`' nearest tile to `entry.spring`), `strength: f.params.flow`, `flow` from the
  river's path at its start (its first two path points), in place of the per-tile loop and its
  `ceil(flow / 8)` tiles. A lake's spring (`lakeSpringTile`) the same, with `inflow.spring`. The
  sources' ids: `groupIds(entityId(f.id, "WaterSource", anchorTile), request, g)`, so the anchor keeps
  the id its one tile had, and the build derives the row again after every edit without new ids
  (the regression: `tests/contract/editsPlaceNothing.test.ts`, "a spring the build derives again").
- **Edge mouths** (step 9, "a source on every channel tile of its mouth"): a mouth must stay sealed
  tile for tile (PLAN §7.6), so either call at the mouth's middle tile with `count: tiles.length`
  (equal shares, as now), or narrow the channel at the edge to `wantedCount(request)` tiles so the row
  is the rule's. The second is the rule proper; M9b chooses with its rerun.
- **Badwater springs** (`resources/badwater.ts`, `badwaterSprings`): one call per chosen spring, at
  its square's middle (`s.x + 1, s.y + 1`), `strength: budget.strength`; a pair's partner joins the
  12-tile spacing (`used`) and `blocked`. D200's distance targets are measured to the anchor.
- Unchanged: a badwater river's mouth (the editor's badwater toggle, a player's choice), set pieces'
  own springs (a waterfall's, a badwater basin's: part of their design), aquifers.

## The Real places conversion (its rivers and the water floor's spring, D300)

`tools/places/convert.ts` on `feature/real-places-2`:

- **Heads** (`groupsOf`, "each head's spring"): one call per head at its tile, `strength` its share,
  `flow` the drainage direction at the head (the settle hasn't run yet); the group's sources replace
  the head's one tile, and `strengths()` takes the group's shares instead of dividing by `tiles.length`.
- **Entry rows** on the map edge are already rows across the flow; call at the crossing tile with
  `count: want` so the shares and fallback are the rule's, or leave them.
- **The water floor's spring** (D300): one call at the drain tile, the smallest strength that works;
  `g.total` is the strength the card note gives.
- **The badwater stage**: `kind: "badwater"` per spring, at its square's middle.

## The forces

On `feature/forces` (Carve, Unleash) and `feature/glaciate` (Glaciate):

- **Carve's source** (`forces/carve/run.ts`, the constructor's `waterSource` at `intent.origin`): one call
  with `strength: sourceStrength(power, width)`, `flow: [head.dx, head.dy]` (the carve's heading),
  the carve's seed; ground = the map before the first cut, `occupied` from its entities. The anchor
  keeps `this.sourceId`; the others get ids derived from it, and `added` lists them all. Each source's
  `z` follows the ground when the carve is kept (the bed is cut under the row).
- **Glaciate's meltwater** (`forces/glaciate/plan.ts`, `addSource` over the tarn and lake seeds in
  chunks of 8): one call per site with that site's strength, `flow` from the ground (or the glacier's
  direction), and the group's sources in place of the chunks.
- **Unleash** places no source today: the player's own source is the river's origin and stays single
  (a shelf source, D314). If Unleash should give its river a row at the head, that is Kyler's call;
  the module would be called at the source's tile with the source's strength and the breakout's
  direction as `flow`.
