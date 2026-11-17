// A map being made is bounded and says why it is slow (the owner's phone: "Attempt 10 · 32 min 14 s", still going): the line
// under the count gives the last try's reason, after 30 s of running time the card offers the same settings without Easy
// start, after 5 minutes the generate stops by itself and the card says no map was kept and why, the open map and the
// settings as they were. The screen is held on only while it runs. The e2e build's running clock is sped up
// (window.__dgmMakingRate) once the first reason shows, and again once the offer is read, so the bounds come without
// waiting them out.

import { expect, test } from "@playwright/test";
import { generateButton, openDrawer, openEditor } from "./open";

/** River Valley 128² with Easy start, seed 3: its first attempts are refused within seconds and its map takes many more
 *  (tens of seconds on CI), so a generate of it is under way long enough to read. */
const SLOW = "s=3&z=128&d=n&t=riverValley&es=1";

test("a generate says why its last try failed, offers the map without Easy start, and stops itself with a reason, the open map kept", async ({ page }) => {
  test.setTimeout(300_000);
  // a screen wake lock that counts what is held
  await page.addInitScript(() => {
    const w = window as unknown as { __held: number; __asked: number };
    w.__held = 0;
    w.__asked = 0;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          w.__asked++;
          w.__held++;
          let on = true;
          return { release: async () => void (on && (on = false, w.__held--)) };
        },
      },
    });
  });
  const held = () => page.evaluate(() => (window as unknown as { __held: number }).__held);
  await openEditor(page, SLOW, { timeout: 240_000 });
  expect(await held(), "no lock held once the map is open").toBe(0);
  const before = (await page.evaluate(() => window.dgm!.current!()))!;
  const panel = await openDrawer(page);
  const easy = panel.getByRole("button", { name: "Easy start", exact: true });
  await expect(easy).toHaveAttribute("aria-pressed", "true");

  // the link's seed is kept: Generate makes the same slow map over the open one
  await generateButton(page).click();
  const card = page.locator(".making-dialog");
  await expect(card.locator(".making-why")).toHaveText(/^Last try: [a-z]/, { timeout: 60_000 });
  expect(await held(), "the screen held on while it runs").toBe(1);
  await expect(card.getByRole("button", { name: "Without Easy start" })).toHaveCount(0);

  // 30 s of running time: the nearest thing that works, beside Cancel
  await page.evaluate(() => ((window as unknown as { __dgmMakingRate: number }).__dgmMakingRate = 40));
  const easier = card.getByRole("button", { name: "Without Easy start" });
  await expect(easier).toBeVisible();
  await expect(easier).toHaveAttribute("title", "Make this map without Easy start");
  await expect(card.getByRole("button", { name: "Cancel" })).toBeVisible();

  // 5 minutes: it stops by itself, a refusal with the last reason, the same way forward and Close (the clock run on fast
  // once the offer is read: the stop comes at once rather than seconds later)
  await page.evaluate(() => ((window as unknown as { __dgmMakingRate: number }).__dgmMakingRate = 2000));
  await expect(page.locator("#making-words")).toHaveText(/^No map was kept in 5 minutes: [a-z].*\.$/, { timeout: 60_000 });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(card.getByRole("button", { name: "Without Easy start" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Close" })).toBeVisible();
  await expect.poll(held, { message: "the lock let go" }).toBe(0);
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // nothing silently changed: the map that was open is open, the settings as they were
  const after = (await page.evaluate(() => window.dgm!.current!()))!;
  expect(after.sha256).toBe(before.sha256);
  await expect(easy).toHaveAttribute("aria-pressed", "true");
});
