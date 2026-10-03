// The start requirements in the page (PLAN §5.6, D85, D164; ROADMAP M8's start acceptance): the settings are the
// thresholds, the starting-logs floor (D224, D227) holds, and the editor's start indicators and its green or
// red footprint follow them while the start moves. Water is the walk over the map's own ground and slopes
// (D153); wood is in logs (D164). (The map card's list of the requirements went with the old page, D330: the
// checks list and the indicators carry them now.)

import { expect, test, type Page } from "@playwright/test";
import { centreOn, openEditor, openSection } from "./open";

type Check = { id: string; ok: boolean; value?: number | string; limit?: number | string; where?: { tiles?: [number, number][] } };
// the species words, then the saplings' wood, shown apart as growing
const WOOD_WORDS = "(, (all|mostly) [a-z]+|, [a-z]+ and [a-z]+)?(, plus about \\d+ growing)?";

async function checks(page: Page): Promise<Record<string, Check>> {
  const cur = await page.evaluate(() => window.dgm!.current!());
  return Object.fromEntries(cur!.checks.map((c) => [c.id, c]));
}

test("the start requirements follow the settings, and the editor's start follows them", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, "s=77&z=96&d=n&t=riverValley");

  // each requirement, met, with the validator's number and Normal's defaults (D227: Starting wood 200,
  // 80 before), and the starting-logs floor (178 within 40 tiles' walk)
  let c = await checks(page);
  expect([c["start.water"].limit, c["start.wood"].limit, c["start.food"].limit, c["start.wood_floor"].limit]).toEqual([20, 200, 30, 178]);
  for (const id of ["start.water", "start.wood", "start.food", "start.wood_floor"]) expect(c[id].ok, id).toBe(true);

  // the settings are the thresholds: Starting wood 75 moves the check's limit (set in the Maps drawer's Difficulty section)
  const sheet = await openSection(page, "Difficulty");
  // Difficulty holds the start rules in this order, at Normal's values; "Designed for" and its Easy and Hard are gone
  await expect(sheet.locator("label.field .field-head")).toHaveText(["Starting wood", "Max walk to water", "Starting berries", "Start area", "No ruins within"]);
  await expect(sheet.locator("#rule-wood")).toHaveValue("200");
  await expect(sheet.locator("#rule-water")).toHaveValue("20");
  await expect(sheet.locator("#rule-bushes")).toHaveValue("30");
  await expect(page.locator("aside[aria-label=\"Maps\"]")).not.toContainText("Designed for");
  await expect(page.locator("aside[aria-label=\"Maps\"]").getByRole("button", { name: /^(Easy|Hard)$/ })).toHaveCount(0);
  await sheet.getByLabel("Starting wood").fill("75");
  await sheet.getByLabel("Starting wood").dispatchEvent("change");
  await page.getByRole("form", { name: "Settings" }).getByRole("button", { name: /^Generate/ }).click();
  await expect(page).toHaveURL(/&sl=75/, { timeout: 60_000 });
  await page.waitForFunction(() => window.dgm!.current!()?.checks.find((k) => k.id === "start.wood")?.limit === 75 && window.dgmEditor?.info().spec?.settings.start.rules.woodWithin20 === 75, null, { timeout: 60_000 });
  c = await checks(page);
  expect(c["start.wood"].limit).toBe(75);

  // the editor: the indicators name the three requirements with the map's numbers (the drawer closed again)
  await page.locator("header.editor-bar").getByRole("button", { name: "Map Generator", exact: true }).click();
  await page.getByRole("button", { name: "Top-down" }).click();
  // the start dragged on the map, a tile over and back: the indicators read the start's own place,
  // which the validator passed
  const start = (await page.evaluate(() => window.dgmEditor!.info())).features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  const at = (x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
  await centreOn(page, start.position[0], start.position[1]);
  const s0 = await at(start.position[0], start.position[1]);
  const s1 = await at(start.position[0] - 1, start.position[1]);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(s1.x, s1.y, { steps: 3 });
  await page.mouse.move(s0.x, s0.y, { steps: 3 });
  const box = page.locator(".start-indicators");
  await expect(box).toContainText(/Water without stairs: [\d.]+ tiles' walk \(at most 20\)/);
  await expect(box).toContainText(new RegExp(`Starting wood: \\d+ logs${WOOD_WORDS} \\(at least 75\\)`));
  await expect(box).toContainText(/Starting bushes: \d+ \(at least 30\)/);
  await expect(box).toContainText(/Logs for a Forester: \d+ within 40 tiles' walk \(at least 178\)/);
  const near = await page.evaluate(() => window.dgmEditor!.startCheck());
  expect(near!.problem).toBeNull();
  expect(near!.meets).toBe(true);
  // the page's walks give the validator's water distance and its wood (every tree in reach, by
  // its species' logs); it counts every bush that is not dead, so at least the validator's living
  // ones (D105)
  expect(near!.water).toBe(c["start.water"].value);
  expect(near!.wood).toBe(c["start.wood"].value);
  expect(near!.woodFloor).toBe(c["start.wood_floor"].value);
  expect(near!.bushes).toBeGreaterThanOrEqual(c["start.food"].value as number);
  await expect(box.getByRole("paragraph").first()).toHaveText("The district center fits here");

  // walked away from the river, the water is too far, or the wood and bushes fall short: the
  // footprint turns red and says which requirement it misses
  const water = c["start.water"].where!.tiles![0];
  const away = water[1] > start.position[1] ? -1 : 1;
  let far = near;
  for (let k = 1; k <= 40 && far!.meets; k++) {
    const p = await at(start.position[0], start.position[1] + away * k);
    await page.mouse.move(p.x, p.y);
    far = await page.evaluate(() => window.dgmEditor!.startCheck());
  }
  expect(far!.meets).toBe(false);
  await expect(box.getByRole("paragraph").first()).toHaveText(/Fits, but misses a start requirement|Does not fit/);
  await expect(box.locator("li.low").first()).toBeVisible();
  // Esc puts it back where it stood
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(box).toHaveCount(0);
  expect(((await page.evaluate(() => window.dgmEditor!.info())).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual(start.position);
  expect(errors).toEqual([]);
});
