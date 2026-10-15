// The generator's Name box names the next map: the typed name goes to the map Generate makes, the open map keeps its own
// name, and no copy of it is left in Your maps.

import { expect, test } from "@playwright/test";
import { generateButton, openDrawer, openEditor, openYourMaps } from "./open";

test("a name typed in the generator's panel names the new map, and the map it replaced is not renamed or kept", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  const first = await page.evaluate(() => window.dgmEditor!.info().name);
  const drawer = await openDrawer(page);
  const field = drawer.locator("#map-name");
  await expect(field).toHaveValue(first);
  await field.fill("Echo Gorge");
  // (the open map's title is untouched while the name waits for the next map)
  await expect(page.locator(".editor-title .title-button")).toHaveText(first);

  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  await generateButton(page).click();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().name), { timeout: 120_000 }).toBe("Echo Gorge");
  await expect(generateButton(page)).toBeEnabled({ timeout: 120_000 });
  await expect(field).toHaveValue("Echo Gorge");
  await expect(page.locator(".editor-title .title-button")).toHaveText("Echo Gorge");

  // Your maps keeps the new map under its name, and nothing of the old one
  const yours = await openYourMaps(page);
  await expect(yours.locator(".ym-tile")).toHaveCount(1, { timeout: 30_000 });
  await expect(yours.locator(".ym-tile")).toContainText("Echo Gorge");
  await expect(yours.getByText(first, { exact: true })).toHaveCount(0);
});
