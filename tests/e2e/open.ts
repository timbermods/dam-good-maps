// The one way a spec opens the editor on a generated map (D330: the page is the editor). The page generates
// the map of the URL fragment and opens it in the editor by itself; there is no step between. Most specs
// need only this: `await openEditor(page, "s=4242&z=96&d=n&t=riverValley")`.

import { expect, type Page } from "@playwright/test";

/** Open `fragment` (a spec fragment such as "s=4242&z=96&d=n&t=riverValley", with or without its #) and
 *  wait until the editor and the 3D view are ready, hooks `window.dgmEditor` and `window.dgm3d` set.
 *  A page already showing another fragment is left first: a link that only changes the fragment does not
 *  reload the page. */
export async function openEditor(page: Page, fragment: string, opts: { timeout?: number } = {}): Promise<void> {
  const hash = fragment.replace(/^#/, "");
  const here = page.url();
  if (here && here !== "about:blank" && here !== ":") await page.goto("about:blank");
  await page.goto(`./#${hash}`);
  await waitForEditor(page, opts);
}

/** Wait until the editor and the 3D view are ready (after opening a file, a place or a map in any way). */
export async function waitForEditor(page: Page, opts: { timeout?: number } = {}): Promise<void> {
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: opts.timeout ?? 120_000 });
}

/** The generated map is on show and checked: its checks passed (the dot beside Save says "Ready to play"). */
export async function expectReady(page: Page, timeout = 120_000): Promise<void> {
  await expect(page.getByRole("button", { name: /^Checks: Ready to play/ })).toBeVisible({ timeout });
}
