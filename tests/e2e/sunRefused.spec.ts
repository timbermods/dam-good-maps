// A sun bake the worker refuses (its job threw: a dead worker's jobs run on the page instead, so only the job itself
// refuses, and would again on the same map) takes the sun on the shadows already baked, once: never a bake asked again
// every frame on the page's thread, and the view settles (review of #808).

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("a refused sun bake settles the sun at once, asking no bake again", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=9&z=96&d=n&t=riverValley");
  const out = await page.evaluate(async () => {
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
    r.setLookChoice("standard", false);
    const W = 40;
    const H = 24;
    const heights = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 4 + ((x * 7 + y * 3) % 5);
    const none = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
    const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    const soil = { moisture: new Uint8Array(W * H), contamination: new Uint8Array(W * H) };
    const view = { W, H, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: none, entities, soil } as unknown as Parameters<R["setMap"]>[0];
    r.setMap(view);
    r.renderNow();
    // (every bake from here refuses, and is counted)
    let asked = 0;
    (r as unknown as { bakeSun: () => { run: () => Promise<never> } }).bakeSun = () => ({
      run: () => {
        asked++;
        return Promise.reject(new Error("refused"));
      },
    });
    // the camera turns well away: the sun is asked for, and refused
    r.setView({ yaw: 2.5 });
    for (let f = 0; f < 30; f++) {
      r.renderNow();
      await new Promise((done) => setTimeout(done, 0));
    }
    const way = r.sunWay();
    r.dispose();
    host.remove();
    return { asked, way };
  });
  expect(out.asked, "one bake asked, never again").toBe(1);
  expect(out.way.baking).toBe(false);
  expect(out.way.sun, "the sun taken is the one the camera asks for").toEqual(out.way.want);
});
