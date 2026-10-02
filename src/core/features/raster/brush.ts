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
//   Naturalize weathers all but the start's pad and its `keep` runs (D368 (8), `weathers`).
//   Since D399 (`weathering: 2`) Naturalize weathers like nature (weather.ts): the stroke gathers
//   pressure as Raise does, and its land is worked out again from the land before it after every
//   dab: edges wander along noise fixed to the map, cliffs slump into stepped slopes, the downhill
//   order kept. A stroke saved before it replays with the rule it was painted with.
// - Shapes (the brush kit, PLAN §20 D182, D179 (3)): round, or square (by the larger of the two
//   distances, on the tile grid). A pen's pressure scales each dab's pressure (a mouse presses
//   fully).
// - A target (D322, item 37: the game editor's own way): Raise, Lower and Flatten act exactly, with
//   the brush's footprint and hard edges (no falloff, no edge rule, vertical walls). Raise lifts every
//   tile under it that is below `target` to it and leaves the rest (a relative raise); Lower cuts every
//   tile above it down to it (a relative lower); Flatten sets every tile to it, higher or lower (an
//   absolute height; with `steps`, each to its nearest bench from it). Holding does nothing more. The
//   build leaves the tiles it changed out of its integrity pass, as for a precise stroke. Without a
//   target, Raise and Lower sculpt softly ("Free", below); Smooth and Naturalize are always soft.
// - Which tiles (D322, item 2): `mode` "ground" changes only the tiles that were dry when the stroke
//   began, and never lowers one beside the water below that water's surface (`bank`); "water" only
//   the tiles that were wet (`wet`, fixed at the start); absent, every tile (Both).
// - Sources kept (D322, item 31): `sources: "keep"` marks the `keep` runs as the ground of the
//   sources the stroke passed over; they stay exactly as they were, and the build's integrity pass
//   leaves them too, so a kept source may stand on a small pillar or in a small pit.
// - Precise (D182, D193; retired by D322, its strokes still replay exactly): hard edges, no falloff
//   and vertical walls. Each dab moves every tile under
//   it to a depth of its level (1 unless the page's hold gave it more: a level more every so often
//   while the button is held); a tile takes the deepest dab that covered it. Raise and lower stop at
//   `stop` when it is set (a ceiling, a floor), never past the map's bottom or top, and leave the
//   `keep` tiles (the start, the objects standing there) as they are. The build leaves the tiles a
//   precise stroke changed out of its integrity pass, so a one-tile pit stays a pit. Smooth and
//   naturalize move each tile one step per stroke.
// - Flatten in steps (D184's Terrace): benches every `steps` levels from the flatten level, each tile
//   to its nearest bench. Smooth's walkable option (D184's Ramp; retired from the editor, D247: a stroke saved with it still replays): steps of 2 levels or more wear down to
//   1, and the build's derived slopes join the 1-level steps under the stroke (the game's natural
//   slopes). Flatten cuts and fills (D204): tiles above the level come down to it, tiles below rise
//   to it. Its edges are a cliff (the brush's own: a precise stroke's straight walls) or, `ramped`,
//   a rim that steps down a level a tile to the ground round it (precise too), which the derived
//   slopes join as a walkable Smooth stroke's do.
// - Smart Lower (D184): a Lower stroke that starts in or beside water (`channel`) carves a bed that
//   keeps flowing downhill, so the water follows the brush. Its bed never rises along the stroke:
//   over lower ground it drops to a level below that ground, and higher ground is cut straight down
//   to it under the brush's middle (a gorge with steep walls). Since D263 its depth comes from
//   strokes, not from holding: a new channel (`bed`: the stroke leaves the water it starts from)
//   starts its bed at `bed`, one level below the water's surface (never below the water's own bed),
//   keeps it while its dabs are still in that water (the first `dry` dabs: no pit where it leaves),
//   and no tile is cut below the bed however long the brush is held (the rest of the brush lowers as
//   usual, down to the bed at most); a deepening pass (`deepen`: drawn along a channel, never
//   leaving its water) lowers what the brush's middle passes over by exactly one level. A stroke
//   saved before D263 (`channel` alone) keeps its old rule: its bed starts at the lowest ground round
//   the first dab, and holding deepens it.
// - Objects ride a stroke's ground (D249): a water source's tile changes like any other and the
//   source stands on it; a piece on more than one tile that must stay level (a 3 × 3 badwater
//   source) is one of the stroke's `rigid` rectangles, whose tiles take the level of its middle
//   tile once the stroke is applied. A stroke saved with `keep` runs keeps them, as it always did.
// - The working area (D254, D259): a stroke with an `area` changes only the tiles inside it, and a
//   tile at most as many levels as it is steps inside it (4-neighbour, from the nearest tile
//   outside), so the edit meets the locked land at one level a tile: a feathered edge.
// - Levels stay within 0 and the editor's one ceiling, D172's tall maximum (D244; 16 before it).
//   A map whose land goes above 16 is a tall map.
// - Brushes shape each column's top (`layer: "top"`); the 3D stages extend them to the runs
//   below (caves), with the same dabs.

import { fmix32 } from "../../math/hash";
import { CEILING } from "../../format/world";
import * as portable from "../../math/portable";
import { ringTiles, weather } from "./weather";

export type BrushTool = "raise" | "lower" | "flatten" | "smooth" | "naturalize";

export interface BrushParams {
  tool: BrushTool;
  /** Radius in tiles (0.5–24, in steps of 0.25). */
  size: number;
  /** How fast it works, 1–10: at 5 the middle of a raise moves a level every 6 dabs. */
  strength: number;
  /** Flatten, soft (strokes before D322): the level it flattens to. */
  level?: number;
  /** Raise, Lower and Flatten, exact (D322, item 37): the level they work to, with hard edges. */
  target?: number;
  /** Which tiles it changes (D322, item 2): only the dry ones ("ground") or only the wet ones
   *  ("water"); every tile when absent (Both). */
  mode?: "ground" | "water";
  /** The tiles that were wet when the stroke began, within its reach, as runs [y, x0, x1] (its
   *  `mode`'s water: the map's own, never a drought's or a badtide's). */
  wet?: [number, number, number][];
  /** Ground: the dry tiles beside the water, and the level of that water's surface, as runs
   *  [y, x0, x1, level]: the stroke never lowers them below it, so nothing spills. */
  bank?: [number, number, number, number][];
  /** Keep (D322, item 31): the `keep` runs are the ground of the sources the stroke passed over, left
   *  exactly as they were (the integrity pass leaves them too). */
  sources?: "keep";
  /** Naturalize: the seed of its noise. */
  seed?: number;
  /** Naturalize (D368 (8)): weathers everything but the start's pad and the `keep` runs (the ground
   *  under sources and objects), a force's result, an exact stroke, a river and a set piece
   *  included. Absent, a stroke from before leaves every protected tile as it did. */
  weathers?: true;
  /** Naturalize's rule (D399): 2 weathers like nature (weather.ts). Absent, a stroke from before
   *  replays with the rule it was painted with. The session records it on every new weathering
   *  stroke. */
  weathering?: 2;
  /** Naturalize, rule 2: where water would stand on the ring round its working rectangle when the
   *  stroke began, as pairs [tile along the ring (clockwise from its top-left corner), depth in
   *  levels]; the session records them, so nothing it does newly holds water outside it either. */
  rim?: number[];
  /** Square (by the larger distance, on the tile grid); round when absent. */
  shape?: "square";
  /** Precise (retired by D322; its strokes replay): hard edges, no falloff, vertical walls (see
   *  `levels`). */
  precise?: boolean;
  /** Precise raise, lower and flatten: each dab's depth in levels, 1–16 (a hold digs deeper); 1 when
   *  absent. */
  levels?: number[];
  /** Precise raise and lower: the level they stop at (a ceiling for raise, a floor for lower). */
  stop?: number;
  /** Tiles the stroke leaves as they are, as runs [y, x0, x1] (a hold never digs out from under the
   *  start or the objects standing there, D193). */
  keep?: [number, number, number][];
  /** Pieces that ride the stroke's ground whole and level (D249: a 3 × 3 badwater source), as
   *  rectangles [x0, y0, x1, y1]: once the stroke is applied, each one's tiles take the level of its
   *  middle tile. */
  rigid?: [number, number, number, number][];
  /** The working area (D254, D259: the Select tool's open selection), as runs [y, x0, x1]: the
   *  stroke changes only its tiles, and by at most as many levels as a tile is steps inside it (its
   *  feathered edge: the land it changes meets the locked land a level a tile, never in a cliff). */
  area?: [number, number, number][];
  /** Flatten in steps: benches every `steps` levels (2–8) from the flatten level. */
  steps?: number;
  /** Smooth, walkable (a saved stroke's; the editor no longer offers it, D247): steps of 2 levels or more wear down to 1, and the game's natural slopes
   *  join the steps under the stroke. */
  walkable?: boolean;
  /** Flatten's edges (D204): absent, a cliff (the brush's own edge); `ramped`, a rim stepping down a
   *  level a tile to the ground round it, even for a precise stroke, with the game's natural slopes
   *  on its steps. */
  edges?: "ramped";
  /** A ramped Flatten's own slopes (D270), as the page laid them along its rim when the stroke
   *  ended: [x, y, orientation] (its high side: 0 north, 1 west, 2 south, 3 east). The build places
   *  each one that still fits; a ramped stroke saved before D270 has none and asks the slope planner
   *  instead. */
  slopes?: [number, number, number][];
  /** Each dab's pressure, 1–255 (a pen's); full when absent. */
  pressure?: number[];
  /** Lower: a stroke that starts in or beside water carves a bed that keeps flowing downhill. */
  channel?: boolean;
  /** Smart Lower, a new channel (D263): the level its bed starts at (one below the surface of the
   *  water it starts from); no tile is cut below the bed, however long it's held. */
  bed?: number;
  /** Smart Lower, a new channel (D263): its first dabs still in the water it starts from (the bed
   *  holds there, so it joins that water without a pit). 0 when absent. */
  dry?: number;
  /** Smart Lower, a deepening pass (D263): drawn along a channel, it lowers what the brush's middle
   *  passes over by exactly one level. */
  deepen?: boolean;
  /** The run of each column it shapes: the top (the surface). Runs below come with the 3D
   *  stages (caves and overhangs). */
  layer?: "top";
  /** Dab centres in quarter tiles: [x0, y0, x1, y1, …]; tile (x, y)'s middle is (4x + 2, 4y + 2). */
  dabs: number[];
}

export const BRUSH_TOOLS: readonly BrushTool[] = ["raise", "lower", "flatten", "smooth", "naturalize"];
/** The brushes' ceiling: the editor's one ceiling on every map (D244). */
export const BRUSH_MAX_LEVEL = CEILING;
export const BRUSH_SIZE_MIN = 0.5;
/** The largest radius: half the widest map's width (256², D322 item 42: the largest brush paints a
 *  whole map in one stroke). The page's own limit is half its map's width. */
export const BRUSH_SIZE_MAX = 128;
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
  return Math.max(2, Math.min(4 * BRUSH_SIZE_MAX, Math.round(size * 4)));
}

/** Whether a stroke acts with hard edges and exact levels: a target's (D322) or a precise one's. */
export function brushHard(p: Pick<BrushParams, "precise" | "target">): boolean {
  return p.precise === true || p.target !== undefined;
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

/** Whether a stroke weathers like nature (D399, weather.ts). */
export function weathersLikeNature(p: Pick<BrushParams, "tool" | "weathers" | "weathering">): boolean {
  return p.tool === "naturalize" && p.weathers === true && p.weathering === 2;
}

/** The tiles beyond the brush's disc a natural weathering reads (its ring, never changed). */
const WEATHER_MARGIN = 2;

/** A natural weathering's working rectangle (weather.ts): its dabs' discs and a margin, on the map;
 *  from the dabs alone, so the page's stroke and its replay agree. */
export function weatherBox(p: Pick<BrushParams, "size" | "dabs">, W: number, H: number): Rect | null {
  if (p.dabs.length < 2) return null;
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
  return boxAround(x0, y0, x1, y1, Math.ceil(radius4(p.size) / 4) + WEATHER_MARGIN, W, H);
}

function boxAround(x0: number, y0: number, x1: number, y1: number, r: number, W: number, H: number): Rect | null {
  const out = { x0: Math.max(0, x0 - r), y0: Math.max(0, y0 - r), x1: Math.min(W - 1, x1 + r), y1: Math.min(H - 1, y1 + r) };
  return out.x0 <= out.x1 && out.y0 <= out.y1 ? out : null;
}

/** A natural weathering's `rim` (D399): where water would stand on its rectangle's ring, from the
 *  level water stands at on every tile (`water`, the map's drainage) and the heights. */
export function weatherRim(p: Pick<BrushParams, "size" | "dabs">, heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number): number[] {
  const box = weatherBox(p, W, H);
  if (!box) return [];
  const out: number[] = [];
  ringTiles(box, W).forEach((g, q) => {
    const d = Math.round(water[g]) - heights[g];
    if (d > 0) out.push(q, d);
  });
  return out;
}

/** The tiles a stroke can change: its dabs' discs (plus the tiles next to them that smooth and
 *  naturalize read), on the map. Null for a stroke without dabs. */
export function brushBounds(p: Pick<BrushParams, "size" | "dabs" | "tool" | "precise" | "target" | "rigid" | "weathers" | "weathering">, W: number, H: number): Rect | null {
  if (p.dabs.length < 2) return null;
  const r = Math.ceil((brushHard(p) ? preciseReach(p.size) + 2 : radius4(p.size)) / 4) + (weathersLikeNature(p) ? WEATHER_MARGIN : p.tool === "smooth" || p.tool === "naturalize" ? 1 : 0);
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
  x0 -= r;
  y0 -= r;
  x1 += r;
  y1 += r;
  // (the pieces that ride it whole, D249)
  for (const [a, b, c, d] of p.rigid ?? []) {
    if (a < x0) x0 = a;
    if (b < y0) y0 = b;
    if (c > x1) x1 = c;
    if (d > y1) y1 = d;
  }
  const out = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W - 1, x1), y1: Math.min(H - 1, y1) };
  return out.x0 <= out.x1 && out.y0 <= out.y1 ? out : null;
}

/** Mark in `out` the tiles a stroke presses on (its dabs' discs or squares, as `add` reaches). */
export function markBrushTiles(p: Pick<BrushParams, "size" | "dabs" | "shape" | "precise" | "target">, W: number, H: number, out: Uint8Array): void {
  const hard = brushHard(p);
  const r4 = hard ? preciseReach(p.size) : radius4(p.size);
  const R2 = hard ? r4 * r4 : r4 * r4 - 1;
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

/** Whether a dab at (cx, cy), in quarter tiles, presses on tile (x, y): the same tiles
 *  `markBrushTiles` marks (the ring's reach, D249's Clear sources). */
export function dabPresses(p: Pick<BrushParams, "size" | "shape" | "precise" | "target">, cx: number, cy: number, x: number, y: number): boolean {
  const hard = brushHard(p);
  const r4 = hard ? preciseReach(p.size) : radius4(p.size);
  const R2 = hard ? r4 * r4 : r4 * r4 - 1;
  const dx = 4 * x + 2 - cx;
  const dy = 4 * y + 2 - cy;
  return (p.shape === "square" ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy) <= R2;
}

/** Whether a stroke reads its tiles' neighbours (smooth, naturalize; a stroke with pieces that ride
 *  it whole, which read their middle tile): a rebuild that touches its tiles applies it over all of
 *  them. */
export function brushReadsNeighbours(p: Pick<BrushParams, "tool" | "rigid">): boolean {
  return p.tool === "smooth" || p.tool === "naturalize" || !!p.rigid?.length;
}

/** Each piece that rides a stroke whole (D249) takes the level of its middle tile, in `heights`
 *  (the tiles `write` allows). Returns the rectangle of tiles it changed, or null. */
export function levelRigid(rigid: readonly (readonly [number, number, number, number])[], heights: Uint8Array, W: number, H: number, write: (i: number) => boolean = () => true): Rect | null {
  let out: Rect | null = null;
  for (const [a, b, c, d] of rigid) {
    const x0 = Math.max(0, a);
    const y0 = Math.max(0, b);
    const x1 = Math.min(W - 1, c);
    const y1 = Math.min(H - 1, d);
    if (x0 > x1 || y0 > y1) continue;
    const level = heights[Math.min(y1, Math.max(y0, (b + d) >> 1)) * W + Math.min(x1, Math.max(x0, (a + c) >> 1))];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (heights[i] === level || !write(i)) continue;
        heights[i] = level;
        out = grow(out, { x0: x, y0: y, x1: x, y1: y });
      }
  }
  return out;
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
  /** Smart Lower since D263: the lowest bed that reached each tile (no tile is cut below it), and a
   *  deepening pass's tiles (the brush's middle passed over them: a level down). */
  private readonly floorBed: Uint8Array | null;
  private readonly deep: Uint8Array | null;
  /** Precise raise, lower and flatten: each tile's depth in levels (the deepest dab over it); a
   *  target's: the tiles under it (as deep as it goes). */
  private readonly depth: Uint8Array | null;
  /** A target's stroke (D322): exact, hard-edged. */
  private readonly exact: boolean;
  /** Ground mode (D322): the lowest each bank tile may go (0 elsewhere); null without a bank. */
  private readonly low: Uint8Array | null;
  /** Tiles the middle of the brush has passed over (the first pass moves them a whole level). */
  private readonly swept: Uint8Array;
  private dabCount = 0;
  /** The tiles the stroke has pressed on so far. */
  private box: Rect | null = null;
  /** Work buffers for the edge rule. */
  private moved: Int16Array | null = null;
  /** The working area: each tile's steps inside it (0 outside), and the heights before the stroke
   *  (smooth and naturalize keep within them); null without an area. */
  private readonly inside: Uint8Array | null;
  private readonly start: Uint8Array | null;
  /** Naturalize since D399: it weathers like nature (weather.ts): the strongest falloff that reached
   *  each tile (the ring's outer part fades it), the dabs' tiles' extent, each tile's intensity, and
   *  the level water stood at on every tile when the stroke began (the page's; a replay reads `rim`). */
  private readonly nature: boolean;
  private readonly reach: Uint16Array | null;
  private dabBox: Rect | null = null;
  private intensity: Float32Array | null = null;
  private idle: Uint8Array | null = null;
  private lastIntensity: Float32Array | null = null;
  private lastBox: Rect | null = null;
  private writable: Uint8Array | null = null;
  private readonly water: ArrayLike<number> | null;

  constructor(settings: Omit<BrushParams, "dabs">, heights: Uint8Array, W: number, H: number, write: (i: number) => boolean = () => true, opts: { water?: ArrayLike<number> } = {}) {
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
    this.nature = weathersLikeNature(settings) && !settings.precise;
    this.before = pointwise || this.nature ? heights.slice() : null;
    this.steps = settings.tool === "naturalize" && !this.nature ? new Uint16Array(W * H) : null;
    this.reach = this.nature ? new Uint16Array(W * H) : null;
    this.water = this.nature ? (opts.water ?? null) : null;
    const smart = settings.channel === true && settings.tool === "lower";
    this.deep = smart && settings.deepen ? new Uint8Array(W * H) : null;
    this.cap = smart && !this.deep ? new Uint8Array(W * H).fill(255) : null;
    this.floorBed = this.cap && settings.bed !== undefined ? new Uint8Array(W * H).fill(255) : null;
    this.exact = pointwise && settings.target !== undefined;
    this.depth = (settings.precise || this.exact) && pointwise ? new Uint8Array(W * H) : null;
    // which tiles (D322): the dry ones, or the wet ones, as they were when the stroke began
    if (settings.mode) {
      const wet = new Uint8Array(W * H);
      for (const [y, a, b] of settings.wet ?? []) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) wet[y * W + x] = 1;
      const inner = this.write;
      const want = settings.mode === "water" ? 1 : 0;
      this.write = (i) => wet[i] === want && inner(i);
    }
    let low: Uint8Array | null = null;
    if (settings.mode === "ground" && settings.bank?.length) {
      low = new Uint8Array(W * H);
      for (const [y, a, b, level] of settings.bank) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) low[y * W + x] = Math.max(0, Math.min(BRUSH_MAX_LEVEL, level));
    }
    this.low = low;
    // the tiles the stroke leaves alone
    if (settings.keep?.length) {
      const kept = new Uint8Array(W * H);
      for (const [y, a, b] of settings.keep) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) kept[y * W + x] = 1;
      const inner = this.write;
      this.write = (i) => !kept[i] && inner(i);
    }
    this.swept = new Uint8Array(W * H);
    // the working area: only inside it, and feathered toward its edge
    this.inside = settings.area ? areaDepth(settings.area, W, H) : null;
    this.start = this.inside && !pointwise && !this.nature ? heights.slice() : null;
    if (this.inside) {
      const inner = this.write;
      const inside = this.inside;
      this.write = (i) => inside[i] > 0 && inner(i);
    }
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
    const precise = this.settings.precise === true || this.exact;
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
      // smart Lower: the bed at this dab, never above the one before it
      if (this.cap) this.bed = this.bedAt(tx, ty, this.dabCount);
      this.dabCount++;
      if (this.nature) this.dabBox = grow(this.dabBox, { x0: tx, y0: ty, x1: tx, y1: ty });
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
              // (a target's: all the way)
              const lv = this.exact ? 255 : levels ? Math.max(1, Math.min(BRUSH_MAX_LEVEL, levels[k >> 1] | 0)) : 1;
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
          if (this.reach && w > this.reach[i]) this.reach[i] = w;
          // a deepening pass (D263): the brush's middle takes a level off, once
          if (this.deep) {
            if (w >= 128) this.deep[i] = 1;
            continue;
          }
          // (a new channel: no tile the brush reaches is cut below the bed, D263)
          if (this.floorBed && this.bed < this.floorBed[i]) this.floorBed[i] = this.bed;
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
    if (this.nature) return this.applyNature();
    if (sequential) return pad(touched, 1, W, H);
    // raise, lower and flatten: the whole stroke's change again, with its edge rule
    this.applyPointwise();
    return this.box;
  }

  /** The pieces that ride the stroke whole take the level of their middle tile (D249), once its
   *  dabs are all in. Returns the rectangle of tiles that changed, or null. */
  level(rigid: readonly (readonly [number, number, number, number])[]): Rect | null {
    return levelRigid(rigid, this.heights, this.W, this.H, this.write);
  }

  /** Naturalize since D399: the land in the working rectangle again, from the land before the stroke
   *  and the pressure gathered so far (weather.ts). Returns the rectangle. */
  private applyNature(): Rect | null {
    const { W, H } = this;
    const d = this.dabBox!;
    const box = boxAround(d.x0, d.y0, d.x1, d.y1, Math.ceil(this.r4 / 4) + WEATHER_MARGIN, W, H);
    if (!box) return null;
    const I = (this.intensity ??= new Float32Array(W * H));
    const reach = this.reach!;
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++) {
        const i = y * W + x;
        // the pressure gathered (a level's worth weathers fully), faded across the ring's outer part
        // by distance: fully within three tenths of the radius of a dab, nothing beyond nine tenths
        const near = portable.sqrt(1 - portable.sqrt(reach[i] / 256));
        I[i] = Math.min(1, this.acc[i] / LEVEL) * Math.max(0, Math.min(1, (0.9 - near) / 0.6));
      }
    // and never a tile beside one it leaves alone, so its edge meets the land round it as it was
    // (the box's ring is outside the brush: nothing there)
    const rest = (this.idle ??= new Uint8Array(W * H));
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++) rest[y * W + x] = I[y * W + x] > 0 ? 0 : 1;
    for (let y = box.y0 + 1; y < box.y1; y++)
      for (let x = box.x0 + 1; x < box.x1; x++) {
        const i = y * W + x;
        if (rest[i - 1] || rest[i + 1] || rest[i - W] || rest[i + W]) I[i] = 0;
      }
    // (the brush held still once the pressure is all gathered: the same land, nothing to work out)
    const last = (this.lastIntensity ??= new Float32Array(W * H));
    const was = this.lastBox;
    let same = !!was && was.x0 === box.x0 && was.y0 === box.y0 && was.x1 === box.x1 && was.y1 === box.y1;
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++) {
        const i = y * W + x;
        if (last[i] !== I[i]) {
          same = false;
          last[i] = I[i];
        }
      }
    if (same) return null;
    this.lastBox = box;
    const before = this.before!;
    const ring = ringTiles(box, W);
    let rim: number[] | null = null;
    if (this.settings.rim) {
      rim = ring.map((g) => before[g]);
      const r = this.settings.rim;
      for (let k = 0; k + 1 < r.length; k += 2) if (r[k] >= 0 && r[k] < rim.length) rim[r[k]] = before[ring[r[k]]] + r[k + 1];
    } else if (this.water) {
      const water = this.water;
      rim = ring.map((g) => Math.max(before[g], Math.round(water[g])));
    }
    // (which tiles it may change never changes during a stroke: asked once a tile)
    const known = (this.writable ??= new Uint8Array(W * H));
    const write = this.write;
    const may = (i: number) => (known[i] ? known[i] === 1 : (known[i] = write(i) ? 1 : 2) === 1);
    weather({ W, H, box, before, intensity: I, size: this.settings.size, strength: this.settings.strength, write: may, room: this.inside, low: this.low, top: BRUSH_MAX_LEVEL, rim }, this.heights);
    return box;
  }

  /** Smart Lower's bed at dab `k` on tile (tx, ty): the first dab, the stroke's `bed` (D263), or
   *  before it the lowest ground round the dab (the water's bed beside it); after that, a level below
   *  the ground where that is lower, never above the bed before (a new channel holds its bed while
   *  its dabs are still in the water it starts from). From the ground before the stroke, so the
   *  same dabs give the same bed. */
  private bedAt(tx: number, ty: number, k: number): number {
    const { W, H } = this;
    const before = this.before!;
    const x = Math.max(0, Math.min(W - 1, tx));
    const y = Math.max(0, Math.min(H - 1, ty));
    const start = this.settings.bed;
    if (start !== undefined) {
      const bed = this.bed < 0 ? Math.max(0, Math.min(BRUSH_MAX_LEVEL, start)) : this.bed;
      return k < (this.settings.dry ?? 0) ? bed : Math.min(bed, Math.max(0, before[y * W + x] - 1));
    }
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
      // (the working area's feathered edge: a tile moves at most its steps inside the area)
      const was = this.start ? this.start[i] : h;
      const room = this.inside ? this.inside[i] : 255;
      const up = h < was + room;
      // (ground mode, D322: a bank tile never below its water's surface)
      const down = h > was - room && !(this.low && h - 1 < this.low[i]);
      if (this.settings.tool === "smooth") {
        if (this.settings.walkable) {
          // walkable: a step of 2 levels or more wears down to 1 first
          let lo = h;
          let hi = h;
          if (x > 0) ({ lo, hi } = mm(heights[i - 1], lo, hi));
          if (x < W - 1) ({ lo, hi } = mm(heights[i + 1], lo, hi));
          if (y > 0) ({ lo, hi } = mm(heights[i - W], lo, hi));
          if (y < H - 1) ({ lo, hi } = mm(heights[i + W], lo, hi));
          if (h - lo >= 2) {
            if (down) heights[i] = h - 1;
            continue;
          }
          if (hi - h >= 2 && h < BRUSH_MAX_LEVEL) {
            if (up) heights[i] = h + 1;
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
        if (target > h && h < BRUSH_MAX_LEVEL) {
          if (up) heights[i] = h + 1;
        } else if (target < h && down) heights[i] = h - 1;
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
      if (h - lo >= 2) {
        if (down) heights[i] = h - 1;
      } else if (hi - h >= 2 && h < BRUSH_MAX_LEVEL) {
        if (up) heights[i] = h + 1;
      } else if (h > lo && n < 200) {
        if (down) heights[i] = h - 1;
      } else if (h < hi && n >= 1024 - 200 && h < BRUSH_MAX_LEVEL && up) heights[i] = h + 1;
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
    const deep = this.deep;
    for (let y = 0; y < bh; y++) {
      const row = (b.y0 + y) * W + b.x0;
      for (let x = 0; x < bw; x++) m[y * bw + x] = depth ? depth[row + x] : deep ? deep[row + x] : Math.min(BRUSH_MAX_LEVEL, Math.floor(acc[row + x] / LEVEL));
    }
    // the edge rule: a 4-neighbour distance transform from the ground round the stroke (0 outside);
    // precise strokes have vertical walls, unless a ramped flatten steps its rim down
    if (!depth || this.settings.edges === "ramped") this.edgeRule(m, bw, bh);
    // the working area's feathered edge: a tile changes at most its steps inside the area
    const inside = this.inside;
    if (inside)
      for (let y = 0; y < bh; y++) {
        const row = (b.y0 + y) * W + b.x0;
        for (let x = 0; x < bw; x++) if (m[y * bw + x] > inside[row + x]) m[y * bw + x] = inside[row + x];
      }
    const { tool, level, stop, steps, target } = this.settings;
    const L = Math.max(0, Math.min(BRUSH_MAX_LEVEL, level ?? target ?? 0));
    // (a target is Raise's ceiling and Lower's floor, D322)
    const ceil = Math.min(BRUSH_MAX_LEVEL, stop ?? BRUSH_MAX_LEVEL, target ?? BRUSH_MAX_LEVEL);
    const floor = Math.max(0, stop ?? 0, target ?? 0);
    const low = this.low;
    for (let y = 0; y < bh; y++) {
      const row = (b.y0 + y) * W + b.x0;
      for (let x = 0; x < bw; x++) {
        const i = row + x;
        if (!this.write(i)) continue;
        const h0 = before[i];
        const d = m[y * bw + x];
        let h = h0;
        if (tool === "raise") h = h0 >= ceil ? h0 : Math.min(ceil, h0 + d);
        else if (tool === "lower") {
          h = h0 <= floor ? h0 : Math.max(floor, Math.min(h0 - d, this.cap ? this.cap[i] : 255));
          // a new channel (D263): never below the bed that reached the tile, and a tile already at
          // or below it (the water it starts from) keeps its ground: no pit
          const fb = this.floorBed ? this.floorBed[i] : 255;
          if (fb !== 255) h = h0 <= fb ? h0 : Math.max(h, fb);
        }
        else {
          // flatten, in steps: toward the nearest bench
          const T = steps ? Math.max(0, Math.min(BRUSH_MAX_LEVEL, L + steps * Math.round((h0 - L) / steps))) : L;
          h = h0 > T ? Math.max(T, h0 - d) : Math.min(T, h0 + d);
        }
        // ground mode (D322): a bank tile never below its water's surface
        if (low && h < h0) h = Math.max(h, Math.min(h0, low[i]));
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

/** Each tile's steps inside a working area given as runs [y, x0, x1] (4-neighbour, from the
 *  nearest tile outside it; the map's own edge doesn't count as outside), 0 outside it, at most 255. */
export function areaDepth(area: readonly (readonly [number, number, number])[], W: number, H: number): Uint8Array {
  const d = new Uint8Array(W * H);
  for (const [y, a, b] of area) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) d[y * W + x] = 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0 && d[i - W] + 1 < v) v = d[i - W] + 1;
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < H - 1 && d[i + W] + 1 < v) v = d[i + W] + 1;
      d[i] = v;
    }
  return d;
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
  const s = new BrushStroke(settings, heights, W, H, write);
  s.add(dabs, pressure, levels);
  if (p.rigid?.length) s.level(p.rigid);
}

/** Why a stroke's parameters are not a stroke this map can take (empty when they are). */
export function brushProblems(p: BrushParams, W: number, H: number): string[] {
  if (!BRUSH_TOOLS.includes(p.tool)) return [`there is no ${String(p.tool)} brush`];
  if (!(p.size >= BRUSH_SIZE_MIN && p.size <= BRUSH_SIZE_MAX)) return [`a brush is ${BRUSH_SIZE_MIN} to ${BRUSH_SIZE_MAX} tiles across its radius`];
  if (!(p.strength >= 1 && p.strength <= 10)) return ["a brush's strength is 1 to 10"];
  if (p.target !== undefined && (!(p.tool === "raise" || p.tool === "lower" || p.tool === "flatten") || !Number.isInteger(p.target) || p.target < 0 || p.target > BRUSH_MAX_LEVEL)) return [`only raise, lower and flatten have a target, a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.target !== undefined && (p.precise || p.level !== undefined || p.levels !== undefined || p.stop !== undefined || p.edges !== undefined || p.channel)) return ["a stroke with a target has no precise levels, stop, flatten level, edges or channel"];
  if (p.tool === "flatten" && p.target === undefined && !(Number.isInteger(p.level) && p.level! >= 0 && p.level! <= BRUSH_MAX_LEVEL)) return [`flatten needs a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.mode !== undefined && p.mode !== "ground" && p.mode !== "water") return ["a brush's mode is ground or water (both when absent)"];
  if ((p.wet !== undefined || p.bank !== undefined) && p.mode === undefined) return ["only a stroke with a mode keeps its wet tiles or banks"];
  if (p.bank !== undefined && p.mode !== "ground") return ["only a ground stroke has banks"];
  if (p.wet !== undefined && !(Array.isArray(p.wet) && p.wet.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => Number.isInteger(v)) && r[1] <= r[2]))) return ["a stroke's wet tiles are runs [y, x0, x1]"];
  if (p.bank !== undefined && !(Array.isArray(p.bank) && p.bank.every((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isInteger(v)) && r[1] <= r[2] && r[3] >= 0 && r[3] <= BRUSH_MAX_LEVEL))) return [`a stroke's banks are runs [y, x0, x1, level 0 to ${BRUSH_MAX_LEVEL}]`];
  if (p.sources !== undefined && (p.sources !== "keep" || p.keep === undefined)) return ["a stroke keeps its sources with their kept runs"];
  if (p.seed !== undefined && !Number.isInteger(p.seed)) return ["a brush's seed is a whole number"];
  if (p.weathers !== undefined && (p.weathers !== true || p.tool !== "naturalize")) return ["only a naturalize stroke weathers"];
  if (p.weathering !== undefined && (p.weathering !== 2 || p.weathers !== true || p.precise)) return ["only a weathering naturalize stroke, never a precise one, has rule 2"];
  if (p.rim !== undefined && (p.weathering !== 2 || !Array.isArray(p.rim) || p.rim.length % 2 || p.rim.length > 8192 || !p.rim.every((v, k) => Number.isInteger(v) && (k % 2 ? v >= 1 && v <= BRUSH_MAX_LEVEL : v >= 0)))) return [`a natural weathering's rim is pairs [tile along the ring, depth 1 to ${BRUSH_MAX_LEVEL}]`];
  if (p.dabs.length < 2 || p.dabs.length % 2) return ["a stroke needs its dabs, as pairs of numbers"];
  if (p.dabs.length > 2 * MAX_DABS) return [`a stroke holds at most ${MAX_DABS} dabs`];
  if (p.shape !== undefined && p.shape !== "square") return ["a brush is round or square"];
  if (p.pressure !== undefined && (p.pressure.length !== p.dabs.length / 2 || !p.pressure.every((v) => Number.isInteger(v) && v >= 1 && v <= 255))) return ["a stroke's pressures are one whole number from 1 to 255 for each dab"];
  if (p.levels !== undefined && (!p.precise || p.levels.length !== p.dabs.length / 2 || !p.levels.every((v) => Number.isInteger(v) && v >= 1 && v <= BRUSH_MAX_LEVEL))) return [`a precise stroke's levels are one whole number from 1 to ${BRUSH_MAX_LEVEL} for each dab`];
  if (p.stop !== undefined && (!Number.isInteger(p.stop) || p.stop < 0 || p.stop > BRUSH_MAX_LEVEL)) return [`a stroke stops at a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.steps !== undefined && (p.tool !== "flatten" || !Number.isInteger(p.steps) || p.steps < 2 || p.steps > 8)) return ["flatten's steps are 2 to 8 levels apart"];
  if (p.walkable !== undefined && (p.tool !== "smooth" || typeof p.walkable !== "boolean")) return ["only smooth makes the ground walkable"];
  if (p.edges !== undefined && (p.tool !== "flatten" || p.edges !== "ramped")) return ["only flatten has ramped edges"];
  if (p.slopes !== undefined && (p.edges !== "ramped" || !Array.isArray(p.slopes) || p.slopes.length > 4096 || !p.slopes.every((t) => Array.isArray(t) && t.length === 3 && t.every((v) => Number.isInteger(v)) && t[0] >= 0 && t[1] >= 0 && t[0] < W && t[1] < H && t[2] >= 0 && t[2] <= 3)))
    return ["a ramped stroke's slopes are [x, y, orientation 0–3] on the map"];
  if ((p.bed !== undefined || p.dry !== undefined || p.deepen !== undefined) && !(p.tool === "lower" && p.channel === true)) return ["only a smart Lower stroke has a bed, dry dabs or a deepening pass"];
  if (p.bed !== undefined && (!Number.isInteger(p.bed) || p.bed < 0 || p.bed > BRUSH_MAX_LEVEL)) return [`a smart Lower stroke's bed is a level from 0 to ${BRUSH_MAX_LEVEL}`];
  if (p.dry !== undefined && (!Number.isInteger(p.dry) || p.dry < 0 || p.bed === undefined)) return ["a new channel's dry dabs are counted from 0, with its bed"];
  if (p.deepen !== undefined && (p.deepen !== true || p.bed !== undefined)) return ["a deepening pass has no bed of its own"];
  if (p.rigid !== undefined && !(Array.isArray(p.rigid) && p.rigid.every((r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isInteger(v)) && r[0] >= 0 && r[1] >= 0 && r[0] <= r[2] && r[1] <= r[3] && r[2] < W && r[3] < H && r[2] - r[0] < 8 && r[3] - r[1] < 8))) return ["a stroke's riding pieces are rectangles [x0, y0, x1, y1] on the map, up to 8 tiles across"];
  if (p.area !== undefined && !(Array.isArray(p.area) && p.area.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => Number.isInteger(v)) && r[1] <= r[2]))) return ["a stroke's working area is runs [y, x0, x1]"];
  if (p.keep !== undefined && !(Array.isArray(p.keep) && p.keep.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => Number.isInteger(v)) && r[1] <= r[2]))) return ["a stroke's kept tiles are runs [y, x0, x1]"];
  for (let k = 0; k < p.dabs.length; k += 2) {
    const x = p.dabs[k];
    const y = p.dabs[k + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 4 * W || y >= 4 * H) return [`a dab at (${x / 4}, ${y / 4}) is outside the ${W}×${H} map`];
  }
  return [];
}
