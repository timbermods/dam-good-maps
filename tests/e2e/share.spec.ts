// ROADMAP M6: share links reproduce byte-identical files, through the page in Chromium (Node's side
// is tests/contract/share.test.ts). Opening a link generates its map and opens it in the editor; the address
// always holds the open map's share link (D330), which opens the same map again in a fresh browser, and both
// equal Node's bytes.

import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openDrawer, openEditor, openSection, waitForEditor } from "./open";
import { generate } from "../../src/core/gen/generate";
import { defaultSettings, encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";
import { shareCases } from "../shareCases";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

test("a share link opens the same map, byte for byte, in every theme; the address holds the link", async ({ page, browser }) => {
  test.setTimeout(360_000);
  // (every map is made for Normal, Kyler 2026-10-03: a link made for another difficulty is the next test's)
  for (const spec of shareCases().filter((c) => c.designedFor === "normal")) {
    const fragment = encodeSpecFragment(spec);
    const node = sha(generate(spec).bytes);
    // (a fresh load: a link that only changes the fragment does not reload the page)
    await openEditor(page, fragment);
    const shown = await page.evaluate(() => window.dgm!.current!());
    expect(shown?.passed, fragment).toBe(true);
    expect(shown?.sha256, fragment).toBe(node);
    // the address bar holds the open map's link, which carries the same spec
    const link = page.url();
    expect(new URL(link).hash, fragment).toBe("#" + fragment);
    expect(shown?.link.split("#")[1], fragment).toBe(fragment);
    // and opening it in a fresh browser (its own Your maps, so the map is made again, not reopened) gives the same bytes
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(link);
    await waitForEditor(other);
    expect((await other.evaluate(() => window.dgm!.current!()))?.sha256, link).toBe(node);
    await fresh.close();
  }
});

test("a link made for Easy or Hard opens a Normal map with Normal's default settings (every map is made for Normal, 2026-10-03)", async ({ page }) => {
  test.setTimeout(240_000);
  for (const d of ["e", "h"]) {
    await openEditor(page, `s=4242&z=128&d=${d}&t=canyon`);
    const normal = makeSpec({ seed: 4242, size: { x: 128, y: 128 }, theme: "canyon", designedFor: "normal" });
    const shown = await page.evaluate(() => window.dgm!.current!());
    const spec = await page.evaluate(() => window.dgmEditor!.info().spec);
    expect(spec?.designedFor, d).toBe("normal");
    expect(spec?.settings, d).toEqual(defaultSettings("canyon", "normal", { x: 128, y: 128 }));
    expect(shown?.link.split("#")[1], d).toBe(encodeSpecFragment(normal));
    expect(shown?.sha256, d).toBe(sha(generate(normal).bytes));
  }
});

test("changing a setting and generating puts it in the link", async ({ page }) => {
  await openEditor(page, "s=4242&t=riverValley&z=96&d=n");
  await (await openSection(page, "Water")).getByLabel("Waterfalls").selectOption("many");
  const first = await page.evaluate(() => window.dgm!.current!()?.sha256);
  await page.getByRole("form", { name: "Settings" }).getByRole("button", { name: /^Generate/ }).click();
  // (the new map, not the first one still showing: generating takes its time on a slow machine)
  await expect.poll(() => page.evaluate(() => window.dgm!.current!()?.sha256), { timeout: 120_000 }).not.toBe(first);
  await expect(page).toHaveURL(/&wf=m/);
  const shown = await page.evaluate(() => window.dgm!.current!());
  expect(shown?.link).toMatch(/&wf=m$/);
});

test("the drought reserve guard disables what a small map cannot hold", async ({ page }) => {
  // (a Normal map's Plenty reserve needs about 380 tiles of reservoir: more than 15% of a 48² map; the size is set
  // in the drawer, as most 48² River Valley seeds fail their checks and a link to one would open another seed)
  await openEditor(page, "s=4242&t=riverValley&z=96&d=n");
  await openDrawer(page);
  await page.locator("#size").selectOption("custom");
  await page.locator("#size-x").fill("48");
  await page.locator("#size-x").press("Tab");
  await page.locator("#size-y").fill("48");
  await page.locator("#size-y").press("Tab");
  await openSection(page, "Water");
  const plenty = page.locator("#reserve option[value=plenty]");
  await expect(plenty).toHaveJSProperty("disabled", true);
  await expect(plenty).toContainText("too big for this map size");
});
