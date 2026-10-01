# Round 2 adoption

The combined `../adoption.patch` targets `feature/forces`
**75cb5d4c4a168eb17113bd0dd19576bb43b3ffc9**, including Round 1 capacity, mesh reuse and water
allocation changes. It applies cleanly to that source snapshot. The branch itself retains its
Round 1 ancestry; no product checkout was rebased or edited. Apply only in the milestone session.

Replay requires adoption of `investigation/determinism`
**f306fd495c713e19278c507686102b2c603cdef8**. Tests compose its portable math with both variants;
they do not claim equality with older native-math runs. That patch is not duplicated here. Both
patches apply-check at this pin and touch disjoint product files. Apply the math dependency first,
then check this patch again against any later source drift. Do not stack overlapping performance
mesh/easing changes.

`GestureHistory` is the authoritative controller. It records normalized operations, resolved force
settings, world coordinates, protected area/cut, seed, source identity, Try another's original
input cursor, sequence/origin/label, document ID, epoch and replay version. Force input uses
**canonical water** and the recorded terrain/entities/rock/fallen prefix; a component SHA-256
rejects mismatched inputs. Wall time, planning calls and display stages are not replay inputs.
This is an explicit new-force policy: the current worker can start from live water. Adopt the
agreement before enabling gesture recording. Preserving arbitrary live-water starts instead
requires recording/replaying their deterministic water-advance program. Never silently assign
a canonical recipe to an old live-water result or claim those policies give the same result.
Select removal records its area/kinds and input hash, not computed entity IDs. Other normalized
core operations retain their intentional inputs. Areas are validated, never clipped.

Default hot budgets are 128 MiB of built-state payload, at most 16 recent steps, 32 MiB of force
results, and 32 MiB of derived path/distance fields. Snapshot accounting deduplicates shared buffers
and registers only the new state's graph. Gesture/log metadata is separate and grows with edit
count; payload caches do not. An oversized result/current map remains one necessary working value.
Never cap undo depth, quantize state or evict generation/journal data. Cold results and historical
full-precision water inputs use a disposable worker cache; disk bytes grow with the session.
Reopening uses a fresh cache and recomputes results. Storage/rebuild exceptions roll back edits.
Cold water restoration invalidates resource caches too; otherwise newer trees can leak into
redo even when all terrain/water/soil bytes match. Cached-state registration skips its graph
walk when the state and mutable field-cache revision have not changed.
Delete the cache on session disposal; clean abandoned names after a crash using active-session
ownership, never another tab's cache. Cache cleanup must never delete an authoritative project.

Format 4 stores the generation and journal. Versions 1–3 pass their original migrations/checks;
old literal operations become explicit `legacy` entries, paged losslessly, preserving numbering
and undo depth. Missing inputs are never guessed. Newly appended forces are gestures. Legacy-heavy
files can remain large: compatibility requires retaining their old literal inputs.
Persist camera bookmarks/current metadata separately from undo, and snapshot them before streaming.
Any kernel/input-policy change must bump replay version and retain its old engine or explicitly
refuse opening; never silently replay an old journal with new physics. The committed 85 KiB
format-4 fixture checks original raw fields and complete exported bytes; do not replace its oracle
to accept a physics change. Future engine registries belong to the milestone.
Save/open use bounded JSON pieces, streaming gzip with fixed timestamp, UTF-8 boundaries and
gzip CRC/length validation. The final model and an individual generation string remain in memory;
there is no whole-project JSON string or decompressed byte array. Format-4 gzip bytes are new;
equality oracles cover raw state and complete `.timber` bytes. The legacy streaming writer preserves
decoded JSON field/array order and number spelling.

Milestone wiring is required: these product files are proposals, not an enabled UI feature.

1. Create one controller and OPFS cache per worker/session. Route all accepted edits/grouped fixes
   and undo/redo through it; keep `session` read-only to callers. Resolve Auto/pins, paths and
   identities once at the host. Share the extracted pure worker helpers rather than keeping two
   diverging copies. Use the resolver/finalizer, including start repair and original-prefix
   replacement; do not append the UI preview's literal result.
2. Route autosave, Save project, project import and recovery through `save`/`open` and a
   backpressured file sink/source. For an explicit legacy-format export use `projectStreaming`,
   not `session.project()`. Write a temporary destination and publish after successful completion.
   Serialize worker commands; revision checks reject pending hashes superseded by a newer edit.
3. `investigation/performance` owns slicing, cancellation and progress for cold replay, canonical
   input preparation, graph collection, mesh/water setup and GPU upload. This execution prototype
   runs in a worker and does not establish a product UI frame-budget guarantee.

Cold opening currently calls the accepted-edit path for every prefix: `applyAll` rebuilds
terrain/resources, then registers a snapshot, even when the next gesture only needs the document
state. This deliberately proves the ordinary execution semantics, but repeats substantial work.
A next optimization is a replay-only path that defers safe ordinary-prefix builds until force,
Select, entity-validation and final-output barriers. Historical water/resource caches and grouped
validation make blind batching unsafe. Require equality against the frozen fixture and full traces;
no speedup is claimed or that optimization included in this patch.

Collaboration can reuse the versioned envelope, host-assigned identity/seed, input hash,
original-force cursor and grouped boundaries. Send only new gestures; derived arrays/cache files
never cross the protocol. Legacy literals are compatibility inputs, not edit messages. Add host
ordering, actor identity, base revision, conflict rules and acknowledged cancellation before network adoption.

Chromium and Firefox verify actual worker OPFS. This PC's Windows Playwright WebKit has no
`navigator.storage`; its small all-five-force oracle uses a labelled test-only RAM adapter.
That verifies replay arithmetic, not WebKit disk retention. Native Safari storage needs verification
before adoption; [WebKit documents OPFS in workers](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/).

## Regenerate

Reuse the repository's installed dependencies; install pinned Playwright with
`npm ci --prefix investigation/scaling` if necessary. Snapshots, builds, caches, saved projects,
raw traces, profiles and load logs stay in gitignored `investigation/scaling/local/`.

```powershell
node investigation/scaling/prepare.mjs
node --import tsx investigation/scaling/fixtures.ts
node investigation/scaling/round2/prepare.mjs
node investigation/scaling/round2/build.mjs
node investigation/scaling/round2/verify.mjs
node investigation/scaling/round2/contracts.mjs
node investigation/scaling/round2/rectangles.mjs
node investigation/scaling/round2/typecheck.mjs
node investigation/scaling/round2/patch.mjs
node --expose-gc investigation/scaling/round2/large-stream.mjs
node --expose-gc investigation/scaling/round2/cache-dense.mjs 256
node --expose-gc investigation/scaling/round2/cache-dense.mjs 512
$env:SCALING_R2_OUT='accepted'
node investigation/scaling/round2/batch.mjs
node investigation/scaling/round2/recent-batch.mjs accepted
$env:SCALING_R2_STEPS='512'
$env:SCALING_R2_OUT='policy-accepted'
node investigation/scaling/round2/batch.mjs after:256:64 after:256:256
$env:SCALING_R2_OUT='cold-fix'
node investigation/scaling/round2/batch.mjs after:512:64
$env:SCALING_R2_OUT='policy-fixed'
node investigation/scaling/round2/batch.mjs after:512:256
Remove-Item Env:SCALING_R2_STEPS
Remove-Item Env:SCALING_R2_OUT
node node_modules/vitest/vitest.mjs run --config investigation/scaling/round2/quick.config.mjs --project quick tests/contract/projects.test.ts tests/contract/document.test.ts tests/contract/ops.test.ts tests/contract/live-water.test.ts tests/contract/editor.test.ts
```

`batch.mjs` constructs one fresh 2,048-edit memory/correctness session per variant/size: Power-100
forces, brushes/sculpts, whole-map flatten, feature changes and entity properties. Construction times
are diagnostic, not published. It repeats a 32-step undo/redo window, save and fresh-cache reopening
three times. The policy matrix uses 512 edits. `load.ps1` records CPU, available RAM and process
memory alongside timings. GC checkpoints wait between graph inspection and collection. RSS peaks
include transient allocation and saving. Raw hashes include terrain, water/contamination, soil,
entities and features; contracts add rock/fallen state, failures, branching, Try another, legacy
migration, storage faults, superseded revisions, save isolation and corrupted streams.
`recent-batch.mjs` runs its own load sampler and verifies the final controller after fresh replay.
Primary profiles preceded the final input/failure guards, metadata snapshot and post-settle trim.
Those changes have separate contracts and a frozen raw/export oracle; successful arithmetic is
unchanged. The older browser profile's 0.33 MiB post-settle budget overshoot is fixed by the trim.

For cross-browser verification, generate a short session with `SCALING_R2_STEPS=180`,
`SCALING_R2_FORCE_EVERY=31`, `SCALING_REPEATS=1`, `SCALING_R2_OUT=cross`; run
`node --expose-gc investigation/scaling/round2/run-case.mjs after 128 1`, then
`node investigation/scaling/round2/browser-batch.mjs after-128-1-128` with `SCALING_R2_OUT=cross` still set.
Each engine repeats three times. Reset those variables afterward. The page heartbeat is a
prototype diagnostic, not product FPS. For the full 512² browser storage session:

```powershell
node --expose-gc investigation/scaling/round2/browser-long.mjs
$env:SCALING_R2_OUT='browser-source'
$env:SCALING_R2_BROWSER_OUT='browser-large'
$env:SCALING_R2_ENGINES='chromium,firefox'
$env:SCALING_R2_BROWSER_PARALLEL='1'
node investigation/scaling/round2/browser-batch.mjs long-512
Remove-Item Env:SCALING_R2_OUT,Env:SCALING_R2_BROWSER_OUT,Env:SCALING_R2_ENGINES,Env:SCALING_R2_BROWSER_PARALLEL
node investigation/scaling/round2/browser-memory.mjs
node investigation/scaling/round2/summarize.mjs
node investigation/scaling/round2/report.mjs
```

The browser capacity fixture has 2,048 brushes/sculpts/features/Select edits; all five forces are
covered separately by the three-engine oracle and the long core matrix. Chromium/Firefox each
repeat actual worker OPFS save and fresh-cache reopening three times. Engines may run concurrently,
and the sampler records their shared load. `summarize.mjs` regenerates compact evidence from accepted
folders only; superseded smoke/retention prototypes and failed parser probes are excluded.
Windows process attribution is captured before the last page closes. `browser-memory.mjs` reports
the third Firefox repeat's summed OS working-set/private-byte peak for those owned descendants:
a sampled lower bound, with page/worker sharing a process, not isolated JS heap or steady RAM.
Chromium headless processes were not in the original sampler's process-memory filter; no browser
memory value is inferred for it. Core GC checkpoints remain the steady-retention oracle.
