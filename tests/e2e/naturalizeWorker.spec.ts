// Naturalize weathered in the worker (PLAN §20 D422; D399's rule 3): a stroke painted in the page shows
// land while the button is down (it comes back from the worker), becomes one step of the history, and
// the map the worker builds from the operation is the one painted, byte for byte; Esc takes a stroke
// back with no trace. A large brush at full strength on terraced land, so the weathering has work to do.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

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
  await topDown(page);
  // Naturalize, Size 12, Strength 10
  await page.keyboard.press("6");
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
  expect(i.history.at(-1)!.label).toMatch(/^Naturalize \d+ tiles?$/);
  const last = (await page.evaluate(() => window.dgmEditor!.lastStroke())) as { tool: string; weathering?: number; size: number; strength: number } | null;
  expect(last?.tool).toBe("naturalize");
  expect(last?.weathering).toBe(5);
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

/** The button comes up at tile b and `keys` are pressed in the same moment (one task of the page's, so the stroke's
 *  last land is surely still coming from its worker); whether its step was on the history by then. */
async function letGoAndPress(page: Page, b: [number, number], keys: string[]): Promise<boolean> {
  const q = await client(page, ...b);
  return page.evaluate(
    ([x, y, keys]) => {
      const r = window.dgm3d!.renderer as unknown as { canvas: HTMLCanvasElement; drag: { id: number } | null };
      r.canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: r.drag!.id, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true }));
      // (the stroke on the history, applied: a step taken back before it stays there, not applied)
      const last = window.dgmEditor!.info().history.at(-1);
      const landed = !!last && last.applied && /^Naturalize/.test(last.label);
      for (const key of keys) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      return landed;
    },
    [q.x, q.y, keys] as const,
  );
}

test("an undo or a redo pressed while a Naturalize stroke is finishing waits for it, then takes it back or puts it again (#880)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=3&z=96&d=n&t=riverValley&tr=100", { timeout: 180_000 });
  await topDown(page);
  await settled(page);
  await page.keyboard.press("6");
  for (let k = 0; k < 6; k++) await page.keyboard.press("}");
  for (let k = 0; k < 5; k++) await page.keyboard.press("]");
  const before = await heights(page);
  const steps = (await info(page)).history.length;
  /** A stroke across the terraces, the button still down at its end. */
  async function paint(a: [number, number], b: [number, number]) {
    const p = await client(page, ...a);
    const q = await client(page, ...b);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let k = 1; k <= 30; k++) {
      await page.mouse.move(p.x + ((q.x - p.x) * k) / 30, p.y + ((q.y - p.y) * k) / 30);
      await page.waitForTimeout(16);
    }
  }

  // Z as the button comes up: the stroke lands, then the undo takes it back (the land as it was)
  await paint([30, 48], [66, 48]);
  expect(await letGoAndPress(page, [66, 48], ["z"]), "the stroke still on its way when Z went").toBe(false);
  await page.mouse.up();
  await page.waitForFunction((n) => window.dgmEditor!.info().history.length > n, steps, { timeout: 60_000 });
  await settled(page);
  let i = await info(page);
  expect(i.history.at(-1)!.label).toMatch(/^Naturalize \d+ tiles?$/);
  expect(i.history.at(-1)!.applied).toBe(false);
  expect(i.history.slice(0, steps).every((h) => h.applied)).toBe(true);
  expect(await heights(page)).toEqual(before);

  // Z and C as the button comes up: the stroke lands, is taken back, and is put again
  await paint([30, 40], [66, 40]);
  expect(await letGoAndPress(page, [66, 40], ["z", "c"])).toBe(false);
  await page.mouse.up();
  await page.waitForFunction((n) => window.dgmEditor!.info().history.length > n && window.dgmEditor!.info().history.at(-1)!.applied, steps, { timeout: 60_000 });
  await settled(page);
  i = await info(page);
  expect(i.history.length).toBe(steps + 1);
  expect(i.history.at(-1)!.label).toMatch(/^Naturalize \d+ tiles?$/);
  const painted = await heights(page);
  expect(painted.some((h, k) => h !== before[k])).toBe(true);
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.sessionView()).view.heights));
  expect(built).toEqual(painted);
  expect(errors).toEqual([]);
});

test("a Naturalize stroke over moist soil changes nothing and says why beside the pointer (showcase-craft gap 23)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=3&z=96&d=n&t=riverValley&tr=100", { timeout: 180_000 });
  await topDown(page);
  await settled(page);
  // moist ground keeps its height (weather.ts, rule 3): a small stroke well inside moist soil, no water on it, on the map
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const r = 4;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = r; y < m.H - r; y++)
      for (let x = r; x < m.W - r; x++) {
        let ok = onMap(x - 1, y) && onMap(x + 1, y);
        for (let yy = y - r; yy <= y + r && ok; yy++)
          for (let xx = x - r; xx <= x + r && ok; xx++) if (!(m.soil!.moisture[yy * m.W + xx] > 0) || m.surface.depth[yy * m.W + xx] > 0) ok = false;
        if (ok) return [x, y] as [number, number];
      }
    return null;
  });
  expect(spot, "a patch of moist soil").not.toBeNull();
  const [x, y] = spot!;
  await page.keyboard.press("6");
  for (let k = 0; k < 12; k++) await page.keyboard.press("{");
  await page.waitForTimeout(1300);
  const before = await heights(page);
  const steps = (await info(page)).history.length;
  await drag(page, [x - 1, y], [x + 1, y]);
  await expect(page.locator(".shape-note")).toHaveText("Moist ground keeps its height: weather dry land");
  await settled(page);
  expect((await info(page)).history.length).toBe(steps);
  expect(await heights(page)).toEqual(before);
});
