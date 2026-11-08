// File → Save a picture: the map from the game's opening view, drawn large in the High look (D488's picture) and
// saved as a 1920×1080 JPEG named after the map, with the quiet note Download project gives. CI draws in software,
// where the page would not offer the picture: the test treats it as a GPU (window.dgmLookTest), as heroSize.spec does.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openEditor, openFileMenu } from "./open";

/** A JPEG's size from its first frame header (SOF0/SOF2), or null when it is not a JPEG. */
function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xc0 || m === 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

test("Save a picture downloads the map's 1920×1080 picture", async ({ page }) => {
  // (software drawing is slow at the picture's size: on this machine's SwiftShader the click took 25 s to its download,
  // of which 12 s are reading back and encoding the 3840×2160 frame and 5 s compiling its programs; CI's runners are 4 to 5
  // times slower, so 120 s left no margin (dev, 2026-11-07, a pass at 2.1 min and then two timeouts). A GPU takes seconds.)
  test.slow();
  await page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true };
  });
  await openEditor(page, "s=7&z=64&d=n&t=riverValley");
  const menu = await openFileMenu(page);
  const item = menu.getByRole("menuitem", { name: "Save a picture" });
  await expect(item).toHaveAttribute("title", "Save a picture of the map to share");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 360_000 }), item.click()]);
  const name = download.suggestedFilename();
  expect(name).toMatch(/\.jpg$/);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  expect(jpegSize(bytes)).toEqual({ w: 1920, h: 1080 });
  await expect(page.getByText(`Saved ${name}.`)).toBeVisible();
});
