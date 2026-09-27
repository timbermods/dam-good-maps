// The left shelf and Delete (PLAN §20 D184, D288), through the page. The shelf: a picked object's
// ghost follows the pointer, its footprint green where the game keeps it and red where the game
// would delete it, the reason beside the pointer; a click there is refused, and placed where it
// fits; R turns it; Esc puts it back; trees and bushes paint many with a drag; the start moves where
// it is clicked. Delete: pointed at an object it takes it; with a selection open it takes
// everything standing inside it, objects and sources, as one step; the ground never changes, and
// the start stays. There is no Remove tool. (ROADMAP M7's object checks, through the shelf.)

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

async function clickTile(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
}

/** Hover a tile with an object from the shelf and wait for its footprint check. */
async function fitAt(page: Page, x: number, y: number, W: number): Promise<{ tiles: number[]; problem: string | null }> {
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  const i = y * W + x;
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), i, { timeout: 10_000 });
  return (await page.evaluate(() => window.dgmEditor!.fit()))!;
}

/** Level, dry tiles with nothing standing round them, away from the start and the water, nearest
 *  the middle first. */
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

const trees = (page: Page, near: [number, number], r: number) =>
  page.evaluate(
    ([x, y, rr]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      let n = 0;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "Pine" && Math.abs(e.x[k] - x) <= rr && Math.abs(e.y[k] - y) <= rr) n++;
      return n;
    },
    [near[0], near[1], r] as const,
  );

test("the shelf: a ghost red where the game would delete it and refused there, placed where it fits; R turns it; trees paint with a drag; the start moves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, "s=4242&z=96&d=n&t=riverValley");
  const W = (await info(page)).W;
  const shelf = page.getByRole("navigation", { name: "Place" });
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;

  // every object has its picture, drawn by the view
  await expect(shelf.getByRole("button", { name: "Relic", exact: true }).locator("img")).toHaveCount(1, { timeout: 15_000 });

  // a medium relic: on the start, red with the reason, and a click there places nothing
  await shelf.getByRole("button", { name: "Relic", exact: true }).click();
  await page.getByRole("group", { name: "Relic options" }).getByRole("combobox", { name: "Size" }).selectOption("medium");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const red = await fitAt(page, start[0], start[1], W);
  expect(red.problem).toMatch(/district center/);
  expect(red.tiles.length).toBe(6);
  // (the reason, in a quiet word beside the pointer)
  await expect(page.locator(".shape-note")).toHaveText("the start stands there");
  await clickTile(page, start[0], start[1]);
  expect(await labels(page)).toEqual([]);
  await expect(page.locator(".shape-note")).toContainText("Can't go here");

  // on level, dry ground: green, and a click places it at once, one step
  const spots = await openGround(page, 3);
  const [x, y] = spots[0];
  const green = await fitAt(page, x, y, W);
  expect(green.problem).toBeNull();
  // R turns it: a turned relic stands across the other way
  await page.keyboard.press("r");
  const turned = await fitAt(page, x, y, W);
  expect(turned.problem).toBeNull();
  await clickTile(page, x, y);
  expect(await labels(page)).toEqual(["Place medium relic"]);
  const placed = await page.evaluate(async ([a, b]) => (await window.dgmEditor!.worker.entitiesAt(a, b)).find((e) => e.template === "MediumRelic") ?? null, [x, y] as [number, number]);
  expect(placed).not.toBeNull();
  expect(placed!.orientation).toBe("Cw90");
  expect(await page.evaluate(() => window.dgmEditor!.instant())).toEqual([]);
  // Esc puts it back
  await page.keyboard.press("Escape");
  await expect(shelf.getByRole("button", { name: "Relic", exact: true })).toHaveAttribute("aria-pressed", "false");

  // pines: a drag paints a grove, one step
  const [gx, gy] = spots.find(([a, b]) => Math.hypot(a - x, b - y) > 12)!;
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  const a = await client(page, gx - 3, gy);
  const b = await client(page, gx + 3, gy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  const planted = await trees(page, [gx, gy], 5);
  expect(planted).toBeGreaterThanOrEqual(8);
  expect((await labels(page)).at(-1)).toMatch(/^Plant \d+ pines$/);
  // a click plants one
  const [ox, oy] = spots.find(([p, q]) => Math.hypot(p - x, q - y) > 12 && Math.hypot(p - gx, q - gy) > 12)!;
  await clickTile(page, ox, oy);
  expect((await labels(page)).at(-1)).toBe("Place pine");
  await page.keyboard.press("Escape");

  // the start: picked on the shelf, it moves where it is clicked, and goes back on the shelf
  await shelf.getByRole("button", { name: "Start", exact: true }).click();
  // (open ground nearest the start, clear of what was placed)
  const near = spots.filter(([p, q]) => Math.hypot(p - x, q - y) > 8 && Math.hypot(p - gx, q - gy) > 10 && Math.hypot(p - ox, q - oy) > 6).sort((p, q) => Math.hypot(p[0] - start[0], p[1] - start[1]) - Math.hypot(q[0] - start[0], q[1] - start[1]));
  expect(near.length).toBeGreaterThan(0);
  const [sx, sy] = near[0];
  const fit = await fitAt(page, sx, sy, W);
  expect(fit.problem).toBeNull();
  await clickTile(page, sx, sy);
  await expect.poll(async () => ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position).toEqual([sx, sy]);
  await expect(shelf.getByRole("button", { name: "Start", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("Delete (D288): pointed at an object it takes it; Select and Delete take everything inside, objects and sources, one step; the ground stays, and so does the start; no Remove tool", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await refine(page, "s=4242&z=96&d=n&t=riverValley");
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  const [gx, gy] = (await openGround(page, 4))[0];
  const bar = page.getByRole("toolbar", { name: "Tools" });
  // no Remove tool, and X picks nothing
  await expect(bar.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await page.keyboard.press("x");
  await expect(page.getByRole("group", { name: "Remove options" })).toHaveCount(0);
  // a grove, and a water source beside it
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Pine", exact: true }).click();
  const a = await client(page, gx - 3, gy);
  const b = await client(page, gx + 3, gy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  const sp = await client(page, gx + 4, gy + 4);
  await page.mouse.move(sp.x + 3, sp.y);
  await page.mouse.click(sp.x, sp.y);
  await idle(page);
  await page.keyboard.press("Escape");
  const sourceThere = () =>
    page.evaluate(
      ([x, y]) => {
        const e = window.dgm3d!.renderer.mapState()!.entities;
        for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource" && e.x[k] === x && e.y[k] === y) return true;
        return false;
      },
      [gx + 4, gy + 4] as const,
    );
  await expect.poll(sourceThere).toBe(true);
  const n0 = await trees(page, [gx, gy], 5);
  expect(n0).toBeGreaterThan(3);
  const heights = () => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
  const h0 = await heights();

  // pointed at a pine, Delete takes it, one step
  const one = await page.evaluate(
    ([x, y]) => {
      const e = window.dgm3d!.renderer.mapState()!.entities;
      for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "Pine" && Math.abs(e.x[k] - x) <= 3 && Math.abs(e.y[k] - y) <= 1) return [e.x[k], e.y[k]] as [number, number];
      return null;
    },
    [gx - 1, gy] as const,
  );
  const op = await client(page, one![0], one![1]);
  await page.mouse.move(op.x + 3, op.y);
  await page.mouse.move(op.x, op.y);
  const steps = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).at(-1)).toBe("Remove a tree");
  expect((await labels(page)).length).toBe(steps + 1);
  expect(await trees(page, [gx, gy], 5)).toBe(n0 - 1);

  // Select, a rectangle round the grove and the source, then Delete: all of it, one step
  await bar.getByRole("button", { name: "Select (M)" }).click();
  const c = await client(page, gx - 5, gy - 5);
  const d = await client(page, gx + 5, gy + 5);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 6 });
  await page.mouse.up();
  const row = page.getByRole("group", { name: "Selection" });
  await expect(row.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Clear objects" })).toHaveCount(0);
  const before = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(before + 1);
  expect((await labels(page)).at(-1)).toMatch(/^Remove \d+ objects$/);
  expect(await trees(page, [gx, gy], 5)).toBe(0);
  await expect.poll(sourceThere).toBe(false);
  // one undo brings them all back
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(sourceThere).toBe(true);
  expect(await trees(page, [gx, gy], 5)).toBe(n0 - 1);
  // the row's Delete does the same
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await idle(page);
  await expect.poll(sourceThere).toBe(false);
  // the ground never changes
  expect(await heights()).toEqual(h0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // the start stays, pointed at or in a selection, and says so
  const at = await client(page, start[0], start[1]);
  await page.mouse.move(at.x + 3, at.y);
  await page.mouse.move(at.x, at.y);
  const kept = (await labels(page)).length;
  await page.keyboard.press("Delete");
  await expect(page.locator(".shape-note")).toContainText("The start stays");
  expect((await labels(page)).length).toBe(kept);
  // (the whole map: Select, then Ctrl+A)
  await page.keyboard.press("m");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await idle(page);
  await expect.poll(async () => (await labels(page)).length).toBe(kept + 1);
  expect((await info(page)).features.some((f) => f.kind === "start")).toBe(true);
  const left = await page.evaluate(() => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const out: string[] = [];
    for (let k = 0; k < e.count; k++) out.push(e.templates[e.template[k]]);
    return out;
  });
  expect(left).toContain("StartingLocation");
  expect(left.filter((t) => t === "Pine" || t === "WaterSource")).toEqual([]);
  expect(errors).toEqual([]);
});
