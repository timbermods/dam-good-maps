// Resources on the settled water (PLAN §7.7, §9.7): ruin fields on dry flat ground away from the
// start, berry patches beside water (the first ones near the start), and single-species groves:
// alive on moist soil, stored dead on dry soil. Every theme's planner runs this on its built ground
// (terrain, slopes, sources and the canonical settle), so the resources sit where the water keeps
// them alive. How much of each, and how it clusters, is the shared resource baseline
// (resources/baseline.ts, Kyler's "Resources like the official maps"): the near-start groves and
// patches come first, for the start requirements, and the baseline fills the rest of its budget.

import type { BerryPatchFeature, Feature, ForestFeature, RuinFieldFeature } from "../features/schema";
import { featureId } from "../features/ids";
import { reachAt, walkDistance } from "../analysis/walk";
import { entityTiles } from "../features/edits";
import { WALK_BLOCKERS } from "../validate/playability";
import { TREE_LOGS, type EntitySpec } from "../format/entities";
import { slopeHighSide } from "../format/footprints";
import { distanceFrom, tilesToRuns } from "../math/grid";
import { hash32, tileHash01 } from "../math/hash";
import { stream } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { pickSeeds } from "./blobs";
import { BUSHES, density, FOREST, OFFICIAL_LAYOUT, RUIN_HEIGHT_SHARES, RUINS } from "./calibrated";
import { growGroveAt, growPatchAt, planGroves, planPatches, planRuinFields, resourceBudget, ruinColumns, succulentsOf, type BaselineGround } from "../resources/baseline";

export interface Ground {
  W: number;
  H: number;
  heights: Uint8Array;
  water: Float64Array;
  moisture: Float64Array;
  soilContamination: Float64Array;
  occupied: Uint8Array;
  start?: { x: number; y: number };
  /** The objects built so far: their slopes say where the colony can walk. */
  entities?: readonly EntitySpec[];
}

/** How far the colony walks from the start to each tile (slopes allowed, round the objects that
 *  block walking): the start requirements count starting wood and living bushes within 20 tiles'
 *  walk (PLAN §5.6, D85, D164). Null without a start. */
function walkFromStart(g: Ground): Float64Array | null {
  if (!g.start || !g.entities) return null;
  const { W, H } = g;
  const links: [number, number][] = [];
  const blocked = new Uint8Array(W * H);
  for (const e of g.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const d = walkDistance(g.heights, W, H, blocked, links, g.start);
  const out = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = reachAt(d, W, H, i);
  return out;
}

/** Near the start, food and wood go within this walk: the requirements count 20 (D85). */
const NEAR_WALK = 20;

/** Regeneration constraints (PLAN §7.0): tiles resources keep off, and what locks kept. */
export interface ResourceConstraints {
  protect: Uint8Array | null;
  lockedMask: Uint8Array | null;
  /** Scrap already planned (the obstacle's ruins on a plateau): it counts toward the map's budget. */
  scrapPlaced?: number;
}

/** The starting wood a tree of a living grove gives, on average (D164): its species' yield by the
 *  species mix (a draw of Succulent grows the heaviest of the other three, as `growGrove` does),
 *  times the share of its trees grown (a sapling's logs are not there yet). */
export function logsPerTree(mix: MapSpec["settings"]["resources"]["speciesMix"]): number {
  const w = [mix.pine, mix.birch, mix.oak, mix.succulent];
  const logs = [TREE_LOGS.Pine, TREE_LOGS.Birch, TREE_LOGS.Oak];
  const heavy = { Pine: 0, Birch: 1, Oak: 2 }[livingSpecies(w)];
  const total = w[0] + w[1] + w[2] + w[3];
  let sum = 0;
  for (let k = 0; k < 3; k++) sum += (w[k] + (k === heavy ? w[3] : 0)) * logs[k];
  return (total > 0 ? sum / total : TREE_LOGS.Pine) * (1 - FOREST.youngShare);
}

/** The start rules' targets for what the generator places near the start (PLAN §5.6): a little
 *  above each minimum the validator enforces, so a map meets its requirements on the first
 *  attempt. The generator never aims below a minimum (D85): starting wood aims at 1.35 × Minimum
 *  starting wood in grown logs (D164), and never below 40 trees' worth; `trees` is the trees that
 *  takes with the species mix. */
export function nearStartTargets(spec: MapSpec): { wood: number; trees: number; bushes: number; ruinsClear: number } {
  const r = spec.settings.start.rules;
  const perTree = logsPerTree(spec.settings.resources.speciesMix);
  const wood = Math.max(Math.ceil(FOREST.nearStart.minLiving * perTree), Math.ceil(1.35 * r.woodWithin20));
  return {
    wood,
    trees: Math.ceil(wood / perTree),
    bushes: Math.max(spec.settings.resources.berriesNearStart, Math.ceil(1.15 * r.bushesWithin20)),
    // official nearest ruin to the start: p10 22; Normal's rule is 15
    ruinsClear: r.ruinsWithin + 7,
  };
}

/** A second district's site needs a grove of 40+ trees and 20+ berry bushes near it (PLAN §9.8). */
export const SITE_TREES = 48;
export const SITE_BUSHES = 24;

export function planResources(spec: MapSpec, g: Ground, candidate: number, attempt: number, constraints?: ResourceConstraints, sites: readonly { x: number; y: number }[] = []): Feature[] {
  const { W, H } = g;
  const N = W * H;
  const area = N;
  const seed = spec.seed;
  const near = nearStartTargets(spec);
  const free = new Uint8Array(N);
  const moist = new Uint8Array(N);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    wet[i] = g.water[i] > 0 ? 1 : 0;
    free[i] = !g.occupied[i] && !wet[i] ? 1 : 0;
    // living plants need moist, dry-footed, clean soil
    moist[i] = g.moisture[i] > 0 && !wet[i] && !(g.soilContamination[i] > 0) ? 1 : 0;
  }
  // regeneration: nothing on the player's features, locked regions or keep-out regions
  const keepOff = constraints?.protect;
  const kept = constraints?.lockedMask;
  if (keepOff || kept) for (let i = 0; i < N; i++) if (keepOff?.[i] || kept?.[i]) free[i] = 0;
  const startMask = new Uint8Array(N);
  if (g.start) {
    for (let y = g.start.y - 1; y <= g.start.y + 1; y++)
      for (let x = g.start.x - 1; x <= g.start.x + 1; x++) startMask[y * W + x] = 1;
  }
  const startDist = distanceFrom(startMask, W, H);
  // near the start, food and wood go within the colony's walk (other tiles only as a fallback)
  const walk = walkFromStart(g);
  const byWalk = (i: number) => (!walk || walk[i] <= NEAR_WALK ? 1 : 0.05);
  // near-start groves and patches grow only within the walk, so every plant of them counts
  let nearWalk: Uint8Array | null = null;
  if (walk) {
    nearWalk = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (walk[i] <= NEAR_WALK) nearWalk[i] = 1;
  }
  const out: Feature[] = [];
  const anchorRole = (prefix: string, tiles: number[]) => `${prefix}/${tiles[0]}`;

  // the map's amounts (the baseline): the official median for its size, moved within the typical
  // range by the seed, times the settings
  const budget = resourceBudget(W, H, spec.settings.resources, seed);
  // the tiles the baseline's planners may not take: kept in step with `free`
  const taken = new Uint8Array(N);
  const ground: BaselineGround = { W, H, heights: g.heights, water: g.water, moisture: g.moisture, soilContamination: g.soilContamination, taken };
  const syncTaken = () => {
    for (let i = 0; i < N; i++) taken[i] = free[i] ? 0 : 1;
  };
  const takeFromBaseline = () => {
    for (let i = 0; i < N; i++) if (taken[i]) free[i] = 0;
  };

  // ---- ruin fields first: flat dry ground away from the start, one level each (PLAN §9.7), each
  //      with its own mix of heights and a few towers (resources/baseline.ts)
  const ruinRng = stream(seed, "ruins", candidate, attempt);
  const fieldId = (tiles: number[]) => featureId(seed, "ruinField", anchorRole("ruinField", tiles));
  syncTaken();
  const ruinPlan = planRuinFields(ground, Math.max(0, budget.scrap - (constraints?.scrapPlaced ?? 0)), {
    rng: ruinRng,
    startDist: g.start ? startDist : null,
    minStart: near.ruinsClear,
    spacing: RUINS.minFieldSpacing,
    fieldMedian: density("ruin_field_columns", area),
    scrapOf: (tiles, t) => ruinColumns(tiles, W, stream(seed, fieldId(tiles), "heights"), t).scrap,
  });
  takeFromBaseline();
  for (const field of ruinPlan.fields) {
    const role = anchorRole("ruinField", field.tiles);
    const tallness = field.tallness;
    const id = featureId(seed, "ruinField", role);
    const f: RuinFieldFeature = {
      id,
      kind: "ruinField",
      origin: "generated",
      role,
      locked: false,
      params: {
        area: tilesToRuns(field.tiles, W),
        scrapTarget: ruinColumns(field.tiles, W, stream(seed, id, "heights"), tallness).scrap,
        heightMix: [...RUIN_HEIGHT_SHARES],
        centerBias: 0,
        layout: { tallness },
      },
    };
    out.push(f);
  }

  // where the colony's walk holds little moist land (a narrow floodplain), the near-start berries
  // and groves share it by their minimums instead of the berries taking theirs first (D85)
  let nearBushes = near.bushes;
  let nearWood = near.wood;
  // where the walk holds little moist land, the near-start groves draw their species by the wood
  // they give as well as by the mix, so the land there still gives the starting wood (D164)
  let tight = false;
  let dense = false;
  if (nearWalk) {
    let room = 0;
    for (let i = 0; i < N; i++) if (nearWalk[i] && free[i] && moist[i]) room++;
    const need = 1.25 * (near.bushes + near.trees);
    // (the groves and patches' own gaps take ground too: fill them there)
    dense = room < need / 0.75;
    if (room < need) {
      tight = true;
      const r = spec.settings.start.rules;
      nearBushes = Math.max(Math.ceil(1.1 * r.bushesWithin20), Math.floor((near.bushes * room) / need));
      nearWood = Math.max(Math.ceil(1.2 * r.woodWithin20), Math.floor((near.wood * room) / need));
    }
  }
  const nearTrees = Math.ceil(nearWood / logsPerTree(spec.settings.resources.speciesMix));

  // ---- berry patches beside water, the first ones near the start (PLAN §7.7)
  const vegRng = stream(seed, "veg", candidate, attempt);
  const waterDist = distanceFrom(wet, W, H);
  const nearWater = (i: number) => waterDist[i] <= 5;
  let bushCount = 0;
  // near the start, patches and groves fill more of their ground (the start requirements count
  // them there), and all of it where the colony's walk holds little moist land
  const nearFill = { bushes: 0.85, trees: 0.7 };
  const patch = (seedTile: number, size: number, ripeShare: number, within: Uint8Array | null = null, fill?: number): number => {
    const allowed = new Uint8Array(N);
    for (let i = 0; i < N; i++) allowed[i] = free[i] && moist[i] && (!within || within[i]) ? 1 : 0;
    if (!allowed[seedTile]) return 0;
    const grown = growPatchAt(ground, vegRng, allowed, seedTile, size, fill);
    if (!grown) return 0;
    const tiles = grown.tiles;
    for (const i of grown.area) free[i] = 0;
    const role = anchorRole("berryPatch", tiles);
    const f: BerryPatchFeature = {
      id: featureId(seed, "berryPatch", role),
      kind: "berryPatch",
      origin: "generated",
      role,
      locked: false,
      params: { area: tilesToRuns(tiles, W), density: 1, ripeShare },
    };
    out.push(f);
    bushCount += tiles.length;
    return tiles.length;
  };
  if (g.start) {
    const want = nearBushes;
    // 2–3 patches as PLAN §7.7 says, more when the target is large or the moist land near the
    // start is narrow (a canyon floor): patches until the target is met, at most 6 a pass. They go
    // within the colony's walk first, in two passes (D85 counts 20 tiles' walk), beyond it only
    // when that walk holds too little moist land.
    const each = Math.max(4, Math.floor(want / Math.max(2, Math.ceil(want / 30))));
    let got = 0;
    for (const within of nearWalk ? [nearWalk, nearWalk, null] : [null]) {
      if (got >= want) break;
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        const dx = x - g.start.x;
        const dy = y - g.start.y;
        const nearHere = within ? within[i] === 1 : dx * dx + dy * dy <= BUSHES.nearStartRadius * BUSHES.nearStartRadius;
        if (nearHere && free[i] && moist[i]) w[i] = (nearWater(i) ? 2 : 1) * byWalk(i);
      }
      for (const s of pickSeeds(vegRng, w, W, 6, 6)) {
        got += patch(s, Math.min(each, Math.max(4, want - got)), 1, within, dense ? 1 : nearFill.bushes);
        if (got >= want) break;
      }
    }
  }
  // a second district's berries (PLAN §9.8)
  for (const site of sites) {
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const y = (i - x) / W;
      const dx = x - site.x;
      const dy = y - site.y;
      if (dx * dx + dy * dy <= BUSHES.nearStartRadius * BUSHES.nearStartRadius && free[i] && moist[i]) w[i] = nearWater(i) ? 2 : 1;
    }
    let got = 0;
    for (const s of pickSeeds(vegRng, w, W, 4, 6)) {
      got += patch(s, Math.max(4, SITE_BUSHES - got), 1, null, nearFill.bushes);
      if (got >= SITE_BUSHES) break;
    }
  }
  // the rest of the map's bushes: a few large patches beside water (the baseline)
  syncTaken();
  for (const p of planPatches(ground, budget.bushes - bushCount, { rng: vegRng, waterDist })) {
    const role = anchorRole("berryPatch", p.tiles);
    out.push({ id: featureId(seed, "berryPatch", role), kind: "berryPatch", origin: "generated", role, locked: false, params: { area: tilesToRuns(p.tiles, W), density: 1, ripeShare: 0.55 } });
    bushCount += p.tiles.length;
  }
  takeFromBaseline();

  // ---- groves: single-species, alive on moist soil and stored dead on dry soil (PLAN §7.7)
  const grove = FOREST.grove[spec.settings.resources.groveSize];
  const mixW = spec.settings.resources.speciesMix;
  const species = ["Pine", "Birch", "Oak", "Succulent"] as const;
  const speciesW = [mixW.pine, mixW.birch, mixW.oak, mixW.succulent];
  const anySpecies = speciesW.some((w) => w > 0);
  let treeCount = 0;
  // the baseline's groves keep a clearing from these (the start's groves may stand close together:
  // the start requirements count them)
  const clearings = new Uint8Array(N);
  // the starting wood the last grove gives: its trees by its species' yield, but for the saplings
  // the forest's rasterizer will make (the same tile hash; D164)
  let groveLogs = 0;
  const woodW = speciesW.map((w, k) => (k < 3 ? w * TREE_LOGS[species[k]] : 0));
  const growGrove = (seedTile: number, size: number, living: boolean, within: Uint8Array | null = null, fill?: number, forWood = false): number => {
    const allowed = new Uint8Array(N);
    for (let i = 0; i < N; i++) allowed[i] = free[i] && (living ? moist[i] : !moist[i]) && (!within || within[i]) ? 1 : 0;
    if (!allowed[seedTile]) return 0;
    const grown = growGroveAt(ground, vegRng, allowed, seedTile, size, fill);
    if (!grown) return 0;
    const tiles = grown.tiles;
    for (const i of grown.area) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) clearings[(y + dy) * W + x + dx] = 1;
    }
    const byWood = forWood && woodW.some((w) => w > 0);
    let sp: (typeof species)[number] = species[anySpecies ? vegRng.weighted(byWood ? woodW : speciesW) : 0];
    if (sp === "Succulent" && living) sp = livingSpecies(speciesW); // succulents are the dry-land tree
    for (const i of grown.area) free[i] = 0;
    const role = anchorRole("forest/grove", tiles);
    const f: ForestFeature = {
      id: featureId(seed, "forest", role),
      kind: "forest",
      origin: "generated",
      role,
      locked: false,
      params: { area: tilesToRuns(tiles, W), density: 1, speciesMix: { [sp]: 1 }, groveSize: tiles.length, life: "auto", youngShare: FOREST.youngShare },
    };
    out.push(f);
    treeCount += tiles.length;
    // the starting wood it gives: grown trees within the colony's walk
    groveLogs = 0;
    if (sp !== "Succulent") {
      const sYoung = hash32(seed, f.id, "young");
      for (const i of tiles) if ((!nearWalk || nearWalk[i]) && (!living || tileHash01(sYoung, i % W, (i - (i % W)) / W) >= FOREST.youngShare)) groveLogs += TREE_LOGS[sp];
    }
    return tiles.length;
  };
  if (g.start) {
    const r = FOREST.nearStart.radius;
    let got = 0;
    const each = Math.floor(grove.median * 1.5);
    // within the colony's walk first, as the berries, until the groves give the wood aimed at
    for (const within of nearWalk ? [nearWalk, nearWalk, null] : [null]) {
      if (got >= nearWood) break;
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        const dx = x - g.start.x;
        const dy = y - g.start.y;
        const nearHere = within ? within[i] === 1 : dx * dx + dy * dy <= r * r;
        if (nearHere && free[i] && moist[i]) w[i] = byWalk(i);
      }
      for (const s of pickSeeds(vegRng, w, W, Math.max(4, Math.ceil(nearTrees / Math.max(1, each)) + 3), 5)) {
        if (growGrove(s, each, true, within, dense ? 1 : nearFill.trees, tight)) got += groveLogs;
        if (got >= nearWood) break;
      }
    }
  }
  // a second district's grove (PLAN §9.8)
  for (const site of sites) {
    const w = new Float64Array(N);
    const r = FOREST.nearStart.radius;
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const y = (i - x) / W;
      const dx = x - site.x;
      const dy = y - site.y;
      if (dx * dx + dy * dy <= r * r && free[i] && moist[i]) w[i] = 1;
    }
    let got = 0;
    const each = Math.floor(grove.median * 1.5);
    for (const s of pickSeeds(vegRng, w, W, Math.max(4, Math.ceil(SITE_TREES / Math.max(1, each)) + 3), 5)) {
      got += growGrove(s, each, true, null, nearFill.trees);
      if (got >= SITE_TREES) break;
    }
  }
  // the rest of the map's trees (the baseline): living groves on moist ground, at most on a
  // quarter of it, and the rest on dry ground, dead (or succulents); each grove one species
  let moistRoom = 0;
  for (let i = 0; i < N; i++) if (free[i] && moist[i] && !clearings[i]) moistRoom++;
  const livingWant = Math.max(0, Math.min(budget.living - succulentsOf(budget, spec.settings.resources) - treeCount, Math.floor(OFFICIAL_LAYOUT.moistCover * (moistRoom + treeCount)) - treeCount));
  const dryWant = Math.max(0, budget.trees - treeCount - livingWant);
  syncTaken();
  for (const gr of planGroves(ground, { living: livingWant, dry: dryWant }, { rng: vegRng, groveSize: spec.settings.resources.groveSize, speciesMix: mixW, clearings, waterDist })) {
    const role = anchorRole("forest/grove", gr.tiles);
    out.push({
      id: featureId(seed, "forest", role),
      kind: "forest",
      origin: "generated",
      role,
      locked: false,
      params: { area: tilesToRuns(gr.tiles, W), density: 1, speciesMix: { [gr.species]: 1 }, groveSize: gr.tiles.length, life: "auto", youngShare: FOREST.youngShare },
    });
    treeCount += gr.tiles.length;
  }
  takeFromBaseline();
  return out;
}

/** The species a living grove takes when the draw gave Succulent: the heaviest of the others,
 *  Pine when all three weigh nothing. */
function livingSpecies(w: readonly number[]): "Pine" | "Birch" | "Oak" {
  if (w[1] > w[0] && w[1] >= w[2]) return "Birch";
  if (w[2] > w[0] && w[2] > w[1]) return "Oak";
  return "Pine";
}
