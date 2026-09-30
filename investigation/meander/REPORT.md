# Meander findings

**The idea works.** Curvature widens existing bends with a downstream lag. Outside banks erode;
the same blocks build inside bars and flatter valley land. Bluffs contain the swing. A continuous
thalweg keeps the source-to-outlet route open; sediment seals an actual abandoned bend. Eight
conserved age increments show the migration, followed by a cutoff when the land permits one.

Click / river-width drag band, Power / click Size, Auto Bends, shared Floor, Fast / Watch,
Try another, upright riders, source identity/strength, carried start, Esc and one-step undo work.
Nothing changes ahead of its age increment; water stays unchanged until final land, then settles.
Only investigation/meander changes, based on feature/forces **9e14f189**.

**Checks:** 486 random clicks/stretches across three 128² cases and 81 settings combinations each:
all Bends choices, Power 0/45/100, Size Auto/4/64, Floor 1/6/22. Zero bounds, Floor, material,
determinism or literal-replay failures. 2,916 undo snapshots; 1,944 arrival snapshots.
All 486 water settles passed the shared stopping test, at most 960 ticks; 40 random cutoffs.
Worst headless plan **361.8 ms**; sweep **257.62 s**. TypeScript and production build pass.

Browser pointer/control checks pass, including mid-force undo and stale replies, with no errors.
Worst captured Fast land **2.014 s**; largest full-river gesture **2.010 s**, including **420.6 ms**
of worker planning, at maximum Power. Watch is fourfold; the camera stays still.

Captured variant, seed 4:

| Case | Changed tiles | Eroded = deposited blocks | Water ticks | Oxbow |
| --- | ---: | ---: | ---: | ---: |
| Young River Valley | 656 | 495 | 448 | — |
| Between the bluffs | 1,209 | 1,272 | 512 | — |
| Long river | 1,610 | 1,514 | 960 | 32 tiles |

All three retain a wet connection from their original source to the original outlet reach.
The oxbow keeps **21.55 water blocks** from the river at closure. No source is added. With no
inflow, it evaporates in normal weather and drought; the shared 30-day drought calculation leaves
this example dry. Rainy-season sources alone cannot refill a sealed lake: a flood or visible inflow
must reconnect it. Adoption stores its actual water with the existing RetainedWater mechanism.

**Falls short:** selection traces the longest clean main stem; tributaries and contaminated rivers
need adoption work. The primitive renderer omits product shaders and the full object integrity pass.
The small start adapter must become the existing session carry hook. Water uses the shared solver
and real stopping test, but this demo does not prove canonical export / in-game parity. Earth is
whole-level terrain; narrow banks can step and the thalweg repair can look sharp.

The specimens are real generator maps translated up three levels, preserving existing rivers,
source strengths and water depths. This gives Floor 1 room above level-zero beds. Six downscaled
JPEGs and the short cutoff GIF total under 1 MB. README gives all regeneration commands; bulk
results and temporary runners stay ignored in local/.
