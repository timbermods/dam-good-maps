// The same connection, over the deployed function and Cloudflare's real relay (D486): two separate browser processes,
// each loading the harness as if it were the site (page.route serves it at https://timbermods.github.io, so the
// function's origin check passes). Run by hand through .github/workflows/collab-live.yml once the function is deployed
// and its Cloudflare relay secrets are set; it skips plainly when it can't reach a deployed function with a relay.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { bundleHarness } from "./localStack";
import { assertRelayOnly, assertSignalsRelayOnly, call, closePeer, exchange, launchPeer, presenceBothWays } from "./peers";

const workerUrl = (process.env.DGM_COLLAB_LIVE_URL ?? "").replace(/\/+$/, "");
const SITE = "https://timbermods.github.io";
const PAGE = `${SITE}/dam-good-maps/collab-harness/`;

let skipReason = "";
test.beforeAll(async () => {
  if (!workerUrl || workerUrl.includes("<account>")) {
    skipReason = "DGM_COLLAB_LIVE_URL is not set (the deployed function's address)";
    return;
  }
  try {
    const res = await fetch(`${workerUrl}/health`, { headers: { Origin: SITE }, signal: AbortSignal.timeout(15_000) });
    const health = (await res.json()) as { ok?: boolean; relay?: boolean };
    if (!health.ok) skipReason = `the function at ${workerUrl} is not healthy`;
    else if (!health.relay) skipReason = `the function at ${workerUrl} has no relay set up (its CF_TURN_KEY_ID and CF_TURN_KEY_API_TOKEN secrets)`;
  } catch {
    skipReason = `the function at ${workerUrl} can't be reached`;
  }
});

test("two separate browsers connect through the deployed function and Cloudflare's relay, and exchange messages", async () => {
  test.skip(Boolean(skipReason), skipReason);
  const bundle = await bundleHarness();
  const open = async (page: Page) => {
    await page.route(`${SITE}/**`, (route) => {
      const url = route.request().url();
      if (url.endsWith("/harness.js")) return route.fulfill({ contentType: "text/javascript", body: bundle });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><title>collab harness</title><script src="harness.js"></script>' });
    });
    await page.goto(PAGE);
  };
  const host = await launchPeer("chromium", open);
  const guest = await launchPeer("other", open);
  try {
    const { code, sessionId } = await call(host.page, "host", workerUrl);
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    const joined = await call(guest.page, "join", workerUrl, code);
    expect(joined, `${guest.name} joined: ${JSON.stringify(joined)}`).toEqual({ ok: true });
    expect((await call(host.page, "whenConnected")).sessionId).toBe(sessionId);
    await assertRelayOnly(host.page, guest.page);
    await Promise.all([exchange(host.page, guest.page, "h"), exchange(guest.page, host.page, "g")]);
    await presenceBothWays(host.page, guest.page);
    await assertSignalsRelayOnly(host.page, guest.page);

    // a player leaves; the room is long gone, so the old code is refused
    await call(guest.page, "close");
    await expect.poll(async () => (await call(host.page, "state")).dropped, { timeout: 15_000 }).toBe("left");
    const late = await fetch(`${workerUrl}/rooms/${code}/join`, { method: "POST", headers: { Origin: SITE } });
    expect(late.status).toBe(404);
  } finally {
    await closePeer(host);
    await closePeer(guest);
  }
});
