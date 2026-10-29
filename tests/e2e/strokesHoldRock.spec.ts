// Strokes hold a cave's or an overhang's rock (D280 (3), amended by #623): on a default Highlands 128² map with a 3D
// form (D488), a Flatten stroke from the low ground across the form's edge flattens the rest, keeps the ground holding up
// the form's rock no lower than it needs, never refused; the page painted exactly what the worker built, says how many
// tiles it held in one line, the form stands (no cave or overhang tile lost), and the live water plays after it.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";
import { toolInHand } from "./helpers";

const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const settled = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });

test("a Flatten stroke across a form's edge flattens the rest and holds what holds its rock (D280 (3), amended)", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openEditor(page, "s=1&z=128&d=n&t=highlands");
  // (the first-run hints put away by their ×: their first button is Help since #599)
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  await topDown(page);
  const W = 128;
  const { terrain } = await page.evaluate(() => window.dgmEditor!.worker.terrainNow());
  const columns = Array.from(terrain.columns);
  const hold = terrain.rockHold ?? [];
  expect(columns.length, "seed 1 grows a form").toBeGreaterThan(0);
  expect(hold.length).toBeGreaterThan(0);
  const held = new Map(hold.map(([i, lo]) => [i, lo]));
  const cave = new Set(columns);
  const h0 = await heights(page);
  // (a stroke from open ground below a holder's floor, across the holder, two tiles into the form)
  let path: { from: [number, number]; to: [number, number]; level: number } | null = null;
  for (const [i, lo] of hold) {
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const into = (y + dy * 2) * W + x + dx * 2;
      if (!cave.has(y * W + x + dx) && !cave.has(into)) continue;
      for (let d = 4; d <= 7 && !path; d++) {
        const sx = x - dx * d;
        const sy = y - dy * d;
        if (sx < 2 || sy < 2 || sx > W - 3 || sy > W - 3) continue;
        const s = sy * W + sx;
        if (cave.has(s) || held.has(s) || h0[s] + 2 > lo) continue;
        path = { from: [sx, sy], to: [x + dx * 2, y + dy * 2], level: h0[s] };
      }
      if (path) break;
    }
    if (path) break;
  }
  expect(path, "a holder with low open ground beside it").not.toBeNull();
  const { from, to, level } = path!;

  await page.keyboard.press("4");
  await toolInHand(page);
  const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), from);
  const q = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), to);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 1; k <= 30; k++) {
    await page.mouse.move(p.x + ((q.x - p.x) * k) / 30, p.y + ((q.y - p.y) * k) / 30);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await settled(page);

  // taken, one step, the one line naming the held tiles; the page painted what the worker built
  const info = await page.evaluate(() => window.dgmEditor!.info());
  expect(info.history.at(-1)!.label).toMatch(/^Flatten \d+ tiles?$/);
  await expect(page.getByText(/\d+ tiles? left high enough to hold up a cave or overhang/)).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  const h1 = await heights(page);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.sessionView()).view.heights));
  expect(built).toEqual(h1);
  // the rest flattened to the stroke's level, the held ground no lower than its floor, and some of it held
  let flattened = 0;
  let kept = 0;
  for (let i = 0; i < W * W; i++) {
    if (held.has(i)) {
      expect(h1[i], `held tile ${i}`).toBeGreaterThanOrEqual(Math.min(h0[i], held.get(i)!));
      if (h1[i] > level && h0[i] > level) kept++;
    } else if (!cave.has(i) && h1[i] !== h0[i]) {
      expect(h1[i], `tile ${i}`).toBe(level);
      flattened++;
    }
  }
  expect(flattened).toBeGreaterThan(5);
  expect(kept).toBeGreaterThan(0);
  // the form stands: every cave or overhang tile still has its cave
  const after = await page.evaluate(() => window.dgmEditor!.worker.terrainNow());
  expect(Array.from(after.terrain.columns)).toEqual(columns);

  // the live water plays after it: new frames reach the view, then it settles (waited on by the water's own progress,
  // not a few seconds: CI's software renderer draws a frame every 1.5 to 2.3 s, room for two depths in 4 s)
  const frames = await page.evaluate(async () => {
    const seen = new Set<unknown>();
    const t0 = performance.now();
    while (performance.now() - t0 < 60_000) {
      seen.add(window.dgm3d!.renderer.mapState()!.surface.depth);
      if (seen.size > 1 && window.dgmEditor!.waterSettled()) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return seen.size;
  });
  expect(frames).toBeGreaterThan(1);

  // the stroke taken back: its line goes with it, so nothing says tiles were held that the map no longer shows
  await page.keyboard.press("Control+z");
  await settled(page);
  expect(await heights(page)).toEqual(h0);
  await expect(page.getByText(/\d+ tiles? left high enough to hold up a cave or overhang/)).toBeHidden();
  expect(errors).toEqual([]);
});
