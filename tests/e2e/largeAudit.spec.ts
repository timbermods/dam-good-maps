// Three fixes both usability judges agreed on (a 256² map at 2560×1440): the map-making dialog counts itself (the attempt
// and the time so far), a force that removed sources says how many with Undo, and Carve's Canyon depth reads as the cap it
// is ("at most N", D226).

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = (page: Page) => page.evaluate(() => window.dgmEditor!.info().history.filter((h) => h.applied).map((h) => h.label));
const sourcesOnMap = (page: Page) =>
  page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: [number, number][] = [];
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource") out.push([e.x[k], e.y[k]]);
    return out;
  });

/** A fault painted along the row through a tile, `reach` tiles each side, and the force kept. */
async function fault(page: Page, [x, y]: [number, number], reach: number) {
  const a = await page.evaluate(([px, py]) => window.dgmEditor!.tileToClient(px, py), [Math.max(1, x - reach), y] as [number, number]);
  const b = await page.evaluate(([px, py]) => window.dgmEditor!.tileToClient(px, py), [x + reach, y] as [number, number]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) {
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 16, a.y + ((b.y - a.y) * k) / 16);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.force()), { timeout: 30_000 }).toBeNull();
  await idle(page);
}

test("a map being made counts itself: the attempt under way and the time so far, ticking", async ({ page }) => {
  test.setTimeout(240_000);
  // a 256² map takes long enough to count; the first look of a link has the dialog under the land
  await page.goto("./#s=7&z=256&d=n&t=riverValley");
  const count = page.locator(".making-dialog .making-count");
  await expect(count).toHaveText(/^Attempt \d+ · \d+ s$/, { timeout: 90_000 });
  const first = await count.innerText();
  await expect.poll(() => count.innerText(), { timeout: 10_000 }).not.toBe(first);
  // (the dialog's words and Esc are as they were: the count is a line under them)
  await expect(page.locator("#making-words")).toHaveText(/…$/);
});

test("a force that removed sources says how many, with Undo; with Ride it says nothing", async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.keyboard.press("Shift+Digit5");
  const row = page.getByRole("group", { name: "Quake options" });
  await expect(row.getByRole("group", { name: "Sources" }).getByRole("button", { name: "Clear" })).toHaveAttribute("aria-pressed", "true");
  const sources = await sourcesOnMap(page);
  expect(sources.length).toBeGreaterThan(0);
  const spot = sources.at(-1)!;
  const n0 = (await labels(page)).length;

  await fault(page, spot, 12);
  const left = await sourcesOnMap(page);
  const cleared = sources.length - left.length;
  expect(cleared).toBeGreaterThan(0);
  const note = page.locator(".editor-message");
  await expect(note).toContainText(`Cleared ${cleared} ${cleared === 1 ? "source" : "sources"}. Set Sources to Ride to keep them.`);
  const undo = note.getByRole("button", { name: "Undo" });
  await expect(undo).toHaveAttribute("title", "Take the force back");
  expect((await labels(page)).length).toBe(n0 + 1);

  // Undo takes the force back: the sources stand again, the note goes
  await undo.click();
  await idle(page);
  await expect(note).toHaveCount(0);
  expect((await labels(page)).length).toBe(n0);
  expect((await sourcesOnMap(page)).length).toBe(sources.length);

  // the note goes the moment another step lands, so its Undo only ever takes back the force: a stroke painted after it
  await fault(page, spot, 12);
  await expect(note).toContainText("Cleared");
  await page.keyboard.press("2");
  const free = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y + 20), spot);
  await page.mouse.move(free.x, free.y);
  await page.mouse.down();
  await page.mouse.move(free.x + 12, free.y + 4, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  await expect(note).toHaveCount(0);
  expect((await labels(page)).length).toBe(n0 + 2);
  await page.keyboard.press("Control+z");
  await idle(page);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await labels(page)).length).toBe(n0);
  expect((await sourcesOnMap(page)).length).toBe(sources.length);
  await page.keyboard.press("Shift+Digit5");

  // Ride keeps them riding the ground: nothing was removed, nothing to say
  await row.getByRole("group", { name: "Sources" }).getByRole("button", { name: "Ride" }).click();
  await fault(page, spot, 12);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect((await sourcesOnMap(page)).length).toBe(sources.length);
  await expect(page.locator(".editor-message")).toHaveCount(0);
});

test("Carve's Canyon depth reads as a cap: its row says \"at most N\", its tooltip says the most it may cut", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("button", { name: "Carve (Shift+1)" }).click();
  const row = page.getByRole("group", { name: "Carve options" });
  const depth = row.locator(".set:has(input[aria-label='Canyon depth'])");
  await expect(depth.locator(".set-value")).toHaveText(/^at most \d+$/);
  await expect(depth).toHaveAttribute("title", "The most the canyon may cut, less where the land or Floor stops it");
  // (set by hand, the number follows)
  await depth.getByRole("slider").fill("12");
  await expect(depth.locator(".set-value")).toHaveText("at most 12");
});
