# Scaling to 512 on a side

## Round 3

Use [Round 3 integration](round3/INTEGRATION.md) for the current combined patch: direct editable
opening from versioned current state, shared disk checkpoints, bounded recent caches and async
deep undo. [The force replay recipe](round3/REPLAY.md) is reusable by collaboration. The source and
determinism pins are unchanged. Round 1 and Round 2 notes below are historical.

## Round 2

The combined `adoption.patch` is virtually rebased onto `feature/forces` **75cb5d4c** and keeps
Round 1's capacity/allocation changes. The branch retains its inherited history; product files
remain untouched. [Round 2 integration](round2/INTEGRATION.md) describes the gesture controller,
versioned streaming codec, cache policies, legacy migration, collaboration reuse, required worker/UI
wiring, determinism dependency and regeneration commands. Adopt in the milestone session.

## Round 1 historical notes

Round 1 was based on `feature/forces` **ea3cc2ad**. Product files were read,
never edited. The PR's comparison into `dev` also contains its inherited `feature/forces`
history; the investigation's own commit changes only this directory. Adopt the patch in the
milestone session, rather than merging that inherited history as part of this investigation.

`adoption.patch` separates capacity corrections from presentation allocations:

* Terrain and water meshes retain their mesh and GPU buffers when every buffer length matches.
  A topology change disposes the complete old geometry; empty chunks are removed. Bounding
  spheres are recomputed. Vertex, normal, index and water-attribute bytes remain identical.
* `blendWater` allocates its four final typed arrays directly, keeping the original order and
  double arithmetic before Float32 conversion. A final water frame's 16 easing frames are
  computed only when shown or replayed. Skipping does not allocate unseen blends.
* Operation schemas allow 262,144 entries and tile indices through 262,143, the run-count
  validator permits 512² tiles, and the brush accepts the radius 256 already offered by the
  larger imported map's UI. Coordinates/runs extend through 511, quarter-tile dabs through 2047,
  and generated feature outlines retain the existing one-map-side allowance beyond the edge.
  Height and pressure limits stay at 255. Actual map-bound checks remain. Existing accepted operations retain
  the same arithmetic; previously rejected larger operations gain a committed result.

Apply once: the mesh reuse and lazy easing overlap `investigation/performance`'s proposal.
Do not stack both patches. Its frame scheduling, audio and shore-refresh changes are separate.
Run `git apply --check investigation/scaling/adoption.patch` against the pinned base, then apply
in the adopting session. Resolve later drift deliberately. Round 1 changed operation validation
capacities; its allocation proposal left simulation, document execution and save formats unchanged.
The initial allocation-only builds had byte-identical workers. The final capacity proposal changes
their validation tables, while all 48 simulation/force/format modules remain identical.
`test.mjs` checks 2,000 blend-buffer comparisons, including duplicate
tile entries, and skip/replay. The candidate browser runs compare live mesh buffers to freshly
computed meshes, outside timing intervals. `typecheck.mjs` checks the candidate through a compiler
overlay; it never writes product files.

`contracts.mjs` checks forward effects, undo/export equality, actual map bounds and unchanged
height/pressure limits. Separate fresh legacy-compatible edit histories produce identical
project and Timberborn SHA-256 hashes in both variants at every size. The patch updates the
existing project-boundary contract to D357's 512-side allowance. The broad quick suite passed
981 tests with one obsolete 256-boundary expectation; after updating that expectation, its
focused rerun passed. Total: 982 passing, 13 skipped. It was not a second full-suite run.

## Reproduce

Use a checkout of the pinned base with this directory added. From the repository root:

```powershell
npm ci
npm ci --prefix investigation/scaling
node investigation/scaling/prepare.mjs
node --import tsx investigation/scaling/fixtures.ts
node investigation/scaling/proposal.mjs
node investigation/scaling/build.mjs before
node investigation/scaling/build.mjs after
node investigation/scaling/test.mjs
node investigation/scaling/typecheck.mjs after
node investigation/scaling/contracts.mjs
node --expose-gc investigation/scaling/local/contracts-before.mjs before
node --expose-gc investigation/scaling/local/contracts-after.mjs after
$env:SCALING_TIMING_ONLY='1'
node investigation/scaling/batch.mjs 'before:editing:3' 'after:editing:3' 'before:brush:3' 'after:brush:3' 'before:saves:3' 'after:saves:3' 'before:memory:1' 'after:memory:1' 'before:forces:3' 'after:forces:3'
Remove-Item Env:SCALING_TIMING_ONLY
node investigation/scaling/build-headless.mjs before
node investigation/scaling/build-headless.mjs after
$env:SCALING_HEADLESS_PHASE='before'
node investigation/scaling/run-headless.mjs
$env:SCALING_HEADLESS_PHASE='after'
node investigation/scaling/run-headless.mjs
Remove-Item Env:SCALING_HEADLESS_PHASE
node investigation/scaling/run-water.mjs
node investigation/scaling/run-dense.mjs
node investigation/scaling/limits.mjs
node node_modules/vitest/vitest.mjs run --config investigation/scaling/quick.config.mjs --project quick
```

`prepare.mjs` reads the pinned `chore/probe-sizes` writer (SHA **a13a3573**) and writes
an import-path-only adapter to `local/probe/`. Existing files from `C:/dgm-probe/sizes` are copied
read-only; set `SCALING_PROBE_FOLDER` for another folder. `fixtures.ts` builds any missing maps,
including the additional 128² reference. It does not launch Timberborn or write its directories.
There is no generator-limit override: generation is tested headless only at 128² and 256²;
larger specs' rejection is recorded. The tested imported maps are the Sizes probe's exact files.

The browser is native Edge, headless, 1440×1000 at device scale 1. Its profile is isolated. Native
GPU identification and texture limits are recorded. `SCALING_SIZES` is a comma-separated list
(default all six shapes); `SCALING_REPEATS` defaults to 3. `SCALING_SMOKE=1` runs open and orbit only.
`SCALING_SUITE=editing` is the default. Run `saves` for worker save/project/reopen paths,
`brush` for a radius up to 128, dabs within the old coordinate limits, and undo/redo on all sizes; `memory` for
128-edit heap sampling, separately from frame/timing runs. `forces` covers Power-100 stroke
variants and whole-area Delete Everything with undo/redo. Carve/Crater/Erupt/Glaciate modes are
selected by the gesture itself; Quake has explicit mode buttons. Headless sessions use 1,024 edits
(`SCALING_STEPS` can override it). Reset these environment
variables afterward. Browser jobs are serial: the diagnostic CDP port is 9472. Never run two
copies at once. Only this runner's own browser is closed in cleanup.
`SCALING_TIMING_ONLY=1` separates editing timings from the 128-edit memory suite. Both variants'
long-session edits use the same coordinates within 255, so the baseline actually commits them.
The independent capacity contracts exercise the map's far corner and whole area.
`bench-water.ts` distinguishes probe water from a synthetic fully-wet worst case; neither changes a map.

`runs.json` lists the recorded folders. For a regeneration, update that list to the new folders
printed by the runner, then run `node investigation/scaling/summarize.mjs`. The recorded initial
baseline matrix is excluded from the final timing comparison: its disabled Undo/Redo waits were
harness errors, and some large-map long-session operations were rejected. All preflight smoke
runs are excluded too. The final matrix uses the corrected runner and counts committed edits.
Obsolete mode-selector runs and memory profiles whose diagnostic graph walks contaminated
heap samples are also excluded. The corrected profiler pauses sampling during graph walks
and collects garbage before steady checkpoints. Timing publications exclude the one-repeat
memory suite. `summarize.mjs` keeps the verbose aggregate in ignored `local/measurements-full.json`.
Run `node investigation/scaling/validate.mjs` after summarizing: it checks three repeats,
load samples, complete size/suite coverage, capacity results and byte/hash oracles, including
the intentional dense-history project-writer failure.

Every timing execution has a timestamp. `load.ps1` samples whole-machine CPU, available RAM,
top process CPU deltas and process memory continuously alongside each browser/headless run.
Retain busy runs and show their load; do not claim causal speed-ups from differently loaded runs.
The frame data comes from actual renders and rAF callbacks; it is not a screen-video capture.
Action wall time includes UI setup and the runner's final 100 ms observation window. The results
table also derives input-to-terrain-paint from browser event and renderer timestamps. An orbit
FPS is measured across its 3-second orbit, not inferred from a mesh timer.

Memory has explicit scopes: CDP V8 heap, backing storage, separate worker heaps, retained session
typed arrays (deduplicated by buffer), and GPU geometry-buffer bytes. String character counts
are diagnostic, not assumed to be resident bytes. `memory` samples heaps at roughly 100 ms;
reported peaks are observed lower bounds, with sample gaps retained. OS renderer working-set
high-water marks include workers and native memory; they cannot be split into per-worker RSS.
GC checkpoints measure steady retention. Timing runs are not heap-profiler runs. Saving benchmarks
exercise the same worker writer and opener as the UI; they exclude the folder picker and disk I/O.
Reopen equality compares exported bytes, including the edited headless projects.

`run-dense.mjs` repeats neither timings nor physics: each fresh Node process records a single
memory/breakage probe, appending valid all-map literal force results with alternating heights.
It isolates operation-history and project-writer scaling. At 256² the before/after project
hashes agree at 64, 128 and 256 edits. At 512² (capacity candidate), saving 256 entries fails
in JSON.stringify despite a successful 58,566,428-byte compressed project at 128 entries.
The browser's independently tested string boundary is 536,870,888 characters. Node's peak RSS
reaches roughly 2.7 GiB; this is not an observed browser OOM or a simulated user-session trace.
Do not publish the unrepeated diagnostic writer times as performance measurements.

All builds, raw JSON, bulk load logs, generated maps and temporary adapters stay under `local/`,
gitignored. The report and compact results are committed; regenerate bulk evidence with the commands
above. This PC's parallel investigations are left alone.

## Next adoption work

1. Move pure initial mesh/light preparation to a worker; upload chunk batches within a measured
   frame budget, nearest the camera first. Token each map version and cancel superseded work.
   Keep exact mesh bytes, LOD-independent picking and eventual exact full-resolution rendering.
   For incremental edits, keep the immediate brush preview local and budget the dirty chunk,
   lighting and object work; avoid blocking on a full-area result. Existing 32² chunks alone do
   not enforce a main-thread budget. Adaptive coarser geometry is a separate visual-quality
   decision; it cannot satisfy a literal geometry-byte oracle.
2. Give immutable history snapshots a memory budget. Share unchanged arrays/entities between
   snapshots or losslessly compress cold snapshots; evict derived caches, not operations or the
   base. Decompress/rebuild asynchronously with instant visible feedback. Never cap undo depth,
   round water state or change canonical settle ordering. Keep golden exports and project replay.
   There is already an eight-snapshot cache: typed-array retention plateaus after it fills;
   distinguish that plateau from growing operation/metadata retention and transient rebuilding.
   Dense operation vectors are the demonstrated growth source: pack tile indices in Uint32
   and heights in Uint8 internally (5 payload bytes/tile versus roughly 16 for two ordinary
   numeric arrays). Serialize the same ordered integer arrays; do not change public operation
   JSON. Compress cold vectors losslessly and page them back for replay without blocking input.
3. Keep water state/checks in workers, reuse per-job scratch after cancellation, and send only
   changed view chunks with backpressure. Retain full-precision canonical state. Yield between
   small tick batches; a worker's existing 10 ms budget also needs a bounded setup phase.
4. Offload normalization/JSON/gzip and use deterministic streaming serialization/compression
   to eliminate the demonstrated monolithic-string failure. The encoder must emit the same
   field/array order, integer and floating-point spelling, UTF-8 bytes and compression output;
   preserve gzip headers and compressor block decisions. A new ZIP implementation must preserve entry order, compression
   output and fixed DOS timestamps, not merely decoded content. Verify complete `.timber` and
   gzip bytes against the current writer on every fixture and edited/reopened project.

Round 1 proposed these larger changes; Round 2 implements the history/codec prototype above.
The custom-size milestone must separately update size validation, export messaging, camera fit,
shape-aware generation and minimum-size rules. Preserve D357 and `docs/PERFECT.md`; input is shown
within a frame even when total generation, settling or force computation grows with area.
