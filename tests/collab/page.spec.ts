// The Together panel between two real, separate browser processes over the real connection path (D486): the app itself, built the way the
// site is, in each browser; the room-code function (wrangler dev) and a TURN relay behind it. The test uses the page's own controls only:
// the Together button and its panel, the tool buttons, the pointer on the map. It covers inviting and joining with names, edits made while
// the Invite waits and after the join, edits from both sides on both maps, the other's cursor and name, Go to, a refusal shown as the
// page's usual note, the guest leaving (killed) and the host's paused state, Invite again carrying on, the host opening a new map with the
// guest's notice, and Your maps holding the keeps.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { killPeer, launchPeer } from "./peers";
import type { Kind, Peer } from "./peers";
import { generateButton, openDrawer, openYourMaps } from "../e2e/open";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial", timeout: 600_000 });

let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(420_000);
  stack = await startStack({ app: true });
});
test.afterAll(async () => {
  await stack?.stop();
});

/** A browser with the page open on a map of its own (the first visit makes one; a link gives it a fixed one). */
function launch(kind: Kind, fragment: string): Promise<Peer> {
  return launchPeer(
    kind,
    async (page) => {
      // (the page uses the local function on this machine's pages only; the look is held as the other specs hold it)
      await page.addInitScript(
        ([url]) => {
          localStorage.setItem("dgm.collab.function", url);
          localStorage.setItem("dgm.look", "standard");
        },
        [stack.workerUrl],
      );
      page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`[${kind}] ${m.type()}: ${m.text()}`));
      page.on("pageerror", (e) => console.log(`[${kind}] pageerror: ${e}`));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${stack.appUrl}#${fragment}`);
    },
    "dgmEditor",
  );
}

const together = (page: Page) => page.locator("header.editor-bar").getByRole("button", { name: /^Together/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Together" });
async function openPanel(page: Page): Promise<Locator> {
  const button = together(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(panel(page)).toBeVisible();
  return panel(page);
}

/** The panel closed (Esc), so the map's own controls under it are reachable. */
async function closePanel(page: Page) {
  if ((await together(page).getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
}

/** Wait until the map is drawn and idle. */
const ready = async (page: Page) => {
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d);
  await page.evaluate(() => window.dgmEditor!.idle());
};
const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
/** A fingerprint of the land the view draws. */
const land = (page: Page) =>
  page.evaluate(async () => {
    // (a map being opened has no view for a moment)
    const h = window.dgm3d?.renderer.mapState()?.heights;
    if (!h) return "none";
    const d = await crypto.subtle.digest("SHA-256", h.slice().buffer);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  });
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);

/** A stroke of the picked brush from tile a to tile b. */
async function stroke(page: Page, a: [number, number], b: [number, number]) {
  const p = await client(page, ...a);
  const q = await client(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) {
    await page.mouse.move(p.x + ((q.x - p.x) * k) / 20, p.y + ((q.y - p.y) * k) / 20);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}
const pick = (page: Page, key: string) => page.keyboard.press(key);
/** The whole map in view again (a camera moved by Go to or a zoom leaves tiles off screen). */
async function resetView(page: Page) {
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(700);
}

/** The host invites; the guest joins with the code. Both panels are left closed. */
async function connect(host: Peer, guest: Peer, names: [string, string]) {
  const hp = await openPanel(host.page);
  await hp.getByLabel("Your name").fill(names[0]);
  await hp.getByRole("button", { name: "Invite", exact: true }).click();
  const code = (await hp.getByLabel("Room code", { exact: true }).textContent())!.trim();
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  await expect(hp).toContainText("Waiting for them to join");
  return { code, finish: async () => {
    const gp = await openPanel(guest.page);
    await gp.getByLabel("Your name").fill(names[1]);
    await gp.getByLabel("Room code to join").fill(code);
    await gp.getByRole("button", { name: "Join", exact: true }).click();
    await expect(together(guest.page)).toHaveAttribute("aria-label", `Together with ${names[0]}`, { timeout: 90_000 });
    await expect(together(host.page)).toHaveAttribute("aria-label", `Together with ${names[1]}`, { timeout: 90_000 });
  } };
}

let host: Peer;
let guest: Peer;
test.afterAll(async () => {
  // (a killed browser cannot be closed politely: its process is ended)
  for (const p of [guest, host]) if (p) await killPeer(p).catch(() => undefined);
});

/** Both maps show the same land (the view draws what the session ordered). */
async function sameLand(where: string) {
  await Promise.all([host, guest].map((p) => p.page.evaluate(() => window.dgmEditor!.idle())));
  await expect.poll(async () => (await land(guest.page)) === (await land(host.page)), { timeout: 60_000, message: `the same land ${where}` }).toBe(true);
}
const message = (page: Page) => page.locator(".editor-message");

test("invite and join with names, edits from both sides on both maps, the other's cursor, Go to", async () => {
  host = await launch("chromium", "s=4242&z=64&d=n&t=highlands");
  guest = await launch("other", "s=77&z=48&d=n&t=highlands");
  {
    await Promise.all([ready(host.page), ready(guest.page)]);
    expect(host.server.process().pid).not.toBe(guest.server.process().pid);
    await expect(together(host.page)).toBeVisible();

    const { finish } = await connect(host, guest, ["Ada", "Bo"]);
    // the host edits while the Invite waits (the checkpoint a guest joins is the map as it stands)
    await pick(host.page, "2");
    await stroke(host.page, [20, 20], [30, 20]);
    await host.page.evaluate(() => window.dgmEditor!.idle());
    await expect.poll(async () => (await info(host.page)).history.at(-1)?.label ?? "").toMatch(/^Raise/);
    await finish();

    // the guest has the host's map: the land the host sees, edit and all
    await guest.page.evaluate(() => window.dgmEditor!.idle());
    expect((await info(guest.page)).W).toBe(64);
    await expect.poll(() => land(guest.page), { timeout: 60_000 }).toBe(await land(host.page));
  }
});

test("edits from both sides appear on both maps; the other's cursor with name and tool; Go to", async () => {
  // each side paints: the other's map follows
  const before = await land(host.page);
  await pick(guest.page, "3");
  await stroke(guest.page, [40, 40], [50, 40]);
  await expect.poll(() => land(host.page), { timeout: 60_000 }).not.toBe(before);
  await sameLand("after the guest's stroke");
  const afterGuest = await land(host.page);
  await pick(host.page, "2");
  await stroke(host.page, [10, 45], [18, 45]);
  await expect.poll(() => land(guest.page), { timeout: 60_000 }).not.toBe(afterGuest);
  await sameLand("after the host's stroke");
  // (both are one step of their own, named, in the history each side shows)
  expect((await info(guest.page)).history.map((h) => h.label)).toEqual(expect.arrayContaining([expect.stringMatching(/^Raise/), expect.stringMatching(/^Lower/)]));

  // the other's cursor: a marker in their colour with their name and the tool they hold
  await pick(guest.page, "2");
  const spot = await client(guest.page, 30, 30);
  await expect(async () => {
    await guest.page.mouse.move(spot.x - 3, spot.y);
    await guest.page.mouse.move(spot.x, spot.y);
    await expect(host.page.locator(".collab-cursor")).toContainText("Bo", { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(host.page.locator(".collab-cursor")).toContainText("Raise");
  await expect(host.page.locator(".collab-cursor")).toHaveClass(/who-guest/);
  // (it goes a moment after the last packet)
  await guest.page.mouse.move(5, 5);
  await expect(host.page.locator(".collab-cursor")).toHaveCount(0, { timeout: 10_000 });

  // Go to: the camera moves to where the other is looking, only when asked
  await guest.page.evaluate(() => window.dgm3d!.renderer.setView({ target: [12, 6, -12], distance: 22 }));
  const was = await host.page.evaluate(() => window.dgm3d!.renderer.getView().target);
  await host.page.waitForTimeout(800);
  expect(await host.page.evaluate(() => window.dgm3d!.renderer.getView().target)).toEqual(was);
  await (await openPanel(host.page)).getByRole("button", { name: "Go to Bo" }).click();
  await expect.poll(() => host.page.evaluate(() => window.dgm3d!.renderer.getView().target[0]), { timeout: 10_000 }).toBeCloseTo(12, 0);
});

test("a refusal shows as the page's usual note, with its reason", async () => {
  // the host claims the north-west corner; the guest's stroke into it is refused and the note says whose area
  const claimed: { ok: boolean } = await host.page.evaluate(async () => (await window.dgmEditor!.worker.collab.claim({ kind: "claim", runs: Array.from({ length: 15 }, (_, k) => [4 + k, 4, 18]) } as never)) as { ok: boolean });
  expect(claimed).toMatchObject({ ok: true });
  const before = await land(guest.page);
  await pick(guest.page, "2");
  await stroke(guest.page, [8, 8], [14, 8]);
  await expect(message(guest.page)).toContainText("Reaches into Ada's area", { timeout: 20_000 });
  // (nothing changed, and the guest's page took the land back)
  await sameLand("after the refusal");
  expect(await land(guest.page)).toBe(before);
  // an edit elsewhere still goes through (the guest looked at the north-west corner a moment ago)
  await resetView(guest.page);
  await stroke(guest.page, [40, 20], [46, 20]);
  await sameLand("after an edit outside the claim");
  expect(await land(guest.page)).not.toBe(before);
});

test("undo takes back only your own last action", async () => {
  const before = await land(host.page);
  // the host's last action is its stroke at the south-west; the guest's strokes stay
  await host.page.keyboard.press("Control+z");
  await expect.poll(() => land(host.page), { timeout: 30_000 }).not.toBe(before);
  await sameLand("after the host's undo");
  const labels = (await info(guest.page)).history.filter((h) => h.applied).map((h) => h.label);
  expect(labels.length).toBeGreaterThanOrEqual(3);
  // redo brings it back
  await host.page.keyboard.press("Control+y");
  await expect.poll(() => land(host.page), { timeout: 30_000 }).toBe(before);
  await sameLand("after the host's redo");
});

test("the guest is killed: the host is paused, read-only, Save still works; Invite again carries on with a new browser", async () => {
  await killPeer(guest);
  await expect(together(host.page)).toHaveAttribute("aria-label", "Together with Bo", { timeout: 5_000 });
  const hp = await openPanel(host.page);
  await expect(hp).toContainText("Bo has left. Waiting to reconnect.", { timeout: 60_000 });
  // read-only: an edit says why and changes nothing
  await closePanel(host.page);
  await resetView(host.page);
  const before = await land(host.page);
  await pick(host.page, "2");
  await stroke(host.page, [30, 50], [36, 50]);
  await expect(message(host.page)).toContainText("Bo has left. Waiting to reconnect.", { timeout: 20_000 });
  await host.page.evaluate(() => window.dgmEditor!.idle());
  expect(await land(host.page)).toBe(before);
  // saving a copy still works
  const save = host.page.getByRole("button", { name: /^(Save to Timberborn|Download \.timber)/ });
  await expect(save).toBeEnabled();
  const download = host.page.waitForEvent("download", { timeout: 120_000 });
  await save.click();
  expect((await download).suggestedFilename()).toMatch(/\.timber$/);
  // Invite again: a new code carries on the same session; a new browser joins it and has the map as it stands
  await (await openPanel(host.page)).getByRole("button", { name: "Invite again" }).click();
  const code = (await panel(host.page).getByLabel("Room code", { exact: true }).textContent())!.trim();
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  guest = await launch("other", "s=91&z=48&d=n&t=highlands");
  await ready(guest.page);
  const gp = await openPanel(guest.page);
  await gp.getByLabel("Your name").fill("Bo");
  await gp.getByLabel("Room code to join").fill(code);
  await gp.getByRole("button", { name: "Join", exact: true }).click();
  await expect(together(guest.page)).toHaveAttribute("aria-label", "Together with Ada", { timeout: 90_000 });
  await expect(together(host.page)).toHaveAttribute("aria-label", "Together with Bo", { timeout: 90_000 });
  await expect(panel(host.page)).not.toContainText("has left");
  await sameLand("after the guest came back");
  // and they edit again
  await stroke(host.page, [30, 50], [36, 50]);
  await sameLand("after an edit past the pause");
  expect(await land(host.page)).not.toBe(before);
});

test("the host opens a new map: the guest is told first, both keep the old map in Your maps", async () => {
  const oldName = (await info(host.page)).name;
  expect((await info(guest.page)).name).toBe(oldName);
  const oldLand = await land(host.page);
  // (the host makes another map: Generate in the map generator)
  const drawer = await openDrawer(host.page);
  await expect(drawer).toBeVisible();
  // (the map's seed is kept from its link: unpinned, Generate rolls a fresh one)
  await drawer.getByRole("button", { name: "Keep", exact: true }).click();
  await generateButton(host.page).click();
  await expect(message(guest.page)).toContainText("Ada is opening a new map", { timeout: 60_000 });
  // the new map arrives: the host's, whatever it is called
  await expect.poll(async () => (await land(host.page)) !== oldLand, { timeout: 180_000 }).toBe(true);
  await sameLand("after the new map");
  expect((await info(guest.page)).name).toBe((await info(host.page)).name);
  // each side's Your maps holds the old map
  for (const p of [host, guest]) {
    const yours = await openYourMaps(p.page);
    await expect(yours.getByText(oldName).first()).toBeVisible({ timeout: 30_000 });
    await p.page.locator("header.editor-bar").getByRole("button", { name: "Your maps", exact: true }).click();
  }
});

test("Leave: the other is told, the map stays and edits alone", async () => {
  const gp = await openPanel(guest.page);
  await gp.getByRole("button", { name: "Leave" }).click();
  await expect(together(guest.page)).toHaveAttribute("aria-label", "Together");
  await expect(panel(host.page)).toContainText("Bo has left. Waiting to reconnect.", { timeout: 30_000 }).catch(async () => {
    await openPanel(host.page);
    await expect(panel(host.page)).toContainText("Bo has left. Waiting to reconnect.", { timeout: 30_000 });
  });
  // alone, the guest edits its copy as any map
  const before = await land(guest.page);
  await pick(guest.page, "2");
  await stroke(guest.page, [20, 20], [30, 20]);
  await expect.poll(() => land(guest.page)).not.toBe(before);
  await (await openPanel(host.page)).getByRole("button", { name: "Leave" }).click();
  await expect(together(host.page)).toHaveAttribute("aria-label", "Together");
});
