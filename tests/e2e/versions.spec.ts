// Versions (showcase: fearless iteration): History's Keep this version keeps the map as it stood at a step in Your maps
// ("<map name> — <step label>"), Branch from here keeps it and opens the copy with its History through that step, Your maps
// says each version's parent and step, and Compare flips the land between two maps at the same camera while a key is held.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, openYourMaps } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
/** The land the renderer draws now, as a sum over its tiles (two maps that differ somewhere differ here). */
const drawn = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.mapState()!.heights.reduce((a, b) => a + b, 0));
const edit = (page: Page, cells: [number, number, number][], label: string) =>
  page.evaluate(([c, l]) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: c, level: 15 } } as never, l as string), [cells, label] as const);
const history = (page: Page) => page.getByRole("button", { name: "History", exact: true }).first();

test("Keep this version and Branch from here, the parent in Your maps, and Compare flips the land while the key is held", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;

  // two steps on the map
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await edit(page, [[60, 60, 64]], "Raise a wall");
  await idle(page);
  const landTwo = await drawn(page);
  expect((await info(page)).history.map((h) => h.label)).toEqual(["Raise a tile", "Raise a wall"]);

  // Keep this version on the first step: a note, and the map stays where it is
  await history(page).click();
  const panel = page.getByRole("complementary", { name: "History" });
  const first = panel.locator(".hist-item").nth(1);
  await first.hover();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible();
  expect((await info(page)).history.length).toBe(2);
  expect(await drawn(page)).toBe(landTwo);

  // Your maps lists it, with its parent and step small beside the size
  await history(page).click();
  const yours = await openYourMaps(page);
  const kept = yours.locator("li", { hasText: `${name} — Raise a tile` });
  await expect(kept).toHaveCount(1);
  await expect(kept.locator(".ym-from")).toHaveText(`${name} · step 1`);

  // Compare with it (the right-click menu): a note, the key flips to its land and lets go back
  await kept.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Compare with the open map" }).click();
  const note = page.locator(".compare-note");
  await expect(note).toContainText(`Comparing with ${name} — Raise a tile`);
  await expect(page.locator(".compare-veil")).toHaveCount(0);
  const view = await page.evaluate(() => window.dgm3d!.renderer.getView());
  await page.keyboard.down("b");
  await expect(page.locator(".compare-veil")).toContainText(`${name} — Raise a tile`);
  const landOne = await drawn(page);
  expect(landOne).not.toBe(landTwo);
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView())).toEqual(view);
  await page.keyboard.up("b");
  await expect(page.locator(".compare-veil")).toHaveCount(0);
  expect(await drawn(page)).toBe(landTwo);
  // the note's own button holds it too, and Stop puts the note away
  const flip = note.getByRole("button", { name: /^Comparing with/ });
  const box = (await flip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator(".compare-veil")).toHaveCount(1);
  expect(await drawn(page)).toBe(landOne);
  await page.mouse.up();
  await expect(page.locator(".compare-veil")).toHaveCount(0);
  await note.getByRole("button", { name: "Stop" }).click();
  await expect(note).toHaveCount(0);

  // Branch from here on the first step: the copy opens, its History through that step, the land as it stood
  await history(page).click();
  const row = panel.locator(".hist-item").nth(1);
  await row.hover();
  await row.getByRole("button", { name: "Branch from here" }).click();
  await expect.poll(async () => (await info(page)).name).toBe(`${name} — Raise a tile`);
  await idle(page);
  expect((await info(page)).history.map((h) => h.label)).toEqual(["Raise a tile"]);
  expect(await drawn(page)).toBe(landOne);

  // the original is still in Your maps beside its two versions
  const maps = await openYourMaps(page);
  await expect(maps.locator("li")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("an undo while the other version is held ends the flip: the open map comes back as the undo left it, nothing mixed", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await edit(page, [[60, 60, 70]], "Raise a wall");
  await edit(page, [[20, 20, 36]], "Raise a ridge");
  await idle(page);
  const landThree = await drawn(page);
  // the land the map has after one undo, as the undo gives it
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await info(page)).history.filter((h) => h.applied).length).toBe(2);
  await idle(page);
  const landTwo = await drawn(page);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await info(page)).history.filter((h) => h.applied).length).toBe(3);
  await idle(page);
  expect(await drawn(page)).toBe(landThree);

  // keep the first step and compare with it
  await history(page).click();
  const panel = page.getByRole("complementary", { name: "History" });
  const first = panel.locator(".hist-item").nth(1);
  await first.hover();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible();
  await history(page).click();
  const yours = await openYourMaps(page);
  await yours.locator("li", { hasText: `${name} — Raise a tile` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Compare with the open map" }).click();
  await expect(page.locator(".compare-note")).toBeVisible();

  // B held, the other version on show; an undo arrives: the flip ends and the open map is the undo's, not the other's
  await page.keyboard.down("b");
  await expect(page.locator(".compare-veil")).toHaveCount(1);
  const landOne = await drawn(page);
  expect(landOne).not.toBe(landThree);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await info(page)).history.filter((h) => h.applied).length).toBe(2);
  await expect(page.locator(".compare-veil")).toHaveCount(0);
  await idle(page);
  await page.keyboard.up("b");
  await page.waitForTimeout(300);
  expect(await drawn(page)).toBe(landTwo);
  expect(await drawn(page)).not.toBe(landOne);
});

/** An open map with one step kept in Your maps and compared with (the note is up). */
async function comparing(page: Page): Promise<string> {
  const name = (await info(page)).name;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const first = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await first.hover();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible();
  await history(page).click();
  const yours = await openYourMaps(page);
  await yours.locator("li", { hasText: `${name} — Raise a tile` }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Compare with the open map" }).click();
  await expect(page.locator(".compare-note")).toBeVisible();
  return name;
}

test("holding B right after an edit holds the flip while the water settles, and a brush stroke's undo ends it", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await comparing(page);
  const veil = page.locator(".compare-veil");

  // an edit, and B at once: the water is still flowing in, and the other version stays on show
  await edit(page, [[60, 60, 70]], "Raise a wall");
  await page.keyboard.down("b");
  await expect(veil).toHaveCount(1);
  const other = await drawn(page);
  await page.waitForTimeout(1500);
  await expect(veil).toHaveCount(1);
  expect(await drawn(page)).toBe(other);
  await page.keyboard.up("b");
  await expect(veil).toHaveCount(0);
  await idle(page);
  const open = await drawn(page);
  expect(open).not.toBe(other);

  // a brush stroke, then B held and Ctrl+Z on it: the flip ends, the open map is the one before the stroke
  await page.keyboard.press("2");
  const a = await page.evaluate(() => window.dgmEditor!.tileToClient(30, 30));
  const b = await page.evaluate(() => window.dgmEditor!.tileToClient(34, 34));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  const stroked = await drawn(page);
  expect(stroked).not.toBe(open);
  await page.keyboard.down("b");
  await expect(veil).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(veil).toHaveCount(0);
  await page.keyboard.up("b");
  await idle(page);
  await page.waitForTimeout(300);
  expect(await drawn(page)).toBe(open);
});

test("B with no version chosen says how to choose one, and Your maps' Compare picks it", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  const hint = page.getByRole("status").filter({ hasText: "select a version in Your maps and press Compare" });

  // B held with nothing chosen: a note on how to choose a version, not silence
  await page.keyboard.down("b");
  await expect(hint).toBeVisible();
  await page.keyboard.up("b");

  // a kept version; Compare is on Your maps' heading row, greyed until one other version is selected
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const first = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await first.hover();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible();
  await history(page).click();
  const yours = await openYourMaps(page);
  const compare = yours.getByRole("button", { name: "Compare", exact: true });
  await expect(compare).toBeDisabled();
  await yours.locator("li", { hasText: `${name} — Raise a tile` }).click({ modifiers: ["Control"] });
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(page.locator(".compare-note")).toContainText(`Comparing with ${name} — Raise a tile`);
  // (the how-to note has done its work)
  await expect(hint).toHaveCount(0);
  await page.keyboard.down("b");
  await expect(page.locator(".compare-veil")).toHaveCount(1);
  await page.keyboard.up("b");
});

test("editing a kept version says so once, and its card in Your maps says it was edited since", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  const keptName = `${name} — Raise a tile`;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const first = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await first.hover();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${keptName}` })).toBeVisible();
  await history(page).click();

  // its card, as kept: no mention of an edit
  const yours = await openYourMaps(page);
  const card = yours.locator("li", { hasText: keptName });
  await expect(card.locator(".ym-from")).toHaveText(`${name} · step 1`);

  // opened: nothing yet; the first edit says the kept version itself is changing
  await card.click();
  await expect.poll(async () => (await info(page)).name).toBe(keptName);
  await idle(page);
  const told = page.getByRole("status").filter({ hasText: "Editing your kept version" });
  await expect(told).toHaveCount(0);
  await edit(page, [[60, 60, 64]], "Raise a wall");
  await expect(told).toBeVisible();

  // once: a second edit brings it back only if it was put away, and then not
  await told.getByRole("button", { name: "Dismiss" }).click();
  await expect(told).toHaveCount(0);
  await edit(page, [[20, 20, 36]], "Raise a ridge");
  await idle(page);
  await expect(told).toHaveCount(0);

  // the card says it was edited since, once the save has landed
  const again = await openYourMaps(page);
  await expect(again.locator("li", { hasText: keptName }).locator(".ym-from")).toHaveText(`Edited since step 1 · ${name}`, { timeout: 30_000 });
  await expect(again.locator("li", { hasText: keptName }).locator(".ym-from")).toHaveAttribute("title", `From ${name}, step 1, edited since`);

  // undone back to the steps it was kept with, it is not edited since
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await info(page)).history.filter((h) => h.applied).length).toBe(1);
  await expect(again.locator("li", { hasText: keptName }).locator(".ym-from")).toHaveText(`${name} · step 1`, { timeout: 30_000 });
});

test("Branch from here opens its copy for editing without the kept version's warning", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const row = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await row.hover();
  await row.getByRole("button", { name: "Branch from here" }).click();
  await expect.poll(async () => (await info(page)).name).toBe(`${name} — Raise a tile`);
  await idle(page);
  await edit(page, [[60, 60, 64]], "Raise a wall");
  await idle(page);
  await expect(page.getByRole("status").filter({ hasText: "Editing your kept version" })).toHaveCount(0);
});
