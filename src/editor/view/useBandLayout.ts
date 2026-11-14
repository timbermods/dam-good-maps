// The top band lays itself out at any window size (Kyler, 2026-10-04: nothing overlaps at any size, not only at the
// two designed). The water row sits centred on the window when it fits between the Show row and Legend (each one
// clear gap away), else as close to the centre as it can; when it can't fit at all it moves to a second line under
// the band, at its right beside the corner's second row, and Legend's open legend starts under it, the panels too where
// it would meet them (a panel clear of it starts under the band: a laptop's window keeps their room). Legend centres in the gap between the water row
// and Top-down; with the water row below, it joins the Show row as its last toggle, one toggle gap after its last (Badwater, or Caves and overhangs on a map
// that has them; Kyler, 2026-10-04), or, where that row would reach Top-down, on the second line one gap left of the water
// row; its open legend hangs under the second line, clear of a panel open at the left. The panels and the open legend are as tall as the room left
// above the controls under them, and scroll inside only when a window is too short for them (never at 1920×1080 or
// 2560×1440); the objects' dock likewise, its list scrolling so the picked object's window is never cut off. Whole pixels throughout. The positions go to CSS variables on the editor's main area.

import { useEffect, useLayoutEffect } from "preact/hooks";
import { chooseShape, setPanelShape } from "../generator/panelFit";

/** One clear gap between neighbours in the band, and the gap between the Show row's toggles. */
const GAP = 16;
const TOGGLE_GAP = 4;
/** The band's top and height, and the gap under it. */
const TOP = 10;
const BAND = 36;
const UNDER = 8;
/** The panels' width and the open legend's. */
const PANEL_W = 640;
const LEGEND_W = 190;

/** The objects' dock's tallest height: the room under the corner's buttons (`cornerBottom`, from the view's top). */
function dockMax(viewHeight: number, cornerBottom: number): string {
  return `${Math.max(0, Math.floor(viewHeight - cornerBottom - 8 - TOP))}px`;
}

/** The corner's buttons' bottom edge from the view's top: the loading frame has no corner, so it holds this (the two
 *  rows of the editor's corner, top-down and sound under it). */
const FRAME_CORNER_BOTTOM = 90;

/** The loading frame's shelf keeps the editor's room limit and scrolls inside, as the editor's does (the frame has no
 *  band to lay out, only the dock). */
export function useFrameDockRoom(): void {
  // (before the first paint: the shelf never shows taller than its room, not even for a frame)
  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>(".editor-main");
    const view = document.querySelector<HTMLElement>(".editor-view .view3d");
    if (!main || !view || typeof ResizeObserver === "undefined") return;
    const lay = () => main.style.setProperty("--dock-max", dockMax(view.getBoundingClientRect().height, FRAME_CORNER_BOTTOM));
    const watch = new ResizeObserver(lay);
    watch.observe(view);
    lay();
    return () => watch.disconnect();
  }, []);
}

/** The desktop's layout under a finger (a tablet, #1074): a coarse pointer, and the room not a phone's. */
function touchDesktop(view: HTMLElement): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !view.closest(".editor[data-phone]");
}

/** The dock's parts the objects and the minimap stand above on a tablet: the bar, the held tool's settings and their
 *  Put it down plate over the settings' left end. */
const DOCK_PARTS = [".tool-dock > .tool-bar", ".tool-dock > .tool-settings", ".tool-dock > .tool-settings > .put-down"];

/** The height of the bar and the held tool's settings over it with their Put it down plate (not the notes and hints
 *  above them), from the dock's foot: a tablet's objects and minimap stand above it. */
function dockHeight(dock: DOMRect | null, ...parts: (DOMRect | null)[]): Record<string, string> {
  const top = Math.min(...parts.filter((r): r is DOMRect => !!r && r.height > 0).map((r) => r.top));
  return { "--dock-h": `${dock && Number.isFinite(top) ? Math.ceil(dock.bottom - top) : 0}px` };
}

/** A control a panel or the legend must stop above, and the room over it to keep (the minimap's readout). */
type Piece = { b: DOMRect; over: number; aside?: "objects" | "minimap" };

interface Band {
  v: DOMRect;
  m: DOMRect;
  show: DOMRect;
  water: DOMRect;
  legend: DOMRect;
  corner: DOMRect;
  roomAbove: (x0: number, x1: number, from: number, among?: { b: DOMRect; over: number }[]) => number;
  /** `aside`: the objects and the minimap, which step aside for a panel on a tablet (tablet.css). */
  pieces: Piece[];
  dockRoom: string;
  dock: DOMRect | null;
  dockH: Record<string, string>;
  objects: DOMRect | null;
}

/** The band as lines, where a tablet's Show row wraps (#1074): the Show row at the top left, short of the corner; under
 *  it Legend's row, then the water row beside it when the line has room (beside the corner while the line is level with
 *  it, the view's width under it), else on a line of its own. The open legend hangs under Legend's row, below the water
 *  row where that row lies under it; the panels start under the band's last line. Whole pixels. */
function flowBand(b: Band): Record<string, string> {
  const { v, m, corner } = b;
  const C = corner.left - v.left;
  const cornerBottom = corner.bottom - v.top;
  const lineEnd = (y: number) => (y < cornerBottom + UNDER ? C - GAP : v.width - TOP);
  const L = b.legend.width;
  const w = b.water.width;
  const rowH = Math.max(b.legend.height, b.water.height, BAND);
  // (Legend's row first, on the line under the Show row; the water row after it on that line, or on the next)
  const legendTop = Math.round(b.show.bottom - v.top + UNDER);
  let waterTop = legendTop;
  let waterLeft = TOP + L + GAP;
  if (waterLeft + w > lineEnd(legendTop)) {
    waterTop = legendTop + rowH + UNDER;
    waterLeft = TOP;
  }
  const bandBottom = waterTop + rowH;
  // (the open legend under Legend's row, or under the water row where the water row lies under it)
  const legendPanelTop = (waterTop > legendTop ? waterTop + rowH : legendTop + rowH) + 6;
  const drop = waterTop > legendTop ? waterTop + rowH - (legendTop + rowH) : 0;
  const panelTop = bandBottom + 10;
  const widest = (panelTop < cornerBottom + UNDER ? C - GAP : v.width - TOP) - TOP;
  // (on a tablet whose bar takes the view's width the minimap, standing above the bar, steps aside while a panel is
  // open, and the objects too where they leave a panel no room beside them, tablet.css: the panel's room is the rest's)
  const full = typeof matchMedia === "function" && matchMedia("(max-width: 1279px)").matches;
  const objectsAside = !!b.objects && b.objects.left - v.left < TOP + PANEL_W + GAP;
  const under = b.pieces.filter((p) => !(p.aside === "minimap" && full) && !(p.aside === "objects" && objectsAside));
  const shape = chooseShape((width) => b.roomAbove(TOP, TOP + width, panelTop, under), widest);
  setPanelShape(shape);
  return {
    "--water-left": `${Math.round(waterLeft)}px`,
    "--water-top": `${waterTop}px`,
    "--legend-left": `${TOP}px`,
    "--legend-panel-left": `${TOP}px`,
    "--legend-drop": `${drop}px`,
    "--legend-row-top": `${legendTop - TOP}px`,
    "--legend-max": `${b.roomAbove(TOP, TOP + LEGEND_W, legendPanelTop)}px`,
    "--panel-top": `${Math.round(v.top - m.top + panelTop)}px`,
    "--panel-max": `${b.roomAbove(TOP, TOP + PANEL_W, panelTop, under)}px`,
    "--gen-max": `${b.roomAbove(TOP, TOP + shape.width, panelTop, under)}px`,
    "--gen-w": `${shape.width}px`,
    "--idea-room": `${Math.floor((b.dock ? b.dock.right - v.left : v.width) - (TOP + shape.width + GAP))}px`,
    "--dock-max": b.dockRoom,
    ...b.dockH,
  };
}

export function useBandLayout(ready: boolean): void {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".editor-main");
    const view = document.querySelector<HTMLElement>(".editor-view .view3d");
    if (!main || !view || typeof ResizeObserver === "undefined") return;
    const box = (s: string) => view.querySelector(s)?.getBoundingClientRect() ?? null;
    let frame = 0;
    const lay = () => {
      frame = 0;
      const v = view.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      const show = box(".show-bar");
      const water = box(".water-bar");
      const legend = box(".legend-row");
      const corner = box(".view3d-corner");
      if (!show || !water || !legend || !corner) return;
      const C = corner.left - v.left;
      // a tablet (a finger, the desktop's layout, #1074): the Show row wraps short of the corner, and where it takes more
      // than one line the band is laid out as lines (`flowBand`)
      const finger = touchDesktop(view);
      const showMax = finger ? `${Math.max(0, Math.floor(C - GAP - TOP))}px` : "";
      if (main.style.getPropertyValue("--show-max") !== showMax) {
        if (showMax) main.style.setProperty("--show-max", showMax);
        else main.style.removeProperty("--show-max");
      }
      const shown = view.querySelector(".show-bar")!.getBoundingClientRect();
      const S = shown.right - v.left;
      const w = water.width;
      const L = legend.width;
      // (the controls under a panel or the legend: as tall as the room above the first of them it would meet; over the
      // minimap, room for the coordinates and the readout, one gap apart: the readout a line, or two where it is narrow,
      // kept left of the bar's settings; the dock's pieces each by its own box: the first run's hints sit centred above
      // the settings, not across them; a note by its own box too: its container spans the dock, the note only its middle)
      const dock = box(".tool-dock");
      const readoutW = dock ? Math.min(500, dock.left - v.left - 22 - TOP) : 500;
      const pieces = [
        ...[".tool-dock > .tool-settings", ".tool-dock > .tool-settings > .put-down", ".tool-dock > .tool-bar", ".tool-dock > .working-note", ".tool-dock > .dock-notes > *:not(.first-run)"].map((s) => ({ b: box(s), over: 0 })),
        { b: box(".objects-dock"), over: 0, aside: "objects" as const },
        { b: box(".minimap"), over: 6 + 32 + 6 + (readoutW < 300 ? 52 : 32), aside: "minimap" as const },
      ].filter((u): u is Piece => !!u.b);
      const hints = box(".tool-dock .first-run");
      const under = hints ? [...pieces, { b: hints, over: 0 }] : pieces;
      const roomAbove = (x0: number, x1: number, from: number, among = under) => {
        let floor = v.height - TOP;
        for (const { b, over } of among) {
          const l = b.left - v.left;
          const r = b.right - v.left;
          if (r > x0 && l < x1) floor = Math.min(floor, b.top - v.top - over - TOP);
        }
        return Math.max(0, Math.floor(floor - from));
      };
      const objects = box(".objects-dock");
      const dockH = dockHeight(dock, ...DOCK_PARTS.map(box));
      // (the objects' dock: from its foot up to the corner's buttons; its foot is the view's, or on a tablet whose bar
      // takes the view's width the one this layout gives it, above the bar, the settings and their plate, tablet.css:
      // where it stands now may be a step behind)
      const above = finger && matchMedia("(max-width: 1279px)").matches;
      const foot = above ? v.height - (TOP + parseFloat(dockH["--dock-h"]) + 6) : objects ? objects.bottom - v.top : v.height - TOP;
      const dockRoom = dockMax(foot + TOP, corner.bottom - v.top);
      if (finger && shown.height > BAND + 1) {
        const vars = flowBand({ v, m, show: shown, water, legend, corner, roomAbove, pieces, dockRoom, dock, objects, dockH });
        for (const [k, val] of Object.entries(vars)) if (main.style.getPropertyValue(k) !== val) main.style.setProperty(k, val);
        return;
      }
      let left: number;
      let top = TOP;
      let legendLeft: number;
      let panelLeft: number;
      /** Legend's row on the second line too, left of the water row: the Show row leaves it no room in the band. */
      let rowDown = false;
      // (the furthest right Legend's centre goes: the button one gap clear of Top-down, and the button and its open
      // legend 8px clear of the corner, whose second row hangs under the band beside the legend)
      const most = Math.min(C - GAP - L / 2, C - 8 - Math.max(L, LEGEND_W) / 2);
      const inBand = S + GAP + w + GAP + L / 2 <= most;
      if (inBand) {
        // in the band: centred on the window, else as near the centre as the Show row and Legend allow; Legend centred
        // between the water row and Top-down, its open legend centred under it (clear of a panel open at the left, the
        // button clear of Top-down)
        left = Math.min(Math.max(v.width / 2 - w / 2, S + GAP), most - L / 2 - GAP - w);
      } else {
        // a second line under the band at its right, one gap left of the corner's second row, so the two read as one
        // line and the map's left keeps its room for the panels; Legend the Show row's last toggle, its open legend
        // under the second line, from its left edge, clear of a panel open at the left
        top = TOP + BAND + UNDER;
        left = Math.max(TOP, C - GAP - w);
        // (a Show row so long that Legend's row, after it, would reach Top-down, as on a map with caves at 1280 wide: the
        // row goes to the second line too, one gap left of the water row; nothing in the band covers a button)
        rowDown = S + TOGGLE_GAP + L > C - GAP;
      }
      const below = top + BAND;
      /** The second line's left edge (the water row's, or Legend's row's when it is there too). */
      const lineLeft = rowDown ? Math.max(TOP, left - GAP - L) : left;
      // (the panels start under the band, or under the second line where the second line would meet them: a panel
      // `width` wide is clear of it with one gap between)
      const panelTopFor = (width: number) => (top === TOP || lineLeft >= TOP + width + GAP ? TOP + BAND : below) + 10;
      // the generator's panel takes the shape that fits the room it has (panelFit.ts, the hints stepping aside while it is
      // open); the open legend, beside it at its right, stays clear of the corner and so of the panel, whatever its shape
      const widest = (inBand ? most - LEGEND_W / 2 : C - 8 - LEGEND_W) - GAP - TOP;
      const shape = chooseShape((width) => roomAbove(TOP, TOP + width, panelTopFor(width), pieces), widest);
      setPanelShape(shape);
      // (every panel at the generator's top: the others are no wider than its shape, so clear wherever it is)
      const panelTop = panelTopFor(shape.width);
      const panelW = shape.width;
      if (inBand) {
        const centre = Math.min(Math.max((left + w + C) / 2, TOP + panelW + GAP + LEGEND_W / 2), most);
        legendLeft = centre - L / 2;
        panelLeft = centre - LEGEND_W / 2;
      } else {
        legendLeft = rowDown ? lineLeft : S + TOGGLE_GAP;
        panelLeft = Math.max(legendLeft, TOP + panelW + GAP);
      }
      left = Math.round(left);
      // (one line: whole pixels; on the Show row it keeps the toggles' own spacing exactly)
      // (the open legend centred under the button where it now is, whatever its words' width)
      if (top === TOP) {
        legendLeft = Math.round(legendLeft);
        panelLeft = legendLeft + L / 2 - LEGEND_W / 2;
      }
      panelLeft = Math.round(panelLeft);
      const legendTop = below + 6;
      // (the open legend under the second line: the row itself there, or the band's row with the legend dropped under it)
      const rowTop = rowDown ? top - TOP : 0;
      const drop = top === TOP || rowDown ? 0 : top + BAND - (TOP + BAND);
      const vars: Record<string, string> = {
        "--water-left": `${left}px`,
        "--water-top": `${top}px`,
        "--legend-left": `${legendLeft}px`,
        "--legend-panel-left": `${panelLeft}px`,
        "--legend-drop": `${drop}px`,
        "--legend-row-top": `${rowTop}px`,
        "--legend-max": `${roomAbove(panelLeft, panelLeft + LEGEND_W, legendTop)}px`,
        // (the panel sits in the main area, the view's own top and left)
        "--panel-top": `${Math.round(v.top - m.top + panelTop)}px`,
        "--panel-max": `${roomAbove(TOP, TOP + PANEL_W, panelTop)}px`,
        // (the generator's panel: the room without the hints, which it covers, and its width)
        "--gen-max": `${roomAbove(TOP, TOP + panelW, panelTop, pieces)}px`,
        "--gen-w": `${panelW}px`,
        // (a map's idea card, with the notes over the bar: with the generator's panel open it takes the dock's room right of
        // the panel, one gap clear of it, so it never shortens the panel; IdeaCard.tsx)
        "--idea-room": `${Math.floor((dock ? dock.right - v.left : v.width) - (TOP + panelW + GAP))}px`,
        // (the objects' dock, the list and the picked object's window: as tall as the room under the corner's buttons, the
        // list scrolling inside when a short window can't hold both)
        "--dock-max": dockRoom,
        ...dockH,
      };
      for (const [k, val] of Object.entries(vars)) if (main.style.getPropertyValue(k) !== val) main.style.setProperty(k, val);
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(lay);
    };
    const watch = new ResizeObserver(soon);
    watch.observe(view);
    for (const s of [".show-bar", ".water-bar", ".legend-row", ".view3d-corner", ".tool-dock", ".objects-dock", ".minimap"]) {
      const el = view.querySelector(s);
      if (el) watch.observe(el);
    }
    // (Put it down's plate comes and goes over the settings without resizing the dock: laid out again when it does)
    const plate = new MutationObserver(soon);
    const dockEl = view.querySelector(".tool-dock");
    if (dockEl) plate.observe(dockEl, { childList: true, subtree: true });
    lay();
    return () => {
      watch.disconnect();
      plate.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);
}
