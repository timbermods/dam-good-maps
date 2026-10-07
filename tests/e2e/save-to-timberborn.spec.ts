// Save to Timberborn (PLAN §20 D162, ROADMAP "Save to Timberborn"): a "Save to Timberborn" button
// stands next to every .timber download - the editor's header (the page's only one since D330) and
// the Real places gallery - and falls back to the normal download, with one line of install help, when
// the browser has no folder access or the player declines it. The folder-picking success path
// itself needs a real OS dialog Playwright cannot drive, so it is a fake at the unit level instead
// (tests/unit/platform.test.ts); this file only exercises what a real browser can be made to do.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openEditor, openFileMenu } from "./open";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytesOf = async (path: string | null) => new Uint8Array(readFileSync(path!));
// A "download" event fires when the download starts. A test that ends right after it can close the browser
// context while the file is still being written ("browserContext.close: Test ended"), so tests wait for `path()`.

/** No folder access at all (Firefox, Safari in real life): `showDirectoryPicker` doesn't exist. */
async function noFolderAccess(page: Page) {
  await page.addInitScript(() => {
    delete window.showDirectoryPicker;
  });
}

/** Chrome or Edge, but the player closes the folder picker without choosing one. */
async function declinesThePicker(page: Page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = () => Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
  });
}

test.describe("the editor's header", () => {
  test("Save to Timberborn is the primary button and falls back to a normal download", async ({ page }) => {
    await declinesThePicker(page);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");

    const timberborn = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Save to Timberborn" });
    await expect(timberborn).toHaveClass(/primary/);
    const download = page.waitForEvent("download", { timeout: 120_000 });
    await timberborn.click();
    await (await download).path();
    await expect(page.getByRole("status").filter({ hasText: /Move the file to/ })).toBeVisible();
  });

  test("Save to Timberborn falls back to the same bytes as the File menu's Download .timber", async ({ page }) => {
    await declinesThePicker(page);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");
    const saveButton = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Save to Timberborn" });
    await expect(saveButton).toBeVisible();

    const plainDownload = page.waitForEvent("download", { timeout: 120_000 });
    await (await openFileMenu(page)).getByRole("menuitem", { name: "Download .timber" }).click();
    const plain = await plainDownload;
    const expected = await bytesOf(await plain.path());

    const savedDownload = page.waitForEvent("download", { timeout: 120_000 });
    await saveButton.click();
    const saved = await savedDownload;
    expect(saved.suggestedFilename()).toBe(plain.suggestedFilename());
    expect(sha256(await bytesOf(await saved.path()))).toBe(sha256(expected));
    await expect(page.getByRole("status").filter({ hasText: /Move the file to/ })).toBeVisible();
  });

  test("without folder access the primary button is Download .timber", async ({ page }) => {
    await noFolderAccess(page);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");
    const primary = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Download .timber" });
    await expect(primary).toHaveClass(/primary/);
    const download = page.waitForEvent("download", { timeout: 120_000 });
    await primary.click();
    await (await download).path();
  });
});

test.describe("Real places", () => {
  test("Save to Timberborn appears on a card and falls back to a normal download", async ({ page }) => {
    await noFolderAccess(page);
    await page.goto("./real-places/");
    await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();

    const first = page.getByRole("list", { name: "Maps" }).getByRole("listitem").first();
    const timberborn = first.getByRole("button", { name: /^Save .* to Timberborn$/ });
    await expect(timberborn).toBeVisible();

    const download = page.waitForEvent("download");
    await timberborn.click();
    await (await download).path();
    await expect(first.getByText(/Move the file to/)).toBeVisible();
  });
});
