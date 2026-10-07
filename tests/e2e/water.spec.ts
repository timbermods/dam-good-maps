// M2 in the page: the settled water and the checks that read it (the dot beside Save). Also logs the browser's generation time at 256², for the water budget
// recorded in PLAN §10.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";
import { encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

test("the page settles the water, its checks pass, and no dam site is shown", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  // (water storage near the start is information since generator 0.7.0, #67: the map may pass with
  // warnings; and no dam site on the map, D287)
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 60_000 }).toBe(true);
  await expect(page.getByText("Best dam site", { exact: true })).toHaveCount(0);
  const dot = page.getByRole("button", { name: /^Checks:/ });
  await expect(dot).toHaveAccessibleName(/^Checks: Ready to play/, { timeout: 60_000 });
  await dot.click();
  await expect(page.getByRole("region", { name: "Checks" })).toContainText(/All \d+ checks pass/);
  expect((await page.evaluate(() => window.dgm!.current!()))!.passed).toBe(true);
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
