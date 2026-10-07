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

  // typing in a field or choosing from a list moves nothing (a toggle just clicked does not hold the
  // keys: the camera moves on)
  await page.keyboard.press("4");
  const toggle = page.getByRole("group", { name: "Flatten options" }).getByRole("group", { name: "Brush" }).getByRole("button", { name: "Square" });
  await toggle.focus();
  const t1 = (await view(page)).target;
  await page.keyboard.down("d");
  await expect.poll(async () => (await view(page)).target, { timeout: 30_000 }).not.toEqual(t1);
  await page.keyboard.up("d");
  await rests(page);
  const field = page.getByRole("group", { name: "Flatten options" }).getByRole("slider", { name: "Level", exact: true });
  await field.focus();
  const t0 = (await view(page)).target;
  await page.keyboard.down("d");
  // (a key the camera would take moves it within a few frames: none here, and no glide begins)
  await frames(page, 10);
  expect((await glide(page)).gliding).toBe(false);
  await page.keyboard.up("d");
  expect((await view(page)).target).toEqual(t0);
  expect(errors).toEqual([]);
});
