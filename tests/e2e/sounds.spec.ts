// The editor's sounds, round two (PLAN §20 D226; Codex's #64): the recorded bank loads on the player's
// first click or key in the editor, never with the page, and the edit that first gesture makes never
// waits on it; sounds are on at the mix's own clearly audible default; a placement plays its
// accent; a force's sounds stop at once on Esc.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const sound = (page: Page) => page.evaluate(() => window.dgmEditor!.sound());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

test("the sounds: the recorded bank loads on the first gesture, never with the page; the first edit never waits on it; a placement's accent plays; Ctrl+Z stops a force's sounds at once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (/\/sounds\/juice-2\//.test(r.url())) fetched.push(r.url());
  });
  await page.goto("./#s=4242&z=96&d=n&t=highlands");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  // (the editor open, nothing asked of it yet: no recording fetched)
  expect(fetched).toEqual([]);
  expect((await sound(page))!.ready).toBe(false);
  // on, at the round-two mix's own clearly audible level, a quarter lower since D313
  // (the volume shows beside the Sound switch on hover)
  await expect(page.locator('input[aria-label="Sound volume"]')).toHaveValue("0.54");

  // the first gestures (the view from above, Raise, a click on the land): the edit is there at once
  await page.getByRole("button", { name: "Top-down" }).click();
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const at: [number, number] = [start[0] < i.W / 2 ? Math.round(i.W * 0.75) : Math.round(i.W * 0.25), Math.round(i.H / 2)];
  await page.getByRole("button", { name: "Raise brush (1)" }).click();
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  expect((await info(page)).history.filter((h) => h.applied).at(-1)!.label).toMatch(/Raise/);
  // meanwhile the bank came, every recording once
  await expect.poll(() => new Set(fetched).size, { timeout: 30_000 }).toBe(24);
  await expect.poll(async () => (await sound(page))!.ready, { timeout: 30_000 }).toBe(true);

  // a tree placed: its accent plays
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Pine", exact: true }).click();
  const q = await client(page, at[0] + 4, at[1] + 4);
  await page.mouse.move(q.x + 3, q.y);
  await page.mouse.click(q.x, q.y);
  await expect.poll(async () => (await sound(page))!.playing, { timeout: 2_000, intervals: [20, 40, 80] }).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  // an impact: its sounds as it strikes; Ctrl+Z takes it back and every sound of it stops at once
  await expect.poll(async () => (await sound(page))!.playing, { timeout: 5_000 }).toBe(0);
  // (at the slowest pace, so Esc comes while it is still at work)
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("slower");
  const kept = (await info(page)).history.filter((h) => h.applied).length;
  await page.keyboard.press("8");
  const c = await client(page, at[0], at[1] + 8);
  await page.mouse.move(c.x + 3, c.y);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await sound(page))!.playing, { timeout: 3_000, intervals: [20, 40, 80] }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.dgmEditor!.force())).not.toBeNull();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await sound(page))!.playing, { timeout: 1_000, intervals: [50, 100] }).toBe(0);
  await idle(page);
  expect((await info(page)).history.filter((h) => h.applied).length).toBe(kept);
  expect(errors).toEqual([]);
});
