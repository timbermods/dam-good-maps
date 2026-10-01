# Two-browser protocol, v1

Extends `collab-spike`'s two-code WebRTC exchange. One host orders everything. No signaling service,
relay, HTTP server or TURN; optional public STUN only. Names/colours belong to the session, not a map.
Pin the **exact application commit + operation schema digest**, not just generator version.

Two data channels: `map`, reliable/ordered; `presence`, unordered with `maxRetransmits: 0`.
All reliable messages below carry session ID and connection epoch; the prototype dispatcher assumes
those checks at the channel boundary except on `request`, where it checks them directly.
Host/guest identity comes from the channel, never a claimed `author` in an incoming request.

| Message | Direction | Payload / meaning |
| --- | --- | --- |
| `hello` | guest → host | protocol, build, schema, session, epoch, lastSeq, hash; refuse incompatible peers |
| `snapshot` | host → guest | checkpoint ID, seq, compressed bytes, SHA-256, chunk count |
| `chunk` | host → guest | checkpoint ID, zero-based part, binary bytes (≤16 KiB); sequential, bounded reassembly |
| `commit` | host → guest | seq, authenticated author, request counter, command, full state hash; undo also carries action taken back and skips |
| `end` | host → guest | latest seq/hash after the checkpoint's tail |
| `ready` | guest → host | matching end seq/hash; both become editable only then |
| `request` | either player → host orderer | session, epoch, per-player counter, baseSeq, claimRevision, command |
| `reject` | host → requester | counter and one-line reason; sequence does not advance |
| `ack` | guest → host | seq/hash after each commit; mismatch immediately pauses both |
| `water` | host → guest | settled operation seq, author, changed claimed runs, bounds, flooding/draining counts; quiet note + location |
| `ping`, `pong` | both | counter, every 2 seconds; 12 seconds without traffic pauses |
| `pause` | either → other | reason; read-only immediately, saving a copy remains available |
| `map-opening` | host → guest | name; archive previous map locally in both browsers before a new session/checkpoint |

`command` is one of:

- `edit {op, label}`: schema-valid core operation, or an atomic Select/placement group in the milestone adapter.
- `force {gesture}`: verb, resolved settings + seed, where/path, cut, fixed step policy, ID, baseSeq,
  claimRevision and optional replaces. **No heights/results cross the wire.** Both compute from the same agreed map.
- `undo`: host chooses latest eligible own action among last 50, naming/skipping blockers. No blind “undo seq” from guest.
- `claim {action: claim|release, runs}`; `offer {id,runs}`; `answer {id,accept}`. Recipient is the other player.

Accepted commands increment session seq once. Claims/offer changes are ordered too. A rejected request
consumes its counter; duplicate/out-of-order counters cannot apply again. New codes create a new epoch
and reset counters; old unconfirmed requests are never automatically resubmitted. Reject stale baseSeq
instead of letting a force land on terrain different from its preview. Claim revision invalidates previews too.
There is no redo in the brief; the prototype does not add one. Claims use Release/Offer explicitly, not map Undo.

Checkpoint = **current materialized map** (surface, exceptional voxel columns, objects/components, lava,
geology, fallen poses, retained lakes, agreed water/soil), seq, claims/offers, both players' last 50 patch
records and dependency fences. Tail is only commands after that checkpoint. No old force is rerun when
rejoining. Keep immutable map-file metadata/provenance alongside this payload in the milestone.
Capture checkpoint/tail under the host queue; clear “ready” through transfer. Freeze on drop on **both** sides;
the spike's ten offline host edits are superseded by brief §7. Refresh persistence goes in both Your maps.

Use agreed **canonical** water for authoritative force planning and hashes. The conservative milestone
choice is a water-completion barrier before hydrological commits/notices or force previews; live animation
is local presentation. Coalescing settles across authors needs explicit batch attribution, not “last author”.
Measure that barrier before adopting it: it adds latency, and the prototype benchmarks do not hide it.

`presence {epoch,counter,baseSeq,cursor,tool,stroke,view}` at 15 Hz, latest packet wins. Cursor and stroke
points are quarter-tile integers; null cursor hides it. Stroke = ID, part, bounded point delta, ended flag;
send a start/keyframe reliably (as a presence packet on `map`) and periodically for recovery. A dropped
segment never edits the map. `view` = target xyz, distance, yaw, pitch; Go to reads this on demand.
Name/colour come from the agreed player identity. Fade presence after 1 second; reset stroke on a gap/new ID.
The reliable commit starts deterministic force playback; progress is derived locally, not more map edits.

Ingress limits for the milestone: 16 KiB chunks, 8 MiB compressed / 64 MiB expanded checkpoint initially,
core's MAX_DABS/path limits, ≤72 points per presence packet, exact finite integers/bounds, at most one
snapshot under reassembly, SHA-256 before adoption. Oversized valid maps need an explicit streamed codec.
`channel.ts` proves ordering/authority/pause/cache boundaries; it is not the complete network/schema parser.
