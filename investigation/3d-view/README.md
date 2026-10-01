# 3D view proposal

[Short report](REPORT.md) · [Adoption / regeneration](INTEGRATION.md) · [Asset provenance](ATTRIBUTION.md)

Run `npm ci`, `npm run prepare:sources`, `npm run fixtures`, then `npm run dev` from here.
The demo offers both looks, orbit/inside views, integer level cuts, and replay of terrain edits.
T toggles clear water. It is separate from the product editor.

Each sheet: **High above, Standard below**. For each look, outside / detail / inside occupy
one row, then three slice levels the next. Rift's inside view is on its floor, since it has no roof.

| Case | Captures |
|---|---|
| T1 support: ledges, roofs, bridge, undercuts | [Sheet](captures/t1-support.jpg) |
| T2 walking: low tunnels | [Sheet](captures/t2-walking.jpg) |
| T3 stacked cave water | [Sheet](captures/t3-cave-water.jpg) |
| T4 soil and roofed stream | [Sheet](captures/t4-soil.jpg) |
| T5 roofs over object-clearance cases (terrain only) | [Sheet](captures/t5-plants.jpg) |
| T6 full 256² landscape | [Sheet](captures/t6-heights.jpg) |
| Erode crater lip | [Sheet](captures/crater-lip.jpg) |
| Erode canyon cave | [Sheet](captures/canyon-cave.jpg) · [Light changing](captures/erode-light.gif) |
| Erode tall arch | [Sheet](captures/tall-arch.jpg) |
| Erode flooded shore | [Sheet](captures/tall-shore.jpg) |
| Erode skylight | [Sheet](captures/roof-skylight.jpg) |
| Erode natural bridge | [Sheet](captures/roof-bridge.jpg) |
| Block-tool tunnel | [Sheet](captures/block-tunnel.jpg) |
| Rift | [Sheet](captures/rift.jpg) |
| 256² connected cave stress map | [Sheet](captures/many-caves.jpg) |

[Raw summary](checks.json) · [Geometry checks](geometry-checks.json).
The matched heightfield fixture is for measurement, not an additional proposal case.
