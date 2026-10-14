# Collaborative editing (progress)

The build of D349's last step as D486 rewrites it: all of `docs/COLLAB-BRIEF.md`, working end to end between real peers.
The design is D362 and D431; the headless proof is `investigation/collab-architecture` (Codex, against `feature/forces`
32aee5cf), adapted here to dev's code. Parts land as PRs into `dev`.

## Now (2026-10-14)

Part 1 is built: `src/core/collab/` (README there), headless, with `tests/contract/collabLog.test.ts` and
`collabProtocol.test.ts`. Nothing in the page, the worker or the renderer has changed.

## Pieces

1. **The host-ordered log and replicas. Built** (this PR). The log entry, the host that orders and the replicas that apply
   in order; forces as gestures; atomic transactions with literal patches and write and touch masks; rejoin from a
   checkpoint plus the entries since; whole-map changes the host's alone; one seam for claims.
2. **Claims** (parallel, `claims.ts`, `footprint.ts`, `waterNotes.ts`, `claims.schema.json`): plug into `EntryCheck`.
3. **Undo with two players**, built on the records of part 1: each player's last 50, refused and named where the other has
   built on the same ground, the settled-water guard from INTEGRATION.md.
4. **Presence**: cursor, tool, stroke, camera, Go to.
5. **The transport and the room-code function**: the managed TURN relay and the Worker (D431), reconnects, a dropped peer
   (the session pauses read-only, brief §7).
6. **The page**: Invite, join, claims, outlines, notes, presence, Your maps.
7. **Two-browser tests over the real relay** (D486): separate browser instances, reconnects, conflicts, a dropped peer.

## What part 1 settled

- **Order and refusal.** The host numbers every entry; a replica takes only the next number. A force carries the sequence
  it was planned at and is refused if a later entry changed the map. Edits made at the same moment are fine: they are
  ordered and applied on the map as it is. Counters make a duplicated or skipped request refuse too.
- **Forces.** `forceStep.ts` runs a gesture the way the worker's `startForce` and `forceStop` do, from core code only, so
  the host and every replica reach the same operation and the start carry in the same step. Rift and Deposit work like the
  rest. Water is settled first.
- **Records.** Each applied entry leaves its literal patch (ground, fresh rock, objects, trees lying down, the lakes the map
  keeps), its direct write mask W and its touch mask T, following INTEGRATION.md. `applyPatch` forward and back is tested
  against the map before and after for every kind of edit and every force. A record travels as runs
  (`recordToJson`).
- **Rejoin.** The snapshot is the host's latest checkpoint plus the entries after it. A copy restored from it matches the
  host: the same exported `.timber` bytes and the same project document. The project's JSON may order a log entry's keys
  differently after a reopen (`step` and `undo`), so the tests compare the decoded document.

## What falls short, and what part 1 found

- **The settle barrier is the cost.** Which trees and bushes stand, and which are dead, follow from the settled water, so a
  record or a hash taken on a map whose water is still settling differs between a host that edited and a peer that
  restored. Part 1 settles after every entry on every peer (`MapApplier`). Here that is about 70 to 280 ms at 48² to 64²
  depending on the theme; INTEGRATION.md measured the from-scratch settle at 256² near 9 s. Part 3 or 6 has to decide how
  the page pays for it (for example the live water animating locally while the settle runs in the worker, with the entry
  shown at once and its derived objects attached when the settle completes). Nothing here forces that choice.
- **Cross-browser equality is still open** (INTEGRATION.md gate 1, the determinism investigation). These tests run one
  engine; they cannot show that two browsers compute the same force.
- **Force previews are not cached or sliced.** `applyForce` plans and keeps in one call. The page's live preview and its
  warning latency (INTEGRATION.md gate 2) belong to the claims and page work.
- **Try another** (a force replacing the force before it) is not an entry kind yet.
- The records are kept, bounded to each player's last 50, and nothing yet reads them.
