// The forces sitting, batch B (PLAN §20 D345, D347): the map framed centred (B1), the level control top
// right with Watch and Sound under it (B3), a source's strength by Ctrl+scroll at once and never a
// duplicate (B4), X putting down what is held and the plain pointer picking and moving objects (B7),
// Select's Ctrl+click and Shift+scroll level and its buttons (B8), Max water depth's tooltip (B9),
// and every thing's hover readout (B11).

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function open(page: Page, hash = "s=9&z=96&d=n&t=riverValley") {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.waitForTimeout(600);
}

/** Flat, dry, empty ground `r` tiles round, away from the start and from `not`. */
async function flatDry(page: Page, r: number, not: [number, number][] = []) {
  return page.evaluate(
    ([rr, avoid]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const st = (window.dgmEditor!.info().features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
      for (let y = 12; y < m.H - 12; y++)
        for (let x = 12; x < m.W - 12; x++) {
          if (Math.hypot(x - st[0], y - st[1]) < 16 || avoid.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 10)) continue;
          const h0 = m.heights[y * m.W + x];
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== h0 || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
          for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= rr + 2 && Math.abs(m.entities.y[k] - y) <= rr + 2) ok = false;
          if (ok) return [x, y] as [number, number];
        }
      return null;
    },
    [r, not] as const,
  );
}

const sourcesOn = (page: Page) =>
  page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: string[] = [];
    for (let k = 0; k < e.count; k++) if (/Source$/.test(e.templates[e.template[k]])) out.push(`${e.x[k]},${e.y[k]}`);
    return out;
  });

test("B1 and B3: the map is centred in every view; the level control sits top right with Watch and Sound under it", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const centred = async () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas")!.getBoundingClientRect();
      const m = window.dgm3d!.renderer.mapState()!;
      const pts = [[0, 0], [m.W - 1, 0], [0, m.H - 1], [m.W - 1, m.H - 1]].map(([x, y]) => window.dgmEditor!.tileToClient(x, y));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { dx: (Math.min(...xs) + Math.max(...xs)) / 2 - (c.left + c.width / 2), dy: (Math.min(...ys) + Math.max(...ys)) / 2 - (c.top + c.height / 2), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cw: c.width, ch: c.height };
    });
  for (const step of ["the default view", "top-down", "reset"]) {
    if (step === "top-down") await page.getByRole("button", { name: "Top-down" }).click();
    if (step === "reset") {
      await page.mouse.move(700, 500);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(500, 300, { steps: 4 });
      await page.mouse.up({ button: "right" });
      await page.getByRole("button", { name: "Reset view" }).click();
    }
    await page.waitForTimeout(400);
    const c = await centred();
    expect(Math.abs(c.dx), `${step}: horizontally centred`).toBeLessThan(c.cw * 0.03);
    expect(Math.abs(c.dy), `${step}: vertically centred`).toBeLessThan(c.ch * 0.03);
    expect(c.w, `${step}: the whole map is in view`).toBeLessThan(c.cw);
    expect(c.h, `${step}: the whole map is in view`).toBeLessThan(c.ch);
  }
  // the level control: top right, beside the compass, larger; Watch and Sound under it
  const box = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;
  const layer = await box(page.getByRole("group", { name: "Visible layers" }));
  const compass = await box(page.locator(".compass"));
  const canvas = await box(page.locator("canvas"));
  expect(layer.y).toBeLessThan(canvas.y + 70);
  expect(layer.x + layer.width).toBeLessThanOrEqual(compass.x + 2);
  expect(canvas.x + canvas.width - (layer.x + layer.width)).toBeLessThan(120);
  expect(layer.height).toBeGreaterThanOrEqual(40);
  const watch = await box(page.getByRole("button", { name: "Watch", exact: true }));
  const sound = await box(page.getByRole("button", { name: "Sound", exact: true }));
  expect(watch.y).toBeGreaterThanOrEqual(layer.y + layer.height - 1);
  expect(sound.y).toBeGreaterThanOrEqual(layer.y + layer.height - 1);
  expect(watch.x + watch.width).toBeGreaterThan(layer.x);
  // and the level control still works there
  await page.getByRole("button", { name: "Lower the visible layer" }).click();
  await expect(page.getByRole("group", { name: "Visible layers" }).locator("output")).not.toHaveText("∞");
});

test("B4: Ctrl+scroll near a source's marker changes its strength at once; a click on it never places a second", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const spot = await flatDry(page, 3);
  expect(spot).not.toBeNull();
  const [sx, sy] = spot!;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Water source (6)" }).click();
  const p = await client(page, sx, sy);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  expect(await sourcesOn(page)).toContain(`${sx},${sy}`);
  const before = await sourcesOn(page);
  // the shelf's source is still picked; the pointer is a few pixels off the tile, on its marker
  await page.mouse.move(p.x + 6, p.y + 6);
  await page.keyboard.down("Control");
  for (let k = 0; k < 2; k++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(150);
  }
  await page.keyboard.up("Control");
  await expect.poll(async () => (await labels(page)).at(-1), { timeout: 20_000 }).toMatch(/^Water source: [\d.]+ water\/s$/);
  await idle(page);
  // a click there selects it, and places nothing
  await page.mouse.click(p.x + 6, p.y + 6);
  await idle(page);
  expect(await sourcesOn(page)).toEqual(before);
  expect((await labels(page)).filter((l) => l === "Place water source")).toHaveLength(1);
});

test("B7: X puts down what is held; the plain pointer picks an object and drags it", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: "Top-down" }).click();
  // a brush, a force and the shelf's object all go back with X
  await page.getByRole("button", { name: "Raise brush (1)" }).click();
  await expect(page.getByRole("group", { name: "Raise options" })).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByRole("group", { name: "Raise options" })).toHaveCount(0);
  await page.getByRole("button", { name: "Carve (7)" }).click();
  await page.keyboard.press("x");
  await expect(page.getByRole("button", { name: "Carve (7)" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Mine site" }).click();
  await page.keyboard.press("x");
  await expect(page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Mine site" })).toHaveAttribute("aria-pressed", "false");
  // and Select, with its selection
  await page.getByRole("button", { name: "Select (M)" }).click();
  await page.keyboard.press("x");
  await expect(page.getByRole("group", { name: "How to select" })).toHaveCount(0);

  // a mine site placed, then picked with a click and dragged with the plain pointer
  const spot = await flatDry(page, 4);
  expect(spot).not.toBeNull();
  const [mx, my] = spot!;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Mine site" }).click();
  const at = await client(page, mx, my);
  await page.mouse.move(at.x + 3, at.y);
  await page.mouse.click(at.x, at.y);
  await idle(page);
  await page.keyboard.press("x");
  // (the mine site placed here: the generated map has one of its own elsewhere)
  const site = (near: [number, number]) =>
    page.evaluate(([px, py]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let best: number[] | null = null;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "UndergroundRuins" && (!best || Math.hypot(e.x[k] - px, e.y[k] - py) < Math.hypot(best[0] - px, best[1] - py))) best = [e.x[k], e.y[k]];
      return best;
    }, near);
  const from = (await site([mx, my]))!;
  expect(Math.hypot(from[0] - mx, from[1] - my)).toBeLessThan(3);
  const c0 = await client(page, mx, my);
  await page.mouse.move(c0.x + 2, c0.y);
  await page.mouse.click(c0.x, c0.y);
  await expect(page.getByRole("group", { name: "Mine site, selected" })).toBeVisible();
  // drag it three tiles over
  const c1 = await client(page, mx + 3, my);
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  await expect.poll(() => site([mx + 3, my])).toEqual([from[0] + 3, from[1]]);
  expect((await labels(page)).at(-1)).toBe("Move mine site");
  // one undo puts it back
  await page.keyboard.press("z");
  await idle(page);
  await expect.poll(() => site([mx, my])).toEqual(from);
});

test("B8 and B9: Select takes a level with Ctrl+click and dials it with Shift+scroll; Whole map is an icon; Up 1 and Down 1; the depth tooltip", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("button", { name: "Select (M)" }).click();
  const row = page.getByRole("group", { name: "Selection" });
  // Whole map is among the marking icons
  const modes = row.getByRole("group", { name: "How to select" });
  await expect(modes.getByRole("button", { name: "Whole map" })).toBeVisible();
  await modes.getByRole("button", { name: "Whole map" }).click();
  await expect(row.getByRole("button", { name: "Up 1" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Down 1" })).toBeVisible();
  // Ctrl+click on the land takes its level
  const target = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    for (let y = 20; y < m.H - 20; y++) for (let x = 20; x < m.W - 20; x++) if (m.surface.depth[y * m.W + x] <= 0 && m.heights[y * m.W + x] > 3) return { x, y, h: m.heights[y * m.W + x] };
    return null;
  });
  expect(target).not.toBeNull();
  const p = await client(page, target!.x, target!.y);
  await page.mouse.move(p.x + 2, p.y);
  await page.keyboard.down("Control");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Control");
  await expect(row.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue(String(target!.h));
  // Shift+scroll dials it
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Shift");
  await expect(row.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue(String(target!.h + 1));
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Shift");
  await expect(row.getByRole("spinbutton", { name: "Level", exact: true })).toHaveValue(String(target!.h - 1));
  // the depth control's tooltip, when the selection holds deep water
  const depth = row.getByRole("button", { name: "Max water depth" });
  if (await depth.count()) await expect(depth).toHaveAttribute("title", "Raises the ground under deeper water so the water there is at most that deep");
});

test("B11: hovering a thing names it and the ground under it, with any tool held", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: "Top-down" }).click();
  const spot = await flatDry(page, 4);
  const [gx, gy] = spot!;
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Geothermal field" }).click();
  const at = await client(page, gx, gy);
  await page.mouse.move(at.x + 3, at.y);
  await page.mouse.click(at.x, at.y);
  await idle(page);
  await page.keyboard.press("x");
  const readout = page.locator(".readout");
  const c = await client(page, gx, gy);
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x, c.y);
  await expect(readout).toHaveText(/^Geothermal field · Height \d+, (dry|moist) soil$/);
  // a source says its strength, with a brush held
  await page.getByRole("button", { name: "Flatten brush (3)" }).click();
  const src = await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource") return [e.x[k], e.y[k]];
    return null;
  });
  if (src) {
    const s = await client(page, src[0], src[1]);
    await page.mouse.move(s.x + 2, s.y);
    await page.mouse.move(s.x, s.y);
    await expect(readout).toContainText(/Water source, [\d.]+ water\/s/);
  }
  // with a brush held, the geothermal field's readout is the same as with none
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x, c.y);
  await expect(readout).toHaveText(/^Geothermal field · /);
});
