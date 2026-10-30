# Round 4 adoption

Apply the combined `../adoption.patch` to the same pinned product base and determinism dependency in [Round 3](../round3/INTEGRATION.md). Only investigation files were authored. Round 1 capacity, mesh reuse and water allocation changes remain. This round replaces historical whole-map checkpoints with lossless per-transaction patches.

## Stored state and undo

Format 6 stores the current execution state, the complete gesture journal, and inverse/forward patches for the last 100 applied transactions. Opening hydrates that state directly; it does not replay a gesture, build terrain or settle water. Older gestures remain available for explicit replay, sharing and collaboration. They cannot be undone after reopening. In a live session, every committed patch remains in the worker's cold store, so older undo requires decompression, never force or map recomputation.

A patch records differing raw buffer byte spans and changed metadata, including entity order, object property order, aliases, array view offsets, rock/fallen inputs, canonical water and hidden inputs needed by the next edit. Forward changes accompany the inverse so redo never reruns an operation. Buffer application uses one working copy of a changed buffer; these working copies are not stored historical snapshots. Equal resource objects and reordered existing entities are represented by references/index ranges. Raw Float64 bytes preserve signed zero and NaN payloads.

The decoded patch cache holds at most 100 entries and 64 MiB of accounted payload, with one oversized working patch permitted. On opening, a 32 MiB compressed cache retains recent frames. The immediate inverse is decoded before publishing the document, using the common bounded gzip reader; the other patches remain lazy. Warming all 100 added several seconds in the diagnostic and did not fit the reopening budget. Dense cold steps can still cost more than sparse ones; published all-depth worst latency must remain visible. The derived force cache remains 32 MiB. All these limits exclude the current map, immutable generation, journal and native metadata. The complete gesture journal grows with the number and content of gestures; neither files nor total metadata have an infinite-session constant bound. The number of stored undo patches is bounded. Dense edits legitimately have larger patches.

Patch payloads use gzip-compressed, bounded `IPB1` binary records: UTF-16 code units and string IDs, raw byte runs, and contiguous copy ranges. The earlier JSON patch prototype remains readable. Each record is at most 64 KiB; archive writes are at most 32 KiB. Inflate limits and framing checks prevent silent truncation. No whole-project string is constructed. A native DecompressionStream experiment lost the Windows WebKit page twice; the same full proof passed with this common reader, so the native experiment is excluded.

A save at an undone cursor retains at most 100 applied patches plus up to 100 future redo patches; future gestures remain in the journal. Beyond that persisted redo range, explicit replay is required. Ordinary save-at-head retains exactly the last 100 steps. Branching removes future patches and gestures. Sequence numbers remain monotonic through undo/redo. Camera metadata stays current. Immutable cold keys pin the patch/blob versions through overlapping saves and later branches. Saves take a fixed cursor/current state/journal and emit bounded, checksummed binary frames; no whole-project string or inflater.

Formats 1–4 use their existing migration readers (legacy literal results are never guessed from missing seeds). Format 4 has no stored current state and requires replay once on migration; subsequent format-6 openings are direct. Version 5 research archives remain readable through their original direct-state/checkpoint compatibility path. Version 6 is the new writer for new sessions. The milestone must decide whether to retain that unpublished format-5 history compatibility path or import only its current state; it must not silently replay every gesture during opening.

## Water, collaboration and scheduling

Use [the current force-input recipe](REPLAY.md): unchanged portable force engine/hash version, original input cursor, canonical cold solve and all terrain/finalizer inputs. Its history rules supersede Round 3's checkpoint/recomputed-redo description. A completed live-water adoption updates the current transaction's patch endpoint and records its canonical boundary. Reject superseded solves by model/revision. Do not adopt directly on `history.session`: use `history.adoptWater` / `history.settleCanonical`, or the redo endpoint misses the settled state. Explicit replay or a continued force variation whose original input predates the reopened undo floor can still rebuild that prefix; that cost is outside opening and Undo, and needs progress/cancellation.

Collaboration can reuse the inverse spans, entity identity/order changes, current state codec and 100-entry rejoin retention. Players still send gestures/seeds/input receipts, never literal force result vectors. Local inverse patches are execution/undo data, not the collaboration gesture protocol; selective peer undo still needs the collab investigation's dependency fences and ownership checks.

Keep history work in the map worker and wire public undo/redo and availability to this controller (`canUndo` / `canRedo`), not native `MapSession.undo`. Connect queued commands, revision cancellation, errors and owned cold-store cleanup/compaction in the milestone. Mesh/water preparation and rendering remain the smoothness investigation's work. Reopen timings cover worker hydration plus a real first core edit, not a rendered editor frame. Windows WebKit uses the previously documented host-disk test adapter because it has no Storage API; native Safari OPFS remains an adoption gate.

The collector weakly indexes immutable generation/base/field/kept/stored-water inputs once per object identity. This removes repeated traversal of imported entity JSON; those objects must retain their topology, as in MapSession's existing cached-input contract. Mutable current caches are excluded. Other descriptor caching lasts only one transaction. Current graph traversal and buffer comparisons still need scheduling: feed collection, compression, hashing and disk IPC to `investigation/performance`; dirty-span instrumentation can reduce capture work later without changing undo semantics.

## Regeneration

From this investigation worktree:

```powershell
node investigation/scaling/round2/build.mjs
node investigation/scaling/round2/typecheck.mjs
node --expose-gc investigation/scaling/round4/contracts.mjs
node investigation/scaling/round3/prepare.mjs
node investigation/scaling/round4/batch.mjs
node investigation/scaling/round4/normalize.mjs
node --expose-gc investigation/scaling/round4/opened-memory.mjs
node investigation/scaling/round4/live-proof.mjs 256
node investigation/scaling/round4/live-proof.mjs 512
node investigation/scaling/round4/modern.mjs
$env:SCALING_R4_SAVE_ROUNDTRIP='1'
node investigation/scaling/round4/measure.mjs browser
$env:SCALING_R4_CONTRACTS='1'
$env:SCALING_R4_REPEATS='1'
$env:SCALING_R4_BROWSER_OUT='final-contracts'
node investigation/scaling/round4/measure.mjs browser 256-modern 512-modern
node investigation/scaling/round4/summarize.mjs
node investigation/scaling/round2/patch.mjs
git diff --check
```

`round3/prepare.mjs` recreates the immutable Round 2 2,048-edit source/oracle when absent; it may take many minutes. Sizes probe inputs and source/determinism pins are documented in the earlier integration notes. All sessions, archives, browser bundles, caches and sampled machine load live in gitignored `../local/round4/`. Browser runners close their own browsers and stores; monitors stop in `finally`. Construction memory is sampled once per size; browser timings repeat three times with whole-machine CPU/load samples alongside. The published construction trace used the larger JSON/copy-pair representation before final wire compaction, with the same indexed capture and retention policy; final cache capacity is checked separately after reopening. Regeneration now uses the final codec throughout. Byte proofs cover each of the 100 undo transitions and all redo transitions after a fresh opening, against the frozen forward oracle; separate live-session proofs cover all 2,048 undos and redos.
