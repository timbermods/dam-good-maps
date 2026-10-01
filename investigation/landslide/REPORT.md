# Landslide findings

The idea works: an irregular crown hollow, a broken body and a lobed toe read as a moving hillside.
Auto reads slope, water and the map's fixed rock. Rockfall is compact, Slump retains tilted benches,
and Flow spreads farther. Original Canyon and Highlands land supplies all three 128² cases.
The Flow example impounds a reservoir with a flowing saddle; water is never injected.

A drawn band sets its extent; Size controls clicks. The route can bend inside the band but never
climbs. Whole cut blocks fund the pile. When downhill capacity runs out, excess stays on the hill;
no mass is silently discarded and off-map loss is zero. Trees, objects and sources travel upright.
Fast/Watch, More/Floor, F/braces, Try another, Esc and one-step undo work. Playback leaves the camera still.

Checks: **1,920 random gestures**, clicks and strokes, across 320 settings per case:
all four style choices, Power 0/1/35/70/100, Size Auto/4/22/64 and Floor 1/3/12/22.
No conservation, Floor, bounds, downhill, determinism or replay failures. 9,600 snapshot undo checks,
7,680 arrival checks, 43 carried starts. All 12 case/style water checks pass the product's
canonical settle. Every measured dammed basin has a wet spill; no lake failures. The Flow example
holds **1,418 basin tiles at level 3.036**, with **+0.018 level** drift over another 1,024 ticks.
Newly diverted river water and retained pockets below their sill are not counted as dammed lakes.

Worst headless planning: **408.9 ms**. Browser worst: **2.050 seconds**, including maximum-Power,
Size-64 clicks on every case and a 118-tile stroke. TypeScript, build and real Edge controls pass;
no browser errors. Land-sweep runtime: 11.6 minutes. See checks/core.json and checks/browser.json.
Six downscaled before/after captures and a 480px river-damming GIF total about 1 MB.

Falls short: this renderer uses primitive meshes rather than the product's shaders. Large rigid
objects move by their anchor; adoption must use the existing integrity and document start-carry hooks.
The water evidence samples case/style combinations, not every possible seed. An arbitrary band may
stop early when no connected downhill route exists. The steepest click direction is sampled over six tiles.

Only investigation/landslide changes, based on feature/forces **9e14f189**. The milestone session takes
only this investigation commit. README.md gives every run and regeneration command; dependencies,
builds, bundled checks and extra output stay ignored in `local/`. Sounds reuse the repository's CC0 bank.
