// Generation (M9a; docs/m9-design.md): terrain and water from processes, then everything else found
// in them, then the one build pipeline, the validators and the writer.
//
// 1. The genome is drawn from the theme's prior, or from Any's (D208, D209), and the player's
//    settings lean it (land/genome.ts).
// 2. The processes make the land: uplift, caprock, erosion, weathering, levels with benches
//    (land/field.ts, land/levels.ts), then the rivers from its drainage with their lakes, falls,
//    splits and deltas, meandering within their valleys (land/hydro.ts), and natural ramps.
// 3. Everything else is found on that land: the badwater hollows, planned before the one settle from
//    where the start will likely be (land/hazards.ts); the start, chosen on the settled water
//    (gen/settler.ts); the map objects and the resources, on the shared baselines (gen/extras.ts,
//    gen/resources.ts, resources/baseline.ts).
// 4. The field the processes made is stored in the document (format 3); the build starts from it,
//    so rebuilding never runs the processes again. The rivers and hollows read back from it are its
//    features: they describe the field, place its sources, and are what the analysis reads.
// 5. The validators judge the map in the `generate` profile; the generator also refuses a map whose
//    channels run ruler-straight (D209). Water storage near the start is preferred, never required
//    (D209, #67). Intentions are checked on the finished map, re-steered once, or dropped (D138).
//
// No dam wall is built and no terrain is added to make a dam site (D111); nothing is stamped. A
// failed attempt whose land was fine is planned again on the same field before a new genome is
// drawn; a genome that has cost many settles is replaced (the time budget, counted in settles so
// the map is the same on every machine).

import { sourcesInFlow } from "../analysis/sources";
import { straightness, tooStraight } from "../analysis/straight";
import { entityJson } from "../format/entities";
import { mapObjects, type MapObject } from "../sim/model";
import { placementOf } from "../format/entities";
import type { JsonObject } from "../format/json";
import { pumpShoreDistance, reachAt, startWaterShore, walkDistance } from "../analysis/walk";
import type { FieldData } from "../doc/document";
import { buildMap, SettleCache, type BuildResult, type GeneratedField, type LockedLayer } from "../features/build";
import { entityTiles } from "../features/edits";
import { featureId } from "../features/ids";
import { objectTiles } from "../features/objects";
import type { Feature, MapObjectFeature, StartFeature } from "../features/schema";
import { slopeHighSide } from "../format/footprints";
import { writeTimber, type TimberFile } from "../format/timber";
import { makeField } from "../land/field";
import { BED_FLOOR, drawGenome, leanGenome, type Genome } from "../land/genome";
import { planBadwater, type Hazards } from "../land/hazards";
import { blockedCourses, closeBackEdges, sealedMouths } from "../land/courses";
import { mouthTilesOf } from "../features/raster/terrain";
import { edgeLip, LIP_REACH } from "../water/edgeLip";
import { orientationOf, orientDir, orientField } from "../land/orient";
import { planHydro, type Hydro } from "../land/hydro";
import { ACTIVE, type IntentionId } from "../land/intentions";
import { carveOutlets, widenOutlets, unreachedLakes, cleanPitsAndSpikes, fillDryHollows, footComponents, mergeSmallRegions, naturalRamps, relaxEdges, snapLevels } from "../land/levels";
import { distanceFrom } from "../math/grid";
import { hash32 } from "../math/hash";
import { stream } from "../math/rng";
import { droughtStorage } from "../sim/drought";
import { waterModel } from "../sim/model";
import { moisture } from "../sim/moisture";
import { AVAILABLE_THEMES, type MapSpec } from "../spec/mapspec";
import { assertSpec } from "../spec/schema";
import { terrainColumns, terrainData } from "../terrain/runs";
import { validateMap, type Validation } from "../validate/checks";
import { WALK_BLOCKERS, type PlayabilityAnalysis } from "../validate/playability";
import { blocks, type ValidationReport } from "../validate/report";
import { walkRegions } from "../analysis/regions";
import { planSetPiece } from "../features/setpieces";
import { BEHIND_CUT, CLOSE_DISTRICT, districtCandidates, neckCut, planExtras, riseSpots, riseStands } from "./extras";
import { DISTRICT_RADIUS } from "../features/setpieces/secondDistrict";
import { lakeFeatures } from "./readback";
import { planWeir } from "./weir";
import { planPlug } from "./plug";
import { badwaterBudget } from "../resources/badwater";
import { finalChecks, foundIntention, settlerView, type IntentionResult } from "./intentions";
import { toTimberFile } from "./pack";
import { outcomesOf, type Outcomes } from "./outcomes";
import { mapWords, type PlayFacts } from "./names";
import { nearStartTargets, planResources } from "./resources";
import { DROUGHT, REACH_MIN, RESERVE, reservoirNeeded, RUIN_HEIGHT_SHARES } from "./calibrated";
import { ruinColumns } from "../resources/baseline";
import { tilesToRuns } from "../math/grid";
import { obstacleTiles, type ObstaclePlan } from "../features/setpieces/obstaclePayoff";
import type { SetPieceFeature } from "../features/schema";
import { pickStart, type DroughtPolicy, type StartPick } from "./settler";

export type { IntentionResult };

/** Attempts before the last one is kept whatever it is (16 since batch 5, D325: with item 47's
 *  must-haves a few seeds pass only after 12; the first map that passes is returned at once). */
export const MAX_ATTEMPTS = 16;
/** Plans on one field before a new genome is drawn. */
const REPLANS = 2;
/** Settles one genome may cost before a new genome is drawn (the time budget, design §13). */
const SETTLE_BUDGET = 5;
/** The first Normal drought's days for the drought-aware start (investigation/cycles: 2 in the
 *  game's schedule, after a day of ramp-down). */
export const FIRST_DROUGHT_DAYS = 3;
/** Moist land within 20 tiles' walk the settler asks for (food and wood grow there, D85). */
const MOIST_WALK = 160;

/** Regeneration constraints (PLAN §7.0): tiles the plan keeps off (the player's features, locked
 *  and keep-out regions), the player's features, and what a regeneration keeps under locks. */
export interface PlanContext {
  protect: Uint8Array | null;
  features: readonly Feature[];
  locked: LockedLayer | null;
}

export interface GenerationInfo {
  /** Genomes drawn; the accepted map's genome. */
  genomes: number;
  genome: Genome | null;
  /** Settles run for the whole map. */
  settles: number;
  /** Rivers, lakes, falls, splits and deltas the hydrology planned. */
  hydro: { rivers: number; lakes: number; falls: number; splits: number; deltas: number } | null;
  start: StartPick | null;
  /** Badwater hollows planned (D200). */
  badwater: number;
  ramps: { cut: number; leftToStairs: number };
  /** The longest straight channel bank and canal (D209). */
  straight: { run: number; canal: number } | null;
  /** Water storage near the start (preferred, #67). */
  storage: boolean | null;
  /** The start's water stays pumpable through the first Normal drought (#59). */
  startDrought: boolean | null;
  stage: string;
}

export interface GenerateResult {
  spec: MapSpec;
  features: Feature[];
  built: BuildResult;
  report: ValidationReport;
  /** What the playability checks measured (reach, dam sites, distances) for the map card. */
  analysis: PlayabilityAnalysis | null;
  bytes: Uint8Array;
  /** The file `bytes` was written from (for the project file's stored base). */
  file: TimberFile;
  attempts: number;
  /** Each failed attempt: why, and when it ended (ms from the call; information only). */
  failures: { attempt: number; failed: string[]; ms?: number }[];
  /** The land the processes made, as the document stores it (format 3); a map that failed its
   *  checks keeps its field too, for the record. */
  field: FieldData | null;
  /** The intentions the map was steered toward, and whether each emerged (D138). */
  intentions: IntentionResult[];
  info: GenerationInfo;
  /** What the map was chosen by (D273, D278): its water story, its theme's promise, its standout. */
  outcomes?: Outcomes;
  /** Its name, and a line on how it plays (D278 (1b); gen/names.ts). */
  name?: string;
  description?: string;
  /** Milliseconds from the call: the first look (land and planned water), the first settled
   *  water, the finished map. Information only: nothing depends on them. */
  timings: { firstLook: number; firstWater: number; final: number };
}

export interface GenerateOptions {
  maxAttempts?: number;
  /** Progress: the attempt and its stage (land, water, start, objects, resources, check). */
  onProgress?: (p: { attempt: number; stage: string }) => void;
  /** The first look: each attempt's land and its planned water (channels 1, lakes 2, floors 3), as
   *  soon as they exist. */
  onLand?: (l: { attempt: number; heights: Uint8Array; water: Uint8Array }) => void;
  /** Regeneration constraints (PLAN §7.0). */
  context?: PlanContext | null;
  /** Steering (D138, M12): these intentions instead of the drawn ones; [] for none. */
  intentions?: IntentionId[] | null;
  /** The map, as soon as it passed (D329: the first candidate that passes the absolutes is the map,
   *  shown at once and never swapped; its outcomes say whether a background search for a version
   *  that meets all three is worth starting, gen/versions.ts). */
  onCandidate?: (c: { attempt: number; candidate: number; of: number; result: GenerateResult; outcomes: Outcomes }) => void;
  /** The drought-aware start (#59): by default Easy requires water that lasts the first drought,
   *  Normal and Hard prefer it. */
  drought?: DroughtPolicy;
  /** Variety (vy, 0–100; M9b makes it a setting): how far the genome strays from its theme's
   *  ranges. For the contact sheet only: a share link does not carry it. */
  variety?: number;
}

/** The species mix the settings panel starts from: a map that keeps it takes the woods its genome
 *  draws (D164); a mix the player chose wins. */
const DEFAULT_MIX = { pine: 47, birch: 27, oak: 20, succulent: 6 };

function specFor(specIn: MapSpec, g: Genome, attempt: number): MapSpec {
  const spec = JSON.parse(JSON.stringify(specIn)) as MapSpec;
  spec.accepted = { attempt, candidate: 0 };
  const mix = spec.settings.resources.speciesMix;
  if (mix.pine === DEFAULT_MIX.pine && mix.birch === DEFAULT_MIX.birch && mix.oak === DEFAULT_MIX.oak && mix.succulent === DEFAULT_MIX.succulent) {
    spec.settings.resources.speciesMix = { pine: g.woods.pine, birch: g.woods.birch, oak: g.woods.oak, succulent: g.woods.succulent };
  }
  return spec;
}

interface Land {
  g: Genome;
  E: Float64Array;
  h0: Uint8Array;
  /** Settles this genome has cost. */
  settles: number;
}

interface Attempt {
  result: GenerateResult;
  passed: boolean;
  /** The failure leaves the land usable: plan again on the same field. */
  replannable: boolean;
}

export function generate(specIn: MapSpec, opts: GenerateOptions = {}): GenerateResult {
  assertSpec(specIn);
  if (!AVAILABLE_THEMES.includes(specIn.theme)) throw new Error(`the ${specIn.theme} theme is not available yet`);
  if (specIn.colonies.count !== 1 || specIn.colonies.mod !== "none") throw new Error("multi-colony (Timber Together) maps are not built yet (PLAN §20, D5)");
  const t0 = performance.now();
  const W = specIn.size.x;
  const H = specIn.size.y;
  const seed = specIn.seed;
  const failures: GenerateResult["failures"] = [];
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  let last: Attempt | null = null;
  let land: Land | null = null;
  let genomes = 0;
  let replans = 0;
  let settles = 0;
  // D329 (Kyler, amending D278 (1a) and D325's reading of item 22): the first candidate that passes
  // the absolutes (plays exactly right, the starting-logs floor, item 47's must-haves: the blocking
  // checks) is the map, shown at once and never swapped. Its outcomes (a readable water story, the
  // theme's promise, a standout intention; gen/outcomes.ts) are measured for the page: a miss that
  // matters starts a background search for a version that meets all three (gen/versions.ts), never
  // held before the map is shown. Water storage near the start stays a preference of the settler.
  for (let attempt = 0; attempt < max; attempt++) {
    if (!land || !last?.replannable || replans >= REPLANS || land.settles >= SETTLE_BUDGET) {
      opts.onProgress?.({ attempt, stage: "land" });
      // (Variety is a setting since M9b; Another like this draws a sibling, keeping its intentions)
      const keep = opts.intentions !== undefined ? opts.intentions : specIn.intentions?.length ? (specIn.intentions.filter((id) => (ACTIVE as readonly string[]).includes(id)) as IntentionId[]) : undefined;
      const g = drawGenome(specIn.theme, seed, W, H, genomes, { vt: specIn.settings.terrain.verticality, intentions: keep, variety: opts.variety ?? specIn.settings.terrain.variety, ...(specIn.variation ? { variation: specIn.variation } : {}) });
      leanGenome(g, specIn.settings, W, H, seed, genomes, specIn.designedFor);
      genomes++;
      replans = 0;
      const F = makeField(g, seed, W, H);
      // M9b (D275 (2)): the land turned or mirrored into one of its orientations, and the water's
      // way with it; everything after is found on the turned land
      const o = orientationOf(seed, genomes - 1, W, H);
      g.orientation = o;
      g.flowDir = orientDir(g.flowDir, o);
      const E = orientField(F.E, W, H, o);
      land = { g, E, h0: snapLevels(E, g, seed, W, H), settles: 0 };
    } else replans++;
    const a = attemptOnce(specIn, land, attempt, opts, t0);
    land.settles += a.result.info.settles;
    settles += a.result.info.settles;
    a.result.info.genomes = genomes;
    a.result.info.settles = settles;
    a.result.attempts = attempt + 1;
    a.result.failures = failures;
    last = a;
    if (a.passed) {
      const o = outcomesOf(a.result);
      a.result.outcomes = o;
      // its name and how it plays (D278 (1b)), from its standout and what the map holds
      const said = a.result.intentions.find((x) => x.ok && x.id === o.standout)?.say;
      const words = mapWords({ seed, theme: specIn.theme, standout: o.standout, signature: o.signature, seaLayout: a.result.info.genome?.seaLayout ?? null, facts: playFacts(a.result), ...(said ? { say: said } : {}) });
      a.result.name = words.name;
      a.result.description = words.description;
      // Sources: None (D330): the map as generated, then its sources and their water removed
      if (specIn.settings.water.sources === "none") {
        const dry = withoutSources(a.result);
        a.result.built = dry.built;
        a.result.file = dry.file;
        a.result.bytes = dry.bytes;
        a.result.report = dry.report;
        a.result.analysis = dry.analysis;
        a.result.field = dry.field;
      }
      opts.onCandidate?.({ attempt, candidate: 1, of: 1, result: a.result, outcomes: o });
      return a.result;
    }
    failures.push({ attempt, failed: failedIds(a.result), ms: Math.round(performance.now() - t0) });
  }
  const out = last!.result;
  out.attempts = max;
  return out;
}

/** What the finished map says about how it plays, for its description (gen/names.ts). */
function playFacts(r: GenerateResult): PlayFacts {
  const b = r.built;
  const { W, H } = b;
  let badwater: PlayFacts["badwater"] = null;
  if (b.start) {
    let best = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (!(b.soilContamination[i] > 0 || (b.water[i] > 0.05 && b.contamination[i] >= 0.05))) continue;
      const x = i % W;
      const y = (i - x) / W;
      const d = Math.sqrt((x - b.start.x) ** 2 + (y - b.start.y) ** 2);
      if (d < best) {
        best = d;
        badwater = { x, y, distance: d };
      }
    }
  }
  const dam = r.analysis?.bestDam ?? null;
  return {
    W,
    H,
    start: b.start ? { x: b.start.x, y: b.start.y } : null,
    startDrought: r.info.startDrought,
    bestDam: dam ? { x: dam.x, y: dam.y, volume: dam.volume, length: dam.length } : null,
    badwater,
    woods: r.info.genome?.woods.kind ?? null,
  };
}

/** Why an attempt failed: the stage it stopped at (no map was planned), else the blocking checks. */
function failedIds(r: GenerateResult): string[] {
  const s = r.info.stage;
  if (s !== "built" && s !== "checks" && s !== "ruler-straight channel" && s !== "above 16") return [s];
  const ids = r.report.checks.filter((c) => blocks("generate", c)).map((c) => c.id);
  if (s === "ruler-straight channel") ids.push("water.straight_channel");
  if (s === "above 16") ids.push("terrain.max_height");
  return ids;
}

/** The ramps' steps that still stand as cut: the high tile one level up, the tile behind the low
 *  one level with it. */
function standingSteps(steps: readonly [number, number][], h: Uint8Array, W: number, H: number): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  for (const [lo, hi] of steps) {
    if (seen.has(lo)) continue;
    const x = lo % W;
    const y = (lo - x) / W;
    const bx = 2 * x - (hi % W);
    const by = 2 * y - Math.floor(hi / W);
    if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
    if (h[hi] !== h[lo] + 1 || h[by * W + bx] !== h[lo]) continue;
    seen.add(lo);
    out.push([lo, hi]);
  }
  return out;
}

/** The water the hydrology planned, before any settle: each river's channel at the depth its flow
 *  keeps in its width (0.44 deep at 0.82 blocks/s per tile of width, D26), lakes to just above
 *  their outlet. */
export function plannedWater(h: Uint8Array, hy: Hydro, W: number, H: number): Float64Array {
  const N = W * H;
  const D = new Float64Array(N);
  const lakeOf = new Int32Array(N).fill(-1);
  hy.lakes.forEach((lk, k) => {
    for (const i of lk.tiles) lakeOf[i] = k;
  });
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

/** D171: a planned spring inside a planned lake, or within 1.5 tiles of another river's course (a
 *  river that joined it at its head would put the spring inside that river's flow). The core check
 *  (`water.source_in_flow`) judges the built map; this turns such a hydrology down before a settle. */
function springsInFlow(hy: Hydro, W: number): number {
  const lake = new Set<number>();
  for (const lk of hy.lakes) for (const i of lk.tiles) lake.add(i);
  let bad = 0;
  hy.rivers.forEach((r, k) => {
    const e = r.params.entry;
    if (!("spring" in e)) return;
    const [sx, sy] = e.spring;
    if (lake.has(Math.round(sy) * W + Math.round(sx))) {
      bad++;
      return;
    }
    if (hy.rivers.some((o, m) => m !== k && o.params.path.some(([x, y]) => (x - sx) * (x - sx) + (y - sy) * (y - sy) <= 2.25))) bad++;
  });
  return bad;
}

/** Walking from the start over the map's own slopes, round the objects that block walking. */
function startWalk(b: BuildResult, wetBlocks: boolean): Float64Array | null {
  if (!b.start) return null;
  const { W, H } = b;
  const blocked = new Uint8Array(W * H);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (e.template === "Slope") {
      const [dx, dy] = slopeHighSide(e.orientation);
      const hx = e.x + dx;
      const hy = e.y + dy;
      if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
      continue;
    }
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  if (wetBlocks) for (let i = 0; i < W * H; i++) if (b.water[i] > 0.05) blocked[i] = 1;
  return walkDistance(b.heights, W, H, blocked, links, b.start, wetBlocks ? 4 * (W + H) : undefined);
}

/** The start's water by the core rule (D153): the walk over the map's own slopes to a shore a pump
 *  reaches, on `depth` (the settled water, or what a drought leaves of it). */
function startWaterWalk(b: BuildResult, depth: ArrayLike<number> = b.water): number {
  const d = startWalk(b, false);
  if (!d) return Infinity;
  const walk = new Float64Array(b.W * b.H);
  for (let i = 0; i < walk.length; i++) walk[i] = reachAt(d, b.W, b.H, i);
  return pumpShoreDistance(walk, b.heights, b.W, b.H, depth, b.contamination).distance;
}

/** The start's water by the rule with Kyler's D302 (`start.water`): only water a running source
 *  feeds, or a lake that lasts the rule's drought (`days`) within its walk, counts; never a sealed
 *  puddle. */
function startWaterServed(b: BuildResult, within: number, days: number): number {
  const d = startWalk(b, false);
  if (!d) return Infinity;
  const walk = new Float64Array(b.W * b.H);
  for (let i = 0; i < walk.length; i++) walk[i] = reachAt(d, b.W, b.H, i);
  return startWaterShore(walk, b.heights, b.W, b.H, b.water, b.contamination, b.waterModel.emitters, droughtStorage(b.waterModel, b.water, days), within).distance;
}

/** Tiles the colony walks to from the start (the objects must not cut the start off). */
function startWalkable(b: BuildResult): number {
  const d = startWalk(b, true);
  if (!d) return 0;
  let n = 0;
  for (let i = 0; i < d.length; i++) if (Number.isFinite(d[i])) n++;
  return n;
}

/** Whether the colony walks to (x, y) from the start over the map's ground and slopes, round the
 *  objects that block walking (debris among them), however far. */
function startWalksTo(b: BuildResult, x: number, y: number): boolean {
  if (!b.start) return false;
  const { W, H } = b;
  const blocked = new Uint8Array(W * H);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (e.template === "Slope") {
      const [dx, dy] = slopeHighSide(e.orientation);
      const hx = e.x + dx;
      const hy = e.y + dy;
      if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
      continue;
    }
    if (WALK_BLOCKERS.has(e.template)) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) blocked[ty * W + tx] = 1;
  }
  return Number.isFinite(walkDistance(b.heights, W, H, blocked, links, b.start, 4 * (W + H))[y * W + x]);
}

/** The walk regions of the built map (same level, and the built slopes). */
function walkLabels(b: BuildResult): Int32Array {
  const { W, H } = b;
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  return walkRegions(b.heights, W, H, null, links);
}

/** Whether (x, y) is on ground the colony walks to from the start (same level, and the built slopes). */
function walkableFromStart(b: BuildResult, x: number, y: number): boolean {
  if (!b.start) return false;
  const { W, H } = b;
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, null, links);
  const root = labels[b.start.y * W + b.start.x];
  return root >= 0 && root === labels[y * W + x];
}

function orMask(a: Uint8Array | null, b: Uint8Array): Uint8Array {
  if (!a) return b;
  const out = a.slice();
  for (let i = 0; i < out.length; i++) if (b[i]) out[i] = 1;
  return out;
}

/** The features whose sources stand where another source's water comes down to them (D171). */
function sourcesInFlowOwners(b: BuildResult): Set<string> {
  const objects: MapObject[] = [];
  const owners: string[] = [];
  for (const e of b.entities) {
    const j = entityJson(e);
    const p = placementOf(j);
    if (!p) continue;
    objects.push({ ...p, components: j.Components as JsonObject });
    owners.push(e.owner);
  }
  return new Set(sourcesInFlow(b.waterModel, objects, b.water).inFlow.map((k) => owners[k]));
}

/** The edge tiles beside each inflow's mouth, 10 tiles either side of its channel, two rows deep. */
function mouthBanks(hy: Hydro, W: number, H: number): Uint8Array {
  const keep = new Uint8Array(W * H);
  for (const r of hy.rivers) {
    if (!("edge" in r.params.entry)) continue;
    const [px, py] = r.params.path[Math.min(1, r.params.path.length - 1)];
    const reach = Math.ceil(r.params.width / 2) + 10;
    for (let t = 0; t < 2; t++)
      for (let d = -reach; d <= reach; d++) {
        const e = r.params.entry.edge;
        const x = e === "west" ? t : e === "east" ? W - 1 - t : Math.round(px) + d;
        const y = e === "south" ? t : e === "north" ? H - 1 - t : Math.round(py) + d;
        if (x >= 0 && y >= 0 && x < W && y < H) keep[y * W + x] = 1;
      }
  }
  return keep;
}

/** The start's 5×5 stays dry. */
function wetRing(b: BuildResult, p: StartPick): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (b.water[(p.y + dy) * b.W + p.x + dx] > 0.001) return true;
  return false;
}

function attemptOnce(specIn: MapSpec, land: Land, attempt: number, opts: GenerateOptions, t0: number): Attempt {
  const g = land.g;
  const spec = specFor(specIn, g, attempt);
  // the spec the result carries: the player's, with the attempt accepted (the genome's tree species
  // plan the groves, but never show up in the settings or the share link)
  const shown: MapSpec = JSON.parse(JSON.stringify(specIn)) as MapSpec;
  shown.accepted = spec.accepted;
  const W = spec.size.x;
  const H = spec.size.y;
  const N = W * H;
  const seed = spec.seed;
  const rule = spec.settings.start.rules.waterWithin;
  // the rule's drought, which a start's unfed water must last (D302; `start.water`)
  const droughtDays = DROUGHT[spec.designedFor].days;
  const ctx = opts.context ?? null;
  const protect = ctx?.protect ?? null;
  const policy: DroughtPolicy = opts.drought ?? (spec.designedFor === "easy" ? "require" : "prefer");
  const h = land.h0.slice();
  // what a regeneration keeps under locks stands as it was; the water finds its way round it
  if (ctx?.locked) for (let i = 0; i < N; i++) if (ctx.locked.mask[i]) h[i] = ctx.locked.heights[i];
  // no edge walls: the land runs on past the edge, before the water is planned and after the
  // channels are cut (D151)
  relaxEdges(h, W, H);
  opts.onProgress?.({ attempt, stage: "water" });
  const hy = planHydro(land.E, h, g, seed, W, H, attempt, { protect });
  // (M9b: the banks beside an inflow's mouth stay as the land has them: lowered to its channel, the
  // water would run out along the edge beside the mouth instead of down its course)
  relaxEdges(h, W, H, mouthBanks(hy, W, H));
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) keep[i] = hy.water[i] === 1 || hy.water[i] === 2 || ctx?.locked?.mask[i] ? 1 : 0;
  mergeSmallRegions(h, W, H, 4, keep);
  cleanPitsAndSpikes(h, W, H, keep);
  fillDryHollows(h, W, H, keep);
  const ramps = naturalRamps(h, W, H, keep, protect ?? new Uint8Array(N), g, seed, attempt);
  if (ramps.cut) {
    cleanPitsAndSpikes(h, W, H, keep);
    fillDryHollows(h, W, H, keep);
  }
  // a lake no river runs into any more (the land changed after the hydrology found it) would fill
  // only by seeping over a bank, for days: it is filled as the dry hollows are
  const heads = hy.rivers.map((r) => {
    const [px, py] = "spring" in r.params.entry ? r.params.entry.spring : r.params.path[0];
    return Math.min(H - 1, Math.max(0, Math.round(py))) * W + Math.min(W - 1, Math.max(0, Math.round(px)));
  });
  // a river's mouth on the map edge holds its sources, which are not outlets (its row, D314)
  const sealed = sealedMouths(hy.rivers, W, H);
  const dry = unreachedLakes(h, W, H, heads, hy.lakes, sealed);
  if (dry.length) {
    for (const k of dry)
      for (const i of hy.lakes[k].tiles)
        if (hy.water[i] === 2 && !ctx?.locked?.mask[i]) {
          keep[i] = 0;
          hy.water[i] = 0;
        }
    fillDryHollows(h, W, H, keep);
    const gone = new Set(dry);
    hy.lakes = hy.lakes.filter((_, k) => !gone.has(k));
  }
  // broad basins whose spill level is a wide flat (a sea's shelf) get a winding outlet channel a
  // level below it, so their water leaves as a river does instead of a sheet over the flat, which
  // takes days to settle; the channel is as wide as the map's flow needs
  const channels = new Uint8Array(N);
  for (let i = 0; i < N; i++) channels[i] = hy.water[i] === 1 || ctx?.locked?.mask[i] ? 1 : 0;
  carveOutlets(h, W, H, channels, hash32(seed, "outlets", attempt), Math.max(3, Math.min(9, Math.round(0.35 * hy.flowTotal)) | 1));
  // a sea's way out as wide as its water needs, so it settles within the four days (the rivers'
  // heads, the kept lakes and the locks stay as they are)
  {
    const heads = new Uint8Array(N);
    for (const r of hy.rivers) {
      const [px, py] = "spring" in r.params.entry ? r.params.entry.spring : r.params.path[0];
      const cx = Math.round(px);
      const cy = Math.round(py);
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < W && cy + dy < H) heads[(cy + dy) * W + cx + dx] = 1;
    }
    for (let i = 0; i < N; i++) if (ctx?.locked?.mask[i] || hy.water[i] === 2) heads[i] = 1;
    widenOutlets(h, W, H, heads, hash32(seed, "widen", attempt), hy.flowTotal, hy.lakes.map((l) => l.tiles));
  }
  // (item 47: nothing the processes cut goes below the beds' floor; where one would, it runs
  // shallower there)
  for (let i = 0; i < N; i++) if (h[i] < BED_FLOOR && !ctx?.locked?.mask[i]) h[i] = BED_FLOOR;
  // item 27: a river that starts at the map's edge flows into the map, never off it: the edge tiles
  // its head's water would reach beside its row (a lake's shore at the edge too) stand a level above
  // that water (a natural lip, water/edgeLip.ts); the mouths themselves and the player's ground stay
  {
    const est = plannedWater(h, hy, W, H);
    const keep = new Uint8Array(N);
    for (let i = 0; i < N; i++) keep[i] = ctx?.locked?.mask[i] || protect?.[i] ? 1 : 0;
    const rows = hy.rivers.map((r) => mouthTilesOf(r, W, H));
    for (const row of rows) for (const i of row) keep[i] = 1;
    for (const row of rows) {
      if (!row.length) continue;
      // (the head's water: its channel's and any lake's it backs into, within the lip's reach)
      let surface = -Infinity;
      const seen = new Set<number>(row);
      const q = row.slice();
      for (let k = 0; k < q.length; k++) {
        const c = q[k];
        surface = Math.max(surface, h[c] + est[c]);
        const x = c % W;
        const y = (c - x) / W;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (seen.has(n) || !(hy.water[n] === 1 || hy.water[n] === 2)) continue;
          if (!row.some((r0) => Math.max(Math.abs((r0 % W) - nx), Math.abs(Math.floor(r0 / W) - ny)) <= LIP_REACH)) continue;
          seen.add(n);
          q.push(n);
        }
      }
      edgeLip(h, W, H, { row, surface, keep });
    }
  }
  // the courses checked on the finished land (M9b, D273 (1)): an inflow's water running back out by
  // its own edge is held by a lip on the edge row (up to two levels, four where the player set the
  // Rivers count, whose mouths may lie low on their edge); anything else is planned again below
  const mouthArms = hy.arms.filter((a) => a.kind === "mouth").map((a) => a.path);
  let blocked = blockedCourses(h, W, H, hy.rivers, mouthArms);
  for (let k = 0; k < 3 && blocked.some((b) => b.back) && closeBackEdges(h, W, H, blocked, hy.rivers, g.hydro.exactInflows ? 4 : 2); k++) blocked = blockedCourses(h, W, H, hy.rivers, mouthArms);
  const hLand = h.slice();
  const firstLook = Math.round(performance.now() - t0);
  opts.onLand?.({ attempt, heights: hLand, water: hy.water });
  const info: GenerationInfo = {
    genomes: 0,
    genome: g,
    settles: 0,
    hydro: { rivers: hy.rivers.length, lakes: hy.lakes.length, falls: hy.falls.length, splits: hy.arms.filter((a) => a.kind === "split").length, deltas: hy.arms.filter((a) => a.kind === "mouth").length },
    start: null,
    badwater: 0,
    ramps: { cut: ramps.cut, leftToStairs: ramps.leftToStairs },
    straight: null,
    storage: null,
    startDrought: null,
    stage: "planned",
  };
  const cache = new SettleCache();
  const contains = new Set<string>(hy.rivers.map((r) => r.id));
  let settleKey: unknown = null;
  const fieldOf = (): GeneratedField => {
    const steps = standingSteps(ramps.steps, h, W, H);
    return { heights: h.slice(), contains: new Set(contains), ...(steps.length ? { ramps: steps } : {}), ...(g.tall ? { top: Math.ceil(g.top) } : {}) };
  };
  const build = (features: readonly Feature[], stop: "resources" | "water" | null): BuildResult => {
    const b = buildMap({ W, H, seed, features, field: fieldOf(), locked: ctx?.locked ?? null }, { settleCache: cache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });
    if (stop === "water") return b;
    if (b.settle.depth !== settleKey) {
      settleKey = b.settle.depth;
      info.settles++;
    }
    return b;
  };
  // the natural lakes read back from the field (they describe it, never shape it)
  const lakes = lakeFeatures(hy, W, H, seed);
  for (const f of lakes) contains.add(f.id);
  // the pre-built weir (D72), on half the maps where a river's channel takes one; the start and the
  // badwater keep off its pool
  const weir = planWeir(h, W, H, hy, seed, attempt, protect);
  const pool = new Uint8Array(N);
  if (weir) for (const i of weir.pool) pool[i] = 1;
  // M9b ("a plug holds back a lake", D274): on a map steered toward it, a plug across a big lake's
  // way out; the start and the badwater keep off it and its lake
  const plug = g.plugLake ? planPlug(h, W, H, hy, seed, protect) : null;
  if (plug) for (const i of plug.pool) pool[i] = 1;
  let rivers: Feature[] = [...hy.rivers, ...lakes, ...(weir ? [weir.feature] : []), ...(plug ? [plug.feature] : []), ...(ctx?.features ?? [])];
  const fail = (stage: string, b: BuildResult | null, replannable: boolean): Attempt => {
    info.stage = stage;
    // (an attempt refused before its water settled keeps only its land for the record, unless it is
    // the last attempt, whose map is kept when none passes: a settle there would be spent for nothing)
    if (!b && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) {
      const land = build(rivers, "water");
      return {
        passed: false,
        replannable,
        result: { spec: shown, features: [...rivers], built: land, report: { profile: "generate", checks: [], passed: false }, analysis: null, bytes: new Uint8Array(), file: toTimberFile(spec, land), attempts: attempt + 1, failures: [], field: fieldData(fieldOf()), intentions: [], info, timings: { firstLook, firstWater: -1, final: Math.round(performance.now() - t0) } },
      };
    }
    const built = b ?? build(rivers, null);
    const file = toTimberFile(spec, built);
    const v = validateMap(file, { profile: "generate", spec, features: rivers, water: { model: built.waterModel, settled: built.settle } });
    return {
      passed: false,
      replannable,
      result: { spec: shown, features: [...rivers], built, report: { ...v.report, passed: false }, analysis: v.analysis, bytes: new Uint8Array(), file, attempts: attempt + 1, failures: [], field: fieldData(fieldOf()), intentions: [], info, timings: { firstLook, firstWater: -1, final: Math.round(performance.now() - t0) } },
    };
  };
  if (!hy.rivers.length) return fail("no rivers", null, false);
  // M9b (D273 (1)): every river's water runs its whole course; a plan where it would spill out
  // before the end (by a lower way beside a lake, or by the edge beside its own mouth, and the rest
  // of its course stood dry) is planned again (the course check runs before the first look)
  if (blocked.length && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) return fail("a river's water leaves its course", null, true);
  // the Rivers setting's count, when the player set one: land that holds fewer is drawn again
  // (not on the last attempt, whose map is kept when none passes)
  if (g.hydro.exactInflows && hy.rivers.filter((r) => "edge" in r.params.entry).length < g.hydro.inflows && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) return fail("rivers", null, false);
  // D171: every source starts a river; a hydrology that puts one inside a flow is planned again
  if (springsInFlow(hy, W)) return fail("source in a flow", null, true);
  let foot = footComponents(h, W, H, keep);
  // the start's ground joins at least Buildable land's walkable land (PLAN §5.2), and more is
  // preferred up to twice it
  const reachMin = REACH_MIN[spec.settings.terrain.buildableLand];
  const minFoot = Math.round(Math.max(Math.min(1200, reachMin), 0.12 * N));
  const footWant = 2 * reachMin;
  const room = { small: 400, normal: 900, large: 1600 }[spec.settings.start.area];
  const bench = { small: 79, normal: 113, large: 180 }[spec.settings.start.area];
  const avoidOf = (bad: Hazards | null) => {
    const a = new Uint8Array(N);
    for (let i = 0; i < N; i++) a[i] = (bad?.avoid[i] ?? 0) || ramps.tiles[i] || pool[i] || (protect?.[i] ?? 0) ? 1 : 0;
    return a;
  };
  // ---- the settler: on the water the hydrology planned (its guess), or on the settled water
  const settlerOn = (D: ArrayLike<number>, C: ArrayLike<number>, M: ArrayLike<number>, salt: number, avoid: Uint8Array | null, weight = 1, near: { x: number; y: number } | null = null): StartPick | null => {
    const model = waterModel(W, H, h, []);
    const kept = policy === "off" ? null : droughtStorage(model, D, FIRST_DROUGHT_DAYS);
    const storage = { kept: droughtStorage(model, D, DROUGHT[spec.designedFor].days), want: reservoirNeeded(spec.designedFor) * RESERVE[spec.settings.water.droughtReserve] };
    const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M) : null;
    const prefer = view ? (x: number, y: number, L: number, w: number) => weight * Math.max(...g.intentions.map((id) => view.prefer(id, x, y, L, w))) : null;
    const rng = stream(seed, "settler2", attempt, salt);
    return pickStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, g.settler, rng, rule, { avoid, kept, drought: policy, prefer, foot, minFoot, footWant, moistWalk: { min: MOIST_WALK }, room, bench, storage, near });
  };
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
  // badwater on every map, unless No badwater (D200): as many sources as the official maps have for
  // the size, each about as strong (resources/badwater.ts `badwaterBudget`, moved by the seed and
  // scaled by the Badwater setting), each in a hollow of its own
  const budget = badwaterBudget(W, H, spec.settings.hazards.badwater, seed);
  const badAsk = {
    count: g.hazards.badwater === "none" ? 0 : Math.max(1, budget.sources),
    strength: budget.strength > 0 ? budget.strength : Math.round(Math.min(2, Math.max(1, g.hazards.ratio * 0.65 * hy.flowTotal)) * 100) / 100,
    distance: Math.max(spec.settings.hazards.badwaterDistance, spec.settings.start.rules.badwaterWithin),
    keepOff: weir ? orMask(protect, pool) : protect,
  };
  const noBad: Hazards = { count: 0, features: [], avoid: new Uint8Array(N), heights: h };
  const badAt = (D: ArrayLike<number>, start: { x: number; y: number }, salt: number): Hazards => {
    const bad = planBadwater(h, W, H, D, hy, badAsk, seed, attempt * 4 + salt, start);
    if (bad.features.length) {
      h.set(bad.heights);
      for (const f of bad.features) contains.add(f.id);
    }
    return bad;
  };
  // ---- the badwater hollows, planned before the settle: away from where the start will likely be
  //      (the settler run on the water the hydrology planned), so one settle serves both
  let bad: Hazards = noBad;
  let guess: StartPick | null = null;
  if (badAsk.count > 0) {
    const est = plannedWater(h, hy, W, H);
    const zero = new Float64Array(N);
    guess = settlerOn(est, zero, moisture(h, est, zero, W, H, null), 0, avoidOf(null));
    if (guess) bad = badAt(est, guess, 0);
  }
  opts.onProgress?.({ attempt, stage: "start" });
  // ---- the one settle: the rivers and the hollows
  let b1 = build([...rivers, ...bad.features], "resources");
  // water that is still changing after the settle's four days fails the map (water.settles): it is
  // the field's (a broad flat at a basin's spill level fills for days), so the next attempt draws
  // a new genome instead of planning again on this field (not on the last attempt, whose map is
  // kept when none passes)
  const lastAttempt = attempt >= (opts.maxAttempts ?? MAX_ATTEMPTS) - 1;
  if (!b1.settle.settled && !lastAttempt) return fail("water.settles", b1, false);
  // D171: a source that another source's water reaches fails the map (water.source_in_flow). A
  // spring-fed river whose spring is reached leaves the map (its valley stays, dry; a river that
  // joined it now joins where it went), and a badwater hollow that is reached is planned again
  // elsewhere; the water is settled once more. A river's mouth on the edge that is reached, or
  // what still fails, is planned again (the check at the end).
  for (let round = 0; round < 2 && !lastAttempt; round++) {
    const owners = sourcesInFlowOwners(b1);
    if (!owners.size) break;
    const springs = hy.rivers.filter((r) => owners.has(r.id) && "spring" in r.params.entry);
    const badHit = bad.features.some((f) => owners.has(f.id));
    if ([...owners].some((id) => !springs.some((r) => r.id === id) && !bad.features.some((f) => f.id === id))) break;
    if (springs.length) {
      const dropped = new Set(springs.map((r) => r.id));
      for (const r of springs) {
        for (const o of hy.rivers) if ("river" in o.params.exit && o.params.exit.river === r.id) o.params.exit = { ...r.params.exit };
        contains.delete(r.id);
      }
      hy.rivers = hy.rivers.filter((r) => !dropped.has(r.id));
      for (const f of lakes) {
        f.params.inflow = { rivers: ("rivers" in f.params.inflow ? f.params.inflow.rivers : []).filter((id) => !dropped.has(id)) };
        if (f.params.outlet.target && dropped.has(f.params.outlet.target)) f.params.outlet = { at: f.params.outlet.at, sill: f.params.outlet.sill, to: "none" };
      }
      rivers = rivers.filter((f) => !dropped.has(f.id));
    }
    if (badHit && guess) {
      // (off the hollow that was reached, and round it)
      const keepOff = orMask(badAsk.keepOff ?? null, bad.avoid);
      h.set(hLand);
      for (const f of bad.features) contains.delete(f.id);
      const again = planBadwater(h, W, H, b1.water, hy, { ...badAsk, keepOff }, seed, attempt * 4 + 3 + round, guess);
      bad = noBad;
      if (again.features.length) {
        h.set(again.heights);
        for (const f of again.features) contains.add(f.id);
        bad = again;
      }
    }
    b1 = build([...rivers, ...bad.features], "resources");
    if (!b1.settle.settled) return fail("water.settles", b1, false);
  }
  // ---- the start on the settled water, clear of the hollows and, where it can be, beyond the
  //      badwater distance from their water and soil (start.badwater: a target the settler aims for)
  const badWithin = spec.settings.start.rules.badwaterWithin;
  const beyondBad = (b: BuildResult): Uint8Array => {
    const m = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++)
      if (b.soilContamination[i] > 0 || (b.water[i] > 0.05 && b.contamination[i] >= 0.05)) {
        m[i] = 1;
        any = true;
      }
    const out = avoidOf(bad);
    if (!any) return out;
    const d = distanceFrom(m, W, H);
    // (the start's 3×3 middle: its footprint's nearest tile is a tile or two nearer)
    for (let i = 0; i < N; i++) if (d[i] < badWithin + 2) out[i] = 1;
    return out;
  };
  // (near the guess the hollows were planned from, so they keep the distance the settings ask for)
  const near = bad.features.length ? guess : null;
  // the land the start's ground joins, on the settled water and the ground as it now stands (a
  // floodplain's water or a hollow cuts the planned land apart: item 47, a start on a strip of land
  // cut off by water and cliffs reaches neither its mine sites nor room to grow)
  const footOf = (b: BuildResult) => {
    const wetNow = new Uint8Array(N);
    for (let i = 0; i < N; i++) wetNow[i] = b.water[i] > 0.05 ? 1 : 0;
    return footComponents(h, W, H, wetNow);
  };
  foot = footOf(b1);
  let pick = settlerOn(b1.water, b1.contamination, b1.moisture, 1, beyondBad(b1), 1, near) ?? settlerOn(b1.water, b1.contamination, b1.moisture, 1, avoidOf(bad), 1, near);
  if (!pick && bad.features.length) {
    // the hollow took the only good place for a start: the start first, then the hollow
    h.set(hLand);
    for (const f of bad.features) contains.delete(f.id);
    bad = noBad;
    b1 = build([...rivers], "resources");
    foot = footOf(b1);
    pick = settlerOn(b1.water, b1.contamination, b1.moisture, 2, avoidOf(null));
    if (pick && badAsk.count > 0) bad = badAt(b1.water, pick, 1);
  }
  if (!pick) return fail("no start", b1, true);
  // the hollows' badwater (their water and the soil it soaks, down to where their ditches end) came
  // within the badwater distance of the start (the start stands away from the guess they were
  // planned from: the settled water moved the good places): plan them again from the start as it
  // is, once. (D329, item 47: badwater farther than the distance asks is kept; its pits lean toward
  // short ditches, and planning again for it cost a settle on most 256² maps)
  if (bad.features.length && !lastAttempt) {
    const near = beyondBad(b1);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) if (near[(pick.y + dy) * W + pick.x + dx] && !avoidOf(bad)[(pick.y + dy) * W + pick.x + dx]) hit = true;
    if (hit) {
      const keepOff = orMask(badAsk.keepOff ?? null, bad.avoid);
      h.set(hLand);
      for (const f of bad.features) contains.delete(f.id);
      const again = planBadwater(h, W, H, b1.water, hy, { ...badAsk, keepOff }, seed, attempt * 4 + 2, pick);
      if (again.features.length) {
        h.set(again.heights);
        for (const f of again.features) contains.add(f.id);
        bad = again;
        b1 = build([...rivers, ...bad.features], "resources");
        if (!b1.settle.settled) return fail("water.settles", b1, false);
      } else {
        h.set(bad.heights);
        for (const f of bad.features) contains.add(f.id);
      }
    }
  }
  // a hollow planned from the real start, when the guess found none
  if (badAsk.count > 0 && !bad.features.length) bad = badAt(b1.water, pick, 2);
  levelStart(pick);
  let layout: Feature[] = [...rivers, ...bad.features, startOf(pick)];
  // a start on level ground and no new hollow keep the water: this build reuses the settle
  let base = build(layout, "resources");
  if (!(startWaterServed(base, rule, droughtDays) <= rule - 2) || wetRing(base, pick))
    // (the water beside the start only a sealed puddle, D302, or the water moved away)
    return fail(startWaterWalk(base) <= rule - 2 && !wetRing(base, pick) ? "start water a sealed puddle" : "start water moved", base, true);
  if (badAsk.count > 0 && !bad.features.length) return fail("no place for badwater", base, true);
  // D171: a source inside a flow fails the map (water.source_in_flow, blocking here); the objects and
  // resources change no water, so it is found on this settle and the field planned again at once
  // (not on the last attempt, whose map is the one kept when none passes)
  if (!lastAttempt && sourcesInFlow(base.waterModel, mapObjects({ entities: base.entities.map(entityJson) }), base.water).inFlow.length) return fail("water.source_in_flow", base, true);
  const firstWater = Math.round(performance.now() - t0);
  info.start = pick;
  info.badwater = bad.count;
  // ---- map objects and resources on the one settle (their builds reuse it)
  opts.onProgress?.({ attempt, stage: "objects" });
  const avoid = avoidOf(bad);
  const walked = startWalkable(base);
  const objects = planExtras({ spec, base, features: layout, protect, avoid, candidate: 0, attempt, relicHigh: !!g.relicHigh });
  if (objects.length) {
    let b2 = build([...layout, ...objects], "resources");
    const own = (f: MapObjectFeature) => objectTiles(f, W, H).length;
    const kept = objects.slice();
    const total = () => kept.reduce((a, f) => a + own(f), 0);
    while (kept.length && startWalkable(b2) < walked - total() - 40) {
      kept.sort((a, c) => (a.params.kind === "thornBelt" ? 0 : 1) - (c.params.kind === "thornBelt" ? 0 : 1) || own(c) - own(a));
      kept.shift();
      b2 = build([...layout, ...kept], "resources");
    }
    layout.push(...kept);
    base = b2;
  }
  // ---- a second district's site (PLAN §9.8, maps of 128² and up): level land 60–120 tiles out
  //      with its own water, found on the land (it changes no terrain), joined to the start's
  //      ground by the derived slopes; groves and bushes grow round it
  const sites: { x: number; y: number }[] = [];
  // (item 47's intention, a second district close to the start behind a small obstacle: a site
  // 40–70 tiles out on level ground the colony walks up to by a few ramps, debris at their tops,
  // the second district and the obstacle with a payoff combined; else the usual site)
  const bands = g.districtBehind ? [CLOSE_DISTRICT, null] : [null];
  if ((N >= 128 * 128 || g.districtBehind) && base.start)
    for (const band of bands) {
      if (sites.length || (!band && N < 128 * 128)) break;
      // (a close site on ground the colony walks to from the start: the debris then cuts that walk)
      let onWalk: ((i: number) => boolean) | null = null;
      if (band) {
        const lab = walkLabels(base);
        const root = lab[base.start!.y * W + base.start!.x];
        onWalk = (i) => lab[i] === root;
      }
      for (const [x, y] of districtCandidates(base, layout, avoid, band ? 8 : 4, band ?? undefined, onWalk)) {
        const role = "setpiece/secondDistrict/primary";
        const pctx = { W, H, seed, features: layout, heights: base.heights, channel: base.channel, water: base.water, contamination: base.contamination, start: { x: base.start!.x, y: base.start!.y, radius: 4 } };
        const r = planSetPiece("secondDistrict", { at: [x, y] }, pctx, { id: featureId(seed, "setPiece", role), origin: "generated", role }, true);
        if (!r.ok) continue;
        let b2 = build([...layout, r.feature], "resources");
        if (!walkableFromStart(b2, x, y)) continue;
        const extra: Feature[] = [r.feature];
        if (band) {
          // the debris: a Blockage across the narrowest way from the start to the site (a pass, the
          // top of its ramps), nearest the site; the site then stands out of the colony's walk until
          // it is cleared
          const ends = neckCut(b2, x, y, BEHIND_CUT, DISTRICT_RADIUS + 2);
          if (!ends) continue;
          const drole = "mapObject/plug/districtDebris";
          const debris: MapObjectFeature = { id: featureId(seed, "mapObject", drole), kind: "mapObject", origin: "generated", role: drole, locked: false, params: { kind: "plug", placement: { area: tilesToRuns(ends, W) } } };
          const b3 = build([...layout, r.feature, debris], "resources");
          if (startWalksTo(b3, x, y)) continue;
          extra.push(debris);
          b2 = b3;
        }
        layout.push(...extra);
        base = b2;
        sites.push({ x, y });
        break;
      }
    }
  // ---- ruins on a natural rise (PLAN §9.4, found on the land and never raised: stairs-only ground
  //      is a reward): a ruin field on level ground one flight of player stairs above the colony's
  const keepOff = new Uint8Array(N);
  for (let i = 0; i < N; i++) keepOff[i] = bad.avoid[i] || (protect?.[i] ?? 0) ? 1 : 0;
  let scrapPlaced = 0;
  const rise: Feature[] = [];
  let risePlan: ObstaclePlan | null = null;
  {
    const radius = N >= 128 * 128 ? 4 : 3;
    const spots = riseSpots(base, layout, avoid, radius, 1, nearStartTargets(spec).ruinsClear, Math.ceil(g.top));
    for (const [x, y, top, riseBy] of spots) {
      const role = "setpiece/obstaclePayoff/ruins";
      const plan: ObstaclePlan = { x, y, radius, top, rise: riseBy };
      const disc = obstacleTiles(plan, W, H);
      const piece: SetPieceFeature = {
        id: featureId(seed, "setPiece", role),
        kind: "setPiece",
        origin: "generated",
        role,
        locked: false,
        params: { kind: "obstaclePayoff", request: { at: [x, y], radius, rise: Math.max(2, riseBy) }, plan: plan as unknown as SetPieceFeature["params"]["plan"], report: [`ruins on a rise ${disc.length} tiles wide at level ${top}, ${riseBy} above the ground beside it: reaching them takes player stairs`] },
      };
      // the field holds the rise already: the piece marks it and cuts nothing
      contains.add(piece.id);
      // a reward worth the climb: a field of the taller kind (resources/baseline.ts)
      const fr = "ruinField/obstacle";
      const fid = featureId(seed, "ruinField", fr);
      const tallness = 0.5;
      scrapPlaced = ruinColumns(disc, W, stream(seed, fid, "heights"), tallness).scrap;
      rise.push(piece, { id: fid, kind: "ruinField", origin: "generated", role: fr, locked: false, params: { area: tilesToRuns(disc, W), scrapTarget: scrapPlaced, heightMix: [...RUIN_HEIGHT_SHARES], centerBias: 0, layout: { tallness } } });
      for (const i of obstacleTiles({ x, y, radius: radius + 3 }, W, H)) keepOff[i] = 1;
      layout.push(piece);
      risePlan = plan;
    }
  }
  opts.onProgress?.({ attempt, stage: "resources" });
  const lockedMask = ctx?.locked?.mask ?? null;
  const resources = [...rise.filter((f) => f.kind === "ruinField"), ...planResources(spec, base, 0, attempt, { protect: keepOff, lockedMask, scrapPlaced }, sites)];
  let features = [...layout, ...resources];
  let built = build(features, null);
  opts.onProgress?.({ attempt, stage: "check" });
  let file = toTimberFile(spec, built);
  let v: Validation = validateMap(file, { profile: "generate", spec, features, water: { model: built.waterModel, settled: built.settle } });
  // ---- intentions: checked on the finished map; a start intention is re-steered once (D138)
  let intentions: IntentionResult[] = [];
  if (v.report.passed && g.intentions.length) {
    intentions = finalChecks(g.intentions, built, hy, () => {
      const p3 = settlerOn(built.water, built.contamination, built.moisture, 4, avoid, 3);
      if (!p3 || p3.levelled || (p3.x === pick!.x && p3.y === pick!.y)) return null;
      const lay3 = [...layout.filter((f) => f.kind !== "start"), startOf(p3)];
      const b3 = build(lay3, "resources");
      if (!(startWaterServed(b3, rule, droughtDays) <= rule - 2) || wetRing(b3, p3)) return null;
      // the second district keeps its distance and its walk from the start, the rise its stairs
      for (const st of sites) {
        const d = Math.sqrt((st.x - p3.x) * (st.x - p3.x) + (st.y - p3.y) * (st.y - p3.y));
        if (d < 60 || d > 120 || !walkableFromStart(b3, st.x, st.y)) return null;
      }
      if (risePlan && !riseStands(b3, risePlan.x, risePlan.y, risePlan.radius, risePlan.top, risePlan.rise)) return null;
      const r3 = [...rise.filter((f) => f.kind === "ruinField"), ...planResources(spec, b3, 0, attempt, { protect: keepOff, lockedMask, scrapPlaced }, sites)];
      const f3 = [...lay3, ...r3];
      const bb = build(f3, null);
      const file3 = toTimberFile(spec, bb);
      const v3 = validateMap(file3, { profile: "generate", spec, features: f3, water: { model: bb.waterModel, settled: bb.settle } });
      if (!v3.report.passed) return null;
      return {
        built: bb,
        commit: () => {
          pick = p3;
          layout = lay3;
          features = f3;
          built = bb;
          file = file3;
          v = v3;
        },
      };
    });
  }
  // (none emerged: one the map shows of its own accord stands for its character, M9b)
  if (v.report.passed && !intentions.some((x) => x.ok)) {
    const found = foundIntention(built, hy, g.intentions, stream(seed, "found-intention", attempt));
    if (found) intentions = [...intentions, found];
  }
  info.start = pick;
  // ---- the drought-aware start on the real water (information: the settler chose by it)
  if (built.start) info.startDrought = startWaterWalk(built, droughtStorage(built.waterModel, built.water, FIRST_DROUGHT_DAYS)) <= rule;
  // ---- no ruler-straight channels (D209)
  const st = straightness(W, H, built.water);
  info.straight = { run: st.longest?.length ?? 0, canal: st.canal?.length ?? 0 };
  const straight = tooStraight(st);
  // ---- water storage near the start: preferred (#67)
  const storage = v.report.checks.find((c) => c.id === "water.storage_possible");
  info.storage = storage && storage.applicable !== false ? storage.ok : null;
  const tallOk = g.tall || maxOf(built.heights) <= 16;
  const passed = v.report.passed && !straight && tallOk;
  info.stage = !v.report.passed ? "checks" : straight ? "ruler-straight channel" : !tallOk ? "above 16" : "built";
  // the build keeps the field as the processes made it (a changed tile would mean the land was
  // not what was planned: never plan again on it)
  const same = sameBytes(built.heights, h);
  const bytes = passed ? writeTimber(file) : new Uint8Array();
  return {
    passed,
    // (a map that passed without storage near the start may be planned again on its field, for one)
    replannable: same && (!passed || info.storage === false || !(Math.max(v.analysis?.storage?.dam ?? 0, v.analysis?.storage?.natural ?? 0) >= (v.analysis?.storage?.need ?? 0))),
    result: {
      spec: shown,
      features,
      built,
      report: passed ? v.report : { ...v.report, passed: false },
      analysis: v.analysis,
      bytes,
      file,
      attempts: attempt + 1,
      failures: [],
      field: fieldData(fieldOf()),
      intentions,
      info,
      timings: { firstLook, firstWater, final: Math.round(performance.now() - t0) },
    },
  };
}

/** Sources: None (D330, the UI brief §8): a generated map without its sources and their water. The
 *  build places none of the features' sources (the field's `dry`), keeping the valleys, basins and
 *  pits they carved, and plants the trees and bushes where the soil was moist as generated, so they
 *  stay as generated. Its water checks say "No water source" as information. */
export function withoutSources(r: GenerateResult): Pick<GenerateResult, "built" | "file" | "bytes" | "report" | "analysis" | "field"> {
  const { W, H } = r.built;
  const N = W * H;
  const moist = new Uint8Array(N);
  const poisoned = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    moist[i] = r.built.moisture[i] > 0 ? 1 : 0;
    poisoned[i] = r.built.soilContamination[i] > 0 ? 1 : 0;
  }
  const fd = r.field!;
  const ramps: [number, number][] = [];
  for (let k = 0; k + 1 < (fd.ramps ?? []).length; k += 2) ramps.push([fd.ramps![k], fd.ramps![k + 1]]);
  const field: GeneratedField = { heights: terrainColumns(fd, N).heights, contains: new Set(fd.contains), ...(ramps.length ? { ramps } : {}), ...(fd.top !== undefined ? { top: fd.top } : {}), dry: { moist, poisoned } };
  const built = buildMap({ W, H, seed: r.spec.seed, features: r.features, field });
  const file = toTimberFile(r.spec, built);
  const v = validateMap(file, { profile: "generate", spec: r.spec, features: r.features, water: { model: built.waterModel, settled: built.settle } });
  return { built, file, bytes: v.report.passed ? writeTimber(file) : new Uint8Array(), report: v.report, analysis: v.analysis, field: fieldData(field, W) };
}

/** A generation's field as the document stores it (format 3). */
export function fieldData(f: GeneratedField, W = Math.round(Math.sqrt(f.heights.length))): FieldData {
  const out: FieldData = { ...terrainData(f.heights), contains: [...f.contains].sort() };
  if (f.ramps?.length) out.ramps = f.ramps.flatMap(([a, b]) => [a, b]);
  if (f.top !== undefined) out.top = f.top;
  if (f.dry) {
    const tiles = (m: Uint8Array) => {
      const t: number[] = [];
      for (let i = 0; i < m.length; i++) if (m[i]) t.push(i);
      return t;
    };
    out.dry = { moist: tilesToRuns(tiles(f.dry.moist), W), poisoned: tilesToRuns(tiles(f.dry.poisoned), W) };
  }
  return out;
}

function maxOf(h: Uint8Array): number {
  let m = 0;
  for (const v of h) if (v > m) m = v;
  return m;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Validate a built map in the generate profile, on the build's own canonical settle. */
export function validateBuilt(spec: MapSpec, features: readonly Feature[], built: BuildResult, file = toTimberFile(spec, built)): Validation {
  return validateMap(file, { profile: "generate", spec, features, water: { model: built.waterModel, settled: built.settle } });
}

/** Rebuild a saved generation's map: the same pure path the generator's download takes (PLAN
 *  §19.7), from its field and features, so the bytes are identical. */
export function rebuild(spec: MapSpec, features: Feature[], field: GeneratedField | null = null): { built: BuildResult; bytes: Uint8Array; report: ValidationReport } {
  const built = buildMap({ W: spec.size.x, H: spec.size.y, seed: spec.seed, features, ...(field ? { field } : {}) });
  const file = toTimberFile(spec, built);
  return { built, bytes: writeTimber(file), report: validateBuilt(spec, features, built, file).report };
}
