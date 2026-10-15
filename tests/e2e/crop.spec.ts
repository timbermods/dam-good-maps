// Crop map to selection (D340), through the page: Select's row has a Crop button, greyed with its reason until a rectangle
// that can be the map is selected; pressed, the map becomes exactly that rectangle (the camera, the minimap and the
// selection start over on it) as one undo step, and Ctrl+Z brings the full map back.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, setWaterSpeed } from "./open";

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
  await page.getByRole("button", { name: "Top-down" }).click();
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
  await expect(words).toHaveText(/^Crop to 32 × 24/);

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
