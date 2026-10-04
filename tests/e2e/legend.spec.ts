// The legend (Kyler's triage notes; the one-page editor, D330): a Legend button in the top-right column opens a
// panel over the map, closed to start with and remembered in this browser; it lists only what is on the map
// shown; a click on a line points to those things on the map until the next click or Esc; opening or closing
// it moves nothing else; Height colours and Markers are view-bar toggles, not part of it. The header names the
// open map, and another map open in the editor shows there, with the replaced one kept in Your maps.

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { openEditor, openLegend, openYourMaps, waitForEditor } from "./open";

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
    return { canvas: at(".view3d > canvas"), compass: at(".view3d-corner .compass"), slow: at(".view3d-corner > .slow-cell"), column: at(".show-column"), bar: at(".tool-bar"), objects: at(".objects-menu") };
  });

test("Legend, ticked, shows a panel under the Show column, which lists what is on it with the objects' own pictures and points to it; nothing else moves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  // off to start with: Legend, last in the Show column, unticked, and no panel
  const button = page.getByRole("checkbox", { name: "Legend", exact: true });
  await expect(button).toHaveAttribute("aria-checked", "false");
  const words = (await page.locator(".show-column").getByRole("checkbox").allTextContents()).map((t) => t.trim());
  expect(words.at(-1)).toBe("Legend");
  await expect(page.locator("aside.legend-panel")).toHaveCount(0);
  const closed = await places(page);

  // ticked: under the Show column, its left edge on the column's, over the map, and nothing else moves
  const legend = await openLegend(page);
  await expect(button).toHaveAttribute("aria-checked", "true");
  const canvas = (await page.locator(".view3d > canvas").boundingBox())!;
  const column = (await page.locator(".show-column").boundingBox())!;
  const box = (await legend.boundingBox())!;
  expect(Math.abs(box.x - column.x)).toBeLessThanOrEqual(0.5);
  expect(box.y).toBeGreaterThan(column.y + column.height);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);
  expect(box.width).toBeLessThan(260);
  expect(await places(page)).toEqual(closed);
  // one row height on every line; an object's line shows the objects menu's own picture, the ground and the
  // water their swatches (Kyler, 2026-10-03)
  const heights = await legend.locator(".pick-line").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10))]);
  expect(heights).toHaveLength(1);
  const pic = (label: string) => legend.locator(".pick-line", { hasText: new RegExp(`^${label}$`) }).locator("img.swatch.pic");
  for (const label of ["Start", "Water source", "Trees and bushes"]) {
    await expect(pic(label)).toHaveCount(1);
    expect(await pic(label).getAttribute("src")).toBeTruthy();
  }
  await expect(pic("Start")).toHaveAttribute("src", (await page.locator(".objects-menu .shelf-item", { hasText: /^Start$/ }).locator("img").getAttribute("src"))!);
  for (const label of ["Water", "Moist ground"]) await expect(pic(label)).toHaveCount(0);

  // only what is on this map: every line it lists has things on the map to point to
  const lines = legend.locator("button.pick-line");
  await expect.poll(() => lines.count()).toBeGreaterThan(4);
  const n = await lines.count();
  expect(n).toBeLessThan(25);
  for (const text of ["Trees and bushes", "Water", "Start"]) await expect(legend).toContainText(text);
  // Heights and Markers are the Show column's toggles, not in the legend
  await expect(legend.getByRole("checkbox")).toHaveCount(0);
  const show = page.getByRole("group", { name: "Show" });
  await expect(show.getByRole("checkbox", { name: "Heights" })).toBeVisible();
  await expect(show.getByRole("checkbox", { name: "Markers", exact: true })).toBeVisible();

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

  // unticked: the panel goes, and nothing else moves
  await button.click();
  await expect(button).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("aside.legend-panel")).toHaveCount(0);
  expect(await places(page)).toEqual(closed);

  // the ticked state is remembered: ticked, it is open again after a reload
  await button.click();
  await expect(legend).toBeVisible();
  await page.reload();
  await waitForEditor(page);
  await expect(page.locator("aside.legend-panel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the header names the open map: a generated map, then an opened file, the replaced one kept in Your maps", async ({ page }) => {
  // a map of our own, opened in the editor as a file (96², D148: at 48² item 47's must-haves, two mine sites the
  // colony reaches among them, seldom fit, and a map that fails its checks has no file)
  const g = generate(makeSpec({ seed: 7, size: { x: 96, y: 96 } }));
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // (a generated map is named by its standout since M9b, D278: the name the core gave it)
  const name = await page.evaluate(() => window.dgmEditor!.info().name);
  await expect(page.locator(".editor-title h1")).toHaveText(name);
  await expect(page.locator(".editor-title .muted")).toHaveText("Seed 4242 · 96×96");
  expect(new URL(page.url()).hash).toMatch(/^#(v=[^&]+&)?s=4242&/);

  await page.getByLabel("Open a map or project file").setInputFiles({ name: "My island.timber", mimeType: "application/zip", buffer: Buffer.from(g.bytes) });
  await expect(page.locator(".editor-title h1")).toHaveText("My island", { timeout: 60_000 });
  await expect(page.locator(".editor-title .muted")).toHaveText("96×96");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");

  const yours = await openYourMaps(page);
  await expect(yours.getByRole("button")).toHaveCount(2, { timeout: 30_000 });
  await expect(yours.locator("button[aria-current=true]")).toContainText("My island");
  await yours.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator(".editor-title h1")).toHaveText(name, { timeout: 60_000 });
});
