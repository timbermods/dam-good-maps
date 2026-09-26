// The Select tool (PLAN §20 D184): no permanent slot; M opens it, or a Ctrl+drag with any brush out.
// A rectangle, a freehand outline, or the same level (a click takes the ground at its level joined
// to it); Shift adds, Alt subtracts (Alt+drag: a plain Alt+click is the game's layer pick). While
// dragging, its size shows beside the pointer ("12 × 8 tiles", D183). What it does to the selection
// (raise or lower by some levels, flatten or set to a level, dig out, clear trees and objects) is
// one operation each, one undo step.

import { polygonMask } from "../core/features/geometry";
import type { Point } from "../core/features/schema";
import type { PointerTool } from "../render3d";
import type { TileHit } from "../render3d/pick";

export type SelectMode = "rect" | "free" | "level";
export const SELECT_MODES: [SelectMode, string][] = [
  ["rect", "Rectangle"],
  ["free", "Freehand"],
  ["level", "Same level"],
];

/** The selected tiles, and their extent. */
export class Selection {
  readonly mask: Uint8Array;
  count = 0;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.mask = new Uint8Array(W * H);
  }

  clear(): void {
    this.mask.fill(0);
    this.count = 0;
  }

  /** Take `tiles` in (set: the selection becomes them), add them, or take them out. */
  apply(tiles: ArrayLike<number>, how: "set" | "add" | "subtract"): void {
    if (how === "set") this.mask.fill(0);
    const v = how === "subtract" ? 0 : 1;
    for (let k = 0; k < tiles.length; k++) this.mask[tiles[k]] = v;
    let n = 0;
    for (let i = 0; i < this.mask.length; i++) n += this.mask[i];
    this.count = n;
  }

  tiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) out.push(i);
    return out;
  }

  /** The selection's extent in tiles, and how many it holds. */
  size(): { w: number; h: number; tiles: number } | null {
    if (!this.count) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < this.mask.length; i++) {
      if (!this.mask[i]) continue;
      const x = i % this.W;
      const y = (i - x) / this.W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { w: x1 - x0 + 1, h: y1 - y0 + 1, tiles: this.count };
  }
}

/** A selection's size in words: "12 × 8 tiles", and how many when it is not a full rectangle. */
export function sizeWords(z: { w: number; h: number; tiles: number }): string {
  return z.tiles === z.w * z.h ? `${z.w} × ${z.h} tiles` : `${z.w} × ${z.h} tiles (${z.tiles})`;
}

/** The tiles of the rectangle between two tiles. */
export function rectTilesBetween(a: [number, number], b: [number, number], W: number, H: number): number[] {
  const x0 = Math.max(0, Math.min(a[0], b[0]));
  const x1 = Math.min(W - 1, Math.max(a[0], b[0]));
  const y0 = Math.max(0, Math.min(a[1], b[1]));
  const y1 = Math.min(H - 1, Math.max(a[1], b[1]));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * W + x);
  return out;
}

/** The tiles inside a freehand outline. */
export function outlineTiles(points: readonly [number, number][], W: number, H: number): number[] {
  if (points.length < 3) return points.map(([x, y]) => y * W + x);
  const mask = polygonMask(points.map(([x, y]) => [x + 0.5, y + 0.5] as Point), W, H);
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  for (const [x, y] of points) if (x >= 0 && y >= 0 && x < W && y < H && !mask[y * W + x]) out.push(y * W + x);
  return out;
}

/** The ground at the clicked tile's level joined to it (four neighbours), at most `limit` tiles. */
export function sameLevelTiles(heights: Uint8Array, W: number, H: number, x: number, y: number, limit = 65536): number[] {
  const start = y * W + x;
  const level = heights[start];
  const seen = new Uint8Array(W * H);
  const out = [start];
  seen[start] = 1;
  for (let q = 0; q < out.length && out.length < limit; q++) {
    const i = out[q];
    const cx = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || (j === i - 1 && cx === 0) || (j === i + 1 && cx === W - 1)) continue;
      seen[j] = 1;
      if (heights[j] === level) out.push(j);
    }
  }
  return out;
}

export interface SelectHost {
  W: number;
  H: number;
  heights(): Uint8Array;
  mode(): SelectMode;
  /** The selection changed (the overlay and the row redraw). */
  changed(): void;
  /** The tiles being drawn (before they join the selection), and the size words beside the
   *  pointer; null when done. */
  drawing(tiles: number[] | null, words: string | null, ev: PointerEvent | null): void;
}

/** The Select tool's pointer handling: one drag (or click) at a time. */
export function selectTool(sel: Selection, host: SelectHost, forced?: SelectMode): PointerTool & { wantsAlt: true } {
  let start: [number, number] | null = null;
  let points: [number, number][] = [];
  let how: "set" | "add" | "subtract" = "set";
  let tiles: number[] = [];
  const mode = () => forced ?? host.mode();
  const show = (ev: PointerEvent) => {
    const W = host.W;
    const H = host.H;
    if (!start) return;
    tiles = mode() === "free" ? outlineTiles(points, W, H) : rectTilesBetween(start, points[points.length - 1] ?? start, W, H);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    host.drawing(tiles, tiles.length ? sizeWords({ w: x1 - x0 + 1, h: y1 - y0 + 1, tiles: tiles.length }) : null, ev);
  };
  return {
    wantsAlt: true,
    down(hit: TileHit | null, ev: PointerEvent) {
      if (ev.button !== 0 || !hit) return false;
      how = ev.shiftKey ? "add" : ev.altKey ? "subtract" : "set";
      if (mode() === "level") {
        sel.apply(sameLevelTiles(host.heights(), host.W, host.H, hit.x, hit.y), how);
        host.changed();
        start = null;
        return true;
      }
      start = [hit.x, hit.y];
      points = [start];
      show(ev);
      return true;
    },
    move(hit: TileHit | null, ev: PointerEvent) {
      if (!start || !hit) return;
      const last = points[points.length - 1];
      if (mode() === "free") {
        if (!last || last[0] !== hit.x || last[1] !== hit.y) points.push([hit.x, hit.y]);
      } else points = [start, [hit.x, hit.y]];
      show(ev);
    },
    up() {
      if (!start) return;
      start = null;
      sel.apply(tiles, how);
      tiles = [];
      host.drawing(null, null, null);
      host.changed();
    },
    cancel() {
      start = null;
      tiles = [];
      host.drawing(null, null, null);
    },
  };
}
