// Two real, separate browser processes connect through a room code and a relay (D431, D486): no mocks. The room-code
// function runs under wrangler, a local TURN server stands in for Cloudflare's, and the page uses the relay-only policy.
// Checks: every connection runs over the relay, ordered messages (a megabyte too) both ways, presence, a browser
// killed outright is noticed by the other within seconds, and a new code carries the same session on.
import { chromium, firefox, expect, test } from "@playwright/test";
import type { Browser, BrowserServer, Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { killTree, startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { makePayload, sha256Hex } from "./payload";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial" });

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack();
});
test.afterAll(async () => {
  await stack?.stop();
});

type Kind = "chromium" | "other";
interface Peer {
  name: string;
  server: BrowserServer;
  browser: Browser;
  page: Page;
}

const ci = Boolean(process.env.CI);
const haveFirefox = existsSync(firefox.executablePath());

/** A browser in its own process. `chromium` is Chrome; `other` is Firefox, or Edge where Firefox isn't installed (local). */
async function launchPeer(kind: Kind): Promise<Peer> {
  let server: BrowserServer;
  let name: string;
  let browser: Browser;
  if (kind === "chromium") {
    server = await chromium.launchServer({ headless: true, ...(ci ? {} : { channel: "chrome" }) });
    browser = await chromium.connect(server.wsEndpoint());
    name = "Chromium";
  } else if (haveFirefox) {
    server = await firefox.launchServer({ headless: true });
    browser = await firefox.connect(server.wsEndpoint());
    name = "Firefox";
  } else {
    server = await chromium.launchServer({ headless: true, channel: "msedge" });
    browser = await chromium.connect(server.wsEndpoint());
    name = "Edge";
  }
  const page = await browser.newPage();
  await page.goto(stack.pageUrl);
  await page.waitForFunction(() => "harness" in window);
  return { name, server, browser, page };
}

/** The browser's process is ended, not closed politely: nothing is said to the other side. */
async function killPeer(p: Peer): Promise<void> {
  const proc = p.server.process();
  killTree(proc);
  await new Promise((r) => setTimeout(r, 300));
}

async function closePeer(p: Peer): Promise<void> {
  await p.server.close().catch(() => {});
}

type H = {
  host(url: string, sessionId?: string): Promise<{ code: string; sessionId: string }>;
  join(url: string, code: string, sessionId?: string): Promise<{ ok: true } | { ok: false; kind: string; message: string }>;
  whenConnected(): Promise<{ sessionId: string; peerEpoch: string; pair: { local: string; remote: string } | null }>;
  sendAll(items: ({ text: string } | { size: number; seed: number })[]): Promise<void>;
  sendPresence(text: string): boolean;
  candidateTypes(): Promise<{ local: string[]; remote: string[] }>;
  state(): { received: { kind: string; size: number; value: string }[]; presence: string[]; dropped: string | null; error: { kind: string; message: string } | null; status: string };
  close(): void;
};
const call = <K extends keyof H>(page: Page, method: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> =>
  page.evaluate(([m, a]) => (window as unknown as { harness: Record<string, (...x: unknown[]) => unknown> }).harness[m as string](...(a as unknown[])), [method, args] as const) as Promise<
    Awaited<ReturnType<H[K]>>
  >;

type Item = { text: string } | { size: number; seed: number };

/** What the receiver should have seen, from what was sent. */
async function expected(items: Item[]) {
  const out: { kind: string; size: number; value: string }[] = [];
  for (const i of items) {
    if ("text" in i) out.push({ kind: "text", size: i.text.length, value: i.text });
    else out.push({ kind: "binary", size: i.size, value: await sha256Hex(makePayload(i.size, i.seed)) });
  }
  return out;
}

/** Ordered messages one way, a megabyte in the middle; the receiver must see exactly these, in this order. */
async function exchange(from: Page, to: Page, label: string) {
  const items: Item[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ text: `${label}-${i}` })),
    { size: 1_048_576 + 5, seed: 11 },
    { text: `${label}-after-big` },
    { size: 300_000, seed: 12 },
    { size: 0, seed: 13 },
    { text: `${label}-end` },
  ];
  const before = (await call(to, "state")).received.length;
  await call(from, "sendAll", items);
  await expect.poll(async () => (await call(to, "state")).received.length, { timeout: 30_000 }).toBe(before + items.length);
  expect((await call(to, "state")).received.slice(before)).toEqual(await expected(items));
}

/** Every candidate gathered and the pair that carries the connection are relayed: no direct path, here or there. */
async function assertRelayOnly(...pages: Page[]) {
  for (const page of pages) {
    const { pair } = await call(page, "whenConnected");
    expect(pair).toEqual({ local: "relay", remote: "relay" });
    const types = await call(page, "candidateTypes");
    expect(types.local).toEqual(["relay"]);
    expect(types.remote.every((t) => t === "relay")).toBe(true);
  }
}

async function presenceBothWays(a: Page, b: Page) {
  // unreliable by design: send until it arrives (on a local relay the first usually does)
  for (const [from, to, label] of [[a, b, "a"], [b, a, "b"]] as const) {
    await expect
      .poll(
        async () => {
          await call(from, "sendPresence", `${label}-presence`);
          return (await call(to, "state")).presence.includes(`${label}-presence`);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  }
}

test("two separate browsers connect through the relay, exchange messages, notice a killed peer and carry on with a new code", async () => {
  const host = await launchPeer("chromium");
  const guest = await launchPeer("other");
  let guest2: Peer | null = null;
  try {
    // different programs in different processes
    expect(host.server.process().pid).not.toBe(guest.server.process().pid);

    // a code, a join, and a connection that runs over the relay and nothing else
    const { code, sessionId } = await call(host.page, "host", stack.workerUrl);
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(await call(guest.page, "join", stack.workerUrl, code)).toEqual({ ok: true });
    const hostSide = await call(host.page, "whenConnected");
    const guestSide = await call(guest.page, "whenConnected");
    expect(guestSide.sessionId).toBe(sessionId);
    expect(hostSide.sessionId).toBe(sessionId);
    await assertRelayOnly(host.page, guest.page);

    // the code was single-use: once the pair is connected the room is gone
    expect(await call(host.page, "state")).toMatchObject({ status: "connected", error: null });
    await expect.poll(async () => (await fetch(`${stack.workerUrl}/rooms/${code}/join`, { method: "POST" })).status).toBe(404);

    // ordered messages both ways, at once, a megabyte in each
    await Promise.all([exchange(host.page, guest.page, "h"), exchange(guest.page, host.page, "g")]);
    await presenceBothWays(host.page, guest.page);

    // the guest's browser is killed outright: the host hears within seconds
    await killPeer(guest);
    const killedAt = Date.now();
    await expect.poll(async () => (await call(host.page, "state")).dropped, { timeout: 20_000 }).not.toBeNull();
    const noticedAfter = Date.now() - killedAt;
    expect(noticedAfter).toBeLessThan(20_000);
    test.info().annotations.push({ type: "killed peer noticed after (ms)", description: `${noticedAfter} (${(await call(host.page, "state")).dropped})` });
    expect(["timeout", "channel-closed", "connection-failed"]).toContain((await call(host.page, "state")).dropped);
    expect((await call(host.page, "state")).status).toBe("dropped");
    await closePeer(guest);

    // a new code carries the same session on, with a fresh process for the guest
    const again = await call(host.page, "host", stack.workerUrl, sessionId);
    expect(again.sessionId).toBe(sessionId);
    expect(again.code).not.toBe(code);
    guest2 = await launchPeer("other");
    expect(await call(guest2.page, "join", stack.workerUrl, code)).toMatchObject({ ok: false, kind: "bad-code" }); // the old code is spent
    expect(await call(guest2.page, "join", stack.workerUrl, again.code, sessionId)).toEqual({ ok: true });
    const hostAgain = await call(host.page, "whenConnected");
    expect(hostAgain.sessionId).toBe(sessionId);
    expect(hostAgain.peerEpoch).not.toBe(hostSide.peerEpoch);
    await assertRelayOnly(host.page, guest2.page);
    await Promise.all([exchange(host.page, guest2.page, "h2"), exchange(guest2.page, host.page, "g2")]);
    await presenceBothWays(host.page, guest2.page);
  } finally {
    await closePeer(host);
    await closePeer(guest);
    if (guest2) await closePeer(guest2);
  }
});

test("a player who leaves is seen as leaving, and a guest from another session is refused", async () => {
  const host = await launchPeer("chromium");
  const guest = await launchPeer("other");
  try {
    const { code } = await call(host.page, "host", stack.workerUrl);
    expect(await call(guest.page, "join", stack.workerUrl, code)).toEqual({ ok: true });
    await call(host.page, "whenConnected");
    await call(guest.page, "close");
    await expect.poll(async () => (await call(host.page, "state")).dropped, { timeout: 10_000 }).toBe("left");

    // a guest who carries another session's id is refused by the host's session
    const second = await call(host.page, "host", stack.workerUrl);
    const refused = await call(guest.page, "join", stack.workerUrl, second.code, "a-different-session-id");
    expect(refused).toMatchObject({ ok: false, kind: "session-mismatch" });
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});

test("a wrong code and a code from nowhere say so plainly", async () => {
  const guest = await launchPeer("chromium");
  try {
    expect(await call(guest.page, "join", stack.workerUrl, "ZZZZZZ")).toMatchObject({ ok: false, kind: "bad-code" });
    expect(await call(guest.page, "join", stack.workerUrl, "not a code")).toMatchObject({ ok: false, kind: "bad-code" });
    // the function can't be reached: collaboration is unavailable, and the message says why
    const down = await call(guest.page, "join", "http://127.0.0.1:9", "ZZZZZZ");
    expect(down).toMatchObject({ ok: false, kind: "unavailable" });
    expect((down as { message: string }).message).toBe("Collaboration is unavailable right now: the room service can't be reached.");
  } finally {
    await closePeer(guest);
  }
});
