// Edits never replay onto new land (PLAN §20, D336). Kyler's map, seed 2828713082: made at 128², the
// whole map set to one level, then generated again at 256² "keeping my edits"; the edit's tiles
// landed on the 256² map's first 128 rows and columns, a flat, bare corner. Now every Generate makes
// a new map: the edited map is never changed, its edits are never applied to the new one, and it
// stays one step away (Back to editing).

import { expect, test } from "@playwright/test";

test("Generate on an edited map makes a new map; the edited one is untouched and one step away (D336)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=4244&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
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

  // back to the settings: the button is just Generate; another size (Kyler's case)
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Back to settings" }).click();
  await expect(page.getByText("Generate makes a new map. Yours stays saved, with its edits.")).toBeVisible({ timeout: 60_000 });
  await page.locator("#size").selectOption("medium");
  await page.getByRole("button", { name: /^Generate/ }).click();
  await expect(page.getByText(/New map from these settings/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: /^Generate/ })).toBeEnabled({ timeout: 120_000 });

  // the new map is exactly the generator's own for its settings: no edit applied to it
  const shown = (await page.evaluate(() => window.dgm!.current!()))!;
  expect(shown.link).toMatch(/z=128/);
  const own = await page.evaluate((f) => window.dgm!.generate(f), shown.link.slice(shown.link.indexOf("#") + 1));
  expect(shown.sha256).toBe(own.sha256);

  // the edited map is one step away, exactly as it was
  const banner = page.getByRole("status").filter({ hasText: /You're editing/ });
  await banner.getByRole("button", { name: "Back to editing" }).click();
  await page.waitForFunction(() => window.dgmEditor?.info().W === 96 && window.dgm3d?.renderer.mapState()?.W === 96, null, { timeout: 60_000 });
  const back = await page.evaluate(() => window.dgmEditor!.info());
  expect(back.edits).toBe(1);
  expect(back.spec).toEqual(edited.spec);
  expect(back.history.map((h) => h.label)).toEqual(edited.history.map((h) => h.label));
  expect(await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at)).toBeLessThan(ground);
  expect(errors).toEqual([]);
});
