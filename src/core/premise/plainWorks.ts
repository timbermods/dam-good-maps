// Stage 4 of the poisoned floodplain (docs/design/poisoned-floodplain.md §6, §7 "works" and "proof", §9 row 4): its
// ladder, each rung a template on the land the plain made for it, measured as `ladder.ts` measures (the water a work
// adds by number, `flowThrough` and `prefillFrom` on the land with it against without it, the soil's reach of that
// water, `estimateGain`), with the soil's contamination counted (§8: `estimateGain`'s `poison`), so a work that turns
// bad water away gains the tiles it clears:
//
// - the low place's levee (first): the plain-side bank along the low place nearest the start raised a level over the
//   plain; in a badtide (the river red) it keeps the red tongue off the plain: its gain, the tiles it clears then;
// - the pond on the start's brook (small): the brook's bed on the terrace dug a level deeper, a round pond the brook
//   fills and keeps when its spring stops: its gain, the water it holds;
// - the backswamp's levee (small): 20 tiles of the plain's edge along a riser where the dead band laps onto the plain
//   most, a level higher: the poison that lapped up the riser cleared;
// - the turn (medium): a dam across the gulch at its narrows a level over the col, so the red water rises behind it,
//   pours over the col and runs down the Dry Fork to its own edge: the Red Fall stops, the red bed drains, the dead
//   band clears (its gain, the tiles it clears);
// - the river in (large): a weir across the river just below the first slough's low place to the slough's bed, so the
//   river stands over the slough's mouth (`plainLand.ts` `sloughMouths`) and runs down it to the backswamp and the old
//   red bed: its gain, the tiles it turns green.
//
// The checks by number (§7 "works", no settle: `PLAIN_WORKS_CHECKS`) and the two proofs (§7 "proof", `plainProof`): the
// works built as a player builds them, operations on the settled map's session (`plainProof.ts`), the core's water and
// soil run on it.

import { tilesToRuns } from "../math/grid";
import { hypot } from "../math/portable";
import { soilContamination } from "../sim/contamination";
import { flowThrough } from "../sim/prefill";
import { dist, pathDist, pathLength, pointAt } from "./geom";
import { estimateGain, soilReach, waterOn, type Ladder, type Water, type WorkSite } from "./ladder";
import { floorTiles } from "./plainMap";
import { valleyTiles, type PlainLand } from "./plainLand";
import { PLAIN_IDS, plainLevel, plainOf, toLocal, toMap, turnOf, walk } from "./premises/poisonedPlain";
import type { Point, PremisePlan } from "./types";
import { stageModel, type StageWater } from "./water";

const I = PLAIN_IDS;

/** The turn's dam (§6, step 4): its crest `over` a level over the col, so the col is the water's only way out (a dam at
 *  the col's own level, two over the narrows' floor as the design first had it, split the stream: on seed 1 at 128² 500
 *  of its 501 red tiles stayed on the floor); `most` tiles at most; sited within `reach` tiles along the gulch either
 *  side of its narrows (`step` apart), downstream of where the col's way leaves its floor, from wall to wall within
 *  `side` tiles of its line; where no line there is `most` tiles or fewer, anywhere on the gulch's floor below the
 *  junction. */
export const TURN = { over: 1, most: 6, reach: 3, step: 0.5, side: 8 } as const;
/** The weir: how far each way across the river it runs to its banks, and along the river either side of its point it
 *  reads the river's line. */
export const WEIR = { side: 16, chord: 3 } as const;
/** The pond on the start's brook: its radius round its point, dug a level under the brook's bed. */
export const POND = { r: 2.2 } as const;
/** The backswamp's levee: its tiles along the riser, and how near its first tile the plain's poisoned ground is
 *  counted to find where the dead band laps most. */
export const SWAMP_LEVEE = { tiles: 20, near: 4 } as const;
/** How far from the Dry Fork's end its edge tiles are its own (`turn.byNumber`, `turn.proved`). */
const FORK_END = 6;

type Change = [tile: number, floor: number][];

/** Tiles along a line of the map from `c` both ways along `n`, out to ground at `level` or over within `side` tiles,
 *  made watertight side to side (a diagonal step's corner tile added where both are low); empty where a side finds no
 *  such ground. `h` is the land. */
function lineAcross(c: Point, n: Point, h: ArrayLike<number>, W: number, H: number, level: number, side: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number) => {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  };
  for (const sd of [1, -1]) {
    let met = false;
    let last = -1;
    for (let k = 0; k <= side; k += 0.5) {
      const x = Math.floor(c[0] + n[0] * k * sd);
      const y = Math.floor(c[1] + n[1] * k * sd);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (i === last) continue;
      if (last >= 0) {
        const lx = last % W;
        const ly = (last - lx) / W;
        // (a diagonal step: water passes between the two tiles at its corners unless one stands at the level)
        if (lx !== x && ly !== y) {
          const a = ly * W + x;
          const b = y * W + lx;
          if (h[a] < level && h[b] < level) add(h[a] <= h[b] ? b : a);
        }
      }
      last = i;
      if (h[i] >= level) {
        met = true;
        break;
      }
      add(i);
    }
    if (!met) return [];
  }
  return out;
}

/** The turn's site (`TURN`): the fewest tiles across the gulch near its narrows at the dam's level, or null. */
export function turnSite(land: PlainLand, h: ArrayLike<number>, niche: [number, number] | null = null): { tiles: number[]; level: number; s: number } | null {
  const { plan } = land;
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const sv = land.found.valley;
  const len = sv.line.length - 1;
  const level = p.col.level + TURN.over;
  const t = valleyTiles(T, W, H, sv);
  // (the col's way leaves the gulch's floor here: the dam stands below it)
  let junction = len;
  for (const i of land.found.into) if (t.s[i] >= 0 && t.d[i] <= (sv.half[Math.max(0, Math.min(len, Math.round(t.s[i])))] ?? 2) + 1) junction = Math.min(junction, t.s[i]);
  // (and below the red source: the dam holds the water back only where the source stands behind it)
  if (niche) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const i = (niche[1] + dy) * W + niche[0] + dx;
    if (t.s[i] >= 0) junction = Math.min(junction, t.s[i]);
  }
  const n0 = land.found.narrows.s;
  let best: { tiles: number[]; level: number; s: number } | null = null;
  const look = (from: number, to: number) => {
    for (let s = from; s <= to + 1e-9; s += TURN.step) {
      const k = Math.max(0, Math.min(len - 1, Math.floor(s)));
      const a = sv.line[k];
      const b = sv.line[k + 1];
      const l = hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const c = toMap(T, [a[0] + (b[0] - a[0]) * (s - k), a[1] + (b[1] - a[1]) * (s - k)]);
      const e = toMap(T, [a[0] + (b[0] - a[0]) * (s - k) - (b[1] - a[1]) / l, a[1] + (b[1] - a[1]) * (s - k) + (b[0] - a[0]) / l]);
      const tiles = lineAcross(c, [e[0] - c[0], e[1] - c[1]], h, W, H, level, TURN.side);
      if (!tiles.length) continue;
      if (!best || tiles.length < best.tiles.length || (tiles.length === best.tiles.length && Math.abs(s - n0) < Math.abs(best.s - n0))) best = { tiles, level, s };
    }
  };
  look(Math.max(1, n0 - TURN.reach), Math.min(junction - 1, n0 + TURN.reach));
  // (where the narrows' shoulders stand under the dam's level, the gulch's whole floor below the junction: its
  // narrowest line at that level is its narrows for the dam)
  if (!best || (best as { tiles: number[] }).tiles.length > TURN.most) look(1, junction - 1);
  return best;
}

/** The weir's site: across the river at the plan's point, square to its line there (the chord `WEIR.chord` either
 *  way), two rows, to the first slough's head bed (the river stands over its mouth). */
export function weirSite(plan: PremisePlan, h: ArrayLike<number>): { tiles: number[]; level: number } | null {
  const p = plainOf(plan)!;
  const river = plan.links.find((l) => l.id === I.river);
  const work = plan.works.find((x) => x.id === "riverIn");
  if (!river?.path || !work || !p.sloughs.length) return null;
  const path = river.path;
  const level = p.sloughs[0].bed[0];
  const len = pathLength(path);
  const s0 = pathDist(work.at[0], work.at[1], path).s;
  const c0 = pointAt(path, Math.max(0, s0 - WEIR.chord)).p;
  const c1 = pointAt(path, Math.min(len, s0 + WEIR.chord)).p;
  const cl = dist(c0, c1) || 1;
  const d: Point = [(c1[0] - c0[0]) / cl, (c1[1] - c0[1]) / cl];
  const n: Point = [-d[1], d[0]];
  const p0 = pointAt(path, s0).p;
  const out = new Set<number>();
  for (const ds of [0, 0.7]) {
    const tiles = lineAcross([p0[0] + d[0] * ds, p0[1] + d[1] * ds], n, h, plan.W, plan.H, level, WEIR.side);
    if (!tiles.length) return null;
    for (const i of tiles) out.add(i);
  }
  return { tiles: [...out], level };
}

/** The first rung's site: the plain-side bank along the low place nearest the start (the plan's `lowLevee`), its first
 *  row past the river's water, raised a level over the plain there. */
function lowLeveeSite(plan: PremisePlan, w: StageWater, h: ArrayLike<number>): Change {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const r = w.raster;
  const { W, H } = plan;
  const river = plan.links.find((l) => l.id === I.river)!;
  const half = river.half ?? 2.5;
  const work = plan.works.find((x) => x.id === "lowLevee");
  const low = work && p.levee.low.find((o) => dist(o.at, work.at) < 0.5);
  if (!low) return [];
  const out = new Map<number, number>();
  for (const q of walk(river.path!, 0.5)) {
    if (q.s < low.from - 1 || q.s > low.to + 1) continue;
    let n: Point = [-q.dir[1], q.dir[0]];
    if ((low.at[0] - q.p[0]) * n[0] + (low.at[1] - q.p[1]) * n[1] < 0) n = [-n[0], -n[1]];
    for (let k = half + 0.5; k <= half + 2.5; k += 0.5) {
      const x = Math.floor(q.p[0] + n[0] * k);
      const y = Math.floor(q.p[1] + n[1] * k);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i = y * W + x;
      if (r.channel[i] || r.lake[i] || r.pool[i]) continue;
      const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
      const crest = plainLevel(p, u, v) + 1;
      if (h[i] < crest) out.set(i, crest);
      break;
    }
  }
  return [...out];
}

/** The backswamp's levee: `SWAMP_LEVEE.tiles` of the plain's edge on a riser (plain tiles beside lower backswamp or
 *  slough ground, where the red stream and the old red bed lie), grown along the edge from the edge tile with the
 *  most of the plain's poisoned dry ground within `SWAMP_LEVEE.near` tiles (where the dead band laps onto the plain
 *  most, by the soil's contamination on day 1: `dead`), the nearest to it first, each a level higher. The plan's point
 *  breaks a tie. */
function swampLeveeSite(plan: PremisePlan, floor: Uint8Array, h: ArrayLike<number>, dead: Float64Array, wet: ArrayLike<number>): Change {
  const { W, H } = plan;
  const N = W * H;
  const work = plan.works.find((x) => x.id === "swampLevee");
  if (!work) return [];
  const edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (floor[i] !== 1 || wet[i] > 0) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && (floor[j] === 2 || floor[j] === 4) && h[j] < h[i]) edge[i] = 1;
  }
  const R = SWAMP_LEVEE.near;
  let seed = -1;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < N; i++) {
    if (!edge[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    let laps = 0;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > R * R) continue;
        const j = yy * W + xx;
        if (floor[j] === 1 && dead[j] > 0 && !(wet[j] > 0)) laps++;
      }
    const d = dist([x + 0.5, y + 0.5], work.at);
    if (laps > best || (laps === best && d < bd)) [best, bd, seed] = [laps, d, i];
  }
  if (seed < 0) return [];
  const at: Point = [(seed % W) + 0.5, Math.floor(seed / W) + 0.5];
  // (grown along the edge from the seed, the nearest to it first)
  const got = new Set<number>([seed]);
  while (got.size < SWAMP_LEVEE.tiles) {
    let next = -1;
    let nd = Infinity;
    for (const i of got) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!edge[j] || got.has(j)) continue;
          const d = dist([xx + 0.5, yy + 0.5], at);
          if (d < nd) [nd, next] = [d, j];
        }
    }
    if (next < 0) break;
    got.add(next);
  }
  return [...got].map((i) => [i, h[i] + 1]);
}

/** The pond on the start's brook: the tiles within `POND.r` of the plan's point dug to a level under the brook's bed
 *  there (the brook's own tiles and its banks: a round pond in its course). */
function pondSite(plan: PremisePlan, w: StageWater, h: ArrayLike<number>): Change {
  const r = w.raster;
  const { W, H } = plan;
  const work = plan.works.find((x) => x.id === "brookPond");
  const k = plan.links.findIndex((l) => l.id === I.brook) + 1;
  if (!work || !k) return [];
  const R = Math.ceil(POND.r);
  const cx = Math.floor(work.at[0]);
  const cy = Math.floor(work.at[1]);
  let bed = Infinity;
  const near: number[] = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if ((x + 0.5 - work.at[0]) ** 2 + (y + 0.5 - work.at[1]) ** 2 > POND.r * POND.r) continue;
      if (r.lake[i] || r.pool[i] || (r.channel[i] && r.channel[i] !== k)) return [];
      if (r.channel[i] === k) bed = Math.min(bed, h[i]);
      near.push(i);
    }
  if (bed === Infinity) return [];
  return near.map((i) => [i, bed - 1]);
}

/** The poisoned floodplain's ladder on its land (`h`: the land as built, the red source's niche dug): each rung's
 *  site, its change to the land and what it buys by number; day 1's shares. */
export function plainLadder(land: PlainLand, h: Uint8Array, niche: [number, number] | null = null): Ladder {
  const { plan, water: w } = land;
  const { W, H } = plan;
  const N = W * H;
  const base = Float64Array.from(h);
  const river = plan.links.findIndex((l) => l.id === I.river) + 1;
  const springs = plan.bodies.findIndex((b) => b.id === I.springs) + 1;
  const r = w.raster;
  const site = (id: string): WorkSite => {
    const x = plan.works.find((k) => k.id === id)!;
    return { id: x.id, kind: x.kind, rung: x.rung, on: x.on, region: x.region, tiles: [], does: "build", needs: x.needs, green: 0, wet: 0, reservoir: 0, reach: [], paid: false };
  };
  const withChange = (f: Float64Array, c: Change): Float64Array => {
    const g = Float64Array.from(f);
    for (const [i, v] of c) g[i] = v;
    return g;
  };
  // (a badtide: the river's water and its springs' red, as `plainMap.ts` `badtideReach` reads it)
  const badtide = (x: Water): Water => {
    const c = Float64Array.from(x.contamination);
    for (let i = 0; i < N; i++) if (x.depth[i] > 0 && (r.channel[i] === river || r.lake[i] === springs)) c[i] = 1;
    return { ...x, contamination: c };
  };
  const day1 = waterOn(w, base);
  const dead1 = soilContamination(Uint8Array.from(h), Float64Array.from(day1.depth), Float64Array.from(day1.contamination), W, H);
  const out: WorkSite[] = [];
  for (const work of plan.works) {
    const s = site(work.id);
    let change: Change = [];
    let measure: "green" | "cleared" | "reservoir" = "green";
    let bad = false;
    if (work.id === "lowLevee") {
      change = lowLeveeSite(plan, w, h);
      measure = "cleared";
      bad = true;
    } else if (work.id === "brookPond") {
      change = pondSite(plan, w, h);
      s.does = "dig";
      measure = "reservoir";
    } else if (work.id === "swampLevee") {
      change = swampLeveeSite(plan, land.relief.floor, h, dead1, day1.depth);
      measure = "cleared";
    } else if (work.id === "turn") {
      const t = turnSite(land, h, niche);
      if (t) change = t.tiles.map((i) => [i, t.level]);
      measure = "cleared";
    } else if (work.id === "riverIn") {
      const t = weirSite(plan, h);
      if (t) change = t.tiles.map((i) => [i, Math.max(h[i], t.level)]);
    }
    s.tiles = change.map(([i]) => i);
    if (change.length) s.level = s.does === "dig" ? Math.min(...change.map(([, v]) => v)) : Math.max(...change.map(([, v]) => v));
    if (!s.tiles.length) {
      s.note = "no site on the land";
      out.push(s);
      continue;
    }
    const before = bad ? badtide(day1) : day1;
    const ground = withChange(base, change);
    const after0 = waterOn(w, ground);
    const after = bad ? badtide(after0) : after0;
    const gain = estimateGain(h, W, H, before, after, { poison: true, heights: ground });
    s.green = gain.green;
    s.wet = gain.wet;
    s.cleared = gain.cleared;
    s.reach = tilesToRuns(gain.tiles, W);
    s.reservoir = Math.max(0, Math.round(after.held - before.held));
    const v = measure === "reservoir" ? s.reservoir : measure === "cleared" ? gain.cleared : gain.green;
    const range = measure === "reservoir" ? work.gives.reservoir : work.gives.green;
    s.paid = !!range && v >= range[0];
    if (!s.paid && range) s.note = `${measure === "reservoir" ? "holds" : measure === "cleared" ? "clears" : "greens"} ${v}, under its floor of ${range[0]}`;
    out.push(s);
  }
  const soil = soilReach(h, day1, W, H);
  let water = 0;
  let moist = 0;
  for (let i = 0; i < N; i++) {
    if (soil[i] === 2) water++;
    else if (soil[i] === 1) moist++;
  }
  const small = out.filter((x) => x.rung === "small").reduce((t, x) => t + x.green, 0);
  return { works: out, day1: { water: water / N, moist: moist / N }, small: small / N, together: out.reduce((t, x) => t + x.green, 0) / N };
}

/** The levees' clears on the settled first build (`plainMap.ts` reads them after its settle): the stage's water stands
 *  the river shallower than the core settles it (seed 1 at 128²: 0.6 deep at the low place against 1.35), so its
 *  badtide's tongue barely reaches the plain and a levee there clears nothing by it. On the settled water (a badtide's
 *  for the low place's levee: the river and its springs red), each levee's tiles raised, the soil's contamination after
 *  against before (`estimateGain`'s `poison` with the raised ground; the water is the settled water, a levee on dry
 *  bank moving none): sets `cleared`, `reach`, `paid` and `note` on the ladder's two levees. */
export function settledClears(land: PlainLand, ladder: Ladder, built: { heights: ArrayLike<number>; water: ArrayLike<number>; contamination: ArrayLike<number> }): void {
  const { plan, water: w } = land;
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const river = plan.links.findIndex((l) => l.id === I.river) + 1;
  const springs = plan.bodies.findIndex((b) => b.id === I.springs) + 1;
  for (const id of ["lowLevee", "swampLevee"]) {
    const s = ladder.works.find((x) => x.id === id);
    const work = plan.works.find((x) => x.id === id);
    if (!s?.tiles.length || !work || s.level === undefined) continue;
    const c = Float64Array.from(built.contamination);
    if (id === "lowLevee") for (let i = 0; i < N; i++) if (built.water[i] > 0 && (r.channel[i] === river || r.lake[i] === springs)) c[i] = 1;
    const before = { depth: Float64Array.from(built.water), contamination: c };
    const after = { depth: Float64Array.from(built.water), contamination: c };
    const ground = Float64Array.from(built.heights);
    for (const i of s.tiles) {
      ground[i] = Math.max(ground[i], id === "swampLevee" ? built.heights[i] + 1 : s.level);
      after.depth[i] = 0;
    }
    const gain = estimateGain(built.heights, W, H, before, after, { poison: true, heights: ground });
    s.cleared = gain.cleared;
    s.reach = tilesToRuns(gain.tiles, W);
    const range = work.gives.green;
    s.paid = !!range && gain.cleared >= range[0];
    s.note = s.paid || !range ? undefined : `clears ${gain.cleared}, under its floor of ${range[0]}`;
  }
}

/** The measure each rung's `gives` floors: the tiles it clears (the levees, the turn), the water it holds (the pond), the
 *  tiles it turns green (the river in). */
export function plainMeasure(s: WorkSite): number {
  if (s.id === "brookPond") return s.reservoir;
  if (s.id === "lowLevee" || s.id === "swampLevee" || s.id === "turn") return s.cleared ?? 0;
  return s.green;
}

// ------------------------------------------------------------------------------------------------- the checks by number

/** What a works check reads: the land and the ladder on it (`h`, the land as built). */
export interface PlainWorksContext {
  land: PlainLand;
  heights: Uint8Array;
  ladder: Ladder;
  /** The red source's niche (`plainMap.ts` `redNiche`): the map's red water rises there, so the turn's check runs it
   *  from there. */
  niche?: [number, number] | null;
}

export interface PlainWorksInvariant {
  id: string;
  test(ctx: PlainWorksContext): { ok: true } | { ok: false; reason: string };
}

const ok = { ok: true } as const;
const no = (reason: string) => ({ ok: false as const, reason });

/** The floor with one work's site laid as the ladder reads it: built up to its level, or dug down to it. */
function withSite(h: Uint8Array, s: WorkSite): Float64Array {
  const f = Float64Array.from(h);
  for (const i of s.tiles) f[i] = s.does === "build" ? Math.max(f[i], s.level ?? f[i]) : Math.min(f[i], s.level ?? f[i]);
  return f;
}

/** The map's edge tiles within `FORK_END` of the Dry Fork's end. */
export function forkEnd(plan: PremisePlan): (i: number) => boolean {
  const p = plainOf(plan)!;
  const end = p.fork.path[p.fork.path.length - 1];
  const { W, H } = plan;
  return (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return (x === 0 || y === 0 || x === W - 1 || y === H - 1) && dist([x + 0.5, y + 0.5], end) <= FORK_END;
  };
}

/** `works.sites` (§6): every rung stands on the land, its tiles and its level; the turn `TURN.most` tiles or fewer. */
const worksSites: PlainWorksInvariant = {
  id: "works.sites",
  test({ land, ladder }) {
    for (const w of land.plan.works) {
      const s = ladder.works.find((x) => x.id === w.id);
      if (!s || !s.tiles.length) return no(`${w.id} has no site on the land`);
      if (s.level === undefined) return no(`${w.id} has no level`);
    }
    const turn = ladder.works.find((x) => x.id === "turn")!;
    if (turn.tiles.length > TURN.most) return no(`The turn's dam is ${turn.tiles.length} tiles (${TURN.most} at most)`);
    return ok;
  },
};

/** `works.paid` (§6's `gives`): every rung buys its floor. */
const worksPaid: PlainWorksInvariant = {
  id: "works.paid",
  test({ ladder }) {
    for (const s of ladder.works) if (!s.paid) return no(`${s.id}: ${s.note ?? "under its floor"}`);
    return ok;
  },
};

/** `turn.byNumber` (§7): the red source's water (from its niche, where the map's source stands) by `flowThrough` with the dam built stands at the col's level or over
 *  behind it, reaches the Dry Fork's edge and touches no tile of the valley's floor. */
const turnByNumber: PlainWorksInvariant = {
  id: "turn.byNumber",
  test({ land, heights, ladder, niche }) {
    const { plan, water } = land;
    const p = plainOf(plan)!;
    const turn = ladder.works.find((x) => x.id === "turn");
    if (!turn?.tiles.length) return no("The turn has no dam");
    const m = stageModel(water);
    const red = m.emitters.filter((e) => e.contamination > 0).map((e) => (niche ? { ...e, cells: [0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => (niche[1] + dy) * plan.W + niche[0] + dx)) } : e));
    const flow = flowThrough({ ...m, floor: withSite(heights, turn), emitters: red });
    const on = floorTiles(plan, land.relief.floor);
    const end = forkEnd(plan);
    let edge = false;
    let floor = -1;
    let stands = -Infinity;
    for (let i = 0; i < on.length; i++) {
      if (!flow.path[i]) continue;
      if (on[i] && floor < 0) floor = i;
      if (end(i)) edge = true;
      if (land.found.into.includes(i)) stands = Math.max(stands, flow.level[i]);
    }
    if (floor >= 0) return no(`With the dam, the red water still reaches the valley's floor at ${floor % plan.W}, ${Math.floor(floor / plan.W)}`);
    if (stands < p.col.level) return no(`With the dam, the red water stands at ${stands === -Infinity ? "nothing" : stands} on the col's way, under the col's ${p.col.level}`);
    if (!edge) return no(`With the dam, the red water never reaches ${plan.names[I.fork] ?? I.fork}'s edge`);
    return ok;
  },
};

/** `riverIn.byNumber` (§7): the river's water by `flowThrough` with the weir built stands at the slough's mouth's bed or
 *  over and runs down the slough to the backswamp. */
const riverInByNumber: PlainWorksInvariant = {
  id: "riverIn.byNumber",
  test({ land, heights, ladder }) {
    const { plan, water } = land;
    const p = plainOf(plan)!;
    const inn = ladder.works.find((x) => x.id === "riverIn");
    if (!inn?.tiles.length) return no("The river in has no weir");
    const m = stageModel(water);
    const flow = flowThrough({ ...m, floor: withSite(heights, inn), emitters: m.emitters.filter((e) => !(e.contamination > 0)) });
    const sl = p.sloughs[0];
    const { W } = plan;
    const fl = land.relief.floor;
    const head = sl.path[0];
    const end = sl.path[sl.path.length - 1];
    let mouth = false;
    let swamp = false;
    for (let i = 0; i < flow.path.length; i++) {
      if (!flow.path[i]) continue;
      const q: Point = [(i % W) + 0.5, Math.floor(i / W) + 0.5];
      if (fl[i] === 4 && dist(q, head) <= sl.half + 1.5 && flow.level[i] >= sl.bed[0]) mouth = true;
      if (fl[i] === 2 && dist(q, end) <= sl.half + 3) swamp = true;
    }
    if (!mouth) return no(`With the weir, the river never stands at ${plan.names[sl.id] ?? sl.id}'s mouth`);
    if (!swamp) return no(`With the weir, the river's water never runs down ${plan.names[sl.id] ?? sl.id} to the backswamp`);
    return ok;
  },
};

/** The poisoned floodplain's works checks by number, on its ladder. */
export const PLAIN_WORKS_CHECKS: PlainWorksInvariant[] = [worksSites, worksPaid, turnByNumber, riverInByNumber];
/** The ones a map is drawn again for (`works.paid` is said: a rung short of its floor is a note, as the gate's). */
export const PLAIN_WORKS_BLOCKING = ["works.sites", "turn.byNumber", "riverIn.byNumber"] as const;

export function plainWorksFailures(ctx: PlainWorksContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of PLAIN_WORKS_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
