# Measurements and interpretation

Base: `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`. Node v24.13.0; Chromium 154.0.8037.95; Windows 11, AMD Ryzen 7 9800X3D.

One CPU profile per force/theme/engine (24), then one unprofiled before/after reading per optimization group (A-after is B-before). No warmups, repeats, quiet-window selection, speed gates, other browser engines, or game probes. Readings are observations on a shared PC, not stable speed claims. Untouched planning/Keep paths also varied, so do not attribute every total-time drop to the patch.

These measure the worker request-to-final-land path used by the click: `forceStart`, every `forceAdvance(1)` response, and `forceStop`, as in `tools/bench-forces.ts`. Rendering, frame pacing, and autonomous preview-water ticks are excluded (Node and Chromium both set `autoWater=false`). Carve water setup and Keep's warm-water handoff/preview initialization are included. This is the force's CPU cost, not the visible animation duration. Each case opens the same saved project before measurement, and includes cold force-module compilation in the first case per engine. Generation, project opening, and post-Keep identity hashing are outside the reading.

Inputs: 256², Highlands/Lake Basin, generation seed 3; Carve Unleash/width 24/Power 100; Craterize Strike/Size 180/Power 100; Erupt Vent/max Size/heavy flows/Power 100; Quake Slide/Power 100; Glaciate Flow/max Size/Power 100; Rift Drop/Size 64/Power 100. Quake/Rift use the benchmark's long diagonal; the other gestures use its high dry tile or map centre. Force seeds are the product defaults; source UUIDs are fixed by the harness for byte comparison.

## Single readings (milliseconds)

Each stage cell is start / play (including its first planning/finalizing step) / Keep. Totals retain the original unrounded precision in [measurements.json](measurements.json).

| Engine | Theme | Force | Before A: stages; total | After A / before B: stages; total | After B: stages; total |
| --- | --- | --- | --- | --- | --- |
| node | highlands | carve | 275 / 103 / 477; **856** | 337 / 137 / 537; **1011** | 270 / 122 / 549; **941** |
| node | highlands | craterize | 137 / 33 / 385; **555** | 148 / 44 / 595; **787** | 88 / 28 / 289; **405** |
| node | highlands | erupt | 203 / 368 / 417; **988** | 275 / 396 / 422; **1092** | 130 / 187 / 219; **537** |
| node | highlands | quake | 170 / 420 / 347; **938** | 94 / 221 / 209; **525** | 91 / 252 / 282; **625** |
| node | highlands | glaciate | 1605 / 1028 / 774; **3407** | 702 / 186 / 237; **1124** | 909 / 295 / 347; **1551** |
| node | highlands | rift | 267 / 866 / 552; **1684** | 78 / 146 / 208; **433** | 90 / 245 / 334; **669** |
| node | lakeBasin | carve | 125 / 57 / 702; **885** | 83 / 9 / 274; **366** | 122 / 15 / 406; **543** |
| node | lakeBasin | craterize | 205 / 45 / 1031; **1282** | 145 / 48 / 428; **621** | 123 / 44 / 399; **566** |
| node | lakeBasin | erupt | 311 / 765 / 707; **1782** | 198 / 379 / 298; **875** | 218 / 524 / 374; **1116** |
| node | lakeBasin | quake | 454 / 921 / 1239; **2615** | 98 / 186 / 378; **663** | 154 / 340 / 594; **1088** |
| node | lakeBasin | glaciate | 1408 / 981 / 883; **3272** | 727 / 179 / 249; **1155** | 885 / 219 / 346; **1449** |
| node | lakeBasin | rift | 388 / 593 / 1027; **2008** | 85 / 156 / 247; **488** | 112 / 351 / 578; **1041** |
| chromium | highlands | carve | 408 / 169 / 625; **1202** | 337 / 116 / 499; **952** | 419 / 143 / 545; **1107** |
| chromium | highlands | craterize | 201 / 24 / 475; **700** | 135 / 15 / 249; **399** | 141 / 18 / 424; **583** |
| chromium | highlands | erupt | 290 / 368 / 420; **1077** | 175 / 176 / 201; **552** | 226 / 317 / 398; **941** |
| chromium | highlands | quake | 241 / 473 / 361; **1074** | 122 / 209 / 187; **519** | 186 / 374 / 314; **874** |
| chromium | highlands | glaciate | 1120 / 524 / 361; **2005** | 765 / 155 / 195; **1115** | 1080 / 288 / 345; **1712** |
| chromium | highlands | rift | 195 / 397 / 346; **938** | 113 / 148 / 183; **443** | 140 / 278 / 379; **798** |
| chromium | lakeBasin | carve | 190 / 26 / 481; **697** | 106 / 16 / 235; **357** | 203 / 15 / 430; **648** |
| chromium | lakeBasin | craterize | 211 / 59 / 416; **685** | 119 / 14 / 215; **348** | 149 / 19 / 442; **611** |
| chromium | lakeBasin | erupt | 301 / 460 / 426; **1186** | 182 / 275 / 215; **672** | 239 / 454 / 418; **1111** |
| chromium | lakeBasin | quake | 219 / 463 / 585; **1267** | 149 / 217 / 310; **676** | 171 / 344 / 624; **1138** |
| chromium | lakeBasin | glaciate | 1065 / 540 / 371; **1975** | 743 / 161 / 196; **1100** | 1142 / 303 / 392; **1837** |
| chromium | lakeBasin | rift | 198 / 422 / 384; **1003** | 168 / 245 / 331; **743** | 135 / 287 / 425; **847** |

## Where the CPU goes

Profiled wall times are separate from the comparison readings. Raw CPU profiles stay in `local/baseline/`. The compact leaf-hit tables below use each profile node's `hitCount`: some native/Wasm samples in `samples` are attributed to the last JavaScript frame and disagree with those counts, so those apparent percentages are not reliable. Named Rust substeps/portable arithmetic, geometry, JSON cloning, and metadata encoding are visible in the profiles; phase costs above remain the meaningful elapsed readings.

| Engine | Theme | Force | Most frequent named leaf hits (count) |
| --- | --- | --- | --- |
| node | highlands | carve | pathField (151), portable sqrt integer division (70), changedRect (28), portable::sqrt (25), forceFrame (25) |
| node | highlands | craterize | pathField (104), flowThrough (36), encode (23), set filename (22), contamination3dGame (17) |
| node | highlands | erupt | pathField (66), portable sqrt integer division (28), structuredClone (24), flowThrough (24), show (20) |
| node | highlands | quake | structuredClone (99), pathField (57), shift (27), encode (19), show (18) |
| node | highlands | glaciate | portable sqrt integer division (188), forces::water::Sim::substep (168), structuredClone (82), pathField (71), portable::sqrt (58) |
| node | highlands | rift | structuredClone (129), pathField (73), encode (27), spillLevels (18), flowThrough (17) |
| node | lakeBasin | carve | pathField (159), literalOf (103), portable sqrt integer division (62), flowThrough (29), encode (25) |
| node | lakeBasin | craterize | pathField (162), encode (65), portable::sqrt (34), encodeUtf8String (27), portable sqrt integer division (27) |
| node | lakeBasin | erupt | structuredClone (73), pathField (61), portable sqrt integer division (33), show (20), flowThrough (20) |
| node | lakeBasin | quake | structuredClone (225), encode (183), pathField (103), __name (38), shift (36) |
| node | lakeBasin | glaciate | forces::water::Sim::substep (222), structuredClone (114), portable sqrt integer division (108), pathField (44), portable::sqrt (36) |
| node | lakeBasin | rift | structuredClone (141), pathField (84), flowThrough (22), encode (19), spillLevels (16) |
| chromium | highlands | carve | pathField (104), encode (35), portable sqrt integer division (34), changedRect (25), forceFrame (18) |
| chromium | highlands | craterize | pathField (74), flowThrough (39), encode (37), str (14), spillLevels (13) |
| chromium | highlands | erupt | plainEntities (57), pathField (54), encode (31), portable sqrt integer division (26), structuredClone (18) |
| chromium | highlands | quake | pathField (68), plainEntities (60), encode (37), structuredClone (25), shift (18) |
| chromium | highlands | glaciate | portable sqrt integer division (185), plainEntities (177), forces::water::Sim::substep (143), pathField (66), portable::sqrt (52) |
| chromium | highlands | rift | plainEntities (78), pathField (67), encode (45), structuredClone (41), flowThrough (18) |
| chromium | lakeBasin | carve | pathField (87), encode (43), flowThrough (40), str (25), pop (16) |
| chromium | lakeBasin | craterize | pathField (91), encode (48), flowThrough (22), str (19), portable sqrt integer division (14) |
| chromium | lakeBasin | erupt | plainEntities (105), pathField (70), encode (43), portable sqrt integer division (42), flowThrough (24) |
| chromium | lakeBasin | quake | plainEntities (60), pathField (46), encode (35), structuredClone (20), cell (19) |
| chromium | lakeBasin | glaciate | forces::water::Sim::substep (176), portable sqrt integer division (115), plainEntities (100), pathField (46), portable::sqrt (41) |
| chromium | lakeBasin | rift | pathField (50), plainEntities (49), encode (31), structuredClone (25), flowThrough (20) |

Keep's first rebuild of a hydrated project builds river distance fields; A hoists segment coefficients without changing nearest-segment comparisons or floating-point expressions. Erupt/Quake/Rift discard object or water copies that playback immediately replaces. Quake's travel lengths are invariant and cached by plan identity, including repaint invalidation. Glaciate stages 32–49 repeat the same ground/object/water values, so A reuses stage 31's map while its cue continues advancing. Carve's source-object lookups retain first-match behavior.

B omits a duplicated plain entity payload only after an exact recursive representation check (including signed zero), and reads transient geometry in place while its Wasm job is alive. Returned persistent arrays still copy before freeing the job. The worker reuses its private height-comparison allocation while its outgoing height array remains independent. Glaciate's raw Rust map already contains the canonical prefill: it is reused only if the retained tarn and full floor/dam/emitter model remain identical after Keep/build touches; otherwise the original TypeScript prefill runs. Start and Keep do not rerun the force planner; repaint/Try another intentionally make new plans.

The forces-local water kernel specializes game/port and dam/no-dam branches once per run and reuses the wet-transition scratch vector. Numeric expressions, the two substeps per tick, source order, active-list ordering and reductions stay the same. The separate `rust/water` crate and `rust/forces/src/deposit.rs` are byte-for-byte unchanged.

## Identity and validation

A: 50 original force pins; 50 baseline/adopted studies including imported numeric wrappers, kept tiles, water, fallen trees, maturity and Deposit; 1,488 playback frames plus final maps and Keep records; 122 force/gesture/scheduling smoke cases, 280 checkpoints per engine in Node and Chromium, zero errors/mismatches. B: the same proof, plus all 50 packed outputs in native Rust matching Node-Wasm and the original pins. All 24 measured 256² result hashes, including full land/water/entity arrays and literal sculpt records, match the baseline in both engines. No pins were regenerated.

The source and compiled-Wasm guards pass. See `checks.json` for the final typecheck and targeted test results.

## Regenerate locally

Run from the dedicated investigation clone at the base commit, after `npm ci`:

```powershell
node investigation/forces-speed/setup.mjs
npx tsx investigation/forces-speed/run.ts --prepare
npx tsx investigation/forces-speed/run.ts --variant baseline --profile
npx tsx investigation/forces-speed/run.ts --variant before-a
node investigation/forces-speed/change-a.mjs
npx tsx investigation/forces-speed/pins.ts --adopted --out a-pins
npx tsx investigation/forces-speed/equivalence.ts --out a-equivalence
# Run the determinism command in INTEGRATION.md from local/adopted, out-dir ../a-determinism.
npx tsx investigation/forces-speed/run.ts --variant after-a --adopted
node investigation/forces-speed/change-b.mjs
npx tsx investigation/forces-speed/build-forces.ts
npx tsx investigation/forces-speed/pins.ts --adopted --native --out b-pins
npx tsx investigation/forces-speed/equivalence.ts --out b-equivalence
# Run the same determinism command, out-dir ../b-determinism.
npx tsx investigation/forces-speed/run.ts --variant after-b --adopted
npx tsx investigation/forces-speed/package.ts
```

Allow about 20–30 minutes on this shared PC for preparation, the profile/comparison passes, and checks; runtime varies with other sessions. The profiles, projects, bundles, complete determinism manifests, fixture outputs, compiled Wasm/native binaries and isolated adoption tree all stay under ignored `investigation/forces-speed/local/` (D195). The report, harnesses, small summaries and source adoption patch are the committed deliverables.
