// Glaciate (PLAN §20 D246, D258, D265, D266, D289, D291, D292), through the page: its button in the
// forces group (key -), its row only Power, Size (Auto), Meltwater and Try another; a click Flows and a
// drag draws its path, the line showing as it is drawn (D321 item 41: no route, outline or footprint on
// the land); the
// camera never moves on its own; Fast's pace or Slow forces', never the water's speed (D321); kept as one undo step
// exactly as shown, Ctrl+Z takes it back at once (Esc skips it to its end, D344 A4), Try another
// varies it and undo brings the first back.

import { expect, test, type Page } from "@playwright/test";
import { FAST_MS, MIN_SHOW_MS, showMs, WATCH_FACTOR } from "../../src/editor/forceDriver";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const worker = (page: Page) => page.evaluate(async () => Array.from((await window.dgmEditor!.worker.terrainNow()).heights));
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const gesture = (page: Page) => page.evaluate(() => window.dgmEditor!.gesture());
const view = (page: Page) => page.evaluate(() => JSON.stringify(window.dgm3d!.renderer.getView()));
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function refine(page: Page, hash = "s=4242&z=96&d=n&t=highlands") {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
}

/** High, dry ground the map (not a bar over it) takes the clicks at, with room round it. */
async function high(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let best: [number, number] = [m.W >> 1, m.H >> 1];
    let top = -1;
    for (let y = 18; y < m.H - 18; y += 2)
      for (let x = 18; x < m.W - 18; x += 2) {
        const h = m.heights[y * m.W + x];
        if (h <= top || m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || !onMap(x - 12, y) || !onMap(x + 12, y) || !onMap(x, y - 12) || !onMap(x, y + 12)) continue;
        top = h;
        best = [x, y];
      }
    return best;
  });
}

async function settled(page: Page) {
  await expect.poll(() => status(page), { timeout: 60_000 }).toBeNull();
  await idle(page);
}

test("Glaciate's row is Power, Size, Meltwater, Try another and More (D289, D309); its details closed by default", async ({ page }) => {
  await refine(page);
  await expect(page.getByRole("button", { name: /^Glaciate/ })).toBeVisible();
  await page.keyboard.press("-");
  const row = page.getByRole("group", { name: "Glaciate options" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("group", { name: "Mode" })).toHaveCount(0);
  await expect(row.getByRole("slider")).toHaveCount(2);
  await expect(row.getByRole("slider", { name: "Power" })).toBeVisible();
  await expect(row.getByRole("slider", { name: "Size" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Size follows Power" })).toBeVisible();
  await expect(row.getByRole("checkbox")).toHaveCount(1);
  await expect(row.getByLabel("Meltwater")).toBeChecked();
  await expect(row.getByRole("combobox")).toHaveCount(0);
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "More"]);
  await expect(page.getByRole("group", { name: "Glaciate details" })).toHaveCount(0);
  // once one is kept: Try another joins them
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await settled(page);
  await expect(row.getByRole("button", { name: "Try another" })).toBeVisible();
  expect(await row.getByRole("button").evaluateAll((els) => els.map((e) => e.textContent!.trim()))).toEqual(["Auto", "Try another", "More"]);
  await expect(row.getByRole("slider")).toHaveCount(2);
});

test("Glaciate's More (D309): its benches, steps, tarn and scree, each on Auto; after a run each shows what it drew; a pin survives Try another", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("-");
  const row = page.getByRole("group", { name: "Glaciate options" });
  await row.getByRole("button", { name: "More" }).click();
  const details = page.getByRole("group", { name: "Glaciate details" });
  await expect(details).toBeVisible();
  expect(await details.getByRole("group", { name: "Benches" }).getByRole("button").allTextContents()).toEqual(["Sheer walls", "Some benches", "Many benches"]);
  expect(await details.getByRole("group", { name: "Steps" }).getByRole("button").allTextContents()).toEqual(["Few steps", "Some steps", "Many steps"]);
  await expect(details.getByRole("checkbox", { name: "Tarn" })).toBeVisible();
  await expect(details.getByRole("checkbox", { name: "Scree" })).toBeVisible();
  for (const name of ["Benches follows the land", "Steps follows the land", "Tarn follows the land", "Scree follows the land"]) await expect(details.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await settled(page);
  const tarn = await details.getByRole("checkbox", { name: "Tarn" }).isChecked();
  // pin the tarn to the opposite (setting it pins it); Try another keeps that pin
  await details.getByRole("checkbox", { name: "Tarn" }).click();
  await expect(details.getByRole("button", { name: "Tarn follows the land" })).toHaveAttribute("aria-pressed", "false");
  await expect(details.getByRole("checkbox", { name: "Tarn" })).toBeChecked({ checked: !tarn });
  await row.getByRole("button", { name: "Try another" }).click();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Try another");
  await expect(details.getByRole("checkbox", { name: "Tarn" })).toBeChecked({ checked: !tarn });
  await expect(details.getByRole("button", { name: "Tarn follows the land" })).toHaveAttribute("aria-pressed", "false");
  // and More stays open, remembered
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await expect(page.getByRole("group", { name: "Glaciate details" })).toBeVisible();
});

test("a click Flows at once, the camera still (D265); kept as one step exactly as shown; Ctrl+Z takes it back at once; Try another varies it and undo brings the first back", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("-");
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  // the cursor shows where it acts, nothing more (D258)
  await page.mouse.move(p.x + 4, p.y + 4);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await expect
    .poll(async () => {
      const c = (await gesture(page)).cursor;
      return !!c && Math.abs(c[0] - at[0]) <= 1 && Math.abs(c[1] - at[1]) <= 1;
    })
    .toBe(true);
  expect((await gesture(page)).stroke).toBeNull();
  const before = await heights(page);
  const n0 = (await labels(page)).length;
  const v0 = await view(page);
  // Ctrl+Z while the ice moves: all of it goes at once
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => status(page)).not.toBeNull();
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+z");
  await settled(page);
  expect(await heights(page)).toEqual(before);
  expect((await labels(page)).length).toBe(n0);
  // to its end: the camera never moves, one step, the page's land the worker's
  const views = new Set<string>();
  await page.mouse.click(p.x, p.y);
  for (let k = 0; k < 200 && (await status(page)); k++) {
    views.add(await view(page));
    await page.waitForTimeout(40);
  }
  await settled(page);
  views.add(await view(page));
  expect([...views]).toEqual([v0]);
  expect((await labels(page)).at(-1)).toBe("Glaciate");
  expect((await labels(page)).length).toBe(n0 + 1);
  const first = await heights(page);
  expect(first).not.toEqual(before);
  expect(await worker(page)).toEqual(first);
  // Try another: the same glacier from the same land, another way
  await page.getByRole("group", { name: "Glaciate options" }).getByRole("button", { name: "Try another" }).click();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Try another");
  const second = await heights(page);
  let differ = 0;
  for (let i = 0; i < second.length; i++) if (second[i] !== first[i]) differ++;
  expect(differ).toBeGreaterThan(30);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await heights(page)).toEqual(first);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await heights(page)).toEqual(before);
});

test("a drag draws its path (D321, item 41): only the line drawn, no route or footprint on the land; let go, it grinds along it (D258)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("-");
  const at = await high(page);
  const dx = at[0] < 48 ? 1 : -1;
  const a = await client(page, at[0], at[1]);
  const b = await client(page, at[0] + 10 * dx, at[1] + 6);
  const c = await client(page, at[0] + 20 * dx, at[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.move(c.x, c.y, { steps: 8 });
  await expect.poll(async () => (await gesture(page)).stroke ?? 0).toBeGreaterThan(10);
  expect((await gesture(page)).cursor).toBeNull();
  await expect(page.locator(".shape-note")).toHaveCount(0);
  expect(await status(page)).toBeNull();
  await page.mouse.up();
  await expect.poll(async () => (await gesture(page)).stroke).toBeNull();
  await settled(page);
  expect((await labels(page)).at(-1)).toBe("Glaciate");
  expect(await worker(page)).toEqual(await heights(page));
});

test("a glacier's pace is Fast's, whatever the water's speed (D266, amended by D321's item 29)", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("-");
  const at = await high(page);
  const timed = async (speed: string) => {
    await page.getByRole("combobox", { name: "Water speed" }).selectOption(speed);
    const p = await client(page, at[0], at[1]);
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await page.evaluate(() => window.dgmEditor!.forceTiming()))?.kept ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    const t = (await page.evaluate(() => window.dgmEditor!.forceTiming()))!;
    await idle(page);
    await page.keyboard.press("Control+z");
    await idle(page);
    return t;
  };
  const slow = await timed("slower");
  const quick = await timed("instant");
  // the same glacier, shown at Fast's pace either way: its showing is the force's own (its steps, the
  // time it took to work out), never the water's. (D341: the pace as the page plans it, not the wall
  // clock of a busy machine; the driver keeps to its plan on exact time in forceDriver.test.)
  expect(quick.total).toBe(slow.total);
  for (const t of [slow, quick]) {
    expect(t.speed).toBe("fast");
    expect(Math.abs(t.show - showMs("glaciate", t.total, "fast", t.worked))).toBeLessThanOrEqual(1);
    expect(t.due).toBeLessThanOrEqual(Math.max(FAST_MS, t.worked + MIN_SHOW_MS) + 1);
  }
});

test("Glaciate's size at the cursor (D312): a faint ring of its width, its Size alone (D368 (3): Power is how deep, never how wide); no route or outline", async ({ page }) => {
  await refine(page);
  await page.keyboard.press("-");
  const row = page.getByRole("group", { name: "Glaciate options" });
  const at = await high(page);
  const p = await client(page, at[0], at[1]);
  await row.getByRole("slider", { name: "Power" }).fill("20");
  await page.mouse.move(p.x + 4, p.y);
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await gesture(page)).ring).not.toBeNull();
  // (Auto: round 4's width, whatever the Power)
  expect((await gesture(page)).ring).toBe(15);
  await row.getByRole("slider", { name: "Power" }).fill("90");
  await page.waitForTimeout(100);
  expect((await gesture(page)).ring).toBe(15);
  await row.getByRole("slider", { name: "Size" }).fill("20");
  await expect.poll(async () => (await gesture(page)).ring).toBe(10);
  expect((await gesture(page)).stroke).toBeNull();
});
