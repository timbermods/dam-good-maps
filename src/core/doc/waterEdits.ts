// Remove unfed water and Fill (PLAN §20 D387 (2) and (3), D394; D342): the core questions the editor
// asks before acting, each returning plain data and the operation that acts, applied like any other
// (`MapSession.apply`, one undo step).
//
// - `unfedWater(s, area?)`: the water no source feeds (sim/fed.ts), map-wide or within a selection:
//   how many pools, how many tiles of water, which tiles, and the `removeUnfedWater` operation that
//   takes it. A pool with a tile in the selection goes whole.
// - `planFill(s, x, y, level)`: a hollow filled with standing water to a level, with no source: how
//   many tiles, how much water, roughly how many days it lasts, and the `fillHollow` operation; or a
//   plain one-line reason the hollow doesn't hold water at that level.

import { unfedBodies, WATER } from "../sim/fed";
import { fillDays, fillLake } from "../sim/fill";
import { tilesToRuns } from "../math/grid";
import type { OpOf } from "./ops";
import type { MapSession } from "./session";

/** A rectangle of tiles, corners included. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What Remove unfed water would take ("12 pools, 3,400 tiles of water"). */
export interface UnfedWater {
  /** Bodies of unfed water (4-connected) that hold water the player sees (over 0.001 deep, as the
   *  hover readout says). */
  pools: number;
  /** Their tiles with water over 0.001 deep. */
  tiles: number;
  /** Their water, in blocks. */
  volume: number;
  /** Each pool's tiles (y·W + x), ascending, for the map to mark. */
  bodies: number[][];
  /** The operation that takes it (every unfed body counted or not, the thinnest films too), or
   *  null when there is no pool to take. */
  op: OpOf<"removeUnfedWater"> | null;
}

/** The unfed water on the map, or within `area` (a selection's tiles, or a rectangle): the water no
 *  source feeds by its connectivity as the settle moves it, a carve's sealed oxbow lakes and Fills
 *  included (sim/fed.ts). Measured on the settled water: water still settling (the editor's preview)
 *  is settled canonically first. */
export function unfedWater(s: MapSession, area?: Iterable<number> | TileRect | null): UnfedWater {
  if (s.waterPending) s.settleCanonical();
  const { model, depth } = s.waterNow();
  const { W, H } = model;
  let inside: Uint8Array | null = null;
  let picked: number[] | null = null;
  if (area) {
    inside = new Uint8Array(W * H);
    picked = [];
    const add = (i: number) => {
      if (i >= 0 && i < W * H && Number.isInteger(i) && !inside![i]) {
        inside![i] = 1;
        picked!.push(i);
      }
    };
    if (isRect(area)) {
      for (let y = Math.max(0, Math.min(area.y0, area.y1)); y <= Math.min(H - 1, Math.max(area.y0, area.y1)); y++)
        for (let x = Math.max(0, Math.min(area.x0, area.x1)); x <= Math.min(W - 1, Math.max(area.x0, area.x1)); x++) add(y * W + x);
    } else for (const i of area) add(i);
  }
  const all = unfedBodies(model, depth, inside);
  const bodies: number[][] = [];
  const take: number[] = [];
  let tiles = 0;
  let volume = 0;
  for (const b of all) {
    for (const i of b) take.push(i);
    let shown = 0;
    for (const i of b) {
      if (depth[i] > WATER) {
        shown++;
        volume += depth[i];
      }
    }
    if (!shown) continue;
    bodies.push(b);
    tiles += shown;
  }
  take.sort((a, b) => a - b);
  // (a film thinner than water a player sees goes with the pools, but alone is nothing to remove)
  const op: OpOf<"removeUnfedWater"> | null = bodies.length
    ? { op: "removeUnfedWater", params: { tiles: take, ...(picked && picked.length ? { area: tilesToRuns(picked, W) } : {}), pools: bodies.length } }
    : null;
  return { pools: bodies.length, tiles, volume, bodies, op };
}

/** What a Fill would make, or why not. */
export interface FillPlan {
  /** The plain one-line reason it is refused, or null. */
  reason: string | null;
  /** The operation that fills it (null when refused). */
  op: OpOf<"fillHollow"> | null;
  /** The hollow's tiles. */
  tiles: number;
  /** The water it stores, in blocks. */
  volume: number;
  /** Roughly how many game days the water lasts, by the game's evaporation (sim/fill.ts `fillDays`). */
  days: number;
}

/** A Fill to `level` at tile (x, y): the hollow round it filled with standing water, no source (D394).
 *  Refused with a plain reason when the hollow doesn't hold water at that level (it would spill off
 *  the map, the level is at or below the ground there, water already stands at that level) or the
 *  operation's check fails (a cave or overhang in it). */
export function planFill(s: MapSession, x: number, y: number, level: number): FillPlan {
  const { model, depth } = s.waterNow();
  const r = fillLake(model, x, y, level, depth);
  if ("reason" in r) return { reason: r.reason, op: null, tiles: 0, volume: 0, days: 0 };
  const op: OpOf<"fillHollow"> = { op: "fillHollow", params: { at: [x, y], level, lake: r.lake } };
  const errors = s.check(op);
  if (errors.length) return { reason: errors[0], op: null, tiles: 0, volume: 0, days: 0 };
  let volume = 0;
  for (const d of r.lake.depth) volume += d;
  return { reason: null, op, tiles: r.lake.tiles.length, volume, days: fillDays(model.W, model.H, r.lake) };
}

function isRect(a: Iterable<number> | TileRect): a is TileRect {
  return typeof (a as TileRect).x0 === "number" && typeof (a as Iterable<number>)[Symbol.iterator] !== "function";
}
