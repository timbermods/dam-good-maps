# collab

Collaborative editing's core (D362, D431, D486; the brief is `docs/COLLAB-BRIEF.md`): one player hosts and keeps the order of operations; each browser rebuilds the map from that one ordered list, so both see the same terrain and water. Headless: it runs in Node and in a worker, and it knows no network, no page and no claims.

**Rules**
- The host alone numbers the log. A request names no author: the channel it came on does. Every refusal is one plain line, the sequence does not advance and the host's map is unchanged (D342).
- A replica applies a commit only if it is the next one: a gap or a duplicate is refused with its reason. After each entry it compares the hash of its map with the host's; a difference marks the copy `out-of-sync`.
- Forces travel as gestures: the page's request with its seed (`ForceGesture`, a Carve's source id beside it). Each peer computes the result on the agreed map with the same steps the worker takes (`forceStep.ts`); no heights cross the wire. A force planned on a map that has since changed is refused (the host knows the last entry that changed the map), so the player draws it again.
- Records are taken on the settled map. The objects the map keeps follow from its settled water, so every peer settles the water after each step before it captures or hashes the map. This is a barrier and it costs one canonical settle per entry on every peer; the live water's animation stays local. Measure before the page adopts it (`docs/progress/collab.md`).
- Whole-map changes (Generate, a real place, another map) are the host's alone. The guests hear `map-opening` first, then the `newMap` entry, then adopt the new map's snapshot.
- A rejoin is the host's latest checkpoint (the project the app saves, water settled) plus the entries since, never the whole history.

**Start from**
- `host.ts` `CollabHost`: `request` (the host's own), `submit(author, request)`, `snapshot`, `openMap`. The seam for claims is `EntryCheck`, `(entry, state) => string | null`, called with each entry before it is ordered (null allows); the default allows everything and `setCheck` replaces it. The claims work (`claims.ts`, `footprint.ts`, `waterNotes.ts`, `claims.schema.json`) plugs in there.
- `replica.ts` `CollabReplica`: `request`, `receive` (commit, reject, map-opening), `adopt`, `fromSnapshot`, and the events a page listens to (`opening`, `newMap`, `applied`, `rejected`, `outOfSync`).
- `transaction.ts` `MapApplier`: one command as one atomic step with its `TransactionRecord`. `mapState.ts` has the map as plain values, the literal patch (`difference`, `applyPatch`) and the hash; `touches.ts` has each step's write mask W and touch mask T (INTEGRATION.md's table: a force, a feature operation or a water operation touches the whole map); `mask.ts`, `records.ts` (each player's last 50, with `onEvict` for undo's fences).
- `collab.schema.json` and `validate.ts`: the entry, request, commit, reject, map-opening and snapshot shapes (`messageProblem`, `commandProblem`). An operation inside a command is checked by the session that applies it.
- `forceStep.ts` `applyForce`: a force kept as the worker keeps it, with the start carry in the same step.

**Not here yet**: claims, undo with two players (built on the records), presence, the transport and the room-code function, the page.

**Tests**: `tests/contract/collabLog.test.ts` (a host and two replicas on two generated maps, mixed edits from two players, identical bytes at every checkpoint, every record checked), `collabProtocol.test.ts` (refusals, order, stale forces, whole-map changes, the claims seam, a rejoin). Fixtures in `collabFixtures.ts`. Run `npx vitest run tests/contract/collabLog.test.ts`.
