# src/collab: the connection for collaborative editing

The browser side of D431 and D486: no UI, no editor code. The page (and later the session logic) uses `CollabTransport`
and shows the errors' messages.

```ts
import { hostSession, joinSession } from "./collab/transport";

const host = hostSession({ name: "Emma" });            // a session id is made; pass one to carry a session on
host.on("code", ({ code }) => show(code));              // the Invite: short, single use, a few minutes
host.on("connected", ({ peer, sessionId }) => ...);
host.on("message", (payload) => ...);                   // string or Uint8Array, whole, in order
host.on("presence", (payload) => ...);                  // unordered, may be lost
host.on("dropped", ({ reason }) => ...);                // "left" | "timeout" | "channel-closed" | "connection-failed"
host.on("error", (e) => showPlainly(e.message));        // CollabError: kind + a sentence for the player
await host.connect();                                   // resolves when connected, rejects with the same error

const guest = joinSession(typedCode, { sessionId });    // the guest's stored session id, if rejoining
await guest.connect();
await guest.send(bytesOrText);                          // chunked, with backpressure; resolves when handed to the connection
guest.sendPresence(json);                               // dropped if the channel is busy, never queued
```

## How it connects

- `signal.ts`: the function's client (`collab-worker/`): make a room, join with a code, get the relay's login, and the
  room's WebSocket that passes the offer, answer and candidates.
- `transport.ts`: one `RTCPeerConnection` with `iceTransportPolicy: "relay"` and **only** the function's servers, so there
  is no direct path and neither player sees the other's address. After the data channel opens the transport checks the
  selected candidate pair is relayed and closes with `not-relayed` otherwise. The host makes both channels: `ops`
  (reliable, ordered) and `presence` (unordered, no retransmits).
- `framing.ts`: messages cut into frames of at most 16 KiB (the size browsers agree on) and put back together in order; a
  rejoin snapshot of about 1 MB is 64 frames. Sending waits while more than 256 KiB is buffered. Messages over 64 MiB, and
  frames out of order, are refused (`protocol` error).
- Heartbeats: a ping every second; 4 seconds without any traffic is a drop (`timeout`). A closed channel or a failed
  connection is a drop at once; `close()` says goodbye so the other side sees `left`.

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
