// The Select tool (PLAN §20 D184, D259, D261): a small button on the bar beside the brushes; M
// opens it too, or a Ctrl+drag with any brush out. Rectangle, Circle (dragged from its middle out, its
// radius beside the pointer), Freehand (an outline), Brush (painted in with the brush ring, at the
// brushes' size) and Wand (a click takes the ground joined to it at its level, or on water that
// river's or lake's water as the view draws it: a snapshot). Shift adds, Alt takes away (Alt+drag: a
// plain Alt+click is the game's layer pick), in every mode; Ctrl+click on the land takes its level as
// the Level number. While dragging, its size shows beside the pointer ("12 × 8 tiles", D183). What
// it does to the selection (raise or lower one level, flatten to a level, cut down or fill up to
// it, water no deeper than a depth; Delete takes what stands there or the ground, D288, D323) is exact, one undo step each; while it
// is open it is the working area (D254): the brushes and the forces work only inside it.

import { polygonMask } from "../core/features/geometry";
import { removeKindOf, type RemoveKind } from "../core/features/objects";
import type { Point } from "../core/features/schema";
import type { PointerTool } from "../render3d";
import type { TileHit } from "../render3d/pick";

export type SelectMode = "rect" | "circle" | "free" | "brush" | "wand";
/** The marking modes: shown as icons, each with a plain one-line tooltip (D323 item 6). */
export const SELECT_MODES: [SelectMode, string, string][] = [
  ["rect", "Rectangle", "drag a box"],
  ["circle", "Circle", "drag out from the middle"],
  ["free", "Freehand", "draw an outline"],
  ["brush", "Brush", "paint it in with the brush ring"],
  ["wand", "Wand", "click a level, or a whole lake or river"],
];

/** What Delete can take in the selection (D323 item 1), as the menu groups it. */
export type DeleteGroup = "everything" | "water" | "badwater" | "start" | "ruins" | "trees" | "bushes" | "rest";
export const DELETE_GROUPS: [Exclude<DeleteGroup, "everything">, string][] = [
  ["water", "Water sources"],
  ["badwater", "Badwater sources"],
  ["start", "Start"],
  ["ruins", "Ruins"],
  ["trees", "Trees"],
  ["bushes", "Bushes"],
  ["rest", "Slopes and the rest"],
];
/** The removal kinds each group takes. */
export const DELETE_KINDS: Record<Exclude<DeleteGroup, "everything">, RemoveKind[]> = {
  water: ["water"],
  badwater: ["badwater"],
  start: ["start"],
  ruins: ["ruins"],
  trees: ["trees"],
  bushes: ["bushes"],
  rest: ["slopes", "objects"],
};

/** The Delete group an object of this template is in. */
export function deleteGroupOf(template: string): Exclude<DeleteGroup, "everything"> | null {
  const kind = removeKindOf(template);
  if (!kind) return null;
  if (kind === "sources") return template === "BadwaterSource" ? "badwater" : "water";
  if (kind === "slopes" || kind === "objects") return "rest";
  return kind === "water" || kind === "badwater" || kind === "start" || kind === "ruins" || kind === "trees" || kind === "bushes" ? kind : null;
}

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

/** The tiles within `r` of tile (cx, cy) (their middles, a circle). */
export function circleTiles(cx: number, cy: number, r: number, W: number, H: number): number[] {
  const out: number[] = [];
  const R = Math.max(0.5, r);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) out.push(y * W + x);
  return out;
}

/** Wand on water (D261): the water joined to tile (x, y) (four neighbours), as the view draws it
 *  (`wet`: the view's own water tiles, clean or bad), at most `limit` tiles; the clicked tile must be
 *  water itself. */
export function waterTiles(wet: (i: number) => boolean, W: number, H: number, x: number, y: number, limit = 1 << 20): number[] {
  const start = y * W + x;
  if (!wet(start)) return [];
  const seen = new Uint8Array(W * H);
  const out = [start];
  seen[start] = 1;
  for (let q = 0; q < out.length && out.length < limit; q++) {
    const i = out[q];
    const cx = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || (j === i - 1 && cx === 0) || (j === i + 1 && cx === W - 1)) continue;
      seen[j] = 1;
      if (wet(j)) out.push(j);
    }
  }
  return out;
}

/** Max water depth (D264): where the water is deeper than `depth`, the level the ground under it
 *  rises to so the water sits that deep (its surface kept: a lake's is its spill level), grouped by
 *  that level; shallower water and dry land aren't in it. `surface` is the water's surface there. */
export function depthLevels(tiles: Iterable<number>, heights: ArrayLike<number>, water: ArrayLike<number>, surface: ArrayLike<number>, depth: number): Map<number, number[]> {
  const by = new Map<number, number[]>();
  for (const i of tiles) {
    if (!(water[i] > depth)) continue;
    const to = Math.round(surface[i] - depth);
    if (to <= heights[i]) continue;
    const list = by.get(to);
    if (list) list.push(i);
    else by.set(to, [i]);
  }
  for (const list of by.values()) list.sort((a, b) => a - b);
  return by;
}

export interface SelectHost {
  W: number;
  H: number;
  heights(): Uint8Array;
  mode(): SelectMode;
  /** The selection changed (the overlay and the row redraw). */
  changed(): void;
  /** The tiles being drawn (before they join the selection), and the words beside the pointer (a
   *  size, a radius); null when done. */
  drawing(tiles: number[] | null, words: string | null, ev: PointerEvent | null): void;
  /** Whether the view draws water on a tile (Wand, D261). */
  wet?(i: number): boolean;
  /** The brushes' size (Brush mode paints the selection with the brush ring). */
  brushSize?(): number;
  /** The Brush mode's ring under the pointer (null: none). */
  ring?(at: [number, number] | null, radius: number): void;
  /** Ctrl+click on the land while a selection is open: that tile's level, as the Level number. */
  sample?(level: number): void;
}

/** The Select tool's pointer handling (D184, D259): one drag (or click) at a time. Rectangle and
 *  Circle (from the middle outward, its radius beside the pointer) are dragged; Freehand an outline;
 *  Brush paints tiles in with the brush ring; Wand takes what a click is on: the ground joined to it
 *  at its level, or the water joined to it (D261). Shift adds and Alt takes away, in every mode. */
export function selectTool(sel: Selection, host: SelectHost, forced?: SelectMode): PointerTool & { wantsAlt: true } {
  let start: [number, number] | null = null;
  let points: [number, number][] = [];
  let how: "set" | "add" | "subtract" = "set";
  let tiles: number[] = [];
  /** Brush mode: the tiles painted so far in this drag. */
  let painted: Set<number> | null = null;
  /** Ctrl held on a click: the Level number, unless it drags. */
  let sampling: TileHit | null = null;
  const mode = () => forced ?? host.mode();
  const words = (list: readonly number[]): string | null => {
    const W = host.W;
    if (!list.length) return null;
    if (mode() === "circle" && start) {
      const last = points[points.length - 1] ?? start;
      return `radius ${Math.round(Math.hypot(last[0] - start[0], last[1] - start[1]))}`;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (const i of list) {
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return sizeWords({ w: x1 - x0 + 1, h: y1 - y0 + 1, tiles: list.length });
  };
  const show = (ev: PointerEvent) => {
    const W = host.W;
    const H = host.H;
    if (!start) return;
    const last = points[points.length - 1] ?? start;
    const m = mode();
    if (m === "brush") tiles = [...painted!];
    else if (m === "free") tiles = outlineTiles(points, W, H);
    else if (m === "circle") tiles = circleTiles(start[0], start[1], Math.hypot(last[0] - start[0], last[1] - start[1]), W, H);
    else tiles = rectTilesBetween(start, last, W, H);
    host.drawing(tiles, words(tiles), ev);
  };
  const paint = (x: number, y: number) => {
    for (const i of circleTiles(x, y, host.brushSize?.() ?? 3, host.W, host.H)) painted!.add(i);
  };
  return {
    wantsAlt: true,
    down(hit: TileHit | null, ev: PointerEvent) {
      if (ev.button !== 0 || !hit) return false;
      // Ctrl+click: the tile's level, as the Level number
      // (a brush's Ctrl+drag hands its drag here: that one selects)
      if ((ev.ctrlKey || ev.metaKey) && !forced && sel.count && host.sample) {
        sampling = hit;
        return true;
      }
      how = ev.shiftKey ? "add" : ev.altKey ? "subtract" : "set";
      if (mode() === "wand") {
        // a click on water takes that water; on land, the ground at its level joined to it
        const W = host.W;
        const onWater = host.wet?.(hit.y * W + hit.x) ?? false;
        sel.apply(onWater ? waterTiles(host.wet!, W, host.H, hit.x, hit.y) : sameLevelTiles(host.heights(), W, host.H, hit.x, hit.y), how);
        host.changed();
        start = null;
        return true;
      }
      start = [hit.x, hit.y];
      points = [start];
      if (mode() === "brush") {
        painted = new Set();
        paint(hit.x, hit.y);
      }
      show(ev);
      return true;
    },
    move(hit: TileHit | null, ev: PointerEvent) {
      if (sampling) return;
      if (mode() === "brush") host.ring?.(hit ? [hit.x + 0.5, hit.y + 0.5] : null, host.brushSize?.() ?? 3);
      if (!start || !hit) return;
      const last = points[points.length - 1];
      const m = mode();
      if (m === "free" || m === "brush") {
        if (!last || last[0] !== hit.x || last[1] !== hit.y) {
          points.push([hit.x, hit.y]);
          if (m === "brush") {
            // (along the way, so a quick drag leaves no gaps)
            const n = last ? Math.max(1, Math.ceil(Math.hypot(hit.x - last[0], hit.y - last[1]))) : 1;
            for (let k = 1; k <= n; k++) paint(Math.round(last ? last[0] + ((hit.x - last[0]) * k) / n : hit.x), Math.round(last ? last[1] + ((hit.y - last[1]) * k) / n : hit.y));
          }
        }
      } else points = [start, [hit.x, hit.y]];
      show(ev);
    },
    up() {
      if (sampling) {
        const s = sampling;
        sampling = null;
        host.sample?.(host.heights()[s.y * host.W + s.x]);
        return;
      }
      if (!start) return;
      start = null;
      painted = null;
      sel.apply(tiles, how);
      tiles = [];
      host.drawing(null, null, null);
      host.changed();
    },
    cancel() {
      start = null;
      sampling = null;
      painted = null;
      tiles = [];
      host.drawing(null, null, null);
    },
    hover(hit: TileHit | null) {
      if (mode() === "brush") host.ring?.(hit ? [hit.x + 0.5, hit.y + 0.5] : null, host.brushSize?.() ?? 3);
      else host.ring?.(null, 0);
    },
  };
}
