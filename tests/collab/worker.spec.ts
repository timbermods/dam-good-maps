// The room-code function as a client sees it, run by `wrangler dev` (no browser): a code is single-use, keys open
// only their own room, the relay's credentials go only to a key holder once the guest has joined, the setup passes
// between the two and nothing else (relayed candidates only), the room is deleted once both are connected and each
// gets a session token, and the limits and origin rules hold.
import { expect, test } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { Wire, makeApi } from "./wire";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial" });

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack();
});
test.afterAll(async () => {
  await stack?.stop();
});

// each test uses its own "address" so the per-address limits don't mix
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;
const pageOrigin = () => stack.pageUrl.replace(/\/$/, "");
const api = (ip = nextIp()) => makeApi(stack, ip);

const OFFER = JSON.stringify({ k: "offer", sdp: "v=0\r\na=candidate:1 1 udp 2 192.0.2.1 5000 typ relay raddr 0.0.0.0 rport 0\r\n" });
const RELAY_CAND = JSON.stringify({ k: "cand", c: { candidate: "candidate:1 1 udp 2 192.0.2.1 5000 typ relay raddr 0.0.0.0 rport 0", sdpMid: "0", sdpMLineIndex: 0 } });

test("a code is short, works once, and a wrong one is refused plainly", async () => {
  const a = api();
  const made = await a.create();
  expect(made.status).toBe(201);
  const room = (await made.json()) as { code: string; hostSecret: string; expiresAt: number; codeTtlMs: number };
  expect(room.code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  expect(room.codeTtlMs).toBeLessThanOrEqual(10 * 60_000);
  expect(room.expiresAt).toBeGreaterThan(Date.now());

  // what a player types: lower case, a dash, spaces
  const typed = `${room.code.slice(0, 3)}-${room.code.slice(3)}`.toLowerCase();
  const first = await a.join(encodeURIComponent(` ${typed} `));
  expect(first.status).toBe(200);
  expect(((await first.json()) as { guestSecret: string }).guestSecret.length).toBeGreaterThan(10);
  const second = await a.join(room.code);
  expect(second.status).toBe(409);
  expect(((await second.json()) as { error: { kind: string } }).error.kind).toBe("taken");

  for (const bad of ["ZZZZZZ", "abc", "OOOOOO"]) {
    const r = await a.join(bad);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain("isn't right");
  }
  // a broken %-escape is a plain 400 with the page's CORS header, not a crash
  const broken = await a.join("%E0%A4%A");
  expect(broken.status).toBe(400);
  expect(broken.headers.get("access-control-allow-origin")).toBe(pageOrigin());
});

test("relay credentials go only to a key holder, once the guest has joined, and only a few times", async () => {
  const a = api();
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  // nobody has joined: no credentials, even for the host
  const early = await a.ice(room.code, room.hostSecret);
  expect(early.status).toBe(409);
  expect(((await early.json()) as { error: { kind: string } }).error.kind).toBe("not-ready");
  await a.join(room.code);

  expect((await a.ice(room.code)).status).toBe(401);
  expect((await a.ice(room.code, "not-the-key")).status).toBe(401);
  expect((await a.ice("ZZZZZZ", room.hostSecret)).status).toBe(404);
  const ok = await a.ice(room.code, room.hostSecret);
  expect(ok.status).toBe(200);
  const body = (await ok.json()) as { iceServers: { urls: string[]; username: string; credential: string }[]; ttl: number };
  expect(body.iceServers).toHaveLength(1);
  expect(body.iceServers[0].urls[0]).toContain(`127.0.0.1:${stack.turnPort}`);
  expect(body.iceServers[0].username).toBeTruthy();
  expect(body.iceServers[0].credential).toBeTruthy();
  for (let i = 1; i < 3; i++) expect((await a.ice(room.code, room.hostSecret)).status).toBe(200);
  expect((await a.ice(room.code, room.hostSecret)).status).toBe(429);
  // a key from another room opens nothing here
  const other = (await (await a.create()).json()) as { hostSecret: string };
  expect((await a.ice(room.code, other.hostSecret)).status).toBe(401);
});

test("the two sockets pass offers, answers and relayed candidates and nothing else; each gets a session token when both are connected", async () => {
  const a = api();
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  const guestKey = ((await (await a.join(room.code)).json()) as { guestSecret: string }).guestSecret;

  const host = new Wire(a.ws(room.code));
  const guest = new Wire(a.ws(room.code));
  await Promise.all([host.open(), guest.open()]);

  // a wrong key is refused and the socket closed; nothing passes before a key is proven
  const stranger = new Wire(a.ws(room.code));
  await stranger.open();
  stranger.send({ t: "signal", data: OFFER });
  await stranger.next("error");
  stranger.send({ t: "auth", secret: "nope" });
  await expect.poll(() => stranger.closed?.code).toBe(1008);

  host.send({ t: "auth", secret: room.hostSecret });
  await host.next("authed");
  // the other side is not in the room (yet, or any more): that is not an error
  host.send({ t: "signal", data: RELAY_CAND });
  await host.next("no-peer");
  expect(host.messages.some((m) => m.t === "error")).toBe(false);
  guest.send({ t: "auth", secret: guestKey });
  await guest.next("authed");
  await host.next("ready");
  await guest.next("ready");

  host.send({ t: "signal", data: OFFER });
  expect((await guest.next("signal")).data).toBe(OFFER);
  guest.send({ t: "signal", data: JSON.stringify({ k: "answer", sdp: "v=0" }) });
  await host.next("signal");
  host.send({ t: "signal", data: RELAY_CAND });
  await expect.poll(() => guest.messages.filter((m) => m.t === "signal").length).toBe(2);

  // nothing but an offer, an answer and relayed candidates passes
  const refused: string[] = [
    "just text",
    JSON.stringify({ k: "bye" }),
    JSON.stringify({ k: "cand", c: { candidate: "candidate:1 1 udp 2 192.0.2.1 5000 typ host" } }),
    JSON.stringify({ k: "cand", c: { candidate: "candidate:1 1 udp 2 192.0.2.1 5000 typ srflx raddr 10.0.0.2 rport 1" } }),
    JSON.stringify({ k: "cand", c: { candidate: "candidate:1 1 udp 2 192.0.2.1 5000 typ relay raddr 10.0.0.2 rport 1" } }),
    JSON.stringify({ k: "offer", sdp: "v=0\r\na=candidate:1 1 udp 2 10.0.0.2 5000 typ host\r\n" }),
  ];
  const before = host.messages.length;
  for (const data of refused) host.send({ t: "signal", data });
  await expect.poll(() => host.messages.slice(before).filter((m) => m.t === "error").length).toBe(refused.length);
  expect(guest.messages.filter((m) => m.t === "signal")).toHaveLength(2);

  // a waiting player's keepalive is answered
  host.ws.send("ping");
  await host.next("raw");

  // too large a setup message closes that socket; a reconnecting player replaces their earlier socket
  const big = new Wire(a.ws(room.code));
  await big.open();
  big.send({ t: "auth", secret: guestKey });
  await big.next("authed");
  await expect.poll(() => guest.closed?.reason).toBe("Replaced");
  big.send({ t: "signal", data: "x".repeat(20_000) });
  await expect.poll(() => big.closed?.code).toBe(1009);

  // both report connected: everything is deleted, the sockets are closed, and each is given a session token
  const guest2 = new Wire(a.ws(room.code));
  await guest2.open();
  guest2.send({ t: "auth", secret: guestKey });
  await guest2.next("authed");
  host.send({ t: "connected", sessionId: "session-1" });
  guest2.send({ t: "connected", sessionId: "session-1" });
  const hostClosed = await host.next("closed");
  const guestClosed = await guest2.next("closed");
  expect(hostClosed.reason).toBe("done");
  const tokens = [hostClosed.token, guestClosed.token] as string[];
  for (const t of tokens) expect(t).toMatch(/^st1\./);
  expect((await a.join(room.code)).status).toBe(404);
  expect((await a.ice(room.code, room.hostSecret)).status).toBe(404);

  // the token buys a fresh relay login for the session, and a forged or missing one does not
  expect((await a.sessionIce()).status).toBe(401);
  expect((await a.sessionIce(`${tokens[0].slice(0, -3)}AAA`)).status).toBe(401);
  expect((await a.sessionIce("st1.e30.AAAAAAAAAAAAAAAAAAAAAAAA")).status).toBe(401);
  for (const t of tokens) {
    const r = await a.sessionIce(t);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { iceServers: unknown[] }).iceServers).toHaveLength(1);
  }
});

test("a host who leaves before anyone has joined takes the room with them", async () => {
  const a = api();
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  const host = new Wire(a.ws(room.code));
  await host.open();
  host.send({ t: "auth", secret: room.hostSecret });
  await host.next("authed");
  host.ws.close();
  await expect.poll(async () => (await a.join(room.code)).status).toBe(404);
});

test("only the site's pages may call it, and a flood from one address is stopped", async () => {
  const ip = nextIp();
  const headers = { "CF-Connecting-IP": ip };
  const refused = await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers: { ...headers, Origin: "https://evil.example" } });
  expect(refused.status).toBe(403);
  const allowed = await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers: { ...headers, Origin: pageOrigin() } });
  expect(allowed.status).toBe(201);
  expect(allowed.headers.get("access-control-allow-origin")).toBe(pageOrigin());
  const preflight = await fetch(`${stack.workerUrl}/rooms`, { method: "OPTIONS", headers: { ...headers, Origin: pageOrigin(), "Access-Control-Request-Method": "POST" } });
  expect(preflight.status).toBe(204);

  let limited = 0;
  for (let i = 0; i < 10; i++) if ((await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers })).status === 429) limited++;
  expect(limited).toBeGreaterThan(0);
  // another address is not affected
  expect((await api(nextIp()).create()).status).toBe(201);
});
