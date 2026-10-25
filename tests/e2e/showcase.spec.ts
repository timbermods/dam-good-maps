// Showcase mode (D488 (2)): Showcase… opens its sheet over the generator's settings; Start search runs the search in its
// own worker and the best maps so far show as cards (a picture, the six beats, what the map shows); Stop ends it after
// the map in hand and the cards stay, each with Open; Open opens the pick through the normal open path, and its card
// then says it is the map on show.

import { expect, test } from "@playwright/test";
import { openDrawer, openEditor, pick } from "./open";

test("Showcase: start a search, see a card, stop, open a pick", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const panel = await openDrawer(page);

  await panel.getByRole("button", { name: "Showcase…" }).click();
  const sheet = panel.getByRole("region", { name: "Showcase" });
  await expect(sheet).toBeVisible();
  // (the settings stay where they are under it, out of reach)
  await expect(panel.getByRole("region", { name: "Terrain", exact: true })).toBeHidden();
  await pick(sheet, "Search for", "2 min");

  // a worker that never loads (its file gone after a deploy) stops the search in one line, and the next search starts
  // a fresh one (here the file is back). The page is handed a showcase worker whose file is missing, through the page's own Worker, so its
  // real error event fires in every build and browser (a route on the worker's file isn't heard by every browser's
  // worker loading: CI's Chromium loaded it anyway).
  await page.evaluate(() => {
    const Real = window.Worker;
    (window as unknown as { __realWorker: typeof Worker }).__realWorker = Real;
    window.Worker = class extends Real {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(String(url).includes("showcase") ? new URL("missing-showcase-worker.js", document.baseURI) : url, opts);
      }
    };
  });
  await sheet.getByRole("button", { name: "Start search" }).click();
  await expect(sheet.getByRole("status")).toHaveText("The search stopped: its worker could not run. Reload the page to search again.", { timeout: 30_000 });
  await page.evaluate(() => (window.Worker = (window as unknown as { __realWorker: typeof Worker }).__realWorker));

  await sheet.getByRole("button", { name: "Start search" }).click();
  const cards = sheet.locator(".sc-card:not(.empty)");
  await expect(cards.first()).toBeVisible({ timeout: 180_000 });
  await expect(sheet.getByRole("status")).toContainText(/made · /);
  // a card: its picture, its name, how many beats, each of the six met or not
  const first = cards.first();
  await expect(first.locator("img.sc-pic")).toBeVisible();
  await expect(first.locator(".sc-score")).toHaveText(/^[0-6] of 6 beats$/);
  await expect(first.locator(".sc-beats li")).toHaveCount(6);
  // (a card opens only once the search has ended)
  await expect(first.getByRole("button", { name: "Open" })).toBeDisabled();

  await sheet.getByRole("button", { name: "Stop" }).click();
  // (the focus stays in the sheet while it stops, so Esc still closes it)
  expect(await sheet.evaluate((e) => e.contains(document.activeElement))).toBe(true);
  await expect(sheet.getByRole("button", { name: "Search more" })).toBeVisible({ timeout: 180_000 });
  await expect(sheet.getByRole("status")).toHaveText(/^Stopped after \d+ maps?\.$/);

  // open a pick that isn't the map on show: it opens in the editor, and its card says it is the open map
  const openable = sheet.locator(".sc-card:not(.on-show):not(.empty)").first();
  const name = (await openable.locator(".sc-name").textContent())!;
  await openable.getByRole("button", { name: "Open" }).click();
  await expect(page.locator("header.editor-bar .editor-title")).toContainText(name, { timeout: 60_000 });
  await expect(sheet.locator(".sc-card.on-show .sc-name")).toHaveText(name);
  await expect(sheet.locator(".sc-card.on-show").getByRole("button", { name: "Open" })).toBeDisabled();

  // Esc (or Settings) brings the settings back
  expect(await sheet.evaluate((e) => e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(panel.getByRole("region", { name: "Terrain", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
