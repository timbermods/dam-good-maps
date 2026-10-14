// The drought line (the Weather view, D133, D269): the faint waterline of the drought's last day is drawn once the
// worker has it, is put away while a Drought day is held and at the next edit, and comes back for the new map's version.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const showing = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.droughtLineShowing);

test("the drought line shows, goes while a day is held and at an edit, and comes back with the new map's", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  // (it arrives once the drought's days are worked out in the background)
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);

  // a held Drought day shows the water of that day: the line is not drawn over it
  const drought = page.getByRole("button", { name: "Drought", exact: true });
  await drought.click();
  await expect.poll(() => showing(page)).toBe(false);
  await drought.click();
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);

  // an edit makes a new version: the line goes at once and the new map's comes in the background
  const v0 = await page.evaluate(() => window.dgmEditor!.info().version);
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[4, 4, 4]], level: 15 } } as never, "Raise a tile"));
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().version)).toBeGreaterThan(v0);
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});
