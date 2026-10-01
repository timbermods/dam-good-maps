# Terrain above terrain: the view

**Proposal:** keep the High look's own olive flagstones, mauve cracked earth, grass and navy water.
Extend them through the land: stone ceilings, light fading from entrances and skylights, a readable
ambient floor, and real stone caps at the selected level. Standard shares the geometry and lighting,
with its existing simpler materials. This reads as the same block-built world, including underneath.

The demo uses six-sided greedy chunks, per-run soil, a shared 3D light field for rock and water,
and atomic worker updates. It changes no product files. Base: High `84fe4d36`.

## Numbers

RTX 4080 SUPER, Chrome 154/D3D11, 1200×750, DPR 1. Performance investigation's unchanged
frame/hitch/Long Task harness; three 3.5-second steady samples per configuration.

| 256² scene | Median frame / approximate FPS | p99 range | Hitches |
|---|---:|---:|---:|
| Heightfield, Standard | 6.1 ms / 164 | 6.2 ms | 0 |
| Many caves, Standard | 6.1 ms / 164 | 6.2–6.3 ms | 0 |
| Heightfield, High | 6.1 ms / 164 | 6.2 ms | 1 × 12.2 ms |
| Many caves, High | 6.1 ms / 164 | 6.2–6.5 ms | 0 |

Erode, Block tunnel and Rift playback, **both looks**: p99 **6.2–6.3 ms**, **zero hitches or
long tasks**. Worker-to-display latency peaked at **74.2 ms**; mesh/texture assignment at **1.1 ms**
(GPU upload occurs during rendering). No visible pacing cost in these refresh-limited samples;
this does not establish GPU headroom or certify the complete editor. [Measured results](checks.json).

## What falls short

The fill light is an artistic readability floor, not bounced-light simulation. Stone silhouettes
remain square and the ceiling pattern can stretch at corners. Deep water stays very dark; T exposes
its bed. Objects, slopes, falls and moving-water simulation are outside this isolated view.
Erode water remains its demo approximation; Rift is still its actual heightfield operation.
The complete editor, quiet-machine qualification, laptop/Firefox and long-session gates remain unrun.

**Checks:** 24 independent mesher/cut cases, **248,374** unit faces exact; chunk-boundary invalidation
and skylight opening/closing match a full light rebuild. Browser: zero errors. Standalone build passes.

[Cave](captures/canyon-cave.jpg) · [Bridge](captures/roof-bridge.jpg) ·
[T6, including inside and slices](captures/t6-heights.jpg) · [Roofed water](captures/t3-cave-water.jpg) ·
[256² caves](captures/many-caves.jpg) · [Erode light GIF](captures/erode-light.gif) ·
[All captures](README.md) · [Adoption and regeneration](INTEGRATION.md).

Large fixtures, source snapshots and raw results stay in gitignored `local/`. All rendered assets
are original/MIT; the game's references are comparison only. Take only this investigation's commits.
