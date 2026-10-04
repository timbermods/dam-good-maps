# Shared-code findings, held separately

These observations concern machinery shared by themes. They are not adopted as shared fixes. The adoption patch confines behavior changes to River Valley; other themes, shared water simulation, screens and thresholds remain as dev has them.

1. **A lake transition can raise a running bed.** `profileOf` computes an in-lake sample with `min(run, outletBed)` but then assigns `run = outletBed` on leaving it. The shared implementation can therefore discard the lower incoming channel grade. The patch gives River Valley's incidental trunk hollows a descending grade; intentional plugged lakes are exempt. No general hydrology rule is changed for other themes.

2. **A drained lake mask can become a large spent shelf.** Later courses can open a lake whose earlier mask survives. `generate.ts`'s shared `lowerShelves` cuts large marked shelf components a level down; it assumes that the retained lake plan still describes standing water. In the rejected trunk-only trial at seed 24, a 3,137-tile planned lake had 3,114 tiles at or above their physical spill level after hydrology. After later preparation, 2,430 wet tiles stood at bed 3 with about 0.1 water, producing a new sheet. The final River Valley shaping reconciles large spent masks with physical closed cores before the shared land stage receives them. `lowerShelves` itself is unchanged.

3. **The existing sheet reading is not the visual sheet verdict.** `info.sheet` is a reading of planned lakes, and shared rejection is disabled. Seed 21's dev sheet reading is only 0.006 while its exported wet area is 5,013 tiles. Conversely a large contained lake may receive a sizable reading. The report's 6 -> 2 sheet count comes from the paired visual comparison, not from turning this reading into a gate. No shared screen or rejection flag is changed.

The trial exports and traces supporting these observations stay local under `investigation/river-valley-sheets/local/`. Rejected prototypes are not adoption proposals. Any shared follow-up should establish its own multi-theme evidence and should leave the concurrent badwater and naming work alone.

## Round-2 observations, not shared fixes

- `widenOutlets` protects square neighborhoods around non-sea river heads. Straight pool edges can therefore depend on that shared preparation as well as a planned lake. Seed 6's delivered fix selects an entering River Valley trunk instead of its former spring-only plan; the shared square protection and outlet widening remain unchanged.
- A planned readable-water/promise pass can retain a poor settled candidate: round 1's seed 12 passed the plan but failed settled readability and the advisory badwater target. The existing default distance is a target, not a hard universal guard. Its safer round-2 valley/start is achieved by River Valley's route qualification; no shared start or hazard rule is repaired.
- Natural ramps can shorten a drawn cliff after hydrology: seed 5's 88% span became 83% during `naturalRamps` in round 1. River Valley's full-scarp shaping now reduces its own ramp propensity; shared ramp construction and cliff checks are untouched.
