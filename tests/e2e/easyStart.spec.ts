// Easy start (D495): the toggle at the end of the generator's Size line, its tooltip, a theme keeping it, the browser
// remembering it, and a map generated with it on: its share link carries `es=1`, the header says so, and its start
// holds every Easy start target, each a passing row of its checks (tests/contract/easyStart.test.ts pins
// the rule itself).

import { expect, test } from "@playwright/test";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";
import { generateButton, openDrawer, openEditor, pick } from "./open";

test("Easy start: a toggle beside Size, kept by a theme and remembered; the map it makes carries it in its link, and its start holds every target", async ({ page }) => {
  test.setTimeout(420_000);
  await openEditor(page, "s=2&z=128&d=n&t=any");
  const panel = await openDrawer(page);
  const toggle = panel.getByRole("button", { name: "Easy start", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAttribute("title", "A flat, roomy start with water and food close by");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("dgm.easyStart")), "remembered in this browser").toBe("1");
  // a theme keeps it (it is no theme's setting), and Reset settings too
  await pick(panel, "Theme", "River Valley");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await pick(panel, "Theme", "Any");
  await panel.getByRole("button", { name: "Reset settings", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // the link's seed is kept, so Generate makes seed 2 with Easy start
  await expect(panel.getByRole("button", { name: "Keep", exact: true })).toHaveAttribute("aria-pressed", "true");
  const before = await page.evaluate(() => window.dgm!.current!()?.made ?? 0);
  await generateButton(page).click();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 300_000 });
  const shown = (await page.evaluate(() => window.dgm!.current!()))!;
  const fragment = shown.link.split("#")[1];
  expect(fragment).toContain("es=1");
  expect(fragment).toContain("s=2&");
  await expect.poll(() => new URL(page.url()).hash, { timeout: 30_000 }).toBe(`#${fragment}`);
  expect(shown.passed).toBe(true);
  await expect(page.locator(".editor-title .muted")).toContainText("Easy start");
  // its start holds every target, each a row of the checks it was made by
  expect(decodeSpecFragment(fragment)!.spec.settings.start.easyStart).toBe(true);
  const rows = shown.checks.filter((c) => c.id.startsWith("start.easy_"));
  expect(rows.map((c) => c.id).sort()).toEqual(["start.easy_badtide", "start.easy_badwater", "start.easy_calm", "start.easy_drought", "start.easy_farmland", "start.easy_food", "start.easy_hazards", "start.easy_metal", "start.easy_room", "start.easy_view", "start.easy_water", "start.easy_wood"]);
  for (const c of rows) expect(c.ok, `${c.id} ${c.value} / ${c.limit}`).toBe(true);
  // switched off, the next map has none of it
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("dgm.easyStart"))).toBeNull();
});
