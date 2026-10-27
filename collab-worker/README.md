# collab-worker: the room-code function

The small serverless function behind collaborative editing (D431). A Cloudflare Worker with one Durable Object per room.
It hands out a short room code, passes the connection setup between the two browsers and gives each of them the relay's
short-lived login. **It never carries map data** (that goes through the relay, encrypted between the browsers), never holds
the relay's key in the page, and keeps nothing once the two are connected.

## What it does

1. The host's page calls `POST /rooms`: a 6-character code (letters and digits with no 0/O/1/I/L) and a room key. The code
   works for 5 minutes and for one guest. The host's room socket (`GET /rooms/{code}/ws`, hibernation API, key proven in the
   first message) is kept alive with a `ping`; if the host's socket closes before anyone has joined, the room is deleted.
2. The guest's page calls `POST /rooms/{code}/join` with the code the player typed: a key of their own. The code is spent.
3. **Relay logins go out only once the guest has joined**, and only to a holder of a room key: `POST /rooms/{code}/ice`
   (bearer key), 3 times per room at most. The Worker asks Cloudflare Realtime TURN for short-lived credentials
   (`TURN_TTL_SECONDS`, default 2 hours; the browsers renew it) and passes on only the TURN servers.
4. When both players are in the room each gets `ready`; the host sends its offer and both trickle candidates. **Only an
   offer, an answer and relayed candidates pass** (`typ relay`, no address of the sender's: `raddr` absent or 0.0.0.0), 16 KiB
   each, 120 per room; anything else is refused with a one-line reason. A message for a player who has already left the room
   is dropped quietly (`no-peer`), since each side leaves once it is connected.
5. Each player reports `connected` with the session id. When both have, the room gives each a **session token**
   (`st1.<payload>.<mac>`, signed with a key the Keeper object makes on first use and never lets out, bound to the session id,
   good for `SESSION_TOKEN_TTL_SECONDS`, default 24 hours, and for at most `MAX_TOKEN_RENEWALS`, default 12, fresh logins),
   deletes everything and closes the sockets. The same happens, without
   tokens, when the room expires (5 minutes, or 2 minutes after the guest joins if that is later). What a room holds: SHA-256 of
   the two keys, times and counters. No addresses, no setup content.
6. During a long session each browser calls `POST /session/ice` (bearer session token) shortly before its login runs out, and
   the host restarts ICE over the data channel (src/collab/README.md). No room is needed for that.
7. `GET /health` says whether the function is up and the relay is set up.

**Limits against abuse.** A request must come from the site's page (an allowed `Origin`); only local development (`ALLOW_LOCAL_ORIGINS=1`)
also accepts calls with no Origin and localhost pages. Per address (an IPv6 address counted by its /64): 6 rooms, 30 join tries,
20 relay-login requests and 30 socket opens per minute (best effort, in a Durable Object's memory). Relay logins are also
counted per day in the Keeper object, which persists: **at most `MAX_DAILY_MINTS_PER_ADDRESS` (default 60) from one address (an
IPv6 /64) and `MAX_DAILY_MINTS` (default 3000) in all**, so no one address can use up the day. These cap logins, not bytes: the
billing alert below is the real ceiling on what the relay costs. At most 4 sockets per room.

The rules are plain functions in `src/room.ts` (tested in `tests/unit/collabRoom.test.ts` and `collabRules.test.ts`);
`src/roomObject.ts` stores the record and moves sockets; `src/keeper.ts` holds the day's count and the token key;
`src/index.ts` routes; `src/ice.ts` asks the relay.

## Settings

| Name | Kind | What |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | variable (`wrangler.jsonc`) | Exact origins that may call from a page, comma-separated. Default `https://timbermods.github.io`. |
| `ALLOW_LOCAL_ORIGINS` | variable | `1` also accepts localhost pages and calls with no Origin. Off in production. |
| `TURN_TTL_SECONDS` | variable | How long the relay's login lasts (default 2 hours) before the browsers renew it with their session tokens. |
| `MAX_DAILY_MINTS`, `MAX_DAILY_MINTS_PER_ADDRESS` | variable | Relay logins handed out per day, all together and per address (an IPv6 /64). |
| `MAX_TOKEN_RENEWALS` | variable | Fresh logins one session token may fetch. |
| `SESSION_TOKEN_TTL_SECONDS` | variable | How long a session token lasts. |
| `CF_TURN_KEY_ID`, `CF_TURN_KEY_API_TOKEN` | **Worker secrets** | The relay's key id and API token (Cloudflare dashboard, Realtime, TURN). Never in the page. |
| `LOCAL_TURN_URLS`, `LOCAL_TURN_USERNAME`, `LOCAL_TURN_CREDENTIAL` | variables, local only | A local TURN server's address and static login, used instead of Cloudflare (tests). |

## Local development

```sh
npm ci --prefix collab-worker
cd collab-worker
npx wrangler dev --var ALLOW_LOCAL_ORIGINS:1 --var LOCAL_TURN_URLS:turn:127.0.0.1:3478
```

`tests/collab/` runs the whole path with no account: this Worker under `wrangler dev`, a local TURN server (`node-turn`) and
two separate browser processes, relay only (`npx playwright test -c playwright.collab.config.ts`). It covers the connection,
ordered messages, a killed peer, a reconnect, and the renewal of the relay's login (a stack with an 8-second login).
`.github/workflows/collab.yml` runs it on changes here and nightly (Chromium and Firefox in CI; Chrome and Edge locally,
Firefox with `DGM_COLLAB_FIREFOX=1` where Playwright's Firefox starts).

## Deploying (Kyler's Cloudflare account)

Needs a Cloudflare account with Workers and Realtime TURN. Four secrets, set with `gh secret set <NAME> --env collab-production`
(never pasted in chat; create the environment first in Settings, Environments, and restrict it to the `main` branch):

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token that may edit Workers (the "Edit Cloudflare Workers" template). |
| `CLOUDFLARE_ACCOUNT_ID` | The account's id (dashboard, Workers & Pages, right side). |
| `CF_TURN_KEY_ID` | The TURN key's id (Realtime, TURN, create a key). |
| `CF_TURN_KEY_API_TOKEN` | That key's API token. |

`.github/workflows/collab-worker.yml` deploys on a push to `main` that touches `collab-worker/` and by hand from `main` (Actions,
Deploy collaboration function, Run workflow), and sets the two TURN secrets on the Worker. With the first two secrets missing it
skips with a notice and succeeds; with the TURN pair missing it deploys, and `GET /health` reports `"relay": false`, so the page
says collaboration is unavailable. The run's summary prints the Worker's address
(`https://dam-good-maps-collab.<account>.workers.dev`); put it in `src/collab/config.ts` (`COLLAB_WORKER_URL`). Then run
**Collaboration connection (deployed)** (`collab-live.yml`) with that address: the same two-browser test over the real function
and Cloudflare's relay.

**Set a billing alert** in the Cloudflare dashboard (Billing, Notifications) for Realtime TURN and Workers usage before the
function is public. Realtime TURN's free allowance is large, and the function caps itself at `MAX_DAILY_MINTS` logins a day, but
the alert is the backstop; if it ever fires, lower `MAX_DAILY_MINTS` and redeploy, or delete the TURN key.
