// The Select row and the single-key shortcuts (PLAN §20 D323, feedback items 6, 16, 43, 1 and 44):
// the marking modes as icons, Whole map, Raise and Lower one level a click (and Up and Down), a level
// number starting at the selection's lowest with Flatten, Cut down and Fill up acting at once, no
// Dig out, hover previews; Z undoes, C redoes, X closes the selection; Quake's side flips on V;
// Clear everything in the ⋯ menu; a map without a start says so and the save refuses.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const selection = (page: Page) => page.evaluate(() => window.dgmEditor!.selection());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function refine(page: Page) {
  await page.goto("./#s=4242&z=96&d=n&t=highlands");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("instant");
}

/** A box of the map where the map (not a bar) takes the pointer, dragged as a rectangle. */
async function box(page: Page, from: [number, number], to: [number, number]) {
  const a = await client(page, from[0], from[1]);
  const b = await client(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test("the Select row: Whole map, Raise and Lower one level, Up and Down, a level starting at the lowest, no Dig out (items 6 and 43)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("m");
  const row = page.getByRole("group", { name: "Selection" });
  // no old buttons
  await expect(row.getByRole("button", { name: "Dig out" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Set level" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Delete sources" })).toHaveCount(0);
  // Whole map selects everything at once, as Ctrl+A does
  await row.getByRole("button", { name: "Whole map" }).click();
  await expect(row.getByRole("status")).toHaveText("96 × 96 tiles");
  const h0 = await heights(page);
  await page.keyboard.press("Escape");
  // a small box: the level number starts at its lowest ground
  await page.keyboard.press("m");
  const c: [number, number] = [40, 40];
  await box(page, [c[0] - 3, c[1] - 3], [c[0] + 3, c[1] + 3]);
  const W = 96;
  const tiles = await selection(page);
  expect(tiles.length).toBe(49);
  const lowest = Math.min(...tiles.map((i) => h0[i]));
  await expect(row.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue(String(lowest));
  // Raise: one level per click, one step; Lower likewise
  const n0 = (await labels(page)).length;
  await row.getByRole("button", { name: "Up 1" }).click();
  await idle(page);
  expect((await labels(page)).length).toBe(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Raise 49 tiles by 1");
  const h1 = await heights(page);
  for (const i of tiles) expect(h1[i], `tile ${i}`).toBeGreaterThanOrEqual(h0[i]);
  expect(tiles.some((i) => h1[i] === h0[i] + 1)).toBe(true);
  // Down lowers one level (the camera does not take the key while a selection is open), Up raises one
  await page.keyboard.press("ArrowDown");
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Lower 49 tiles by 1");
  await page.keyboard.press("ArrowUp");
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Raise 49 tiles by 1");
  // Z undoes and C redoes (the whole of it, as Ctrl+Z does)
  await page.keyboard.press("z");
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Lower 49 tiles by 1");
  await page.keyboard.press("c");
  await idle(page);
  expect((await labels(page)).at(-1)).toBe("Raise 49 tiles by 1");
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press("z");
    await idle(page);
  }
  await expect.poll(() => heights(page)).toEqual(h0);
  // Cut down to the level acts at once: nothing in the box is above it after
  await row.getByRole("spinbutton", { name: "Level", exact: true }).fill(String(lowest));
  await row.getByRole("button", { name: "Cut down" }).click();
  await idle(page);
  const cut = await heights(page);
  for (const i of tiles) expect(cut[i]).toBe(lowest);
  expect((await labels(page)).at(-1)).toMatch(/^Cut \d+ tiles down to level \d+$/);
  await page.keyboard.press("z");
  await idle(page);
  // hovering an action shows what it would change, on the land inside the selection (a tinted overlay)
  const before = await page.evaluate(() => window.dgm3d!.renderer.overlayData()!.reduce((n, v, k) => (k % 4 === 3 && v ? n + 1 : n), 0));
  await row.getByRole("button", { name: "Up 1" }).hover();
  const hovered = await page.evaluate(() => window.dgm3d!.renderer.overlayData()!.reduce((n, v, k) => (k % 4 === 3 && v ? n + 1 : n), 0));
  expect(hovered).toBeGreaterThan(before);
  // X closes the selection, as Esc does
  await page.mouse.move(5, 5);
  await page.keyboard.press("x");
  await expect(row).toHaveCount(0);
  expect(await selection(page)).toEqual([]);
  void W;
});

test("Clear everything, a map without a start, and Z and C (items 44 and 16)", async ({ page }) => {
  await refine(page);
  const objects = () =>
    page.evaluate(() => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      const out: string[] = [];
      for (let k = 0; k < e.count; k++) out.push(e.templates[e.template[k]]);
      return out;
    });
  expect((await objects()).length).toBeGreaterThan(20);
  const h0 = await heights(page);
  const n0 = (await labels(page)).length;
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear everything" }).click();
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(n0 + 1);
  expect((await labels(page)).at(-1)).toBe("Clear everything");
  expect(await objects()).toEqual([]);
  expect(await heights(page)).toEqual(h0);
  // no start: the checks say so, and the save refuses, saying what to do
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await expect(page.getByRole("region", { name: "Checks" })).toContainText("No start");
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await page.getByRole("button", { name: /^(Save to Timberborn|Download \.timber)$/ }).click();
  await expect(page.getByText(/Place a start first/)).toBeVisible({ timeout: 60_000 });
  // the shelf's Start places one: the label says "Place here", and the click puts it there
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Start", exact: true }).click();
  const p = await client(page, 30, 60);
  await page.mouse.move(p.x + 4, p.y);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(".shape-note")).toHaveText("Place here");
  await page.mouse.click(p.x, p.y);
  await idle(page);
  await expect.poll(async () => (await objects()).filter((t) => t === "StartingLocation").length).toBe(1);
  // Z undoes it (the placement), C brings it back
  await page.keyboard.press("z");
  await idle(page);
  expect((await objects()).filter((t) => t === "StartingLocation").length).toBe(0);
  await page.keyboard.press("c");
  await idle(page);
  expect((await objects()).filter((t) => t === "StartingLocation").length).toBe(1);
  // undoing Clear everything brings all of it back in one step
  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await idle(page);
  expect((await objects()).length).toBeGreaterThan(20);
});

test("four rows, top to bottom: the view bar, the tools, the forces, then the active tool's settings (item 9, structure only; the forces in their clusters by prominence, D352)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("1");
  const y = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!.y;
  const view = page.getByRole("button", { name: "Top-down" });
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const forces = page.getByRole("group", { name: "Forces" });
  const options = page.getByRole("group", { name: "Raise options" });
  expect(await tools.getByRole("button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()))).toEqual(["Raise", "Lower", "Flatten", "Smooth", "Naturalize", "Select"]);
  expect(await forces.getByRole("button").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()))).toEqual(["Carve", "Craterize", "Erupt", "Quake", "Glaciate"]);
  const ys = [await y(view), await y(tools), await y(forces), await y(options)];
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  expect(new Set(ys).size).toBe(4);
});
