// Waterfalls with shape and volume (PLAN §20 D201, D215) in the page: a generated map's falls are
// drawn (one instance each, per chunk) without a shader error, in the look the browser gets (the
// Standard look on a GPU, the Light look in software), with clear water on and off and under a
// slice, and they follow the water: a lip gone dry takes its fall with it, and the water coming back
// brings it back, with no fall left behind.

import { expect, test } from "@playwright/test";

test("the 3D view draws a map's falls, and they follow the water", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=3&z=128&d=n&t=canyon");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 180_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d && window.dgm3d.renderer.size?.W === 128, null, { timeout: 120_000 });
  // (the background check may replace the water once)
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.dgmEditor!.idle());

  const falls = () => page.evaluate(() => window.dgm3d!.renderer.info().falls);
  const drawn = () =>
    page.evaluate(() => {
      const r = window.dgm3d!.renderer as unknown as { renderNow(): void; gl: { getContext(): WebGLRenderingContext } };
      r.renderNow();
      return r.gl.getContext().getError();
    });
  const before = await falls();
  expect(before).toBeGreaterThan(10);
  expect(await drawn()).toBe(0);
  // with clear water (T), and with the world sliced at a layer (D196, D212)
  await page.evaluate(() => window.dgm3d!.renderer.setClearWater(true));
  expect(await drawn()).toBe(0);
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(6));
  expect(await drawn()).toBe(0);
  await page.evaluate(() => {
    window.dgm3d!.renderer.setSlice(null);
    window.dgm3d!.renderer.setClearWater(false);
  });
  expect(await falls()).toBe(before);

  // a lip gone dry: its falls go (and nothing else of the water changed)
  const lip = await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { map: { W: number; H: number; surface: { surface: Float32Array }; water: { count: number; tile: Int32Array; floor: Float32Array; depth: Float32Array; contamination: Float32Array } } };
    const m = r.map;
    const s = m.surface.surface;
    const SX = [1, -1, 0, 0];
    const SY = [0, 0, 1, -1];
    for (let i = 0; i < m.W * m.H; i++) {
      if (!(s[i] === s[i])) continue;
      const x = i % m.W;
      const y = Math.floor(i / m.W);
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const xx = x + SX[k];
        const yy = y + SY[k];
        if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H) continue;
        const j = yy * m.W + xx;
        if (s[j] === s[j] && s[i] - s[j] >= 0.3) n++;
      }
      if (n) return { tile: i, falls: n };
    }
    return null;
  });
  expect(lip).not.toBeNull();
  const changed = await page.evaluate((tile) => {
    const r = window.dgm3d!.renderer as unknown as { map: { water: { count: number; tile: Int32Array; floor: Float32Array; depth: Float32Array; contamination: Float32Array } }; updateWater(w: unknown): number };
    const w = r.map.water;
    (window as unknown as { __water: unknown }).__water = w;
    const keep: number[] = [];
    for (let k = 0; k < w.count; k++) if (w.tile[k] !== tile) keep.push(k);
    return r.updateWater({ count: keep.length, tile: Int32Array.from(keep, (k) => w.tile[k]), floor: Float32Array.from(keep, (k) => w.floor[k]), depth: Float32Array.from(keep, (k) => w.depth[k]), contamination: Float32Array.from(keep, (k) => w.contamination[k]) });
  }, lip!.tile);
  expect(changed).toBeGreaterThan(0);
  expect(await falls()).toBeLessThanOrEqual(before - lip!.falls);
  expect(await drawn()).toBe(0);

  // the water back: the same falls again
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { updateWater(w: unknown): number };
    r.updateWater((window as unknown as { __water: unknown }).__water);
  });
  expect(await falls()).toBe(before);
  expect(await drawn()).toBe(0);
  expect(errors).toEqual([]);
});
