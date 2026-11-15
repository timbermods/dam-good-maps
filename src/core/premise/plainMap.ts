// The poisoned floodplain's water and hazard (docs/design/poisoned-floodplain.md §2, §4, §7, §9 row 3): its map from the
// land (`plainLand.ts`, stage 2) through the shared build, as `gateMap.ts` makes the Gate's. The three sources stand
// where the plan put them: the river's springs and the terrace's spring as springs of their bodies (`map.ts`
// `springsOf`), the red source as the badwater source in the Red Spring's pool at the gulch's head (`redNiche`). One
// canonical settle (stage 5), stage 6's life on the settled ground and the dead band's dead stands (`deadBand`), the map
// built again with the settle reused (the life's fill stands kept off the start's wood, `START_WOOD_CLEAR`), and its checks in profile "generate" (the shared gate, the start's floors among
// them). Then the settled invariants, each read on the settled water (§7 "settled"):
//
// - `river.clean`: no tile of the river above the red stream's join (all of it where the red stream leaves by its own
//   exit), of its springs' pool, the terrace's spring or its brook, at contamination over 0 (D498).
// - `water.leaks`: no water off its courses: every wet tile on stage 1's water (the bodies, the channels, the plunge
//   pools, the crests), on the gaps cut between them (`plainLand.ts` `courseGaps`) or on the gulch's floor, the red
//   stream's own valley down to its fall.
// - `plain.bands` again, on the settled water and the game's soil: dead 8 to 25 % of the floor, dry 30 % or more.
// - `fall.settled`: the Red Fall drops its height less half a level on the settled water (the Gate's `veil.settled`):
//   the fall reads as a fall, not a rapid, from the start's first frame.
// - `levee.holds`: in a badtide's water (the river red, its depth as settled) the game's soil rule poisons the plain
//   only within 7 tiles of the river along a low place in the levee, beyond what day 1 has dead already.
//
// Not offered (`premises/dev.ts`); the premise's works and its ladder are step 4's.

import type { BuildResult } from "../features/build";
import { featureId } from "../features/ids";
import { footprintAt } from "../features/objects";
import type { Feature, ForestFeature } from "../features/schema";
import { pickSeeds } from "../gen/blobs";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import { stream } from "../math/rng";
import { growGroveAt, NEAR_WALK, type BaselineGround } from "../resources/baseline";
import { gameSoil } from "../sim/soil";
import type { MapSpec } from "../spec/mapspec";
import type { StyleTheme } from "./choice";
import { PLAN_TRIES } from "./draw";
import { startNumbers, VEIL_SHORT } from "./gateMap";
import { ladderOf, type Ladder } from "./ladder";
import { LIFE } from "./life";
import { premiseBase, premiseFinish, type PremiseLand, type PremiseMap } from "./map";
import { courseGaps, plainAttempt, valleyTiles, type PlainLand, type PlainRelief } from "./plainLand";
import { DEAD_SHARE, DRY_LEAST, PLAIN_IDS, plainOf, poisonedPlain, toLocal, turnOf, walk } from "./premises/poisonedPlain";
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

/** The red source's 3 × 3 at the gulch's head: of the 3 × 3s whose nine tiles all lie on the Red Spring's pool (stage
 *  1's tiles of that body), or failing one on the pool and the Red Fall's bed together, the one nearest the plan's
 *  source point; its min corner, or null where the head holds none. Its ground is levelled to its lowest tile
 *  (`digNiche`), so the source stands on one floor (the game's `entities.placement`). */
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
        if (d < bd) [bd, best] = [d, [x, y]];
      }
    if (best) return best;
  }
  return null;
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

/** The clean water's tiles: the river above the red stream's join (all of it where the red stream leaves by its own
 *  exit), its springs' pool, the terrace's spring and its brook. */
export function cleanWater(plan: PremisePlan, w: StageWater): Uint8Array {
  const r = w.raster;
  const out = new Uint8Array(r.W * r.H);
  const red = plan.links.find((l) => l.id === I.red);
  const join = red?.joins?.link === I.river ? red.joins.at : Infinity;
  const k = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const b = (id: string) => plan.bodies.findIndex((x) => x.id === id) + 1;
  const river = k(I.river);
  const brook = k(I.brook);
  const springs = b(I.springs);
  const well = b(I.well);
  for (let i = 0; i < out.length; i++) {
    if (r.channel[i] === river && r.along[i] < join - 1) out[i] = 1;
    else if (r.channel[i] && r.channel[i] === brook) out[i] = 1;
    else if (r.lake[i] && (r.lake[i] === springs || r.lake[i] === well)) out[i] = 1;
  }
  return out;
}

/** `river.clean`: the clean water's wet tiles at contamination over 0, and the most there. */
export function riverRed(clean: Uint8Array, depth: ArrayLike<number>, contamination: ArrayLike<number>): { tiles: number; most: number } {
  let tiles = 0;
  let most = 0;
  for (let i = 0; i < clean.length; i++)
    if (clean[i] && depth[i] >= WET && contamination[i] > 0) {
      tiles++;
      most = Math.max(most, contamination[i]);
    }
  return { tiles, most };
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
 *  its plunge pool (the Red Pool's wet tiles), and the drop it must give (its height less `VEIL_SHORT`). */
export function redFallDrop(plan: PremisePlan, w: StageWater, heights: ArrayLike<number>, depth: ArrayLike<number>): { drop: number; want: number } {
  const r = w.raster;
  const fall = plan.links.find((l) => l.id === I.redFall)!;
  const pool = plan.bodies.findIndex((b) => b.id === I.redPool) + 1;
  const med = (v: number[]) => (v.sort((a, b) => a - b), v.length ? v[v.length >> 1] : NaN);
  const lip = med((r.lips[I.redFall] ?? []).filter((i) => depth[i] >= WET).map((i) => heights[i] + depth[i]));
  const foot: number[] = [];
  for (let i = 0; i < r.lake.length; i++) if (r.lake[i] === pool && depth[i] >= WET) foot.push(heights[i] + depth[i]);
  return { drop: lip - med(foot), want: (fall.fall?.height ?? 0) - VEIL_SHORT };
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
  badtide: ReturnType<typeof badtideReach>;
  sources: ReturnType<typeof plainSources>;
  /** The dead band's dead trees. */
  deadTrees: number;
}

/** The settled invariants a map fails, each with its line (§7 "settled"). */
export function settledFailures(s: PlainSettled): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  const pct = (v: number) => `${Math.round(100 * v)} %`;
  if (s.river.tiles) out.push({ id: "river.clean", reason: `${s.river.tiles} tiles of the clean water stand red (at most ${s.river.most.toExponential(1)})` });
  if (s.leaks.tiles) out.push({ id: "water.leaks", reason: `${s.leaks.tiles} tiles of water off their courses, the first at ${s.leaks.at?.join(", ")}` });
  if (s.bands.dead < DEAD_SHARE[0] || s.bands.dead > DEAD_SHARE[1]) out.push({ id: "plain.bands", reason: `the settled dead band is ${pct(s.bands.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})` });
  else if (s.bands.dry < DRY_LEAST) out.push({ id: "plain.bands", reason: `the settled dry band is ${pct(s.bands.dry)} of the floor, under ${pct(DRY_LEAST)}` });
  if (!(s.fall.drop >= s.fall.want)) out.push({ id: "fall.settled", reason: `the Red Fall drops ${s.fall.drop.toFixed(2)} settled (${s.fall.want} or more)` });
  if (s.badtide.beyond) out.push({ id: "levee.holds", reason: `a badtide poisons ${s.badtide.beyond} tiles of the plain beyond the levee's low places, the first at ${s.badtide.at?.join(", ")}` });
  return out;
}

/** A poisoned floodplain's map: the land (stage 2), the map built and settled with its life and dead band, its shared
 *  checks, the settled measures and the settled invariants it fails, the attempt, and its time by part (ms). */
export interface PlainMap {
  land: PlainLand & { held: boolean };
  ladder: Ladder;
  map: PremiseMap;
  settled: PlainSettled;
  settledFails: { id: string; reason: string }[];
  /** The start's numbers (`gateMap.ts` `startNumbers`: D515's floors and the shared gate's start checks). */
  start: ReturnType<typeof startNumbers>;
  attempt: number;
  held: boolean;
  failed: string[];
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
    badtide: badtideReach(plan, water, relief, b),
    sources: plainSources(plan),
    deadTrees,
  };
}

/** One land's map: its sources, the settle, its life and dead band, the build again and its checks, then the settled
 *  measures. */
export function plainMapOf(spec: MapSpec, land: PlainLand & { held: boolean }, theme: StyleTheme = "riverValley"): Omit<PlainMap, "failed" | "held"> {
  const { plan, water } = land;
  const t0 = performance.now();
  const heights = land.heights.slice();
  const niche = redNiche(plan, water);
  if (niche) digNiche(heights, plan.W, niche);
  const pl: PremiseLand = { water, heights, niches: niche ? { badwater: niche } : {}, laid: { plugs: {}, banks: {} }, notes: niche ? [] : ["the red source finds no room in the Red Spring's pool"], standsOffStart: START_WOOD_CLEAR };
  const ladder = ladderOf(plan, water, heights, pl.laid);
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
  const t3 = performance.now();
  const ms = { land: land.ms.total, settle: Math.round(t1 - t0), life: map.ms.life, checks: map.ms.checks, settled: Math.round(t3 - t2), total: 0 };
  ms.total = ms.land + Math.round(t3 - t0);
  return { land, ladder, map, settled, settledFails, start: startNumbers(map), attempt: land.attempt, ms };
}

/** The poisoned floodplain's map for a spec in a theme's style (River Valley by default): the first attempt whose land
 *  holds, whose map passes every blocking check (the start's among them) and every settled invariant, within
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
    settles++;
    const m = plainMapOf(spec, land, theme);
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
    return { ...out, held: true };
  }
  return last ?? { reason: `No poisoned floodplain's map held in ${failed.length} plans and ${settles} settles (the last: ${failed[failed.length - 1] ?? ""})`, failed };
}

