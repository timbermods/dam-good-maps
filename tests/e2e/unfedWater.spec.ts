// Water that no source feeds recedes at once (PLAN §20 D260), through the page: a source placed on
// dry ground makes its water; removed, its marker and label go the moment it's removed, and its
// water drains away in the edit's own journey within a couple of seconds at normal speed, never
// waiting for the background check.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** The deepest water the page shows within `r` tiles of (x, y). */
const waterNear = (page: Page, x: number, y: number, r = 3) =>
  page.evaluate(
    ([cx, cy, rr]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      let d = 0;
      for (let yy = cy - rr; yy <= cy + rr; yy++) for (let xx = cx - rr; xx <= cx + rr; xx++) d = Math.max(d, m.surface.depth[yy * m.W + xx] || 0);
      return d;
    },
    [x, y, r] as [number, number, number],
  );

test("a removed source's marker goes at once, and its water drains away in the edit's own journey (D260)", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  // a dry hollow-free spot far from the water, where the map takes the pointer
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    const taken = new Set<number>();
    for (let k = 0; k < m.entities.count; k++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add((m.entities.y[k] + dy) * m.W + m.entities.x[k] + dx);
    for (let y = 20; y < m.H - 20; y += 2)
      for (let x = 20; x < m.W - 20; x += 2) {
        if (taken.has(y * m.W + x)) continue;
        let dry = true;
        for (let yy = y - 8; yy <= y + 8 && dry; yy++) for (let xx = x - 8; xx <= x + 8 && dry; xx++) if (m.surface.depth[yy * m.W + xx] > 0 || !onMap(xx, yy)) dry = false;
        if (dry) return [x, y] as [number, number];
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const [x, y] = spot!;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: /^Water source/ }).click();
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.info())).history.filter((h) => h.applied).at(-1)?.label ?? "").toMatch(/source/i);
  await page.keyboard.press("Escape");
  await expect.poll(() => waterNear(page, x, y), { timeout: 20_000 }).toBeGreaterThan(0.01);
  // let it settle (the journey and the background check)
  await expect(page.getByRole("toolbar", { name: "Water time" }).getByRole("status")).toHaveText("Water settled", { timeout: 30_000 });
  await page.getByRole("button", { name: "Markers" }).click();
  const markers = page.locator(".source-marker");
  const n0 = await markers.count();
  expect(n0).toBeGreaterThan(0);
  // removed (pointed at and Delete): its marker goes at once
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y);
  const t0 = Date.now();
  await page.keyboard.press("Delete");
  await expect(markers).toHaveCount(n0 - 1, { timeout: 2_000 });
  // and its water drains in the journey, well before any background check could settle it
  await expect.poll(() => waterNear(page, x, y), { timeout: 8_000, intervals: [100] }).toBeLessThan(0.005);
  expect(Date.now() - t0).toBeLessThan(4_000);
});
