// Seeing the land behind objects (objectFade.ts, an editing aid in its own channel, D496/D497's rule): with a region set
// (`setObjectFade`), every object within it shows only a quarter of itself, in Standard and High, drawn as coverage on a
// multisampled canvas and as a dither elsewhere; every object outside it is drawn exactly as before. `setObjectsHidden(true)`
// draws none, and the land looks as it does with no objects at all (their baked shadows baked again, High's drawn again);
// false brings them back as they were. Pictures never show either: the shelf's icons are drawn on the view's renderer
// with the fade put off, and the map's picture on a renderer of its own. The light look (software drawing, CI) is
// checked where the browser draws in software. A mine site and the seeps, the land's own shape (their tiles' tops are
// left out of the terrain), are never faded or hidden: no sky shows through them. A warmed switch to High compiles
// nothing in its first frame. The shelf's placement ghost, an editing aid, is never faded or hidden. (Software drawing
// on CI is treated as a GPU for Standard and High, as cutaway.spec does.)

import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

interface Pass {
  /** objectFade.ts's FADE_*: 1 coverage, 2 dither. */
  mode: number;
  /** The least alpha in the canvas. */
  alpha: number;
  /** Each object in the region: the share of itself left showing; each outside it: how far it changed. */
  inside: number[];
  outside: number[];
}
interface Measured {
  look: string;
  samples: number;
  seen: number;
  fade: Pass;
  dither: Pass;
  region: unknown;
  afterFade: number;
  hidden: { flag: boolean; left: number };
  shownAgain: number;
  icon?: { drawn: boolean; same: boolean; faded: boolean; kept: boolean };
  /** A mine site's and two seeps' footprints: the share of their pixels the sky shows through, as drawn, hidden, faded,
   *  and with their models taken away (the hole the land would have). */
  pits: { drawn: number[]; hidden: number[]; faded: number[]; hole: number[] };
  /** The shelf's placement ghost on an empty tile: its pixels as drawn, with the objects hidden and faded round it. */
  ghost: { shown: number; hidden: number; faded: number };
}

/** Draw a 32² meadow with a grid of trees, bushes and ruins in `look` on a renderer of the test's own, with and without
 *  the fade and with the objects hidden, and measure each object's patch of screen against the meadow with no objects. */
async function measure(page: import("@playwright/test").Page, look: "standard" | "high" | "light"): Promise<Measured> {
  return await page.evaluate(async (lk): Promise<Measured> => {
    type R = import("../../src/render3d").MapRenderer;
    (window as unknown as { dgmLookTest: { gpu: boolean } }).dgmLookTest.gpu = lk !== "light";
    const Make = window.dgm3d!.renderer.constructor as new (c: HTMLCanvasElement, o?: { still?: boolean }) => R;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    host.append(c);
    document.body.append(host);
    const r = new Make(c, { still: true });
    if (lk !== "light") r.setLookChoice(lk, false);
    const W = 32;
    const heights = new Uint8Array(W * W).fill(4);
    const kinds = ["Pine", "Birch", "Oak", "BlueberryBush", "RuinColumnH2"];
    const at: [number, number][] = [];
    for (let y = 4; y < W - 2; y += 4) for (let x = 3; x < W - 2; x += 4) at.push([x, y]);
    const ents = (n: number) => ({
      count: n,
      templates: kinds,
      owners: [],
      template: Uint16Array.from(at.slice(0, n), (_, k) => k % kinds.length),
      x: Int16Array.from(at.slice(0, n), (p) => p[0]),
      y: Int16Array.from(at.slice(0, n), (p) => p[1]),
      z: new Int16Array(n).fill(4),
      orientation: new Uint8Array(n),
      flags: new Uint8Array(n),
      owner: new Uint16Array(n),
      variant: new Uint8Array(n),
      strength: new Float32Array(n),
      ids: at.slice(0, n).map((_, k) => `o${k}`),
    });
    const water = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
    const view = (n: number) => ({ W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water, entities: ents(n) }) as unknown as Parameters<R["setMap"]>[0];
    const g = (r as unknown as { gl: { getContext(): WebGL2RenderingContext } }).gl.getContext();
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const settle = async () => {
      const t0 = performance.now();
      while ((!r.programsSettled || !r.highSettled) && performance.now() - t0 < 20_000) {
        r.renderNow();
        await wait(30);
      }
      // (High's sun shadows are drawn at most every tenth of a second)
      await wait(150);
      r.renderNow();
      await wait(150);
    };
    /** The frame drawn now (read in the same task as it is drawn). */
    const frame = () => {
      r.renderNow();
      const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
      g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
      return px;
    };
    r.setClock(12.5);
    r.setMap(view(0));
    r.resetView();
    // (closer: the objects take more of the screen)
    const v0 = r.getView();
    r.setView({ distance: v0.distance * 0.55 });
    await settle();
    const empty = frame();
    r.setMap(view(at.length), true);
    await settle();
    const base = frame();
    // each object's patch: a box round its middle on screen (device pixels; readPixels' rows run bottom up)
    const k = g.drawingBufferWidth / c.clientWidth;
    const boxes = at.map(([x, y], i) => {
      // (round the middle of each: a bush is low)
      const p = r.project(x + 0.5, kinds[i % kinds.length] === "BlueberryBush" ? 4.3 : 4.8, -(y + 0.5));
      return { x: Math.round(p.x * k), y: Math.round(g.drawingBufferHeight - 1 - p.y * k), r: Math.round(14 * k) };
    });
    /** How far a frame is from b over an object's pixels (those where it differs from the meadow with no objects by
     *  more than 40 levels: not the faint occlusion High leaves round it, D135, which stays). */
    const diff = (a: Uint8Array, b: Uint8Array, i: number) => {
      const bx = boxes[i];
      let s = 0;
      for (let y = Math.max(0, bx.y - bx.r); y <= Math.min(g.drawingBufferHeight - 1, bx.y + bx.r); y++)
        for (let x = Math.max(0, bx.x - bx.r); x <= Math.min(g.drawingBufferWidth - 1, bx.x + bx.r); x++) {
          const o = (y * g.drawingBufferWidth + x) * 4;
          const d = (p: Uint8Array, q: Uint8Array) => Math.abs(p[o] - q[o]) + Math.abs(p[o + 1] - q[o + 1]) + Math.abs(p[o + 2] - q[o + 2]);
          if (d(base, empty) > 40) s += d(a, b);
        }
      return s;
    };
    const region = { x: 9, y: 14, radius: 4.5 };
    const dist = at.map(([x, y]) => Math.hypot(x + 0.5 - region.x, y + 0.5 - region.y));
    const shows = at.map((_, i) => diff(base, empty, i));
    // (the objects on screen)
    const seen = at.map((_, i) => i).filter((i) => shows[i] > 2000);
    /** Each object's share of itself still showing (against the meadow with no objects), and how far it changed. */
    let alpha = 255;
    const measureNow = () => {
      const now = frame();
      alpha = 255;
      for (let o = 3; o < now.length; o += 4) if (now[o] < alpha) alpha = now[o];
      return at.map((_, i) => ({ left: diff(now, empty, i) / shows[i], changed: diff(now, base, i) / shows[i] }));
    };
    const internals = r as unknown as { samplesRead: number | null; uniforms: { objectFade: { value: { w: number } } } };
    const out = { look: r.look, samples: g.getParameter(g.SAMPLES), seen: seen.length } as Measured;
    const pass = async (name: "fade" | "dither") => {
      r.setObjectFade(region);
      await settle();
      const m = measureNow();
      out[name] = {
        mode: internals.uniforms.objectFade.value.w,
        // (the canvas has an alpha channel: the page never shows through a faded object)
        alpha,
        inside: seen.filter((i) => dist[i] <= region.radius).map((i) => m[i].left),
        outside: seen.filter((i) => dist[i] >= region.radius + 2).map((i) => m[i].changed),
      };
      r.setObjectFade(null);
      await settle();
    };
    await pass("fade");
    out.region = r.objectFade;
    // the dither, as where the canvas is not multisampled
    internals.samplesRead = 0;
    await pass("dither");
    const most = (m: { left: number; changed: number }[], k: "left" | "changed") => Math.max(...seen.map((i) => m[i][k]));
    out.afterFade = most(measureNow(), "changed");
    r.setObjectsHidden(true);
    await settle();
    out.hidden = { flag: r.objectsHidden, left: most(measureNow(), "left") };
    r.setObjectsHidden(false);
    await settle();
    out.shownAgain = most(measureNow(), "changed");
    // the shelf's placement ghost, an editing aid (planning's ruling on #759): never hidden or faded with the objects
    {
      const gp = r.project(5.5, 4.8, -6.5);
      const gb = { x: Math.round(gp.x * k), y: Math.round(g.drawingBufferHeight - 1 - gp.y * k), r: Math.round(14 * k) };
      /** The ghost's pixels: those in its box more than 40 levels from the same frame without it. */
      const count = (a: Uint8Array, b: Uint8Array) => {
        let n = 0;
        for (let y = Math.max(0, gb.y - gb.r); y <= Math.min(g.drawingBufferHeight - 1, gb.y + gb.r); y++)
          for (let x = Math.max(0, gb.x - gb.r); x <= Math.min(g.drawingBufferWidth - 1, gb.x + gb.r); x++) {
            const o = (y * g.drawingBufferWidth + x) * 4;
            if (Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]) > 40) n++;
          }
        return n;
      };
      const ghost = { template: "Pine", x: 5, y: 6, z: 4, orientation: 0, ok: null };
      const withGhost = async () => {
        r.setGhost(ghost);
        await settle();
        const on = frame();
        r.setGhost(null);
        await settle();
        return count(on, frame());
      };
      const shown = await withGhost();
      r.setObjectsHidden(true);
      const hidden = await withGhost();
      r.setObjectsHidden(false);
      r.setObjectFade({ x: 5.5, y: 6.5, radius: 3 });
      const faded = await withGhost();
      r.setObjectFade(null);
      await settle();
      out.ghost = { shown, hidden, faded };
    }
    // the land's own shape: a mine site's pit and two seeps' (tiles whose tops the terrain leaves out) stay drawn, hidden
    // or faded; the sky never shows through them
    const pitKinds = ["UndergroundRuins", "WaterSeep", "BadwaterSeep"];
    const pitAt: [number, number, number][] = [[6, 20, 5], [16, 22, 2], [22, 22, 2]];
    const n = pitAt.length;
    const pits = { count: n, templates: pitKinds, owners: [], template: Uint16Array.from([0, 1, 2]), x: Int16Array.from(pitAt, (p) => p[0]), y: Int16Array.from(pitAt, (p) => p[1]), z: new Int16Array(n).fill(4), orientation: new Uint8Array(n), flags: new Uint8Array(n), owner: new Uint16Array(n), variant: new Uint8Array(n), strength: new Float32Array(n), ids: ["mine", "seep", "badSeep"] };
    r.setMap({ W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water, entities: pits } as unknown as Parameters<R["setMap"]>[0], true);
    await settle();
    // each footprint on screen (its corners at the ground's level), a little inside its edge
    const feet = pitAt.map(([x, y, size]) => {
      const c = [[x + 0.3, y + 0.3], [x + size - 0.3, y + 0.3], [x + 0.3, y + size - 0.3], [x + size - 0.3, y + size - 0.3]].map(([cx, cy]) => r.project(cx, 4, -cy));
      return { x0: Math.round(Math.min(...c.map((q) => q.x)) * k), x1: Math.round(Math.max(...c.map((q) => q.x)) * k), y0: Math.round(g.drawingBufferHeight - 1 - Math.max(...c.map((q) => q.y)) * k), y1: Math.round(g.drawingBufferHeight - 1 - Math.min(...c.map((q) => q.y)) * k) };
    });
    // (what shows through a hole, for these checks alone: a magenta background, the sky taken away. The sky's clouds are
    // near white, and where they fall depends on the GPU's arithmetic: on CI's software drawing a cloud filled both seeps'
    // holes, and a test of the sky's blue saw none there, run 42360125348)
    const bg = r as unknown as { sky: { visible: boolean }; gl: { getClearColor(t: object): unknown; setClearColor(c: unknown): void } };
    let clear: unknown = null;
    bg.gl.getClearColor({ copy: (c: { clone(): unknown }) => (clear = c.clone()) });
    bg.sky.visible = false;
    bg.gl.setClearColor(0xff00ff);
    const skyShare = () => {
      const px = frame();
      return feet.map((b) => {
        let sky = 0;
        let all = 0;
        for (let y = b.y0; y <= b.y1; y++)
          for (let x = b.x0; x <= b.x1; x++) {
            const o = (y * g.drawingBufferWidth + x) * 4;
            all++;
            if (px[o] > 200 && px[o + 1] < 60 && px[o + 2] > 200) sky++;
          }
        return sky / Math.max(1, all);
      });
    };
    const drawn = skyShare();
    r.setObjectsHidden(true);
    await settle();
    const pitsHidden = skyShare();
    r.setObjectsHidden(false);
    r.setObjectFade({ x: 16, y: 22, radius: 12 });
    await settle();
    const pitsFaded = skyShare();
    r.setObjectFade(null);
    await settle();
    // (the check sees a hole: the models taken away, the terrain still without the tops)
    const objects = (r as unknown as { objects: { visible: boolean } }).objects;
    objects.visible = false;
    const hole = skyShare();
    objects.visible = true;
    bg.sky.visible = true;
    bg.gl.setClearColor(clear);
    out.pits = { drawn, hidden: pitsHidden, faded: pitsFaded, hole };
    // the shelf's icons: the same with the fade over the place they are drawn at and the objects hidden
    if (lk !== "light") {
      const thumbs = (r as unknown as { thumbs: Map<string, string> }).thumbs;
      thumbs.clear();
      const icon = r.thumbnail("Pine");
      thumbs.clear();
      r.setObjectFade({ x: 0, y: 0, radius: 60 });
      r.setObjectsHidden(true);
      const mode = internals.uniforms.objectFade.value.w;
      const iconFaded = r.thumbnail("Pine");
      out.icon = { drawn: !!icon, same: icon === iconFaded, faded: mode > 0, kept: internals.uniforms.objectFade.value.w === mode };
    }
    r.dispose();
    host.remove();
    return out;
  }, look);
}

/** A mine site's pit and the seeps' stay drawn whole, hidden or faded: no more sky through them than as drawn, where
 *  taking their models away shows it through most of them. */
function expectPits(out: Measured, look: string): void {
  out.pits.drawn.forEach((drawn, i) => {
    expect(out.pits.hole[i], `${look}: pit ${i}: the check sees a hole`).toBeGreaterThan(drawn + 0.3);
    expect(out.pits.hidden[i], `${look}: pit ${i}: hidden, the land's own shape stays`).toBeLessThan(drawn + 0.02);
    expect(out.pits.faded[i], `${look}: pit ${i}: faded, the land's own shape stays`).toBeLessThan(drawn + 0.02);
  });
}

for (const look of ["standard", "high"] as const)
  test(`${look}: objects in the region fade to a quarter, those outside are unchanged, and hidden objects are not drawn`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
    const out = await measure(page, look);
    expect(out.look).toBe(look);
    expect(out.seen, "the objects on screen").toBeGreaterThanOrEqual(20);
    for (const pass of ["fade", "dither"] as const) {
      expect(out[pass].mode, pass).toBe(pass === "dither" || out.samples < 2 ? 2 : 1);
      expect(out[pass].alpha, `${pass}: the canvas stays opaque`).toBe(255);
      expect(out[pass].inside.length, `${pass}: objects in the region`).toBeGreaterThanOrEqual(3);
      // (a quarter of the object over the meadow: well under half of it left, never all of it gone)
      for (const left of out[pass].inside) {
        expect(left, `${pass}: an object in the region shows a quarter of itself`).toBeLessThan(0.55);
        expect(left, `${pass}: an object in the region still shows`).toBeGreaterThan(0.08);
      }
      expect(out[pass].outside.length, `${pass}: objects outside the region`).toBeGreaterThanOrEqual(10);
      for (const changed of out[pass].outside) expect(changed, `${pass}: an object outside the region is drawn as before`).toBeLessThan(0.02);
    }
    expect(out.region).toBeNull();
    expect(out.afterFade, "with the fade off every object is drawn as before").toBeLessThan(0.02);
    expect(out.hidden.flag).toBe(true);
    expect(out.hidden.left, "hidden: the land as with no objects, their shadows gone too").toBeLessThan(0.03);
    expect(out.shownAgain, "shown again as they were").toBeLessThan(0.02);
    expect(out.icon, "the shelf's icon drawn as without the fade, which stays on in the view").toEqual({ drawn: true, same: true, faded: true, kept: true });
    expectPits(out, look);
    expect(out.ghost.shown, "the placement ghost is drawn").toBeGreaterThan(50);
    expect(out.ghost.hidden, "the placement ghost stays drawn with the objects hidden").toBeGreaterThan(0.8 * out.ghost.shown);
    expect(out.ghost.faded, "the placement ghost is never faded round the pointer").toBeGreaterThan(0.8 * out.ghost.shown);
    expect(errors).toEqual([]);
  });

test("the light look fades and hides its objects too (where the browser draws in software)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const out = await measure(page, "light");
  test.skip(out.look !== "light", "this browser draws with a GPU: the light look is drawn only in software (CI)");
  for (const pass of ["fade", "dither"] as const) {
    expect(out[pass].mode, `${pass}: a dither (no multisampling)`).toBe(2);
    expect(out[pass].inside.length, `${pass}: objects in the region`).toBeGreaterThanOrEqual(1);
    expect(out[pass].outside.length, `${pass}: objects outside the region`).toBeGreaterThanOrEqual(5);
    for (const left of out[pass].inside) expect(left, `${pass}: inside`).toBeLessThan(0.55);
    for (const changed of out[pass].outside) expect(changed, `${pass}: outside`).toBeLessThan(0.02);
  }
  expect(out.hidden.left).toBeLessThan(0.03);
  expect(out.shownAgain).toBeLessThan(0.02);
  expectPits(out, "light");
  expect(errors).toEqual([]);
});

const heroChunk = () => readdirSync("dist/assets").find((f) => /^hero-.*\.js$/.test(f))!;

test("the map's picture is the same with the view's objects faded and hidden", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const out = await page.evaluate(async (file) => {
    const hero = (await import(new URL(`assets/${file}`, document.baseURI).href)) as {
      heroPicture(v: unknown, o?: { width?: number; height?: number }): Promise<Uint8Array | null>;
    };
    const W = 24;
    const heights = new Uint8Array(W * W).fill(4);
    const at: [number, number][] = [];
    for (let y = 2; y < W; y += 3) for (let x = 2; x < W; x += 3) at.push([x, y]);
    const n = at.length;
    const entities = { count: n, templates: ["Pine"], owners: [], template: new Uint16Array(n), x: Int16Array.from(at, (p) => p[0]), y: Int16Array.from(at, (p) => p[1]), z: new Int16Array(n).fill(4), orientation: new Uint8Array(n), flags: new Uint8Array(n), owner: new Uint16Array(n), variant: new Uint8Array(n), strength: new Float32Array(n), ids: at.map((_, k) => `p${k}`) };
    const view = { W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) }, entities };
    const pixels = async (jpeg: Uint8Array | null) => {
      if (!jpeg) return null;
      const bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
      const cv = document.createElement("canvas");
      cv.width = bmp.width;
      cv.height = bmp.height;
      const g = cv.getContext("2d")!;
      g.drawImage(bmp, 0, 0);
      return g.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    const before = await pixels(await hero.heroPicture(view, { width: 320, height: 180 }));
    const shown = window.dgm3d!.renderer;
    shown.setObjectFade({ x: 12, y: 12, radius: 30 });
    shown.setObjectsHidden(true);
    const after = await pixels(await hero.heroPicture(view, { width: 320, height: 180 }));
    shown.setObjectFade(null);
    shown.setObjectsHidden(false);
    if (!before || !after) return null;
    let d = 0;
    for (let i = 0; i < before.length; i += 4) d += Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]);
    return d / (before.length / 4) / 3;
  }, heroChunk());
  expect(out, "the picture is drawn").not.toBeNull();
  expect(out!, "the same picture, to the JPEG's noise").toBeLessThan(0.5);
});

test("a switch to High after the programs were warmed compiles nothing for the sun's depth pass, the fade's included", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const out = await page.evaluate(async () => {
    type R = import("../../src/render3d").MapRenderer;
    const Make = window.dgm3d!.renderer.constructor as new (c: HTMLCanvasElement) => R;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:480px;opacity:0;pointer-events:none";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    host.append(c);
    document.body.append(host);
    const r = new Make(c);
    const internals = r as unknown as { drawsInSoftware: boolean; programs: { background: boolean }; gl: { info: { programs: { name: string; cacheKey: string }[] } } };
    try {
      if (internals.drawsInSoftware || !internals.programs.background || !r.canHigh) return null;
      r.setLookChoice("standard", false);
      const W = 12;
      const none = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
      const entities = { count: 1, templates: ["Pine"], owners: [], template: Uint16Array.from([0]), x: Int16Array.from([2]), y: Int16Array.from([2]), z: Int16Array.from([8]), orientation: new Uint8Array(1), flags: new Uint8Array(1), owner: new Uint16Array(1), variant: new Uint8Array(1), strength: new Float32Array(1), ids: ["pine"] };
      r.setMap({ W, H: W, heights: new Uint8Array(W * W).fill(8), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water: none, entities } as unknown as Parameters<R["setMap"]>[0]);
      r.renderNow();
      for (let k = 0; k < 3000 && !r.programsWarm; k++) await new Promise((done) => setTimeout(done, 20));
      const warm = r.programsWarm;
      r.setLookChoice("high", false);
      const look = r.look;
      const before = internals.gl.info.programs.length;
      r.setObjectFade({ x: 2.5, y: 2.5, radius: 2 });
      r.renderNow();
      const fresh = internals.gl.info.programs.slice(before).map((p) => p.name || p.cacheKey.slice(0, 60));
      return { warm, look, fresh };
    } finally {
      r.dispose();
      host.remove();
    }
  });
  test.skip(out === null, "the browser draws in software or can't compile in the background: nothing is compiled ahead");
  expect(out!.warm).toBe(true);
  expect(out!.look).toBe("high");
  expect(out!.fresh, "programs the first High frame compiled").toEqual([]);
  expect(errors).toEqual([]);
});
