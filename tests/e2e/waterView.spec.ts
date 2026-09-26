// Water is never an object, and the ways to see it (PLAN §20 D196, D197): clicking water picks
// nothing; the hover readout gives its depth, bed and badwater; any tool, T or Clear water make it
// see-through; Alt+scroll and Alt+click cut the world into layers; Shift+scroll sets strength; a
// source is always findable (its marker with Source picked, and the sources feeding the water under
// the pointer); a selected source's Delete makes its water recede; clean or bad belongs to the
// source; the water flows on a stroke while it is painted, and its speed is the player's.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
const clear = (page: Page) => page.evaluate(() => window.dgm3d!.renderer.clearWater);
const depthAt = (page: Page, tiles: number[]) => page.evaluate((ts) => ts.map((t) => window.dgm3d!.renderer.mapState()!.surface.depth[t] || 0), tiles);

test("water is never an object; clear water, layers, strength, sources findable and removable, water on a stroke", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  const i = await info(page);
  const W = i.W;
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const path = (i.features.find((f) => f.kind === "river")!.params as { path: [number, number][] }).path;
  const mid = path[Math.floor(path.length * 0.6)];
  const m: [number, number] = [Math.round(mid[0]), Math.round(mid[1])];
  const mp = await client(page, ...m);

  // water is never an object: a click on it picks nothing
  await page.mouse.click(mp.x, mp.y);
  await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
  // the readout: its depth and its bed
  await page.mouse.move(mp.x + 3, mp.y);
  await page.mouse.move(mp.x, mp.y);
  await expect(page.locator(".readout")).toHaveText(/^Water [\d.]+ deep, bed level \d+/);
  // the sources it comes from show their marker while the pointer is over it
  await expect(page.locator(".source-marker.feeding")).toHaveCount(1);
  await expect(page.locator(".source-marker.feeding")).toHaveText(/water\/s/);

  // clear water: T, the view button, and any tool picked
  expect(await clear(page)).toBe(false);
  await page.keyboard.press("t");
  await expect.poll(() => clear(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Clear water" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear water" }).click();
  await expect.poll(() => clear(page)).toBe(false);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  await expect.poll(() => clear(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => clear(page)).toBe(false);

  // the game's layers (D196, D207): Alt+scroll cuts the world down, the first step to the highest
  // layer that hides anything; Alt+middle-click (the game's) or Alt+click picks a tile's layer,
  // and on a tile at the layer showing, shows it all; the widget says which, and steps and resets
  const top = await page.evaluate(() => Math.max(...window.dgm3d!.renderer.mapState()!.heights));
  const widget = page.getByRole("group", { name: "Visible layers" });
  await expect(widget.getByRole("status", { name: "Visible layer" }).or(widget.locator("output"))).toHaveText("∞");
  await page.mouse.move(mp.x, mp.y);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Alt");
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 2);
  await expect(widget.locator("output")).toHaveText(String(top - 2));
  const level = await page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), m);
  await page.keyboard.down("Alt");
  await page.mouse.click(mp.x, mp.y, { button: "middle" });
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(level);
  await page.mouse.click(mp.x, mp.y);
  await page.keyboard.up("Alt");
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(null);
  await expect(widget.locator("output")).toHaveText("∞");
  // the widget: a step down, one up, and back to the whole world; Esc never resets it
  await widget.getByRole("button", { name: "Lower the visible layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await widget.getByRole("button", { name: "Lower the visible layer" }).click();
  await widget.getByRole("button", { name: "Raise the visible layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(top - 1);
  await widget.getByRole("button", { name: "Show every layer" }).click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.slice)).toBe(null);

  // a source picked on the shelf: every source shows its marker with its strength
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  await expect.poll(async () => page.locator(".source-marker").count()).toBeGreaterThan(0);
  // a new source on dry, empty ground
  const spot = await page.evaluate(
    ([s0, s1]) => {
      const mm = window.dgm3d!.renderer.mapState()!;
      const e = mm.entities;
      for (let y = 10; y < mm.H - 10; y++)
        for (let x = 10; x < mm.W - 10; x++) {
          if (mm.surface.depth[y * mm.W + x] > 0 || Math.hypot(x - s0, y - s1) < 20) continue;
          let empty = true;
          for (let k = 0; k < e.count && empty; k++) if (Math.abs(e.x[k] - x) <= 3 && Math.abs(e.y[k] - y) <= 3) empty = false;
          if (empty) return [x, y] as [number, number];
        }
      return null;
    },
    [start[0], start[1]] as const,
  );
  expect(spot).not.toBeNull();
  const sp = await client(page, ...spot!);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Place water source");
  await page.keyboard.press("Escape");
  // clean or bad belongs to the source: selected, it becomes a badwater source in one step
  await page.mouse.click(sp.x, sp.y);
  const insp = page.getByRole("group", { name: /Water source, selected/ });
  await expect(insp).toBeVisible();
  await insp.getByRole("combobox", { name: "Water" }).selectOption("bad");
  await idle(page);
  await expect.poll(async () => (await info(page)).history.at(-1)!.label).toBe("Make a source badwater");
  // selected, Delete removes it and its water recedes
  await page.mouse.click(sp.x, sp.y);
  await expect(page.getByRole("group", { name: /Badwater source, selected/ })).toBeVisible();
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await info(page)).history.at(-1)!.label).toBe("Remove a badwater source");

  // the water's speed: normal by default, instant straight to the result
  const speed = page.getByRole("combobox", { name: "Water speed" });
  await expect(speed).toHaveValue("normal");
  await speed.selectOption("instant");
  await expect(speed).toHaveValue("instant");
  await speed.selectOption("normal");

  // the water flows on a stroke while it is painted (D197): a Lower stroke out of the river, and
  // water in its channel before the button comes up
  const x = start[0] < W / 2 ? Math.round(W * 0.78) : Math.round(W * 0.22);
  const on = path.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
  const from: [number, number] = [Math.round(on[0]), Math.round(on[1])];
  const dir = from[1] < W / 2 ? 1 : -1;
  const channel = Array.from({ length: 6 }, (_, k) => (from[1] + dir * (4 + k)) * W + from[0]);
  const before = await depthAt(page, channel);
  await page.getByRole("button", { name: "Lower brush (2)" }).click();
  const a = await client(page, ...from);
  const b = await client(page, from[0], from[1] + dir * 10);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await expect.poll(async () => (await depthAt(page, channel)).some((d, k) => d > before[k] + 0.02), { timeout: 10_000 }).toBe(true);
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  // Shift+scroll sets the brush's strength, and says it beside the pointer
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await expect(page.locator(".shape-note")).toHaveText(/^strength \d+$/);
  expect(errors).toEqual([]);
});
