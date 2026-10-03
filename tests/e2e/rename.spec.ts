// The map's name is renamed in place, in the header's title (Kyler, 2026-10-03; D443): a click on the title shows a
// field at exactly the same place and size; Enter or leaving saves through the core, with no undo step; Esc puts the
// old name back; a blank name is refused in the core's own words, said in the title's second line, and the field
// stays. The renamed map downloads as dgm-<name>.timber.

import { expect, test, type Locator } from "@playwright/test";
import { expectReady, openEditor, openFileMenu } from "./open";

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

  // the title is a button that says "Rename"; the second line reads the seed and size
  const button = h1.locator("button.title-button");
  await expect(button).toHaveText("River Valley");
  await expect(button).toHaveAttribute("title", "Rename");
  await expect(facts).toHaveText("Seed 4242 · 96×96");
  await expectReady(page);
  const was = await info();
  const steps = was.history.length;

  // a click shows the field at the same place and size (position and size within 1px), the name selected
  const before = { title: await box(title), h1: await box(h1), name: await box(button) };
  await button.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("River Valley");
  same(await box(title), before.title, "the title's box while editing");
  same(await box(h1), before.h1, "the heading's box while editing");
  same(await box(field), before.name, "the name's box while editing");

  // Esc puts the old name back, whatever was typed
  await field.fill("Nowhere Bend");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(button).toHaveText("River Valley");
  expect(await stored()).toBe("River Valley");
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
