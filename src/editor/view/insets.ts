// The camera frames the map clear of the page's controls (D345 B1; Layout 2, Kyler, 2026-10-03): the top row (the
// water row and the camera group), the Show column and the bottom-left group (its minimap the widest), the bar with
// the held tool's settings, and the objects list with a picked object's window, each as far as it reaches into the
// view, plus a small gap. The renderer keeps them for its next framing (Reset view, a
// map opened in a mode, a new map; the Top-down toggle keeps the view, D492); setting them never moves the camera (D265).

import { useEffect } from "preact/hooks";
import type { FrameInsets, MapRenderer } from "../../render3d";

/** The gap kept between the framed map and a control. */
const GAP = 8;

/** How far the page's controls reach into the view from each edge, in CSS pixels. */
export function measureInsets(view: HTMLElement): FrameInsets {
  if (view.closest(".editor[data-phone]")) return phoneInsets(view);
  const v = view.getBoundingClientRect();
  const box = (s: string) => view.querySelector(s)?.getBoundingClientRect() ?? null;
  const reach = (n: number | null) => (n === null ? 0 : Math.max(0, Math.ceil(n + GAP)));
  const tops = [box(".water-bar"), box(".view3d-corner"), box(".show-bar")].filter((b): b is DOMRect => !!b);
  const lefts = [box(".minimap")].filter((b): b is DOMRect => !!b);
  const dock = box(".tool-dock");
  const rights = [box(".objects-dock")].filter((b): b is DOMRect => !!b);
  return {
    top: tops.length ? reach(Math.max(...tops.map((b) => b.bottom)) - v.top) : 0,
    left: reach(lefts.length ? Math.max(...lefts.map((b) => b.right)) - v.left : null),
    bottom: reach(dock ? v.bottom - dock.top : null),
    right: reach(rights.length ? v.right - Math.min(...rights.map((b) => b.left)) : null),
  };
}

/** A phone's layout (#1074): each piece over the view by the edge it stands on: the tool row and its sheet at the foot,
 *  the rail at the left, the panel at the right, Show's button at its corner. A piece not shown takes no room. */
function phoneInsets(view: HTMLElement): FrameInsets {
  const v = view.getBoundingClientRect();
  const out = { top: 0, left: 0, bottom: 0, right: 0 };
  const reach = (n: number) => Math.max(0, Math.ceil(n + GAP));
  for (const el of view.querySelectorAll<HTMLElement>(".tool-dock > *, .objects-dock > *, .phone-show-button")) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue;
    // (Show's button: at the top it keeps the map under it; at the foot's corner, on its side, it takes no room of its own)
    if (el.classList.contains("phone-show-button")) {
      if (b.top <= v.top + 16) out.top = Math.max(out.top, reach(b.bottom - v.top));
      continue;
    }
    if (b.bottom >= v.bottom - 1 && b.width >= v.width / 2) out.bottom = Math.max(out.bottom, reach(v.bottom - b.top));
    else if (b.left <= v.left + 1 && b.height >= v.height / 2) out.left = Math.max(out.left, reach(b.right - v.left));
    else if (b.right >= v.right - 1) out.right = Math.max(out.right, reach(v.right - b.left));
    else if (b.bottom >= v.bottom - 1) out.bottom = Math.max(out.bottom, reach(v.bottom - b.top));
  }
  return out;
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
    for (const s of [".water-bar", ".view3d-corner", ".show-bar", ".minimap", ".tool-dock", ".objects-dock"]) {
      const el = view.querySelector(s);
      if (el) watch.observe(el);
    }
    return () => watch.disconnect();
  }, [ready]);
}
