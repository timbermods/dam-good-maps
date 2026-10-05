// M1 acceptance: the same spec gives a byte-identical .timber in Node and in Chromium (PLAN §5.1).
// The browser side runs the real worker through the page's test hook, window.dgm.generate().

import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openEditor, openFileMenu } from "./open";
import { generate } from "../../src/core/gen/generate";
import { encodeSpecFragment, GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";

const SIZES = [96, 128, 256];
const CASES = Array.from({ length: 10 }, (_, i) => makeSpec({ seed: 1000 + 37 * i, size: { x: SIZES[i % 3], y: SIZES[i % 3] } }));

test("Node and Chromium produce identical .timber bytes for 10 seeds", async ({ page }) => {
  // (only a hang fails on time: M9a's 256² maps take a minute or so each in the page, D115)
  test.setTimeout(900_000);
  await page.goto("./#" + encodeSpecFragment(CASES[0]));
  await page.waitForFunction(() => "dgm" in window);
  for (const spec of CASES) {
    const node = generate(spec);
    const nodeSha = createHash("sha256").update(node.bytes).digest("hex");
    const fragment = encodeSpecFragment(spec);
    const web = await page.evaluate((f) => window.dgm!.generate(f), fragment);
    expect(web.passed, fragment).toBe(true);
    expect(web.bytes, fragment).toBe(node.bytes.length);
    expect(web.sha256, fragment).toBe(nodeSha);
  }
});

test("the page generates a map and offers both downloads", async ({ page }) => {
  await openEditor(page, `s=4242&z=128&d=n&t=riverValley&v=${GENERATOR_VERSION}`);
  const menu = await openFileMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Download .timber" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Download project" })).toBeEnabled();
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Download .timber" }).click();
  expect((await download).suggestedFilename()).toBe("dgm-river-valley-4242.timber");
});
