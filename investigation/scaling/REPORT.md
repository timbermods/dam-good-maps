# 512-side scaling investigation

**Imported maps load; unrestricted editing, smooth input and long-session saving are not ready.**
Based on `feature/forces` ea3cc2ad; no product files changed. `adoption.patch` is a tested,
partial adoption proposal. The remaining work below is required by PLAN §20/D357 and PERFECT.

Native Edge 154, 1440×1000, Ryzen 9800X3D, RTX 4080 SUPER, 61.6 GiB usable RAM.
Every published timing repeats three times. Values are median/worst; CPU is whole-machine
median/worst percent alongside that measurement. Shared load varied substantially: these are
observations, not causal speed-up claims. Memory and limit probes are separate from timings.

| Map | Initial mesh ms, before → after | CPU %, before → after | Load main-thread task worst ms, before → after |
|---|---:|---:|---:|
| 128² | 76/81 → 63/70 | 100/100 → 88/100 | 1,243 → 1,253 |
| 256² | 163/214 → 92/100 | 98/100 → 76/77 | 348 → 205 |
| 512² | 283/319 → 246/253 | 100/100 → 99/100 | 515 → 1,467 |
| 128×512 | 122/126 → 96/114 | 98/98 → 94/100 | 244 → 242 |
| 512×256 | 157/170 → 170/171 | 98/99 → 100/100 | 311 → 468 |
| 64×512 | 77/103 → 97/104 | 83/89 → 99/100 | 220 → 224 |

Existing 32² chunks do not budget preparation/upload work. Orbit medians were 157–165 FPS
before and 162–165 after on this GPU. At 512², 339 GL draw calls and 1,145,793 triangles
include shadow passes; geometry buffers occupy 3.2 MiB. Initial meshes, lighting, object work
and incremental water updates still cause stalls. Move pure preparation to workers and upload
dirty chunks within a frame budget, with cancellation and immediate input feedback. Preserve
exact final mesh bytes and picking; coarser LOD needs a separate quality decision.

Legacy limits reject large operations: coordinates/runs 255, tile index 65,535, payload 65,536,
quarter-tile brush coordinate 1,023 and radius 128. The patch admits 512-side operations while
retaining actual map-bound checks and height/pressure limits. Capacity contracts pass **8/24 →
24/24**, including actual forward effects and byte-identical undo. Baseline rejected actions
are labelled `no-history-change`, never counted as fast edits. Power-100 click and stroke modes,
whole-area Select, brush, undo and redo are recorded individually in [timings.csv](timings.csv).
The candidate's 512² maximum-brush live resettle takes **15.9/17.2 s**, CPU **100/100%**;
the baseline rejects that brush. Input-to-preview paint and completed action time are separate.

The allocation patch retains equal-length mesh/GPU buffers and directly fills water blend
arrays. On the supported 256² brush, mesh work is **379/388 → 305/326 ms** (CPU
**95/98 → 84/95%**); recorded `dropMesh` calls fall **2,892 → 224**, with 983 reuse calls.
This helps existing maps, without changing geometry bytes.

| Map | Unseen fully-wet easing buffers MiB, before → after | Final-frame enqueue ms, before → after |
|---|---:|---:|
| 128² | 4 → 0 | 68/73 → .028/.037 |
| 256² | 16 → 0 | 371/656 → .024/.084 |
| 512² | 64 → 0 | 2,589/2,741 → .027/.032 |
| 128×512 | 16 → 0 | 292/321 → .024/.035 |
| 512×256 | 32 → 0 | 855/1,272 → .027/.066 |
| 64×512 | 8 → 0 | 178/398 → .021/.032 |

CPU is 100/100% throughout that controlled microbenchmark. Lazy frames move work to display;
displaying all 16 still allocates all 16. Materializing them takes 246/354 ms at 256² and
1,906/1,917 ms at 512². Budget blend preparation too. Canonical water state retains about
137 bytes/tile (8.6 MiB at 256²; 34.3 MiB at 512²); long-axis propagation matters as well as area.

**History is the serious failure.** Eight cached snapshots plateau, but literal tile/height
arrays in operations keep growing. A synthetic, valid dense-result history at 256² grows
16 → 421 MiB heap across 256 edits, both variants; its project is 29,087,207 bytes, byte-identical.
At 512² the candidate grows 42 → 1,715 MiB and project saving fails at edit 256 with
`RangeError: Invalid string length` in `encodeProject`'s `JSON.stringify`. This is a headless
writer stress case, not 256 simulated UI forces. Edge independently rejects strings above
536,870,888 characters. Losslessly pack cold tile/height vectors (5 versus approximately
16 payload bytes/tile), compress/share snapshots and stream deterministic JSON/gzip. These
are proposals, not measured fixes. Keep unlimited replay and complete exported bytes.

Normal fixture save/open/reopen succeeds at every size: 512² Timber **2,654/2,860 →
2,860/2,927 ms**, CPU **50/74 → 53/87%**; project **341/356 → 326/342 ms**, CPU
**64/74 → 48/58%**. Files remain 696,211 and 685,856 bytes. No GPU limit or OOM was observed
in the ordinary matrix; maximum texture/renderbuffer side is 16,384. This is not a cross-browser
certification. Headless generation remains limited to 256; larger rejection is recorded.

[measurements.json](measurements.json), [memory.csv](memory.csv) and [rendering.csv](rendering.csv)
contain every size's page/worker peaks and steady retention, OS working sets, history checkpoints,
settle/save sizes, frame intervals and load. Sampled peaks are lower bounds. Verification found
no mesh-byte differences or export/reopen hash differences; 2,000 blend comparisons, capacity
contracts, compiler checks and 982 quick tests passed (13 skipped). See
[INTEGRATION.md](INTEGRATION.md) for adoption gates and regeneration; bulk evidence stays ignored.
