// Terrain brushes (live editing; ROADMAP M10's brushes, brought forward): raise, lower, flatten,
// smooth and naturalize, painted in strokes. A stroke is one operation (`brush`, doc/ops.ts): the
// brush's settings and its dabs, each a point where the brush pressed once. This one piece of code
// applies a stroke in the build (step 6, in order with the sculpt edits) and on the page while the
// player paints, so the map on screen is the map the operation replays to, byte for byte.
//
// - Everything is integers: dab centres in quarter tiles, pressure in 1/1024 of a level, the
//   falloff from a table of squared distances. The same dabs give the same levels on every machine.
// - Raise, lower and flatten gather pressure under each dab (a smooth falloff, full at the centre,
//   nothing at the brush's edge); a tile moves one whole level for each level of pressure it has
//   gathered. The middle of the brush moves a tile a whole level the first time it passes over
//   it, so a click, or a quick sweep, always shows; holding the brush still keeps pressing. The
//   edge rule: the change a stroke makes never differs by more than one level between
//   neighbouring tiles, so a brush never makes a cliff of its own; its edge slopes down to the
//   ground round it in whole-level steps.
// - Smooth and naturalize work where the brush presses, a level at a time as pressure gathers:
//   smooth moves a tile toward the mean of its neighbours; naturalize wears cliffs into slopes and
//   breaks long straight edges (noise from the stroke's seed), as weather would.
// - Shapes (the brush kit, PLAN §20 D182, D179 (3)): round, or square (by the larger of the two
//   distances, on the tile grid). A pen's pressure scales each dab's pressure (a mouse presses
//   fully).
// - Precise (D182, D193): hard edges, no falloff and vertical walls. Each dab moves every tile under
//   it to a depth of its level (1 unless the page's hold gave it more: a level more every so often
//   while the button is held); a tile takes the deepest dab that covered it. Raise and lower stop at
//   `stop` when it is set (a ceiling, a floor), never past the map's bottom or top, and leave the
//   `keep` tiles (the start, the objects standing there) as they are. The build leaves the tiles a
//   precise stroke changed out of its integrity pass, so a one-tile pit stays a pit. Smooth and
//   naturalize move each tile one step per stroke.
// - Flatten in steps (D184's Terrace): benches every `steps` levels from the flatten level, each tile
//   to its nearest bench. Smooth, make walkable (D184's Ramp): steps of 2 levels or more wear down to
//   1, and the build's derived slopes join the 1-level steps under the stroke (the game's natural
//   slopes). Flatten cuts and fills (D204): tiles above the level come down to it, tiles below rise
//   to it. Its edges are a cliff (the brush's own: a precise stroke's straight walls) or, `ramped`,
//   a rim that steps down a level a tile to the ground round it (precise too), which the derived
//   slopes join as they do make walkable's.
// - Smart Lower (D184): a Lower stroke that starts in or beside water (`channel`) carves a bed that
//   keeps flowing downhill, so the water follows the brush. Its bed starts at the lowest ground
//   round the first dab (the water's bed) and never rises along the stroke: over lower ground it
//   drops to a level below that ground, and higher ground is cut straight down to it under the
//   brush's middle (a gorge with steep walls; the rest of the brush lowers as usual).
// - Levels stay within 0–16 (the in-game editor's range; a higher imported tile is never raised).
// - Brushes shape each column's top (`layer: "top"`); the 3D stages extend them to the runs
//   below (caves), with the same dabs.

import { fmix32 } from "../../math/hash";

export type BrushTool = "raise" | "lower" | "flatten" | "smooth" | "naturalize";

export interface BrushParams {
  tool: BrushTool;
  /** Radius in tiles (0.5–24, in steps of 0.25). */
  size: number;
  /** How fast it works, 1–10: at 5 the middle of a raise moves a level every 6 dabs. */
  strength: number;
  /** Flatten: the level it flattens to. */
  level?: number;
  /** Naturalize: the seed of its noise. */
  seed?: number;
  /** Square (by the larger distance, on the tile grid); round when absent. */
  shape?: "square";
  /** Precise: hard edges, no falloff, vertical walls (see `levels`). */
  precise?: boolean;
  /** Precise raise, lower and flatten: each dab's depth in levels, 1–16 (a hold digs deeper); 1 when
   *  absent. */
  levels?: number[];
  /** Precise raise and lower: the level they stop at (a ceiling for raise, a floor for lower). */
  stop?: number;
  /** Tiles the stroke leaves as they are, as runs [y, x0, x1] (a hold never digs out from under the
   *  start or the objects standing there, D193). */
  keep?: [number, number, number][];
  /** Flatten in steps: benches every `steps` levels (2–8) from the flatten level. */
  steps?: number;
  /** Smooth, make walkable: steps of 2 levels or more wear down to 1, and the game's natural slopes
   *  join the steps under the stroke. */
  walkable?: boolean;
  /** Flatten's edges (D204): absent, a cliff (the brush's own edge); `ramped`, a rim stepping down a
   *  level a tile to the ground round it, even for a precise stroke, with the game's natural slopes
   *  on its steps. */
  edges?: "ramped";
  /** Each dab's pressure, 1–255 (a pen's); full when absent. */
  pressure?: number[];
  /** Lower: a stroke that starts in or beside water carves a bed that keeps flowing downhill. */
  channel?: boolean;
  /** The run of each column it shapes: the top (the surface). Runs below come with the 3D
   *  stages (caves and overhangs). */
  layer?: "top";
  /** Dab centres in quarter tiles: [x0, y0, x1, y1, …]; tile (x, y)'s middle is (4x + 2, 4y + 2). */
  dabs: number[];
}

export const BRUSH_TOOLS: readonly BrushTool[] = ["raise", "lower", "flatten", "smooth", "naturalize"];
export const BRUSH_MAX_LEVEL = 16;
export const BRUSH_SIZE_MIN = 0.5;
export const BRUSH_SIZE_MAX = 24;
/** Pressure for one level. */
export const LEVEL = 1024;
/** Most dabs one stroke may hold (a long stroke; the page starts a new one past it). */
export const MAX_DABS = 40_000;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Pressure a dab adds at the middle of the brush: strength 5 moves a level every 6 dabs. */
export function dabPressure(strength: number): number {
  return Math.floor((LEVEL * Math.max(1, Math.min(10, Math.round(strength)))) / 30);
}

/** The brush's radius in quarter tiles. */
function radius4(size: number): number {
  return Math.max(2, Math.min(96, Math.round(size * 4)));
}

/** Falloff by squared distance (in sixteenths of a tile²): 256 at the middle, 0 at the edge,
 *  (1 − d²/R²)² between. Integer arithmetic, exact everywhere. */
function falloffTable(r4: number): Uint16Array {
  const R2 = r4 * r4;
  const t = new Uint16Array(R2 + 1);
  for (let d2 = 0; d2 < R2; d2++) {
    const a = R2 - d2;
    t[d2] = Math.floor((a * a * 256) / (R2 * R2));
  }
  return t;
}

/** A precise brush's reach in quarter tiles: a tile is under it when its middle lies within this
 *  of the dab (size 1: the dab's own tile; size 2: the 3 × 3 round it). */
function preciseReach(size: number): number {
  return Math.max(0, Math.round(size * 4) - 2);
}

/** The tiles a stroke can change: its dabs' discs (plus the tiles next to them that smooth and
 *  naturalize read), on the map. Null for a stroke without dabs. */
export function brushBounds(p: Pick<BrushParams, "size" | "dabs" | "tool" | "precise">, W: number, H: number): Rect | null {
  if (p.dabs.length < 2) return null;
  const r = Math.ceil((p.precise ? preciseReach(p.size) + 2 : radius4(p.size)) / 4) + (p.tool === "smooth" || p.tool === "naturalize" ? 1 : 0);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k + 1 < p.dabs.length; k += 2) {
    const x = Math.floor(p.dabs[k] / 4);
    const y = Math.floor(p.dabs[k + 1] / 4);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const out = { x0: Math.max(0, x0 - r), y0: Math.max(0, y0 - r), x1: Math.min(W - 1, x1 + r), y1: Math.min(H - 1, y1 + r) };
  return out.x0 <= out.x1 && out.y0 <= out.y1 ? out : null;
}

/** Mark in `out` the tiles a stroke presses on (its dabs' discs or squares, as `add` reaches). */
export function markBrushTiles(p: Pick<BrushParams, "size" | "dabs" | "shape" | "precise">, W: number, H: number, out: Uint8Array): void {
  const r4 = p.precise ? preciseReach(p.size) : radius4(p.size);
  const R2 = p.precise ? r4 * r4 : r4 * r4 - 1;
  const r = Math.ceil((r4 + 2) / 4);
  for (let k = 0; k + 1 < p.dabs.length; k += 2) {
    const cx = p.dabs[k];
    const cy = p.dabs[k + 1];
    const tx = Math.floor(cx / 4);
    const ty = Math.floor(cy / 4);
    for (let y = Math.max(0, ty - r); y <= Math.min(H - 1, ty + r); y++)
      for (let x = Math.max(0, tx - r); x <= Math.min(W - 1, tx + r); x++) {
        const dx = 4 * x + 2 - cx;
        const dy = 4 * y + 2 - cy;
        const d2 = p.shape === "square" ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy;
        if (d2 <= R2) out[y * W + x] = 1;
      }
  }
}

/** Whether a stroke reads its tiles' neighbours (smooth, naturalize): a rebuild that touches its
 *  tiles applies it over all of them. */
export function brushReadsNeighbours(p: Pick<BrushParams, "tool">): boolean {
  return p.tool === "smooth" || p.tool === "naturalize";
}

/** A stroke being applied to a heightfield, dab by dab. `heights` is changed in place; `write(i)`
 *  says which tiles it may change (the build's region, a column the brush leaves alone). The
 *  result after all dabs does not depend on how they were handed in. */
export class BrushStroke {
  readonly W: number;
  readonly H: number;
  private readonly heights: Uint8Array;
  private readonly settings: Omit<BrushParams, "dabs">;
  private write: (i: number) => boolean;
  private readonly r4: number;
  private readonly table: Uint16Array;
  private readonly rate: number;
  /** Pressure gathered per tile, and the heights before the stroke (raise, lower, flatten). */
  private readonly acc: Int32Array;
  private readonly before: Uint8Array | null;
  /** Level steps each tile has had (naturalize's noise). */
  private readonly steps: Uint16Array | null;
  /** Smart Lower: the bed so far along the stroke, and each tile's deepest cut (255: none). */
  private bed = -1;
  private readonly cap: Uint8Array | null;
  /** Precise raise, lower and flatten: each tile's depth in levels (the deepest dab over it). */
  private readonly depth: Uint8Array | null;
  /** Tiles the middle of the brush has passed over (the first pass moves them a whole level). */
  private readonly swept: Uint8Array;
  private dabCount = 0;
  /** The tiles the stroke has pressed on so far. */
  private box: Rect | null = null;
  /** Work buffers for the edge rule. */
  private moved: Int16Array | null = null;

  constructor(settings: Omit<BrushParams, "dabs">, heights: Uint8Array, W: number, H: number, write: (i: number) => boolean = () => true) {
    this.W = W;
    this.H = H;
    this.heights = heights;
    this.settings = settings;
    this.write = write;
    this.r4 = radius4(settings.size);
    this.table = falloffTable(this.r4);
    this.rate = dabPressure(settings.strength);
    this.acc = new Int32Array(W * H);
    const pointwise = settings.tool === "raise" || settings.tool === "lower" || settings.tool === "flatten";
    this.before = pointwise ? heights.slice() : null;
    this.steps = settings.tool === "naturalize" ? new Uint16Array(W * H) : null;
    this.cap = settings.channel && settings.tool === "lower" ? new Uint8Array(W * H).fill(255) : null;
    this.depth = settings.precise && pointwise ? new Uint8Array(W * H) : null;
    // the tiles the stroke leaves alone
    if (settings.keep?.length) {
      const kept = new Uint8Array(W * H);
      for (const [y, a, b] of settings.keep) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) kept[y * W + x] = 1;
      const inner = this.write;
      this.write = (i) => !kept[i] && inner(i);
    }
    this.swept = new Uint8Array(W * H);
  }

  /** Dabs so far. */
  get dabs(): number {
    return this.dabCount;
  }

  /** The tiles pressed so far (null before the first dab). */
  get bounds(): Rect | null {
    return this.box;
  }

  /** Apply more dabs (quarter-tile pairs), with their pressures (1–255) when a pen gave them, and
   *  precise's levels. Returns the rectangle whose tiles may have changed. */
  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>, levels?: ArrayLike<number>): Rect | null {
    const { W, H, r4, table } = this;
    const R2 = r4 * r4;
    const square = this.settings.shape === "square";
    const precise = this.settings.precise === true;
    const reach = preciseReach(this.settings.size);
    const r = Math.ceil((precise ? reach + 2 : r4) / 4);
    const sequential = !this.before;
    let touched: Rect | null = null;
    for (let k = 0; k + 1 < dabs.length; k += 2) {
      const cx = dabs[k];
      const cy = dabs[k + 1];
      const tx = Math.floor(cx / 4);
      const ty = Math.floor(cy / 4);
      const rate = pressure ? Math.floor((this.rate * Math.max(1, Math.min(255, pressure[k >> 1]))) / 255) : this.rate;
      this.dabCount++;
      // smart Lower: the bed at this dab, never above the one before it
      if (this.cap) this.bed = this.bedAt(tx, ty);
      const x0 = Math.max(0, tx - r);
      const x1 = Math.min(W - 1, tx + r);
      const y0 = Math.max(0, ty - r);
      const y1 = Math.min(H - 1, ty + r);
      if (x0 > x1 || y0 > y1) continue;
      for (let y = y0; y <= y1; y++) {
        const dy = 4 * y + 2 - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = 4 * x + 2 - cx;
          // round: the distance; square: the larger of the two, on the tile grid
          const d2 = square ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy;
          const i = y * W + x;
          if (precise) {
            // hard edges, no falloff
            if (d2 > reach * reach) continue;
            if (this.depth) {
              // raise, lower, flatten: the tile takes the deepest dab over it
              const lv = levels ? Math.max(1, Math.min(BRUSH_MAX_LEVEL, levels[k >> 1] | 0)) : 1;
              if (lv > this.depth[i]) this.depth[i] = lv;
              continue;
            }
            // smooth and naturalize: one step per tile per stroke
            if (this.swept[i]) continue;
            this.swept[i] = 1;
            this.acc[i] += LEVEL;
            if (sequential) this.stepTile(i);
            continue;
          }
          if (d2 >= R2) continue;
          const w = table[d2];
          if (!w) continue;
          // the middle of the brush moves a tile a level the first time it passes over it: a
          // click, or a quick sweep, always shows
          let add: number;
          if (w >= 128 && !this.swept[i]) {
            this.swept[i] = 1;
            add = Math.max(LEVEL, Math.floor((rate * w) / 256));
          } else add = Math.floor((rate * w) / 256);
          // the brush's middle cuts down to the bed
          if (this.cap && w >= 128 && this.bed < this.cap[i]) this.cap[i] = this.bed;
          if (!add) continue;
          this.acc[i] += add;
          if (sequential && this.acc[i] >= LEVEL) this.stepTile(i);
        }
      }
      touched = grow(touched, { x0, y0, x1, y1 });
      this.box = grow(this.box, { x0, y0, x1, y1 });
    }
    if (!touched) return null;
    if (sequential) return pad(touched, 1, W, H);
    // raise, lower and flatten: the whole stroke's change again, with its edge rule
    this.applyPointwise();
    return this.box;
  }

  /** Smart Lower's bed at a dab on tile (tx, ty): the first dab, the lowest ground round it (the
   *  water's bed beside it); after that, a level below the ground where that is lower, never above
   *  the bed before. From the ground before the stroke, so the same dabs give the same bed. */
  private bedAt(tx: number, ty: number): number {
    const { W, H } = this;
    const before = this.before!;
    const x = Math.max(0, Math.min(W - 1, tx));
    const y = Math.max(0, Math.min(H - 1, ty));
    if (this.bed < 0) {
      let lo = before[y * W + x];
      for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) lo = Math.min(lo, before[yy * W + xx]);
      return lo;
    }
    return Math.min(this.bed, Math.max(0, before[y * W + x] - 1));
  }

  /** Smooth and naturalize: a tile moves a level for each level of pressure it gathers, toward
   *  what its neighbours are now. */
  private stepTile(i: number): void {
    const { W, H, heights } = this;
    while (this.acc[i] >= LEVEL) {
      this.acc[i] -= LEVEL;
      if (!this.write(i)) continue;
      const x = i % W;
      const y = (i - x) / W;
      const h = heights[i];
      if (this.settings.tool === "smooth") {
        if (this.settings.walkable) {
          // make walkable: a step of 2 levels or more wears down to 1 first
          let lo = h;
          let hi = h;
          if (x > 0) ({ lo, hi } = mm(heights[i - 1], lo, hi));
          if (x < W - 1) ({ lo, hi } = mm(heights[i + 1], lo, hi));
          if (y > 0) ({ lo, hi } = mm(heights[i - W], lo, hi));
          if (y < H - 1) ({ lo, hi } = mm(heights[i + W], lo, hi));
          if (h - lo >= 2) {
            heights[i] = h - 1;
            continue;
          }
          if (hi - h >= 2 && h < BRUSH_MAX_LEVEL) {
            heights[i] = h + 1;
            continue;
          }
        }
        let sum = 0;
        let n = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
            sum += heights[yy * W + xx];
            n++;
          }
        // the neighbourhood's mean, rounded half up
        const target = Math.floor((2 * sum + n) / (2 * n));
        if (target > h && h < BRUSH_MAX_LEVEL) heights[i] = h + 1;
        else if (target < h) heights[i] = h - 1;
        continue;
      }
      // naturalize: wear cliffs into slopes, fill their feet, and wiggle long straight edges
      let lo = h;
      let hi = h;
      if (x > 0) ({ lo, hi } = mm(heights[i - 1], lo, hi));
      if (x < W - 1) ({ lo, hi } = mm(heights[i + 1], lo, hi));
      if (y > 0) ({ lo, hi } = mm(heights[i - W], lo, hi));
      if (y < H - 1) ({ lo, hi } = mm(heights[i + W], lo, hi));
      const step = this.steps![i]++;
      const n = fmix32((this.settings.seed ?? 0) ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(step + 1, 0x85ebca77)) & 1023;
      if (h - lo >= 2) heights[i] = h - 1;
      else if (hi - h >= 2 && h < BRUSH_MAX_LEVEL) heights[i] = h + 1;
      else if (h > lo && n < 200) heights[i] = h - 1;
      else if (h < hi && n >= 1024 - 200 && h < BRUSH_MAX_LEVEL) heights[i] = h + 1;
    }
  }

  /** Raise, lower, flatten: each tile's whole levels of pressure, limited by the edge rule (the
   *  change differs by at most one level between neighbours), applied to its height before the
   *  stroke. */
  private applyPointwise(): void {
    const b = this.box!;
    const { W, acc, heights } = this;
    const before = this.before!;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const n = bw * bh;
    if (!this.moved || this.moved.length < n) this.moved = new Int16Array(Math.max(n, 256));
    const m = this.moved;
    const depth = this.depth;
    for (let y = 0; y < bh; y++) {
      const row = (b.y0 + y) * W + b.x0;
      for (let x = 0; x < bw; x++) m[y * bw + x] = depth ? depth[row + x] : Math.min(BRUSH_MAX_LEVEL, Math.floor(acc[row + x] / LEVEL));
    }
    // the edge rule: a 4-neighbour distance transform from the ground round the stroke (0 outside);
    // precise strokes have vertical walls, unless a ramped flatten steps its rim down
    if (!depth || this.settings.edges === "ramped") this.edgeRule(m, bw, bh);
    const { tool, level, stop, steps } = this.settings;
    const L = Math.max(0, Math.min(BRUSH_MAX_LEVEL, level ?? 0));
    const ceil = Math.min(BRUSH_MAX_LEVEL, stop ?? BRUSH_MAX_LEVEL);
    const floor = Math.max(0, stop ?? 0);
    for (let y = 0; y < bh; y++) {
      const row = (b.y0 + y) * W + b.x0;
      for (let x = 0; x < bw; x++) {
        const i = row + x;
        if (!this.write(i)) continue;
        const h0 = before[i];
        const d = m[y * bw + x];
        let h = h0;
        if (tool === "raise") h = h0 >= ceil ? h0 : Math.min(ceil, h0 + d);
        else if (tool === "lower") h = h0 <= floor ? h0 : Math.max(floor, Math.min(h0 - d, this.cap ? this.cap[i] : 255));
        else {
          // flatten, in steps: toward the nearest bench
          const T = steps ? Math.max(0, Math.min(BRUSH_MAX_LEVEL, L + steps * Math.round((h0 - L) / steps))) : L;
          h = h0 > T ? Math.max(T, h0 - d) : Math.min(T, h0 + d);
        }
        heights[i] = h;
      }
    }
  }

  /** The edge rule on `m`: a 4-neighbour distance transform from the ground round the stroke. */
  private edgeRule(m: Int16Array, bw: number, bh: number): void {
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const k = y * bw + x;
        let v = m[k];
        const left = x > 0 ? m[k - 1] : 0;
        const up = y > 0 ? m[k - bw] : 0;
        if (left + 1 < v) v = left + 1;
        if (up + 1 < v) v = up + 1;
        m[k] = v;
      }
    for (let y = bh - 1; y >= 0; y--)
      for (let x = bw - 1; x >= 0; x--) {
        const k = y * bw + x;
        let v = m[k];
        const right = x < bw - 1 ? m[k + 1] : 0;
        const down = y < bh - 1 ? m[k + bw] : 0;
        if (right + 1 < v) v = right + 1;
        if (down + 1 < v) v = down + 1;
        m[k] = v;
      }
  }
}

function mm(v: number, lo: number, hi: number): { lo: number; hi: number } {
  return { lo: v < lo ? v : lo, hi: v > hi ? v : hi };
}

function grow(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function pad(r: Rect, n: number, W: number, H: number): Rect {
  return { x0: Math.max(0, r.x0 - n), y0: Math.max(0, r.y0 - n), x1: Math.min(W - 1, r.x1 + n), y1: Math.min(H - 1, r.y1 + n) };
}

/** Apply a whole stroke to `heights` (the build's step 6). */
export function applyBrush(p: BrushParams, heights: Uint8Array, W: number, H: number, write: (i: number) => boolean = () => true): void {
  const { dabs, pressure, levels, ...settings } = p;
  new BrushStroke(settings, heights, W, H, write).add(dabs, pressure, levels);
}

/** Why a stroke's parameters are not a stroke this map can take (empty when they are). */
export function brushProblems(p: BrushParams, W: number, H: number): string[] {
  if (!BRUSH_TOOLS.includes(p.tool)) return [`there is no ${String(p.tool)} brush`];
  if (!(p.size >= BRUSH_SIZE_MIN && p.size <= BRUSH_SIZE_MAX)) return [`a brush is ${BRUSH_SIZE_MIN} to ${BRUSH_SIZE_MAX} tiles across its radius`];
  if (!(p.strength >= 1 && p.strength <= 10)) return ["a brush's strength is 1 to 10"];
  if (p.tool === "flatten" && !(Number.isInteger(p.level) && p.level! >= 0 && p.level! <= BRUSH_MAX_LEVEL)) return [`flatten needs a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.seed !== undefined && !Number.isInteger(p.seed)) return ["a brush's seed is a whole number"];
  if (p.dabs.length < 2 || p.dabs.length % 2) return ["a stroke needs its dabs, as pairs of numbers"];
  if (p.dabs.length > 2 * MAX_DABS) return [`a stroke holds at most ${MAX_DABS} dabs`];
  if (p.shape !== undefined && p.shape !== "square") return ["a brush is round or square"];
  if (p.pressure !== undefined && (p.pressure.length !== p.dabs.length / 2 || !p.pressure.every((v) => Number.isInteger(v) && v >= 1 && v <= 255))) return ["a stroke's pressures are one whole number from 1 to 255 for each dab"];
  if (p.levels !== undefined && (!p.precise || p.levels.length !== p.dabs.length / 2 || !p.levels.every((v) => Number.isInteger(v) && v >= 1 && v <= BRUSH_MAX_LEVEL))) return [`a precise stroke's levels are one whole number from 1 to ${BRUSH_MAX_LEVEL} for each dab`];
  if (p.stop !== undefined && (!Number.isInteger(p.stop) || p.stop < 0 || p.stop > BRUSH_MAX_LEVEL)) return [`a stroke stops at a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.steps !== undefined && (p.tool !== "flatten" || !Number.isInteger(p.steps) || p.steps < 2 || p.steps > 8)) return ["flatten's steps are 2 to 8 levels apart"];
  if (p.walkable !== undefined && (p.tool !== "smooth" || typeof p.walkable !== "boolean")) return ["only smooth makes the ground walkable"];
  if (p.edges !== undefined && (p.tool !== "flatten" || p.edges !== "ramped")) return ["only flatten has ramped edges"];
  if (p.keep !== undefined && !(Array.isArray(p.keep) && p.keep.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => Number.isInteger(v)) && r[1] <= r[2]))) return ["a stroke's kept tiles are runs [y, x0, x1]"];
  for (let k = 0; k < p.dabs.length; k += 2) {
    const x = p.dabs[k];
    const y = p.dabs[k + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 4 * W || y >= 4 * H) return [`a dab at (${x / 4}, ${y / 4}) is outside the ${W}×${H} map`];
  }
  return [];
}
