// Painting trees on dry ground (PLAN §20 D235): the held tree's ring turns amber and says "dry ground: these
// will die" while any tile under it is soil the plants would die on; over moist ground it stays plain white
// with no note. Painting stays allowed.

import { expect, test, type Page } from "@playwright/test";
import { openEditor, topDown } from "./open";

/** A tile whose surroundings (radius 3) are all dry land with the given soil (moist or dry), nearest the middle. */
async function groundOf(page: Page, moist: boolean): Promise<[number, number] | null> {
  return page.evaluate((want) => {
    const m = window.dgm3d!.renderer.mapState()!;
    const soil = m.soil!;
    let best: [number, number, number] | null = null;
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++)
          for (let dx = -3; dx <= 3 && ok; dx++) {
            const i = (y + dy) * m.W + x + dx;
            if (m.surface.depth[i] > 0 || (soil.moisture[i] > 0) !== want || soil.contamination[i] > 0) ok = false;
          }
        if (!ok) continue;
        const d = Math.abs(x - m.W / 2) + Math.abs(y - m.H / 2);
        if (!best || d < best[2]) best = [x, y, d];
      }
    return best ? ([best[0], best[1]] as [number, number]) : null;
  }, moist);
}

test("a held tree's ring turns amber with a note over dry ground, and is plain over moist ground", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await topDown(page);
  const dry = await groundOf(page, false);
  const moist = await groundOf(page, true);
  expect(dry).not.toBeNull();
  expect(moist).not.toBeNull();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Oak", exact: true }).click();
  const hover = async ([x, y]: [number, number]) => {
    const p = await page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y]);
    await page.mouse.move(p.x + 4, p.y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  };
  const ring = () => page.evaluate(() => window.dgm3d!.renderer.forceRingState);

  await hover(dry!);
  await expect(page.locator(".shape-note")).toHaveText("dry ground: these will die");
  expect((await ring())?.warn).toBe(true);

  await hover(moist!);
  await expect(page.locator(".shape-note")).toHaveCount(0);
  expect((await ring())?.warn).toBeFalsy();
  expect(await ring()).not.toBeNull();
});
