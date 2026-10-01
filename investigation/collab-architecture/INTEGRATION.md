# Milestone handoff

Start from the milestone's forces code and take **only this investigation's commit(s)**. The branch starts
at `feature/forces` `32aee5cf`, not `dev`. Nothing outside this directory was changed by this investigation.
Design is `docs/COLLAB-BRIEF.md` from `dev` `8f3e7e27`; the spike is already on dev. Read REPORT first.

The prototype is core data/functions plus a host dispatcher, not a replacement MapSession/UI.
`spike.ts` extends the spike's seed, real MapSession fixture, brush envelope and seeded request stream.
Reuse its SDP codec and backpressure/chunk transport. Change its offline-edit and whole-history rejoin paths
to PROTOCOL. No server is needed for the prototype or tests.

## What “built on the same ground” means

Each atomic gesture owns a literal patch P and actual direct write mask W. Keep a separate touch/read mask T:
**an active later action blocks an earlier inverse when W earlier intersects T later, or identity keys overlap**.
Use the same ground regardless of layer/type: terrain under a placed object, rock under a stroke, both ends
of a moved object. A later no-op stroke still touched the ground. Include every grouped operation in one patch.
Same-player later dependencies block too; skipping one must not let an earlier own action erase it.

| Core operation / Select action | T and identity keys |
| --- | --- |
| `brush` (all five tools, target, channel, area, rigid, slopes) | marked dab support + brushBounds/read halo + rigid rectangles/rims; actual derived write differences always included |
| `sculpt` / Select Raise, Lower, Flatten, Smooth, Naturalize | all selected runs; Smooth/Naturalize add neighbour halo; all actually changed cells/objects |
| Place / grouped shelf placement | every rotated object tile; levelling/clearing suboperations; created entity ID |
| Move / rotate | complete old and new footprints, levelled/cleared tiles, moved ID |
| Remove / Select Delete | every removed object's footprint and ID; terrain-delete is sculpt; clipped ruin-field update is a feature op |
| `setEntityProps` (source strength/type, tree properties) | object footprint + ID, even when terrain does not change |
| `pinSlope`, `removeSlope` | slope tile, neighbouring ground read by placement, actual derived objects |
| `forceResult`, legacy `carve` | final literal result **and all derived effects**, old/new carried objects, killed/felled objects, lava, owned banks, sources/lakes, carried start; conservatively whole-map reads |
| `add/update/delete/reorderFeature` | feature IDs/dependencies/order and full map until build read/write instrumentation is audited |
| Claim / partial release / offer / answer | separate ordered ownership state; explicit release/offer, outside map undo/export |

Force reads are deliberately conservative: drainage, Auto geology, route choice, outwash and nearest safe
start can read distant tiles. The ring is not a bound. Shrink T only with audited core read instrumentation.
Feature mutations' global guard is specified here; their feature-state patch adapter is **not implemented**.
The core prototype exercises concrete brush/sculpt/entity/slope operations and all five force planners.

## Undo proof and storage

Store exact before/after **values**, not inverse arithmetic. Undo restores those values directly without
replaying later edits. For every later active action L, the guard proves W inverse ∩ T L is empty;
the inverse writes only W inverse, so every tile L touched is unchanged. Entities use complete footprint
and ID keys, including components. `check.ts` compares tile values, not just terrain hashes.
Blocked entries remain in history and become eligible when their blocker is undone. Last 50 includes undone
actions; evicted active touches become permanent per-tile sequence fences (they are no longer undoable).
Identity fences are kept only while a retained candidate can need them. Storage does not grow with log length.

For the literal **every layer of a tile** promise, call `Journal.undo(player, settle)`:
restore in a scratch map, canonically settle water/soil, refuse if its changed derived mask intersects a later
peer's T, then atomically adopt. The targeted source/lake test proves this extra guard clears after peer undo.
Use a fast water-model equality test to skip settling for non-hydrological inverses. `undo(player)` alone
proves direct patch safety while water is deferred; do not advertise that as the settled-water guarantee.
A settling adapter must also include generated resource/life changes and barriers in that derived guard.
The demo fixture's soil solver has no Thorns; reuse the product's moistureBarrier in the real adapter.

Try another reconstructs the original ground by restoring the latest force's patch in scratch state and
planning there. It requires that player's force still be latest; intervening work invalidates the series.
The replacement stores current→new, deactivates the previous record, and undo reactivates it. No old
force is rerun. Prefer keeping the original checkpoint and canonical-water provenance for the live series.

## Footprint, claims, water, rejoin

Move the worker's finalization, start carry and grouped placement effects into callable core transactions.
`forces.ts` uses existing planners, a no-water build, the core start helpers, and a completed PreviewCache;
same ID/baseSeq/claimRevision releases the **same plan**, including its patch/footprint. Changing the endpoint
requires a new plan; release does not. Pin the canonical-water baseline too. Keep columns/cut protection,
owned glacier banks and retained water; a lake-only change and a rock-only change have a footprint too.
Current exact 256² previews are too slow for continuous highlighting. Worker slicing/coalescing keeps the
pointer responsive but does not solve warning latency. Extract sparse finalization/dirty tile+entity sets
or audited conservative support envelopes, then compare them against this exact oracle. No guessed radius.
Never allow release while the latest preview is incomplete/stale, and never clip a force at a claim boundary.

Claims are an ownership Uint8Array (0/shared, 1/host, 2/guest). Any Select shape rasterizes to normalized runs.
Host checks the entire action's intended/direct footprint before mutation. Own claims are editable; every
other intersection rejects the whole group. Recheck undo against current ownership. Offers keep ownership
until acceptance; any ownership mutation invalidates pending offers (simple conservative choice).
Use quiet outlines and overlap feedback only, as the brief says. `exportMap()` cannot include claims.

Diff settled depth, surface elevation and contamination against the prior agreed settled revision, filtering
through the ownership mask. Return exact changed runs, counts and bounds for See it. Scan once over N;
flood fill is unnecessary. Hold ownership as it stood at that revision while the settle runs. Publish an
attributed notice only on canonical completion; preview waves and numerical noise are not events.
For overlapping edits, either preserve one canonical causal revision per edit or name the whole batch.

Checkpoint codecs preserve typed numeric bytes (LE) and 100 inverse records/fences, not the whole history.
Keep fixed file metadata, raw imported JSON numeric text, feature identities and constraints in the adapter;
the measured payload is the materialized working map/session state, **not a .damgoodmaps file writer**.
Do not re-enter MapSession with the old log on the new checkpoint: provide a baked base plus compact journal.
Opening the prototype payload directly takes no generation/force replay; its 20-operation tail applies once.
The sample codec uses Buffer; use core base64 helpers/browser streams when moving it into the browsers.

## Gates

1. Resolve the determinism investigation's findings before claiming cross-browser force equality. A pinned
   build is necessary but insufficient; pose data already differs in an inspected Chromium/Firefox sample.
2. Optimize and prove footprint warning latency at 256², including start carry and Slide destinations.
3. Add a real MapSession baked-state/patch adapter and settled-water/resource undo checks; preserve exact
   import/export metadata. Test a source feeding a distant peer edit and generated vegetation changes.
4. Apply complete ingress schemas, snapshot expansion limits, crash persistence and epoch/counter rules.
   Wire presence/keyframes, See it and Go to; those UI/network paths were not driven in this headless study.
