// Edits and a change of map size (fix/size-edits). Kyler's map, seed 2828713082: made at 128², the
// whole map set to one level, then generated again at 256² "keeping my edits". The edit's tiles,
// recorded on the 128² map, landed on the 256² map's first 128 rows and columns (a flat, bare
// corner), and Undo brought the 128² map back into a view built for 256² (a strip of land holding two
// copies of the same lake). Edits are now kept only at the same size (decisions-pending #94), and an
// undo or redo across a change of size builds the view again for the map it brings back.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());

async function refine(page: Page, hash: string) {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
}

/** The editor shows the worker's map, at its size: the view's size and ground are the map's. (Polled:
 *  the editor is opened again for a map of another size, a moment after the key.) */
async function viewMatchesMap(page: Page, W: number) {
  await expect
    .poll(
      () =>
        page
          .evaluate(async () => {
            const ed = window.dgmEditor;
            const m = window.dgm3d?.renderer.mapState();
            if (!ed || !m) return null;
            await ed.idle();
            const now = await ed.worker.terrainNow();
            let same = ed.info().W === m.W && m.heights.length === now.heights.length;
            for (let i = 0; same && i < m.heights.length; i++) same = m.heights[i] === now.heights[i];
            return { W: m.W, H: m.H, n: m.heights.length, same };
          })
          .catch(() => null),
      { timeout: 60_000 },
    )
    .toEqual({ W, H: W, n: W * W, same: true });
}

test("an edited map's edits stay with it when the size changes: a new size makes a new map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, "s=4244&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();

  // one edit: a Lower stroke
  const at: [number, number] = [70, 12];
  const ground = await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), at);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] - 3, at[1]] as const);
  const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] + 3, at[1]] as const);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.keyboard.press("Escape");
  expect((await info(page)).edits).toBe(1);

  // back to the settings: the same size keeps the edits; another size makes a new map
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Back to settings" }).click();
  await expect(page.getByRole("button", { name: "Generate, keeping my edits" })).toBeVisible({ timeout: 60_000 });
  await page.locator("#size").selectOption("medium");
  await expect(page.getByRole("button", { name: "Generate a new map" })).toBeVisible();
  await expect(page.getByText("Your edits stay on your 96×96 map. A new size makes a new map.")).toBeVisible();
  await page.getByRole("button", { name: "Generate a new map" }).click();
  await expect(page.getByText(/New map from these settings/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeEnabled({ timeout: 120_000 });
  // the edited map is still the one open, untouched, and saved
  const banner = page.getByRole("status").filter({ hasText: /You're editing/ });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Back to editing" }).click();
  await viewMatchesMap(page, 96);
  const i = await info(page);
  expect(i.edits).toBe(1);
  expect(i.spec!.size).toEqual({ x: 96, y: 96 });
  expect(await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at)).toBeLessThan(ground);
  expect(errors).toEqual([]);
});

test("undo and redo across a change of size show each map whole, at its own size", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, "s=5&z=96&d=n&t=riverValley");
  await viewMatchesMap(page, 96);
  const small = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  // the unedited map generated again at 128² behind the editor's back (what Claude's settings step,
  // or a replaced map brought back, does), so the page's view is built for 96²
  const g = await page.evaluate(async () => (await window.dgmEditor!.worker.apply({ op: "specPatch", params: { patch: { size: { x: 128, y: 128 } } } })).ok);
  expect(g).toBe(true);
  // undo: the 96² map (the page's own size)
  await page.keyboard.press("Control+z");
  await viewMatchesMap(page, 96);
  // redo: the 128² map, into a view built for 96²
  await page.keyboard.press("Control+y");
  await viewMatchesMap(page, 128);
  expect((await info(page)).history.map((h) => h.applied)).toEqual([true]);
  // undo again: the 96² map, into a view built for 128², exactly as it was
  await page.keyboard.press("Control+z");
  await viewMatchesMap(page, 96);
  expect(await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights))).toEqual(small);
  expect((await info(page)).history.map((h) => h.applied)).toEqual([false]);
  expect(errors).toEqual([]);
});
