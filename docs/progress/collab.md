# Collaborative editing (progress)

The build of D349's last step as D486 rewrites it: all of `docs/COLLAB-BRIEF.md`, working end to end between real peers.
The design is D362 and D431; the headless proof is `investigation/collab-architecture` (Codex, against `feature/forces`
32aee5cf), adapted here to dev's code. Parts land as PRs into `dev`.

## Now (2026-10-14)

Part 1 is built: `src/core/collab/` (README there), headless, with `tests/contract/collabLog.test.ts`,
`collabProtocol.test.ts` and the nightly `collabSoak.heavy.test.ts`. Nothing in the page, the worker or the renderer has
changed. One small change in `src/core/doc/session.ts`: `takeBack` now also restores the next operation number, as its
comment says it leaves everything "exactly as it was" (the claims seam takes a refused step back and the peers must keep
the same numbers).

## Pieces

1. **The host-ordered log and replicas. Built** (this PR). The log entry, the host that orders and the replicas that apply
   in order; forces as gestures; atomic transactions with literal patches and write and touch masks; the water settling
   in the background; rejoin from a checkpoint, its records and the entries since; whole-map changes the host's alone;
   one seam for claims.
2. **Claims** (parallel, `claims.ts`, `footprint.ts`, `waterNotes.ts`, `claims.schema.json`): plug into `EntryCheck`.
3. **Undo with two players**, built on the records of part 1: each player's last 50, refused and named where the other has
   built on the same ground, the settled-water guard from INTEGRATION.md.
4. **Presence**: cursor, tool, stroke, camera, Go to.
5. **The transport and the room-code function**: the managed TURN relay and the Worker (D431), reconnects, a dropped peer
   (the session pauses read-only, brief §7).
6. **The page**: Invite, join, claims, outlines, notes, presence, Your maps, the force preview on `previewForce`'s basis.
7. **Two-browser tests over the real relay** (D486): separate browser instances, reconnects, conflicts, a dropped peer.

## What part 1 settled

- **Order and refusal.** The host numbers every entry; a replica takes only the next number. Every request is counted
  before it is checked, so a refused one never strands the player. A Select action's tiles are worked out on the host, never
  taken from the client; a missing force seed is refused.
- **Ordering costs single-player edit cost.** The commit carries the operations the host applied, literally; every peer
  applies them with the water in the defer mode. The record and the hash cover what the players made directly (ground,
  fresh rock, objects that are not a resource feature's, felled trees from the operations, kept lakes). Which trees and
  bushes stand and live follows from the settled water and is in neither.
- **The water settles in the background**, on the latest sequence only, in slices a caller pumps (`pumpWater`). The
  canonical settle has no memory, so a settle a newer entry overtakes is dropped. The host announces "settled at seq N,
  since M, hash H"; a replica compares its own settle at N. Checkpoints are taken when a settle completes. The water notes
  can name the batch `(M, N]`.
- **What waits.** A force, a Select action (its start carry), a placement stroke, Remove unfed water, Fill and a weathering
  Naturalize stroke read the settled water when they are planned or checked. The host refuses them as busy until its water
  has settled for the map as it is; a replica settles first. Select is applied again by every peer rather than replayed
  literally: the single-player step takes the start carry by applying, undoing and applying again, which leaves a gap in the
  operations' numbers a literal replay would not reproduce. A weathering stroke is applied again for the same reason (its
  kept ground comes from the objects standing).
- **Forces.** `forceStep.ts` runs a gesture the way the worker's `startForce` and `forceStop` do, from core code only, on
  the canonical water of the entry before it. `previewForce` gives the author's preview that same basis and a hash of the
  operation; the host refuses a force whose operation, planned on its map, differs (the map changed under it). That is
  exact, so a force no longer starves while the other player paints elsewhere, unless the paint reaches what the force
  read. The force reads the whole map (drainage, geology, route choice, the nearest safe start), so no cheaper test is safe
  without audited read instrumentation (INTEGRATION.md). With no preview hash the rule is the conservative one: any entry
  since its view that changed the map refuses it.
- **Records.** Each applied entry leaves its literal patch, its write mask W, its touch mask T (INTEGRATION.md's table) and
  the step's operations with their undo data, so undo can turn a record into operations (D342). Forward and back is tested
  against the map before and after for every edit kind and force. Feature state (the features and their order) is not in
  the patch: it is in the operations' undo data (`before`, `index`), and INTEGRATION.md's feature-state adapter is not built.
  A record travels as runs (`recordToJson`); a snapshot carries the records up to its checkpoint, so a rejoined peer holds
  what the host holds.
- **The claims seam** runs after the step is applied, with its record, so a force's exact footprint is known; a refusal takes
  the step back.
- **Rejoin.** The snapshot is the host's latest checkpoint plus the entries after it. A copy restored from it matches the
  host (the direct hash at once, the settled hash and the `.timber` bytes after the settle). The project's JSON may order a
  log entry's keys differently after a reopen, so the tests compare the decoded document.

## What falls short

- **A checkpoint is the whole project, with the full edit log.** `MapSession.project()` writes the stored map and every
  operation. The brief and INTEGRATION.md want a baked base plus a compact journal; that needs a change in the document
  format (`doc/document.ts`, `stored.ts`), which belongs to the milestone. A checkpoint is taken only when the water has
  settled, so a rejoin never replays the history, but its size grows with the log.
- **A checkpoint waits for a settle** and the host does one canonical settle to take it (the first one at construction);
  at 256² that is seconds, off the ordering path.
- **Cross-browser equality is still open** (INTEGRATION.md gate 1, the determinism investigation). These tests run one
  engine; they cannot show that two browsers compute the same force or the same settle.
- **Force previews are not cached or sliced.** `planKeptForce` plans and runs in one call; the page's live preview and its
  warning latency (INTEGRATION.md gate 2) belong to the claims and page work.
- **Try another** (a force replacing the force before it) is not an entry kind yet.
- **Single-player quirks the peers work around:** the session leaves a gap in the operations' numbers after any undo, and
  `applyBatch` does not mark its step. The numbers still agree between peers because every peer takes the same steps.
- The records are kept, bounded to each player's last 50, and nothing yet reads them.
