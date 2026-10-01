# Round 3 adoption

Apply the combined `../adoption.patch` to the Round 2 source pin **75cb5d4c**, after determinism
**f306fd49**. It retains Round 1 capacity/mesh/water allocation changes. Only investigation files
are authored; the product remains read-only. `round2/proposed/` now contains the extended proposal.
Earlier rounds' measurements describe their earlier commits, not this current controller.

## Stored state and format

Format 5 has `DGM5` magic and length-framed, separately compressed records: a manifest/journal,
the exact current execution state, shared binary/object components, referenced force execution
data, historical checkpoints and an end marker. SHA-256 checks every frame and binds it to the
manifest; gzip protects component bytes. Unsupported replay/execution ABIs fail explicitly.
JSON records are at most 64 KiB, strings have bounded pieces, and file writes are at most 32 KiB.
Opening streams historical frames into the worker cache and decodes only the current state.
It calls neither generation, `buildMap`, gesture replay nor canonical settle. Versions 1–4 keep
their earlier migrations/replay path; a subsequent save adds stored state/checkpoints.

Use startup's exact-state principle, not import-as-new-base: terrain/water/objects, generation,
logical feature/sculpt/entity state, incremental terrain/resource/water caches, aliases and
`JsonFloat` spellings are preserved. Distance/noise memoization is disposable and recreated lazily.
Shared objects and equal binary bytes are stored once. A CRC indexes candidates; byte comparison
proves equality before deduplication. Aliases stay aliases; distinct equal arrays remain distinct.
Immutable build objects are weakly indexed; mutated memoized field maps are excluded.
Large strings use UTF-16 code units so lone surrogates survive, too. Distinct component instances
retain different identities even when their encoded bytes share a disk frame. Shared buffer views
keep their offsets, signed zero and NaN. Bump the execution ABI when kernel/cache semantics change;
never decode a checkpoint under a different generator or finalizer just because its schema parses.

The current core applies earlier force instructions again during feature/terrain builds.
Consequently exact execution checkpoints also reference compact disposable force data needed for
the first edit; omitting it would move cold replay from opening to that edit. The journal remains
gestures/seeds. Never send these result vectors as collaboration operation messages. Checkpoint
acceleration can be regenerated from the authoritative generation/journal with its original engine.

Saving snapshots current metadata, cursor, redo journal and execution state before its first sink
await. Saving an undone cursor preserves redo. A new edit truncates that abandoned future and its
checkpoints. Metadata/camera bookmarks are not undone. Preserve temporary-output publication and
backpressure; never replace a good file after a partial write or checksum failure.

## Cache and checkpoint policy

Start at 32 accepted steps. Retain at most 128 checkpoints within 128 MiB of compressed checkpoint
graphs and their shared state components. On overflow double spacing and keep aligned checkpoints,
zero and the current boundary. Never trim the gesture journal or undo depth. This bounds historical
checkpoint payload; an irreducible generation/current working state can exceed that budget.
Spacing can grow with an indefinitely long session, so report the actual spacing and replay count,
not a perpetual 31-step promise. Current state, gesture/instruction metadata and compatibility
literals are separate from this checkpoint cap; total files are not constant-sized for infinite
history. Large active force programs still carry the current core's historical dependencies.

The 64-edit 256² pilot chose 32: spacing 8/32/128 used 3.74/2.28/1.85 MiB and cold target 63
took 1.38/1.41, 4.63/4.66, 7.09/7.17 seconds (median/worst; CPU 25.5/40, 24/38, 22/37%).
Spacing 8 is quicker but exceeds the 128-checkpoint count over 2,048 edits and would coarsen to 32.
At spacing 32 both full sessions retain 65 checkpoints under the 128 MiB cap, with at most 31
replayed steps for ordinary cold seeks. Try another can also reconstruct its original input prefix.

Recent execution states share a 128 MiB / 16-step payload budget; oversized current state remains
one working value. Results and derived fields retain their 32 MiB budgets. Recent states replace
the separate native session snapshot pool, avoiding two independent 128 MiB caches. Cold map/state
components remain on disk; no historical checkpoint is pinned as decoded RAM.

Use `await history.seek(target)` for undo/redo outside the recent cache. A seek restores the nearest
checkpoint and replays only its suffix, validates force/Select input hashes, preserves global
sequence numbering and publishes the new state atomically. A superseding edit rejects that seek.
The optional progress callback is called after each replayed prefix, for verification/scheduling.
`undo()`/`redo()` are synchronous recent-cache conveniences; do not rely on the native fallback for
cold reopened history. Preserve the current visible map until the async seek succeeds.

The append-only cold cache and its indexes are disposable and can grow during a session even when
saved checkpoint retention is capped. Delete owned caches on close; compact/reclaim unreachable
pages in the milestone's verified storage adapter, without touching another tab or authoritative
project. A failed optional checkpoint write exposes `checkpointFailure`; surface that error and
retry before save. Accepted gestures are not lost. A save must succeed completely or leave the
old file intact. Do not silently promise the usual deep-undo bound after checkpoint storage fails.

## Milestone wiring

Route every accepted edit, water adoption, save/open and seek through one serialized worker
controller. Keep its session read-only externally. Refresh the visible boundary before force input
preparation; explicit saves preserve current deferred water. [REPLAY.md](REPLAY.md) defines the
canonical force input after reopening/rejoining and Try another's original-prefix semantics.
Use the controller's `adoptWater`/`settleCanonical` wrappers; its next ordinary edit refreshes that
boundary as well. Failed force/Select preparation restores the original execution state unless a
superseding command already succeeded. Replaying from a saved undone cursor starts at the suffix's
recorded sequence, then restores the document's monotonic next sequence on publication.
Canonical water adopted in the background is recorded as a small boundary marker, not a result
array or another undo step. Cold replay settles that exact prefix before continuing; otherwise a
settled boundary could disappear when its recent state was evicted. `adoptWater` accepts only the
core's completed canonical run for the matching model, as its existing contract specifies.
Never use this marker to describe an arbitrary live warm-start state. Branching trims future markers.
An existing arbitrary live-water start remains a legacy literal unless its actual deterministic
advance program was recorded; never guess a canonical seed recipe.

Startup can consume the restored Built state directly and defer worker replicas/mesh creation.
These timings end when core editing can run and its first edit produces a Built map. They do not
measure a finished UI/GPU upload. `investigation/performance` owns task slicing/cancellation and
progress around state graph collection, hashing/compression, historical replay, canonical water,
mesh preparation and upload. No scheduling change is smuggled into this patch.
Its profiling gate must also investigate the blank-page timer gaps: full-session Chromium repeats
reach 2.8–8.1 s and the 256² WebKit disk-adapter repeats 5.5–8.2 s, while Firefox reaches 33 ms.
The 512² WebKit adapter reaches 23.2 s.
This timer spans the entire stress run, including cold seeks/proof/storage cleanup; it is not a
main-thread long-task trace or an opening-only metric. Cause is unresolved. Worker arithmetic
placement alone does not establish a smooth editor; reproduce with real UI/visibility and a
main-thread/IPC/GC trace before claiming that gate. Per-case maxima are in measurements.json.

## Verification and regeneration

Bulk archives, caches, traces and load logs are ignored under `../local/round3/`. The 2,048-edit
fixtures come from the accepted Round 2 sessions: all five Power-100 forces, whole-map sculpts,
brushes, features and object properties. Keep their frozen raw/export oracle. Generate those
fixtures with `round3/prepare.mjs`: it archives **40e5d6ca** into ignored `local/round3/round2-source`,
retains its source/proposal arithmetic, and stops its source-only harness after writing the original
format-4 file/oracle, before the old multi-minute cold opening. Existing accepted fixtures are kept.
The source-only setup and syntax were checked; the full regeneration was not repeated when those
accepted files already existed. Reuse the pinned source snapshot and Sizes maps. Current output is
format 5; do not overwrite the accepted old oracle with the current proposal.

On a fresh checkout install the repository and `investigation/scaling` dependencies, then run
`node investigation/scaling/prepare.mjs` and `node --import tsx investigation/scaling/fixtures.ts`
from the Round 1 instructions to recreate the Sizes probe inputs. `SCALING_PROBE_FOLDER` selects
another read-only probe folder. Keep accepted format-4 fixtures and full generated archives ignored.

```powershell
node investigation/scaling/round2/prepare.mjs
node investigation/scaling/round3/prepare.mjs
node investigation/scaling/round2/build.mjs
node --expose-gc investigation/scaling/round3/contracts.mjs
node investigation/scaling/round2/typecheck.mjs
node investigation/scaling/round3/batch.mjs 256:32 512:32
node investigation/scaling/round3/measure.mjs policy
node investigation/scaling/round3/measure.mjs modern
node investigation/scaling/round3/measure.mjs actions
node investigation/scaling/round3/measure.mjs browser 256-32 512-32 256-modern 512-modern
$env:SCALING_R3_BROWSER_OUT = 'final-contracts'
$env:SCALING_R3_REPEATS = '1'
$env:SCALING_R3_CONTRACTS = '1'
node investigation/scaling/round3/measure.mjs browser 256-modern 512-modern
Remove-Item Env:SCALING_R3_BROWSER_OUT, Env:SCALING_R3_REPEATS, Env:SCALING_R3_CONTRACTS
$env:SCALING_R3_BROWSER_OUT = 'save-roundtrips'
$env:SCALING_R3_PROVE = '0'
$env:SCALING_R3_SAVE_ROUNDTRIP = '1'
node investigation/scaling/round3/measure.mjs browser 256-32 512-32
Remove-Item Env:SCALING_R3_BROWSER_OUT, Env:SCALING_R3_PROVE, Env:SCALING_R3_SAVE_ROUNDTRIP
node investigation/scaling/round3/summarize.mjs
node investigation/scaling/round2/patch.mjs
git diff --check
```

Each end action repeats three times, with contemporaneous `load.ps1` whole-machine CPU/available
memory samples (`batch.mjs`/`measure.mjs` own the monitor). Construction is a capacity trace, not
three independent session builds. Use `SCALING_R3_ENGINES` for a resumed browser subset; retain
completed files from the other engines. Browser
proof visits every checkpoint in descending order and verifies every intermediate cold-seek prefix
through the production seek path, once per interval; then verifies final redo. It proves all
2,049 positions without quadratic repeated replay. Separate varied-depth seeks measure latency.
Complete `.timber` bytes and raw terrain/water/soil/object/feature/lava/fallen state are compared.
Primary browser save timings use an encoding/counting sink. Separate `save-roundtrips` use real
OPFS (or the labelled WebKit disk adapter) for the streamed archive, reopen its chunks in a fresh
cache, and compare current state/export three times. Node final actions also reopen their saved
disk files; its report's save times include writes. No writer readback is inferred from byte counts.

For the separate passive timer diagnostic, set `SCALING_R3_TIMER_TRACE=1`,
`SCALING_R3_BROWSER_OUT=timer-diagnostic`, `SCALING_R3_ENGINES=chromium` and
`SCALING_R3_PROVE=0`, then run `measure.mjs browser 256-32 512-32` (three repetitions).
Clear those environment variables afterward. It records the largest 20 visible-page timer gaps
and observed main-thread long tasks with timestamps; diagnostic actions are separate from the
primary comparison. A missing long-task record cannot rule out browser IPC/GC or scheduling delays.
The repeated Chromium trace reproduces visible-page gaps during cold seeks, with no observed
main-thread long-task entries; timestamped records are retained separately. This narrows the
handoff, not the cause. The timing runs share this machine with other work (including overlapping
owned verification jobs); keep their measured CPU/available-memory context and make no controlled
speedup claim from the earlier, differently loaded round.

Chromium/Firefox use worker OPFS. This Windows WebKit runtime has no Storage API: its test uses a
bounded host-disk adapter through synchronous worker XHR, not an expanding RAM map. It proves the
same arithmetic/state/codec and real disk readback; its IPC timings are labelled separately.
Native Safari storage remains a milestone gate. The page timer observes worker isolation, not a
product smoothness guarantee. Small contracts also cover all depths, replacement, legacy golden,
corruption/truncation/trailing bytes, undone-cursor save, branching and metadata.

The full numerical sessions/proofs started before the final codec/hash bookkeeping guards. Final
actions repeat the final direct reader, first edit, cached pair, deep undo and writer; six extra
browser contracts exercise the final distinct-instance/UTF16 codec and saved-past redo paths at
both sizes, including canonical water adoption between spaced checkpoints with no recent cache.
New force fixtures check all five version-2 input hashes in all three engines; frozen
format-4 fixtures retain version-1 hashes. Successful map arithmetic is unchanged.
