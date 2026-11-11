// The Irrigation view's analysis (MAPCRAFT principles 4 and 6): which dry ground the water could
// wet, and why each dry tile is dry. Headless, read only: it takes the soil rule's reach
// (sim/soil3d.ts `moistureReach3d`, the same rule the plants and the checks store) and the moisture
// the build stored, and never changes the map.
//
// Three tones of land (water and the tiles under it are left alone):
// - moist: the soil holds water now (the build's moisture > 0);
// - near: dry, but short by no more than one level's cost (6): the nearest water one level higher
//   would wet it, or, on level ground, water up to 6 tiles nearer (one level of climb costs the soil
//   what 6 tiles of spreading do, so "a few tiles" is that same 6);
// - dry for good: short by more, or no water reaches it (or Thorns bar its soil).

import { LEVEL_COST, MOIST_MIN, type MoistureReach } from "../sim/soil3d";

export const IRRIGATION_MOIST = 1;
export const IRRIGATION_NEAR = 2;
export const IRRIGATION_DRY = 3;

/** Per tile: 0 water, else `IRRIGATION_MOIST`, `IRRIGATION_NEAR` or `IRRIGATION_DRY`. `wet` marks the tiles under water
 *  (depth > 0) and `moisture` is the soil the build stored on each tile's top. */
export function irrigationTones(reach: MoistureReach, moisture: ArrayLike<number>, wet: ArrayLike<number>): Uint8Array {
  const N = moisture.length;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (wet[i] > 0) continue;
    if (moisture[i] > 0) out[i] = IRRIGATION_MOIST;
    else out[i] = !reach.barred[i] && reach.value[i] + LEVEL_COST >= MOIST_MIN ? IRRIGATION_NEAR : IRRIGATION_DRY;
  }
  return out;
}

const levelWords = (n: number) => `${n} level${n === 1 ? "" : "s"}`;
const tileWords = (n: number) => `${n} tile${n === 1 ? "" : "s"}`;

/** The tiles the soil carries the water along a path of `tiles` to a tile short by `value`: the last tile on it still
 *  moist (each tile less costs the soil 1). */
const carried = (tiles: number, value: number) => Math.max(0, Math.floor(tiles + value - MOIST_MIN + 1e-6));

/** Why a dry tile is dry, in one line for the hover: "3 levels above the nearest water", "9 tiles from water; soil
 *  carries it 7", both at once ("12 tiles from water and 2 levels above it; soil carries it 8"), "Thorns keep the soil
 *  dry" or "No water reaches here". Null on a moist tile (its value reaches `MOIST_MIN`). */
export function dryWords(reach: MoistureReach, i: number): string | null {
  if (reach.barred[i]) return "Thorns keep the soil dry";
  const v = reach.value[i];
  if (v === -Infinity) return "No water reaches here";
  if (v >= MOIST_MIN) return null;
  const levels = reach.levels[i];
  const tiles = reach.tiles[i];
  const n = Math.round(tiles);
  if (!levels) return `${tileWords(n)} from water; soil carries it ${carried(tiles, v)}`;
  // (the value the same path would have on level ground: the climb alone stops it when that is moist)
  const flat = v + LEVEL_COST * levels;
  if (flat >= MOIST_MIN) return `${levelWords(levels)} above the nearest water`;
  return `${tileWords(n)} from water and ${levelWords(levels)} above it; soil carries it ${carried(tiles, flat)}`;
}
