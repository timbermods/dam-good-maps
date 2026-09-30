# Collaborative editing connection spike

A standalone file: two players, two codes, one host-ordered map. No web server, signaling service, relay, or CDN. The optional public STUN service only looks up addresses.

## Run

From the repository root, with Node 22 or newer:

```sh
npm ci --prefix investigation/collab-spike
npm run build --prefix investigation/collab-spike
```

Open `investigation/collab-spike/local/demo.html` in Chrome, Edge, or Firefox. Open it again for the second player.

1. Host: **Host · Invite** → **Copy code** → send the Invite.
2. Guest: **Join a map** → paste Invite → **Use pasted code** → **Copy code** → send the Reply.
3. Host: paste Reply → **Use pasted code**. Wait for **Connected · maps match**.
4. Pick an edit and click the map. **250 mixed edits** on both sides sends 500 mixed operations.
5. **Drop connection**, edit on the host, then exchange fresh codes. The guest generates the base again and replays the host's entire ordered log.

Keep the host tab open. Its map and log live in memory; closing or refreshing it loses the session. Guest edits stop on a drop. A pending edit may already have reached the host; rejoin reveals the accepted result. Host edits work offline.

**Save check results** downloads hashes, timings, code lengths and the host's ordered operations. SHA-256 covers full terrain columns, water and contamination, soil fields, and all objects' components. Each comparison uses the same sequence number, even when the host has already applied a later edit. A mismatch stops editing. The spike settles water canonically after edits; this small synchronous view is not the product's live water animation.

## Two devices

Build once. Copy the same `local/demo.html` file to both computers by USB or another file transfer. Open each local copy in a desktop browser. On the same network leave **Different networks: use public STUN** off. Guest Wi-Fi isolation or a firewall can still block the connection.

For an internet trial, connect one computer to home Wi-Fi and the other to a phone hotspot with the phone's Wi-Fi disabled. Enable **Different networks: use public STUN** on both before making codes. Exchange codes using a trusted channel, try edits and rejoin, then save results on both. Gathered codes expire after five minutes; the host gives connection checks 45 seconds after accepting the Reply.

Codes contain connection addresses and credentials; avoid posting them publicly. The browser encrypts the peer channel with DTLS. There is no TURN configuration or fallback relay. Some network pairs cannot connect: see [REPORT.md](REPORT.md).

## Reproduce checks

```sh
npx --prefix investigation/collab-spike playwright install chromium
npm run check --prefix investigation/collab-spike
```

`check.mjs` opens two tabs directly from `file://`, uses real WebRTC, sends mixed operations concurrently, verifies each full-map hash, drops midway, adds host edits offline and checks a fresh replay. It also rejects an invalid operation and tries public STUN gathering. It writes `local/results.json`, peer logs and two screenshots. No HTTP server is started.

Optional: install Firefox with Playwright and set `CHECK_FIREFOX=1` to add a Chromium/Firefox replay and editing check. `PLAYWRIGHT_MODULE` can point to a bundled Playwright module as a file URL; `CHROMIUM_PATH` and `FIREFOX_PATH` can select installed executables.

`SPIKE_BATCH=15` runs the focused check; the default is 125 mixed requests per player in each half (500 total). The harness snapshots its HTML at start, so a later build cannot change its peer versions mid-check.

All generated HTML, captures, raw measurements and operation logs stay in gitignored `local/`. Rebuild after pulling a different product revision. Source imports the actual generator, headless MapSession, brush operation and Carve run/result helpers from `../../src/core/`; product files are untouched.

## Choices

Seed 349, River Valley, 48×48, one generation attempt. Both peers run exactly the same seed/settings and pinned code. This is a connection and replay proof, not a map-quality sample.

The host validates each request against its current MapSession, assigns one sequence number, applies it, hashes the result and sends that committed operation. The guest applies only committed operations and acknowledges its own full-map hash. Ordered reliable SCTP, 12,000-character message chunks and a buffered-send limit carry large replay logs. Ping/pong notices a silent loss after 12 seconds when the page can run.

Codes use a versioned, reversible SDP dictionary, then maximum DEFLATE and base64url. The encoder chooses ordinary DEFLATE instead if it is shorter. No connection addresses or fingerprints are removed.

Carve runs once on its author's current map; its real operation records literal changed levels. Concurrent edits can make that result stale, and later literal levels can overwrite earlier work. The host's order guarantees a shared result, not preservation of both players' intentions. Undo and seeing each other are outside this spike.
