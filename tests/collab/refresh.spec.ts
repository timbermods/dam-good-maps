// A long session: the relay's login is short here (8 seconds), so it is renewed while two real browsers stay connected
// (D486). Each fetches a fresh login with the session token the room gave at connect, and the host restarts ICE with
// an offer and answer over the data channel; nothing is dropped, nothing goes through the room again.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { assertRelayOnly, assertSignalsRelayOnly, call, closePeer, exchange, launchPeer } from "./peers";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack({ turnTtlSeconds: 8 });
});
test.afterAll(async () => {
  await stack?.stop();
});

test("the relay's login is renewed during a session, with an ICE restart over the data channel, and nothing drops", async () => {
  const open = (page: Page) => page.goto(stack.pageUrl).then(() => undefined);
  const host = await launchPeer("chromium", open);
  const guest = await launchPeer("other", open);
  try {
    const { code } = await call(host.page, "host", stack.workerUrl);
    expect(await call(guest.page, "join", stack.workerUrl, code)).toEqual({ ok: true });
    await call(host.page, "whenConnected");
    await call(guest.page, "whenConnected");
    await assertRelayOnly(host.page, guest.page);

    // two renewals on both sides, without the connection dropping
    for (const page of [host.page, guest.page]) await expect.poll(async () => (await call(page, "state")).refreshed, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    for (const page of [host.page, guest.page]) expect((await call(page, "state")).dropped).toBeNull();
    // the restart's offers went over the data channel, after the first one through the room
    const hostSignals = (await call(host.page, "state")).signals;
    expect(hostSignals.filter((s) => s.startsWith('out {"k":"offer"')).length).toBeGreaterThanOrEqual(3);

    // still relayed, still carrying ordered messages both ways
    await assertRelayOnly(host.page, guest.page);
    await Promise.all([exchange(host.page, guest.page, "after-h"), exchange(guest.page, host.page, "after-g")]);
    await assertSignalsRelayOnly(host.page, guest.page);
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});
