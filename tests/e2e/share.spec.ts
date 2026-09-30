// ROADMAP M6: share links reproduce byte-identical files, through the page in Chromium (Node's side
// is tests/contract/share.test.ts). Opening a link generates its map; the page's own "Copy link"
// gives a link that opens the same map again, and both equal Node's bytes.

import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { encodeSpecFragment } from "../../src/core/spec/mapspec";
import { shareCases } from "../shareCases";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

test("a share link opens the same map, byte for byte, in every theme", async ({ page, context }) => {
  test.setTimeout(360_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const spec of shareCases()) {
    const fragment = encodeSpecFragment(spec);
    const node = sha(generate(spec).bytes);
    // a fresh load: a link that only changes the fragment does not reload the page
    await page.goto("about:blank");
    await page.goto("./#" + fragment);
    await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
    const shown = await page.evaluate(() => window.dgm!.current!());
    expect(shown?.passed, fragment).toBe(true);
    expect(shown?.sha256, fragment).toBe(node);
    // the page's own link carries the same spec
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied.")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link.split("#")[1], fragment).toBe(fragment);
    // and opening it in a fresh page gives the same bytes
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
    expect((await other.evaluate(() => window.dgm!.current!()))?.sha256, link).toBe(node);
    await other.close();
  }
});

test("changing a setting and generating puts it in the link", async ({ page }) => {
  await page.goto("./#s=4242&t=riverValley&z=96&d=n");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.locator("summary", { hasText: /^Water$/ }).click();
  await page.getByLabel("Waterfalls").selectOption("many");
  const first = await page.evaluate(() => window.dgm!.current!()?.sha256);
  await page.getByRole("button", { name: /Generate/ }).click();
  // (the new map, not the first one's card still showing: generating takes its time on a slow machine)
  await expect.poll(() => page.evaluate(() => window.dgm!.current!()?.sha256), { timeout: 120_000 }).not.toBe(first);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/&wf=m/);
  const shown = await page.evaluate(() => window.dgm!.current!());
  expect(shown?.link).toMatch(/&wf=m$/);
});

test("the drought reserve guard disables what a small map cannot hold", async ({ page }) => {
  await page.goto("./#s=5&t=riverValley&z=56&d=h");
  await expect(page.locator(".card")).toBeVisible({ timeout: 120_000 });
  await page.locator("summary", { hasText: /^Water$/ }).click();
  const plenty = page.locator("#reserve option[value=plenty]");
  await expect(plenty).toHaveJSProperty("disabled", true);
  await expect(plenty).toContainText("too big for this map size");
});
