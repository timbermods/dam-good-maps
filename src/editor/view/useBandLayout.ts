// The top band lays itself out at any window size (Kyler, 2026-10-04: nothing overlaps at any size, not only at the
// two designed). The water row sits centred on the window when it fits between the Show row and Legend (each one
// clear gap away), else as close to the centre as it can; when it can't fit at all it moves to a second line under
// the band, and Legend's open legend and the panels start under it. Legend centres in the gap between the water row
// (or, with the row below, the Show row) and Top-down. The panels and the open legend are as tall as the room left
// above the controls under them, and scroll inside only when a window is too short for them (never at 1920×1080 or
// 2560×1440). Whole pixels throughout. The positions go to CSS variables on the editor's main area.

import { useEffect } from "preact/hooks";

/** One clear gap between neighbours in the band. */
const GAP = 16;
/** The band's top and height, and the gap under it. */
const TOP = 10;
const BAND = 36;
const UNDER = 8;
/** The panels' width and the open legend's. */
const PANEL_W = 640;
const LEGEND_W = 190;

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
      const S = show.right - v.left;
      const C = corner.left - v.left;
      const w = water.width;
      const L = legend.width;
      let left: number;
      let top = TOP;
      let centre: number;
      if (S + GAP + w + GAP + L + GAP <= C) {
        // in the band: centred on the window, else as near the centre as the Show row and Legend allow
        left = Math.min(Math.max(v.width / 2 - w / 2, S + GAP), C - GAP - L - GAP - w);
        centre = (left + w + C) / 2;
      } else {
        // a second line under the band, centred, clear of the corner's second row
        top = TOP + BAND + UNDER;
        left = Math.max(TOP, Math.min(v.width / 2 - w / 2, C - GAP - w));
        centre = (S + C) / 2;
      }
      left = Math.round(left);
      // (its open legend clear of a panel open at the left, and the button clear of Top-down)
      centre = Math.round(Math.min(Math.max(centre, TOP + PANEL_W + GAP + LEGEND_W / 2), C - 8 - L / 2));
      const below = top + BAND;
      // the controls under a panel or the legend: as tall as the room above the first of them it would meet
      // (over the minimap, room for the coordinates and the readout, a line each, one gap apart)
      const under = [
        { b: box(".tool-dock"), over: 0 },
        { b: box(".objects-dock"), over: 0 },
        { b: box(".minimap"), over: 6 + 32 + 6 + 32 },
      ].filter((u): u is { b: DOMRect; over: number } => !!u.b);
      const roomAbove = (x0: number, x1: number, from: number) => {
        let floor = v.height - TOP;
        for (const { b, over } of under) {
          const l = b.left - v.left;
          const r = b.right - v.left;
          if (r > x0 && l < x1) floor = Math.min(floor, b.top - v.top - over - TOP);
        }
        return Math.max(0, Math.floor(floor - from));
      };
      const panelTop = below + 10;
      const legendTop = below + 6;
      const drop = top === TOP ? 0 : top + BAND - (TOP + BAND);
      const vars: Record<string, string> = {
        "--water-left": `${left}px`,
        "--water-top": `${top}px`,
        "--legend-centre": `${centre}px`,
        "--legend-drop": `${drop}px`,
        "--legend-max": `${roomAbove(centre - LEGEND_W / 2, centre + LEGEND_W / 2, legendTop)}px`,
        // (the panel sits in the main area, the view's own top and left)
        "--panel-top": `${Math.round(v.top - m.top + panelTop)}px`,
        "--panel-max": `${roomAbove(TOP, TOP + PANEL_W, panelTop)}px`,
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
    lay();
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);
}
