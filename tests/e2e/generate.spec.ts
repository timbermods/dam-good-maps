// Generate always makes a new map (PLAN §20 D323, feedback item 20; D330: the map is the editor's from the
// start): every press rolls a fresh seed; typing a seed pins it (a small lock beside the box) and Generate
// then makes that map again until it is unlocked or cleared; opening a share link pins its seed; the Dice
// button is gone. The seed in the box, the panel's map card, the address, the link and the map open in the
// editor are always the map shown.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const seedBox = (page: Page) => page.locator("#seed");
const lock = (page: Page) => page.getByRole("button", { name: /^Seed kept/ });
/** The panel's Generate (the submit button; it says what is being made while a map is). */
const generate = (page: Page) => page.getByRole("form", { name: "Settings" }).locator('button[type="submit"]');
const seedOf = (link: string) => link.match(/[#&]s=(\d+)/)![1];
/** The seed the editor's map was made from. */
const editorSeed = (page: Page) => page.evaluate(() => window.dgmEditor?.info().spec?.seed);

/** Press Generate and wait until the next map is on show and open in the editor. A random seed can fail its
 *  checks (the page then keeps the map on show and says so): an unpinned press rolls again, up to a few times. */
async function press(page: Page) {
  for (let k = 0; k < 6; k++) {
    const before = await page.evaluate(() => window.dgm!.current!()!.made);
    await generate(page).click();
    const result = await page.waitForFunction(
      (n) => ((window.dgm!.current!()?.made ?? 0) > n ? "map" : /No valid map/.test(document.querySelector('[role="alert"]')?.textContent ?? "") ? "failed" : false),
      before,
      { timeout: 120_000 },
    );
    if ((await result.jsonValue()) === "map") {
      await expect.poll(async () => String(await editorSeed(page)), { timeout: 60_000 }).toBe(seedOf((await page.evaluate(() => window.dgm!.current!()))!.link));
      await expect(generate(page)).toBeEnabled({ timeout: 60_000 });
      return;
    }
    await expect(generate(page)).toBeEnabled({ timeout: 60_000 });
    await page.getByRole("alert").getByRole("button", { name: "Dismiss" }).click();
    if (await lock(page).count()) throw new Error("the pinned seed's map did not pass its checks");
  }
  throw new Error("six random maps in a row failed their checks");
}
/** The seed of the map on show: the card's facts line, the address, the link and the editor's map, which must agree. */
async function shownSeed(page: Page): Promise<string> {
  const card = (await page.locator(".map-card .facts").textContent())!.match(/seed (\d+)/)![1];
  const link = (await page.evaluate(() => window.dgm!.current!()))!.link;
  expect(seedOf(link)).toBe(card);
  expect(seedOf(new URL(page.url()).hash)).toBe(card);
  await expect.poll(async () => String(await editorSeed(page)), { timeout: 30_000 }).toBe(card);
  return card;
}
const sha = async (page: Page) => (await page.evaluate(() => window.dgm!.current!()))!.sha256;

test("Generate rolls a fresh seed every press; the box, the card, the address, the link and the editor show the map made", async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // a link pinned its seed: unpin it, then Generate rolls
  await expect(lock(page)).toBeVisible();
  await lock(page).click();
  await expect(lock(page)).toHaveCount(0);
  const first = await shownSeed(page);
  await press(page);
  const second = await shownSeed(page);
  expect(second).not.toBe(first);
  expect(await seedBox(page).inputValue()).toBe(second);
  await press(page);
  const third = await shownSeed(page);
  expect(third).not.toBe(second);
  expect(await seedBox(page).inputValue()).toBe(third);
  // the map card names the map the editor holds
  const info = await page.evaluate(() => window.dgmEditor!.info());
  await expect(page.getByRole("heading", { level: 1, name: info.name })).toBeVisible();
});

test("a typed seed is pinned: Generate makes the same map until it is unlocked or cleared; a share link pins its seed; no Dice", async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page, "s=4242&z=96&d=n&t=riverValley");
  // a link pins its seed
  await expect(lock(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Dice" })).toHaveCount(0);
  const a = await sha(page);
  await press(page);
  expect(await shownSeed(page)).toBe("4242");
  expect(await sha(page)).toBe(a);
  // clear the box: unpinned; Generate rolls
  await seedBox(page).fill("");
  await expect(lock(page)).toHaveCount(0);
  await press(page);
  const rolled = await shownSeed(page);
  expect(rolled).not.toBe("4242");
  await expect(lock(page)).toHaveCount(0);
  // typing a seed pins it
  await seedBox(page).fill("777");
  await expect(lock(page)).toBeVisible();
  await press(page);
  expect(await shownSeed(page)).toBe("777");
  const b = await sha(page);
  await press(page);
  expect(await shownSeed(page)).toBe("777");
  expect(await sha(page)).toBe(b);
  // unlocking lets Generate roll again, and the box shows the new seed
  await lock(page).click();
  await expect(lock(page)).toHaveCount(0);
  await press(page);
  expect(await shownSeed(page)).not.toBe("777");
});

test("while a new map is being made, Generate waits; the map on show stays one map: the card's, the address's and the editor's", async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  await lock(page).click();
  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  const first = await shownSeed(page);
  await generate(page).click();
  // (a second press cannot start another map under the first)
  await expect(generate(page)).toBeDisabled();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
  await expect(generate(page)).toBeEnabled({ timeout: 120_000 });
  const second = await shownSeed(page);
  expect(second).not.toBe(first);
});
