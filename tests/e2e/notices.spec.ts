// No notices strip (Kyler, 2026-10-03, amending D213's quiet line): the page never shows a strip under the map,
// which changed the page's size; the player knows what they did. Removing the map's last badwater spring puts
// "No badwater" in the quiet dot's list, under Good to know, uncounted.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());

test("there is no notices strip; with the last badwater spring gone, the quiet dot's list says No badwater", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await expect(page.locator(".editor-notices")).toHaveCount(0);
  const map = (await page.locator(".editor-map").boundingBox())!;

  // every badwater spring away: the map is a No badwater map now
  await page.keyboard.press("Control+a");
  const row = page.getByRole("group", { name: "Selection" });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("menu", { name: "Delete" }).getByRole("menuitem", { name: /^Badwater sources/ }).click();
  await idle(page);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().badwaterRemoved)).toBe(true);

  // still no strip, and the map's area kept its size
  await expect(page.locator(".editor-notices")).toHaveCount(0);
  expect(await page.locator(".editor-map").boundingBox()).toEqual(map);

  // the quiet dot's list: "No badwater" under Good to know, and not counted
  const dot = page.getByRole("button", { name: /^Checks: / });
  await dot.click();
  const list = page.getByRole("region", { name: "Checks" });
  const good = list.locator("section").filter({ has: page.getByRole("heading", { name: "Good to know" }) });
  await expect(good.getByRole("listitem").filter({ hasText: /^No badwater$/ })).toHaveCount(1);
  // (the counted sections hold no such line)
  for (const head of ["This edit made", "Fix these first", "Worth a look"]) await expect(list.locator("section").filter({ has: page.getByRole("heading", { name: head }) }).getByText("No badwater", { exact: true })).toHaveCount(0);
});
