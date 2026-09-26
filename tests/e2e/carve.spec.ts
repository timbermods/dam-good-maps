// Carve (PLAN §20 D194, D199), through the page: the button next to Source, its options row with
// the mode switch first; a click unleashes a river that runs visibly, a frame at a time; Stop keeps
// it as one undo step (the ground as it was shown), Esc or undo takes all of it back at once; Try
// another path replaces the kept carve, and undoing it brings the first one back. Aim: a start,
// then an end, the line between them shown.

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

test("Carve: unleash a river, Stop keeps it as one step, Esc takes it back, Try another path replaces it", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  // the button next to Source, its options row starting with its mode switch
  const carve = page.getByRole("button", { name: "Carve (7)" });
  await expect(carve).toBeVisible();
  await carve.click();
  const row = page.getByRole("group", { name: "Carve options" });
  await expect(row).toBeVisible();
  const first = row.locator("button").first();
  await expect(first).toHaveText("Unleash");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByRole("button", { name: "Keep river" })).toHaveAttribute("aria-pressed", "true");
  // Craterize, Quake and Erupt stay hidden until they are ready
  await expect(page.getByRole("button", { name: /Craterize|Quake|Erupt/ })).toHaveCount(0);

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

  // again, and Stop: one undo step, the ground as the page showed it
  await clickTile(page, at[0], at[1]);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 20, null, { timeout: 20_000 });
  // the other tools wait while it works
  await expect(page.getByRole("button", { name: /^Raise brush/ })).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => status(page)).toBeNull();
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
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.seed ?? 0) === 1 && window.dgmEditor!.carve()!.steps >= 20, null, { timeout: 20_000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => status(page)).toBeNull();
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

test("Carve: Aim picks a start, then an end; undo while it runs takes it back", async ({ page }) => {
  await refine(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Carve (7)" }).click();
  const row = page.getByRole("group", { name: "Carve options" });
  await row.getByRole("button", { name: "Aim" }).click();
  await expect(row.getByText("Defy gravity")).toBeVisible();
  await row.getByText("Defy gravity").click();
  const at = await highGround(page);
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  await clickTile(page, at[0], at[1]);
  // (nothing runs yet: the start is picked, the line follows the pointer)
  expect(await status(page)).toBeNull();
  const endX = at[0] > 48 ? at[0] - 24 : at[0] + 24;
  const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [endX, at[1]] as [number, number]);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await expect(page.locator(".shape-note")).toContainText("tiles");
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => (window.dgmEditor!.carve()?.steps ?? 0) >= 10, null, { timeout: 20_000 });
  await page.keyboard.press("Control+z");
  await expect.poll(() => status(page)).toBeNull();
  await idle(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
});
