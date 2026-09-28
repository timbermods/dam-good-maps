// The resource baseline on a whole map that the generator did not plan (Real places, Pick a place):
// one call from the map's settled ground and its own objects to the badwater sources, resources and
// mine sites it should carry, as entities. The generator plans the same things through its features
// (gen/water.ts, gen/resources.ts, gen/extras.ts); this is the same baseline, rules and order.
//
//   const r = planMapResources({ W, H, heights, water, moisture, soilContamination, entities, start, settings, seed, nearStart, badwater });
//   entities.push(...r.entities);   // badwater sources, trees, bushes, ruin columns, mine sites
//   const w = r.water ?? mine;      // the water settled again with the badwater sources, when any
//
// Badwater sources come first (D200): springs in hollows and side valleys (resources/badwater.ts),
// then the water is settled again with them, and a spring whose badwater reaches nearer the start
// than the difficulty's badwater distance is dropped for the next best (three settles at most).
// Resources and mine sites never move water, so that settle is the map's settle after them too.

import { reachAt, walkDistance } from "../analysis/walk";
import type { EntitySpec } from "../format/entities";
import { slopeHighSide } from "../format/footprints";
import { entityTiles } from "../features/edits";
import { fitProblems, rasterizeObjects } from "../features/objects";
import type { MapObjectFeature } from "../features/schema";
import { walkRegions } from "../analysis/regions";
import { distanceFrom } from "../math/grid";
import { stream } from "../math/rng";
import { soilContamination as soilOf } from "../sim/contamination";
import { moistureBarrier, waterModel, type MapObject } from "../sim/model";
import { moisture as moistureOf } from "../sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../sim/prefill";
import { BAD, bandScale, EXTRA_BANDS, FLOOD_MARGIN, WALK_BLOCKERS, WET } from "../validate/playability";
import { badwaterBudget, pickBadwaterSprings, springEntities, type BadwaterSetting, type BadwaterSpring } from "./badwater";
import { baselineEntities, pickMineSite, planBaseline, type BaselinePlan, type MineSpot, type ResourceSettings } from "./baseline";

export interface MapResourcesInput {
  W: number;
  H: number;
  heights: Uint8Array;
  /** The settled water's depth, and the soil it leaves (sim/moisture.ts, sim/contamination.ts). */
  water: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** The map's own objects so far: water sources, the start, slopes. Resources keep off their tiles;
   *  slopes join levels for the walk; walls block it. */
  entities: readonly EntitySpec[];
  /** The centre tile of the start's 3×3. */
  start: { x: number; y: number };
  settings: ResourceSettings;
  seed: number;
  /** What to grow within 20 tiles' walk of the start first: starting wood in logs of grown trees
   *  (D164) and living berry bushes, the start requirements' minimums with a margin (the generator
   *  aims at 1.35× the wood and 1.15× the bushes, never below Berries near start). */
  nearStart: { wood: number; bushes: number };
  /** Ruins keep this far from the start, in straight tiles (the generator: the difficulty's
   *  "no ruins within" + 7). */
  ruinsClear?: number;
  /** Ids of the entities are hashed from this (default "resources"). */
  owner?: string;
  /** Badwater (D200): the map's Badwater setting ("off" is No badwater, a peaceful map: none is
   *  placed; any other asks for at least one) and the difficulty's badwater distance, no badwater
   *  within this many tiles of the start (`DIFFICULTY_RULES[d].badwaterWithin`: 30 / 15 / 8). */
  badwater: { setting: BadwaterSetting; within: number };
}

export interface MapResources {
  plan: BaselinePlan;
  mines: MineSpot[];
  /** The badwater sources placed (none with No badwater, or on a map with no hollow or side valley
   *  far enough from the start, which `resources.badwater_source` then reports). */
  badwater: BadwaterSpring[];
  /** Badwater sources, trees, bushes, ruin columns and mine sites. */
  entities: EntitySpec[];
  /** The water settled again with the badwater sources, and the soil it leaves: the map's file
   *  writes these instead of the caller's settle. Null when no badwater source was placed. */
  water: { settle: CanonicalWater; moisture: Float64Array; soilContamination: Float64Array } | null;
}

const mapObject = (e: EntitySpec): MapObject => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } });

/** Mine sites, then ruin fields, bushes and groves near the start, then the rest (see the file's
 *  header). */
export function planMapResources(inp: MapResourcesInput): MapResources {
  const { W, H, heights: h, start } = inp;
  const N = W * H;
  const owner = inp.owner ?? "resources";
  // what the map's objects take, where walking is blocked, and the slopes' links
  const taken = new Uint8Array(N);
  const walkBlocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of inp.entities) {
    for (const [x, y] of entityTiles(e)) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      taken[y * W + x] = 1;
      if (WALK_BLOCKERS.has(e.template)) walkBlocked[y * W + x] = 1;
    }
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
  }
  // nothing on the start's 3×3 or its door's row
  for (let y = start.y - 2; y <= start.y + 2; y++) for (let x = start.x - 2; x <= start.x + 2; x++) if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1;
  const startMask = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);

  // ---- badwater sources first (D200): springs in hollows and side valleys, the water settled again
  //      with them; a spring whose badwater comes nearer the start than the badwater distance is
  //      dropped for the next best
  const budget = badwaterBudget(W, H, inp.badwater.setting, inp.seed);
  let springs: BadwaterSpring[] = [];
  let settled: MapResources["water"] = null;
  const refused = new Uint8Array(N);
  for (let round = 0; round < 3 && budget.sources > 0; round++) {
    springs = pickBadwaterSprings({ W, H, heights: h, water: inp.water, taken, start, within: inp.badwater.within, budget, seed: inp.seed, refused });
    if (!springs.length) break;
    const objects = [...inp.entities, ...springEntities(springs, W, owner)].map(mapObject);
    const settle = canonicalSettle(waterModel(W, H, h, objects));
    const barrier = moistureBarrier(W, H, objects);
    const moist = moistureOf(h, settle.depth, settle.contamination, W, H, barrier);
    const soil = soilOf(h, settle.depth, settle.contamination, W, H, barrier);
    // the start's badwater distance, as `start.badwater` measures it
    let near = Infinity;
    for (let i = 0; i < N; i++) if ((soil[i] > 0 || (settle.depth[i] > WET && settle.contamination[i] >= BAD)) && sd[i] < near) near = sd[i];
    if (near >= inp.badwater.within) {
      settled = { settle, moisture: moist, soilContamination: soil };
      break;
    }
    // refuse the ground of the spring nearest the start, and pick again
    const worst = springs.reduce((a, b) => (b.fromStart < a.fromStart ? b : a));
    for (let y = worst.y - 1; y <= worst.y + 3; y++) for (let x = worst.x - 1; x <= worst.x + 3; x++) if (x >= 0 && y >= 0 && x < W && y < H) refused[y * W + x] = 1;
  }
  if (!settled) springs = [];
  const water = settled ? settled.settle.depth : inp.water;
  const moistureNow = settled ? settled.moisture : inp.moisture;
  const soilNow = settled ? settled.soilContamination : inp.soilContamination;
  const badEntities = springEntities(springs, W, owner);
  for (const s of springs) for (let y = s.y - 1; y <= s.y + 3; y++) for (let x = s.x - 1; x <= s.x + 3; x++) if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1;

  // ---- mine sites: the generator's rule (gen/extras.ts): flat dry ground with a level ring, out of
  //      flood reach, in the band from the start, reachable first; never fewer than one where any fits
  const blocked = new Uint8Array(N);
  const margin = FLOOD_MARGIN + 1;
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (taken[i] || x < 2 || y < 2 || x > W - 3 || y > H - 3 || sd[i] < 8) blocked[i] = 1;
    if (water[i] > WET)
      for (let dy = -margin; dy <= margin; dy++)
        for (let dx = -margin; dx <= margin; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
        }
  }
  const regions = walkRegions(h, W, H, walkBlocked, links);
  const root = regions[start.y * W + start.x];
  const band = EXTRA_BANDS.mineSite;
  const scale = bandScale(W, H);
  const want = Math.max(1, Math.min(4, inp.settings.mineSites));
  const rng = stream(inp.seed, "resources", "mines");
  const mines: MineSpot[] = [];
  const fits = (tiles: [number, number][]) => !fitProblems("mineSite", tiles, { W, H, heights: h, water }).length;
  // the band as the generator keeps it; a map too small or too wet for it takes the nearest ground
  // beyond half of it for its one mine site
  for (const lo of [band.lo * scale + 1, (band.lo * scale) / 2]) {
    while (mines.length < want) {
      const spot = pickMineSite({ W, H, heights: h, blocked, startDist: sd, regions, root }, rng, { lo, hi: Infinity, far: lo + (band.lo * scale) / 3 }, fits);
      if (!spot) break;
      mines.push(spot);
      for (const [x, y] of spot.tiles)
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
          }
      for (const [x, y] of spot.tiles) taken[y * W + x] = 1;
    }
    if (mines.length) break;
  }
  const mineEntities: EntitySpec[] = [];
  mines.forEach((m, k) => {
    const f: MapObjectFeature = { id: `${owner}/mine/${k}`, kind: "mapObject", origin: "generated", locked: false, params: { kind: "mineSite", placement: { x: m.x, y: m.y, orientation: m.orientation } } };
    mineEntities.push(...rasterizeObjects(f, W, H, h));
  });

  // ---- the resources, near the start first: the colony's walk from the start (slopes allowed)
  const d = walkDistance(h, W, H, walkBlocked, links, start);
  const walk = new Float64Array(N);
  for (let i = 0; i < N; i++) walk[i] = reachAt(d, W, H, i);
  const plan = planBaseline({
    ground: { W, H, heights: h, water, moisture: moistureNow, soilContamination: soilNow, taken },
    settings: inp.settings,
    seed: inp.seed,
    start,
    walk,
    nearStart: inp.nearStart,
    ruinsClear: inp.ruinsClear,
  });
  const entities = [...badEntities, ...baselineEntities(plan, { W, moisture: moistureNow, soilContamination: soilNow, water }, h, owner), ...mineEntities];
  return { plan, mines, badwater: springs, entities, water: settled };
}
