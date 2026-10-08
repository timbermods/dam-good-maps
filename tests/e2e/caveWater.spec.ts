// A map with caves or overhangs, through the page (3D Foundations, stage 6; D120, D280): after an edit its
// water settles in the background, the dot saying so, and shows when done, the caves' water with it; the
// layer is "Caves and overhangs"; and what has no rule for water in caves yet is refused with its one line.
// The map is T3 of the probe's test maps (tools/terrain3d-maps.ts), built here: never an official map's bytes.

import { expect, test, type Page } from "@playwright/test";
import { readTimber } from "../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../src/core/format/world";
import { CAVE_REFUSALS } from "../../src/core/sim/stackWater";
import { build, t3CaveWater } from "../../tools/terrain3d-maps";
import { openEditor, waitForEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const depthAt = (page: Page, x: number, y: number) =>
  page.evaluate(([a, b]) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return m.surface.depth[b * m.W + a] || 0;
  }, [x, y] as [number, number]);

test("a map with caves: an edit's water settles in the background and shows when done, and Drought, Badtide, Fill and Remove unfed water are refused with their lines", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const bytes = build(t3CaveWater()).bytes;
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "T3 caves.timber", mimeType: "application/zip", buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  expect(await page.evaluate(() => window.dgmEditor!.info().notices)).toEqual(["This map has caves or overhangs. The tools leave them as they are."]);

  // the layer: its toggle and its words (the page shows the toggle once an overlay has been on)
  await page.getByRole("checkbox", { name: "Badwater" }).click();
  const layer = page.getByRole("checkbox", { name: "Caves and overhangs" });
  await expect(layer).toBeVisible();
  await layer.click();
  await expect(page.getByText("Violet tiles: caves or overhangs, which the tools leave as they are")).toBeVisible();
  await layer.click();

  // the map's checks have run once (their settle is the opened map's own)
  const dot = page.getByRole("button", { name: /^Checks: / });
  await expect(dot).not.toHaveAccessibleName(/Settling|Checking/, { timeout: 120_000 });
  // every state of the dot from here on
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { dotSeen: string[] }).dotSeen = seen;
    const el = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Checks: "))!;
    const note = () => seen.push(el.getAttribute("aria-label") ?? "");
    new MutationObserver(note).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
  });

  // an edit: a pit beside the channel that basin B spills through (y 24–25 at level 6); dry until the settle
  expect(await depthAt(page, 57, 26)).toBe(0);
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "lower", cells: [[26, 56, 58]], amount: 2 } }, "Lower"));
  await idle(page);
  expect(await page.evaluate(() => window.dgmEditor!.info().waterPending)).toBe(true);
  // the settle runs in the background, the dot saying so, and then the water is there
  await expect.poll(() => depthAt(page, 57, 26), { timeout: 60_000 }).toBeGreaterThan(0.1);
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().waterPending), { timeout: 60_000 }).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { dotSeen: string[] }).dotSeen.some((s) => /Settling/.test(s)))).toBe(true);
  // the file it exports holds the caves' water, simulated: wet columns under the plateau's top
  const file = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.exportTimber(true)).bytes));
  const world = readTimber(Uint8Array.from(file)).world;
  const stored = storedWater(world.singletons, 64, 64);
  const top = surfaceOf(world);
  let cave = 0;
  for (let k = 0; k < stored.tile.length; k++) if (stored.floor[k] < top[stored.tile[k]] && stored.depth[k] > 0.05) cave++;
  expect(cave).toBeGreaterThan(50);

  // refused, each with its line: Fill and Remove unfed water as operations (the page shows the reason)
  const i = 30 * 64 + 5;
  await page.evaluate((t) => window.dgmEditor!.edit({ op: "fillHollow", params: { at: [5, 30], level: 9, lake: { tiles: [t], floor: [8], depth: [1], contamination: [0] } } }, "Fill"), i);
  await expect(page.getByText(CAVE_REFUSALS.fill)).toBeVisible();
  await page.evaluate((t) => window.dgmEditor!.edit({ op: "removeUnfedWater", params: { tiles: [t], pools: 1 } }, "Remove unfed water"), i);
  await expect(page.getByText(CAVE_REFUSALS.removeUnfed)).toBeVisible();
  // Drought and Badtide: the worker refuses with the line, and the map keeps its own water (the page has no
  // place for the line yet: docs/progress/3d-foundations.md, "What the page needs")
  for (const hazard of ["drought", "badtide"] as const) {
    const said = await page.evaluate((h) => window.dgmEditor!.worker.showWeatherDay(h, null).then(() => "", (e: unknown) => String((e as Error).message ?? e)), hazard);
    expect(said).toContain(CAVE_REFUSALS.weather);
  }
  const before = await depthAt(page, 57, 26);
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await expect(page.locator(".day-label")).not.toHaveClass(/counting/);
  expect(await depthAt(page, 57, 26)).toBe(before);
  await page.getByRole("button", { name: "Drought", exact: true }).click();
});
