// The branches for terrain above terrain (3D view, parts 6, 3 and 4, items 7 and 8; D207): the level-slice cutaway,
// the soil per run top, and objects, falls and water lit by the air under a roof are compiled only on a map with
// terrain above terrain, which no other spec opens. A 12² map with a roofed block, its cave's floor with its own soil,
// a tree, a slope, a ruin and a pool on it and a puddle on its roof, cut through its cave, draws in Standard and in High
// with no shader error and with the terrain on screen, the ruin overgrown by its floor's soil (High's slope reads it
// too; falls are the water's own curtains, #740, so the water's branch covers them), and a brush over the roof draws the hollow under it
// (hollow.ts), which a plain map never makes. (Software drawing on CI is treated as a GPU, as rendererWarmup.spec does,
// so the High look's programs are checked there too.)
// Every program stays within the 16 samplers any WebGL 2 browser has (Direct3D 11's ANGLE has no more).
// A pond on a shelf cut at the shelf's level: the ground is drawn as the same ground dry. A reservoir six levels deep cut
// a level under its surface is drawn sliced, its water up to the cut over its bed (cutWater.ts), as five levels of water
// would be, in Standard and High.

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
        // (a pine, a slope and a ruin on the cave's floor, under the roof: the objects' branch, and the slope's and the
        // ruin's soil, the floor's own)
        const entities = { count: 3, templates: ["Pine", "Slope", "RuinColumnH2"], owners: [], template: Uint16Array.from([0, 1, 2]), x: Int16Array.from([5, 4, 6]), y: Int16Array.from([5, 5, 5]), z: Int16Array.from([2, 2, 2]), orientation: new Uint8Array(3), flags: new Uint8Array(3), owner: new Uint16Array(3), variant: new Uint8Array(3), strength: new Float32Array(3), ids: ["pine", "slope", "ruin"] };
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
          std: { terrain: Mat; object: Mat; water: Mat };
          water: Map<string, object>;
          layers: { layers: unknown[] } | null;
          high: { roofedMaterials(): Mat[]; runSoilMaterials(): Mat[] } | null;
          objects: Obj & { children: { name: string }[] };
          scene: Obj;
          persp: object;
          gl: { info: { programs: { name: string; program: WebGLProgram; diagnostics?: { runnable: boolean } }[] | null }; getContext(): WebGL2RenderingContext; render(s: Obj, c: object): void };
        };
        // (falls are the water's own curtains since #740, drawn by the water's program: no program of their own)
        const roofed = [internals.std.object, internals.std.water, ...(internals.high?.roofedMaterials() ?? [])].every((m) => m.defines.CAVES === 1);
        const waterLayers = internals.layers?.layers.length ?? 0;
        const g = internals.gl.getContext();
        const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
        g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
        // the terrain on screen: pixels in the middle of the view that are not the sky's pale blue (at least 59 levels
        // more blue than red) or its white clouds; the cut's cap is a dark cool slate, a little more blue than red
        let ground = 0;
        let seen = 0;
        const w = g.drawingBufferWidth;
        const h = g.drawingBufferHeight;
        for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 2)
          for (let x = Math.floor(w * 0.3); x < w * 0.7; x += 2) {
            const o = (y * w + x) * 4;
            seen++;
            const slate = px[o + 2] < px[o] + 30 && px[o] + px[o + 1] + px[o + 2] < 450;
            if (px[o] >= px[o + 2] || px[o + 1] > px[o + 2] + 10 || slate) ground++;
          }
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
        const slopeSoil = (internals.high?.runSoilMaterials() ?? []).every((m) => m.defines.RUN_SOIL === 1);
        const ivy = internals.objects.children.some((o) => /^scaffold\..*\.ivy$/.test(o.name));
        // the hollow under a brush over the roof (hollow.ts), uncut: the cave's 3 × 3 footprint, outlined all round, drawn
        // with no shader error
        const slice = r.slice;
        r.setSlice(null);
        r.setBrushCursor({ x: 5.5, y: 5.5, radius: 3, tool: "lower", level: null });
        r.renderNow();
        const hollow = r.hollowDrawn;
        const hollowBroken = (internals.gl.info.programs ?? []).filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
        // every program within the 16 samplers a shader is sure to have (WebGL 2's least, ANGLE's on Direct3D 11): past it
        // a program does not link there, however many this browser allows (High's terrain on a cave map drew empty with
        // 17). Counted over the whole program, its vertex shader's too.
        const samplerTypes = new Set<number>([g.SAMPLER_2D, g.SAMPLER_3D, g.SAMPLER_CUBE, g.SAMPLER_2D_SHADOW, g.SAMPLER_2D_ARRAY, g.INT_SAMPLER_2D, g.INT_SAMPLER_3D, g.UNSIGNED_INT_SAMPLER_2D, g.UNSIGNED_INT_SAMPLER_3D]);
        const overSamplers = (internals.gl.info.programs ?? [])
          .map((p) => {
            let n = 0;
            for (let i = 0; i < (g.getProgramParameter(p.program, g.ACTIVE_UNIFORMS) as number); i++) if (samplerTypes.has(g.getActiveUniform(p.program, i)!.type)) n++;
            return `${p.name || "program"}: ${n}`;
          })
          .filter((s) => Number(s.split(": ")[1]) > 16);
        const result = { look: r.look, cutaway: internals.std.terrain.defines.CUTAWAY, runSoil: internals.std.terrain.defines.RUN_SOIL, slopeSoil, ivy, roofed, waterLayers, waterChunks: internals.water.size, slice, ground: ground / seen, broken, lite, hollow, hollowBroken, overSamplers };
        r.dispose();
        host.remove();
        return result;
    }, look);
    expect(out.look, look).toBe(look);
    expect(out.cutaway, look).toBe(1);
    expect(out.runSoil, `${look}: the soil per run top's branch`).toBe(1);
    expect(out.slopeSoil, `${look}: High's slopes on the soil per run top's branch too`).toBe(true);
    expect(out.ivy, `${look}: the ruin on the moist floor under a dry roof is overgrown`).toBe(true);
    expect(out.roofed, `${look}: the roofed objects' and water's branch (falls drawn by the water's)`).toBe(true);
    expect(out.waterLayers, `${look}: the cave's pool and the roof's puddle in layers of their own`).toBe(2);
    expect(out.waterChunks, `${look}: the water drawn`).toBe(1);
    expect(out.slice, look).toBe(3);
    expect(out.broken, look).toEqual([]);
    if (look === "standard") expect(out.lite, "the light look's program with both branches").toEqual({ LITE: 1, broken: [] });
    expect(out.ground, `${look}: the terrain draws`).toBeGreaterThan(0.5);
    expect(out.hollow, `${look}: the hollow under the brush`).toEqual({ tiles: 9, edges: 12 });
    expect(out.hollowBroken, look).toEqual([]);
    expect(out.overSamplers, `${look}: no program past 16 samplers`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("a cave dug after a plain map opened is opened by the cut and lit as a cave, and a map that loses its last goes back to the plain program", async ({ page }) => {
  // (a Block dig or an Erode cave on a generated map: the renderer learns of its first column with air under a roof from a
  // terrain update, not from opening the map, and the cut must open into it all the same, what you see is what you get.
  // Where the browser compiles in the background the branch's programs are compiled first and the switch is made when
  // they are ready (programs.ts, D453): no frame after the dig compiles one)
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
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
    type Mat = { defines: Record<string, number> };
    const internals = r as unknown as { std: { terrain: Mat; object: Mat }; uniforms: { caveSize: { value: { x: number } } }; programs: { background: boolean }; gl: { info: { programs: unknown[] } } };
    const state = () => ({ cutaway: internals.std.terrain.defines.CUTAWAY ?? 0, caves: "CAVES" in internals.std.object.defines, volume: internals.uniforms.caveSize.value.x > 0 });
    /** Frames until the branches asked for are drawn: the programs any of them compiled. */
    let compiledInFrames = 0;
    const settle = async () => {
      for (let k = 0; k < 600; k++) {
        const before = internals.gl.info.programs.length;
        r.renderNow();
        compiledInFrames += internals.gl.info.programs.length - before;
        if (r.programsSettled) return;
        await new Promise((done) => setTimeout(done, 20));
      }
    };
    // a plain 12² map at level 8, opened with no columns, cut at 3
    const W = 12;
    const heights = new Uint8Array(W * W).fill(8);
    const none = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
    const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    const soil = { moisture: new Uint8Array(W * W), contamination: new Uint8Array(W * W) };
    r.setMap({ W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: none, entities, soil } as unknown as Parameters<R["setMap"]>[0]);
    r.setSlice(3);
    r.renderNow();
    const opened = state();
    // (a brush over it: a plain map never makes the hollow's marks)
    const marks = () => (r as unknown as { hollow: object | null }).hollow !== null;
    r.setBrushCursor({ x: 5.5, y: 5.5, radius: 3, tool: "lower", level: null });
    r.renderNow();
    const plainMarks = marks();
    // a 3 × 3 hollow dug under the cut: rock at 0–1, air at 2–4, the ground above at 5–7
    const tiles: number[] = [];
    for (let y = 4; y < 7; y++) for (let x = 4; x < 7; x++) tiles.push(y * W + x);
    const voxels = new Uint8Array(tiles.length * 23);
    tiles.forEach((_, k) => {
      for (const z of [0, 1, 5, 6, 7]) voxels[k * 23 + z] = 1;
    });
    r.updateTerrain(heights.slice(), { tiles: Int32Array.from(tiles), voxels } as unknown as Parameters<R["updateTerrain"]>[1]);
    await settle();
    const dug = state();
    // the hollow dug, uncut: under the brush
    r.setSlice(null);
    r.renderNow();
    const dugHollow = r.hollowDrawn.tiles;
    // filled in again: no column left
    r.updateTerrain(heights.slice(), { tiles: new Int32Array(0), voxels: new Uint8Array(0) } as unknown as Parameters<R["updateTerrain"]>[1]);
    await settle();
    const filled = state();
    const filledHollow = r.hollowDrawn.tiles;
    const background = internals.programs.background;
    r.dispose();
    host.remove();
    return { opened, dug, filled, plainMarks, dugHollow, filledHollow, background, compiledInFrames };
  });
  expect(out.opened, "a plain map: the plain program").toEqual({ cutaway: 0, caves: false, volume: false });
  expect(out.dug, "its first hollow: the cutaway, the light volume and the roofed objects' branch").toEqual({ cutaway: 1, caves: true, volume: true });
  expect(out.filled, "its last hollow filled: the plain program again").toEqual({ cutaway: 0, caves: false, volume: false });
  expect(out.plainMarks, "a brush on the plain map: no hollow's marks made").toBe(false);
  expect(out.dugHollow, "the dug hollow under the brush").toBe(9);
  expect(out.filledHollow, "filled again: none").toBe(0);
  if (out.background) expect(out.compiledInFrames, "programs compiled by the frames after the dig and the fill").toBe(0);
  expect(errors).toEqual([]);
});

test("where programs compile ahead, a switch to High and a hollow dug right after it are drawn at once: no frame with the old program (D453)", async ({ page }) => {
  // (Standard compiles High's programs in every state a dig can bring, programs.ts: the switch is made at once, and the
  // dig's branches are switched on before the next frame, so no frame draws a lid over the new hollow. Where
  // the browser draws in software nothing is compiled ahead: nothing to check there)
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
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
    type Mat = { defines: Record<string, number> };
    const internals = r as unknown as { drawsInSoftware: boolean; programs: { background: boolean }; terrainMat: Mat; objectMat: Mat; gl: { info: { programs: unknown[] } } };
    try {
      if (internals.drawsInSoftware || !internals.programs.background || !r.canHigh) return null;
      r.setLookChoice("standard", false);
      const W = 12;
      const heights = new Uint8Array(W * W).fill(8);
      const none = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
      const entities = { count: 1, templates: ["Pine"], owners: [], template: Uint16Array.from([0]), x: Int16Array.from([2]), y: Int16Array.from([2]), z: Int16Array.from([8]), orientation: new Uint8Array(1), flags: new Uint8Array(1), owner: new Uint16Array(1), variant: new Uint8Array(1), strength: new Float32Array(1), ids: ["pine"] };
      const soil = { moisture: new Uint8Array(W * W), contamination: new Uint8Array(W * W) };
      r.setMap({ W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: none, entities, soil } as unknown as Parameters<R["setMap"]>[0]);
      r.renderNow();
      // (the programs compiled ahead, waited for)
      for (let k = 0; k < 3000 && !r.programsWarm; k++) await new Promise((done) => setTimeout(done, 20));
      const warm = r.programsWarm;
      r.setLookChoice("high", false);
      const lookAtOnce = r.look;
      r.setSlice(3);
      r.renderNow();
      // a 3 × 3 hollow dug under the cut
      const tiles: number[] = [];
      for (let y = 4; y < 7; y++) for (let x = 4; x < 7; x++) tiles.push(y * W + x);
      const voxels = new Uint8Array(tiles.length * 23);
      tiles.forEach((_, k) => {
        for (const z of [0, 1, 5, 6, 7]) voxels[k * 23 + z] = 1;
      });
      r.updateTerrain(heights.slice(), { tiles: Int32Array.from(tiles), voxels } as unknown as Parameters<R["updateTerrain"]>[1]);
      // (before the next frame: the switch is made once the update's defines are all set)
      await new Promise<void>((done) => queueMicrotask(done));
      const atOnce = { cutaway: internals.terrainMat.defines.CUTAWAY ?? 0, caves: "CAVES" in internals.objectMat.defines };
      let compiled = 0;
      for (let k = 0; k < 10; k++) {
        const before = internals.gl.info.programs.length;
        r.renderNow();
        compiled += internals.gl.info.programs.length - before;
        await new Promise((done) => setTimeout(done, 20));
      }
      return { warm, lookAtOnce, atOnce, compiled, settled: r.programsSettled };
    } finally {
      r.dispose();
      host.remove();
    }
  });
  test.skip(out === null, "the browser draws in software or can't compile in the background: nothing is compiled ahead");
  expect(out!.warm, "the programs compiled ahead got ready").toBe(true);
  expect(out!.lookAtOnce, "the switch to High made at once").toBe("high");
  expect(out!.atOnce, "the dig's branches switched on before the next frame").toEqual({ cutaway: 1, caves: true });
  expect(out!.compiled, "programs compiled by the frames after the dig").toBe(0);
  expect(out!.settled).toBe(true);
  expect(errors).toEqual([]);
});

test("ground at the cut whose water the cut takes away is drawn as a top like any other, and water deeper than the cut is drawn up to it", async ({ page }) => {
  // (a pond on a shelf at level 6, cut at 6: the water stands above the cut and is not drawn, and the shelf is a top at the
  // cut; it was drawn in the bed's colour meant to be seen through water, a near-black slab in a shaded gorge. And a
  // reservoir six levels deep on ground at 2, cut at 7: deeper than the water byte's fine range, its surface above the cut
  // and its floor below it, so the cut slices it: water up to the cut, the bed under it a bed. Its water was not drawn
  // at all, and its bed then drew as dry ground)
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
    const W = 12;
    const shelf: number[] = [];
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) shelf.push(y * W + x);
    const everywhere = Array.from({ length: W * W }, (_, i) => i);
    const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    const soil = { moisture: new Uint8Array(W * W), contamination: new Uint8Array(W * W) };
    const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
    /** The mean colour of the middle of the view (the pond's middle): ground at `level`, with `depth` of water on `pond`
     *  (none: dry), cut at `cut`. */
    const middle = (level: number, pond: number[], depth: number, cut: number): number[] => {
      const water = { count: pond.length, tile: Int32Array.from(pond), floor: new Float32Array(pond.length).fill(level), depth: new Float32Array(pond.length).fill(depth), contamination: new Float32Array(pond.length) };
      r.setMap({ W, H: W, heights: new Uint8Array(W * W).fill(level), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water, entities, soil } as unknown as Parameters<R["setMap"]>[0]);
      r.setSlice(cut);
      r.setClock(12.5);
      r.resetView();
      r.renderNow();
      const w = g.drawingBufferWidth;
      const h = g.drawingBufferHeight;
      const bw = Math.floor(w * 0.08);
      const bh = Math.floor(h * 0.08);
      const px = new Uint8Array(bw * bh * 4);
      g.readPixels(Math.floor((w - bw) / 2), Math.floor((h - bh) / 2), bw, bh, g.RGBA, g.UNSIGNED_BYTE, px);
      const sum = [0, 0, 0];
      for (let k = 0; k < bw * bh; k++) for (let ch = 0; ch < 3; ch++) sum[ch] += px[k * 4 + ch];
      return sum.map((v) => v / (bw * bh));
    };
    const shelf6 = { dry: middle(6, [], 0, 6), cut: middle(6, shelf, 0.6, 6) };
    // (the reservoir sliced at 7, against five levels of water standing at 7 and the same ground dry)
    const reservoir = { dry: middle(2, [], 0, 7), sliced: middle(2, everywhere, 6, 7), five: middle(2, everywhere, 5, 7) };
    const programs = (r as unknown as { gl: { info: { programs: { name: string; diagnostics?: { runnable: boolean } }[] | null } } }).gl.info.programs ?? [];
    const broken = programs.filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => p.name);
    const drawn = r.look;
    r.dispose();
    host.remove();
    return { shelf6, reservoir, broken, drawn };
    }, look);
    const diff = (a: number[], b: number[]) => Math.max(...a.map((v, ch) => Math.abs(v - b[ch])));
    const { shelf6, reservoir } = out;
    const rgb = (a: number[]) => a.map(Math.round).join(", ");
    expect(out.drawn, look).toBe(look);
    expect(out.broken, look).toEqual([]);
    expect(diff(shelf6.cut, shelf6.dry), `${look}: the shelf under its cut-away pond ${rgb(shelf6.cut)} against the same ground dry ${rgb(shelf6.dry)}`).toBeLessThan(3);
    expect(diff(reservoir.sliced, reservoir.five), `${look}: the reservoir sliced at 7 ${rgb(reservoir.sliced)} against five levels of water ${rgb(reservoir.five)}`).toBeLessThan(3);
    expect(diff(reservoir.sliced, reservoir.dry), `${look}: the reservoir sliced at 7 ${rgb(reservoir.sliced)}: water, not its bed dry ${rgb(reservoir.dry)}`).toBeGreaterThan(15);
  }
  expect(errors).toEqual([]);
});
