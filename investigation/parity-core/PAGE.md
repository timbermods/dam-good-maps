# What the page needs

- **Shelf tiles:** Water Seep, Badwater Seep, Aquifer, Ancient Aquifer Drill, Badtide Drain,
  Unstable Core, Reserve Pile, Reserve Warehouse, Reserve Tank, Succulent and Mixed woods.
  Keep the existing trees, bushes, ruin and thorn tiles. Each new object needs an original model in
  both looks; the core patch adds no render assets. Rotation and the existing footprint ghost apply.
- **Fluid settings:** strength/sink with `maxStrength(template)` and `defaultOptions(template)`;
  timed emitters offer Starts at once or cycle plus countdown days. Aquifer has no start delay;
  it and its drill give no water at map start. Use the 1×3 drain footprint.
- **Core settings:** integer radius 0–5 (default 5), cycle from 1 (default 5), countdown days from 0
  (default 10.5). Show what it clears and offer **Show after it goes off** as a view toggle.
- **Reserve settings:** good from `goodsFor(template)` and whole stock 0 through capacity (160/200/300).
  **Scatter settings:** Size/area, Density 0.05–1, Age Grown/Mixed for trees, succulents and woods;
  a single click uses the existing single-object plan.

| Page action or question | Core call |
| --- | --- |
| Ghost and placement | `footprintCheck`, `planEntity`, then `MapSession.applyAll(plan.ops)` |
| Options read/change | `optionsOf`, `setOptionsOp`, then `MapSession.apply(op)` |
| Scatter ghost/placement | `planPaintObjects`; `MapSession.apply({op: "paintObjects", params})` |
| Move/remove | `planMoveEntity` and applyAll; `deleteEntities` through apply |
| Markers | `markerNotes(session.built.entities)` |
| Core cleared counts / after view | `blastInfo(session, id)` / `explosionAfter(session, id)` |
| Day-by-day source activation | `fluidModelAt(W, H, surface, objects, time)` |

Show the core's one-line refusal as returned. Drawing the after view must leave the session, history
and export unchanged; toggle off restores the current view. Show the roofed-water limitation when
`roofed` is nonzero. Worker adapters for these calls are page work; none are included here. Terrain
brushes, forces and checks must never invoke the player-placement path.
