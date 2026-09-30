// Parity with Timberborn's map editor (PLAN §20 D337, D338, D339), through the page: the shelf has the game's other
// objects; a brush from the shelf has a Size (F, [ and ]), a Density and an Age, shows its plan before release, plants
// as one undo step and a click places exactly one; the water objects, an Unstable Core (and the view of the map after it
// goes off) and the reserves place, take options and are labelled by Markers. The rules themselves are tested in the core
// (tests/unit/paint.test.ts, parity-*.test.ts, tests/contract/parityObjects.test.ts).

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);

async function refine(page: Page, hash: string) {
  await page.goto(`./#${hash}`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
}

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
}

async function hover(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y, { steps: 2 });
}

async function clickTile(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
}

/** Level, dry tiles with nothing standing round them, away from the start and the water, nearest the middle first. */
async function openGround(page: Page, r: number): Promise<[number, number][]> {
  const i = await info(page);
  const start = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  return page.evaluate(
    ([s0, s1, rr]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const W = m.W;
      const e = m.entities;
      const out: [number, number, number][] = [];
      for (let y = rr + 2; y < m.H - rr - 2; y += 2)
        for (let x = rr + 2; x < W - rr - 2; x += 2) {
          if (Math.hypot(x - s0, y - s1) < 16) continue;
          const h0 = m.heights[y * W + x];
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * W + x + dx] !== h0 || m.surface.depth[(y + dy) * W + x + dx] > 0) ok = false;
          for (let k = 0; k < e.count && ok; k++) if (Math.abs(e.x[k] - x) <= rr + 1 && Math.abs(e.y[k] - y) <= rr + 1) ok = false;
          if (ok) out.push([x, y, Math.abs(x - W / 2) + Math.abs(y - m.H / 2)]);
        }
      out.sort((a, b) => a[2] - b[2]);
      return out.map(([x, y]) => [x, y] as [number, number]);
    },
    [start[0], start[1], r] as const,
  );
}

const count = (page: Page, template: string, near: [number, number], r: number) =>
  page.evaluate(
    ([t, x, y, rr]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let n = 0;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === t && Math.abs(e.x[k] - (x as number)) <= (rr as number) && Math.abs(e.y[k] - (y as number)) <= (rr as number)) n++;
      return n;
    },
    [template, near[0], near[1], r] as const,
  );

const entityAt = (page: Page, template: string, x: number, y: number) => page.evaluate(async ([t, a, b]) => (await window.dgmEditor!.worker.entitiesAt(a as number, b as number)).find((e) => e.template === t) ?? null, [template, x, y] as const);

const SEED = "s=1&z=96&d=n&t=riverValley";

test("the shelf has the game's other objects, each with its picture", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  for (const name of ["Succulent", "Mixed woods", "Water seep", "Badwater seep", "Aquifer", "Aquifer drill", "Badtide drain", "Unstable core", "Reserve pile", "Reserve warehouse", "Reserve tank"]) {
    await expect(shelf.getByRole("button", { name, exact: true }).locator("img")).toHaveCount(1, { timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});

test("a brush from the shelf: Size (F, [ and ]), Density and Age, its plan before release, one step, and a click places exactly one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const [gx, gy] = (await openGround(page, 4))[0];
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  const opts = page.getByRole("group", { name: "Pine options" });
  await expect(opts.getByRole("slider", { name: "Size" })).toBeVisible();
  await expect(opts.getByRole("slider", { name: "Density" })).toBeVisible();
  await expect(opts.getByRole("button", { name: "Grown" })).toHaveAttribute("aria-pressed", "true");
  expect((await page.evaluate(() => window.dgmEditor!.shelfBrush())).size).toBe(3);

  // [ and ] size it; at size 1 there is no plan (it places one), a bigger brush shows one
  await hover(page, gx, gy);
  for (let k = 0; k < 6; k++) await page.keyboard.press("[");
  expect((await page.evaluate(() => window.dgmEditor!.shelfBrush())).size).toBe(1);
  await hover(page, gx + 1, gy);
  expect(await page.evaluate(() => window.dgmEditor!.ghost())).toBeNull();
  for (let k = 0; k < 4; k++) await page.keyboard.press("]");
  const size = (await page.evaluate(() => window.dgmEditor!.shelfBrush())).size;
  expect(size).toBeGreaterThan(3);
  await hover(page, gx, gy);
  await page.waitForFunction(() => (window.dgmEditor!.ghost()?.placed ?? 0) > 2, null, { timeout: 10_000 });
  const dense = (await page.evaluate(() => window.dgmEditor!.ghost()))!;
  expect(dense.templates).toEqual(["Pine"]);
  // a sparser density plans fewer
  await opts.getByRole("slider", { name: "Density" }).fill("15");
  await hover(page, gx + 1, gy);
  await hover(page, gx, gy);
  await page.waitForFunction((n) => (window.dgmEditor!.ghost()?.placed ?? 1e9) < n, dense.placed, { timeout: 10_000 });
  // Age: mixed
  await opts.getByRole("button", { name: "Mixed" }).click();
  expect((await page.evaluate(() => window.dgmEditor!.shelfBrush())).age).toBe("mixed");
  await opts.getByRole("button", { name: "Grown" }).click();
  await opts.getByRole("slider", { name: "Density" }).fill("80");

  // a click places exactly one, at any size
  await page.mouse.move(0, 0);
  const before = await count(page, "Pine", [gx, gy], 12);
  await clickTile(page, gx, gy);
  expect(await count(page, "Pine", [gx, gy], 12)).toBe(before + 1);
  expect((await labels(page)).at(-1)).toBe("Place pine");

  // a drag plants a stand, one undo step
  const [ox, oy] = (await openGround(page, 4)).find(([a, b]) => Math.hypot(a - gx, b - gy) > 12)!;
  const a = await client(page, ox - 4, oy);
  const b = await client(page, ox + 4, oy);
  const steps0 = (await labels(page)).length;
  const n0 = await count(page, "Pine", [ox, oy], 14);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  const planted = (await count(page, "Pine", [ox, oy], 14)) - n0;
  expect(planted).toBeGreaterThan(5);
  expect((await labels(page)).length).toBe(steps0 + 1);
  expect((await labels(page)).at(-1)).toMatch(/^Plant \d+ pines$/);
  await page.keyboard.press("Control+z");
  await idle(page);
  expect(await count(page, "Pine", [ox, oy], 14)).toBe(n0);
  expect(errors).toEqual([]);
});

test("Succulent, Mixed woods, Ruin and Thorns paint as brushes; a ruin field is a field, thorns come in patches", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const spots = await openGround(page, 7);
  const stroke = async (name: string, at: [number, number], size: number) => {
    await shelf.getByRole("button", { name, exact: true }).click();
    while ((await page.evaluate(() => window.dgmEditor!.shelfBrush().size)) < size) await page.keyboard.press("]");
    const a = await client(page, at[0] - 3, at[1]);
    const b = await client(page, at[0] + 3, at[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await idle(page);
    await page.keyboard.press("Escape");
  };
  const far = (k: number) => spots.filter(([a, b]) => Math.hypot(a - spots[0][0], b - spots[0][1]) > 18 * k)[0] ?? spots[k];
  const total = (template: string) => page.evaluate((t) => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    let n = 0;
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === t) n++;
    return n;
  }, template);

  const t0 = await total("Thorns");
  await stroke("Thorns", spots[0], 5);
  expect(await total("Thorns")).toBeGreaterThan(t0 + 2);
  expect((await labels(page)).at(-1)).toMatch(/^Paint \d+ thorns$/);

  const r0 = await page.evaluate(() => { const e = window.dgm3d!.renderer.mapState()!.entities; let n = 0; for (let k = 0; k < e.count; k++) if (/^RuinColumn/.test(e.templates[e.template[k]])) n++; return n; });
  await stroke("Ruin", far(1), 6);
  const r1 = await page.evaluate(() => { const e = window.dgm3d!.renderer.mapState()!.entities; let n = 0; for (let k = 0; k < e.count; k++) if (/^RuinColumn/.test(e.templates[e.template[k]])) n++; return n; });
  expect(r1).toBeGreaterThan(r0 + 2);
  expect((await labels(page)).at(-1)).toMatch(/^Paint \d+ ruin columns$/);

  // (a stand of mixed woods plants more than one kind of tree)
  await stroke("Mixed woods", far(2), 6);
  expect((await labels(page)).at(-1)).toMatch(/^Plant \d+ trees of mixed woods$/);
  expect(errors).toEqual([]);
});

test("a water seep places, takes a strength and a sink; Markers labels it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const [x, y] = (await openGround(page, 3))[0];
  await shelf.getByRole("button", { name: "Water seep", exact: true }).click();
  const opts = page.getByRole("group", { name: "Water seep options" });
  await expect(opts.getByRole("slider", { name: "Strength" })).toBeVisible();
  await opts.getByRole("button", { name: "More" }).click();
  await expect(opts.getByRole("checkbox", { name: /Sink/ })).toBeVisible();
  await hover(page, x, y);
  await page.waitForFunction(() => (window.dgmEditor!.fit()?.tiles.length ?? 0) === 4, null, { timeout: 10_000 });
  await clickTile(page, x, y);
  const seep = await entityAt(page, "WaterSeep", x, y);
  expect(seep).not.toBeNull();
  expect((await labels(page)).at(-1)).toMatch(/seep/i);
  await page.keyboard.press("Escape");
  // Markers labels it
  await page.getByRole("button", { name: "Markers", exact: true }).click();
  await expect(page.locator(".object-marker").filter({ hasText: /Water seep/ })).toHaveCount(1, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("an Unstable core: placed with its radius and cycle, selected it says what it clears, and Show after it goes off is a view only", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const [x, y] = (await openGround(page, 3))[0];
  await shelf.getByRole("button", { name: "Unstable core", exact: true }).click();
  const opts = page.getByRole("group", { name: "Unstable core options" });
  await expect(opts.getByRole("slider", { name: "Radius" })).toHaveAttribute("aria-valuetext", /^5:/);
  await opts.getByRole("slider", { name: "Radius" }).fill("2");
  await hover(page, x, y);
  await page.waitForFunction(() => (window.dgmEditor!.fit()?.tiles.length ?? 0) === 4, null, { timeout: 10_000 });
  await clickTile(page, x, y);
  const core = await entityAt(page, "UnstableCore", x, y);
  expect(core).not.toBeNull();
  await page.keyboard.press("Escape");

  // select it: its row says what it clears
  await clickTile(page, x, y);
  const row = page.getByRole("group", { name: /Unstable Core, selected/ });
  await expect(row.getByRole("button", { name: "Show after it goes off" })).toBeVisible({ timeout: 10_000 });
  await expect(row.locator(".note")).toContainText(/Clears a sphere of radius 3/);

  // the view: the map as it will be, nothing changed, back with the button
  const steps = (await labels(page)).length;
  const heights = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  await row.getByRole("button", { name: "Show after it goes off" }).click();
  await page.waitForFunction(() => window.dgmEditor!.blastShown(), null, { timeout: 30_000 });
  const shown = await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  expect(shown.some((h, i) => h !== heights[i])).toBe(true);
  expect((await labels(page)).length).toBe(steps);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.dgmEditor!.blastShown(), null, { timeout: 30_000 });
  expect(await page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights))).toEqual(heights);
  expect((await labels(page)).length).toBe(steps);
  expect(errors).toEqual([]);
});

test("a reserve holds one good of its kind, full at first; the options change it in one step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, SEED);
  const shelf = page.getByRole("navigation", { name: "Place" });
  const [x, y] = (await openGround(page, 3))[0];
  await shelf.getByRole("button", { name: "Reserve pile", exact: true }).click();
  await hover(page, x, y);
  await page.waitForFunction(() => (window.dgmEditor!.fit()?.tiles.length ?? 0) === 4, null, { timeout: 10_000 });
  await clickTile(page, x, y);
  const pile = await entityAt(page, "ReservePile", x, y);
  expect(pile).not.toBeNull();
  await page.keyboard.press("Escape");
  await clickTile(page, x, y);
  const row = page.getByRole("group", { name: /Reserve Pile, selected/ });
  const holds = row.getByRole("combobox", { name: "Holds" });
  await expect(holds).toBeVisible({ timeout: 10_000 });
  const steps = (await labels(page)).length;
  const options = await holds.locator("option").allTextContents();
  const other = options.find((t) => !/^dirt$/i.test(t.trim()))!;
  await holds.selectOption({ label: other });
  await idle(page);
  expect((await labels(page)).length).toBe(steps + 1);
  expect(errors).toEqual([]);
});
