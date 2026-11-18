// The poisoned floodplain's water and hazard (docs/design/poisoned-floodplain.md §2, §4, §7, §9 row 3): its map from the
// land (`plainLand.ts`, stage 2) through the shared build, as `gateMap.ts` makes the Gate's. The three sources stand
// where the plan put them: the river's springs and the terrace's spring as springs of their bodies (`map.ts`
// `springsOf`), the red source as the badwater source in the Red Spring's pool at the gulch's head (`redNiche`). One
// canonical settle (stage 5), stage 6's life on the settled ground and the dead band's dead stands (`deadBand`), the map
// built again with the settle reused (the life's fill stands kept off the start's wood, `START_WOOD_CLEAR`), and its checks in profile "generate" (the shared gate, the start's floors among
// them). Then the settled invariants, each read on the settled water (§7 "settled"):
//
// - `river.clean`: no tile of the river above the red stream's join (all of it where the red stream leaves by its own
//   exit), of its springs' pool, the terrace's spring or its brook, red as the game loads it: contamination over 0 in
//   the map file's own values (D498).
// - `water.leaks`: no water off its courses: every wet tile on stage 1's water (the bodies, the channels, the plunge
//   pools, the crests), on the gaps cut between them (`plainLand.ts` `courseGaps`) or on the gulch's floor, the red
//   stream's own valley down to its fall.
// - `plain.bands` again, on the settled water and the game's soil: dead 8 to 25 % of the floor, dry 30 % or more.
// - `fall.settled`: the Red Fall drops its drop over the backswamp (6 or 7) less half a level on the settled water (the
//   Gate's `veil.settled`), lip to the Red Pool's water:
//   the fall reads as a fall, not a rapid, from the start's first frame.
// - `fall.whole` (planning's ruling of 2026-11-17): the Red Fall one whole curtain on the settled water by the shared
//   fall judge (`curtain.ts`, `redFallCurtain`), never split by water pouring off the gulch beside its lip.
// - `levee.holds`: in a badtide's water (the river red, its depth as settled) the game's soil rule poisons the plain
//   only within 7 tiles of the river along a low place in the levee, beyond what day 1 has dead already.
// - `riverIn.green` (planning's ruling of 2026-11-17): with the turn's dam and the river in's weir raised on the built
//   ground, the core's settle and the game's soil (`riverInBands`, the proof's own green), the floor 60 % green or more.
//
// Its ladder is `plainWorks.ts`'s (step 4): a land whose works fail a blocking check by number (`PLAIN_WORKS_BLOCKING`)
// is drawn again before its settle. Not offered (`premises/dev.ts`).

import { modelOf, soilOnWater, type BuildResult } from "../features/build";
import { featureId } from "../features/ids";
import { footprintAt } from "../features/objects";
import type { Feature, ForestFeature } from "../features/schema";
import { fileContamination } from "../format/world";
import { pickSeeds } from "../gen/blobs";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";
import { growGroveAt, NEAR_WALK, type BaselineGround } from "../resources/baseline";
import { canonicalSettle } from "../sim/prefill";
import { gameSoil } from "../sim/soil";
import type { MapSpec } from "../spec/mapspec";
import type { StyleTheme } from "./choice";
import { PLAN_TRIES } from "./draw";
import { startNumbers, VEIL_SHORT } from "./gateMap";
import { dist } from "./geom";
import type { Ladder } from "./ladder";
import { LIFE } from "./life";
import { premiseBase, premiseFinish, type PremiseLand, type PremiseMap } from "./map";
import { courseGaps, plainAttempt, valleyTiles, type PlainLand, type PlainRelief } from "./plainLand";
import { holdTurn, listPaid, PLAIN_WORKS_BLOCKING, plainLadder, plainWorksFailures, settledClears, turnSite } from "./plainWorks";
import { DEAD_SHARE, DRY_LEAST, PLAIN_IDS, plainLevel, plainOf, poisonedPlain, toLocal, turnOf, walk } from "./premises/poisonedPlain";
import { curtains } from "./curtain";
import { premiseStyle } from "./style";
import type { PremisePlan, Point } from "./types";
import type { StageWater } from "./water";

const I = PLAIN_IDS;
/** Water this deep or more is water (the shared checks' and the premise tests' `WET`). */
export const WET = 0.05;
/** How many settles a poisoned floodplain may cost before it gives up (the mode's `PREMISE_SETTLES`). */
export const PLAIN_SETTLES = 3;
/** The badtide's reach onto the plain at a low place in the levee (the design's §2: up to 7 tiles), counted from the
 *  river's line along the low place, so the river's half-width and a tile are added. */
export const LOW_REACH = 7;
/** The dead band's dead stands (the design's §2: at the wood budget's density for the land it was, the floodplain's
 *  green): of the dead band's open tiles, `LIFE.moistCover` under trees (the share the green band's living trees may
 *  take at most), in stands of `stand` trees at least `gap` tiles apart; birch by the red water, oak between, pine back
 *  from it (as the life's living stands, `water` and `back` tiles), as the species mix allows. */
export const DEAD_BAND = { stand: [10, 30], gap: 9, water: 3, back: 9 } as const;
/** How far from the start the life's fill stands keep (tiles: the start's wood's walk, `NEAR_WALK`, and two): the
 *  start stands on a broad green, where the fill's oaks (between the water's birches and the pines back from it) took
 *  the start's fast wood under its floor on a third of the maps (`start.wood_fast`, D515); its wood is the planting's. */
export const START_WOOD_CLEAR = NEAR_WALK + 2;

// ------------------------------------------------------------------------------------------------- the sources

/** How far from the plan's source point the red source's 3 × 3 may stand (its middle, tiles): the Red Spring's pool's
 *  radius and two. Farther, the bed's first 3 × 3 can be the gulch's mouth (seed 4 at 128²: 20 tiles down the gulch,
 *  under the turn's dam, so the dam held nothing back). */
export const NICHE_NEAR = 4;

/** The red source's 3 × 3 at the gulch's head: of the 3 × 3s whose nine tiles all lie on the Red Spring's pool (stage
 *  1's tiles of that body), or failing one on the pool and the Red Fall's bed together, the one nearest the plan's
 *  source point within `NICHE_NEAR` of it; failing both, the 3 × 3 round the source point itself. Its min corner, or
 *  null where the plan has no red source. Its ground is levelled to its lowest tile (`digNiche`), so the source stands
 *  on one floor (the game's `entities.placement`). */
export function redNiche(plan: PremisePlan, w: StageWater): [number, number] | null {
  const r = w.raster;
  const { W, H } = plan;
  const k = plan.bodies.findIndex((b) => b.id === I.redSpring) + 1;
  const fall = plan.links.findIndex((l) => l.id === I.redFall) + 1;
  const src = plan.sources.find((s) => s.bad);
  if (!k || !src) return null;
  for (const on of [(i: number) => r.lake[i] === k, (i: number) => r.lake[i] === k || (r.channel[i] === fall && !r.crest[i])]) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = 0; y + 2 < H; y++)
      for (let x = 0; x + 2 < W; x++) {
        let ok = true;
        for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 3 && ok; dx++) ok = on((y + dy) * W + x + dx);
        if (!ok) continue;
        const dx = x + 1.5 - src.at[0];
        const dy = y + 1.5 - src.at[1];
        const d = dx * dx + dy * dy;
        if (d <= NICHE_NEAR * NICHE_NEAR && d < bd) [bd, best] = [d, [x, y]];
      }
    if (best) return best;
  }
  return [Math.max(0, Math.min(W - 3, Math.floor(src.at[0]) - 1)), Math.max(0, Math.min(H - 3, Math.floor(src.at[1]) - 1))];
}

/** The niche's ground levelled to its lowest tile, taking ground away only. */
export function digNiche(heights: Uint8Array, W: number, at: [number, number]): void {
  let low = Infinity;
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) low = Math.min(low, heights[(at[1] + dy) * W + at[0] + dx]);
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) heights[(at[1] + dy) * W + at[0] + dx] = low;
}

/** The three sources' strengths (blocks a second): the river's springs together, the terrace's spring, the red source. */
export function plainSources(plan: PremisePlan): { river: number; brook: number; red: number } {
  let river = 0;
  let brook = 0;
  let red = 0;
  for (const s of plan.sources) {
    if (s.bad) red += s.strength;
    else if (s.into === I.springs) river += s.strength;
    else brook += s.strength;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { river: r2(river), brook: r2(brook), red: r2(red) };
}

// ------------------------------------------------------------------------------------------------- the courses

/** The courses' beds: stage 1's water (each body's and wet link's tiles, the plunge pools, the crests) and the gulch's
 *  floor, the red stream's own valley from its head to its mouth (the side valley's tiles within its half-width). */
export function plainCourses(plan: PremisePlan, w: StageWater, relief: PlainRelief): Uint8Array {
  const r = w.raster;
  const { W, H } = plan;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) if (r.lake[i] || r.channel[i] || r.pool[i] || r.crest[i]) out[i] = 1;
  for (const m of courseGaps(plan, w)) for (const i of m.tiles) out[i] = 1;
  const p = plainOf(plan)!;
  const sv = p.found ? relief.valleys[p.found.valley] : null;
  if (sv) {
    const t = valleyTiles(turnOf(plan, p), W, H, sv);
    const len = sv.line.length - 1;
    for (let i = 0; i < out.length; i++) {
      const s = t.s[i];
      if (s < 0 || s > len) continue;
      if (t.d[i] <= sv.half[Math.max(0, Math.min(len, Math.round(s)))] + 0.5) out[i] = 1;
    }
  }
  return out;
}

/** `water.leaks`: the settled water off its courses (`plainCourses`): how many tiles, and the first. */
export function plainLeaks(courses: Uint8Array, depth: ArrayLike<number>, W: number): { tiles: number; at: Point | null } {
  let tiles = 0;
  let at: Point | null = null;
  for (let i = 0; i < courses.length; i++)
    if (depth[i] >= WET && !courses[i]) {
      tiles++;
      at ??= [i % W, Math.floor(i / W)];
    }
  return { tiles, at };
}

/** Where the red stream's water first meets the river, tiles along the river (Infinity where it leaves by its own
 *  exit): the least `along` of the river's tiles beside (4-neighbour) the red stream's own or its mouth's cut
 *  (`courseGaps`), and a tile above the join at most. */
export function joinEdge(plan: PremisePlan, w: StageWater): number {
  const r = w.raster;
  const red = plan.links.find((l) => l.id === I.red);
  if (red?.joins?.link !== I.river) return Infinity;
  const { W, H } = plan;
  const river = plan.links.findIndex((l) => l.id === I.river) + 1;
  const redK = plan.links.findIndex((l) => l.id === I.red) + 1;
  const mine = new Uint8Array(W * H);
  for (let i = 0; i < mine.length; i++) if (r.channel[i] === redK) mine[i] = 1;
  for (const g of courseGaps(plan, w)) if (g.link === I.red) for (const i of g.tiles) mine[i] = 1;
  // (the join is the reach under the river's step above it, `RIVER_STAGE.join`: the step's middle where its bed last
  // falls above the join)
  const rv = plan.links[river - 1];
  const bed = rv.bed as number[];
  let run = 0;
  let edge = red.joins.at - 1;
  for (let k = 0; k + 1 < rv.path!.length; k++) {
    const len = dist(rv.path![k], rv.path![k + 1]);
    if (bed[k + 1] < bed[k] && run + len / 2 < red.joins.at) edge = Math.min(red.joins.at - 1, run + len / 2);
    run += len;
  }
  for (let i = 0; i < mine.length; i++) {
    if (r.channel[i] !== river) continue;
    const x = i % W;
    const y = (i - x) / W;
    if ((x > 0 && mine[i - 1]) || (x + 1 < W && mine[i + 1]) || (y > 0 && mine[i - W]) || (y + 1 < H && mine[i + W])) edge = Math.min(edge, r.along[i]);
  }
  return edge;
}

/** The clean water's tiles: the river above the red stream's join (above `joinEdge`; all of it where the red stream
 *  leaves by its own exit), its springs' pool, the terrace's spring and its brook. */
export function cleanWater(plan: PremisePlan, w: StageWater): Uint8Array {
  const r = w.raster;
  const out = new Uint8Array(r.W * r.H);
  const join = joinEdge(plan, w);
  const k = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const b = (id: string) => plan.bodies.findIndex((x) => x.id === id) + 1;
  const river = k(I.river);
  const brook = k(I.brook);
  const springs = b(I.springs);
  const well = b(I.well);
  for (let i = 0; i < out.length; i++) {
    if (r.channel[i] === river && r.along[i] < join) out[i] = 1;
    else if (r.channel[i] && r.channel[i] === brook) out[i] = 1;
    else if (r.lake[i] && (r.lake[i] === springs || r.lake[i] === well)) out[i] = 1;
  }
  return out;
}

/** `river.clean`: the clean water's wet tiles red as the game loads it, read on the map file's own values
 *  (`fileContamination`: the file writes a contamination at or under `WATER_CONTAMINATION_LEAST` as 0, the only
 *  threshold; the settle's doubles keep traces under it, `redMix` `creep`), and the most there. */
export function riverRed(clean: Uint8Array, depth: ArrayLike<number>, contamination: ArrayLike<number>): { tiles: number; most: number } {
  let tiles = 0;
  let most = 0;
  for (let i = 0; i < clean.length; i++)
    if (clean[i] && depth[i] >= WET && fileContamination(contamination[i]) > 0) {
      tiles++;
      most = Math.max(most, fileContamination(contamination[i]));
    }
  return { tiles, most };
}

/** The red water where the red stream joins the river (planning's verdict on step 3, round 1): `creep`, how far up the
 *  river any red water stands above where the red stream's water first meets it (`joinEdge`; tiles along it, 0 none)
 *  in the settle's doubles, and `trace` the most there;
 *  `below`, the median contamination of the river's water past the join's mouth (the red stream's half-width below
 *  it), and the most. Null where the red stream leaves by its own exit. */
export function redMix(plan: PremisePlan, w: StageWater, depth: ArrayLike<number>, contamination: ArrayLike<number>): { creep: number; trace: number; below: number; most: number } | null {
  const red = plan.links.find((l) => l.id === I.red);
  if (red?.joins?.link !== I.river) return null;
  const r = w.raster;
  const river = plan.links.findIndex((l) => l.id === I.river) + 1;
  const mouth = joinEdge(plan, w);
  let creep = 0;
  let trace = 0;
  let most = 0;
  const past: number[] = [];
  for (let i = 0; i < r.channel.length; i++) {
    if (r.channel[i] !== river || !(depth[i] >= WET)) continue;
    if (r.along[i] < mouth) {
      if (contamination[i] > 0) {
        creep = Math.max(creep, mouth - r.along[i]);
        trace = Math.max(trace, contamination[i]);
      }
    } else if (r.along[i] > red.joins.at + (red.half ?? 1.5)) {
      past.push(contamination[i]);
      most = Math.max(most, contamination[i]);
    }
  }
  past.sort((a, b) => a - b);
  return { creep, trace, below: past.length ? past[past.length >> 1] : 0, most };
}

/** The river's water against its levees (planning's verdict on step 3, round 1): along the river from where the plain
 *  begins, the least its levees' crest (the lowest bank beside it, a low place's the plain) and the plain beside it
 *  stand over its water's surface; and its steps (the plan's bed falling a level). */
export function riverStand(plan: PremisePlan, w: StageWater, relief: Pick<PlainRelief, "bank">, built: Pick<BuildResult, "heights" | "water">): { steps: number; crest: number; plain: number } {
  const r = w.raster;
  const { W, H } = plan;
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const k = plan.links.findIndex((l) => l.id === I.river);
  const rv = plan.links[k];
  const half = rv.half ?? 2.5;
  const bed = rv.bed as number[];
  let steps = 0;
  for (let j = 1; j < bed.length; j++) if (bed[j] < bed[j - 1]) steps++;
  let crest = Infinity;
  let plain = Infinity;
  const R = half + 7;
  for (const q of walk(rv.path!, 1)) {
    if (q.s < p.levee.from) continue;
    let surf = -Infinity;
    let bank = Infinity;
    for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++)
      for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
        const x = Math.floor(q.p[0]) + dx;
        const y = Math.floor(q.p[1]) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const e = (x + 0.5 - q.p[0]) * (x + 0.5 - q.p[0]) + (y + 0.5 - q.p[1]) * (y + 0.5 - q.p[1]);
        if (r.channel[i] === k + 1 && e <= (half + 0.5) * (half + 0.5) && built.water[i] >= WET) surf = Math.max(surf, built.heights[i] + built.water[i]);
        else if (relief.bank[i] > 0 && !r.channel[i] && e <= R * R) bank = Math.min(bank, built.heights[i]);
      }
    if (surf === -Infinity) continue;
    const [u, v] = toLocal(T, q.p);
    const low = p.levee.low.some((o) => q.s >= o.from && q.s <= o.to);
    crest = Math.min(crest, (low ? plainLevel(p, u, v) : bank) - surf);
    plain = Math.min(plain, (u < p.plainFrom ? p.L : plainLevel(p, u, v)) - surf);
  }
  return { steps, crest, plain };
}

// ------------------------------------------------------------------------------------------------- the bands

/** The valley's floor the bands are counted on (the design's §2: the plain, its sloughs and the backswamp, from the
 *  plain's head down), a tile mask. */
export function floorTiles(plan: PremisePlan, floor: Uint8Array): Uint8Array {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W } = plan;
  const out = new Uint8Array(floor.length);
  for (let i = 0; i < floor.length; i++) {
    const f = floor[i];
    if (!(f === 1 || f === 2 || f === 4)) continue;
    if (toLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5])[0] < p.plainFrom) continue;
    out[i] = 1;
  }
  return out;
}

/** The bands on the settled map by the game's soil (§2): of the valley's dry floor, the share dead (soil contamination
 *  over 0), green (moist, not dead) and dry, and how many tiles each. */
export function settledBands(on: Uint8Array, built: Pick<BuildResult, "water" | "moisture" | "soilContamination">): { dead: number; green: number; dry: number; tiles: number; deadTiles: number } {
  let dead = 0;
  let green = 0;
  let dry = 0;
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || built.water[i] >= WET) continue;
    if (built.soilContamination[i] > 0) dead++;
    else if (built.moisture[i] > 0) green++;
    else dry++;
  }
  const all = Math.max(1, dead + green + dry);
  return { dead: dead / all, green: green / all, dry: dry / all, tiles: dead + green + dry, deadTiles: dead };
}

// ------------------------------------------------------------------------------------------------- the fall and the badtide

/** `fall.settled`: the Red Fall's drop on the settled water, the median water surface over its lip less the median over
 *  its plunge pool (the Red Pool's wet tiles), and the drop it must give (its drop over the backswamp less
 *  `VEIL_SHORT`). */
export function redFallDrop(plan: PremisePlan, w: StageWater, heights: ArrayLike<number>, depth: ArrayLike<number>): { drop: number; want: number } {
  const r = w.raster;
  const fall = plan.links.find((l) => l.id === I.redFall)!;
  const pool = plan.bodies.findIndex((b) => b.id === I.redPool) + 1;
  const med = (v: number[]) => (v.sort((a, b) => a - b), v.length ? v[v.length >> 1] : NaN);
  const lip = med((r.lips[I.redFall] ?? []).filter((i) => depth[i] >= WET).map((i) => heights[i] + depth[i]));
  const foot: number[] = [];
  for (let i = 0; i < r.lake.length; i++) if (r.lake[i] === pool && depth[i] >= WET) foot.push(heights[i] + depth[i]);
  // (the drop the landmark gives on the ground, the gulch's mouth over the backswamp: its height reaches the Red Pool's
  // sill, a level under the backswamp, and the pool's water stands over that sill)
  return { drop: lip - med(foot), want: (plainOf(plan)?.gulch.h ?? 0) - VEIL_SHORT };
}

/** `fall.whole` (§7, planning's ruling of 2026-11-17): the Red Fall on the settled water judged as every fall is (the
 *  shared curtain rule, `curtain.ts`, its height less the veil's half level): one whole curtain over its lip, never
 *  split by water pouring off the gulch beside it, no ledge, no basin. Read within 8 tiles of the lip, the other
 *  links' crests out. */
export function redFallCurtain(plan: PremisePlan, w: StageWater, built: Pick<BuildResult, "heights" | "water">): { ok: boolean; note: string } {
  const r = w.raster;
  const N = plan.W * plan.H;
  const k = plan.links.findIndex((l) => l.id === I.redFall);
  const fall = plan.links[k];
  const near = new Uint8Array(N);
  for (const i of r.lips[fall.id] ?? []) {
    const x = i % plan.W;
    const y = (i - x) / plan.W;
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < plan.W && yy < plan.H) near[yy * plan.W + xx] = 1;
      }
  }
  for (let i = 0; i < N; i++) if (r.crest[i] && r.crest[i] !== k + 1) near[i] = 0;
  const depth = Float64Array.from(built.water, (d, i) => (near[i] ? d : 0));
  const ground = Float64Array.from(built.heights, (h, i) => (near[i] ? h : 99));
  const c = curtains({ W: plan.W, H: plan.H, before: ground, beforeDepth: new Float64Array(N), after: ground, depth, need: fall.fall!.height - VEIL_SHORT });
  return { ok: c.ok, note: c.note };
}

/** `levee.holds` (§2 "A badtide", §7): the river's water red (contamination 1 on its channel and its springs' pool, the
 *  depth as settled) and the soil by the game's rule: the plain's tiles (from its head down) past the levee's banks (the
 *  banks hold it, §2; stage 1's own ground, the courses' beds and outlets, is not the plain) it poisons that day 1 has clean, and of those the ones farther than `LOW_REACH` from the river
 *  along a low place in the levee (the river's half-width and a tile added), with the first. */
export function badtideReach(plan: PremisePlan, w: StageWater, relief: Pick<PlainRelief, "floor" | "bank">, built: Pick<BuildResult, "heights" | "water" | "contamination" | "soilContamination">): { poisoned: number; beyond: number; at: Point | null } {
  const r = w.raster;
  const { W, H } = plan;
  const N = W * H;
  const p = plainOf(plan)!;
  const river = plan.links.findIndex((l) => l.id === I.river) + 1;
  const springs = plan.bodies.findIndex((b) => b.id === I.springs) + 1;
  const c = Float64Array.from(built.contamination);
  for (let i = 0; i < N; i++) if (built.water[i] > 0 && (r.channel[i] === river || r.lake[i] === springs)) c[i] = 1;
  const soil = gameSoil(W, H, built.heights, built.water, c, []);
  const on = floorTiles(plan, relief.floor);
  const riverLink = plan.links[river - 1];
  const reach = LOW_REACH + (riverLink.half ?? 2.5) + 1;
  const lows = walk(riverLink.path!, 1).filter((q) => p.levee.low.some((o) => q.s >= o.from && q.s <= o.to)).map((q) => q.p);
  let poisoned = 0;
  let beyond = 0;
  let at: Point | null = null;
  for (let i = 0; i < N; i++) {
    if (relief.floor[i] !== 1 || !on[i] || relief.bank[i] > 0 || r.fixed[i] || built.water[i] >= WET || !(soil.contamination[i] > 0) || built.soilContamination[i] > 0) continue;
    poisoned++;
    const x = (i % W) + 0.5;
    const y = Math.floor(i / W) + 0.5;
    if (lows.some((o) => (x - o[0]) * (x - o[0]) + (y - o[1]) * (y - o[1]) <= reach * reach)) continue;
    beyond++;
    at ??= [i % W, Math.floor(i / W)];
  }
  return { poisoned, beyond, at };
}

// ------------------------------------------------------------------------------------------------- the river in, settled

/** `riverIn.green` (§7, planning's ruling of 2026-11-17): the floor's least green with the turn and the river in. */
export const RIVER_IN_GREEN = 0.6;

/** The tiles a ditch a level deep reaches from `from` (water): dug over dry ground, it carries the water to a tile
 *  where no tile on the way, the tile itself among them, stands more than a level over the water's surface where the
 *  ditch leaves it (a riser up stops it; ground falling away does not, the water runs down it). Each tile takes the
 *  highest surface that reaches it. A mask. */
export function ditchReach(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, from: Uint8Array): Uint8Array {
  const N = W * H;
  const got = new Uint8Array(N);
  const src: number[] = [];
  for (let i = 0; i < N; i++) if (from[i]) src.push(i);
  const surface = (i: number) => heights[i] + depth[i];
  src.sort((a, b) => surface(b) - surface(a) || a - b);
  const q: number[] = [];
  for (const s of src) {
    const top = surface(s) + 1 - WET;
    q.push(s);
    while (q.length) {
      const i = q.pop()!;
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || got[j] || from[j] || depth[j] >= WET || heights[j] > top) continue;
        got[j] = 1;
        q.push(j);
      }
    }
  }
  return got;
}

/** What is left to win once the turn and the river in are built (§6, planning's ruling on round 2, 2026-11-17; shown on
 *  the ladder, never a bar): the floor's dry share (no water, no moisture, no poison in its soil), and of the dry floor
 *  the share a ditch from any clean water reaches (`ditchReach`: the river, its springs, the brook, the new course) and
 *  the share that needs a pump (the rest: above a riser over every clean water near it, or beside the deep lower
 *  river). */
export function leftToWin(W: number, H: number, on: Uint8Array, s: { heights: ArrayLike<number>; water: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number>; soilContamination: ArrayLike<number> }): { dry: number; ditch: number; pump: number } {
  const N = W * H;
  const clean = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (s.water[i] >= WET && s.contamination[i] < 0.5) clean[i] = 1;
  const got = ditchReach(W, H, s.heights, s.water, clean);
  let floor = 0;
  let dry = 0;
  let ditch = 0;
  for (let i = 0; i < N; i++) {
    if (!on[i]) continue;
    floor++;
    if (s.water[i] >= WET || s.moisture[i] > 0 || s.soilContamination[i] > 0) continue;
    dry++;
    if (got[i]) ditch++;
  }
  return { dry: floor ? dry / floor : 0, ditch: dry ? ditch / dry : 1, pump: dry ? (dry - ditch) / dry : 0 };
}

/** The floor's bands with the turn's dam and the river in's weir built (§7 `riverIn.green`): their tiles raised to
 *  their levels on the map's ground and objects (`modelOf`), one canonical settle and the game's soil on it
 *  (`soilOnWater`), as the proof's session settles them (`plainProof.ts`), and what is left to win then
 *  (`leftToWin`). Null where a work has no site. */
export function riverInBands(land: PlainLand, ladder: Ladder, built: Pick<BuildResult, "W" | "H" | "heights" | "entities">): { bands: ReturnType<typeof settledBands>; left: ReturnType<typeof leftToWin> } | null {
  const { plan } = land;
  const heights = Uint8Array.from(built.heights);
  for (const id of ["turn", "riverIn"]) {
    const s = ladder.works.find((x) => x.id === id);
    if (!s?.tiles.length || s.level === undefined) return null;
    for (const i of s.tiles) heights[i] = Math.max(heights[i], s.level);
  }
  const m = { W: built.W, H: built.H, heights, entities: built.entities };
  const settle = canonicalSettle(modelOf(m));
  const soil = soilOnWater(m, settle.depth, settle.contamination);
  const on = floorTiles(plan, land.relief.floor);
  const st = { heights, water: settle.depth, contamination: settle.contamination, moisture: soil.moisture, soilContamination: soil.contamination };
  return { bands: settledBands(on, st), left: leftToWin(built.W, built.H, on, st) };
}

// ------------------------------------------------------------------------------------------------- the dead band's wood

/** The dead band's dead stands (the design's §2, `DEAD_BAND`): on the settled first build, the floor's poisoned dry
 *  tiles nothing stands on, `LIFE.moistCover` of them under dead trees (by Forests), in stands apart. */
export function deadBand(spec: MapSpec, plan: PremisePlan, on: Uint8Array, base: BuildResult, features: readonly Feature[], attempt: number): { features: Feature[]; notes: string[]; trees: number } {
  const { W, H } = plan;
  const N = W * H;
  const taken = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (base.occupied[i] || base.water[i] > 0) taken[i] = 1;
  for (const f of features) {
    if (f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField") for (const i of runsToTiles(f.params.area, W)) taken[i] = 1;
    // (a mine site's footprint and a tile round it)
    if (f.kind === "mapObject" && f.params.kind === "mineSite" && "x" in f.params.placement)
      for (const [x, y] of footprintAt("mineSite", f.params.placement.x, f.params.placement.y, f.params.placement.orientation))
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) taken[(y + dy) * W + x + dx] = 1;
  }
  const open = new Uint8Array(N);
  let room = 0;
  for (let i = 0; i < N; i++)
    if (on[i] && !taken[i] && base.soilContamination[i] > 0 && !(base.water[i] > 0)) {
      open[i] = 1;
      room++;
    }
  const mix = spec.settings.resources.speciesMix;
  const weights = [mix.pine, mix.birch, mix.oak];
  const species = ["Pine", "Birch", "Oak"] as const;
  const want = Math.round((LIFE.moistCover * room * spec.settings.resources.forestDensity) / 100);
  if (!want || !weights.some((v) => v > 0)) return { features: [], notes: [], trees: 0 };
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (base.water[i] > 0) wet[i] = 1;
  const dWet = distanceFrom(wet, W, H);
  const ground: BaselineGround = { W, H, heights: base.heights, water: base.water, moisture: base.moisture, soilContamination: base.soilContamination, taken };
  const rng = stream(spec.seed, "premise.deadBand", attempt);
  const out: ForestFeature[] = [];
  let got = 0;
  for (const at of pickSeeds(rng, open, W, Math.ceil((2 * want) / DEAD_BAND.stand[0]), DEAD_BAND.gap)) {
    if (got >= want) break;
    if (!open[at]) continue;
    const place = dWet[at] <= DEAD_BAND.water ? 1 : dWet[at] >= DEAD_BAND.back ? 0 : 2;
    const sp = weights[place] > 0 ? species[place] : species[rng.weighted(weights)];
    const grown = growGroveAt(ground, rng, open, at, Math.min(want - got, rng.int(DEAD_BAND.stand[0], DEAD_BAND.stand[1] + 1)));
    if (!grown || grown.tiles.length < 3) continue;
    for (const i of grown.area) {
      taken[i] = 1;
      open[i] = 0;
    }
    const tiles = [...grown.tiles].sort((a, b) => a - b);
    const role = `premise/deadBand/${out.length}`;
    out.push({ id: featureId(spec.seed, "forest", role), kind: "forest", origin: "generated", role, locked: false, params: { area: tilesToRuns(tiles, W), density: 1, speciesMix: { [sp]: 1 }, groveSize: tiles.length, life: "dead", youngShare: 0 } });
    got += tiles.length;
  }
  const notes = got < want ? [`the dead band holds ${got} dead trees of the ${want} its ground asks`] : [];
  return { features: out, notes, trees: got };
}

// ------------------------------------------------------------------------------------------------- the map

/** What the settled map measures (each settled invariant's numbers). */
export interface PlainSettled {
  bands: ReturnType<typeof settledBands>;
  leaks: ReturnType<typeof plainLeaks>;
  river: ReturnType<typeof riverRed>;
  fall: ReturnType<typeof redFallDrop>;
  /** The Red Fall's curtain as settled (`redFallCurtain`). */
  curtain: ReturnType<typeof redFallCurtain>;
  badtide: ReturnType<typeof badtideReach>;
  sources: ReturnType<typeof plainSources>;
  /** The river's steps and its water against its levees' crest and the plain (`riverStand`). */
  stand: ReturnType<typeof riverStand>;
  /** The red water at the join (`redMix`), null where the red stream leaves by its own exit. */
  mix: ReturnType<typeof redMix>;
  /** The dead band's dead trees. */
  deadTrees: number;
}

/** The settled invariants a map fails, each with its line (§7 "settled"). */
export function settledFailures(s: PlainSettled): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  const pct = (v: number) => `${Math.round(100 * v)} %`;
  if (s.river.tiles) out.push({ id: "river.clean", reason: `${s.river.tiles} tiles of the clean water stand red as the game loads it (at most ${s.river.most.toExponential(1)})` });
  if (s.leaks.tiles) out.push({ id: "water.leaks", reason: `${s.leaks.tiles} tiles of water off their courses, the first at ${s.leaks.at?.join(", ")}` });
  if (s.bands.dead < DEAD_SHARE[0] || s.bands.dead > DEAD_SHARE[1]) out.push({ id: "plain.bands", reason: `the settled dead band is ${pct(s.bands.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})` });
  else if (s.bands.dry < DRY_LEAST) out.push({ id: "plain.bands", reason: `the settled dry band is ${pct(s.bands.dry)} of the floor, under ${pct(DRY_LEAST)}` });
  if (!(s.fall.drop >= s.fall.want)) out.push({ id: "fall.settled", reason: `the Red Fall drops ${s.fall.drop.toFixed(2)} settled (${s.fall.want} or more)` });
  if (!s.curtain.ok) out.push({ id: "fall.whole", reason: `the Red Fall is not one curtain (${s.curtain.note})` });
  if (s.badtide.beyond) out.push({ id: "levee.holds", reason: `a badtide poisons ${s.badtide.beyond} tiles of the plain beyond the levee's low places, the first at ${s.badtide.at?.join(", ")}` });
  return out;
}

/** A poisoned floodplain's map: the land (stage 2), the map built and settled with its life and dead band, its shared
 *  checks, the settled measures and the settled invariants it fails, the attempt, and its time by part (ms). */
export interface PlainMap {
  land: PlainLand & { held: boolean };
  ladder: Ladder;
  /** The works checks by number it fails (`plainWorks.ts`; `works.paid` is said, the rest are blocking). */
  works: { id: string; reason: string }[];
  map: PremiseMap;
  settled: PlainSettled;
  settledFails: { id: string; reason: string }[];
  /** The start's numbers (`gateMap.ts` `startNumbers`: D515's floors and the shared gate's start checks). */
  start: ReturnType<typeof startNumbers>;
  attempt: number;
  held: boolean;
  failed: string[];
  /** The floor's bands with the turn and the river in built and settled (`riverInBands`), once the map passes its
   *  settled invariants. */
  riverIn?: ReturnType<typeof settledBands> | null;
  ms: { land: number; settle: number; life: number; checks: number; settled: number; total: number };
}

/** The settled measures of a built map on its land. */
export function plainSettled(land: PlainLand, map: PremiseMap, deadTrees: number): PlainSettled {
  const { plan, water, relief } = land;
  const b = map.built;
  const on = floorTiles(plan, relief.floor);
  return {
    bands: settledBands(on, b),
    leaks: plainLeaks(plainCourses(plan, water, relief), b.water, plan.W),
    river: riverRed(cleanWater(plan, water), b.water, b.contamination),
    fall: redFallDrop(plan, water, b.heights, b.water),
    curtain: redFallCurtain(plan, water, b),
    badtide: badtideReach(plan, water, relief, b),
    sources: plainSources(plan),
    stand: riverStand(plan, water, relief, b),
    mix: redMix(plan, water, b.water, b.contamination),
    deadTrees,
  };
}

/** A land's ground as the map is built on it (the red source's niche dug) and its ladder on that ground, with the
 *  works checks it fails (`plainWorks.ts`). */
export function plainWorksOf(land: PlainLand): { heights: Uint8Array; niche: [number, number] | null; ladder: Ladder; works: { id: string; reason: string }[] } {
  const heights = land.heights.slice();
  const niche = redNiche(land.plan, land.water);
  if (niche) digNiche(heights, land.plan.W, niche);
  // (the turn's pond held to the col: its rim at the col's level raised where it spills, `holdTurn`, the dam sited again
  // on the raised ground)
  for (let k = 0; k < 3; k++) {
    const t = turnSite(land, heights, niche);
    if (!t || !holdTurn(land, heights, t)) break;
  }
  const ladder = plainLadder(land, heights, niche);
  return { heights, niche, ladder, works: plainWorksFailures({ land, heights, ladder, niche }) };
}

/** One land's map: its sources, the settle, its life and dead band, the build again and its checks, then the settled
 *  measures. */
export function plainMapOf(spec: MapSpec, land: PlainLand & { held: boolean }, theme: StyleTheme = "riverValley", ground: ReturnType<typeof plainWorksOf> = plainWorksOf(land)): Omit<PlainMap, "failed" | "held"> {
  const { plan, water } = land;
  const t0 = performance.now();
  const { heights, niche, ladder } = ground;
  const pl: PremiseLand = { water, heights, niches: niche ? { badwater: niche } : {}, laid: { plugs: {}, banks: {} }, notes: niche ? [] : ["the red source finds no room in the Red Spring's pool"], standsOffStart: START_WOOD_CLEAR };
  const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), accepted: { attempt: land.attempt, candidate: 0 } };
  const style = premiseStyle(theme, spec, land.attempt);
  const base = premiseBase(s, plan, pl, land.frame.start, ladder, style);
  const t1 = performance.now();
  const on = floorTiles(plan, land.relief.floor);
  let trees = 0;
  const map = premiseFinish(base, (b, features) => {
    const d = deadBand(s, plan, on, b, features, land.attempt);
    trees = d.trees;
    return d;
  });
  const t2 = performance.now();
  const settled = plainSettled(land, map, trees);
  const settledFails = settledFailures(settled);
  // (the levees' clears read on the settled water, then the works checks again: `settledClears`)
  settledClears(land, ladder, map.built);
  // (the ladder the map lists: the rungs that pay, `listPaid`)
  listPaid(ladder);
  const worksFails = plainWorksFailures({ land, heights, ladder, niche });
  const t3 = performance.now();
  const ms = { land: land.ms.total, settle: Math.round(t1 - t0), life: map.ms.life, checks: map.ms.checks, settled: Math.round(t3 - t2), total: 0 };
  ms.total = ms.land + Math.round(t3 - t0);
  return { land, ladder, works: worksFails, map, settled, settledFails, start: startNumbers(map), attempt: land.attempt, ms };
}

/** The poisoned floodplain's map for a spec in a theme's style (River Valley by default): the first attempt whose land
 *  holds, whose works pass the blocking checks by number, whose map passes every blocking check (the start's among them) and every settled invariant, within
 *  `PLAN_TRIES` attempts and `PLAIN_SETTLES` settles; or the last map with its failures, or why none was made. */
export function plainMap(spec: MapSpec, theme: StyleTheme = "riverValley"): PlainMap | { reason: string; failed: string[] } {
  const why = poisonedPlain.eligible(spec);
  if (why) return { reason: why, failed: [] };
  const failed: string[] = [];
  let settles = 0;
  let last: PlainMap | null = null;
  for (let attempt = 0; attempt < PLAN_TRIES && settles < PLAIN_SETTLES; attempt++) {
    const land = plainAttempt(spec, attempt, theme, failed);
    if ("reason" in land) {
      failed.push(land.reason);
      continue;
    }
    if (!land.held) {
      failed.push(land.landFails.length ? `${land.landFails[0].id}: ${land.landFails[0].reason}` : `frame.start: ${land.frame.reason}`);
      continue;
    }
    // (the works by number, before the settle: a land whose turn or river in does not work is drawn again)
    const ground = plainWorksOf(land);
    const block = ground.works.find((f) => (PLAIN_WORKS_BLOCKING as readonly string[]).includes(f.id));
    if (block) {
      failed.push(`${block.id}: ${block.reason}`);
      continue;
    }
    settles++;
    const m = plainMapOf(spec, land, theme, ground);
    const out: PlainMap = { ...m, failed, held: false };
    last = out;
    if (!m.map.report.passed) {
      const c = m.map.report.checks.find((x) => !x.ok && x.severity === "error");
      failed.push(`${c?.id}: ${c?.message}`);
      continue;
    }
    if (m.settledFails.length) {
      failed.push(`${m.settledFails[0].id}: ${m.settledFails[0].reason}`);
      continue;
    }
    // (the river in on the settled map: a floor under `RIVER_IN_GREEN` with both works built is drawn again)
    const ri = riverInBands(land, m.ladder, m.map.built);
    out.riverIn = ri?.bands ?? null;
    if (ri) out.ladder.left = ri.left;
    if (!ri || ri.bands.green < RIVER_IN_GREEN) {
      failed.push(`riverIn.green: ${ri ? `with the turn and the river in the floor is ${Math.round(100 * ri.bands.green)} % green (${100 * RIVER_IN_GREEN} % or more)` : "a work has no site"}`);
      continue;
    }
    return { ...out, held: true };
  }
  return last ?? { reason: `No poisoned floodplain's map held in ${failed.length} plans and ${settles} settles (the last: ${failed[failed.length - 1] ?? ""})`, failed };
}

