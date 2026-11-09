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

/** A held stroke's moves from p to q in `steps` even steps, the pointer moving one step every `gap` ms, sent by the page
 *  itself to the map as the browser sends a real pointer's: one pointermove a frame, carrying every move since the frame
 *  before as its coalesced events (the brush paints through all of them, `getCoalescedEvents`), with the pointer the
 *  press went down with (`rememberPointer`). A move sent from here waits for the page's next frame, and on CI's software
 *  drawing a frame of a 128² map takes up to 2 s: 144 of them took strokesBackToBack past its three minutes (run
 *  40575112650). Sent one by one on a timer instead, each move was a frame of its own there, land and water, a second
 *  each (run 42539983321: 24 moves took 11 to 24 s), where a real pointer's would have come in a few frames. The moves
 *  are the same, so are the strokes and what is asserted. Playwright's own pointer stays where the press went down:
 *  move it to q before letting go. */
export async function strokeMoves(page: Page, p: { x: number; y: number }, q: { x: number; y: number }, steps: number, gap = 8) {
  await page.evaluate(
    async ([p, q, steps, gap]) => {
      const c = window.dgm3d!.renderer.canvas;
      const id = (window as unknown as { strokePointer: number }).strokePointer;
      const move = (s: number, init: PointerEventInit = {}) =>
        new PointerEvent("pointermove", { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: "mouse", isPrimary: true, buttons: 1, clientX: p.x + ((q.x - p.x) * s) / steps, clientY: p.y + ((q.y - p.y) * s) / steps, ...init });
      const t0 = performance.now();
      for (let sent = 0; sent < steps; ) {
        await new Promise((r) => requestAnimationFrame(r));
        // (the moves the pointer has made by now, at least one a frame)
        const due = Math.min(steps, Math.max(sent + 1, Math.floor((performance.now() - t0) / gap) + 1));
        const coalesced: PointerEvent[] = [];
        for (let s = sent + 1; s <= due; s++) coalesced.push(move(s));
        c.dispatchEvent(move(due, { coalescedEvents: coalesced }));
        sent = due;
      }
    },
    [p, q, steps, gap] as const,
  );
}

/** Note the moments of the editor's open, for `phases` (CI's log says where a slow spec's time went): the map handed to
 *  the 3D view (generated, `window.dgm3d`), its first frame drawn after that, and the editor's hook set, each from the
 *  page's navigation. Call it before `openEditor`. Reads only; changes nothing the page does. */
export async function watchOpen(page: Page) {
  await page.addInitScript(() => {
    const t: Record<string, number> = {};
    (window as unknown as { dgmOpenTimes: Record<string, number> }).dgmOpenTimes = t;
    let frames = -1;
    const iv = setInterval(() => {
      const r = window.dgm3d?.renderer as unknown as { framesDrawn?: number } | undefined;
      const now = Math.round(performance.now());
      if (r && t.view === undefined) {
        t.view = now;
        frames = r.framesDrawn ?? 0;
      }
      if (r && t.frame === undefined && (r.framesDrawn ?? 0) > frames) t.frame = now;
      if (window.dgmEditor && t.editor === undefined) t.editor = now;
      if (t.view !== undefined && t.frame !== undefined && t.editor !== undefined) clearInterval(iv);
    }, 50);
  });
}

/** A spec's phase log: each call prints one line with the time since the last (`[phases] <spec>: <phase> <ms> ms`), which
 *  CI's list reporter shows under the test. `open` adds `watchOpen`'s moments. */
export function phases(spec: string) {
  let last = Date.now();
  const lap = (phase: string, detail = "") => {
    const now = Date.now();
    console.log(`[phases] ${spec}: ${phase} ${now - last} ms${detail}`);
    last = now;
  };
  return {
    lap,
    open: async (page: Page) => {
      const t: { boot: number; view?: number; frame?: number; editor?: number } = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        return { boot: Math.round(nav?.domContentLoadedEventEnd ?? -1), ...(window as unknown as { dgmOpenTimes?: Record<string, number> }).dgmOpenTimes };
      });
      lap("open", ` (from navigation: page loaded ${t.boot} ms, map in the view ${t.view ?? "?"} ms, its first frame ${t.frame ?? "?"} ms, editor ready ${t.editor ?? "?"} ms)`);
    },
  };
}
