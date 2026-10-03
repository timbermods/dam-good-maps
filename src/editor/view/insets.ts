// The camera frames the map clear of the page's controls (D345 B1; Layout 2, Kyler, 2026-10-03): the top row (the
// water row and the camera group), the Show column, the bar with the held tool's settings, and the objects menu, each
// as far as it reaches into the view, plus a small gap. The renderer keeps them for its next framing (Reset view, a
// view switched, a new map); setting them never moves the camera (D265).

import { useEffect } from "preact/hooks";
import type { FrameInsets, MapRenderer } from "../../render3d";

/** The gap kept between the framed map and a control. */
const GAP = 8;

/** How far the page's controls reach into the view from each edge, in CSS pixels. */
export function measureInsets(view: HTMLElement): FrameInsets {
  const v = view.getBoundingClientRect();
  const box = (s: string) => view.querySelector(s)?.getBoundingClientRect() ?? null;
  const reach = (n: number | null) => (n === null ? 0 : Math.max(0, Math.ceil(n + GAP)));
  const tops = [box(".water-bar"), box(".view3d-corner")].filter((b): b is DOMRect => !!b);
  const show = box(".show-column");
  const dock = box(".tool-dock");
  const objects = box(".objects-menu");
  return {
    top: tops.length ? reach(Math.max(...tops.map((b) => b.bottom)) - v.top) : 0,
    left: reach(show ? show.right - v.left : null),
    bottom: reach(dock ? v.bottom - dock.top : null),
    right: reach(objects ? v.right - objects.left : null),
  };
}

/** Keep the renderer's insets up to date as the controls change size (a tool's settings opening, the panel). */
export function useFrameInsets(renderer: { current: MapRenderer | null }, ready: boolean): void {
  useEffect(() => {
    const r = renderer.current;
    const view = r?.canvas.parentElement;
    if (!r || !view || typeof ResizeObserver === "undefined") return;
    const note = () => r.setFrameInsets(measureInsets(view));
    note();
    const watch = new ResizeObserver(note);
    watch.observe(view);
    for (const s of [".water-bar", ".view3d-corner", ".show-column", ".tool-dock", ".objects-menu"]) {
      const el = view.querySelector(s);
      if (el) watch.observe(el);
    }
    return () => watch.disconnect();
  }, [ready]);
}
