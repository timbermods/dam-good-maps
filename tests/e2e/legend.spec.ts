// The legend (Kyler's triage notes; the one-page editor, D330): a Legend button in the top-right column opens a
// panel over the map, closed to start with and remembered in this browser; it lists only what is on the map
// shown; a click on a line points to those things on the map until the next click or Esc; opening or closing
// it moves nothing else; Height colours and Markers are view-bar toggles, not part of it. The header names the
// open map, and another map open in the editor shows there, with the replaced one kept in Your maps.

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { openDrawer, openEditor, openLegend, waitForEditor } from "./open";

/** Tiles the renderer's overlay draws in the highlight's colour. */
const highlighted = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.overlayData()!;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 40 && d[i + 2] === 255 && d[i + 3] > 0) n++;
    return n;
  });

/** Where the map and the right column's other pieces stand: opening or closing the legend moves none of them. */
const places = (page: Page) =>
  page.evaluate(() => {
    const at = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
    };
    return { canvas: at(".view3d canvas"), compass: at(".view3d-corner .compass"), slow: at(".corner-below > button"), button: at(".corner-legend"), bar: at(".view3d-controls") };
  });

test("the Legend button opens a panel over the map, which lists what is on it and points to it; nothing else moves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  // closed to start with: the button, not pressed, and no panel
  const button = page.getByRole("button", { name: "Legend", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("aside.legend-panel")).toHaveCount(0);
  const closed = await places(page);

  // open: over the map, inside the view, and nothing else moves
  const legend = await openLegend(page);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const canvas = (await page.locator(".view3d canvas").boundingBox())!;
  let box = (await legend.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);
  expect(box.width).toBeLessThan(260);
  expect(await places(page)).toEqual(closed);

  // only what is on this map: every line it lists has things on the map to point to
  const lines = legend.locator("button.pick-line");
  await expect.poll(() => lines.count()).toBeGreaterThan(4);
  const n = await lines.count();
  expect(n).toBeLessThan(25);
  for (const text of ["Trees and bushes", "Water", "Start"]) await expect(legend).toContainText(text);
  // Height colours and Markers are view-bar toggles, not in the legend
  await expect(legend.getByRole("button", { name: "Height colours" })).toHaveCount(0);
  await expect(legend.getByRole("button", { name: "Markers", exact: true })).toHaveCount(0);
  const bar = page.getByRole("group", { name: "View" });
  await expect(bar.getByRole("button", { name: "Height colours" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Markers", exact: true })).toBeVisible();

  // a click points to those things on the map; Esc clears it
  const trees = legend.getByRole("button", { name: "Trees and bushes" });
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

  // closed again by the button: the panel goes, and nothing else moves
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("aside.legend-panel")).toHaveCount(0);
  expect(await places(page)).toEqual(closed);

  // the open state is remembered: opened, it is open again after a reload
  await button.click();
  await expect(legend).toBeVisible();
  await page.reload();
  await waitForEditor(page);
  await expect(page.locator("aside.legend-panel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the header names the open map: a generated map, then an opened file, the replaced one kept in Your maps", async ({ page }) => {
  // a map of our own, opened in the editor as a file
  const g = generate(makeSpec({ seed: 7, size: { x: 48, y: 48 } }));
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await expect(page.locator(".editor-title h1")).toHaveText("River Valley");
  await expect(page.locator(".editor-title .muted")).toHaveText("seed 4242 · 96×96");
  expect(new URL(page.url()).hash).toMatch(/^#s=4242&/);

  // the file replaces it without asking: the header names the file's map, its size alone, and the address is empty
  await page.getByLabel("Open a map or project file").setInputFiles({ name: "My island.timber", mimeType: "application/zip", buffer: Buffer.from(g.bytes) });
  await expect(page.locator(".editor-title h1")).toHaveText("My island", { timeout: 60_000 });
  await expect(page.locator(".editor-title .muted")).toHaveText("48×48");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");

  // Your maps lists both, the open one marked; the other one's row brings it back
  await openDrawer(page);
  const yours = page.getByRole("region", { name: "Your maps" });
  await expect(yours.getByRole("button")).toHaveCount(2);
  await expect(yours.locator("button[aria-current=true]")).toContainText("My island");
  await yours.getByRole("button", { name: /^River Valley/ }).click();
  await expect(page.locator(".editor-title h1")).toHaveText("River Valley", { timeout: 60_000 });
});
