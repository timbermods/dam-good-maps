// A map with caves or overhangs, through the page (3D Foundations, stage 6; D120, D280): after an edit its
// water flows live and the canonical settle follows in the background, the dot saying so, the caves' water with it; the
// layer is "Caves and overhangs"; Fill and Remove unfed water ask every column, a refusal showing the core's one line;
// and Drought and Badtide run on every column (#391).
// The map is T3 of the probe's test maps (tools/terrain3d-maps.ts), built here: never an official map's bytes.

import { expect, test, type Page } from "@playwright/test";
import { readTimber } from "../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../src/core/format/world";
import { build, t3CaveWater } from "../../tools/terrain3d-maps";
import { openEditor, waitForEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const depthAt = (page: Page, x: number, y: number) =>
  page.evaluate(([a, b]) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return m.surface.depth[b * m.W + a] || 0;
  }, [x, y] as [number, number]);

test("a map with caves: an edit's water settles in the background and shows when done, Fill and Remove unfed water answer on every column, and Drought and Badtide show their last days", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const bytes = build(t3CaveWater()).bytes;
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "T3 caves.timber", mimeType: "application/zip", buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  expect(await page.evaluate(() => window.dgmEditor!.info().notices)).toEqual(["This map has caves or overhangs. Brushes shape only their tops; the Block tool and Erode can change the rest."]);

  // the layer: its toggle, there from the start on a map with caves, and its words
  const layer = page.getByRole("checkbox", { name: "Caves and overhangs" });
  await expect(layer).toBeVisible();
  await layer.click();
  await expect(page.getByText("Caves or overhangs: the brushes shape only their tops")).toBeVisible();
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

  // an edit: a pit beside the channel that basin B spills through (y 24–25 at level 6), dry before it
  expect(await depthAt(page, 57, 26)).toBe(0);
  // (when the water the page shows first reaches the pit, and when the canonical settle is in place)
  await page.evaluate(() => {
    const w = window as unknown as { pitWet: number | null; pitSettled: number | null };
    w.pitWet = w.pitSettled = null;
    const r = window.dgm3d!.renderer;
    let pending = false;
    const id = setInterval(() => {
      const m = r.mapState()!;
      if (w.pitWet === null && (m.surface.depth[26 * m.W + 57] || 0) > 0.05) w.pitWet = performance.now();
      if (window.dgmEditor!.info().waterPending) pending = true;
      else if (pending && w.pitSettled === null) w.pitSettled = performance.now();
      if (w.pitWet !== null && w.pitSettled !== null) clearInterval(id);
    }, 20);
  });
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "lower", cells: [[26, 56, 58]], amount: 2 } }, "Lower"));
  await idle(page);
  // the water flows into it live, as on a plain map (D99, D197), and the canonical settle runs in the background,
  // the dot saying so, and replaces it
  await expect.poll(() => depthAt(page, 57, 26), { timeout: 60_000 }).toBeGreaterThan(0.1);
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().waterPending), { timeout: 60_000 }).toBe(false);
  const pit = await page.evaluate(() => window as unknown as { pitWet: number; pitSettled: number });
  expect(pit.pitWet, "the pit's water shows before the canonical settle is in place").toBeLessThan(pit.pitSettled);
  expect(await page.evaluate(() => (window as unknown as { dotSeen: string[] }).dotSeen.some((s) => /Settling/.test(s)))).toBe(true);
  // the file it exports holds the caves' water, simulated: wet columns under the plateau's top
  const file = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.exportTimber(true)).bytes));
  const world = readTimber(Uint8Array.from(file)).world;
  const stored = storedWater(world.singletons, 64, 64);
  const top = surfaceOf(world);
  let cave = 0;
  for (let k = 0; k < stored.tile.length; k++) if (stored.floor[k] < top[stored.tile[k]] && stored.depth[k] > 0.05) cave++;
  expect(cave).toBeGreaterThan(50);

  // Fill and Remove unfed water as operations, measured on every column: here a Fill that would leave the map and a
  // removal where no unfed water stands, each refused with the core's one line (the page shows the reason)
  const i = 30 * 64 + 5;
  await page.evaluate((t) => window.dgmEditor!.edit({ op: "fillHollow", params: { at: [5, 30], level: 9, lake: { tiles: [t], floor: [8], depth: [1], contamination: [0] } } }, "Fill"), i);
  await expect(page.getByText("at level 9 the water would spill off the map at (0, 30): the hollow doesn't hold it")).toBeVisible();
  await page.evaluate((t) => window.dgmEditor!.edit({ op: "removeUnfedWater", params: { tiles: [t], pools: 1 } }, "Remove unfed water"), i);
  await expect(page.getByText("no unfed water stands there")).toBeVisible();
  // Drought and Badtide run on every column (#391): each shows its last day and holds it; the pit's water drains in the
  // drought; clicking again brings the map's own water back
  const before = await depthAt(page, 57, 26);
  const day = page.locator(".day-label");
  for (const [name, last] of [["Drought", 9], ["Badtide", 8]] as const) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(day).toHaveText(`Day ${last}`);
    await expect(day).not.toHaveClass(/counting/, { timeout: 120_000 });
    if (name === "Drought") await expect.poll(() => depthAt(page, 57, 26), { timeout: 30_000 }).toBeLessThan(before);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => depthAt(page, 57, 26), { timeout: 30_000 }).toBe(before);
  }
});
