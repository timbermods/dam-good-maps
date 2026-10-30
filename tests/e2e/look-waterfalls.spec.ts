// Waterfalls as the game draws them (PLAN §20 D201, amended 2026-10-29) in the page: a generated map's falls, the
// water's own faces where it steps down, are drawn with its water without a shader error, in the look the browser
// gets (the Standard look on a GPU, the Light look in software), with clear water on and off and under a slice, and
// they follow the water: a lip gone dry takes its faces with it, and the water coming back brings the same water back.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("the 3D view draws a map's falls, and they follow the water", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=3&z=128&d=n&t=canyon");
  // (the background check may replace the water once)
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.dgmEditor!.idle());

  const triangles = () => page.evaluate(() => window.dgm3d!.renderer.info().triangles);
  const drawn = () =>
    page.evaluate(() => {
      const r = window.dgm3d!.renderer as unknown as { renderNow(): void; gl: { getContext(): WebGLRenderingContext } };
      r.renderNow();
      return r.gl.getContext().getError();
    });
  // the map's lips: tiles whose water steps down 0.3 or more to the water beside them
  const lips = await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { map: { W: number; H: number; surface: { surface: Float32Array } } };
    const m = r.map;
    const s = m.surface.surface;
    const SX = [1, -1, 0, 0];
    const SY = [0, 0, 1, -1];
    const out: number[] = [];
    for (let i = 0; i < m.W * m.H; i++) {
      if (!(s[i] === s[i])) continue;
      const x = i % m.W;
      const y = Math.floor(i / m.W);
      for (let k = 0; k < 4; k++) {
        const xx = x + SX[k];
        const yy = y + SY[k];
        if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H) continue;
        const j = yy * m.W + xx;
        if (s[j] === s[j] && s[i] - s[j] >= 0.3) {
          out.push(i);
          break;
        }
      }
    }
    return out;
  });
  expect(lips.length).toBeGreaterThan(10);
  const before = await triangles();
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
  expect(await triangles()).toBe(before);

  // a lip gone dry: its top and faces go (and nothing else of the water changed)
  const changed = await page.evaluate((tile) => {
    const r = window.dgm3d!.renderer as unknown as { map: { water: { count: number; tile: Int32Array; floor: Float32Array; depth: Float32Array; contamination: Float32Array } }; updateWater(w: unknown): number };
    const w = r.map.water;
    (window as unknown as { __water: unknown }).__water = w;
    const keep: number[] = [];
    for (let k = 0; k < w.count; k++) if (w.tile[k] !== tile) keep.push(k);
    return r.updateWater({ count: keep.length, tile: Int32Array.from(keep, (k) => w.tile[k]), floor: Float32Array.from(keep, (k) => w.floor[k]), depth: Float32Array.from(keep, (k) => w.depth[k]), contamination: Float32Array.from(keep, (k) => w.contamination[k]) });
  }, lips[0]);
  expect(changed).toBeGreaterThan(0);
  // (the water's chunks are meshed in the workers and drawn a frame or two on)
  const waterDrawn = () => page.waitForFunction(() => window.dgm3d!.renderer.waterDrawn);
  await waterDrawn();
  expect(await triangles()).not.toBe(before);
  expect(await drawn()).toBe(0);

  // the water back: the same water again
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { updateWater(w: unknown): number };
    r.updateWater((window as unknown as { __water: unknown }).__water);
  });
  await waterDrawn();
  expect(await triangles()).toBe(before);
  expect(await drawn()).toBe(0);
  expect(errors).toEqual([]);
});
