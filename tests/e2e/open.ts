// The one way a spec opens the editor on a generated map (D330: the page is the editor). The page generates
// the map of the URL fragment and opens it in the editor by itself; there is no step between. Most specs
// need only this: `await openEditor(page, "s=4242&z=96&d=n&t=riverValley")`.

import { expect, type Locator, type Page } from "@playwright/test";

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

/** Open the File menu in the header and return it (Open…, Save project, Download .timber, Clear everything, History, About). */
export async function openFileMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "File", exact: true }).click();
  return page.getByRole("menu", { name: "File" });
}

/** Open the Maps drawer from the header (the Maps button; a drawer already open is left open) and return it. It takes
 *  the left column in the palette's place. */
export async function openDrawer(page: Page): Promise<Locator> {
  const button = page.locator("header.editor-bar").getByRole("button", { name: "Maps", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const drawer = page.locator('aside[aria-label="Maps"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

/** The drawer's submit button: "Generate", "Generate (settings changed)", or the progress words while a map is made. */
export const generateButton = (page: Page): Locator => page.getByRole("form", { name: "Settings" }).locator('button[type="submit"]');

/** Open the drawer and one of its settings sections (Terrain, Water, Hazards, Resources, Difficulty, "Limits for this
 *  size") and return its fields: the group "<Section> settings", opened in place directly under the section's row.
 *  A section already open is left open (clicking its row again would close it). */
export async function openSection(page: Page, section: string): Promise<Locator> {
  const drawer = await openDrawer(page);
  const row = drawer.locator(`[data-section="${section}"]`);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  const group = drawer.getByRole("group", { name: `${section} settings` });
  await expect(group).toBeVisible();
  return group;
}

/** Open the legend over the map (the Legend button in the top-right column; an open one is left open) and return its panel.
 *  It starts closed, and the open state is remembered in this browser. */
export async function openLegend(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Legend", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const panel = page.locator('aside.legend-panel[aria-label="Legend"]');
  await expect(panel).toBeVisible();
  return panel;
}

/** Bring a tile to the middle of the view, clear of the chrome along the map's edges (the toolbar holds Select's
 *  line whenever nothing else is in hand, so it reaches further down than a bare toolbar). */
export async function centreOn(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([a, b]) => {
    const r = window.dgm3d!.renderer;
    r.setView({ target: [a + 0.5, r.getView().target[1], -(b + 0.5)] });
  }, [x, y] as [number, number]);
  await page.waitForTimeout(300);
}
