// The words beside the pointer (a refusal, "Place here", Select's count) stay in the free view: between the panels, the
// Items shelf and the bars, never cut off under one of them. Where the first spot would run under one, the note flips to
// the pointer's other side. Seen with the Block tool's refusal and a shelf object's "Place here", beside the shelf and
// above the bar.

import { expect, test, type Page } from "@playwright/test";
import { toolInHand } from "./helpers";
import { openEditor } from "./open";

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
  for (const s of [".objects-dock", ".map-bar", ".view3d-controls", ".view3d-corner", ".minimap", ".dock-notes > *"]) {
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
  const outside = { x: spot.x + 12, y: spot.y };
  // the pointer a little left of the shelf, then a little above the bar (and the page's own message over it, once the
  // first refusal has put it up), then in the corner between them
  for (const [name, x, y] of [
    ["beside the shelf", () => shelf.left - 24, () => 400],
    ["above the bar", () => 700, async () => (await dockTop(page)) - 22],
    ["in the corner of both", () => shelf.left - 24, async () => (await dockTop(page)) - 22],
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
    // (it flipped to the pointer's other side, still beside it)
    const n = await rect(page, ".shape-note.error");
    expect(Math.abs((n.left + n.right) / 2 - at.x) < 400 && n.top < at.y + 80 && n.bottom > at.y - 80, `${name}: still beside the pointer`).toBe(true);
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
