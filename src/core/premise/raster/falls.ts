// A fall by number (docs/PREMISES.md §2.2, stage 1; four-lakes-design's `FALLS` and `greatFall`): the gap between two
// shoulders of rock, the crest two tiles thick at the upper water's sill (a notch and a ruined weir's breach a level
// under it, its piers a level over), the bed behind it leading up to it, and in front the plunge pool at the lower
// water's foot, rounded, joined to its water. A straight stair lip bends upstream to its middle (a horseshoe).
//
// The lip is built as a stair of runs on the grid, never a diagonal of one-tile steps (§4.3: those stood as an
// accordion of pleats when the water stopped): runs of one to three tiles facing one way, then one to three facing the
// other, by turns, of unequal lengths, the whole within a tile of the plan's line (so the landmark's lip stays across
// the look). Near square to the grid a lip is one straight run with a step where its line asks for one.
//
// The landmark's foot is the first frame's (§4.3): a shelf at its lake's sill, under a third of a level of water, then
// on to its bay a level deeper where that stays under 1.2 of water (else at the sill), across the lip's whole width,
// so the fall's water opens to the lake as wide as it falls and lands on a shelf, never in deep water.

import { HEADING_DIR } from "../geom";
import { fbm } from "../../math/noise";
import { hypot } from "../../math/portable";
import { Rng } from "../../math/rng";
import { designLevel, sizedLip, WATER, type WaterTable } from "../levels";
import type { Link, Point, PremisePlan } from "../types";
import { clearWater, near4, seedOf, type WaterRaster } from "./field";

/** A lip rising less than a tile in three along the grid is one straight run with a step where its line asks for one:
 *  runs of three or fewer cannot follow it within a tile. */
const STRAIGHT = 1 / 3;
/** The deepest a stair fall's plunge pool goes under its lake's sill. */
const POOL_DEEP = 4;
/** How far beside the gap the shoulders reach, and back from the lip. */
const SHOULDER = 9;
const SHOULDER_BACK = 7;
/** The bed behind a stair fall's crest a level under it, this many rows back. */
const BEHIND = 4;
/** The landmark's hanging valley widens to its lip this many rows behind it. */
const VALLEY_BACK = 5;
/** How much longer than its width a lip's line may be drawn to hold that many tiles. */
const LIP_GROW = 8;
/** The rows in front of a lip's edge that count as its front (a stair's step can leave its pool's edge that far). */
const FRONT = 4;
/** The farthest the landmark's foot runs out from its lip to meet its lake. */
const FOOT_REACH = 24;
/** The deepest water the landmark's curtain lands in (§4.3: a shelf, the bay inside the first frame at most 1.2 deep). */
export const FOOT_SHALLOW = 1.2;
/** How far out from its lip the curtain lands: the shelf there is whole, the bay's ribbon stopping short of it. */
const FOOT_LAND = 2.5;
/** The least drop that pours as a curtain, not a rapid (the fall judge's, fallCurtain.ts `POUR`, 2.5, with the water
 *  over the lip): a notch dropping less goes at the lip's end. */
const CURTAIN_DROP = 3;
/** The tiles between a ruined weir's piers. */
const PIER_GAP = 3;

export interface LipStair {
  /** The axis the lip runs along (0: x, 1: y), and the side the pool lies on along the other (+1 or -1). */
  a: 0 | 1;
  sb: 1 | -1;
  /** Its first and last column (tiles along `a`), and each column's edge between the bed and the pool (a whole
   *  coordinate along the other axis). */
  c0: number;
  c1: number;
  t: Int32Array;
}

/** A lip's stair on the grid: from its ends (`P0`, `P1`) and the way its water falls (`n`), runs of 1 to 3 tiles by
 *  turns within a tile of the line, unequal where the line allows (`rng` draws them). */
export function lipStair(P0: Point, P1: Point, n: Point, rng: Rng): LipStair {
  const dx = P1[0] - P0[0];
  const dy = P1[1] - P0[1];
  const a: 0 | 1 = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
  const b = 1 - a;
  const sb: 1 | -1 = n[b] >= 0 ? 1 : -1;
  const lo = Math.min(P0[a], P1[a]);
  const hi = Math.max(P0[a], P1[a]);
  const c0 = Math.ceil(lo - 0.5);
  const c1 = Math.max(c0, Math.floor(hi - 0.5));
  const span = P1[a] - P0[a];
  const ideal = (c: number) => (span === 0 ? P0[b] : P0[b] + ((P1[b] - P0[b]) * (c + 0.5 - P0[a])) / span);
  const m = c1 - c0 + 1;
  const t = new Int32Array(m);
  const slope = m > 1 ? (ideal(c1) - ideal(c0)) / (c1 - c0) : 0;
  if (Math.abs(slope) < STRAIGHT) {
    for (let k = 0; k < m; k++) t[k] = Math.round(ideal(c0 + k));
    return { a, sb, c0, c1, t };
  }
  const dir = slope > 0 ? 1 : -1;
  t[0] = Math.round(ideal(c0));
  let run = 1;
  let lastH = -1;
  let lastV = -1;
  for (let k = 1; k < m; k++) {
    const want = ideal(c0 + k);
    const opts: number[] = [];
    const weights: number[] = [];
    for (let v = 0; v <= 3; v++) {
      const tv = t[k - 1] + dir * v;
      if (Math.abs(tv - want) > 1) continue;
      if (v === 0 && run >= 3) continue;
      // (unequal runs: a run as long as the last one of its way is drawn seldom; one-tile steps by turns never twice)
      let w = 1;
      if (v > 0 && run === lastH) w *= 0.25;
      if (v > 0 && v === lastV) w *= 0.25;
      if (v === 1 && run === 1 && lastV === 1 && lastH === 1) w = 0.02;
      opts.push(v);
      weights.push(w);
    }
    let v: number;
    if (opts.length) v = opts[rng.weighted(weights)];
    else {
      v = 0;
      for (let q = 1; q <= 3; q++) if (Math.abs(t[k - 1] + dir * q - want) < Math.abs(t[k - 1] + dir * v - want)) v = q;
    }
    if (v === 0) run++;
    else {
      lastH = run;
      lastV = v;
      run = 1;
    }
    t[k] = t[k - 1] + dir * v;
  }
  return { a, sb, c0, c1, t };
}

/** How many tiles a stair's lip holds: those behind its edge with a front tile beside them. */
export function lipTiles(st: LipStair): number {
  const { sb, c0, c1, t } = st;
  const m = c1 - c0 + 1;
  // (in the stair's own frame: column c, row along the other axis)
  const key = (c: number, row: number) => c * 4096 + row;
  const rowAt = (c: number, k: number) => {
    const T = t[Math.max(0, Math.min(m - 1, c - c0))];
    return sb < 0 ? T + k : T - 1 - k;
  };
  const front = new Set<number>();
  for (let c = c0; c <= c1; c++) for (let k = -1; k >= -FRONT; k--) front.add(key(c, rowAt(c, k)));
  const lip = new Set<number>();
  for (let c = c0; c <= c1; c++)
    for (let k = 0; k <= 3; k++) {
      const row = rowAt(c, k);
      const id = key(c, row);
      if (front.has(id)) continue;
      if (
        front.has(key(c - 1, row)) ||
        front.has(key(c + 1, row)) ||
        front.has(key(c, row - 1)) ||
        front.has(key(c, row + 1))
      )
        lip.add(id);
    }
  // (less the starved corners: a lip tile with no crest tile behind it, fed only by the lip beside it)
  const kOf = (c: number, row: number) => {
    const T = t[Math.max(0, Math.min(m - 1, c - c0))];
    return sb < 0 ? row - T : T - 1 - row;
  };
  const feeds = (c: number, row: number) =>
    c >= c0 && c <= c1 && kOf(c, row) >= 0 && !lip.has(key(c, row)) && !front.has(key(c, row));
  for (let again = true; again;) {
    again = false;
    for (const id of lip) {
      const c = Math.floor((id + 2048) / 4096);
      const row = id - c * 4096;
      if (feeds(c - 1, row) || feeds(c + 1, row) || feeds(c, row - 1) || feeds(c, row + 1)) continue;
      lip.delete(id);
      front.add(id);
      again = true;
    }
  }
  return lip.size;
}

/** Every fall's crest, shoulders and plunge pool, over the bodies and channels already laid. */
export function rasterFalls(plan: PremisePlan, table: WaterTable, r: WaterRaster, startPad: Set<number>): void {
  plan.links.forEach((l, li) => {
    if (l.fall) rasterFall(plan, table, r, l, li, startPad);
  });
}

function rasterFall(
  plan: PremisePlan,
  table: WaterTable,
  r: WaterRaster,
  l: Link,
  li: number,
  startPad: Set<number>,
): void {
  const { W, H } = r;
  const f = l.fall!;
  const landmark = l.kind === "fall" && !!l.path;
  const gorge = l.kind === "gorge";
  const up = plan.bodies.findIndex((b) => b.id === l.from);
  const low = plan.bodies.findIndex((b) => b.id === l.to);
  const crest = f.crest;
  const width = sizedLip(l) ? table.links[l.id].width : f.width;
  const mid: Point = [(f.lip[0][0] + f.lip[1][0]) / 2, (f.lip[0][1] + f.lip[1][1]) / 2];
  let dL: Point = [f.lip[1][0] - f.lip[0][0], f.lip[1][1] - f.lip[0][1]];
  const len = hypot(dL[0], dL[1]);
  dL = len > 0 ? [dL[0] / len, dL[1] / len] : [1, 0];
  let n: Point = [-dL[1], dL[0]];
  const hd = HEADING_DIR[f.face];
  if (n[0] * hd[0] + n[1] * hd[1] < 0) n = [-n[0], -n[1]];
  // the lip's stair, the horseshoe set into a stair fall's: a stair as long as its lip is wide, lengthened (a tile at
  // a time) until it holds that many lip tiles, which a diagonal's corners otherwise cost it
  const stairOf = (w: number): LipStair => {
    const P0: Point = [mid[0] - (dL[0] * w) / 2, mid[1] - (dL[1] * w) / 2];
    const P1: Point = [mid[0] + (dL[0] * w) / 2, mid[1] + (dL[1] * w) / 2];
    const st = lipStair(P0, P1, n, new Rng(seedOf(plan, l.id, "lip")));
    const m0 = st.c1 - st.c0 + 1;
    // (on a straight lip only: on a diagonal the stair's runs are its bend, and a horseshoe set into them flattened its
    // middle into one run and steepened its ends into risers its lake barely reached, or combed it with pockets)
    const straight = m0 < 2 || Math.abs(st.t[m0 - 1] - st.t[0]) / (m0 - 1) < STRAIGHT;
    if (!landmark && !gorge && straight) {
      const m = st.c1 - st.c0 + 1;
      const half = m / 2 + 0.5;
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5 - m / 2) / half;
        const back = Math.max(0, Math.round(2.3 * (1 - u * u) - 0.35));
        st.t[k] -= st.sb * back;
      }
    }
    return st;
  };
  let drawn = width;
  let st = stairOf(width);
  while (drawn < width + LIP_GROW && lipTiles(st) < width) st = stairOf(++drawn);
  const rng = new Rng(seedOf(plan, l.id, "notch"));
  const { a, sb, c0, c1, t } = st;
  const m = c1 - c0 + 1;
  const T = (c: number) => t[Math.max(0, Math.min(m - 1, c - c0))];
  // (c, k): column c along the lip, k rows behind its edge (negative: in front, the pool's side)
  const at = (c: number, k: number): number => {
    const row = sb < 0 ? T(c) + k : T(c) - 1 - k;
    const x = a === 0 ? c : row;
    const y = a === 0 ? row : c;
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
  };
  const isUp = (i: number) => (landmark ? r.channel[i] === li + 1 : r.lake[i] === up + 1);
  const isLow = (i: number) => (gorge ? r.channel[i] === li + 1 : r.lake[i] === low + 1);
  const upLevel = landmark
    ? crest + Math.max(WATER.designDepth, table.links[l.id].bedDepth)
    : up >= 0
      ? designLevel(table, plan.bodies[up])
      : crest;
  // (a gorge's bed: its lowest, on the floor)
  const gorgeBed = gorge && Array.isArray(l.bed) ? Math.min(...l.bed) : 0;
  const lowLevel = gorge
    ? gorgeBed + Math.max(WATER.designDepth, table.links[l.id].bedDepth)
    : low >= 0
      ? designLevel(table, plan.bodies[low])
      : 0;
  // (a tile's place: u along the lip from its middle, v out along the way the water falls; its column and row)
  const uv = (x: number, y: number): [number, number] => {
    const dx = x + 0.5 - mid[0];
    const dy = y + 0.5 - mid[1];
    return [dx * dL[0] + dy * dL[1], dx * n[0] + dy * n[1]];
  };
  const ck = (x: number, y: number): [number, number] => {
    const c = a === 0 ? x : y;
    const row = a === 0 ? y : x;
    return [c, sb < 0 ? row - T(c) : T(c) - 1 - row];
  };
  // how far out the lower water lies from the lip's middle, along the way the water falls
  // (and, for a stair fall, how far out its bed lies under the shelf round its shore: the pool runs on to there, or
  // the shelf is a weir of its own between the two and the fall's foot stands over its lake)
  let D = FOOT_REACH;
  let Dbed = 0;
  const lowSill = !gorge && low >= 0 ? plan.bodies[low].sill : -Infinity;
  for (let s = 0.5; s <= FOOT_REACH; s += 0.5) {
    const x = Math.floor(mid[0] + n[0] * s);
    const y = Math.floor(mid[1] + n[1] * s);
    if (x < 0 || y < 0 || x >= W || y >= H || !isLow(y * W + x)) continue;
    if (D === FOOT_REACH) D = s;
    if (r.heights[y * W + x] < lowSill) {
      Dbed = s;
      break;
    }
  }
  // the water on the wrong side: the upper water's in front, the lower's behind the lip
  for (let c = c0 - SHOULDER - 1; c <= c1 + SHOULDER + 1; c++)
    for (let k = -Math.max(8, Math.ceil(D) + 2); k <= SHOULDER_BACK + 1; k++) {
      const i = at(c, k);
      if (i < 0) continue;
      if ((k < 0 && isUp(i)) || (k >= 0 && c >= c0 - 2 && c <= c1 + 2 && isLow(i))) {
        clearWater(r, i);
        r.fixed[i] = 0;
        r.heights[i] = 0;
      }
    }
  // the plunge pool, out along the way the water falls until it meets its lake
  const foot = gorge
    ? gorgeBed
    : low >= 0
      ? Math.max(0, plan.bodies[low].sill - Math.min(POOL_DEEP, plan.bodies[low].deep))
      : 0;
  const ownsLow = (k: number) =>
    !gorge && (plan.links[k].from === l.to || plan.links[k].to === l.to) && !plan.links[k].fall;
  const setPool = (i: number, h: number): boolean => {
    if (i < 0 || startPad.has(i)) return false;
    // (another link's bed gives way where that link runs into or out of the same lake: the pool is that lake's water)
    if (r.channel[i] && r.channel[i] !== li + 1 && !(low >= 0 && ownsLow(r.channel[i] - 1))) return false;
    if (r.lake[i] && r.lake[i] !== low + 1 && r.lake[i] !== up + 1) return false;
    r.channel[i] = 0;
    if (gorge) {
      r.lake[i] = 0;
      r.channel[i] = li + 1;
    } else r.lake[i] = low + 1;
    r.pool[i] = li + 1;
    r.ribbon[i] = 0;
    r.heights[i] = Math.max(0, h);
    r.fixed[i] = 1;
    r.surface[i] = lowLevel;
    return true;
  };
  // (the landmark's foot: the shelf its curtain lands on, under `FOOT_SHALLOW` of water at its lake's level)
  const footShelf = low >= 0 ? Math.min(plan.bodies[low].sill, Math.max(plan.bodies[low].sill - 1, Math.ceil(lowLevel - FOOT_SHALLOW - 1e-9))) : 0;
  const halfLip = drawn / 2;
  const deep = Math.max(6.2, D + 1, landmark ? 0 : Math.min(FOOT_REACH, Dbed + 2));
  const halfW = halfLip + 1.8;
  const reach = landmark ? D + 1.5 : deep;
  const side = landmark ? halfLip + 0.5 : halfW;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const su of [-side - 1, side + 1])
    for (const sv of [-3, reach + 1]) {
      const x = mid[0] + dL[0] * su + n[0] * sv;
      const y = mid[1] + dL[1] * su + n[1] * sv;
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
  for (let y = Math.max(0, Math.floor(by0)); y <= Math.min(H - 1, Math.ceil(by1)); y++)
    for (let x = Math.max(0, Math.floor(bx0)); x <= Math.min(W - 1, Math.ceil(bx1)); x++) {
      const [u, v] = uv(x, y);
      const [c, k] = ck(x, y);
      const inCol = c >= c0 && c <= c1;
      // (never behind the lip's edge, nor beside its ends a row out: the shoulders stand there)
      if (inCol ? k >= 0 : k >= -1 || v <= 0) continue;
      const i = y * W + x;
      if (landmark && low >= 0) {
        if (Math.abs(u) > side || v > reach) continue;
        // (a shelf at its lake's sill under a third of a level of water, then on to the bay a level deeper where its
        // water stays under `FOOT_SHALLOW` (its lake's head over the sill decides), else the sill's: the lake's deeper
        // floor raised to it, since water three levels deep is near black in the game, §4.3)
        const sill = plan.bodies[low].sill;
        // (but the drowned river's ribbon runs on through the shelf to where the curtain lands, two levels under the
        // sill: the start's pump water through a drought, bodies.ts)
        const ribbon = r.ribbon[i] === 1 && v > FOOT_LAND && !(inCol && k === -1);
        setPool(i, inCol && k === -1 ? sill : ribbon ? Math.min(footShelf, r.heights[i]) : footShelf);
        if (ribbon) r.ribbon[i] = 1;
      } else {
        const e = hypot(u / halfW, Math.max(0, v) / deep);
        if (e > 1) continue;
        setPool(i, foot + (e > 0.72 && !gorge ? 1 : 0));
      }
    }
  // the crest: the bed tiles beside the pool's side (the lip), and the row behind them
  const dist = new Map<number, number>();
  const nb = new Int32Array(4);
  const front = new Set<number>();
  for (let c = c0; c <= c1; c++) for (let k = -1; k >= -FRONT; k--) front.add(at(c, k));
  let ring: number[] = [];
  for (let c = c0; c <= c1; c++)
    for (let k = 0; k <= 3; k++) {
      const i = at(c, k);
      if (i < 0 || startPad.has(i) || dist.has(i)) continue;
      near4(W, H, i, nb);
      if (Array.from(nb).some((j) => j >= 0 && front.has(j))) {
        dist.set(i, 1);
        ring.push(i);
      }
    }
  const behind = new Set<number>();
  for (let c = c0; c <= c1; c++) for (let k = 0; k <= Math.max(BEHIND + 2, VALLEY_BACK); k++) behind.add(at(c, k));
  for (let d = 2; d <= BEHIND + 2 && ring.length; d++) {
    const next: number[] = [];
    for (const i of ring) {
      near4(W, H, i, nb);
      for (const j of nb) {
        if (j < 0 || dist.has(j) || !behind.has(j) || startPad.has(j)) continue;
        dist.set(j, d);
        next.push(j);
      }
    }
    ring = next;
  }
  // (a starved corner, a lip tile with no crest behind it, fed only by the lip beside it, pours a film: it is the pool's)
  for (let again = true; again;) {
    again = false;
    for (const [i, d] of dist) {
      if (d !== 1) continue;
      near4(W, H, i, nb);
      if (Array.from(nb).some((j) => j >= 0 && (dist.get(j) ?? 0) >= 2)) continue;
      let floor = Infinity;
      for (const j of nb) if (j >= 0 && r.pool[j] === li + 1) floor = Math.min(floor, r.heights[j]);
      if (floor === Infinity || !setPool(i, floor)) continue;
      dist.delete(i);
      front.add(i);
      again = true;
    }
  }
  const lip = [...dist].filter(([, d]) => d === 1).map(([i]) => i);
  // (along the lip: by column, then down the stair's runs)
  const colOf = (i: number) => (a === 0 ? i % W : Math.floor(i / W));
  const rowOf = (i: number) => (a === 0 ? Math.floor(i / W) : i % W);
  const slope = m > 1 ? Math.sign(t[m - 1] - t[0]) || 1 : 1;
  lip.sort((p, q) => colOf(p) - colOf(q) || slope * (rowOf(p) - rowOf(q)));
  // the notch, the ruined weir's piers and breach, on the lip and through the crest behind it
  // (a corner's: across from whichever of its fronts has the crest's second row behind it)
  const behindOf = (i: number): number => {
    near4(W, H, i, nb);
    for (const j of nb)
      if (j >= 0 && front.has(j)) {
        const o = i + (i - j);
        if (dist.get(o) === 2) return o;
      }
    return -1;
  };
  const notch: number[] = [];
  const piers: number[] = [];
  const L = lip.length;
  if (L >= 4) {
    const pick = (u: number) => Math.max(0, Math.min(L - 1, Math.round(u * (L - 1))));
    if (f.piers > 0) {
      // (three tiles apart, about the lip's middle: PREMISES §2.3, the bridge's place)
      const ps = Array.from({ length: f.piers }, (_, k) =>
        Math.max(0, Math.min(L - 1, pick(0.5) + Math.round((k - (f.piers - 1) / 2) * (PIER_GAP + 1)))),
      );
      for (const p of ps) piers.push(lip[p]);
      if (f.breach > 0 && ps.length >= 2) {
        const gap0 = ps[Math.floor((ps.length - 1) / 2)];
        const gap1 = ps[Math.floor((ps.length - 1) / 2) + 1];
        const first = Math.max(gap0 + 1, Math.round((gap0 + gap1) / 2 - f.breach / 2 + 0.5));
        for (let k = 0; k < f.breach && first + k < gap1; k++) notch.push(lip[first + k]);
      }
    } else if (f.breach > 0) {
      const first = pick(0.5) - Math.floor(f.breach / 2);
      for (let k = 0; k < f.breach; k++) notch.push(lip[Math.max(0, Math.min(L - 1, first + k))]);
    }
    // (a notch dropping a curtain's height, `CURTAIN_DROP` and more, in a run's middle, the tiles each side of it on
    // its row: beside a step of the stair it starves the corner tile past it; a shorter, at a step of 3, is a rapid,
    // and in the lip's middle it split the curtain in two: at one end of the lip, through the crest behind it)
    if (f.notch > 0) {
      const toss = rng.float();
      // (at one end of the lip, the tossed end where the crest stands behind it, else the other)
      const ends = toss < 0.5 ? [0, L - f.notch] : [L - f.notch, 0];
      const atEnd = () => ends.find((e) => behindOf(lip[e]) >= 0) ?? ends[0];
      let p = -1;
      if (f.height - 1 >= CURTAIN_DROP) {
        // (a curtain's notch in a run's middle near the lip's middle; a lip with none there, a diagonal's runs of one
        // or two, takes it at an end, where no lip tile lies past it to starve)
        const want = pick(0.35 + 0.3 * toss);
        const midRun = (k: number) =>
          k >= 1 && k + f.notch < L && rowOf(lip[k - 1]) === rowOf(lip[k]) && rowOf(lip[k + f.notch]) === rowOf(lip[k]);
        for (let d = 0; d <= L * 0.2; d++) {
          if (midRun(want - d)) {
            p = want - d;
            break;
          }
          if (midRun(want + d)) {
            p = want + d;
            break;
          }
        }
        if (p < 0) p = atEnd();
      } else p = atEnd();
      for (let k = 0; k < f.notch; k++) notch.push(lip[Math.max(0, Math.min(L - 1, p + k))]);
    }
  }
  const level = new Map<number, number>();
  for (const i of notch) {
    level.set(i, crest - 1);
    const o = behindOf(i);
    if (o >= 0) level.set(o, crest - 1);
  }
  // (a pier on the lip only: the crest behind it runs on, so no lip tile past it is cut off from its water)
  for (const i of piers) level.set(i, crest + 1);
  // the crest and the bed behind it
  const markUp = (i: number, h: number) => {
    if (landmark) {
      r.channel[i] = li + 1;
      r.lake[i] = 0;
    } else {
      r.lake[i] = up + 1;
      r.channel[i] = 0;
    }
    r.pool[i] = 0;
    r.heights[i] = Math.max(0, h);
    r.fixed[i] = 1;
    r.surface[i] = upLevel;
  };
  for (const [i, d] of dist) {
    if (r.lake[i] && r.lake[i] !== up + 1 && r.lake[i] !== low + 1) continue;
    // (another link's bed behind a lip, a leat or brook out of the same lake, keeps its tile but on the crest)
    if (r.channel[i] && r.channel[i] !== li + 1 && d > 2) continue;
    if (d <= 2 && level.get(i) === crest + 1) {
      // (a pier stands out of the water: ground)
      clearWater(r, i);
      r.heights[i] = crest + 1;
      r.fixed[i] = 1;
    } else if (d <= 2) {
      markUp(i, level.get(i) ?? crest);
      r.crest[i] = li + 1;
    } else if (landmark) {
      markUp(i, crest);
    } else if (isUp(i)) {
      if (r.heights[i] > crest - 1) r.heights[i] = crest - 1;
    } else markUp(i, crest - 1);
  }
  if (landmark)
    for (let c = c0; c <= c1; c++)
      for (let k = 0; k <= VALLEY_BACK; k++) {
        const i = at(c, k);
        if (i < 0 || dist.has(i) || startPad.has(i) || (r.lake[i] && !isUp(i)) || (r.channel[i] && !isUp(i))) continue;
        markUp(i, crest);
      }
  // the shoulders: rock beside the gap, upstream of the lip only, stepping back away from it
  const sSh = seedOf(plan, l.id, "shoulder");
  const sTier = seedOf(plan, l.id, "tier");
  for (let c = c0 - SHOULDER; c <= c1 + SHOULDER; c++) {
    if (c >= c0 && c <= c1) continue;
    const away = c < c0 ? c0 - c : c - c1;
    const back = away <= 2 ? 0 : Math.max(0, Math.round(0.3 * (away - 2) + 1.3 * fbm(sSh, c * 3, li * 7, 4, 2)));
    const side = c < c0 ? c0 - 3.2 : c1 + 3.2;
    for (let k = 0; k <= SHOULDER_BACK; k++) {
      if (k < back) continue;
      const i = at(c, k);
      if (i < 0 || startPad.has(i)) continue;
      const x = i % W;
      const y = (i - x) / W;
      const tier = hypot(c - side, (k - 1.2) * 1.25) + 0.9 * fbm(sTier, x, y, 5, 2);
      const rock = away <= 2 && k <= 2;
      let want = tier < 5.8 ? crest + 2 : -1;
      if (rock) want = Math.max(want, crest + 3);
      if (want < 0) continue;
      const water = r.lake[i] !== 0 || r.channel[i] !== 0;
      if (water && !rock) continue;
      if (water && !isUp(i) && !isLow(i)) continue;
      clearWater(r, i);
      r.heights[i] = Math.max(r.fixed[i] ? r.heights[i] : 0, want);
      r.fixed[i] = 1;
    }
  }
  r.lips[l.id] = lip;
  r.notches[l.id] = notch;
  r.piers[l.id] = piers;
}
