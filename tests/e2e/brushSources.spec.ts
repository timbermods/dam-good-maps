// Brushes and water sources (PLAN §20 D249, D322), through the page. Sources is a choice in each
// brush's row, Ride by default; with Ride, a raise over a source leaves it standing on its raised
// tile (no pit, no pillar); with Keep, the source and its ground stay exactly where they are while
// the land round it rises (item 31); with Clear, the ring carries a small mark, the sources under it
// glow red, and the stroke takes them in the same undo step (undo brings them back). With any tool picked, the
// pointer within about two tiles of a source targets it and Delete removes it (one step). (D288 took
// the Remove tool and its drag from a source: Select and Delete clear an area, shelf.spec.)

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
/** The sources on the map, and the ground each stands on. */
const sources = (page: Page) =>
  page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const e = m.entities;
    const out: { x: number; y: number; z: number; ground: number }[] = [];
    for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "WaterSource") out.push({ x: e.x[k], y: e.y[k], z: e.z[k], ground: m.heights[e.y[k] * m.W + e.x[k]] });
    return out;
  });
/** How many sources glow red for Clear (what the page asks the view to light). */
const glowing = (page: Page) => page.evaluate(() => window.dgmEditor!.sourceGlow().length);

/** A stroke held over a tile, in small moves round it. */
async function hold(page: Page, x: number, y: number) {
  const p = await client(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 0; k < 14; k++) {
    await page.mouse.move(p.x + (k % 2 ? 2 : -2), p.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await idle(page);
}

test("brushes and sources (D249, D322): they ride the ground; Keep holds them; Clear takes them with the stroke; Delete removes the one targeted", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // (taller than the default: the tools, the forces and the options are rows over the map, D323 item 9, and a
  // brush's options take two lines; the map is framed whole and centred, D345 B1, so the view is centred on the
  // two spots below, clear of the rows)
  await page.setViewportSize({ width: 1280, height: 960 });
  await openEditor(page, "s=4242&z=96&d=n&t=highlands");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("combobox", { name: "Water speed" }).selectOption("instant");

  // two dry, low spots far from the start, where the map (not a bar) takes the pointer, with room
  const spot = await page.evaluate(() => {
    const i = window.dgmEditor!.info();
    const st = (i.features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const m = window.dgm3d!.renderer.mapState()!;
    const clear = (x: number, y: number) => {
      for (let yy = y - 6; yy <= y + 6; yy++) for (let xx = x - 6; xx <= x + 6; xx++) if (m.surface.depth[yy * m.W + xx] > 0 || m.heights[yy * m.W + xx] > 12) return false;
      return true;
    };
    for (let y = 16; y < m.H - 16; y += 2)
      for (let x = 16; x < m.W - 30; x += 2) if (Math.hypot(x - st[0], y - st[1]) > 26 && clear(x, y) && clear(x + 14, y)) return [x, y] as [number, number];
    return null;
  });
  expect(spot).not.toBeNull();
  const [ax, ay] = spot!;
  const bx = ax + 14;
  // the view centred between the two spots, so no bar is over them
  await page.evaluate(([x, y]) => {
    const r = window.dgm3d!.renderer;
    r.setView({ target: [x + 0.5, r.getView().target[1], -(y + 0.5)] });
  }, [ax + 7, ay] as [number, number]);
  await page.waitForTimeout(300);
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: /^Water source/ }).click();
  for (const x of [ax, bx]) {
    const p = await client(page, x, ay);
    await page.mouse.move(p.x + 3, p.y);
    await page.mouse.click(p.x, p.y);
    await idle(page);
  }
  await page.keyboard.press("Escape");
  expect((await sources(page)).filter((s) => s.y === ay && (s.x === ax || s.x === bx))).toHaveLength(2);

  // Raise: Sources in its row, Ride by default (a soft raise: Free, so a hold keeps raising)
  await page.keyboard.press("1");
  const row = page.getByRole("group", { name: "Raise options" });
  const sourcesChoice = row.getByRole("group", { name: "Sources" });
  await expect(sourcesChoice.getByRole("button", { name: "Ride" })).toHaveAttribute("aria-pressed", "true");
  await row.getByRole("combobox", { name: "Target level" }).selectOption("free");

  // off: a stroke over A leaves it standing on its raised tile
  const a0 = (await sources(page)).find((s) => s.x === ax && s.y === ay)!;
  await hold(page, ax, ay);
  await expect.poll(async () => (await sources(page)).find((s) => s.x === ax && s.y === ay)?.ground ?? 0).toBeGreaterThan(a0.ground);
  const a1 = (await sources(page)).find((s) => s.x === ax && s.y === ay)!;
  expect(a1.z).toBe(a1.ground);
  expect(await page.evaluate(() => window.dgm3d!.renderer.brushCursorState?.mark ?? false)).toBe(false);

  // Keep (item 31): a raise round A leaves it and its ground exactly where they are
  await sourcesChoice.getByRole("button", { name: "Keep" }).click();
  await hold(page, ax, ay);
  const a2 = (await sources(page)).find((s) => s.x === ax && s.y === ay)!;
  expect(a2.ground).toBe(a1.ground);
  expect(a2.z).toBe(a1.z);
  expect(await page.evaluate(([x, y]) => window.dgm3d!.renderer.heightAt(x + 1, y), [ax, ay] as [number, number])).toBeGreaterThan(a1.ground);
  expect((await page.evaluate(() => window.dgmEditor!.lastStroke()))!.sources).toBe("keep");

  // Clear: the ring's mark; the source under the ring glows red; the stroke takes it, one step
  await sourcesChoice.getByRole("button", { name: "Clear" }).click();
  const pb = await client(page, bx, ay);
  await page.mouse.move(pb.x + 3, pb.y);
  await page.mouse.move(pb.x, pb.y);
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.brushCursorState?.mark ?? false)).toBe(true);
  await expect.poll(() => glowing(page)).toBeGreaterThan(0);
  const n0 = (await labels(page)).length;
  await hold(page, bx, ay);
  await expect.poll(async () => (await sources(page)).some((s) => s.x === bx && s.y === ay)).toBe(false);
  expect(await labels(page)).toHaveLength(n0 + 1);
  expect((await labels(page)).at(-1)).toMatch(/^Raise, \d+ tiles, a source cleared$/);
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(async () => (await sources(page)).some((s) => s.x === bx && s.y === ay)).toBe(true);
  await sourcesChoice.getByRole("button", { name: "Ride" }).click();

  // any tool: two tiles from a source, Delete removes it (one step)
  // (a tile two from it with nothing standing on it: a tree there would be the tree)
  const bare = await page.evaluate(([x, y]) => {
    const e = window.dgm3d!.renderer.mapState()!.entities;
    const taken = new Set<string>();
    for (let k = 0; k < e.count; k++) taken.add(`${e.x[k]},${e.y[k]}`);
    for (const [dx, dy] of [[2, 0], [2, 1], [0, 2], [-2, 0], [1, 2], [-2, 1], [0, -2], [2, -1]]) if (!taken.has(`${x + dx},${y + dy}`)) return [x + dx, y + dy] as [number, number];
    return null;
  }, [bx, ay] as [number, number]);
  expect(bare).not.toBeNull();
  const near = await client(page, bare![0], bare![1]);
  await page.mouse.move(near.x + 3, near.y);
  await page.mouse.move(near.x, near.y);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await sources(page)).some((s) => s.x === bx && s.y === ay)).toBe(false);
  expect((await labels(page)).at(-1)).toBe("Remove a water source");
  await page.keyboard.press("Control+z");
  await idle(page);
  await expect.poll(async () => (await sources(page)).some((s) => s.x === bx && s.y === ay)).toBe(true);

  expect(errors).toEqual([]);
});
