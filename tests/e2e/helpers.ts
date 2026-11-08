// Shared waits for the editor's e2e specs.

import { expect, type Page } from "@playwright/test";

/** A tool is in hand: the map's left button is the brush's, the shelf object's or a force's. The page takes
 *  the pick in an effect after it draws it, so a press right after clicking (or keying) a tool can be
 *  taken by the camera or by nothing; wait for it before pressing. Call it with no tool out before: after an
 *  Esc, wait for `toolPutAway` first, or this passes on the tool just put away. */
export async function toolInHand(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.dgm3d!.renderer.tool;
        // (Select's tool alone takes Alt itself: `wantsAlt`)
        return t !== null && !("wantsAlt" in t);
      }),
    )
    .toBe(true);
}

/** Esc has put the tool away and Select, the resting tool, is back in hand (on the page Select always is): the page
 *  swaps the map's button in an effect after it draws, and until then the tool put away still takes a press (a click
 *  on the next shelf object lands on the brush, not the object). */
export async function toolPutAway(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.dgm3d!.renderer.tool;
        return t === null || "wantsAlt" in t;
      }),
    )
    .toBe(true);
}

/** The "Move the start here" tag a Flatten stroke leaves has come up (the page looks for it once idle, after the
 *  stroke; a press that lands on it moves the start, so a spec that presses on that ground waits for it, then
 *  picks something from the shelf or starts a stroke, either of which takes it away). */
export async function startHintUp(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.dgmEditor!.startHint()), {
      timeout: 15_000,
    })
    .not.toBeNull();
}

/** The map the layout specs look at (riverValley 96², seed 4242), its first hint closed and its checks done: the dot's
 *  words, and with them the header's right group, hold still from here (layout.spec.ts, textClipping.spec.ts). */
export async function openLayoutMap(page: Page) {
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  // (the first hints' own close: their first button is "Help and keys" now)
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  await expect(page.locator(".checks-dot .dot-words > :first-child")).toHaveText("Ready to play", { timeout: 120_000 });
}

/** The pointer parked over the map, clear of the controls, and a moment for the page to settle (the layout specs). */
export async function settle(page: Page, w: number, h: number) {
  await page.mouse.move(w * 0.55, h * 0.6);
  await page.waitForTimeout(300);
}

/** Remember the pointer each press on the page goes down with, for `strokeMoves`. Call it once, before the first press. */
export async function rememberPointer(page: Page) {
  await page.evaluate(() => window.addEventListener("pointerdown", (e) => ((window as unknown as { strokePointer: number }).strokePointer = e.pointerId), true));
}

/** A held stroke's moves from p to q in `steps` even steps, sent by the page itself `gap` ms apart to the map, with the
 *  pointer the press went down with (`rememberPointer`). A move sent from here waits for the page's next frame, and on
 *  CI's software drawing a frame of a 128² map takes up to 2 s: 144 of them took strokesBackToBack past its three
 *  minutes (run 40575112650; a CPU profile under SwiftShader puts nine tenths of each stroke in the raster, the page's
 *  own work a few hundred ms, as on a GPU). The moves are the same, so are the strokes and what is asserted; only the
 *  frame each one waited for is gone. Playwright's own pointer stays where the press went down: move it to q before
 *  letting go. */
export async function strokeMoves(page: Page, p: { x: number; y: number }, q: { x: number; y: number }, steps: number, gap = 8) {
  await page.evaluate(
    async ([p, q, steps, gap]) => {
      const c = window.dgm3d!.renderer.canvas;
      const id = (window as unknown as { strokePointer: number }).strokePointer;
      for (let s = 1; s <= steps; s++) {
        const init = { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: "mouse", isPrimary: true, buttons: 1, clientX: p.x + ((q.x - p.x) * s) / steps, clientY: p.y + ((q.y - p.y) * s) / steps };
        c.dispatchEvent(new PointerEvent("pointermove", init));
        await new Promise((r) => setTimeout(r, gap));
      }
    },
    [p, q, steps, gap] as const,
  );
}
