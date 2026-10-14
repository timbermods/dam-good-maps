// The room-code function as a client sees it, run by `wrangler dev` (no browser): a code is single-use, keys open
// only their own room, the relay's credentials go only to a key holder, the setup passes between the two and nothing
// else, the room is deleted once both are connected, and the limits and origin rules hold.
import { expect, test } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";

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

interface Api {
  create(): Promise<Response>;
  join(code: string): Promise<Response>;
  ice(code: string, secret?: string): Promise<Response>;
  ws(code: string): WebSocket;
}
function api(ip = nextIp()): Api {
  const headers = { "CF-Connecting-IP": ip };
  return {
    create: () => fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers }),
    join: (code) => fetch(`${stack.workerUrl}/rooms/${code}/join`, { method: "POST", headers }),
    ice: (code, secret) => fetch(`${stack.workerUrl}/rooms/${code}/ice`, { method: "POST", headers: { ...headers, ...(secret ? { Authorization: `Bearer ${secret}` } : {}) } }),
    ws: (code) => new WebSocket(`${stack.workerUrl.replace("http", "ws")}/rooms/${code}/ws`),
  };
}

/** A socket that records what arrives and lets a test wait for the next message of a kind. */
class Wire {
  messages: { t: string; [k: string]: unknown }[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(readonly ws: WebSocket) {
    ws.onmessage = (e) => this.messages.push(JSON.parse(String(e.data)));
    ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }
  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("socket error"));
    });
  }
  send(o: unknown) {
    this.ws.send(JSON.stringify(o));
  }
  async next(t: string) {
    await expect.poll(() => this.messages.some((m) => m.t === t), { timeout: 10_000 }).toBe(true);
    return this.messages.find((m) => m.t === t)!;
  }
}

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
});

test("relay credentials go only to a holder of a room key, and only a few times", async () => {
  const a = api();
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
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
  for (let i = 1; i < 6; i++) expect((await a.ice(room.code, room.hostSecret)).status).toBe(200);
  expect((await a.ice(room.code, room.hostSecret)).status).toBe(429);
  // a guest key from another room opens nothing here
  const other = (await (await a.create()).json()) as { hostSecret: string };
  expect((await a.ice(room.code, other.hostSecret)).status).toBe(401);
});

test("the two sockets pass setup messages and nothing else, and the room is gone once both are connected", async () => {
  const a = api();
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  const guestKey = ((await (await a.join(room.code)).json()) as { guestSecret: string }).guestSecret;

  const host = new Wire(a.ws(room.code));
  const guest = new Wire(a.ws(room.code));
  await Promise.all([host.open(), guest.open()]);

  // a wrong key is refused and the socket closed; nothing passes before a key is proven
  const stranger = new Wire(a.ws(room.code));
  await stranger.open();
  stranger.send({ t: "signal", data: "hello?" });
  await stranger.next("error");
  stranger.send({ t: "auth", secret: "nope" });
  await expect.poll(() => stranger.closed?.code).toBe(1008);

  host.send({ t: "auth", secret: room.hostSecret });
  await host.next("authed");
  host.send({ t: "signal", data: "too early" });
  await host.next("error"); // the guest isn't in the room yet
  guest.send({ t: "auth", secret: guestKey });
  await guest.next("authed");
  await host.next("ready");
  await guest.next("ready");

  host.send({ t: "signal", data: '{"k":"offer","sdp":"v=0"}' });
  expect((await guest.next("signal")).data).toBe('{"k":"offer","sdp":"v=0"}');
  guest.send({ t: "signal", data: '{"k":"answer","sdp":"v=0"}' });
  expect((await host.next("signal")).data).toBe('{"k":"answer","sdp":"v=0"}');
  // what the sender sent comes back to no one but the other side
  expect(host.messages.filter((m) => m.t === "signal")).toHaveLength(1);

  // too large a setup message closes that socket
  const big = new Wire(a.ws(room.code));
  await big.open();
  big.send({ t: "auth", secret: guestKey }); // replaces the guest's earlier socket
  await big.next("authed");
  await expect.poll(() => guest.closed?.reason).toBe("Replaced");
  big.send({ t: "signal", data: "x".repeat(20_000) });
  await expect.poll(() => big.closed?.code).toBe(1009);

  // both report connected: everything is deleted and the sockets are closed
  const guest2 = new Wire(a.ws(room.code));
  await guest2.open();
  guest2.send({ t: "auth", secret: guestKey });
  await guest2.next("authed");
  host.send({ t: "connected" });
  guest2.send({ t: "connected" });
  await expect.poll(() => host.closed?.reason).toBe("done");
  await expect.poll(() => guest2.closed?.reason).toBe("done");
  expect((await a.join(room.code)).status).toBe(404);
  expect((await a.ice(room.code, room.hostSecret)).status).toBe(404);
});

test("only the site's pages may call it, and a flood of rooms from one address is stopped", async () => {
  const ip = nextIp();
  const headers = { "CF-Connecting-IP": ip };
  const refused = await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers: { ...headers, Origin: "https://evil.example" } });
  expect(refused.status).toBe(403);
  const allowed = await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers: { ...headers, Origin: stack.pageUrl.replace(/\/$/, "") } });
  expect(allowed.status).toBe(201);
  expect(allowed.headers.get("access-control-allow-origin")).toBe(stack.pageUrl.replace(/\/$/, ""));
  const preflight = await fetch(`${stack.workerUrl}/rooms`, { method: "OPTIONS", headers: { ...headers, Origin: stack.pageUrl.replace(/\/$/, ""), "Access-Control-Request-Method": "POST" } });
  expect(preflight.status).toBe(204);

  let limited = 0;
  for (let i = 0; i < 10; i++) if ((await fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers })).status === 429) limited++;
  expect(limited).toBeGreaterThan(0);
  // another address is not affected
  expect((await api(nextIp()).create()).status).toBe(201);
});
