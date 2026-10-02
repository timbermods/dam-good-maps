// Edits never replay onto new land (PLAN §20, D336). Kyler's map, seed 2828713082: made at 128², the
// whole map set to one level, then generated again at 256² "keeping my edits"; the edit's tiles
// landed on the 256² map's first 128 rows and columns, a flat, bare corner. Now every Generate makes
// a new map: its edits are never applied to the new one. On the one-window page (D330) Generate over a
// map with edits asks first, and the edited map is closed only when the player says so ("Close it");
// Your maps (D234) will keep it one step away.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("Generate on an edited map asks first, then makes a new map that no edit touches (D336)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();

  // one edit: a Lower stroke
  const at: [number, number] = [70, 12];
  const ground = await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at);
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
  const edited = await page.evaluate(() => window.dgmEditor!.info());
  expect(edited.edits).toBe(1);

  // Generate over the edited map asks first; Cancel keeps it as it is
  const generate = page.getByRole("form", { name: "Settings" }).locator('button[type="submit"]');
  await page.locator("#size").selectOption("medium");
  await generate.click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("closes River Valley and its 1 edit");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  expect((await page.evaluate(() => window.dgmEditor!.info())).edits).toBe(1);
  expect(await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at)).toBeLessThan(ground);

  // asked again and accepted: a new map, at the other size (Kyler's case)
  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  await generate.click();
  await ask.getByRole("button", { name: "Close it" }).click();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
  await page.waitForFunction(() => window.dgmEditor?.info().W === 128 && window.dgm3d?.renderer.mapState()?.W === 128, null, { timeout: 120_000 });
  await expect(generate).toBeEnabled({ timeout: 120_000 });

  // the new map is exactly the generator's own for its settings: no edit applied to it
  const shown = (await page.evaluate(() => window.dgm!.current!()))!;
  expect(shown.link).toMatch(/z=128/);
  const own = await page.evaluate((f) => window.dgm!.generate(f), shown.link.slice(shown.link.indexOf("#") + 1));
  expect(shown.sha256).toBe(own.sha256);
  const now = await page.evaluate(() => window.dgmEditor!.info());
  expect(now.edits).toBe(0);
  expect(now.history.filter((h) => h.applied)).toEqual([]);
  expect(errors).toEqual([]);
});
