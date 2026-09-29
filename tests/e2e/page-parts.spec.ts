// "The page is the editor", part 1 (docs/UI-BRIEF.md §3, §5, §6; PLAN §20 D330): the side panel's
// parts on their own, on the workbench page (workbench/index.html, in test builds only) until the
// workspace puts them together. The panel collapses and remembers; Generate runs only on its button
// or Enter, with its dot; the card's legend names, highlights and pins; the numbers show their
// detail; a real place's card carries its signature and credits; Your maps renames, stars, deletes
// and undoes; the strip takes a version with its note and More's siblings.

import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`./workbench/${query}`);
  await expect(page.getByRole("complementary", { name: "Map panel" })).toBeVisible();
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto("./workbench/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase("dgm-your-maps");
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  });
});

test("the panel opens on the first visit, collapses to a strip, and remembers how it was left", async ({ page }) => {
  const errors = await open(page);
  const panel = page.getByRole("complementary", { name: "Map panel" });
  await expect(panel.getByRole("tab", { name: "Generate" })).toHaveAttribute("aria-selected", "true");
  await panel.getByRole("button", { name: "Collapse the panel" }).click();
  await expect(panel.getByRole("tab")).toHaveCount(0);
  await page.reload();
  await expect(panel.getByRole("button", { name: "Open the panel" })).toBeVisible();
  await panel.getByRole("button", { name: "Open the panel" }).click();
  await page.reload();
  await expect(panel.getByRole("tab", { name: "Real places" })).toBeVisible();
  // the switch: Real places shows its own controls; Pick a place waits until it is built
  await panel.getByRole("tab", { name: "Real places" }).click();
  await expect(panel.getByText("The Real places gallery goes here.")).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Pick a place" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Generate runs only on its button or Enter, and its dot shows when the settings differ", async ({ page }) => {
  await open(page);
  const button = page.getByRole("button", { name: "Generate", exact: true });
  const generated = page.locator("#generated");
  await expect(button).not.toHaveAttribute("data-differs");
  // a settings change never regenerates; it lights the dot
  await page.locator("#seed").fill("12");
  await expect(button).toHaveAttribute("data-differs", "");
  await expect(button).toHaveAccessibleDescription("The settings differ from the map shown.");
  await expect(generated).toHaveText("0");
  // Enter in the panel generates
  await page.locator("#seed").press("Enter");
  await expect(generated).toHaveText("1");
  await expect(page.locator("#shown")).toHaveText("seed 12");
  await expect(button).not.toHaveAttribute("data-differs");
  // Enter on a section header opens it, and doesn't generate
  await page.getByText("Water", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(generated).toHaveText("1");
  await page.locator("#rivers").fill("2");
  await expect(button).toHaveAttribute("data-differs", "");
  await button.click();
  await expect(generated).toHaveText("2");
});

test("the card: the legend names, highlights and pins; the numbers show their detail", async ({ page }) => {
  await open(page);
  const card = page.getByRole("article", { name: "This map" });
  await expect(card.getByRole("heading", { name: "Willow Bend" })).toBeVisible();
  await expect(card.getByText("128×128 · seed 7")).toBeVisible();
  await expect(card.getByText(/start sits on its inside bend/)).toBeVisible();
  // only what's on the map, with counts; the start is left out
  const legend = card.getByRole("list", { name: "On this map" });
  await expect(legend.getByRole("button")).toHaveCount(7);
  const sources = legend.getByRole("button", { name: "Water sources: 3" });
  await expect(sources).toBeVisible();
  // one row
  const boxes = await legend.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(4);
  // hovering names it and highlights it
  await sources.hover();
  await expect(card.getByText("Water sources", { exact: true })).toBeVisible();
  const last = () => page.evaluate(() => window.pg!.highlights[window.pg!.highlights.length - 1]);
  expect(await last()).toMatchObject({ key: "source", name: "Water sources", pinned: false });
  expect((await last())!.tiles.length).toBeGreaterThan(0);
  // leaving drops it; a click pins it
  await page.mouse.move(900, 600);
  expect(await last()).toBe(null);
  const mines = legend.getByRole("button", { name: "Mine sites: 2" });
  await mines.click();
  await expect(mines).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(900, 600);
  expect(await last()).toMatchObject({ key: "mine", pinned: true });
  // the numbers: trees in reach with logs, and five lever marks with detail on hover
  await expect(card.getByText("182 trees in reach, 640 logs")).toBeVisible();
  const levers = card.getByRole("list", { name: "Difficulty levers" }).getByRole("listitem");
  await expect(levers).toHaveCount(5);
  await expect(levers.nth(2)).toHaveAttribute("title", "Badwater: harder. The nearest badwater is 12 tiles from the start.");
  // everything fits without a scrollbar
  const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});

test("a real place's card carries its signature and credits instead of a seed", async ({ page }) => {
  await open(page, "?place");
  const card = page.getByRole("article", { name: "This map" });
  await expect(card.getByRole("heading", { name: "Near Yosemite Valley" })).toBeVisible();
  await expect(card.getByText("Yosemite Valley's sheer granite walls")).toBeVisible();
  await expect(card.getByRole("link", { name: "Elevation data: Terrain Tiles" })).toBeVisible();
  await expect(card.getByText(/seed/)).toHaveCount(0);
  // the strip is for generated maps only
  await expect(page.getByRole("region", { name: "Other versions" })).toHaveCount(0);
  // no generated map shown: no dot
  await expect(page.getByRole("button", { name: "Generate", exact: true })).not.toHaveAttribute("data-differs");
});

test("Your maps: newest first, rename, star, delete with undo, the Timberborn mark, where it lives", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("region", { name: "Your maps" })).toHaveCount(0);
  await page.evaluate(async () => {
    await window.pg!.addMap("a", "Old Ford", 90);
    await window.pg!.addMap("b", "Stone Steps", 5, { revision: 3, savedToTimberborn: 3 });
  });
  const list = page.getByRole("region", { name: "Your maps" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first()).toContainText("Stone Steps");
  await expect(list.getByRole("listitem").first()).toContainText("Edited 5 minutes ago · saved to Timberborn");
  await expect(list.getByRole("listitem").nth(1)).toContainText("Edited 1 hour ago");
  await expect(list.getByText(/live in this browser/)).toBeVisible();
  // rename: click the name
  await list.getByRole("button", { name: "Old Ford", exact: true }).click();
  await list.getByRole("textbox", { name: "Map name" }).fill("Willow Ford");
  await list.getByRole("textbox", { name: "Map name" }).press("Enter");
  await expect(list.getByRole("button", { name: "Willow Ford", exact: true })).toBeVisible();
  // Esc keeps the old name
  await list.getByRole("button", { name: "Willow Ford", exact: true }).click();
  await list.getByRole("textbox", { name: "Map name" }).fill("Nope");
  await list.getByRole("textbox", { name: "Map name" }).press("Escape");
  await expect(list.getByRole("button", { name: "Willow Ford", exact: true })).toBeVisible();
  // star
  await list.getByRole("button", { name: "Star Willow Ford" }).click();
  await expect(list.getByRole("button", { name: "Star Willow Ford" })).toHaveAttribute("aria-pressed", "true");
  // delete, then undo
  await list.getByRole("listitem").filter({ hasText: "Stone Steps" }).getByRole("button", { name: "Delete" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("status")).toHaveText(/Stone Steps deleted\./);
  await list.getByRole("button", { name: "Undo" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  // everything survives a reload
  await page.reload();
  await expect(list.getByRole("button", { name: "Star Willow Ford" })).toHaveAttribute("aria-pressed", "true");
});

test("the strip: a version with its note, More's siblings as they finish, a click opens one", async ({ page }) => {
  await open(page);
  const strip = page.getByRole("region", { name: "Other versions" });
  // otherwise empty: only More
  await expect(strip.getByRole("button")).toHaveText(["More"]);
  // the background search found a version: it leads the row, with its short note
  await page.evaluate(() => window.pg!.version(2, "A version with its broad valley is ready"));
  await expect(strip.getByRole("status")).toHaveText("A version with its broad valley is ready");
  await expect(strip.locator(".pg-candidate[data-kind=version]")).toHaveCount(1);
  // More: one on its way, then it appears as it finishes
  await strip.getByRole("button", { name: "More" }).click();
  await expect(strip.getByRole("img", { name: "A version on its way" })).toHaveCount(1);
  await page.evaluate(() => window.pg!.sibling(3));
  await expect(strip.getByRole("img", { name: "A version on its way" })).toHaveCount(0);
  await expect(strip.locator(".pg-candidate[data-kind=sibling]")).toHaveCount(1);
  // a click opens one; the row stays
  await strip.getByRole("button", { name: /^Open Sibling 3/ }).click();
  await expect(strip.getByRole("button", { name: /^Open Sibling 3/ })).toHaveAttribute("aria-current", "true");
  await expect(strip.locator(".pg-candidate:not(.pg-candidate-pending)")).toHaveCount(2);
  // the note goes after a few seconds
  await expect(strip.getByRole("status")).toHaveCount(0, { timeout: 8000 });
});

test("replacing an edited map says so quietly, for a few seconds", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.pg!.replaced("Willow Bend"));
  await expect(page.getByRole("status").filter({ hasText: "Willow Bend is in Your maps. Undo to bring it back." })).toBeVisible();
  await expect(page.getByText("Willow Bend is in Your maps.")).toHaveCount(0, { timeout: 8000 });
});
