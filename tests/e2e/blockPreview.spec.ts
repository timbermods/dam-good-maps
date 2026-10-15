// The Block tool's preview in the renderer (3D step 3, D488): `showBlocks` draws the blocks to add, take away and
// let fall, follows the layer cut, and puts them away.

import { expect, test } from "@playwright/test";
import { openEditor } from "./open";

test("showBlocks draws the three kinds, hides what a layer cut hides, and clears", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openEditor(page, "s=7&z=96&d=n&t=riverValley");
  const drawn = () => page.evaluate(() => window.dgm3d!.renderer.blocksDrawn);
  expect(await drawn()).toEqual({ added: 0, removed: 0, falls: 0 });
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const h = (x: number, y: number) => r.heightAt(x, y);
    r.showBlocks({ added: [[40, 40, h(40, 40)], [41, 40, h(41, 40)]], removed: [[44, 40, h(44, 40) - 1]], falls: [[46, 40, 20]] });
  });
  expect(await drawn()).toEqual({ added: 2, removed: 1, falls: 1 });
  // a layer cut at 10 hides the fallen block at layer 20
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(10));
  expect((await drawn()).falls).toBe(0);
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(null));
  expect((await drawn()).falls).toBe(1);
  await page.evaluate(() => window.dgm3d!.renderer.showBlocks(null));
  expect(await drawn()).toEqual({ added: 0, removed: 0, falls: 0 });
  expect(errors).toEqual([]);
});
