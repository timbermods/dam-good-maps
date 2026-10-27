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
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible({ timeout: 60_000 });
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
  // (Your maps already holds that name from the Keep above: the copy's is numbered)
  await expect.poll(async () => (await info(page)).name, { timeout: 30_000 }).toBe(`${name} — Raise a tile (2)`);
  await idle(page);
  expect((await info(page)).history.map((h) => h.label)).toEqual(["Raise a tile"]);
  expect(await drawn(page)).toBe(landOne);

  // the original is still in Your maps beside its two versions
  const maps = await openYourMaps(page);
  await expect(maps.locator("li")).toHaveCount(3);
  expect(errors).toEqual([]);
});

// Long names (a regression since 2026-10-24: the tiles were held to their columns, and a long name cut away the very words
// that tell a version from its parent): the tile of a kept version keeps its step whole, the name cut in the map's part, and
// the whole name in a tooltip.
test("Your maps' tile of a kept version of a long-named map keeps its step in view, at 1280×800 and at 1920×1080", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const header = page.locator("header.editor-bar");
  await header.locator(".editor-title .title-button").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("The Very Long Winding River Valley B");
  await page.keyboard.press("Enter");
  const name = "The Very Long Winding River Valley B";
  await expect(header.locator(".editor-title .title-button")).toHaveText(name);
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  // keep the map as it began, and after its step
  for (const [at, label] of [[0, "The generated map"], [1, "Raise a tile"]] as const) {
    await history(page).click();
    const panel = page.getByRole("complementary", { name: "History" });
    const row = panel.locator(".hist-item").nth(at);
    await row.hover();
    await row.getByRole("button", { name: "Keep this version" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — ${label}` })).toBeVisible({ timeout: 60_000 });
    await history(page).click();
  }
  const yours = await openYourMaps(page);
  for (const [w, h] of [[1920, 1080], [1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    for (const [label, steps] of [["The generated map", 0], ["Raise a tile", 1]] as const) {
      const full = `${name} — ${label}`;
      const tile = yours.locator("li", { hasText: full });
      await expect(tile, `${w}×${h}: ${full}`).toHaveCount(1);
      const seen = await tile.evaluate((li) => {
        const box = li.getBoundingClientRect();
        const el = (s: string) => li.querySelector<HTMLElement>(s)!;
        const nameEl = el(".ym-name");
        const tip = nameEl.getAttribute("title") ?? nameEl.getAttribute("data-tip-held");
        const inside = (e: HTMLElement) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
        };
        return {
          split: nameEl.classList.contains("split"),
          tip,
          tailStarts: el(".ym-name-tail").textContent!.slice(0, 1),
          tailInside: inside(el(".ym-name-tail")),
          tailWhole: el(".ym-name-tail").scrollWidth <= el(".ym-name-tail").clientWidth,
          stepText: el(".ym-from-step").textContent,
          stepInside: inside(el(".ym-from-step")),
          stepWhole: el(".ym-from-step").scrollWidth <= el(".ym-from-step").clientWidth,
          fromTip: el(".ym-from").getAttribute("title") ?? el(".ym-from").getAttribute("data-tip-held"),
        };
      });
      const where = `${w}×${h}: ${full}`;
      expect(seen.split, `${where}: the map's name is cut, its step kept`).toBe(true);
      expect(seen.tip, `${where}: the whole name is in its tooltip`).toBe(full);
      expect(seen.tailStarts, `${where}: the second line starts with the step`).toBe("—");
      expect(seen.tailInside, `${where}: the step is inside the tile`).toBe(true);
      expect(seen.stepText, `${where}: the from-line ends with its step`).toBe(` · step ${steps}`);
      expect(seen.stepInside && seen.stepWhole, `${where}: the from-line's step is whole`).toBe(true);
      expect(seen.fromTip, `${where}: the from-line's tooltip is the whole line`).toBe(`From ${name}, ${steps ? "step 1" : "as it began"}`);
      if (label === "The generated map") expect(seen.tailWhole, `${where}: a short step is whole`).toBe(true);
    }
  }
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
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible({ timeout: 60_000 });
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
  await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile` })).toBeVisible({ timeout: 60_000 });
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

test("Keep this version numbers a name Your maps already holds, as saved files are, in one click", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const first = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await first.hover();
  const keep = first.getByRole("button", { name: "Keep this version" });
  // (one click each, never a question; a step with no settled build is built in a worker of its own first, so a slow machine takes its time)
  for (const n of ["", " (2)", " (3)"]) {
    await keep.click();
    await expect(page.getByRole("status").filter({ hasText: `Kept as ${name} — Raise a tile${n}` })).toBeVisible({ timeout: 60_000 });
  }
  await history(page).click();
  const yours = await openYourMaps(page);
  for (const n of ["", " (2)", " (3)"]) await expect(yours.locator("li", { hasText: `${name} — Raise a tile${n}` })).toHaveCount(n ? 1 : 3);
});

test("two versions kept or branched within moments of each other get different names", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  await edit(page, [[40, 40, 44]], "Raise a tile");
  await idle(page);
  await history(page).click();
  const first = page.getByRole("complementary", { name: "History" }).locator(".hist-item").nth(1);
  await first.hover();
  // (the build of a step takes seconds and the name is chosen when the map is stored, so a second Keep, and a Branch, begun
  // before the first is stored are numbered too)
  await first.getByRole("button", { name: "Keep this version" }).click();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await first.getByRole("button", { name: "Keep this version" }).click();
  await expect.poll(async () => (await info(page)).name, { timeout: 120_000 }).toBe(name);
  await history(page).click();
  const yours = await openYourMaps(page);
  for (const n of ["", " (2)", " (3)"]) await expect(yours.locator("li", { hasText: `${name} — Raise a tile${n}` })).toHaveCount(n ? 1 : 3, { timeout: 120_000 });
  const titles = await yours.locator("li .ym-name").allTextContents();
  const versions = titles.filter((t) => t.startsWith(`${name} — Raise a tile`));
  expect(new Set(versions).size).toBe(versions.length);
  expect(versions).toHaveLength(3);
});

test("B with no version chosen says how to choose one, and Your maps' Compare picks it", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const name = (await info(page)).name;
  const hint = page.getByRole("status").filter({ hasText: "Ctrl+click a version in Your maps, then press Compare" });

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
