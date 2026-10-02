// Map look's fix round (PLAN §20 D114) in the page: the legend names every meaning the map shows. No dam
// site is drawn on the map (D287: the preview's best dam site, hatched before, is gone; D148). The legend
// lists only what the map has: a meaning the map lacks is left out (D148). On the one-window page (D330)
// the legend is the map card's (DESIGN.md, "What is on this map"), not the slim panel beside the 3D view.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("the card's legend names every meaning the map shows, only those, and no dam site is drawn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const legend = page.getByRole("region", { name: "This map" });
  for (const text of ["Living trees and bushes", "The start: district center", "Slopes: arrows point uphill", "Ruins", "Mine site", "Geothermal field", "Water source", "Badwater source"])
    await expect(legend).toContainText(text);
  // water mixed with badwater is named when the map has some, and only then
  const mixed = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    for (let i = 0; i < m.W * m.H; i++) if (m.surface.depth[i] > 0.05 && m.surface.contamination[i] >= 0.05 && m.surface.contamination[i] < 0.9) return true;
    return false;
  });
  if (mixed) await expect(legend).toContainText("Water mixed with badwater");
  else await expect(legend).not.toContainText("Water mixed with badwater");
  const hatched = await page.evaluate(() => {
    const d = window.dgm3d!.renderer.overlayData()!;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++;
    return n;
  });
  expect(hatched).toBe(0);
  await expect(legend).not.toContainText("dam site");
  expect(errors).toEqual([]);
});
