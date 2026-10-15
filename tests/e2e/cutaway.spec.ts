// The branches for terrain above terrain (3D view, parts 6, 3 and 4, items 7 and 8; D207): the level-slice cutaway,
// the soil per run top, and objects, falls and water lit by the air under a roof are compiled only on a map with
// terrain above terrain, which no other spec opens. A 12² map with a roofed block, its cave's floor with its own soil,
// a tree and a pool on it and a puddle on its roof, cut through its cave, draws in Standard and in High with no shader
// error and with the terrain on screen; the falls' program is compiled with the branch too. (Software drawing on CI is treated as a GPU, as rendererWarmup.spec
// does, so the High look's programs are checked there too.)

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

test("a map with a cave, cut through it, draws in Standard and High with the cutaway's, the run soil's and the roofed objects' and water's branches compiled", async ({ page }) => {
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
      // (a pool on the cave's floor, part of it badwater, and a puddle on the roof over its middle: the water's branch,
      // two layers of water on one tile)
      const pool = tiles.filter((i) => i % W !== 6);
      const roofTile = 5 * W + 5;
      const water = {
        count: pool.length + 1,
        tile: Int32Array.from([...pool, roofTile]),
        floor: Float32Array.from([...pool.map(() => 2), 8]),
        depth: Float32Array.from([...pool.map(() => 0.8), 0.3]),
        contamination: Float32Array.from([...pool.map((i) => (i % W === 4 ? 1 : 0)), 0]),
      };
      // (a pine on the cave's floor, under the roof: the objects' branch)
      const entities = { count: 1, templates: ["Pine"], owners: [], template: new Uint16Array(1), x: new Int16Array([5]), y: new Int16Array([5]), z: new Int16Array([2]), orientation: new Uint8Array(1), flags: new Uint8Array(1), owner: new Uint16Array(1), variant: new Uint8Array(1), strength: new Float32Array(1), ids: ["pine"] };
      // (the soil per run top: the cave's floor at level 2 moist, its west row contaminated, under a dry roof)
      const runs = { tile: Int32Array.from(tiles), level: new Uint8Array(tiles.length).fill(2), moisture: new Uint8Array(tiles.length).fill(200), contamination: Uint8Array.from(tiles, (i) => (i % W === 4 ? 255 : 0)) };
      const soil = { moisture: new Uint8Array(W * W), contamination: new Uint8Array(W * W), runs };
      r.setMap({ W, H: W, heights, columns: { tiles: Int32Array.from(tiles), voxels }, water, entities, soil } as unknown as Parameters<R["setMap"]>[0]);
      r.setSlice(3);
      r.setClock(12.5);
      r.resetView();
      r.renderNow();
      type Mat = { defines: Record<string, number>; needsUpdate: boolean };
      type Obj = { isMesh?: boolean; isInstancedMesh?: boolean; frustumCulled: boolean; geometry: object; constructor: new (...a: unknown[]) => Obj; add(o: Obj): void; traverse(f: (o: Obj) => void): void };
      const internals = r as unknown as {
        std: { terrain: Mat; object: Mat; fall: Mat; water: Mat };
        water: Map<string, object>;
        layers: { layers: unknown[] } | null;
        high: { roofedMaterials(): Mat[]; materials: { fall: Mat } } | null;
        scene: Obj;
        persp: object;
        gl: { info: { programs: { name: string; diagnostics?: { runnable: boolean } }[] | null }; getContext(): WebGL2RenderingContext; render(s: Obj, c: object): void };
      };
      const roofed = [internals.std.object, internals.std.fall, internals.std.water, ...(internals.high?.roofedMaterials() ?? [])].every((m) => m.defines.CAVES === 1);
      const waterLayers = internals.layers?.layers.length ?? 0;
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
      // (no fall on this map: the falls' programs, the look's own, drawn once on a mesh of their own, after the frame is read)
      let mesh: Obj | null = null;
      internals.scene.traverse((o) => {
        if (!mesh && o.isMesh && !o.isInstancedMesh) mesh = o;
      });
      if (!mesh) throw new Error("no mesh in the scene");
      const plain: Obj = mesh;
      const falls = new internals.scene.constructor();
      for (const mat of [internals.std.fall, internals.high?.materials.fall]) {
        if (!mat) continue;
        const one = new plain.constructor(new (plain.geometry.constructor as new () => object)(), mat);
        one.frustumCulled = false;
        falls.add(one);
      }
      internals.gl.render(falls, internals.persp);
      const broken = (internals.gl.info.programs ?? []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
      // the light look (software drawing) with both branches: its program compiled too (forced here: CI's software drawing is
      // treated as a GPU above, and a GPU never draws it)
      let lite: { LITE: number; broken: string[] } | null = null;
      if (lk === "standard") {
        const t = internals.std.terrain;
        t.defines.LITE = 1;
        t.needsUpdate = true;
        r.renderNow();
        lite = { LITE: t.defines.LITE, broken: (internals.gl.info.programs ?? []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name) };
      }
      const result = { look: r.look, cutaway: internals.std.terrain.defines.CUTAWAY, runSoil: internals.std.terrain.defines.RUN_SOIL, roofed, waterLayers, waterChunks: internals.water.size, slice: r.slice, ground: ground / seen, broken, lite };
      r.dispose();
      host.remove();
      return result;
    }, look);
    expect(out.look, look).toBe(look);
    expect(out.cutaway, look).toBe(1);
    expect(out.runSoil, `${look}: the soil per run top's branch`).toBe(1);
    expect(out.roofed, `${look}: the roofed objects', falls' and water's branch`).toBe(true);
    expect(out.waterLayers, `${look}: the cave's pool and the roof's puddle in layers of their own`).toBe(2);
    expect(out.waterChunks, `${look}: the water drawn`).toBe(1);
    expect(out.slice, look).toBe(3);
    expect(out.broken, look).toEqual([]);
    if (look === "standard") expect(out.lite, "the light look's program with both branches").toEqual({ LITE: 1, broken: [] });
    expect(out.ground, `${look}: the terrain draws`).toBeGreaterThan(0.5);
  }
  expect(errors).toEqual([]);
});
