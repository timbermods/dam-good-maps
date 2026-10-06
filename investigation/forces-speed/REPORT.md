- 256² Highlands + Lake Basin, seed 3: Keep geometry, playback cloning, wasm metadata, and Glaciate's local water kernel dominate; A = invariants/playback, B = boundary/water reuse; adopt A first, B adds no established net gain.
- Carve: geometry/lookup hoists; metadata and frame buffers; Node A 870→688 ms, B 688→742 ms; Chromium A 950→655 ms, B 655→877 ms (mean of the two themes).
- Craterize: geometry hoists; metadata copies; Node A 919→704 ms, B 704→486 ms; Chromium A 693→374 ms, B 374→597 ms (mean of the two themes).
- Erupt: geometry hoists and old-water copy; metadata copies; Node A 1385→983 ms, B 983→826 ms; Chromium A 1132→612 ms, B 612→1026 ms (mean of the two themes).
- Quake: travel hoists and discarded object copies; metadata/frame buffers; Node A 1776→594 ms, B 594→856 ms; Chromium A 1171→597 ms, B 597→1006 ms (mean of the two themes).
- Glaciate: retreat frames reused; exact prefill reuse and local water kernel; Node A 3339→1140 ms, B 1140→1500 ms; Chromium A 1990→1108 ms, B 1108→1775 ms (mean of the two themes).
- Rift: discarded object copies and final-stage work; metadata/frame buffers; Node A 1846→460 ms, B 460→855 ms; Chromium A 971→593 ms, B 593→822 ms (mean of the two themes).
- Identity: after A and B, all 50 pins and 1,488 baseline playback frames/final maps/Keep records match; B also matches natively; 122 determinism cases × Node/Chromium have 0 mismatches, and all 24 measured 256² results match.

[Per-case readings, profiles, limits, and regeneration](MEASUREMENTS.md) · [Adoption instructions](INTEGRATION.md)
