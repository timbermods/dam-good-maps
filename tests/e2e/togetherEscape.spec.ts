// The Together panel closes on Escape pressed the moment it is shown (D351's panels close on Escape): its listener is in
// place by the time the panel is on the page, also on a slow machine (the CPU throttled four times, as CI's software
// drawing under load: tooltips.spec.ts once had the panel left open, blocking its next click).

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("the Together panel closes on Escape pressed as soon as it is shown", async ({ page }) => {
  // (a header wide enough for the Together button, as tooltips.spec.ts opens it)
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  const button = page.locator("header.editor-bar").getByRole("button", { name: /^Together/ });
  const panel = page.getByRole("dialog", { name: "Together" });
  for (let k = 0; k < 10; k++) {
    await button.click();
    await panel.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0, { timeout: 2_000 });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
