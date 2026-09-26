// Playability checks (PLAN §11.3–11.5): the map's own water settled with the game's rules, then
// whether a colony can survive and grow from its start. Check ids, rules and thresholds match
// prototype/playability.py, which stays the oracle: tools/oracle.ts runs both on the same files and
// compares every verdict.
//
// Unlike the prototype's first version, every emitter and blocker is handled through its
// footprint (PLAN §11.5): a BadwaterSource emits on its rotated 3×3, seeps, badtide drains and
// aquifers follow their rules (sim/model.ts), and multi-tile objects block walking on every tile.
// Nothing here assumes one start per map beyond vanilla's `start.count`: the start checks run for
// "the start" through one function, which Timber Together maps (D5) can call per colony.

import { damSites, type DamSite } from "../analysis/damsites";
import { components, walkRegions } from "../analysis/regions";
import { pumpShoreDistance, reachAt, walkDistance, WALK_LIMIT } from "../analysis/walk";
import { sourcesInFlow } from "../analysis/sources";
import { isSapling, noWood, treeLogs, woodDetail, type WoodBySpecies, type WoodSpecies } from "../analysis/wood";
import { footprintTiles, slopeHighSide, worldBlocks, FOOTPRINTS } from "../format/footprints";
import { polygonMask } from "../features/geometry";
import { OBJECT_NAMES, objectTiles } from "../features/objects";
import { channelTiles } from "../features/route";
import type { Feature, MapObjectFeature } from "../features/schema";
import { DROUGHT, officialRange, REACH_MIN, RESERVE, reservoirNeeded } from "../gen/calibrated";
import { distanceFrom } from "../math/grid";
import { soilContamination } from "../sim/contamination";
import { droughtStorage } from "../sim/drought";
import { moistureBarrier, type MapObject } from "../sim/model";
import { moisture } from "../sim/moisture";
import type { CanonicalWater } from "../sim/prefill";
import { TICKS_PER_DAY, type WaterModel } from "../sim/water";
import { DIFFICULTY_RULES, type Difficulty, type MapSpec } from "../spec/mapspec";
import type { Collector, FixOp } from "./report";

/** Water deeper than this counts as a water tile (prototype `wet = D > 0.05`). */
export const WET = 0.05;
/** Water with this much contamination or more is badwater to a beaver. */
export const BAD = 0.05;
export const NEAR = 20; // gatherers, lumberjacks and scavengers work within 20 steps
export const RESERVOIR_RADIUS = 40;
export const BLUEBERRY_DAYS_TO_DIE_DRY = 9;
export const TREES = ["Pine", "Birch", "Oak"] as const;
export const WALK_BLOCKERS = new Set([
  "Thorns", "Blockage", "NaturalDam", "UnstableCore", "GeothermalField", "UndergroundRuins", "SmallRelic", "MediumRelic", "LargeRelic",
]);
const START_AREA = { small: 0.6, normal: 1, large: 1.8 } as const;

/** Thresholds for one map: from its spec, or the difficulty's defaults for an imported map. The
 *  three start requirements (PLAN §5.6, D85) are `waterWithin` (water without stairs: tiles' walk
 *  over the map's own ground and slopes to a shore a pump works from), `woodWithin20` (Minimum
 *  starting wood, in logs, D164) and `bushesWithin20` (Minimum starting bushes); the other start
 *  rules are targets with an advisory warning. */
export interface Rules {
  difficulty: Difficulty;
  waterWithin: number;
  woodWithin20: number;
  bushesWithin20: number;
  badwaterWithin: number;
  ruinsWithin: number;
  reachMin: number;
  droughtDays: number;
  /** Stored water needed near the start: the colony's drought need × the drought reserve. */
  reservoirNeed: number;
  /** The least mean depth a dam site's reservoir must have (Hard: 3, PLAN §11.4; else 0), and the
   *  dam heights sampled (crests of 4 only when a depth is asked). */
  reservoirDepth: number;
  maxWaterShare: number;
  multipliers: { scrap: number; trees: number; bushes: number };
}

export function rulesFor(spec: MapSpec | null, designedFor: Difficulty = "normal"): Rules {
  const difficulty = spec?.designedFor ?? designedFor;
  const d = DIFFICULTY_RULES[difficulty];
  const s = spec?.settings;
  const r = s?.start.rules ?? d;
  return {
    difficulty,
    waterWithin: r.waterWithin,
    woodWithin20: r.woodWithin20,
    bushesWithin20: r.bushesWithin20,
    // the Badwater distance setting and the start rule say the same thing: the stricter counts
    badwaterWithin: s ? Math.max(s.hazards.badwaterDistance, s.start.rules.badwaterWithin) : r.badwaterWithin,
    ruinsWithin: r.ruinsWithin,
    reachMin: REACH_MIN[s?.terrain.buildableLand ?? "normal"] * START_AREA[s?.start.area ?? "normal"],
    droughtDays: DROUGHT[difficulty].days,
    reservoirNeed: reservoirNeeded(difficulty) * RESERVE[s?.water.droughtReserve ?? "normal"],
    reservoirDepth: difficulty === "hard" ? 3 : 0,
    maxWaterShare: spec && (spec.theme === "lakeBasin" || spec.theme === "islands") ? 0.55 : 0.35,
    multipliers: s
      ? { scrap: s.resources.ruins / 100, trees: s.resources.forestDensity / 100, bushes: s.resources.berryBushes / 100 }
      : { scrap: 1, trees: 1, bushes: 1 },
  };
}

export interface PlayabilityInput {
  W: number;
  H: number;
  surface: Uint8Array;
  /** Every map object, in file order. */
  objects: readonly MapObject[];
  model: WaterModel;
  water: CanonicalWater;
  rules: Rules;
  /** The features the map was built from (generated and edited maps); null for imports. */
  features: readonly Feature[] | null;
  /** Entity ids in object order, for `where` and fixes. */
  ids?: readonly string[];
}

/** What the checks measured, for the preview layers and the map card. */
export interface PlayabilityAnalysis {
  moisture: Float64Array;
  soilContamination: Float64Array;
  /** Land walkable from the start (1), for the reach layer. */
  reach: Uint8Array;
  /** Chamfer distance from the start's 3×3, in tiles. */
  startDistance: Float64Array | null;
  /** Walking distance from the start, over the map's own ground and slopes, to a shore tile that
   *  touches clean water a pump on it reaches (Infinity if none within the walk limit): the water
   *  rule (D85, amended by D153). */
  waterDistance: number;
  /** Living trees and living berry bushes within 20 tiles' walk of the start (slopes allowed). */
  treesNear: number;
  bushesNear: number;
  /** Starting wood (D164): the logs of the grown trees within 20 tiles' walk, and by species;
   *  and the logs of the saplings there, still growing. */
  woodNear: number;
  woodBySpecies: WoodBySpecies;
  woodGrowing: number;
  damSites: DamSite[];
  /** The best dam site within 40 tiles of the start, and the natural water kept there. */
  bestDam: DamSite | null;
  naturalStorage: number;
}

const N4: readonly [number, number][] = [[0, -1], [-1, 0], [0, 1], [1, 0]];

export function checkPlayability(inp: PlayabilityInput, c: Collector): PlayabilityAnalysis {
  const { W, H, surface: h, objects, water, rules, model } = inp;
  const N = W * H;
  const D = water.depth;
  const C = water.contamination;
  const id = (k: number) => inp.ids?.[k];

  // ---- blockers by footprint: walking (Thorns, Blockage, relics, ...) and moisture (Thorns)
  const blocked = new Uint8Array(N);
  for (const o of objects) {
    if (!WALK_BLOCKERS.has(o.template) || !FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
  }
  const barrier = moistureBarrier(W, H, objects);

  // ---- water
  const wet = new Uint8Array(N);
  const clean = new Uint8Array(N);
  let wetCount = 0;
  let cleanCount = 0;
  for (let i = 0; i < N; i++) {
    if (D[i] > WET) {
      wet[i] = 1;
      wetCount++;
      if (C[i] < BAD) {
        clean[i] = 1;
        cleanCount++;
      }
    }
  }
  c.add({
    id: "water.settles",
    class: "playability",
    ok: water.settled,
    value: water.ticks,
    limit: 4 * TICKS_PER_DAY,
    message: water.settled
      ? `the water is steady after ${water.ticks} ticks (${(water.ticks / TICKS_PER_DAY).toFixed(1)} days); water may keep flowing off the map`
      : `the water is still changing after 4 game days`,
  });
  const share = wetCount / N;
  c.add({
    id: "water.no_flood",
    class: "playability",
    ok: share <= rules.maxWaterShare,
    value: Math.round(share * 1000) / 1000,
    limit: rules.maxWaterShare,
    message: `${Math.round(share * 100)}% of the map is under water (at most ${Math.round(rules.maxWaterShare * 100)}%; official maps reach 40% at p90)`,
  });
  // how much clean water the map keeps is a target, not a rule: maps need not hold their water
  // (D152); the start's own water is `start.water`'s
  const minClean = Math.floor(0.02 * N);
  c.add({
    id: "water.clean_exists",
    class: "playability",
    advisory: true,
    ok: cleanCount >= 0.02 * N,
    value: cleanCount,
    limit: minClean,
    message: `${cleanCount} tiles of clean water (the target is 2% of the map, ${minClean})`,
  });
  checkOutflow(inp, c);
  checkSourcesInFlow(inp, c);
  const bodies = components(clean, W, H, false);
  let largest = 0;
  for (const s of bodies.sizes) if (s > largest) largest = s;
  c.add({
    id: "water.clean_reach",
    class: "playability",
    advisory: true,
    ok: largest >= 40,
    value: largest,
    limit: 40,
    message: `the largest body of clean water badwater never reaches has ${largest} tiles (the target is 40)`,
  });
  checkContained(inp, c);

  const M = moisture(h, D, C, W, H, barrier);
  const SC = soilContamination(h, D, C, W, H, barrier);
  const analysis: PlayabilityAnalysis = {
    moisture: M,
    soilContamination: SC,
    reach: new Uint8Array(N),
    startDistance: null,
    waterDistance: Infinity,
    treesNear: 0,
    bushesNear: 0,
    woodNear: 0,
    woodBySpecies: noWood(),
    woodGrowing: 0,
    damSites: [],
    bestDam: null,
    naturalStorage: 0,
  };

  // ---- a mine site on every map (Kyler, 2026-09-25): the late game's lasting source of scrap
  let mines = 0;
  for (const o of objects) if (o.template === "UndergroundRuins") mines++;
  c.add({
    id: "resources.mine_site",
    class: "playability",
    ok: mines >= 1,
    value: mines,
    limit: 1,
    message: mines ? `${mines} mine site${mines > 1 ? "s" : ""} (every map needs at least one)` : "no mine site: every map needs at least one, the late game's lasting source of scrap metal",
  });

  // ---- the start (vanilla: exactly one; `start.count` reports anything else)
  const starts = objects.map((o, k) => [o, k] as const).filter(([o]) => o.template === "StartingLocation");
  if (starts.length !== 1) {
    for (const cid of START_CHECKS) c.notApplicable(cid, "playability", `needs exactly one start (the map has ${starts.length})`, ADVISORY_START.has(cid));
    return analysis;
  }
  checkStart(inp, c, starts[0][0], { M, SC, wet, clean, blocked, barrier }, analysis, id);
  return analysis;
}

/** `water.badwater_contained` (PLAN §9.5, D57): with a levee on its outlet (the outlet channel's
 *  tiles blocked), every planned badwater basin holds its water below its rim. The water that rises
 *  in it cannot leave the basin (its floor and its two-tile rim) or reach a map edge below the rim's
 *  level. A source never stops, so the levee holds the badwater until the basin is full; what this
 *  proves is that the outlet is the basin's only way out, so the levee is the counterplay. */
function checkContained(inp: PlayabilityInput, c: Collector): void {
  const { W, H, surface: h, features } = inp;
  if (!features) {
    c.notApplicable("water.badwater_contained", "playability", "needs the map's planned badwater basins (imported maps have none)");
    return;
  }
  const basins = features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin" && f.params.plan.mode === "basin" && Array.isArray(f.params.plan.outlet));
  if (!basins.length) {
    c.notApplicable("water.badwater_contained", "playability", "no badwater basin with a planned outlet on this map");
    return;
  }
  const leaks: [number, number][] = [];
  for (const f of basins) {
    if (f.kind !== "setPiece") continue;
    const leak = basinLeak(f.params.plan as unknown as ContainedPlan, h, W, H);
    if (leak) leaks.push(leak);
  }
  c.add({
    id: "water.badwater_contained",
    class: "playability",
    ok: leaks.length === 0,
    value: leaks.length,
    limit: 0,
    message: leaks.length
      ? `${leaks.length} of ${basins.length} badwater basins leak below their rim: a levee on the outlet would not hold the badwater`
      : `a levee on the outlet keeps the badwater in its basin (${basins.length} basin${basins.length > 1 ? "s" : ""})`,
    ...(leaks.length ? { where: { tiles: leaks } } : {}),
  });
}

interface ContainedPlan {
  x: number;
  y: number;
  floor: number;
  outlet: number[];
  outletLevels: number[];
  outletWidth: number;
}

/** Where water rising in a basin with its outlet blocked would leave it below its rim, or null. */
export function basinLeak(p: ContainedPlan, h: Uint8Array, W: number, H: number): [number, number] | null {
  const rim = p.floor + 2;
  const cx = p.x + 1;
  const cy = p.y + 1;
  const blocked = channelTiles({ tiles: p.outlet, levels: p.outletLevels, width: p.outletWidth, to: "" }, W, H).bed;
  const seen = new Uint8Array(W * H);
  const queue: number[] = [];
  for (let y = p.y; y < p.y + 3; y++)
    for (let x = p.x; x < p.x + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      seen[y * W + x] = 1;
      queue.push(y * W + x);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return [x, y];
      const n = ny * W + nx;
      if (seen[n] || blocked.has(n) || h[n] >= rim) continue;
      if (Math.abs(nx - cx) > 5 || Math.abs(ny - cy) > 5) return [nx, ny];
      seen[n] = 1;
      queue.push(n);
    }
  }
  return null;
}

/** `water.source_in_flow` (Kyler, 2026-09-25, D171): a source is where water begins, never inside
 *  a flow that is already there (analysis/sources.ts). A design check, as Kyler's principles are: it
 *  must pass in `generate` and is information on an import. In the editor (`export`) sources go
 *  anywhere (D184): the rule is for generated maps, so it does not apply there. */
function checkSourcesInFlow(inp: PlayabilityInput, c: Collector): void {
  if (c.profile === "export") {
    c.notApplicable("water.source_in_flow", "design", "sources go anywhere in the editor (D184): the rule is for generated maps");
    return;
  }
  const r = sourcesInFlow(inp.model, inp.objects, inp.water.depth);
  if (!r.sources) {
    c.notApplicable("water.source_in_flow", "design", "no water sources on this map");
    return;
  }
  const where = r.inFlow.map((k) => inp.ids?.[k]).filter((e): e is string => !!e);
  c.add({
    id: "water.source_in_flow",
    class: "design",
    ok: r.inFlow.length === 0,
    value: r.inFlow.length,
    limit: 0,
    message: r.inFlow.length
      ? `${r.inFlow.length} of ${r.sources} water sources stand where water from another source already flows: a source is where water begins`
      : `every water source stands where its water begins (${r.sources} source${r.sources > 1 ? "s" : ""})`,
    ...(r.inFlow.length ? { where: { tiles: r.tiles.slice(0, 20), ...(where.length ? { entities: where } : {}) } } : {}),
  });
}

/** The checks that need the start, in report order. */
const START_CHECKS = [
  "start.dry", "start.water", "start.badwater", "start.reach", "start.food", "start.wood", "start.ruins_clear",
  "plants.survive", "plants.drought", "water.reservoir", "resources.scrap", "resources.trees", "resources.bushes", "ruins.fields",
  "ruins.access", "extras.placement",
];
/** Advisory from M8 (D85): generation targets with a warning, never a reason to reject a map. The
 *  resource amounts are information (Kyler, 2026-09-25: resources like the official maps). */
const ADVISORY_START = new Set(["start.badwater", "start.reach", "start.ruins_clear", "water.reservoir", "plants.drought", "resources.scrap", "resources.trees", "resources.bushes"]);

function checkOutflow(inp: PlayabilityInput, c: Collector): void {
  const { W, H, model, water, features } = inp;
  if (!features) {
    c.notApplicable("water.outflow", "playability", "needs the map's planned lakes (imported maps have none)");
    return;
  }
  const N = W * H;
  const any = new Uint8Array(N);
  for (let i = 0; i < N; i++) any[i] = water.depth[i] > 0 ? 1 : 0;
  const { labels } = components(any, W, H, false);
  const emitting = new Uint8Array(N);
  for (const e of model.emitters) for (const i of e.cells) emitting[i] = 1;
  // regions that drain: they reach a map-edge tile that is not walled off by a source
  const drains = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (labels[i] < 0 || emitting[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) drains.add(labels[i]);
  }
  for (const f of features) {
    if (f.kind !== "lake") continue;
    const mask = polygonMask(f.params.outline, W, H);
    for (let i = 0; i < N; i++) if (mask[i] && labels[i] >= 0) drains.add(labels[i]);
  }
  const bad: [number, number][] = [];
  for (const e of model.emitters) {
    if (!(e.strength > 0)) continue;
    const lab = labels[e.cells[0]];
    if (lab >= 0 && !drains.has(lab)) bad.push([e.cells[0] % W, Math.floor(e.cells[0] / W)]);
  }
  c.add({
    id: "water.outflow",
    class: "playability",
    ok: bad.length === 0,
    value: bad.length,
    limit: 0,
    message: bad.length
      ? `${bad.length} sources feed water that reaches neither a map edge nor a planned lake (it would pool and flood)`
      : "every source's water drains to a map edge or a planned lake",
    ...(bad.length ? { where: { tiles: bad.slice(0, 20) } } : {}),
  });
}

interface Fields {
  M: Float64Array;
  SC: Float64Array;
  wet: Uint8Array;
  clean: Uint8Array;
  blocked: Uint8Array;
  /** Thorns: no moisture, no soil contamination (null when the map has none). */
  barrier: Uint8Array | null;
}

function checkStart(
  inp: PlayabilityInput,
  c: Collector,
  start: MapObject,
  fl: Fields,
  analysis: PlayabilityAnalysis,
  id: (k: number) => string | undefined,
): void {
  const { W, H, surface: h, objects, water, rules, model } = inp;
  const N = W * H;
  const D = water.depth;
  const C = water.contamination;
  const { M, SC, wet, clean, blocked, barrier } = fl;
  // the district center's middle tile
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, start).filter((b) => b.localZ === 0);
  let sumX = 0;
  let sumY = 0;
  for (const b of cells) {
    sumX += b.x;
    sumY += b.y;
  }
  const sx = Math.round(sumX / cells.length);
  const sy = Math.round(sumY / cells.length);
  const startMask = new Uint8Array(N);
  let flooded = false;
  for (let y = sy - 2; y <= sy + 2; y++) {
    for (let x = sx - 2; x <= sx + 2; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (wet[y * W + x]) flooded = true;
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) startMask[y * W + x] = 1;
    }
  }
  const sd = distanceFrom(startMask, W, H);
  analysis.startDistance = sd;
  c.add({
    id: "start.dry",
    class: "playability",
    ok: !flooded,
    where: { tiles: [[sx, sy]] },
    message: flooded ? "water stands within 2 tiles of the district center after the water settles" : "the district center and its ring stay dry after the water settles",
  });

  // walking: the map's own ground, and its slopes join levels (no player stairs)
  const links: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(o.orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([o.y * W + o.x, hy * W + hx]);
  }
  const walk = walkDistance(h, W, H, blocked, links, { x: sx, y: sy });

  // requirement 1, the water rule (D153, amending D85): clean pumpable water at a
  // shore the start reaches on foot, over the map's own ground and slopes, within the rule's walk;
  // a pump on that shore reaches the water's surface (0–2 levels below it)
  const shore = pumpShoreDistance(walk, h, W, H, D, C);
  const dw = shore.distance;
  analysis.waterDistance = dw;
  const dwText = Number.isFinite(dw) ? `${(Math.round(dw * 10) / 10).toString()} tiles' walk` : "not";
  c.add({
    id: "start.water",
    class: "playability",
    ok: dw <= rules.waterWithin,
    value: Number.isFinite(dw) ? Math.round(dw * 10) / 10 : "none",
    limit: rules.waterWithin,
    ...(shore.tile >= 0 ? { where: { tiles: [[shore.tile % W, Math.floor(shore.tile / W)]] as [number, number][] } } : {}),
    message:
      dw <= rules.waterWithin
        ? `clean water a pump reaches is ${dwText} from the start, over the map's own ground and slopes (${cap(rules.difficulty)} allows ${rules.waterWithin})`
        : Number.isFinite(dw)
          ? `the nearest clean water a pump reaches is ${dwText} from the start; ${cap(rules.difficulty)} allows ${rules.waterWithin} (beavers go thirsty on day 6)`
          : `no clean water a pump reaches within ${WALK_LIMIT} tiles' walk of the start over the map's own ground and slopes: beavers would need stairs to drink`,
  });
  let db = Infinity;
  let badAt = -1;
  for (let i = 0; i < N; i++) {
    if ((SC[i] > 0 || (wet[i] && C[i] >= BAD)) && sd[i] < db) {
      db = sd[i];
      badAt = i;
    }
  }
  c.add({
    id: "start.badwater",
    class: "playability",
    advisory: true,
    ok: db >= rules.badwaterWithin,
    value: Number.isFinite(db) ? Math.round(db * 10) / 10 : "none",
    limit: rules.badwaterWithin,
    ...(badAt >= 0 ? { where: { tiles: [[badAt % W, Math.floor(badAt / W)]] as [number, number][] } } : {}),
    message: Number.isFinite(db) ? `the nearest badwater or contaminated soil is ${Math.round(db)} tiles from the start (the target is ${rules.badwaterWithin})` : "no badwater or contaminated soil on the map",
  });

  // reach: same-level land joined by slopes (beavers cannot climb a 1-level step)
  const labels = walkRegions(h, W, H, blocked, links);
  const root = labels[sy * W + sx];
  const reach = analysis.reach;
  let dry = 0;
  for (let i = 0; i < N; i++) {
    if (root >= 0 && labels[i] === root) {
      reach[i] = 1;
      if (!wet[i]) dry++;
    }
  }
  c.add({
    id: "start.reach",
    class: "playability",
    advisory: true,
    ok: dry >= rules.reachMin,
    value: dry,
    limit: rules.reachMin,
    message: `${dry} dry tiles are walkable from the start through slopes (the target is ${rules.reachMin}; official p10 1,007)`,
  });

  // requirement 3 (D85): living berry bushes within 20 tiles' walk of the start, slopes allowed;
  // living means alive and on soil where it survives at steady state. Requirement 2, starting wood
  // (D164): the logs of every grown tree within that walk, alive or dead (a tree keeps its logs when
  // it dies), by its species' yield; a sapling's logs are wood still growing, shown apart
  // (analysis/wood.ts)
  const dead = (o: MapObject) => {
    const lnr = o.components.LivingNaturalResource as { IsDead?: boolean } | undefined;
    return !!lnr && lnr.IsDead === true;
  };
  const survives = (i: number) => M[i] > 0 && !(D[i] > 0) && !(SC[i] > 0);
  let bushes = 0;
  let trees = 0;
  let wood = 0;
  let growing = 0;
  const bySpecies = noWood();
  for (const o of objects) {
    const tree = (TREES as readonly string[]).includes(o.template);
    if (!tree && o.template !== "BlueberryBush") continue;
    if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    const i = o.y * W + o.x;
    if (reachAt(walk, W, H, i) > NEAR) continue;
    if (tree) {
      const logs = treeLogs(o.template, o.components);
      if (isSapling(o.components)) growing += logs;
      else {
        wood += logs;
        bySpecies[o.template as WoodSpecies] += logs;
      }
    }
    if (dead(o) || !survives(i)) continue;
    if (tree) trees++;
    else bushes++;
  }
  analysis.treesNear = trees;
  analysis.bushesNear = bushes;
  analysis.woodNear = wood;
  analysis.woodBySpecies = bySpecies;
  analysis.woodGrowing = growing;
  c.add({
    id: "start.food",
    class: "playability",
    ok: bushes >= rules.bushesWithin20,
    value: bushes,
    limit: rules.bushesWithin20,
    message: `${bushes} living berry bushes within 20 tiles' walk of the start (at least ${rules.bushesWithin20})`,
  });
  c.add({
    id: "start.wood",
    class: "playability",
    ok: wood >= rules.woodWithin20,
    value: wood,
    limit: rules.woodWithin20,
    message: `${wood} logs within 20 tiles' walk of the start${woodDetail(bySpecies, growing)} (at least ${rules.woodWithin20})`,
  });
  const ruinsNear: string[] = [];
  let ruinsNearCount = 0;
  objects.forEach((o, k) => {
    if (!o.template.startsWith("RuinColumnH")) return;
    if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) return;
    if (sd[o.y * W + o.x] < rules.ruinsWithin) {
      ruinsNearCount++;
      const e = id(k);
      if (e) ruinsNear.push(e);
    }
  });
  c.add({
    id: "start.ruins_clear",
    class: "playability",
    advisory: true,
    ok: ruinsNearCount === 0,
    value: ruinsNearCount,
    limit: 0,
    message: `${ruinsNearCount} ruin columns within ${rules.ruinsWithin} tiles of the start (the target is none)`,
    ...(ruinsNear.length ? { where: { entities: ruinsNear }, fix: [fixDelete(ruinsNear, "Remove the ruin columns next to the start")] } : {}),
  });

  // plants survive: living ones on moist, dry-footed, clean soil; succulents on dry soil
  const wrong: string[] = [];
  let wrongCount = 0;
  objects.forEach((o, k) => {
    const alive = !dead(o);
    if (!alive || o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) return;
    const i = o.y * W + o.x;
    let bad = false;
    if ((TREES as readonly string[]).includes(o.template) || o.template === "BlueberryBush") bad = M[i] <= 0 || D[i] > 0 || SC[i] > 0;
    else if (o.template === "Succulent") bad = M[i] > 0;
    if (bad) {
      wrongCount++;
      const e = id(k);
      if (e) wrong.push(e);
    }
  });
  c.add({
    id: "plants.survive",
    class: "playability",
    ok: wrongCount === 0,
    value: wrongCount,
    limit: 0,
    message: wrongCount ? `${wrongCount} living plants stand on soil that kills them (dry, flooded or contaminated)` : "every living plant is on soil where it survives",
    ...(wrong.length ? { where: { entities: wrong }, fix: [fixDelete(wrong, "Remove the plants that would die")] } : {}),
  });

  // advisory: berry bushes near the start that lose their moisture in a long drought
  const dryLimit = 0.9 * BLUEBERRY_DAYS_TO_DIE_DRY;
  if (rules.droughtDays <= dryLimit) {
    c.add({
      id: "plants.drought",
      class: "playability",
      advisory: true,
      ok: true,
      value: 0,
      limit: 0,
      message: `${cap(rules.difficulty)} droughts (${rules.droughtDays} days) are shorter than a berry bush survives dry`,
    });
  } else {
    const kept = droughtStorage(model, D, rules.droughtDays);
    const Cd = new Float64Array(N);
    for (let i = 0; i < N; i++) Cd[i] = kept[i] > 0 ? C[i] : 0;
    const Md = moisture(h, kept, Cd, W, H, barrier);
    const thirsty: string[] = [];
    let thirstyCount = 0;
    objects.forEach((o, k) => {
      if (o.template !== "BlueberryBush" || dead(o) || o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) return;
      const i = o.y * W + o.x;
      if (sd[i] > NEAR || Md[i] > 0) return;
      thirstyCount++;
      const e = id(k);
      if (e) thirsty.push(e);
    });
    c.add({
      id: "plants.drought",
      class: "playability",
      advisory: true,
      ok: thirstyCount === 0,
      value: thirstyCount,
      limit: 0,
      message: thirstyCount
        ? `${thirstyCount} berry bushes near the start dry out in a ${rules.droughtDays}-day drought (their water drains; a blueberry dies after about ${BLUEBERRY_DAYS_TO_DIE_DRY} dry days). Irrigate or dam upstream.`
        : `the berry bushes near the start keep moist soil through a ${rules.droughtDays}-day drought`,
      ...(thirsty.length ? { where: { entities: thirsty } } : {}),
    });
  }

  // drought: a reservoir site near the start that holds the colony through the worst drought
  const kept = droughtStorage(model, D, rules.droughtDays);
  let natural = 0;
  for (let i = 0; i < N; i++) if (sd[i] <= RESERVOIR_RADIUS) natural += kept[i];
  const surf = new Float64Array(N);
  for (let i = 0; i < N; i++) surf[i] = h[i] + D[i];
  const deep = rules.reservoirDepth;
  const sites = damSites(h, clean, surf, W, H, sd, 60, deep > 0 ? [1, 2, 3, 4] : [1, 2, 3], 2, 30, deep);
  analysis.damSites = sites;
  analysis.naturalStorage = natural;
  let best: DamSite | null = null;
  for (const s of sites) if (sd[s.y * W + s.x] <= RESERVOIR_RADIUS && (!best || s.volume > best.volume)) best = s;
  analysis.bestDam = best;
  const held = Math.max(natural, best ? best.volume : 0);
  const need = rules.reservoirNeed;
  const colony = DROUGHT[rules.difficulty].colony;
  c.add({
    id: "water.reservoir",
    class: "playability",
    advisory: true,
    ok: held >= need,
    value: Math.round(held),
    limit: Math.round(need),
    ...(best ? { where: { tiles: [[best.x, best.y]] as [number, number][] } } : {}),
    message: `the best dam site within ${RESERVOIR_RADIUS} tiles${deep > 0 ? `, at least ${deep} deep on average,` : ""} holds ${Math.round(best ? best.volume : 0)} and natural pools keep ${Math.round(natural)}; ${Math.round(need)} carries ${colony} beavers through a ${rules.droughtDays}-day drought`,
  });

  // resource totals, information (never a reason to reject): a warning below half the official
  // median for this map size at the map's settings (about the official 10th percentile), and where
  // the amount sits against the official typical range (resources/baseline.ts)
  const area = N;
  let scrap = 0;
  let treeTotal = 0;
  let bushTotal = 0;
  const ruins: MapObject[] = [];
  for (const o of objects) {
    if (o.template.startsWith("RuinColumnH")) {
      scrap += 15 * Number(o.template.slice(11));
      ruins.push(o);
    } else if ((TREES as readonly string[]).includes(o.template) || o.template === "Succulent") treeTotal++;
    else if (o.template === "BlueberryBush") bushTotal++;
  }
  const res: ["scrap" | "trees" | "bushes", number, string][] = [
    ["scrap", scrap, "scrap metal in ruins"],
    ["trees", treeTotal, "trees"],
    ["bushes", bushTotal, "berry bushes"],
  ];
  for (const [key, have, what] of res) {
    const band = officialRange(key, area);
    const k = rules.multipliers[key];
    const need2 = 0.5 * band.median * k;
    const lo = Math.round(band.low * k);
    const hi = Math.round(band.high * k);
    const where = have < lo ? "below" : have > hi ? "above" : "within";
    c.add({
      id: `resources.${key}`,
      class: "playability",
      advisory: true,
      ok: have >= need2,
      value: have,
      limit: Math.round(need2),
      message: `${have.toLocaleString("en-US")} ${what}: ${where} the official maps' typical range for this size${k !== 1 ? " and setting" : ""} (${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")})${have >= need2 ? "" : `; under half their median (${Math.round(need2).toLocaleString("en-US")})`}`,
    });
  }

  // ruins: fields of touching columns, each scavengeable from its own level
  if (ruins.length) {
    const rmask = new Uint8Array(N);
    const count = new Int32Array(N);
    for (const o of ruins) {
      if (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
      rmask[o.y * W + o.x] = 1;
      count[o.y * W + o.x]++;
    }
    const cl = components(rmask, W, H, true);
    const perField = new Array<number>(cl.sizes.length).fill(0);
    for (let i = 0; i < N; i++) if (cl.labels[i] >= 0) perField[cl.labels[i]] += count[i];
    let inFields = 0;
    for (const n of perField) if (n >= 10) inFields += n;
    const shareIn = inFields / ruins.length;
    c.add({
      id: "ruins.fields",
      class: "playability",
      ok: shareIn >= 0.8,
      value: Math.round(shareIn * 100) / 100,
      limit: 0.8,
      message: `${Math.round(shareIn * 100)}% of ruin columns are in fields of 10 or more (at least 80%; official median 97%)`,
    });
    let noAccess = 0;
    for (const o of ruins) {
      let okAccess = false;
      for (let dy = -1; dy <= 1 && !okAccess; dy++)
        for (let dx = -1; dx <= 1 && !okAccess; dx++) {
          if (!dx && !dy) continue;
          const xx = o.x + dx;
          const yy = o.y + dy;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H && h[yy * W + xx] === o.z && !blocked[yy * W + xx]) okAccess = true;
        }
      if (!okAccess) noAccess++;
    }
    c.add({
      id: "ruins.access",
      class: "playability",
      ok: noAccess === 0,
      value: noAccess,
      limit: 0,
      message: noAccess ? `${noAccess} ruin columns have no neighbour at their level for a scavenger to stand on` : "every ruin column can be scavenged from its own level",
    });
  } else {
    c.notApplicable("ruins.fields", "playability", "no ruins on this map");
    c.notApplicable("ruins.access", "playability", "no ruins on this map");
  }
  checkExtras(inp, c, sd);
}

/** Distance bands of the 1.0 objects from the start (PLAN §5.4–5.5, §11.4), in tiles on maps of
 *  128² and larger; smaller maps scale the scaled bands by their side ÷ 128. Thorn belts and unstable
 *  cores keep their distance on every map. */
export const EXTRA_BANDS: Record<string, { lo: number; hi: number; scaled: boolean }> = {
  relicSmall: { lo: 13, hi: 70, scaled: true },
  relicMedium: { lo: 40, hi: 140, scaled: true },
  relicLarge: { lo: 140, hi: Infinity, scaled: true },
  geothermal: { lo: 30, hi: 120, scaled: true },
  mineSite: { lo: 60, hi: Infinity, scaled: true },
  thornBelt: { lo: 20, hi: Infinity, scaled: false },
  unstableCore: { lo: 40, hi: Infinity, scaled: false },
};

/** How much a map shrinks the scaled bands: its longer side ÷ 128, at most 1. */
export function bandScale(W: number, H: number): number {
  const side = W > H ? W : H;
  return side >= 128 ? 1 : side / 128;
}

/** The objects that sit on flat, dry ground outside flood reach (§11.4). */
const FLAT_EXTRAS = new Set(["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal"]);
/** No water tile within this many tiles (Chebyshev) of such an object: it stays out of flood reach. */
export const FLOOD_MARGIN = 2;

/** `extras.placement` (PLAN §11.4): relics, geothermal fields and mine sites sit on flat ground, with
 *  no water within two tiles and outside every planned reservoir, and the generated ones in their
 *  distance band from the start; generated thorn belts keep 20 tiles and unstable cores 40 from the
 *  start, and cores keep their radius + 2 from each other (no chain reaction). */
function checkExtras(inp: PlayabilityInput, c: Collector, sd: Float64Array): void {
  const { W, H, surface: h, water, features } = inp;
  if (!features) {
    c.notApplicable("extras.placement", "playability", "distance bands are generator rules; imported maps keep their objects");
    return;
  }
  const extras = features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && f.params.kind in EXTRA_BANDS);
  if (!extras.length) {
    c.notApplicable("extras.placement", "playability", "no relics, geothermal fields, mine sites, thorn belts or unstable cores on this map");
    return;
  }
  const N = W * H;
  const D = water.depth;
  // tiles within the flood margin of water, and the planned reservoirs
  const flood = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!(D[i] > WET)) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -FLOOD_MARGIN; dy <= FLOOD_MARGIN; dy++)
      for (let dx = -FLOOD_MARGIN; dx <= FLOOD_MARGIN; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) flood[yy * W + xx] = 1;
      }
  }
  for (const f of features) {
    if (f.kind !== "lake" || !f.params.planned) continue;
    const m = polygonMask(f.params.outline, W, H);
    for (let i = 0; i < N; i++) if (m[i]) flood[i] = 1;
  }
  const scale = bandScale(W, H);
  const bad: [number, number][] = [];
  const why: string[] = [];
  const cores: { tiles: [number, number][]; radius: number }[] = [];
  for (const f of extras) {
    const k = f.params.kind;
    const tiles = objectTiles(f, W, H);
    const on = tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
    const name = OBJECT_NAMES[k].toLowerCase();
    let problem = "";
    if (on.length < tiles.length) problem = `a ${name} lies off the map`;
    else if (FLAT_EXTRAS.has(k)) {
      const lv = h[on[0][1] * W + on[0][0]];
      if (on.some(([x, y]) => h[y * W + x] !== lv)) problem = `a ${name} stands on uneven ground`;
      else if (on.some(([x, y]) => flood[y * W + x])) problem = `a ${name} is within ${FLOOD_MARGIN} tiles of water or in a reservoir site`;
    }
    if (!problem && f.origin === "generated" && on.length) {
      const b = EXTRA_BANDS[k];
      const lo = b.scaled ? b.lo * scale : b.lo;
      const hi = b.scaled ? b.hi * scale : b.hi;
      let d = Infinity;
      for (const [x, y] of on) if (sd[y * W + x] < d) d = sd[y * W + x];
      if (d < lo || d > hi) problem = `a ${name} is ${Math.round(d)} tiles from the start (its band is ${Math.round(lo)}${hi < Infinity ? `–${Math.round(hi)}` : "+"})`;
    }
    if (!problem && k === "unstableCore" && f.origin === "generated") cores.push({ tiles: on, radius: f.params.core?.radius ?? 2 });
    if (problem) {
      if (why.length < 4) why.push(problem);
      if (on.length) bad.push(on[0]);
      else bad.push([Math.min(W - 1, Math.max(0, tiles[0][0])), Math.min(H - 1, Math.max(0, tiles[0][1]))]);
    }
  }
  // cores keep their blast (radius + 1) and one more tile from each other: no chain reaction
  for (let a = 0; a < cores.length; a++)
    for (let b = a + 1; b < cores.length; b++) {
      let gap = Infinity;
      for (const [ax, ay] of cores[a].tiles)
        for (const [bx, by] of cores[b].tiles) {
          const g = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
          if (g < gap) gap = g;
        }
      if (gap < Math.max(cores[a].radius, cores[b].radius) + 2) {
        if (why.length < 4) why.push(`two unstable cores are ${gap} tiles apart: one would set off the other`);
        bad.push(cores[b].tiles[0]);
      }
    }
  c.add({
    id: "extras.placement",
    class: "playability",
    ok: bad.length === 0,
    value: bad.length,
    limit: 0,
    message: bad.length ? why.join("; ") : `${extras.length} map objects stand where they should`,
    ...(bad.length ? { where: { tiles: bad.slice(0, 20) } } : {}),
  });
}

function fixDelete(entities: string[], label: string): FixOp {
  return { op: "deleteEntities", label, params: { entities } };
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
