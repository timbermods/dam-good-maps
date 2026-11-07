// Ruins show the game's dry model on dry or contaminated soil (Timberborn.Ruins `RuinModelUpdater.UpdateModel`:
// `IsDry || IsContaminated`; D178 as amended 2026-10-29), the held Drought or Badtide day's soil deciding on a held day:
// River Valley 128 seed 2's twelve overgrown ruins all dry out by a normal drought's last day, and all are poisoned on the
// badtide's; Day 0 and no day held, the map's own.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("a held drought or badtide day bares the ruins whose soil it dries or poisons, in both looks; Day 0 gives them back", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page, "s=2&z=128&d=n&t=riverValley");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.waterSettled()), { timeout: 120_000 }).toBe(true);
  const overgrown = () => page.evaluate(() => (window.dgm3d!.renderer as unknown as { overgrownRuins: number }).overgrownRuins);
  const own = await overgrown();
  expect(own, "the map's own overgrown ruins").toBeGreaterThan(5);
  const bar = page.getByRole("toolbar", { name: "Water time" });
  const day = bar.locator(".day-label");
  for (const hazard of ["Drought", "Badtide"] as const) {
    await bar.getByRole("button", { name: hazard }).click();
    await expect(day).not.toHaveClass(/counting/, { timeout: 240_000 });
    await expect.poll(overgrown, { timeout: 60_000, message: hazard }).toBe(0);
    // (the soil decides in both looks)
    await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("standard", false));
    expect(await overgrown(), hazard).toBe(0);
    await page.evaluate(() => window.dgm3d!.renderer.setLookChoice("high", false));
    await bar.getByRole("button", { name: hazard }).click();
    await expect(bar.getByRole("button", { name: hazard })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(overgrown, { timeout: 60_000, message: `${hazard} let go` }).toBe(own);
  }
});
