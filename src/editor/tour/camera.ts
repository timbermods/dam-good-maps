// The tour's camera (D377): it frames the part of the map the tour works on, clear of the page's controls, so the
// gestures are big enough to read; the player's own view is put back when the tour ends.

import type { MapRenderer, ViewState } from "../../render3d";
import { HILL_REACH, RIVER_REACH, SHELF_REACH, type BrushSpots, type ForceSpots } from "./spots";

/** A round part of the map the tour works on: its middle (tiles) and how far it reaches. */
export type Mark = [x: number, y: number, reach: number];

/** What the forces work on: the river's course and the crater. */
export function forceMarks(f: ForceSpots): Mark[] {
  return [...f.river.map((t): Mark => [t.x, t.y, RIVER_REACH]), [f.crater.x, f.crater.y, f.craterRadius]];
}

/** What the brushes work on: the hill and the shelf. */
export function brushMarks(b: BrushSpots): Mark[] {
  return [
    [b.hill.x, b.hill.y, HILL_REACH + 1],
    [b.shelf.x, b.shelf.y, SHELF_REACH + 1],
  ];
}

/** The view that fits the marks in the part of the map the controls leave, or null when the map isn't framed
 *  yet. The camera is left where it was. */
export function framingView(r: MapRenderer, marks: readonly Mark[], tilt?: number): ViewState | null {
  const size = r.size;
  if (!size) return null;
  const was = r.getView();
  const canvas = r.canvas.getBoundingClientRect();
  const ins = r.frameInsets;
  const free = { left: ins.left + 16, right: canvas.width - ins.right - 16, top: ins.top + 10, bottom: canvas.height - ins.bottom - 8 };
  if (free.right - free.left < 100 || free.bottom - free.top < 100) return null;
  // (every mark as the corners of a box round it as far as it reaches)
  const corners: [number, number, number][] = [];
  for (const [x, y, reach] of marks)
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = Math.max(0, Math.min(size.W - 1, x + dx * reach));
      const cy = Math.max(0, Math.min(size.H - 1, y + dy * reach));
      corners.push([cx + 0.5, r.heightAt(Math.floor(cx), Math.floor(cy)), -(cy + 0.5)]);
    }
  const box = () => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, h, z] of corners) {
      const p = r.project(x, h, z);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  };
  // (the target starts on the middle of the box, then the distance and the target settle it into the free part)
  const mean = corners.reduce((n, c) => n + c[1], 0) / corners.length;
  const mid = corners.reduce((n, c) => [n[0] + c[0] / corners.length, n[1] + c[2] / corners.length], [0, 0]);
  // (a tilt: lower than the player's own, to read the land's heights; none from straight above)
  r.setView({ target: [mid[0], mean, mid[1]], ...(tilt !== undefined && was.mode === "orbit" ? { pitch: Math.min(was.pitch, tilt) } : {}) });
  // (never closer than a fifth of the map's span: the land under a brush stays in view of its surroundings)
  const near = Math.max(size.W, size.H) * 0.3;
  const far = Math.max(was.distance, near);
  for (let pass = 0; pass < 6; pass++) {
    const b = box();
    const s = Math.max((b.x1 - b.x0) / (free.right - free.left), (b.y1 - b.y0) / (free.bottom - free.top));
    if (Number.isFinite(s) && s > 0) r.setView({ distance: Math.max(near, Math.min(far, r.getView().distance * s)) });
    const c = box();
    const at = r.pickAtLevel(canvas.left + (c.x0 + c.x1) / 2, canvas.top + (c.y0 + c.y1) / 2, mean);
    const want = r.pickAtLevel(canvas.left + (free.left + free.right) / 2, canvas.top + (free.top + free.bottom) / 2, mean);
    if (!at || !want) break;
    const v = r.getView();
    r.setView({ target: [v.target[0] + at.point[0] - want.point[0], v.target[1], v.target[2] + at.point[2] - want.point[2]] });
  }
  const framed = r.getView();
  r.setView(was);
  return framed;
}
