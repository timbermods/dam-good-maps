// The start's water (PLAN §20 D267 (4)): the lakes and rivers the start's pumps would draw from, and
// the land it would farm, for the editor's Drought and Badtide day strip. It uses the start's own
// water rule (D153, `start.water` in validate/playability.ts): a beaver walks from the district
// center over the map's own ground and slopes to a shore, and a pump on that shore reaches clean
// water 0.3 deep or more whose surface stands 0–2 levels below the shore.

import { footprintTiles, FOOTPRINTS, slopeHighSide, worldBlocks } from "../format/footprints";
import type { MapObject } from "../sim/model";
import { BAD, WALK_BLOCKERS, WET } from "../validate/playability";
import { pumpShoreDistance, PUMP_CLEAN, PUMP_DEPTH, PUMP_REACH, walkDistance } from "./walk";

/** The start's farmland: moist ground within this many tiles' walk of the start (the start rules'
 *  "near the start", as for trees and bushes within 20). */
export const FARM_WALK = 20;

export interface StartWater {
  /** The walk from the start (tiles, Infinity beyond the walk limit). */
  walk: Float64Array;
  /** The start's pump rule: a shore within this walk (the map's `waterWithin`). */
  within: number;
  /** Water tiles a pump on a shore within the walk reaches (the start's pumps' water). */
  pumped: number[];
  /** The lakes and rivers they belong to: the clean water joined to them, for the highlight. */
  body: number[];
  /** Moist dry ground within FARM_WALK tiles' walk: the land the start would farm. */
  farmland: number[];
}

/** The district center's middle tile, or null (no start, or more than one). */
export function startMiddle(objects: readonly MapObject[]): { x: number; y: number } | null {
  const starts = objects.filter((o) => o.template === "StartingLocation");
  if (starts.length !== 1) return null;
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, starts[0]).filter((b) => b.localZ === 0);
  let sx = 0;
  let sy = 0;
  for (const b of cells) {
    sx += b.x;
    sy += b.y;
  }
  return { x: Math.round(sx / cells.length), y: Math.round(sy / cells.length) };
}

/** The walk from the start over the map's own ground and slopes (as `start.water` walks it). */
export function startWalk(objects: readonly MapObject[], h: Uint8Array, W: number, H: number, start: { x: number; y: number }): Float64Array {
  const N = W * H;
  const blocked = new Uint8Array(N);
  for (const o of objects) {
    if (!WALK_BLOCKERS.has(o.template) || !FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
  }
  const links: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(o.orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([o.y * W + o.x, hy * W + hx]);
  }
  return walkDistance(h, W, H, blocked, links, start);
}

/** The start's water on the map as it is (day 0). */
export function startWater(inp: { W: number; H: number; heights: Uint8Array; walk: Float64Array; within: number; depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number> }): StartWater {
  const { W, H, heights: h, walk, within, depth: D, contamination: C, moisture: M } = inp;
  const N = W * H;
  const pumped: number[] = [];
  const inBody = new Uint8Array(N);
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!pumpable(i, W, H, h, walk, within, D, C)) continue;
    pumped.push(i);
    inBody[i] = 1;
    stack.push(i);
  }
  // the lakes and rivers they belong to: clean water joined to them (4-neighbours)
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x + 1 < W ? i + 1 : -1) : k === 2 ? (y > 0 ? i - W : -1) : y + 1 < H ? i + W : -1;
      if (n < 0 || inBody[n] || !(D[n] > WET) || !(C[n] < BAD)) continue;
      inBody[n] = 1;
      stack.push(n);
    }
  }
  const body: number[] = [];
  const farmland: number[] = [];
  for (let i = 0; i < N; i++) {
    if (inBody[i]) body.push(i);
    if (!(D[i] > WET) && M[i] > 0 && walk[i] <= FARM_WALK) farmland.push(i);
  }
  return { walk, within, pumped, body, farmland };
}

/** Whether a pump on a shore within the start's walk reaches water tile i (clean, 0.3 deep or more,
 *  its surface 0–2 levels below the shore). */
function pumpable(i: number, W: number, H: number, h: Uint8Array, walk: Float64Array, within: number, D: ArrayLike<number>, C: ArrayLike<number>): boolean {
  const d = D[i];
  if (!(d >= PUMP_DEPTH) || !(C[i] < PUMP_CLEAN)) return false;
  const surface = h[i] + d;
  const x = i % W;
  const y = (i - x) / W;
  for (let k = 0; k < 4; k++) {
    const n = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x + 1 < W ? i + 1 : -1) : k === 2 ? (y > 0 ? i - W : -1) : y + 1 < H ? i + W : -1;
    if (n < 0 || !(walk[n] <= within)) continue;
    const level = h[n];
    if (surface >= level - PUMP_REACH && surface <= level + 0.01) return true;
  }
  return false;
}

/** In a drought: whether the start still has water a pump reaches within its walk (the start's
 *  water rule on this day's water). */
export function startHasWater(sw: StartWater, h: Uint8Array, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>): boolean {
  return pumpShoreDistance(sw.walk, h, W, H, D, C).distance <= sw.within;
}

/** In a badtide: what badwater has reached on this day: the start's water (any tile its pumps
 *  reach turned bad), its farmland (any of it contaminated), or nothing. */
export function badtideReaches(sw: StartWater, C: ArrayLike<number>, soilContamination: ArrayLike<number>): "water" | "farmland" | null {
  for (const i of sw.pumped) if (C[i] >= BAD) return "water";
  for (const i of sw.farmland) if (soilContamination[i] > 0) return "farmland";
  return null;
}

/** The day strip's marker on `day` (D267 (4)), or null: in a drought, the first day the start's
 *  water is gone (`hadWater`: it had water a pump reaches on Day 0); in a badtide, the first day
 *  badwater reaches the start's water or its farmland. */
export function startMarker(hazard: "drought" | "badtide", sw: StartWater, hadWater: boolean, day: number, h: Uint8Array, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, soilContamination: ArrayLike<number>): string | null {
  if (hazard === "drought") return hadWater && !startHasWater(sw, h, W, H, D, C) ? `Day ${day}: your start's water is gone` : null;
  const reached = badtideReaches(sw, C, soilContamination);
  return reached === "water" ? `Day ${day}: badwater reaches your start's water` : reached === "farmland" ? `Day ${day}: badwater reaches your start's farmland` : null;
}

/** The strip's words when no day is marked: the start's water lasts, or there was none to lose. */
export function startNote(hazard: "drought" | "badtide", hadWater: boolean): string {
  if (hazard === "drought") return hadWater ? "Your start's water lasts the drought" : "No water a pump reaches near your start";
  return "Badwater doesn't reach your start";
}
