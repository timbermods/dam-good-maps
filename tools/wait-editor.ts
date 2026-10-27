// The page is the editor (D330): it makes the map of the address and opens it in the editor by itself, so a
// tool that needs the editor opens the address and waits for the test hooks. (tests/e2e/open.ts is the
// browser tests' copy of this.)

import type { Page } from "@playwright/test";

/** Wait until the editor and the 3D view are ready: `window.dgmEditor` and `window.dgm3d` are set. */
export async function waitForEditor(page: Page, timeout = 300_000): Promise<void> {
  await page.waitForFunction("!!window.dgmEditor && !!window.dgm3d", null, { timeout });
}
