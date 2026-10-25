// The words beside the pointer (a refusal, "Place here", Select's count) stay in the free view: between the panels, the
// Items shelf and the bars, never cut off under one of them. Where the first spot would run under one, the note flips to
// the pointer's other side. Seen with the Block tool's refusal and a shelf object's "Place here", beside the shelf and
// above the bar.

import { expect, test, type Page } from "@playwright/test";
import { toolInHand } from "./helpers";
import { openEditor, openLegend } from "./open";

type Rect = { left: number; top: number; right: number; bottom: number };

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());

/** Turn the view so tile (x, y) at layer `level` shows at the screen point (sx, sy): the target is moved by what the
 *  projection says, a few times over. */
async function bringTo(page: Page, x: number, y: number, level: number, sx: number, sy: number) {
  for (let k = 0; k < 6; k++) {
    const moved = await page.evaluate(
      ([x, y, level, sx, sy]) => {
        const r = window.dgm3d!.renderer;
        const box = r.canvas.getBoundingClientRect();
        const at = () => {
          const p = r.project(x + 0.5, level, -(y + 0.5));
          return [p.x + box.left, p.y + box.top];
        };
        const [px, py] = at();
        const want = [sx - px, sy - py];
        if (Math.hypot(want[0], want[1]) < 2) return true;
        const v = r.getView();
        const [tx, ty, tz] = v.target;
        // (how the point moves for a step of the target along x and along z)
        r.setView({ target: [tx + 1, ty, tz] });
        const [ax, ay] = at();
        r.setView({ target: [tx, ty, tz + 1] });
        const [bx, by] = at();
        const j = [[ax - px, bx - px], [ay - py, by - py]];
        const det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
        const dx = (want[0] * j[1][1] - want[1] * j[0][1]) / det;
        const dz = (j[0][0] * want[1] - j[1][0] * want[0]) / det;
        r.setView({ target: [tx + dx, ty, tz + dz] });
        return false;
      },
      [x, y, level, sx, sy] as const,
    );
    if (moved) return;
  }
}

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);

/** A dry tile near the middle of the map, with nothing standing on it or next to it (and room for a 3 × 3 area and 12 tiles east). */
const dryTile = (page: Page) =>
  page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const { W, H, heights, surface, entities } = m;
    const busy = new Set<number>();
    for (let k = 0; k < entities.count; k++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) busy.add((entities.y[k] + dy) * W + entities.x[k] + dx);
    let best: { x: number; y: number; h: number } | null = null;
    let nearest = Infinity;
    for (let y = 4; y < H - 4; y++)
      for (let x = 4; x < W - 16; x++) {
        const k = y * W + x;
        let dry = true;
        for (let j = 0; j < 3 && dry; j++) for (let i = 0; i < 14 && dry; i++) dry = surface.depth[k + j * W + i] <= 0.01 && !busy.has(k + j * W + i);
        const d = Math.hypot(x - W / 2, y - H / 2);
        if (dry && d < nearest) [best, nearest] = [{ x, y, h: heights[k] }, d];
      }
    if (!best) throw new Error("no dry stretch");
    return best;
  });

/** The top of what stands over the map along its foot: the bar, its settings row and the first steps' hints, whichever show. */
const dockTop = (page: Page) =>
  page.evaluate(() => Math.min(...[".tool-bar", ".tool-settings", ".dock-notes > *"].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? Infinity)));

/** The first steps' hints put away: they come up a moment after the map and stand over its foot. */
async function putHintsAway(page: Page) {
  await page.getByRole("button", { name: "No more hints" }).click({ timeout: 30_000 });
  await expect(page.locator(".dock-notes > *")).toHaveCount(0);
}

const meets = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** The note is inside the map's view and clear of every control over it. */
async function expectFree(page: Page, note: string) {
  const n = await rect(page, note);
  const view = await rect(page, ".editor-view .view3d");
  expect(n.left, "inside the view, left").toBeGreaterThanOrEqual(view.left);
  expect(n.top, "inside the view, top").toBeGreaterThanOrEqual(view.top);
  expect(n.right, "inside the view, right").toBeLessThanOrEqual(view.right);
  expect(n.bottom, "inside the view, bottom").toBeLessThanOrEqual(view.bottom);
  for (const s of [".objects-dock", ".map-bar", ".view3d-controls", ".view3d-corner", ".minimap", ".dock-notes > *", ".legend-stack > *"]) {
    const els = await page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })), s);
    for (const b of els) expect(meets(n, b), `the note runs under ${s}`).toBe(false);
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
});

test("the Block tool's refusal beside the Items shelf and above the bar stays in the free view", async ({ page }) => {
  // (1920: the width at which the corner between the Block settings and the shelf left the note half under the settings row)
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await putHintsAway(page);
  const spot = await dryTile(page);
  // a 3 × 3 working area, then the Block tool: a click outside it is refused ("outside the selection")
  const corner = (tx: number, ty: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [tx, ty] as const);
  const a = await corner(spot.x, spot.y);
  const b = await corner(spot.x + 2, spot.y + 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.selection().length)).toBe(9);
  await page.keyboard.press("7");
  await toolInHand(page);

  const shelf = await rect(page, ".objects-dock");
  const view = await rect(page, ".editor-view .view3d");
  const toolbar = await rect(page, ".tool-bar");
  const outside = { x: spot.x + 12, y: spot.y };
  // the pointer a little left of the shelf, then a little above the bar (and the page's own message over it, once the
  // first refusal has put it up), then in the corner between them
  for (const [name, x, y] of [
    ["beside the shelf", () => shelf.left - 24, () => 400],
    ["above the bar", () => 700, async () => (await dockTop(page)) - 22],
    ["in the corner of both", () => shelf.left - 24, async () => (await dockTop(page)) - 22],
    // (the gap between the bar's end and the shelf, at its foot: every corner of the pointer is covered)
    ["at the foot of the gap", () => (toolbar.right + shelf.left) / 2, () => view.bottom - 24],
  ] as const) {
    const at = { x: x(), y: await y() };
    await bringTo(page, outside.x, outside.y, spot.h, at.x, at.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await idle(page);
    const note = page.locator(".shape-note.error");
    await expect(note, name).toContainText("outside the selection");
    await expectFree(page, ".shape-note.error");
    // (it flipped to the pointer's other side, still beside it; at the foot of the gap there is no room near it, and the
    // note goes to the nearest free spot of the view, however far)
    const n = await rect(page, ".shape-note.error");
    if (name !== "at the foot of the gap") expect(Math.abs((n.left + n.right) / 2 - at.x) < 400 && n.top < at.y + 80 && n.bottom > at.y - 80, `${name}: still beside the pointer`).toBe(true);
    expect(n.right).toBeLessThanOrEqual(view.right);
  }
});

test("a shelf object's \"Place here\" flips from under the shelf and the bar", async ({ page }) => {
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await putHintsAway(page);
  const spot = await dryTile(page);
  await page.getByRole("button", { name: /^Pine/ }).click();
  await toolInHand(page);
  const shelf = await rect(page, ".objects-dock");
  const bar = { top: await dockTop(page) };
  for (const at of [
    { x: shelf.left - 20, y: 450 },
    { x: 700, y: bar.top - 20 },
    { x: shelf.left - 20, y: bar.top - 20 },
  ]) {
    await bringTo(page, spot.x, spot.y, spot.h, at.x, at.y);
    await page.mouse.move(at.x - 3, at.y - 3);
    await page.mouse.move(at.x, at.y);
    const note = page.locator(".shape-note");
    await expect(note).toBeVisible();
    await expectFree(page, ".shape-note");
  }
});

test("with the Legend open, a note beside the pointer keeps off its panel", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await putHintsAway(page);
  const spot = await dryTile(page);
  const legend = await openLegend(page);
  await page.getByRole("button", { name: /^Pine/ }).click();
  await toolInHand(page);
  const panel = await legend.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  // the pointer a little left of the panel, inside its height, then under it, then just right of it
  for (const at of [
    { x: panel.left - 24, y: (panel.top + panel.bottom) / 2 },
    { x: (panel.left + panel.right) / 2, y: panel.bottom + 24 },
    { x: panel.right + 24, y: (panel.top + panel.bottom) / 2 },
  ]) {
    await bringTo(page, spot.x, spot.y, spot.h, at.x, at.y);
    await page.mouse.move(at.x - 3, at.y - 3);
    await page.mouse.move(at.x, at.y);
    await expect(page.locator(".shape-note")).toBeVisible();
    await expectFree(page, ".shape-note");
  }
});

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test(`${size.width}: a note does not jump away and back as the pointer moves down the gap beside the shelf`, async ({ page }) => {
    await page.setViewportSize(size);
    await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
    await putHintsAway(page);
    const spot = await dryTile(page);
    // (the ground fills the view, so every pointer position is over the map and has its note; a tile is a few dozen
    // pixels wide, as in use: the words follow the tile under the pointer)
    await page.evaluate(([x, y, h]) => window.dgm3d!.renderer.setView({ target: [x + 0.5, h, -(y + 0.5)], distance: 16, yaw: 0.5, pitch: 0.9 }), [spot.x, spot.y, spot.h] as const);
    await page.getByRole("button", { name: /^Pine/ }).click();
    await toolInHand(page);
    const shelf = await rect(page, ".objects-dock");
    const toolbar = await rect(page, ".tool-bar");
    const x = Math.min((toolbar.right + shelf.left) / 2, shelf.left - 4);
    const frames = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const path: { x: number; y: number }[] = [];
    let total = 0;
    for (let y = 200; y <= size.height - 10; y += 8) {
      total++;
      await page.mouse.move(x, y);
      await frames();
      const note = await page.evaluate(() => {
        const e = document.querySelector(".shape-note");
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      if (!note) continue;
      // (always in the free view, and never far from the pointer)
      expect(Math.hypot(note.x + note.w / 2 - x, note.y + note.h / 2 - y), `pointer at ${y}`).toBeLessThan(900);
      path.push(note);
    }
    expect(path.length, `the note was up along the sweep (${path.length} of ${total})`).toBeGreaterThan(30);
    // (the pointer moves 8 px a step: no flip is undone within 6 steps, 48 px of its way)
    expect(reversals(path, 6), "flips that undo the flip before them").toBe(0);
  });
}

/** The flips of a note along a sweep that undo the flip just before them within `near` steps of the pointer: a move of 40 px or
 *  more (the note leaving one side or strip for another, not following the pointer tile by tile) against the last such move,
 *  soon after it. A control standing in the pointer's path makes one flip over it and one back past it; two clear strips
 *  of nearly the same distance made it flip down, up and down again within a few pixels of the pointer's way. */
function reversals(path: { x: number; y: number }[], near: number) {
  let count = 0;
  let before: { x: number; y: number; at: number } | null = null;
  for (let k = 1; k < path.length; k++) {
    const m = { x: path[k].x - path[k - 1].x, y: path[k].y - path[k - 1].y };
    if (Math.hypot(m.x, m.y) < 40) continue;
    if (before && k - before.at <= near && m.x * before.x + m.y * before.y < 0) count++;
    before = { ...m, at: k };
  }
  return count;
}

/** The Block tool with a working area and one refused click, so the page's message stands over the foot of the map: the scene of
 *  the refusal's note. The note itself is then set by the test hook at exact pointer places, as hovering would set it. */
async function blockScene(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await openEditor(page, "s=77&z=96&d=n&t=lakeBasin");
  await putHintsAway(page);
  const spot = await dryTile(page);
  const corner = (tx: number, ty: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [tx, ty] as const);
  const a = await corner(spot.x, spot.y);
  const b = await corner(spot.x + 2, spot.y + 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.selection().length)).toBe(9);
  await page.keyboard.press("7");
  await toolInHand(page);
  await page.mouse.move(size.width / 2, 250);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(".editor-message.error")).toBeVisible();
  // (the ground away from the pointer, so no hover answers over the note the test sets)
  await page.mouse.move(size.width / 2, 8);
  const view = await rect(page, ".editor-view .view3d");
  const shelf = await rect(page, ".objects-dock");
  /** The note with the pointer at (x, y) of the page, and where it stands: its box in the page. */
  const noteWith = async (x: number, y: number) => {
    await page.evaluate(([px, py]) => window.dgmEditor!.pointerNote("(46, 35) is outside the selection", px, py), [x - view.left, y - view.top] as const);
    return page.evaluate(() => new Promise<{ x: number; y: number; w: number; h: number }>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = document.querySelector(".shape-note.error")!.getBoundingClientRect();
      resolve({ x: r.left, y: r.top, w: r.width, h: r.height });
    }))));
  };
  return { view, shelf, noteWith };
}

const edgeFrom = (note: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  Math.hypot(Math.max(note.x - x, 0, x - (note.x + note.w)), Math.max(note.y - y, 0, y - (note.y + note.h)));

test("1280: the Block refusal, with its message up, makes no flip that undoes the one before as the pointer moves down the gap", async ({ page }) => {
  test.setTimeout(300_000);
  const { shelf, noteWith } = await blockScene(page, { width: 1280, height: 720 });
  // the pointer just left of the shelf, going down past the message and the settings row, a pixel or two at a time
  const x = shelf.left - 2;
  for (const step of [1, 3]) {
    const path: { x: number; y: number }[] = [];
    for (let y = 380; y <= 540; y += step) path.push(await noteWith(x, y));
    // (no flip is undone within 48 px of the pointer's way: a control in its path makes one flip over it and one back past it)
    expect(reversals(path, Math.ceil(48 / step)), `step ${step}: flips that undo the flip before them`).toBe(0);
  }
});

test("1920: the Block refusal keeps beside the pointer once it has room, wherever it was at the foot of the gap", async ({ page }) => {
  test.setTimeout(300_000);
  const { view, shelf, noteWith } = await blockScene(page, { width: 1920, height: 1080 });
  // the foot of the gap beside the shelf, where the nearest clear spot is far, then up the gap and left across the open map
  const x = shelf.left - 2;
  let far = 0;
  for (let y = view.bottom - 20; y >= 700; y -= 8) far = Math.max(far, edgeFrom(await noteWith(x, y), x, y));
  expect(far, "the foot of the gap leaves no room beside the pointer").toBeGreaterThan(100);
  for (let px = x; px >= 1100; px -= 10) {
    const y = 600;
    const note = await noteWith(px, y);
    expect(edgeFrom(note, px, y), `the note beside the pointer at ${px},${y}, not left where it was`).toBeLessThan(40);
  }
});
