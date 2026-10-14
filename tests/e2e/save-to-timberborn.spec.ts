// Save to Timberborn (PLAN §20 D162, ROADMAP "Save to Timberborn"): a "Save to Timberborn" button
// stands next to every .timber download - the editor's header (the page's only one since D330) and
// the Real places gallery - and falls back to the normal download, with one line of install help, when
// the browser has no folder access or the folder cannot be written. The OS folder dialog cannot be driven, so
// the picker is replaced by one that hands back a folder of the browser's own private file system (a real
// directory handle, kept in IndexedDB like the real one) named as the test says; a closed picker, the wrong
// folder, Choose Maps folder... and the write itself are covered here, the rest at the unit level
// (tests/unit/platform.test.ts).

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

/** Chrome or Edge, but the folder cannot be written (a deleted or locked folder): the save falls back to a download. */
async function folderCannotBeWritten(page: Page) {
  await page.addInitScript(() => {
    const broken = {
      name: "Maps",
      kind: "directory",
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      getFileHandle: async () => {
        throw new DOMException("the folder is gone", "NotFoundError");
      },
    };
    window.showDirectoryPicker = async () => broken as unknown as FileSystemDirectoryHandle;
  });
}

type PickerWin = { __pick: string; __picks: number };

/** A folder picker that returns a folder of the page's private file system named `__pick`, or closes ("abort"). */
async function pickerThat(page: Page, pick: string) {
  await page.addInitScript((first) => {
    const w = window as unknown as PickerWin;
    w.__pick = first;
    w.__picks = 0;
    window.showDirectoryPicker = async () => {
      w.__picks++;
      if (w.__pick === "abort") throw new DOMException("The user aborted a request.", "AbortError");
      return (await navigator.storage.getDirectory()).getDirectoryHandle(w.__pick, { create: true });
    };
  }, pick);
}
const nextPick = (page: Page, pick: string) => page.evaluate((v) => void ((window as unknown as PickerWin).__pick = v), pick);
const picks = (page: Page) => page.evaluate(() => (window as unknown as PickerWin).__picks);
const filesIn = (page: Page, folder: string) =>
  page.evaluate(async (name) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    const names: string[] = [];
    for await (const key of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(key);
    return names;
  }, folder);

test.describe("the editor's header", () => {
  const saveButton = (page: Page) => page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Save to Timberborn" });

  test("closing the folder picker saves nothing and says nothing", async ({ page }) => {
    await pickerThat(page, "abort");
    let downloads = 0;
    page.on("download", () => downloads++);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");
    await saveButton(page).click();
    await expect.poll(() => picks(page), { timeout: 120_000 }).toBe(1);
    await expect(saveButton(page)).toBeEnabled();
    expect(downloads).toBe(0);
    await expect(page.locator(".editor-message")).toHaveCount(0);
  });

  test("a folder not named Maps is refused and the previous choice stands", async ({ page }) => {
    await pickerThat(page, "Documents");
    let downloads = 0;
    page.on("download", () => downloads++);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");

    await saveButton(page).click();
    const refusal = page.getByRole("alert").filter({ hasText: /isn't Timberborn's Maps folder/ });
    await expect(refusal).toBeVisible({ timeout: 120_000 });
    await expect(refusal).toContainText("Documents\\Timberborn\\Maps");
    expect(await filesIn(page, "Documents")).toEqual([]);

    // Choose Maps folder... picks the right one and says so; a save then lands in it
    await nextPick(page, "Maps");
    await (await openFileMenu(page)).getByRole("menuitem", { name: "Choose Maps folder…" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Maps folder is set/ })).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved dgm-.* to Maps./ })).toBeVisible({ timeout: 120_000 });
    expect(await filesIn(page, "Maps")).toHaveLength(1);

    // a wrong choice later, or a cancel, leaves Maps as it was: the next save does not ask again
    await nextPick(page, "Documents");
    await (await openFileMenu(page)).getByRole("menuitem", { name: "Choose Maps folder…" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /isn't Timberborn's Maps folder/ })).toBeVisible();
    await nextPick(page, "abort");
    await (await openFileMenu(page)).getByRole("menuitem", { name: "Choose Maps folder…" }).click();
    await expect.poll(() => picks(page)).toBe(4);
    const before = await picks(page);
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: /Saved dgm-.*-2.timber to Maps/ })).toBeVisible({ timeout: 120_000 });
    expect(await picks(page)).toBe(before);
    expect(await filesIn(page, "Maps")).toHaveLength(2);
    expect(downloads).toBe(0);
  });

  test("Save to Timberborn is the primary button and falls back to a normal download", async ({ page }) => {
    await folderCannotBeWritten(page);
    await openEditor(page, "s=1&z=96&d=n&t=riverValley");

    const timberborn = page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Save to Timberborn" });
    await expect(timberborn).toHaveClass(/primary/);
    const download = page.waitForEvent("download", { timeout: 120_000 });
    await timberborn.click();
    await (await download).path();
    await expect(page.getByRole("status").filter({ hasText: /^Couldn.t save to the Maps folder, so .* was downloaded. Move the file to/ })).toBeVisible();
  });

  test("Save to Timberborn falls back to the same bytes as the File menu's Download .timber", async ({ page }) => {
    await folderCannotBeWritten(page);
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
