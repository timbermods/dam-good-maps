// The map's picture at a size of its own (D488, `render3d/hero.ts`): `heroPicture(view, { width, height })` gives a JPEG
// of that size for the page's own pictures (Showcase mode's cards); without a size it is the .timber thumbnail's 960×540.
// Pictures drawn in a row leave nothing behind (no host left on the page, no context warning) and the player's view is
// never touched. Sized pictures share one renderer (its programs compiled once) that is freed after a short idle; a picture
// with no size is drawn on a renderer of its own and leaves nothing behind. CI draws in software, where the page would not draw the picture: the test treats it as a GPU (window.dgmLookTest).
// The numbers of the last test are information: the time per picture at the card size.

import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] } });

/** A JPEG's size from its first frame header (SOF0/SOF2), or null when it is not a JPEG. */
function jpegSize(b: number[]): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xc0 || m === 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

const chunk = () => readdirSync("dist/assets").find((f) => /^hero-.*\.js$/.test(f))!;

test("heroPicture gives a JPEG of the size asked, the thumbnail's by default, and frees what it drew", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (the shaders' compile warnings are the driver's; a context lost to too many is what a leak would show)
  page.on("console", (m) => (m.type() === "error" || /too many|context/i.test(m.text())) && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const out = await page.evaluate(async (file) => {
    const hero = (await import(new URL(`assets/${file}`, document.baseURI).href)) as {
      heroPicture(v: unknown, o?: { width?: number; height?: number; quality?: number }): Promise<Uint8Array | null>;
    };
    // 40² of rolling ground with a lake
    const W = 40;
    const heights = new Uint8Array(W * W);
    const lake: number[] = [];
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        heights[y * W + x] = Math.round(6 + 2 * Math.sin(x / 5) + 2 * Math.cos(y / 6));
        if (Math.hypot(x - 20, y - 20) < 5) {
          heights[y * W + x] = 4;
          lake.push(y * W + x);
        }
      }
    const water = { count: lake.length, tile: Int32Array.from(lake), floor: Float32Array.from(lake, () => 4), depth: Float32Array.from(lake, () => 1.5), contamination: new Float32Array(lake.length) };
    const entities = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
    const view = { W, H: W, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water, entities };
    const before = { view: JSON.stringify(window.dgm3d!.renderer.getView()), canvases: document.querySelectorAll("canvas").length, bodyKids: document.body.children.length };
    const sizes: Record<string, number[] | null> = {};
    const bytes = async (name: string, o?: { width?: number; height?: number; quality?: number }) => {
      const b = await hero.heroPicture(view, o);
      sizes[name] = b ? Array.from(b.subarray(0, 4096)) : null;
      return b;
    };
    const dflt = await bytes("default");
    // (a picture with no size is drawn on a renderer of its own and leaves nothing behind)
    const afterDefault = { canvases: document.querySelectorAll("canvas").length, bodyKids: document.body.children.length };
    const small = await bytes("card", { width: 400, height: 225 });
    const q = await bytes("lowQuality", { width: 400, height: 225, quality: 0.5 });
    // three in a row, asked together: drawn one after the other
    const one = performance.now();
    await hero.heroPicture(view, { width: 400, height: 225 });
    const single = performance.now() - one;
    const t0 = performance.now();
    const three = await Promise.all([1, 2, 3].map(() => hero.heroPicture(view, { width: 400, height: 225 })));
    const row = performance.now() - t0;
    // (heroPictureUrl is this wrapped; the build keeps only the exports the page uses, so it is not in the chunk until it is)
    const url = URL.createObjectURL(new Blob([(await hero.heroPicture(view, { width: 320, height: 180 }))! as BlobPart], { type: "image/jpeg" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const refused = await hero.heroPicture(view, { width: 0, height: 10 }).then(() => "drew", (e: Error) => e.message);
    // (the sized pictures' renderer is kept a moment: one canvas in one host)
    const during = { view: JSON.stringify(window.dgm3d!.renderer.getView()), canvases: document.querySelectorAll("canvas").length, bodyKids: document.body.children.length };
    return { afterDefault, during, sizes, lens: [dflt?.length, small?.length, q?.length, ...three.map((t) => t?.length)], row, single, img: [img.naturalWidth, img.naturalHeight], refused, before };
  }, chunk());
  expect(out.sizes.default, "it can be drawn here").not.toBeNull();
  expect(jpegSize(out.sizes.default!)).toEqual({ w: 960, h: 540 });
  expect(jpegSize(out.sizes.card!)).toEqual({ w: 400, h: 225 });
  expect(jpegSize(out.sizes.lowQuality!)).toEqual({ w: 400, h: 225 });
  expect(out.lens[2]!, "a lower quality is a smaller file").toBeLessThan(out.lens[1]!);
  expect(out.lens.slice(3).every((n) => !!n)).toBe(true);
  expect(out.img).toEqual([320, 180]);
  expect(out.refused).toMatch(/width must be/);
  // nothing left on the page, the player's view untouched
  expect(out.afterDefault).toEqual({ canvases: out.before.canvases, bodyKids: out.before.bodyKids });
  expect(out.during).toEqual({ view: out.before.view, canvases: out.before.canvases + 1, bodyKids: out.before.bodyKids + 1 });
  // the kept renderer is freed after its idle (10 s)
  await page.waitForTimeout(11_000);
  expect(await page.evaluate(() => ({ canvases: document.querySelectorAll("canvas").length, bodyKids: document.body.children.length }))).toEqual({ canvases: out.before.canvases, bodyKids: out.before.bodyKids });
  expect(errors).toEqual([]);
  const info = `400×225 pictures: one ${Math.round(out.single)} ms; three in a row ${Math.round(out.row)} ms (${Math.round(out.row / 3)} ms each)`;
  test.info().annotations.push({ type: "information", description: info });
  console.log(info);
});
