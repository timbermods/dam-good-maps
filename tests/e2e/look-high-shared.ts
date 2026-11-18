// What the High look's two specs share (look-high.spec.ts, look-high-scenes.spec.ts): the page told it has a GPU, the map
// opened as the page's own saved fragment, and the helpers that read the look and draw frames now.

import { expect, type Page } from "@playwright/test";
import { openSaved } from "./open";

/** CI draws in software, where the page would take the light look: treat the machine as having a GPU (window.dgmLookTest), so
 *  the High shaders compile and run on CI too, and shorten the fallback's waits and report every frame as quick (software
 *  frames are slow) until a test reports them slow. Call it in each spec's `test.beforeEach`. */
export const holdsAGpu = (page: Page) =>
  page.addInitScript(() => {
    (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true, limits: { window: 8, strikes: 2, grace: 400 }, cost: 6 };
  });

export async function open(page: Page, errors: string[], hash = "s=4242&z=96&d=n&t=riverValley"): Promise<void> {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSaved(page, hash);
}

export const look = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.look);

/** The page has opened in High: the look is set once High's programs have compiled, in the background after the map
 *  opens (renderer.ts applyLook, highProgramsReady), so until then it still reads "standard" (D341: a race, never
 *  read once). */
export const opensHigh = (page: Page) => expect.poll(() => look(page), { timeout: 60_000 }).toBe("high");

/** Draw `n` frames now (each counts toward the automatic choice). */
export const frames = (page: Page, n: number) =>
  page.evaluate(async (k) => {
    for (let i = 0; i < k; i++) {
      window.dgm3d!.renderer.renderNow();
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, n);
