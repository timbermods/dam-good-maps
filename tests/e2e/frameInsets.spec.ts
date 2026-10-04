// The camera's framing keeps clear of the page's controls (insets, PLAN §20 D345 B1, D265): the page
// says which edges of the canvas its controls cover (CSS pixels); Reset view, a view switched and a new
// map frame the whole map, centred, in what is left. Setting them never moves the camera by itself (a
// panel opening or closing leaves the view as it is). None set (the default), framing is as before;
// a negative or non-number inset is refused with its reason, nothing changed.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openEditor(page, "s=9&z=96&d=n&t=riverValley");
  await page.waitForTimeout(600);
}

/** The map's four corners on the canvas (CSS pixels from its top left): their box. */
const mapBox = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    let sum = 0;
    for (let i = 0; i < m.heights.length; i++) sum += m.heights[i];
    const level = sum / m.heights.length;
    const ps = [[0, 0], [m.W, 0], [0, m.H], [m.W, m.H]].map(([x, y]) => r.project(x, level, -y));
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: r.canvas.clientWidth, h: r.canvas.clientHeight };
  });

/** The map as drawn on the canvas (its edges at their heights and its sides' foot, its ground inside):
 *  its box, as the renderer fits it (renderer.ts `drawnOutline`). */
const drawnBox = (page: Page) =>
  page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    let lo = 255;
    for (let i = 0; i < m.heights.length; i++) lo = Math.min(lo, m.heights[i]);
    const foot = Math.min(0, lo) - 3;
    const at = (x: number, y: number) => m.heights[Math.min(m.H - 1, Math.max(0, y)) * m.W + Math.min(m.W - 1, Math.max(0, x))];
    const pts: number[][] = [];
    for (let x = 0; x <= m.W; x++)
      for (const y of [0, m.H]) {
        const t = Math.max(at(x - 1, Math.min(y, m.H - 1)), at(x, Math.min(y, m.H - 1)));
        pts.push([x, t, -y], [x, foot, -y]);
      }
    for (let y = 1; y < m.H; y++)
      for (const x of [0, m.W]) {
        const t = Math.max(at(Math.min(x, m.W - 1), y - 1), at(Math.min(x, m.W - 1), y));
        pts.push([x, t, -y], [x, foot, -y]);
      }
    const step = Math.max(1, Math.round(Math.max(m.W, m.H) / 64));
    for (let y = 0; y < m.H; y += step) for (let x = 0; x < m.W; x += step) pts.push([x + 0.5, m.heights[y * m.W + x], -(y + 0.5)]);
    const ps = pts.map(([x, y, z]) => r.project(x, y, z));
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: r.canvas.clientWidth, h: r.canvas.clientHeight };
  });

/** The even margin a framed map keeps (renderer.ts FRAME_MARGIN). */
const MARGIN = 12;

test("the default view fits the map as drawn snugly into what the controls leave, a small even margin all round (Layout 2's sitting)", async ({ page }) => {
  await open(page);
  // Layout 2's insets at this size, roughly: the water row, the Show column, the bar with its settings, the objects menu
  const insets = { top: 114, left: 139, bottom: 238, right: 184 };
  expect(await page.evaluate((i) => window.dgm3d!.renderer.setFrameInsets(i), insets)).toBeNull();
  for (const step of ["reset", "orbit"]) {
    await page.evaluate((s) => (s === "reset" ? window.dgm3d!.renderer.resetView() : window.dgm3d!.renderer.setMode("orbit")), step);
    const b = await drawnBox(page);
    const m = { l: b.x0 - insets.left, t: b.y0 - insets.top, r: b.w - insets.right - b.x1, b: b.h - insets.bottom - b.y1 };
    // inside, centred: even margins either way, the tighter way the small margin itself
    for (const k of ["l", "t", "r", "b"] as const) expect(m[k], `${step}: ${k}`).toBeGreaterThanOrEqual(MARGIN - 1.5);
    expect(Math.abs(m.l - m.r), `${step}: even across`).toBeLessThanOrEqual(2);
    expect(Math.abs(m.t - m.b), `${step}: even down`).toBeLessThanOrEqual(2);
    expect(Math.min(m.l, m.t), `${step}: snug`).toBeLessThanOrEqual(MARGIN + 1.5);
  }
  // and with none set, snug in the whole view
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 });
    r.resetView();
  });
  const b = await drawnBox(page);
  expect(Math.min(b.x0, b.y0, b.w - b.x1, b.h - b.y1)).toBeGreaterThanOrEqual(MARGIN - 1.5);
  expect(Math.min(Math.max(b.x0, b.w - b.x1), Math.max(b.y0, b.h - b.y1))).toBeLessThanOrEqual(MARGIN + 1.5);
});

test("framing keeps the map clear of the page's controls; setting them never moves the camera", async ({ page }) => {
  await open(page);
  // the page keeps the renderer's insets to its controls (Layout 2): all four set
  const page2 = await page.evaluate(() => window.dgm3d!.renderer.frameInsets);
  for (const k of ["top", "left", "bottom", "right"] as const) expect(page2[k], k).toBeGreaterThan(0);
  // the renderer's own behaviour from here, from none
  await page.evaluate(() => window.dgm3d!.renderer.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 }));
  expect(await page.evaluate(() => window.dgm3d!.renderer.frameInsets)).toEqual({ top: 0, left: 0, bottom: 0, right: 0 });
  // none set: framed whole and centred on the canvas, as before
  await page.evaluate(() => window.dgm3d!.renderer.resetView());
  const plain = await mapBox(page);
  expect(Math.abs((plain.x0 + plain.x1) / 2 - plain.w / 2)).toBeLessThan(plain.w * 0.03);
  expect(Math.abs((plain.y0 + plain.y1) / 2 - plain.h / 2)).toBeLessThan(plain.h * 0.03);
  // a panel at the left, a bar at the bottom, a row at the top: the camera stays where it is
  const before = await page.evaluate(() => window.dgm3d!.renderer.getView());
  const insets = { top: 60, left: 360, bottom: 140, right: 20 };
  expect(await page.evaluate((i) => window.dgm3d!.renderer.setFrameInsets(i), insets)).toBeNull();
  expect(await page.evaluate(() => window.dgm3d!.renderer.getView())).toEqual(before);
  // Reset view and a view switched frame the whole map in what the controls leave, centred there
  for (const step of ["reset", "top-down", "orbit"]) {
    await page.evaluate((s) => {
      const r = window.dgm3d!.renderer;
      if (s === "reset") r.resetView();
      else r.setMode(s === "top-down" ? "top" : "orbit");
    }, step);
    const b = await mapBox(page);
    const fw = b.w - insets.left - insets.right;
    const fh = b.h - insets.top - insets.bottom;
    expect(b.x0, `${step}: clear of the left`).toBeGreaterThanOrEqual(insets.left - 1);
    expect(b.x1, `${step}: clear of the right`).toBeLessThanOrEqual(b.w - insets.right + 1);
    expect(b.y0, `${step}: clear of the top`).toBeGreaterThanOrEqual(insets.top - 1);
    expect(b.y1, `${step}: clear of the bottom`).toBeLessThanOrEqual(b.h - insets.bottom + 1);
    expect(Math.abs((b.x0 + b.x1) / 2 - (insets.left + fw / 2)), `${step}: centred across`).toBeLessThan(fw * 0.03);
    expect(Math.abs((b.y0 + b.y1) / 2 - (insets.top + fh / 2)), `${step}: centred down`).toBeLessThan(fh * 0.03);
  }
  // refused with its reason, nothing changed
  expect(await page.evaluate(() => window.dgm3d!.renderer.setFrameInsets({ left: -5 }))).toMatch(/0 or more/);
  expect(await page.evaluate(() => window.dgm3d!.renderer.frameInsets)).toEqual(insets);
  // back to none: framed on the whole canvas again
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    r.setFrameInsets({ top: 0, left: 0, bottom: 0, right: 0 });
    r.setMode("orbit");
    r.resetView();
  });
  const again = await mapBox(page);
  for (const k of ["x0", "x1", "y0", "y1"] as const) expect(Math.abs(again[k] - plain[k])).toBeLessThan(2);
});
