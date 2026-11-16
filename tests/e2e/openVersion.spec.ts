// "Open it" on the note that a better version of the map is ready (D329): the version replaces the map on screen, and that
// map cannot be made again (its seed now makes the version), so Your maps keeps it as it stood and says so (D234, D336).
// The note says only what the version was measured to add ("a longer canyon"), not "its canyon" on a map that is a Canyon.

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { findVersion, missesOf } from "../../src/core/gen/versions";
import { decodeSpecFragment } from "../../src/core/spec/codec";
import { openEditor, openYourMaps } from "./open";

/** The land the renderer draws now, as a sum over its tiles (two maps that differ somewhere differ here). */
const drawn = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.mapState()!.heights.reduce((a, b) => a + b, 0));
const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());

/** The first Canyon 96² whose first map misses its canyon and whose background search finds a version: the map this test
 *  needs, found by that property as the page finds it (the same generator and search, gen/versions.ts), so a land change
 *  never leaves the test waiting on a note that cannot come (D148: generator 0.10.29's seed 3 keeps its canyon, as 0.10.24's
 *  seed 4 did before it). */
function canyonMissingItsCanyon(): string {
  for (let seed = 1; seed <= 24; seed++) {
    const hash = `s=${seed}&z=96&d=n&t=canyon`;
    const r = generate(decodeSpecFragment(hash)!.spec);
    if (!r.report.passed || !r.outcomes || !missesOf(r.outcomes).promise) continue;
    if (findVersion({ spec: r.spec, intentions: r.info.genome?.intentions ?? [], heights: r.built.heights }).result) return hash;
  }
  throw new Error("no Canyon 96² of seeds 1–24 misses its canyon with a version to find");
}

test("Open it keeps the map it replaces in Your maps, and the note names what the version adds", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1600, height: 900 });
  // (a Canyon whose first map misses its canyon)
  await openEditor(page, canyonMissingItsCanyon(), { versionSearch: true });
  const first = await info(page);
  const firstLand = await drawn(page);
  expect(first.edits).toBe(0);

  // the note, found by the background search
  const found = page.locator("p.floating", { hasText: "A version with" });
  await expect(found).toBeVisible({ timeout: 400_000 });
  const said = (await found.innerText()).replace(/\.?\s*Open it\s*×\s*$/, "");
  expect(said).toMatch(/^A version with .+ is ready$/);
  // (what it adds, not the theme's name as if the map lacked it)
  expect(said).not.toMatch(/its canyon/);
  expect(said).toContain("a longer canyon");

  await found.getByRole("button", { name: "Open it" }).click();
  await expect(page.locator("p.floating", { hasText: "The map before it is in Your maps." })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => drawn(page)).not.toBe(firstLand);

  // the map that was on screen is in Your maps, as it stood
  const yours = await openYourMaps(page);
  await expect(yours.locator("li")).toHaveCount(1);
  await yours.locator("li").first().click();
  await expect.poll(() => drawn(page), { timeout: 60_000 }).toBe(firstLand);
  const back = await info(page);
  expect([back.W, back.H, back.edits]).toEqual([first.W, first.H, 0]);
  expect(back.spec?.variation ?? 0).toBe(first.spec?.variation ?? 0);
  expect(errors).toEqual([]);
});
