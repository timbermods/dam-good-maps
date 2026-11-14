// No canvas grows past the window while the page loads, on a display with two device pixels to a CSS pixel
// (a phone, a laptop's dense screen). The renderer that warms while the first map loads (prepared.ts) once had a
// canvas with no CSS size: as large as its own drawing buffer, so each fit doubled it, a frame at a time, to
// tens of thousands of pixels a side until the view took it; a phone's browser closed the page for the memory.
// Every other spec runs at one device pixel to a CSS pixel, where that canvas stood still.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 932, height: 430 }, deviceScaleFactor: 2 });

test("at two device pixels to a CSS pixel no canvas is ever made larger than the window's own pixels", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __widest: number };
    w.__widest = 0;
    for (const side of ["width", "height"] as const) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, side)!;
      Object.defineProperty(HTMLCanvasElement.prototype, side, {
        get: d.get,
        set(this: HTMLCanvasElement, v: number) {
          w.__widest = Math.max(w.__widest, v);
          d.set!.call(this, v);
        },
      });
    }
  });
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  const widest = await page.evaluate(() => (window as unknown as { __widest: number }).__widest);
  // (the map's picture is drawn off screen at 960 by 540 CSS pixels, twice over: 1920; the view at the window's own)
  expect(widest).toBeGreaterThan(0);
  expect(widest).toBeLessThanOrEqual(2 * 960);
});
