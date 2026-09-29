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
import { LOG_FLOOR, LOG_FLOOR_WALK, LOGS_PER_TREE_SPECIES } from "../data/logFloor";
import { entityTiles } from "../features/edits";
import { WALK_BLOCKERS } from "../validate/playability";
import { TREE_LOGS, type EntitySpec } from "../format/entities";
import { slopeHighSide } from "../format/footprints";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import { hash32, tileHash01 } from "../math/hash";
import { cosDet, expDet, sinDet } from "../math/detmath";
import { stream, type Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import { pickSeeds } from "./blobs";
import { BUSHES, density, FOREST, OFFICIAL_LAYOUT, RUIN_HEIGHT_SHARES, RUINS } from "./calibrated";
import { growGroveAt, growPatchAt, planGroves, planPatches, planRuinFields, resourceBudget, ruinColumns, type BaselineGround } from "../resources/baseline";

export interface Ground {
  W: number;
  H: number;
  heights: Uint8Array;
  water: Float64Array;
  moisture: Float64Array;
  soilContamination: Float64Array;
  occupied: Uint8Array;
  /** River channels: no resources in a riverbed. */
  channel?: Uint8Array;
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
    // (nothing grows in a riverbed, dry or not: the build keeps resources off the channels)
    free[i] = !g.occupied[i] && !wet[i] && !g.channel?.[i] ? 1 : 0;
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
  // and the starting-logs floor's longer walk (D224, D227: 40 tiles at every difficulty)
  let floorWalk: Uint8Array | null = null;
  if (walk) {
    nearWalk = new Uint8Array(N);
    floorWalk = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (walk[i] <= NEAR_WALK) nearWalk[i] = 1;
      if (walk[i] <= LOG_FLOOR_WALK) floorWalk[i] = 1;
    }
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

  // ---- berry patches beside water (PLAN §7.7)
  const vegRng = stream(seed, "veg", candidate, attempt);
  const waterDist = distanceFrom(wet, W, H);
  const nearWater = (i: number) => waterDist[i] <= 5;
  let bushCount = 0;
  // near the start, patches and groves fill more of their ground (the start requirements count
  // them there), and all of it where the colony's walk holds little moist land
  const nearFill = { bushes: 0.85, trees: 0.7 };
  const patch = (seedTile: number, size: number, ripeShare: number, within: Uint8Array | null = null, fill?: number, prefix = "berryPatch"): number => {
    const allowed = new Uint8Array(N);
    for (let i = 0; i < N; i++) allowed[i] = free[i] && moist[i] && (!within || within[i]) ? 1 : 0;
    if (!allowed[seedTile]) return 0;
    const grown = growPatchAt(ground, vegRng, allowed, seedTile, size, fill);
    if (!grown) return 0;
    const tiles = grown.tiles;
    for (const i of grown.area) free[i] = 0;
    const role = anchorRole(prefix, tiles);
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
  // the map's bushes (the baseline): a few large patches beside water
  const patchCentres: [number, number][] = [];
  // where the colony's walk holds little moist land (a narrow floodplain), the map's own groves and
  // patches keep out of it on their first pass, so the start's planting has all of it (D85, D252)
  let walkKeepOut: Uint8Array | null = null;
  if (g.start && nearWalk) {
    let room = 0;
    for (let i = 0; i < N; i++) if (nearWalk[i] && free[i] && moist[i]) room++;
    if (room < 1.25 * (near.bushes + near.trees)) walkKeepOut = nearWalk;
  }
  // the baseline's planners take no tile of `keepOut`
  const keepOutOf = (keepOut: Uint8Array | null) => {
    if (keepOut) for (let i = 0; i < N; i++) if (keepOut[i]) taken[i] = 1;
  };
  const letIn = (keepOut: Uint8Array | null) => {
    if (keepOut) for (let i = 0; i < N; i++) if (keepOut[i]) taken[i] = free[i] ? 0 : 1;
  };
  const basePatches = (want: number, keepOut: Uint8Array | null = null) => {
    syncTaken();
    keepOutOf(keepOut);
    for (const p of planPatches(ground, want, { rng: vegRng, waterDist, centres: patchCentres })) {
      const role = anchorRole("berryPatch", p.tiles);
      out.push({ id: featureId(seed, "berryPatch", role), kind: "berryPatch", origin: "generated", role, locked: false, params: { area: tilesToRuns(p.tiles, W), density: 1, ripeShare: 0.55 } });
      bushCount += p.tiles.length;
    }
    letIn(keepOut);
    takeFromBaseline();
  };
  // (the start's share is kept back for its own planting below, and what that does not use goes
  // to the rest of the map afterwards)
  basePatches(budget.bushes - bushCount - (g.start ? near.bushes : 0), walkKeepOut);

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
  // every grove planted, for the starting wood's and the starting-logs floor's counts (D224, D227)
  const planted: PlantedGrove[] = [];
  const woodW = speciesW.map((w, k) => (k < 3 ? w * TREE_LOGS[species[k]] : 0));
  // `place` leans the species by where the grove grows (pine, birch, oak, succulent), on the mix
  const growGrove = (seedTile: number, size: number, living: boolean, within: Uint8Array | null = null, fill?: number, forWood = false, prefix = "forest/grove", place?: readonly number[]): number => {
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
    const mixed = byWood ? woodW : speciesW;
    const placed = place ? mixed.map((w, k) => w * place[k]) : mixed;
    let sp: (typeof species)[number] = species[anySpecies ? vegRng.weighted(placed.some((w) => w > 0) ? placed : mixed) : 0];
    if (sp === "Succulent" && living) sp = livingSpecies(speciesW); // succulents are the dry-land tree
    for (const i of grown.area) free[i] = 0;
    const role = anchorRole(prefix, tiles);
    const f: ForestFeature = {
      id: featureId(seed, "forest", role),
      kind: "forest",
      origin: "generated",
      role,
      locked: false,
      params: { area: tilesToRuns(tiles, W), density: 1, speciesMix: { [sp]: 1 }, groveSize: tiles.length, life: "auto", youngShare: FOREST.youngShare },
    };
    out.push(f);
    planted.push({ id: f.id, tiles, species: sp, living });
    treeCount += tiles.length;
    // the starting wood it gives: grown trees within the colony's walk
    groveLogs = grownLogs(seed, W, f.id, tiles, sp, living, moist, nearWalk);
    return tiles.length;
  };
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
  // the map's trees (the baseline): living trees only count toward it (the forces-preview
  // feedback's item 26: the official maps' own living share, never dead groves to make up their
  // total), in groves on moist ground, at most on a quarter of it, and living succulents on dry
  // ground by the mix; each grove one species. `keep` trees are kept back for the start's own
  // planting
  const succulents = Math.round((budget.living * mixW.succulent) / Math.max(1, mixW.pine + mixW.birch + mixW.oak + mixW.succulent));
  let succulentsPlanted = 0;
  const baseGroves = (keep: number, keepOut: Uint8Array | null = null) => {
    let moistRoom = 0;
    for (let i = 0; i < N; i++) if (free[i] && moist[i] && !clearings[i]) moistRoom++;
    const livingWant = Math.max(0, Math.min(budget.living - succulents - (treeCount - succulentsPlanted) - keep, Math.floor(OFFICIAL_LAYOUT.moistCover * (moistRoom + treeCount)) - treeCount));
    const dryWant = Math.max(0, succulents - succulentsPlanted);
    syncTaken();
    keepOutOf(keepOut);
    for (const gr of planGroves(ground, { living: livingWant, dry: dryWant }, { rng: vegRng, groveSize: spec.settings.resources.groveSize, speciesMix: mixW, clearings, waterDist, deadOnDry: false })) {
      if (!gr.living) succulentsPlanted += gr.tiles.length;
      const role = anchorRole("forest/grove", gr.tiles);
      out.push({
        id: featureId(seed, "forest", role),
        kind: "forest",
        origin: "generated",
        role,
        locked: false,
        params: { area: tilesToRuns(gr.tiles, W), density: 1, speciesMix: { [gr.species]: 1 }, groveSize: gr.tiles.length, life: "auto", youngShare: FOREST.youngShare },
      });
      planted.push({ id: featureId(seed, "forest", role), tiles: gr.tiles, species: gr.species, living: gr.living });
      treeCount += gr.tiles.length;
    }
    letIn(keepOut);
    takeFromBaseline();
  };
  baseGroves(g.start ? near.trees : 0, walkKeepOut);

  // ---- the start's own planting (PLAN §5.6, D85, D164, D227; D252): the map's own groves and
  //      patches come first, and the start rules add only what they leave short of the targets
  //      within the colony's walk, reading the land the way the floor's wood does (D229)
  if (g.start) {
    // what the map's own plants already give within the walk: living bushes (patches grow only on
    // moist ground) and grown logs
    let gotBushes = 0;
    let gotWood = 0;
    if (nearWalk) {
      for (const f of out) if (f.kind === "berryPatch") for (const i of runsToTiles(f.params.area, W)) if (nearWalk[i]) gotBushes++;
      for (const p of planted) gotWood += grownLogs(seed, W, p.id, p.tiles, p.species, p.living, moist, nearWalk);
    }
    // where the walk holds little moist land (a narrow floodplain), the start's berries and groves
    // share it by their minimums instead of the berries taking theirs first (D85), fill all of it,
    // and draw their species by the wood they give as well as by the mix (D164)
    let nearBushes = near.bushes;
    let nearWood = near.wood;
    let tight = false;
    let dense = false;
    const perTree = logsPerTree(spec.settings.resources.speciesMix);
    if (nearWalk) {
      let room = 0;
      for (let i = 0; i < N; i++) if (nearWalk[i] && free[i] && moist[i]) room++;
      const shortBushes = Math.max(0, near.bushes - gotBushes);
      const shortWood = Math.max(0, near.wood - gotWood);
      const need = 1.25 * (shortBushes + shortWood / perTree);
      // (the groves and patches' own gaps take ground too: fill them there)
      dense = room < need / 0.75;
      if (room < need) {
        tight = true;
        const r = spec.settings.start.rules;
        nearBushes = Math.max(Math.ceil(1.1 * r.bushesWithin20), gotBushes + Math.floor((shortBushes * room) / need));
        nearWood = Math.max(Math.ceil(1.2 * r.woodWithin20), gotWood + Math.floor((shortWood * room) / need));
      }
    }
    const nearTrees = Math.ceil(Math.max(0, nearWood - gotWood) / perTree);
    // the start's yard stays clear of its own planting where the walk has room for it elsewhere
    // (D252): a start is not hemmed in by its own groves and patches
    let plantWalk = nearWalk;
    if (nearWalk && !dense) {
      plantWalk = nearWalk.slice();
      for (let y = g.start.y - YARD_CLEAR; y <= g.start.y + YARD_CLEAR; y++)
        for (let x = g.start.x - YARD_CLEAR; x <= g.start.x + YARD_CLEAR; x++)
          if (x >= 0 && y >= 0 && x < W && y < H && (x - g.start.x) * (x - g.start.x) + (y - g.start.y) * (y - g.start.y) < YARD_CLEAR * YARD_CLEAR) plantWalk[y * W + x] = 0;
    }
    // where the start's own planting leans, drawn once per map (D252): its groves and its berry
    // patches each take a side and a distance within the walk
    const lay = walk && nearWalk ? startLayout(stream(seed, "start-planting", candidate, attempt), g.start, walk, nearWalk, W, H, grove.median) : null;

    // its berries: 1–3 patches (PLAN §7.7), more when the moist land near the start is narrow (a
    // canyon floor), at most 6 a pass. They go within the colony's walk first, in two passes (D85
    // counts 20 tiles' walk), on the layout's side and at its distance, beyond the walk only when
    // it holds too little moist land.
    const wantBushes = nearBushes - gotBushes;
    if (wantBushes > 0) {
      const each = lay ? Math.max(4, Math.ceil(wantBushes / lay.patches)) : Math.max(4, Math.floor(wantBushes / Math.max(2, Math.ceil(wantBushes / 30))));
      let got = 0;
      for (const within of plantWalk ? [plantWalk, plantWalk, null] : [null]) {
        if (got >= wantBushes) break;
        const w = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          const x = i % W;
          const y = (i - x) / W;
          const dx = x - g.start.x;
          const dy = y - g.start.y;
          const nearHere = within ? within[i] === 1 : dx * dx + dy * dy <= BUSHES.nearStartRadius * BUSHES.nearStartRadius;
          if (nearHere && free[i] && moist[i]) w[i] = (nearWater(i) ? 2 : 1) * (within && lay ? lay.berries[i] : byWalk(i));
        }
        for (const s of pickSeeds(lay ? lay.rng : vegRng, w, W, 6, 6)) {
          got += patch(s, Math.min(each, Math.max(4, wantBushes - got)), 1, within, dense ? 1 : nearFill.bushes, "berryPatch/start");
          if (got >= wantBushes) break;
        }
      }
    }

    // its groves: each draws a kind of place within the walk (a river's banks, across the water, a
    // plateau, a side valley, open ground), weighted by its room on the layout's side and at its
    // distance and by how natural it is, and grows from that ground into the land beside it, its
    // species leaning to the place; a kind whose room won't take a grove gives way
    let got = gotWood;
    const r = FOREST.nearStart.radius;
    const each = Math.floor(grove.median * 1.5);
    if (lay && nearWalk) {
      const kindOf = placeKinds({ W, H, heights: g.heights, wet, moist, free, waterDist, start: g.start, within: plantWalk! });
      const used = new Set<FloorWoodKind>();
      while (got < nearWood) {
        const room = LIVING_KINDS.map((k) => {
          let n = 0;
          let s = 0;
          for (let i = 0; i < N; i++)
            if (kindOf[i] === at(k) && free[i]) {
              n++;
              s += lay.groves[i];
            }
          return n >= 8 ? s : 0;
        });
        const weights = LIVING_KINDS.map((k, j) => (room[j] > 0 ? Math.sqrt(room[j]) * FLOOR_KINDS[k].like * (used.has(k) ? 0.5 : 1) : 0));
        if (!weights.some((w) => w > 0)) break;
        const kind = LIVING_KINDS[lay.rng.weighted(weights)];
        used.add(kind);
        const seedW = new Float64Array(N);
        for (let i = 0; i < N; i++) if (kindOf[i] === at(kind) && free[i]) seedW[i] = lay.groves[i];
        const zone = besideTiles(seedW, W, H, 3);
        for (let i = 0; i < N; i++) zone[i] &= plantWalk![i];
        // enough trees for the logs still wanted, within the layout's grove size
        const n = Math.max(6, Math.min(Math.ceil((nearWood - got) / (perTree * 0.8)), Math.round(lay.rng.logNormal(lay.groveSize, 0.45)), grove.cap));
        const sp = FLOOR_KINDS[kind].species;
        let grew = false;
        for (const s of pickSeeds(lay.rng, seedW, W, 3, 4)) {
          if (!growGrove(s, n, true, zone, dense ? 1 : nearFill.trees, tight, `forest/start/${kind}`, tight ? undefined : [sp.pine * lay.opening[0], sp.birch * lay.opening[1], sp.oak * lay.opening[2], 0])) continue;
          got += groveLogs;
          grew = true;
          break;
        }
        if (!grew) for (let i = 0; i < N; i++) if (kindOf[i] === at(kind)) kindOf[i] = 0;
      }
    }
    // then any moist ground within the colony's walk (on the layout's side first), and beyond it
    // only when the walk holds too little
    for (const within of plantWalk ? [plantWalk, plantWalk, null] : [null]) {
      if (got >= nearWood) break;
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        const dx = x - g.start.x;
        const dy = y - g.start.y;
        const nearHere = within ? within[i] === 1 : dx * dx + dy * dy <= r * r;
        if (nearHere && free[i] && moist[i]) w[i] = within && lay ? lay.groves[i] : byWalk(i);
      }
      for (const s of pickSeeds(lay ? lay.rng : vegRng, w, W, Math.max(4, Math.ceil(nearTrees / Math.max(1, each)) + 3), 5)) {
        if (growGrove(s, each, true, within, dense ? 1 : nearFill.trees, tight, "forest/start", lay && !tight ? [...lay.opening, 0] : undefined)) got += groveLogs;
        if (got >= nearWood) break;
      }
    }
    // where the walk's moist land holds too little (D227's 200 logs at Normal), standing dead groves
    // on its dry ground give the rest: a dead tree keeps its logs, and Starting wood counts them
    // (D164); their species drawn by the wood they give
    if (nearWalk && got < nearWood) {
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) if (plantWalk![i] && free[i] && !moist[i] && !wet[i]) w[i] = lay ? lay.groves[i] : 1;
      for (const s of pickSeeds(lay ? lay.rng : vegRng, w, W, Math.max(4, Math.ceil((nearWood - got) / Math.max(1, each)) + 3), 5)) {
        if (growGrove(s, each, false, plantWalk, nearFill.trees, true, "forest/start/dead")) got += groveLogs;
        if (got >= nearWood) break;
      }
    }

    // the rest of the map's bushes and trees: what the start's planting did not use of the budget
    basePatches(budget.bushes - bushCount);
    baseGroves(0);
  }

  // ---- a small drought-killed grove as a feature (item 26: dead trees rare and deliberate), on a
  //      third of the maps: 8–20 standing dead trees on dry ground at the edge of moist land, where a
  //      drought would have killed them, beyond the starting-logs floor's walk (their logs are no
  //      easy early wood)
  {
    const dr = stream(seed, "drought-grove", candidate, attempt);
    if (dr.float() < 1 / 3 && anySpecies) {
      const edgeOfMoist = distanceFrom(moist, W, H);
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) if (free[i] && !moist[i] && !wet[i] && !clearings[i] && edgeOfMoist[i] <= 3 && (!walk || walk[i] > LOG_FLOOR_WALK + 5)) w[i] = 1;
      const zone = new Uint8Array(N);
      for (let i = 0; i < N; i++) zone[i] = w[i] > 0 ? 1 : 0;
      const n = 8 + dr.int(0, 13);
      for (const s of pickSeeds(dr, w, W, 3, 4)) if (growGrove(s, n, false, zone, nearFill.trees, false, "forest/droughtKilled", [1, 1, 1, 0])) break;
    }
  }

  // ---- the starting-logs floor (D224, D227, D229): every map has the floor's logs within 40
  //      tiles' walk of the start, at every difficulty. Where the map's own trees give less, wood is
  //      added the way the land offers it (floorWood)
  if (g.start && floorWalk && walk) {
    for (const f of floorWood({ W, H, seed, candidate, attempt, spec, start: g.start, heights: g.heights, wet, moist, free, waterDist, walk, floorWalk, nearWalk, planted, ground, clearings })) {
      out.push(f);
      treeCount += f.params.groveSize ?? 0;
    }
  }
  return out;
}

/** A grove the generator planted: its trees' tiles, its species, and whether it stands on moist
 *  ground (alive; else standing dead, a tree that keeps its logs). */
interface PlantedGrove {
  id: string;
  tiles: readonly number[];
  species: string;
  living: boolean;
}

/** The kinds of place the floor's wood goes, reading the land (D229). */
export type FloorWoodKind = "riverside" | "across" | "plateau" | "valley" | "open" | "deadPlateau" | "dead";

/** How much each kind is liked, and the species each suits, by weight on the settings' own mix:
 *  groves along a river are birch and pine; a forest across a stream takes the mix; oaks on a
 *  plateau; pines in a side valley; open ground takes the mix; standing dead wood on dry ground is
 *  the last resort (a dead tree keeps its logs). */
const FLOOR_KINDS: Record<FloorWoodKind, { like: number; living: boolean; species: { pine: number; birch: number; oak: number } }> = {
  riverside: { like: 1, living: true, species: { pine: 1, birch: 2, oak: 0.5 } },
  across: { like: 1.2, living: true, species: { pine: 1, birch: 1, oak: 1 } },
  plateau: { like: 1.2, living: true, species: { pine: 0.6, birch: 0.4, oak: 3 } },
  valley: { like: 1.2, living: true, species: { pine: 3, birch: 1, oak: 0.5 } },
  open: { like: 0.4, living: true, species: { pine: 1, birch: 1, oak: 1 } },
  deadPlateau: { like: 0.1, living: false, species: { pine: 0.6, birch: 0.2, oak: 3 } },
  dead: { like: 0.05, living: false, species: { pine: 2, birch: 1, oak: 1 } },
};

/** The kinds in the order `placeKinds` numbers them (1 + the index; 0 is nowhere). */
const KINDS = Object.keys(FLOOR_KINDS) as FloorWoodKind[];
const at = (k: FloorWoodKind) => KINDS.indexOf(k) + 1;
/** The kinds of place a living grove grows on. */
const LIVING_KINDS = KINDS.filter((k) => FLOOR_KINDS[k].living);

/** Within this many tiles of the start's middle (straight-line) its own planting keeps off, where the
 *  walk has room for it elsewhere (D252). */
const YARD_CLEAR = 6;
/** How far the start's planting spreads round the distance its layout leans to, in tiles' walk. */
const REACH_SPREAD = 4;
/** The start's own yard: within this many tiles of its middle the planting is rare (a tree or patch
 *  there weighs (r / YARD)⁴ as much), so a start is not hemmed in by its own groves. */
const YARD = 8;
/** The openings a start's planting can lean to (D164: "species variety becomes a lever the
 *  generator can use for different openings, oak-rich and slow against birch-rich and fast"): its
 *  groves' species weights on the settings' mix (pine, birch, oak), and how often each is drawn. */
const OPENINGS: readonly { species: readonly [number, number, number]; weight: number }[] = [
  { species: [1, 1, 1], weight: 2 }, // as the mix says
  { species: [1, 0.5, 3], weight: 1 }, // oak-rich: fewer, heavier trees
  { species: [3, 1, 0.5], weight: 1 }, // a pine forest
];

/** Where the start's own planting goes within its walk (PLAN §20 D252). Planted evenly on the moist
 *  land nearest the start, its groves and berry patches made the same ring within about 10 tiles of
 *  every start. Each map now draws, from its own stream, a side and a distance for its groves (a
 *  bearing, how strongly they lean to it, and a walk of 6–17 tiles they gather round) and for its
 *  berries (beside the groves, across from them or off to one side, 6–16 tiles out), the size of
 *  its groves (1–3 × the Grove size setting's median), its opening (the groves' species: as the
 *  mix, oak-rich or a pine forest) and how many patches its berries come in (1–3). Each tile within
 *  the walk gets a weight for the groves and one for the berries; they lean the draws, never forbid
 *  a tile, so a start whose walk holds little moist land still gets its wood and berries. */
interface StartLayout {
  rng: Rng;
  groves: Float64Array;
  berries: Float64Array;
  groveSize: number;
  opening: readonly [number, number, number];
  patches: number;
}

function startLayout(rng: Rng, start: { x: number; y: number }, walk: Float64Array, nearWalk: Uint8Array, W: number, H: number, groveMedian: number): StartLayout {
  const N = W * H;
  // e^(lean × (cos θ − 1)) for the tile's direction from the start against the bearing, times a
  // bell round the distance, less in the start's yard (basic operations only, PLAN §2.1)
  const side = (turn: number, lean: number, reach: number) => {
    const bx = cosDet(turn);
    const by = sinDet(turn);
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (!nearWalk[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      const dx = x - start.x;
      const dy = y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      const c = r > 0 ? (dx * bx + dy * by) / r : 0;
      const d = walk[i] - reach;
      const yard = r < YARD ? (r * r * r * r) / (YARD * YARD * YARD * YARD) : 1;
      out[i] = yard * expDet(lean * (c - 1) - (d * d) / (2 * REACH_SPREAD * REACH_SPREAD));
    }
    return out;
  };
  const turn = 2 * Math.PI * rng.float();
  const groves = side(turn, rng.range(1, 3), rng.range(6, 17));
  const off = [0, Math.PI / 3, -Math.PI / 3][rng.weighted([2, 1, 1])] + rng.range(-0.4, 0.4);
  const berries = side(turn + off, rng.range(1, 3), rng.range(6, 16));
  const groveSize = groveMedian * rng.range(1, 3);
  const opening = OPENINGS[rng.weighted(OPENINGS.map((o) => o.weight))].species;
  return { rng, groves, berries, groveSize, opening, patches: 1 + rng.weighted([1, 2, 1]) };
}

/** The kind of place each free, dry-footed tile within `within` is, reading the land round the
 *  start (D229; D252 for the start's own planting): on moist ground, the far side of water from the
 *  start, a river's banks, a plateau two levels above the start, a side valley (ground below its
 *  surroundings), or open ground; on dry ground, a dead plateau or dry ground. Tiles within 3 of the
 *  start are none. */
function placeKinds(o: { W: number; H: number; heights: Uint8Array; wet: Uint8Array; moist: Uint8Array; free: Uint8Array; waterDist: Float64Array; start: { x: number; y: number }; within: Uint8Array }): Uint8Array {
  const { W, H, heights, wet, moist, free, waterDist, start, within } = o;
  const N = W * H;
  const hs = heights[start.y * W + start.x];
  // the mean ground within 3 tiles: a side valley lies below it
  const sum = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum[(y + 1) * (W + 1) + x + 1] = heights[y * W + x] + sum[y * (W + 1) + x + 1] + sum[(y + 1) * (W + 1) + x] - sum[y * (W + 1) + x];
  const meanAround = (x: number, y: number) => {
    const x0 = Math.max(0, x - 3);
    const y0 = Math.max(0, y - 3);
    const x1 = Math.min(W, x + 4);
    const y1 = Math.min(H, y + 4);
    return (sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1] - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  // water between the start and a tile, on the straight line (a forest across a stream)
  const acrossWater = (x: number, y: number) => {
    const dx = x - start.x;
    const dy = y - start.y;
    const steps = Math.ceil(2 * Math.max(Math.abs(dx), Math.abs(dy)));
    for (let k = 2; k < steps - 1; k++) {
      const px = Math.round(start.x + (dx * k) / steps);
      const py = Math.round(start.y + (dy * k) / steps);
      if (wet[py * W + px]) return true;
    }
    return false;
  };
  const kindOf = new Uint8Array(N); // index into KINDS + 1; 0: nowhere
  for (let i = 0; i < N; i++) {
    if (!within[i] || !free[i] || wet[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (Math.abs(x - start.x) <= 3 && Math.abs(y - start.y) <= 3) continue;
    const h = heights[i];
    const flat = (x === 0 || Math.abs(heights[i - 1] - h) <= 1) && (x === W - 1 || Math.abs(heights[i + 1] - h) <= 1) && (y === 0 || Math.abs(heights[i - W] - h) <= 1) && (y === H - 1 || Math.abs(heights[i + W] - h) <= 1);
    if (moist[i]) {
      if (waterDist[i] <= 8 && acrossWater(x, y)) kindOf[i] = at("across");
      else if (waterDist[i] <= 3) kindOf[i] = at("riverside");
      else if (h >= hs + 2 && flat) kindOf[i] = at("plateau");
      else if (meanAround(x, y) - h >= 0.75) kindOf[i] = at("valley");
      else kindOf[i] = at("open");
    } else kindOf[i] = h >= hs + 2 && flat ? at("deadPlateau") : at("dead");
  }
  return kindOf;
}

/** The tiles within `reach` 4-connected steps of the tiles `from` marks: a grove that starts on its
 *  kind's ground grows into the land beside it, a forest, not a ribbon cut to the kind's own tiles. */
function besideTiles(from: Uint8Array | Float64Array, W: number, H: number, reach: number): Uint8Array {
  const N = W * H;
  const near = new Float64Array(N).fill(Infinity);
  const q: number[] = [];
  for (let i = 0; i < N; i++)
    if (from[i]) {
      near[i] = 0;
      q.push(i);
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (near[i] >= reach) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || near[j] <= near[i] + 1) continue;
      near[j] = near[i] + 1;
      q.push(j);
    }
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = near[i] <= reach ? 1 : 0;
  return out;
}

/** The logs a planted grove's grown trees give within `within` (every tile when null): the forest
 *  rasterizer's saplings by the same tile hash give none yet, and a tree on dry ground stands dead
 *  and keeps its logs (D164, D224). */
function grownLogs(seed: number, W: number, id: string, tiles: readonly number[], sp: string, living: boolean, moist: Uint8Array, within: Uint8Array | null): number {
  const logs = LOGS_PER_TREE_SPECIES[sp] ?? 0;
  if (!logs) return 0;
  const sYoung = hash32(seed, id, "young");
  let n = 0;
  for (const i of tiles) {
    if (within && !within[i]) continue;
    if (living && moist[i] && tileHash01(sYoung, i % W, (i - (i % W)) / W) < FOREST.youngShare) continue;
    n += logs;
  }
  return n;
}

interface FloorWoodInput {
  W: number;
  H: number;
  seed: number;
  candidate: number;
  attempt: number;
  spec: MapSpec;
  start: { x: number; y: number };
  heights: Uint8Array;
  wet: Uint8Array;
  moist: Uint8Array;
  free: Uint8Array;
  waterDist: Float64Array;
  walk: Float64Array;
  floorWalk: Uint8Array;
  nearWalk: Uint8Array | null;
  planted: readonly PlantedGrove[];
  ground: BaselineGround;
  clearings: Uint8Array;
}

/** The wood added to meet the starting-logs floor (D224, D227, D229), or nothing where the map's
 *  own trees already give 1.15 × the floor within its walk. The land is read for the places it
 *  offers within the walk: a river's banks on the start's side, the far side of water, a plateau
 *  above the start, a side valley (ground below its surroundings, away from the water), open moist
 *  ground, and last dry ground for standing dead wood. One kind is drawn by seed among those with
 *  room, weighted by their room and by how natural each is, and its groves grow there, each one
 *  species drawn by where it grows and the settings' mix, sized by the logs it gives (a few oaks,
 *  a forest of pines), until the floor is met; a kind that runs out of room gives way to another.
 *  On Hard the wood goes beyond the 20 tiles' walk first ("trees that aren't easy to reach",
 *  docs/PERFECT.md). Each grove is a forest whose role names its kind (`forest/floor/<kind>/…`), so
 *  the reports and the start-area sheet can find it. Its own random stream: a map that needs no
 *  wood keeps every other draw. */
function floorWood(o: FloorWoodInput): ForestFeature[] {
  const { W, H, seed, start, heights, wet, moist, free, waterDist, walk, floorWalk } = o;
  const N = W * H;
  const logsOf = (sp: string) => LOGS_PER_TREE_SPECIES[sp] ?? 0;
  let got = 0;
  for (const p of o.planted) got += grownLogs(seed, W, p.id, p.tiles, p.species, p.living, moist, floorWalk);
  const want = Math.ceil(1.15 * LOG_FLOOR);
  if (got >= want) return [];

  // the land within the walk
  const kindOf = placeKinds({ W, H, heights, wet, moist, free, waterDist, start, within: floorWalk });
  // on Hard, beyond the 20 tiles' walk first
  const far = new Uint8Array(N);
  for (let i = 0; i < N; i++) far[i] = kindOf[i] && !(walk[i] <= 20) ? 1 : 0;
  const rng = stream(seed, "floor-wood", o.candidate, o.attempt);
  const mix = o.spec.settings.resources.speciesMix;
  const out: ForestFeature[] = [];
  const size = FOREST.grove[o.spec.settings.resources.groveSize];
  const used = new Set<FloorWoodKind>();
  const zones: (Uint8Array | null)[] = o.spec.designedFor === "hard" ? [far, null] : [null];
  for (const zone of zones) {
    while (got < want) {
      // the room each kind has left, and a draw among them
      const room = KINDS.map((k) => {
        let n = 0;
        for (let i = 0; i < N; i++) if (kindOf[i] === at(k) && free[i] && (!zone || zone[i])) n++;
        return n;
      });
      const weights = KINDS.map((k, j) => (room[j] >= 8 ? Math.sqrt(room[j]) * FLOOR_KINDS[k].like * (used.has(k) ? 0.5 : 1) : 0));
      if (!weights.some((w) => w > 0)) break;
      const kind = KINDS[rng.weighted(weights)];
      used.add(kind);
      const kd = FLOOR_KINDS[kind];
      // the grove's species: where it grows, by the settings' mix
      const spW = [mix.pine * kd.species.pine, mix.birch * kd.species.birch, mix.oak * kd.species.oak];
      const sp = (["Pine", "Birch", "Oak"] as const)[spW.some((w) => w > 0) ? rng.weighted(spW) : 0];
      // enough trees for the logs still wanted (a few oaks, a forest of pines), within a grove's size
      const perTree = logsOf(sp) * (kd.living ? 1 - FOREST.youngShare : 1);
      const n = Math.max(8, Math.min(Math.ceil((want - got) / Math.max(0.5, perTree)) + 2, Math.round(size.median * 2.5)));
      // it starts on its kind's ground and grows into the land beside it (up to 3 tiles), on the
      // same soil, within the walk: a forest, not a ribbon cut to the kind's own tiles
      const seedW = new Float64Array(N);
      for (let i = 0; i < N; i++) if (kindOf[i] === at(kind) && free[i] && (!zone || zone[i])) seedW[i] = 1;
      const beside = besideTiles(seedW, W, H, 3);
      const allowed = new Uint8Array(N);
      for (let i = 0; i < N; i++) allowed[i] = beside[i] && floorWalk[i] && free[i] && !wet[i] && (kd.living ? moist[i] : !moist[i]) && (!zone || zone[i]) ? 1 : 0;
      const seeds = pickSeeds(rng, seedW, W, 3, 6);
      let grew = false;
      for (const s of seeds) {
        const grown = growGroveAt(o.ground, rng, allowed, s, n);
        if (!grown || grown.tiles.length < 4) continue;
        const tiles = grown.tiles;
        const role = `forest/floor/${kind}/${tiles[0]}`;
        const f: ForestFeature = {
          id: featureId(seed, "forest", role),
          kind: "forest",
          origin: "generated",
          role,
          locked: false,
          params: { area: tilesToRuns(tiles, W), density: 1, speciesMix: { [sp]: 1 }, groveSize: tiles.length, life: "auto", youngShare: FOREST.youngShare },
        };
        out.push(f);
        for (const i of grown.area) {
          free[i] = 0;
          o.ground.taken[i] = 1;
        }
        got += grownLogs(seed, W, f.id, tiles, sp, kd.living, moist, floorWalk);
        grew = true;
        break;
      }
      // a kind whose room would not take a grove gives way
      if (!grew) for (let i = 0; i < N; i++) if (kindOf[i] === at(kind)) kindOf[i] = 0;
    }
    if (got >= want) break;
  }
  return out;
}

/** The species a living grove takes when the draw gave Succulent: the heaviest of the others,
 *  Pine when all three weigh nothing. */
function livingSpecies(w: readonly number[]): "Pine" | "Birch" | "Oak" {
  if (w[1] > w[0] && w[1] >= w[2]) return "Birch";
  if (w[2] > w[0] && w[2] > w[1]) return "Oak";
  return "Pine";
}
