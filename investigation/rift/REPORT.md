# Rift findings

**The idea works:** a dropped block between two rough, approximately parallel faults reads
as a Rift. Hard upper beds leave ledges; soft ground breaks sheer. The floor keeps its original
relief, with small tilts and secondary throws. Ends narrow and fade. Trees, objects and sources
ride downward upright; a broken start moves to dry level ground.

Fast, fourfold Watch, band drawing, clicks, F/brace controls, Walls pins, Floor, Try another,
Esc and undo work. Sound uses the repository's CC0 cracks and pitched earth recordings.
Only investigation/rift changed, based on feature/forces **9e14f189**.

**Checks:** 1,440 random gestures across three cases and 240 settings combinations each,
including clicks, eight-point strokes, all wall choices, Power 0/1/35/70/100,
Size Auto/4/22/64 and Floor 1/3/12/22. No Floor, bounds, determinism or replay failures.
7,200 undo snapshots, 5,760 arrival snapshots; 57 carried starts. Worst headless planning:
**52.7 ms**. Sweep: 297.54 seconds. TypeScript and production build pass.

Headless seed 1, after 768 shared water ticks:

| Case | Changed tiles | Maximum drop | Newly wet dropped tiles |
| --- | ---: | ---: | ---: |
| Plateau | 1,020 | 10 | 167 |
| Raised river | 1,010 | 13 | 494 |
| Long curve | 2,534 | 12 | 1,709 |

Water continuation took 461–528 ms in Node; it never blocks final land. No water is invented.
The initial Canyon river sits at level 0, below Floor 1: banks cannot drop below its water.
That case correctly stays uncaptured. The visible river example instead crosses a raised Highlands river.

**Browser:** real pointer input and control checks pass, no runtime errors. Example land finishes
in 1.97–1.98 seconds. Worst measured gesture: **2.021 seconds**, a 20-point,
2,152.7-tile zigzag at Power 100 / Size 64 on 128²; planning included 223 ms of worker/yield time.
Captures use seed 2, a different natural result from the table.

**Falls short:** the primitive renderer omits the product's vegetation, terrain and water shaders.
Water runs a fixed preview interval, not a proof of canonical equilibrium or export parity.
Multi-tile objects ride their anchor vertically; product adoption needs its existing integrity pass.
The start adapter is deliberately small; adopt the existing document carry hook.
Rift only lowers land: it can capture or impound against existing sills, never manufacture a raised dam.

README.md gives every regeneration command. Dependencies, build output and bundled runners stay
ignored; extra frames and bulk results belong in local/. Committed captures total under 1 MB.
