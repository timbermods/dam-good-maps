// Stage 2 of the poisoned floodplain (docs/design/poisoned-floodplain.md §1 to §3, §7; PREMISES.md §5.1 "Land first,
// story second"): the valley a river made, round stage 1's water. Every landform is one a river makes, shaped by noise
// and by distance from the plan's wandering lines; nothing is laid along a ruled line.
//
// - The floor: the plain at `L`, a level down at each riser the plan wanders across it; the backswamp a level under the
//   plain along the far wall's foot, its edge a wandering riser; the start's terrace two over the plain at its head, its
//   lip a lobe whose edge wanders and steps down a level or two at once; the sloughs, dry beds a level under the plain
//   from the levee's low places to the backswamp. The floor's lines are read through a warp of a few tiles, so no
//   contour follows the plan's lines exactly.
// - The levees (`raster/levee.ts`): a bank each side of the river, its height and width the plan's noise along it.
// - The walls: from each foot the ground rises in crags and benches (the shared relief's `rise`, its heights drawn by
//   noise), ribbed by a noise along the wall that brings the contours out in spurs and back in re-entrants, to a crest
//   that rises and falls along the wall; past the crest it climbs on to the theme's own upland (`reliefBetween` in River
//   Valley's style), or falls back to it, in crags and benches of its own, so the valley's sides and the land beyond
//   meet without a seam.
// - The side valleys: hanging valleys cut into both walls; the far wall's in rock that stands over their heads' floors
//   (a hanging valley's walls hold its water), their floors 3 to 5 over the foot; beside most of the far wall's, a
//   beheaded valley, the old course its stream took before it was captured, heading in a low saddle beside it and
//   falling away from the floor to a map edge.
// - The search (§3): of the far wall's side valleys whose mouths open in the search window (the badwater distance to
//   75 % of the plain), nearest first, the first that holds as the gulch (its mouth 3 to 5 over the backswamp, a
//   narrows 3 wide or fewer in its lower half, its lowest way out but its mouth 2 or more over the narrows and on to an
//   edge, a way the start faces that frames its fall), within the mend's budget, the mended land read as `col.over`
//   and `fork.own` read it. The plan's gulch, col, Dry Fork, red water and the start's facing are re-sited to what was
//   found (`resiteGulch`), stage 1 drawn again and the relief made again round it; the gulch is judged again in that
//   land, the plan re-sited to the new measure, and the land mended by taking ground away only (`mendGulch`).
//
// Every tile stage 1 fixed keeps its ground; every other stands at least at its guard.

import { openingCamera, VISTA_ZOOM } from "../analysis/opening";
import { ORIENTATIONS, type Orientation } from "../format/footprints";
import { BED_FLOOR } from "../land/genome";
import { smoothstep } from "../math/clamp";
import { fbm } from "../math/noise";
import { flowThrough } from "../sim/prefill";
import { sillWidthFor } from "../sim/sill";
import { gameSoil } from "../sim/soil";
import type { MapSpec } from "../spec/mapspec";
import { rulesFor } from "../validate/playability";
import { ruledLand } from "../validate/ruledLand";
import type { StyleTheme } from "./choice";
import { failing, PLAN_TRIES } from "./draw";
import { checkFrame, dayOneWater, type FrameCheck } from "./frame";
import { dist, headingOf, pathDist } from "./geom";
import { bankRun, leveeBanks, longestStraight, type LeveeForm } from "./raster/levee";
import { seedOf } from "./raster/field";
import { reliefBetween, rise } from "./raster/relief";
import { premiseStyle, type ReliefStyle } from "./style";
import type { Body, InvariantResult, Link, Point, PremisePlan, Work } from "./types";
import { waterByNumber, type StageWater } from "./water";
import {
  crestOver,
  DEAD_SHARE,
  DRY_LEAST,
  edgeAt,
  GULCH,
  leveeFoot,
  leveeWidth,
  lineAt,
  onMap,
  PLAIN_IDS,
  plainLevel,
  plainOf,
  poisonedPlain,
  riverLocal,
  TERRACE,
  toLocal,
  toMap,
  turnOf,
  walk,
  WALL,
  WINDOW,
  framedRuns,
  type PlainNumbers,
  type Turn,
} from "./premises/poisonedPlain";

const I = PLAIN_IDS;
/** The Red Spring stands this many tiles inside the gulch's head; the Red Pool this far out from the wall's foot (the plan's
 *  pools); the Dry Fork falls this much at least from under the col to its edge. */
const RED_POOL = 2;
const RED_FOOT = 2;
const FORK_FALL_MIN = 3;
/** How far the Dry Fork's way keeps clear of the land that drains onto the floor at the col's level (tiles): its bed
 *  and the tile either side cut, and a tile of the old ground past them. */
const FORK_CLEAR = 3;
/** The Dry Fork's way tile its first point stands on (`resiteGulch` keeps every fourth: its second is the fifth). */
const FORK_POUR = 4;
/** The noise the lowest way out breaks its ties by (tiles across): the Dry Fork's way over level land wanders. */
const WAY_TIE_CELL = 7;

// ------------------------------------------------------------------------------------------------- the numbers

/** The floor's lines are read through a warp of `amp` tiles (noise `cell` tiles across), so no contour follows the
 *  plan's lines exactly; the backswamp's edge wanders a further `swamp` tiles, and the plain's risers a further `riser`
 *  tiles down the valley (noise `riserCell`: the plan's risers wander a tile or two, and on the ground read as ruled
 *  lines across the plain). */
export const FLOOR_WARP = { amp: 2.2, cell: 13, swamp: 1.2, swampCell: 9, riser: 7, riserCell: 11, calm: [4, 8] as const } as const;
/** The start's terrace: its lip a lobe `bulge` tiles down the valley at its middle (of its width), wandering `wander`
 *  tiles by noise `cell` across; its side toward the river `strip` tiles past the levee's foot (the river's own strip
 *  of plain); its edge steps down a level to a bench `step` tiles wide, then to the plain (a bench wide enough to be a
 *  region of its own: the slopes join the terrace, the bench and the plain, `features/slopes.ts`). */
export const TERRACE_LAND = { lip: 1, bulge: [2, 6], wander: 2, cell: 11, strip: [3, 7], step: [2.5, 6] } as const;
/** The levees' width on the land: the plan's width, drawn in toward its middle (`keep`), with a quicker wander of its
 *  own (`wander` tiles, noise `cell` along the river) so no bank's foot runs straight; 3 to 6 tiles still. */
export const LEVEE_LAND = { mid: 4.5, keep: 0.4, wander: 2.5, cell: 5 } as const;
/** The walls: crags of `c1` and `c2`, benches `bench` wide, later crags `cn` (the shared relief's `rise`, each drawn in
 *  its range by noise `cell`), each bench's width wandering by up to `benchVary` of itself across the wall (noise
 *  `benchCell`); ribs that bring the contours out and back `rib` tiles (noise `ribCell` along the wall);
 *  the crest `vary` levels either way along the wall (noise `crestCell`), the far wall's `far` or more over the
 *  plain (its side valleys hang up to 5 over the backswamp and rise 3 to their heads, and their rock stands 4 to 6 over
 *  that); past the crest the land climbs on to the upland, or falls back to it, in crags and benches of its own. */
export const WALL_LAND = { c1: [1, 3], c2: [1, 3], bench: [3, 8], benchVary: 1.5, benchCell: 10, cn: 2, cell: 17, rib: 6, ribCell: 14, knot: 3, knotCell: 8, vary: 2, crestCell: 29, far: 12 } as const;
/** The far wall's side valleys: their mouths every `apart` tiles along the foot (from the terrace's head), `len` long
 *  into the wall, slanting up to `slant`, wandering `wander` tiles (noise `wanderCell`); their floors `hang` over the
 *  foot at the mouth, rising `rise` to the head; half-widths `half`, pinched to `pinch` (a narrows where its stream
 *  crossed harder rock, on `pinchShare` of them: every one, the search needs it) at `pinchAt` of their length over `pinchLen` tiles; their walls `side` levels a tile; the hard rock round a
 *  mouth `hard` tiles either side past its half-width; the rock they are cut in standing `sides` levels or more over
 *  their heads' floors for `collar` tiles past their half-widths (a hanging valley's walls stand over its floor: water in it
 *  leaves by its mouth or over a col, never over its side onto the wall's face). */
export const SIDE_VALLEY = { apart: [14, 24], len: [18, 28], slant: 0.4, wander: 2.2, wanderCell: 12, hang: [3, 5], rise: [1, 3], half: [2, 3.5], pinch: [0.8, 1.2], pinchShare: 1, pinchAt: [0.3, 0.45], pinchLen: [3, 5], side: 1.1, hard: 4, sides: [4, 6], collar: 5 } as const;
/** The near wall's side valleys: smaller, hanging lower. */
export const NEAR_VALLEY = { apart: [20, 34], len: [10, 18], hang: [1, 4], half: [1.5, 2.6] } as const;
/** The beheaded valleys beside the far wall's side valleys (`share` of them): heading `gap` tiles past the side
 *  valley's wall at `at` of its length, their bed `over` its floor there, falling away from the floor (turned up to
 *  `turn` radians off straight back) to a map edge, `half` tiles across at the bed, their sides `side` levels a tile. */
export const OLD_VALLEY = { share: 0.9, at: [0.5, 0.75], gap: [2, 3.5], over: [1, 2], turn: 0.7, half: [1.5, 2.5], wander: 9, wanderCell: 26 } as const;
/** The mend's budget (§3): at most `share` of the map's tiles changed. */
export const MEND = { share: 0.04 } as const;

// ------------------------------------------------------------------------------------------------- the side valleys

/** A side valley of a wall, in the local frame: its centre line from the mouth on the foot into the wall (a point a
 *  tile), its floor over the foot at the mouth and its rise to the head, its half-width along it. */
export interface SideValley {
  wall: "far" | "near";
  /** The level its wall rises from at its mouth (the backswamp under the far wall, the plain under the near). */
  foot: number;
  /** Its mouth's u on the wall's foot. */
  mouth: number;
  line: Point[];
  hang: number;
  rise: number;
  half: number[];
  /** Where its narrows is (tile index along `line`), or -1. */
  pinch: number;
  /** Its beheaded neighbour, if it has one: its centre line from its head (local; ends past the map's edge), its bed
   *  over the side valley's floor at the head, and the side valley's point it heads beside. */
  old?: { line: Point[]; over: number; at: number; half: number; box: [number, number, number, number] };
  /** Its box in the local frame (u0, v0, u1, v1), its reach included. */
  box: [number, number, number, number];
}

/** A local line's box, widened by `by`. */
function boxOf(line: readonly Point[], by: number): [number, number, number, number] {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [u, v] of line) {
    u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v);
  }
  return [u0 - by, v0 - by, u1 + by, v1 + by];
}
const inBox = (b: readonly number[], u: number, v: number) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];

const S = (plan: PremisePlan, name: string) => seedOf(plan, "plain", name);
const inRange = (r: readonly [number, number], n: number) => r[0] + (r[1] - r[0]) * Math.max(0, Math.min(1, (n + 1) / 2));
const hashU = (seed: number, k: number, j: number) => (Math.abs(fbm(seed, k * 37.1 + 0.5, j * 53.3 + 0.5, 1.7, 1)) * 7919) % 1;

/** A small seeded stream of the land's own (the side valleys' draws), so the plan's streams are untouched. */
function landRng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return { f: next, r: (a: number, b: number) => a + (b - a) * next() };
}

/** The side valleys of both walls, drawn by the land's own seed along the whole of each wall (never at the plan's
 *  gulch: the search finds the gulch among them). */
export function sideValleys(plan: PremisePlan, p: PlainNumbers = plainOf(plan)!): SideValley[] {
  const T = turnOf(plan, p);
  const out: SideValley[] = [];
  const brookU = (() => {
    const b = plan.links.find((l) => l.id === I.brook)?.path;
    return b ? toLocal(T, b[0])[0] : -Infinity;
  })();
  for (const wall of ["far", "near"] as const) {
    const g = landRng(S(plan, `valleys.${wall}`));
    const line = wall === "far" ? p.far : p.near;
    const sg = wall === "far" ? 1 : -1;
    const cfg = wall === "far" ? SIDE_VALLEY : { ...SIDE_VALLEY, ...NEAR_VALLEY };
    const wSeed = S(plan, `wander.${wall}`);
    for (let a = p.terrace[0] + g.r(0, cfg.apart[1]); a < T.U; a += g.r(cfg.apart[0], cfg.apart[1])) {
      const vf = lineAt(line, p.step, a);
      const len = g.r(cfg.len[0], cfg.len[1]);
      const slant = g.r(-SIDE_VALLEY.slant, SIDE_VALLEY.slant);
      const dir: Point = [Math.sin(slant), sg * Math.cos(slant)];
      const nrm: Point = [dir[1], -dir[0]];
      const pts: Point[] = [];
      const k = out.length;
      for (let s = 0; s <= len + 0.01; s += 1) {
        const w = SIDE_VALLEY.wander * fbm(wSeed, s, k * 97, SIDE_VALLEY.wanderCell, 2) * Math.min(1, s / 4);
        pts.push([a + dir[0] * s + nrm[0] * w, vf + dir[1] * s + nrm[1] * w]);
      }
      // (none over the terrace's brook: its spring stands in the far wall's slope there)
      if (wall === "far" && Math.abs(a - brookU) < 10) continue;
      if (!onMap(T, pts[0], 2) || !onMap(T, pts[pts.length - 1], 1)) continue;
      const hang = Math.round(g.r(cfg.hang[0], cfg.hang[1] + 0.99) - 0.49);
      const riseK = Math.round(g.r(SIDE_VALLEY.rise[0], SIDE_VALLEY.rise[1] + 0.99) - 0.49);
      const h0 = g.r(cfg.half[0], cfg.half[1]);
      const pinched = wall === "far" && g.f() < SIDE_VALLEY.pinchShare;
      const pAt = Math.round(len * g.r(SIDE_VALLEY.pinchAt[0], SIDE_VALLEY.pinchAt[1]));
      const pLen = g.r(SIDE_VALLEY.pinchLen[0], SIDE_VALLEY.pinchLen[1]);
      const pHalf = g.r(SIDE_VALLEY.pinch[0], SIDE_VALLEY.pinch[1]);
      const half = pts.map((_, s) => {
        const base = h0 + 0.6 * fbm(wSeed, s, k * 97 + 50, 6, 2);
        if (!pinched) return Math.max(1.6, base);
        const t = Math.abs(s - pAt) / (pLen / 2);
        return t >= 1 ? Math.max(1.6, base) : pHalf + (Math.max(1.6, base) - pHalf) * smoothstep(t);
      });
      const foot = wall === "far" ? (a < p.plainFrom ? p.L + TERRACE.rise : plainLevel(p, a, vf) - 1) : levelAt(p, a, vf);
      // (a far valley's head under the map's top less two, where its spring's water may stand)
      const rises = wall === "far" ? Math.max(0, Math.min(riseK, plan.top - 2 - foot - hang)) : riseK;
      const v: SideValley = { wall, foot, mouth: a, line: pts, hang, rise: rises, half, pinch: pinched ? pAt : -1, box: boxOf(pts, 14) };
      if (wall === "far" && g.f() < OLD_VALLEY.share) {
        // the beheaded valley: heads beside the side valley's wall and falls away from the floor to an edge
        const at = Math.round(len * g.r(OLD_VALLEY.at[0], OLD_VALLEY.at[1]));
        const side = g.f() < 0.5 ? 1 : -1;
        const c = pts[Math.min(pts.length - 1, at)];
        const off = half[Math.min(half.length - 1, at)] + g.r(OLD_VALLEY.gap[0], OLD_VALLEY.gap[1]) + g.r(OLD_VALLEY.half[0], OLD_VALLEY.half[1]);
        const head: Point = [c[0] + side * nrm[0] * off * sg, c[1] + side * nrm[1] * off * sg];
        const turn = side * g.r(0.15, OLD_VALLEY.turn);
        const od: Point = [Math.sin(turn), sg * Math.cos(turn)];
        const on: Point = [od[1], -od[0]];
        const oSeed = S(plan, `old.${k}`);
        const ol: Point[] = [head];
        for (let s = 1; s < 3 * T.U; s += 1) {
          const w = OLD_VALLEY.wander * fbm(oSeed, s, 0, OLD_VALLEY.wanderCell, 3) * Math.min(1, s / 12);
          const q: Point = [head[0] + od[0] * s + on[0] * w, head[1] + od[1] * s + on[1] * w];
          ol.push(q);
          if (!onMap(T, q, -2)) break;
        }
        if (!onMap(T, ol[ol.length - 1], -1)) v.old = { line: ol, over: Math.round(g.r(OLD_VALLEY.over[0], OLD_VALLEY.over[1] + 0.99) - 0.49), at, half: g.r(OLD_VALLEY.half[0], OLD_VALLEY.half[1]), box: boxOf(ol, 18) };
      }
      out.push(v);
    }
  }
  // (an old valley never runs through another side valley: one whose course comes within a side valley's rock of
  // another's is left out, and its side valley stands alone)
  for (const v of out) {
    if (!v.old) continue;
    const o = v.old;
    if (out.some((w) => w !== v && o.line.some((q) => nearOnLine(w.line, q[0], q[1]).d < Math.max(...w.half) + SIDE_VALLEY.collar))) delete v.old;
  }
  return out;
}

/** The nearest point of a local polyline (a point a tile) to (u, v): its distance and its index (fractional). */
export function nearOnLine(line: readonly Point[], u: number, v: number): { d: number; s: number } {
  let best = Infinity;
  let at = 0;
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k];
    const b = line[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / l2)) : 0;
    const ex = a[0] + dx * t - u;
    const ey = a[1] + dy * t - v;
    const d = ex * ex + ey * ey;
    if (d < best) {
      best = d;
      at = k + t;
    }
  }
  return { d: Math.sqrt(best), s: at };
}

// ------------------------------------------------------------------------------------------------- the relief

/** What the relief keeps for the search, the mend and the checks: each tile's local frame (warped), the floor's mask
 *  (1 plain, 2 backswamp, 3 terrace, 4 slough), the foot level each wall rises from. */
export interface PlainRelief {
  heights: Uint8Array;
  floor: Uint8Array;
  valleys: SideValley[];
  /** The levees' banks over the land (`raster/levee.ts`), 0 elsewhere. */
  bank: Uint8Array;
  levee: LeveeForm;
}

/** The levees of a plan as a raster form: the river's path on the map, its banks' widths and crests from the plan's
 *  numbers (side "a" of the path is the plain's side when the path runs down the valley with +v on its left). */
export function leveeOf(plan: PremisePlan, p: PlainNumbers = plainOf(plan)!): LeveeForm {
  const river = plan.links.find((l) => l.id === I.river)!;
  const rp = river.path!;
  const T = turnOf(plan, p);
  // (which side of the path is the plain's: +v in the local frame)
  const a = toLocal(T, rp[0]);
  const b = toLocal(T, rp[1]);
  const pa = toMap(T, [a[0], a[1] + 1]);
  const cross = (rp[1][0] - rp[0][0]) * (pa[1] - rp[0][1]) - (rp[1][1] - rp[0][1]) * (pa[0] - rp[0][0]);
  void b;
  const plainSide = cross > 0 ? "a" : "b";
  const side = (sd: "a" | "b") => (sd === plainSide ? "plain" : "near");
  const wSeed = S(plan, "levee.width");
  return {
    path: rp,
    half: river.half ?? 2.5,
    from: p.levee.from,
    to: p.levee.to,
    // (held inside 3 to 6 softly: a hard clamp would hold a width, and a bank beside a straight reach, straight)
    width: (s, sd) => LEVEE_LAND.mid + 1.5 * Math.tanh((LEVEE_LAND.keep * (leveeWidth(p, s, side(sd)) - LEVEE_LAND.mid) + LEVEE_LAND.wander * fbm(wSeed, s, sd === "a" ? 0 : 300, LEVEE_LAND.cell, 1)) / 1.5),
    over: (s, sd) => crestOver(p.levee[side(sd)], s),
    seed: S(plan, "levee"),
  };
}

/** The plain's level at a local point (L above the plain's head). */
const levelAt = (p: PlainNumbers, u: number, v: number) => (u < p.plainFrom ? p.L : plainLevel(p, u, v));

/** Stage 2's ground for a plan and its water (stage 1), the upland the theme's (`upland`, `reliefBetween` on the same
 *  water in the theme's style). The side valleys as drawn; the mend comes after the search. */
export function plainRelief(plan: PremisePlan, w: StageWater, upland: Uint8Array): PlainRelief {
  const p = plainOf(plan)!;
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const T = turnOf(plan, p);
  const sky = Math.max(plan.top, plan.sky ?? plan.top);
  const sWu = S(plan, "warp.u");
  const sWv = S(plan, "warp.v");
  const sSw = S(plan, "swamp");
  const sRiser = S(plan, "riser");
  const sLip = S(plan, "lip");
  const sStrip = S(plan, "strip");
  const sStep = S(plan, "step");
  const sC = [S(plan, "c1"), S(plan, "c2"), S(plan, "bench")];
  const sRib = S(plan, "rib");
  const sBench = S(plan, "bench.vary");
  const sKnot = S(plan, "knot");
  const sCrest = S(plan, "crest");
  const sSide = S(plan, "side");
  const river = plan.links.find((l) => l.id === I.river)!;
  const half = river.half ?? 2.5;
  const foot = leveeFoot(p, T.U, half, riverLocal(T, river.path!));
  const footAt = (u: number) => {
    const k = Math.max(0, Math.min(foot.length - 1, Math.round(u)));
    return Number.isFinite(foot[k]) ? foot[k] : lineAt(p.near, p.step, u) + p.room[1] + half + 4;
  };
  const valleys = sideValleys(plan, p);
  const gulch = p.found ? valleys[p.found.valley] : null;
  const g = landRng(S(plan, "terrace"));
  const bulge = g.r(TERRACE_LAND.bulge[0], TERRACE_LAND.bulge[1]);
  const st = plan.frame.start;
  const [uS, vS] = toLocal(T, [st.x + 0.5, st.y + 0.5]);

  const h = new Uint8Array(N);
  const floor = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u0, v0] = toLocal(T, [x + 0.5, y + 0.5]);
      // (the warp fades to nothing round the gulch the search found: its mouth, lip and pool stand where stage 1 put
      // them)
      const calm = gulch ? smoothstep((Math.abs(u0 - gulch.mouth) - FLOOR_WARP.calm[0]) / (FLOOR_WARP.calm[1] - FLOOR_WARP.calm[0])) : 1;
      const u = u0 + calm * FLOOR_WARP.amp * fbm(sWu, x, y, FLOOR_WARP.cell, 2);
      const v = v0 + calm * FLOOR_WARP.amp * fbm(sWv, x, y, FLOOR_WARP.cell, 2);
      const vn = lineAt(p.near, p.step, u);
      const vf = lineAt(p.far, p.step, u);
      let z: number;
      if (v >= vn && v <= vf) {
        // the floor
        const lv = levelAt(p, u + calm * FLOOR_WARP.riser * fbm(sRiser, x, y, FLOOR_WARP.riserCell, 2), v);
        const vb = vf - lineAt(p.swamp, p.step, u) + FLOOR_WARP.swamp * fbm(sSw, x, y, FLOOR_WARP.swampCell, 2);
        // the terrace: from its strip past the levee's foot to the far wall, down the valley to its lip
        const side = footAt(u) + inRange(TERRACE_LAND.strip, fbm(sStrip, u, 0, 9, 2));
        const across = Math.max(0, Math.min(1, (v - side) / Math.max(1, vf - side)));
        let lip = p.plainFrom + TERRACE_LAND.lip + bulge * Math.sin(Math.PI * across) + TERRACE_LAND.wander * fbm(sLip, v, 0, TERRACE_LAND.cell, 2);
        // (its bench never within three tiles of the start's 5 × 5: the start stands on the terrace)
        if (Math.abs(v - vS) < 6) lip = Math.max(lip, uS + 5 + TERRACE_LAND.step[1]);
        const inside = Math.min(lip - u, v - side);
        if (inside > 0) {
          const step = inRange(TERRACE_LAND.step, fbm(sStep, x, y, 9, 2));
          z = p.L + (inside > step ? TERRACE.rise : 1);
          floor[i] = 3;
        } else if (v >= vb) {
          z = lv - 1;
          floor[i] = 2;
        } else {
          z = lv;
          floor[i] = 1;
        }
      } else {
        // the walls: from the foot's level, crags and benches to the crest, then the upland
        const far = v > vf;
        const d = far ? v - vf : vn - v;
        const uf = u;
        const F = far ? (uf < p.plainFrom ? p.L + TERRACE.rise : levelAt(p, uf, vf) - 1) : levelAt(p, uf, vn);
        const rib = WALL_LAND.rib * fbm(sRib, uf, far ? 0 : 500, WALL_LAND.ribCell, 2) * Math.min(1, d / 4);
        const t = Math.max(0, d + rib + WALL_LAND.knot * fbm(sKnot, x, y, WALL_LAND.knotCell, 2) * Math.min(1, d / 3));
        const c1 = Math.round(inRange(WALL_LAND.c1, fbm(sC[0], uf, far ? 0 : 500, WALL_LAND.cell, 2)));
        const c2 = Math.round(inRange(WALL_LAND.c2, fbm(sC[1], uf, far ? 0 : 500, WALL_LAND.cell, 2)));
        // (each bench's width wanders on its own across the wall: benches pinch out and crags merge, no band runs
        // beside the next for the wall's length)
        const bw = Math.max(1.5, inRange(WALL_LAND.bench, fbm(sC[2], uf, far ? 0 : 500, WALL_LAND.cell, 2)) * (1 + WALL_LAND.benchVary * fbm(sBench, x, y, WALL_LAND.benchCell, 2)));
        const crest = Math.min(sky - 1, (far ? Math.max(p.walls.far, p.L + WALL_LAND.far) : p.walls.near) + WALL_LAND.vary * fbm(sCrest, uf, far ? 0 : 500, WALL_LAND.crestCell, 2));
        let up = rise(t, c1, bw, c2, WALL_LAND.cn);
        // hard rock round a far side valley's mouth: a cliff to over its floor at once
        let hardTop = 0;
        for (const sv of valleys) {
          if (sv.wall !== (far ? "far" : "near")) continue;
          const du = Math.abs(u0 - sv.mouth);
          const reach = sv.half[0] + SIDE_VALLEY.hard;
          if (du > reach + 3) continue;
          const k = 1 - smoothstep((du - reach) / 3);
          if (k > 0 && t > 0.6) hardTop = Math.max(hardTop, k * (sv.hang + 1 + Math.min(2, (t - 0.6) * 0.5)));
        }
        up = Math.max(up, hardTop);
        const wallZ = F + Math.min(up, crest - F);
        // (past the crest, the upland, over a broad blend: where the wall stands full)
        let full = 0;
        for (let lo = 0, hi = 120, k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          if (rise(mid, c1, bw, c2, WALL_LAND.cn) >= crest - F) hi = mid;
          else lo = mid;
          full = hi;
        }
        // (the upland over the crest: the land climbs on to it, or falls back to it, in crags and benches of its own)
        const up2 = Math.max(BED_FLOOR + 1, upland[i]);
        if (t > full) {
          const more = rise(t - full, c2, bw * 1.3, c1, WALL_LAND.cn);
          z = up2 >= wallZ ? Math.min(up2, wallZ + more) : Math.max(up2, wallZ - more);
        } else z = wallZ;
        // the far wall's side valleys stand in rock over their floors (their collars), then every side valley's floor
        // and walls are cut into the wall, taking ground only
        for (const sv of valleys) {
          if (sv.wall !== "far" || !far || !inBox(sv.box, u0, v0)) continue;
          const nq = nearOnLine(sv.line, u0, v0);
          const len = sv.line.length - 1;
          const k = Math.min(len, Math.round(nq.s));
          const e = nq.s >= len - 0.01 ? nearOnLine([sv.line[len]], u0, v0).d : nq.d;
          // (by the foot the collar climbs in crags from the wall's foot: sheer only where the gulch's fall will be)
          const top = Math.min(crest, F + 2 + 3 * d, floorAt(sv, len) + inRange(SIDE_VALLEY.sides, fbm(sSide, x, y, 15, 2)));
          const c = top - rise(Math.max(0, e - Math.max(...sv.half) - SIDE_VALLEY.collar), 3, 2, 3, 3);
          if (c > z) z = c;
        }
        for (const sv of valleys) {
          if (sv.wall !== (far ? "far" : "near")) continue;
          // (in the plan's own frame, unwarped, as the search reads them)
          if (!inBox(sv.box, u0, v0) && !(sv.old && inBox(sv.old.box, u0, v0))) continue;
          const nq = nearOnLine(sv.line, u0, v0);
          const k = Math.min(sv.half.length - 1, Math.round(nq.s));
          const len = sv.line.length - 1;
          const sideCrag = sv.wall === "far" ? 4 : 2;
          const fl = floorAt(sv, nq.s);
          if (nq.s >= len - 0.01) {
            const e = nearOnLine([sv.line[len]], u0, v0).d;
            const cut = fl + 0.6 + rise(Math.max(0, e - sv.half[len]), sideCrag, 2, sideCrag, 2);
            if (cut < z) z = cut;
          } else {
            // (its walls in crags of two or three with ledges between, never a stair of a level a tile)
            const cut = fl + rise(Math.max(0, nq.d - sv.half[k]), sideCrag, 1.2 + 1.2 * (fbm(sSide, x, y, 11, 2) + 1), sideCrag, 2);
            if (cut < z) z = cut;
          }
          if (sv.old && inBox(sv.old.box, u0, v0)) {
            const o = sv.old;
            const oq = nearOnLine(o.line, u0, v0);
            const flAt = floorAt(sv, o.at);
            const bed = flAt + o.over - Math.min(6, oq.s / 7);
            // (an old valley: broad, its sides in low crags with benches between)
            const off = oq.s < 0.01 ? nearOnLine([o.line[0]], u0, v0).d : oq.d;
            const cut = bed + rise(Math.max(0, off - o.half), 2, 2 + 1.5 * (fbm(sSide, x, y, 13, 2) + 1), 2, 2);
            if (cut < z) z = cut;
          }
        }
      }
      h[i] = Math.max(BED_FLOOR + 1, Math.min(sky, Math.round(z)));
    }
  // the sloughs: dry beds a level under the plain
  for (const sl of p.sloughs) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (floor[i] !== 1 && floor[i] !== 2) continue;
        const q = pathDist(x + 0.5, y + 0.5, sl.path);
        if (q.d > sl.half + 0.35) continue;
        // (the bed's level where it runs: a level under the plain there, never under the backswamp's)
        const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
        const want = levelAt(p, u, v) - 1;
        if (want < h[i]) {
          h[i] = want;
          floor[i] = 4;
        }
      }
  }
  // the levees: the banks over the land where they stand
  const levee = leveeOf(plan, p);
  const banks = leveeBanks(W, H, levee);
  for (let i = 0; i < N; i++) if (banks.over[i] && floor[i]) h[i] = Math.min(sky, h[i] + banks.over[i]);
  // stage 1's ground as it is, every other tile at least at its guard
  for (let i = 0; i < N; i++) h[i] = r.fixed[i] ? r.heights[i] : Math.max(h[i], r.heights[i]);
  return { heights: h, floor, valleys, bank: banks.over, levee };
}

/** The plan's skeleton for the search: the plan without the gulch's water (the Red Fall, the Red Spring and its
 *  source), so the land the search reads is the wall's own. */
export function plainSkeleton(plan: PremisePlan): PremisePlan {
  const gone = new Set<string>([I.redFall]);
  return { ...plan, links: plan.links.filter((l) => !gone.has(l.id)), bodies: plan.bodies.filter((b) => b.id !== I.redSpring), sources: plan.sources.filter((s) => s.into !== I.redSpring) };
}


// ------------------------------------------------------------------------------------------------- the search (§3)

/** The gulch the search found, measured on the land: its side valley, the levels (the backswamp at its mouth, the
 *  mouth's floor: the Red Fall's crest; the head's floor), its narrows, its col (the lowest way out of it but its mouth:
 *  the tile, its level, how far over the narrows it stood before the mend), the way on from the col to the map's edge
 *  (the Dry Fork, map tiles in order), and the tiles the mend changes. */
export interface GulchFound {
  index: number;
  valley: SideValley;
  swamp: number;
  crest: number;
  head: number;
  narrows: { s: number; width: number; floor: number };
  col: { i: number; level: number; over: number };
  way: number[];
  /** The way from the gulch's floor up to the col (map tiles in order). */
  into: number[];
  changed: number;
  /** The start's orientation whose vista frame shows the Red Fall here, and the runs of the window that frame shows. */
  orientation: Orientation;
  framed: [number, number][];
}

/** A side valley's floor at `s` along it (tiles from its mouth): its mouth's hang over its foot, rising to its head. */
export const floorAt = (sv: SideValley, s: number): number => sv.foot + sv.hang + Math.floor(sv.rise * Math.max(0, Math.min(1, s / (sv.line.length - 1))) + 0.5);

/** The width of a side valley's floor at `s`, measured on the land: the tiles across its line (at its normal) no
 *  higher than its floor there, from the line out both ways. */
export function floorWidth(T: Turn, W: number, H: number, h: ArrayLike<number>, sv: SideValley, s: number): number {
  const k = Math.max(0, Math.min(sv.line.length - 2, Math.floor(s)));
  const a = sv.line[k];
  const b = sv.line[k + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const c: Point = [a[0] + (b[0] - a[0]) * (s - k), a[1] + (b[1] - a[1]) * (s - k)];
  const fl = floorAt(sv, s);
  const at = (t: number) => {
    const [x, y] = toMap(T, [c[0] + n[0] * t, c[1] + n[1] * t]).map(Math.floor);
    return x >= 0 && y >= 0 && x < W && y < H ? h[y * W + x] : Infinity;
  };
  if (at(0) > fl) return 0;
  let w = 1;
  for (let t = 1; t < 12 && at(t) <= fl; t++) w++;
  for (let t = -1; t > -12 && at(t) <= fl; t--) w++;
  return w;
}

/** Each tile's place along a side valley in the local frame: its distance off the line and how far along it (−1 off
 *  the valley's box). */
export function valleyTiles(T: Turn, W: number, H: number, sv: SideValley): { d: Float32Array; s: Float32Array } {
  const d = new Float32Array(W * H).fill(Infinity);
  const s = new Float32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
      if (!inBox(sv.box, u, v)) continue;
      const q = nearOnLine(sv.line, u, v);
      d[y * W + x] = q.d;
      s[y * W + x] = q.s;
    }
  return { d, s };
}

/** A side valley's half-width at `s`. */
const halfAt = (sv: SideValley, s: number) => sv.half[Math.max(0, Math.min(sv.half.length - 1, Math.round(s)))];

/** The lowest way out of a side valley but its mouth (§3, `col.over`): water standing in it behind its narrows (the
 *  narrows and the valley below it shut, as a dam there would) rises until it spills; the level it spills at, the tile
 *  it spills over (the col: the highest on its way), the way on from the col to where it leaves, in order, and whether
 *  that is the map's edge or the valley's floor. With `avoid`, the floor and the tiles it marks shut too: the lowest
 *  way to an edge that keeps clear of them. */
export function lowestWayOut(plan: PremisePlan, floor: Uint8Array, h: ArrayLike<number>, sv: SideValley, narrowsS: number, tiles = valleyTiles(turnOf(plan, plainOf(plan)!), plan.W, plan.H, sv), avoid: Uint8Array | null = null): { level: number; col: number; way: number[]; into: number[]; out: "edge" | "floor" } | null {
  const { W, H } = plan;
  const N = W * H;
  const level = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const shut = (i: number) => tiles.s[i] >= 0 && tiles.s[i] <= narrowsS + 1.5 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 2.5;
  // (a heap of tiles by the level water must rise to, to reach them, ties by noise: across land of one level the way
  // wanders as the noise does, never down a row or a column)
  const seed = S(plan, "way");
  const tie = new Float32Array(N).fill(NaN);
  const tieAt = (i: number) => (tie[i] === tie[i] ? tie[i] : (tie[i] = fbm(seed, i % W, Math.floor(i / W), WAY_TIE_CELL, 2)));
  const before = (a: number, b: number) => level[a] < level[b] || (level[a] === level[b] && tieAt(a) < tieAt(b));
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    for (let k = heap.length - 1; k > 0; ) {
      const pk = (k - 1) >> 1;
      if (!before(heap[k], heap[pk])) break;
      [heap[pk], heap[k]] = [heap[k], heap[pk]];
      k = pk;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && before(heap[l], heap[m])) m = l;
        if (r < heap.length && before(heap[r], heap[m])) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    if (tiles.s[i] < narrowsS + 2 || tiles.d[i] > halfAt(sv, tiles.s[i])) continue;
    if (h[i] > floorAt(sv, tiles.s[i])) continue;
    level[i] = h[i];
    push(i);
  }
  if (!heap.length) return null;
  const done = new Uint8Array(N);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % W;
    const y = (i - x) / W;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (edge || (floor[i] && !avoid)) {
      const way: number[] = [];
      for (let k = i; k >= 0; k = from[k]) way.push(k);
      way.reverse();
      let col = way[0];
      for (const k of way) if (h[k] > h[col]) col = k;
      return { level: level[i], col, way: way.slice(way.indexOf(col)), into: way.slice(0, way.indexOf(col)), out: floor[i] ? "floor" : "edge" };
    }
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || done[j] || shut(j) || (avoid && (floor[j] || avoid[j]))) continue;
      const lv = Math.max(level[i], h[j]);
      if (lv < level[j]) {
        level[j] = lv;
        from[j] = i;
        push(j);
      }
    }
  }
  return null;
}

/** The land that drains onto the valley's floor at `level` or under, a side valley's narrows and the valley below it
 *  shut (as `lowestWayOut` shuts them), widened by `margin` tiles: the tiles the Dry Fork keeps clear of, so that once
 *  its bed and the col are cut to `level` and under, none of its water and none of the gulch's finds the floor. */
export function floorBelow(plan: PremisePlan, floor: Uint8Array, h: ArrayLike<number>, sv: SideValley, narrowsS: number, tiles: { d: Float32Array; s: Float32Array }, level: number, margin: number): { near: Uint8Array } {
  const { W, H } = plan;
  const N = W * H;
  const shut = (i: number) => tiles.s[i] >= 0 && tiles.s[i] <= narrowsS + 1.5 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 2.5;
  const low = new Uint8Array(N);
  const q: number[] = [];
  for (let i = 0; i < N; i++)
    if (floor[i]) {
      low[i] = 1;
      q.push(i);
    }
  const nb = (i: number) => {
    const x = i % W;
    return [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < N);
  };
  for (let k = 0; k < q.length; k++)
    for (const j of nb(q[k]))
      if (!low[j] && h[j] <= level && !shut(j)) {
        low[j] = 1;
        q.push(j);
      }
  let near = low;
  for (let m = 0; m < margin; m++) {
    const next = near.slice();
    for (let i = 0; i < N; i++) if (near[i]) for (const j of nb(i)) next[j] = 1;
    near = next;
  }
  return { near };
}

/** Where water poured on the ground at a tile runs (`flowThrough`, no dam): onto the valley's floor (the first floor
 *  tile it reaches, or -1), and whether it reaches a map edge. */
export function pourRuns(W: number, H: number, h: ArrayLike<number>, floor: Uint8Array, at: number): { floor: number; edge: boolean } {
  const N = W * H;
  const floorF = new Float64Array(N);
  for (let i = 0; i < N; i++) floorF[i] = h[i];
  const { path } = flowThrough({ W, H, floor: floorF, dam: null, emitters: [{ cells: [at], strength: 1, contamination: 0 }] });
  let edge = false;
  for (let i = 0; i < N; i++) {
    if (!path[i]) continue;
    if (floor[i]) return { floor: i, edge };
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
  }
  return { floor: -1, edge };
}

/** The narrows of a side valley measured on the land: the narrowest place in its lower half (its floor's width). */
export function narrowsOf(T: Turn, W: number, H: number, h: ArrayLike<number>, sv: SideValley): { s: number; width: number; floor: number } {
  let best = { s: -1, width: Infinity, floor: 0 };
  const len = sv.line.length - 1;
  for (let s = 2; s <= len / 2; s += 0.5) {
    const wd = floorWidth(T, W, H, h, sv, s);
    if (wd > 0 && wd < best.width) best = { s, width: wd, floor: floorAt(sv, s) };
  }
  return best;
}

/** Why a side valley is not the gulch (§3), or what it is: its mouth 3 to 5 over the backswamp, a narrows 3 wide or
 *  fewer in its lower half, its lowest way out over a col 2 or more over the narrows' floor on to a map edge without
 *  touching the floor; the mend's changes within the budget. */
export function judgeGulch(plan: PremisePlan, rl: PlainRelief, h: Uint8Array, index: number): GulchFound | { why: string } {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const sv = rl.valleys[index];
  if (sv.wall !== "far") return { why: "not on the far wall" };
  const swamp = sv.foot;
  const crest = floorAt(sv, 0);
  const hang = crest - swamp;
  if (hang < GULCH.h[0] || hang > GULCH.h[1]) return { why: `its mouth hangs ${hang} over the backswamp (${GULCH.h.join(" to ")})` };
  // (the narrows as the mend leaves it: the floor cut to its fall, no bank of stage 1's beside a stream on it)
  const tiles = valleyTiles(T, W, H, sv);
  const cutH = h.slice();
  cutFloor(cutH, sv, tiles);
  const narrows = narrowsOf(T, W, H, cutH, sv);
  if (narrows.width > GULCH.narrows[1]) return { why: `its narrowest in its lower half is ${narrows.width === Infinity ? "nothing" : narrows.width} wide (${GULCH.narrows[1]} or fewer)` };
  // (the lowest way out to an edge, its col cut to 2 over the narrows by the mend, keeping clear of the land that drains
  // onto the floor at the col's level: by FORK_CLEAR tiles, else fewer; the mended land read as `col.over` and
  // `fork.own` will read it decides: the col its lowest way out, the Dry Fork's water to an edge and onto no floor)
  const want = narrows.floor + GULCH.colOver;
  const frame = framing(plan, sv.mouth, hang);
  if (!frame) return { why: "no way the start faces frames its fall" };
  let why = "no way out of it keeps clear of the valley's floor to a map edge";
  for (const margin of [FORK_CLEAR, 1, 0]) {
    const below = floorBelow(plan, rl.floor, h, sv, narrows.s, tiles, want, margin);
    const way = lowestWayOut(plan, rl.floor, h, sv, narrows.s, tiles, below.near);
    if (!way) continue;
    if (way.level < want) return { why: `its col stands ${way.level - narrows.floor} over its narrows (${GULCH.colOver} or more)` };
    const found: GulchFound = { index, valley: sv, swamp, crest, head: floorAt(sv, sv.line.length - 1), narrows, col: { i: way.col, level: want, over: way.level - narrows.floor }, way: way.way, into: way.into, changed: 0, ...frame };
    const mended = h.slice();
    found.changed = mendGulch(plan, mended, found, rl.floor);
    if (found.changed > MEND.share * W * H) {
      why = `its mend changes ${found.changed} tiles (${Math.floor(MEND.share * W * H)} at most)`;
      continue;
    }
    const after = lowestWayOut(plan, rl.floor, mended, sv, narrows.s);
    if (!after || after.out !== "edge" || after.level !== want) {
      why = after && after.out === "floor" ? `once mended, its lowest way out is onto the valley's floor, ${after.level - narrows.floor} over its narrows` : "once mended, its lowest way out is not its col";
      continue;
    }
    const pour = pourRuns(W, H, mended, rl.floor, found.way[Math.min(FORK_POUR, found.way.length - 1)]);
    if (pour.floor >= 0 || !pour.edge) {
      why = "once mended, the Dry Fork's water does not keep to it";
      continue;
    }
    return found;
  }
  return { why };
}

/** The way the start faces whose vista frame shows a Red Fall of `hang` at `mouth` (its lip and a tile either side, in
 *  a run of the search window the frame shows), the start's own way first; and the runs that frame shows. Or null. */
export function framing(plan: PremisePlan, mouth: number, hang: number): { orientation: Orientation; framed: [number, number][] } | null {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const lipHalf = WINDOW.framed / 2;
  const st = plan.frame.start;
  for (const orientation of [st.orientation, ...ORIENTATIONS.filter((o) => o !== st.orientation)]) {
    const framed = framedRuns(T, p, { x: st.x, y: st.y, z: st.z, orientation }, p.window.from, p.window.to, hang);
    if (framed.some(([a, b]) => mouth - lipHalf >= a - 0.01 && mouth + lipHalf <= b + 0.01)) return { orientation, framed };
  }
  return null;
}

/** The search (§3): the far wall's side valleys whose mouths open in the search window (the badwater distance from the
 *  start down to 75 % of the plain's length), nearest first; the first that holds, with a way the start faces that
 *  frames its fall (and that `confirm` takes, when given: the land re-made round it), is the gulch. Or why none did. */
export function searchGulch<T = GulchFound>(plan: PremisePlan, rl: PlainRelief, confirm: (f: GulchFound) => T | { why: string } = (f) => f as T): T | { why: string } {
  const p = plainOf(plan)!;
  const order = rl.valleys
    .map((sv, k) => ({ sv, k }))
    .filter(({ sv }) => sv.wall === "far" && sv.mouth >= p.window.from && sv.mouth <= p.window.to)
    .sort((a, b) => a.sv.mouth - b.sv.mouth);
  if (!order.length) return { why: "no side valley of the far wall opens in the search window" };
  const whys: string[] = [];
  for (const { k } of order) {
    const r = judgeGulch(plan, rl, rl.heights, k);
    const c = "why" in r ? r : confirm(r);
    if (!(typeof c === "object" && c !== null && "why" in c)) return c;
    whys.push(`at ${Math.round(rl.valleys[k].mouth)}, ${(c as { why: string }).why}`);
  }
  return { why: `none of the ${order.length} side valleys in the window holds (${whys.join("; ")})` };
}

/** The mend's first cut: a side valley's floor to its steady fall (its hanging mouth kept), every tile within its
 *  half-width no higher than its floor there. */
function cutFloor(h: Uint8Array, sv: SideValley, tiles: { d: Float32Array; s: Float32Array }): void {
  for (let i = 0; i < h.length; i++) {
    const s = tiles.s[i];
    if (s < 0.5 || tiles.d[i] > halfAt(sv, s)) continue;
    const fl = floorAt(sv, s);
    if (h[i] > fl) h[i] = fl;
  }
}

/** The mend (§3), by taking ground away only: the gulch's floor cut to its steady fall (its hanging mouth kept), the
 *  col cut to 2 over the narrows' floor, and the way on from it cut to fall the whole way to its edge (each tile no
 *  higher than the last), a tile either side with it. The tiles it changed. */
export function mendGulch(plan: PremisePlan, h: Uint8Array, f: GulchFound, floor: Uint8Array): number {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const sv = f.valley;
  const before = h.slice();
  const tiles = valleyTiles(T, W, H, sv);
  cutFloor(h, sv, tiles);
  const cut = (i: number, to: number) => {
    if (i >= 0 && i < W * H && !floor[i] && h[i] > to) h[i] = to;
  };
  // (the way up to the col from the gulch's floor, cut to the col's level)
  for (const i of f.into) cut(i, f.col.level);
  // (the way stays at the col's level while it runs beside the gulch, its rim a tile and a half past its floor: the
  // gulch's water would pour over a lower tile there)
  const rim = (i: number) => tiles.s[i] >= 0 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 1.5;
  const near = (i: number) => {
    const x = i % W;
    return [i, x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W].some((j) => j >= 0 && j < W * H && rim(j));
  };
  let last = f.col.level;
  let out = false;
  f.way.forEach((i, k) => {
    out ||= k > 0 && !near(i);
    const to = out ? Math.min(last, f.col.level - 1) : f.col.level;
    cut(i, to);
    last = Math.min(last, h[i]);
    const x = i % W;
    // (the notch and the bed three wide: a tile either side, a level over the bed beside it)
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) cut(j, out ? last + 1 : f.col.level);
  });
  let n = 0;
  for (let i = 0; i < W * H; i++) if (h[i] !== before[i]) n++;
  return n;
}

// ------------------------------------------------------------------------------------------------- the plan re-sited

/** The plan with its gulch, col, Dry Fork and red water where the search found them (the plan's own were its targets):
 *  the Red Fall at the found mouth (its lip along the far wall's foot there, its crest the mouth's floor), the Red Spring
 *  at the head, the narrows and the col as measured, the Dry Fork the way on from the col to its edge, the red stream's
 *  head moved along the backswamp to the new pool, the turn and the backswamp's levee at their new sites. */
export function resiteGulch(plan: PremisePlan, f: GulchFound): PremisePlan {
  const p0 = plainOf(plan)!;
  const T = turnOf(plan, p0);
  const { W } = plan;
  const sv = f.valley;
  const len = sv.line.length - 1;
  const vF = (u: number) => lineAt(p0.far, p0.step, u);
  const vB = (u: number) => vF(u) - lineAt(p0.swamp, p0.step, u);
  const map = (q: Point): Point => toMap(T, q).map((c) => Math.round(c * 100) / 100) as Point;
  const uM = sv.mouth;
  const gw = Math.round(2 * [...sv.half].sort((a, b) => a - b)[sv.half.length >> 1]);
  const redFlow = p0.flow.red;
  const lipW = Math.max(GULCH.width[0], Math.min(gw, sillWidthFor(redFlow) + 2));
  const lip: [Point, Point] = [map([uM - lipW / 2, vF(uM)]), map([uM + lipW / 2, vF(uM)])];
  const headAt = Math.max(1, len - RED_POOL);
  const head: Point = sv.line[headAt];
  // (the narrows' point on the gulch's line, between its points where the measure found it)
  const nK = Math.min(len - 1, Math.floor(f.narrows.s));
  const nT = f.narrows.s - nK;
  const nAt: Point = [sv.line[nK][0] + (sv.line[nK + 1][0] - sv.line[nK][0]) * nT, sv.line[nK][1] + (sv.line[nK + 1][1] - sv.line[nK][1]) * nT];
  const colTile: Point = [(f.col.i % W) + 0.5, Math.floor(f.col.i / W) + 0.5];
  const colLocal = toLocal(T, colTile);
  // the Red Fall's path from the Red Spring down the gulch's line to its mouth, a point every 3 tiles
  const fallPath: Point[] = [];
  const fallBed: number[] = [];
  for (let s = headAt; s > 0; s -= 3) {
    fallPath.push(map(sv.line[s]));
    fallBed.push(floorAt(sv, s));
  }
  fallPath.push(map(sv.line[0]));
  fallBed.push(f.crest);
  // the red stream's head along the backswamp to the new pool, at the old head's offset from the wall's foot
  const red = plan.links.find((l) => l.id === I.red)!;
  const redL = red.path!.map((q) => toLocal(T, q));
  const off = vF(redL[0][0]) - redL[0][1];
  const u0 = uM + RED_FOOT;
  const keep = redL.filter((q, k) => k === redL.length - 1 || q[0] >= u0 + 2);
  const lead: Point[] = [];
  for (let u = u0; u < keep[0][0] - 2; u += 3) lead.push([u, vF(u) - off]);
  const newRed = [...lead, ...keep];
  let low = Infinity;
  const redBed = newRed.map((q) => (low = Math.min(low, levelAt(p0, q[0], q[1]) - 2)));
  if (p0.red.end === "join" && Array.isArray(red.bed)) redBed[redBed.length - 1] = Math.min(redBed[redBed.length - 2] ?? Infinity, red.bed[red.bed.length - 1]);
  // the Dry Fork: the way on from the col, a point every 4 tiles, ending on its edge
  const wayPts = f.way.map((i) => [(i % W) + 0.5, Math.floor(i / W) + 0.5] as Point);
  const fork: Point[] = wayPts.filter((_, k) => k % 4 === 0);
  const end = wayPts[wayPts.length - 1];
  const edge = edgeAt(W, end);
  const onEdge: Point = edge === "S" ? [end[0], 0] : edge === "N" ? [end[0], W] : edge === "W" ? [0, end[1]] : [W, end[1]];
  if (fork[fork.length - 1] !== end) fork.push(end);
  fork.push(onEdge);
  const forkEnd = Math.max(BED_FLOOR, f.col.level - 1 - FORK_FALL_MIN);
  // the backswamp's levee where the red stream runs nearest the plain below the Red Fall
  let lap: Point = newRed[Math.min(1, newRed.length - 1)];
  let gap = Infinity;
  for (const q of newRed) {
    if (q[0] < uM + 8 || q[0] > p0.red.swampTo - 6) continue;
    const g = q[1] - vB(q[0]);
    if (g < gap) {
      gap = g;
      lap = q;
    }
  }
  const start = plan.frame.start;
  const look = openingCamera({ ...start, orientation: f.orientation }, VISTA_ZOOM).look;
  const ahead = lip.map((q) => (q[0] - start.x) * look[0] + (q[1] - start.y) * look[1]);
  const face = toMap(T, [uM, vF(uM) - 1]).map((c, k) => c - toMap(T, [uM, vF(uM)])[k]);
  const p: PlainNumbers = {
    ...p0,
    walls: { ...p0.walls, far: Math.max(p0.walls.far, f.col.level + 2) },
    gulch: { mouth: Math.round(uM * 100) / 100, h: f.crest - f.swamp, crest: f.crest, width: gw, length: Math.round(len * 100) / 100, head: map(head), narrows: { at: map(nAt), width: f.narrows.width, floor: f.narrows.floor }, rise: floorAt(sv, headAt) - f.crest },
    col: { at: colTile, level: f.col.level, side: colLocal[0] < nAt[0] ? "up" : "down" },
    fork: { path: fork, bed: [f.col.level - 1, Math.min(f.col.level - 1, forkEnd)], edge },
    found: { valley: f.index, changed: f.changed, over: f.col.over },
    window: { ...p0.window, framed: f.framed },
  };
  const links = plan.links.map((l): Link => {
    if (l.id === I.redFall) return { ...l, path: fallPath, bed: fallBed, fall: { ...l.fall!, height: f.crest - f.swamp, crest: f.crest, width: lipW, face: headingOf(face[0], face[1]), lip } };
    if (l.id === I.red) return { ...l, path: newRed.map(map), bed: redBed };
    return l;
  });
  const bodies = plan.bodies.map((b): Body => {
    if (b.id === I.redSpring) return { ...b, sill: p.gulch.crest + p.gulch.rise, arms: [[[...map(head), b.arms[0][0][2]]]] };
    if (b.id === I.redPool) return { ...b, sill: f.swamp, arms: [[[...map([uM, vF(uM) - RED_FOOT - 0.5]), b.arms[0][0][2]]]] };
    return b;
  });
  const works = plan.works.map((x): Work => {
    if (x.id === "turn") return { ...x, at: p.gulch.narrows.at, tiles: f.narrows.width + 2 };
    if (x.id === "swampLevee") return { ...x, at: map([lap[0], vB(lap[0])]) };
    return x;
  });
  const sources = plan.sources.map((s) => (s.into === I.redSpring ? { ...s, at: map(head) } : s));
  const regions = plan.regions.map((r) => (r.id === "top" ? { ...r, at: map([uM, (vF(uM) + head[1]) / 2]) } : r));
  const edges = { ...plan.edges };
  if (edges[edge] === "ridge") edges[edge] = "falls away";
  return { ...plan, links, bodies, works, sources, regions, edges, frame: { ...plan.frame, start: { ...start, orientation: f.orientation }, lipAhead: Math.round(((ahead[0] + ahead[1]) / 2) * 100) / 100 }, plain: p } as PremisePlan;
}

// ------------------------------------------------------------------------------------------------- the measures

/** Day 1's bands on stage 2's ground by the game's soil rules (§2), the red water standing where stage 1 put it: of the
 *  valley's floor (the plain, its sloughs and the backswamp, on the map, from the plain's head down, no water) the share
 *  dead (soil contamination over 0), green (moist and not dead) and dry; the floor's share of the map; and `M`, the
 *  green band's mean reach onto the plain past the river's plain-side levee foot (the plain's green tiles on that side
 *  over the plain's length). */
export function plainBands(plan: PremisePlan, w: StageWater, heights: Uint8Array, floor: Uint8Array): { dead: number; dry: number; green: number; floor: number; M: number; tiles: number } {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const depth = dayOneWater(plan, w, heights);
  const contamination = new Float64Array(N);
  const redIds = new Set<string>([I.red, I.redFall, I.redPool, I.redSpring]);
  for (let i = 0; i < N; i++) {
    if (!(depth[i] > 0)) continue;
    const id = r.channel[i] ? plan.links[r.channel[i] - 1].id : r.lake[i] ? plan.bodies[r.lake[i] - 1].id : r.pool[i] ? plan.links[r.pool[i] - 1].id : "";
    if (redIds.has(id)) contamination[i] = 1;
  }
  // (the river below the red stream's join carries it at red / (river + red), a quarter at most: under the game's 0.5,
  // it poisons no soil)
  const soil = gameSoil(W, H, heights, depth, contamination, []);
  const river = plan.links.find((l) => l.id === I.river)!;
  const foot = leveeFoot(p, T.U, river.half ?? 2.5, riverLocal(T, river.path!));
  let dead = 0;
  let green = 0;
  let dry = 0;
  let side = 0;
  for (let i = 0; i < N; i++) {
    const f = floor[i];
    if (!(f === 1 || f === 2 || f === 4) || depth[i] > 0) continue;
    const [u, v] = toLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    if (u < p.plainFrom) continue;
    if (soil.contamination[i] > 0) dead++;
    else if (soil.moisture[i] > 0) {
      green++;
      const k = Math.max(0, Math.min(foot.length - 1, Math.round(u)));
      if (f !== 2 && Number.isFinite(foot[k]) && v > foot[k]) side++;
    } else dry++;
  }
  const all = dead + green + dry;
  const len = Math.max(1, Math.min(p.plainTo, foot.length - 1) - Math.ceil(p.plainFrom));
  return { dead: dead / all, dry: dry / all, green: green / all, floor: all / N, M: side / len, tiles: all };
}

/** The start's numbers the sheet opens with: its bench and its walkable land on stage 2's ground (`frame.ts`
 *  `checkFrame`), and its distance in tiles to the plain, to the river and to the red stream's course. */
export function plainStart(plan: PremisePlan, w: StageWater, heights: Uint8Array, floor: Uint8Array, frame: FrameCheck): { bench: number; reach: number; plain: number; river: number; red: number } {
  const { W, H } = plan;
  const s = frame.start;
  const st: Point = [s.x + 0.5, s.y + 0.5];
  let plainD = Infinity;
  for (let i = 0; i < W * H; i++) if (floor[i] === 1) plainD = Math.min(plainD, dist(st, [(i % W) + 0.5, Math.floor(i / W) + 0.5]));
  const near = (id: string) => {
    const l = plan.links.find((x) => x.id === id);
    return l?.path ? pathDist(st[0], st[1], l.path).d : Infinity;
  };
  // (red water: the red stream, the Red Fall, and the river below the red stream's join, which carries it on)
  let redD = Math.min(near(I.red), near(I.redFall));
  const red = plan.links.find((x) => x.id === I.red);
  const river = plan.links.find((x) => x.id === I.river);
  if (red?.joins?.link === I.river && river?.path) for (const q of walk(river.path, 1)) if (q.s >= red.joins.at - 0.5) redD = Math.min(redD, dist(st, q.p));
  void w;
  void heights;
  void H;
  return { bench: frame.bench, reach: frame.reach, plain: Math.round(plainD), river: Math.round(near(I.river)), red: Math.round(redD) };
}

/** A wall's foot on the ground: along the valley, every `step` tiles of u, the last tile of the valley's floor going
 *  out toward the wall from the floor's middle (the floor's own mask, its warp and all), as map points; NaN where the
 *  foot is off the map. */
export function groundFoot(plan: PremisePlan, floor: Uint8Array, wall: "far" | "near", step = 2): Point[] {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const out: Point[] = [];
  const from = wall === "far" ? p.terrace[0] : 0;
  const to = wall === "far" ? p.plainTo : T.U;
  for (let u = Math.ceil(from); u <= to; u += step) {
    const vn = lineAt(p.near, p.step, u);
    const vf = lineAt(p.far, p.step, u);
    const mid = (vn + vf) / 2;
    const sg = wall === "far" ? 1 : -1;
    let last: Point | null = null;
    let off = false;
    for (let t = 0; t < (vf - vn) / 2 + 12; t += 0.5) {
      const q = toMap(T, [u, mid + sg * t]);
      const x = Math.floor(q[0]);
      const y = Math.floor(q[1]);
      if (x < 0 || y < 0 || x >= W || y >= H) {
        off = true;
        break;
      }
      if (!floor[y * W + x]) break;
      last = q;
    }
    out.push(last && !off ? last : [NaN, NaN]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- the land's invariants

/** What the land's invariants read: the plan as re-sited, its water (stage 1), stage 2's ground and the relief's floor
 *  mask and side valleys. */
export interface PlainLandContext {
  spec: MapSpec;
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
  relief: PlainRelief;
}

export interface PlainLandInvariant {
  id: string;
  test(ctx: PlainLandContext): InvariantResult;
}

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The gulch's side valley on the land, or null. */
function gulchValley(ctx: PlainLandContext): SideValley | null {
  const p = plainOf(ctx.plan);
  return p?.found ? (ctx.relief.valleys[p.found.valley] ?? null) : null;
}

/** `gulch.found` (§3): the gulch is a side valley of the far wall the search found (its mouth where the plan's gulch
 *  stands, inside the window the vista frame shows), its mouth 3 to 5 over the backswamp and a narrows 3 wide or fewer
 *  in its lower half on the ground, the mend within its budget (4 % of the map's tiles). */
/** The gulch's narrows where the plan names it (the turn's dam stands there): how far along the gulch, its floor's
 *  width on the ground, its floor's level. */
function plannedNarrows(ctx: PlainLandContext, sv: SideValley): { s: number; width: number; floor: number } {
  const p = plainOf(ctx.plan)!;
  const T = turnOf(ctx.plan, p);
  const [u, v] = toLocal(T, p.gulch.narrows.at);
  const s = Math.round(nearOnLine(sv.line, u, v).s * 2) / 2;
  return { s, width: floorWidth(T, ctx.plan.W, ctx.plan.H, ctx.heights, sv, s), floor: p.gulch.narrows.floor };
}

const gulchFoundCheck: PlainLandInvariant = {
  id: "gulch.found",
  test(ctx) {
    const p = plainOf(ctx.plan);
    const sv = gulchValley(ctx);
    if (!p?.found || !sv) return fail("No side valley of the far wall was found for the gulch");
    if (Math.abs(sv.mouth - p.gulch.mouth) > 0.01 || sv.wall !== "far") return fail("The gulch is not the side valley the search found");
    if (p.found.changed > MEND.share * ctx.plan.W * ctx.plan.H) return fail(`The mend changed ${p.found.changed} tiles (${Math.floor(MEND.share * ctx.plan.W * ctx.plan.H)} at most)`);
    const n = plannedNarrows(ctx, sv);
    if (n.width > GULCH.narrows[1]) return fail(`The gulch's narrows is ${n.width} wide on the ground (${GULCH.narrows[1]} or fewer)`);
    const hang = floorAt(sv, 0) - sv.foot;
    if (hang < GULCH.h[0] || hang > GULCH.h[1]) return fail(`The gulch's mouth hangs ${hang} over the backswamp (${GULCH.h.join(" to ")})`);
    return OK;
  },
};

/** `col.over` (§3, §7): the gulch's lowest way out but its mouth, with the narrows shut, stands 2 or more over the
 *  narrows' floor, at the col the plan names. */
const colOver: PlainLandInvariant = {
  id: "col.over",
  test(ctx) {
    const p = plainOf(ctx.plan);
    const sv = gulchValley(ctx);
    if (!p || !sv) return fail("No gulch to read a col from");
    const n = plannedNarrows(ctx, sv);
    const way = lowestWayOut(ctx.plan, ctx.relief.floor, ctx.heights, sv, n.s);
    if (!way) return fail("No water stands in the gulch behind its narrows");
    if (way.level < n.floor + GULCH.colOver) return fail(`The gulch's lowest way out but its mouth stands ${way.level - n.floor} over its narrows (${GULCH.colOver} or more)`);
    if (way.out !== "edge") return fail("The gulch's lowest way out but its mouth runs onto the valley's floor");
    if (way.level !== p.col.level) return fail(`The col stands at ${way.level} on the ground, the plan says ${p.col.level}`);
    return OK;
  },
};

/** `fork.own` (§3, §7): water over the col (`flowThrough` on stage 2's ground, poured on the Dry Fork's first point
 *  past the col: what spills over it once the turn's dam stands, the gulch's side shut) runs down the Dry Fork to a map
 *  edge and onto no tile of the valley's floor. */
const forkOwn: PlainLandInvariant = {
  id: "fork.own",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No col");
    const { W, H } = ctx.plan;
    const q = p.fork.path[Math.min(1, p.fork.path.length - 1)];
    const r = pourRuns(W, H, ctx.heights, ctx.relief.floor, Math.min(H - 1, Math.floor(q[1])) * W + Math.min(W - 1, Math.floor(q[0])));
    if (r.floor >= 0) return fail(`Water poured at the col reaches the valley's floor at ${r.floor % W}, ${Math.floor(r.floor / W)}`);
    return r.edge ? OK : fail("Water poured at the col reaches no map edge");
  },
};

/** The longest straight stretch of a levee's bank allowed (§7 `levee.wanders`), tiles. */
export const BANK_STRAIGHT = 8;

/** `levee.wanders` (§1, §7): the crest holds no height for over a fifth of the river's length on the plain (the plan's
 *  crest runs, `plain.levels` reads them by number), and no bank's outer foot on the ground runs straight along the
 *  grid for more than 8 tiles (`bankRun`, the shared look check's straight edge). */
const leveeWanders: PlainLandInvariant = {
  id: "levee.wanders",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No levees");
    const len = p.levee.to - p.levee.from;
    for (const side of ["plain", "near"] as const) {
      let best = 0;
      let a = 0;
      const runs = p.levee[side];
      for (let k = 1; k <= runs.length; k++)
        if (k === runs.length || runs[k].over !== runs[a].over) {
          best = Math.max(best, runs[k - 1].to - runs[a].from);
          a = k;
        }
      if (best > 0.2 * len + 0.01) return fail(`The ${side} levee's crest holds one height for ${best.toFixed(0)} tiles (a fifth of ${len.toFixed(0)} at most)`);
    }
    const { W, H } = ctx.plan;
    const r = ctx.water.raster;
    const beside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) beside[i] = ctx.relief.floor[i] && !r.channel[i] && !r.lake[i] && !r.pool[i] ? 1 : 0;
    const run = bankRun(W, H, ctx.heights, ctx.relief.bank, beside);
    if (run > BANK_STRAIGHT) return fail(`A levee's bank runs straight along the grid for ${run} tiles (${BANK_STRAIGHT} at most)`);
    return OK;
  },
};

/** `plain.bands` (§2, §7): day 1's bands of the floor by the soil's reach on stage 2's ground: dead 8 to 25 %, dry 30 %
 *  or more. */
const plainBandsCheck: PlainLandInvariant = {
  id: "plain.bands",
  test(ctx) {
    const b = plainBands(ctx.plan, ctx.water, ctx.heights, ctx.relief.floor);
    const pct = (v: number) => `${Math.round(100 * v)} %`;
    if (b.dead < DEAD_SHARE[0] || b.dead > DEAD_SHARE[1]) return fail(`Day 1's dead band is ${pct(b.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})`);
    if (b.dry < DRY_LEAST) return fail(`Day 1's dry band is ${pct(b.dry)} of the floor (${pct(DRY_LEAST)} or more)`);
    return OK;
  },
};

/** `wall.wanders` on the ground (§1, §7): no wall's foot on stage 2's ground stays within 2 tiles of one straight line
 *  for longer than 1.2 `P`. */
const wallWandersGround: PlainLandInvariant = {
  id: "wall.wanders",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No walls");
    for (const wall of ["near", "far"] as const) {
      const run = longestStraight(groundFoot(ctx.plan, ctx.relief.floor, wall), WALL.near);
      if (run > WALL.longest * p.P + 0.01) return fail(`The ${wall} wall's foot runs within ${WALL.near} tiles of one straight line for ${run.toFixed(0)} tiles on the ground (${(WALL.longest * p.P).toFixed(0)} at most: drawn with a ruler)`);
    }
    return OK;
  },
};

/** `terrain.ruled_land` (PLAN §11.2, the shared look check) on stage 2's ground with stage 1's water. */
const ruledCheck: PlainLandInvariant = {
  id: "terrain.ruled_land",
  test(ctx) {
    const r = ctx.water.raster;
    const wet = new Uint8Array(ctx.plan.W * ctx.plan.H);
    for (let i = 0; i < wet.length; i++) {
      const l = r.channel[i] ? ctx.plan.links[r.channel[i] - 1] : null;
      if (r.lake[i] || r.pool[i] || r.crest[i] || (l && l.wet)) wet[i] = 1;
    }
    const m = ruledLand(ctx.heights, wet, ctx.plan.W, ctx.plan.H);
    return m.ok ? OK : fail(`Ruled land: ${(100 * m.straight).toFixed(1)} % straight, ${(100 * m.bands).toFixed(1)} % in bands, ${m.corners.toFixed(1)} corners per 1,000`);
  },
};

export const PLAIN_LAND_CHECKS: PlainLandInvariant[] = [gulchFoundCheck, colOver, forkOwn, leveeWanders, plainBandsCheck, wallWandersGround, ruledCheck];

export function plainLandFailures(ctx: PlainLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of PLAIN_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- the stage

/** A poisoned floodplain's land (stage 2): the plan as the search re-sited it, its water (stage 1), the ground, the
 *  relief's floor and side valleys, the gulch found, the start as stage 3 judges it on this ground, the land
 *  invariants it fails, and the stage's time (ms) by part. */
export interface PlainLand {
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
  relief: PlainRelief;
  found: GulchFound;
  frame: FrameCheck;
  landFails: { id: string; reason: string }[];
  notes: string[];
  attempt: number;
  failed: string[];
  ms: { water: number; upland: number; relief: number; search: number; mend: number; checks: number; total: number };
}

/** The land for one plan (the stage proper): the skeleton's water and the theme's upland, the relief, the search, the
 *  plan re-sited, its water again, the relief again on it and the mend. Or why the search found no gulch. */
export function plainLandOf(spec: MapSpec, plan: PremisePlan, style: ReliefStyle): Omit<PlainLand, "frame" | "landFails" | "attempt" | "failed"> | { reason: string } {
  const t0 = performance.now();
  const sk = plainSkeleton(plan);
  const w1 = waterByNumber(sk);
  const t1 = performance.now();
  const upland = reliefBetween({ ...sk, ridges: [] }, w1, style);
  const t2 = performance.now();
  const rl1 = plainRelief(sk, w1, upland);
  const t3 = performance.now();
  // (a gulch the skeleton's land holds is judged again in its own land: the plan re-sited to it, its red water drawn,
  // the relief made again round it; there it is measured afresh and the plan re-sited to that measure)
  let tw = 0;
  let tr = 0;
  const own = (f: GulchFound) => {
    const plan2 = resiteGulch(plan, f);
    const pf = failing(poisonedPlain.invariants, "plan", { spec, plan: plan2 });
    if (pf.length) return { why: `re-sited, ${pf[0].id}: ${pf[0].reason}` };
    const a = performance.now();
    const water = waterByNumber(plan2);
    const b = performance.now();
    const rl = plainRelief(plan2, water, upland);
    tw += b - a;
    tr += performance.now() - b;
    const f2 = judgeGulch(plan2, rl, rl.heights, f.index);
    if ("why" in f2) return { why: `in its own land, ${f2.why}` };
    const plan3 = resiteGulch(plan, f2);
    // (what the relief reads of the re-siting, the same for both measures: else the land is the plan's no longer)
    const reads = (q: PremisePlan) => JSON.stringify([q.links, q.bodies, q.sources, q.edges, plainOf(q)!.walls, plainOf(q)!.found?.valley]);
    if (reads(plan3) !== reads(plan2)) return { why: "in its own land, its col or Dry Fork moves the red water or the walls" };
    const pf3 = failing(poisonedPlain.invariants, "plan", { spec, plan: plan3 });
    if (pf3.length) return { why: `re-sited, ${pf3[0].id}: ${pf3[0].reason}` };
    return { f: f2, plan: plan3, water, rl };
  };
  const got = searchGulch(sk, rl1, own);
  const t4 = performance.now();
  if ("why" in got) return { reason: `gulch.found: ${got.why}` };
  const { f: found, plan: plan2, water, rl } = got;
  const heights = rl.heights;
  const changed = mendGulch(plan2, heights, found, rl.floor);
  // (stage 1's ground as it is after the mend)
  for (let i = 0; i < heights.length; i++) if (water.raster.fixed[i]) heights[i] = water.raster.heights[i];
  const t7 = performance.now();
  const notes = [`The gulch found at ${Math.round(found.valley.mouth)} tiles down the valley; the mend changed ${changed} tiles`];
  const ms = { water: Math.round(t1 - t0 + tw), upland: Math.round(t2 - t1), relief: Math.round(t3 - t2 + tr), search: Math.round(t4 - t3 - tw - tr), mend: Math.round(t7 - t4), checks: 0, total: Math.round(t7 - t0) };
  return { plan: plan2, water, heights, relief: { ...rl, heights }, found: { ...found, changed }, notes, ms };
}

/** The poisoned floodplain's land for a spec in a theme's style (River Valley by default): the first plan whose land
 *  holds (the search finds a gulch, the land invariants pass and stage 3 finds the start), within `PLAN_TRIES`; or the
 *  last land with its failures, or why none was made. `failed` lists each refused plan's reason. */
export function plainLand(spec: MapSpec, theme: StyleTheme = "riverValley"): (PlainLand & { held: boolean }) | { reason: string; failed?: string[] } {
  const why = poisonedPlain.eligible(spec);
  if (why) return { reason: why };
  const rules = rulesFor(spec);
  const failed: string[] = [];
  let last: (PlainLand & { held: boolean }) | null = null;
  for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
    const plan = poisonedPlain.draw(spec, attempt);
    if ("reason" in plan) {
      failed.push(plan.reason);
      continue;
    }
    const style = premiseStyle(theme, spec, attempt);
    const land = plainLandOf(spec, plan, style.relief);
    if ("reason" in land) {
      failed.push(land.reason);
      continue;
    }
    const t0 = performance.now();
    const landFails = plainLandFailures({ spec, plan: land.plan, water: land.water, heights: land.heights, relief: land.relief });
    const frame = checkFrame(land.plan, land.water, land.heights, { bench: rules.levelLand, moist: rules.farmland + rules.forester, reach: rules.reachMin, zoom: VISTA_ZOOM, shallow: false });
    land.ms.checks = Math.round(performance.now() - t0);
    const out = { ...land, frame, landFails, attempt, failed, held: false };
    last = out;
    if (landFails.length) {
      failed.push(`${landFails[0].id}: ${landFails[0].reason}`);
      continue;
    }
    if (frame.reason) {
      failed.push(`frame.start: ${frame.reason}`);
      continue;
    }
    return { ...out, held: true };
  }
  return last ?? { reason: `No poisoned floodplain's land held in ${failed.length} plans (the last: ${failed[failed.length - 1] ?? ""})`, failed };
}
