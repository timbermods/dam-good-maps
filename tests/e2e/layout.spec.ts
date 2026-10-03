// The one-page editor's layout (DESIGN.md): at every supported size, with the New map drawer closed and open
// and a force in hand, no two pieces of chrome overlap, the brand sits at the window's centre clear of its
// neighbours, every control stands on a solid background, and its words meet WCAG AA against it.

import { expect, test, type Page } from "@playwright/test";

const SIZES: [number, number][] = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [3440, 1440]];

/** The pieces of chrome that must never overlap one another. */
const PIECES = [".editor-bar", ".editor-bar .new-map", ".editor-bar .editor-title", ".editor-bar .brand", ".editor-bar .editor-actions", ".editor-main > .shelf", ".drawer", ".view3d-controls", ".brush-bar-wrap > .map-bar", ".view3d-corner", ".editor-view .minimap", ".readout", ".water-bar"];

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
    for (const el of document.querySelectorAll(".editor-bar button, .editor-bar h1, .editor-bar .muted, .editor-bar .brand, .shelf-item, .drawer button, .drawer label, .drawer li, .view3d-controls button, .brush-bar-wrap button, .brush-bar-wrap label, .view3d-corner button, .view3d-corner output, .readout, .water-bar button, .water-bar .bar-status")) {
      if (seen.has(el) || (el as HTMLElement).offsetParent === null) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if ((el as HTMLButtonElement).disabled) continue;
      const fg = parse(cs.color);
      // the first opaque background up the tree
      let node: Element | null = el;
      let bg: number[] | null = null;
      let solid = false;
      let first = true;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c[3] >= 0.999) {
          bg = c;
          solid = first || solid;
          break;
        }
        if (first && c && c[3] > 0 && c[3] < 0.999) solid = false;
        first = false;
        node = node.parentElement;
      }
      if (!fg || !bg) {
        out.push({ name: (el.textContent ?? el.className).trim().slice(0, 30), ratio: 0, solid: false });
        continue;
      }
      const a = lum(fg) + 0.05;
      const b = lum(bg) + 0.05;
      out.push({ name: (el.textContent ?? el.className).trim().slice(0, 30), ratio: Math.max(a, b) / Math.min(a, b), solid: node === el || solid });
    }
    return out;
  });
}

async function openEditor(page: Page) {
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  await page.getByRole("button", { name: "Minimap" }).click();
  await page.keyboard.press("7");
}

for (const [w, h] of SIZES) {
  test(`at ${w}×${h}: nothing overlaps, the brand is centred, the chrome is solid and readable`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    for (const drawer of [false, true]) {
      if (drawer) await page.getByRole("button", { name: "New map" }).click();
      await page.mouse.move(w * 0.55, h * 0.6);
      await page.waitForTimeout(300);
      const bs = await boxes(page);
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${bs[i].name} overlaps ${bs[j].name} (drawer ${drawer ? "open" : "closed"})`).toBe(false);
      const brand = bs.find((b) => b.name === ".editor-bar .brand")!;
      expect(Math.abs((brand.l + brand.r) / 2 - w / 2), "the brand sits at the window's centre").toBeLessThan(1.5);
      if (drawer) expect(bs.some((b) => b.name === ".drawer"), "the drawer is open").toBe(true);
      for (const c of await contrast(page)) {
        expect(c.solid, `${c.name}: a solid background`).toBe(true);
        expect(c.ratio, `${c.name}: WCAG AA`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}
