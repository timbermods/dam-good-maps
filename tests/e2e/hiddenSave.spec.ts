// An edit survives the page being switched away from (#1074 slice 5): a phone may discard a page it has hidden (iOS does,
// to free memory), and reopening it is a reload. The edit is made, the page hidden at once (another app, the tab put
// away), its edit still on its way to the worker; the quiet save after an edit is held, so only what the page does on
// `visibilitychange` and `pagehide` keeps it. Reloaded as a discarded page is, the map comes back with the edit. At a
// phone's size, three device pixels to a CSS pixel and a touch screen.

import { expect, test } from "@playwright/test";
import { openLayoutMap as openEditor } from "./helpers";
import { waitForEditor } from "./open";

test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test("an edit made the moment before the page is hidden is there when the discarded page is opened again", async ({ page }) => {
  test.setTimeout(300_000);
  await openEditor(page);
  const name = await page.evaluate(() => window.dgmEditor!.info().name);
  // (the e2e build's hook: the quiet save after an edit never runs)
  await page.evaluate(() => ((window as unknown as { __dgmHoldAutosave?: boolean }).__dgmHoldAutosave = true));
  await page.evaluate(() => {
    void window.dgmEditor!.edit({ op: "sculpt", params: { mode: "flatten", cells: [[4, 4, 4]], level: 15, exact: true } } as never, "Raise a tile");
    // (switched away in the same moment: hidden, then the page hides as a phone puts it away)
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  // the edit answered, then nothing left to write (a hidden page still runs a moment before a phone stops it)
  await page.waitForFunction(() => window.dgmEditor!.info().history.some((h) => h.applied && h.label === "Raise a tile"), null, { timeout: 60_000 });
  await page.waitForFunction(() => !(window as unknown as { __dgmSaving?: () => boolean }).__dgmSaving!(), null, { timeout: 60_000 });

  // discarded and opened again: the page loads afresh at the same address
  await page.reload();
  await waitForEditor(page);
  await page.waitForFunction((n) => window.dgmEditor!.info().name === n, name, { timeout: 120_000 });
  const steps = await page.evaluate(() => window.dgmEditor!.info().history.filter((h) => h.applied).map((h) => h.label));
  expect(steps, "the edit made as the page was hidden").toContain("Raise a tile");
});
