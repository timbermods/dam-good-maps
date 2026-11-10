// The field stage 1's rasters write (docs/PREMISES.md §2.2, stage 1): where water will be, its ground, and the least
// the land beside it may stand. Stage 2's relief keeps every `fixed` tile as it is and lifts the rest to at least
// `heights` (the guard), so the water stands where the table says whatever land is drawn round it.

import { hash32 } from "../../math/hash";
import type { PremisePlan } from "../types";

export interface WaterRaster {
  W: number;
  H: number;
  /** The ground: as built where `fixed`; elsewhere the least the land may stand (the guard), 0 where nothing asks.
   *  On its own it is "the rastered water alone" that the `land` checks run `flowThrough` on. */
  heights: Uint8Array;
  /** 1 where stage 1 decided the ground: beds, sills, lips, plunge pools, shoulders, islands, wadi strips, the
   *  start's 5 × 5. */
  fixed: Uint8Array;
  /** 1 + the body's index (`plan.bodies`) on its water: its bed, its plunge pools, its crests. */
  lake: Uint8Array;
  /** 1 + the link's index (`plan.links`) on a channel's bed: brooks, leats, the neck, the bypass, the gorge, the
   *  hanging valley and the landmark's crest. */
  channel: Uint8Array;
  /** 1 + the fall's link index on its plunge pool. */
  pool: Uint8Array;
  /** 1 + the fall's link index on its crest, two tiles thick. */
  crest: Uint8Array;
  /** A channel tile's distance along its link's path from the path's first point (negative inside its body). */
  along: Float32Array;
  /** The water's planned surface on each water tile (a dry body's or channel's when a work lets the water in); NaN on
   *  ground. */
  surface: Float32Array;
  /** Each fall's lip: the crest tiles that pour, in order along it. */
  lips: Record<string, number[]>;
  /** Each fall's notch and breach tiles (a level under its crest), and its piers (a level over). */
  notches: Record<string, number[]>;
  piers: Record<string, number[]>;
  /** Each link's rows of Blockages, the tiles of each (`Link.rows` in order). */
  rows: Record<string, number[][]>;
  /** Tiles taken off one water where it touched another it does not run into (they hold the guard instead). */
  parted: number;
}

export function emptyRaster(W: number, H: number): WaterRaster {
  const N = W * H;
  return {
    W,
    H,
    heights: new Uint8Array(N),
    fixed: new Uint8Array(N),
    lake: new Uint8Array(N),
    channel: new Uint8Array(N),
    pool: new Uint8Array(N),
    crest: new Uint8Array(N),
    along: new Float32Array(N),
    surface: new Float32Array(N).fill(NaN),
    lips: {},
    notches: {},
    piers: {},
    rows: {},
    parted: 0,
  };
}

/** Whether a tile is water (a body's, a channel's, a plunge pool's). */
export function isWater(r: WaterRaster, i: number): boolean {
  return r.lake[i] !== 0 || r.channel[i] !== 0;
}

/** Ground: no water, the ground stage 1 decided or none. */
export function clearWater(r: WaterRaster, i: number): void {
  r.lake[i] = 0;
  r.channel[i] = 0;
  r.pool[i] = 0;
  r.crest[i] = 0;
  r.surface[i] = NaN;
}

/** The four neighbours of a tile, -1 off the map. */
export function near4(W: number, H: number, i: number, out: Int32Array): Int32Array {
  const x = i % W;
  const y = (i - x) / W;
  out[0] = x > 0 ? i - 1 : -1;
  out[1] = x + 1 < W ? i + 1 : -1;
  out[2] = y > 0 ? i - W : -1;
  out[3] = y + 1 < H ? i + W : -1;
  return out;
}

/** A noise seed of the plan's own for one piece of water, so a change to one body never moves another. */
export function seedOf(plan: PremisePlan, ...parts: (string | number)[]): number {
  return hash32(plan.seed, plan.W, plan.H, "premise.water", ...parts);
}

/** The tiles of a box, clipped to the map. */
export function box(W: number, H: number, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W - 1, Math.ceil(x1)), Math.min(H - 1, Math.ceil(y1))];
}
