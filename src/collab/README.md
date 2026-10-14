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
