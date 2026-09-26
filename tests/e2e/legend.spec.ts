// Live editing, first phase (Kyler's triage notes): the legend is a slim panel beside the map, not
// over it; it folds to a strip that stays on screen; it lists only what is on the map shown; a
// click on a line points to those things on the map until the next click or Esc; and it keeps
// the Markers and Height colours toggles. The generator's page says which map it shows while
// another map is open in the editor.

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

/** Whether two boxes overlap. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Tiles the renderer's overlay draws in the highlight's colour. */
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.overlayData()!;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 40 && d[i + 2] === 255 && d[i + 3] > 0) n++;
    return n;
  });

test("the legend sits beside the map, lists what is on it, points to it, and folds to a strip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.evaluate(() => localStorage.clear()).catch(() => undefined);
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });

  // beside the map: the canvas and the legend never overlap
  const legend = page.getByRole("complementary", { name: "Legend" });
  await expect(legend).toBeVisible();
  const canvas = (await page.locator(".view3d canvas").boundingBox())!;
  let box = (await legend.boundingBox())!;
  expect(overlap(canvas, box)).toBe(false);
  expect(box.width).toBeLessThan(260);

  // only what is on this map: every line it lists has things on the map to point to
  const lines = legend.locator("button.pick-line");
  await expect.poll(() => lines.count()).toBeGreaterThan(4);
  const n = await lines.count();
  expect(n).toBeLessThan(25);
  for (const text of ["Living trees and bushes", "Water: darker is deeper", "The start: district center"]) await expect(legend).toContainText(text);
  // the toggles live in it
  await expect(legend.getByRole("button", { name: "Height colours" })).toBeVisible();
  await expect(legend.getByRole("button", { name: "Markers" })).toBeVisible();

  // a click points to those things on the map; Esc clears it
  const trees = legend.getByRole("button", { name: "Living trees and bushes" });
  await trees.click();
  await expect(trees).toHaveAttribute("aria-pressed", "true");
  expect(await highlighted(page)).toBeGreaterThan(10);
  await page.keyboard.press("Escape");
  await expect(trees).toHaveAttribute("aria-pressed", "false");
  expect(await highlighted(page)).toBe(0);
  // by keyboard too; a click on the map clears it
  await trees.focus();
  await page.keyboard.press("Enter");
  expect(await highlighted(page)).toBeGreaterThan(10);
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  expect(await highlighted(page)).toBe(0);

  // folded: a strip that stays on screen, and opens again
  const fold = legend.getByRole("button", { name: "Legend" });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  box = (await legend.boundingBox())!;
  expect(box.width).toBeGreaterThan(20);
  expect(box.width).toBeLessThan(50);
  await expect(legend.locator(".pick-line")).toHaveCount(0);
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(legend.locator("button.pick-line")).toHaveCount(n);
  expect(errors).toEqual([]);
});

test("while another map is open in the editor, the generator's page says which map is which", async ({ page }) => {
  // a map of our own, opened in the editor as a file
  const g = generate(makeSpec({ seed: 7, size: { x: 48, y: 48 } }));
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".view-caption")).toContainText("This map: River Valley");
  await page.getByLabel("Open a map or a project file in the editor").setInputFiles({ name: "My island.timber", mimeType: "application/zip", buffer: Buffer.from(g.bytes) });
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  // back on the generator's page: the banner names the map being edited, the preview says it is a
  // new one from the settings
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "New map" }).click();
  const banner = page.getByRole("status").filter({ hasText: "You're editing" });
  await expect(banner).toContainText("You're editing My island");
  await expect(banner).toContainText("The map below is a new one");
  await expect(page.locator(".view-caption")).toContainText("New map from these settings");
  await banner.getByRole("button", { name: "Back to editing" }).click();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "My island" })).toBeVisible();
});
