// The one-page editor's layout (DESIGN.md, "The one-page editor"): at every supported size, with the New map
// drawer closed and open, the legend closed and open, and with each view layer on (no scale-up at any size,
// Kyler 2026-10-02 19:32), no two pieces of chrome overlap; the map's info sits at the window's centre clear of
// its neighbours; the right column shares its edges to the pixel; toggling a view layer moves nothing; every
// control stands on a solid background, and its words meet WCAG AA.

import { expect, test, type Page } from "@playwright/test";

const SIZES: [number, number][] = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [3440, 1440]];
/** The view layers: each on, nothing moves. */
const LAYERS = ["Height colours", "Level lines", "Markers", "Flow", "Clear water", "Badwater"];

/** The pieces of chrome that must never overlap one another. */
const PIECES = [".editor-bar", ".editor-bar .new-map", ".editor-bar .editor-title", ".editor-bar .editor-actions", ".editor-main > .shelf", ".drawer", ".view3d-controls", ".brush-bar-wrap > .map-bar", ".corner-level .layer-widget", ".view3d-corner .compass", ".corner-below > button", ".corner-below .speaker", ".corner-legend", ".legend-panel", ".editor-view .minimap", ".readout", ".water-bar", ".layer-legend"];

interface Box {
  name: string;
  l: number;
  t: number;
  r: number;
  b: number;
}

async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate((pieces) => {
    const out: { name: string; l: number; t: number; r: number; b: number }[] = [];
    for (const s of pieces)
      document.querySelectorAll(s).forEach((e, k) => {
        const r = e.getBoundingClientRect();
        if (r.width && r.height && getComputedStyle(e).visibility !== "hidden") out.push({ name: `${s}${k ? `#${k}` : ""}`, l: r.left, t: r.top, r: r.right, b: r.bottom });
      });
    return out;
  }, PIECES);
}

/** Two boxes overlap when they share area, and neither holds the other (a bar and its own buttons). */
function overlaps(a: Box, b: Box): boolean {
  const inside = (x: Box, y: Box) => x.l >= y.l - 0.5 && x.t >= y.t - 0.5 && x.r <= y.r + 0.5 && x.b <= y.b + 0.5;
  if (inside(a, b) || inside(b, a)) return false;
  return a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
}

/** Every control's words against the solid background behind them: the ratio, and whether the background is solid. */
async function contrast(page: Page): Promise<{ name: string; ratio: number; solid: boolean }[]> {
  return page.evaluate(() => {
    const lum = (c: number[]) => {
      const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const parse = (s: string): number[] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const out: { name: string; ratio: number; solid: boolean }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll(".editor-bar button, .editor-bar h1, .editor-bar .muted, .shelf-item, .drawer button, .drawer label, .drawer li, .view3d-controls button, .brush-bar-wrap button, .brush-bar-wrap label, .view3d-corner button, .view3d-corner output, .legend-panel .pick-line, .legend-panel .panel-head, .readout, .water-bar button, .water-bar .bar-status, .layer-legend p")) {
      if (seen.has(el) || (el as HTMLElement).offsetParent === null) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if ((el as HTMLButtonElement).disabled) continue;
      const fg = parse(cs.color);
      // the first opaque background up the tree: it must belong to the chrome, found before the map's view or
      // the page itself (a translucent plate over the map is not solid)
      let node: Element | null = el;
      let bg: number[] | null = null;
      let solid = false;
      while (node) {
        if (node === document.body || node.classList.contains("view3d") || node.classList.contains("editor-map-area")) break;
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c[3] >= 0.999) {
          bg = c;
          solid = true;
          break;
        }
        node = node.parentElement;
      }
      if (!fg || !bg) {
        out.push({ name: (el.textContent ?? el.className).trim().slice(0, 30), ratio: 0, solid: false });
        continue;
      }
      const a = lum(fg) + 0.05;
      const b = lum(bg) + 0.05;
      out.push({ name: (el.textContent ?? el.className).trim().slice(0, 30), ratio: Math.max(a, b) / Math.min(a, b), solid });
    }
    return out;
  });
}

/** A box's edges rounded to a tenth of a pixel, for the column's to-the-pixel checks. */
const edge = (v: number) => Math.round(v * 10) / 10;

async function openEditor(page: Page) {
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  await page.getByRole("button", { name: "Minimap" }).click();
  await page.locator(".map-note button").first().click().catch(() => undefined);
  await page.keyboard.press("7");
  // the checks done: the dot's words, and with them the header's right group, hold still from here
  await expect(page.locator(".checks-dot .dot-words")).toHaveText("Ready to play", { timeout: 120_000 });
}

const settle = async (page: Page, w: number, h: number) => {
  await page.mouse.move(w * 0.55, h * 0.6);
  await page.waitForTimeout(300);
};

/** The checks of one state: no overlap, the info centred, the column's edges, solid and readable. */
async function check(page: Page, w: number, state: string) {
  const bs = await boxes(page);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${bs[i].name} overlaps ${bs[j].name} (${state})`).toBe(false);
  const find = (name: string) => bs.find((b) => b.name === name)!;
  // the map's info at the window's centre, clear of both side groups
  const title = find(".editor-bar .editor-title");
  expect(Math.abs((title.l + title.r) / 2 - w / 2), `the map's info sits at the window's centre (${state})`).toBeLessThan(1.5);
  // the right column: one right edge, one left edge, row 1 and row 2 the same widths, the legend button
  // spanning the column, the panel and the water bar on the column's edges
  const level = find(".corner-level .layer-widget");
  const compass = find(".view3d-corner .compass");
  const slow = find(".corner-below > button");
  const sound = find(".corner-below .speaker");
  const legend = find(".corner-legend");
  const panel = bs.find((b) => b.name === ".legend-panel");
  const water = find(".water-bar");
  // (to the pixel: within a tenth, the browser's own sub-pixel rounding)
  const same = (a: number, b: number, what: string) => expect(Math.abs(a - b), `${what}: ${edge(a)} against ${edge(b)} (${state})`).toBeLessThanOrEqual(0.15);
  same(compass.r, sound.r, "the compass's right edge is Sound's");
  same(sound.r, legend.r, "Legend's right edge is Sound's");
  same(legend.r, water.r, "the water bar's right edge is the column's");
  same(level.l, slow.l, "the level control's left edge is Slow forces'");
  same(slow.l, legend.l, "Legend's left edge is Slow forces'");
  same(level.r, slow.r, "the level control's width is Slow forces'");
  same(compass.l, sound.l, "the compass's width is Sound's");
  const gap = compass.l - level.r;
  same(sound.l - slow.r, gap, "the gap between Slow forces and Sound is row 1's");
  same(slow.t - compass.b, gap, "the gap under row 1");
  same(legend.t - slow.b, gap, "the gap under row 2");
  same(legend.b - legend.t, slow.b - slow.t, "Legend's height is Slow forces'");
  if (panel) {
    same(panel.l, legend.l, "the panel's left edge is Legend's");
    same(panel.r, legend.r, "the panel's right edge is Legend's");
    same(panel.t - legend.b, gap, "the gap under Legend");
    // as tall as its content, never past one gap above the water bar: it reaches that gap only when it scrolls
    const fit = await page.locator(".legend-panel").evaluate((e) => ({ scrolls: e.scrollHeight > e.clientHeight + 1, head: e.firstElementChild!.getBoundingClientRect().top - e.getBoundingClientRect().top, foot: e.getBoundingClientRect().bottom - e.lastElementChild!.getBoundingClientRect().bottom }));
    expect(water.t - panel.b, `the panel ends at least one gap above the water bar (${state})`).toBeGreaterThanOrEqual(gap - 0.15);
    if (fit.scrolls) same(water.t - panel.b, gap, "a panel that scrolls ends one gap above the water bar");
    else same(fit.foot, fit.head, "the panel's space at its foot is its head's");
  }
  for (const c of await contrast(page)) {
    expect(c.solid, `${c.name}: a solid background (${state})`).toBe(true);
    expect(c.ratio, `${c.name}: WCAG AA (${state})`).toBeGreaterThanOrEqual(4.5);
  }
  return bs;
}

for (const [w, h] of SIZES) {
  test(`at ${w}×${h}: nothing overlaps, the info is centred, the right column lines up, layers move nothing, the chrome is solid and readable`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    {
      for (const drawer of [false, true]) {
        if (drawer) await page.getByRole("button", { name: "New map" }).click();
        for (const legend of [false, true]) {
          const state = `drawer ${drawer ? "open" : "closed"}, legend ${legend ? "open" : "closed"}`;
          if (legend) await page.getByRole("button", { name: "Legend", exact: true }).click();
          await settle(page, w, h);
          const before = await check(page, w, state);
          expect(before.some((b) => b.name === ".legend-panel"), `the legend panel (${state})`).toBe(legend);
          // each view layer on: nothing moves (the layer's own caption may appear), and nothing overlaps
          for (const layer of LAYERS) {
            const button = page.locator(".view3d-controls").getByRole("button", { name: layer, exact: true });
            await button.click();
            await settle(page, w, h);
            const after = await check(page, w, `${state}, ${layer} on`);
            for (const b of before) {
              const a = after.find((x) => x.name === b.name);
              expect(a && edge(a.l) === edge(b.l) && edge(a.t) === edge(b.t) && edge(a.r) === edge(b.r) && edge(a.b) === edge(b.b), `${b.name} stays put with ${layer} on (${state})`).toBe(true);
            }
            await button.click();
          }
          if (legend) await page.getByRole("button", { name: "Legend", exact: true }).click();
        }
        if (drawer) await page.getByRole("button", { name: "New map" }).click();
      }
    }
  });
}
