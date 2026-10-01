# 512-side scaling investigation

## Round 1 — historical measurements

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

## Round 2 — history and saving

New force/Select history stores gestures and seeds, with disposable worker OPFS results/water.
**Payload memory is bounded; journal metadata and disk grow with edit count.** The 2,048-edit core
sessions include brushes, whole-map sculpts, features, entity properties and all five Power-100
forces (16 total). Every forward state, cold round trip and fresh-cache export matches bytewise.
Both variants use the same portable math and canonical force-input water; baseline includes Round 1.
This fixes derived payload retention, not a fixed total-memory bound for unlimited gestures.

Times: **median/worst**, with whole-machine **CPU median/worst** alongside, three repetitions.
Steady memory: Node GC heap + ArrayBuffer MiB, not browser-page RAM.

| Case | Steady MiB | Project KiB | Recent undo / redo ms (CPU) | Save ms (CPU) | Reopen s (CPU) |
|---|---:|---:|---|---|---|
| 256² before | 57 + 49 | 441 | 449.6/452.5 (100/100%) / 0.09/0.10 (100/100%) | 347.4/356.7 (100/100%) | 1.08/1.22 (100/100%) |
| 256² after | 122 + 87 | 244 | 0.35/0.45 (74/74%) / 0.12/0.13 (74/74%) | 198.6/216.3 (98/98%) | 434.67/589.40 (100/100%) |
| 512² before | 112 + 192 | 925 | 930.9/945.6 (99/100%) / 0.10/0.26 (99/100%) | 451.0/513.7 (38/44%) | 1.37/1.55 (48.5/56%) |
| 512² after | 181 + 108 | 718 | 0.31/0.54 (49/49%) / 0.11/0.21 (49/49%) | 510.4/525.6 (95/96%) | 1580.99/1863.68 (98/100%) |

The mixed 256² trace uses more steady RAM: bounded caches buy recent undo latency. Dense literal
retention is tested separately below; these scopes must not be compared as total-editor memory.

Choose 128 MiB/16-step snapshots, 32 MiB results and 32 MiB geometry caches: 64 MiB can retain
only the current 512² state. At 512 edits, 64/128/256 MiB retained 1/4/10 states, with
113/169/282 MiB heap. Recent undo helps ordinary 256² maps too.
Cold undo and recomputation remain expensive; [timings](round2/timings.csv) include depth 32,
and [evidence](round2/measurements.json) includes cache-policy comparisons and peak RSS.
Cold opening rebuilds terrain/resources at every prefix; validated replay batching is follow-up work.
The cold 32nd redo at 512² takes 1.49/1.56 s (CPU 95/100%); recent-step caching is not deep-history speed.

Dense-cache stress (1,024 results, **cache only**, not UI forces): heap plateaus at 63/60 MiB
for 256²/512², with exact cold readback. Streaming saves/reads 553,770,010 JSON bytes above the
old string limit. Versions 1–3 preserve literal history; their large files do not become gestures
retroactively. Actual Chromium/Firefox OPFS passes 2,048-edit 512² save/reopen tests. Three-engine
five-force replay passes; native Safari storage remains a gate because Windows WebKit lacks OPFS.
The third Firefox storage repeat reaches a sampled OS working-set lower bound of 1.34 GiB,
summed across owned browser processes (page/worker shared); this is not isolated JS heap or steady RAM.
Cold redo also requires invalidating resource caches when restoring historical water.

Reuse the versioned gesture/seed/identity/input-hash envelope for collaboration. Canonical input
water requires an explicit agreement; old live-water inputs are never guessed. Feed cold replay,
input preparation and cache-accounting cost into investigation/performance for progress,
cancellation and scheduling. [Integration and regeneration](round2/INTEGRATION.md).

## Round 3 — stored state and checkpoints

Format 5 stores the exact current terrain/water/objects and execution caches, plus gestures and
shared compressed checkpoints. Opening calls no generation, replay or settle; the first edit
uses the stored build. Streaming reads/writes use bounded records and 32 KiB writes. Formats 1–4
still open; their first migration retains the earlier cost. Round 1 patches remain included.

Three repetitions, **median/worst seconds (whole-machine CPU median/worst %)**. Core timings
include disk; “editable” adds the actual first brush build to opening, excluding UI/mesh upload.

| Size | Round 2 open | Round 3 open | Editable | Cold undo, 31 steps | Save |
|---|---|---|---|---|---|
| 256² | 434.67/589.40 (100/100) | 0.75/0.75 (52/57) | 1.09/1.16 (52/57) | 8.60/8.63 (42/67) | 0.45/0.47 (49/59) |
| 512² | 1580.99/1863.68 (98/100) | 2.41/2.44 (38/52) | 4.00/4.06 (39/52) | 31.58/32.11 (39/60) | 1.12/1.13 (41/56) |

| Browser / storage | 256² editable s (CPU) | 512² editable s (CPU) |
|---|---|---|
| Chromium / OPFS | 1.00/1.05 (29/33) | 2.82/2.85 (18.5/22) |
| Firefox / OPFS | 1.05/1.10 (25/29) | 3.07/3.13 (24/37) |
| WebKit / host disk IPC | 1.85/1.86 (30/32) | 4.81/6.38 (25/41) |

WebKit's tested deep undo is 10.94/14.08 s (CPU 20/41%) at 256² and 20.77/30.02 s (22/39%)
at 512². These are varied-depth observations, not a universal latency bound. Its IPC cost is
separate from native Safari; all engine details are in the linked evidence.

Recent undo/redo remain below 0.25 ms in these repeats. Choose checkpoints every **32 steps**:
the measured 8/32/128 pilot and cap tradeoff are in [integration](round3/INTEGRATION.md).
Both full sessions retain 65 checkpoints, at most 31 ordinary replay steps. On overflow spacing
doubles; undo depth is preserved. Historical payload is capped at 128 MiB, recent states at
128 MiB/16 steps, results/fields at 32 MiB each. Cold undo still needs progress/cancellation.

| 2,048 mixed edits | Literal baseline MiB | Round 2 gesture MiB | Round 3 MiB | Checkpoints MiB |
|---|---:|---:|---:|---:|
| 256² | 0.43 | 0.24 | 29.89 | 28.96 |
| 512² | 0.90 | 0.70 | 104.27 | 102.64 |

The literal baseline includes Round 1's allocation patch and the same portable/canonical forces.
Files grow substantially to buy reopening and historical access. This mixed workload differs
from Round 1's **dense** 256-edit stress (421 MiB heap/29 MB file at 256²; 512² string crash).
At edits 512→2,048, GC heap/buffers are 121+115→161+105 MiB (256²), 188+97→223+89 (512²).
Decoded histories stay on disk; dropping the final controller returns both to about 10+0.2 MiB.
Journal/current force-program metadata and disposable disk indexes still grow: the checkpoint
cap is not a constant total-file or unlimited-session memory guarantee. Owned cache compaction
belongs in adoption.

Every forward state/export matches Round 2. Chromium, Firefox and WebKit verify all **2,049
positions** per size through descending checkpoints and every cold-seek prefix, then final redo.
Separate tests cover saved-past redo, all five new finalizer-input hashes, canonical background
water boundaries, alias/code-unit preservation, legacy golden and damaged files. Windows WebKit
uses verified host disk IPC; native Safari storage remains a gate. [Measurements and load](round3/measurements.json),
[individual timings](round3/timings.csv) and [regeneration](round3/INTEGRATION.md) preserve scope.

[The canonical force/water recipe](round3/REPLAY.md) supplies collaboration's gesture/seed/hash
envelope and compatible joining snapshot. Feed graph collection, codec/hash work, replay and
water/mesh preparation to `investigation/performance` for scheduling; startup can hydrate this
stored build directly. Stress page-timer gaps reach 8.1 s in Chromium and 23.2 s in the
WebKit adapter; Firefox reaches 33 ms. Cause needs its main-thread/IPC/GC profiling gate;
these core timings establish no UI smoothness claim. No product files were changed.
