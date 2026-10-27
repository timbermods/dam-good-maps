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
import { openLayoutMap as openEditor, settle } from "./helpers";

// (its tests stand alone: they run in parallel, so the browser shards and their two workers share them; one worker
// running them all in a row took a shard past its 30 minutes)
test.describe.configure({ mode: "parallel" });

/** Every tool and the key that picks it. */
const EVERY_TOOL = [["2", "Raise"], ["3", "Lower"], ["4", "Flatten"], ["5", "Smooth"], ["6", "Naturalize"], ["7", "Block"], ["Shift+Digit1", "Carve"], ["Shift+Digit2", "Craterize"], ["Shift+Digit3", "Erupt"], ["Shift+Digit5", "Quake"], ["Shift+Digit7", "Glaciate"], ["Shift+Digit4", "Rift"], ["Shift+Digit6", "Deposit"], ["Shift+Digit8", "Erode"]] as const;

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


/** The held tool's settings stand on the bar's cells (Kyler's option B): one panel at the bar's exact width and one
 *  height, 120px (two rows, never a third: Kyler, 2026-10-05), for every tool; every group starts at a cell's left edge and ends at a cell's right edge, so each
 *  edge in one row lines up with the other row and the bar; the two rows full, no empty cells. */
/** Where each force's Power and Size stood (x, width, top), by name: every force's must be the first one's (D184: a setting
 *  keeps its place across tools); the brushes' Size is their own, on cells 1–4. */
const FORCES_HERE = new Set(["Carve", "Craterize", "Erupt", "Quake", "Glaciate", "Rift", "Deposit", "Erode"]);
const placed = new Map<string, { l: number; w: number; t: number }>();

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
  expect(r.lefts.length, "the bar's fifteen cells").toBe(15);
  if (!r.settings) return;
  // nothing cut off (Kyler, 2026-10-04): every name in full beside its longest value and its Auto, every option and
  // button its whole word (the values put back as they were afterwards)
  const cut = await page.evaluate(() => {
    const LONGEST: Record<string, string> = { Wander: "Meandering", Level: "Ground", "River depth": "Off", Banks: "None", Size: "180", Power: "100" };
    const out: string[] = [];
    for (const set of document.querySelectorAll(".tool-settings .set")) {
      const label = set.querySelector(".set-label");
      const value = set.querySelector(".set-value");
      const was = value?.textContent ?? null;
      if (value) value.textContent = LONGEST[label?.textContent ?? ""] ?? "188";
      for (const e of set.querySelectorAll<HTMLElement>(".set-label, .set-seg button, .set-button, .set-words, .set-head")) if (e.scrollWidth > e.clientWidth + 0.5) out.push(`${label?.textContent ?? ""}: ${e.textContent!.trim().slice(0, 30)}`);
      if (value) value.textContent = was;
    }
    return out;
  });
  expect.soft(cut, `cut off (${state})`).toEqual([]);
  if (FORCES_HERE.has(state))
    for (const g of r.groups.filter((g) => g.name === "Power" || g.name === "Size")) {
      const here = { l: g.l, w: g.r - g.l, t: g.t };
      const first = placed.get(g.name);
      if (!first) placed.set(g.name, here);
      else {
        same(here.l, first.l, `${g.name}'s left edge is the same in ${state} as in the first force`);
        same(here.w, first.w, `${g.name}'s width is the same in ${state} as in the first force`);
        same(here.t, first.t, `${g.name}'s row is the same in ${state} as in the first force`);
      }
    }
  same(r.settings[0], r.bar[0], `the settings' left edge is the bar's (${state})`);
  same(r.settings[1], r.bar[1], `the settings' right edge is the bar's (${state})`);
  // (120px, two rows of 54px; from 2200px wide the bar's cells are 60px tall and the panel 132px, Kyler, 2026-10-15)
  same(r.settings[2], (page.viewportSize()?.width ?? 0) >= 2200 ? 132 : 120, `the settings' one height (${state})`);
  for (const g of r.groups) {
    expect(Math.min(...r.lefts.map((x) => Math.abs(x - g.l))), `${g.name} starts on a cell (${state})`).toBeLessThanOrEqual(0.6);
    expect(Math.min(...r.rights.map((x) => Math.abs(x - g.r))), `${g.name} ends on a cell (${state})`).toBeLessThanOrEqual(0.6);
  }
  // the rows share their edges (Kyler, 2026-10-05): every gap between two plates in a row lines up with a gap in each
  // other row, or a plate there spans across it
  const rowsAt = [...new Set(r.groups.map((g) => Math.round(g.t)))].sort((a, b) => a - b).slice(0, 2);
  const inRow = (top: number) => r.groups.filter((g) => Math.round(g.t) <= top && g.b > top + 1);
  for (const a of rowsAt)
    for (const g of inRow(a)) {
      if (g.r >= r.settings[1] - 6) continue;
      for (const b of rowsAt) {
        if (b === a) continue;
        const ok = inRow(b).some((h) => Math.abs(h.r - g.r) < 1 || (h.l < g.r - 1 && h.r > g.r + 1));
        expect(ok, `${g.name}'s right edge lines up with the row at ${b} (${state})`).toBe(true);
      }
    }
  // no empty cells: each row's groups cover its fifteen cells (a group on several rows counts in each)
  const width = r.rights[14] - r.lefts[0];
  const tops = [...new Set(r.groups.map((g) => Math.round(g.t)))].sort((a, b) => a - b);
  for (const top of tops.slice(0, 2)) {
    const row = r.groups.filter((g) => Math.round(g.t) <= top && g.b > top + 1);
    const covered = row.reduce((a, g) => a + (g.r - g.l), 0) + 2 * (row.length - 1) + (row.some((g) => g.l < r.rights[6] && g.r > r.lefts[7]) ? 0 : r.lefts[7] - r.rights[6] - 2);
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
    placed.clear();
    await onTheCells(page, "Select");
    for (const [key, what] of EVERY_TOOL) {
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
    await page.getByRole("button", { name: "Water source", exact: true }).click();
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

/** The map's name (Kyler, 2026-10-05, A+B): the longest generated one and one at Rename's limit, kept to at least
 *  30 characters whatever the fonts (what fits two lines of the header's room where they allow), shown in full in at
 *  most two lines, clear of both groups, the bar's other pieces where they were. */
async function nameFits(page: Page, w: number, h: number) {
  const header = page.locator("header.editor-bar");
  const actions = await header.locator(".editor-actions").boundingBox();
  for (const typed of ["Twin Channel Island Chain", "Where the Long Winding River Meets Again And Again"]) {
    await header.locator(".editor-title .title-button").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(typed);
    const name = (await header.getByLabel("Map name").inputValue()).trim();
    expect(name.length, `${typed}: at least the floor is kept`).toBeGreaterThanOrEqual(Math.min(typed.length, 30));
    await page.keyboard.press("Enter");
    await expect(header.locator(".editor-title .title-button")).toHaveText(name);
    await settle(page, w, h);
    const button = header.locator(".editor-title .title-button");
    // (at most two lines of its line height, never wider than its box)
    expect(
      await button.evaluate((e) => {
        const cs = getComputedStyle(e);
        const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        // (and never clamped to two lines with an ellipsis: all of it is there)
        return e.scrollWidth <= e.clientWidth + 0.5 && e.scrollHeight <= e.clientHeight + 1 && e.getBoundingClientRect().height <= 2 * line + 0.5;
      }),
      `${name} in full`,
    ).toBe(true);
    const bs = await boxes(page, [".editor-bar .new-map", ".editor-bar .editor-title", ".editor-bar .editor-actions"]);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${name}: ${bs[i].name} overlaps ${bs[j].name}`).toBe(false);
    expect(await header.locator(".editor-actions").boundingBox(), `${name}: the right group stays put`).toEqual(actions);
  }
}

// The same when the core answers a rename late (D341: the title's fit must not depend on timing). The map's name is kept
// by the core, in a worker that may be busy with the water or the checks; the title once stayed the field it was typed in,
// drawn for what was typed, until the worker answered, and a header measured in that time (a loaded CI machine, 2026-10-25)
// found the long name on one line cut at the title's edge. Here the worker's answer to every rename is held back 800ms.
/** Holds back, for `ms`, the worker's answer to every rename the page sends (a call to the worker is a Comlink message whose
 *  path ends with the function's name); `window.__held` counts the renames held. Set before the page opens. */
async function holdRenames(page: Page) {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    const held = window as unknown as { __holdRename: number; __held: number };
    held.__holdRename = 0;
    held.__held = 0;
    Worker.prototype.postMessage = function (this: Worker, message: { path?: string[] }, ...rest: unknown[]) {
      if (held.__holdRename && message?.path?.at(-1) === "setName") {
        held.__held++;
        setTimeout(() => (post as (...a: unknown[]) => void).call(this, message, ...rest), held.__holdRename);
        return;
      }
      return (post as (...a: unknown[]) => void).call(this, message, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
}
const holdFor = (page: Page, ms: number) => page.evaluate((ms) => ((window as unknown as { __holdRename: number }).__holdRename = ms), ms);

for (const [w, h] of [[1366, 768], [1300, 900]] as [number, number][]) {
  test(`at ${w}×${h}: the header's name is fitted at once, however late the core answers its rename`, async ({ page }) => {
    test.setTimeout(300_000);
    await holdRenames(page);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    await holdFor(page, 800);
    await nameFits(page, w, h);
    expect(await page.evaluate(() => (window as unknown as { __held: number }).__held), "the renames were held back").toBeGreaterThan(0);
  });
}

test("two renames in a row while the core answers late: the title ends on the second name and never shows the first again", async ({ page }) => {
  test.setTimeout(300_000);
  await holdRenames(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openEditor(page);
  await holdFor(page, 800);
  const title = page.locator("header.editor-bar .editor-title .title-button");
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    setInterval(() => seen.push(document.querySelector(".editor-title .title-button")?.textContent ?? ""), 20);
  });
  for (const typed of ["Typo Nmae", "Right Name"]) {
    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(typed);
    await page.keyboard.press("Enter");
  }
  // (both answers have come: the second held 800ms)
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  const right = seen.indexOf("Right Name");
  expect(right, "the second name is shown").toBeGreaterThanOrEqual(0);
  expect(seen.slice(right).filter((t) => t !== "Right Name"), "after the second name shows, nothing else does").toEqual([]);
  await expect(title).toHaveText("Right Name");
});

test("a rename typed back to the old name while the first is still on its way is sent, never lost", async ({ page }) => {
  test.setTimeout(300_000);
  await holdRenames(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openEditor(page);
  await holdFor(page, 800);
  const title = page.locator("header.editor-bar .editor-title .title-button");
  const first = ((await title.textContent()) ?? "").trim();
  for (const typed of ["Typo Nmae", first]) {
    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(typed);
    await page.keyboard.press("Enter");
  }
  // (both answers have come: each held 800ms)
  await page.waitForTimeout(2500);
  await expect(title).toHaveText(first);
});

// The longest name under CI's header (2026-10-26: "Where the Long Winding River M" cut at 1280 on CI). CI draws in software, so
// the header has no Look button, and its font (DejaVu Sans) is wider than Segoe UI: every header button is wider, and the
// title was left some 108px between the groups. Verdana, which a Windows machine has, gives the same widths (Map Generator
// 176px, History at 621px, a title room of 108px at 1280); where it isn't installed the page falls back to the machine's own
// wide sans. Together's button leaves the header under 1,340px for File's Together… entry, and the small title scales like
// the labels, so the 30-character floor name shows in full in two lines.
for (const [w, h] of [[1280, 800], [1300, 900]] as [number, number][]) {
  test(`at ${w}×${h}: under a wide font and with no Look button, the longest name keeps its floor and shows in full in two lines`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`html, body, button, input, textarea, select { font-family: Verdana, "DejaVu Sans", sans-serif !important; }
        .editor-actions > :has(.look-words) { display: none !important; }`);
      document.adoptedStyleSheets = [sheet];
    });
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--wide-font"))), "the font is wider than Segoe UI").toBeGreaterThan(1.02);
    await nameFits(page, w, h);
  });
}

// A name kept at 1280 is shown whole at every wider width (the header's right group grows at 1,340 and 1,400px: Look's state,
// Together's icon and its word): the typing limit measures the room the name will have there, under Segoe UI and under a
// wide font with no Look button alike.
for (const wide of [false, true]) {
  test(`the longest name kept at 1280 is shown whole in two lines at every wider width${wide ? ", under a wide font and with no Look button" : ""}`, async ({ page }) => {
    test.setTimeout(300_000);
    if (wide)
      await page.addInitScript(() => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`html, body, button, input, textarea, select { font-family: Verdana, "DejaVu Sans", sans-serif !important; }
          .editor-actions > :has(.look-words) { display: none !important; }`);
        document.adoptedStyleSheets = [sheet];
      });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor(page);
    const header = page.locator("header.editor-bar");
    await header.locator(".editor-title .title-button").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Where the Long Winding River Meets Again And Again And Again");
    const name = (await header.getByLabel("Map name").inputValue()).trim();
    expect(name.length, "at least the floor is kept").toBeGreaterThanOrEqual(30);
    await page.keyboard.press("Enter");
    const button = header.locator(".editor-title .title-button");
    await expect(button).toHaveText(name);
    for (const w of [1280, 1339, 1340, 1366, 1399, 1400, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(400);
      expect(
        await button.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5 && e.scrollHeight <= e.clientHeight + 1 && e.getBoundingClientRect().height <= 2 * (parseFloat(getComputedStyle(e).lineHeight) || 22) + 0.5),
        `${name} (${name.length} characters) in full at ${w}`,
      ).toBe(true);
    }
  });
}

// Under 1,340px the header is full: Together's button is not in it, and File's Together… entry opens the same panel.
test("under 1,340px Together is File's entry and opens its panel; from 1,340px it is the button again", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  const header = page.locator("header.editor-bar");
  const button = header.getByRole("button", { name: /^Together/ });
  await expect(button).toBeHidden();
  await header.getByRole("button", { name: "File", exact: true }).click();
  const entry = page.getByRole("menuitem", { name: "Together…" });
  await expect(entry).toBeVisible();
  await entry.click();
  const panel = page.getByRole("dialog", { name: "Together" });
  await expect(panel).toBeVisible();
  // (the panel hangs under the header's right group, on the screen)
  const actions = (await header.locator(".editor-actions").boundingBox())!;
  const box = (await panel.boundingBox())!;
  expect(box.x + box.width, "the panel is inside the window").toBeLessThanOrEqual(1280);
  expect(box.y, "the panel is under the right group").toBeGreaterThanOrEqual(actions.y + actions.height);
  expect(box.x + box.width, "the panel ends at the group's right edge").toBeCloseTo(actions.x + actions.width, 0);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(button).toBeVisible();
  await header.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Together…" })).toBeHidden();
});

// Nothing overlaps at any size (Kyler, 2026-10-04: the layout adjusts itself): at sizes the page isn't drawn for, the
// band lays itself out (the water row on a second line when it can't fit), and the panels and the legend take the
// room they have, scrolling inside only when it's short.
for (const [w, h] of [[1400, 900], [1300, 900], [1366, 768], [1280, 800]] as [number, number][]) {
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
    await nameFits(page, w, h);
  });
}

// Invisible hit areas (Kyler, 2026-10-15): a control smaller than 32px has an ::after that reaches 32px each way where there is
// room, with no visual change. No hit area may reach another control or another hit area, and none may be cut by a parent
// that clips.
async function hitAreaProblems(page: Page, state: string): Promise<string[]> {
  return page.evaluate((state) => {
    const INTERACTIVE = "button, a[href], input, select, textarea, summary, [role=button], [role=menuitem], [role=checkbox], [role=slider]";
    const label = (e: Element) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 20)}"`;
    type R = { l: number; t: number; r: number; b: number };
    const hits: { el: Element; h: R }[] = [];
    const all = [...document.body.querySelectorAll(INTERACTIVE)].filter((e) => (e as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true } as never) && e.getBoundingClientRect().width > 0);
    for (const el of all) {
      const cs = getComputedStyle(el, "::after");
      if (cs.content === "none" || cs.content === "normal" || cs.position !== "absolute") continue;
      const b = el.getBoundingClientRect();
      const pl = b.left + (el as HTMLElement).clientLeft, pt = b.top + (el as HTMLElement).clientTop;
      const l = pl + parseFloat(cs.left), t = pt + parseFloat(cs.top);
      hits.push({ el, h: { l, t, r: l + parseFloat(cs.width), b: t + parseFloat(cs.height) } });
    }
    // (the area that counts is what the clipping parents leave of it)
    const effective = (el: Element, h: R): R => {
      let e = { ...h };
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        e = { l: Math.max(e.l, pr.left + p.clientLeft), t: Math.max(e.t, pr.top + p.clientTop), r: Math.min(e.r, pr.left + p.clientLeft + p.clientWidth), b: Math.min(e.b, pr.top + p.clientTop + p.clientHeight) };
      }
      return e;
    };
    const out: string[] = [];
    const cut = (a: R, b: R) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.6 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.6;
    for (const { el, h } of hits) {
      if (h.r - h.l < 31.5 && h.b - h.t < 31.5) out.push(`${state}: ${label(el)} has a hit area of only ${Math.round(h.r - h.l)}×${Math.round(h.b - h.t)}`);
      const mineH = effective(el, h);
      for (const o of all) {
        if (o === el || o.contains(el) || el.contains(o)) continue;
        const theirs = hits.find((x) => x.el === o);
        const r = o.getBoundingClientRect();
        const against: R = theirs ? effective(o, theirs.h) : { l: r.left, t: r.top, r: r.right, b: r.bottom };
        if (cut(mineH, against)) out.push(`${state}: the hit area of ${label(el)} reaches ${label(o)}`);
      }
      const box = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        const inner: R = { l: pr.left + p.clientLeft, t: pr.top + p.clientTop, r: pr.left + p.clientLeft + p.clientWidth, b: pr.top + p.clientTop + p.clientHeight };
        const whole = box.left >= inner.l - 0.6 && box.right <= inner.r + 0.6 && box.top >= inner.t - 0.6 && box.bottom <= inner.b + 0.6;
        // (a control scrolled half out of its list is cut by the list whatever its area)
        if (whole && box.width && (h.l < inner.l - 0.6 || h.r > inner.r + 0.6 || h.t < inner.t - 0.6 || h.b > inner.b + 0.6)) out.push(`${state}: the hit area of ${label(el)} is cut by ${label(p)}`);
      }
    }
    return out;
  }, state);
}

for (const [w, h] of [[1280, 800], [1920, 1080]] as [number, number][]) {
  test(`hit areas at ${w}×${h}: each small control reaches 32px, none touches a neighbour's or is cut by a clip`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("./#s=4242&z=96&d=n&t=riverValley");
    await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
    await expect(page.locator(".checks-dot .dot-words > :first-child")).toHaveText("Ready to play", { timeout: 120_000 });
    const bad: string[] = [];
    const look = async (state: string) => {
      await settle(page, w, h);
      bad.push(...(await hitAreaProblems(page, state)));
    };
    const header = page.locator("header.editor-bar");
    const bar = page.locator(".tool-bar");
    await look("the first hints");
    await page.locator(".map-note button").first().click().catch(() => undefined);
    for (const tool of ["Rift", "Carve"]) {
      await bar.getByRole("button", { name: new RegExp(`^${tool}`) }).click();
      await look(`${tool} picked`);
      await page.keyboard.press("Escape");
    }
    await page.locator(".objects-menu .shelf-item", { hasText: "Water source" }).first().click();
    await look("an object picked");
    await page.keyboard.press("Escape");
    await header.getByRole("button", { name: "History", exact: true }).click();
    await look("History");
    await header.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Drought", exact: true }).click();
    await look("the weather day stepper");
    expect(bad).toEqual([]);
  });
}

// The narrowest the bar is drawn for: every tool's settings on the bar's cells and none cut off, as at the larger sizes
// (Glaciate's Benches "Some" was cut by 2px here once the bar grew past thirteen cells).
test("at 1280×800: every tool's settings sit on the bar's cells and nothing in them is cut off", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await settle(page, 1280, 800);
  placed.clear();
  await onTheCells(page, "Select");
  for (const [key, what] of EVERY_TOOL) {
    await page.keyboard.press(key);
    await onTheCells(page, `${what} at 1280`);
    await page.keyboard.press("Escape");
  }
});
