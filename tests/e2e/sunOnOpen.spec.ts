// A map opened is baked for its sun once (D497, D453): the sun follows the camera's turn (light.ts `sunOfYaw`), and a
// new map's shadows are baked for the way Reset view will face it, so framing it bakes nothing more. Before, the map
// was baked for the last view's sun and baked again when Reset view turned it (30–60 ms at 256²).

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("a map opened from a turned view bakes its shadows once, for the sun of the view it opens in", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=9&z=96&d=n&t=riverValley");
  const out = await page.evaluate(() => {
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
    // (a map, then the camera turned well away from where Reset view faces a map)
    r.setMap(view);
    const opening = r.sunWay().sun;
    r.setView({ yaw: 2.5 });
    r.renderNow();
    const turned = r.sunWay().want;
    // (every bake for a sun after the new map's own, counted)
    const ri = r as unknown as { turnSun: (...a: unknown[]) => void };
    const turn = ri.turnSun.bind(r);
    let bakes = 0;
    ri.turnSun = (...a: unknown[]) => {
      bakes++;
      turn(...a);
    };
    r.setMap(view);
    r.renderNow();
    const way = r.sunWay();
    r.dispose();
    host.remove();
    return { apart: Math.hypot(turned.x - opening.x, turned.y - opening.y), bakes, sun: way.sun, want: way.want, opening };
  });
  expect(out.apart, "the turned view asks for another sun").toBeGreaterThan(0.1);
  expect(out.bakes, "nothing baked after the map's own bake").toBe(0);
  expect(out.sun, "the sun baked is the one the opening view asks for").toEqual(out.want);
  expect(out.sun).toEqual(out.opening);
});
