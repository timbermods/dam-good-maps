// Drought and Badtide, day by day (PLAN §20 D267, D268, D269): a click shows the hazard's last day
// at once and a second click the map's own water; the day strip steps day by day (at Instant a step
// jumps and stays), with Speed only there; a length of 3 is a three-day strip, remembered; hovering
// water says when it dries; any edit ends the view at once, and the button again shows the new
// land's last day. The camera never moves on its own (D265).

import { expect, test, type Page } from "@playwright/test";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());

/** Total water depth on screen. */
const shown = (page: Page) =>
  page.evaluate(() => {
    const d = window.dgm3d!.renderer.mapState()!.surface.depth;
    let a = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > 0) a += d[i];
    return a;
  });
/** Total water depth of a hazard's day in the worker (0: the map's own), or null once it ended. */
const dayVolume = (page: Page, day: number) =>
  page.evaluate(async (d) => {
    const w = await window.dgmEditor!.worker.hazardDay(d);
    return w ? Array.from(w.water.depth).reduce((a, b) => a + b, 0) : null;
  }, day);
/** Total water depth of the map's own water in the worker. */
const ownVolume = (page: Page) =>
  page.evaluate(async () => {
    const w = (await window.dgmEditor!.worker.sessionView()).view.water;
    let b = 0;
    for (let k = 0; k < w.count; k++) b += w.depth[k];
    return b;
  });
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3 * Math.max(1, b);

async function open(page: Page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  const bar = page.getByRole("toolbar", { name: "Water time" });
  await expect(bar.getByRole("status")).toHaveText("Water settled", { timeout: 60_000 });
  return bar;
}

test("Drought shows its last day at once and again the map's own water; the strip steps day by day; a length of 3 is three days", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const bar = await open(page);
  const view0 = await page.evaluate(() => window.dgm3d!.renderer.getView());
  const own = await shown(page);
  // no speed on the everyday bar (D268)
  await expect(bar.getByRole("combobox")).toHaveCount(0);

  // Drought: the last day at once (the default length, Normal's longest: 9)
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 9 of 9", { timeout: 60_000 });
  await expect(bar.getByRole("button", { name: "Drought" })).toHaveAttribute("aria-pressed", "true");
  const strip = bar.getByRole("group", { name: "Drought days" });
  await expect(strip.getByRole("button", { name: /^Day \d+$/ })).toHaveCount(10);
  await expect(strip.getByRole("button", { name: "Day 9" })).toHaveAttribute("aria-current", "true");
  const last = (await dayVolume(page, 9))!;
  expect(last).toBeLessThan(own);
  await expect.poll(async () => near(await shown(page), last)).toBe(true);
  // the start's marker or its words, beside the strip
  await expect(strip.locator(".strip-note")).toHaveText(/Day \d+: your start's water is gone|Your start's water lasts the drought|No water a pump reaches near your start/);

  // hovering water says when it dries
  const wetTile = await page.evaluate(async () => {
    const w = (await window.dgmEditor!.worker.sessionView()).view.water;
    let best = -1;
    for (let k = 0; k < w.count; k++) if (w.depth[k] > 0.5 && (best < 0 || w.depth[k] > w.depth[best])) best = k;
    const i = w.tile[best];
    const W = window.dgmEditor!.info().W;
    return [i % W, Math.floor(i / W)] as [number, number];
  });
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), wetTile);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(".readout")).toHaveText(/(Dry on day \d+|Lasts the drought)$/);

  // Speed is on the strip alone; at Instant a step jumps to the day and stays there
  const speed = strip.getByRole("combobox", { name: "Speed" });
  await expect(speed).toHaveValue("normal");
  await speed.selectOption("instant");
  await strip.getByRole("button", { name: "Day 3" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 3 of 9");
  await strip.getByRole("button", { name: "Next day" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 4 of 9");
  const day4 = (await dayVolume(page, 4))!;
  await expect.poll(async () => near(await shown(page), day4)).toBe(true);
  await page.waitForTimeout(2500);
  await expect(bar.getByRole("status")).toHaveText("Drought: day 4 of 9");
  expect(near(await shown(page), day4)).toBe(true);

  // at Slower a step moves the day's water: Pause holds it, Skip finishes it on the day
  await speed.selectOption("slower");
  await strip.getByRole("button", { name: "Next day" }).click();
  await page.waitForTimeout(700);
  await bar.getByRole("button", { name: "Pause", exact: true }).click();
  const held = await shown(page);
  await page.waitForTimeout(800);
  expect(await shown(page)).toBe(held);
  await bar.getByRole("button", { name: "Skip" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 5 of 9");
  await expect.poll(async () => near(await shown(page), (await dayVolume(page, 5))!)).toBe(true);
  // (the step is over: nothing is held)
  await expect(bar.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  // Drought again: the map's own water at once
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("group", { name: "Drought days" })).toHaveCount(0);
  await expect(bar.getByRole("status")).toHaveText("Water settled");
  await expect.poll(async () => near(await shown(page), await ownVolume(page))).toBe(true);

  // a length of 3: a three-day strip, its last day shown; remembered
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 9 of 9", { timeout: 60_000 });
  const days = strip.getByRole("spinbutton", { name: "Days" });
  await days.fill("3");
  await days.press("Enter");
  await expect(bar.getByRole("status")).toHaveText("Drought: day 3 of 3", { timeout: 60_000 });
  await expect(strip.getByRole("button", { name: /^Day \d+$/ })).toHaveCount(4);
  await expect.poll(async () => near(await shown(page), (await dayVolume(page, 3))!)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dgm.hazardDays") ?? "{}").drought)).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem("dgm.daySpeed"))).toBe("slower");
  await bar.getByRole("button", { name: "Drought" }).click();

  // Badtide: its own last day (Normal's longest, 8), the clean water turned bad
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect(bar.getByRole("status")).toHaveText("Badtide: day 8 of 8", { timeout: 120_000 });
  await expect(bar.getByRole("group", { name: "Badtide days" }).getByRole("button", { name: /^Day \d+$/ })).toHaveCount(9);
  const bad = await page.evaluate(() => {
    const s = window.dgm3d!.renderer.mapState()!.surface;
    let n = 0;
    for (let i = 0; i < s.depth.length; i++) if (s.depth[i] > 0.05 && s.contamination[i] > 0.5) n++;
    return n;
  });
  expect(bad).toBeGreaterThan(50);
  await bar.getByRole("button", { name: "Badtide" }).click();
  await expect.poll(async () => near(await shown(page), await ownVolume(page))).toBe(true);

  // the camera stayed where it was (D265)
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView())).toEqual(view0);
  expect(errors).toEqual([]);
});

test("an edit while day 9 is shown returns the map's own water at once; Drought again shows the new land's last day", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const bar = await open(page);
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 9 of 9", { timeout: 60_000 });
  const before = (await dayVolume(page, 9))!;
  const own = await ownVolume(page);

  // a strong water source on high ground away from the start: an edit
  const i = await page.evaluate(() => window.dgmEditor!.info());
  const W = i.W;
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  const at: [number, number] = [start[0] < W / 2 ? Math.round(W * 0.85) : Math.round(W * 0.15), Math.round(W * 0.9)];
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), at);
  await page.mouse.click(p.x, p.y);
  // at once: the view ends, and the map's own water (with the edit's) is on screen
  await expect(bar.getByRole("group", { name: "Drought days" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Drought" })).toHaveAttribute("aria-pressed", "false");
  expect(await shown(page)).toBeGreaterThan(before + 0.5 * (own - before));
  expect(await dayVolume(page, 9)).toBeNull();
  await idle(page);
  await page.keyboard.press("Escape");
  // the edit's water plays as usual, at the one brisk pace, to the map's water
  await expect(bar.getByRole("status")).toHaveText("Water settled", { timeout: 60_000 });

  // Drought again: the new land's last day
  await bar.getByRole("button", { name: "Drought" }).click();
  await expect(bar.getByRole("status")).toHaveText("Drought: day 9 of 9", { timeout: 60_000 });
  const after = (await dayVolume(page, 9))!;
  expect(after).not.toBe(before);
  await expect.poll(async () => near(await shown(page), after)).toBe(true);

  // a stroke ends it too
  await page.getByRole("button", { name: "Raise brush (1)" }).click();
  const q = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0], at[1] - 8] as [number, number]);
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await expect(bar.getByRole("group", { name: "Drought days" })).toHaveCount(0);
  await page.mouse.move(q.x + 10, q.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  await idle(page);
  expect(errors).toEqual([]);
});
