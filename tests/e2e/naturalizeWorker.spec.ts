// Naturalize weathered in the worker (PLAN §20 D422; D399's rule 3): a stroke painted in the page shows
// land while the button is down (it comes back from the worker), becomes one step of the history, and
// the map the worker builds from the operation is the one painted, byte for byte; Esc takes a stroke
// back with no trace. A large brush at full strength on terraced land, so the weathering has work to do.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const settled = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
}

/** A drag from tile a to tile b; `mid` runs halfway, the button still down. */
async function drag(page: Page, a: [number, number], b: [number, number], mid?: () => Promise<void>, end: "up" | "escape" = "up") {
  const p = await client(page, ...a);
  const q = await client(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 1; k <= 30; k++) {
    await page.mouse.move(p.x + ((q.x - p.x) * k) / 30, p.y + ((q.y - p.y) * k) / 30);
    await page.waitForTimeout(16);
    if (k === 20 && mid) await mid();
  }
  if (end === "escape") await page.keyboard.press("Escape");
  await page.mouse.up();
}

test("a Naturalize stroke is weathered in the worker: shown while painted, built byte for byte, Esc leaves no trace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=3&z=96&d=n&t=riverValley&tr=100", { timeout: 180_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  // Naturalize, Size 12, Strength 10
  await page.keyboard.press("5");
  for (let k = 0; k < 6; k++) await page.keyboard.press("}");
  for (let k = 0; k < 5; k++) await page.keyboard.press("]");
  const before = await heights(page);

  // the land changes while the button is down (the worker's answer), and the stroke is one step
  let during: number[] = [];
  await drag(page, [30, 48], [66, 48], async () => {
    await page.waitForTimeout(150);
    during = await heights(page);
  });
  expect(during.some((h, i) => h !== before[i]), "land shown while painting").toBe(true);
  // (the worker's stroke becomes an operation once its last land is in)
  await page.waitForFunction(() => /^Naturalize/.test(window.dgmEditor!.info().history.at(-1)?.label ?? ""), null, { timeout: 60_000 });
  await settled(page);
  const i = await info(page);
  expect(i.history.at(-1)!.label).toMatch(/^Naturalize, \d+ tiles?$/);
  const last = (await page.evaluate(() => window.dgmEditor!.lastStroke())) as { tool: string; weathering?: number; size: number; strength: number } | null;
  expect(last?.tool).toBe("naturalize");
  expect(last?.weathering).toBe(4);
  // the worker's map is the one painted, byte for byte
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  const painted = await heights(page);
  expect(painted.some((h, k) => h !== before[k])).toBe(true);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.sessionView()).view.heights));
  expect(built).toEqual(painted);

  // Esc while painting: the land goes back as it was, and no step is added
  const steps = (await info(page)).history.length;
  await drag(page, [30, 30], [60, 30], undefined, "escape");
  await settled(page);
  expect(await heights(page)).toEqual(painted);
  expect((await info(page)).history.length).toBe(steps);
  expect(errors).toEqual([]);
});
