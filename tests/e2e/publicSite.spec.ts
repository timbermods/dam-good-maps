// What the public site hides before its release (PLAN §20 D219, src/editor/release.ts): the forces.
// The browser tests' own build shows them, as the preview does (brushKit.spec, carve.spec); this
// opens the build made as the public site is made (playwright.config.ts serves it under
// public-build/) and finds no forces group, no Carve button, no key 7 and no options row.

import { expect, test } from "@playwright/test";
import { FORCES_RELEASED } from "../../src/editor/release";

test("the public site shows no forces before their release: no button, no key, no options row", async ({ page }) => {
  test.skip(FORCES_RELEASED, "the forces are released: every build shows them");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./public-build/#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  const bar = page.getByRole("toolbar", { name: "Tools" });
  await expect(bar.getByRole("button", { name: "Raise brush (1)" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Remove (X)" })).toBeVisible();
  // no forces group, and none of the forces
  await expect(bar.getByRole("group", { name: "Forces" })).toHaveCount(0);
  for (const name of ["Carve", "Craterize", "Quake", "Erupt"]) await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  // Carve's key does nothing: no options row, no Unleash or Aim
  await page.mouse.move(700, 500);
  await page.keyboard.press("7");
  await page.waitForTimeout(250);
  await expect(page.getByRole("group", { name: /options/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unleash" })).toHaveCount(0);
  expect(await page.evaluate(() => window.dgmEditor!.carve())).toBeNull();
  // the other keys still work
  await page.keyboard.press("1");
  await expect(page.getByRole("group", { name: "Raise options" })).toBeVisible();
  expect(errors).toEqual([]);
});
