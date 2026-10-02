// Kyler's clean look in the page: the 3D view opens clean, with **Markers** off; the button turns
// on the information layer (slope arrows, level lines, far-off objects drawn larger); the shelf's Slope
// shows the markers while it is out and puts them away after.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

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
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");

  // clean: no markers, no slope arrows
  const button = page.getByRole("button", { name: "Markers", exact: true });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  let s = await state(page);
  expect(s.markers).toBe(false);
  expect(s.arrows).not.toBe(true);

  // on: the arrows show
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  s = await state(page);
  expect(s.markers).toBe(true);
  expect(s.arrows).not.toBe(false);

  // off again
  await page.getByRole("button", { name: "Markers", exact: true }).click();
  expect((await state(page)).markers).toBe(false);

  // no Dam sites view (D287): dam sites are never drawn on the map
  const markers = page.getByRole("button", { name: "Markers", exact: true });
  const viewBar = page.getByRole("group", { name: "View" });
  for (const gone of ["Dam sites", "Moisture", "Drought", "Orbit"]) await expect(viewBar.getByRole("button", { name: gone, exact: true }), gone).toHaveCount(0);
  await expect(viewBar.getByRole("button", { name: "Badwater", exact: true })).toHaveCount(1);
  // the shelf's Slope shows the markers (the slopes' arrows) while it is out
  const slope = page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Slope", exact: true });
  await slope.click();
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  await slope.click();
  await expect(markers).toHaveAttribute("aria-pressed", "false");

  expect(errors).toEqual([]);
});
