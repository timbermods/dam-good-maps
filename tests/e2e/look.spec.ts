// Map look (ROADMAP "Map look", PLAN §20 D86) in the page: the 3D view colours the ground by soil
// with a legend that says what the colours mean, a toggle switches to height colours (and the
// legend with it), the hover text names the soil, the default camera looks as the game's does
// (30° east of north, 70° down), and the water holds still for a viewer who prefers less motion.
// The editor's view gets the worker's soil.

import { expect, test, type Page } from "@playwright/test";

interface Soil {
  moisture: Uint8Array;
  contamination: Uint8Array;
}

/** The soil and ground the view draws (the renderer's own state, read for the test). */
async function viewState(page: Page) {
  return page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array; soil: Soil | null; surface: { surface: Float32Array }; entities: { count: number; x: Int16Array; y: Int16Array } } };
    const m = r.map;
    const covered = new Set<number>();
    for (let k = 0; k < m.entities.count; k++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) covered.add((m.entities.y[k] + dy) * m.W + m.entities.x[k] + dx);
    // a dry tile and a moist one, on open ground, with the same height all round (flat)
    const find = (moist: boolean): [number, number] | null => {
      for (let y = 8; y < m.H - 8; y++)
        for (let x = 8; x < m.W - 8; x++) {
          const i = y * m.W + x;
          if (covered.has(i) || m.surface.surface[i] === m.surface.surface[i]) continue;
          if (m.soil!.contamination[i] > 0 || (m.soil!.moisture[i] > 0) !== moist) continue;
          let flat = true;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.heights[i + dy * m.W + dx] !== m.heights[i]) flat = false;
          if (flat) return [x, y];
        }
      return null;
    };
    return { W: m.W, hasSoil: !!m.soil, dry: find(false), moist: find(true) };
  });
}

async function hover(page: Page, [x, y]: [number, number]) {
  // look straight down on the tile, close, so nothing stands in front of it
  await page.evaluate(([a, b]) => {
    const r = window.dgm3d!.renderer;
    r.setView({ mode: "orbit", yaw: 0, pitch: 1.45, distance: 30, target: [a + 0.5, r.heightAt(a, b), -(b + 0.5)] });
    r.renderNow();
  }, [x, y]);
  const c = await page.evaluate(([a, b]) => window.dgm3d!.renderer.tileToClient(a, b), [x, y]);
  await page.mouse.move(c.x, c.y);
}

test("the 3D view: soil colours, their legend, height colours, the soil in the hover text, the game's camera", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });

  // the legend says what the colours mean
  const legend = page.locator(".view3d-legend");
  await expect(legend).toBeVisible();
  for (const text of ["Moist ground", "Dry ground", "Contaminated ground", "Water", "Badwater", "Walls", "Dead trees"]) await expect(legend).toContainText(text);
  await expect(legend).not.toContainText("dam site");

  // the default camera: the game's angle
  const view = await page.evaluate(() => window.dgm3d!.renderer.getView());
  expect(view.yaw).toBeCloseTo(-Math.PI / 6, 5);
  expect(view.pitch).toBeCloseTo((70 * Math.PI) / 180, 5);

  // the hover text names the soil the colour shows
  const s = await viewState(page);
  expect(s.hasSoil).toBe(true);
  expect(s.dry).not.toBeNull();
  expect(s.moist).not.toBeNull();
  await hover(page, s.dry!);
  await expect(page.locator(".readout")).toContainText("dry soil");
  await hover(page, s.moist!);
  await expect(page.locator(".readout")).toContainText("moist soil");

  // height colours, and back
  const toggle = page.getByRole("button", { name: "Height colours" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.dgm3d!.renderer.groundMode)).toBe("height");
  await expect(legend).toContainText("Ground height");
  await expect(legend).not.toContainText("Moist ground");
  // the choice lasts: the editor's view opens with height colours too
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d && window.dgm3d.renderer.size?.W === 96, null, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Height colours" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.dgm3d!.renderer.groundMode)).toBe("height");
  await page.getByRole("button", { name: "Height colours" }).click();
  expect(await page.evaluate(() => window.dgm3d!.renderer.groundMode)).toBe("moisture");

  // the editor's view has the worker's soil
  const same = await page.evaluate(async () => {
    const v = await window.dgmEditor!.worker.sessionView();
    const r = window.dgm3d!.renderer as unknown as { map: { soil: Soil } };
    const a = r.map.soil;
    const b = v.view.soil!;
    return a.moisture.length === b.moisture.length && a.moisture.every((m, i) => m === b.moisture[i]) && a.contamination.every((c, i) => c === b.contamination[i]);
  });
  expect(same).toBe(true);
  expect(errors).toEqual([]);
});

test("the water holds still for a viewer who prefers less motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.dgm3d!.renderer.animated)).toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // it moves again unless the browser draws in software (CI), where it stays still to save work
  const soft = await page.evaluate(() => /SwiftShader|llvmpipe|Software|Basic Render/i.test(window.dgm3d!.renderer.gpu().renderer));
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.animated)).toBe(!soft);
});
