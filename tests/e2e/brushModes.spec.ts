// A brush's mode (PLAN §20 D322, item 2): Ground changes only dry tiles and never lowers a bank below
// its water's surface, so the river stays where it is; Water changes only the wet tiles (a bed
// reshaped without its banks); Both, the default, everything. Which tiles are wet is fixed when the
// stroke starts, and kept in its operation; each brush remembers its mode.

import { expect, test, type Page } from "@playwright/test";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const settle = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const state = (page: Page) =>
  page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    return { W: m.W, heights: Array.from(m.heights), surface: Array.from(m.surface.surface) };
  });

test("Ground keeps the river where it is; Water reshapes only its bed; each brush remembers its mode (item 2)", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=35&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("instant");

  // a river tile with dry land two tiles to its north, away from the edges and the bars
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const W = m.W;
    const wet = (x: number, y: number) => m.surface.surface[y * W + x] === m.surface.surface[y * W + x];
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 16; y < m.H - 16; y++)
      for (let x = 16; x < W - 16; x++)
        if (wet(x, y) && m.surface.depth[y * W + x] > 0.3 && !wet(x, y - 2) && !wet(x, y - 3) && m.heights[(y - 3) * W + x] >= m.heights[y * W + x] + 2 && onMap(x, y) && onMap(x, y - 3)) return [x, y] as [number, number];
    return null;
  });
  expect(spot).not.toBeNull();
  const [x, y] = spot!;

  // Lower in Ground, from the dry land by the river, a level below it and deep enough to reach the
  // bed: the wet tiles stay, the banks stay at or above the water's surface
  await page.keyboard.press("2");
  const row = page.getByRole("group", { name: "Lower options" });
  await row.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Ground" }).click();
  await row.getByRole("combobox", { name: "Target level" }).selectOption("0");
  const before = await state(page);
  const W = before.W;
  const p = await client(page, x, y - 3);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(p.x + 2, p.y);
  await page.mouse.click(p.x, p.y);
  await settle(page);
  await idle(page);
  const after = await state(page);
  let cut = 0;
  for (let i = 0; i < W * W; i++) {
    const s = before.surface[i];
    if (s === s) expect(after.heights[i], `wet tile ${i % W}, ${Math.floor(i / W)}`).toBe(before.heights[i]);
    else if (after.heights[i] < before.heights[i]) cut++;
  }
  expect(cut).toBeGreaterThan(5);
  const st = (await page.evaluate(() => window.dgmEditor!.lastStroke()))!;
  expect(st.mode).toBe("ground");
  expect(st.wet!.length).toBeGreaterThan(0);
  expect(st.bank!.length).toBeGreaterThan(0);
  expect(st.channel).toBeUndefined();
  // every bank tile the stroke pressed stands at or above the water beside it
  for (const [by, x0, x1, level] of st.bank!) for (let bx = x0; bx <= x1; bx++) expect(after.heights[by * W + bx]).toBeGreaterThanOrEqual(Math.min(level, before.heights[by * W + bx]));

  // Water: a Flatten on the bed a level up reshapes only the wet tiles
  await page.keyboard.press("3");
  const frow = page.getByRole("group", { name: "Flatten options" });
  await frow.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Water" }).click();
  const bed = after.heights[y * W + x];
  await frow.getByRole("combobox", { name: "Target level" }).selectOption(String(bed + 1));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const w0 = await state(page);
  const q = await client(page, x, y);
  await page.mouse.move(q.x + 2, q.y);
  await page.mouse.click(q.x, q.y);
  await settle(page);
  await idle(page);
  const w1 = await state(page);
  expect(w1.heights[y * W + x]).toBe(bed + 1);
  for (let i = 0; i < W * W; i++) if (!(w0.surface[i] === w0.surface[i])) expect(w1.heights[i]).toBe(w0.heights[i]);
  expect((await page.evaluate(() => window.dgmEditor!.lastStroke()))!.mode).toBe("water");

  // each brush remembers its own mode; the others stay on Both
  await page.keyboard.press("2");
  await expect(row.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Ground" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("1");
  await expect(page.getByRole("group", { name: "Raise options" }).getByRole("group", { name: "Mode" }).getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("dgm.brush") ?? "{}").modes);
  expect(saved).toMatchObject({ lower: "ground", flatten: "water", raise: "both" });
  expect(errors).toEqual([]);
});
