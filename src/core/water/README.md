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
- Ids: one entity per source. Keep the caller's existing id for the anchor (the source at `x, y`) and
  derive the others from it and the tile, so a replay gives the same ids.
- The fallback keeps the strength; `g.clamped` is true only where the fewer sources would pass the
  game's cap (8 a tile).

## The generator (M9b, in its single rules switch, D308)

Every generated map changes, so it goes in with the one switch and its one re-pin.

- **Inland springs** (`features/build.ts`, the springs map at the reservation step and step 9's
  "springs: a river's first channel tiles"): one call per river with a spring entry, at the spring's
  tile (`springTiles`' nearest tile to `entry.spring`), `strength: f.params.flow`, `flow` from the
  river's path at its start (its first two path points), in place of the per-tile loop and its
  `ceil(flow / 8)` tiles. A lake's spring (`lakeSpringTile`) the same, with `inflow.spring`.
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

# The edge lip: a river that starts at the edge flows into the map (item 27)

`edgeLip.ts` holds the head of any river that starts at the map's edge (the forces-preview feedback's item
27, PLAN §20 D325). The game drains every edge tile but a source's own, so water from an edge row of sources
that reaches the edge tiles beside it pours off the map. The lip raises exactly those tiles a level above
the head's water, and the tiles just inside them a level lower, never a wall along the whole edge.

```ts
const r = edgeLip(heights, W, H, { row, surface, keep?, reach? });
// row: the sources' boundary tiles (y·W + x); rowTiles(edge, along, W, H) turns a row's positions
//   along the edge into tiles
// surface: the head's water (its bed plus depth, or the lake it backs into); the lip stands at
//   floor(surface) + 1, at least the bed plus two
// keep: tiles never raised (other rivers' mouths, a player's locked ground)
// r.raised: the tiles raised; r.open: edge tiles its water still reaches beyond `reach` (16)
```

- **The generator** (M9b): every edge river's mouth, before the course check (`gen/generate.ts`); the
  course check seals only the mouth's own tiles (`land/courses.ts` `sealedMouths`, the build's
  `mouthTilesOf`), and badwater ditches keep out of the lip's reach.
- **The forces** (batch 1): Carve's source row and Glaciate's meltwater, when their row stands on an edge,
  once the row is placed and before the water settles; `keep` holds the force's own channel if it runs
  along the edge.
- **Real places** (when it resumes, D319): each head the conversion puts on an edge.

# A basin's way out worn wider (`outletWear.ts`, PLAN §20 D350 (b))

`wearOutlet(h, W, H, depth, { seed, width, keep, basin, floor })` takes the water that doesn't settle
(`basin`, else the largest basin whose water stands over its spill level, `risenBasin`) and widens
the way its water leaves by, from the sill beside the basin to lower ground or the map edge and on
down: a channel widened on one bank (the side that takes the less ground away), its width changing
smoothly along the way (0.8–1.2 of `width`, never tile by tile), its banks stepping back up a level a tile, its bed a level under the basin past the shore so
the sill is short. Never within two tiles of the basin under its level, never on `keep`, never below
`floor`. The cut is one shape along that way (D360 (3)): no part of it narrower than three tiles
(`openSquare`: no arms or stubs where the path turns, no slivers), the largest piece of the worn
ground kept and the rest left as it was; `cutShape(cut, path, W, H, reach)` counts its pieces, stray
tiles, tiles off to the path's side and thin tiles, and a cut that isn't one clean piece is refused. It
returns the new ground, the tiles cut and the path, or null. The generator calls it on a shown land
whose water doesn't settle within the settle's 6 days (D358): on the basin over its level, then on
the water still rising (9, then 17 tiles, the first that settles, a cut of at most 200 tiles);
`tests/unit/outletWear.test.ts`.
