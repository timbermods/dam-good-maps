# Kyler's verdict on Naturalize's land effect (2026-10-02)

Recorded as PLAN §20 D399 (amends D387 (4), D368 (8)). Verbatim:

Naturalize, from Kyler. Thank you for the captures: they're exactly what I needed. Every row is wrong, in both looks. What it makes is single-tile speckle, which D387 (4) rules out: one-tile pits and bumps, notches in a grid, no downhill order, a hard seam where the stroke ends, and at the maximum the whole map turned to noise. The pits matter for play too: they hold water in the game and break up flat buildable land.

The cause, as I read it: stepTile in src/core/features/raster/brush.ts raises or lowers an edge tile on a 20% chance from an independent per-tile hash, and pulls tiles next to a drop of two or more levels down one at a time. Neither rule reaches beyond a tile's four neighbours, and nothing depends on Size, so nothing larger than a tile can form and contours can't stay coherent. Treat it as a new algorithm, not tuning. A direction worth trying (your judgment decides): weather a continuous height field inside the stroke, with spatially correlated noise whose wavelength follows Size for the edges' wander and a talus-style relaxation for the cliffs (cut at the top, deposit at the foot, roughly balanced), then snap back to levels in a way that leaves no one-tile features. The generator's own weather/erodeHard/snapLevels (src/core/land/) may be reusable; shared code beats a one-off.

The target (D368 (8), D387 (4)):
- Edges wander, they don't fray: a terrace's edge stays one continuous line that is no longer straight or grid-aligned, curving in and out by a few tiles. The curves' size follows Size; how far they wander follows Strength.
- Cliffs retreat into slopes with scree at their feet: a drop of three or more levels becomes a stepped slope, its top pulled back and the lost ground settled as an irregular apron at the bottom.
- The downhill order is kept: no new pits or sinks (nothing that would newly hold water), no lone bumps, and no neighbouring pair of tiles ever swaps which is higher.
- Flat tops stay flat: weathering works on edges; the middle of a terrace stays buildable.
- No seam: the effect fades out across the ring's outer part.
- Repeating settles: painting the same area again approaches a natural profile instead of adding texture. At Size 64, Strength 10 over the whole map, the result looks like a believable older version of the same map, every terrace still readable.
- Unchanged: the protections (the start's pad, the ground under sources and objects), slopes.connect, set pieces' protected tiles, exact replay.

Checks (cheap, kept as contract tests on many seeds and random strokes, not one-off reports): no changed tile ends higher than all four neighbours or lower than all four; no new closed depression (use the existing drainage logic); no neighbouring pair reverses order; the boundary creates no step that wasn't there; ten repeated strokes on one spot change less each time. Cut and fill balance is information only.

Replay: my saved projects must keep opening with their land as it was. Version the stroke (as `weathers` was) so strokes saved before this keep replaying exactly with the old rule.

Show it with the same capture tool (chore/naturalize-captures), with three fixes: no focus border, the maximum row's top-down framed on the map, not the sky, and a third column for River Valley 3 with the same seed generated at a lower Terracing, as a reference for what this project's own natural terraces look like. Same maps, same strokes, both looks. Ping me when it's ready; I'll judge from the sheets.
