// The camera keys (Timberborn's): held, WASD moves the camera every frame, easing in and gliding to
// a stop; Q and E turn it; Shift is faster; nothing moves while typing in a field. The glide's own pace
// (how far, how fast, Shift's 2.5 times) is checked on exact frame times by cameraGlide.test; here, that
// the keys reach it in the browser, frame by frame, whatever the machine's frame rate (D341: nothing
// here waits on the wall clock for a distance).

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const view = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.getView());
const glide = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.cameraGlide());

/** The view's target over the page's next `n` frames. */
const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<string[]>((done) => {
        const out: string[] = [];
        const next = () => {
          out.push(window.dgm3d!.renderer.getView().target.map((v) => v.toFixed(4)).join());
          if (out.length < count) requestAnimationFrame(next);
          else done(out);
        };
        requestAnimationFrame(next);
      }),
    n,
  );

/** Let go: it glides to a stop (no frame waiting), then stays. */
async function rests(page: Page) {
  await expect.poll(async () => (await glide(page)).gliding, { timeout: 30_000 }).toBe(false);
  const at = (await view(page)).target;
  expect(new Set(await frames(page, 6)).size).toBe(1);
  expect((await view(page)).target).toEqual(at);
}

test("held camera keys move the view every frame and glide to a stop; typing moves nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // (from the map's middle, close in: held long enough on a slow machine, the view would otherwise reach the map's edge,
  // where it stops by design; the pace follows the zoom, so close in a held key crosses fewer tiles)
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    r.setView({ target: [m.W / 2, r.getView().target[1], -m.H / 2], distance: 24 });
  });

  // D held: the target moves every frame, not in a few jumps
  const v0 = await view(page);
  await page.keyboard.down("d");
  await expect.poll(async () => (await glide(page)).x, { timeout: 30_000 }).toBeGreaterThan(0.5);
  const held = await frames(page, 8);
  expect(new Set(held).size).toBe(held.length);
  await page.keyboard.up("d");
  // it glides to a stop, then stays
  await rests(page);
  expect((await view(page)).target).not.toEqual(v0.target);

  // Shift is faster (the glide goes at Shift's pace while it is held; how much faster is
  // cameraGlide.test's)
  await page.keyboard.down("Shift");
  await page.keyboard.down("s");
  await expect.poll(async () => (await glide(page)).y, { timeout: 30_000 }).toBeLessThan(-0.5);
  expect((await glide(page)).fast).toBe(true);
  await page.keyboard.up("s");
  await page.keyboard.up("Shift");
  expect((await glide(page)).fast).toBe(false);
  await rests(page);

  // Q turns the 3D view
  const yaw = (await view(page)).yaw;
  await page.keyboard.down("q");
  await expect.poll(async () => (await view(page)).yaw, { timeout: 30_000 }).toBeGreaterThan(yaw);
  await page.keyboard.up("q");
  await rests(page);

  // a focused toggle or slider keeps only its own keys (the arrows, Home, End, Page): the camera's letters
  // reach the page and the camera moves on; typing in a text field moves nothing
  await page.keyboard.press("4");
  const toggle = page.getByRole("group", { name: "Flatten options" }).getByRole("group", { name: "Brush" }).getByRole("button", { name: "Square" });
  await toggle.focus();
  const t1 = (await view(page)).target;
  await page.keyboard.down("d");
  await expect.poll(async () => (await view(page)).target, { timeout: 30_000 }).not.toEqual(t1);
  await page.keyboard.up("d");
  await rests(page);
  const slider = page.getByRole("group", { name: "Flatten options" }).getByRole("slider", { name: "Level", exact: true });
  await slider.focus();
  const t2 = (await view(page)).target;
  await page.keyboard.down("d");
  await expect.poll(async () => (await view(page)).target, { timeout: 30_000 }).not.toEqual(t2);
  await page.keyboard.up("d");
  await rests(page);
  // (the title is a button until clicked, then the map's name field, focused)
  await page.locator(".editor-title h1 button.title-button").click();
  const field = page.getByLabel("Map name");
  await expect(field).toBeFocused();
  const before = await field.inputValue();
  const t0 = (await view(page)).target;
  await page.keyboard.down("d");
  // (a key the camera would take moves it within a few frames: none here, and no glide begins)
  await frames(page, 10);
  expect((await glide(page)).gliding).toBe(false);
  await page.keyboard.up("d");
  expect((await view(page)).target).toEqual(t0);
  expect(await field.inputValue()).toContain("d");
  expect(await field.inputValue()).not.toBe(before);
  expect(errors).toEqual([]);
});

test("the wheel zooms toward the pointer: the ground under it stays under it, in and out, in the orbit and the top-down view; nothing moves at the limit; the sky does not throw", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  // the opening frame can be wider than the zoom's farthest limit: a first turn out never zooms in
  const framed = (await view(page)).distance;
  const open = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.move(open.x + open.width * 0.6, open.y + open.height * 0.55);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  expect((await view(page)).distance).toBeGreaterThanOrEqual(framed);
  await page.evaluate((d) => window.dgm3d!.renderer.setView({ distance: d }), framed);

  /** A dry tile about 250 pixels from the middle that the pointer really sees (nothing in front of it), with the canvas under its top. */
  const offCentreTile = () =>
    page.evaluate(() => {
      const r = window.dgm3d!.renderer;
      const m = r.mapState()!;
      const box = document.querySelector("canvas")!.getBoundingClientRect();
      const best = { x: -1, y: -1, d: -1 };
      for (let y = 4; y < m.H - 4; y += 3) {
        for (let x = 4; x < m.W - 4; x += 3) {
          if (m.surface.depth[y * m.W + x] > 0.05) continue;
          const p = r.tileToClient(x, y);
          if (!p.visible || p.x < box.left + 80 || p.x > box.right - 80 || p.y < box.top + 80 || p.y > box.bottom - 80) continue;
          if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") continue;
          const hit = r.pickSurface(p.x, p.y, r.pickSeen(p.x, p.y));
          if (!hit || hit.x !== x || hit.y !== y) continue;
          const d = Math.hypot(p.x - (box.left + box.width / 2), p.y - (box.top + box.height / 2));
          if (best.d >= 0 && Math.abs(d - 250) >= Math.abs(best.d - 250)) continue;
          Object.assign(best, { x, y, d });
        }
      }
      return best.d < 0 ? null : { x: best.x, y: best.y };
    });
  const screen = (t: { x: number; y: number }) => page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [t.x, t.y] as const);

  /** Wheel `deltaY` in a few steps with the pointer on the tile: its screen point stays within a few pixels of the pointer. */
  const wheelKeeps = async (t: { x: number; y: number }, deltaY: number, label: string) => {
    const p = await screen(t);
    await page.mouse.move(p.x, p.y);
    const d0 = (await view(page)).distance;
    for (let k = 0; k < 5; k++) {
      await page.mouse.wheel(0, deltaY);
      await page.waitForTimeout(40);
      const q = await screen(t);
      expect(Math.hypot(q.x - p.x, q.y - p.y), `${label}, step ${k + 1}`).toBeLessThan(4);
    }
    const d1 = (await view(page)).distance;
    expect(deltaY < 0 ? d1 < d0 : d1 > d0, `${label}: the distance changed`).toBe(true);
  };

  const tile = await offCentreTile();
  expect(tile, "a dry tile off the middle to point at").not.toBeNull();
  await wheelKeeps(tile!, -120, "orbit, in");
  await wheelKeeps(tile!, 120, "orbit, out");

  // the same in the top-down view
  await page.evaluate(() => window.dgm3d!.renderer.setMode("top"));
  const flat = await offCentreTile();
  expect(flat, "a tile off the middle in the top-down view").not.toBeNull();
  await wheelKeeps(flat!, -120, "top-down, in");
  await wheelKeeps(flat!, 120, "top-down, out");

  // at the zoom's nearest limit nothing moves, not even the target
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setMode("orbit");
    r.setView({ distance: 6 });
  });
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  const v0 = await view(page);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(80);
  expect(await view(page)).toEqual(v0);

  // over the sky (a low look toward the horizon, the pointer at the canvas's top edge): it zooms, nothing throws
  await page.evaluate(() => window.dgm3d!.renderer.setView({ pitch: 0.2, distance: 60 }));
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  const d0 = (await view(page)).distance;
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  expect((await view(page)).distance).toBeGreaterThan(d0);

  // just below the horizon, past the map (the ground there is thousands of tiles away): the zoom is about the centre, so
  // the target does not move (it would be thrown across the map about a point out there)
  await page.evaluate(() => window.dgm3d!.renderer.setView({ pitch: 0.18, distance: 150, target: [48, 8, -48] }));
  const row = await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    const box = document.querySelector("canvas")!.getBoundingClientRect();
    for (let y = box.top + 2; y < box.bottom; y += 1) {
      const ray = r.rayAt(box.left + box.width / 2, y);
      if (ray.direction[1] >= -1e-4) continue;
      const t = (8 - ray.origin[1]) / ray.direction[1];
      const z = ray.origin[2] + ray.direction[2] * t;
      if (Math.abs(z) > m.H * 4) return y;
    }
    return null;
  });
  expect(row, "a row just below the horizon").not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, row!);
  const t0 = (await view(page)).target;
  const dh = (await view(page)).distance;
  await page.mouse.wheel(0, -10);
  await page.waitForTimeout(80);
  expect((await view(page)).distance).toBeLessThan(dh);
  expect((await view(page)).target).toEqual(t0);
  expect(errors).toEqual([]);
});

test("the Top-down toggle keeps the spot at the centre and the zoom, both ways; Reset view still frames the whole map (D492)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  /** Where the view's target lands on the canvas, and how many pixels ten tiles across the screen's width span at it. */
  const look = () =>
    page.evaluate(() => {
      const r = window.dgm3d!.renderer;
      const v = r.getView();
      const [tx, ty, tz] = v.target;
      const yaw = v.mode === "top" ? 0 : v.yaw;
      const c = r.project(tx, ty, tz);
      const e = r.project(tx + Math.cos(yaw) * 10, ty, tz - Math.sin(yaw) * 10);
      const box = document.querySelector("canvas")!.getBoundingClientRect();
      return { x: c.x - box.left, y: c.y - box.top, w: box.width, h: box.height, per10: Math.hypot(e.x - c.x, e.y - c.y), view: v };
    });

  // zoom in on one spot, away from the framing
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45);
  for (let k = 0; k < 6; k++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(40);
  }
  const angled = await look();
  const toggle = page.getByRole("button", { name: "Top-down" });
  await toggle.click();
  const top = await look();
  expect(top.view.mode).toBe("top");
  expect(top.view.target).toEqual(angled.view.target);
  expect(top.view.yaw).toBe(angled.view.yaw);
  expect(Math.hypot(top.x - angled.x, top.y - angled.y), "the centre point stays at the centre").toBeLessThan(1.5);
  expect(Math.abs(top.per10 / angled.per10 - 1), "the zoom stays").toBeLessThan(0.01);

  await toggle.click();
  const back = await look();
  expect(back.view.mode).toBe("orbit");
  expect(back.view.target).toEqual(angled.view.target);
  expect(back.view.yaw).toBe(angled.view.yaw);
  expect(back.view.distance).toBeCloseTo(angled.view.distance, 6);
  expect(Math.hypot(back.x - angled.x, back.y - angled.y)).toBeLessThan(1.5);
  expect(Math.abs(back.per10 / angled.per10 - 1)).toBeLessThan(0.01);

  // Reset view still frames the whole map, centred, in either view
  for (const mode of ["orbit", "top"] as const) {
    if (mode === "top") await toggle.click();
    await page.getByRole("button", { name: "Reset view" }).click();
    const r = await look();
    expect(r.view.mode).toBe(mode);
    expect(r.view.distance, `${mode}: reset zooms back out`).toBeGreaterThan(angled.view.distance * 1.5);
  }
  expect(errors).toEqual([]);
});
