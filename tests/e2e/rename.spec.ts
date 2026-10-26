// The map's name is renamed in place, in the header's title (Kyler, 2026-10-03; D443): a click on the title shows a
// field at exactly the same place and size; Enter or leaving saves through the core, with no undo step; Esc puts the
// old name back; a blank name is refused in the core's own words, said in the title's second line, and the field
// stays. The renamed map downloads as dgm-<name>.timber.

import { expect, test, type Locator } from "@playwright/test";
import { expectReady, openEditor, openFileMenu, openYourMaps } from "./open";

test("the title renames the map in place: Enter saves with no undo step, a blank name is refused, Esc cancels, nothing moves", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  const title = page.locator(".editor-title");
  const h1 = title.locator("h1");
  const facts = title.locator(".muted");
  const field = page.getByLabel("Map name");
  const info = () => page.evaluate(() => window.dgmEditor!.info());
  /** The name the core stores (D443): the worker's session, where saves take it from. */
  const stored = () => page.evaluate(async () => (await window.dgmEditor!.worker.sessionInfo())?.name);
  const box = async (loc: Locator) => (await loc.boundingBox())!;
  const same = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, what: string) => {
    for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(a[k] - b[k]), `${what}: ${k} ${a[k]} against ${b[k]}`).toBeLessThanOrEqual(1);
  };

  // the title is a button that says "Rename and describe the map" (D148: the description is written there too); the second line reads the seed and size
  const button = h1.locator("button.title-button");
  // (a generated map is named by its standout since M9b, D278: the name the core gave it)
  const name = (await info()).name;
  await expect(button).toHaveText(name);
  await expect(button).toHaveAttribute("title", "Rename and describe the map");
  await expect(facts).toHaveText("Seed 4242 · 96×96");
  await expectReady(page);
  const was = await info();
  const steps = was.history.length;

  // a click shows the field at the same place and size (position and size within 1px), the name selected
  const before = { title: await box(title), h1: await box(h1), name: await box(button) };
  await button.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(name);
  same(await box(title), before.title, "the title's box while editing");
  same(await box(h1), before.h1, "the heading's box while editing");
  same(await box(field), before.name, "the name's box while editing");

  // Esc puts the old name back, whatever was typed
  await field.fill("Nowhere Bend");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(button).toHaveText(name);
  expect(await stored()).toBe(name);
  same(await box(title), before.title, "the title's box after Esc");

  // Enter saves through the core: the heading shows it, and it is no undo step
  await button.click();
  await field.fill("Beaver Bend");
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(h1).toHaveText("Beaver Bend");
  await expect.poll(stored).toBe("Beaver Bend");
  expect((await info()).history.length).toBe(steps);
  expect((await info()).edits).toBe(was.edits);
  await expect(page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeDisabled();
  await expect(facts).toHaveText("Seed 4242 · 96×96");

  // the renamed map downloads as dgm-<name>.timber
  await expectReady(page);
  const download = page.waitForEvent("download");
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Download .timber" }).click();
  expect((await download).suggestedFilename()).toBe("dgm-beaver-bend.timber");

  // a blank name is refused in the core's words, in the second line, and the field stays open for another try
  await page.locator(".editor-title h1 button.title-button").click();
  await field.fill("   ");
  await page.keyboard.press("Enter");
  await expect(facts).toContainText("A map needs a name");
  await expect(facts).toHaveClass(/title-problem/);
  await expect(facts).toHaveAttribute("role", "alert");
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  expect(await stored()).toBe("Beaver Bend");
  // Esc leaves it: the name stands as it was, and the second line reads the seed and size again
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(h1).toHaveText("Beaver Bend");
  await expect(facts).toHaveText("Seed 4242 · 96×96");
  expect((await info()).history.length).toBe(steps);
  expect(errors).toEqual([]);
});

test("keys typed straight after the click on the title all reach the field", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await page.locator(".editor-title h1 button.title-button").click();
  await page.keyboard.type("Beaver Bend");
  await expect(page.getByLabel("Map name")).toHaveValue("Beaver Bend");
  await page.keyboard.press("Escape");
});

test("Rename in Your maps acts on the open map: its tile is selected by a click, and the title and the tile both take the new name", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[40, 40, 44]], level: 15 } } as never, "Raise a tile"));
  await page.waitForFunction((v) => window.dgm!.kept!(v), (await page.evaluate(() => window.dgmEditor!.info())).version, { timeout: 60_000, polling: 200 });

  const yours = await openYourMaps(page);
  const tile = yours.locator(".ym-tile[aria-current]");
  const rename = yours.getByRole("button", { name: "Rename", exact: true });
  await expect(rename).toBeDisabled();
  // a click on the map open now has nothing to open: it selects, and Rename reaches it
  await tile.click();
  await expect(rename).toBeEnabled();
  await rename.click();
  const field = page.getByLabel("Map name");
  await expect(field).toBeFocused();
  // (the field has the name selected: typing replaces it)
  await page.keyboard.type("Otter Bend");
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(page.locator(".editor-title h1")).toHaveText("Otter Bend");
  await expect(yours.locator(".ym-tile[aria-current] .ym-name")).toHaveText("Otter Bend");
  await expect.poll(() => page.evaluate(async () => (await window.dgmEditor!.worker.sessionInfo())?.name)).toBe("Otter Bend");

test("the description is written under the name where it is renamed: saved through the core with its own undo step, refused in the core's words, cleared by emptying it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const info = () => page.evaluate(() => window.dgmEditor!.info());
  const desc = page.getByLabel("Map description");
  const open = () => page.locator(".editor-title h1 button.title-button").click();

  // (a map with none written: the field is empty, its placeholder plain)
  await open();
  await expect(desc).toHaveValue("");
  await expect(desc).toHaveAttribute("placeholder", "Describe the map");
  // (moving from the name to the description keeps both open: nothing is saved until focus leaves the title)
  await desc.click();
  await expect(page.getByLabel("Map name")).toHaveCount(1);
  await desc.fill("A quiet valley for a first colony.");
  await desc.press("Enter");
  await expect(desc).toHaveCount(0);
  await expect.poll(async () => (await info()).descriptionWritten).toBe(true);
  expect((await info()).description).toBe("A quiet valley for a first colony.");
  expect((await info()).history.map((h) => h.label)).toContain("Write the description");

  // (reopened, the field shows what was written; one too long is refused in the core's words and the field stays)
  await open();
  await expect(desc).toHaveValue("A quiet valley for a first colony.");
  await desc.fill("x".repeat(601));
  await desc.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "A description holds up to 600 characters; this one has 601" })).toBeVisible();
  await expect(desc).toHaveCount(1);
  expect((await info()).description).toBe("A quiet valley for a first colony.");

  // (emptied, the player's text is taken away: the generated one is used again)
  await desc.fill("");
  await desc.press("Enter");
  await expect(desc).toHaveCount(0);
  await expect.poll(async () => (await info()).descriptionWritten).toBe(false);

  // (Esc puts it back as it was)
  await open();
  await desc.fill("Not kept");
  await desc.press("Escape");
  await expect(desc).toHaveCount(0);
  expect((await info()).descriptionWritten).toBe(false);
});

test("a description the core refuses is kept in its card with the reason when focus leaves the title; the card hangs under the header bar and covers no button", async ({ page }) => {
  test.setTimeout(300_000);
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const info = () => page.evaluate(() => window.dgmEditor!.info());
  const desc = page.getByLabel("Map description");
  for (const [w, h] of [[1280, 800], [1366, 768], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator(".editor-title h1 button.title-button").click();
    // (the card clear of the bar: it starts below its bottom edge, so no header button is under it)
    const bar = (await page.locator("header.editor-bar").boundingBox())!;
    const card = (await page.locator(".editor-title .title-desc").boundingBox())!;
    expect(card.y, `${w}×${h}: the card starts under the bar`).toBeGreaterThanOrEqual(bar.y + bar.height);
    // (a refused description is never lost: leaving the title keeps the card, its text and the core's reason)
    await desc.fill("x".repeat(601));
    await page.mouse.click(w / 2, h / 2);
    await expect(page.getByRole("alert").filter({ hasText: "A description holds up to 600 characters; this one has 601" })).toBeVisible();
    await expect(desc).toHaveValue("x".repeat(601));
    expect((await info()).descriptionWritten).toBe(false);
    // (a click on the card's own padding keeps it open, and a click on the map after it still saves or, refused, keeps it)
    await page.locator(".editor-title .title-desc").click({ position: { x: 2, y: 2 } });
    await page.mouse.click(w / 2, h / 2);
    await expect(page.getByRole("alert").filter({ hasText: "this one has 601" })).toBeVisible();
    await expect(desc).toHaveValue("x".repeat(601));
    // (Esc from inside it puts everything back)
    await desc.focus();
    await desc.press("Escape");
    await expect(desc).toHaveCount(0);
  }
});

test("a click on the card's padding then on the map saves the description and closes the card", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const desc = page.getByLabel("Map description");
  await page.locator(".editor-title h1 button.title-button").click();
  await desc.fill("A quiet valley.");
  await page.locator(".editor-title .title-desc").click({ position: { x: 2, y: 2 } });
  await expect(desc).toHaveCount(1);
  await page.mouse.click(700, 450);
  await expect(desc).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.info())).description).toBe("A quiet valley.");
});
