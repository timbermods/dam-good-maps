// Unleash, on a source (PLAN §20 D239), through the page: a placed source, selected, has a small
// Unleash action beside its strength (and U); it carves its own course with Carve's engine, kept as one
// step when it ends (no Stop, D289) and undo takes it back, Esc takes it all back as it runs; dragged from Unleash onto
// the land it aims there; Try another re-rolls the course. The source stays: no second one.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const running = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
/** Waits for the carve to end and keep itself (no Stop, D289). */
async function stopIfRunning(page: Page) {
  await expect.poll(() => running(page), { timeout: 90_000 }).toBeNull();
  await idle(page);
}

test("Unleash: a selected source carves its own course, kept as one step when it ends; Esc takes it back; dragged, it aims; Try another re-rolls it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=4242&z=96&d=n&t=highlands");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("faster");

  // a source on dry high ground far from the start, where the map (not a bar) takes the pointer,
  // with lower ground 12 to 20 tiles from it to aim at
  const spot = await page.evaluate(() => {
    const i = window.dgmEditor!.info();
    const st = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let best: { at: [number, number]; end: [number, number] } | null = null;
    let score = -Infinity;
    // (well inside the map, so its water has somewhere to run before an edge)
    for (let y = 26; y < m.H - 26; y += 3)
      for (let x = 26; x < m.W - 26; x += 3) {
        const h = m.heights[y * m.W + x];
        if (m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || Math.hypot(x - st[0], y - st[1]) < 24) continue;
        let low: [number, number] | null = null;
        for (let yy = y - 20; yy <= y + 20; yy += 2)
          for (let xx = x - 20; xx <= x + 20; xx += 2) {
            const d = Math.hypot(xx - x, yy - y);
            if (d < 12 || d > 20 || xx < 2 || yy < 2 || xx > m.W - 3 || yy > m.H - 3 || !onMap(xx, yy)) continue;
            if (m.heights[yy * m.W + xx] < h - 2 && (!low || m.heights[yy * m.W + xx] < m.heights[low[1] * m.W + low[0]])) low = [xx, yy];
          }
        if (low && h > score) {
          score = h;
          best = { at: [x, y], end: low };
        }
      }
    return best!;
  });
  expect(spot).not.toBeNull();
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  const p = await client(page, spot.at[0], spot.at[1]);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  expect((await labels(page)).at(-1)).toMatch(/source/i);
  await page.keyboard.press("Escape");

  // selected: Unleash sits beside its strength, with a quick Power
  const select = async () => {
    await page.mouse.move(p.x + 3, p.y);
    await page.mouse.click(p.x, p.y);
    const row = page.getByRole("group", { name: "Water source, selected" });
    await expect(row.getByRole("button", { name: "Unleash" })).toBeVisible();
    return row;
  };
  let row = await select();
  await expect(row.getByRole("combobox", { name: "Strength" })).toBeVisible();
  await expect(row.getByRole("slider", { name: "Unleash power" })).toBeVisible();
  const n0 = (await labels(page)).length;
  const before = await heights(page);

  // a click: it carves, kept as one step when it ends; the source is still there, and still selected
  await row.getByRole("button", { name: "Unleash" }).click();
  const work = page.getByRole("group", { name: "Unleash at work" });
  await expect(work).toBeVisible();
  await page.waitForTimeout(2500);
  await stopIfRunning(page);
  expect(await labels(page)).toHaveLength(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Unleash a source");
  expect(await heights(page)).not.toEqual(before);
  row = page.getByRole("group", { name: "Water source, selected" });
  await expect(row.getByRole("button", { name: "Try another" })).toBeVisible();
  // Try another: another course, in its place
  await row.getByRole("button", { name: "Try another" }).click();
  await expect(work).toBeVisible();
  await page.waitForTimeout(1500);
  await stopIfRunning(page);
  expect((await labels(page)).at(-1)).toBe("Try another course");
  // undo twice: the land as it was
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect(await labels(page)).toHaveLength(n0);

  // U, then Esc as it runs: all of it goes
  await select();
  await page.keyboard.press("u");
  await expect(work).toBeVisible();
  // (Esc while it still runs: generator 0.7.0's land can end a short course within a second)
  await page.waitForTimeout(300);
  expect(await running(page)).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect.poll(() => running(page), { timeout: 10_000 }).toBeNull();
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(before);
  expect(await labels(page)).toHaveLength(n0);

  // dragged from Unleash onto lower land: its river follows the line drawn there
  row = await select();
  const button = (await row.getByRole("button", { name: "Unleash" }).boundingBox())!;
  const q = await client(page, spot.end[0], spot.end[1]);
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(button.x + button.width / 2 + ((q.x - button.x - button.width / 2) * k) / 12, button.y + button.height / 2 + ((q.y - button.y - button.height / 2) * k) / 12);
    await page.waitForTimeout(20);
  }
  // (only the line drawn from the source shows the way, D258, D321 item 41)
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.gesture())).stroke ?? 0).toBeGreaterThan(0);
  await page.mouse.up();
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.gesture())).stroke).toBeNull();
  await expect(work).toBeVisible();
  await expect.poll(() => running(page), { timeout: 60_000 }).toBeNull();
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Unleash a source");
  expect(errors).toEqual([]);
});
