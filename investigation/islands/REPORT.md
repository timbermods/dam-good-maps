# Islands prototype

Islands read as islands when the sea is the continuous background, channels visibly separate land, and one larger island clearly owns the start. The prototype starts with a sea bed, then raises a warped main island and several smaller islands, with beach benches, shallow shelves, deeper pumpable bays and an offshore rock landmark. Source mouths are sealed and outlets sized before land appears. A separate coastal headland accommodates contained badwater.

**Seeds 1–20, default Normal Islands; unmodified M9b measures, baseline `6c29b7e`.** Before → after; land times are median/p90 wall seconds:

| Size | All three outcomes | Median main sea | First land, seconds |
|---|---:|---:|---:|
| 96² | 9/20 → 20/20 | 27.7% → 63.5% | 1.40/2.18 → 0.89/3.38 |
| 128² | 19/20 → 20/20 | 41.8% → 63.3% | 0.99/2.88 → 1.63/3.20 |
| 256² | 20/20 → 20/20 | 41.0% → 63.2% | 4.28/6.14 → 1.81/3.21 |

The existing scores already clear two-thirds at 128²/256² on this baseline, but accept seas below half the map. **Majority sea: 0/60 → 60/60.** Afterward the main sea covers 63.1–64.2%, total water 63.2–64.5%, leaving room below Kyler's 70% ceiling. No score threshold changed.

Blocking generator checks/absolutes failing: **0/20 before and 0/20 after at every size**. Afterward: at least two reachable mines, 270 starting logs and 48 nearby berries; every map passes start water/level land and contained-badwater checks. Each shows land once. All settle within 3.84 game days, without outlet-repair cuts or leaking source heads. Five repeated seeds match export hashes and stored-field project rebuilds. Additional weather checks on 43 exported maps find no contaminated starting water or farmland after drought/refill, just before badtide. Timberborn was not launched.

Timings share the machine: M9b's CPU-scaled 256² first-land median/p90 improves **3.25/5.72 → 1.10/1.70 s**. Settled-water speed still misses M9b's targets: 128² **8.99/12.20 s**, 256² **39.11/59.59 s** wall time. Preserve M9b's water-speed work and remeasure after integration. A storage advisory appears on 6/20 at 256² (none before); drought-plant and two scrap advisories also remain. At 96², mine room can require up to 14 unshown land attempts. The rim looks too much like a frame; interiors are too flat and compositions repeat. Custom controls, other difficulties and constrained regeneration retain the original generator.

[Before contact sheet](before.png) · [After contact sheet](after.png) · [Numbers](results.json) · [Adoption and regeneration](INTEGRATION.md). The measured shared lake/object fix is **fixed in feature/m9b**; it and the per-theme water cap are excluded from the adoption patch.
