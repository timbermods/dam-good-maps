// Seeing the land behind objects (objectFade.ts, an editing aid in its own channel, D496/D497's rule): with a region set
// (`setObjectFade`), every object within it shows only a quarter of itself, in Standard and High, drawn as coverage on a
// multisampled canvas and as a dither elsewhere; every object outside it is drawn exactly as before. `setObjectsHidden(true)`
// draws none, and the land looks as it does with no objects at all (their baked shadows baked again, High's drawn again);
// false brings them back as they were. Pictures never show either: the shelf's icons are drawn on the view's renderer
// with the fade put off, and the map's picture on a renderer of its own. The light look (software drawing, CI) is
// checked where the browser draws in software. (Software drawing on CI is treated as a GPU for Standard and High, as
// cutaway.spec does.)

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
