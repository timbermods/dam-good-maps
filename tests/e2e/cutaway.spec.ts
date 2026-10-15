// The level-slice cutaway's shader branch (3D view, part 6; D207): it is compiled only on a map with terrain above
// terrain, which no other spec opens. A 12² map with a roofed block, cut through its cave, draws in Standard and in
// High with no shader error and with the terrain on screen. (Software drawing on CI is treated as a GPU, as
// rendererWarmup.spec does, so the High look's program is checked there too.)

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

test("a map with a cave, cut through it, draws in Standard and High with the cutaway's branch compiled", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  for (const look of ["standard", "high"] as const) {
    const out = await page.evaluate((lk) => {
      type R = import("../../src/render3d").MapRenderer;
      const shown = window.dgm3d!.renderer;
      const Make = shown.constructor as new (c: HTMLCanvasElement) => R;
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
      const c = document.createElement("canvas");
      c.style.cssText = "width:100%;height:100%;display:block";
      host.append(c);
      document.body.append(host);
      const r = new Make(c);
      r.setLookChoice(lk, false);
      // 12² of ground at level 6, and a 3 × 3 block with a cave: rock at 0–1, air at 2–4, a roof at 5–7
      const W = 12;
      const heights = new Uint8Array(W * W).fill(6);
      const tiles: number[] = [];
      for (let y = 4; y < 7; y++) for (let x = 4; x < 7; x++) tiles.push(y * W + x);
      const voxels = new Uint8Array(tiles.length * 23);
      tiles.forEach((i, k) => {
        heights[i] = 8;
        for (const z of [0, 1, 5, 6, 7]) voxels[k * 23 + z] = 1;
      });
      const none = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
      const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
      r.setMap({ W, H: W, heights, columns: { tiles: Int32Array.from(tiles), voxels }, water: none, entities } as unknown as Parameters<R["setMap"]>[0]);
      r.setSlice(3);
      r.setClock(12.5);
      r.resetView();
      r.renderNow();
      const internals = r as unknown as { std: { terrain: { defines: Record<string, number> } }; gl: { info: { programs: { name: string; diagnostics?: { runnable: boolean } }[] | null }; getContext(): WebGL2RenderingContext } };
      const g = internals.gl.getContext();
      const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
      g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
      // the terrain on screen: pixels in the middle of the view that are not the sky's pale blue
      let ground = 0;
      let seen = 0;
      const w = g.drawingBufferWidth;
      const h = g.drawingBufferHeight;
      for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 2)
        for (let x = Math.floor(w * 0.3); x < w * 0.7; x += 2) {
          const o = (y * w + x) * 4;
          seen++;
          if (px[o] >= px[o + 2] || px[o + 1] > px[o + 2] + 10) ground++;
        }
      const broken = (internals.gl.info.programs ?? []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
      const result = { look: r.look, cutaway: internals.std.terrain.defines.CUTAWAY, slice: r.slice, ground: ground / seen, broken };
      r.dispose();
      host.remove();
      return result;
    }, look);
    expect(out.look, look).toBe(look);
    expect(out.cutaway, look).toBe(1);
    expect(out.slice, look).toBe(3);
    expect(out.broken, look).toEqual([]);
    expect(out.ground, `${look}: the terrain draws`).toBeGreaterThan(0.5);
  }
  expect(errors).toEqual([]);
});
