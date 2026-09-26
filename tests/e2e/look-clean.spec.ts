// Kyler's clean look in the page: the 3D view opens clean, with **Markers** off; the button turns
// on the information layer (slope arrows, dam sites, level lines, far-off objects drawn larger)
// and the choice lasts; in the editor, the Dam sites view button shows the dam sites with the
// markers, and the shelf's Slope shows them while it is out; each puts them away after.

import { expect, test, type Page } from "@playwright/test";

/** Whether the view draws the markers, and whether the slopes' arrows are shown. */
const state = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { markers: boolean; objects: { children: { name: string; visible: boolean }[] } | null };
    const arrows = r.objects?.children.find((c) => c.name.startsWith("Slope.mark"));
    return { markers: r.markers, arrows: arrows ? arrows.visible : null };
  });

test("the 3D view is clean until Markers turns the information layer on", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });

  // clean: no markers, no slope arrows; the legend keeps the markers' lines apart
  const button = page.getByRole("button", { name: "Markers", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  let s = await state(page);
  expect(s.markers).toBe(false);
  expect(s.arrows).not.toBe(true);
  const legend = page.locator(".view3d-legend");
  await expect(legend).toContainText("Slopes: stone ramps");
  await expect(legend).toContainText("With Markers on");

  // on: the arrows show, and the choice lasts into the editor
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  s = await state(page);
  expect(s.markers).toBe(true);
  expect(s.arrows).not.toBe(false);
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d && window.dgm3d.renderer.size?.W === 96, null, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Markers", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await state(page)).markers).toBe(true);

  // off again
  await page.getByRole("button", { name: "Markers", exact: true }).click();
  expect((await state(page)).markers).toBe(false);

  // the Dam sites view button shows the dam sites, with the markers; off again, the clean view
  const markers = page.getByRole("button", { name: "Markers", exact: true });
  const dams = page.getByRole("group", { name: "View" }).getByRole("button", { name: "Dam sites", exact: true });
  await dams.click();
  await expect(dams).toHaveAttribute("aria-pressed", "true");
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  expect((await state(page)).markers).toBe(true);
  await dams.click();
  await expect(dams).toHaveAttribute("aria-pressed", "false");
  await expect(markers).toHaveAttribute("aria-pressed", "false");
  expect((await state(page)).markers).toBe(false);
  // the shelf's Slope shows the markers (the slopes' arrows) while it is out
  const slope = page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Slope", exact: true });
  await slope.click();
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  await slope.click();
  await expect(markers).toHaveAttribute("aria-pressed", "false");

  // the dam sites on, the markers stay on when Slope is put away
  await dams.click();
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  await slope.click();
  await slope.click();
  await expect(dams).toHaveAttribute("aria-pressed", "true");
  expect((await state(page)).markers).toBe(true);
  expect(errors).toEqual([]);
});
