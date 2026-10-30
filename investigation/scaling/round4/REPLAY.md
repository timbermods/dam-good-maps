# Canonical force input and patch history

Replay version remains `portable-forces-v1-canonical`; execution ABI remains
`scaling-execution-1/portable-forces-v1-canonical`. Adopt the pinned determinism proposal first.
The numerical recipe in [Round 3](../round3/REPLAY.md) is unchanged. Its checkpoint and redo
instructions are superseded by the following history rules.

1. Order accepted gestures by document ID, epoch and authoritative sequence. Keep resolved
   settings, seed, paths, protected area/cut, source identity, Auto/pins and grouped start repair.
   Reject invalid inputs. Wall time and animation frames are not inputs.
2. Ordinary forces use the accepted current prefix. Try another uses the original force's
   `inputCursor`, including repeated replacements. Within available patch history, reconstruct
   that execution prefix by inverse/forward changes from the stored current state. For an older
   prefix whose patches were discarded on reopening, explicit replay rebuilds from the immutable
   generation and gestures, applying canonical-completion markers at their recorded prefixes.
   This potentially expensive path is not opening or Undo and needs progress/cancellation.
3. Preserve the complete execution inputs, not just displayed heights: original geology,
   trimmed accumulated lava, glacier lakes, slopes/sources, objects and fallen poses, plus the
   finalizer's terrain fields and cave columns. Preserve Float64 bits and imported JsonFloat
   spellings. Do not flatten this prefix into a new generation.
4. Construct its exact water model and complete the deterministic **cold canonical runner**.
   Its tick bound, convergence, initial state and moisture/resource rebuild are those of the
   recorded engine. Live-water warm starts, speculative worker results and elapsed animation
   time cannot substitute. `forceMapOf` receives that canonical terrain, water and entity state,
   with geology/lava/fallen inputs; centers are x/y + 0.5, fallen length Oak 2.6, otherwise 2.
5. New gestures use input-hash version 2. In order, SHA-256 each: terrain Uint8 bytes; water
   depth Float64 bytes; contamination Float64 bytes; lava Uint32 bytes; UTF-8 JSON of
   `[W,H,maxHeight,entities,rockLayers,fallen]`; finalizer pre/protect/channel/base/field/locked/
   sorted-column raw bytes (absent arrays empty); UTF-8 JSON of
   `[top,hasBase,hasField,hasLocked,features]`. Concatenate the component digests and SHA-256
   again. Compare the receipt before committing. Older envelopes retain their recorded v1
   recipe/engine; reject unknown versions. Supported targets use little-endian typed arrays.
6. Apply the recorded force's deterministic final plan, keep mask, finalizer, feathering,
   retained glacier water/springs and grouped start repair. Store its gesture and receipt;
   literal result vectors remain disposable execution data.

Undo restores the captured visible boundary before canonical preparation, including deferred
water. Redo applies the forward patch to the captured post-force state. Neither runs a force or
settles water. Explicit gesture replay uses the canonical recipe above. A completed background
canonical solve updates the current transaction's patch endpoint through `history.adoptWater`
or `history.settleCanonical` and records a canonical prefix marker, adding no undo step. Serialize
adoption against gestures/saves and reject superseded model/revision results. Arbitrary partial
warm-start water needs its deterministic advance program or legacy literal, not a guessed marker.

A rejoining peer receives compatible current execution state and gesture/receipt metadata.
Local undo may retain the last 100 patches; operation messages remain gestures/seeds/input
receipts, never force-result vectors. Current-state synchronization and inverse changes can reuse
this codec, while selective peer undo still needs collab ownership/dependency fences. Order
canonical-completion receipts against the authoritative prefix/model revision; each peer runs
the same solve. Keep older engines or reject unsupported versions explicitly.
