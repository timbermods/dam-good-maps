// Shared by the connection tests: a browser in its own process, calls into the harness page, and the checks that the
// connection is relay-only and carries ordered messages.
import { chromium, expect, firefox } from "@playwright/test";
import type { Browser, BrowserServer, Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { killTree } from "./localStack";
import { makePayload, sha256Hex } from "./payload";

export type Kind = "chromium" | "other";
export interface Peer {
  name: string;
  server: BrowserServer;
  browser: Browser;
  page: Page;
}

/** Firefox ignores loopback candidates by default; the local test relay runs on 127.0.0.1. (Test setup only: real relays are public.) */
const FIREFOX_PREFS = { "media.peerconnection.ice.loopback": true, "media.peerconnection.ice.link_local": true };

const ci = Boolean(process.env.CI);
// Playwright's Firefox does not start on every Windows machine; locally it is used only when asked for (DGM_COLLAB_FIREFOX=1)
const haveFirefox = (ci || process.env.DGM_COLLAB_FIREFOX === "1") && existsSync(firefox.executablePath());

/**
 * A browser in its own process. `chromium` is Chrome; `other` is Firefox, or Edge where Firefox isn't available (local).
 * `open` loads the harness page.
 */
export async function launchPeer(kind: Kind, open: (page: Page) => Promise<void>): Promise<Peer> {
  let server: BrowserServer;
  let name: string;
  let browser: Browser;
  if (kind === "chromium") {
    server = await chromium.launchServer({ headless: true, ...(ci ? {} : { channel: "chrome" }) });
    browser = await chromium.connect(server.wsEndpoint());
    name = "Chromium";
  } else if (haveFirefox) {
    server = await firefox.launchServer({ headless: true, firefoxUserPrefs: FIREFOX_PREFS });
    browser = await firefox.connect(server.wsEndpoint());
    name = "Firefox";
  } else {
    server = await chromium.launchServer({ headless: true, channel: "msedge" });
    browser = await chromium.connect(server.wsEndpoint());
    name = "Edge";
  }
  const page = await browser.newPage();
  await open(page);
  await page.waitForFunction(() => "harness" in window);
  return { name, server, browser, page };
}

/** The browser's process is ended, not closed politely: nothing is said to the other side. */
export async function killPeer(p: Peer): Promise<void> {
  killTree(p.server.process());
  await new Promise((r) => setTimeout(r, 300));
}

export async function closePeer(p: Peer): Promise<void> {
  await p.server.close().catch(() => {});
}

export type H = {
  host(url: string, sessionId?: string, reportDelayMs?: number): Promise<{ code: string; sessionId: string }>;
  join(url: string, code: string, sessionId?: string, reportDelayMs?: number): Promise<{ ok: true } | { ok: false; kind: string; message: string; diagnostics?: unknown }>;
  whenConnected(): Promise<{ sessionId: string; peerEpoch: string; pair: { local: string; remote: string } | null }>;
  sendAll(items: ({ text: string } | { size: number; seed: number })[]): Promise<void>;
  sendPresence(text: string): boolean;
  canRenew(): boolean;
  pair(): Promise<{ local: string; remote: string } | null>;
  candidateTypes(): Promise<{ local: string[]; remote: string[] }>;
  state(): {
    received: { kind: string; size: number; value: string }[];
    presence: string[];
    dropped: string | null;
    refreshed: number;
    renewalFailures: string[];
    signals: string[];
    error: { kind: string; message: string } | null;
    status: string;
  };
  close(): void;
};

export const call = <K extends keyof H>(page: Page, method: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> =>
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
export async function exchange(from: Page, to: Page, label: string) {
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
export async function assertRelayOnly(...pages: Page[]) {
  for (const page of pages) {
    await call(page, "whenConnected");
    // asked now, so that after a renewal it is the pair in use that is checked
    // (a browser that has just restarted ICE may take a moment to name the new pair)
    await expect.poll(() => call(page, "pair"), { timeout: 15_000 }).toEqual({ local: "relay", remote: "relay" });
    const types = await call(page, "candidateTypes");
    expect(types.local).toEqual(["relay"]);
    expect(types.remote.every((t) => t === "relay")).toBe(true);
  }
}

/** What crossed the room (and later the data channel) as setup: relayed candidates only, none showing an address of the sender's. */
export async function assertSignalsRelayOnly(...pages: Page[]) {
  for (const page of pages) {
    const signals = (await call(page, "state")).signals;
    expect(signals.length).toBeGreaterThan(0);
    const text = signals.join("\n");
    expect(text, "a host, server-reflexive or peer-reflexive candidate crossed").not.toMatch(/typ (host|srflx|prflx)/);
    for (const m of text.matchAll(/ raddr (\S+)/g)) expect(["0.0.0.0", "::"], `raddr ${m[1]} would show an address`).toContain(m[1].replace(/\.*$/, ""));
    expect(text).toMatch(/typ relay/);
  }
}

export async function presenceBothWays(a: Page, b: Page) {
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
