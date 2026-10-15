// Erode (ROADMAP "Terrain above terrain" 3, D281), through the page: its button in the forces group (Shift+8), its row
// Power, Size (Auto), the Floor and Try another; a click wears the rock there, kept as one undo step exactly as
// shown, and one Ctrl+Z takes all of it back.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** The map as the worker holds it: its surface, and the tiles that have rock over a hollow. */
const land = (page: Page) =>
  page.evaluate(async () => {
    const t = await window.dgmEditor!.worker.terrainNow();
    return { heights: Array.from(t.heights), hollow: Array.from(t.terrain.columns) };
  });

async function settled(page: Page) {
  await expect.poll(() => status(page), { timeout: 60_000 }).toBeNull();
  await idle(page);
}

/** Ground the map (not a bar over it) takes the clicks at, with room round it: the highest, as the other forces' tests pick. */
async function high(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let best: [number, number] = [m.W >> 1, m.H >> 1];
    let top = -1;
    for (let y = 18; y < m.H - 18; y += 2)
      for (let x = 18; x < m.W - 18; x += 2) {
        const h = m.heights[y * m.W + x];
        if (h <= top || m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || !onMap(x - 12, y) || !onMap(x + 12, y) || !onMap(x, y - 12) || !onMap(x, y + 12)) continue;
        top = h;
        best = [x, y];
      }
    return best;
  });
}

test("Erode's row is Power, Size (Auto), the Floor and Try another, Try another ready once one is kept", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await expect(page.getByRole("group", { name: "Forces" }).getByRole("button", { name: "Erode (Shift+8)" })).toBeVisible();
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  await expect(row).toBeVisible();
  expect(await row.getByRole("slider").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Power", "Size", "Floor"]);
  await expect(row.getByRole("button", { name: "Size follows Power" })).toBeVisible();
  // (it never wears a source's tile: no Sources)
  await expect(row.getByRole("group", { name: "Sources" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "More" })).toHaveCount(0);
  const again = row.getByRole("button", { name: "Try another" });
  await expect(again).toBeDisabled();
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await settled(page);
  await expect(again).toBeEnabled();
});

test("a click wears the land there, kept as one step; one Ctrl+Z restores the map exactly", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  // a strong one, so there is something to see wherever the click lands
  await row.getByRole("slider", { name: "Power" }).focus();
  await page.keyboard.press("End");
  const before = await land(page);
  const n0 = (await labels(page)).length;
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  // (the showing's steps, as the page sees them: it plays out over many, never all at once)
  await page.evaluate(() => {
    const seen = new Set<number>();
    (window as unknown as { dgmSteps: Set<number> }).dgmSteps = seen;
    const id = setInterval(() => {
      const f = window.dgmEditor!.force();
      if (f) seen.add(f.steps);
      else if (seen.size) clearInterval(id);
    }, 20);
  });
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  expect(await page.evaluate(() => (window as unknown as { dgmSteps: Set<number> }).dgmSteps.size), "more than one step shown during the run").toBeGreaterThan(3);
  const worn = await land(page);
  expect(worn.hollow.length > 0 || worn.heights.some((h, i) => h !== before.heights[i]), "the map changed").toBe(true);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Erode");
  // one undo step takes all of it back
  await page.keyboard.press("Control+z");
  await idle(page);
  expect((await labels(page)).length).toBe(n0);
  expect(await land(page)).toEqual(before);
});

test("Try another replaces the first try's hollows on screen: the view holds the worker's tiles, none left from the first", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.keyboard.press("Shift+Digit8");
  const row = page.getByRole("group", { name: "Erode options" });
  await row.getByRole("slider", { name: "Power" }).focus();
  await page.keyboard.press("End");
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  const shown = () => page.evaluate(() => Array.from((window.dgm3d!.renderer as unknown as { map: { source: { columns: Map<number, unknown> } } }).map.source.columns.keys()).sort((a, b) => a - b));
  const first = await shown();
  expect(first.length).toBeGreaterThan(0);
  // (the hollows on screen as the second try begins: the series' start, never the first try's)
  await page.evaluate(() => {
    const w = window as unknown as { dgmFirst: number | null };
    w.dgmFirst = null;
    const id = setInterval(() => {
      if (window.dgmEditor!.force()) {
        w.dgmFirst = (window.dgm3d!.renderer as unknown as { map: { source: { columns: Map<number, unknown> } } }).map.source.columns.size;
        clearInterval(id);
      }
    }, 2);
  });
  await row.getByRole("button", { name: "Try another" }).click();
  await expect.poll(() => status(page)).not.toBeNull();
  await settled(page);
  expect(await page.evaluate(() => (window as unknown as { dgmFirst: number | null }).dgmFirst), "the first try's hollows are gone as the second begins").toBeLessThan(first.length);
  expect((await labels(page)).at(-1)).toBe("Try another");
  const worker = (await land(page)).hollow.sort((a, b) => a - b);
  expect(await shown()).toEqual(worker);
});
