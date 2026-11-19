// The plan of the land (docs/design/uplands.md, round 2): a structure at the map's own scale, laid in the uplift
// before the genome's parts, so a 256² map has one large form a player can name. Two tiers (a floor and a top) from a
// slow warped field whose wavelength is the map's side, tied to the regional slope so the water still runs off it:
// where the field crosses a threshold the land steps from one tier to the next, so the step wanders as the field does.
// Nothing is drawn as an outline: the threshold is the field's quantile (the floor's share), its bays and points are
// its warp and its noise, and its side valleys are a ridged noise's lines that cut a tapering finger of the floor into
// the top. (Round 4 dropped Highlands' massif: Highlands is stacked ring terraces and big ringed hills, `rings.ts`.)
//
// - Canyon, a gorge: a tableland on three quarters of the land, the trunk's way through it a narrow floor along the
//   regional slope, side canyons cut into its walls.
// - River Valley, a valley: a broad floor along the trunk on about 40% of the land, uplands on both sides, notched by
//   side valleys.
//
// The plan's step in the field is a wall a tile or two across, wide only where a slow noise along it says a ramp
// comes down (`ramp`): there it takes a dozen tiles, so its levels step one at a time. `levels.ts` `snapLevels` reads
// the plan's tiers as its hypsometry (`planBands`): most of the land in the tiers' bands, the faces between them.
// Verticality sets the plan's strength (`planStrength`): low walls and wide ramps at 10, the theme's figures at its
// own, taller walls at 90. At 128² and under there is no plan; between 128² and 256² it grows with the map.
// Exact arithmetic: integer-hash noise, `portable.sqrt`, + − × ÷.

import * as portable from "../math/portable";
import { hash32 } from "../math/hash";
import { warpedFbm } from "../math/noise";
import { stream } from "../math/rng";
import { clamp, smoothstep } from "../math/clamp";
import { DIRS8, pctSorted } from "./num";
import { VT_DEFAULT, type ThemeId } from "../spec/mapspec";

export type PlanKind = "valley" | "gorge";

export interface Plan {
  kind: PlanKind;
  /** How strongly the plan shapes the land: 1 at the theme's own Verticality on a 256² map, 0 for none. */
  strength: number;
  /** The shares of the land in the floor and the top (they sum to 1). */
  shares: [number, number];
  /** The valley's or the gorge's line off the middle, across the slope (half-sides). */
  across: number;
  /** The share of a face that is a ramp, and how far the side valleys reach into the top (half-sides). */
  ramps: number;
  fingers: number;
}

/** The themes with a plan, and their tiers' shares (floor, top). */
const SHARES: Partial<Record<ThemeId, [number, number]>> = {
  canyon: [0.25, 0.75],
  riverValley: [0.42, 0.58],
};
const KIND: Partial<Record<ThemeId, PlanKind>> = { canyon: "gorge", riverValley: "valley" };

/** The plan's strength: nothing at 128² and under, growing to the whole at 256²; by Verticality 0.35 at 10, 1 at
 *  the theme's own, 1.35 at 90 (low walls and wide ramps, the theme's figures, walls of 6–8). */
export function planStrength(theme: ThemeId, vt: number, W: number, H: number): number {
  const size = clamp(Math.min(W, H) / 128 - 1, 0, 1);
  if (size <= 0 || !KIND[theme]) return 0;
  const d = VT_DEFAULT[theme];
  const s = vt <= d ? 0.35 + (0.65 * (vt - 10)) / Math.max(1, d - 10) : 1 + (0.35 * (vt - d)) / Math.max(1, 90 - d);
  return size * clamp(s, 0.2, 1.5);
}

/** The map's plan (round 2), from a stream of its own so the rest of the genome keeps its draws; null where there is
 *  none (another theme, or a map of 128² and under). */
export function drawPlan(theme: ThemeId, vt: number, seed: number, W: number, H: number, attempt: number, variation: number): Plan | null {
  const strength = planStrength(theme, vt, W, H);
  const kind = KIND[theme];
  const shares = SHARES[theme];
  if (strength <= 0 || !kind || !shares) return null;
  const r = stream(seed, "plan", theme, attempt, variation);
  const s = clamp(strength, 0, 1.35);
  return {
    kind,
    strength,
    shares: [...shares],
    across: (r.float() * 2 - 1) * (kind === "gorge" ? 0.12 : 0.15),
    // (low Verticality: more of each face a ramp; high, fewer)
    ramps: clamp(0.17 - 0.08 * s + 0.04 * r.float(), 0.05, 0.3),
    fingers: (kind === "gorge" ? 0.22 : 0.28) * (0.8 + 0.4 * r.float()),
  };
}

/** The plan's tiers as a field over the land as made (before the orientation): 0 on the floor, 1 on the top, the step
 *  between them a tile or two across (a dozen at a ramp). `flowDir` is the genome's regional slope (a planned land's is
 *  always linear, `drawGenome`): the valley and the gorge run along it, so the water runs off it. */
export function planField(p: Plan, ls: number, flowDir: number, W: number, H: number): Float64Array {
  const N = W * H;
  const S = Math.min(W, H);
  const half = S / 2;
  const [fx, fy] = DIRS8[flowDir];
  const s = hash32(ls, "plan");
  const R = new Float64Array(N);
  // (where along its wall each tile lies, along the slope, and on which side; the ways through are spaced along it)
  const al = new Float64Array(N);
  const side = new Uint8Array(N);
  const warp = 0.12 * S;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // (read through a slow warp of an eighth of the side, so no step runs straight)
      const wx = x + warp * warpedFbm(s + 1, x, y, 0.5 * S, 2, 0.1 * S);
      const wy = y + warp * warpedFbm(s + 2, x, y, 0.5 * S, 2, 0.1 * S);
      const u = (wx - (W - 1) / 2) / half;
      const v = (wy - (H - 1) / 2) / half;
      const a = u * fx + v * fy;
      const c = -u * fy + v * fx;
      // the bays and points: a noise of a quarter of the side
      const rough = 0.2 * warpedFbm(s + 3, x, y, 0.25 * S, 3, 0.08 * S);
      // the line meanders over the side in bends of two sizes, and the floor widens and narrows along it
      // (read along the slope only, so the floor runs unbroken from edge to edge and never loops)
      const at = a * half;
      const line = p.across + (p.kind === "gorge" ? 0.2 : 0.28) * warpedFbm(s + 4, at, 0, 0.7 * S, 2, 0) + 0.08 * warpedFbm(s + 8, at, 0, 0.25 * S, 2, 0);
      R[y * W + x] = Math.abs(c - line) / (1 + 0.35 * warpedFbm(s + 9, at, 0, 0.4 * S, 2, 0)) + rough;
      al[y * W + x] = at + half;
      side[y * W + x] = c > line ? 1 : 0;
    }
  // the threshold: the field's quantile at the floor's share
  const qf = pctSorted(Float64Array.from(R).sort(), p.shares[0]);
  // the side valleys: a ridged noise's lines, each a finger of the floor tapering into the top as far as `fingers`
  // past the step, so the walls are notched where tributaries come down
  const vs = s + 5;
  // (only a finger that reaches the lower tier: one the noise's line left apart from it, a sliver of floor up on the
  // top, is not cut)
  const finger = (F: Float64Array, q: number, reach: number) => {
    const cut = new Float64Array(N).fill(NaN);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const over = F[i] - q;
        if (over <= 0 || over >= reach) continue;
        const n = Math.abs(warpedFbm(vs, x, y, 0.3 * S, 2, 0.12 * S));
        const wide = 0.09 * (1 - over / reach);
        if (n < wide) cut[i] = q - 0.002 - (over * (wide - n)) / wide;
      }
    const queue: number[] = [];
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (F[i] <= q) seen[i] = 1;
    for (let i = 0; i < N; i++) {
      if (seen[i] || cut[i] !== cut[i]) continue;
      const x = i % W;
      if ((x > 0 && F[i - 1] <= q) || (x + 1 < W && F[i + 1] <= q) || (i >= W && F[i - W] <= q) || (i + W < N && F[i + W] <= q)) {
        seen[i] = 1;
        queue.push(i);
      }
    }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      F[i] = cut[i];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || cut[j] !== cut[j]) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
  };
  finger(R, qf, p.fingers);
  // the step's width in tiles: a tile and a half on a wall, a dozen at a ramp (a slow noise along the face, and a
  // way through every `WAY_EVERY` tiles of wall or so, wherever the wall runs: uplands round 3)
  const rs = s + 6;
  const wayAt = (along: number, sd: number, k0: number): number => {
    const k = Math.floor(along / WAY_EVERY);
    const at = (k + 0.2 + 0.6 * ((hash32(s, "way", k0, sd, k) >>> 0) / 4294967296)) * WAY_EVERY;
    return 1 - smoothstep((Math.abs(along - at) - WAY_HALF) / 4 + 0.5);
  };
  const T = new Float64Array(N);
  const stepOf = (F: Float64Array, i: number, x: number, y: number, q: number, ramp: number): number => {
    const gx = (F[y * W + Math.min(W - 1, x + 1)] - F[y * W + Math.max(0, x - 1)]) / 2;
    const gy = (F[Math.min(H - 1, y + 1) * W + x] - F[Math.max(0, y - 1) * W + x]) / 2;
    const grad = Math.max(1e-4, portable.sqrt(gx * gx + gy * gy));
    return smoothstep((F[i] - q) / ((1.5 + 10.5 * ramp) * grad) + 0.5);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const n = (warpedFbm(rs, x, y, 0.15 * S, 2, 0.08 * S) + 1) / 2;
      const ramp = smoothstep((n - (1 - p.ramps)) / 0.06 + 0.5);
      T[i] = stepOf(R, i, x, y, qf, Math.max(ramp, wayAt(al[i], side[i], 0)));
    }
  return T;
}

/** The plan's bands in levels, between the land's base and its top (`snapLevels`' hypsometry): the floor and the top,
 *  each [low, high], and the share of the land the face takes. The wall takes `WALL` levels at strength 1 (more with
 *  Verticality), the bands the rest, never under a level each. */
export function planBands(p: Plan, base: number, top: number): { bands: [number, number][]; shares: number[]; face: number } {
  const R = top - base;
  const gaps = 1;
  const nb = 2;
  const wall = Math.min(R - nb, WALL[p.kind] * p.strength);
  const shares: number[] = [...p.shares];
  // (each band's levels by its share of the land and a quarter more, so the broad floor rolls through more of them)
  const B = R - Math.max(0, wall);
  const wsum = shares.reduce((a, b) => a + b + 0.25, 0);
  const g = Math.max(0, wall) / gaps;
  const bands: [number, number][] = [];
  let at = base;
  for (let k = 0; k < nb; k++) {
    const band = (B * (shares[k] + 0.25)) / wsum;
    bands.push([at, at + band]);
    at += band + g;
  }
  return { bands, shares, face: 0.03 };
}

/** A way through each wall about every so many tiles along it (jittered from 0.4 to 1.6 of it apart), and its half
 *  width there, in tiles (uplands round 3: no wall runs 80 tiles without one). */
const WAY_EVERY = 50;
const WAY_HALF = 6;

/** The levels the wall from the floor to the top takes at strength 1 (a valley's lower, so its floor and its uplands
 *  roll through more levels each). */
const WALL = { valley: 5, gorge: 6 } as const;
