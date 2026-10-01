# Canonical force-input recipe

Replay version: `portable-forces-v1-canonical`. Execution/checkpoint ABI:
`scaling-execution-1/portable-forces-v1-canonical`. Adopt the determinism patch first.
This deliberately selects a canonical-input policy for NEW forces; an old arbitrary live-water
result is never relabelled as a seeded gesture.

1. Order accepted gesture envelopes by document ID, epoch and host-assigned sequence. Resolve
   settings, seed, paths, protected area/cut, source identity, Auto/pins and grouped start repair
   once. Reject invalid inputs; do not clip them. Animation frames and wall time are irrelevant.
2. The ordinary force input cursor is the current accepted prefix. Try another uses the original
   force's `inputCursor`, even across repeated replacements. Restore its nearest checkpoint and
   replay the intervening gestures with the exact recorded engine. Never run against the already
   altered replacement terrain.
3. Obtain that prefix's terrain, objects, original geology, accumulated lava (trimmed against
   current heights), retained glacier lakes, slopes, sources and fallen-tree poses. Preserve
   Float64 bytes and imported `JsonFloat` spellings. A checkpoint is an execution state, not a
   flattened replacement generation: future feature edits must keep their existing semantics.
4. Construct the prefix's exact `waterModel`; run the core `canonicalRun` to completion, using its
   deterministic tick bound and convergence rules, starting as that canonical runner specifies.
   No live-water warm start, elapsed time, visible animation stage or speculative worker result
   may substitute for this water. Canonical settling includes its existing moisture/resource
   rebuild, so the force sees the canonical prefix's entities as well as its water.
5. Call `forceMapOf`, attach geology, trimmed lava and the poses of surviving dead trees. Fallen
   lengths are the existing worker values (Oak 2.6, otherwise 2); centers are x/y + 0.5.
6. New envelopes use `inputHashVersion: 2`. Hash, in order, terrain Uint8 bytes, water-depth Float64 bytes, contamination Float64 bytes,
   lava Uint32 bytes, then UTF-8 JSON of `[W,H,maxHeight,entities,rockLayers,fallen]`. SHA-256 each
   component. Then hash the finalizer's pre-integrity heights, protection, channel, original base,
   generated field, locked mask and sorted cave-column Int32 bytes (absent arrays are
   empty), then UTF-8 JSON of `[top,hasBase,hasField,hasLocked,features]`. These inputs matter even
   when the displayed terrain/water is identical. Concatenate all component digests, SHA-256 again. Compare with `inputHash` before
   committing. The supported browser targets use little-endian typed arrays; a different endian
   engine needs an explicit canonical-byte adapter and a replay-version decision. Older envelopes
   without a hash-version field retain their five-component version-1 check and original engine;
   do not silently reinterpret their recorded digest. Reject an unknown hash version.
7. Build the keep mask from cave/overhang columns, heights above cut and outside the protected
   area. Run the recorded force to its deterministic final plan, with the existing terrain
   finalizer, feathering, glacier retained water/springs and grouped start repair. Commit the
   resulting map; the literal force operation is disposable execution data.

The visible pre-force history boundary is retained before canonical input preparation changes
the working water cache. Undo restores that boundary's stored/recomputed state, including deferred
water. Redo repeats canonical preparation and restores the post-force state. Saving captures the
actual current water, including a pending/deferred state, and never settles just to create a file.
Background `adoptWater` must run through the serialized controller command queue before the next
gesture/save, so its current boundary is refreshed. State changes cannot race a pending input hash.
Completed canonical adoption also records a prefix marker. Replay that marker by running the same
canonical settle at that prefix; it preserves historical water across checkpoint gaps without
sending/storing result vectors. It adds no undo step. It cannot represent a partial or arbitrary
warm-start water state: those need their actual deterministic advance program or legacy literal.

Collaboration can send the envelope and hash, then use this same recipe after reopening/rejoining.
A joining player receives a compatible current execution state plus journal/checkpoints, not a
new generation built from the displayed terrain. Checkpoint/cache bytes are synchronization or
acceleration data, never operation messages. The host still needs ordering, actor/base revision,
acknowledgements and cancellation rules from `COLLAB-BRIEF.md`. Preserve older engines or refuse
an unsupported version explicitly. Legacy literal operations keep their original bytes and inputs.
Include canonical boundary markers in joining/history metadata. When exact historical visible
water is shared, order a small canonical-completion receipt against the authoritative prefix/model
revision; the receiver runs this same settle recipe. Do not send water arrays as edit messages or
infer the prefix from when an animation finished on another machine.
