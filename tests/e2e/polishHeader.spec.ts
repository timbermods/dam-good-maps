// The header and the top-right controls, as the polish audit left them: Rename stops at two lines, the compass faces
// north, the speaker's tooltip stays off the volume, the Look menu is built of the page's own controls, the layer
// arrows and the checks pill read right, and the checks' list never lies over an open Legend.

import { expect, test, type Page } from "@playwright/test";
import { openDrawer, openEditor, openLegend } from "./open";

test.beforeEach(async ({ page }) => {
  // (software drawing would hide the Look menu: treat the machine as having a graphics card, as look-high.spec does)
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });
});

async function open(page: Page, width = 1280, height = 800): Promise<void> {
  await page.setViewportSize({ width, height });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

test("Rename stops at two lines, as Your maps' does: a paste keeps what fits, a key past it does nothing, and the header holds it", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const header = await box(page, "header.editor-bar");
  const field = page.getByLabel("Map name");
  await page.locator(".editor-title .title-button").click();
  // a 77-character name pasted in
  const long = "The Long Quiet Winding River Valley Of The Forgotten Beaver Kingdom Up North Again";
  await field.fill(long);
  const kept = await field.inputValue();
  expect(kept.length).toBeLessThan(long.length);
  expect(long.startsWith(kept)).toBe(true);
  // keys typed past the limit do nothing: the field stops growing and a further key leaves it as it was
  await page.keyboard.press("End");
  await page.keyboard.type("WWWWWWWWWWWWWWWWWWWW");
  const full = await field.inputValue();
  expect(full.length).toBeLessThan(kept.length + 20);
  await page.keyboard.type("W");
  await expect(field).toHaveValue(full);
  await page.keyboard.press("Enter");
  const button = page.locator(".editor-title .title-button");
  await expect(button).toHaveText(full.trim());
  // the name takes two lines at most (the 13px lines at 1280), never overflows, and the header keeps its height
  expect(
    await button.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const tops = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
      return { lines: tops.size, wide: e.scrollWidth > e.clientWidth + 0.5 };
    }),
  ).toEqual({ lines: 2, wide: false });
  expect((await box(page, "header.editor-bar")).height).toBe(header.height);
  // deleting is never limited: a name filling the field loses its first letter and its last whole, and the rest stays
  await button.click();
  await field.fill(long);
  const filled = await field.inputValue();
  await page.keyboard.press("Home");
  await page.keyboard.press("Delete");
  await expect(field).toHaveValue(filled.slice(1));
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(field).toHaveValue(filled.slice(1, -1));
  await page.keyboard.press("Escape");
  // the longest name Rename allowed before still goes in whole
  await button.click();
  await field.fill("Where the Long Winding River Meets");
  await expect(field).toHaveValue("Where the Long Winding River Meets");
  await page.keyboard.press("Escape");
});

test("the compass is a button: Face north glides the view round to north, with its tooltip", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const compass = page.getByRole("button", { name: "Face north" });
  await expect(compass).toBeVisible();
  await expect(compass).toHaveAttribute("title", "Face north");
  // turned away from north first
  await page.evaluate(() => window.dgm3d!.renderer.setView({ yaw: 2.2 }));
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView().yaw)).toBeCloseTo(2.2, 3);
  await compass.hover();
  await expect(page.locator(".tip")).toHaveText("Face north");
  await compass.click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.getView().yaw), { timeout: 5000 }).toBeCloseTo(0, 3);
  // (the camera glides by the existing camera API, so the orbit view stays an orbit view)
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView().mode)).toBe("orbit");
});

test("the speaker's tooltip sits to its left, clear of the volume that opens under it", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [w, h] of [
    [1280, 800],
    [1920, 1080],
  ]) {
    await open(page, w, h);
    const speaker = page.getByRole("button", { name: "Sound" });
    await speaker.hover();
    const tip = page.locator(".tip");
    await expect(tip).toHaveText("Mute sounds");
    const slider = await box(page, 'input[aria-label="Sound volume"]');
    const s = await box(page, "button.speaker");
    const t = (await tip.boundingBox())!;
    expect(t.x + t.width, `the tooltip ends at the speaker's left edge (${w})`).toBeLessThanOrEqual(s.x + 0.5);
    expect(Math.abs(t.y + t.height / 2 - (s.y + s.height / 2)), `level with the speaker's middle (${w})`).toBeLessThanOrEqual(2);
    // nothing of the tooltip over the slider
    const apart = t.x + t.width <= slider.x || t.x >= slider.x + slider.width || t.y + t.height <= slider.y || t.y >= slider.y + slider.height;
    expect(apart, `the tooltip is off the volume slider (${w})`).toBe(true);
    await expect(page.locator('input[aria-label="Sound volume"]')).toBeVisible();
  }
});

test("the Look menu is built of the page's own controls: a segmented choice and checkbox rows with a hanging indent", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: /^Look: / }).click();
  const menu = page.getByRole("group", { name: "Look" });
  await menu.getByRole("button", { name: /^High/ }).click();
  await expect(menu.getByRole("button", { name: /^High/ })).toHaveAttribute("aria-pressed", "true");
  // no browser radios or checkboxes
  await expect(menu.locator("input")).toHaveCount(0);
  const parts = menu.getByRole("checkbox");
  await expect(parts).toHaveCount(4);
  // each row is one box and one word, the word to the right of the box and never under it, the box's 14px the page's
  for (let i = 0; i < 4; i++) {
    const row = parts.nth(i);
    const cb = (await row.locator(".cb").boundingBox())!;
    const word = (await row.locator(".cb-word").boundingBox())!;
    expect(cb.width).toBe(14);
    expect(word.x).toBeGreaterThanOrEqual(cb.x + cb.width);
  }
  // a part switches
  const water = menu.getByRole("checkbox", { name: "Water and soft shadows" });
  await expect(water).toHaveAttribute("aria-checked", "true");
  await water.click();
  await expect(water).toHaveAttribute("aria-checked", "false");
  await water.click();
  await expect(water).toHaveAttribute("aria-checked", "true");
});

test("the tooltips read right: the layer arrows say less and more, the checks pill says what to fix", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await expect(page.getByRole("button", { name: "Lower the visible layer" })).toHaveAttribute("title", "Show one layer less");
  await expect(page.getByRole("button", { name: "Raise the visible layer" })).toHaveAttribute("title", "Show one layer more");
  await expect(page.getByRole("button", { name: /^Checks: / })).toHaveAttribute("title", "What to fix before playing");
});

test("the checks' list closes the Legend while it is open, never lying over it, and the Legend comes back", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [w, h] of [
    [1280, 800],
    [1920, 1080],
  ]) {
    await open(page, w, h);
    const legend = await openLegend(page);
    await expect(legend).toBeVisible();
    await page.getByRole("button", { name: /^Checks: / }).click();
    const list = page.getByRole("region", { name: "Checks" });
    await expect(list).toBeVisible();
    await expect(legend).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(legend).toBeVisible();
  }
});

test("the generator's Name field stops at the same two lines as Rename, and deleting in it is never limited", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await openDrawer(page);
  const field = page.locator("#map-name");
  const long = "The Long Quiet Winding River Valley Of The Forgotten Beaver Kingdom Up North Again";
  await field.fill(long);
  const kept = await field.inputValue();
  expect(kept.length).toBeLessThan(long.length);
  expect(long.startsWith(kept)).toBe(true);
  await page.keyboard.press("Home");
  await page.keyboard.press("Delete");
  await expect(field).toHaveValue(kept.slice(1));
  // what it keeps is what the header shows in two lines
  await page.keyboard.press("Enter");
  const title = page.locator(".editor-title .title-button");
  await expect(title).toHaveText(kept.slice(1).trim());
  expect(
    await title.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size;
    }),
  ).toBeLessThanOrEqual(2);
});
