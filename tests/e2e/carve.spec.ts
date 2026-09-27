// Carve (PLAN §20 D194, D199, D289), through the page: its row is Power, Size, Keep river or Dry
// canyon and Try another path, nothing more; a click unleashes a river that runs visibly, a frame at
// a time, and keeps itself as one undo step when it ends (the ground as it was shown; no Stop); Esc
// or undo takes all of it back at once; Try another path replaces the kept carve, and undoing it
// brings the first one back. A drag aims it (D258, D289: the gesture is the mode): only a thin arrow
// from where it began to the pointer, no route on the land; on release it goes that way.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.carve());

async function refine(page: Page, hash: string) {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
}

async function clickTile(page: Page, x: number, y: number) {
  const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
  await page.mouse.click(p.x, p.y);
}

/** High dry ground well away from the start, near the middle, where the map (not a bar over it)
 *  takes the click, and 24 tiles either side of it too (Aim's end). */
async function highGround(page: Page): Promise<[number, number]> {
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  return page.evaluate(
    ([s0, s1]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const onMap = (x: number, y: number) => {
        const p = window.dgmEditor!.tileToClient(x, y);
        return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
      };
      let best: [number, number] = [0, 0];
      let score = -Infinity;
      for (let y = 16; y < m.H - 16; y += 2)
        for (let x = 30; x < m.W - 30; x += 2) {
          const i = y * m.W + x;
          if (m.surface.depth[i] > 0 || Math.hypot(x - s0, y - s1) < 20) continue;
          if (!onMap(x, y) || !onMap(x - 24, y) || !onMap(x + 24, y)) continue;
          const s = m.heights[i] * 4 - Math.hypot(x - m.W / 2, y - m.H / 2);
          if (s > score) {
            score = s;
            best = [x, y];
          }
        }
      return best;
    },
    [start[0], start[1]] as const,
  );
}

test("Carve: its row is Power, Size and its one choice; a click unleashes a river that keeps itself as one step, Esc takes it back, Try another path replaces it", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  // its row: Power, Size, Keep river or Dry canyon (D289), no mode switch and nothing more
  const carve = page.getByRole("button", { name: "Carve (7)" });
  await expect(carve).toBeVisible();
  await carve.click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row).toBeVisible();
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size"]);
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "Keep river", "Dry canyon"]);
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Keep river" })).toHaveAttribute("aria-pressed", "true");
  // (a creek, so it ends by itself soon)
  await row.getByRole("slider", { name: "Power" }).fill("15");
  // the other forces beside it, in the forces group (D216, D219)
  for (const name of ["Craterize (8)", "Quake (9)", "Erupt (0)"]) await expect(page.getByRole("button", { name })).toBeVisible();

  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const at = await highGround(page);
  // Esc: the whole carve goes at once, and the history never had it
  await clickTile(page, at[0], at[1]);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 12, null, { timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Carve at work" })).toBeVisible();
  expect(await heights(page)).not.toEqual(before);
  await page.keyboard.press("Escape");
  await expect.poll(() => status(page)).toBeNull();
  await idle(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);

  // again, to its end: one undo step, the ground as the page showed it; its row while it works is
  // Pause and Revert, no Stop
  await clickTile(page, at[0], at[1]);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 4, null, { timeout: 20_000 });
  // the other tools wait while it works
  await expect(page.getByRole("button", { name: /^Raise brush/ })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Carve at work" }).getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  const l = await labels(page);
  expect(l.length).toBe(n0 + 1);
  expect(l.at(-1)).toBe("Carve a river");
  const kept = await heights(page);
  expect(kept).not.toEqual(before);
  const worker = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
  expect(worker).toEqual(kept);

  // Try another path: the same carve, another way, replacing the first
  const again = page.getByRole("button", { name: "Try another path" });
  await expect(again).toBeVisible();
  await again.click();
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.seed ?? 0) === 1, null, { timeout: 20_000 });
  await expect.poll(() => status(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
  const labelsNow = await labels(page);
  expect(labelsNow.at(-1)).toBe("Try another path");
  expect(await heights(page)).not.toEqual(kept);
  // undo: the first carve back, exactly; again: the land before it
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(kept);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
});

test("Carve: a drag aims it, with only an arrow, and on release it runs that way, uphill or not; undo while it runs takes it back", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Carve (7)" }).click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row.getByRole("button", { name: "Aim" })).toHaveCount(0);
  await expect(row.getByText("Defy gravity")).toHaveCount(0);
  const at = await highGround(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const gesture = () => page.evaluate(() => window.dgmEditor!.gesture());
  // hovered: the small cursor, nothing drawn ahead
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), at);
  await page.mouse.move(a.x + 3, a.y);
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => (await gesture()).cursor).toEqual(at);
  // pressed and dragged (from the high ground, uphill or not: it cuts through rises on its way): only the arrow, from where it began to the pointer, and no route
  const endX = at[0] > 48 ? at[0] - 24 : at[0] + 24;
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [endX, at[1]] as [number, number]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y, { steps: 6 });
  const g = await gesture();
  expect(g.arrow?.from).toEqual(at);
  expect(g.stroke).toBeNull();
  await expect(page.locator(".aim-arrow")).toBeVisible();
  expect(await status(page)).toBeNull();
  // let go: it runs that way, and the arrow goes as it starts
  await page.mouse.up();
  await expect(page.locator(".aim-arrow")).toHaveCount(0);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 10, null, { timeout: 20_000 });
  await page.keyboard.press("Control+z");
  await expect.poll(() => status(page)).toBeNull();
  await idle(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
});
