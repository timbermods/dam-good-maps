// The prototype generator, design version 2 (docs/m9-design.md). Version 1's pipeline
// (../proto/generate.ts) with version 2's land (genome.ts, field.ts, levels.ts), hanging valleys
// (hydro.ts), natural ramps, intentions (intentions.ts), the drought-aware settler (start.ts), and
// the planned speed savings built in and measured (task f):
// 1. The field once: a failed attempt whose land was fine (no start, no storage, too little wood,
//    no clean water) is planned again on the same field (new river routing, a new start) before a
//    new genome is drawn.
// 2. Fewer settles: the start and the badwater hollow are planned on the water the hydrology
//    planned (channels and lakes, with an estimated depth), so one canonical settle serves the
//    whole attempt; a second one runs only when the real water moves the start's shore out of
//    reach (the settler then plans again on the settled water).
// 3. First-attempt fixes: the settler takes only ground a beaver reaches without stairs, prefers
//    water that lasts through the first drought, and the objects and resources are planned on the
//    one settle (their builds reuse it).
// Progress: `timings` records when a first look (the terrain and its planned water), the first
// settled water and the finished map are ready, so the page can show each as it comes.
//
// No dam-site ridge and no terrain added to make a dam site (D111); nothing stamped. The terrain
// reaches the build as sculpt edits over the features, as version 1's did (no src/ change).

import { buildMap, SettleCache, type BuildResult } from "../../../src/core/features/build";
import type { SlopeEdit } from "../../../src/core/features/edits";
import { featureId } from "../../../src/core/features/ids";
import { objectTiles } from "../../../src/core/features/objects";
import type { Feature, MapObjectFeature, StartFeature } from "../../../src/core/features/schema";
import { planExtras } from "../../../src/core/gen/extras";
import { planResources } from "../../../src/core/gen/resources";
import { startWalkable } from "../../../src/core/gen/valley";
import type { GenerateResult } from "../../../src/core/gen/generate";
import { toTimberFile } from "../../../src/core/gen/pack";
import { mapMetadata, writeTimber } from "../../../src/core/format/timber";
import { distanceFrom } from "../../../src/core/math/grid";
import { stream } from "../../../src/core/math/rng";
import { droughtStorage } from "../../../src/core/sim/drought";
import { moisture } from "../../../src/core/sim/moisture";
import { waterModel } from "../../../src/core/sim/model";
import { makeSpec, type Difficulty, type MapSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { validateMap, type Validation } from "../../../src/core/validate/checks";
import { blocks, type CheckResult } from "../../../src/core/validate/report";
import { damWalls } from "../lib/ridge";
import { cleanPitsAndSpikes, fillDryHollows, mergeSmallRegions } from "../proto/levels";
import { sculptsOf } from "../proto/generate";
import { storagePossible } from "../proto/storage";
import { fieldV2, type Field } from "./field";
import { drawGenomeV2, EDITOR_TOP, type GenomeV2 } from "./genome";
import { planBadwater } from "./hazards";
import { planHydro, type Hydro } from "./hydro";
import { checkIntention, INTENTIONS, startPreference, type FinalCtx, type IntentionId, type SettlerView } from "./intentions";
import { footComponents, naturalRamps, relaxEdges, snapLevelsV2, type Ramps } from "./levels";
import { pickStart, shoreWalkFrom, type StartPick } from "./start";
import { edgeWalls, sourcesInFlow, startingWood, startWalk, startWaterWalk, STARTING_WOOD, type StartingWood } from "./rules";
import { fallsOf, reachWalk } from "./vertical";
import { ColumnTerrain, type Format3Terrain } from "./terrain";

/** 2.1 made the design's batches, briefs, maps and sheets (commit 07da086). 2.2 is the same
 *  prototype on dev's core start and edge rules (#44) and resources planner: its maps differ in
 *  their bytes (REPORT-v2 §10). */
export const PROTO2_VERSION = "0.7.0-proto2.2";
export const MAX_ATTEMPTS = 12;
/** Re-plans on the same field before a new genome. */
const REPLANS = 2;
/** The first Normal drought's days for the drought-aware start (2–3 in the game's schedule, D133;
 *  investigation/cycles: 2 days with weather seed 1729, after a day of ramp-down). */
export const FIRST_DROUGHT_DAYS = 3;
/** Moist land within 20 tiles' walk the settler asks for (food and wood grow there, D85). */
const MOIST_WALK = 160;
const DEBUG = process.env.DGM_DEBUG === "1";

export type DroughtPolicy = "off" | "prefer" | "require";

export interface V2Options {
  variety?: number;
  vt?: number;
  /** Heights above 16 (D172: confirmed in the game; the product's build still caps at 16, so the prototype measures them before the build). */
  unlocked?: boolean;
  intentions?: IntentionId[] | null;
  variation?: number;
  drought?: DroughtPolicy;
  maxAttempts?: number;
  /** Plan on the settled water (version 1's two settles) instead of the planned water. */
  twoSettles?: boolean;
}

export interface IntentionResult {
  id: IntentionId;
  ok: boolean;
  note: string;
  /** "emerged" at the first check, "re-steered" after one re-steer, or "dropped". */
  outcome: "emerged" | "re-steered" | "dropped";
}

export interface ProtoInfoV2 {
  genome: GenomeV2;
  start: StartPick | null;
  hydro: { rivers: number; lakes: number; falls: number; flow: number; splits: number; deltas: number };
  badwater: string;
  stage: string;
  ms: Record<string, number>;
  ramps: { cut: number; leftToStairs: number };
  settles: number;
  /** The first Normal drought leaves pumpable clean water within the start's water rule. */
  startDrought: boolean | null;
  /** Kyler's start water rule on the finished map: the walk to a pump shore (null: none within the
   *  walk limit), whether that shore is on the start's own level, and whether D85's rule (the
   *  validators' start.water) would also pass. */
  startWater?: { walk: number | null; sameLevel: boolean; d85: boolean };
  /** Edge walls found on the finished map (none on a passing map). */
  edgeWalls?: number;
  /** Starting wood (D164) on the finished map, and whether D85's tree count would also pass. */
  startWood?: StartingWood & { trees85: boolean };
  genomes: number;
}

export type ProtoResultV2 = GenerateResult & {
  recipe: string | null;
  genome: GenomeV2;
  info: ProtoInfoV2;
  storage: CheckResult;
  intentions: IntentionResult[];
  hydro: Hydro;
  /** Milliseconds from the call: the first look, the first settled water, the finished map. */
  timings: { firstLook: number; firstWater: number; final: number };
  /** The terrain as runs per column (terrain.ts): the field the processes made and the built base,
   *  as format 3 stores them. */
  format3: Format3Terrain | null;
};

function specFor(theme: ThemeId, seed: number, size: number, difficulty: Difficulty, g: GenomeV2, attempt: number): MapSpec {
  const spec = makeSpec({ seed, theme, size: { x: size, y: size }, designedFor: difficulty });
  spec.generatorVersion = PROTO2_VERSION;
  spec.accepted = { attempt, candidate: 0 };
  const s = spec.settings;
  // oak woods stand thinner (few trees, 8 logs each), birch woods thicker (many trees, 1 log each)
  s.resources.forestDensity = Math.round(Math.min(200, Math.max(50, g.resources.forest * (g.woods.kind === "oak" ? 0.8 : g.woods.kind === "birch" ? 1.45 : 1))));
  s.resources.berryBushes = g.resources.bushes;
  s.resources.ruins = g.resources.ruins;
  s.resources.groveSize = g.resources.grove;
  // the woods (D164): the grove species the resources planner draws
  s.resources.speciesMix = { pine: g.woods.pine, birch: g.woods.birch, oak: g.woods.oak, succulent: g.woods.succulent };
  // starting wood (D164) counts the logs of grown trees. The design's batches ran before the core
  // rule (dev, #44), when the resources planner's near-start target was a tree count, set from the
  // logs asked for over the logs a grown tree of these woods yields. The core planner now aims at
  // Minimum starting wood in logs by the species mix itself, so the prototype asks it for its own
  // starting wood (the maps differ in their bytes from the batches'; REPORT-v2 §10)
  s.start.rules.woodWithin20 = STARTING_WOOD[difficulty];
  s.hazards.thornBelts = g.hazards.thorns ? "some" : "off";
  s.hazards.badwater = g.hazards.badwater === "none" ? "off" : g.hazards.ratio < 0.5 ? "low" : g.hazards.ratio < 0.85 ? "normal" : "high";
  if (g.recipe) spec.premise = g.recipe;
  return spec;
}

/** The water the hydrology planned, before any settle: each river's channel at the depth its
 *  flow keeps in its width (0.44 deep at 0.82 blocks/s per tile of width, D26, as the square
 *  root of the flow per width), lakes to just above their outlet. */
export function plannedWater(h: Uint8Array, hy: Hydro, W: number, H: number): Float64Array {
  const N = W * H;
  const D = new Float64Array(N);
  const lakeOf = new Int32Array(N).fill(-1);
  hy.lakes.forEach((lk, k) => {
    for (const i of lk.tiles) lakeOf[i] = k;
  });
  // each channel tile's flow per tile of width: the largest river whose channel covers it
  const q = new Float64Array(N);
  for (const r of hy.rivers) {
    const { path, width, flow } = r.params;
    const per = flow / Math.max(1, width);
    const reach = width / 2 + 0.75;
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k];
      const [bx, by] = path[k + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + reach));
      const vx = bx - ax;
      const vy = by - ay;
      const l2 = vx * vx + vy * vy;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = ax + t * vx - x;
          const dy = ay + t * vy - y;
          if (dx * dx + dy * dy <= reach * reach) {
            const i = y * W + x;
            if (per > q[i]) q[i] = per;
          }
        }
    }
  }
  for (let i = 0; i < N; i++) {
    if (hy.water[i] === 2 && lakeOf[i] >= 0) D[i] = Math.max(0.3, hy.lakes[lakeOf[i]].outletBed + 0.6 - h[i]);
    else if (hy.water[i] === 1) {
      let bank = Infinity;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!hy.water[j]) bank = Math.min(bank, h[j]);
      }
      const byFlow = q[i] > 0 ? 0.44 * Math.sqrt(q[i] / 0.82) : 0.25;
      D[i] = Math.max(0.05, Math.min(byFlow, Number.isFinite(bank) ? bank - h[i] - 0.1 : byFlow));
    }
  }
  return D;
}

interface Land {
  g: GenomeV2;
  F: Field;
  h0: Uint8Array;
}

interface Attempt {
  result: ProtoResultV2;
  passed: boolean;
  /** The failure leaves the land usable: plan again on the same field. */
  replannable: boolean;
}

export function generateV2(theme: ThemeId, seed: number, size: number, difficulty: Difficulty = "normal", opts: V2Options = {}): ProtoResultV2 {
  const t0 = performance.now();
  const failures: { attempt: number; failed: string[] }[] = [];
  let last: Attempt | null = null;
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  let land: Land | null = null;
  let genomes = 0;
  let replans = 0;
  for (let attempt = 0; attempt < max; attempt++) {
    if (!land || !last?.replannable || replans >= REPLANS) {
      const g = drawGenomeV2(theme, seed, size, size, genomes, { variety: opts.variety, vt: opts.vt, unlocked: opts.unlocked, intentions: opts.intentions, variation: opts.variation });
      genomes++;
      replans = 0;
      const F = fieldV2(g, seed, size, size);
      land = { g, F, h0: snapLevelsV2(F.E, g, seed, size, size) };
    } else replans++;
    const a = attemptOnce(theme, seed, size, difficulty, attempt, land, opts, t0);
    a.result.attempts = attempt + 1;
    a.result.failures = failures;
    a.result.info.genomes = genomes;
    last = a;
    if (a.passed) return a.result;
    failures.push({
      attempt,
      failed: a.result.report.checks
        .filter((c) => blocks("generate", c) && c.id !== "start.water" && c.id !== "start.wood")
        .map((c) => c.id)
        .concat(a.result.info.startWater && !(a.result.info.startWater.walk !== null && a.result.info.startWater.walk <= a.result.spec.settings.start.rules.waterWithin) ? ["start.water_walk"] : [])
        .concat(a.result.info.startWood && a.result.info.startWood.logs < STARTING_WOOD[difficulty] ? ["start.starting_wood"] : [])
        .concat(a.result.storage.ok ? [] : ["water.storage_possible"])
        .concat(a.result.info.stage !== "built" ? [a.result.info.stage === "dam wall" ? "terrain.dam_wall" : a.result.info.stage === "edge wall" ? "terrain.edge_wall" : a.result.info.stage] : []),
    });
  }
  return last!.result;
}

function attemptOnce(theme: ThemeId, seed: number, size: number, difficulty: Difficulty, attempt: number, land: Land, opts: V2Options, t0: number): Attempt {
  const W = size;
  const H = size;
  const N = W * H;
  const ms: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => {
    const n = performance.now();
    ms[k] = (ms[k] ?? 0) + Math.round(n - t);
    t = n;
  };
  const g = land.g;
  const spec = specFor(theme, seed, size, difficulty, g, attempt);
  const rule = spec.settings.start.rules.waterWithin;
  const h = land.h0.slice();
  // no edge walls: the land runs on past the edge, before the water is planned and after the
  // channels are cut (Kyler's rule; rules.ts checks it on the finished map)
  relaxEdges(h, W, H);
  lap("terrain");
  const hy = planHydro(land.F.E, h, g, seed, W, H, attempt);
  relaxEdges(h, W, H);
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) keep[i] = hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  mergeSmallRegions(h, W, H, 4, keep);
  cleanPitsAndSpikes(h, W, H, keep);
  fillDryHollows(h, W, H, keep);
  const ramps: Ramps = naturalRamps(h, W, H, keep, new Uint8Array(N), g, seed, attempt);
  if (ramps.cut) {
    cleanPitsAndSpikes(h, W, H, keep);
    fillDryHollows(h, W, H, keep);
  }
  // slopes only where the ramp still steps as planned (the tile behind the low side level with it)
  const slopeEdits: SlopeEdit[] = rampSlopes(ramps.slopes, h, W, H);
  const hLand = h.slice();
  lap("hydro");
  const firstLook = Math.round(performance.now() - t0);
  const cache = new SettleCache();
  const rivers: Feature[] = hy.rivers;
  let settles = 0;
  const build = (features: readonly Feature[], stop: "water" | "resources" | null) => {
    return buildMap({ W, H, seed, features, sculpts: sculptsOf(h, W), slopeEdits }, { settleCache: cache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });
  };
  const counted = (features: readonly Feature[], stop: "water" | "resources" | null) => {
    const before = cacheKey(cache);
    const b = build(features, stop);
    if (cacheKey(cache) !== before) settles++;
    return b;
  };
  const info: ProtoInfoV2 = {
    genome: g,
    start: null,
    hydro: { rivers: hy.rivers.length, lakes: hy.lakes.length, falls: hy.falls.length, flow: hy.flowTotal, splits: hy.arms.filter((a) => a.kind === "split").length, deltas: hy.arms.filter((a) => a.kind === "mouth").length },
    badwater: "none",
    stage: "planned",
    ms,
    ramps: { cut: ramps.cut, leftToStairs: ramps.leftToStairs },
    settles: 0,
    startDrought: null,
    genomes: 0,
  };
  const empty = (): CheckResult => ({ id: "water.storage_possible", class: "playability", severity: "error", ok: false, message: info.stage });
  const fail = (stage: string, b: BuildResult | null, replannable: boolean): Attempt => {
    info.stage = stage;
    info.settles = settles;
    const built = b ?? build(rivers, null);
    const file = toTimberFile(spec, built);
    const v = validateMap(file, { profile: "generate", spec, features: rivers, water: { model: built.waterModel, settled: built.settle } });
    return {
      passed: false,
      replannable,
      result: { spec, features: [...rivers], built, report: { ...v.report, passed: false }, analysis: v.analysis, bytes: new Uint8Array(), file, attempts: attempt + 1, failures: [], recipe: g.recipe, genome: g, info, storage: empty(), intentions: [], hydro: hy, timings: { firstLook, firstWater: -1, final: Math.round(performance.now() - t0) }, format3: null },
    };
  };
  if (!hy.rivers.length) return fail("no rivers", null, false);
  // D171: every source starts a river (rules.ts); a hydrology that puts one inside a flow is planned again
  if (sourcesInFlow(hy.rivers, hy.lakes, W)) return fail("source in a flow", null, true);
  const policy: DroughtPolicy = opts.drought ?? "prefer";
  const foot = footComponents(h, W, H, keep);
  const minFoot = Math.round(Math.max(1200, 0.12 * N));
  // ---- the start, planned on the water the hydrology planned (or on the settled water)
  const settlerOn = (D: ArrayLike<number>, C: ArrayLike<number>, M: ArrayLike<number>, attemptSalt: number, avoid: Uint8Array | null, weight = 1): StartPick | null => {
    const kept = policy === "off" ? null : droughtStorage(waterModel(W, H, h, []), D, FIRST_DROUGHT_DAYS);
    const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M) : null;
    const prefer = view ? (x: number, y: number, L: number, w: number) => weight * Math.max(...g.intentions.map((id) => startPreference(id, view, x, y, L, w))) : null;
    const rng = stream(seed, "settler2", attempt, attemptSalt);
    return pickStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, g.settler, rng, rule, { avoid, kept, drought: policy, prefer, foot, minFoot, moistWalk: { min: MOIST_WALK } });
  };
  let pick: StartPick | null = null;
  let base: BuildResult;
  let bad: ReturnType<typeof planBadwater> = { kind: "none", features: [], avoid: new Uint8Array(N), heights: h };
  const levelStart = (p: StartPick) => {
    if (!p.levelled) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) h[(p.y + dy) * W + p.x + dx] = p.level;
    if (p.shore) {
      const [bx, by] = p.shore;
      const steps = Math.ceil(Math.max(Math.abs(bx - p.x), Math.abs(by - p.y)) * 2);
      for (let k = 0; k <= steps; k++) {
        const px = p.x + ((bx - p.x) * k) / steps;
        const py = p.y + ((by - p.y) * k) / steps;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = Math.round(py + dy) * W + Math.round(px + dx);
            if (hy.water[j] === 1 || hy.water[j] === 2) continue;
            h[j] = p.level;
          }
      }
    }
    cleanPitsAndSpikes(h, W, H, keep);
  };
  const startOf = (p: StartPick): StartFeature => ({
    id: featureId(seed, "start", "start/main"),
    kind: "start",
    origin: "generated",
    role: "start/main",
    locked: false,
    params: { position: [p.x, p.y], orientation: p.orientation, benchRadius: 2, benchLevel: p.level, player: 0 },
  });
  // ---- the badwater hollow, planned before the settle: away from where the start will likely be
  //      (the settler run on the water the hydrology planned), so one settle serves both
  if (!opts.twoSettles && g.hazards.badwater !== "none") {
    const est = plannedWater(h, hy, W, H);
    const zero = new Float64Array(N);
    const guess = settlerOn(est, zero, moisture(h, est, zero, W, H, null), 0, ramps.tiles);
    if (guess) {
      bad = planBadwater(h, W, H, { water: est } as unknown as BuildResult, hy, g, spec, seed, attempt, { x: guess.x, y: guess.y });
      if (bad.features.length) h.set(bad.heights);
    }
  }
  lap("hazards");
  // ---- the one settle: the rivers and the hollow
  const avoidOf = () => {
    const a = new Uint8Array(N);
    for (let i = 0; i < N; i++) a[i] = bad.avoid[i] || ramps.tiles[i] ? 1 : 0;
    return a;
  };
  let b1 = counted([...rivers, ...bad.features], "resources");
  lap("settle");
  let firstWater = Math.round(performance.now() - t0);
  // ---- the start on the settled water, clear of the hollow
  pick = settlerOn(b1.water, b1.contamination, b1.moisture, 1, avoidOf());
  if (!pick && bad.features.length) {
    // the hollow took the only good place for a start: this land keeps no hollow
    h.set(hLand);
    bad = { kind: "none", features: [], avoid: new Uint8Array(N), heights: h };
    b1 = counted([...rivers], "resources");
    pick = settlerOn(b1.water, b1.contamination, b1.moisture, 2, avoidOf());
  }
  lap("start");
  if (!pick) return fail("no start", b1, true);
  if (opts.twoSettles && g.hazards.badwater !== "none") {
    // version 1's order: the hollow planned after the start, on the settled water, then a settle
    bad = planBadwater(h, W, H, b1, hy, g, spec, seed, attempt, { x: pick.x, y: pick.y });
    if (bad.features.length) h.set(bad.heights);
  }
  levelStart(pick);
  let layout: Feature[] = [...rivers, ...bad.features, startOf(pick)];
  // a start on level ground and no new hollow keep the water: this build reuses the settle
  base = counted(layout, "resources");
  if (!startWaterOk(base, pick, rule)) {
    if (DEBUG) console.log(`  after levelling: ${whyNot(base, pick, rule)}`);
    if (bad.features.length) {
      h.set(hLand);
      levelStart(pick);
      bad = { kind: "none", features: [], avoid: new Uint8Array(N), heights: h };
      layout = [...rivers, startOf(pick)];
      base = counted(layout, "resources");
    }
    if (!startWaterOk(base, pick, rule)) return fail("start water moved", base, true);
  }
  firstWater = Math.round(performance.now() - t0);
  info.start = pick;
  info.badwater = bad.kind;
  // ---- map objects and resources on the one settle (their builds reuse it)
  const avoid = new Uint8Array(N);
  for (let i = 0; i < N; i++) avoid[i] = bad.avoid[i] || ramps.tiles[i] ? 1 : 0;
  const walked = startWalkable(base);
  const objects = planExtras({ spec, base, features: layout, protect: null, avoid, candidate: 0, attempt });
  if (objects.length) {
    let b2 = counted([...layout, ...objects], "resources");
    const own = (f: MapObjectFeature) => objectTiles(f, W, H).length;
    const kept = objects.slice();
    const total = () => kept.reduce((a, f) => a + own(f), 0);
    while (kept.length && startWalkable(b2) < walked - total() - 40) {
      kept.sort((a, c) => (a.params.kind === "thornBelt" ? 0 : 1) - (c.params.kind === "thornBelt" ? 0 : 1) || own(c) - own(a));
      kept.shift();
      b2 = counted([...layout, ...kept], "resources");
    }
    layout.push(...kept);
    base = b2;
  }
  lap("objects");
  const resources = planResources(spec, base, 0, attempt, { protect: bad.avoid, lockedMask: null }, []);
  let features = [...layout, ...resources];
  let built = counted(features, null);
  lap("resources");
  let same = true;
  for (let i = 0; i < N; i++) if (built.heights[i] !== h[i]) same = false;
  if (!same) info.stage = "terrain changed in the build";
  let file = toTimberFile(spec, built);
  file.metadata = mapMetadata(W, H, `${theme} prototype (design version 2), seed ${seed}. Made with the Dam Good Maps M9 design prototype ${PROTO2_VERSION}.`);
  let v: Validation = validateMap(file, { profile: "generate", spec, features, water: { model: built.waterModel, settled: built.settle } });
  lap("validate");
  // Kyler's rules (rules.ts) stand in for two of the validators' start checks, which still carry
  // D85's: start.water (the water on the start's own level) and start.wood (a tree count). Every
  // other blocking check is the validators'.
  const judge = (b: BuildResult, vv: Validation) => {
    const walk0 = b.start ? startWalk(b.heights, W, H, b.entities, b.start) : null;
    const sw = b.start && walk0 ? startWaterWalk(b.heights, b.water, b.contamination, W, H, b.entities, b.start, walk0) : { distance: Infinity, tile: -1, water: -1, sameLevel: false };
    const wood: StartingWood = b.start && walk0 ? startingWood(b.heights, W, H, b.entities, b.start, walk0) : { logs: 0, growing: 0, bySpecies: { Oak: 0, Pine: 0, Birch: 0 }, trees: 0, oakShare: 0 };
    const waterOk = sw.distance <= rule;
    const woodOk = wood.logs >= STARTING_WOOD[difficulty];
    const report = vv.report.checks.every((c) => !blocks("generate", c) || c.id === "start.water" || c.id === "start.wood" || (g.unlocked && c.id === "terrain.max_height")) && waterOk && woodOk;
    const st = storagePossible(h, W, H, b, vv, spec, { ok: waterOk, tile: sw.water >= 0 ? [sw.water % W, Math.floor(sw.water / W)] : null });
    return { sw, wood, waterOk, woodOk, report, storage: st };
  };
  let judged = judge(built, v);
  let storage = judged.storage;
  lap("storage");
  // ---- intentions: check each on the finished map; a start intention is re-steered once
  const results: IntentionResult[] = [];
  if (judged.report && storage.ok && g.intentions.length) {
    let ctx = finalCtx(built, hy);
    let res = g.intentions.map((id) => ({ id, ...checkIntention(id, ctx) }));
    const startSide = new Set<IntentionId>(["under-cliff", "long-view", "meeting-waters", "falls-shield", "safe-water-uphill"]);
    if (res.some((r) => !r.ok && startSide.has(r.id))) {
      // re-steer: the start again on the finished land and water, the intentions weighted up; the
      // land is kept, so the settle is reused
      const p3 = settlerOn(built.water, built.contamination, built.moisture, 4, avoid, 3);
      if (p3 && !p3.levelled && (p3.x !== pick.x || p3.y !== pick.y)) {
        const lay3 = [...layout.filter((f) => f.kind !== "start"), startOf(p3)];
        const b3 = counted(lay3, "resources");
        if (startWaterOk(b3, p3, rule)) {
          const res3Pre = g.intentions.map((id) => ({ id, ...checkIntention(id, finalCtx(b3, hy)) }));
          if (res3Pre.filter((r) => r.ok).length > res.filter((r) => r.ok).length) {
            const r3 = planResources(spec, b3, 0, attempt, { protect: bad.avoid, lockedMask: null }, []);
            const f3 = [...lay3, ...r3];
            const bb = counted(f3, null);
            const file3 = toTimberFile(spec, bb);
            file3.metadata = file.metadata;
            const v3 = validateMap(file3, { profile: "generate", spec, features: f3, water: { model: bb.waterModel, settled: bb.settle } });
            const j3 = judge(bb, v3);
            const s3 = j3.storage;
            if (j3.report && s3.ok) {
              const prevOk = new Set(res.filter((r) => r.ok).map((r) => r.id));
              pick = p3;
              info.start = p3;
              layout = lay3;
              features = f3;
              built = bb;
              file = file3;
              v = v3;
              judged = j3;
              storage = s3;
              ctx = finalCtx(built, hy);
              res = g.intentions.map((id) => ({ id, ...checkIntention(id, ctx) }));
              for (const r of res) results.push({ id: r.id, ok: r.ok, note: r.note, outcome: r.ok ? (prevOk.has(r.id) ? "emerged" : "re-steered") : "dropped" });
            }
          }
        }
      }
    }
    if (!results.length) for (const r of res) results.push({ id: r.id, ok: r.ok, note: r.note, outcome: r.ok ? "emerged" : "dropped" });
    lap("intentions");
  }
  // ---- the drought-aware start on the real water
  if (judged.report && built.start) {
    const kept = droughtStorage(built.waterModel, built.water, FIRST_DROUGHT_DAYS);
    info.startDrought = startWaterWalk(built.heights, kept, built.contamination, W, H, built.entities, built.start).distance <= rule;
  }
  const walls = judged.report && storage.ok ? damWalls(built.heights, W, H, built.water) : [];
  if (walls.length) info.stage = "dam wall";
  const droughtFail = policy === "require" && info.startDrought === false;
  if (droughtFail && info.stage === "planned") info.stage = "start.drought_water";
  // heights above 16 (D172, confirmed by the tall-maps probe). Two things change there: terrain.max_height's
  // limit (22 for Verticality 70+), read here; and the build's cap at 16 (features/raster/terrain.ts),
  // which the prototype cannot lift (no src/ change), so unlocked maps are measured before the build
  // (unlocked.ts)
  const sw = judged.sw;
  info.startWater = { walk: Number.isFinite(sw.distance) ? Math.round(sw.distance * 10) / 10 : null, sameLevel: sw.sameLevel, d85: !!v.report.checks.find((c) => c.id === "start.water")?.ok };
  info.startWood = { ...judged.wood, trees85: !!v.report.checks.find((c) => c.id === "start.wood")?.ok };
  // Kyler's resource rules: at least one mine site on every map
  const mines = built.entities.filter((e) => e.template === "UndergroundRuins").length;
  if (!mines && info.stage === "planned") info.stage = "no mine site";
  const edges = edgeWalls(built.heights, built.water, W, H);
  info.edgeWalls = edges.length;
  if (edges.length && info.stage === "planned") info.stage = "edge wall";
  const reportPassed = judged.report;
  const passed = reportPassed && storage.ok && !walls.length && !edges.length && mines > 0 && !droughtFail && (g.unlocked || maxOf(built.heights) <= EDITOR_TOP);
  if (info.stage === "planned") info.stage = "built";
  info.settles = settles;
  const bytes = passed ? writeTimber(file) : new Uint8Array();
  lap("write");
  const replannable = !passed && !walls.length && same && (info.stage === "built" || info.stage === "start.drought_water" || info.stage === "no mine site");
  return {
    passed,
    replannable,
    result: {
      spec,
      features,
      built,
      report: g.unlocked ? { ...v.report, passed: reportPassed } : v.report,
      analysis: v.analysis,
      bytes,
      file,
      attempts: attempt + 1,
      failures: [],
      recipe: g.recipe,
      genome: g,
      info,
      storage,
      intentions: results,
      hydro: hy,
      timings: { firstLook, firstWater, final: Math.round(performance.now() - t0) },
      format3: passed ? { formatVersion: 3, field: ColumnTerrain.fromHeights(land.h0, W, H).toData(), base: ColumnTerrain.fromHeights(built.heights, W, H).toData() } : null,
    },
  };
}

function maxOf(h: Uint8Array): number {
  let m = 0;
  for (const v of h) if (v > m) m = v;
  return m;
}

/** A stable reading of the settle cache's entry, to count real settles (a hit leaves it as is). */
function cacheKey(cache: SettleCache): unknown {
  const c = cache as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (v && typeof v === "object" && "water" in (v as object)) return (v as { water: unknown }).water;
  }
  return null;
}

/** The ramps' slopes that still stand as planned: the tile behind the low side is level with it. */
function rampSlopes(list: SlopeEdit[], h: Uint8Array, W: number, H: number): SlopeEdit[] {
  const out: SlopeEdit[] = [];
  const seen = new Set<number>();
  for (const s of list) {
    if (s.op !== "pinSlope") continue;
    const { x, y } = s.params;
    const i = y * W + x;
    if (seen.has(i)) continue;
    // the high neighbour one level up, the one behind at the same level
    let ok = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const hx = x + dx;
      const hy = y + dy;
      const bx = x - dx;
      const by = y - dy;
      if (hx < 0 || hy < 0 || hx >= W || hy >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
      if (h[hy * W + hx] === h[i] + 1 && h[by * W + bx] === h[i]) {
        const o = orientationFor(dx, dy);
        if (o === s.params.orientation) ok = true;
      }
    }
    if (!ok) continue;
    seen.add(i);
    out.push({ ...s, seq: out.length + 1 });
  }
  return out;
}

function orientationFor(dx: number, dy: number): string {
  if (dx === 0 && dy === -1) return "Cw0";
  if (dx === -1 && dy === 0) return "Cw90";
  if (dx === 0 && dy === 1) return "Cw180";
  return "Cw270";
}

/** What the settler knows for the intentions' preferences: the land and the water it stands on. */
function settlerView(h: Uint8Array, W: number, H: number, hy: Hydro, D: ArrayLike<number>, C: ArrayLike<number>, M: ArrayLike<number>): SettlerView {
  const N = W * H;
  const joinT = new Uint8Array(N);
  for (const r of hy.rivers) {
    if (!("river" in r.params.exit)) continue;
    const p = r.params.path[r.params.path.length - 1];
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) joinT[y * W + x] = 1;
  }
  const fallT = new Uint8Array(N);
  for (const f of fallsOf(h, D, W, H, 1.5)) fallT[f.i] = 1;
  const sorted = Array.from(h).sort((a, b) => a - b);
  // clean bodies of 60+ tiles, their surface and what a 9-day drought leaves
  const kept = droughtStorage(waterModel(W, H, h, []), D, 9);
  const lab = new Int32Array(N).fill(-1);
  const lakes: SettlerView["lakes"] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || !(D[s0] >= 0.1) || !(C[s0] < 0.05)) continue;
    const q = [s0];
    lab[s0] = lakes.length;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] >= 0 || !(D[j] >= 0.1) || !(C[j] < 0.05)) continue;
        lab[j] = lakes.length;
        q.push(j);
      }
    }
    let surf = 0;
    let v = 0;
    let kv = 0;
    for (const i of q) {
      surf = Math.max(surf, h[i] + D[i]);
      v += D[i];
      kv += kept[i];
    }
    lakes.push({ tiles: q.length >= 60 ? q : [], surface: surf, keep9: v > 0 ? kv / v : 0 });
  }
  // farmland patches and gorges
  const farm = new Uint8Array(N);
  for (let i = 0; i < N; i++) farm[i] = M[i] > 0 && !(D[i] > 0.05) && C[i] < 0.05 ? 1 : 0;
  const flab = new Int32Array(N).fill(-1);
  const farms: SettlerView["farms"] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!farm[s0] || flab[s0] >= 0) continue;
    const q = [s0];
    flab[s0] = 1;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      cx += x;
      cy += y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (flab[j] >= 0 || !farm[j] || Math.abs(h[j] - h[i]) > 1) continue;
        flab[j] = 1;
        q.push(j);
      }
    }
    if (q.length >= 400) farms.push({ size: q.length, cx: cx / q.length, cy: cy / q.length });
  }
  const gorge = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(D[i] >= 0.1)) continue;
      const s = h[i] + D[i];
      let sides = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        for (let r = 1; r <= 3; r++) {
          const xx = x + dx * r;
          const yy = y + dy * r;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          if (h[yy * W + xx] >= s + 2) {
            sides++;
            break;
          }
        }
      if (sides >= 2) gorge[i] = 1;
    }
  return { W, H, h, dJoin: distanceFrom(joinT, W, H), dFall: distanceFrom(fallT, W, H), lakes, farms, gorge, p75: sorted[Math.floor(0.75 * (N - 1))] };
}

/** The finished map as the intention checks read it. */
export function finalCtx(b: BuildResult, hy: Pick<Hydro, "rivers">): FinalCtx {
  const { W, H } = b;
  const start = b.start ?? { x: 0, y: 0, z: 0 };
  const objs = b.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation }));
  const joins: number[] = [];
  for (const r of hy.rivers) {
    if (!("river" in r.params.exit)) continue;
    const p = r.params.path[r.params.path.length - 1];
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) joins.push(y * W + x);
  }
  return {
    W,
    H,
    h: b.heights,
    D: b.water,
    C: b.contamination,
    moist: b.moisture,
    start: { x: start.x, y: start.y, z: start.z },
    walk: reachWalk(b.heights, W, H, objs, start),
    kept9: droughtStorage(b.waterModel, b.water, 9),
    objects: objs,
    falls: fallsOf(b.heights, b.water, W, H, 1.5),
    joins,
    rivers: hy.rivers.map((r) => r.params.path.map((p) => [p[0], p[1]] as [number, number])),
  };
}

function whyNot(b: BuildResult, pick: StartPick, rule: number): string {
  const d = shoreWalkFrom(b.heights, b.W, b.H, b.water, b.contamination, rule);
  let w = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w = Math.min(w, d[(pick.y + dy) * b.W + pick.x + dx]);
  let wet = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (b.water[(pick.y + dy) * b.W + pick.x + dx] > 0.001) wet++;
  return `walk ${w} (planned ${Math.round(pick.shoreWalk)}), ${wet} wet tiles in the ring`;
}

/** The start still walks to a pump shore within the rule (Kyler's rule, rules.ts), with a margin
 *  for the slopes and objects the finished build adds. */
function startWaterOk(b: BuildResult, pick: StartPick, rule: number): boolean {
  const w = startWaterWalk(b.heights, b.water, b.contamination, b.W, b.H, b.entities, pick).distance;
  // and the start's ring stays dry
  let wet = false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (b.water[(pick.y + dy) * b.W + pick.x + dx] > 0.001) wet = true;
  return w <= rule - 2 && !wet;
}

export { INTENTIONS };
