// The start through the page (ROADMAP M5's start acceptance, D184): dragged on the map, its
// footprint and what is nearby follow it; on the shelf, R turns its door; an edit that breaks it
// (an object on its door) shows the problem at once, with a one-click fix.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

test("the start: its footprint and what is nearby while it is dragged; on the shelf R turns its door; a broken start gets a one-click fix", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./#s=77&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  const W = (await info(page)).W;
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number]; orientation: string });

  // dragged a tile: the indicators read the spot (the three start requirements, D85; wood in logs,
  // D164); Esc puts it back
  const p0 = await client(page, start.position[0], start.position[1]);
  const p1 = await client(page, start.position[0], start.position[1] + 1);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p1.x, p1.y, { steps: 3 });
  await expect(page.getByRole("status").filter({ hasText: /The district center fits here|Fits, but misses a start requirement|Does not fit/ })).toBeVisible();
  await expect(page.locator(".start-indicators")).toContainText(/Starting wood: \d+ logs/);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle(page);
  expect((await info(page)).history).toEqual([]);

  // on the shelf, R turns its door: clicked where it stands, it turns there, one step
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Start", exact: true }).click();
  await page.keyboard.press("r");
  await page.mouse.move(p0.x + 3, p0.y);
  await page.mouse.move(p0.x, p0.y);
  const fit = (await page.waitForFunction(() => window.dgmEditor!.fit(), null, { timeout: 10_000 }).then((h) => h.jsonValue()))!;
  expect(fit.problem).toBeNull();
  const door = fit.tiles.at(-1)!;
  await page.mouse.click(p0.x, p0.y);
  await idle(page);
  let i = await info(page);
  expect(i.history.at(-1)!.label).toBe("Turn the start");
  expect((i.features.find((f) => f.kind === "start")!.params as { orientation: string }).orientation).not.toBe(start.orientation);

  // thorns on its door: the instant check shows the problem at once, with its fix
  await shelf.getByRole("button", { name: "Thorns", exact: true }).click();
  const pd = await client(page, door % W, Math.floor(door / W));
  await page.mouse.move(pd.x + 3, pd.y);
  await page.mouse.click(pd.x, pd.y);
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Place thorns");
  // the quiet dot turns amber with it; its list shows what this edit made, and the fix
  const dot = page.getByRole("button", { name: /^Checks: \d+ things? to look at/ });
  await expect(dot).toBeVisible({ timeout: 30_000 });
  await dot.click();
  const problems = page.getByRole("region", { name: "Checks" });
  await expect(problems).toContainText("This edit made");
  await problems.getByRole("button", { name: "Move the start to the nearest good spot" }).first().click();
  await idle(page);
  i = await info(page);
  expect(i.history.at(-1)!.label).toBe("Move the start to the nearest good spot");
  expect(await page.evaluate(() => window.dgmEditor!.instant().length)).toBe(0);
  expect(errors).toEqual([]);
});
