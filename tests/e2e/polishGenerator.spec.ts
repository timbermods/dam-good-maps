// The generator panel, Real places and the page's loading (the editor polish audit, group "Generator"): a link shows
// the editor's frame and its progress at once; an opened file's panel describes the file, not the map before it; the
// settings' numbers have their units; the shelf's pictures never go blank between maps.

import { expect, test } from "@playwright/test";
import { openDrawer, openEditor, waitForEditor } from "./open";

const FILE = "tests/fixtures/m9b-river-valley-96-34.timber";

test("a share link shows the editor's frame and its progress at once, long before the map", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./#s=4242&z=192&d=n&t=riverValley");
  // (not a blank page with one line: the header, the bar and the shelf, and the dialog saying what is being made)
  const frame = page.locator(".loading-frame");
  await expect(frame).toBeVisible({ timeout: 5_000 });
  await expect(frame.locator("header.editor-bar")).toBeVisible();
  await expect(frame.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  await expect(frame.getByRole("navigation", { name: "Place" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(/…$/);
  // (still the frame, not the editor: the map is not there yet)
  expect(await page.evaluate(() => !!window.dgmEditor)).toBe(false);
  // the header's buttons, where they are in the frame: they do not move when the map arrives
  const spots = () =>
    page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const b of document.querySelectorAll("header.editor-bar button")) {
        const t = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().replace(/^Look: .*/, "Look");
        if (/^(History|Save to Timberborn|File|Look)$/.test(t) || /^Look/.test((b.textContent ?? "").trim())) out[/^Look/.test(t) || /^Look/.test((b.textContent ?? "").trim()) ? "Look" : t] = Math.round(b.getBoundingClientRect().left);
      }
      return out;
    });
  const inFrame = await spots();
  // (Look is in both, or in neither where the browser draws in software, as CI's does)
  expect(Object.keys(inFrame)).toEqual(expect.arrayContaining(["File", "History", "Save to Timberborn"]));
  await waitForEditor(page);
  const inEditor = await spots();
  expect(Object.keys(inEditor).sort()).toEqual(Object.keys(inFrame).sort());
  for (const k of Object.keys(inFrame)) expect(Math.abs(inEditor[k] - inFrame[k]), k).toBeLessThanOrEqual(1);
  await expect(frame).toHaveCount(0);
});

test("an opened file's panel counts its own objects and reads – for the settings it doesn't have", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // a generated Lake Basin first: its settings are what the panel must not keep showing for the file
  await openEditor(page, "s=7&z=128&d=n&t=lakeBasin");
  await page.getByLabel("Open a map or a project").setInputFiles(FILE);
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  const panel = await openDrawer(page);
  // the file's own objects (7 water sources, 148 berry bushes, 124 ruins, 2 mine sites, 447 living trees)
  const counts = panel.locator(".gen-otm li");
  await expect(counts).toHaveText(["2 Mine sites", "124 Ruins", "148 Berry bushes", "447 Trees", "7 Water sources"]);
  // the file's size, no seed, no theme, no settings
  await expect(panel.getByRole("group", { name: "Size" }).getByRole("button", { name: "96", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator("#seed")).toHaveValue("");
  await expect(panel.locator("#seed")).toHaveAttribute("placeholder", "–");
  await expect(panel.getByRole("group", { name: "Theme" }).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(panel.locator(".gen-item .set-value").first()).toHaveText("–");
  // moving one setting makes them the next map's: every one shows its value again
  await panel.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Canyon" }).click();
  await expect(panel.locator(".gen-item .set-value").first()).not.toHaveText("–");
  await expect(panel.locator("#seed")).not.toHaveValue("");
});

test("every number of the settings has its unit", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=7&z=96&d=n&t=riverValley");
  const panel = await openDrawer(page);
  const value = (label: string) => panel.locator(".gen-item", { has: page.locator(".set-label", { hasText: new RegExp(`^${label}$`) }) }).locator(".set-value");
  await expect(value("Starting wood")).toHaveText(/^\d+ logs$/);
  await expect(value("Max walk to water")).toHaveText(/^\d+ tiles$/);
  await expect(value("Starting berries")).toHaveText(/^\d+ bushes$/);
  await expect(value("Berries near start")).toHaveText(/^\d+ bushes$/);
  await expect(value("No ruins within")).toHaveText(/^\d+ tiles$/);
  // a long name ends in "…" in the Name box, never cut mid-letter
  const name = panel.locator("#map-name");
  expect(await name.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
});

test("the shelf's pictures never go blank when a new map is made", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=7&z=96&d=n&t=riverValley");
  const shelf = page.getByRole("navigation", { name: "Place" });
  // (every picture drawn on the first map)
  await expect(shelf.locator(".shelf-blank")).toHaveCount(0, { timeout: 60_000 });
  // a frame-by-frame watch: any frame with the shelf on show and a grey square in it
  await page.evaluate(() => {
    const w = window as unknown as { __blank: number; __frames: number };
    w.__blank = 0;
    w.__frames = 0;
    const tick = () => {
      const nav = document.querySelector('nav[aria-label="Place"]');
      if (nav && nav.querySelector(".shelf-item")) {
        w.__frames++;
        if (nav.querySelector(".shelf-blank")) w.__blank++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const before = await page.evaluate(() => window.dgmEditor!.info().name);
  const panel = await openDrawer(page);
  await panel.getByRole("button", { name: "Surprise me" }).click();
  await expect.poll(() => page.evaluate(() => window.dgmEditor?.info().name), { timeout: 120_000 }).not.toBe(before);
  // (the new map's editor has drawn its own pictures by now; the frames between never showed a grey square)
  await expect(shelf.locator(".shelf-item").first()).toBeVisible();
  await expect.poll(async () => { const c = await shelf.locator(".shelf-item").evaluateAll((els) => [els.length, els.filter((e) => e.querySelector("img")).length]); return c[0] > 0 && c[0] === c[1]; }, { timeout: 60_000 }).toBe(true);
  const seen = await page.evaluate(() => ({ blank: (window as unknown as { __blank: number }).__blank, frames: (window as unknown as { __frames: number }).__frames }));
  expect(seen.frames).toBeGreaterThan(0);
  expect(seen.blank).toBe(0);
});

test("a first map that fails turns the dialog into its words and a way on, never stuck on Generating", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // (the first six maps fail their checks: the page tried six seeds)
  await page.addInitScript(() => ((window as unknown as { __dgmForceFail: number }).__dgmForceFail = 6));
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("status")).toHaveText(/^No valid map after [0-9]+ attempts/, { timeout: 180_000 });
  // (the message is the dialog's words, once; nothing is dimmed under it)
  await expect(page.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Make a new map" }).click();
  await waitForEditor(page);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await page.evaluate(() => window.dgmEditor!.info())).kind).toBe("generated");
});
