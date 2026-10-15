// The object window, History and the water layers' caption (EDITOR_PLAN §3): every setting is the bar's own slider
// with its value or a segmented choice, never a dropdown; trees, bushes and thorns have the brush's Size and Density
// (and a tree's Age) and no Turn; History is a panel like Your maps with the steps as rows, the current one selected;
// the Badwater caption shows its colours as swatches.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** Esc reaches the page only from the map: a slider or button just used holds the focus. */
const putAway = async (page: Page) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
};
const applied = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);

test("the object window has sliders with their values and segmented choices, never a dropdown", async ({ page }) => {
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  const shelf = page.getByRole("navigation", { name: "Place" });
  const none = (name: string) => page.getByRole("group", { name }).locator("select");

  // a ruin: Height is a slider saying its levels; a relic: Size is a choice; each with Turn
  await shelf.getByRole("button", { name: "Ruin", exact: true }).click();
  const ruin = page.getByRole("group", { name: "Ruin options" });
  const height = ruin.getByRole("slider", { name: "Height" });
  await height.fill("5");
  await expect(ruin.locator(".ow-value").first()).toHaveText("5 levels");
  await expect(none("Ruin options")).toHaveCount(0);
  await putAway(page);
  await shelf.getByRole("button", { name: "Relic", exact: true }).click();
  const relic = page.getByRole("group", { name: "Relic options" });
  await relic.getByRole("group", { name: "Size" }).getByRole("button", { name: "Large" }).click();
  await expect(relic.getByRole("group", { name: "Size" }).getByRole("button", { name: "Large" })).toHaveAttribute("aria-pressed", "true");
  await expect(relic.getByRole("group", { name: "Turn" })).toBeVisible();
  await expect(none("Relic options")).toHaveCount(0);
  await putAway(page);

  // the next source: a slider, its strength said at the right of its name
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  const next = page.getByRole("group", { name: "Water source options" });
  await next.getByRole("slider", { name: "Next source" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(next.locator(".ow-value").first()).not.toHaveText("1 water/s");
  await expect(none("Water source options")).toHaveCount(0);
  await putAway(page);

  // a source picked on the map: Strength, Water and Power
  const p = await client(page, 30, 30);
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  await putAway(page);
  await page.mouse.click(p.x, p.y);
  const row = page.getByRole("group", { name: "Water source, selected" });
  await expect(row).toBeVisible();
  await expect(none("Water source, selected")).toHaveCount(0);
  // (the strength's value reads at the right of its name; the slider moves it, one step)
  const strength = row.getByRole("slider", { name: "Strength", exact: true });
  // (the source takes the Next source strength set above: 1.5)
  await expect(row.locator(".ow-value").first()).toHaveText("1.5 water/s");
  await strength.focus();
  await page.keyboard.press("ArrowRight");
  await idle(page);
  await expect(row.locator(".ow-value").first()).not.toHaveText("1.5 water/s");
  // (Unleash's power says its word)
  await row.getByRole("slider", { name: "Unleash power" }).fill("5");
  await expect(row.locator(".ow-value").nth(1)).toHaveText(/\S/);
  // (clean or bad: a choice, one step)
  const water = row.getByRole("group", { name: "Water" });
  await expect(water.getByRole("button", { name: "Clean" })).toHaveAttribute("aria-pressed", "true");
  await water.getByRole("button", { name: "Badwater" }).click();
  await idle(page);
  await expect.poll(async () => (await applied(page)).at(-1)).toBe("Make a source badwater");
  await expect(page.getByRole("group", { name: "Badwater source, selected" }).getByRole("group", { name: "Water" }).getByRole("button", { name: "Badwater" })).toHaveAttribute("aria-pressed", "true");
});

test("trees, bushes and thorns have Size and Density, a tree an Age, and none a Turn; a drag follows them", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  const shelf = page.getByRole("navigation", { name: "Place" });
  const names = async (what: string) => page.getByRole("group", { name: what }).locator(".ow-name").allTextContents();

  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  expect(await names("Pine options")).toEqual(["Size", "Density", "Age"]);
  await expect(page.getByRole("group", { name: "Age" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Turn" })).toHaveCount(0);
  await putAway(page);
  await shelf.getByRole("button", { name: "Berry bush", exact: true }).click();
  expect(await names("Berry bush options")).toEqual(["Size", "Density"]);
  await expect(page.getByRole("group", { name: "Age" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Turn" })).toHaveCount(0);
  await putAway(page);
  await shelf.getByRole("button", { name: "Thorns", exact: true }).click();
  expect(await names("Thorns options")).toEqual(["Size", "Density"]);
  await expect(page.getByRole("group", { name: "Turn" })).toHaveCount(0);
  await putAway(page);

  // the same stroke, dense and sparse: the dense plants more; Mixed age plants grown trees and saplings
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  await page.getByRole("slider", { name: "Size" }).fill("10");
  const a = await client(page, 40, 50);
  const b = await client(page, 56, 50);
  const stroke = async () => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await idle(page);
    const label = (await applied(page)).at(-1)!;
    return Number(/^Plant (\d+) pines$/.exec(label)?.[1] ?? NaN);
  };
  await page.getByRole("slider", { name: "Density" }).fill("100");
  const dense = await stroke();
  await page.keyboard.press("Control+z");
  await idle(page);
  await page.getByRole("slider", { name: "Density" }).fill("20");
  const sparse = await stroke();
  expect(dense).toBeGreaterThan(40);
  expect(sparse).toBeGreaterThan(0);
  expect(sparse).toBeLessThan(dense / 2);
  await page.keyboard.press("Control+z");
  await idle(page);
  await page.getByRole("group", { name: "Age" }).getByRole("button", { name: "Mixed" }).click();
  await page.getByRole("slider", { name: "Density" }).fill("100");
  await stroke();
  const growth = await page.evaluate(async () => {
    const m = window.dgm3d!.renderer.mapState()!;
    let young = 0;
    let grown = 0;
    for (let k = 0; k < m.entities.count; k++) {
      if (m.entities.templates[m.entities.template[k]] !== "Pine") continue;
      const list = await window.dgmEditor!.worker.entitiesAt(m.entities.x[k], m.entities.y[k]);
      const g = (list.find((e) => e.template === "Pine")?.components as { Growable?: { GrowthProgress?: number } } | undefined)?.Growable?.GrowthProgress;
      if (g !== undefined && g < 1) young++;
      else grown++;
    }
    return { young, grown };
  });
  expect(growth.young).toBeGreaterThan(0);
  expect(growth.grown).toBeGreaterThan(0);
});

test("History is a panel with a heading row and its steps as rows, the current one selected", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Berry bush", exact: true }).click();
  const at = await client(page, 40, 50);
  await page.mouse.click(at.x, at.y);
  await idle(page);
  await putAway(page);
  await page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "History", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "History" });
  await expect(panel.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(panel.locator(".muted")).toHaveCount(0);
  const rows = panel.locator(".hist-row");
  await expect(rows.first()).toHaveText("The generated map");
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(2);
  // (the current step selected; a click on the first goes back to it, and its step is dimmed as undone)
  await expect(rows.nth(n - 1)).toHaveAttribute("aria-current", "true");
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
  await expect(rows.nth(n - 1)).toHaveClass(/undone/);
  // (the heading row is Your maps': the same height and place)
  await panel.getByRole("button", { name: "Close the history" }).click();
  await expect(panel).toHaveCount(0);
});

test("the Badwater caption shows its colours as swatches, not their names", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("checkbox", { name: "Badwater" }).click();
  const caption = page.locator(".layer-legend").first();
  await expect(caption.locator(".layer-row")).toHaveText(["Badwater", "Contaminated soil"]);
  await expect(caption.locator(".layer-row .swatch")).toHaveCount(2);
  await expect(caption).not.toContainText(/brown/i);
});

test("trees, bushes and thorns take the one key habit: { } its Size, [ ] and F+scroll its Density, F and the mouse its Size", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Pine", exact: true }).click();
  const win = page.getByRole("group", { name: "Pine options" });
  const value = (n: number) => win.locator(".ow-value").nth(n);
  const at = await client(page, 40, 50);
  await page.mouse.move(at.x + 3, at.y);
  await page.mouse.move(at.x, at.y);
  // (their tooltips end with the keys)
  await expect(win.getByRole("slider", { name: "Size" })).toHaveAttribute("data-keys", "F|{|}");
  await expect(win.getByRole("slider", { name: "Density" })).toHaveAttribute("data-keys", "F+scroll|[|]");
  await expect(value(0)).toHaveText("4 tiles");
  await page.keyboard.press("}");
  await page.keyboard.press("}");
  await expect(value(0)).toHaveText("6 tiles");
  await page.keyboard.press("{");
  await expect(value(0)).toHaveText("5 tiles");
  await expect(value(1)).toHaveText("80%");
  await page.keyboard.press("]");
  await expect(value(1)).toHaveText("85%");
  await page.keyboard.press("[");
  await page.keyboard.press("[");
  await expect(value(1)).toHaveText("75%");
  // F held with the wheel: the density, never the zoom
  await page.keyboard.down("f");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("f");
  await expect(value(1)).toHaveText("70%");
  // F and the mouse: the ring's size follows the pointer, a click keeps it
  await page.keyboard.down("f");
  const far = await client(page, 50, 50);
  await page.mouse.move(far.x, far.y, { steps: 6 });
  await expect(value(0)).not.toHaveText("5 tiles");
  const sized = await value(0).textContent();
  await page.mouse.click(far.x, far.y);
  await page.keyboard.up("f");
  await expect(value(0)).toHaveText(sized!);
  // the shortcuts panel lists them
  await page.keyboard.press("?");
  await expect(page.getByText("Strength, power or density").first()).toBeVisible();
});
