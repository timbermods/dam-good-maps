// Strokes painted back to back (#410): each new stroke starts before the worker has answered the one
// before, so its answer comes while the next is being painted. The page's land stays its own until
// nothing it painted is in flight, then the worker's goes in: the same, byte for byte, and the page's
// mismatch warning never fires.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);

/** A held stroke's moves from p to q, sent by the page itself 8 ms apart to the map, with the pointer the press went
 *  down with. A move sent from here waits for the page's next frame, and on CI's software drawing a frame of this map
 *  takes up to 2 s: 144 of them took the test past its three minutes (run 40575112650; a CPU profile under SwiftShader
 *  puts nine tenths of each stroke in the raster, the page's own work a few hundred ms, as on a GPU). The moves are the
 *  same, so are the strokes and what is asserted; only the frame each one waited for is gone. */
async function sweep(page: Page, p: { x: number; y: number }, q: { x: number; y: number }, steps: number) {
  await page.evaluate(
    async ([p, q, steps]) => {
      const c = window.dgm3d!.renderer.canvas;
      const id = (window as unknown as { strokePointer: number }).strokePointer;
      for (let s = 1; s <= steps; s++) {
        const init = { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: "mouse", isPrimary: true, buttons: 1, clientX: p.x + ((q.x - p.x) * s) / steps, clientY: p.y + ((q.y - p.y) * s) / steps };
        c.dispatchEvent(new PointerEvent("pointermove", init));
        await new Promise((r) => setTimeout(r, 8));
      }
    },
    [p, q, steps] as const,
  );
}

test("strokes painted back to back end with the page's land the worker's, byte for byte (#410)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  await topDown(page);
  // (the pointer each press goes down with, for the moves the page sends)
  await page.evaluate(() => window.addEventListener("pointerdown", (e) => ((window as unknown as { strokePointer: number }).strokePointer = e.pointerId), true));
  // Raise, then Lower, Flatten and Smooth, each stroke pressed the moment the last is let go
  const keys = ["2", "3", "4", "5", "2", "3"];
  for (let k = 0; k < keys.length; k++) {
    await page.keyboard.press(keys[k]);
    const y = 30 + 12 * k;
    const p = await client(page, 30, y);
    const q = await client(page, 90, y + 6);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sweep(page, p, q, 24);
    // (the pointer itself to the stroke's end, where the page's last move left it, and let go)
    await page.mouse.move(q.x, q.y);
    await page.mouse.up();
  }
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 60_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await page.evaluate(() => window.dgmEditor!.info())).history.filter((h) => h.applied).length).toBe(keys.length);
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
  expect(await heights(page)).toEqual(built);
});
