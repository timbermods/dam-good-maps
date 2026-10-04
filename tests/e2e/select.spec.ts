// The Select tool and the working area (PLAN §20 D254, D259, D261, D264), through the page. Select is
// in hand whenever nothing else is (it has its own button on the bar); its shapes are Rectangle, Circle, Freehand, Brush and Wand. A
// circle set to a level changes exactly its tiles, in one undo step; Ctrl+click takes a tile's level
// as the target. While a selection is open it is the working area: a brush stroke changes nothing
// outside it (and eases to its edge), with the Select row a chip beside the brush. The Wand takes a
// river's visible water and no bank tile; a Raise across it and its banks changes no bank tile, and
// Flatten sets its bed in one step. Ctrl+A selects the map; Cut down leaves no ground above the
// level and Fill up raises only the ground below it; Max water depth raises the ground under deeper
// water.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { centreOn, openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const heights = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const selection = (page: Page) => page.evaluate(() => window.dgmEditor!.selection());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function openTopDown(page: Page) {
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("instant");
}

/** Dry land with room round it where the map (not a bar) takes the pointer. */
async function dryAt(page: Page, room = 8): Promise<[number, number]> {
  return page.evaluate((r) => {
    const m = window.dgm3d!.renderer.mapState()!;
    const st = (window.dgmEditor!.info().features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    // (clear of the controls, with room above the bar's settings for a selection's actions row, which opens there)
    const dock = document.querySelector(".tool-dock")!.getBoundingClientRect().top - 80;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return p.y < dock && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = r + 4; y < m.H - r - 4; y += 2)
      for (let x = r + 4; x < m.W - r - 4; x += 2) {
        if (Math.hypot(x - st[0], y - st[1]) < 24) continue;
        let ok = true;
        for (let yy = y - r; yy <= y + r && ok; yy += 2) for (let xx = x - r; xx <= x + r && ok; xx += 2) if (m.surface.depth[yy * m.W + xx] > 0 || !onMap(xx, yy)) ok = false;
        if (ok) return [x, y] as [number, number];
      }
    throw new Error("no dry land");
  }, room);
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 6) {
  const a = await client(page, from[0], from[1]);
  const b = await client(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** Open the Select row's Delete menu and take the choice named (its counts beside it); `optional`: the
 *  choice may not be there (nothing of that kind stands in the selection). */
async function deleteFrom(page: Page, row: Locator, name: RegExp, optional = false) {
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Delete" });
  // (the core counts what stands in the selection, objects under water too: a moment)
  await expect(menu.getByText("Counting…")).toHaveCount(0);
  const item = menu.getByRole("menuitem", { name });
  if (optional && (await item.count()) === 0) {
    await page.keyboard.press("Escape");
    return;
  }
  await item.click();
}

test("Select: its button and shapes; a circle set to a level changes exactly its tiles, one step; Ctrl+click takes a level; the working area keeps a stroke inside, with the row a chip", async ({ page }) => {
  await openTopDown(page);
  const bar = page.getByRole("toolbar", { name: "Tools" });
  await expect(bar.getByRole("button", { name: "Select (M)" })).toHaveAttribute("aria-pressed", "true");
  const row = page.getByRole("group", { name: "Selection" });
  await expect(row).toBeVisible();
  // the marking modes are icons, each named, Whole map among them (D323 items 6 and 43, D345 B8)
  const modes = await row.getByRole("group", { name: "How to select" }).getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(modes).toEqual(["Rectangle", "Circle", "Freehand", "Brush", "Wand", "Whole map"]);
  await expect(row.getByRole("button", { name: "Whole map" })).toBeVisible();

  // a circle, dragged from its middle out: its radius beside the pointer
  await row.getByRole("button", { name: "Circle" }).click();
  const c = await dryAt(page);
  const a = await client(page, c[0], c[1]);
  const b = await client(page, c[0] + 4, c[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect(page.locator(".shape-note")).toHaveText("radius 4");
  await page.mouse.up();
  const W = (await info(page)).W;
  const circle: number[] = [];
  for (let y = c[1] - 4; y <= c[1] + 4; y++) for (let x = c[0] - 4; x <= c[0] + 4; x++) if ((x - c[0]) ** 2 + (y - c[1]) ** 2 <= 16) circle.push(y * W + x);
  expect((await selection(page)).sort((p, q) => p - q)).toEqual(circle.sort((p, q) => p - q));

  // Ctrl+click on the land: its level is the target
  const h0 = await heights(page);
  const t = [c[0] + 2, c[1] + 1];
  const tp = await client(page, t[0], t[1]);
  await page.keyboard.down("Control");
  await page.mouse.click(tp.x, tp.y);
  await page.keyboard.up("Control");
  await expect(row.getByRole("slider", { name: "Level", exact: true })).toHaveValue(String(h0[t[1] * W + t[0]]));
  // the level reaches the editor's one ceiling, 22 on every map (D244, D259)
  await expect(row.getByRole("slider", { name: "Level", exact: true })).toHaveAttribute("max", "22");
  // Flatten (one level above it): exactly the circle's tiles, one undo step
  const L = Math.min(22, h0[t[1] * W + t[0]] + 1);
  await row.getByRole("slider", { name: "Level", exact: true }).fill(String(L));
  const n0 = (await labels(page)).length;
  await row.getByRole("button", { name: "Flatten" }).click();
  await idle(page);
  expect(await labels(page)).toHaveLength(n0 + 1);
  expect((await labels(page)).at(-1)).toBe(`Flatten ${circle.length} tiles to level ${L}`);
  const h1 = await heights(page);
  const inCircle = new Set(circle);
  for (let i = 0; i < h1.length; i++) expect(h1[i], `tile ${i}`).toBe(inCircle.has(i) ? L : h0[i]);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(h0);

  // the working area: Raise picked, the row a chip; a stroke across the circle's edge changes only
  // the land inside it, a level a tile at most from its edge
  await page.keyboard.press("1");
  await expect(row).toHaveCount(0);
  await expect(page.locator(".select-chip")).toHaveText("Working inside 9 × 9");
  await expect(page.locator(".select-chip")).toHaveAttribute("data-keys", /Esc clears it/);
  const e0 = await client(page, c[0] - 7, c[1]);
  const e1 = await client(page, c[0] - 1, c[1]);
  await page.mouse.move(e0.x, e0.y);
  await page.mouse.down();
  for (let k = 0; k < 30; k++) {
    await page.mouse.move(e0.x + ((e1.x - e0.x) * (k % 10)) / 10, e0.y);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await idle(page);
  const h2 = await heights(page);
  let changed = 0;
  for (let i = 0; i < h2.length; i++) {
    if (!inCircle.has(i)) expect(h2[i], `tile ${i} outside`).toBe(h0[i]);
    else if (h2[i] !== h0[i]) changed++;
  }
  expect(changed).toBeGreaterThan(0);
  // the circle's edge tiles changed a level at most
  for (const i of circle) {
    const x = i % W;
    const y = Math.floor(i / W);
    const edge = [i - 1, i + 1, i - W, i + W].some((j) => !inCircle.has(j));
    if (edge) expect(Math.abs(h2[i] - h0[i]), `edge tile (${x}, ${y})`).toBeLessThanOrEqual(1);
  }
  // Esc clears it, and the tools are free at once (the brush stays out)
  await page.keyboard.press("Escape");
  await expect(page.locator(".select-chip")).toHaveCount(0);
  expect(await selection(page)).toEqual([]);
});

test("the Wand (D261): a river's visible water and no bank tile; land at its level; a Raise across it changes no bank; Flatten sets its bed", async ({ page }) => {
  await openTopDown(page);
  const row = page.getByRole("group", { name: "Selection" });
  await row.getByRole("button", { name: "Wand" }).click();
  // a river tile where the map takes the pointer (with room above the bar for a selection's actions row)
  const r = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const dock = document.querySelector(".tool-dock")!.getBoundingClientRect().top - 80;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return p.y < dock && document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 10; y < m.H - 10; y++) for (let x = 10; x < m.W - 10; x++) if (m.surface.depth[y * m.W + x] > 0.3 && onMap(x, y)) return [x, y] as [number, number];
    return null;
  });
  expect(r).not.toBeNull();
  const rp = await client(page, r![0], r![1]);
  await page.mouse.click(rp.x, rp.y);
  const sel = await selection(page);
  // exactly the water the view draws joined to it
  const expected = await page.evaluate(([x0, y0]) => {
    const m = window.dgm3d!.renderer.mapState()!;
    const s = m.surface.surface;
    const wet = (i: number) => s[i] === s[i];
    const seen = new Set([y0 * m.W + x0]);
    const q = [y0 * m.W + x0];
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % m.W;
      for (const j of [x > 0 ? i - 1 : -1, x < m.W - 1 ? i + 1 : -1, i - m.W, i + m.W]) if (j >= 0 && j < m.W * m.H && !seen.has(j) && wet(j)) (seen.add(j), q.push(j));
    }
    return q.sort((a, b) => a - b);
  }, r!);
  expect(sel.sort((a, b) => a - b)).toEqual(expected);
  const bankFree = await page.evaluate((tiles) => {
    const m = window.dgm3d!.renderer.mapState()!;
    return tiles.every((i) => m.surface.surface[i] === m.surface.surface[i]);
  }, sel);
  expect(bankFree).toBe(true);
  // on land: the ground at its level joined to it
  const land = await dryAt(page, 3);
  const lp = await client(page, land[0], land[1]);
  await page.mouse.click(lp.x, lp.y);
  const hl = await heights(page);
  const W = (await info(page)).W;
  const onLand = await selection(page);
  expect(onLand).toContain(land[1] * W + land[0]);
  expect(onLand.every((i) => hl[i] === hl[land[1] * W + land[0]])).toBe(true);
  await page.mouse.click(rp.x, rp.y);

  // a Raise across it and its banks: no bank tile changes
  const h0 = await heights(page);
  const inSel = new Set(sel);
  await page.keyboard.press("1");
  const a = await client(page, r![0] - 4, r![1] - 4);
  const b = await client(page, r![0] + 4, r![1] + 4);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 0; k <= 16; k++) {
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 16, a.y + ((b.y - a.y) * k) / 16);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await idle(page);
  const h1 = await heights(page);
  for (let i = 0; i < h1.length; i++) if (!inSel.has(i)) expect(h1[i], `bank tile ${i}`).toBe(h0[i]);
  await page.keyboard.press("Control+z");
  await idle(page);

  // Flatten on the water's selection: its bed at that level, one step
  await page.getByRole("button", { name: "Select (M)" }).click();
  const L = Math.min(...sel.map((i) => h0[i])) + 1;
  await row.getByRole("slider", { name: "Level", exact: true }).fill(String(L));
  const n0 = (await labels(page)).length;
  await row.getByRole("button", { name: "Flatten" }).click();
  await idle(page);
  expect(await labels(page)).toHaveLength(n0 + 1);
  const h2 = await heights(page);
  for (const i of sel) expect(h2[i]).toBe(L);
});

test("Ctrl+A, Cut down and Fill up (D264): no ground left above the level, nothing at or below it changed; Fill up raises only the ground below", async ({ page }) => {
  await openTopDown(page);
  const row = page.getByRole("group", { name: "Selection" });
  await page.keyboard.press("Control+a");
  await expect(row.getByRole("status")).toHaveText("96 × 96 tiles");
  const h0 = await heights(page);
  const L = 8;
  await row.getByRole("slider", { name: "Level", exact: true }).fill(String(L));
  await row.getByRole("button", { name: "Cut down" }).click();
  await idle(page);
  expect((await labels(page)).at(-1)).toMatch(new RegExp(`^Cut [\\d,]+ tiles down to level ${L}$`));
  const cut = await heights(page);
  let above = 0;
  for (let i = 0; i < cut.length; i++) {
    if (cut[i] > L) above++;
    if (h0[i] <= L) expect(cut[i], `tile ${i} at or below the level`).toBe(h0[i]);
  }
  expect(above).toBe(0);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(() => heights(page)).toEqual(h0);
  await row.getByRole("button", { name: "Fill up" }).click();
  await idle(page);
  expect((await labels(page)).at(-1)).toMatch(new RegExp(`^Fill [\\d,]+ tiles up to level ${L}$`));
  const fill = await heights(page);
  for (let i = 0; i < fill.length; i++) if (h0[i] >= L) expect(fill[i], `tile ${i} at or above the level`).toBe(h0[i]);
  for (let i = 0; i < fill.length; i++) if (h0[i] < L) expect(fill[i], `tile ${i} below the level`).toBeGreaterThanOrEqual(L);
});

test("Delete sources (D315): removes only the water or badwater source in the selection, one undo step; its water drains after", async ({ page }) => {
  await openTopDown(page);
  const sourceCount = () =>
    page.evaluate(() => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let n = 0;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource" || e.templates[e.template[k]] === "BadwaterSource") n++;
      return n;
    });
  await expect(page.getByRole("toolbar", { name: "Water time" }).getByRole("status")).toHaveText("Water settled", { timeout: 30_000 });
  const n0 = await sourceCount();
  expect(n0).toBeGreaterThan(1); // more than one, so the map keeps water elsewhere once one is gone
  // one source, away from the others, so removing it doesn't dry the whole map
  const one = await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const sources: { x: number; y: number }[] = [];
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource" || e.templates[e.template[k]] === "BadwaterSource") sources.push({ x: e.x[k], y: e.y[k] });
    let best = sources[0];
    let bestMin = -1;
    for (const s of sources) {
      const closest = Math.min(...sources.filter((o) => o !== s).map((o) => Math.hypot(o.x - s.x, o.y - s.y)));
      if (closest > bestMin) (bestMin = closest, best = s);
    }
    return best;
  });
  const waterNear = (x: number, y: number, r = 4) =>
    page.evaluate(
      ([cx, cy, rr]) => {
        const m = window.dgm3d!.renderer.mapState()!;
        let d = 0;
        for (let yy = cy - rr; yy <= cy + rr; yy++) for (let xx = cx - rr; xx <= cx + rr; xx++) d = Math.max(d, m.surface.depth[yy * m.W + xx] || 0);
        return d;
      },
      [x, y, r] as [number, number, number],
    );
  expect(await waterNear(one.x, one.y)).toBeGreaterThan(0.01);

  // select a small box around it and Delete sources: only that source goes
  const row = page.getByRole("group", { name: "Selection" });
  await centreOn(page, one.x, one.y);
  const a = await client(page, one.x - 3, one.y - 3);
  const b = await client(page, one.x + 3, one.y + 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  const n1 = (await page.evaluate(() => window.dgmEditor!.info())).history.filter((h) => h.applied).length;
  await deleteFrom(page, row, /^(Water|Badwater) sources \(1\)$/);
  await idle(page);
  const info1 = await page.evaluate(() => window.dgmEditor!.info());
  expect(info1.history.filter((h) => h.applied)).toHaveLength(n1 + 1);
  expect(info1.history.filter((h) => h.applied).at(-1)!.label).toBe("Remove a source");
  expect(await sourceCount()).toBe(n0 - 1);
  // its own water drains, since its cause is gone (D260)
  await expect.poll(() => waterNear(one.x, one.y), { timeout: 10_000, intervals: [100] }).toBeLessThan(0.005);

  // undo restores it and its water, in the one step
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await sourceCount()).toBe(n0);
  await expect.poll(() => waterNear(one.x, one.y), { timeout: 10_000 }).toBeGreaterThan(0.01);
});

test("Delete sources (D315, folded into the Delete menu by D323), the whole map (Ctrl+A): clears every source; undo restores them all", async ({ page }) => {
  await openTopDown(page);
  const sourceCount = () =>
    page.evaluate(() => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let n = 0;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource" || e.templates[e.template[k]] === "BadwaterSource") n++;
      return n;
    });
  await expect(page.getByRole("toolbar", { name: "Water time" }).getByRole("status")).toHaveText("Water settled", { timeout: 30_000 });
  const n0 = await sourceCount();
  expect(n0).toBeGreaterThan(0);

  const row = page.getByRole("group", { name: "Selection" });
  await page.keyboard.press("Control+a");
  await deleteFrom(page, row, /^Water sources/);
  await idle(page);
  await deleteFrom(page, row, /^Badwater sources/, true);
  await idle(page);
  expect(await sourceCount()).toBe(0);

  await page.keyboard.press("Control+z");
  await idle(page);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await sourceCount()).toBe(n0);
});
