// Save as… (Kyler, 2026-11-18; D443 amended): File → Save as… (or Ctrl+Shift+S) opens a field holding the map's name,
// selected, with the file's name under it as it is typed; Enter renames the map through the core (no undo step) and
// saves it under that name. A name a map in the Maps folder already has is said under the field, and the save takes the
// next free one, as Save does. On a phone it is in the menu and names the file handed to the share sheet. The folder
// picker is the browser's private file system standing in for Documents\Timberborn\Maps, as in
// save-to-timberborn.spec.ts: nothing touches a real Maps folder.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, openFileMenu, shownName } from "./open";

/** A folder picker that hands back a folder of the page's private file system named Maps (a real directory handle). */
async function mapsPicker(page: Page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Maps", { create: true });
  });
}

const filesInMaps = (page: Page) =>
  page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Maps");
    const names: string[] = [];
    for await (const key of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(key);
    return names.sort();
  });

test("Save as… names the map and its file; a name taken in Maps is said before Enter and numbered", async ({ page }) => {
  test.setTimeout(300_000);
  await mapsPicker(page);
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const generated = await shownName(page);
  const undo = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Undo (Ctrl+Z)" });
  await expect(undo).toBeDisabled();

  // the field holds the map's name, selected, and says the file's name under it
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Save as…" }).click();
  const card = page.getByRole("dialog", { name: "Save as" });
  const field = card.getByLabel("Map name");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(generated);
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, generated.length]);
  await expect(card.locator(".save-as-file")).toHaveText(`Saves as ${generated}.timber`);

  // typed, the line follows: what a file can't hold is replaced; a name of nothing else is refused, Save greyed
  await page.keyboard.type("Old Loop: Lakelands?");
  await expect(card.locator(".save-as-file")).toHaveText("Saves as Old Loop Lakelands.timber");
  await field.fill("???");
  await expect(card.getByRole("alert")).toContainText("use letters or digits");
  await expect(card.getByRole("button", { name: "Save" })).toBeDisabled();
  await field.fill("Old Loop Lakelands");
  await expect(card.locator(".save-as-file")).toHaveText("Saves as Old Loop Lakelands.timber");

  // Enter saves: the file under that name, the header's name, the saved line; no undo step
  await page.keyboard.press("Enter");
  await expect(card).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: /^Saved Old Loop Lakelands\.timber to Maps\./ })).toBeVisible({ timeout: 120_000 });
  expect(await filesInMaps(page)).toEqual(["Old Loop Lakelands.timber"]);
  expect(await shownName(page)).toBe("Old Loop Lakelands");
  await expect(undo).toBeDisabled();

  // Ctrl+Shift+S again: the name is in Maps now, and the field says so before Enter; the save takes " (2)"
  await page.locator("canvas").first().hover();
  await page.keyboard.press("Control+Shift+S");
  await expect(card).toBeVisible();
  await expect(card.locator(".save-as-file")).toHaveText("A map called Old Loop Lakelands.timber is in Maps: saves as Old Loop Lakelands (2).timber");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /^Saved Old Loop Lakelands \(2\)\.timber to Maps\./ })).toBeVisible({ timeout: 120_000 });
  expect(await filesInMaps(page)).toEqual(["Old Loop Lakelands (2).timber", "Old Loop Lakelands.timber"]);

  // Esc leaves, nothing saved or renamed
  await page.keyboard.press("Control+Shift+S");
  await expect(card).toBeVisible();
  await page.keyboard.type("Not this");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  expect(await shownName(page)).toBe("Old Loop Lakelands");
  expect(await filesInMaps(page)).toHaveLength(2);
});

test.describe("on a phone held upright", () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("Save as… is in the menu, a finger tall at the top, and names the file the share sheet gets", async ({ page }) => {
    test.setTimeout(300_000);
    // (a phone's browser: no folder to save into; a share sheet that takes files, stood in for here)
    await page.addInitScript(() => {
      delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      const w = window as unknown as { shared: { name: string; size: number }[] };
      w.shared = [];
      Object.defineProperty(navigator, "canShare", { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d: { files: File[] }) => void w.shared.push(...d.files.map((f) => ({ name: f.name, size: f.size }))) });
    });
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");
    await page.getByRole("button", { name: "Menu" }).tap();
    await page.getByRole("menu", { name: "Menu" }).getByRole("menuitem", { name: "Save as…" }).tap();
    const card = page.getByRole("dialog", { name: "Save as" });
    const field = card.getByLabel("Map name");
    await expect(field).toBeFocused();
    const box = (await field.boundingBox())!;
    expect(box.height, "a finger tall").toBeGreaterThanOrEqual(44);
    expect(box.y + box.height, "in the screen's top half, where the keyboard never reaches").toBeLessThan(852 / 2);
    const go = (await card.getByRole("button", { name: "Save" }).boundingBox())!;
    expect(go.height).toBeGreaterThanOrEqual(44);
    expect(go.x + go.width, "inside the screen").toBeLessThanOrEqual(393);
    await field.fill("Beaver Bend");
    await expect(card.locator(".save-as-file")).toHaveText("Saves as Beaver Bend.timber");
    await card.getByRole("button", { name: "Save" }).tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: { name: string }[] }).shared.map((f) => f.name)), { timeout: 120_000 }).toEqual(["Beaver Bend.timber"]);
    await expect(page.locator(".editor-message")).toContainText("Sent Beaver Bend.timber.");
    expect(await shownName(page)).toBe("Beaver Bend");
  });
});
