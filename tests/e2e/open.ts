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

/** Open the File menu in the header and return it (Open…, Download project, Download .timber, Clear everything, About; Another like this on a generated map). */
export async function openFileMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "File", exact: true }).click();
  return page.getByRole("menu", { name: "File" });
}

/** Open the map generator's panel from the header (Map Generator; a panel already open is left open) and return it.
 *  It lies over the map at the left, 640px wide, every setting showing. */
export async function openDrawer(page: Page): Promise<Locator> {
  const button = page.locator("header.editor-bar").getByRole("button", { name: "Map Generator", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const drawer = page.locator('aside[aria-label="Map Generator"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

/** The drawer's submit button: "Generate", or the progress words while a map is made. */
export const generateButton = (page: Page): Locator => page.getByRole("form", { name: "Settings" }).locator('button[type="submit"]');

/** Open the map generator and return one of its groups (Terrain, Water, Hazards, Resources, Difficulty), all of which
 *  always show. */
export async function openSection(page: Page, section: string): Promise<Locator> {
  const drawer = await openDrawer(page);
  const group = drawer.getByRole("region", { name: section, exact: true });
  await expect(group).toBeVisible();
  return group;
}

/** Pick an option of a segmented choice (a generator setting, the water's Speed) by the choice's name and the option's
 *  word. */
export async function pick(scope: Locator | Page, choice: string, option: string): Promise<void> {
  await scope.getByRole("group", { name: choice, exact: true }).getByRole("button", { name: option, exact: true }).click();
}

/** Open Your maps from the header (its own panel, in the map generator's place) and return the maps' region. */
export async function openYourMaps(page: Page): Promise<Locator> {
  const button = page.locator("header.editor-bar").getByRole("button", { name: "Your maps", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const yours = page.getByRole("region", { name: "Your maps" });
  await expect(yours).toBeVisible();
  return yours;
}

/** The water's pace after an edit, through the test hook (the page has no Speed control: it always plays at Normal). */
export async function setWaterSpeed(page: Page, speed: string): Promise<void> {
  await page.evaluate((s) => window.dgmEditor!.waterSpeed(s as "slower" | "normal" | "faster" | "instant"), speed);
}

/** Open the legend over the map (Legend, last in the Show column; one ticked is left open) and return its panel. It
 *  starts closed, and the open state is remembered in this browser. */
export async function openLegend(page: Page): Promise<Locator> {
  const box = page.getByRole("checkbox", { name: "Legend", exact: true });
  if ((await box.getAttribute("aria-checked")) !== "true") await box.click();
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

/** A number setting's value as the panel shows it at the right of its name (the settings above the bar). */
export const settingValue = (page: Page, label: string): Locator => page.locator(`.tool-settings .set:has(input[aria-label="${label}"]) .set-value`);

/** Pick an option of a choice setting (one segmented look) inside `scope`. */
export async function choose(scope: Locator, label: string, option: string): Promise<void> {
  await scope.getByRole("group", { name: label, exact: true }).getByRole("button", { name: option, exact: true }).click();
}

/** Set a brush's Level inside `scope`: a number, "free" (Raise and Lower's last stop) or "follow" (Auto: the ground). */
export async function setLevel(scope: Locator, v: number | "free" | "follow"): Promise<void> {
  const auto = scope.getByRole("button", { name: "Level follows the ground" });
  if (v === "follow") {
    if ((await auto.getAttribute("aria-pressed")) !== "true") await auto.click();
    return;
  }
  const s = scope.getByRole("slider", { name: "Level", exact: true });
  await s.fill(v === "free" ? (await s.getAttribute("max"))! : String(v));
}
