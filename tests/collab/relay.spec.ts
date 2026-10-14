// Two real, separate browser processes connect through a room code and a relay (D431, D486): no mocks. The room-code
// function runs under wrangler, a local TURN server stands in for Cloudflare's, and the page uses the relay-only policy.
// Checks: every connection runs over the relay (and only relayed candidates crossed the room), ordered messages (a
// megabyte too) both ways, presence, a browser killed outright is noticed by the other within seconds, and a new code
// carries the same session on.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { assertRelayOnly, assertSignalsRelayOnly, call, closePeer, exchange, killPeer, launchPeer, presenceBothWays } from "./peers";
import type { Kind, Peer } from "./peers";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial" });

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack();
});
test.afterAll(async () => {
  await stack?.stop();
});

const open = (page: Page) => page.goto(stack.pageUrl).then(() => undefined);
const launch = (kind: Kind): Promise<Peer> => launchPeer(kind, open);

test("two separate browsers connect through the relay, exchange messages, notice a killed peer and carry on with a new code", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
  let guest2: Peer | null = null;
  try {
    // different programs in different processes
    expect(host.server.process().pid).not.toBe(guest.server.process().pid);

    // a code, a join, and a connection that runs over the relay and nothing else
    const { code, sessionId } = await call(host.page, "host", stack.workerUrl);
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    const joinResult = await call(guest.page, "join", stack.workerUrl, code);
    expect(joinResult, `${guest.name} joined: ${JSON.stringify(joinResult)}`).toEqual({ ok: true });
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
    // only relayed candidates, with no address of the sender's, crossed the room
    await assertSignalsRelayOnly(host.page, guest.page);

    // the guest's browser is killed outright: the host hears within seconds
    await killPeer(guest);
    const killedAt = Date.now();
    await expect.poll(async () => (await call(host.page, "state")).dropped, { timeout: 40_000 }).not.toBeNull();
    const noticedAfter = Date.now() - killedAt;
    expect(noticedAfter).toBeLessThan(30_000);
    test.info().annotations.push({ type: "killed peer noticed after (ms)", description: `${noticedAfter} (${(await call(host.page, "state")).dropped})` });
    expect(["timeout", "channel-closed", "connection-failed"]).toContain((await call(host.page, "state")).dropped);
    expect((await call(host.page, "state")).status).toBe("dropped");
    await closePeer(guest);

    // a new code carries the same session on, with a fresh process for the guest
    const again = await call(host.page, "host", stack.workerUrl, sessionId);
    expect(again.sessionId).toBe(sessionId);
    expect(again.code).not.toBe(code);
    guest2 = await launch("other");
    expect(await call(guest2.page, "join", stack.workerUrl, code)).toMatchObject({ ok: false, kind: "bad-code" }); // the old code is spent
    expect(await call(guest2.page, "join", stack.workerUrl, again.code, sessionId)).toEqual({ ok: true });
    const hostAgain = await call(host.page, "whenConnected");
    expect(hostAgain.sessionId).toBe(sessionId);
    expect(hostAgain.peerEpoch).not.toBe(hostSide.peerEpoch);
    await assertRelayOnly(host.page, guest2.page);
    await Promise.all([exchange(host.page, guest2.page, "h2"), exchange(guest2.page, host.page, "g2")]);
    await presenceBothWays(host.page, guest2.page);
    await assertSignalsRelayOnly(host.page, guest2.page);
  } finally {
    await closePeer(host);
    await closePeer(guest);
    if (guest2) await closePeer(guest2);
  }
});

test("a player who leaves is seen as leaving, and a guest from another session is refused", async () => {
  const host = await launch("chromium");
  const guest = await launch("other");
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
  const guest = await launch("chromium");
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
