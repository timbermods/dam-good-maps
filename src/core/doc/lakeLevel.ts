// Lakes by number (D342): the player picks a lake and types its level, and the lake's sill is cut down or raised so
// the lake holds at that level (sim/sill.ts). The core question, `planLakeLevel`, answers what it would do before it
// acts: the sill's tiles, cut or raised, and where the water then stands, confirmed by the canonical settle of the map
// with the sill changed (the settle every map's water gets: the game's rules). Its `setLakeLevel` operation is applied
// as a Select action is (`applyLakeLevel`: one undo step, exact, the start carried if its ground broke).
//
// A lake at level L stands from L up to L plus the head of its flow over the sill, under one level: the hover readout's
// "Water at level 7.4" is a lake at level 7. Refused with one plain line when the land can't hold it there: the basin
// leaks elsewhere below the level, the level is at or below the lake's floor or above the ceiling, the water would
// spill off the map, no source fills the lake that high, or its river stands a level or more over the sill.

import { CEILING } from "../format/world";
import { runsToTiles, tilesToRuns } from "../math/grid";
import { WATER } from "../sim/fed";
import { canonicalSettle, spillLevels, type CanonicalWater } from "../sim/prefill";
import { MAX_SILL_WIDTH, sillFor, type SillPlan, type SillWay } from "../sim/sill";
import type { WaterModel } from "../sim/water";
import type { OpOf, OpParams } from "./ops";
import type { ApplyResult, MapSession } from "./session";
import { applySelection, selectionHeld } from "./start";

export type { SillWay };

/** What setting a lake's level would do, or why not. */
export interface LakeLevelPlan {
  /** The plain one-line reason it is refused, or null. */
  reason: string | null;
  /** The operation that does it (null when refused). */
  op: OpOf<"setLakeLevel"> | null;
  /** Cut down or raised (null when refused before a sill was found). */
  sill: SillWay | null;
  /** The tiles the sill changes, ascending (y·W + x); empty when refused before a sill was found. */
  tiles: number[];
  /** The level each of `tiles` is set to, in their order. */
  levels: number[];
  /** A cut notch's width in tiles, or a raised bank's spillway's. */
  width?: number;
  /** Where the settled water stands at the lake's tile once the sill is changed (NaN when refused before settling). */
  surface: number;
  /** The lake's tiles once settled: every tile its water covers, joined to the picked tile (empty when refused before
   *  settling). */
  lake: number[];
}

/** How many times a cut notch is widened when the river stands a level or more over it (each a settle). */
const WIDENINGS = 3;

/** Set the lake at tile (x, y) to `level`: the sill that holds it there (sim/sill.ts `sillFor`), and the canonical settle
 *  of the map with it, which must stand the lake's water at the level (from L up to under L + 1). `width`: a cut notch's
 *  width in tiles; by default the one the lake's inflow needs, widened (at most `WIDENINGS` times) while its river
 *  stands a level or more over it. Reads the map only. */
export function planLakeLevel(s: MapSession, x: number, y: number, level: number, width?: number): LakeLevelPlan {
  return measure(s, x, y, level, width).plan;
}

/** The last measure on each session, kept while its map stands as it was measured (its `built`): the page asks the
 *  question, then sets the level, and the second is the first's answer, never settled twice. */
const lastMeasure = new WeakMap<MapSession, { built: object; key: string; result: ReturnType<typeof measureNow> }>();

/** `planLakeLevel`, with the settle that confirmed it (the map's water model with the sill, and its canonical settle). */
function measure(s: MapSession, x: number, y: number, level: number, width?: number): ReturnType<typeof measureNow> {
  const key = `${x},${y},${level},${width ?? ""}`;
  const was = lastMeasure.get(s);
  if (was && was.built === s.built && was.key === key) return was.result;
  const result = measureNow(s, x, y, level, width);
  lastMeasure.set(s, { built: s.built, key, result });
  return result;
}

function measureNow(s: MapSession, x: number, y: number, level: number, width?: number): { plan: LakeLevelPlan; settled?: { model: WaterModel; water: CanonicalWater } } {
  const none = (reason: string, sill: SillPlan | null = null, surface = NaN) => ({ plan: { reason, op: null, sill: sill?.sill ?? null, tiles: sill?.tiles ?? [], levels: sill?.levels ?? [], ...(sill?.width ? { width: sill.width } : {}), surface, lake: [] } });
  const model = s.waterNow().model;
  const input = { model, heights: s.built.heights, fixed: heldOf(s) };
  let w = width;
  for (let tries = 0; ; tries++) {
    const r = sillFor(input, x, y, level, w);
    if ("reason" in r) return none(r.reason);
    const op = opOf(s, x, y, r);
    const errors = s.check(op);
    if (errors.length) return none(errors[0], r);
    const { W } = model;
    const at = y * W + x;
    const changed = withSill(model, r.tiles, r.levels);
    // (a notch lowers this lake only: one that lowers another lake's rim is refused before the settle)
    const other = r.sill === "cut" ? otherLake(model, changed, s.waterNow().depth, r.tiles, at) : null;
    if (other) return none(other, r);
    const water = canonicalSettle(changed);
    const depth = water.depth[at];
    const surface = changed.floor[at] + depth;
    const where = `X ${x} · Y ${y}`;
    if (!(depth > WATER)) return none(`no water reaches the lake at ${where}: a source must feed it`, r);
    if (surface < level - 0.01) return none(`the lake at ${where} would stand at ${two(surface)}, below level ${level}: its sources don't fill it that high`, r, surface);
    if (surface >= level + 1) {
      // (a notch the player didn't size is widened until its river stands under a level over it)
      if (r.sill === "cut" && width === undefined && tries < WIDENINGS && r.width! < MAX_SILL_WIDTH) {
        w = Math.min(MAX_SILL_WIDTH, r.width! + Math.max(1, Math.ceil(r.width! / 2)));
        continue;
      }
      const span = r.sill === "cut" ? `a notch ${r.width} ${r.width === 1 ? "tile" : "tiles"} wide` : `a spillway ${r.width} ${r.width === 1 ? "tile" : "tiles"} wide`;
      return none(`the lake at ${where} would stand at ${two(surface)} over ${span}, above level ${level}: its river needs a wider sill`, r, surface);
    }
    return { plan: { reason: null, op, sill: r.sill, tiles: r.tiles, levels: r.levels, ...(r.width ? { width: r.width } : {}), surface, lake: lakeTiles(changed, water.depth, at, surface) }, settled: { model: changed, water } };
  }
}

/** Set the lake at (x, y) to `level` (`planLakeLevel`), applied as a Select action: one undo step, exact, the objects on
 *  the sill riding its ground and the start carried to level ground if its own broke (doc/start.ts `applySelection`).
 *  The map's water is the settle that confirmed it, never settled twice (`MapSession.withSettled`). */
export function applyLakeLevel(s: MapSession, x: number, y: number, level: number, width?: number): ApplyResult & { plan: LakeLevelPlan } {
  const { plan, settled } = measure(s, x, y, level, width);
  if (!plan.op || !settled) return { ok: false, errors: [plan.reason ?? "the lake's level can't be set"], applied: [], dirty: null, plan };
  const op = plan.op;
  return { ...s.withSettled(settled.model, settled.water, () => applySelection(s, [op], lakeLevelLabel(op.params), plan.tiles)), plan };
}

/** The history's words for a `setLakeLevel` operation. */
export function lakeLevelLabel(p: OpParams["setLakeLevel"]): string {
  return `${p.sill === "cut" ? "Cut" : "Raise"} a lake's sill to level ${p.level}`;
}

/** Why a `setLakeLevel` operation doesn't fit the map now (null when it does): its sill, measured on the map as it
 *  stands, must be the one it stores (the engine's check; the settle is `planLakeLevel`'s). */
export function lakeLevelProblem(s: MapSession, p: OpParams["setLakeLevel"]): string | null {
  const { W, H } = s.waterNow().model;
  const [x, y] = p.at;
  if (x >= W || y >= H) return `X ${x} · Y ${y} is off the map`;
  if (p.level > CEILING) return `level ${p.level} is above the ceiling (level ${CEILING})`;
  const r = sillFor({ model: s.waterNow().model, heights: s.built.heights, fixed: heldOf(s) }, x, y, p.level, p.sill === "cut" ? p.width : undefined);
  if ("reason" in r) return r.reason;
  const stored = runsToTiles(p.cells, W).sort((a, b) => a - b);
  const same = stored.length === r.tiles.length && stored.every((i, k) => i === r.tiles[k] && p.levels[k] === r.levels[k]);
  if (r.sill !== p.sill || !same) return "the lake's sill is no longer the one measured: set its level again";
  return null;
}

function opOf(s: MapSession, x: number, y: number, r: SillPlan): OpOf<"setLakeLevel"> {
  return { op: "setLakeLevel", params: { at: [x, y], level: r.level, sill: r.sill, ...(r.sill === "cut" ? { width: r.width! } : {}), cells: tilesToRuns(r.tiles, s.size.x), levels: r.levels } };
}

/** The ground the sill leaves as it is on a map with caves (as Select's actions leave it): none on a heightfield. */
function heldOf(s: MapSession): ((i: number) => boolean) | undefined {
  if (!s.columns.size) return undefined;
  const held = selectionHeld(s);
  return held.size ? (i) => held.has(i) : undefined;
}

/** Why a notch can't be cut (null when it can): it lowers the level another lake spills at (standing water over a
 *  level deep, not the picked lake's), named at its deepest tile. */
function otherLake(before: WaterModel, after: WaterModel, depth: ArrayLike<number>, tiles: readonly number[], at: number): string | null {
  const was = spillLevels(before);
  const now = spillLevels(after);
  const mine = was[at];
  const cut = new Set(tiles);
  let worst = -1;
  for (let i = 0; i < was.length; i++) {
    if (!(depth[i] > 1) || was[i] === mine || cut.has(i) || !(now[i] < was[i] - 0.5)) continue;
    if (worst < 0 || depth[i] > depth[worst]) worst = i;
  }
  if (worst < 0) return null;
  const { W } = before;
  return `the notch would also drain the lake at X ${worst % W} · Y ${Math.floor(worst / W)} from level ${two(was[worst])} to ${two(now[worst])}`;
}

/** The water model with the sill's tiles at their levels (no object on them shapes the water: sim/sill.ts leaves
 *  those). */
function withSill(m: WaterModel, tiles: readonly number[], levels: readonly number[]): WaterModel {
  const floor = m.floor.slice();
  tiles.forEach((i, k) => (floor[i] = levels[k]));
  if (!m.stacked) return { ...m, floor };
  const mask = m.stacked.mask.slice();
  for (const i of tiles) mask[i] = (2 ** floor[i] - 1) >>> 0;
  return { ...m, floor, stacked: { ...m.stacked, mask } };
}

/** The lake's tiles: the water over 0.001 deep joined to `at` whose surface stands within a level of the lake's. */
function lakeTiles(m: WaterModel, depth: ArrayLike<number>, at: number, surface: number): number[] {
  const { W, H } = m;
  const seen = new Uint8Array(W * H);
  const out = [at];
  seen[at] = 1;
  for (let h = 0; h < out.length; h++) {
    const c = out[h];
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const n of [cy > 0 ? c - W : -1, cx > 0 ? c - 1 : -1, cy < H - 1 ? c + W : -1, cx < W - 1 ? c + 1 : -1]) {
      if (n < 0 || seen[n] || !(depth[n] > WATER) || Math.abs(m.floor[n] + depth[n] - surface) > 0.5) continue;
      seen[n] = 1;
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

function two(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}
