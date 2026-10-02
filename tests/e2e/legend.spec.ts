// The map card's legend (UI-BRIEF §3 item 3, DESIGN.md "What is on this map"; D330): it lists only what is on
// the map shown, a line per kind with its picture, count and name; hovering a line points to those things on
// the land and a click pins that until the next click or Esc (the line is `aria-pressed`). The old legend (a
// slim panel beside the map that folded to a strip, with its own Height colours and Markers toggles) is gone
// for good with the "Legend" button: the toggles are in the view bar (viewAndHeader.spec, look.spec). A map
// opened from a file is the map on show, and the card names it.

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { openEditor, waitForEditor } from "./open";

/** Tiles the renderer's overlay draws in the highlight's colour. */
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.overlayData()!;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 40 && d[i + 2] === 255 && d[i + 3] > 0) n++;
    return n;
  });

test("the card's legend lists what is on the map, points to it on hover and pins it on a click", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  // only what is on this map: a line for each kind present, none for the rest
  const card = page.getByRole("region", { name: "This map" });
  const lines = card.locator("button[aria-pressed]");
  await expect.poll(() => lines.count()).toBeGreaterThan(2);
  expect(await lines.count()).toBeLessThan(25);
  for (const text of [/trees and bushes/i, /water/i, /start/i]) await expect(card.locator("button[aria-pressed]", { hasText: text }).first()).toBeVisible();

  // hovering a line points to those things on the map
  const trees = card.locator("button[aria-pressed]", { hasText: /trees and bushes/i }).first();
  await trees.hover();
  expect(await highlighted(page)).toBeGreaterThan(10);
  await page.mouse.move(700, 450);
  expect(await highlighted(page)).toBe(0);

  // a click pins it until the next click or Esc
  await trees.click();
  await expect(trees).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(700, 450);
  expect(await highlighted(page)).toBeGreaterThan(10);
  await page.keyboard.press("Escape");
  await expect(trees).toHaveAttribute("aria-pressed", "false");
  expect(await highlighted(page)).toBe(0);
  // by keyboard too
  await trees.focus();
  await page.keyboard.press("Enter");
  await expect(trees).toHaveAttribute("aria-pressed", "true");
  expect(await highlighted(page)).toBeGreaterThan(10);
  await trees.click();
  await expect(trees).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("a map opened from a file is the map on show: the card names it", async ({ page }) => {
  // a map of our own, opened in the editor as a file
  const g = generate(makeSpec({ seed: 7, size: { x: 48, y: 48 } }));
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByRole("heading", { level: 1, name: "River Valley" })).toBeVisible();
  await page.getByLabel("Open a map or project file").setInputFiles({ name: "My island.timber", mimeType: "application/zip", buffer: Buffer.from(g.bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 60_000 });
  await waitForEditor(page);
  await expect(page.getByRole("heading", { level: 1, name: "My island" })).toBeVisible();
  await expect(page.locator(".map-card .facts")).toContainText("48×48 · opened");
});
