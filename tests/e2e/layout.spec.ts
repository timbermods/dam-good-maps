// The editor's layout, Layout 2 (DESIGN.md, "Layout 2 mockups (2026-10-03): the design to build"), at the two sizes
// it is designed for, 1920×1080 and 2560×1440: with the map generator's panel closed and open, the legend off and
// on, and each Show toggle on, no two pieces of chrome overlap (the open panel lies over the map at the left, clear
// of every control; opening it hides and moves nothing; the Show toggles in a row at the top left, Legend at the top
// right beside Top-down, Kyler, 2026-10-04); the map's info sits at the window's centre; the
// pieces keep to their places (the Show row and the bottom-left group at the map's left, Legend, the camera group and the objects
// menu at its right, the water row and the bar centred in it, the objects menu's foot level with the bar's); the
// held tool's settings sit on the bar's own cells at its exact width; ticking a toggle moves nothing; the legend
// never scrolls and the fullest one fits above the minimap; every control stands on a solid background, and its
// words meet WCAG AA.

import { expect, test, type Page } from "@playwright/test";
import { legendEntries, objectLegend } from "../../src/render3d/palette";

const SIZES: [number, number][] = [[1920, 1080], [2560, 1440]];
/** The Show toggles: each on, nothing moves. */
const TOGGLES = ["Heights", "Lines", "Markers", "Flow", "See-through", "Badwater"];
/** The map generator's one width at both sizes (Kyler, 2026-10-04). */
const PANEL = 640;
/** The page's margin round the map's edges. */
const MARGIN = 10;

/** The pieces of chrome that must never overlap one another. */
const PIECES = [".editor-bar .new-map", ".editor-bar .editor-title", ".editor-bar .editor-actions", ".gen", ".show-bar", ".legend-row", ".legend-panel", ".show-key", ".water-bar", ".camera-group > button", ".view3d-corner .compass", ".corner-level .layer-widget", ".view3d-corner > .slow-cell", ".sound-cell .speaker", ".tool-settings", ".tool-bar", ".objects-menu", ".object-window", ".editor-view .minimap", ".coords", ".readout"];

interface Box {
  name: string;
  l: number;
  t: number;
  r: number;
  b: number;
}

async function boxes(page: Page, pieces: string[] = PIECES): Promise<Box[]> {
  return page.evaluate((pieces) => {
    const out: { name: string; l: number; t: number; r: number; b: number }[] = [];
    for (const s of pieces)
      document.querySelectorAll(s).forEach((e, k) => {
        const r = e.getBoundingClientRect();
        if (r.width && r.height && getComputedStyle(e).visibility !== "hidden") out.push({ name: `${s}${k ? `#${k}` : ""}`, l: r.left, t: r.top, r: r.right, b: r.bottom });
      });
    return out;
  }, pieces);
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
      // (a colour mixed in CSS reads as color(srgb r g b / a), each from 0 to 1)
      const c = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(s);
      if (c) return [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255, c[4] === undefined ? 1 : Number(c[4])];
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const out: { name: string; ratio: number; solid: boolean }[] = [];
    const seen = new Set<Element>();
    // ("Water settled" is plain text over the map's sky with a dark shadow, by design: not among them)
    for (const el of document.querySelectorAll(".editor-bar button, .editor-bar h1, .editor-bar .muted, .shelf-item, .gen button, .gen label, .gen li, .show-bar button, .legend-row button, .tool-dock button, .tool-dock label, .cell-head, .view3d-corner button, .view3d-corner output, .legend-panel .pick-line, .legend-panel .panel-head, .readout, .coords, .water-bar button, .water-bar label, .layer-legend p, .overlay-legend p")) {
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

/** A box's edges rounded to a tenth of a pixel. */
const edge = (v: number) => Math.round(v * 10) / 10;
const same = (a: number, b: number, what: string, within = 0.6) => expect(Math.abs(a - b), `${what}: ${edge(a)} against ${edge(b)}`).toBeLessThanOrEqual(within);

async function openEditor(page: Page) {
  await page.goto("./#s=4242&z=96&d=n&t=riverValley");
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  await page.locator(".map-note button").first().click().catch(() => undefined);
  // the checks done: the dot's words, and with them the header's right group, hold still from here
  await expect(page.locator(".checks-dot .dot-words")).toHaveText("Ready to play", { timeout: 120_000 });
}

const settle = async (page: Page, w: number, h: number) => {
  await page.mouse.move(w * 0.55, h * 0.6);
  await page.waitForTimeout(300);
};

/** The held tool's settings stand on the bar's cells (Kyler's option B): one panel at the bar's exact width and one
 *  height, 120px, for every tool; every group starts at a cell's left edge and ends at a cell's right edge, so each
 *  edge in one row lines up with the other row and the bar; the two rows full, no empty cells. */
async function onTheCells(page: Page, state: string) {
  const r = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect();
    const bar = document.querySelector(".tool-bar")!;
    const cells = [...bar.querySelectorAll("button.icon-button")].map(box);
    const settings = document.querySelector(".tool-settings");
    return {
      bar: [box(bar).left, box(bar).right],
      settings: settings ? [box(settings).left, box(settings).right, box(settings).height] : null,
      lefts: cells.map((c) => c.left),
      rights: cells.map((c) => c.right),
      groups: [...document.querySelectorAll(".tool-settings .set-group")].map((g) => ({ name: g.querySelector(".set-label")?.textContent || g.textContent!.slice(0, 20), l: box(g).left, r: box(g).right, t: box(g).top, b: box(g).bottom })),
    };
  });
  expect(r.lefts.length, "the bar's eleven cells").toBe(11);
  if (!r.settings) return;
  same(r.settings[0], r.bar[0], `the settings' left edge is the bar's (${state})`);
  same(r.settings[1], r.bar[1], `the settings' right edge is the bar's (${state})`);
  same(r.settings[2], 120, `the settings' one height (${state})`);
  for (const g of r.groups) {
    expect(Math.min(...r.lefts.map((x) => Math.abs(x - g.l))), `${g.name} starts on a cell (${state})`).toBeLessThanOrEqual(0.6);
    expect(Math.min(...r.rights.map((x) => Math.abs(x - g.r))), `${g.name} ends on a cell (${state})`).toBeLessThanOrEqual(0.6);
  }
  // no empty cells: each row's groups cover its eleven cells (a group on both rows counts in each)
  const width = r.rights[10] - r.lefts[0];
  const tops = [...new Set(r.groups.map((g) => Math.round(g.t)))].sort((a, b) => a - b);
  for (const top of tops.slice(0, 2)) {
    const row = r.groups.filter((g) => Math.round(g.t) <= top && g.b > top + 1);
    const covered = row.reduce((a, g) => a + (g.r - g.l), 0) + 2 * (row.length - 1) + (row.some((g) => g.l < r.rights[5] && g.r > r.lefts[6]) ? 0 : r.lefts[6] - r.rights[5] - 2);
    same(covered, width, `the row at ${top} has no empty cells (${state})`, 1);
  }
}

/** The checks of one state: no overlap, the info centred, the pieces in their places, solid and readable. */
async function check(page: Page, w: number, state: string) {
  const bs = await boxes(page);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${bs[i].name} overlaps ${bs[j].name} (${state})`).toBe(false);
  const find = (name: string) => bs.find((b) => b.name === name)!;
  const [map] = await boxes(page, [".editor-view .view3d"]);
  // the map's info at the window's centre, clear of both side groups
  const title = find(".editor-bar .editor-title");
  same((title.l + title.r) / 2, w / 2, `the map's info sits at the window's centre (${state})`, 1.5);
  // the Show toggles in one row on the map's top and left margins, a clear gap (16px at least) before the water row;
  // Legend at the top right, its top the row's, one corner gap (8px) left of Top-down; the key and the legend under it,
  // their right edges on its (Kyler, 2026-10-04)
  const row = find(".show-bar");
  const water = find(".water-bar");
  same(row.l, map.l + MARGIN, `the Show row on the map's left margin (${state})`);
  same(row.t, map.t + MARGIN, `the Show row on the map's top margin (${state})`);
  expect(water.l - row.r, `a clear gap between the Show row and the water row (${state})`).toBeGreaterThanOrEqual(16);
  const legendRow = find(".legend-row");
  const topDown = bs.filter((b) => b.name.startsWith(".camera-group > button")).sort((a, b) => a.l - b.l)[0];
  // (Legend centred in the gap between the water row's right edge and Top-down's left, Kyler, 2026-10-04)
  same((legendRow.l + legendRow.r) / 2, (water.r + topDown.l) / 2, `Legend centred between the water row and Top-down (${state})`);
  same(legendRow.t, row.t, `Legend's top the Show row's (${state})`);
  // the top band shares one top and one bottom: the toggles, the water row, Legend, Top-down, Reset view and the
  // compass (Kyler, 2026-10-04)
  for (const b of [water, legendRow, topDown, find(".view3d-corner .compass")]) {
    same(b.t, row.t, `${b.name}: the top band's top (${state})`);
    same(b.b, row.b, `${b.name}: the top band's bottom (${state})`);
  }
  // the bottom-left group: the minimap at the foot, level with the bar's, on the left margin; directly above it, one gap
  // between each, the readout and over it the coordinates, their left edges on the minimap's (Kyler, 2026-10-04)
  const minimap = find(".editor-view .minimap");
  same(minimap.l, map.l + MARGIN, `the minimap on the map's left margin (${state})`);
  same(map.b - minimap.b, MARGIN, `the minimap on the map's foot margin (${state})`);
  const groupTop = minimap.t;
  let foot = minimap.t;
  for (const name of [".readout", ".coords"]) {
    const b = bs.find((x) => x.name === name);
    if (!b) continue;
    same(b.l, minimap.l, `${name}'s left edge on the minimap's (${state})`);
    same(foot - b.b, 6, `${name} one gap above what is under it (${state})`);
    foot = b.t;
  }
  const legend = bs.find((b) => b.name === ".legend-panel");
  void groupTop;
  if (legend) {
    same((legend.l + legend.r) / 2, (legendRow.l + legendRow.r) / 2, `the legend centred under Legend (${state})`);
    same(legend.t, legendRow.b + 6, `the legend one gap under Legend (${state})`);
    expect(legend.b, `the legend ends on the map's foot margin or higher (${state})`).toBeLessThanOrEqual(map.b - MARGIN + 0.5);
    const scroll = await page.locator(".legend-panel").evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(scroll, `the legend never scrolls (${state})`).toBeLessThanOrEqual(1);
  }
  // the map's right: the camera group and the objects menu on the right margin, the menu's foot level with the bar's
  const right = Math.max(...bs.filter((b) => b.name.startsWith(".camera-group") || b.name.startsWith(".view3d-corner .compass")).map((b) => b.r));
  same(right, map.r - MARGIN, `the camera group on the map's right margin (${state})`);
  const objects = find(".objects-menu");
  const bar = find(".tool-bar");
  same(objects.r, map.r - MARGIN, `the objects menu on the map's right margin (${state})`);
  same(objects.b, bar.b, `the objects menu's foot is the bar's (${state})`);
  same(bar.b, map.b - MARGIN, `the bar on the map's foot margin (${state})`);
  // the water row and the bar centred in the map area
  same((water.l + water.r) / 2, (map.l + map.r) / 2, `the water row centred in the map area (${state})`);
  same((bar.l + bar.r) / 2, (map.l + map.r) / 2, `the bar centred in the map area (${state})`);
  for (const c of await contrast(page)) {
    expect(c.solid, `${c.name}: a solid background (${state})`).toBe(true);
    expect(c.ratio, `${c.name}: WCAG AA (${state})`).toBeGreaterThanOrEqual(4.5);
  }
  return bs;
}

for (const [w, h] of SIZES) {
  test(`at ${w}×${h}: nothing overlaps, the info is centred, the pieces keep their places, toggles move nothing, the settings sit on the bar's cells, the chrome is solid and readable`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    const header = page.locator("header.editor-bar");
    const closed: Record<string, Box[]> = {};
    for (const panel of [false, true]) {
      if (panel) await header.getByRole("button", { name: "Map Generator", exact: true }).click();
      for (const legend of [false, true]) {
        const state = `panel ${panel ? "open" : "closed"}, legend ${legend ? "on" : "off"}`;
        if (legend) await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
        await settle(page, w, h);
        const before = await check(page, w, state);
        await onTheCells(page, state);
        expect(before.some((b) => b.name === ".legend-panel"), `the legend panel (${state})`).toBe(legend);
        if (!panel) closed[String(legend)] = before;
        else {
          // the panel opens over the map on its left margin, at its one width, 10px under the top row and 10px above
          // the bar's settings at least, on whole pixels; nothing else moves (Kyler, 2026-10-04: opening it never
          // resizes the map); what lies under it gives way
          const d = before.find((b) => b.name === ".gen")!;
          const water = before.find((b) => b.name === ".water-bar")!;
          const settings = before.find((b) => b.name === ".tool-settings")!;
          const [map] = await boxes(page, [".editor-view .view3d"]);
          same(d.r - d.l, PANEL, `the panel's one width (${state})`);
          same(d.l, map.l + MARGIN, `the panel on the map's left margin (${state})`);
          expect(d.t, `the panel under the top row (${state})`).toBeGreaterThanOrEqual(water.b + MARGIN - 0.5);
          expect(d.b, `the panel above the bar's settings (${state})`).toBeLessThanOrEqual(settings.t - MARGIN + 0.5);
          expect(d.t % 1, `the panel on a whole pixel (${state})`).toBe(0);
          for (const b of closed[String(legend)]) {
            const a = before.find((x) => x.name === b.name);
            expect(a && edge(a.l) === edge(b.l) && edge(a.t) === edge(b.t) && edge(a.r) === edge(b.r) && edge(a.b) === edge(b.b), `${b.name} keeps its place when the panel opens (${state})`).toBe(true);
          }
        }
        // each toggle on: nothing moves (its own legend may appear beside it), and nothing overlaps
        for (const name of TOGGLES) {
          const box = page.locator(".show-bar").getByRole("checkbox", { name, exact: true });
          await box.click();
          await expect(box).toHaveAttribute("aria-checked", "true");
          await settle(page, w, h);
          const after = await check(page, w, `${state}, ${name} on`);
          for (const b of before) {
            const a = after.find((x) => x.name === b.name);
            // (Heights changes the legend's lines, and with them its height; its top and its sides never move)
            const foot = b.name === ".legend-panel" || (a && edge(a.b) === edge(b.b));
            expect(a && edge(a.l) === edge(b.l) && edge(a.t) === edge(b.t) && edge(a.r) === edge(b.r) && foot, `${b.name} stays put with ${name} on (${state})`).toBe(true);
          }
          await box.click();
        }
        if (legend) await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
      }
      if (panel) await header.getByRole("button", { name: "Map Generator", exact: true }).click();
    }
    // every tool's settings on the bar's cells, one height (Select's in hand at first)
    await onTheCells(page, "Select");
    for (const [key, what] of [["1", "Raise"], ["2", "Lower"], ["3", "Flatten"], ["4", "Smooth"], ["5", "Naturalize"], ["7", "Carve"], ["8", "Craterize"], ["0", "Erupt"], ["9", "Quake"], ["-", "Glaciate"]] as const) {
      await page.keyboard.press(key);
      await onTheCells(page, what);
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Control+a");
    await onTheCells(page, "Select, with a selection");
    await page.keyboard.press("Escape");
    // an object's settings in its window directly above the objects list, on its edges, one gap between; no row above
    // the bar for it (Kyler's sitting, 2026-10-03): picked in the list, and picked on the map
    const objectWindow = async (state: string) => {
      const [win] = await boxes(page, [".object-window"]);
      const [list] = await boxes(page, [".objects-menu"]);
      expect(win, `the object window (${state})`).toBeTruthy();
      same(win.l, list.l, `the window's left edge is the list's (${state})`);
      same(win.r, list.r, `the window's right edge is the list's (${state})`);
      same(list.t - win.b, 6, `one gap between the window and the list (${state})`);
      const corner = await boxes(page, [".view3d-corner"]);
      expect(win.t, `the window clear of the camera group (${state})`).toBeGreaterThan(corner[0].b);
    };
    const listBox = (await boxes(page, [".objects-menu"]))[0];
    await page.getByRole("button", { name: "Water source (6)" }).click();
    await objectWindow("a water source picked in the list");
    await expect(page.locator(".tool-settings")).toHaveCount(0);
    await page.keyboard.press("Escape");
    const onMap = await page.evaluate(() => {
      const m = window.dgm3d!.renderer.mapState()!;
      const e = m.entities;
      for (let k = 0; k < e.count; k++)
        if (e.templates[e.template[k]] === "WaterSource") {
          const c = window.dgmEditor!.tileToClient(e.x[k], e.y[k]);
          if (document.elementFromPoint(c.x, c.y)?.tagName === "CANVAS") return c;
        }
      return null;
    });
    if (onMap) {
      await page.mouse.click(onMap.x, onMap.y);
      await expect(page.getByRole("group", { name: "Water source, selected" })).toBeVisible();
      await objectWindow("a water source picked on the map");
      await expect(page.locator(".tool-settings")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    // the list never moved
    expect((await boxes(page, [".objects-menu"]))[0]).toEqual(listBox);
  });
}

test("the fullest legend fits at 1920×1080 under Legend, without scrolling", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page);
  await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
  // every line the legend can show (moisture's three ground lines, the water, walls and dead trees, every object,
  // and the markers' lines under their heading) at its one row height
  const clean = legendEntries("moisture").filter((e) => !e.markers).length + objectLegend().filter((e) => !e.markers).length;
  const marked = [...legendEntries("moisture"), ...objectLegend()].filter((e) => e.markers).length;
  const m = await page.evaluate(() => {
    const panel = document.querySelector(".legend-panel")!;
    const cs = getComputedStyle(panel);
    const line = document.querySelector(".legend-panel .pick-line")!.getBoundingClientRect().height;
    return {
      row: parseFloat(cs.getPropertyValue("--legend-row")),
      line,
      pad: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
      top: panel.getBoundingClientRect().top,
      minimap: document.querySelector(".editor-view .minimap")!.getBoundingClientRect(),
    };
  });
  expect(m.line, "every line is the legend's one row height").toBeCloseTo(m.row, 1);
  const fullest = (clean + 1 + marked) * m.row + m.pad;
  // (the minimap's foot is the map's foot margin: the legend may reach it, clear of the bar and the objects list beside it)
  expect(m.top + fullest, `the fullest legend (${clean} lines, the heading and ${marked} markers' lines) ends on the map's foot margin or higher`).toBeLessThanOrEqual(m.minimap.bottom + 0.5);
});

// Nothing overlaps at any size (Kyler, 2026-10-04: the layout adjusts itself): at sizes the page isn't drawn for, the
// band lays itself out (the water row on a second line when it can't fit), and the panels and the legend take the
// room they have, scrolling inside only when it's short.
for (const [w, h] of [[1400, 900], [1366, 768], [1280, 800]] as [number, number][]) {
  test(`at ${w}×${h}: nothing overlaps, panels and the legend open or closed`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    const header = page.locator("header.editor-bar");
    for (const panel of [null, "Map Generator", "Real places", "Your maps"]) {
      if (panel) await header.getByRole("button", { name: panel, exact: true }).click();
      for (const legend of [false, true]) {
        if (legend) await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
        await settle(page, w, h);
        const bs = await boxes(page);
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${bs[i].name} overlaps ${bs[j].name} (${panel ?? "no panel"}, legend ${legend ? "on" : "off"})`).toBe(false);
        if (legend) await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
      }
      if (panel) await header.getByRole("button", { name: panel, exact: true }).click();
    }
  });
}
