# src/collab: the connection for collaborative editing

The browser side of D431 and D486: no UI, no editor code. The page (and later the session logic) uses `CollabTransport`
and shows the errors' messages.

```ts
import { hostSession, joinSession } from "./collab/transport";

const host = hostSession({ name: "Emma" });            // a session id is made; pass one to carry a session on
host.on("code", ({ code, expiresInMs }) => show(code)); // the Invite: short, single use, a few minutes (counted here, not by clock)
host.on("connected", ({ peer, sessionId }) => ...);
host.on("message", (payload) => ...);                   // string or Uint8Array, whole, in order
host.on("presence", (payload) => ...);                  // unordered, may be lost
host.on("refreshed", () => ...);                        // the relay's login was renewed; nothing to do
host.on("renewal-failed", (e) => ...);                  // the relay's login can't be renewed: said plainly, retried; the connection ends when it runs out
host.on("dropped", ({ reason }) => ...);                // "left" | "timeout" | "channel-closed" | "connection-failed" | "credentials-expired"
host.on("error", (e) => showPlainly(e.message));        // CollabError: kind + a sentence for the player
await host.connect();                                   // resolves when connected, rejects with the same error

const guest = joinSession(typedCode, { sessionId });    // the guest's stored session id, if rejoining
await guest.connect();
await guest.send(bytesOrText);                          // chunked, with backpressure; resolves when handed to the connection
guest.sendPresence(json);                               // dropped if the channel is busy, never queued
```

## How it connects

- `signal.ts`: the function's client (`collab-worker/`): make a room, join with a code, get the relay's login, and the
  room's WebSocket that passes the offer, answer and candidates (and a keepalive while the host waits).
- `transport.ts`: one `RTCPeerConnection` with `iceTransportPolicy: "relay"` and **only** the function's servers, so there
  is no direct path and neither player sees the other's address. Only candidates of type `relay` are sent or accepted (the
  function refuses the others as well), an offer or answer with another kind of candidate is refused, and once the data
  channel opens the transport checks that **both** ends of the selected pair are relayed, closing with `not-relayed`
  otherwise. The host makes both channels: `ops` (reliable, ordered) and `presence` (unordered, no retransmits). The relay's
  login is asked for once the guest is in the room (the host) or has joined (the guest).
- `framing.ts`: messages cut into frames of at most 16 KiB (the size browsers agree on) and put back together in order; a
  rejoin snapshot of about 1 MB is 64 frames. Sending waits while more than 256 KiB is buffered. Messages over 64 MiB, and
  frames out of order, are refused (`protocol` error). A message that arrives while the transport is still checking the
  relay is held and handed over, in order, right after `connected`.
- Heartbeats: a ping every second; 10 seconds without any traffic is a drop (`timeout`), and a gap between two ticks of more
  than twice the interval (a stalled page) restarts the count. A closed channel or a failed connection is a drop at once;
  `close()` says goodbye so the other side sees `left`.
- **Long sessions.** Each side keeps the room's socket open (a keepalive holds it) until the room says it is done: when both
  have reported connected, the room gives each a session token, however far apart the reports are, within the room's
  two-minute setup window (a side that never gets one says so with `renewal-failed`; it is retried every 15 s). Shortly
  before the relay's login runs out, each fetches a fresh one with the token (`POST /session/ice`), calls `setConfiguration`,
  and the host restarts ICE with an offer and answer carried by the data channel (control frames `renego` and `cand`); the old
  path keeps carrying data until the new one is chosen, then `refreshed` fires. If the login ran out without a renewal (the
  function was unreachable, or the session outlived the token's day), the break that follows is reported as
  `credentials-expired`, not as a plain drop.

## Reconnecting

A transport is one connection. After `dropped` (or `error`), make a new one with the same `sessionId`: the host calls
`hostSession({ sessionId })` for a new code, the guest `joinSession(code, { sessionId })`. Hello carries the session id,
a protocol number and a fresh `epoch` per connection; a guest whose session id differs from the host's is refused
(`session-mismatch`). What is re-sent after a reconnect (the map and the edits since) is the session layer's job.

## Errors

`CollabError.kind` is one of `unavailable` ("Collaboration is unavailable right now: the room service can't be
reached."), `relay-unavailable` ("...the relay can't be reached."), `bad-code`, `code-expired`, `code-used`,
`rate-limited`, `connect-failed`, `incompatible`, `session-mismatch`, `not-relayed`, `closed`, `protocol`. Editing alone
never depends on any of this. `collabConfigured()` is false until `config.ts` has the deployed address.

## The site's content-security policy

The site sets none today (`index.html`). If one is added, `connect-src` needs `COLLAB_CONNECT_ORIGINS` (the function's
https and wss origins); WebRTC to the relay is not governed by `connect-src`.

Tests: `tests/unit/collab*.test.ts` (rules, relay login, framing) and `tests/collab/` (two real browsers over the relay;
see `collab-worker/README.md`).

## The session: `CollabClient` (`client.ts`)

The page's one object (D486): it owns the transport above and talks to the session in the generator worker
(`worker/collab.ts`, where the map lives; the logic is `core/collab/peer.ts`). No UI; the page shows the words the events
carry. The worker is `api.collab` of the generator worker's Comlink proxy.

```ts
const collab = new CollabClient(api.collab);                    // { baseUrl } for a local function, { transport } for timings (tests)
collab.on("code", ({ code, expiresInMs }) => showInvite(code));
const { code, sessionId } = await collab.startHosting({ name: "Emma" });   // the map open in the editor is the session's
await collab.join(typedCode, { name: "Bo" });                   // resolves once the host's map is open here (events: open, joined)
await collab.leave();                                           // the other is told at once; the session is kept (a `keep` event)
```

**Asking.** While a session is live the page orders every change through the client instead of applying it to the map:
`submit(command)` for an `edit` (operations and a label), a `select` action or a `force` (a gesture with its seed; see
`core/collab/types.ts`), `undo()`, `redo()`, `claim(command)`, `previewForce(gesture)` (on the settled water; busy while it
settles), `reachRefusal(ops)` (the line shown before release: "Reaches into Ada's area") and `reachBand(ops)` (the tiles to
draw in the other's colour while a stroke is drawn), `plan(redo)` (what Undo does and the blocked ones it skips, each named),
`claimsView()` (runs of each player's ground and the offers waiting), `presence({ cursor, tool, view, stroke })` in tiles
(runs on the page’s thread beside the transport, never through the worker, so a cursor does not wait behind a force or an edit; throttled to 15 a second; a stroke is `{ id (new for each stroke), points, end }`, `stroke: null` cancels), `resync()` (the guest, after a
`desync`), `project()` (a copy to save while paused) and `state()`. Every answer is the host's: `{ ok: true, seq }` or
`{ ok: false, reason }` in one plain line (with `busy` while the water settles: the client asks again after the settle by itself,
`block` naming what is in the way of an undo). The map then changes: the `update` event is an edit's answer; `open` is a whole
other map (the guest's copy of the host's, after a join or rejoin).

**The host's whole-map change (§9).** `announceNewMap(name)` before generating or loading ("<name> is opening a new map" reaches the
guest at once), then, once the new map is open in the editor, `newMap(name)` (or `cancelNewMap()` if it will not be opened). Both players get a `keep` for the previous map.

**Events** (`client.on(type, fn)`; all in `ClientEvents`):

| event | when | the page shows |
| --- | --- | --- |
| `code` | an Invite was made | the short code |
| `joined`, `resumed` | the other is in; they came back | "Bo joined" |
| `paused` | the other left or the connection dropped (`message`) | "Bo has left. Waiting to reconnect." The map is read-only; every `submit` and `claim` answers with the same line until `resumed` |
| `keep` | at a pause (when the session was live), at Leave, and the old map on a whole-map change (`project`, `name`, `sessionId`, `role`, `seq`, `epoch`: the name, log position and epoch of the map being kept, so two keeps can be told apart) | puts the project in Your maps (below) |
| `presence`, `stroke`, `presence-cleared` | the other's cursor, tool, camera and stroke before release (name and colour included) | their cursor; stays until their pointer leaves the map or the session pauses (a still pointer sends nothing); "Go to" reads `view` |
| `claims` | a claim, release, offer, accept or decline stood (`by`, `command`, `offer`) | the outlines; an offer to answer |
| `note` | the other's edits changed the water in your area (`note.centre` is where "See it" goes, `text` the words) | a quiet note |
| `applied` | an entry was applied (`author`, `mine`, `kind`, `label`) | |
| `refused` | a request or claim was refused (`reason`, `block`) | the reason |
| `opening`, `new-map` | the host is opening another map; it is open | "Ada is opening a new map" |
| `desync` | this copy (or the other's) differs from the host's (`reason`) | loudly; the guest's page offers `resync()` |
| `settled` | the water settled for entry `seq` and matched the host's | |
| `unavailable` | the room-code function or the relay is down | "Collaboration is unavailable right now: ..."; editing alone is unaffected |
| `failed`, `error` | a connection that could not be made or kept; a message that could not be used (e.g. another version) | the sentence |

**Your maps (§8).** `keep.project` is a normal project (`MapSession.project()`): it opens alone later like any map. Your maps keeps
projects as `YourMapEntry` + bytes through `src/platform/yourMaps.ts` `put(entry, project, expected)`; the page makes the entry
(`id`, `name`, `kind`, times, `thumbnail`, `revision`, `bytes`, `size`) as for any save, and may use `collab-<sessionId>` as the id so
a session is one entry that keeps updating (the old map of a whole-map change gets its own).

**Pausing and rejoining (§7).** A drop pauses both sides, read-only. The host calls `startHosting` again (same session id, a new
code); the guest `join`s with the new code (and its `sessionId` if its page was reloaded). The guest always gets the host's latest
checkpoint, its records and claims, and the entries since, never the history, whether it is the same browser or a new one.
A request sent when the connection dropped is held and answered by the rejoin from what the host says of it: `{ ok: true, seq }` if it ordered it,
the host’s reason if it refused it, "The connection dropped before this was confirmed" if it never arrived. A host that restarted (its
map reopened from Your maps, the same session id) counts from nothing: the guest’s numbers start again with the new map.

**What the page must do** (the page piece): route every edit, Select action, force, undo and redo through `submit`/`undo`/`redo`
while `state()` is not null (a session exists, even while the host waits for the guest); show the events; put `keep` projects in Your maps; fade presence; draw claims.
`tests/collab/session.spec.ts` drives all of this from a page with no UI (`tests/collab/sessionPage.ts`).
