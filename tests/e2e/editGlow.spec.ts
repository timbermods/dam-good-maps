// What an edit just changed in 3D glows a moment (render3d/editGlow.ts; D488): a hole dug into a wall shows the
// hollow's faces it opened, then fades away; its undo shows the block put back; a plain edit made with no Block tool
// in hand (a brush's or a force's land shows itself) draws nothing; with reduced motion it shows still, then goes.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

type Glow = { added: number; removed: number; fade: number };
const glow = (page: Page) => page.evaluate(() => (window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow }).editGlowDrawn);
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const edits = (page: Page) => page.evaluate(() => window.dgmEditor!.info().edits);

test("a Block dig into a wall glows on the hollow's faces and fades; its undo glows the block put back; a plain edit does not", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  // a flat dry stretch 6 × 6 with nothing on it
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const busy = new Set<number>();
    for (let k = 0; k < m.entities.count; k++) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) busy.add((m.entities.y[k] + dy) * m.W + m.entities.x[k] + dx);
    for (let y = 6; y < m.H - 12; y++)
      for (let x = 6; x < m.W - 12; x++) {
        const h = m.heights[y * m.W + x];
        let ok = h > 1 && h <= 16;
        for (let j = 0; j < 6 && ok; j++) for (let i = 0; i < 6 && ok; i++) {
          const k = (y + j) * m.W + x + i;
          ok = m.heights[k] === h && m.surface.depth[k] <= 0.01 && !busy.has(k);
        }
        if (ok) return { x, y, h };
      }
    return null;
  });
  expect(spot, "a flat dry stretch").not.toBeNull();
  const { x, y, h } = spot!;

  // a block of ground 3 × 3, four levels up: a plain edit with no Block tool in hand draws nothing
  await page.evaluate(([x, y, h]) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[y, x, x + 2], [y + 1, x, x + 2], [y + 2, x, x + 2]], level: h + 4 } } as never, "Raise"), [x, y, h] as const);
  await idle(page);
  await expect.poll(() => page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), [x + 1, y + 1] as const)).toBe(h + 4);
  expect(await glow(page)).toEqual({ added: 0, removed: 0, fade: 0 });

  // a hole dug into its east face one level up: air under its roof; the hollow's floor, ceiling, back and sides glow
  const before = await edits(page);
  await page.evaluate(([x, y, h]) => window.dgmEditor!.edit({ op: "blocks", params: { mode: "remove", side: "+x", at: [[x + 2, y + 1, h + 1]], size: 1 } } as never, "Dig"), [x, y, h] as const);
  await expect.poll(() => edits(page)).toBe(before + 1);
  // (the first hollow on a map builds the cave light and compiles the cave shaders, which can hold the page for seconds;
  // the glow's clock waits for its frames)
  await expect.poll(async () => (await glow(page)).removed, { message: "the hollow's faces glow", intervals: [20], timeout: 60_000 }).toBe(5);
  expect((await glow(page)).added).toBe(0);
  // and fade away (about a second on a GPU; frames are slow in software, the clock moves at most 250 ms a frame)
  await expect.poll(() => glow(page), { message: "the glow fades and goes", timeout: 30_000 }).toEqual({ added: 0, removed: 0, fade: 0 });

  // the undo puts the block back: its one open face glows
  await page.keyboard.press("Control+z");
  await expect.poll(() => edits(page)).toBe(before);
  await expect.poll(async () => (await glow(page)).added, { message: "the block put back glows", intervals: [20], timeout: 30_000 }).toBe(1);
  await expect.poll(() => glow(page), { timeout: 30_000 }).toEqual({ added: 0, removed: 0, fade: 0 });

  // with reduced motion: shown still, not fading, then gone
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(([x, y, h]) => window.dgmEditor!.edit({ op: "blocks", params: { mode: "remove", side: "+x", at: [[x + 2, y + 1, h + 1]], size: 1 } } as never, "Dig"), [x, y, h] as const);
  await expect.poll(async () => (await glow(page)).removed, { intervals: [20], timeout: 30_000 }).toBe(5);
  expect((await glow(page)).fade).toBeCloseTo(0.85, 5);
  await expect.poll(() => glow(page), { timeout: 30_000 }).toEqual({ added: 0, removed: 0, fade: 0 });
});
