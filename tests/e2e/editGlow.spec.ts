// What an edit just changed in 3D glows a moment (render3d/editGlow.ts; D488): a hole dug into a wall shows the
// hollow's faces it opened, then fades away; its undo shows the block put back; with reduced motion it shows still,
// then goes. On plain ground only the Block tool's own click glows: a plain edit (a brush's, a force's or a Select
// action's land shows itself) draws nothing, the Block tool in hand or not, and Compare's flip, not an edit, nothing.

import { expect, test, type Page } from "@playwright/test";
import { toolInHand } from "./helpers";
import { openEditor, openYourMaps } from "./open";

type Glow = { added: number; removed: number; fade: number };
const glow = (page: Page) => page.evaluate(() => (window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow }).editGlowDrawn);
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const edits = (page: Page) => page.evaluate(() => window.dgmEditor!.info().edits);
/** The most faces glowing at any moment over `ms`. */
const glowOver = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<number>((done) => {
        const r = window.dgm3d!.renderer as unknown as { editGlowDrawn: Glow };
        let most = 0;
        const id = setInterval(() => (most = Math.max(most, r.editGlowDrawn.added + r.editGlowDrawn.removed)), 5);
        setTimeout(() => {
          clearInterval(id);
          done(most);
        }, ms);
      }),
    ms,
  );

/** A flat dry stretch 6 × 6 with nothing on it: its corner and level. */
async function flatSpot(page: Page): Promise<{ x: number; y: number; h: number }> {
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
  return spot!;
}

test("a Block dig into a wall glows on the hollow's faces and fades; its undo glows the block put back; a plain edit does not", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);

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

test("the Block tool's own click glows on plain ground; a plain edit with it in hand and a Compare flip glow nothing", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  const { x, y, h } = await flatSpot(page);
  await page.evaluate(([x, y, h]) => window.dgm3d!.renderer.setView({ target: [x + 3, h, -(y + 3)], distance: 20, yaw: 0.5, pitch: 0.7 }), [x, y, h] as const);
  await page.keyboard.press("7");
  await toolInHand(page);
  for (let k = 0; k < 8; k++) await page.keyboard.press("{");

  // the Block tool's click: one block on the flat ground, its five open faces white
  const p = await page.evaluate(([x, y, h]) => {
    const r = window.dgm3d!.renderer;
    const q = r.project(x + 0.5, h, -(y + 0.5));
    const b = r.canvas.getBoundingClientRect();
    return { x: q.x + b.left, y: q.y + b.top };
  }, [x + 3, y + 3, h] as const);
  await page.mouse.move(p.x - 2, p.y - 2);
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.block().preview?.added.length ?? 0), { timeout: 15_000 }).toBe(1);
  const before = await edits(page);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => edits(page), { timeout: 15_000 }).toBe(before + 1);
  await expect.poll(async () => (await glow(page)).added, { message: "the added block glows", intervals: [20], timeout: 30_000 }).toBe(5);
  await expect.poll(() => glow(page), { timeout: 30_000 }).toEqual({ added: 0, removed: 0, fade: 0 });

  // a plain edit (a Select action's Flatten) with the Block tool still in hand and its preview shown: nothing glows
  await page.evaluate(([x, y, h]) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[y, x, x + 1]], level: h + 2 } } as never, "Raise a tile"), [x, y, h] as const);
  const [most] = await Promise.all([glowOver(page, 2500), idle(page)]);
  expect(most, "a plain edit with the Block tool in hand glows nothing").toBe(0);

  // keep this step, compare with it, and flip to it and back with B: not an edit, nothing glows
  await page.keyboard.press("Escape");
  const name = (await page.evaluate(() => window.dgmEditor!.info())).name;
  const history = page.getByRole("button", { name: "History", exact: true }).first();
  await history.click();
  const step = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await step.hover();
  await step.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Add blocks` })).toBeVisible({ timeout: 60_000 });
  await history.click();
  const yours = await openYourMaps(page);
  await yours.locator("li", { hasText: `${name} — Add blocks` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Compare with the open map" }).click();
  await expect(page.locator(".compare-note")).toBeVisible();
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("b");
  await expect(page.locator(".compare-veil")).toHaveCount(1);
  const flipped = await glowOver(page, 1500);
  await page.keyboard.up("b");
  await expect(page.locator(".compare-veil")).toHaveCount(0);
  const back = await glowOver(page, 1500);
  expect([flipped, back], "a Compare flip and back glow nothing").toEqual([0, 0]);
});
