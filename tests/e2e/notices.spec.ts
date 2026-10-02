// The editor's notices (D213's "No badwater" line among them) sit where they cover no control, in
// every layout: a force's rows, the view buttons, the water bar, the minimap and the rest stay clear
// and clickable while a notice shows.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The visible controls on and round the map that the notices overlap, by a short name. */
async function covered(page: Page): Promise<string[]> {
  const notices = (await page.locator(".editor-notices").boundingBox())!;
  const boxes = await page.evaluate(() => {
    const sel = ".editor-map button, .editor-map input, .editor-map select, .editor-map .map-bar, .editor-map .minimap, .editor-map .water-bar, .editor-map .readout, .editor-map .compass, .editor-map .layer-legend";
    return Array.from(document.querySelectorAll<HTMLElement>(sel))
      .filter((e) => !e.closest(".editor-notices") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.getAttribute("aria-label") || e.className || e.tagName, x: r.x, y: r.y, width: r.width, height: r.height };
      })
      .filter((b) => b.width > 0 && b.height > 0);
  });
  return boxes.filter((b) => overlap(notices, b)).map((b) => b.name);
}

for (const size of [
  { name: "wide", width: 1280, height: 720 },
  { name: "narrow", width: 820, height: 900 },
]) {
  test(`notices (${size.name}): the No badwater line (D213) covers no control, with a force's rows open`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openEditor(page, "s=4242&z=96&d=n&t=highlands");
    // (the panel and the rows plate do not fit side by side in a narrow window: the player collapses the panel)
    if (size.name === "narrow") await page.getByRole("button", { name: "Collapse the panel" }).click();
    await page.getByRole("button", { name: "Minimap" }).click();

    // every source away (the map's badwater springs with them): the map is a No badwater map now
    await page.keyboard.press("m");
    await page.keyboard.press("Control+a");
    const row = page.getByRole("group", { name: "Selection" });
    for (const name of [/^Water sources/, /^Badwater sources/]) {
      await row.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("menu", { name: "Delete" }).getByRole("menuitem", { name }).click();
      await idle(page);
    }
    await page.keyboard.press("Escape");
    const notices = page.locator(".editor-notices");
    await expect(notices).toContainText("No badwater");

    // each force's rows, and the notice beside them, never over them
    const forces = page.getByRole("group", { name: "Forces" }).getByRole("button");
    const n = await forces.count();
    expect(n).toBeGreaterThan(0);
    for (let k = 0; k < n; k++) {
      const f = forces.nth(k);
      const name = (await f.textContent())!.trim();
      await f.click();
      await expect(page.getByRole("group", { name: `${name} options` })).toBeVisible();
      await expect(notices).toBeVisible();
      expect(await covered(page), name).toEqual([]);
    }
  });
}
