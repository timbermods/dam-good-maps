// Shared waits for the editor's e2e specs.

import { expect, type Page } from "@playwright/test";

/** A tool is in hand: the map's left button is the brush's, the shelf object's or a force's. The page takes
 *  the pick in an effect after it draws it, so a press right after clicking (or keying) a tool can be
 *  taken by the camera or by nothing; wait for it before pressing. Call it with no tool out before. */
export async function toolInHand(page: Page) {
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.tool !== null)).toBe(true);
}

/** The "Move the start here" tag a Flatten stroke leaves has come up (the page looks for it once idle, after the
 *  stroke; a press that lands on it moves the start, so a spec that presses on that ground waits for it, then
 *  picks something from the shelf or starts a stroke, either of which takes it away). */
export async function startHintUp(page: Page) {
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.startHint()), { timeout: 15_000 }).not.toBeNull();
}
