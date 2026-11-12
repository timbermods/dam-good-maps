// Stage 2 of the wall with one gate (docs/PREMISES.md §5.1, §2.2): the land round stage 1's water. Land first, story
// second (planning, 2026-11-11): every landform here is one geology makes, shaped by noise and distance as the shared
// relief shapes the themes' and the lake stair's, and the premise's constraint (the valley held at the megadam's water
// but through the gap) is checked on that land and mended by the least change. Nothing is laid along a line.
//
// - The valley is the shared relief's (`raster/relief.ts` `reliefBetween`, the spur its only ridge): the lake's
//   meadows, the brooks' valleys, the uplands.
// - The range: across its spine (`GateNumbers.range`, read through a warp so no contour follows it) the ground falls from
//   the crest, which rises and falls along it from the gap's saddle to the peak, to its foot on each side: in a concave
//   flank (talus at the foot) on soft rock, and on hard rock (patches of noise, and the Veil's buttress) high to a cliff
//   near the foot; ridged noise draws spurs and gullies down both flanks.
// - The gap: the Gate's gorge is stage 1's channel cut through the range where its crest is lowest; its walls are the
//   range's own flanks.
// - The basin: a dry lake in a depression past the range: its floor falls in rings that wander (old shorelines, a
//   level apart) to a pan a level over the beds' floor, under hills of uneven height that rise with the distance from
//   the pan; the dry beds cut their own valleys through it to the outlet.
// - The check and the mend: flooded from the lake at the megadam's water, the valley must reach neither the map's edge
//   nor the basin but by the Low River's gorge or the Gate; where it does, the land where the water crosses is raised
//   by the least that closes it, a knoll on a saddle or one low swell across a stretch of the edge (`mendFlood`).
//
// Every tile stage 1 fixed keeps the shared relief's ground, and every other stands at least at its guard.

import { BED_FLOOR } from "../land/genome";
import { cleanPitsAndSpikes, mergeSmallRegions, readable } from "../land/levels";
import { fbm } from "../math/noise";
import { polyDist } from "../math/polyline";
import { smoothstep } from "../math/clamp";
import { hypot } from "../math/portable";
import { badwaterNiches, reliefBetween } from "./raster/relief";
import { layWorks } from "./ladder";
import type { PremiseLand } from "./map";
import { frameAt, openingCamera, VISTA_ZOOM } from "../analysis/opening";
import type { MapSpec } from "../spec/mapspec";
import { checkFrame } from "./frame";
import type { InvariantResult } from "./types";
import { seedOf } from "./raster/field";
import type { ReliefStyle } from "./style";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";
import { CREST_VARIES, gateOf, onLocal, rangeAt, sideOf, spineLocal, turnOf, type GateNumbers } from "./premises/wallGate";
import { ruledLand } from "../validate/ruledLand";

/** The range's shape across it: the spine read through a warp of `warp` tiles (noise `warpCell` across), its half-widths
 *  wandering by `width` of themselves, knobs of `knob` levels on the crest, spurs and gullies of `spur` of the width,
 *  hard rock where its noise is over `hard` (about a third of the range; its face a cliff from `cliff` of the way down). The foot on the valley's side stands at the
 *  lake's sill + `foot`. */
export const RANGE_LAND = { warp: 5, warpCell: 17, width: 0.22, knob: 1.1, spur: 0.2, hard: 0.35, cliff: 0.75, foot: 2 } as const;
/** The basin's shape: the old lake's floor rising from the pan to the lake's sill + 1 at its shore, its rings wandering
 *  by `ring` levels; past the shore hills rising `rise` a tile to the gap's saddle + 1, with `hills` levels of uneven
 *  height (under the range); the dry beds' valleys
 *  rising `bank` a tile from a level over the bed. */
export const BASIN_LAND = { warp: 0.3, lobe: 0.25, ring: 1.3, rise: 0.22, hills: 2.4, bank: 0.5 } as const;

/** The valley's uplands stand this far under the range's highest peak at the most (the shared relief's ceiling). */
export const UNDER_PEAK = 4;

export interface GateZones {
  /** 0 the valley, 1 the range (between its feet), 2 the basin, per tile. */
  zone: Uint8Array;
}

/** Each tile's zone in the gate's layout (by the plan's range, unwarped). */
export function gateZones(plan: PremisePlan, g: GateNumbers = gateOf(plan)!): GateZones {
  const { W, H } = plan;
  const T = turnOf(plan, g);
  const zone = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      zone[y * W + x] = sideOf(g.range, u, v);
    }
  return { zone };
}

/** The basin's beds (the Gate Bed and the Pass Bed): each tile's distance to the nearest of their channel tiles past the
 *  range's crest, and that bed's level there. */
export function basinBeds(plan: PremisePlan, w: StageWater): { dist: Float32Array; bed: Float32Array } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const T = turnOf(plan, g);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const [gate, leat] = [li(g.gate), li(g.leat)];
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const bed = new Float32Array(N).fill(NaN);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (r.channel[i] !== gate && r.channel[i] !== leat) continue;
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    if (v < rangeAt(g.range, u).v) continue;
    dist[i] = 0;
    bed[i] = r.heights[i];
    queue.push(i);
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const d = dist[i] + (dx && dy ? 1.4142 : 1);
        if (d < dist[j] - 1e-6) {
          dist[j] = d;
          bed[j] = bed[i];
          queue.push(j);
        }
      }
  }
  return { dist, bed };
}

/** The basin's ground at a tile, unrounded: the old lake's floor in wandering rings from the pan to its shore, hills
 *  past it, the dry beds' valleys cut through both. */
function basinAt(plan: PremisePlan, g: GateNumbers, x: number, y: number, s: { warp: number; lobe: number; ring: number; hill: number; bank: number }, bedD: number, bedL: number): number {
  const { pan } = g;
  const sh = pan.shore;
  const wx = x + BASIN_LAND.warp * sh * fbm(s.warp, x, y, 0.6 * sh, 2);
  const wy = y + BASIN_LAND.warp * sh * fbm(s.warp + 1, x, y, 0.6 * sh, 2);
  const q = hypot(wx - pan.at[0], wy - pan.at[1]) * (1 + BASIN_LAND.lobe * fbm(s.lobe, x, y, 0.5 * sh, 2));
  const top = g.sill + 1;
  let L: number;
  if (q <= pan.r) L = pan.level + 0.3;
  else if (q <= sh) {
    // (a lake's bed: broad and low near the pan, steeper toward its old shore)
    const k = (q - pan.r) / (sh - pan.r);
    L = pan.level + 0.5 + k * (0.45 + 0.55 * k) * (top - pan.level) + BASIN_LAND.ring * fbm(s.ring, x, y, 13, 2);
  } else L = Math.min(g.saddle + 1, top + 0.4 + (q - sh) * BASIN_LAND.rise) + BASIN_LAND.hills * (0.2 + fbm(s.hill, x, y, 17, 3));
  // (the old lake's floor never over its shore's level)
  if (q <= sh) L = Math.min(L, top + 0.4);
  // the dry beds' own valleys, through the floor and the hills to the outlet
  // (its banks wander: the distance read through noise, so no level runs beside the bed at one width)
  if (bedD < Infinity) L = Math.min(L, bedL + 1 + BASIN_LAND.bank * Math.max(0, bedD * (1 + 0.45 * fbm(s.bank, x, y, 9, 2)) - 1.5 + 2.5 * fbm(s.bank + 1, x, y, 13, 2)));
  return L;
}

/** Stage 2 of a gate plan: the whole map's ground round stage 1's water. */
export function gateRelief(plan: PremisePlan, w: StageWater, style?: ReliefStyle, notes: string[] = []): Uint8Array {
  const g = gateOf(plan);
  if (!g) return reliefBetween(plan, w, style);
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  // the valley: the shared relief, the spur its only ridge, its uplands under the range's peak by `UNDER_PEAK` (its own
  // ceiling, `top` and `sky`: a style's uplands rose over the range, and the range is the map's great feature)
  const ceiling = Math.min(plan.top, g.crest - UNDER_PEAK);
  const h0 = reliefBetween({ ...plan, top: ceiling, sky: ceiling, ridges: plan.ridges.filter((x) => x.id === g.spur) }, w, style);
  const T = turnOf(plan, g);
  const R = g.range;
  const spine = spineLocal(R);
  const S = (name: string) => seedOf(plan, "gate", name);
  const sWu = S("wu");
  const sWv = S("wv");
  const sHw = S("hw");
  const sCr = S("crest");
  const sSp = S("spur");
  const sHard = S("hard");
  const bs = { warp: S("bwarp"), lobe: S("blobe"), ring: S("bring"), hill: S("bhill"), bank: S("bbank") };
  const { dist: bedD, bed: bedL } = basinBeds(plan, w);
  const veil = plan.links.find((l) => l.id === g.veil)!;
  const lipU = veil.fall!.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5])[0]);
  const [lu0, lu1] = [Math.min(...lipU) - 0.5, Math.max(...lipU) + 0.5];
  const valleyFoot = g.sill + RANGE_LAND.foot;
  const f = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      // the spine read through a warp, so the range's contours wander and its foot never follows a line
      const wu = u + RANGE_LAND.warp * fbm(sWu, x, y, RANGE_LAND.warpCell, 3);
      const wv = v + RANGE_LAND.warp * fbm(sWv, x, y, RANGE_LAND.warpCell, 3);
      const ra = rangeAt(R, wu);
      const front = wv < ra.v;
      const half = (front ? ra.front : ra.back) * (1 + RANGE_LAND.width * fbm(sHw, x, y, 14, 2));
      // (spurs and gullies: ridged noise reaching the flanks out and in; not across the Veil's face, a cliff it pours from)
      const atVeil = front && u > lu0 - 1 && u < lu1 + 1 ? 1 : 0;
      const ridged = atVeil ? 0 : 1 - 2 * Math.abs(fbm(sSp, x, y, 9, 2));
      const t = polyDist(wu, wv, spine) / half - RANGE_LAND.spur * ridged;
      const basin = front ? -Infinity : basinAt(plan, g, x, y, bs, bedD[i], bedL[i]);
      const foot = front ? valleyFoot : basin;
      let rangeH = -Infinity;
      if (t < 1) {
        const crest = ra.crest + RANGE_LAND.knob * fbm(sCr, x, y, 8, 2);
        const tt = Math.max(0, t);
        // soft rock: a concave flank, talus at the foot; hard rock high to a cliff near the foot (the Veil's buttress
        // is hard: its face a cliff the lip pours from)
        const soft = (1 - tt) * (1 + 0.6 * tt);
        const firm = tt < RANGE_LAND.cliff ? 1 - 0.4 * tt : ((1 - 0.4 * RANGE_LAND.cliff) * (1 - tt)) / (1 - RANGE_LAND.cliff);
        const hard = Math.max(atVeil, smoothstep((fbm(sHard, x, y, 12, 2) - RANGE_LAND.hard) / 0.25));
        rangeH = foot + Math.max(0, crest - foot) * (soft + (firm - soft) * hard);
      }
      if (front) {
        // the valley's own land comes in toward the foot, never under the range's flank
        const k = smoothstep((t - 0.55) / 0.5);
        f[i] = t < 1 ? Math.max(rangeH, h0[i] * k + rangeH * (1 - k)) : h0[i];
      } else f[i] = t < 1 ? Math.max(rangeH, basin) : basin;
    }
  // (stage 1's ground beside a dry bed in the range, its wadi strips, is the range's own: the gorge's walls are its
  // flanks, and a wadi strip a level over the bed through the range let the valley out at the megadam's water)
  const { zone } = gateZones(plan, g);
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) keep[i] = r.fixed[i] && !(zone[i] === 1 && !r.lake[i] && !r.channel[i] && !r.pool[i] && !r.crest[i]) ? 1 : 0;
  const h = new Uint8Array(N);
  const top = Math.max(plan.top, plan.sky ?? plan.top);
  for (let i = 0; i < N; i++) h[i] = keep[i] ? h0[i] : Math.max(r.heights[i], Math.max(BED_FLOOR + 1, Math.min(top, Math.round(f[i]))));
  // no pits, spikes or slivers (the build's own rules), stage 1's ground kept; in the range and the basin no spike, wall
  // or trench one or two tiles wide standing two levels or more out of the land round it (the themes' rule at high
  // Verticality, `readable`: a hard face cut by a gully stood as towers beside the start)
  const rd = Uint8Array.from(h);
  readable(rd, W, H);
  for (let i = 0; i < N; i++) if (!keep[i] && zone[i] !== 0) h[i] = rd[i];
  mergeSmallRegions(h, W, H, 4, keep);
  cleanPitsAndSpikes(h, W, H, keep);
  for (let i = 0; i < N; i++) if (!keep[i] && h[i] < r.heights[i]) h[i] = r.heights[i];
  const mends = mendFlood(plan, w, h);
  if (mends) notes.push(`The valley held at the megadam's water by ${mends} rise${mends === 1 ? "" : "s"} where it spilled`);
  return h;
}

/** The tiles the valley's water reaches at the megadam's level from the lake, the Gate's channel and the Low River's
 *  gorge shut; the first tile where it leaves the valley (the map's edge or past the range's crest), with the way it
 *  came; and, with `all`, every flooded tile on the map's edge. */
function floodAt(plan: PremisePlan, w: StageWater, h: ArrayLike<number>, all = false): { leak: number; from: Int32Array; edge: number[] } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const T = turnOf(plan, g);
  const lake = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  const shut = new Set([plan.links.findIndex((l) => l.id === g.low) + 1, plan.links.findIndex((l) => l.id === g.gate) + 1]);
  const lowIx = plan.links.findIndex((l) => l.id === g.low) + 1;
  const from = new Int32Array(W * H).fill(-2);
  const queue: number[] = [];
  const edge: number[] = [];
  let leak = -1;
  for (let i = 0; i < W * H; i++) if (r.lake[i] === lake) (from[i] = -1), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    const onEdge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
    if (onEdge || v > rangeAt(g.range, u).v) {
      if (leak < 0) leak = i;
      if (!all) break;
      if (onEdge) edge.push(i);
      continue;
    }
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
      if (from[j] !== -2 || shut.has(r.channel[j]) || h[j] > g.megadam) continue;
      // (the gorge's own fall, the Low River's lip, is the megadam's)
      if (r.crest[j] === lowIx) continue;
      from[j] = i;
      queue.push(j);
    }
  }
  return { leak, from, edge };
}

/** The flood check and its least mend (planning: "where water would cross the range anywhere but the gap, raise that
 *  saddle by the least that closes it, with the relief's own shape"): while the valley at the megadam's water spills,
 *  the ground it spills over is raised a level or two over that water, never on stage 1's ground: across the range, a
 *  knoll of ragged outline on the saddle it crossed; at the map's edge, one swell across the whole stretch the valley
 *  reaches the edge by (a low divide, its outline wandering, its crest set in from the edge), not a bead a tile. The
 *  mends made. */
export function mendFlood(plan: PremisePlan, w: StageWater, h: Uint8Array, most = 16, skip?: Uint8Array): number {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const s = seedOf(plan, "gate", "mend");
  const raise = (x0: number, y0: number, x1: number, y1: number, d: (x: number, y: number) => number) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
        const i = y * W + x;
        if (r.fixed[i] || skip?.[i]) continue;
        const q = d(x, y) * (1 + 0.3 * fbm(s, x, y, 5, 2));
        if (q >= 1) continue;
        const want = g.megadam + 1 + Math.round(1.6 * (1 - q * q));
        if (h[i] < want) h[i] = want;
      }
  };
  let mends = 0;
  for (; mends < most; mends++) {
    const { leak, from, edge } = floodAt(plan, w, h, true);
    if (leak < 0) break;
    if (edge.length) {
      // the longest stretch of the edge the flood reaches (tiles along one side, gaps of three or less joined)
      const side = (i: number) => {
        const x = i % W;
        const y = (i - x) / W;
        return y === 0 ? 0 : y === H - 1 ? 1 : x === 0 ? 2 : 3;
      };
      const along = (i: number) => (side(i) < 2 ? i % W : Math.floor(i / W));
      let best: number[] = [];
      for (let sd = 0; sd < 4; sd++) {
        const ts = edge.filter((i) => side(i) === sd).sort((p, q) => along(p) - along(q));
        let run: number[] = [];
        for (const i of ts) {
          if (run.length && along(i) - along(run[run.length - 1]) > 3) {
            if (run.length > best.length) best = run;
            run = [];
          }
          run.push(i);
        }
        if (run.length > best.length) best = run;
      }
      const sd = side(best[0]);
      const a0 = along(best[0]);
      const a1 = along(best[best.length - 1]);
      const half = (a1 - a0) / 2 + 4;
      const deep = Math.max(5, Math.min(14, (a1 - a0) / 3 + 3));
      const mid = (a0 + a1) / 2;
      // (the swell in the edge's own frame: along it and in from it)
      const toEdge = (x: number, y: number): [number, number] => (sd === 0 ? [x - mid, y] : sd === 1 ? [x - mid, H - 1 - y] : sd === 2 ? [y - mid, x] : [y - mid, W - 1 - x]);
      const [x0, y0, x1, y1] = sd < 2 ? [mid - half, sd === 0 ? 0 : H - 1 - deep * 1.4, mid + half, sd === 0 ? deep * 1.4 : H - 1] : [sd === 2 ? 0 : W - 1 - deep * 1.4, mid - half, sd === 2 ? deep * 1.4 : W - 1, mid + half];
      raise(x0, y0, x1, y1, (x, y) => {
        const [p, q] = toEdge(x, y);
        return hypot(p / half, (q - deep * 0.45) / (deep * 0.7));
      });
      continue;
    }
    // across the range: a knoll on the saddle, a few tiles back along the way the water came
    let at = leak;
    let back = 0;
    for (let i = leak; i >= 0 && back < 3; i = from[i]) {
      if (!r.fixed[i] && !skip?.[i]) at = i;
      back++;
    }
    const ax = at % W;
    const ay = (at - ax) / W;
    const rad = 4 + (mends % 3);
    raise(ax - rad - 2, ay - rad - 2, ax + rad + 2, ay + rad + 2, (x, y) => hypot(x - ax, y - ay) / rad);
  }
  return mends;
}

/** A gate plan's land as `map.ts` `premiseLand` makes the lake stair's: its relief (stage 2), the permanent badwater's
 *  niche cut into it and the works' own ground (`layWorks`), for `premiseMap`. */
export function gateLand(plan: PremisePlan, water: StageWater, style?: ReliefStyle): PremiseLand {
  const notes: string[] = [];
  const heights = gateRelief(plan, water, style, notes);
  const niches = badwaterNiches(plan, water, heights, notes);
  // (the niche is cut beside the Low River's gorge past the spur; where it opens a way out at the megadam's water, the
  // check and its mend run again, the niche kept)
  const skip = new Uint8Array(plan.W * plan.H);
  for (const [nx, ny] of Object.values(niches))
    for (let y = Math.max(0, ny - 4); y <= Math.min(plan.H - 1, ny + 4); y++) for (let x = Math.max(0, nx - 4); x <= Math.min(plan.W - 1, nx + 4); x++) skip[y * plan.W + x] = 1;
  const more = mendFlood(plan, water, heights, 16, skip);
  if (more) notes.push(`The valley held round the badwater's niche by ${more} more rise${more === 1 ? "" : "s"}`);
  const laid = layWorks(plan, water, heights);
  return { water, heights, niches, laid, notes };
}

// ------------------------------------------------------------------------------------------------- the land's invariants

/** What a land invariant reads: stage 1's water and stage 2's ground. `StageContext` has no ground yet (§5.1 "As built
 *  (relief)" says the edit), so these run by `gateLandFailures`, not with the def's `land` invariants. */
export interface GateLandContext {
  spec: MapSpec;
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
}

export interface GateLandInvariant {
  id: string;
  test(ctx: GateLandContext): InvariantResult;
}

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The crest's ground along the range: at each tile of u (local, the gorge's tiles and the map's last two at each end
 *  aside), the highest dry ground within the range's band there. */
export function crestLine(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): number[] {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const T = turnOf(plan, g);
  const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const best = new Array<number>(W).fill(-1);
  const gorge = new Uint8Array(W);
  for (let i = 0; i < W * H; i++) {
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    const k = Math.floor(u);
    if (k < 0 || k >= W) continue;
    if (r.channel[i] === gate && sideOf(g.range, u, v) === 1) gorge[k] = 1;
    if (sideOf(g.range, u, v) !== 1 || r.lake[i] || r.channel[i] || r.pool[i]) continue;
    if (heights[i] > best[k]) best[k] = heights[i];
  }
  const out: number[] = [];
  for (let k = 2; k < W - 2; k++) if (!gorge[k] && best[k] >= 0) out.push(best[k]);
  return out;
}

/** `range.crest` (planning's ruling: a crest that rises and falls by four levels or more with peaks and saddles; no
 *  flat-topped slab): along the range its crest's ground varies by `CREST_VARIES` levels or more, and no run of it
 *  longer than `SLAB` of the map's side stands at one level. */
const rangeCrest: GateLandInvariant = {
  id: "range.crest",
  test({ plan, water, heights }) {
    const c = crestLine(plan, water, heights);
    if (!c.length) return fail("The range has no crest");
    const hi = Math.max(...c);
    const lo = Math.min(...c);
    if (hi - lo < CREST_VARIES) return fail(`The range's crest varies by ${hi - lo} levels (${CREST_VARIES} or more)`);
    let run = 1;
    const most = Math.round(SLAB * plan.W);
    for (let k = 1; k < c.length; k++) {
      run = c[k] === c[k - 1] ? run + 1 : 1;
      if (run > most) return fail(`The range's crest stands at ${c[k]} for ${run} tiles: a flat-topped slab (${most} at most)`);
    }
    return OK;
  },
};
const SLAB = 0.25;

/** The lowest crossing from the valley to the basin, the Gate's channel shut: the least, over every way across the
 *  range's crest, of the highest ground on it (a priority flood from the valley's water). */
export function lowestCrossing(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>, shutGate = true): number {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const T = turnOf(plan, g);
  const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const lake = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  const N = W * H;
  const best = new Float64Array(N).fill(Infinity);
  // (a bucket queue by level: levels are small integers)
  const buckets: number[][] = [];
  const push = (i: number, l: number) => {
    best[i] = l;
    (buckets[l] ??= []).push(i);
  };
  for (let i = 0; i < N; i++) if (r.lake[i] === lake) push(i, heights[i]);
  const past = (i: number) => {
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    return v > rangeAt(g.range, u).v + rangeAt(g.range, u).back;
  };
  for (let l = 0; l < buckets.length; l++)
    for (let k = 0; k < (buckets[l]?.length ?? 0); k++) {
      const i = buckets[l][k];
      if (best[i] < l) continue;
      if (past(i)) return l;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        if (shutGate && r.channel[j] === gate) continue;
        const nl = Math.max(l, heights[j]);
        if (nl < best[j]) push(j, nl);
      }
    }
  return Infinity;
}

/** `gate.lowest` (planning's ruling: the gap is the one low way through, where the range's lowest saddle is): the
 *  lowest crossing of the range runs through the Gate's gorge, and with the Gate shut the lowest other crossing stands
 *  at the gap's saddle or over it. */
const gateLowest: GateLandInvariant = {
  id: "gate.lowest",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const open = lowestCrossing(plan, water, heights, false);
    const other = lowestCrossing(plan, water, heights, true);
    if (!(other > open)) return fail(`The lowest way across the range (${other}) is not the Gate's gorge (${open})`);
    if (other < g.saddle) return fail(`Away from the Gate the range is crossed at ${other}, under the gap's saddle (${g.saddle})`);
    return OK;
  },
};

/** `wall.camera`, its land half (§5.1: from the opening camera at the vista's zoom the range crosses the frame): its
 *  high ground (within two levels of its crest there) spans 60 % or more of the frame's width. */
const wallCamera: GateLandInvariant = {
  id: "wall.camera",
  test({ plan, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const T = turnOf(plan, g);
    const cam = openingCamera(plan.frame.start, VISTA_ZOOM);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < W * H; i++) {
      const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
      if (sideOf(g.range, u, v) !== 1 || heights[i] < rangeAt(g.range, u).crest - 2) continue;
      const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, heights[i]);
      if (!p || Math.abs(p.v) > 1 || Math.abs(p.u) > 1) continue;
      lo = Math.min(lo, p.u);
      hi = Math.max(hi, p.u);
    }
    const span = hi > lo ? (hi - lo) / 2 : 0;
    return span >= CREST_SPAN ? OK : fail(`From the opening camera the range spans ${Math.round(100 * span)} % of the frame's width (${100 * CREST_SPAN} % or more)`);
  },
};
const CREST_SPAN = 0.6;

/** `basin.bowl`, its land half (planning's ruling: a dry lake in a natural depression, lower than the valley's lake):
 *  the pan's ground at most a level over its own level and under the lake's sill, the old lake's floor (the basin's
 *  ground joined to the pan at the sill + 1 or under, the beds' channels aside) `FLOOR_LEAST` of the map or more, and
 *  nowhere joined to the valley's side of the range's crest. */
const basinBowl: GateLandInvariant = {
  id: "basin.bowl",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const px = Math.floor(g.pan.at[0]);
    const py = Math.floor(g.pan.at[1]);
    const T = turnOf(plan, g);
    const pr = Math.max(2, Math.floor(g.pan.r * 0.7));
    let pan = 0;
    let high = 0;
    for (let y = py - pr; y <= py + pr; y++)
      for (let x = px - pr; x <= px + pr; x++) {
        const i = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || r.fixed[i] || (x - px) * (x - px) + (y - py) * (y - py) > pr * pr) continue;
        pan++;
        if (heights[i] > g.pan.level + 1) high++;
      }
    if (!pan || high > pan / 3) return fail(`The basin's pan stands over ${g.pan.level + 1} on ${high} of its ${pan} middle tiles`);
    // the old lake's floor: the ground at the sill + 1 or under joined to the pan (the beds' own channels aside, which
    // the Gate's gorge joins to the valley), the range's crest a wall it stops at
    const top = g.sill + 1;
    const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
    const beds = new Set([li(g.gate), li(g.leat)]);
    const seen = new Uint8Array(W * H);
    // (from the pan's lowest free tile)
    let p0 = -1;
    for (let y = Math.max(0, py - pr); y <= Math.min(H - 1, py + pr); y++)
      for (let x = Math.max(0, px - pr); x <= Math.min(W - 1, px + pr); x++) {
        const i = y * W + x;
        if (!r.fixed[i] && (p0 < 0 || heights[i] < heights[p0])) p0 = i;
      }
    if (p0 < 0 || heights[p0] > top) return fail("The basin's pan has no ground at the lake's sill + 1 or under");
    const queue = [p0];
    seen[queue[0]] = 1;
    let n = 0;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      n++;
      const x = i % W;
      const y = (i - x) / W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= W * H || seen[j] || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1) || heights[j] > top || beds.has(r.channel[j])) continue;
        const [u, v] = onLocal(T, [(j % W) + 0.5, Math.floor(j / W) + 0.5]);
        if (v < rangeAt(g.range, u).v) return fail(`The basin's floor at ${top} or under reaches the valley at ${j % W}, ${Math.floor(j / W)}`);
        seen[j] = 1;
        queue.push(j);
      }
    }
    if (n < FLOOR_LEAST * W * H) return fail(`The dry lake's floor is ${n} tiles (${Math.round(FLOOR_LEAST * W * H)} or more)`);
      return OK;
  },
};
const FLOOR_LEAST = 0.025;

/** `valley.enclosed`, its land half (§5.1): the valley's floor closed at the megadam's level all round but for the Low
 *  River's gorge: from the lake, over ground at or under the megadam's water, neither the map's edge nor the range's
 *  crest is reached but through the gorge (the megadam's slot) or the Gate (dammed with it). */
const valleyEnclosed: GateLandInvariant = {
  id: "valley.enclosed",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { leak } = floodAt(plan, water, heights);
    if (leak < 0) return OK;
    return fail(`At the megadam's water (${g.megadam}) the valley spills at ${leak % plan.W}, ${Math.floor(leak / plan.W)}`);
  },
};

/** `terrain.ruled_land` on stage 2's ground (planning: land first, nothing ruled): the shared look check's three numbers
 *  under its limits, day 1's planned water as the wet tiles. */
const ruled: GateLandInvariant = {
  id: "terrain.ruled_land",
  test({ plan, water, heights }) {
    const r = water.raster;
    const wet = new Uint8Array(plan.W * plan.H);
    for (let i = 0; i < wet.length; i++) {
      const l = r.channel[i] ? plan.links[r.channel[i] - 1] : null;
      if (r.lake[i] || r.pool[i] || r.crest[i] || (l && l.wet)) wet[i] = 1;
    }
    const m = ruledLand(heights, wet, plan.W, plan.H);
    return m.ok ? OK : fail(`Ruled land: ${(100 * m.straight).toFixed(1)} % straight, ${(100 * m.bands).toFixed(1)} % in bands, ${m.corners.toFixed(1)} corners per 1,000`);
  },
};

/** `frame.lip`, its land half (§5.1, the lake stair's stage 3 `checkFrame` on this land, with no level land of its
 *  own asked: the shared gate holds the start's room): the start's 5 × 5 dry and level with a level door, the Veil's
 *  lip and foot in the first frame, the frame's water shallow. */
const frameLip: GateLandInvariant = {
  id: "frame.lip",
  test({ plan, water, heights }) {
    const f = checkFrame(plan, water, Uint8Array.from(heights), { bench: 0, moist: 0, reach: 0 });
    return f.reason ? fail(f.reason) : OK;
  },
};

/** The gate's land invariants, judged on stage 2's ground. */
export const GATE_LAND_CHECKS: GateLandInvariant[] = [rangeCrest, gateLowest, wallCamera, basinBowl, valleyEnclosed, ruled, frameLip];

/** The land invariants a gate plan's ground fails, each with its one line. */
export function gateLandFailures(ctx: GateLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of GATE_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
