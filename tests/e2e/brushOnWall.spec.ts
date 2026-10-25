// A brush aimed at a cliff's face from low down (a cave's mouth seen from its floor is one too): the editing tools aim
// at the tile whose wall the pointer is on, so the brush lies there, under the pointer, and a click changes the ground
// round that tile. It once lay where the ray crossed the tile's top level, in front of the wall toward the camera,
// tiles away from the pointer (with a target, its plane a pale veil across the view), and the stroke landed there.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("a brush on a cliff's face lies on that cliff, under the pointer, and its stroke changes the ground there", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=7&z=128&d=n&t=canyon");
  await page.keyboard.press("2");

  // a cliff facing south, seen from just above its top, a little way off: its face just under the top under the pointer
  const aim = await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    const W = m.W;
    for (let y = 20; y < m.H - 20; y++)
      for (let x = 20; x < W - 20; x++) {
        const top = m.heights[y * W + x];
        if (top - m.heights[(y - 1) * W + x] < 4) continue;
        const pitch = 0.2;
        const distance = 14;
        r.setView({ mode: "orbit", yaw: 0, pitch, distance, target: [x + 0.5, top + 1 - Math.sin(pitch) * distance, -(y - 3)] });
        const p = r.project(x + 0.5, top - 1, -y);
        const box = document.querySelector("canvas")!.getBoundingClientRect();
        const at = { x: p.x + box.left, y: p.y + box.top };
        const hit = r.pick(at.x, at.y);
        if (p.visible && hit && hit.x === x && hit.y === y && hit.face === "side") return { x, y, at };
      }
    return null;
  });
  expect(aim).not.toBeNull();
  const { x, y, at } = aim!;
  await page.mouse.move(at.x, at.y);
  // the cursor is placed from the one pointer move, on the page's next frame (CI's software drawing takes a second or
  // more a frame): wait for it to be placed at all, then where it lies, the brush's middle within a tile of the tile's,
  // on its wall
  await page.waitForFunction(() => window.dgm3d!.renderer.brushCursorState !== null, null, { timeout: 60_000 });
  const off = await page.evaluate(([tx, ty]) => {
    const c = window.dgm3d!.renderer.brushCursorState!;
    return Math.hypot(c.x - (tx + 0.5), c.y - (ty + 0.5));
  }, [x, y] as const);
  expect(off).toBeLessThan(1);

  // a click there: what it changes lies round that tile, none of it a brush's width nearer the camera
  const before = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  const after = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  const W = (await page.evaluate(() => window.dgm3d!.renderer.mapState()!.W)) as number;
  const changed = after.map((h, i) => (h !== before[i] ? i : -1)).filter((i) => i >= 0);
  expect(changed.length).toBeGreaterThan(0);
  const size = (await page.evaluate(() => window.dgm3d!.renderer.brushCursorState?.radius ?? 0)) as number;
  for (const i of changed) expect(Math.hypot((i % W) + 0.5 - (x + 0.5), Math.floor(i / W) + 0.5 - (y + 0.5))).toBeLessThan(size + 2);
  expect(errors).toEqual([]);
});
