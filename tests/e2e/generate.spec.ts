// Generate always makes a new map (PLAN §20 D323, feedback item 20): every press rolls a fresh seed;
// typing a seed pins it (a small lock beside the box) and Generate then makes that map again until
// it is unlocked or cleared; opening a share link pins its seed; the Dice button is gone. The seed
// in the box, the map card, the caption, the link and the map Refine opens are always the map shown.

import { expect, test, type Page } from "@playwright/test";

const seedBox = (page: Page) => page.locator("#seed");
const lock = (page: Page) => page.getByRole("button", { name: /^Seed kept/ });
const generate = (page: Page) => page.getByRole("button", { name: /^Generate/ });
const done = (page: Page) => expect(page.getByText(/All \d+ checks passed|checks failed/)).toBeVisible({ timeout: 120_000 });
/** Press Generate and wait for the next map to be on show. */
async function press(page: Page) {
  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  await generate(page).click();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
}
/** The seed of the map on show: its card, its caption and its link, which must agree. */
async function shownSeed(page: Page): Promise<string> {
  const card = (await page.locator(".card header .muted").textContent())!.match(/seed (\d+)/)![1];
  const caption = (await page.locator(".view-caption").textContent())!.match(/seed (\d+)/)![1];
  const link = (await page.evaluate(() => window.dgm!.current!()))!.link.match(/[#&]s=(\d+)/)![1];
  expect(caption).toBe(card);
  expect(link).toBe(card);
  return card;
}
const sha = async (page: Page) => (await page.evaluate(() => window.dgm!.current!()))!.sha256;

test("Generate rolls a fresh seed every press; the box, the card, the caption and the link show the map made", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("./#s=4242&z=64&d=n&t=riverValley");
  await done(page);
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
  // Refine opens the map the card shows (a random seed can fail its checks: roll again until one passes)
  let seed = third;
  for (let k = 0; k < 6 && !(await page.evaluate(() => window.dgm!.current!()!.passed)); k++) {
    await press(page);
    seed = await shownSeed(page);
  }
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  expect((await page.evaluate(() => window.dgmEditor!.info())).spec?.seed).toBe(Number(seed));
});

test("a typed seed is pinned: Generate makes the same map until it is unlocked or cleared; a share link pins its seed; no Dice", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("./#s=4242&z=64&d=n&t=riverValley");
  await done(page);
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

test("while a new map is being made, Refine and the downloads wait: they would take the new map under the old one's card", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("./#s=4242&z=128&d=n&t=riverValley");
  await done(page);
  await lock(page).click();
  const before = await page.evaluate(() => window.dgm!.current!()!.made);
  await generate(page).click();
  await expect(page.getByRole("button", { name: "Refine this map" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Download / }).first()).toBeDisabled();
  await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Refine this map" })).toBeEnabled();
  // and Refine opens the map the card shows
  const seed = await shownSeed(page);
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 60_000 });
  expect((await page.evaluate(() => window.dgmEditor!.info())).spec?.seed).toBe(Number(seed));
});
