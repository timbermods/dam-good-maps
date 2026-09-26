// The top bar and the brush kit (PLAN §20 D183, D184, D193, D204, D205, D212): Raise … Naturalize |
// the forces | Remove, and a row with only the picked tool's options (the sources are on the
// shelf); square, precise with a hold that digs a level more at a steady pace down to its stop
// level, straight lines with their length, level lines, Flatten in steps and with ramped edges,
// "the start fits here" after a Flatten stroke,
// Smooth make walkable; hold F to size the brush; the sounds' switch; the Select tool (M, or
// Ctrl+drag) with its size and its actions.

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as const);
const heightAt = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgm3d!.renderer.heightAt(a, b), [x, y] as const);
const lastStroke = (page: Page) => page.evaluate(() => window.dgmEditor!.lastStroke());
const settle = (page: Page) => page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });

/** Flat, dry, empty ground away from the start: a tile with `r` tiles of it all round. */
async function flatDry(page: Page, start: [number, number], r: number, not: [number, number][] = []) {
  return page.evaluate(
    ([s0, s1, rr, avoid]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const w = m.W;
      for (let y = rr + 2; y < m.H - rr - 2; y++)
        for (let x = rr + 2; x < w - rr - 2; x++) {
          if (Math.hypot(x - s0, y - s1) < 16 || avoid.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 2 * rr + 4)) continue;
          const h0 = m.heights[y * w + x];
          if (h0 < 4) continue;
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * w + x + dx] !== h0 || m.surface.depth[(y + dy) * w + x + dx] > 0) ok = false;
          for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= rr + 2 && Math.abs(m.entities.y[k] - y) <= rr + 2) ok = false;
          if (ok) return [x, y] as [number, number];
        }
      return null;
    },
    [start[0], start[1], r, not] as const,
  );
}

test("the top bar and the brush kit: options, precise hold with a stop, straight lines, terraces, walkable, Select", async ({ page }) => {
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
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // the top bar: the five brushes, the forces and Remove, and a row with only the picked tool's
  // options; the sources are on the shelf, right after the start (D212)
  const bar = page.getByRole("toolbar", { name: "Tools" });
  for (const name of ["Raise brush (1)", "Lower brush (2)", "Flatten brush (3)", "Smooth brush (4)", "Naturalize brush (5)", "Remove (X)"]) await expect(bar.getByRole("button", { name })).toBeVisible();
  await expect(bar.getByRole("button", { name: /Source/ })).toHaveCount(0);
  const shelfWords = await page.getByRole("navigation", { name: "Place" }).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(shelfWords.slice(0, 8)).toEqual(["Start", "Water source (6)", "Badwater source", "Pine", "Birch", "Oak", "Berry bush", "Ruin"]);
  await expect(page.getByRole("group", { name: /options/ })).toHaveCount(0);
  // the forces: Carve is ready, in their group (D194, D199); the others keep their slots hidden
  // until they are (D202, D203, D206)
  await expect(bar.getByRole("button", { name: "Carve (7)" })).toBeVisible();
  for (const name of ["Craterize", "Quake", "Erupt"]) await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  // F and R do nothing with no brush or object out: the old camera zoom on R and F is gone (D212;
  // F sizes the brush, R turns the shelf's object)
  const distance = () => page.evaluate(() => window.dgm3d!.renderer.getView().distance);
  const d0 = await distance();
  await page.keyboard.press("f");
  await page.keyboard.press("r");
  await page.waitForTimeout(150);
  expect(await distance()).toBe(d0);
  // the sounds: on and quiet by default, an off switch, the volume beside it (D212)
  const soundButton = page.getByRole("button", { name: "Sound", exact: true });
  await expect(soundButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Sound volume" })).toHaveCount(1);
  await soundButton.click();
  await expect(soundButton).toHaveAttribute("aria-pressed", "false");
  await soundButton.click();
  // the shelf's Water source (6): its strength in the row; a brush puts it back
  await page.keyboard.press("6");
  await expect(page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" })).toHaveAttribute("aria-pressed", "true");
  const sourceRow = page.getByRole("group", { name: "Water source options" });
  await expect(sourceRow.getByRole("slider")).toBeVisible();
  await page.keyboard.press("2");
  await expect(sourceRow).toHaveCount(0);
  const lowerRow = page.getByRole("group", { name: "Lower options" });
  for (const t of ["Square", "Precise", "Straight lines", "Level lines"]) await expect(lowerRow.getByLabel(t)).not.toBeChecked();
  await expect(lowerRow.getByLabel("In steps")).toHaveCount(0);
  await expect(lowerRow.getByLabel("Make walkable")).toHaveCount(0);

  // level lines
  await lowerRow.getByLabel("Level lines").check();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.levelLines)).toBe(true);
  await lowerRow.getByLabel("Level lines").uncheck();

  // precise, square, and a hold that stops at its level (D193)
  const pit = (await flatDry(page, start, 3))!;
  expect(pit).not.toBeNull();
  const h0 = await heightAt(page, ...pit);
  await lowerRow.getByLabel("Square").check();
  await lowerRow.getByLabel("Precise").check();
  await lowerRow.getByLabel("Stop at").check();
  await lowerRow.getByRole("combobox", { name: "Stop level" }).selectOption(String(h0 - 2));
  const pp = await client(page, ...pit);
  await page.mouse.move(pp.x, pp.y);
  // a small brush: 3 × 3 tiles ([ steps the size down: 5, 4, 3, 2)
  // (the keys go to the map, not to the list just used)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let k = 0; k < 3; k++) await page.keyboard.press("[");
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(2500);
  await page.mouse.up();
  await settle(page);
  await idle(page);
  expect(await heightAt(page, ...pit)).toBe(h0 - 2);
  let st = (await lastStroke(page))!;
  expect(st.precise).toBe(true);
  expect(st.shape).toBe("square");
  expect(st.stop).toBe(h0 - 2);
  expect(Math.max(...st.levels!)).toBeGreaterThanOrEqual(3);
  expect((await info(page)).history.at(-1)!.label).toMatch(/^Lower, \d+ tiles$/);
  // vertical walls: the pit's edge at the stop, the ground right beside it untouched
  expect(await heightAt(page, pit[0] + 1, pit[1] + 1)).toBe(h0 - 2);
  expect(await heightAt(page, pit[0] + 2, pit[1])).toBe(h0);
  for (let k = 0; k < 3; k++) await page.keyboard.press("]");
  await lowerRow.getByLabel("Precise").uncheck();
  await lowerRow.getByLabel("Square").uncheck();

  // straight lines: the stroke is one straight line, its length beside the pointer (D183)
  await lowerRow.getByLabel("Straight lines").check();
  const a = (await flatDry(page, start, 2, [pit]))!;
  const pa = await client(page, a[0], a[1]);
  const pb = await client(page, a[0] + 8, a[1]);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pa.x + 30, pa.y + 25, { steps: 4 });
  await page.mouse.move(pb.x, pb.y, { steps: 4 });
  await expect(page.locator(".shape-note")).toHaveText(/^\d+ tiles?$/);
  await page.mouse.up();
  await settle(page);
  st = (await lastStroke(page))!;
  const ys = new Set<number>();
  for (let k = 1; k < st.dabs.length; k += 2) ys.add(Math.floor(st.dabs[k] / 4));
  expect(ys.size).toBeLessThanOrEqual(2);
  await lowerRow.getByLabel("Straight lines").uncheck();

  // Flatten in steps, Smooth make walkable: in the stroke's operation
  await page.keyboard.press("3");
  const flatRow = page.getByRole("group", { name: "Flatten options" });
  await flatRow.getByLabel("In steps").check();
  // benches every 3 levels from a level just below this ground: the click takes it down to one
  const hb = await heightAt(page, a[0], a[1] + 6);
  await flatRow.getByRole("combobox", { name: "Steps apart" }).selectOption("3");
  await flatRow.getByRole("combobox", { name: "Flatten level" }).selectOption(String(hb - 1));
  const b = await client(page, a[0], a[1] + 6);
  await page.mouse.click(b.x, b.y);
  await settle(page);
  expect((await lastStroke(page))!.steps).toBe(3);
  expect(await heightAt(page, a[0], a[1] + 6)).toBe(hb - 1);
  // ramped edges, from the ground where the stroke starts a level up: a plateau the start fits on
  await flatRow.getByLabel("In steps").uncheck();
  await flatRow.getByRole("combobox", { name: "Edges" }).selectOption("ramped");
  const f = (await flatDry(page, start, 4, [pit, a]))!;
  expect(f).not.toBeNull();
  const hf = await heightAt(page, ...f);
  await flatRow.getByRole("combobox", { name: "Flatten level" }).selectOption(String(hf + 1));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const pf = await client(page, ...f);
  await page.mouse.move(pf.x, pf.y);
  for (let k = 0; k < 2; k++) await page.keyboard.press("]");
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await settle(page);
  st = (await lastStroke(page))!;
  expect(st.edges).toBe("ramped");
  expect(st.level).toBe(hf + 1);
  expect(await heightAt(page, ...f)).toBe(hf + 1);
  // the start fits there: a quiet hint, found in the background; a click moves the start there
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.startHint()), { timeout: 15_000 }).not.toBeNull();
  const hint = (await page.evaluate(() => window.dgmEditor!.startHint()))!;
  console.log(`start hint: found in ${hint.ms} ms (${hint.strong ? "the requirements hold" : "it fits"})`);
  expect(Math.hypot(hint.x - f[0], hint.y - f[1])).toBeLessThanOrEqual(5);
  await page.locator(".start-hint").click();
  await idle(page);
  await expect.poll(async () => ((await info(page)).features.find((g) => g.kind === "start")!.params as { position: [number, number] }).position).toEqual([hint.x, hint.y]);
  for (let k = 0; k < 2; k++) await page.keyboard.press("[");
  await flatRow.getByRole("combobox", { name: "Edges" }).selectOption("cliff");
  await flatRow.getByRole("combobox", { name: "Flatten level" }).selectOption("start");

  // hold F and move the mouse: the ring's size follows, a click sets it (D205)
  const s0 = await client(page, ...f);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(s0.x, s0.y);
  const steps0 = (await info(page)).history.length;
  await page.keyboard.down("f");
  const s1 = await client(page, f[0] + 7, f[1]);
  await page.mouse.move(s1.x, s1.y, { steps: 5 });
  await expect(page.locator(".shape-note")).toHaveText(/^size (6\.5|7|7\.5)$/);
  const sized = Number((await page.locator(".shape-note").textContent())!.split(" ")[1]);
  await page.mouse.click(s1.x, s1.y);
  await page.keyboard.up("f");
  // (the click set the size: it painted nothing)
  await idle(page);
  expect((await info(page)).history.length).toBe(steps0);

  // objects ride the ground (D204): a Flatten whose rim crosses a mine site leaves its footprint
  // level, never on a step, so the game keeps it
  const mine = (await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "UndergroundRuins") return [e.x[k], e.y[k], e.z[k]] as [number, number, number];
    return null;
  }))!;
  expect(mine).not.toBeNull();
  await flatRow.getByRole("combobox", { name: "Flatten level" }).selectOption(String(Math.max(0, mine[2] - 2)));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // (a stroke that runs up to the mine site's west edge and holds there: its rim crosses the site
  // however fast the machine paints)
  const pm = await client(page, Math.max(2, mine[0] - 7), mine[1] + 2);
  const pe = await client(page, Math.max(2, mine[0] - 2), mine[1] + 2);
  await page.mouse.move(pm.x, pm.y);
  await page.mouse.down();
  await page.mouse.move(pe.x, pe.y, { steps: 8 });
  await page.waitForTimeout(2000);
  await page.mouse.up();
  await settle(page);
  await idle(page);
  st = (await lastStroke(page))!;
  expect(st.keep?.length ?? 0).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.dgmEditor!.instant())).filter((c) => /floating|buried/i.test(c.message))).toEqual([]);
  await flatRow.getByRole("combobox", { name: "Flatten level" }).selectOption("start");

  await page.keyboard.press("4");
  await page.getByRole("group", { name: "Smooth options" }).getByLabel("Make walkable").check();
  // over the precise pit's 2-level walls: worn to steps a beaver can climb
  await page.mouse.click(pp.x, pp.y);
  await settle(page);
  expect((await lastStroke(page))!.walkable).toBe(true);
  expect((await lastStroke(page))!.size).toBe(sized);

  // the Select tool: M, a rectangle with its size, raise it by 2, one step
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  const sel = page.getByRole("group", { name: "Selection" });
  await expect(sel).toBeVisible();
  const c0 = (await flatDry(page, start, 3, [pit, a, f]))!;
  const q0 = await client(page, c0[0] - 3, c0[1] - 2);
  const q1 = await client(page, c0[0] + 2, c0[1] + 2);
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.down();
  await page.mouse.move(q1.x, q1.y, { steps: 5 });
  await expect(page.locator(".shape-note")).toHaveText("6 × 5 tiles");
  await page.mouse.up();
  await expect(sel.getByRole("status")).toHaveText("6 × 5 tiles");
  const before = await heightAt(page, ...c0);
  await sel.getByRole("combobox", { name: "Levels" }).selectOption("2");
  await sel.getByRole("button", { name: "Raise" }).click();
  await idle(page);
  expect((await info(page)).history.at(-1)!.label).toBe("Raise 30 tiles by 2");
  await expect.poll(() => heightAt(page, ...c0)).toBe(before + 2);
  // Shift adds, and Esc closes it
  await page.keyboard.down("Shift");
  const q2 = await client(page, c0[0] + 3, c0[1]);
  await page.mouse.click(q2.x, q2.y);
  await page.keyboard.up("Shift");
  await expect(sel.getByRole("status")).toHaveText("7 × 5 tiles (31)");
  await page.keyboard.press("Escape");
  await expect(sel).toHaveCount(0);

  // Ctrl+drag with a brush out selects too
  await page.keyboard.press("1");
  await page.keyboard.down("Control");
  await page.mouse.move(q0.x, q0.y);
  await page.mouse.down();
  await page.mouse.move(q1.x, q1.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(page.getByRole("group", { name: "Selection" }).getByRole("status")).toHaveText("6 × 5 tiles");
  expect(errors).toEqual([]);
});
