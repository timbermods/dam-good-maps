// The map's labels, the Legend and the minimap (the editor polish audit): the sources' labels never stand on one
// another or on an open panel, the open Legend hangs centred under its toggle and keeps Ground height's Low and High,
// and the minimap shows a held Drought day's water as the map does.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, openLegend } from "./open";

const ID = (k: number) => `00000000-0000-4000-8000-0000000001${String(k).padStart(2, "0")}`;

/** Sources close together on screen (a few tiles apart, so they are separate groups), at the map's middle. */
async function placeCrowd(page: Page) {
  const spots: [number, number][] = [[40, 40], [44, 40], [48, 41], [40, 45], [44, 46], [48, 46], [52, 43], [36, 43]];
  for (const [k, [x, y]] of spots.entries())
    await page.evaluate(
      ([id, x, y, s]) => window.dgmEditor!.edit({ op: "placeEntity", params: { id, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: s, CurrentStrength: s } } } } as never, "Place water source"),
      [ID(k), x, y, k % 2 ? 0.37 : 1] as [string, number, number, number],
    );
  await page.evaluate(() => window.dgmEditor!.idle());
}

const boxes = (page: Page, sel: string) =>
  page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })), sel);
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [width, height] of [
  [1280, 800],
  [1920, 1080],
] as const)
  test(`the sources' labels never overlap one another or an open panel at ${width}×${height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => localStorage.setItem("dgm.markers", "on"));
    await page.setViewportSize({ width, height });
    await openEditor(page, "s=4&z=96&d=n&t=riverValley");
    await placeCrowd(page);
    await openLegend(page);
    await expect.poll(async () => (await boxes(page, ".source-marker")).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(600);
    const labels = await boxes(page, ".source-marker");
    for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) expect(overlap(labels[a], labels[b]), `labels ${a} and ${b}`).toBe(false);
    const panels = await boxes(page, ".legend-panel, .legend-row, .show-bar, .view3d-corner > *, .water-bar, .tool-dock > *, .objects-dock > *, .minimap");
    for (const [i, l] of labels.entries()) for (const p of panels) expect(overlap(l, p), `label ${i} over a panel`).toBe(false);
  });

test("the open Legend hangs centred under its toggle and keeps Ground height's Low and High", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await page.getByRole("checkbox", { name: "Heights" }).click();
  const legend = await openLegend(page);
  const toggle = (await page.locator(".legend-row").boundingBox())!;
  const box = (await legend.boundingBox())!;
  // (centred under it, so "Legend" reads as its title: Kyler, 2026-10-04)
  expect(Math.abs(box.x + box.width / 2 - (toggle.x + toggle.width / 2))).toBeLessThanOrEqual(0.5);
  const ends = legend.locator(".height-ends");
  await expect(ends).toHaveText(/Low \d+\s*High \d+/);
  const lo = await page.evaluate(() => {
    let a = 255;
    let b = 0;
    for (const h of window.dgm3d!.renderer.mapState()!.heights) {
      a = Math.min(a, h);
      b = Math.max(b, h);
    }
    return [a, b];
  });
  await expect(ends).toHaveText(`Low ${lo[0]}High ${lo[1]}`);
});

test("the minimap shows a held Drought day's water, and the map's own again after it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 60_000 }).toBe(true);
  /** The minimap's picture as a string of its pixels, and how many are water-blue. */
  const picture = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>(".minimap canvas")!;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let blue = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 2] > d[i] + 25 && d[i + 2] > d[i + 1]) blue++;
        sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000000007;
      }
      return { blue, sum };
    });
  await page.waitForTimeout(2500);
  const before = await picture();
  expect(before.blue).toBeGreaterThan(50);
  const bar = page.locator(".water-bar");
  await bar.getByRole("button", { name: "Drought" }).click();
  const day = bar.locator(".day-label");
  await expect(day).toHaveText(/^Day \d+$/);
  await expect(day).not.toHaveClass(/counting/, { timeout: 120_000 });
  await expect.poll(async () => (await picture()).blue, { timeout: 15_000 }).toBeLessThan(before.blue / 2);
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("button", { name: "Drought" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await picture()).sum, { timeout: 15_000 }).toBe(before.sum);
});

test("at 1280×800 a legend taller than its room scrolls inside itself, keeping Low and High, and its last row is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // (Heights' key, Badwater's caption and Markers' lines: the fullest legend, in the room the first run's hints leave)
  await page.getByRole("checkbox", { name: "Heights" }).click();
  await page.getByRole("checkbox", { name: "Markers" }).click();
  await page.getByRole("checkbox", { name: "Badwater" }).click();
  const legend = await openLegend(page);
  await expect(legend.locator(".height-ends")).toHaveText(/Low \d+\s*High \d+/);
  const state = () =>
    legend.evaluate((el) => {
      const p = el.getBoundingClientRect();
      const last = [...el.querySelectorAll(".pick-line")].pop()!.getBoundingClientRect();
      return { overflow: getComputedStyle(el).overflowY, over: el.scrollHeight > el.clientHeight + 1, lastBottom: last.bottom, panelBottom: p.bottom };
    });
  const before = await state();
  expect(before.overflow).toBe("auto");
  // (the panel stays clear of what is under it; whatever does not fit is reached by scrolling it)
  const dock = (await page.locator(".tool-dock > *").first().boundingBox())!;
  expect((await legend.boundingBox())!.y + (await legend.boundingBox())!.height).toBeLessThanOrEqual(dock.y + 0.5);
  await legend.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const after = await state();
  expect(after.lastBottom).toBeLessThanOrEqual(after.panelBottom + 0.5);
  await expect(legend.locator(".pick-line").last()).toBeVisible();
});
