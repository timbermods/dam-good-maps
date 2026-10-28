// Edits never replay onto new land (PLAN §20, D336). Kyler's map, seed 2828713082: made at 128², the
// whole map set to one level, then generated again at 256² "keeping my edits"; the edit's tiles
// landed on the 256² map's first 128 rows and columns, a flat, bare corner. Now every Generate makes
// a new map: its edits are never applied to the new one. On the one-window page (D330) Generate replaces the
// open map without asking, edits or not; the replaced map stays in Your maps (D234) with its edits, and its row
// opens it again.

import { expect, test } from "@playwright/test";
import { centreOn, generateButton, openDrawer, openEditor, openFileMenu, openYourMaps, pick, topDown } from "./open";

test("Generate on an edited map makes a new map that no edit touches, and the edited map stays in Your maps (D336)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  // (a browser that has never had the first-keep note: the tests' stored state marks it shown)
  await page.evaluate(() => localStorage.removeItem("dgm.keptNote"));
  await topDown(page);

  // one edit: a Lower stroke
  const at: [number, number] = [70, 12];
  const ground = await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at);
  await page.getByRole("button", { name: "Lower brush (3)" }).click();
  await centreOn(page, at[0], at[1]);
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] - 3, at[1]] as const);
  const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] + 3, at[1]] as const);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  // the first edit keeps the map in this browser, and the page says so once, quietly
  await expect(page.getByRole("status").filter({ hasText: "Kept in Your maps, in this browser" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("dgm.keptNote"))).toBe("1");
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.keyboard.press("Escape");
  const edited = await page.evaluate(() => window.dgmEditor!.info());
  expect(edited.edits).toBe(1);

  // Generate over the edited map asks nothing: a new map, at the other size (Kyler's case)
  const drawer = await openDrawer(page);
  const generate = generateButton(page);
  await pick(drawer, "Size", "128");
  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  await generate.click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
  await page.waitForFunction(() => window.dgmEditor?.info().W === 128 && window.dgm3d?.renderer.mapState()?.W === 128, null, { timeout: 120_000 });
  // the page says where the replaced map went (never asking, never blocking)
  await expect(page.getByRole("status").filter({ hasText: `${edited.name} is in Your maps` })).toBeVisible();
  await expect(generate).toBeEnabled({ timeout: 120_000 });

  // the new map is exactly the generator's own for its settings: no edit applied to it
  const shown = (await page.evaluate(() => window.dgm!.current!()))!;
  expect(shown.link).toMatch(/z=128/);
  const own = await page.evaluate((f) => window.dgm!.generate(f), shown.link.slice(shown.link.indexOf("#") + 1));
  expect(shown.sha256).toBe(own.sha256);
  const now = await page.evaluate(() => window.dgmEditor!.info());
  expect(now.edits).toBe(0);
  expect(now.history.filter((h) => h.applied)).toEqual([]);

  // the edited map is in Your maps, edit and all, and its row brings it back; the new map, unedited, isn't (D330)
  const yours = await openYourMaps(page);
  await expect(yours.locator(".ym-tile")).toHaveCount(1, { timeout: 30_000 });
  await expect(yours.locator(".ym-tile[aria-current]")).toHaveCount(0);
  await yours.locator(".ym-tile").click();
  await page.waitForFunction(() => window.dgmEditor?.info().W === 96 && window.dgm3d?.renderer.mapState()?.W === 96, null, { timeout: 120_000 });
  const back = await page.evaluate(() => window.dgmEditor!.info());
  expect(back.edits).toBe(1);
  expect(back.spec).toEqual(edited.spec);
  expect(back.history.map((h) => h.label)).toEqual(edited.history.map((h) => h.label));
  expect(await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), at)).toBeLessThan(ground);
  expect(errors).toEqual([]);
});

test("the first-keep note shows once in a browser: a browser that has had it keeps the next map quietly", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dgm.keptNote", "1"));
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[40, 40, 44]], level: 15 } } as never, "Raise a tile"));
  await page.waitForFunction((v) => window.dgm!.kept!(v), (await page.evaluate(() => window.dgmEditor!.info())).version, { timeout: 60_000, polling: 200 });
  await expect(page.getByRole("status").filter({ hasText: "Kept in Your maps" })).toHaveCount(0);
});

test("Download project says the project was saved, as Download .timber does", async ({ page }) => {
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  const download = page.waitForEvent("download");
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Download project" }).click();
  const file = (await download).suggestedFilename();
  await expect(page.getByRole("status").filter({ hasText: `Saved ${file}` })).toBeVisible();
});

test("with storage writes failing, neither note claims the map is kept: not the first keep, and not the replaced map", async ({ page }) => {
  test.setTimeout(240_000);
  // (every write to the browser's storage refuses, as if it were full)
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
  // (a browser that has never had the first-keep note: the tests' stored state marks it shown)
  await page.evaluate(() => localStorage.removeItem("dgm.keptNote"));
  const claim = page.getByRole("status").filter({ hasText: /Kept in Your maps|is in Your maps/ });
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[40, 40, 44]], level: 15 } } as never, "Raise a tile"));
  await expect(page.getByRole("alert").filter({ hasText: /storage/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("alert").getByRole("button", { name: "Dismiss" }).click();
  await expect(claim).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("dgm.keptNote"))).toBeNull();

  // Generate asks first, as the map is not kept; closing it replaces the map, and nothing is said to be in Your maps
  const drawer = await openDrawer(page);
  await pick(drawer, "Size", "128");
  await generateButton(page).click();
  await page.getByRole("button", { name: "Close it" }).click();
  await page.waitForFunction(() => window.dgmEditor?.info().W === 128, null, { timeout: 120_000 });
  const alert = page.getByRole("alert").getByRole("button", { name: "Dismiss" });
  if (await alert.count()) await alert.click();
  await expect(claim).toHaveCount(0);
});
