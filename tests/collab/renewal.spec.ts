// A renewal that cannot be had is said, not hidden (D486): with a 6-second login and one renewal per session, the second
// renewal is refused by the function; both players get a plain "can't be renewed" event, keep trying, and the connection
// carries on until the login would run out.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { call, closePeer, launchPeer } from "./peers";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack({ turnTtlSeconds: 6, vars: { MAX_TOKEN_RENEWALS: "1" } });
});
test.afterAll(async () => {
  await stack?.stop();
});

test("when the relay's login can't be renewed, both players are told plainly and the connection carries on meanwhile", async () => {
  const open = (page: Page) => page.goto(stack.pageUrl).then(() => undefined);
  const host = await launchPeer("chromium", open);
  const guest = await launchPeer("other", open);
  try {
    const { code } = await call(host.page, "host", stack.workerUrl);
    expect(await call(guest.page, "join", stack.workerUrl, code)).toEqual({ ok: true });
    await call(host.page, "whenConnected");
    await call(guest.page, "whenConnected");
    for (const page of [host.page, guest.page]) await expect.poll(() => call(page, "canRenew"), { timeout: 15_000 }).toBe(true);

    // the first renewal works; the next is refused, and said so
    for (const page of [host.page, guest.page]) {
      await expect.poll(async () => (await call(page, "state")).refreshed, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      await expect.poll(async () => (await call(page, "state")).renewalFailures.length, { timeout: 30_000 }).toBeGreaterThan(0);
      const [first] = (await call(page, "state")).renewalFailures;
      expect(first).toContain("The relay's login can't be renewed");
      expect(first).toContain("as often as it may");
      expect(first).toContain("The connection will end when it runs out");
    }
    // the connection is still up while the login is in force
    expect((await call(host.page, "state")).dropped).toBeNull();
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});
