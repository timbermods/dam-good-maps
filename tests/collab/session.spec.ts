// The session layer between two real, separate browser processes over the real connection path (D486): the room-code function
// (wrangler dev), a TURN relay, and in each browser the app's own worker (with a generated map) and client, driven through the
// client's API, not a UI. Edits from both sides arrive identical (the .timber bytes the game would load, compared by their
// SHA-256, and the direct hash), a claim refuses the other's edit, a killed browser pauses the other and a new code carries
// the session on, and the relay disappearing and coming back is a drop and a rejoin in the same processes.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { closePeer, killPeer, launchPeer } from "./peers";
import type { Kind, Peer } from "./peers";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial", timeout: 600_000 });

let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  // (every browser reaches the function from one address, and the tests together make more rooms than the default minute allows)
  stack = await startStack({ sessionPage: true, vars: { ROOMS_PER_MINUTE: "100" } });
});
test.afterAll(async () => {
  await stack?.stop();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = { type: string; [k: string]: any };
const open = (page: Page) => page.goto(stack.sessionUrl).then(() => undefined);
const launch = (kind: Kind): Promise<Peer> => launchPeer(kind, open, "session");
/** A method of the page's client (or of the page), by name. */
const sc = <T = unknown>(page: Page, method: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([m, a]) => (window as unknown as { session: Record<string, (...x: unknown[]) => unknown> }).session[m as string](...(a as unknown[])), [method, args] as const) as Promise<T>;
const call = <T = unknown>(page: Page, method: string, ...args: unknown[]): Promise<T> => sc<T>(page, "call", method, ...args);
const events = (page: Page, type?: string) => sc<Ev[]>(page, "events", type);
const waitFor = async (page: Page, type: string, n = 1, timeout = 60_000) => {
  await expect.poll(async () => (await events(page, type)).length, { timeout, message: `${n} ${type} event(s)` }).toBeGreaterThanOrEqual(n);
};
/** Both maps' water has settled for the host's latest entry. */
async function settled(host: Page, guest: Page) {
  const seq = ((await call<{ seq: number } | null>(host, "state")) ?? { seq: 0 }).seq;
  // (no entry yet: nothing to settle, the map is the checkpoint)
  if (seq === 0) return 0;
  for (const page of [host, guest]) {
    await expect
      .poll(async () => (await events(page, "settled")).at(-1)?.seq ?? -1, { timeout: 120_000, message: "the water settles" })
      .toBe(seq);
  }
  return seq;
}
/** The two maps are identical: the same entries, the same hash, the same .timber. */
async function expectIdentical(host: Page, guest: Page, where: string) {
  const seq = await settled(host, guest);
  const [a, b] = await Promise.all([sc<{ state: { hash: string; seq: number }; timber: string }>(host, "fingerprint"), sc<{ state: { hash: string; seq: number }; timber: string }>(guest, "fingerprint")]);
  expect(a.state.seq, where).toBe(seq);
  expect(b.state.seq, where).toBe(seq);
  expect(b.state.hash, `hash ${where}`).toBe(a.state.hash);
  expect(a.timber, `host .timber ${where}`).toMatch(/^[0-9a-f]{64}$/);
  expect(b.timber, `.timber ${where}`).toBe(a.timber);
  return seq;
}

const WAIT_APPLIED = async (page: Page, n: number) => waitFor(page, "applied", n);
const sessionOf = async (page: Page) => (await call<{ sessionId: string }>(page, "state")).sessionId;

test("two browsers: join, edits from both arrive identical, a claim refuses the other's edit, presence and notes", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
  try {
    await sc(host.page, "init", stack.workerUrl);
    await sc(guest.page, "init", stack.workerUrl);
    expect(host.server.process().pid).not.toBe(guest.server.process().pid);
    // the host generates a map in its worker and invites
    const made = await sc<{ W: number }>(host.page, "generate", 5, "highlands", 48);
    expect(made.W).toBe(48);
    const invite = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    expect(invite.code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined");
    await waitFor(guest.page, "joined");
    expect(await sessionOf(guest.page)).toBe(invite.sessionId);
    expect((await sc<{ opens: number }>(guest.page, "counts")).opens).toBeGreaterThanOrEqual(1);
    await expectIdentical(host.page, guest.page, "on joining");

    // edits from both sides, at once
    const [a, b] = await Promise.all([call<{ ok: boolean }>(host.page, "submit", await sc(host.page, "raise", 10, 10)), call<{ ok: boolean }>(guest.page, "submit", await sc(guest.page, "raise", 34, 30))]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    await WAIT_APPLIED(host.page, 2);
    await WAIT_APPLIED(guest.page, 2);
    await expectIdentical(host.page, guest.page, "after two edits");
    expect((await sc<{ updates: number }>(guest.page, "counts")).updates).toBeGreaterThan(0);

    // claims: the host takes the north-west, the guest the south-east; the guest's edit into the host's is refused at the host
    const square = (x0: number, y0: number, x1: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [y0 + k, x0, x1]);
    expect(await call(host.page, "claim", { kind: "claim", runs: square(4, 4, 18, 18) })).toMatchObject({ ok: true });
    expect(await call(guest.page, "claim", { kind: "claim", runs: square(28, 28, 44, 44) })).toMatchObject({ ok: true });
    expect(await call(guest.page, "claim", { kind: "claim", runs: square(10, 10, 12, 12) })).toEqual({ ok: false, reason: "That includes Ada's area" });
    const intoHosts = await sc(guest.page, "raise", 8, 8);
    expect(await call<string | null>(guest.page, "reachRefusal", (intoHosts as { ops: unknown[] }).ops)).toBe("Reaches into Ada's area");
    expect(await call(guest.page, "submit", intoHosts)).toEqual({ ok: false, reason: "Reaches into Ada's area" });
    expect(await call(host.page, "submit", await sc(host.page, "raise", 34, 34))).toEqual({ ok: false, reason: "Reaches into Bo's area" });
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 34, 34))).toMatchObject({ ok: true });
    expect(await call(host.page, "claimsView")).toEqual(await call(guest.page, "claimsView"));
    await expectIdentical(host.page, guest.page, "after the claims");

    // undo: the guest's edit is under nothing of the host's, so it goes; the host's stays
    expect(await call(guest.page, "undo")).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "after an undo");

    // presence, over the unordered channel
    await expect
      .poll(
        async () => {
          await call(guest.page, "presence", { cursor: [12.5, 20.25], tool: "Raise" });
          return (await events(host.page, "presence")).length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    expect((await events(host.page, "presence")).at(-1)).toMatchObject({ who: "guest", name: "Bo", cursor: [12.5, 20.25], tool: "Raise" });
    expect(await events(host.page, "desync")).toEqual([]);
    expect(await events(guest.page, "desync")).toEqual([]);
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});

test("a killed browser pauses the other, read-only; a new code with the same session carries on exactly", async () => {
  const host = await launch("chromium");
  let guest = await launch("other");
  let guest2: Peer | null = null;
  try {
    await sc(host.page, "init", stack.workerUrl, { heartbeatMs: 500, deadAfterMs: 3000 });
    await sc(guest.page, "init", stack.workerUrl, { heartbeatMs: 500, deadAfterMs: 3000 });
    await sc(host.page, "generate", 7, "highlands", 48);
    const invite = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined");
    expect(await call(host.page, "submit", await sc(host.page, "raise", 10, 10))).toMatchObject({ ok: true });
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 30, 30))).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "before the kill");
    const seqBefore = (await call<{ seq: number }>(host.page, "state")).seq;

    // the guest's browser is killed outright (a stroke under way)
    await call(guest.page, "presence", { stroke: { id: 9, points: [[30, 30], [31, 30]] } });
    await killPeer(guest);
    await waitFor(host.page, "paused", 1, 40_000);
    expect(await events(host.page, "paused")).toEqual([expect.objectContaining({ type: "paused", name: "Bo", message: "Bo has left. Waiting to reconnect." })]);
    // the player who stays has Bo’s cursor and stroke taken away at once
    expect(await events(host.page, "presence-cleared")).toHaveLength(1);
    // read-only meanwhile, and the host keeps their own copy
    expect(await call(host.page, "submit", await sc(host.page, "raise", 20, 20))).toEqual({ ok: false, reason: "Bo has left. Waiting to reconnect." });
    expect(await call<{ length: number } | null>(host.page, "project")).not.toBeNull();
    const keeps = await events(host.page, "keep");
    expect(keeps).toHaveLength(1);
    expect(keeps[0]).toMatchObject({ reason: "pause", sessionId: invite.sessionId });
    expect(keeps[0].projectBytes).toBeGreaterThan(1000);

    // a new room code, a new browser process for the guest, the same session id
    const again = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    expect(again.sessionId).toBe(invite.sessionId);
    expect(again.code).not.toBe(invite.code);
    guest2 = await launch("other");
    await sc(guest2.page, "init", stack.workerUrl);
    await call(guest2.page, "join", again.code, { name: "Bo", sessionId: invite.sessionId });
    await waitFor(host.page, "resumed");
    await waitFor(guest2.page, "joined");
    expect(await sessionOf(guest2.page)).toBe(invite.sessionId);
    // exactly where they stopped, then on: both edit again
    expect((await call<{ seq: number }>(host.page, "state")).seq).toBe(seqBefore);
    await expectIdentical(host.page, guest2.page, "after the rejoin");
    const [x, y] = await Promise.all([call(host.page, "submit", await sc(host.page, "raise", 12, 36)), call(guest2.page, "submit", await sc(guest2.page, "raise", 36, 12))]);
    expect(x).toMatchObject({ ok: true });
    expect(y).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest2.page, "after carrying on");
  } finally {
    await closePeer(host);
    await closePeer(guest).catch(() => undefined);
    if (guest2) await closePeer(guest2);
  }
});

test("the relay going away is a drop for both; when it is back a new code reconnects the same two processes and they carry on", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
  try {
    for (const p of [host, guest]) await sc(p.page, "init", stack.workerUrl, { heartbeatMs: 500, deadAfterMs: 3000 });
    await sc(host.page, "generate", 3, "highlands", 48);
    const invite = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined");
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 20, 20))).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "before the drop");

    // the network goes: nothing can pass the relay
    stack.relay.stop();
    await waitFor(host.page, "paused", 1, 60_000);
    await waitFor(guest.page, "paused", 1, 60_000);
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 22, 22))).toEqual({ ok: false, reason: "Ada has left. Waiting to reconnect." });
    expect((await events(guest.page, "keep")).map((k) => k.reason)).toEqual(["pause"]);
    stack.relay.start();

    // a new code; the guest's page still holds the session and the map
    const again = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    expect(again.sessionId).toBe(invite.sessionId);
    await call(guest.page, "join", again.code, { name: "Bo" });
    await waitFor(host.page, "resumed");
    await waitFor(guest.page, "resumed");
    await expectIdentical(host.page, guest.page, "after the reconnect");
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 22, 22))).toMatchObject({ ok: true });
    expect(await call(host.page, "submit", await sc(host.page, "raise", 8, 40))).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "after carrying on");
    expect(await events(host.page, "desync")).toEqual([]);
    expect(await events(guest.page, "desync")).toEqual([]);
  } finally {
    stack.relay.start();
    await closePeer(host);
    await closePeer(guest);
  }
});

test("the host opens another map: the guest hears first and both keep the previous one; the relay down is said plainly", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
  try {
    for (const p of [host, guest]) await sc(p.page, "init", stack.workerUrl);
    await sc(host.page, "generate", 5, "highlands", 48);
    const invite = await call<{ code: string }>(host.page, "startHosting", { name: "Ada" });
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined");
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 12, 36))).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "before the new map");
    await call(host.page, "announceNewMap", "Lakeside");
    await waitFor(guest.page, "opening");
    expect(await events(guest.page, "opening")).toEqual([expect.objectContaining({ message: "Ada is opening a new map" })]);
    await sc(host.page, "generate", 9, "highlands", 48);
    await call(host.page, "newMap", "Lakeside");
    await waitFor(guest.page, "new-map");
    for (const p of [host, guest]) await expect.poll(async () => (await events(p.page, "keep")).filter((k) => k.reason === "new-map").length, { timeout: 60_000 }).toBe(1);
    await expect.poll(async () => (await sc<{ opens: number }>(guest.page, "counts")).opens, { timeout: 60_000 }).toBe(2);
    expect(await call(guest.page, "submit", await sc(guest.page, "raise", 24, 24))).toMatchObject({ ok: true, seq: 1 });
    await expectIdentical(host.page, guest.page, "on the new map");
    // the relay or the function is down: collaboration is unavailable, plainly; editing alone is unaffected
    const lone = await launch("chromium");
    try {
      await sc(lone.page, "init", "http://127.0.0.1:9");
      await sc(lone.page, "generate", 4, "highlands", 48);
      await expect(call(lone.page, "startHosting", { name: "Cy" })).rejects.toThrow();
      expect(await events(lone.page, "unavailable")).toEqual([expect.objectContaining({ message: "Collaboration is unavailable right now: the room service can't be reached." })]);
      expect((await sc<{ edits: number }>(lone.page, "fingerprint")).edits).toBe(0);
    } finally {
      await closePeer(lone);
    }
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});

test("a killed host: a new browser reopens the kept project, hosts the same session, and the waiting guest carries on", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
  let host2: Peer | null = null;
  try {
    for (const p of [host, guest]) await sc(p.page, "init", stack.workerUrl, { heartbeatMs: 500, deadAfterMs: 3000 });
    await sc(host.page, "generate", 6, "highlands", 48);
    const invite = await call<{ code: string; sessionId: string }>(host.page, "startHosting", { name: "Ada" });
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined");
    // the guest has asked a few times, so its numbers are well past a restarted host’s
    for (const [x, y] of [[10, 10], [30, 30], [12, 36]]) expect(await call(guest.page, "submit", await sc(guest.page, "raise", x, y))).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "before the host is killed");
    const kept = await sc<number[]>(host.page, "projectBytes");
    expect(kept.length).toBeGreaterThan(1000);

    await killPeer(host);
    await waitFor(guest.page, "paused", 1, 40_000);
    expect(await events(guest.page, "presence-cleared")).toHaveLength(1);

    // the host’s page is reloaded: the map is reopened from the project it kept, and the same session is hosted again
    host2 = await launch("chromium");
    await sc(host2.page, "init", stack.workerUrl);
    await sc(host2.page, "openProject", kept);
    const again = await call<{ code: string; sessionId: string }>(host2.page, "startHosting", { name: "Ada", sessionId: invite.sessionId });
    expect(again.sessionId).toBe(invite.sessionId);
    await call(guest.page, "join", again.code, { name: "Bo" });
    await waitFor(guest.page, "resumed");
    await waitFor(host2.page, "joined");
    await expectIdentical(host2.page, guest.page, "after the host restarted");
    // the guest carries on (before the fix its old request number was refused for good), and so does the host
    const [a, b] = await Promise.all([call(guest.page, "submit", await sc(guest.page, "raise", 34, 12)), call(host2.page, "submit", await sc(host2.page, "raise", 8, 8))]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    await expectIdentical(host2.page, guest.page, "after carrying on");
    expect(await events(guest.page, "desync")).toEqual([]);
  } finally {
    await closePeer(host).catch(() => undefined);
    await closePeer(guest);
    if (host2) await closePeer(host2);
  }
});

test("a 256² map travels to the guest (in chunks) and both edit it identically", async () => {
  test.setTimeout(900_000);
  const host = await launch("chromium");
  const guest = await launch("other");
  try {
    for (const p of [host, guest]) await sc(p.page, "init", stack.workerUrl);
    await sc(host.page, "generate", 5, "highlands", 256);
    const invite = await call<{ code: string }>(host.page, "startHosting", { name: "Ada" });
    await call(guest.page, "join", invite.code, { name: "Bo" });
    await waitFor(host.page, "joined", 1, 180_000);
    expect((await sc<{ W: number }>(guest.page, "fingerprint")).W).toBe(256);
    await expectIdentical(host.page, guest.page, "on joining at 256²");
    const [a, b] = await Promise.all([call(host.page, "submit", await sc(host.page, "raise", 40, 40)), call(guest.page, "submit", await sc(guest.page, "raise", 200, 200))]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    await expectIdentical(host.page, guest.page, "after two edits at 256²");
    expect(await events(guest.page, "desync")).toEqual([]);
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});
