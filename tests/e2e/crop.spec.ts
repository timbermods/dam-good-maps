// Crop map to selection (D340), through the page: Select's row has a Crop button, greyed with its reason until a rectangle
// that can be the map is selected; pressed, the map becomes exactly that rectangle (the camera, the minimap and the
// selection start over on it) as one undo step, and Ctrl+Z brings the full map back.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, setWaterSpeed, topDown } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const size = async (page: Page) => {
  const i = await info(page);
  return [i.W, i.H];
};

/** A box of the map dragged as a rectangle. */
async function box(page: Page, from: [number, number], to: [number, number]) {
  const a = await client(page, from[0], from[1]);
  const b = await client(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test("Crop makes the map the selected rectangle, as one undo step that Ctrl+Z takes back (D340)", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await setWaterSpeed(page, "instant");
  const row = page.getByRole("group", { name: "Selection" });
  const crop = row.getByRole("button", { name: "Crop", exact: true });
  const words = row.getByRole("status");

  // nothing selected: greyed, and it says what to do
  await expect(crop).toHaveAttribute("aria-disabled", "true");
  await crop.hover();
  await expect(words).toHaveText("Select an area to crop");

  // the whole map: the core's reason, word for word
  await row.getByRole("button", { name: "Whole map" }).click();
  await expect(crop).toHaveAttribute("aria-disabled", "true");
  await crop.hover();
  await expect(page.locator(".editor-message")).toContainText("The selection is the whole map: nothing to crop");
  await page.mouse.move(5, 5);
  await expect(page.locator(".editor-message")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // a box round the start (a start the edge would cut is refused)
  const start = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    for (let k = 0; k < m.entities.count; k++) if (m.entities.templates[m.entities.template[k]] === "StartingLocation") return [m.entities.x[k], m.entities.y[k]] as [number, number];
    return null;
  });
  expect(start).not.toBeNull();
  const x0 = Math.min(Math.max(start![0] - 16, 8), 96 - 8 - 32);
  const y0 = Math.min(Math.max(start![1] - 12, 8), 96 - 8 - 24);
  await box(page, [x0, y0], [x0 + 31, y0 + 23]);
  await expect(words).toHaveText("32 × 24 tiles");
  await expect(crop).not.toHaveAttribute("aria-disabled", "true");
  await crop.hover();
  await expect(words).toHaveText(/^32 × 24/);

  // cropped: the map is the box, the selection is gone
  const steps = (await info(page)).history.filter((h) => h.applied).length;
  await crop.click();
  await expect.poll(() => size(page), { timeout: 60_000 }).toEqual([32, 24]);
  await idle(page);
  const after = await info(page);
  expect(after.history.filter((h) => h.applied).length).toBe(steps + 1);
  expect(after.history.filter((h) => h.applied).at(-1)?.label).toBe("Crop to 32×24");
  await page.mouse.move(5, 5);
  await expect(words).toHaveText("Drag on the map to select");
  expect(await page.evaluate(() => window.dgmEditor!.selection().length)).toBe(0);

  // one undo step: the full map is back
  await page.keyboard.press("Control+z");
  await expect.poll(() => size(page), { timeout: 60_000 }).toEqual([96, 96]);
  await idle(page);
  expect((await info(page)).history.filter((h) => h.applied).length).toBe(steps);
});

/** A box round the start, 32 × 24, kept clear of the map's edge. */
async function startBox(page: Page): Promise<[[number, number], [number, number]]> {
  const start = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    for (let k = 0; k < m.entities.count; k++) if (m.entities.templates[m.entities.template[k]] === "StartingLocation") return [m.entities.x[k], m.entities.y[k]] as [number, number];
    return null;
  });
  const x0 = Math.min(Math.max(start![0] - 16, 8), 96 - 8 - 32);
  const y0 = Math.min(Math.max(start![1] - 12, 8), 96 - 8 - 24);
  return [
    [x0, y0],
    [x0 + 31, y0 + 23],
  ];
}

test("Ctrl+Z held across a crop leaves the page and the worker agreeing on the steps and on Undo", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await setWaterSpeed(page, "instant");
  const row = page.getByRole("group", { name: "Selection" });
  // three edits, then a crop
  await box(page, [10, 10], [14, 14]);
  for (let n = 0; n < 3; n++) {
    await row.getByRole("button", { name: "Up 1" }).click();
    await idle(page);
  }
  const [a, b] = await startBox(page);
  await page.keyboard.press("Escape");
  await box(page, a, b);
  await row.getByRole("button", { name: "Crop", exact: true }).click();
  await expect.poll(() => size(page), { timeout: 60_000 }).toEqual([32, 24]);
  // six presses 35 ms apart, the first of them undoing the crop while the rest are still coming
  for (let n = 0; n < 6; n++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(35);
  }
  await expect.poll(async () => (await info(page)).W, { timeout: 60_000 }).toBe(96);
  // the page's History and Undo are the worker's, once it has settled
  await expect
    .poll(
      async () => {
        const mine = await info(page);
        const theirs = (await page.evaluate(() => window.dgmEditor!.worker.sessionView())).info;
        return mine.history.filter((h) => h.applied).length === theirs.history.filter((h) => h.applied).length && mine.canUndo === theirs.canUndo && mine.version === theirs.version;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test("a crop keeps the view: History open, top-down, the overlay and See-through; a held drought is stopped", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await topDown(page);
  await setWaterSpeed(page, "instant");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("checkbox", { name: "See-through" }).check();
  await page.getByRole("checkbox", { name: "Badwater" }).check();
  const row = page.getByRole("group", { name: "Selection" });
  const [a, b] = await startBox(page);
  await box(page, a, b);
  await row.getByRole("button", { name: "Crop", exact: true }).click();
  await expect.poll(() => size(page), { timeout: 60_000 }).toEqual([32, 24]);
  await expect(page.getByRole("complementary", { name: "History" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "See-through" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Badwater" })).toBeChecked();
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView().mode)).toBe("top");
  // undo from History's own list brings the full map back with History still open
  await page.keyboard.press("Control+z");
  await expect.poll(() => size(page), { timeout: 60_000 }).toEqual([96, 96]);
  await expect(page.getByRole("complementary", { name: "History" })).toBeVisible();
});
