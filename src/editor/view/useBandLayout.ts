// The top band lays itself out at any window size (Kyler, 2026-10-04: nothing overlaps at any size, not only at the
// two designed). The water row sits centred on the window when it fits between the Show row and Legend (each one
// clear gap away), else as close to the centre as it can; when it can't fit at all it moves to a second line under
// the band, and Legend's open legend and the panels start under it. Legend centres in the gap between the water row
// and Top-down; with the water row below, it joins the Show row as its last toggle, one toggle gap after Badwater
// (Kyler, 2026-10-04), and its open legend hangs under the second line, clear of a panel open at the left. The panels and the open legend are as tall as the room left
// above the controls under them, and scroll inside only when a window is too short for them (never at 1920×1080 or
// 2560×1440). Whole pixels throughout. The positions go to CSS variables on the editor's main area.

import { useEffect } from "preact/hooks";

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
      let legendLeft: number;
      let panelLeft: number;
      // (the furthest right Legend's centre goes: the button one gap clear of Top-down, and the button and its open
      // legend 8px clear of the corner, whose second row hangs under the band beside the legend)
      const most = Math.min(C - GAP - L / 2, C - 8 - Math.max(L, LEGEND_W) / 2);
      if (S + GAP + w + GAP + L / 2 <= most) {
        // in the band: centred on the window, else as near the centre as the Show row and Legend allow; Legend centred
        // between the water row and Top-down, its open legend centred under it (clear of a panel open at the left, the
        // button clear of Top-down)
        left = Math.min(Math.max(v.width / 2 - w / 2, S + GAP), most - L / 2 - GAP - w);
        const centre = Math.min(Math.max((left + w + C) / 2, TOP + PANEL_W + GAP + LEGEND_W / 2), most);
        legendLeft = centre - L / 2;
        panelLeft = centre - LEGEND_W / 2;
      } else {
        // a second line under the band, centred, clear of the corner's second row; Legend the Show row's last toggle,
        // its open legend under the second line, from its left edge, clear of a panel open at the left
        top = TOP + BAND + UNDER;
        left = Math.max(TOP, Math.min(v.width / 2 - w / 2, C - GAP - w));
        legendLeft = S + TOGGLE_GAP;
        panelLeft = Math.max(legendLeft, TOP + PANEL_W + GAP);
      }
      left = Math.round(left);
      // (one line: whole pixels; on the Show row it keeps the toggles' own spacing exactly)
      // (the open legend centred under the button where it now is, whatever its words' width)
      if (top === TOP) {
        legendLeft = Math.round(legendLeft);
        panelLeft = legendLeft + L / 2 - LEGEND_W / 2;
      }
      panelLeft = Math.round(panelLeft);
      const below = top + BAND;
      // the controls under a panel or the legend: as tall as the room above the first of them it would meet
      // (over the minimap, room for the coordinates and the readout, one gap apart: the readout a line, or two where
      // it is narrow, kept left of the bar's settings)
      // (the dock's pieces each by its own box: the first run's hints sit centred above the settings, not across them)
      const dock = box(".tool-dock");
      const readoutW = dock ? Math.min(500, dock.left - v.left - 22 - TOP) : 500;
      const under = [
        ...[".tool-dock > .tool-settings", ".tool-dock > .tool-bar", ".tool-dock > .first-run", ".tool-dock > .working-note", ".tool-dock > .dock-notes"].map((s) => ({ b: box(s), over: 0 })),
        { b: box(".objects-dock"), over: 0 },
        { b: box(".minimap"), over: 6 + 32 + 6 + (readoutW < 300 ? 52 : 32) },
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
        "--legend-left": `${legendLeft}px`,
        "--legend-panel-left": `${panelLeft}px`,
        "--legend-drop": `${drop}px`,
        "--legend-max": `${roomAbove(panelLeft, panelLeft + LEGEND_W, legendTop)}px`,
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
