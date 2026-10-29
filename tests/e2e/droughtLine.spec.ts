// The drought line (the Weather view, D133, D269): the faint waterline of the drought's last day is drawn once the
// worker has it, is put away while a Drought day is held and at the next edit, and comes back for the new map's version.

import { expect, test, type Page } from "@playwright/test";
import { expectReady, openEditor, topDown } from "./open";

const showing = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.droughtLineShowing);

test("a river that dries out completely gets the dry tint as well as the line, drawn in Standard and in High", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=1&z=96&d=n&t=islands");
  const drawn = () => page.evaluate(() => window.dgm3d!.renderer.droughtDrawn);
  await expect.poll(async () => (await drawn()).tint, { timeout: 60_000 }).toBeGreaterThan(0);
  expect((await drawn()).line).toBeGreaterThan(0);
  // (the look changes the tint's strength, not the mesh)
  await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("high"));
  await page.evaluate(() => window.dgm3d!.renderer.renderNow());
  expect((await drawn()).tint).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the drought line shows, goes while a day is held and at an edit, and comes back with the new map's", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  // (it arrives once the drought's days are worked out in the background)
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);

  // a held Drought day shows the water of that day: the line is not drawn over it
  const drought = page.getByRole("button", { name: "Drought", exact: true });
  await drought.click();
  await expect.poll(() => showing(page)).toBe(false);
  await drought.click();
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);

  // an edit makes a new version: the line goes at once and the new map's comes in the background
  const v0 = await page.evaluate(() => window.dgmEditor!.info().version);
  await page.evaluate(() => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[4, 4, 4]], level: 15 } } as never, "Raise a tile"));
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().version)).toBeGreaterThan(v0);
  await expect.poll(() => showing(page), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test("hovering a lake in the Drought view says the day it dries, or that it lasts; off the view it says nothing of the sort (D133)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  // (the map's own water is the canonical settle's, which the Day 0 of both views is)
  await expectReady(page);
  await topDown(page);
  // (a lake: a tile and its eight neighbours all hold water on Day 0; and a dry stretch of ground)
  const spots = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const wet = (x: number, y: number) => m.surface.depth[y * m.W + x] > 0.5;
    const lake: [number, number][] = [];
    let land: [number, number] | null = null;
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        let all = true;
        let none = true;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) (wet(x + dx, y + dy) ? (none = false) : (all = false));
        if (all) lake.push([x, y]);
        if (none && !land && m.surface.depth[y * m.W + x] === 0) land = [x, y];
      }
    return { lake, land };
  });
  expect(spots.lake.length).toBeGreaterThan(0);
  expect(spots.land).not.toBeNull();
  const readout = page.locator(".readout");
  const hover = async ([x, y]: [number, number]) => {
    const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y]);
    await page.mouse.move(p.x + 4, p.y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  };
  const words = /Dry on day [1-9]\d*|Lasts the drought/;

  // the map's own view: the readout says nothing of the drought
  await hover(spots.lake[0]);
  await expect(readout).toContainText("Water");
  await expect(readout).not.toContainText(words);

  // the Drought view held on its last day: the days are all worked out, so every lake tile says one or the other
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await expect(page.locator(".day-words")).toHaveText("Day 9", { timeout: 60_000 });
  const mid = spots.lake[Math.floor(spots.lake.length / 2)];
  for (const spot of [spots.lake[0], mid, spots.lake[spots.lake.length - 1]]) {
    await hover(spot);
    await expect(readout).toContainText(words, { timeout: 30_000 });
  }
  // dry ground says nothing
  await hover(spots.land!);
  await expect(readout).not.toContainText(words);

  // back to the map's own water: the words go
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await expect(page.locator(".day-words")).toHaveText("Day –");
  await hover(spots.lake[0]);
  await expect(readout).toContainText("Water");
  await expect(readout).not.toContainText(words);
  expect(errors).toEqual([]);
});

test("hovering a lake in the Badtide view says the day it turns bad (D133)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  // (the map's own water is the canonical settle's, which the Day 0 of both views is)
  await expectReady(page);
  await topDown(page);
  const lake = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const wet = (x: number, y: number) => m.surface.depth[y * m.W + x] > 0.5;
    const out: [number, number][] = [];
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        let all = true;
        for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if (!wet(x + dx, y + dy)) all = false;
        // (not badwater on Day 0, which is under 5% bad: water already bad then says nothing)
        if (all && m.surface.contamination[y * m.W + x] < 0.05) out.push([x, y]);
      }
    return out;
  });
  expect(lake.length).toBeGreaterThan(0);
  const readout = page.locator(".readout");
  await page.getByRole("button", { name: "Badtide", exact: true }).click();
  await expect(page.locator(".day-words")).toHaveText("Day 8", { timeout: 60_000 });
  // (the lake's water that was not bad on Day 0 and is badwater on the last day: each says the day it turned bad)
  const turnedTiles = () =>
    page.evaluate((tiles) => {
      const m = window.dgm3d!.renderer.mapState()!;
      return tiles.filter(([x, y]) => m.surface.depth[y * m.W + x] > 0.01 && m.surface.contamination[y * m.W + x] >= 0.05);
    }, lake);
  // (the day box says the day asked for at once; the day's water comes when it is worked out)
  await expect.poll(async () => (await turnedTiles()).length, { timeout: 60_000 }).toBeGreaterThan(0);
  const turned = await turnedTiles();
  for (const spot of [turned[0], turned[Math.floor(turned.length / 2)], turned[turned.length - 1]]) {
    const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), spot);
    await page.mouse.move(p.x + 4, p.y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await expect(readout).toContainText(/Turns bad on day [1-9]\d*/);
  }
  expect(errors).toEqual([]);
});

test("an edit while the Drought view is held: the old map's days say nothing on the edited map until its own days come (D133)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  await expectReady(page);
  await topDown(page);
  const lake = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const wet = (x: number, y: number) => m.surface.depth[y * m.W + x] > 0.5;
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        let all = true;
        for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if (!wet(x + dx, y + dy)) all = false;
        if (all) return [x, y] as [number, number];
      }
    return null;
  });
  expect(lake).not.toBeNull();
  const [x, y] = lake!;
  const readout = page.locator(".readout");
  const hover = async () => {
    const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y]);
    await page.mouse.move(p.x + 4, p.y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  };
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await hover();
  await expect(readout).toContainText(/Dry on day [1-9]\d*|Lasts the drought/, { timeout: 60_000 });
  // the lake tile is raised to land while the view is held: it holds no water now, whatever the old map's days said
  const v0 = await page.evaluate(() => window.dgmEditor!.info().version);
  await page.evaluate(([a, b]) => window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[b, a - 1, a + 1]], level: 15 } } as never, "Raise a tile"), [x, y]);
  expect(await page.evaluate(() => window.dgmEditor!.info().version)).toBeGreaterThan(v0);
  await hover();
  await expect(readout).toContainText("Height");
  await expect(readout).not.toContainText(/Dry on day|Lasts the drought/);
  expect(errors).toEqual([]);
});

test("while Drought or Badtide is held, one quiet line says the day the start's water goes or turns bad, or nothing (D133)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=4&z=96&d=n&t=lakeBasin");
  await expectReady(page);
  const note = page.locator(".water-bar .core-moment");
  // (no hazard held: no line)
  await expect(note).toHaveCount(0);
  // a held Drought: the line comes once its days are worked out, whatever day the box shows (this map's start water goes
  // within the drought's 9 days; which day is the generator's map, the day's rule is tests/contract/startWaterDay.test.ts)
  await page.getByRole("button", { name: "Drought", exact: true }).click();
  await expect(page.locator(".day-words")).toHaveText("Day 9", { timeout: 60_000 });
  await expect(note).toHaveText(/^Day [1-9]: your start's water is gone$/, { timeout: 60_000 });
  const gone = (await note.textContent())!;
  for (const shown of ["Day 8", "Day 7"]) {
    await page.getByRole("button", { name: "Day back" }).click();
    await expect(page.locator(".day-words")).toHaveText(shown, { timeout: 60_000 });
    await expect(note, "the line is the hazard's, not the shown day's").toHaveText(gone);
  }
  // the other hazard replaces it: never a drought's claim under a held badtide, whose own line comes with its days
  // (the badtide's own last day: Normal's is Day 8)
  await page.getByRole("button", { name: "Badtide", exact: true }).click();
  await expect(page.locator(".day-words")).toHaveText("Day 8", { timeout: 60_000 });
  await expect(page.getByText("start's water is gone")).toHaveCount(0);
  // (which day is the generator's map, as the drought's above: the day's rule is tests/contract/startWaterDay.test.ts)
  await expect(note).toHaveText(/^Day [1-8]: badwater reaches your start's water$/, { timeout: 60_000 });
  // the hazard put away: no line
  await page.getByRole("button", { name: "Badtide", exact: true }).click();
  await expect(note).toHaveCount(0);
  expect(errors).toEqual([]);
});
