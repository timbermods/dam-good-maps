// Kyler's contamination outline in the page: with **Markers** off the view shows no outline where
// contaminated ground ends (the clean view's gradual fade); with **Markers** on it does, and it
// follows the soil when the soil updates.

import { expect, test, type Page } from "@playwright/test";

/** Pixels of the outline's light core in the canvas (its colour after the view's colour grade),
 *  counted in the page from a PNG screenshot. */
async function outlinePixels(page: Page): Promise<number> {
  await page.evaluate(() => window.dgm3d!.renderer.renderNow());
  const png = await page.locator(".view3d canvas").screenshot({ type: "png" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k] > 232 && d[k + 1] > 195 && d[k + 1] < 238 && d[k + 2] > 115 && d[k + 2] < 178) n++;
    return n;
  }, png.toString("base64"));
}

test("the contamination outline shows only with Markers, and follows the soil", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForFunction(() => !!window.dgm3d, null, { timeout: 60_000 });

  // a dry, contaminated tile beside clean ground of the same height, seen from above, close
  const at = await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array; soil: { contamination: Uint8Array } | null; surface: { surface: Float32Array } } };
    const m = r.map;
    const dry = (i: number) => !(m.surface.surface[i] === m.surface.surface[i]);
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        const i = y * m.W + x;
        if (!(m.soil!.contamination[i] > 0) || !dry(i)) continue;
        for (const j of [i + 1, i - 1, i + m.W, i - m.W]) if (m.soil!.contamination[j] === 0 && dry(j) && m.heights[j] === m.heights[i]) return [x, y];
      }
    return null;
  });
  expect(at).not.toBeNull();
  await page.evaluate(([x, y]) => {
    const r = window.dgm3d!.renderer as unknown as { setClock(t: number): void; setView(v: object): void; heightAt(x: number, y: number): number };
    r.setClock(12.5);
    r.setView({ mode: "orbit", yaw: 0, pitch: 1.45, distance: 14, target: [x + 0.5, r.heightAt(x, y), -(y + 0.5)] });
  }, at!);

  // (the legend, with its own outline swatch and the Markers toggle, sits beside the map: out of
  // the canvas's pictures)

  // Markers off: no outline
  const markers = page.getByRole("button", { name: "Markers", exact: true });
  await expect(markers).toHaveAttribute("aria-pressed", "false");
  expect(await outlinePixels(page)).toBeLessThan(20);

  // Markers on: the outline
  await markers.click();
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  expect(await outlinePixels(page)).toBeGreaterThan(150);

  // the soil updates (no contamination left): the outline goes with it
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { map: { soil: { moisture: Uint8Array; contamination: Uint8Array } }; updateSoil(s: object): void };
    const s = r.map.soil;
    r.updateSoil({ moisture: s.moisture, contamination: new Uint8Array(s.contamination.length) });
  });
  expect(await outlinePixels(page)).toBeLessThan(20);
  expect(errors).toEqual([]);
});
