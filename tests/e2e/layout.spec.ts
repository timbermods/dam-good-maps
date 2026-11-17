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
import { openSaved } from "./open";
import { applyInsets, hitTargets, phoneClipped, phoneControls, phoneFaults } from "./phone";

// (its tests stand alone: they run in parallel, so the browser shards and their two workers share them; one worker
// running them all in a row took a shard past its 30 minutes)
test.describe.configure({ mode: "parallel" });

/** Every tool and the key that picks it. */
const EVERY_TOOL = [["2", "Raise"], ["3", "Lower"], ["4", "Flatten"], ["5", "Smooth"], ["6", "Naturalize"], ["7", "Block"], ["Shift+Digit1", "Carve"], ["Shift+Digit2", "Craterize"], ["Shift+Digit3", "Erupt"], ["Shift+Digit5", "Quake"], ["Shift+Digit7", "Glaciate"], ["Shift+Digit4", "Rift"], ["Shift+Digit6", "Deposit"], ["Shift+Digit8", "Erode"]] as const;

const SIZES: [number, number][] = [[1920, 1080], [2560, 1440]];
/** The Show toggles: each on, nothing moves. */
const TOGGLES = ["Heights", "Lines", "Markers", "Flow", "See-through", "Badwater", "Irrigation"];
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
    const LONGEST: Record<string, string> = { Wander: "Meandering", Level: "Ground", "River depth": "Off", Banks: "10", Fall: "Edges", Size: "180", Power: "100" };
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
// wide font with no Look button alike, and keeps as much typed in a wide window as at 1280.
for (const look of ["standard", "wide", "high"] as const) {
  const wide = look === "wide";
  const named = { standard: "", wide: ", under a wide font and with no Look button", high: ", under the High look (its button as wide as Standard's)" }[look];
  test(`the longest name kept at 1280 is shown whole in two lines at every wider width${named}`, async ({ page }) => {
    test.setTimeout(300_000);
    // (the High look held, where the browser draws in software as on a GPU: CI's has none)
    if (look === "high")
      await page.addInitScript(() => {
        (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true };
        localStorage.setItem("dgm.look", "high");
      });
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
    if (look === "high") await expect(header.getByRole("button", { name: "Look: High" })).toBeVisible({ timeout: 60_000 });
    await header.locator(".editor-title .title-button").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Where the Long Winding River Meets Again And Again And Again");
    const name = (await header.getByLabel("Map name").inputValue()).trim();
    expect(name.length, "at least the floor is kept").toBeGreaterThanOrEqual(30);
    await page.keyboard.press("Enter");
    const button = header.locator(".editor-title .title-button");
    await expect(button).toHaveText(name);
    // (a name at the 30-character floor is kept whatever the room, and where the font is too wide for it, CI's beside the High
    // look's button, it is clamped to two lines: DESIGN. What the limit measured is shown whole at every width.)
    const measured = name.length > 30;
    for (const w of [1280, 1339, 1340, 1366, 1399, 1400, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(400);
      if (!measured && look === "high") continue;
      expect(
        await button.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5 && e.scrollHeight <= e.clientHeight + 1 && e.getBoundingClientRect().height <= 2 * (parseFloat(getComputedStyle(e).lineHeight) || 22) + 0.5),
        `${name} (${name.length} characters) in full at ${w}`,
      ).toBe(true);
    }
    // (typed again in the widest window, the limit is the same: the room is the narrowest width's, not this one's)
    await button.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Where the Long Winding River Meets Again And Again And Again");
    expect((await header.getByLabel("Map name").inputValue()).trim(), "the same name kept at 1920 as at 1280").toBe(name);
    await page.keyboard.press("Escape");
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
    await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
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
// (#1074 slice 7: the Add / Take away toggle is a finger's Shift and Alt; a mouse has the keys, and Whole map keeps the
// last two cells, as Kyler's option B laid it out)
for (const [w, h] of [[1280, 800], [1920, 1080]] as const)
  test(`at ${w}×${h}: Select's row to a mouse has no Add / Take away, and Whole map spans the last two cells`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page);
    const shapes = page.getByRole("group", { name: "How to select" });
    await expect(shapes.getByRole("button", { name: "Whole map" })).toBeVisible();
    await expect(shapes.locator(".combine")).toHaveCount(0);
    // (a plain cell: the narrowest shape's, since a name wider than its share, as "Rectangle" under some fonts, widens its own)
    const cell = Math.min(...(await shapes.locator("button:not(.whole-map)").evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().width))));
    const whole = (await shapes.getByRole("button", { name: "Whole map" }).boundingBox())!;
    const group = (await shapes.boundingBox())!;
    expect(whole.width, "Whole map across two cells").toBeGreaterThan(cell * 1.9);
    expect(Math.abs(whole.x + whole.width - (group.x + group.width)), "Whole map ends the row").toBeLessThan(2);
  });

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

// ---- the phone layouts (#1074 slice 2, amends D185; EDITOR_PLAN §3, "Phones"): upright at 393×852 and on its side at
// 852×393, three device pixels to a CSS pixel and a touch screen, as a phone shows the page. In every state a player
// meets (at rest, a brush in hand with its one-row sheet, the sheet pulled up, Show, the objects, the menu): no control
// under 44px, none off the screen, the page itself neither zoomed nor scrolled, every field 16px (no zoom on focus); with
// a tool's one-row sheet open the view keeps at least 60 % of the screen uncovered; a tool tapped again is put down, and
// a long press shows a control's tooltip without pressing it.

const PHONES = [
  { name: "upright", viewport: { width: 393, height: 852 } },
  { name: "on its side", viewport: { width: 852, height: 393 } },
];

/** The share of the screen where the view shows, under none of the controls laid over it (counted on a 4px grid). */
async function viewShare(page: Page): Promise<number> {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const v = window.dgm3d!.renderer.canvas.getBoundingClientRect();
    const over: DOMRect[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(".tool-dock > *, .objects-dock > *, .phone-show, .phone-show-button, .bottom-left-stack > *, .gen, .editor-bar, .menu, .checks-list")) {
      if (el.closest("[hidden]") || getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) over.push(r);
    }
    let seen = 0;
    const step = 4;
    for (let y = step / 2; y < H; y += step)
      for (let x = step / 2; x < W; x += step) {
        if (x < v.left || x > v.right || y < v.top || y > v.bottom) continue;
        if (!over.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) seen++;
      }
    return (seen * step * step) / (W * H);
  });
}

for (const phone of PHONES) {
  test.describe(`a phone ${phone.name}`, () => {
    test.use({ viewport: phone.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    test(`at ${phone.viewport.width}×${phone.viewport.height}: every control at least 44px and on the screen in every state, the page never zoomed or scrolled, the view at least 60 % with a tool's one-row sheet`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const W = phone.viewport.width;
      const H = phone.viewport.height;
      const check = async (state: string) => {
        await page.waitForTimeout(300);
        const page_ = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight, x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1 }));
        expect(page_, `${state}: the page is laid out at the screen's size, neither zoomed nor scrolled`).toEqual({ w: W, h: H, iw: W, ih: H, x: 0, y: 0, scale: 1 });
        const controls = await phoneControls(page);
        expect(controls.length, `${state}: controls found`).toBeGreaterThan(5);
        const small = controls.filter((c) => Math.min(c.w, c.h) < 44 - 0.5).map((c) => `${c.name} ${Math.round(c.w)}×${Math.round(c.h)}`);
        expect(small, `${state}: controls under 44px`).toEqual([]);
        expect(controls.filter((c) => c.off).map((c) => c.name), `${state}: controls off the screen`).toEqual([]);
        expect(controls.filter((c) => c.font !== null && c.font < 16).map((c) => c.name), `${state}: fields under 16px`).toEqual([]);
        return controls;
      };
      const tap = (selector: string) => page.locator(selector).first().tap();

      await check("at rest");
      expect(await viewShare(page), "at rest: the view's share").toBeGreaterThanOrEqual(0.6);

      // a brush in hand: its one-row sheet (Size and the main choice)
      await tap(".tool-bar button[aria-label^='Raise']");
      await expect(page.locator(".tool-settings.sheet:not(.tall)")).toBeVisible();
      await check("Raise in hand");
      expect(await viewShare(page), "Raise in hand, its one-row sheet: the view's share").toBeGreaterThanOrEqual(0.6);
      // pulled up: every setting
      await tap(".sheet-handle");
      await expect(page.locator(".tool-settings.sheet.tall")).toBeVisible();
      await check("the sheet pulled up");
      // tapped again, the brush is put down
      await tap(".tool-bar button[aria-label^='Raise']");
      await expect(page.locator(".tool-settings.sheet")).toHaveCount(0);

      await tap(".phone-show-button");
      await expect(page.locator(".phone-show")).toBeVisible();
      await check("Show open");
      await tap(".phone-show-button");
      await expect(page.locator(".phone-show")).toBeHidden();

      await tap(".objects-button");
      await expect(page.locator(".objects-menu")).toBeVisible();
      await check("the objects open");
      await tap(".objects-button");
      await expect(page.locator(".objects-menu")).toBeHidden();

      // a long press shows a control's tooltip (D351) and is not a tap: the tool stays down
      const cdp = await page.context().newCDPSession(page);
      const lower = page.locator(".tool-bar button[aria-label^='Lower']");
      await lower.scrollIntoViewIfNeeded();
      const r = (await lower.boundingBox())!;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
      await expect(page.locator(".tip")).toContainText("Lower");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(200);
      await expect(lower).toHaveAttribute("aria-pressed", "false");
      // a tap whose lift came in time but reached a page busy past the long press (its timer ran first) is still a tap,
      // by its own events' times (#1074 slice 6: touch.spec's sheet handle, on a loaded machine): the tool comes up
      const t0 = Date.now() / 1000;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }], timestamp: t0 });
      await expect(page.locator(".tip")).toContainText("Lower");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t0 + 0.12 });
      await expect(lower).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".tip")).toHaveCount(0);
      await tap(".tool-bar button[aria-label^='Lower']");
      await expect(lower).toHaveAttribute("aria-pressed", "false");

      await tap(".phone-menu-button");
      await expect(page.getByRole("menuitem", { name: "Map Generator" })).toBeVisible();
      await check("the menu open");
    });

    // (#1074: Kyler on his phone, "if I select Craterize how do I deselect it?")
    test(`at ${phone.viewport.width}×${phone.viewport.height}: what is in hand has Put it down (×) on its sheet's first row, and the tool row keeps it in view`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const row = page.locator(".tool-dock > .tool-bar");
      const putDown = page.locator(".tool-settings.sheet > button.put-down");
      /** The control whole inside the tool row's box (it scrolls). */
      const inRow = (name: string) =>
        row.evaluate((bar, name) => {
          const b = bar.getBoundingClientRect();
          const r = bar.querySelector(`button[aria-label^='${name}']`)!.getBoundingClientRect();
          return r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
        }, name);
      /** The × at the right end of the sheet's first row, the size of the object in hand's. */
      const onFirstRow = () =>
        putDown.evaluate((x) => {
          const s = x.parentElement!.getBoundingClientRect();
          const r = x.getBoundingClientRect();
          const first = x.parentElement!.querySelector(".settings-grid")!.getBoundingClientRect();
          return { top: Math.round(r.top - s.top), right: Math.round(s.right - r.right) <= 12, above: r.bottom <= first.top + 0.5, w: r.width, h: r.height };
        });

      // Craterize picked by its key with the row scrolled to its start: the row scrolls it into view, lit
      await row.evaluate((bar) => bar.scrollTo({ left: 0, top: 0 }));
      expect(await inRow("Craterize"), "Craterize out of view before it is picked").toBe(false);
      await page.keyboard.press("Shift+Digit2");
      const crater = page.locator(".tool-bar button[aria-label^='Craterize']");
      await expect(crater).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => inRow("Craterize"), { message: "Craterize scrolled into the tool row" }).toBe(true);

      // its sheet's first row ends with Put it down, a tooltip with its keys; one tap puts the force down
      await expect(putDown).toBeVisible();
      await expect(putDown).toHaveAttribute("aria-label", "Put it down");
      await expect(putDown).toHaveAttribute("data-keys", /X/);
      expect(await onFirstRow()).toEqual({ top: 0, right: true, above: true, w: 44, h: 44 });
      await putDown.tap();
      await expect(crater).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".tool-settings.sheet")).toHaveCount(0);
      await expect(row.locator("button[aria-pressed='true']:not(.objects-button, [aria-label^='Select'])"), "nothing in hand").toHaveCount(0);

      // a brush picked by a tap: the same ×, the same tap
      await row.evaluate((bar) => bar.scrollTo({ left: 0, top: 0 }));
      const raise = page.locator(".tool-bar button[aria-label^='Raise']");
      await raise.tap();
      await expect(putDown).toBeVisible();
      expect(await inRow("Raise")).toBe(true);
      await putDown.tap();
      await expect(raise).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".tool-settings.sheet")).toHaveCount(0);
    });
  });
}

// ---- a real phone's insets (#1074; Kyler's iPhone 16 Pro Max on its side, 2026-11-14: the Size card cut at the notch's
// inset, the rail's first and last tools cut at rest). The specs above run with no safe areas; here the browser gives the
// page a phone's own (`env(safe-area-inset-*)`, phone.ts `applyInsets`), and every tool is taken up in turn, its settings
// in one row and pulled up: no control or setting's card cut, covered or under an inset at rest, none past its plate, no
// word cut short or laid over another (phone.ts `phoneFaults`).

const INSET_ROOMS = [
  { name: "a big phone on its side", viewport: { width: 956, height: 440 }, insets: { top: 0, right: 62, bottom: 21, left: 62 } },
  { name: "a phone on its side", viewport: { width: 844, height: 390 }, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { name: "a phone upright", viewport: { width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
];

for (const room of INSET_ROOMS) {
  test.describe(`${room.name} with its insets`, () => {
    test.use({ viewport: room.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

    test(`at ${room.viewport.width}×${room.viewport.height}: every tool's settings, in one row and pulled up, whole and clear of the insets`, async ({ page }) => {
      test.setTimeout(240_000);
      await applyInsets(page, room.insets);
      await openEditor(page);
      const found: string[] = [];
      const measure = async (state: string) => {
        await page.waitForFunction(() => window.dgmEditor!.roomSettled(), null, { timeout: 10_000 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        for (const f of await phoneFaults(page, room.insets)) found.push(`${state}: ${f}`);
      };
      await measure("at rest");
      const tools = await page.locator(".tool-dock > .tool-bar button.icon-button:not(.objects-button)").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")!));
      expect(tools.length, "the tools found").toBeGreaterThan(10);
      // (each picked as a tap picks it, from wherever the row was left: the row brings it whole into view)
      const pick = (label: string) => page.locator(`.tool-dock > .tool-bar button[aria-label="${label}"]`).evaluate((b: HTMLElement) => b.click());
      for (const tool of tools) {
        const name = tool.replace(/ \(.*/, "");
        await pick(tool);
        await expect(page.locator(".tool-dock > .tool-settings.sheet")).toBeVisible();
        await measure(`${name} in hand`);
        const handle = page.locator(".sheet-handle");
        if (await handle.count()) {
          await handle.evaluate((b: HTMLElement) => b.click());
          await expect(page.locator(".tool-settings.sheet.tall")).toBeVisible();
          await measure(`${name} pulled up`);
        }
        await pick(tool);
        if (name === "Select") await page.keyboard.press("Escape");
      }
      expect(found).toEqual([]);
    });
  });
}

// ---- the browser's own bar over the page (#1074; iOS 26 Safari's floating address bar lay over the tool row on Kyler's
// iPhone, 2026-11-15): with the visual viewport ending above the root (stubbed, as Safari's bar would leave it), the
// tools stand at or above the visual viewport's foot, their band running on under the bar, and a tool's sheet above
// them; with no bar, the row stands where it always has. With the home bar's inset as well, the larger of the two.

test.describe("a phone upright under a browser's own bar", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("at 390×844: the tools clear of the bar, and where they always were without one", async ({ page }) => {
    test.setTimeout(120_000);
    await applyInsets(page, { top: 59, right: 0, bottom: 34, left: 0 });
    // (the visual viewport `__bar` px shorter than the layout viewport, as Safari's floating bar would leave it)
    await page.addInitScript(() => {
      const real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height")!;
      Object.defineProperty(VisualViewport.prototype, "height", {
        configurable: true,
        get(this: VisualViewport) {
          return real.get!.call(this) - ((window as unknown as { __bar?: number }).__bar ?? 0);
        },
      });
    });
    await openEditor(page);
    const bar = (px: number) =>
      page.evaluate(async (px) => {
        (window as unknown as { __bar?: number }).__bar = px;
        window.visualViewport!.dispatchEvent(new Event("resize"));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, px);
    const foot = () =>
      page.evaluate(() => {
        const vv = window.visualViewport!;
        const row = document.querySelector(".tool-dock > .tool-bar")!.getBoundingClientRect();
        const tools = [...document.querySelectorAll(".tool-dock > .tool-bar button.icon-button")].map((b) => b.getBoundingClientRect());
        const sheet = document.querySelector(".tool-dock > .tool-settings.sheet")?.getBoundingClientRect();
        return {
          barB: getComputedStyle(document.documentElement).getPropertyValue("--bar-b").trim(),
          visible: vv.offsetTop + vv.height,
          rowTop: row.top,
          rowBottom: row.bottom,
          toolsBottom: Math.max(...tools.map((r) => r.bottom)),
          toolsH: Math.min(...tools.map((r) => r.height)),
          sheetBottom: sheet?.bottom ?? null,
        };
      });

    // no bar: the row as it always stood, its tools above the home bar's 34px inset
    const before = await foot();
    expect(before.barB).toBe("0px");
    expect(before.rowBottom).toBe(844);
    expect(before.toolsBottom).toBe(844 - 34 - 4);

    // a bar 75px over the page's foot: the tools at or above the visual viewport's foot, still 44px and more; the row's
    // band runs on to the root's foot under the bar
    await bar(75);
    const under = await foot();
    expect(under.barB).toBe("75px");
    expect(under.visible).toBe(844 - 75);
    expect(under.toolsBottom).toBeLessThanOrEqual(under.visible);
    expect(under.toolsBottom).toBe(844 - 75 - 4);
    expect(under.toolsH).toBeGreaterThanOrEqual(44);
    expect(under.rowBottom).toBe(844);
    // a tool's sheet stands on the lifted row
    await page.locator(".tool-bar button[aria-label^='Raise']").first().tap();
    await expect(page.locator(".tool-settings.sheet")).toBeVisible();
    const held = await foot();
    expect(held.sheetBottom!).toBeLessThanOrEqual(held.rowTop + 0.5);
    expect(held.sheetBottom!).toBeLessThanOrEqual(held.visible);

    // a bar shorter than the home bar's inset: the inset keeps its room
    await bar(20);
    expect((await foot()).toolsBottom).toBe(844 - 34 - 4);

    // a reading past the cap (140px, or a quarter of the room) is not a browser's bar: the last good one holds
    await bar(75);
    await bar(200);
    expect((await foot()).barB, "a 200px reading ignored").toBe("75px");
    await bar(120);
    expect((await foot()).barB, "a 120px reading taken").toBe("120px");
    await bar(75);
    const start = await foot();
    expect(start.barB).toBe("75px");

    // a field takes the focus and a keyboard comes up (the visual viewport shorter, by less than the cap, so only the hold
    // keeps it out), then the field lets the focus go with the keyboard still up: the row never moves, before the viewport
    // is restored or after it
    const keyboard = await page.evaluate(async () => {
      const w = window as unknown as { __bar?: number };
      const vv = window.visualViewport!;
      const moved = () => vv.dispatchEvent(new Event("resize"));
      const at = () => ({
        barB: getComputedStyle(document.documentElement).getPropertyValue("--bar-b").trim(),
        toolsBottom: Math.max(...[...document.querySelectorAll(".tool-dock > .tool-bar button.icon-button")].map((b) => b.getBoundingClientRect().bottom)),
      });
      const field = document.createElement("input");
      document.body.append(field);
      field.focus();
      const focused = at();
      w.__bar = 75 + 60;
      moved();
      const typing = at();
      field.blur();
      const blurred = at();
      await new Promise((r) => setTimeout(r, 150));
      const keyboardStillUp = at();
      w.__bar = 75;
      moved();
      field.remove();
      const restored = at();
      return { focused, typing, blurred, keyboardStillUp, restored };
    });
    const still = { barB: "75px", toolsBottom: start.toolsBottom };
    expect(keyboard).toEqual({ focused: still, typing: still, blurred: still, keyboardStillUp: still, restored: still });
    await page.waitForTimeout(1200);
    expect({ barB: (await foot()).barB, toolsBottom: (await foot()).toolsBottom }, "the viewport settled: where it started").toEqual(still);

    // the bar gone: back where it was
    await bar(0);
    const after = await foot();
    expect({ rowTop: after.rowTop, rowBottom: after.rowBottom, toolsBottom: after.toolsBottom }).toEqual({ rowTop: before.rowTop, rowBottom: 844, toolsBottom: 844 - 34 - 4 });
  });
});

// ---- the tool row under a finger (#1074): it moves only with the finger and comes to rest on a whole tool by itself only
// once no finger is on it; once scrolled away from the tool in hand it stays there until the tool or the room changes.

for (const phone of PHONES) {
  test.describe(`a phone ${phone.name}, its tool row`, () => {
    test.use({ viewport: phone.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test(`at ${phone.viewport.width}×${phone.viewport.height}: a finger paused mid-pan keeps the row where it put it, and a re-render leaves a row scrolled away from the tool in hand`, async ({ page }) => {
      test.setTimeout(120_000);
      await openEditor(page);
      const bar = page.locator(".tool-dock > .tool-bar");
      await page.locator('.tool-dock > .tool-bar button[aria-label^="Raise"]').evaluate((b: HTMLElement) => b.click());
      await expect(page.locator(".tool-dock > .tool-settings.sheet")).toBeVisible();
      const side = phone.viewport.width > phone.viewport.height;
      const pos = () => bar.evaluate((b) => (b.scrollWidth > b.clientWidth + 1 ? b.scrollLeft : b.scrollTop));
      const idle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
      await idle();

      // a pan that pauses: the row stays under the finger, however long it rests there
      const box = (await bar.boundingBox())!;
      const from = side ? { x: box.x + box.width / 2, y: box.y + box.height - 40 } : { x: box.x + box.width - 40, y: box.y + box.height / 2 };
      const cdp = await page.context().newCDPSession(page);
      // (each event a frame after the one before on its own clock, as a finger sends them: without times Chrome takes no pan)
      let clock = Date.now() / 1000;
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [], timestamp: (clock += 0.016) });
      const was = await pos();
      await touch("touchStart", from);
      for (let k = 1; k <= 12; k++) {
        await touch("touchMove", side ? { x: from.x, y: from.y - 6 * k } : { x: from.x - 6 * k, y: from.y });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      }
      await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
      const put = await pos();
      expect(Math.abs(put - was), "the finger moved the row").toBeGreaterThan(10);
      await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
      expect(Math.abs((await pos()) - put), "the row moved under a finger at rest on it").toBeLessThan(1);
      await touch("touchEnd");
      await idle();

      // scrolled away from the tool in hand: a change that is neither the tool nor the room leaves it there
      const end = await bar.evaluate((b) => {
        const across = b.scrollWidth > b.clientWidth + 1;
        const max = across ? b.scrollWidth - b.clientWidth : b.scrollHeight - b.clientHeight;
        b.scrollTo({ [across ? "left" : "top"]: max, behavior: "instant" });
        return max;
      });
      await idle();
      expect(Math.abs((await pos()) - end)).toBeLessThan(1);
      const inView = () =>
        bar.evaluate((b) => {
          const r = b.querySelector('button[aria-label^="Raise"]')!.getBoundingClientRect();
          const q = b.getBoundingClientRect();
          return r.right > q.left && r.left < q.right && r.bottom > q.top && r.top < q.bottom;
        });
      expect(await inView(), "Raise scrolled out of the row").toBe(false);
      const size = page.locator(".tool-settings input.set-range").first();
      const before = await size.inputValue();
      await size.evaluate((el: HTMLInputElement) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(el, String(Number(el.value) === Number(el.min) ? Number(el.value) + 1 : Number(el.value) - 1));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect(size).not.toHaveValue(before);
      await idle();
      expect(Math.abs((await pos()) - end), "a setting moved pulled the row back to the tool in hand").toBeLessThan(1);
    });

    // (the wheel or a trackpad's pan on the row mid-glide takes it as a finger or the mouse does: the row rests where the
    // pan left it, never going back to the tool in hand. The wheel is sent from the page the frame the glide is seen to
    // move, so the glide is certainly still on, and its pan is the row scrolled to its start in the same frame)
    test(`at ${phone.viewport.width}×${phone.viewport.height}: a wheel on the row during the glide to the tool in hand takes the row`, async ({ page }) => {
      test.setTimeout(120_000);
      await openEditor(page);
      const bar = page.locator(".tool-dock > .tool-bar");
      const inRow = () =>
        bar.evaluate((b) => {
          const q = b.getBoundingClientRect();
          const r = b.querySelector("button[aria-label^='Craterize']")!.getBoundingClientRect();
          return r.left >= q.left - 0.5 && r.right <= q.right + 0.5 && r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5;
        });
      const pos = () => bar.evaluate((b) => (b.scrollWidth > b.clientWidth + 1 ? b.scrollLeft : b.scrollTop));
      await bar.evaluate((b) => b.scrollTo({ left: 0, top: 0, behavior: "instant" }));
      await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
      expect(await inRow(), "Craterize out of view before it is picked").toBe(false);

      const taken = bar.evaluate(
        (b) =>
          new Promise<void>((resolve, reject) => {
            const across = b.scrollWidth > b.clientWidth + 1;
            const at = () => (across ? b.scrollLeft : b.scrollTop);
            const t0 = performance.now();
            const tick = () => {
              if (at() > 2) {
                b.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: across ? -120 : 0, deltaY: across ? 0 : -120 }));
                b.scrollTo({ left: 0, top: 0, behavior: "instant" });
                resolve();
              } else if (performance.now() - t0 > 10_000) reject(new Error("the row never began to glide to the tool in hand"));
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      await page.keyboard.press("Shift+Digit2");
      await taken;
      await expect(page.locator(".tool-bar button[aria-label^='Craterize']")).toHaveAttribute("aria-pressed", "true");
      // (past the row's wait for rest and any glide back to the tool in hand)
      await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
      expect(await pos(), "the row went back to the tool in hand after the wheel took it").toBeLessThan(1);
      expect(await inRow(), "Craterize back in view after the wheel took the row").toBe(false);
    });
  });
}

// ---- tablets (#1074 slices 5 and 6): a tablet is a big phone, not a small desktop (planning, 2026-11-14). At an iPad's
// sizes upright and on its side (DPR 2): the header and the dock of tools stay, every control at least 44px and none off
// the screen, the page neither scrolled nor wider than the screen; Show and the objects fold to the phone's buttons and
// open as side sheets; the minimap stays; at rest nothing but the header, the dock and the minimap covers the map; the
// menu's pages cover the dock and scroll as one; and no setting's name is cut short.

// (900×1440: a big Android tablet upright, narrower than the desktop's room however tall, slice 7)
const TABLETS: [number, number][] = [[820, 1180], [1180, 820], [1024, 768], [1024, 1366], [900, 1440]];

/** The editor's chrome over the view, shown now: each piece by its class. */
async function chromeShown(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".editor-view :is(.show-bar, .legend-stack, .water-bar, .view3d-corner, .bottom-left-stack > *, .objects-dock > *, .tool-dock > *, .minimap, .phone-show, .phone-show-button, .tablet-objects-button)")]
      .filter((el) => !el.closest("[hidden]") && el.checkVisibility({ checkVisibilityCSS: true } as never) && el.getBoundingClientRect().height > 0)
      .map((el) => [...el.classList].find((c) => !["map-bar", "icon-button", "shelf", "in-column", "objects-button"].includes(c)) ?? el.tagName),
  );
}

for (const [W, H] of TABLETS) {
  test.describe(`a tablet at ${W}×${H}`, () => {
    test.use({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test(`at ${W}×${H}: a big phone, every control at least 44px and on the screen in every state`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      // the first steps' hints were put away by their own ×
      await expect(page.locator(".first-run")).toHaveCount(0);
      await expect(page.locator(".editor")).not.toHaveAttribute("data-phone");
      await expect(page.locator(".editor")).toHaveAttribute("data-tablet", "");
      const check = async (state: string) => {
        await page.waitForTimeout(400);
        const page_ = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, iw: window.innerWidth, x: window.scrollX, y: window.scrollY }));
        expect(page_, `${state}: the page is laid out at the screen's width, not scrolled`).toEqual({ w: W, iw: W, x: 0, y: 0 });
        const controls = await phoneControls(page);
        expect(controls.length, `${state}: controls found`).toBeGreaterThan(5);
        const small = controls.filter((c) => Math.min(c.w, c.h) < 44 - 0.5).map((c) => `${c.name} ${Math.round(c.w)}×${Math.round(c.h)}`);
        expect(small, `${state}: controls under 44px`).toEqual([]);
        expect(controls.filter((c) => c.off).map((c) => c.name), `${state}: controls off the screen`).toEqual([]);
        expect(controls.filter((c) => c.font !== null && c.font < 16).map((c) => c.name), `${state}: fields under 16px`).toEqual([]);
      };
      const tap = (l: ReturnType<Page["locator"]>) => l.first().tap();

      await check("at rest");
      // the map's name renamed in the header: a field, so 16px, though the name shown is the header's 13px (planning, #1074)
      await tap(page.locator(".editor-title .title-button"));
      const named = page.locator(".editor-title input[aria-label='Map name']");
      await expect(named).toBeFocused();
      expect((await named.boundingBox())!.height, "the name's field: a finger tall").toBeGreaterThanOrEqual(43.5);
      await check("the map's name renamed");
      await page.keyboard.press("Escape");
      await expect(named).toHaveCount(0);
      await tap(page.locator(".tool-bar button[aria-label^='Raise']"));
      await expect(page.locator(".tool-settings")).toBeVisible();
      await check("Raise in hand");
      await tap(page.locator(".tool-bar button[aria-label^='Carve']"));
      await check("Carve in hand");
      await tap(page.locator(".tool-bar button[aria-label^='Carve']"));
      await tap(page.locator(".tool-bar button[aria-label^='Select']"));
      await expect(page.locator(".tool-settings")).toBeVisible();
      await check("Select's settings open");
      await tap(page.locator(".tool-bar button[aria-label^='Select']"));
      await tap(page.locator(".phone-show-button"));
      await tap(page.locator(".phone-show .show-row", { hasText: "Legend" }));
      await check("Show open, the legend in it");
      await tap(page.locator(".phone-show .show-row", { hasText: "Legend" }));
      await tap(page.locator(".tablet-objects-button"));
      await check("the objects open");
      await tap(page.locator(".shelf-item[aria-label='Water source']"));
      await check("a water source in hand");
      await tap(page.locator(".held-close"));
      await tap(page.getByRole("button", { name: /^Map Generator/ }));
      await expect(page.locator(".gen-panel")).toBeVisible();
      await check("the Map Generator open");
      await tap(page.getByRole("button", { name: /^Your maps/ }));
      await check("Your maps open");
      await tap(page.getByRole("button", { name: /^Your maps/ }));
      await tap(page.getByRole("button", { name: "File", exact: true }));
      await check("the File menu open");
    });

    // (#1074 slice 7: a tool's settings were the desktop's rows, made for a mouse: Auto drawn 36×16 in a clear 44px box,
    // Glaciate's Benches cut to two of its three options at 820; what is drawn of each target and a tap reaches of it, by
    // the page's own answer, is 40px a side at the least)
    test(`at ${W}×${H}: every target in every tool's settings, Select's row among them, takes a finger: 40px a side at the least`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const tap = (l: ReturnType<Page["locator"]>) => l.first().tap();
      const under: string[] = [];
      const measure = async (tool: string) => {
        await expect(page.locator(".tool-settings")).toBeVisible();
        await page.waitForTimeout(150);
        const hits = await hitTargets(page, ".tool-dock > .tool-settings");
        expect(hits.length, `${tool}: targets found`).toBeGreaterThan(0);
        under.push(...hits.filter((t) => Math.min(t.w, t.h) < 40).map((t) => `${tool}: ${t.name} ${t.w}×${t.h}`));
      };
      await tap(page.locator(".tool-bar button[aria-label^='Select']"));
      // (a finger's Shift and Alt, Add / Take away, beside Whole map: a finger's only, slice 7)
      await expect(page.locator(".segmented.shapes > .combine")).toBeVisible();
      await measure("Select");
      for (const [, name] of EVERY_TOOL) {
        await tap(page.locator(`.tool-bar button[aria-label^='${name}']`));
        await measure(name);
      }
      expect(under, "settings targets a finger can hit less than 40px of").toEqual([]);
    });

    test(`at ${W}×${H}: Show and the objects fold to side sheets, the minimap and the dock stay, at rest the map has the screen, the pages cover the dock and scroll as one, no name cut`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const tap = (l: ReturnType<Page["locator"]>) => l.first().tap();

      // (4) at rest: nothing but the header, the dock's row and the minimap over the map (and Show's and Objects' buttons)
      expect((await chromeShown(page)).sort(), "at rest: the chrome over the map").toEqual(["minimap", "phone-show-button", "tablet-objects-button", "tool-bar"]);
      expect(await viewShare(page), "at rest: the view's share").toBeGreaterThanOrEqual(0.68);
      // (3) the minimap stays on the map, and the dock keeps its one row of tools
      const rows = await page.evaluate(() => new Set([...document.querySelectorAll(".tool-bar button.icon-button")].map((b) => Math.round(b.getBoundingClientRect().top))).size);
      expect(rows, "the tools in one row").toBe(1);

      // (1) Show: the phone's button and sheet, at the right under the button, clear of the dock; the map kept in the room
      const before = await roomNow(page);
      expect(before.ground, "ground in the room's middle at rest").not.toBeNull();
      await tap(page.locator(".phone-show-button"));
      await expect(page.locator(".phone-show")).toBeVisible();
      await expect(page.locator(".phone-show .ps-head")).toHaveText(["What to show", "Camera", "Weather", "Forces and sound"]);
      const side = async (selector: string) =>
        page.evaluate((selector) => {
          const s = document.querySelector(selector)!.getBoundingClientRect();
          const v = window.dgm3d!.renderer.canvas.getBoundingClientRect();
          const b = document.querySelector(".phone-show-button")!.getBoundingClientRect();
          const dock = document.querySelector(".tool-dock > .tool-bar")!.getBoundingClientRect();
          return { right: v.right - s.right <= 12, under: s.top >= b.bottom, aboveDock: s.bottom <= dock.top, half: s.width / v.width <= 0.5 };
        }, selector);
      expect(await side(".phone-show"), "Show: a side sheet").toEqual({ right: true, under: true, aboveDock: true, half: true });
      expect(await page.locator(".editor-view :is(.show-bar, .water-bar, .view3d-corner):not(.phone-show *)").count(), "no Show row, water row or corner on the map").toBe(0);
      await expect
        .poll(
          async () => {
            const now = await roomNow(page);
            return now.ground ? Math.hypot(now.ground[0] - before.ground![0], now.ground[1] - before.ground![1]) : Infinity;
          },
          { message: "Show open: the ground in the room's middle stays there (tiles)", timeout: 10_000 },
        )
        .toBeLessThan(1.5);
      await tap(page.locator(".phone-show-button"));
      await expect(page.locator(".phone-show")).toBeHidden();

      // (2) the objects: a button, a side sheet; a pick closes it, the object in hand in a row over the dock, put down by ×
      await expect(page.locator(".objects-menu")).toBeHidden();
      await tap(page.locator(".tablet-objects-button"));
      await expect(page.locator(".objects-menu")).toBeVisible();
      expect(await side(".objects-dock"), "the objects: a side sheet").toEqual({ right: true, under: true, aboveDock: true, half: true });
      await tap(page.locator(".shelf-item[aria-label='Water source']"));
      await expect(page.locator(".objects-menu")).toBeHidden();
      await expect(page.locator(".objects-dock .held-name")).toHaveText("Water source");
      await tap(page.locator(".held-close"));
      await expect(page.locator(".objects-dock .held-name")).toHaveCount(0);

      // (7) no setting's name, value or words cut short in any tool's settings, Select's too
      await tap(page.locator(".tool-bar button[aria-label^='Select']"));
      await expect(page.locator(".tool-settings")).toBeVisible();
      expect(await phoneClipped(page), "Select's settings: names cut short").toEqual([]);
      for (const [, name] of EVERY_TOOL) {
        await tap(page.locator(`.tool-bar button[aria-label^='${name}']`));
        await expect(page.locator(".tool-settings")).toBeVisible();
        expect(await phoneClipped(page), `${name}'s settings: names cut short`).toEqual([]);
      }
      await tap(page.locator(".tool-bar button[aria-label^='Erode']"));

      // (5) the Map Generator: a page over the whole view, the dock under it; it scrolls as one page
      await tap(page.getByRole("button", { name: /^Map Generator/ }));
      await expect(page.locator(".phone-page .gen-panel")).toBeVisible();
      const covered = await page.evaluate(() => {
        const p = document.querySelector(".phone-page")!.getBoundingClientRect();
        const d = document.querySelector(".tool-dock > .tool-bar")!.getBoundingClientRect();
        const hit = document.elementFromPoint((d.left + d.right) / 2, (d.top + d.bottom) / 2);
        // (the minimap and the objects' buttons under the page too: slice 5's hiding of them while a panel is open)
        const under = [".editor-view .minimap", ".tablet-objects-button", ".phone-show-button"].filter((sel) => {
          const m = document.querySelector(sel)?.getBoundingClientRect();
          return !!m && m.width > 0 && !document.elementFromPoint((m.left + m.right) / 2, (m.top + m.bottom) / 2)?.closest(".phone-page");
        });
        const body = document.querySelector<HTMLElement>(".phone-page-body")!;
        const inner = [...body.querySelectorAll<HTMLElement>("*")].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map((e) => e.className);
        return { over: p.left <= d.left && p.right >= d.right && p.top <= d.top && p.bottom >= d.bottom, onTop: !!hit?.closest(".phone-page"), shown: under, inner, scrolls: body.scrollHeight > body.clientHeight };
      });
      expect(covered, "the Map Generator covers the dock, the minimap and the buttons, and scrolls as one page").toEqual({ over: true, onTop: true, shown: [], inner: [], scrolls: true });
      expect(await phoneClipped(page), "the Map Generator: names cut short").toEqual([]);
      await tap(page.locator(".phone-back"));
      await expect(page.locator(".phone-page")).toHaveCount(0);
    });
  });
}

// a tablet is a finger's too: its first hints are the finger's (the objects under Objects, an object pressed, dragged and
// lifted into place; a finger's tap places nothing), never the mouse's "click" and "on the right"
test.describe("a tablet's first hints and a kept map's name", () => {
  test.use({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("at 820×1180: the first hints say what a finger does, and a kept map is renamed in a field its tile's width", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("./#s=4242&z=96&d=n&t=riverValley");
    await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
    await expect(page.locator(".editor[data-tablet]")).toHaveCount(1);
    const hints = page.locator(".first-run");
    await expect(hints).toBeVisible();
    await expect(hints).toContainText("Shape the land: pick a brush, then drag a finger on the map.");
    await expect(hints).toContainText("Place things: tap Objects, pick one, then press the map, drag to the spot and lift.");
    await expect(hints).toContainText("Add water: in Objects, pick Water source, then press the map and lift where the water starts.");
    await expect(hints).not.toContainText(/click|on the right/);
    await expect(page.locator(".tablet-objects-button")).toBeVisible();

    // and a kept map's name is renamed in a field the tile's width (it was a finger's 44px wide, most of the name out of sight)
    await page.getByRole("button", { name: "No more hints" }).tap();
    const head = (name: string) => page.locator("header.editor-bar").getByRole("button", { name, exact: true }).first();
    await head("File").tap();
    await page.getByRole("menuitem", { name: "Clear everything", exact: true }).tap();
    await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().history.length), { timeout: 30_000 }).toBeGreaterThan(0);
    await head("Your maps").tap();
    // (a tablet's way to it: a long press selects the tile, Rename on the heading row)
    const kept = page.locator(".your-maps li[data-id]").first();
    await expect(kept).toBeVisible({ timeout: 30_000 });
    const k = (await kept.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(k.x + k.width / 2), y: Math.round(k.y + k.height * 0.6) }] });
    await page.waitForTimeout(800);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".your-maps li.selected")).toHaveCount(1);
    await page.locator(".maps-panel .ym-act", { hasText: "Rename" }).tap();
    const rename = page.locator(".your-maps input.ym-rename");
    await expect(rename).toBeFocused();
    const r = (await rename.boundingBox())!;
    const tile = (await page.locator(".your-maps li[data-id]:has(input.ym-rename) .ym-tile").boundingBox())!;
    expect(r.height, "a kept map's field: a finger tall").toBeGreaterThanOrEqual(43.5);
    expect(r.width, "a kept map's field: the tile's width").toBeGreaterThanOrEqual(tile.width - 20);
    await rename.fill("Kept by a finger");
    await rename.press("Enter");
    await expect(kept).toContainText("Kept by a finger");
  });
});

// ---- the phone layouts' polish (#1074): Show at most 40 % of the view (upright its height, on its side its width), so
// the map changes above it as its toggles are tapped; a picked object closes the objects' sheet to one row saying what
// is in hand; a sheet or the panel opening or closing slides the view so the ground in the middle of the room left
// stays in its middle, and no sheet lies in that room; a pulled-up sheet ends on a whole setting; the menu ends whole on
// the screen, with nothing to scroll; and the first steps' hints never cover the map's middle.

/** The room the controls leave (the renderer's insets for its framing) and the ground in its middle. */
async function roomNow(page: Page) {
  return page.evaluate(() => {
    const r = window.dgm3d!.renderer;
    const c = r.canvas.getBoundingClientRect();
    const i = r.frameInsets;
    const room = { left: c.left + i.left, top: c.top + i.top, right: c.right - i.right, bottom: c.bottom - i.bottom };
    const x = (room.left + room.right) / 2;
    const y = (room.top + room.bottom) / 2;
    const at = r.pickAtLevel(x, y, r.getView().target[1]);
    return { room, x, y, ground: at ? [at.point[0], at.point[2]] : null };
  });
}

/** The boxes of the sheets, the panel and the tool row shown now. */
async function sheetBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".tool-dock > .tool-bar, .tool-dock > .tool-settings, .objects-dock > *, .phone-show")]
      .filter((e) => !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.className, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
  );
}

for (const phone of PHONES) {
  test.describe(`a phone ${phone.name}, polished`, () => {
    test.use({ viewport: phone.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    test(`at ${phone.viewport.width}×${phone.viewport.height}: Show at most 40 % of the view, a picked object one row, the map kept in the room left, a pulled-up sheet ending on a whole setting, the menu whole`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const upright = phone.viewport.width < phone.viewport.height;
      const tap = (selector: string) => page.locator(selector).first().tap();
      let before = await roomNow(page);
      expect(before.ground, "ground in the room's middle at rest").not.toBeNull();
      /** After a change, once the view has settled: no sheet lies in the room left, and the ground in the room's middle
       *  is the ground that was there. */
      const kept = async (state: string) => {
        const measure = async () => {
          const now = await roomNow(page);
          const inRoom = (await sheetBoxes(page)).filter((b) => b.left < now.room.right - 1 && b.right > now.room.left + 1 && b.top < now.room.bottom - 1 && b.bottom > now.room.top + 1).map((b) => b.name);
          const moved = now.ground ? Math.hypot(now.ground[0] - before.ground![0], now.ground[1] - before.ground![1]) : Infinity;
          return { now, inRoom, moved };
        };
        await page.waitForTimeout(300);
        await expect.poll(async () => (await measure()).inRoom, { message: `${state}: sheets in the room left`, timeout: 10_000 }).toEqual([]);
        await expect.poll(async () => (await measure()).moved, { message: `${state}: the ground in the room's middle stays there (tiles)`, timeout: 10_000 }).toBeLessThan(1.5);
        before = (await measure()).now;
      };

      await tap(".tool-bar button[aria-label^='Raise']");
      await kept("Raise in hand, one row");
      await tap(".sheet-handle");
      await kept("the sheet pulled up");
      // pulled up and too short for every setting, it ends after a whole one
      const cut = await page.evaluate(() => {
        const g = document.querySelector<HTMLElement>(".tool-settings.sheet.tall .settings-grid")!;
        const r = g.getBoundingClientRect();
        return [...g.children].map((c) => c.getBoundingClientRect()).filter((b) => b.height && b.top < r.bottom - 1 && b.bottom > r.bottom + 1).length;
      });
      expect(cut, "settings cut by the pulled-up sheet's end").toBe(0);
      await tap(".tool-bar button[aria-label^='Raise']");
      await kept("Raise put down");

      // Show: at most 40 % of the view, the map kept in the room above it (or beside it)
      await tap(".phone-show-button");
      await expect(page.locator(".phone-show")).toBeVisible();
      const share = await page.evaluate(() => {
        const s = document.querySelector(".phone-show")!.getBoundingClientRect();
        const v = window.dgm3d!.renderer.canvas.getBoundingClientRect();
        return { h: s.height / v.height, w: s.width / v.width };
      });
      expect(upright ? share.h : share.w, "Show's share of the view").toBeLessThanOrEqual(0.4);
      await kept("Show open");
      // its groups under headings, the layers' control named
      await expect(page.locator(".phone-show .ps-head")).toHaveText(["What to show", "Camera", "Minimap", "Weather", "Forces and sound"]);
      await expect(page.locator(".phone-show .ps-line", { has: page.locator(".layer-widget") })).toContainText("Layers shown");
      await tap(".phone-show-button");
      await kept("Show closed");

      // a picked object: the objects' sheet closes to one row saying what is in hand
      await tap(".objects-button");
      await kept("the objects open");
      await tap(".shelf-item[aria-label='Water source']");
      await expect(page.locator(".objects-menu")).toBeHidden();
      await expect(page.locator(".phone-held .held-name")).toHaveText("Water source");
      const held = await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>(".tool-settings.sheet")!;
        return { groups: s.querySelectorAll(".ow-group").length, rowsOfLine: s.querySelector(".held-line")!.getBoundingClientRect().height };
      });
      expect(held.groups, "settings shown under what is in hand before the sheet is pulled up").toBe(0);
      expect(held.rowsOfLine, "what is in hand: one row").toBeLessThanOrEqual(56);
      expect(await viewShare(page), "an object in hand: the view's share").toBeGreaterThanOrEqual(0.6);
      await kept("Water source in hand");
      await tap(".held-close");
      await expect(page.locator(".phone-held")).toHaveCount(0);

      // the menu: whole on the screen, nothing in it to scroll
      await tap(".phone-menu-button");
      const menu = await page.evaluate(() => {
        const m = document.querySelector<HTMLElement>(".menu.phone-menu")!;
        const r = m.getBoundingClientRect();
        return { bottom: r.bottom, right: r.right, scrolls: m.scrollHeight > m.clientHeight + 1 };
      });
      if (!upright) {
        expect(menu.scrolls, "on its side the menu needs no scrolling").toBe(false);
        expect(menu.bottom, "the menu ends on the screen").toBeLessThanOrEqual(phone.viewport.height);
      }
      expect(menu.right, "the menu ends on the screen").toBeLessThanOrEqual(phone.viewport.width);
    });

    test(`at ${phone.viewport.width}×${phone.viewport.height}: in Show a long name is whole inside its chip, Look's choices open in the sheet and on the screen, and the sheet ends on a whole line of Land's numbers`, async ({ page }) => {
      test.setTimeout(300_000);
      const { width: W, height: H } = phone.viewport;
      // (the Look button as on a computer with a graphics card: CI draws in software, where there is no look to choose)
      await page.addInitScript(() => ((window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true }));
      // (a map with terrain above terrain: its Show has Caves and overhangs, the longest chip)
      await openSaved(page, "s=2&z=96&d=n&t=riverValley");
      await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
      await page.locator(".phone-show-button").tap();
      const sheet = page.locator(".phone-show");
      await expect(sheet).toBeVisible();
      const chip = sheet.getByRole("checkbox", { name: "Caves and overhangs" });
      await expect(chip).toBeVisible();
      await chip.scrollIntoViewIfNeeded();
      expect(await phoneClipped(page), "Show: words cut short").toEqual([]);
      // (and its words lie over no neighbour)
      const spill = await chip.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(e);
        const w = range.getBoundingClientRect();
        return Math.max(w.right - r.right, r.left - w.left, w.bottom - r.bottom, r.top - w.top);
      });
      expect(spill, "Caves and overhangs: its words past its chip (px)").toBeLessThanOrEqual(0.5);
      // under a wider font than ours (CI's, or a phone's fallback: the letters spread here to stand for it) a name takes
      // a second line inside its chip and is not cut at its side
      const spread = await page.addStyleTag({ content: ".phone-show .ps-grid .show-row { letter-spacing: 1.5px; }" });
      expect(await phoneClipped(page), "Show under a wider font: words cut short").toEqual([]);
      await spread.evaluate((e) => (e as HTMLStyleElement).remove());
      // (and it is a chip like the rest: one height, its row no taller for it)
      const heights = await sheet.locator(".ps-grid").first().evaluate((g) => [...new Set([...g.children].map((e) => Math.round(e.getBoundingClientRect().height)))]);
      expect(heights, "What to show: its chips' heights").toEqual([44]);
      // (and no empty cell where it would not fit a row's end: the chip after it fills the cell, every row but the last full;
      // on its side Irrigation stood alone in its row)
      const rows = await sheet.locator(".ps-grid").first().evaluate((g) => {
        const across = getComputedStyle(g).gridTemplateColumns.split(" ").length;
        const by = new Map<number, number>();
        for (const e of g.children) {
          const r = e.getBoundingClientRect();
          if (!(r.height > 0)) continue;
          // (`grid-column: span 2` puts the span on the start)
          const cs = getComputedStyle(e);
          const on = [cs.gridColumnStart, cs.gridColumnEnd].find((v) => v.startsWith("span"));
          const span = on ? Number(on.slice(5)) : 1;
          by.set(Math.round(r.top), (by.get(Math.round(r.top)) ?? 0) + span);
        }
        return { across, filled: [...by.entries()].sort((a, b) => a[0] - b[0]).map((r) => r[1]) };
      });
      expect(rows.filled.slice(0, -1).filter((n) => n < rows.across), "What to show: a row with an empty cell before the last").toEqual([]);

      // the sheet at its top ends on a whole chip or line, with Land's numbers under the chips too
      const cutAtFoot = () =>
        sheet.evaluate((e) => {
          e.scrollTop = 0;
          const s = e.getBoundingClientRect();
          const foot = s.bottom - (parseFloat(getComputedStyle(e).borderBottomWidth) || 0);
          return [...e.querySelectorAll<HTMLElement>(".ps-head, .ps-grid > *, .ps-line, .land-line, .pick-list > li")]
            .map((el) => ({ name: (el.textContent ?? "").trim().slice(0, 24), r: el.getBoundingClientRect() }))
            .filter((p) => p.r.height > 0 && p.r.top < foot - 1 && p.r.bottom > foot + 0.5)
            .map((p) => p.name);
        });
      expect(await cutAtFoot(), "Show at rest: cut by the sheet's foot").toEqual([]);
      const land = sheet.getByRole("checkbox", { name: "Land", exact: true });
      await sheet.evaluate((e) => (e.scrollTop = 0));
      const landInView = await land.evaluate((e) => e.getBoundingClientRect().bottom <= e.closest(".phone-show")!.getBoundingClientRect().bottom);
      await land.tap();
      await expect(sheet.locator(".land-shares")).toHaveCount(1);
      await page.waitForTimeout(400);
      await expect.poll(cutAtFoot, { message: "Show with Land on: cut by the sheet's foot" }).toEqual([]);
      // (upright the Land chip is in the first screenful, and its numbers come under the chips: some of them show at once)
      if (landInView && W < H) expect(await sheet.locator(".land-line").evaluateAll((els) => els.filter((l) => l.getBoundingClientRect().bottom <= l.closest(".phone-show")!.getBoundingClientRect().bottom).length), "Land's lines in sight").toBeGreaterThan(0);
      await land.tap();
      await expect(sheet.locator(".land-shares")).toHaveCount(0);

      // the weather's day: its tooltip tells a finger the double tap (a key cap shows only where there are keys), and two
      // taps open its field with no dblclick from the browser (WebKit, the iPhone's, sends none for a double tap: only
      // each tap's own events, sent here as it sends them)
      const day = sheet.locator(".day-label");
      await expect(day).toHaveAttribute("title", "Double tap to type a day");
      await sheet.getByRole("button", { name: "Drought" }).tap();
      await expect(day).toContainText(/Day \d/, { timeout: 60_000 });
      await day.scrollIntoViewIfNeeded();
      await day.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: "touch", pointerId: 7, bubbles: true, isPrimary: true };
        for (let k = 0; k < 2; k++) {
          e.dispatchEvent(new PointerEvent("pointerdown", at));
          e.dispatchEvent(new PointerEvent("pointerup", at));
          e.dispatchEvent(new MouseEvent("click", { clientX: at.clientX, clientY: at.clientY, bubbles: true }));
        }
      });
      const dayField = day.locator("input.day-field");
      await expect(dayField).toBeVisible();
      await expect(dayField).toBeFocused();
      await dayField.press("Escape");
      await expect(dayField).toHaveCount(0);
      // a finger's own two taps, by their own times: the day in the field stays selected, so the day typed takes its
      // place. (This only guards the flow: the fault, the mouse press the browser sends for the second tap dropping the
      // selection so a typed 7 over Day 9 made Day 79, shows only in WebKit; Chrome kept the selection before the fix too.)
      const cdp = await page.context().newCDPSession(page);
      const b = (await day.boundingBox())!;
      const at = [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }];
      const t0 = Date.now() / 1000;
      for (const t of [0, 0.15]) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at, timestamp: t0 + t });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t0 + t + 0.05 });
      }
      await expect(dayField).toBeFocused();
      await expect(dayField).toHaveValue(/^\d+$/);
      // (the browser's mouse events for the tap, sent after it)
      await page.waitForTimeout(300);
      await page.keyboard.type("3");
      await expect(dayField).toHaveValue("3");
      await dayField.press("Escape");
      await expect(dayField).toHaveCount(0);
      await sheet.getByRole("button", { name: "Drought" }).tap();
      await expect(day).toHaveText("Day –");

      // Look: its choices open in the sheet, under its button, each on the screen and to be tapped
      const look = sheet.getByRole("button", { name: /^Look: / });
      await look.scrollIntoViewIfNeeded();
      await look.tap();
      const menu = page.locator("#look-menu");
      await expect(menu).toBeVisible();
      await page.waitForTimeout(300);
      const s = (await sheet.boundingBox())!;
      const m = (await menu.boundingBox())!;
      expect(m.x >= s.x - 0.5 && m.x + m.width <= s.x + s.width + 0.5, `the Look menu ${JSON.stringify(m)} inside the sheet ${JSON.stringify(s)} across`).toBe(true);
      expect(m.y, "the Look menu starts in the sheet").toBeGreaterThanOrEqual(s.y);
      expect(m.y, "the Look menu starts in sight").toBeLessThan(s.y + s.height - 44);
      for (const b of await menu.getByRole("button").all()) {
        await b.scrollIntoViewIfNeeded();
        const hit = await b.evaluate((e) => {
          const r = e.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { reached: !!at && (at === e || e.contains(at)), on: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, h: r.height };
        });
        expect(hit, `Look's "${(await b.textContent())?.trim()}": on the screen, a finger tall, nothing over it`).toMatchObject({ reached: true, on: true });
        expect(hit.h).toBeGreaterThanOrEqual(43.5);
      }
      expect(await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, x: window.scrollX, y: window.scrollY })), "the page neither scrolled nor grown").toEqual({ w: W, h: H, x: 0, y: 0 });
      await look.scrollIntoViewIfNeeded();
      await look.tap();
      await expect(menu).toBeHidden();
    });

    test(`at ${phone.viewport.width}×${phone.viewport.height}: the first steps' hints never cover the map's middle`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.goto("./#s=4242&z=96&d=n&t=riverValley");
      await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
      await expect(page.locator(".first-run")).toBeVisible();
      const clear = async (state: string) => {
        await page.waitForTimeout(400);
        // (the room measured once the editor has taken in the sheet: on a loaded machine 400 ms came before it, and the
        // room's middle was still the whole screen's)
        await page.waitForFunction(() => window.dgmEditor!.roomSettled(), null, { timeout: 10_000 });
        const { x, y } = await roomNow(page);
        const card = await page.evaluate(() => {
          const e = document.querySelector<HTMLElement>(".first-run");
          if (!e || getComputedStyle(e).display === "none") return null;
          const r = e.getBoundingClientRect();
          return r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
        });
        if (card) expect(x > card.left - 24 && x < card.right + 24 && y > card.top - 24 && y < card.bottom + 24, `${state}: the hints cover the map's middle`).toBe(false);
      };
      await clear("at rest");
      await page.locator(".tool-bar button[aria-label^='Raise']").tap();
      await clear("Raise in hand");
      await page.locator(".sheet-handle").tap();
      await clear("the sheet pulled up");
    });
  });
}

// ---- the camera bookmarks by finger (#1074 slice 7): Show's Camera section on a phone or a tablet holds the keys' nine
// slots and Save; a saved slot's tap glides to its view, an empty one's keeps the view there, Save armed keeps it over a
// saved one; each closes Show first, so a view is kept and shown with the map at rest; the keys see the same views.

const BOOKMARK_ROOMS = [
  { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 },
  { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3 },
  { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
  { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 },
  { viewport: { width: 900, height: 1440 }, deviceScaleFactor: 2 },
];

for (const room of BOOKMARK_ROOMS) {
  const { width: W, height: H } = room.viewport;
  test.describe(`the saved views at ${W}×${H}`, () => {
    test.use({ ...room, isMobile: true, hasTouch: true });

    test(`at ${W}×${H}: a finger saves the view in a slot, goes back to it with one tap and saves over it; the keys see the same slots`, async ({ page }) => {
      test.setTimeout(300_000);
      await openEditor(page);
      const show = page.locator(".phone-show");
      const slot = (n: number) => page.locator(".ps-views .view-slot").nth(n - 1);
      const save = page.locator(".ps-views .view-save");
      const view = () => page.evaluate(() => window.dgm3d!.renderer.getView());
      const kept = () => page.evaluate(() => window.dgmEditor!.info().views);
      const atRest = () => page.waitForFunction(() => window.dgmEditor!.roomSettled(), null, { timeout: 10_000 });
      // (a glide to a view comes within a hair of it a frame before it ends, and its last frame would undo a move made
      // then: each glide is waited out before the view is moved again. Drawn in software, as on CI, Show's slide outlasted
      // the save's first cap of one second and the view was kept mid-slide; the save waits up to four now, savedViews.tsx)
      const glided = () => page.waitForFunction(() => !window.dgm3d!.renderer.touchGliding, null, { timeout: 10_000 });
      const near = (a: { target: number[]; yaw: number; distance: number }, b: { target: number[]; yaw: number; distance: number }) =>
        Math.hypot(a.target[0] - b.target[0], a.target[2] - b.target[2]) < 0.05 && Math.abs(a.yaw - b.yaw) < 1e-3 && Math.abs(a.distance / b.distance - 1) < 1e-3;
      const openShow = async () => {
        await page.locator(".phone-show-button").tap();
        await expect(show).toBeVisible();
        await page.locator(".ps-views").scrollIntoViewIfNeeded();
      };

      // Show's Camera section: the nine slots and Save, each a finger's 44px and on the screen, its tooltip's key cap
      await openShow();
      await expect(page.locator(".ps-views .view-slot")).toHaveText(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
      const boxes = await page.locator(".ps-views button").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width >= 44 - 0.5, h: r.height >= 44 - 0.5, on: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        }),
      );
      expect(boxes).toEqual(Array(10).fill({ w: true, h: true, on: true }));
      await expect(slot(3)).toHaveAttribute("aria-label", "Save this view as view 3");
      await expect(slot(3)).toHaveAttribute("data-keys", "Ctrl+Shift+3");
      await expect(save).toHaveAttribute("data-keys", /Ctrl\+Shift\+1–9/);

      // an empty slot's tap: Show closes, and the view at rest is kept there, with the project
      await slot(3).tap();
      await expect(show).toBeHidden();
      await expect.poll(async () => (await kept()).map((v) => v.slot), { timeout: 15_000 }).toEqual([3]);
      await atRest();
      const v3 = (await kept())[0];
      expect(near(v3, await view()), "view 3 is the view at rest").toBe(true);

      // the view moved away; a saved slot's tap glides back to its view
      await page.evaluate(() => {
        const r = window.dgm3d!.renderer;
        const v = r.getView();
        r.setView({ target: [v.target[0] + 12, v.target[1], v.target[2] - 9], yaw: v.yaw + 1, distance: v.distance * 0.6 });
      });
      await openShow();
      await expect(slot(3)).toHaveClass(/saved/);
      await expect(slot(3)).toHaveAttribute("aria-label", "Go to view 3");
      await expect(slot(3)).toHaveAttribute("data-keys", "Alt+3");
      await slot(3).tap();
      await expect(show).toBeHidden();
      await expect.poll(async () => near(await view(), v3), { message: "back at view 3", timeout: 15_000 }).toBe(true);
      await glided();

      // the keys see the same slot: Alt+3 from elsewhere glides to it too
      await page.evaluate(() => window.dgm3d!.renderer.setView({ target: [30, 5, -30], yaw: 2, distance: 50 }));
      await page.keyboard.press("Alt+Digit3");
      await expect.poll(async () => near(await view(), v3), { message: "Alt+3 at view 3", timeout: 15_000 }).toBe(true);
      await glided();

      // Save armed: the next slot tapped keeps the view, over the saved one
      await page.evaluate(() => window.dgm3d!.renderer.setView({ target: [40, 5, -50], yaw: -1, distance: 70 }));
      await openShow();
      await save.tap();
      await expect(save).toHaveAttribute("aria-pressed", "true");
      await expect(slot(3)).toHaveAttribute("aria-label", "Save this view over view 3");
      await slot(3).tap();
      await expect(show).toBeHidden();
      await expect.poll(async () => !near((await kept())[0], v3), { message: "view 3 saved over", timeout: 15_000 }).toBe(true);
      await atRest();
      expect((await kept()).map((v) => v.slot)).toEqual([3]);
      expect(near((await kept())[0], await view()), "the new view 3 is the view at rest").toBe(true);
      await openShow();
      await expect(save).toHaveAttribute("aria-pressed", "false");
    });
  });
}
