// Kyler's case (PLAN §20 D290), through the page: a clean source on uneven ground, switched to
// badwater, is never refused: its nine tiles are cut down to the lowest of them, a small level spring
// pool, in the same undo step as the switch. And the shelf's Badwater source shows green there.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));

test("a clean source on uneven ground switched to badwater cuts its own spring pool, one step (D290)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=4242&z=96&d=n&t=highlands");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  // the middle of a 3 × 3 of dry, uneven ground with nothing on it, where the map takes the pointer
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const W = m.W;
    const e = m.entities;
    const taken = new Set<number>();
    for (let k = 0; k < e.count; k++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) taken.add((e.y[k] + dy) * W + e.x[k] + dx);
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 20; y < m.H - 20; y++)
      for (let x = 20; x < W - 20; x++) {
        const t: number[] = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t.push((y + dy) * W + x + dx);
        if (t.some((i) => taken.has(i) || m.surface.depth[i] > 0)) continue;
        const hs = t.map((i) => m.heights[i]);
        if (Math.max(...hs) - Math.min(...hs) >= 1 && onMap(x, y)) return [x, y] as [number, number];
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const [x, y] = spot!;
  const W = (await info(page)).W;
  const nine: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) nine.push((y + dy) * W + x + dx);

  // the shelf's Badwater source: green there (it will cut its pool)
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Badwater source" }).click();
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), y * W + x, { timeout: 10_000 });
  expect((await page.evaluate(() => window.dgmEditor!.fit()))!.problem).toBeNull();
  await page.keyboard.press("Escape");

  // a clean source there, then switched to badwater
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  await page.keyboard.press("Escape");
  const before = await heights(page);
  const n0 = (await info(page)).history.filter((h) => h.applied).length;
  await page.mouse.click(p.x, p.y);
  const row = page.getByRole("group", { name: /Water source, selected/ });
  await expect(row).toBeVisible();
  await row.getByRole("combobox", { name: "Water" }).selectOption("bad");
  await idle(page);
  await expect.poll(async () => (await info(page)).history.filter((h) => h.applied).map((h) => h.label)).toHaveLength(n0 + 1);
  expect((await info(page)).history.filter((h) => h.applied).at(-1)!.label).toBe("Make a source badwater");
  const low = Math.min(...nine.map((i) => before[i]));
  const after = await heights(page);
  for (const i of nine) expect(after[i]).toBe(low);
  // one undo: the clean source back on its own ground
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect(errors).toEqual([]);
});
