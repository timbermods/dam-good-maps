// The drawn lake (the Lake, Lower's fifth Brush choice): a lake where there is none. The player drags an outline on the
// land and it digs a basin inside it: a shelving bed (a margin one level under the lake's level, falling a level a tile
// inward to a channel `depth` under it along the outline's long axis), a rim made whole around it (each tile of the
// ring just outside the outline at least a level over the lake, a gap raised up to `LAKE_RIM_RAISE` levels; a lower gap
// is refused, named), and one spill point: a notch one tile wide in the rim, at the lake's level, where the ground
// beyond the rim is lowest or nearest where the player dragged out of the outline (always where ground beyond lies at
// the level or lower, so the water runs out there; with none, it is refused). It places no water of its own: water
// already in the outline or on its rim fills it at the next settle; otherwise a source or a canal must bring some. A
// lake at level L stands from L (the notch) up, as `setLakeLevel`'s does (doc/lakeLevel.ts, the other lake code: that
// one sets an existing lake's level). The `lake` operation stores its tiles and each one's level literally and is
// applied as exact Flattens; the engine's check plans it again on the map now and it must be the one stored (D342).

import { CEILING } from "../format/world";
import { runsToTiles, tilesToRuns } from "../math/grid";
import { WATER } from "../sim/fed";
import { polygonMask } from "../features/geometry";
import { canalLine } from "./canal";
import { LAKE_MAX_DEPTH, LAKE_MAX_POINTS, LAKE_MAX_TILES, LAKE_MIN_TILES, LAKE_RIM_RAISE } from "./lakeLimits";
import type { DrawnLakeParams, OpOf } from "./ops";
import type { ApplyResult, MapSession } from "./session";
import { applySelection, selectionHeld } from "./start";

export * from "./lakeLimits";

export interface DrawnLakePlan {
  /** The plain one-line reason it is refused, or null. */
  reason: string | null;
  /** The operation that makes it (null when refused). */
  op: OpOf<"lake"> | null;
  /** The tiles it changes, ascending (y·W + x): the bed dug, the rim raised and the notch. */
  tiles: number[];
  /** The level each of `tiles` is set to, in their order. */
  levels: number[];
  /** Every tile inside the outline (the basin), ascending. */
  basin: number[];
  /** The rim's tiles it raises, ascending. */
  rim: number[];
  /** The spill point's tile (the notch), or -1 when refused before one was found. */
  notch: number;
  /** Water stands in the outline or on its rim now: it fills the lake at the next settle. */
  fed: boolean;
}

/** The tiles an outline takes in (points [x, y], tile middles), ascending: those inside it and those its closed line
 *  passes through, edge to edge (the line drawn is the shore). */
export function lakeTiles(outline: readonly (readonly [number, number])[], W: number, H: number): number[] {
  const mask = outline.length >= 3 ? polygonMask(outline.map(([x, y]) => [x, y] as [number, number]), W, H) : new Uint8Array(W * H);
  for (const [x, y] of canalLine(outline.length >= 3 ? [...outline, outline[0]] : outline)) if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

/** Plan a lake inside `outline` (points [x, y]) standing at `level`, its channel `depth` under it; `spill`: where the
 *  player dragged out of the outline (the notch is the rim's tile nearest it), or null for the rim's lowest tile. What it
 *  would change, or the one line why not. Reads the map only. */
export function planDrawnLake(s: MapSession, outline: readonly (readonly [number, number])[], level: number, depth: number, spill: readonly [number, number] | null = null): DrawnLakePlan {
  const none = (reason: string): DrawnLakePlan => ({ reason, op: null, tiles: [], levels: [], basin: [], rim: [], notch: -1, fed: false });
  const now = s.waterNow();
  const { W, H } = now.model;
  const heights = s.built.heights;
  const where = (i: number) => `X ${i % W} · Y ${Math.floor(i / W)}`;
  if (!Number.isInteger(depth) || depth < 1 || depth > LAKE_MAX_DEPTH) return none(`a lake's depth must be a whole number from 1 to ${LAKE_MAX_DEPTH}`);
  if (!Number.isInteger(level) || level < 1 || level >= CEILING) return none(`a lake's level must be a whole number from 1 to ${CEILING - 1}`);
  if (level - depth < 1) return none(`the lake's bed would go below level 1: set its level higher or its depth less`);
  if (outline.length > LAKE_MAX_POINTS) return none(`a lake's outline keeps at most ${LAKE_MAX_POINTS} points`);
  for (const [x, y] of [...outline, ...(spill ? [spill] : [])]) if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return none(`X ${x} · Y ${y} is off the map`);
  const basin = lakeTiles(outline, W, H);
  if (basin.length < LAKE_MIN_TILES) return none("a lake needs room: drag an outline around the ground it should take");
  if (basin.length > LAKE_MAX_TILES) return none(`a lake takes at most ${LAKE_MAX_TILES} tiles: this outline takes ${basin.length}`);
  const inside = new Uint8Array(W * H);
  for (const i of basin) inside[i] = 1;
  for (const i of basin) {
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return none(`the lake reaches the map's edge at ${where(i)}: its water would run off the map`);
  }
  const around = (i: number) => [i - W, i - 1, i + 1, i + W];
  // the rim: the ring just outside the outline, edge to edge (water runs between edges, never across a corner)
  const rimAll: number[] = [];
  const onRim = new Uint8Array(W * H);
  for (const i of basin)
    for (const j of around(i))
      if (!inside[j] && !onRim[j]) {
        onRim[j] = 1;
        rimAll.push(j);
      }
  rimAll.sort((a, b) => a - b);
  // the spill point: a rim tile with ground beyond it at the lake's level or lower, so the water runs out there; the one
  // nearest where the player dragged out, or else where the ground beyond is lowest (then the rim's own, then the first)
  const beyond = (r: number) => Math.min(...around(r).filter((j) => j >= 0 && j < W * H && !inside[j] && !onRim[j]).map((j) => heights[j]));
  const spills = rimAll.filter((r) => beyond(r) <= level);
  if (!spills.length) return none(`no ground beyond the lake's rim lies at level ${level} or lower: its water would have nowhere to spill`);
  let notch = spills[0];
  if (spill) {
    let best = Infinity;
    for (const r of spills) {
      const d = (r % W - spill[0]) ** 2 + (Math.floor(r / W) - spill[1]) ** 2;
      if (d < best) [best, notch] = [d, r];
    }
  } else {
    let best: [number, number] = [Infinity, Infinity];
    for (const r of spills) {
      const key: [number, number] = [beyond(r), heights[r]];
      if (key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) [best, notch] = [key, r];
    }
  }
  // the rim made whole: a level over the lake, the notch at it; a gap deeper than a raise can mend is refused, the
  // lowest named
  const level0 = new Map<number, number>();
  let lowest = -1;
  for (const r of rimAll) {
    const need = r === notch ? level : level + 1;
    if (need - heights[r] > LAKE_RIM_RAISE && (lowest < 0 || heights[r] < heights[lowest])) lowest = r;
    if (r === notch || heights[r] < need) level0.set(r, need);
  }
  if (lowest >= 0) return none(`the land can't hold a lake at level ${level} there: its rim's lowest gap is at ${where(lowest)}, level ${heights[lowest]}`);
  // the bed: a level a tile inward from the shore (the margin a level under the lake), down to the channel's depth along
  // the long axis and half of it beside the channel; ground already lower is left as it is
  const dist = new Int32Array(W * H).fill(-1);
  const queue: number[] = [];
  for (const i of basin)
    if (around(i).some((j) => !inside[j])) {
      dist[i] = 1;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of around(i))
      if (inside[j] && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
  }
  let cx = 0;
  let cy = 0;
  for (const i of basin) {
    cx += i % W;
    cy += Math.floor(i / W);
  }
  cx /= basin.length;
  cy /= basin.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const i of basin) {
    const dx = (i % W) - cx;
    const dy = Math.floor(i / W) - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [ax, ay] = [Math.cos(angle), Math.sin(angle)];
  const tr = (sxx + syy) / basin.length;
  const det = (sxx * syy - sxy * sxy) / basin.length ** 2;
  const minor = Math.sqrt(Math.max(0, tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det))));
  const half = Math.max(0.75, 0.6 * minor);
  const shelf = Math.max(1, Math.ceil(depth / 2));
  for (const i of basin) {
    const off = Math.abs(-((i % W) - cx) * ay + (Math.floor(i / W) - cy) * ax);
    const want = level - Math.min(off <= half ? depth : shelf, dist[i]);
    if (heights[i] > want) level0.set(i, want);
  }
  // what it may not change: ground a source or another object's water stands on, a cave's or an overhang's
  const fixed = new Uint8Array(W * H);
  for (const e of now.model.emitters) for (const i of e.cells) fixed[i] = 1;
  const held = s.columns.size ? selectionHeld(s) : null;
  const tiles = [...level0.keys()].sort((a, b) => a - b);
  for (const i of tiles) {
    if (fixed[i]) return none(`a source stands in the lake's way at ${where(i)}`);
    if (held?.has(i)) return none(`${where(i)} has a cave or overhang: a lake leaves those as they are`);
  }
  const changed = tiles.filter((i) => level0.get(i) !== heights[i]);
  if (!changed.length) return none("the land already holds a lake there: nothing to dig");
  const levels = changed.map((i) => level0.get(i)!);
  let fed = false;
  for (const i of [...basin, ...rimAll]) if (now.depth[i] > WATER) fed = true;
  const params: DrawnLakeParams = { outline: outline.map(([x, y]) => [x, y]), level, depth, ...(spill ? { spill: [spill[0], spill[1]] as [number, number] } : {}), cells: tilesToRuns(changed, W), levels };
  return { reason: null, op: { op: "lake", params }, tiles: changed, levels, basin, rim: changed.filter((i) => onRim[i] && i !== notch), notch, fed };
}

/** Make the lake (`planDrawnLake`), applied as a Select action: one undo step, exact, the objects on its ground riding it
 *  and the start carried to level ground if its own broke (doc/start.ts `applySelection`). */
export function applyDrawnLake(s: MapSession, outline: readonly (readonly [number, number])[], level: number, depth: number, spill: readonly [number, number] | null = null): ApplyResult & { plan: DrawnLakePlan } {
  const plan = planDrawnLake(s, outline, level, depth, spill);
  if (!plan.op) return { ok: false, errors: [plan.reason ?? "the lake can't be made"], applied: [], dirty: null, plan };
  return { ...applySelection(s, [plan.op], drawnLakeLabel(plan.op.params), plan.tiles), plan };
}

/** The history's words for a `lake` operation. */
export function drawnLakeLabel(p: DrawnLakeParams): string {
  return `Dig a lake at level ${p.level}, ${p.depth} deep`;
}

/** Why a `lake` operation doesn't fit the map now (null when it does): planned again on the map as it stands, it must be
 *  the one it stores (the engine's check). */
export function drawnLakeProblem(s: MapSession, p: DrawnLakeParams): string | null {
  const r = planDrawnLake(s, p.outline, p.level, p.depth, p.spill ?? null);
  if (r.reason) return r.reason;
  const { W } = s.waterNow().model;
  const stored = runsToTiles(p.cells, W).sort((a, b) => a - b);
  const same = stored.length === r.tiles.length && stored.every((i, k) => i === r.tiles[k] && p.levels[k] === r.levels[k]);
  return same ? null : "the lake is no longer the one planned: draw it again";
}
