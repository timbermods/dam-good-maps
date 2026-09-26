// Live editing's water (PLAN §20 D184): a Lower stroke that starts in or beside water carves a bed
// that keeps flowing downhill (its ring turns blue), and the water follows it; a Source click puts
// a clean or a bad source down and its water spreads at once; Shift+scroll over a source changes its
// strength live, one undo step for the adjustment; a source drags to a new place (Esc puts it
// back); with Ctrl, Flatten picks the level under the pointer, on water the bed.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const wet = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.mapState()!.surface.depth;
    let n = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > 0.05) n++;
    return n;
  });
const wetAt = (page: Page, tiles: [number, number][]) =>
  page.evaluate((ts) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return ts.filter(([x, y]) => m.surface.depth[y * m.W + x] > 0.05).length;
  }, tiles);
const sources = (page: Page, x: number, y: number) =>
  page.evaluate(async ([a, b]) => (await window.dgmEditor!.worker.entitiesAt(a, b)).filter((e) => /Source$/.test(e.template)).map((e) => ({ template: e.template, x: e.x, y: e.y })), [x, y] as const);

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
}

/** Flat, dry, empty ground away from the start and from `not`: a tile with `r` tiles of it all
 *  round. */
async function flatDry(page: Page, start: [number, number], r: number, not: [number, number][] = []) {
  return page.evaluate(
    ([s0, s1, rr, avoid]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const w = m.W;
      for (let y = 8; y < m.H - 8; y++)
        for (let x = 8; x < w - 8; x++) {
          if (Math.hypot(x - s0, y - s1) < 16 || avoid.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 12)) continue;
          const h0 = m.heights[y * w + x];
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * w + x + dx] !== h0 || m.surface.depth[(y + dy) * w + x + dx] > 0) ok = false;
          for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= rr + 2 && Math.abs(m.entities.y[k] - y) <= rr + 2) ok = false;
          if (ok) return [x, y] as [number, number];
        }
      return null;
    },
    [start[0], start[1], r, not] as const,
  );
}

test("water: smart Lower carves a bed the water follows; sources placed, strengthened with Shift+scroll, moved", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  let i = await info(page);
  const W = i.W;
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const main = i.features.find((f) => f.kind === "river")!;
  const path = (main.params as { path: [number, number][] }).path;

  // smart Lower: over the river the ring is blue, over dry ground it is not
  const x = start[0] < W / 2 ? Math.round(W * 0.78) : Math.round(W * 0.22);
  const on = path.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
  const from: [number, number] = [Math.round(on[0]), Math.round(on[1])];
  const dir = from[1] < W / 2 ? 1 : -1;
  const line = Array.from({ length: 15 }, (_, k) => [from[0], from[1] + dir * k] as [number, number]);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  const far = await client(page, ...line[14]);
  await page.mouse.move(far.x, far.y);
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.brushCursorState?.water ?? false)).toBe(false);
  const p0 = await client(page, ...from);
  await page.mouse.move(p0.x, p0.y, { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.brushCursorState?.water ?? false)).toBe(true);

  // a stroke from the river out over dry ground: a bed no higher than the river's, and the water in it
  const dryBefore = line.slice(6);
  expect(await wetAt(page, dryBefore)).toBe(0);
  const bed = (await heights(page))[from[1] * W + from[0]];
  await page.mouse.down();
  for (let k = 1; k < line.length; k++) {
    const q = await client(page, ...line[k]);
    await page.mouse.move(q.x, q.y, { steps: 3 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await idle(page);
  expect(await page.evaluate(() => window.dgmEditor!.lastStroke()?.channel)).toBe(true);
  // nowhere along it above the river's bed (where the brush lingered it may press deeper)
  const after = await heights(page);
  for (const [tx, ty] of line.slice(1, 13)) expect(after[ty * W + tx], `(${tx}, ${ty})`).toBeLessThanOrEqual(bed);
  await expect.poll(() => wetAt(page, dryBefore), { timeout: 120_000, intervals: [1000] }).toBeGreaterThanOrEqual(4);
  expect((await info(page)).history.at(-1)!.label).toMatch(/^Lower/);
  await page.keyboard.press("Escape");

  // Source: a click puts a clean source down, and its water spreads at once
  const spot = await flatDry(page, start, 3, [from]);
  expect(spot).not.toBeNull();
  const [sx, sy] = spot!;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  const sp = await client(page, sx, sy);
  const wet1 = await wet(page);
  await page.mouse.move(sp.x + 3, sp.y);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Place water source");
  expect(await sources(page, sx, sy)).toEqual([{ template: "WaterSource", x: sx, y: sy }]);
  await expect.poll(() => wet(page), { timeout: 30_000 }).toBeGreaterThan(wet1);

  // Shift+scroll over it (D196): stronger, the new strength beside the pointer, one undo step
  const steps = (await info(page)).history.length;
  await page.mouse.move(sp.x, sp.y);
  await page.keyboard.down("Shift");
  for (let k = 0; k < 3; k++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await page.keyboard.up("Shift");
  await expect(page.locator(".shape-note")).toHaveText("4 water/s");
  await expect.poll(async () => (await info(page)).history.at(-1)!.label, { timeout: 20_000 }).toBe("Water source: 4 water/s");
  await idle(page);
  expect((await info(page)).history.length).toBe(steps + 1);

  // dragged somewhere else: one step; Esc mid-drag puts it back
  const to = await client(page, sx + 3, sy);
  await page.mouse.move(sp.x, sp.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle(page);
  expect((await info(page)).history.length).toBe(steps + 1);
  expect(await sources(page, sx, sy)).toHaveLength(1);
  await page.mouse.move(sp.x, sp.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Move a water source");
  expect(await sources(page, sx, sy)).toEqual([]);
  expect(await sources(page, sx + 3, sy)).toEqual([{ template: "WaterSource", x: sx + 3, y: sy }]);

  // a bad source: its 3 × 3 round the click
  const bad = await flatDry(page, start, 3, [from, [sx, sy], [sx + 3, sy]]);
  expect(bad).not.toBeNull();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Badwater source" }).click();
  const bp = await client(page, ...bad!);
  await page.mouse.move(bp.x + 3, bp.y);
  await page.mouse.click(bp.x, bp.y);
  await idle(page);
  i = await info(page);
  expect(i.history.at(-1)!.label).toBe("Place badwater source");
  expect(await sources(page, bad![0] + 1, bad![1] + 1)).toEqual([{ template: "BadwaterSource", x: bad![0] - 1, y: bad![1] - 1 }]);
  await page.keyboard.press("Escape");

  // Flatten with Ctrl over the river: the level of its bed, and no other words
  await page.getByRole("button", { name: "Flatten brush (3)" }).click();
  const mid = path[Math.floor(path.length / 2)];
  const m = [Math.round(mid[0]), Math.round(mid[1])] as [number, number];
  const mp = await client(page, ...m);
  await page.mouse.move(mp.x + 4, mp.y);
  await page.keyboard.down("Control");
  await page.mouse.move(mp.x, mp.y);
  const level = (await heights(page))[m[1] * W + m[0]];
  await expect(page.locator(".shape-note")).toHaveText(`level ${level}`);
  await page.keyboard.up("Control");
  expect(errors).toEqual([]);
});
