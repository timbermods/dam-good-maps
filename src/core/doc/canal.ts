// The canal: a channel that leads water (MAPCRAFT's verb "lead water"; the hand-built map had no channel whose banks
// hold). The player drags a path and it cuts a bed of a set width and depth that falls steadily from its start to its
// end: the bed follows the land down, `depth` below it, and never rises again; where the land beside the bed is lower
// than the water would stand in it, a bank is raised, so the channel holds what runs in it. Where the land rises along
// the path by more than a cutting can take, it is refused in one line that says where. Open, it starts in the water it
// leads off; Dry, the first tile of its line is left standing, for the player or a blockage to open later. The `canal`
// operation stores its tiles and each one's level literally (as a lake's sill does) and is applied as exact Flattens;
// the engine's check plans it again on the map now and it must be the one stored (D342).

import { CEILING } from "../format/world";
import { runsToTiles, tilesToRuns } from "../math/grid";
import { WATER } from "../sim/fed";
import type { CanalParams, OpOf } from "./ops";
import type { ApplyResult, MapSession } from "./session";
import { applySelection, selectionHeld } from "./start";

export const CANAL_MAX_WIDTH = 6;
export const CANAL_MAX_DEPTH = 3;
/** How much deeper than its depth the bed may be cut to keep falling through a rise in the land. */
export const CANAL_CUTTING = 3;
/** The longest line of tiles a canal follows. */
export const CANAL_MAX_LENGTH = 1024;

export interface CanalPlan {
  /** The plain one-line reason it is refused, or null. */
  reason: string | null;
  /** The operation that makes it (null when refused). */
  op: OpOf<"canal"> | null;
  /** The tiles it changes, ascending (y·W + x): the bed and the raised banks. */
  tiles: number[];
  /** The level each of `tiles` is set to, in their order. */
  levels: number[];
  /** The bed's tiles (cut, or filled across a hollow), ascending. */
  bed: number[];
  /** The banks' tiles (raised), ascending. */
  banks: number[];
  /** The bed's level at its start and at its end. */
  from: number;
  to: number;
}

/** The tiles of a line through the points, each sharing an edge with the next (water runs between edges, never
 *  across a corner), without the same tile twice in a row. */
export function canalLine(points: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  const put = (x: number, y: number) => {
    const last = out[out.length - 1];
    if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
  };
  for (let k = 0; k < points.length; k++) {
    let [x, y] = points[k];
    if (!k) {
      put(x, y);
      continue;
    }
    const [x0, y0] = points[k - 1];
    x = x0;
    y = y0;
    const [x1, y1] = points[k];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x1 > x0 ? 1 : -1;
    const sy = y1 > y0 ? 1 : -1;
    let ix = 0;
    let iy = 0;
    // (a supercover walk: a step along x or along y, whichever keeps nearer the line; never both at once)
    while (ix < dx || iy < dy) {
      if (iy >= dy || (ix < dx && (1 + 2 * ix) * dy < (1 + 2 * iy) * dx)) {
        x += sx;
        ix++;
      } else {
        y += sy;
        iy++;
      }
      put(x, y);
    }
  }
  return out;
}

/** Plan a canal along `path` (points [x, y], start first): what it would change, or the one line why not. Reads the
 *  map only. */
export function planCanal(s: MapSession, path: readonly (readonly [number, number])[], width: number, depth: number, open: boolean): CanalPlan {
  const none = (reason: string): CanalPlan => ({ reason, op: null, tiles: [], levels: [], bed: [], banks: [], from: NaN, to: NaN });
  const now = s.waterNow();
  const { W, H } = now.model;
  const heights = s.built.heights;
  const where = (i: number) => `X ${i % W} · Y ${Math.floor(i / W)}`;
  if (!Number.isInteger(width) || width < 1 || width > CANAL_MAX_WIDTH) return none(`a canal's width must be a whole number from 1 to ${CANAL_MAX_WIDTH}`);
  if (!Number.isInteger(depth) || depth < 1 || depth > CANAL_MAX_DEPTH) return none(`a canal's depth must be a whole number from 1 to ${CANAL_MAX_DEPTH}`);
  for (const [x, y] of path) if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return none(`X ${x} · Y ${y} is off the map`);
  const line = canalLine(path);
  if (line.length < (open ? 2 : 3)) return none("a canal needs a path: drag from where the water is to where it should go");
  if (line.length > CANAL_MAX_LENGTH) return none(`a canal follows at most ${CANAL_MAX_LENGTH} tiles: this path has ${line.length}`);
  const centre = line.map(([x, y]) => y * W + x);
  const n = centre.length;
  // the land along the line: where water stands at the start, the level it stands at (the bed leaves from under it)
  const wet = (i: number) => now.depth[i] > WATER;
  const land = (k: number) => (k === 0 && wet(centre[0]) ? Math.floor(now.model.floor[centre[0]] + now.depth[centre[0]] + 1e-6) : heights[centre[k]]);
  // the bed: `depth` under the land, never rising; a rise is cut through while the cutting stays shallow enough
  const bedAt = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    const want = land(k) - depth;
    bedAt[k] = k ? Math.min(bedAt[k - 1], want) : want;
    if (bedAt[k] < 1) return none(`the canal's bed would go below level 1 at ${where(centre[k])}: start it on higher ground or make it shallower`);
    const cut = heights[centre[k]] - bedAt[k];
    if (cut > depth + CANAL_CUTTING) return none(`the land rises ${cut - depth} ${cut - depth === 1 ? "level" : "levels"} above the canal's fall at ${where(centre[k])}: it can't keep falling there`);
  }
  // each tile of the bed takes the level of the nearest tile of the line (the earlier of two as near)
  const lo = -Math.floor((width - 1) / 2);
  const hi = Math.ceil((width - 1) / 2);
  const owner = new Map<number, number>();
  const near = new Map<number, number>();
  for (let k = 0; k < n; k++) {
    const [cx, cy] = line[k];
    for (let dy = lo; dy <= hi; dy++)
      for (let dx = lo; dx <= hi; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const d = dx * dx + dy * dy;
        if (!near.has(i) || d < near.get(i)!) {
          near.set(i, d);
          owner.set(i, k);
        }
      }
  }
  // (Dry: what belongs to the line's first tile is left standing, a wall one tile thick against the water it starts by)
  const first = open ? 0 : 1;
  const level = new Map<number, number>();
  const bed: number[] = [];
  for (const [i, k] of owner) {
    if (k < first) continue;
    bed.push(i);
    level.set(i, bedAt[k]);
  }
  // the banks: beside the bed, the land must stand as high as the water would in it (the bed's level and its depth);
  // never across the canal's two ends, which stay open
  const ahead = (i: number, k: number, back: boolean) => {
    const a = line[back ? 0 : n - 1];
    const b = line[back ? 1 : n - 2];
    return ((i % W) - a[0]) * (a[0] - b[0]) + (Math.floor(i / W) - a[1]) * (a[1] - b[1]) > 0 && (back ? k === first : k === n - 1);
  };
  const banks: number[] = [];
  for (const i of bed) {
    const k = owner.get(i)!;
    const x = i % W;
    const y = (i - x) / W;
    for (const j of [y > 0 ? i - W : -1, x > 0 ? i - 1 : -1, y < H - 1 ? i + W : -1, x < W - 1 ? i + 1 : -1]) {
      if (j < 0 || (owner.has(j) && owner.get(j)! >= first)) continue;
      if (ahead(j, k, false) || (open && ahead(j, k, true))) continue;
      const need = bedAt[k] + depth;
      if (heights[j] >= need || (level.get(j) ?? -1) >= need) continue;
      if (!level.has(j)) banks.push(j);
      level.set(j, need);
    }
  }
  // what it may not change: ground a source or another object's water stands on, a cave's or an overhang's
  const fixed = new Uint8Array(W * H);
  for (const e of now.model.emitters) for (const i of e.cells) fixed[i] = 1;
  const held = s.columns.size ? selectionHeld(s) : null;
  const tiles = [...level.keys()].sort((a, b) => a - b);
  for (const i of tiles) {
    if (fixed[i]) return none(`a source stands in the canal's way at ${where(i)}`);
    if (held?.has(i)) return none(`${where(i)} has a cave or overhang: a canal leaves those as they are`);
    if (level.get(i)! > CEILING) return none(`the canal's bank at ${where(i)} would rise above the ceiling (level ${CEILING})`);
  }
  const changed = tiles.filter((i) => level.get(i) !== heights[i]);
  if (!changed.length) return none("the land already falls that way as a channel: nothing to cut");
  const levels = changed.map((i) => level.get(i)!);
  const params: CanalParams = { path: path.map(([x, y]) => [x, y]), width, depth, open, cells: tilesToRuns(changed, W), levels };
  const inBed = new Set(bed);
  return { reason: null, op: { op: "canal", params }, tiles: changed, levels, bed: changed.filter((i) => inBed.has(i)), banks: changed.filter((i) => !inBed.has(i)), from: bedAt[first], to: bedAt[n - 1] };
}

/** Make the canal (`planCanal`), applied as a Select action: one undo step, exact, the objects on its ground riding it
 *  and the start carried to level ground if its own broke (doc/start.ts `applySelection`). */
export function applyCanal(s: MapSession, path: readonly (readonly [number, number])[], width: number, depth: number, open: boolean): ApplyResult & { plan: CanalPlan } {
  const plan = planCanal(s, path, width, depth, open);
  if (!plan.op) return { ok: false, errors: [plan.reason ?? "the canal can't be made"], applied: [], dirty: null, plan };
  return { ...applySelection(s, [plan.op], canalLabel(plan.op.params), plan.tiles), plan };
}

/** The history's words for a `canal` operation. */
export function canalLabel(p: CanalParams): string {
  return `Cut a canal ${p.width} wide and ${p.depth} deep${p.open ? "" : ", dry"}`;
}

/** Why a `canal` operation doesn't fit the map now (null when it does): planned again on the map as it stands, it must
 *  be the one it stores (the engine's check). */
export function canalProblem(s: MapSession, p: CanalParams): string | null {
  const r = planCanal(s, p.path, p.width, p.depth, p.open);
  if (r.reason) return r.reason;
  const { W } = s.waterNow().model;
  const stored = runsToTiles(p.cells, W).sort((a, b) => a - b);
  const same = stored.length === r.tiles.length && stored.every((i, k) => i === r.tiles[k] && p.levels[k] === r.levels[k]);
  return same ? null : "the canal is no longer the one planned: draw it again";
}
