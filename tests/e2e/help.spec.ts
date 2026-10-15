// The File menu's help entries (M13): Report a problem opens the repository's issues, the shortcuts panel lists
// the editor's keys and closes, Help opens. (The tooltip form of the new controls is tests/e2e/tooltips.spec.ts.)

import { expect, test } from "@playwright/test";
import { openEditor, openFileMenu } from "./open";

test("File → Report a problem opens the repository's issue page in a new tab", async ({ page }) => {
  await openEditor(page, "s=6&z=96&d=n&t=riverValley");
  const menu = await openFileMenu(page);
  // (the new tab is the browser's: the page's own call is what is checked, with the repository's address)
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = (url) => ((window as unknown as { opened: string[] }).opened.push(String(url)), null);
  });
  await menu.getByRole("menuitem", { name: "Report a problem" }).click();
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(["https://github.com/timbermods/dam-good-maps/issues/new/choose"]);
});

test("Keyboard shortcuts lists the keys, ? opens it, Esc and Close close it, and the editor waits meanwhile", async ({ page }) => {
  await openEditor(page, "s=6&z=96&d=n&t=riverValley");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("dt", { hasText: "Carve: a river" }).locator("xpath=following-sibling::dd").getByText("Shift+1", { exact: true })).toBeVisible();
  await expect(dialog.locator("dt", { hasText: "Mark an area that brushes and forces stay inside" }).locator("xpath=following-sibling::dd")).toHaveText("Ctrl+drag");
  await expect(dialog.locator("dt", { hasText: /^Raise$/ }).locator("xpath=following-sibling::dd")).toHaveText("2");
  // (a key pressed while it shows picks no tool)
  await page.keyboard.press("2");
  expect(await page.evaluate(() => document.querySelector('[aria-pressed="true"][aria-label^="Raise"], [aria-pressed="true"][title^="Raise"]') !== null)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Help opens from the File menu and closes", async ({ page }) => {
  await openEditor(page, "s=6&z=96&d=n&t=riverValley");
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Help", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Help" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: /installing a map/ })).toHaveAttribute("href", /#install-a-map$/);
  // (a selection keeps the brushes and forces inside it: said here and on the shortcuts sheet)
  await expect(dialog.getByText("Select an area first, and the brushes and forces stay inside it.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
