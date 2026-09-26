// Live editing: the terrain brushes in the page. The ground changes under the cursor while the
// button is down; the stroke becomes one step of the history ("Raise, 38 tiles") whose map, built
// by the worker, is the one painted, byte for byte; undo and redo show at once; Esc cancels a
// stroke with no trace; Shift inverts; Ctrl+click picks flatten's level; [ ] size and Shift+wheel
// strength; the stroke is still there after a reload (the autosave).

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const settled = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
}

/** A stroke from tile a toward tile b; `mid` runs halfway through, the button still down. */
async function stroke(page: Page, a: [number, number], b: [number, number], opts: { mid?: () => Promise<void>; shift?: boolean } = {}) {
  const p = await client(page, ...a);
  const q = await client(page, ...b);
  await page.mouse.move(p.x, p.y);
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  for (let k = 1; k <= 30; k++) {
    await page.mouse.move(p.x + ((q.x - p.x) * k) / 30, p.y + ((q.y - p.y) * k) / 30);
    await page.waitForTimeout(10);
    if (k === 15 && opts.mid) await opts.mid();
  }
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up("Shift");
}

test("the brushes paint under the cursor, undo at once, and keep their strokes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  const W = (await info(page)).W;
  const start = (await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] };
  // a place away from the start
  const at: [number, number] = start.position[0] < W / 2 ? [70, 30] : [20, 30];

  // the top bar: labelled, with shortcuts; the number keys pick a brush
  const bar = page.getByRole("toolbar", { name: "Tools" });
  await expect(bar.getByRole("button", { name: "Raise brush (1)" })).toBeVisible();
  await page.keyboard.press("1");
  await expect(bar.getByRole("button", { name: "Raise brush (1)" })).toHaveAttribute("aria-pressed", "true");
  // the first run's three hints (D184): painting the land takes its line away
  const hints = page.getByRole("status", { name: "First steps" });
  await expect(hints).toContainText("Paint the land");
  await expect(hints).toContainText("Place things");
  await expect(hints).toContainText("Add water");

  // raise: the ground rises under the cursor before the button comes up
  const before = await heights(page);
  let during: number[] = [];
  await stroke(page, at, [at[0] + 8, at[1]], { mid: async () => void (during = await heights(page)) });
  expect(during.some((h, i) => h > before[i])).toBe(true);
  await expect(hints).not.toContainText("Paint the land");
  await expect(hints).toContainText("Place things");
  await settled(page);
  let i = await info(page);
  expect(i.history.at(-1)!.label).toMatch(/^Raise, \d+ tiles?$/);
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);
  // the worker's map is the one painted, byte for byte
  const painted = await heights(page);
  const built = await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.sessionView()).view.heights));
  expect(built).toEqual(painted);

  // undo shows at once (before the worker answers), redo too
  await page.keyboard.press("Control+z");
  expect(await heights(page)).toEqual(before);
  await settled(page);
  expect((await info(page)).history.at(-1)!.applied).toBe(false);
  await page.keyboard.press("Control+y");
  expect(await heights(page)).toEqual(painted);
  await settled(page);
  expect(await page.evaluate(() => window.dgmEditor!.strokeMismatches())).toBe(0);

  // Shift inverts: raise lowers
  await stroke(page, [at[0], at[1] + 6], [at[0] + 6, at[1] + 6], { shift: true });
  await settled(page);
  expect((await info(page)).history.at(-1)!.label).toMatch(/^Lower, /);

  // Esc cancels a stroke in progress: no trace on the map or in the history
  const steps = (await info(page)).history.length;
  const clean = await heights(page);
  await stroke(page, [at[0], at[1] + 12], [at[0] + 8, at[1] + 12], { mid: () => page.keyboard.press("Escape") });
  await page.waitForTimeout(300);
  await settled(page);
  expect(await heights(page)).toEqual(clean);
  expect((await info(page)).history.length).toBe(steps);

  // flatten: Ctrl+click picks the level from the ground
  await page.keyboard.press("3");
  const p = await client(page, ...start.position);
  const level = await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x, y), start.position);
  await page.keyboard.down("Control");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Control");
  await expect(page.getByRole("group", { name: "Flatten options" }).getByRole("combobox", { name: "Flatten level" })).toHaveValue(String(level));
  expect((await info(page)).history.length).toBe(steps);

  // [ and ] size the brush; Shift+wheel sets its strength (D196, as the game); each shows beside the
  // pointer while it changes (D184: no sliders), and the brush keeps it
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("dgm.brush") ?? "{}") as { size: number; strength: number });
  const s0 = (await saved()).size;
  await page.keyboard.press("]");
  await expect.poll(async () => (await saved()).size).toBeGreaterThan(s0);
  await expect(page.locator(".shape-note")).toHaveText(`size ${(await saved()).size}`);
  await page.keyboard.press("[");
  await expect.poll(async () => (await saved()).size).toBe(s0);
  const k0 = (await saved()).strength;
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await saved()).strength).toBe(Math.min(10, k0 + 1));
  await expect(page.locator(".shape-note")).toHaveText(`strength ${Math.min(10, k0 + 1)}`);

  // Esc puts the brush away
  await page.keyboard.press("Escape");
  await expect(bar.getByRole("button", { name: "Flatten brush (3)" })).toHaveAttribute("aria-pressed", "false");

  // the strokes are kept: a reload opens the map with them (the autosave)
  i = await info(page);
  const kept = await heights(page);
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  expect((await info(page)).edits).toBe(i.edits);
  expect(await heights(page)).toEqual(kept);
  expect(errors).toEqual([]);
});

test("with a brush out, a fast left-drag paints and never turns the camera", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  // the 3D view, turned and tilted
  await page.evaluate(() => window.dgm3d!.renderer.setView({ yaw: 0.7, pitch: 0.8 }));
  const view = () => page.evaluate(() => JSON.stringify(window.dgm3d!.renderer.getView()));
  const turned = await view();
  const count = async () => (await info(page)).history.length;

  // choosing a brush leaves the camera where it is; its key again keeps it out
  const raise = page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Raise brush (1)" });
  await raise.click();
  await page.keyboard.press("1");
  await expect(raise).toHaveAttribute("aria-pressed", "true");
  expect(await view()).toBe(turned);

  // a fast drag across the map: down, two moves, up, with no waits between
  const box = (await page.locator(".view3d canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let n = await count();
  await page.mouse.move(cx - 120, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy);
  await page.mouse.move(cx + 120, cy);
  await page.mouse.up();
  await settled(page);
  expect(await count()).toBe(n + 1);
  expect(await view()).toBe(turned);

  // the same drag made of events a script sends in one go (no pointer capture to take)
  n = await count();
  await page.evaluate(
    ([x, y]) => {
      const c = document.querySelector(".view3d canvas")!;
      const ev = (type: string, px: number, buttons: number) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", isPrimary: true, clientX: px, clientY: y, button: 0, buttons });
      c.dispatchEvent(ev("pointerdown", x - 120, 1));
      c.dispatchEvent(ev("pointermove", x, 1));
      c.dispatchEvent(ev("pointermove", x + 120, 1));
      c.dispatchEvent(ev("pointerup", x + 120, 0));
    },
    [cx, cy + 60],
  );
  await settled(page);
  expect(await count()).toBe(n + 1);

  // a drag that starts off the map (the sky above it) paints once it reaches the map, and never
  // turns the camera
  n = await count();
  await page.mouse.move(cx, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 8 });
  await page.mouse.up();
  await settled(page);
  expect(await view()).toBe(turned);
  expect(errors).toEqual([]);
});
