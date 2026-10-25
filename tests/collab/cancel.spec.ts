// Cancelling a map being made, and a new map's name, with a Together session on (D486), between real, separate browser processes over the
// real connection path (see page.spec.ts for the stack): the three ways the session used to be lost or split.
//   1. Invite, Cancel, make a map and Cancel it (which replaces the worker), Invite again: the new Invite gets its code.
//   2. The host opens a real place and cancels: the session's worker stays, the guest is told no more, and edits go both ways.
//   3. The host types a name in the generator and Generates: the host and the guest get that name; then Leave answers at once.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { killPeer, launchPeer } from "./peers";
import type { Kind, Peer } from "./peers";
import { generateButton, openDrawer } from "../e2e/open";
import { galleryIndex, type PlaceIndex } from "../../src/core/places/place";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial", timeout: 600_000 });

/** The largest real place: the one that takes longest to build, so Cancel has time to be pressed. */
const BIG = [...galleryIndex(JSON.parse(readFileSync("public/real-places/index.json", "utf8")) as PlaceIndex).places].sort((a, b) => b.size - a.size)[0]!;

let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(420_000);
  stack = await startStack({ app: true });
});
test.afterAll(async () => {
  await stack?.stop();
});

function launch(kind: Kind, fragment: string): Promise<Peer> {
  return launchPeer(
    kind,
    async (page) => {
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
    true,
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
async function closePanel(page: Page) {
  if ((await together(page).getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
}
const ready = async (page: Page) => {
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d);
  await page.evaluate(() => window.dgmEditor!.idle());
};
const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const land = (page: Page) =>
  page.evaluate(async () => {
    const h = window.dgm3d?.renderer.mapState()?.heights;
    if (!h) return "none";
    const d = await crypto.subtle.digest("SHA-256", h.slice().buffer);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  });
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
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
const message = (page: Page) => page.locator(".editor-message");
const dialog = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Cancel" }) });

let host: Peer | undefined;
let guest: Peer | undefined;
test.afterAll(async () => {
  for (const p of [guest, host]) if (p) await killPeer(p).catch(() => undefined);
});

async function invite(page: Page, name: string): Promise<string> {
  const p = await openPanel(page);
  await p.getByLabel("Your name").fill(name);
  await p.getByRole("button", { name: "Invite", exact: true }).click();
  const code = (await p.getByLabel("Room code", { exact: true }).textContent())!.trim();
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  return code;
}

async function connect(names: [string, string]) {
  host = await launch("chromium", "s=4242&z=64&d=n&t=highlands");
  guest = await launch("other", "s=77&z=48&d=n&t=highlands");
  await Promise.all([ready(host.page), ready(guest.page)]);
  const code = await invite(host.page, names[0]);
  const gp = await openPanel(guest.page);
  await gp.getByLabel("Your name").fill(names[1]);
  await gp.getByLabel("Room code to join").fill(code);
  await gp.getByRole("button", { name: "Join", exact: true }).click();
  try {
    await expect(together(guest.page)).toHaveAttribute("aria-label", `Together with ${names[0]}`, { timeout: 90_000 });
  } catch (e) {
    console.log("GUEST PANEL:", await panel(guest.page).innerText().catch(() => "(none)"), "| HOST PANEL:", await panel(host.page).innerText().catch(() => "(none)"));
    throw e;
  }
  await expect(together(host.page)).toHaveAttribute("aria-label", `Together with ${names[1]}`, { timeout: 90_000 });
  await Promise.all([closePanel(host.page), closePanel(guest.page)]);
  await Promise.all([host.page, guest.page].map((p) => p.evaluate(() => window.dgmEditor!.idle())));
}

async function sameLand() {
  await expect.poll(async () => (await land(guest!.page)) === (await land(host!.page)), { timeout: 120_000, message: "the same land on both maps" }).toBe(true);
}

test("Invite, Cancel, make a map and Cancel it, Invite again: the new Invite gets its code and Cancel takes it back", async () => {
  host = await launch("chromium", "s=4242&z=64&d=n&t=highlands");
  await ready(host.page);
  const page = host.page;
  await invite(page, "Ada");
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(together(page)).toHaveAttribute("aria-label", "Together");
  await closePanel(page);

  // a map made over the open one and cancelled: the open map comes back in a new worker
  const name = (await info(page)).name;
  const drawer = await openDrawer(page);
  await drawer.getByRole("button", { name: "Keep", exact: true }).click();
  await generateButton(page).click();
  await expect(dialog(page)).toBeVisible({ timeout: 30_000 });
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0, { timeout: 60_000 });
  await ready(page);
  await expect.poll(async () => (await info(page)).name, { timeout: 60_000 }).toBe(name);

  // Invite again: a code, and Cancel takes it back (neither waits on the worker that was replaced)
  await invite(page, "Ada");
  await panel(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(together(page)).toHaveAttribute("aria-label", "Together", { timeout: 15_000 });
  await killPeer(host);
  host = undefined;
});

test("the host opens a real place and cancels: the session stays whole and both can edit", async () => {
  await connect(["Ada", "Bo"]);
  const [h, g] = [host!.page, guest!.page];
  await h.locator("header.editor-bar").getByRole("button", { name: "Real places", exact: true }).click();
  const tile = h.getByRole("region", { name: "Real places" }).getByTitle(`Open ${BIG.name}`, { exact: true });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(dialog(h).getByRole("status")).toHaveText(/^Opening /, { timeout: 10_000 });
  await expect(message(g)).toContainText("Ada is opening a new map", { timeout: 60_000 });
  await dialog(h).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(h)).toHaveCount(0, { timeout: 60_000 });
  // the guest is told no more, and the host's panel still says together
  await expect(message(g).filter({ hasText: "is opening a new map" })).toHaveCount(0, { timeout: 30_000 });
  await expect(together(h)).toHaveAttribute("aria-label", "Together with Bo");
  await expect(together(g)).toHaveAttribute("aria-label", "Together with Ada");
  await h.getByRole("button", { name: "Reset view" }).click();
  await g.getByRole("button", { name: "Reset view" }).click();
  await h.waitForTimeout(700);

  // each side's edit reaches the other
  const before = await land(g);
  await h.keyboard.press("2");
  await stroke(h, [20, 20], [30, 20]);
  await expect.poll(() => land(g), { timeout: 60_000 }).not.toBe(before);
  await sameLand();
  const mid = await land(h);
  await g.keyboard.press("3");
  await stroke(g, [40, 40], [46, 40]);
  await expect.poll(() => land(h), { timeout: 60_000 }).not.toBe(mid);
  await sameLand();
});

test("the host types a name and Generates in the session: the host and the guest get that name", async () => {
  const [h, g] = [host!.page, guest!.page];
  const oldLand = await land(h);
  const drawer = await openDrawer(h);
  await drawer.getByRole("button", { name: "Keep", exact: true }).click();
  await h.locator("#map-name").fill("Shared Valley");
  await generateButton(h).click();
  await expect.poll(async () => (await land(h)) !== oldLand, { timeout: 180_000 }).toBe(true);
  try {
    await sameLand();
  } catch (e) {
    const [hi, gi] = [await info(h), await info(g)];
    console.log("HOST", hi.name, hi.W, hi.version, "GUEST", gi.name, gi.W, gi.version, "| guest message:", await message(g).allInnerTexts(), "| host message:", await message(h).allInnerTexts());
    throw e;
  }
  await expect.poll(async () => (await info(h)).name, { timeout: 30_000 }).toBe("Shared Valley");
  await expect.poll(async () => (await info(g)).name, { timeout: 60_000 }).toBe("Shared Valley");
});

test("Leave answers at once after the host's cancelled and renamed maps", async () => {
  const h = host!.page;
  await (await openPanel(h)).getByRole("button", { name: "Leave" }).click();
  await expect(together(h)).toHaveAttribute("aria-label", "Together", { timeout: 15_000 });
});
