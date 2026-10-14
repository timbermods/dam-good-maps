# collab-worker: the room-code function

The small serverless function behind collaborative editing (D431). A Cloudflare Worker with one Durable Object per room.
It hands out a short room code, passes the connection setup between the two browsers and gives each of them the relay's
short-lived login. **It never carries map data** (that goes through the relay, encrypted between the browsers), never holds
the relay's key in the page, and keeps nothing once the two are connected.

## What it does

1. The host's page calls `POST /rooms`: a 6-character code (letters and digits with no 0/O/1/I/L) and a room key. The code
   works for 5 minutes and for one guest.
2. The guest's page calls `POST /rooms/{code}/join` with the code the player typed: a key of their own. The code is spent.
3. Each page asks `POST /rooms/{code}/ice` (bearer key) for the relay's login: only a holder of a room key gets it, at most
   6 times per room. The Worker asks Cloudflare Realtime TURN for short-lived credentials (`ttl` from `TURN_TTL_SECONDS`,
   default 4 hours) and passes on only the TURN servers.
4. Each page opens `GET /rooms/{code}/ws` (WebSocket, hibernation API) and proves its key with its first message. When both
   are in, each gets `ready`; the host sends its offer and both trickle candidates. Only these setup messages pass, opaque
   (16 KiB each, 120 per room).
5. When both report `connected`, or when the room expires (5 minutes, or 2 minutes after the guest joins if that is later),
   the room deletes everything and closes the sockets. What a room holds: SHA-256 of the two keys, times and counters.
   No addresses, no setup content.
6. `GET /health` says whether the function is up and the relay is set up.

Limits: 6 rooms and 30 join tries per minute per address (best effort, in a Durable Object's memory); at most 4 sockets per
room. CORS and the WebSocket accept only `ALLOWED_ORIGINS` (the site) and, when `ALLOW_LOCAL_ORIGINS=1`, localhost pages.
A request without an Origin (not from a page) passes: CORS keeps other pages out, it is not a key.

The rules are plain functions in `src/room.ts` (tested in `tests/unit/collabRoom.test.ts`); `src/roomObject.ts` stores the
record and moves sockets; `src/index.ts` routes; `src/ice.ts` asks the relay.

## Settings

| Name | Kind | What |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | variable (`wrangler.jsonc`) | Exact origins that may call from a page, comma-separated. Default `https://timbermods.github.io`. |
| `ALLOW_LOCAL_ORIGINS` | variable | `1` also accepts localhost pages. Off in production. |
| `TURN_TTL_SECONDS` | variable | How long the relay's login lasts. A login serves the whole session, so it outlasts a room. |
| `CF_TURN_KEY_ID`, `CF_TURN_KEY_API_TOKEN` | **Worker secrets** | The relay's key id and API token (Cloudflare dashboard, Realtime, TURN). Never in the page. |
| `LOCAL_TURN_URLS`, `LOCAL_TURN_USERNAME`, `LOCAL_TURN_CREDENTIAL` | variables, local only | A local TURN server's address and static login, used instead of Cloudflare (tests). |

## Local development

```sh
npm ci --prefix collab-worker
cd collab-worker
npx wrangler dev --var ALLOW_LOCAL_ORIGINS:1 --var LOCAL_TURN_URLS:turn:127.0.0.1:3478
```

`tests/collab/` runs the whole path with no account: this Worker under `wrangler dev`, a local TURN server (`node-turn`) and
two separate browser processes, relay only. Run it with `npx playwright test -c playwright.collab.config.ts` (installed
Chrome and Edge locally when Playwright's Firefox is not installed; CI uses Chromium and Firefox).
`.github/workflows/collab.yml` runs it on changes here and nightly.

## Deploying (Kyler's Cloudflare account)

Needs a Cloudflare account with Workers and Realtime TURN. Four repository secrets, set with `gh secret set <NAME>` (never
pasted in chat):

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token that may edit Workers (the "Edit Cloudflare Workers" template). |
| `CLOUDFLARE_ACCOUNT_ID` | The account's id (dashboard, Workers & Pages, right side). |
| `CF_TURN_KEY_ID` | The TURN key's id (Realtime, TURN, create a key). |
| `CF_TURN_KEY_API_TOKEN` | That key's API token. |

`.github/workflows/collab-worker.yml` deploys on a push to `main` that touches `collab-worker/` and by hand (Actions, Deploy
collaboration function, Run workflow), and sets the two TURN secrets on the Worker. With the first two secrets missing it
skips with a notice and succeeds; with the TURN pair missing it deploys, and `GET /health` reports `"relay": false`, so the
page says collaboration is unavailable. The run's summary prints the Worker's address
(`https://dam-good-maps-collab.<account>.workers.dev`); put it in `src/collab/config.ts` (`COLLAB_WORKER_URL`).
