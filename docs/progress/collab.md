# Collaborative editing (progress)

The build of D349's last step as D486 rewrites it: all of `docs/COLLAB-BRIEF.md`, working end to end between real peers.
The design is D362 and D431; the headless proof is `investigation/collab-architecture` (Codex, against `feature/forces`
32aee5cf), adapted here to dev's code. Parts land as PRs into `dev`.

## Now (2026-10-14)

Part 1 is built: `src/core/collab/` (README there), headless, with `tests/contract/collabLog.test.ts`,
`collabProtocol.test.ts` and the nightly `collabSoak.heavy.test.ts`. Nothing in the page, the worker or the renderer has
changed. One small change in `src/core/doc/session.ts`: `takeBack` now also restores the next operation number, as its
comment says it leaves everything "exactly as it was" (the claims seam takes a refused step back and the peers must keep
the same numbers), and `applyAll`'s refusal path resets it (a group whose later operation fails burned numbers no replica sees).

**Built: undo with two players** (piece 3; brief �5): `undo` and `redo` entries naming the author's own action, the host's and
every peer's identical decision from the records, blocked and named where an active later action is built on the same ground,
freed when it is undone, stored values restored (never a replay onto changed land), the water re-settling in the background with
a seam for the water notes. `tests/contract/collabUndo.test.ts` and the nightly `collabUndoSoak.heavy.test.ts`. Left: the claims
check on an undo's footprint (the seam is there), the water note (#406), the page's Undo and Redo keys on `undoPlan` and
`redoPlan`, display names and feature places in the lines, a measure at 256� with the busy windows.

**Built: the session layer** (piece 5; brief §2–§9): `core/collab/peer.ts` `CollabPeer` (the host or the guest beside the map; claims ordered through the host with the log;
undo and redo; the water notes worked out on each peer for its own area; presence; the pause, rejoin with a new code and the whole-map change), `wire.ts` with
`session.schema.json` (the versioned messages), `worker/collab.ts` (the peer in the worker beside `session.ts`, three hooks there and one line in `generator.worker.ts`),
`src/collab/client.ts` (`CollabClient`: the transport, the worker and the page’s API, documented in `src/collab/README.md`). Tests:
`tests/contract/collabSession.test.ts` (two peers over an in-memory link: interleaved edits, a force, claims, notes, undo blocked and freed, presence, a drop
mid-stroke and a request whose answer was lost, rejoin with a new code, desync, the host’s whole-map change; the .timber bytes compared at the settled points) and
`tests/collab/session.spec.ts` (two separate browsers over the real function and a relay, each with the app’s worker and a generated map, driven through the
client: edits from both sides identical, a claim refusing the other’s edit, a killed browser pausing the other and a new code carrying on, the relay going away and
back, the host opening another map, the function unreachable said plainly). Left for the page piece: Invite, join, the words, claims outlines and their toggle, notes with
“See it”, presence drawn with “Go to”, Your maps entries from the `keep` events, routing every edit/Select/force/undo/redo through `submit` while a session is
live (and the force preview on `previewForce`), the busy windows at 256² measured with two painters. Left in the layer: the worker still runs its own live-water
preview beside the session’s settle (the page piece decides whether to hold it while a session is live); a checkpoint is the whole project (see “What falls short”);
Firefox as the second peer runs only in CI here (Playwright’s Firefox does not start on this machine), where cross-browser sameness (gate 1) is tested for the first time.

## Pieces

1. **The host-ordered log and replicas. Built** (#397). The log entry, the host that orders and the replicas that apply
   in order; forces as gestures; atomic transactions with literal patches and write and touch masks; the water settling
   in the background; rejoin from a checkpoint, its records and the entries since; whole-map changes the host's alone;
   one seam for claims.
2. **Claims** (parallel, `claims.ts`, `footprint.ts`, `waterNotes.ts`, `claims.schema.json`): plug into `EntryCheck`.
3. **Undo with two players. Built** (this PR, on part 1's records): `undo` and `redo` are entries of the ordered log naming the
   author's own action; each player's last 50, blocked and named where an active later action of either player is built on the
   same ground, and freed when the blocker is undone; the water re-settles in the background with a seam for the water notes.
4. **Presence. Built** in the session layer (cursor, tool, stroke, camera as events; the page draws them and "Go to").
5. **The transport and the room-code function. Built** (#392): the managed TURN relay and the Worker (D431). **The session layer. Built**
   (this PR): joining, rejoin, a dropped peer (the session pauses read-only, brief §7), claims, undo and presence over it.
6. **The page** (6a built, see below): Invite, join, claims, outlines, notes, presence, Your maps, the force preview on `previewForce`'s basis. **Its first task: busy windows at 256².** Forces, Select, placement strokes, Fill, Remove unfed water and weathering strokes (and any edit naming a generated tree or bush) wait for the settled water, a from-scratch settle (about 9 s) after any water-changing entry, so they stay busy while the other player paints. Measure it with two painters. If they starve, the author's page records the water and trees it showed (as single-player does for shore, pools and moist, with `weatherKeep` skipping when `keep` is given), so only forces wait.
7. **Two-browser tests over the real relay** (D486): the connection’s (#392) and the session layer’s (`tests/collab/session.spec.ts`: reconnects, a conflict, a dropped peer) are built; the page’s own UI test comes with the page.

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
- **A replica goes by the host.** The host marks an entry `water` when it held it for the settled water (it planned on it, or it names a generated tree or bush, whose existence follows from the water); a replica settles before applying it, so the checks see the same objects. A rejoin settles fully before each such entry in its tail.
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

## What undo settled

- **The rule** is INTEGRATION.md's: an earlier action's inverse is blocked while an active later action (either player's, the same
  player's too) has a touch mask meeting its write mask or shares an identity key. Blocked entries stay and wait for their blocker.
  An action that left the 50 still blocks what is under it, by a per-tile and per-key fence (the latest evicted standing action's
  sequence; compact, in the snapshot).
- **Stored values, never a replay.** The document is a list of operations the build replays, so an undo removes the action's
  operations from the list (redo puts them back at their place in the order). That is exactly the stored inverse only when
  nothing later is built on the ground, which is what the rule guarantees; the applier checks it anyway: the resulting map must
  equal the stored patch put on the map as it stands, or the undo is refused and nothing changes. The nightly soak asserts no
  answer is that safety net, so a gap in the rule would show.
- **Redo** has the same rule, plus: it is blocked while the ground the action was made on has changed since (an action it was
  built on was taken back or brought back while it was taken back). The undone ones keep their place in the history and in a
  rejoin's records. **A new edit does not clear Redo** (unlike single-player's redo stack): the rule alone decides, and the page
  piece decides how to show that. Undo takes the action done last (made or brought back), not the highest sequence.
- **The plan** (`undoPlan`, `redoPlan`): the action done last that nothing is built on, with the blocked ones skipped and
  named; the page sends the target. The host decides again on its own state, so a late block is refused with its line, and
  a refusal the rule did not foresee (a claim, the safety net) carries its target so the plans skip it until the next entry.
  The refusal carries the block (author id, tool, place, sequence, box) for the page to word with display names.
- **Water.** An undo never waits for the water. It is an ordinary entry in the settled batch; its effect record
  (`records.get(seq).undoes`) and the replica's `applied` event are the seam for the water notes (#406).

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
  `applyBatch` marks its step (D456). The numbers still agree between peers because every peer takes the same steps.
- **The undo is conservative where the build is not yet audited:** a force, a feature operation and a water operation touch the
  whole map, so any of them blocks every earlier action of either player, and they block until they are undone themselves.
- **Names and places.** Refusal lines use the player id (`Names` lets the page supply display names) and `placeOf`: the feature
  that holds most of the writes ("at the north lake", "by the start"), else a compass word. Only a feature's own ground counts
  (a lake inside its outline, a river near its path), so a far-off edit is never "at the river"; landforms are not named.
- **Speed depends on the milestone's step-splice.** An undo rebuilds from the whole log (`MapSession.followLog`: the log is
  copied and the build is incremental from the previous map). Fast at 48�; at 256� with a long log it needs the core step-splice
  the milestone is building for single-player and collab undo alike, and a measure with the busy windows (piece 6).
- **Try another** (a force that replaces another) is not an entry kind, so undoing one that restored the replaced force is not
  covered.
- **Claims** are not built: the undo's effect passes through the seam like any entry (its writes are the action's), so a claim
  check can refuse an undo that reaches into the other player's area.

## Part 6a: the Together panel (the page)

Built: the header's **Together** button and its panel (alone: name, Invite with the code and Copy, Join; live: both players,
Go to, Leave; paused: "<name> has left. Waiting to reconnect.", Invite again or Join again); the page's `Together` controller
(`src/collab/together.ts`: one object for the page's life, the client's events as one plain state); every edit routed through
`submit` from the moment Invite is pressed (`src/worker/collabEdit.ts`, chosen in `generator.worker.ts` by `collabActive()`;
undo and redo are the session's own; a force is ordered as a gesture when kept); the map's updates the session orders taken as an
edit's answer (`src/editor/collab/useCollab.tsx`, after the edits already on their way, held until the 3D view is ready);
refusals, water notes with **See it**, "<name> is opening a new map", desync and "unavailable" in the page's note line; the other
player's cursor with name and tool; the host's whole-map changes (the guest told first, the new map made in a worker of its own
so Cancel never ends the session); a guest's attempt to change the map refused quietly; the `keep` events saved to Your maps
on both sides. `tests/collab/page.spec.ts` drives the real page in two browser processes (Chrome and Edge or Firefox).

Falls short, for 6b and after: the claims tools and outlines; a stroke before release and a force playing out on the other side
(a force has no play-out on the author's side either in a session, it lands when ordered); Try another in a session; History's
jump (refused); slider steps are separate actions (they cannot join into one undo step); a guest who reloads the page cannot
rejoin as the same player yet (a new code and the host's map, as a new guest); the force's preview basis (`previewForce`) is not
used, so a force is refused by the conservative rule if the map changed under it; an edit of over 256 operations (a huge
planting) is refused by the message schema.

**The local relay (found while chasing a flaky page test).** `node-turn`, the relay in `tests/collab/localStack.ts`, answered a ChannelBind
without MESSAGE-INTEGRITY, so every browser retransmitted it for about 40 s and then failed the whole connection: any session
on the local stack dropped about a minute in (the page spec's "refusal" test sometimes landed in that window). It also ignores a
client's ChannelData once a bind works. The stack now answers the bind properly and relays the client's ChannelData; a session
now lasts (3 minutes idle without a drop). The real relay is not affected.
