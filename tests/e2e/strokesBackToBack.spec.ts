// Strokes painted back to back (#410): each new stroke starts before the worker has answered the one
// before, so its answer comes while the next is being painted. The page's land stays its own until
// nothing it painted is in flight, then the worker's goes in: the same, byte for byte, and the page's
// mismatch warning never fires.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);

test("strokes painted back to back end with the page's land the worker's, byte for byte (#410)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  await topDown(page);
  // Raise, then Lower, Flatten and Smooth, each stroke pressed the moment the last is let go
  const keys = ["2", "3", "4", "5", "2", "3"];
  for (let k = 0; k < keys.length; k++) {
    await page.keyboard.press(keys[k]);
    const y = 30 + 12 * k;
    const p = await client(page, 30, y);
    const q = await client(page, 90, y + 6);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let s = 1; s <= 24; s++) {
      await page.mouse.move(p.x + ((q.x - p.x) * s) / 24, p.y + ((q.y - p.y) * s) / 24);
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
  }
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await page.evaluate(() => window.dgmEditor!.info())).history.filter((h) => h.applied).length).toBe(keys.length);
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
  expect(await heights(page)).toEqual(built);
});
