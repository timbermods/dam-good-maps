// M2 in the page: the settled water, its layers, the map card's water facts, and the download
// without pre-filled water. Also logs the browser's generation time at 256², for the water budget
// recorded in PLAN §10.

import { expect, test } from "@playwright/test";
import { encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

test("the map card shows the water facts, the layers toggle, and both water variants download", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=4242&z=128&d=n&t=riverValley");
  // (water storage near the start is information since generator 0.7.0, #67: the map may pass with
  // warnings, and with no dam site near its start)
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Best dam site", { exact: true })).toBeVisible();
  await expect(page.getByText(/water behind a \d+-tile dam|none near the start/)).toBeVisible();
  for (const layer of ["Moist soil", "Contaminated soil", "Walkable from start", "Feature outlines"]) await page.getByLabel(layer, { exact: true }).check();
  await page.getByLabel("Water", { exact: true }).uncheck();
  await page.getByText(/checks passed/).click();
  await expect(page.getByText(/^Start and resources/)).toBeVisible();
  await expect(page.getByText(/plants\.drought/)).toBeVisible();
  const empty = page.waitForEvent("download");
  await page.getByRole("button", { name: "Without pre-filled water" }).click();
  expect((await empty).suggestedFilename()).toBe("River Valley (4242) (empty water).timber");
  expect(errors).toEqual([]);
});

test("256² in the browser (timing for PLAN §10)", async ({ page }) => {
  await page.goto("./#s=1&z=128&d=n&t=riverValley");
  await page.waitForFunction(() => "dgm" in window);
  const times: number[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = await page.evaluate((f) => window.dgm!.generate(f), encodeSpecFragment(makeSpec({ seed, size: { x: 256, y: 256 } })));
    expect(r.passed).toBe(true);
    times.push(r.ms);
    console.log(`browser 256² seed ${seed}: ${r.ms} ms, settle ${r.ticks} ticks`);
  }
  times.sort((a, b) => a - b);
  console.log(`browser 256² generation: median ${times[2]} ms, max ${times[4]} ms`);
});
