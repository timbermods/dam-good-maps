// A stroke painted on the page (live editing): the brush applied to the map's terrain as the build
// would apply it, dab by dab while the player paints, so what the player sees under the cursor is
// exactly the map the stroke's operation builds. The page holds the terrain the build's last steps
// start from (`TerrainState`: the heights before the integrity pass, the protected and channel
// tiles, and for an imported map its own surface and caves); the stroke changes those heights,
// and the integrity pass (build step 7) runs again round the stroke. Pure TypeScript: the page
// runs it on the main thread, the tests in Node.

import { BrushStroke, brushHard, type BrushParams, type Rect } from "./brush";
import type { Runs } from "../../math/grid";
import type { StartFeature } from "../schema";
import { integrityAt, keepShownGround, padTile } from "./terrain";
import { waterLevels } from "./weather";

/** What the build's step 6 onward starts from, for the page's own copy of the terrain. */
export interface TerrainState {
  /** Heights after the sculpt edits and strokes, before the integrity pass (build step 7). */
  pre: Uint8Array;
  /** Tiles the integrity pass leaves alone: protected tiles and river channels. */
  protect: Uint8Array;
  channel: Uint8Array;
  /** An imported map's own surface: the integrity pass only touches tiles an edit changed. */
  base: Uint8Array | null;
  /** Tiles a regeneration kept under a lock: the integrity pass leaves them alone. */
  locked: Uint8Array | null;
  /** Tiles with caves or overhangs (an imported map's): every tool leaves them as they are. */
  columns: Int32Array;
  /** A generated map's stored field (M9a): as on an imported map, the integrity pass only touches
   *  the tiles an edit changed from it (null for other maps). */
  field?: Uint8Array | null;
  /** The highest the terrain may stand: 16, or a tall map's top (D172). */
  top?: number;
  /** The start features: their pads are the one ground Naturalize leaves (D368 (8)). */
  starts?: readonly StartFeature[];
  /** The settled water's depth on every tile, as the page shows it (a natural weathering keeps the
   *  water where it stands, D399). */
  water?: Float64Array | null;
  /** The settled water's moisture on every tile (rule 3: moist ground keeps its height). */
  moisture?: Float64Array | null;
}

export class StrokePreview {
  readonly W: number;
  readonly H: number;
  /** The heights before the integrity pass, the stroke applied. */
  readonly pre: Uint8Array;
  private readonly stroke: BrushStroke;
  private readonly heights: Uint8Array;
  private readonly state: TerrainState;
  private readonly candidate: (i: number) => boolean;
  /** The shown heights before the stroke. */
  readonly start: Uint8Array;
  /** The shown heights as they were after the last `add` (to find what the next one changes). */
  private readonly last: Uint8Array;
  /** The tiles the integrity pass leaves alone: the map's, and a precise stroke's own (the build
   *  leaves them out too). */
  readonly protect: Uint8Array;
  private readonly precise: boolean;

  /** `heights` are the map's heights as shown (changed in place as the stroke goes on). */
  constructor(settings: Omit<BrushParams, "dabs">, state: TerrainState, heights: Uint8Array, W: number, H: number, ground?: Runs) {
    // a new weathering stroke's rule and where the water stood are written into the settings the page
    // hands in, so the operation it records keeps exactly what this preview used (D399; the session
    // adds them itself to a stroke that comes without)
    const record = settings as Omit<BrushParams, "dabs">;
    const fresh = settings.tool === "naturalize" && settings.weathers && (settings.weathering === undefined || ((settings.weathering === 3 || settings.weathering === 4) && (record.shore !== undefined || record.pools !== undefined || record.moist !== undefined)));
    if (fresh) {
      record.weathering = 4;
      delete record.shore;
      delete record.pools;
      delete record.moist;
    }
    // a weathering Naturalize stroke leaves the ground under sources and objects as it is: the core
    // adds those runs itself when the operation applies (session.ts, `weatherKeep`); the page, whose
    // stroke is not yet an operation, hands in the same ones (D368 (8))
    if (settings.tool === "naturalize" && settings.weathers && ground?.length) settings = { ...settings, keep: [...(settings.keep ?? []), ...ground] };
    // a new weathering stroke weathers like nature (D399), as the session records it when it applies,
    // reading where water stands round it from the same land
    let water: Uint8Array | undefined;
    if (settings.tool === "naturalize" && settings.weathers && settings.weathering === undefined) settings = { ...settings, weathering: 4 };
    if ((settings.weathering === 2 || settings.weathering === 3 || settings.weathering === 4) && !settings.rim) water = waterLevels(state.pre, W, H);
    this.W = W;
    this.H = H;
    this.state = state;
    this.heights = heights;
    this.start = heights.slice();
    this.last = heights.slice();
    this.pre = state.pre.slice();
    // (a target's stroke too, D322: exact, as a precise one was)
    this.precise = brushHard(settings);
    this.protect = this.precise || settings.sources === "keep" ? state.protect.slice() : state.protect;
    const pre = this.pre;
    const base = state.base;
    const locked = state.locked;
    const field = state.field ?? null;
    // (as the build's step 7 chooses them)
    this.candidate = base ? (i) => pre[i] !== base[i] : field ? (i) => pre[i] !== field[i] && !locked?.[i] : locked ? (i) => !locked[i] : () => true;
    // kept sources' ground stays exactly as it is shown (D322, item 31): the integrity pass leaves it
    // too, as the build's step 6 does
    if (settings.sources === "keep") keepShownGround(settings.keep ?? [], this.pre, W, H, this.protect, state.channel, this.candidate, state.top);
    let keep: Uint8Array | null = null;
    if (state.columns.length) {
      keep = new Uint8Array(W * H);
      for (const i of state.columns) keep[i] = 1;
    }
    // Naturalize weathers all but the start's pad, as build step 6 does (D368 (8))
    // (a stroke from before D368 leaves every protected tile, as the build does)
    const pads = settings.tool === "naturalize" && settings.weathers && state.starts?.length ? state.starts : null;
    const prot = settings.tool === "naturalize" && !settings.weathers ? state.protect : null;
    const depth = fresh && state.water ? state.water : undefined;
    const shown = this.start;
    this.stroke = new BrushStroke(settings, this.pre, W, H, (i) => !(keep && keep[i]) && !(prot && prot[i]) && !(pads && padTile(pads, i % W, Math.floor(i / W))), {
      water,
      ...(depth ? { depth, shown, moisture: state.moisture ?? null, record: (shore, pools, moist) => Object.assign(record, { shore, pools, ...(moist ? { moist } : {}) }) } : {}),
    });
  }

  /** Apply more dabs (with a pen's pressures, and precise's levels). Returns the rectangle of
   *  shown heights that changed, or null. */
  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>, levels?: ArrayLike<number>): Rect | null {
    const r = this.stroke.add(dabs, pressure, levels);
    return r ? this.settle(r) : null;
  }

  /** The stroke's dabs are all in: the pieces that ride it whole take the level of their middle
   *  tile (D249), as the build does. Returns the rectangle of shown heights that changed, or null. */
  finish(rigid: readonly (readonly [number, number, number, number])[]): Rect | null {
    const r = rigid.length ? this.stroke.level(rigid) : null;
    if (!r) return null;
    this.finished = this.finished ? { x0: Math.min(this.finished.x0, r.x0), y0: Math.min(this.finished.y0, r.y0), x1: Math.max(this.finished.x1, r.x1), y1: Math.max(this.finished.y1, r.y1) } : r;
    return this.settle(r);
  }

  /** The tiles `finish` changed (outside the dabs' reach too), or null. */
  finished: Rect | null = null;

  /** After the stroke changed the tiles in `r`: the integrity pass round them, and what the page
   *  shows that changed. */
  private settle(r: Rect): Rect | null {
    const { W, H, heights, last } = this;
    // a precise stroke's tiles stay as it leaves them (build step 6 marks them the same way)
    if (this.precise)
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          const i = y * W + x;
          if (this.pre[i] !== this.state.pre[i]) this.protect[i] = 1;
        }
    // the integrity pass reads each tile's neighbours: one tile round what changed
    const x0 = Math.max(0, r.x0 - 1);
    const y0 = Math.max(0, r.y0 - 1);
    const x1 = Math.min(W - 1, r.x1 + 1);
    const y1 = Math.min(H - 1, r.y1 + 1);
    integrityAt(this.pre, heights, W, H, this.protect, this.state.channel, this.candidate, x0, y0, x1, y1, this.state.top);
    // what actually changed since the last call: the page redraws only that
    let cx0 = W;
    let cy0 = H;
    let cx1 = -1;
    let cy1 = -1;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (heights[i] === last[i]) continue;
        last[i] = heights[i];
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        if (y > cy1) cy1 = y;
      }
    return cx1 >= 0 ? { x0: cx0, y0: cy0, x1: cx1, y1: cy1 } : null;
  }

  /** The shown heights before the stroke, inside `r` (Esc puts them back). */
  restore(): Rect | null {
    const b = this.stroke.bounds;
    if (!b) return null;
    const { W, H } = this;
    const r = { x0: Math.max(0, b.x0 - 1), y0: Math.max(0, b.y0 - 1), x1: Math.min(W - 1, b.x1 + 1), y1: Math.min(H - 1, b.y1 + 1) };
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        const i = y * W + x;
        this.heights[i] = this.start[i];
        this.last[i] = this.start[i];
      }
    return r;
  }

  /** Tiles whose shown height the stroke has changed so far (for "Raise, 38 tiles"). */
  changed(): number {
    const b = this.stroke.bounds;
    if (!b) return 0;
    let n = 0;
    const { W, H } = this;
    for (let y = Math.max(0, b.y0 - 1); y <= Math.min(H - 1, b.y1 + 1); y++)
      for (let x = Math.max(0, b.x0 - 1); x <= Math.min(W - 1, b.x1 + 1); x++) {
        const i = y * W + x;
        if (this.heights[i] !== this.start[i]) n++;
      }
    return n;
  }

  get dabs(): number {
    return this.stroke.dabs;
  }

  get bounds(): Rect | null {
    return this.stroke.bounds;
  }
}
