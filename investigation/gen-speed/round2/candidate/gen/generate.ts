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
import { STRAIGHT_LIMITS, straightness, tooStraight } from "../analysis/straight";
import { damWalls } from "../analysis/ridge";
import { risenBasin, wearOutlet } from "../water/outletWear";
import { WaterSim } from "../sim/water";
import { prefill, spillLevels } from "../sim/prefill";
import { standIslandsClear } from "../land/islands";
import { entityJson } from "../format/entities";
import { mapObjects, type MapObject } from "../sim/model";
import { placementOf } from "../format/entities";
import type { JsonObject } from "../format/json";
import { pumpShoreDistance, reachAt, startWaterShore, walkDistance } from "../analysis/walk";
import type { FieldData } from "../doc/document";
import { buildMap, SettleCache, type BuildResult, type GeneratedField, type LockedLayer } from "../features/build";
import { previewSettle } from "../sim/preview";
import type { FieldCache } from "../features/target";
import { entityTiles } from "../features/edits";
import { featureId } from "../features/ids";
import { objectTiles } from "../features/objects";
import type { Feature, MapObjectFeature, RiverFeature, StartFeature } from "../features/schema";
import { slopeHighSide } from "../format/footprints";
import { writeTimber, type TimberFile } from "../format/timber";
import { drainage } from "../land/drainage";
import { EDGE_SHARE, edgeRuleApplies, edgeWalls } from "../analysis/edges";
import { enableIslandPrototype, islandPrototypeEnabled, islandStage, islandStartAvoid } from "../land/archipelago";
import { deltaBadwaterKeep, deltaField, deltaHydro } from "../land/delta";
import { lakeRise, shallowSheet, SHEET_MOST } from "../land/sheets";
import { FIRM, mineRoom, minePads, mineSquares, mineWays, roomMap, type MinePad } from "../land/minePads";
import { makeField } from "../land/field";
import { BED_FLOOR, drawGenome, leanGenome, type Genome } from "../land/genome";
import { planBadwater, type Hazards } from "../land/hazards";
import { blockedCourses, closeBackEdges, closeSideEdges, drownedHeads, sealedMouths } from "../land/courses";
import { mouthTilesOf } from "../features/raster/terrain";
import { edgeLip, LIP_REACH } from "../water/edgeLip";
import { orientationOf, orientDir, orientField, orientXY, type Orientation as LandOrientation } from "../land/orient";
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
import { bandScale, colonyReach, MINE_LO, MINE_REACH_LO, minesReached, minesWanted, rulesFor, WALK_BLOCKERS, WET, type PlayabilityAnalysis } from "../validate/playability";
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
import { outcomesOf, PLAN_MARGIN, PROMISES, type Outcomes } from "./outcomes";
import { mapWords, type PlayFacts } from "./names";
import { nearStartTargets, planResources } from "./resources";
import { DROUGHT, REACH_MIN, RESERVE, reservoirNeeded, RUIN_HEIGHT_SHARES } from "./calibrated";
import { ruinColumns } from "../resources/baseline";
import { tilesToRuns } from "../math/grid";
import { obstacleTiles, type ObstaclePlan } from "../features/setpieces/obstaclePayoff";
import type { SetPieceFeature } from "../features/schema";
import { dryStart, padFloods, pickStart, prepareStart, type DroughtPolicy, type StartPick } from "./settler";

export type { IntentionResult };

/** Attempts before the last one is kept whatever it is (16 since batch 5, D325: with item 47's
 *  must-haves a few seeds pass only after 12; 24 since D333, whose land stage refuses a land with no
 *  start before its settle, a cheap attempt, and whose kept land takes a second; the first map that
 *  passes is returned at once). */
export const MAX_ATTEMPTS = 24;
/** Places tried for the badwater hollows before the land is shown, each off the last that another's
 *  water reached (D348: they are never dug again after). */
const HOLLOW_TRIES = 3;
/** Places for a start prepared before the land is shown past the plan's start and its second place
 *  (D373 (3)): their pads levelled as the land is shaped, so a start on the shown land needs none. */
const PREPARED_MORE = 2;
/** Whether a land whose water would stand as a shallow sheet over a flat is drawn again (D372).
 *  Off: read on the land and the planned water, the sheet the two Canyon 256² maps flood (seeds 14 and
 *  22) does not show (their water rises over the plan's level where the outlets cannot pass the
 *  inflow), and the reading at the rivers' bed level marked 67 maps at 96² that settle; the reading
 *  is recorded (`info.sheet`) until the rule reads what floods. */
const SHEET_REJECT = false;
/** Lands drawn again before one is shown that don't use up the attempts (up to this many): a small
 *  or rugged map draws many lands before one has room for its start and its mine sites (D363), and
 *  the land it shows keeps the attempts it needs. A land draw costs no settle. */
export const FREE_DRAWS = 16;
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
  /** Lands shown (D333 (2), D348): always 1 once a land is shown, since the first land shown is the
   *  map (0 when none passed the land stage). */
  lands?: number;
  /** The automatic fixes made on the shown land after its water settled (D348): "start from the
   *  plan" (no place for a start on the settled water: the start goes where the plan put it), "start
   *  on dry ground", "spring by the start" (a group of sources in a hollow or dry bed by the start,
   *  D330's fix), "gentler rivers" (water over the flood line), "way out worn wider" (D350 (b)). */
  fixes?: string[];
  /** The way out worn wider (D350 (b), D360 (3)): the tiles cut, the basin's size and its level, the
   *  width worn and the path its water takes out. */
  worn?: { cut: number[]; basin: number; level: number; width: number; route: number[] };
  /** Mine-site pads levelled as the land was shaped (D363): each pad's middle, level and the tiles
   *  taken down a level. */
  pads?: MinePad[];
  /** The largest shallow sheet the shown land's planned lakes would stand as, a share of the map
   *  (D372's reading; its rule is off). */
  sheet?: number;
  /** The planned lakes' longest rise to their outlets' level (D373 (2)), a reading. */
  rise?: number;
  /** The longest straight bank and canal of the planned lakes alone, before the land is shown, a
   *  reading (Canyon 128² seed 16: a lake along a straight trough, its bank broken on the plan by
   *  the channels that join it, which settle shallow). */
  lakeStraight?: { run: number; canal: number };
  /** Dam walls on the pre-fill's water alone, its water under 0.1, 0.2 and 0.3 deep left out, before
   *  the land is shown (the plan counts a lake its own river drains as full, and hides the lake's old
   *  bed standing beside the channel: Any 96² seed 18, Lake Basin 128² seed 5). A land with one at
   *  0.2 is drawn again; the other two are readings. */
  fillWalls?: number[];
  /** The share of the map under the planned water or the pre-fill before the land is shown, a
   *  reading (River Valley 96² seed 1: 36% settled, over the cap, on a land already shown). */
  preWet?: number;
  /** The shown land's outcomes read on the water its rivers were planned with (the theme's promise,
   *  a readable water story), before its water settled: what the land-stage screen judged. */
  planned?: { promise: boolean; water: boolean };
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
  /** Each attempt as it ends, passed or failed (information, for the measures). */
  onAttempt?: (a: { attempt: number; passed: boolean; result: GenerateResult }) => void;
  /** A land needs a second place for a start, away from the first, before it is shown; false turns
   *  it off (for measuring it). */
  secondStart?: boolean;
  /** The land-stage screen on the planned water's outcomes (`landScreen`); false turns it off (for
   *  the measures). */
  screen?: boolean;
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
  /** The land, when the attempt passed the land stage (D333 (2)). */
  stage: LandStage | null;
  /** On a shown land, a failure no new plan on it can mend (its rivers' water alone does not
   *  settle): the attempts stop there (D348: the land is never replaced). */
  stuck?: boolean;
}

/** What the land stage planned, copied afresh for each attempt on it. */
interface StageBundle {
  hy: Hydro;
  lakes: ReturnType<typeof lakeFeatures>;
  weir: ReturnType<typeof planWeir>;
  plug: ReturnType<typeof planPlug>;
}

/** A land that passed the land stage (D333 (2), D348): the map from here on, shown at once as
 *  editable land and never replaced. Its water, start, badwater and objects are planned again on it
 *  until an attempt passes; new land is never drawn after it is shown. */
interface LandStage {
  hLand: Uint8Array;
  bundle: StageBundle;
  keep: Uint8Array;
  ramps: ReturnType<typeof naturalRamps>;
  firstLook: number;
  cache: SettleCache;
  /** River path fields shared by the builds on it. */
  fields: FieldCache;
  /** The mine sites' squares and a margin round them, and the colony's ways to them (D363): the
   *  hollows keep off them where they find room. */
  mineKeep: Uint8Array;
  mineWay: Uint8Array;
  /** The mine sites' pads levelled as it was shaped (D363). */
  pads?: MinePad[];
  /** The places for a start whose pads were made ready as it was shaped (D373 (3)): a start on it
   *  is one of these when the settled water gives none that needs no levelling. */
  prepared: StartPick[];
  /** Its rivers' largest sheet over a flat, a share of the map (D372). */
  sheet?: number;
  /** Its planned lakes' longest rise to their outlets' level (D373 (2)). */
  rise?: number;
  lakeStraight?: { run: number; canal: number };
  preWet?: number;
  fillWalls?: number[];
  /** The settles counted on it (the settle cache hands later attempts the ones they share). */
  counted: WeakSet<object>;
  /** Where the starts of the attempts that failed on it stood (and round them): kept off. */
  tried: Uint8Array;
  /** Attempts on it whose water did not settle. */
  unsettled: number;
  /** Rivers that left it (their sources reached by another's water): gone on every attempt on it. */
  dropped: string[];
  /** Sources fed stronger on it (a lake that fell, D350): their flows, kept on every later attempt. */
  fed: Record<string, number>;
  /** Springs added on it (a lake nothing fed): kept on every later attempt. */
  springs: RiverFeature[];
  /** Its badwater hollows, dug as it was shaped, before it was shown (D348): every attempt on it
   *  keeps them as they are. */
  hollows: Omit<Hazards, "heights"> | null;
}

/** Lands at most drawn again before one is shown because, read on the water its rivers were planned
 *  with, it misses the theme's promise or a readable water story (D333 (3): first maps meeting all
 *  three outcomes): fewer on larger maps, whose land stage takes longer (time to land, D333 (2)). */
export function landScreen(W: number, H: number): number {
  const N = W * H;
  return N <= 128 * 128 ? 6 : N <= 192 * 192 ? 4 : 3;
}
/** How far round a start that failed the next attempt on the same land keeps off, from 128² up;
 *  less on smaller maps, as the distance bands shrink (`bandScale`): at 96² a disc of 16 took a
 *  tenth of the map a start, and three failed starts left a shown land no place for one (D363's
 *  measures). */
const TRIED_RADIUS = 16;
/** Marks a start that failed on a shown land, and the ground round it, for the next attempts on it
 *  to keep off. */
function markTried(tried: Uint8Array, st: { x: number; y: number }, W: number, H: number): void {
  const R = Math.max(6, Math.round(TRIED_RADIUS * bandScale(W, H)));
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = st.x + dx;
      const y = st.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= R * R) tried[y * W + x] = 1;
    }
}

/** Places tried for a spring by the start (each settles the map once; D330's fix, D348), and its
 *  strength (doc/waterFix.ts `FIX_STRENGTH` runs 1.5 and 3; one strength keeps it to a settle a
 *  place). */
const SPRING_TRIES = 3;
/** Starts tried on one settled water before the attempt is planned again (each new plan settles
 *  the water again). */
const START_TRIES = 3;
/** The widths a stuck basin's way out is worn to, narrowest first (D350 (b); each settles once). */
const WEAR_WIDTHS = [9, 17];
/** The most tiles of a sea's planned water on ground at its own spill level (a shelf) before the
 *  land is drawn again (D358: such seas fill for more than six days; 256² Islands lands run 2,000 to
 *  19,000, the three over 13,000 needed a cut or didn't settle; 128² lands stay under 6,000). */
const SEA_SHELF_MOST = 10000;
/** The most tiles a worn way out may take (Kyler, D360: about 200). */
export const WEAR_MOST = 200;
const SPRING_STRENGTH = [2];

export function generate(specIn: MapSpec, opts: GenerateOptions = {}): GenerateResult {
  assertSpec(specIn);
  if (!AVAILABLE_THEMES.includes(specIn.theme)) throw new Error(`the ${specIn.theme} theme is not available yet`);
  if (specIn.colonies.count !== 1 || specIn.colonies.mod !== "none") throw new Error("multi-colony (Timber Together) maps are not built yet (PLAN §20, D5)");
  const t0 = performance.now();
  const W = specIn.size.x;
  const H = specIn.size.y;
  const seed = specIn.seed;
  const failures: GenerateResult["failures"] = [];
  let max = opts.maxAttempts ?? MAX_ATTEMPTS;
  let free = 0;
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
  // D333 (2), D348: the first land that passes the land stage (every check the land alone can judge)
  // is shown at once (the first look, editable land) and is the map: never replaced. What needs its
  // settled water is fixed on it (the start where the plan put it, a spring by the start) or planned
  // again on it (the start, the badwater, the objects), never by drawing new land.
  let committed: LandStage | null = null;
  let lands = 0;
  // (lands drawn again before one is shown because their planned water misses an outcome)
  const screened = { count: 0 };
  for (let attempt = 0; attempt < max; attempt++) {
    if (committed && land) {
      const a = attemptOnce(specIn, land, attempt, { ...opts, maxAttempts: max }, t0, committed, screened);
      const r = attemptDone(a, attempt);
      if (r) return r;
      if (a.stuck) break;
      continue;
    }
    if (!land || !(last as Attempt | null)?.replannable || replans >= REPLANS + (W >= 256 && specIn.theme === "lakeBasin" && (last as Attempt | null)?.result.info.stage === "a river's water leaves its course" ? 1 : 0) || land.settles >= SETTLE_BUDGET) {
      opts.onProgress?.({ attempt, stage: "land" });
      // (Variety is a setting since M9b; Another like this draws a sibling, keeping its intentions)
      const keep = opts.intentions !== undefined ? opts.intentions : specIn.intentions?.length ? (specIn.intentions.filter((id) => (ACTIVE as readonly string[]).includes(id)) as IntentionId[]) : undefined;
      const g = drawGenome(specIn.theme, seed, W, H, genomes, { vt: specIn.settings.terrain.verticality, intentions: keep, variety: opts.variety ?? specIn.settings.terrain.variety, ...(specIn.variation ? { variation: specIn.variation } : {}) });
      leanGenome(g, specIn.settings, W, H, seed, genomes, specIn.designedFor);
      // Reserve gorge depth in the initial plan.
      if (specIn.theme === "canyon" && W > 128) g.hydro.incise += 3;
      genomes++;
      replans = 0;
      // (Islands, Codex's sea-first prototype, D370: default Normal Islands draws its sea and islands
      // first, land/archipelago.ts; the general field is not needed then)
      // (Delta, Codex's alluvial plain and connected braids, D370: its own field)
      const F = !opts.context && enableIslandPrototype(g, specIn) ? { E: new Float64Array(W * H), hard: new Float64Array(W * H) } : specIn.theme === "delta" && !opts.context ? deltaField(g, seed, W, H) : makeField(g, seed, W, H);
      // M9b (D275 (2)): the land turned or mirrored into one of its orientations, and the water's
      // way with it; everything after is found on the turned land
      const o = orientationOf(seed, genomes - 1, W, H);
      g.orientation = o;
      g.flowDir = orientDir(g.flowDir, o);
      const E = orientField(F.E, W, H, o);
      land = { g, E, h0: snapLevels(E, g, seed, W, H), settles: 0 };
    } else replans++;
    const a = attemptOnce(specIn, land, attempt, { ...opts, maxAttempts: max }, t0, null, screened);
    if (a.stage) {
      committed = a.stage;
      lands++;
    }
    const r = attemptDone(a, attempt);
    if (r) return r;
    if (a.stuck) break;
    // (a land drawn again before it was shown leaves the attempts to the land that will be)
    if (!a.stage && opts.maxAttempts === undefined && free < FREE_DRAWS) {
      free++;
      max++;
    }
  }
  return (last as Attempt | null)!.result;

  /** An attempt's bookkeeping; the map when it passed. */
  function attemptDone(a: Attempt, attempt: number): GenerateResult | null {
    land!.settles += a.result.info.settles;
    settles += a.result.info.settles;
    a.result.info.genomes = genomes;
    a.result.info.settles = settles;
    a.result.attempts = attempt + 1;
    a.result.failures = failures;
    a.result.info.lands = lands;
    last = a;
    opts.onAttempt?.({ attempt, passed: a.passed, result: a.result });
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
    // (the next attempt on a shown land keeps off the start that failed, TRIED_RADIUS round it)
    // (only on a shown land: a land drawn again before it was shown builds nothing for its record)
    const st = committed && a.stage ? a.result.built.start : null;
    if (committed && st) markTried(committed.tried, st, W, H);
    return null;
  }
}

/** A lake's shelves (D333): the tiles of a lake the hydrology planned (its water 2) that stand at the
 *  level its water spills at (the priority flood from the map's edges), in 4-connected groups of
 *  SHELF_MIN tiles or more of one level (smaller ones cut changed the lakes by the start that the
 *  Drought reserve setting reads), off the locks and the protected tiles; each is cut a level
 *  lower, never below the beds' floor. Returns how many were cut. */
export const SHELF_MIN = 60;
function lowerShelves(h: Uint8Array, W: number, H: number, water: Uint8Array, locked: Uint8Array | null, protect: Uint8Array | null, seed = 0): number {
  const N = W * H;
  const spill = drainage(h, W, H, { eight: false }).filled;
  const shelf = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (water[i] === 2 && h[i] >= spill[i] && h[i] > BED_FLOOR && !locked?.[i] && !protect?.[i]) shelf[i] = 1;
  const seen = new Uint8Array(N);
  const q = new Int32Array(N);
  const cut: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!shelf[s0] || seen[s0]) continue;
    let tail = 0;
    q[tail++] = s0;
    seen[s0] = 1;
    for (let k = 0; k < tail; k++) {
      const t = q[k];
      const x = t % W;
      const y = (t - x) / W;
      for (let d = 0; d < 4; d++) {
        const xx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const yy = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (shelf[j] && !seen[j] && h[j] === h[t]) {
          seen[j] = 1;
          q[tail++] = j;
        }
      }
    }
    if (tail >= SHELF_MIN) for (let k = 0; k < tail; k++) cut.push(q[k]);
  }
  // (a shelf tile against higher ground outside the shelf keeps its level: cut, it would stand two
  // levels under that ground, a cliff at the lake's edge the land never had)
  const inCut = new Uint8Array(N);
  for (const i of cut) inCut[i] = 1;
  const keep = cut.filter((t) => {
    const x = t % W;
    const y = (t - x) / W;
    for (let d = 0; d < 4; d++) {
      const xx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const yy = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!inCut[j] && h[j] > h[t]) return false;
    }
    return true;
  });
  // (D209: a shelf cut along a straight line leaves a ruler-straight bank, where the water it holds
  // runs as a channel between straight edges. Along every straight run of the water's edge the cut
  // makes, a tile of the cut in every few stays as it was, so the bank is ragged, as a worn one is)
  const wet = new Float64Array(N);
  for (let i = 0; i < N; i++) if (spill[i] > h[i]) wet[i] = 1;
  const cutAt = new Uint8Array(N);
  for (const i of keep) {
    wet[i] = 1;
    cutAt[i] = 1;
  }
  for (const run of straightness(W, H, wet, { wet: 0.5, minRun: SHELF_RUN }).runs) {
    const [ax, ay] = run.from;
    const [bx, by] = run.to;
    const vx = bx - ax;
    const vy = by - ay;
    const l2 = vx * vx + vy * vy;
    if (!(l2 > 0)) continue;
    // the cut's tiles along the run (their middles within a tile of it), in order along it
    const along: [number, number][] = [];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx)) - 1);
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by)) - 1);
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by)) + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!cutAt[i]) continue;
        const t = ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / l2;
        if (t < 0 || t > 1) continue;
        const px = ax + t * vx - (x + 0.5);
        const py = ay + t * vy - (y + 0.5);
        if (px * px + py * py <= 1) along.push([t, i]);
      }
    along.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    // (a notch every 5–8 tiles along it)
    let next = 3 + (hash32(seed, "shelf-notch", run.from[0], run.from[1]) % 4);
    for (let k = 0; k < along.length; k++) {
      if (k < next) continue;
      cutAt[along[k][1]] = 0;
      next = k + 5 + (hash32(seed, "shelf-notch", along[k][1]) % 4);
    }
  }
  let n = 0;
  for (const i of keep)
    if (cutAt[i]) {
      h[i]--;
      n++;
    }
  return n;
}
/** The shortest straight run of a cut shelf's water edge that gets notches (D209: the limits are 44
 *  and a canal's 34; a shelf's straight edge is often both banks of a narrow channel). */
const SHELF_RUN = 14;

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

/** How far over the level its land spills at a lake's water stands once settled, at most (its way
 *  out running over the rim). */
const LAKE_OVER = 0.3;
/** The fewest tiles of a planned lake its land holds water on that count as a lake (a pit or two
 *  the plan's lake stands over holds no lake: Any 128² seed 26's start relied on one). */
const LAKE_POOL = 9;
/** The farthest across its course a river's water is followed over ground no higher than its bed. */
const SPREAD_MOST = 48;

/** The water the hydrology planned, before any settle, as the land holds it: each river's channel
 *  at the depth its flow keeps in the width it spreads to (0.44 deep at 0.82 blocks/s per tile of
 *  width, D26; the width the ground no higher than its bed gives it across its course, where that is
 *  wider than the channel: a river on a flat floodplain runs as a thin sheet, River Valley 96² seed
 *  33 0.12 deep where its channel alone gave 0.42), and lakes to just above their outlet, no higher
 *  than the rim their land spills over (0.3 over it) and nothing where the land holds no water (a
 *  lake planned to its outlet over a rim the land shaped lower settles at that rim: Canyon 96² seed
 *  16, planned at 6.6, settled at 3.7–4.1), with `held`; without it, the plan as planned: lakes to
 *  their outlets, rivers in their channels' width (what the edge lips hold, and what the land-stage
 *  screens and the dam-wall check were measured against). */
export function plannedWater(h: Uint8Array, hy: Hydro, W: number, H: number, held = false): Float64Array {
  const N = W * H;
  const D = new Float64Array(N);
  const lakeOf = new Int32Array(N).fill(-1);
  hy.lakes.forEach((lk, k) => {
    for (const i of lk.tiles) lakeOf[i] = k;
  });
  const spill = held ? drainage(h, W, H, { eight: false }).filled : null;
  // (the planned lakes' tiles the land holds water on, in pools of LAKE_POOL tiles or more)
  let pool: Uint8Array | null = null;
  if (spill) {
    pool = new Uint8Array(N);
    const seen = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || hy.water[s0] !== 2 || !(spill[s0] > h[s0])) continue;
      const q: number[] = [s0];
      seen[s0] = 1;
      for (let k = 0; k < q.length; k++) {
        const c = q[k];
        const x = c % W;
        const y = (c - x) / W;
        for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
          if (n < 0 || seen[n] || hy.water[n] !== 2 || !(spill[n] > h[n])) continue;
          seen[n] = 1;
          q.push(n);
        }
      }
      if (q.length >= LAKE_POOL) for (const c of q) pool[c] = 1;
    }
  }
  const q = new Float64Array(N);
  for (const r of hy.rivers) {
    const { path, width, flow } = r.params;
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
      const per = flow / Math.max(1, held ? spreadWidth(h, W, H, (ax + bx) / 2, (ay + by) / 2, vx, vy, width) : width);
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
    if (hy.water[i] === 2 && lakeOf[i] >= 0) {
      const top = hy.lakes[lakeOf[i]].outletBed + 0.6;
      if (!held) D[i] = Math.max(0.3, top - h[i]);
      else {
        // (no higher than its land holds it; a film where it holds none, or only a pit)
        const d = Math.min(top, pool![i] ? spill![i] + LAKE_OVER : h[i] + 0.05) - h[i];
        D[i] = d > 0 ? d : 0;
      }
    }
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

/** The width a river's water spreads to across its course at (x, y), heading (vx, vy): the run of
 *  tiles no higher than the bed there, the channel's own `width` at least. */
function spreadWidth(h: Uint8Array, W: number, H: number, x: number, y: number, vx: number, vy: number, width: number): number {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return width;
  const len = Math.hypot(vx, vy);
  if (!(len > 0)) return width;
  const bed = h[cy * W + cx];
  const px = -vy / len;
  const py = vx / len;
  let run = 1;
  for (const side of [1, -1])
    for (let t = 1; t <= SPREAD_MOST; t++) {
      const u = Math.round(x + side * px * t);
      const v = Math.round(y + side * py * t);
      if (u < 0 || v < 0 || u >= W || v >= H || h[v * W + u] > bed) break;
      run++;
    }
  return Math.max(width, run);
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

/** The start's water by the rule with Kyler's D302 (`start.water`), as the check reads it: only water
 *  a running source feeds, or a lake that lasts the rule's drought (`days`), at a shore the colony
 *  walks to within its walk; never a sealed puddle, and never a pump on a tile only beside the walk
 *  (before D348 a tile beside the walk counted, and the check then failed on the finished map). */
function startWaterServed(b: BuildResult, within: number, days: number): number {
  const d = startWalk(b, false);
  if (!d) return Infinity;
  return startWaterShore(d, b.heights, b.W, b.H, b.water, b.contamination, b.waterModel.emitters, droughtStorage(b.waterModel, b.water, days), within).distance;
}

/** D330's fix on a shown land (D348): a spring by the start, when the settled water left the start
 *  without water a pump reaches on foot. As `doc/waterFix.ts` places it, on dry ground within the
 *  rule's walk (less 4), off the start's 5×5, in a dry bed or a hollow below the ground round it, the
 *  lowest and nearest first, and here beside ground the colony walks to at most two levels above it
 *  (a pump there reaches its pond); a short spring-fed river the field holds (its sources a group by
 *  D314's rule, no channel cut), tried at SPRING_TRIES places. `tryWith` builds and settles the map
 *  with the spring and says whether the start's water now passes. */
function springByStart(b: BuildResult, rule: number, seed: number, attempt: number, tryWith: (f: RiverFeature) => boolean): RiverFeature | null {
  const { W, H } = b;
  const N = W * H;
  if (!b.start) return null;
  const d = startWalk(b, false);
  if (!d) return null;
  const padLevel = b.heights[b.start.y * W + b.start.x];
  const cands: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (b.water[i] > 0.05 || b.occupied[i] || Math.max(Math.abs(x - b.start.x), Math.abs(y - b.start.y)) <= 4) continue;
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
    // (a level or more under the start's pad: the spring's water, running on from its pond, never
    // reaches the start's ground)
    if (b.heights[i] >= padLevel) continue;
    let walk = Infinity;
    for (const n of [i - 1, i + 1, i - W, i + W]) if (d[n] + 1 < walk && b.heights[n] >= b.heights[i] && b.heights[n] - b.heights[i] <= 2) walk = d[n] + 1;
    if (!(walk <= rule - 4)) continue;
    let lower = 0;
    let ring = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        ring++;
        if (b.heights[(y + dy) * W + x + dx] > b.heights[i]) lower++;
      }
    const hollow = lower / Math.max(1, ring);
    if (!b.channel[i] && hollow < 0.5) continue;
    cands.push([(b.channel[i] ? 0 : 1000) - 100 * hollow + walk, i]);
  }
  cands.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const picks: number[] = [];
  for (const [, i] of cands) {
    if (picks.some((j) => Math.abs((j % W) - (i % W)) + Math.abs(Math.floor(j / W) - Math.floor(i / W)) < 6)) continue;
    picks.push(i);
    if (picks.length >= SPRING_TRIES) break;
  }
  for (const [k, i] of picks.entries()) {
    const x = i % W;
    const y = (i - x) / W;
    // (its flow: toward the lowest ground beside it)
    let fx = 1;
    let fy = 0;
    let low = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const v = b.heights[(y + dy) * W + x + dx];
      if (v < low) {
        low = v;
        fx = dx;
        fy = dy;
      }
    }
    for (const strength of SPRING_STRENGTH) {
      const role = "river/startSpring";
      const f: RiverFeature = {
        id: featureId(seed, "river", `${role}/${attempt}/${k}/${strength}`),
        kind: "river",
        origin: "generated",
        role,
        locked: false,
        params: { path: [[x, y], [x + fx, y + fy]], width: 1, bedDepth: 1, bedProfile: { start: b.heights[i], steps: [] }, flow: strength, style: "straight", entry: { spring: [x, y] }, exit: { basin: [x, y] }, badwater: false },
      };
      if (tryWith(f)) return f;
    }
  }
  return null;
}

/** The largest group (20+ tiles, 4-connected) of water still falling at the end of a settle that
 *  didn't settle: 256 more ticks from its water, tiles that lost more than 0.003 (D350). */
function fallingWater(b: BuildResult): Uint8Array | null {
  const { W, H } = b;
  const N = W * H;
  const sim = new WaterSim(b.waterModel, { depth: Float64Array.from(b.water), contamination: Float64Array.from(b.contamination) });
  // (with the settle's momentum, so nothing moves only because the flows restart)
  if (b.settle.out && b.settle.out.length === sim.out.length) sim.out.set(b.settle.out);
  const before = sim.D.slice();
  sim.run(256);
  const fall = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (before[i] > 0.05 && sim.D[i] < before[i] - 0.003) fall[i] = 1;
  const seen = new Uint8Array(N);
  let best: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!fall[s0] || seen[s0]) continue;
    const q = [s0];
    seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
        if (n >= 0 && fall[n] && !seen[n]) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    if (q.length > best.length) best = q;
  }
  if (best.length < 20) return null;
  const out = new Uint8Array(N);
  for (const i of best) out[i] = 1;
  return out;
}

/** The largest group of water still rising at the end of a settle that didn't settle (256 more ticks,
 *  tiles that gained more than 0.003), with the most common spill level under it, or null (D350). */
function risingWater(b: BuildResult): { tiles: number[]; level: number } | null {
  const { W, H } = b;
  const N = W * H;
  const sim = new WaterSim(b.waterModel, { depth: Float64Array.from(b.water), contamination: Float64Array.from(b.contamination) });
  if (b.settle.out && b.settle.out.length === sim.out.length) sim.out.set(b.settle.out);
  const before = sim.D.slice();
  sim.run(256);
  const rise = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (sim.D[i] > before[i] + 0.003) rise[i] = 1;
  const seen = new Uint8Array(N);
  let best: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!rise[s0] || seen[s0]) continue;
    const q = [s0];
    seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
        if (n >= 0 && rise[n] && !seen[n]) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    if (q.length > best.length) best = q;
  }
  if (best.length < 20) return null;
  const spill = spillLevels(b.waterModel);
  const count = new Map<number, number>();
  for (const i of best) count.set(spill[i], (count.get(spill[i]) ?? 0) + 1);
  const level = [...count].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
  return { tiles: best.sort((a, c) => a - c), level };
}

/** Whether water from `cells` runs down (or level) on the spill levels to a tile of `mask`, as the
 *  canonical pre-fill runs it (sim/prefill.ts). */
function reachesDown(cells: readonly number[], spill: Float64Array, W: number, H: number, mask: Uint8Array): boolean {
  const seen = new Uint8Array(W * H);
  const q = [...cells];
  for (const c of q) seen[c] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    if (mask[c]) return true;
    const x = c % W;
    const y = (c - x) / W;
    for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
      if (n < 0 || seen[n] || spill[n] > spill[c]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return false;
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
  // (round the objects that block walking, as the colony walks: D333, a second district's site cut
  // off by a thorn belt or ruins read as joined)
  const blocked = new Uint8Array(W * H);
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) blocked[ty * W + tx] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, blocked, links);
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

/** The features whose water reaches each feature that owns a source in another's flow. */
function sourcesInFlowReachers(b: BuildResult): Map<string, Set<string>> {
  const objects: MapObject[] = [];
  const owners: string[] = [];
  for (const e of b.entities) {
    const j = entityJson(e);
    const p = placementOf(j);
    if (!p) continue;
    objects.push({ ...p, components: j.Components as JsonObject });
    owners.push(e.owner);
  }
  const r = sourcesInFlow(b.waterModel, objects, b.water);
  const out = new Map<string, Set<string>>();
  r.inFlow.forEach((k, n) => {
    const set = out.get(owners[k]) ?? new Set<string>();
    for (const o of r.reachedBy?.[n] ?? []) if (owners[o] !== owners[k]) set.add(owners[o]);
    out.set(owners[k], set);
  });
  return out;
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

/** The land stage of an attempt (D333 (2)): the genome's levels, the rivers and lakes planned on
 *  them, the processes' carving, the edge lip and the course check. Everything after it plans on
 *  this land and never changes it but locally (the start's pad, the badwater hollows). */
function planLandStage(land: Land, attempt: number, W: number, H: number, seed: number, ctx: PlanContext | null, protect: Uint8Array | null, opts: GenerateOptions): { h: Uint8Array; hy: Hydro; keep: Uint8Array; ramps: ReturnType<typeof naturalRamps>; blocked: ReturnType<typeof blockedCourses> } {
  const g = land.g;
  if (islandPrototypeEnabled(g) && !ctx) return islandStage(g, seed, W, H, attempt);
  const N = W * H;
  const h = land.h0.slice();
  // what a regeneration keeps under locks stands as it was; the water finds its way round it
  if (ctx?.locked) for (let i = 0; i < N; i++) if (ctx.locked.mask[i]) h[i] = ctx.locked.heights[i];
  // no edge walls: the land runs on past the edge, before the water is planned and after the
  // channels are cut (D151)
  relaxEdges(h, W, H);
  opts.onProgress?.({ attempt, stage: "water" });
  // (Delta's network: a feeder splitting round two islands, rejoining, and three mouths, D370)
  const hy = g.theme === "delta" && !ctx ? deltaHydro(h, g, seed, W, H) : planHydro(land.E, h, g, seed, W, H, attempt, { protect });
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
  // (and a small basin the planned water reaches whose spill level is a broad flat: its water would
  // stand a few hundredths over the flat as a sheet, a knife-edge under the game's spill threshold
  // that a drought leaves dry or not by millimetres (the probe's refill, D333, M9b): a stream a level
  // under the flat takes its water on instead)
  {
    const wet = new Uint8Array(N);
    for (let i = 0; i < N; i++) wet[i] = hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
    carveOutlets(h, W, H, channels, hash32(seed, "outlets-small", attempt), 3, 4, 60, wet);
  }
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
    widenOutlets(h, W, H, heads, hash32(seed, "widen", attempt), hy.flowTotal * (W <= 128 ? 2 : 1), hy.lakes.map((l) => l.tiles));

  }
  // (D350, Islands' promise: an island a sea layout placed near the shore, joined to the land by low
  // ground, is parted from it by a strait)
  if (g.seaLayout) {
    const isles = g.parts.filter((p) => p.isle).map((p) => {
      const [x, y] = orientXY(p.at[0] * (W - 1), p.at[1] * (H - 1), W, H, (g.orientation ?? 0) as LandOrientation);
      return { x, y, r: p.size };
    });
    const keepI = new Uint8Array(N);
    for (let i = 0; i < N; i++) keepI[i] = ctx?.locked?.mask[i] || protect?.[i] || hy.water[i] === 1 ? 1 : 0;
    standIslandsClear(h, W, H, isles, keepI, BED_FLOOR);
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
  // D333 (the pooled probe m9b-20260929b): a lake's shelf level with the lake's spill holds a thin
  // sheet of its water that the game keeps only while it was never dry: a drought dries it and the
  // refill leaves it dry (the game's spill threshold), so the file showed water there that the first
  // drought took for good, and such sheets fill for days. The tiles of a lake the hydrology planned
  // that stand at its spill level are cut a level lower, the lake's own bed
  // (not round a sea: a sea is big, and its shelf cut down makes a bigger sea that fills for days)
  if (!g.seaLayout) lowerShelves(h, W, H, hy.water, ctx?.locked?.mask ?? null, protect, hash32(seed, "shelves", attempt));
  const mouthArms = hy.arms.filter((a) => a.kind === "mouth").map((a) => a.path);
  let blocked = blockedCourses(h, W, H, hy.rivers, mouthArms);
  for (let k = 0; k < 3 && blocked.some((b) => b.back) && closeBackEdges(h, W, H, blocked, hy.rivers, g.hydro.exactInflows ? 4 : 2); k++) blocked = blockedCourses(h, W, H, hy.rivers, mouthArms);
  // (a tie with the exit on another edge: a lip there, D350)
  for (let k = 0; k < 3 && !blocked.length && closeSideEdges(h, W, H, hy.rivers, mouthArms); k++) blocked = blockedCourses(h, W, H, hy.rivers, mouthArms);
  return { h, hy, keep, ramps, blocked };
}

function attemptOnce(specIn: MapSpec, land: Land, attempt: number, opts: GenerateOptions, t0: number, from: LandStage | null = null, screened: { count: number } = { count: Infinity }): Attempt {
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
  let h: Uint8Array;
  let hy: Hydro;
  let keep: Uint8Array;
  let ramps: ReturnType<typeof naturalRamps>;
  let blocked: ReturnType<typeof blockedCourses> = [];
  // a land already committed (D333 (2)): its water, start and objects are planned again on it
  let bundle: StageBundle | null = null;
  if (from) {
    h = from.hLand.slice();
    bundle = structuredClone(from.bundle);
    hy = bundle.hy;
    keep = from.keep;
    ramps = from.ramps;
  } else {
    const st = planLandStage(land, attempt, W, H, seed, ctx, protect, opts);
    h = st.h;
    hy = st.hy;
    keep = st.keep;
    ramps = st.ramps;
    blocked = st.blocked;
  }
  const hLand = h.slice();
  // (the first look: the land, once it passed the land stage's checks below, D333 (2))
  let firstLook = from ? from.firstLook : -1;
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
    fixes: [],
  };
  const fixes = info.fixes!;
  const cache = from ? from.cache : new SettleCache();
  const fieldCache: FieldCache = from ? from.fields : new Map();
  const counted = from ? from.counted : new WeakSet<object>();
  const contains = new Set<string>(hy.rivers.map((r) => r.id));
  const fieldOf = (): GeneratedField => {
    const steps = standingSteps(ramps.steps, h, W, H);
    return { heights: h.slice(), contains: new Set(contains), ...(steps.length ? { ramps: steps } : {}), ...(g.tall ? { top: Math.ceil(g.top) } : {}) };
  };
  const build = (features: readonly Feature[], stop: "resources" | "water" | null): BuildResult => {
    const b = buildMap({ W, H, seed, features, field: fieldOf(), locked: ctx?.locked ?? null }, { settleCache: cache, fieldCache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });
    if (stop === "water") return b;
    // (a settle counts once: the cache hands the attempts on a land the settles they share)
    if (!counted.has(b.settle.depth)) {
      counted.add(b.settle.depth);
      info.settles++;
    }
    return b;
  };
  // the natural lakes read back from the field (they describe it, never shape it)
  const lakes = bundle ? bundle.lakes : lakeFeatures(hy, W, H, seed);
  for (const f of lakes) contains.add(f.id);
  // the pre-built weir (D72), on half the maps where a river's channel takes one; the start and the
  // badwater keep off its pool
  const weir = bundle ? bundle.weir : planWeir(h, W, H, hy, seed, attempt, protect);
  const pool = new Uint8Array(N);
  if (weir) for (const i of weir.pool) pool[i] = 1;
  // M9b ("a plug holds back a lake", D274): on a map steered toward it, a plug across a big lake's
  // way out; the start and the badwater keep off it and its lake
  const plug = bundle ? bundle.plug : g.plugLake ? planPlug(h, W, H, hy, seed, protect) : null;
  if (plug) for (const i of plug.pool) pool[i] = 1;
  let rivers: Feature[] = [...hy.rivers, ...lakes, ...(weir ? [weir.feature] : []), ...(plug ? [plug.feature] : []), ...(ctx?.features ?? [])];
  // rivers that leave the map (their spring or row of sources reached by another's water, D171)
  const dropRivers = (ids: readonly string[]) => {
    const dropped = new Set(ids);
    const gone = hy.rivers.filter((r) => dropped.has(r.id));
    for (const r of gone) {
      for (const o of hy.rivers) if ("river" in o.params.exit && o.params.exit.river === r.id) o.params.exit = { ...r.params.exit };
      contains.delete(r.id);
    }
    hy.rivers = hy.rivers.filter((r) => !dropped.has(r.id));
    for (const f of lakes) {
      f.params.inflow = { rivers: ("rivers" in f.params.inflow ? f.params.inflow.rivers : []).filter((id) => !dropped.has(id)) };
      if (f.params.outlet.target && dropped.has(f.params.outlet.target)) f.params.outlet = { at: f.params.outlet.at, sill: f.params.outlet.sill, to: "none" };
    }
    rivers = rivers.filter((f) => !dropped.has(f.id));
  };
  if (from?.dropped.length) dropRivers(from.dropped);
  // (rivers that leave before the land is shown, their sources reached on the pre-fill)
  const droppedPre: string[] = [];
  // (and the sources fed stronger on an earlier attempt, D350)
  if (from && Object.keys(from.fed).length) {
    for (const f of rivers) {
      const v = from.fed[f.id];
      if (v === undefined) continue;
      if (f.kind === "river") f.params.flow = v;
      else if (f.kind === "lake") f.params.inflow = { spring: v };
    }
    fixes.push("lake fed");
  }
  if (from?.springs.length) {
    for (const f of from.springs) {
      rivers.push(structuredClone(f));
      contains.add(f.id);
    }
    fixes.push("lake spring");
  }
  const fail = (why: string, b: BuildResult | null, replannable: boolean): Attempt => {
    info.stage = why;
    // (an attempt refused before its water settled keeps only its land for the record, unless it is
    // the last attempt, whose map is kept when none passes: a settle there would be spent for nothing)
    if (!b && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) {
      // (its land, built only if something reads it: a land drawn again before it was shown costs
      // no build, time to land, D333 (2))
      const features = [...rivers];
      const field = fieldData(fieldOf());
      let land: BuildResult | null = null;
      let file: TimberFile | null = null;
      const landOf = () => (land ??= build(features, "water"));
      const result = { spec: shown, features, report: { profile: "generate" as const, checks: [], passed: false }, analysis: null, bytes: new Uint8Array(), attempts: attempt + 1, failures: [], field, intentions: [], info, timings: { firstLook, firstWater: -1, final: Math.round(performance.now() - t0) } } as unknown as GenerateResult;
      Object.defineProperty(result, "built", { get: landOf, enumerable: true });
      Object.defineProperty(result, "file", { get: () => (file ??= toTimberFile(spec, landOf())), enumerable: true });
      return { passed: false, replannable, stage: landStage, result };
    }
    const built = b ?? build(rivers, null);
    const file = toTimberFile(spec, built);
    const v = validateMap(file, { profile: "generate", spec, features: rivers, water: { model: built.waterModel, settled: built.settle } });
    return {
      passed: false,
      replannable,
      stage: landStage,
      result: { spec: shown, features: [...rivers], built, report: { ...v.report, passed: false }, analysis: v.analysis, bytes: new Uint8Array(), file, attempts: attempt + 1, failures: [], field: fieldData(fieldOf()), intentions: [], info, timings: { firstLook, firstWater: -1, final: Math.round(performance.now() - t0) } },
    };
  };
  let landStage: LandStage | null = from;
  if (!from) {
    if (!hy.rivers.length) return fail("no rivers", null, false);
    // M9b (D273 (1)): every river's water runs its whole course; a plan where it would spill out
    // before the end (by a lower way beside a lake, or by the edge beside its own mouth, and the rest
    // of its course stood dry) is planned again (the course check runs before the first look)
    if (blocked.length && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) return fail("a river's water leaves its course", null, true);
    // (and no inflow's head under water held downstream: it backs up to the edge, runs off beside
    // the head's sources and never settles)
    if (attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1 && drownedHeads(h, W, H, hy.rivers).length) return fail("a river's head under a lake", null, true);
    // the Rivers setting's count, when the player set one: land that holds fewer is drawn again
    // (not on the last attempt, whose map is kept when none passes)
    if (g.hydro.exactInflows && hy.rivers.filter((r) => "edge" in r.params.entry).length < g.hydro.inflows && attempt < (opts.maxAttempts ?? MAX_ATTEMPTS) - 1) return fail("rivers", null, false);
    // D171: every source starts a river; a hydrology that puts one inside a flow is planned again
    if (springsInFlow(hy, W)) return fail("source in a flow", null, true);
  }
  // (what the land stage planned, kept for the attempts on this land, D333 (2))
  const planned = from ? null : structuredClone({ hy, lakes, weir, plug });
  let foot = footComponents(h, W, H, keep);
  // the start's ground joins at least Buildable land's walkable land (PLAN §5.2), and more is
  // preferred up to twice it
  const reachMin = REACH_MIN[spec.settings.terrain.buildableLand];
  const minFoot = Math.round(Math.max(Math.min(1200, reachMin), 0.12 * N));
  const footWant = 2 * reachMin;
  const room = { small: 400, normal: 900, large: 1600 }[spec.settings.start.area];
  const bench = { small: 79, normal: 113, large: 180 }[spec.settings.start.area];
  // (on a land kept for another attempt, D333 (2): the starts that failed on it are kept off too)
  const tried = from?.tried ?? new Uint8Array(N);
  // (the objects keep off what the start keeps off but the starts tried: a mine site or a relic may
  // stand where a start failed, D363)
  const avoidOf = (bad: Hazards | null, starts = true) => {
    const a = new Uint8Array(N);
    for (let i = 0; i < N; i++) a[i] = (bad?.avoid[i] ?? 0) || ramps.tiles[i] || pool[i] || (protect?.[i] ?? 0) || (starts && tried[i]) ? 1 : 0;
    return a;
  };
  // ---- the settler: on the water the hydrology planned (its guess), or on the settled water
  // (whether a start may need its ground levelled: before the land is shown, as the plan, whose
  // levelling is part of shaping the land; never on a shown land, D348)
  let allowLevel = true;
  let plannedStart: { kept: Float64Array | null; storage: { kept: Float64Array; want: number }; view: ReturnType<typeof settlerView> | null; prepared: ReturnType<typeof prepareStart> } | null = null;
  const settlerOn = (D: ArrayLike<number>, C: ArrayLike<number>, M: ArrayLike<number>, salt: number, avoid: Uint8Array | null, weight = 1, near: { x: number; y: number } | null = null, reusePlanned = false): StartPick | null => {
    // (Islands' start on its main island, D370)
    avoid = islandStartAvoid(g, avoid);
    let data = reusePlanned ? plannedStart : null;
    if (!data) {
      const model = waterModel(W, H, h, []);
      const kept = policy === "off" ? null : droughtStorage(model, D, FIRST_DROUGHT_DAYS);
      const storage = { kept: droughtStorage(model, D, DROUGHT[spec.designedFor].days), want: reservoirNeeded(spec.designedFor) * RESERVE[spec.settings.water.droughtReserve] };
      const view = g.intentions.length ? settlerView(h, W, H, hy, D, C, M, DROUGHT[spec.designedFor].days === 9 ? storage.kept : undefined) : null;
      const prepared = prepareStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, rule, { kept, drought: policy, storage });
      data = { kept, storage, view, prepared };
      if (reusePlanned) plannedStart = data;
    }
    const { kept, storage, view, prepared } = data;
    const prefer = view ? (x: number, y: number, L: number, w: number) => weight * Math.max(...g.intentions.map((id) => view.prefer(id, x, y, L, w))) : null;
    const rng = stream(seed, "settler2", attempt, salt);
    return pickStart(h, W, H, { depth: D, contamination: C, moisture: M }, hy, g.settler, rng, rule, { prepared, avoid, kept, drought: policy, prefer, foot, minFoot, footWant, moistWalk: { min: MOIST_WALK }, room, bench, storage, near, level: allowLevel });
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
  // (Delta's hollows on the outer catchment's shoulders, off its plain, D370)
  if (shown.theme === "delta" && !ctx) badAsk.keepOff = deltaBadwaterKeep(h, hy.water, W, H, badAsk.keepOff);
  // (the mine sites' squares, found or padded as the land was shaped, D363: the hollows keep off them)
  const mineKeep = from ? from.mineKeep : new Uint8Array(N);
  const mineWay = from ? from.mineWay : new Uint8Array(N);
  if (from?.pads) info.pads = from.pads;
  if (from?.sheet !== undefined) info.sheet = from.sheet;
  if (from?.rise !== undefined) info.rise = from.rise;
  if (from?.lakeStraight !== undefined) info.lakeStraight = from.lakeStraight;
  if (from?.preWet !== undefined) info.preWet = from.preWet;
  if (from?.fillWalls !== undefined) info.fillWalls = from.fillWalls;
  // (the hollows off the mine sites' squares and the ways to them; off the squares alone where that
  // leaves them no room, and where even that does, as before: a map needs its badwater too)
  const planBad = (D: ArrayLike<number>, ask: typeof badAsk, salt: number, start: { x: number; y: number }): Hazards => {
    let out: Hazards | null = null;
    for (const extra of [orMask(mineKeep, mineWay), mineKeep, null]) {
      out = planBadwater(h, W, H, D, hy, { ...ask, keepOff: extra ? orMask(ask.keepOff ?? null, extra) : ask.keepOff }, seed, salt, start);
      if (out.features.length) break;
    }
    return out!;
  };
  const noBad: Hazards = { count: 0, features: [], avoid: new Uint8Array(N), heights: h };
  const badAt = (D: ArrayLike<number>, start: { x: number; y: number }, salt: number): Hazards => {
    const bad = planBad(D, badAsk, attempt * 4 + salt, start);
    if (bad.features.length) {
      h.set(bad.heights);
      for (const f of bad.features) contains.add(f.id);
    }
    return bad;
  };
  // ---- the badwater hollows, planned before the settle: away from where the start will likely be
  //      (the settler run on the water the hydrology planned), so one settle serves both
  let bad: Hazards = noBad;
  const lastAttempt = attempt >= (opts.maxAttempts ?? MAX_ATTEMPTS) - 1;
  let guess: StartPick | null = null;
  {
    const est = plannedWater(h, hy, W, H);
    // (the start, its second place and the mine sites' room are judged on the planned water as its
    // land holds it; the screens and the dam-wall check read the plan as planned, which they were
    // measured against: read as held, the outcomes fell a tenth and dam walls slipped through)
    const held = plannedWater(h, hy, W, H, true);
    const zero = new Float64Array(N);
    // D348: every check the land alone can judge runs before it is shown, the cheapest first: no
    // ground above 16 on a map that is not tall, no ruler-straight channel or dam wall on the water its
    // rivers were planned with (both run again on the settled water), and (the first lands, within
    // `landScreen`) the theme's promise and a readable water story on that water; then a place for a
    // start on it (D333 (2): a land with none is drawn again before any settle), and a second place
    // away from the first. A land that passes
    // is the map from here on, shown at once (the first look, editable land) and kept while its
    // water, start and objects are planned again on it
    if (!from) {
      if (!lastAttempt && !g.tall && maxOf(hLand) > 16) return fail("above 16", null, false);
      if (shown.theme === "canyon" && N <= 128 * 128) {
        const po = outcomesOf({ spec: shown, built: { W, H, heights: hLand, water: est, contamination: new Float64Array(N) }, features: rivers, intentions: [] });
        info.planned = { promise: po.promise, water: po.story.readable };
        // (the promise with the screen's margin: the settled water falls short of the plan's)
        const keeps = PROMISES[shown.theme].holds(po.signature, Math.min(W, H), PLAN_MARGIN[shown.theme]);
        if (!lastAttempt && opts.screen !== false && screened.count < landScreen(W, H) && (!keeps || !po.story.readable)) {
          screened.count++;
          // A rejected Canyon course can be incised on the same shaped field.
          if (!keeps && shown.theme === "canyon") { g.hydro.incise += 1; g.hydro.floor *= 0.75; }
          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, shown.theme === "canyon");
        }
      }
      // (with a margin: the settled water's banks run a little straighter than the planned water's, and
      // a shown land can't be planned again for it, D348)
      if (!lastAttempt) {
        // (every channel the rivers were planned in counts as water, however shallow the plan's
        // estimate: River Valley 128² seed 2's main river ran 37 tiles straight to its edge at 0.05)
        const chan = Float64Array.from(est);
        for (let i = 0; i < N; i++) if ((hy.water[i] === 1 || hy.water[i] === 2) && chan[i] < 0.1) chan[i] = 0.1;
        const st = straightness(W, H, chan);
        if ((st.longest?.length ?? 0) > 0.8 * STRAIGHT_LIMITS.run || (st.canal?.length ?? 0) > 0.8 * STRAIGHT_LIMITS.canal) return fail("ruler-straight channel", null, true);
        // (and the planned lakes alone, at the limit itself: a lake's banks are its land's walls, and
        // the channels that join it, which break its bank on the plan, may settle too shallow to
        // count: Canyon 128² seed 16's lake along a straight trough, 22 on the plan, 47 settled and 47
        // read this way; of 840 maps no other reads over the limit)
        const lakesOnly = new Float64Array(N);
        for (let i = 0; i < N; i++) if (hy.water[i] === 2) lakesOnly[i] = Math.max(0.1, est[i]);
        const ls = straightness(W, H, lakesOnly);
        info.lakeStraight = { run: ls.longest?.length ?? 0, canal: Math.round((ls.canal?.length ?? 0) * 10) / 10 };
        if (tooStraight(ls)) return fail("ruler-straight channel", null, true);
      }
      if (!lastAttempt && damWalls(hLand, W, H, est).length) return fail("terrain.dam_wall", null, true);
      // (a sea standing over a broad shelf at its own spill level: its water crosses the shelf as a
      // sheet and fills for days, past the settle's six, and no small cut settles it (Islands 256²
      // seeds 12, 15, 19, D358, D360): fixed at the source, a land drawn again)
      // (and a sea standing mostly on such a shelf over a quarter of the map: its water covers the
      // shelf thinly or not at all, and the land round it stays dry: Any 128² seed 11's atolls)
      if (!lastAttempt && g.seaLayout) {
        const spill = drainage(hLand, W, H, { eight: false }).filled;
        let shelf = 0;
        let sea = 0;
        for (let i = 0; i < N; i++)
          if (hy.water[i] === 2) {
            sea++;
            if (hLand[i] >= spill[i]) shelf++;
          }
        if (shelf > SEA_SHELF_MOST || (shelf >= 0.75 * sea && shelf >= 0.25 * N)) return fail("a sea over its shelf", null, false);
      }
      // (D372: no water standing as a shallow sheet over a flat of more than 5% of the map, a planned
      // lake's level over a broad shelf: it fills for days past the settle's six, Canyon 256² seed 22;
      // the deep water a lake's banks hold is no sheet)
      {
        const sheet = shallowSheet(hLand, W, H, hy);
        info.sheet = Math.round(sheet.share * 1000) / 1000;
        info.rise = lakeRise(hy);
        if (!lastAttempt && SHEET_REJECT && sheet.share > SHEET_MOST) return fail("a river over a flat", null, true);
      }

      if (shown.theme !== "canyon" || N > 128 * 128) {
        const po = outcomesOf({ spec: shown, built: { W, H, heights: hLand, water: est, contamination: new Float64Array(N) }, features: rivers, intentions: [] });
        info.planned = { promise: po.promise, water: po.story.readable };
        // (the promise with the screen's margin: the settled water falls short of the plan's)
        const keeps = shown.theme === "any" || PROMISES[shown.theme].holds(po.signature, Math.min(W, H), PLAN_MARGIN[shown.theme]);
        if (!lastAttempt && opts.screen !== false && screened.count < landScreen(W, H) && (!keeps || !po.story.readable)) {
          screened.count++;
          return fail(!keeps ? "promise (planned)" : "water story (planned)", null, false);
        }
      }
    }
    let second: StartPick | null = null;
    const prepared: StartPick[] = [];
    // (on a shown land, a place that needs no levelling: no ground is levelled after it was shown)
    allowLevel = !from;
    const heldMoist = moisture(h, held, zero, W, H, null);
    guess = settlerOn(held, zero, heldMoist, 0, avoidOf(null), 1, null, true);
    allowLevel = true;
    if (!from) {
      if (!guess && !lastAttempt) return fail("no start", null, true);
      // (and a second place, away from the first: a land with one place for a start has nothing to
      // fall back on when the settled water or the objects fail it, and a shown land can't be drawn
      // again, D348)
      if (guess && !lastAttempt && opts.secondStart !== false) {
        const off = avoidOf(null);
        markTried(off, guess, W, H);
        second = settlerOn(held, zero, heldMoist, 5, off, 1, null, true);
        if (!second) return fail("one place for a start", null, true);
        // (and the places after it, apart from each other: every start a shown land may fall back
        // on has its pad ready, levelled now if it needs it, D373 (3))
        markTried(off, second, W, H);
        for (let k = 0; k < PREPARED_MORE; k++) {
          const more = settlerOn(held, zero, heldMoist, 9 + k, off, 1, null, true);
          if (!more) break;
          prepared.push(more);
          markTried(off, more, W, H);
        }
      }
      // The shared fields expire before any levelling or mine-pad shaping.
      plannedStart = null;
      // (no wall along a map edge, D151: the land alone shows one, so it is drawn again before it
      // is shown rather than failing every attempt on it)
      if (!lastAttempt && edgeRuleApplies(W, H) && edgeWalls(h, W, H).some((e) => e.share >= EDGE_SHARE)) return fail("an edge wall", null, true);
      // (a plan's start that needs its ground levelled has it levelled now, as the land is shaped:
      // no start is levelled after the land is shown, D348)
      if (guess?.levelled) {
        levelStart(guess);
        guess = { ...guess, levelled: false, shore: undefined };
      }
      // (and so have the second place and the places after it, the starts to fall back on once the
      // land is shown)
      if (second?.levelled) levelStart(second);
      for (const p of prepared) if (p.levelled) levelStart(p);
      // (D363: level ground for the mine sites the colony must reach, made as the land is shaped:
      // where the start's walk holds too few level squares, the ground nearest to level becomes a
      // pad, taken down a level at most, clear of the water)
      if (guess) {
        const keepP = new Uint8Array(N);
        for (let i = 0; i < N; i++) keepP[i] = keep[i] || hy.water[i] === 1 || hy.water[i] === 2 || pool[i] || ramps.tiles[i] || protect?.[i] || ctx?.locked?.mask[i] ? 1 : 0;
        const scale = bandScale(W, H);
        const want = minesWanted(W, H);
        const lo = MINE_REACH_LO * scale + 1;
        const padFor = (at: StartPick) => minePads(h, W, H, { start: at, wet: held, keep: keepP, want, lo, far: MINE_LO * scale + 1, seed: hash32(seed, "mine-pads", attempt) });
        const hPre = h.slice();
        let pads = padFor(guess);
        if (mineSquares().length < want) {
          // (the plan's start has no room for them even with pads: another start the planned water
          // gives, where its walk has the room, is the plan's start; a land with none is drawn again
          // before it is shown: rugged or small land, D363)
          h.set(hPre);
          const room = roomMap(h, W, H, { wet: held, keep: keepP, want, lo, firm: FIRM });
          const off = avoidOf(null);
          for (let i = 0; i < N; i++) if (!room[i]) off[i] = 1;
          const alt = settlerOn(held, zero, moisture(h, held, zero, W, H, null), 8, off);
          if (alt) {
            guess = alt;
            pads = padFor(guess);
          }
          if (mineSquares().length < want && !lastAttempt) return fail("no room for the mine sites", null, true);
        }
        for (const p of pads) for (const j of p.cut) hLand[j] = h[j];
        if (pads.length) info.pads = pads;
        // (the hollows keep off the mine sites' squares and a margin round them, on this attempt and
        // every later one on the land)
        const mark = (c: number, r: number, m: Uint8Array) => {
          const cx = c % W;
          const cy = (c - cx) / W;
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < W && cy + dy < H) m[(cy + dy) * W + cx + dx] = 1;
        };
        for (const c of mineSquares()) mark(c, 6, mineKeep);
        for (const way of mineWays()) for (const c of way) mark(c, 2, mineWay);
        // (and the other places a start on the shown land may fall back on have their mine sites'
        // room too, pads where they need them; a place with none even so is no place to fall back on,
        // D373 (3))
        const roomy: StartPick[] = [];
        for (const q of [second, ...prepared]) {
          if (!q) continue;
          const before = h.slice();
          const more = padFor(q);
          if (mineSquares().length < want) {
            h.set(before);
            continue;
          }
          roomy.push(q);
          pads = [...pads, ...more];
          for (const c of mineSquares()) mark(c, 6, mineKeep);
          for (const way of mineWays()) for (const c of way) mark(c, 2, mineWay);
        }
        second = roomy.includes(second!) ? second : null;
        prepared.length = 0;
        for (const q of roomy) if (q !== second) prepared.push(q);
        if (pads.length) info.pads = pads;
      }
      // (the plan's start, if it changed to one with room for the mine sites, has its pad ready too)
      if (guess?.levelled) {
        levelStart(guess);
        guess = { ...guess, levelled: false, shore: undefined };
      }
      // (D348: the badwater hollows are dug as the land is shaped, before it is shown, from the plan's
      // start on the planned water; the land shown holds them, and every attempt on it keeps them)
      const bare = h.slice();
      if (guess && badAsk.count > 0) bad = badAt(est, guess, 0);
      // (and the sources are read on the pre-fill, the water the settle starts from, before the land
      // is shown: a spring river, or an inflow other than the main river, whose source another's water
      // reaches leaves now; hollows another's water reaches are planned again, off where they were;
      // a main river whose head is reached draws the land again. Nothing of it changes after the land
      // is shown, D348)
      let keepOffH = badAsk.keepOff ?? null;
      let hollowTries = 0;
      // (the pre-fill of the land as it will be shown, for the dam-wall check below)
      let shownFill: Float64Array | null = null;
      for (let round = 0; round < HOLLOW_TRIES + 3; round++) {
        const bw = build([...rivers, ...bad.features], "water");
        const model = waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }));
        const fill = prefill(model).depth;
        const reached = sourcesInFlowOwners({ ...bw, waterModel: model, water: fill } as BuildResult);
        shownFill = Float64Array.from(fill);
        if (!reached.size) break;
        shownFill = null;
        const leave = hy.rivers.filter((r) => reached.has(r.id) && r.role !== "river/main" && ("spring" in r.params.entry || ("edge" in r.params.entry && !g.hydro.exactInflows)));
        if (hy.rivers.some((r) => reached.has(r.id) && !leave.includes(r)) || leave.length >= hy.rivers.length) {
          if (!lastAttempt) return fail("source in a flow", null, true);
          break;
        }
        if (leave.length) {
          dropRivers(leave.map((r) => r.id));
          droppedPre.push(...leave.map((r) => r.id));
        }
        if (bad.features.some((f) => reached.has(f.id))) {
          for (const f of bad.features) contains.delete(f.id);
          h.set(bare);
          keepOffH = orMask(keepOffH, bad.avoid);
          bad = ++hollowTries < HOLLOW_TRIES && guess ? planBad(est, { ...badAsk, keepOff: keepOffH }, attempt * 4 + 5 + hollowTries, guess) : noBad;
          if (bad.features.length) {
            h.set(bad.heights);
            for (const f of bad.features) contains.add(f.id);
          }
        } else if (!leave.length) break;
      }
      if (guess && badAsk.count > 0 && !bad.features.length && !lastAttempt) return fail("no place for badwater", null, true);
      hLand.set(h);
      // (no dam wall on the pre-fill's water either, the water the settle starts from: a wall the
      // planned water missed fails every attempt on the land once it is shown)
      if (!lastAttempt) {
        let pf: ArrayLike<number> | null = shownFill;
        if (!pf) {
          const bw = build([...rivers, ...bad.features], "water");
          pf = prefill(waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }))).depth;
        }
        const both = new Float64Array(N);
        let wetPre = 0;
        for (let i = 0; i < N; i++) {
          both[i] = Math.max(est[i], pf[i]);
          if (both[i] > WET) wetPre++;
        }
        info.preWet = Math.round((wetPre / N) * 1000) / 1000;
        // (nor on the pre-fill alone, its thin water left out: the plan counts a lake its own river
        // drains as full, which hides the lake's old bed standing beside the channel as a band of rock
        // with the river through it, and the pre-fill's films over the floor beside it dry up: Any
        // 96² seed 18, Lake Basin 128² seed 5. Read at 0.1, 0.2 and 0.3 deep; 0.2 decides)
        info.fillWalls = [0.1, 0.2, 0.3].map((cut) => {
          const deep = new Float64Array(N);
          for (let i = 0; i < N; i++) if (pf![i] >= cut) deep[i] = pf![i];
          return damWalls(h, W, H, deep).length;
        });
        if (info.fillWalls[1] > 0) return fail("terrain.dam_wall", null, true);
        if (damWalls(h, W, H, both).length) return fail("terrain.dam_wall", null, true);
      }
      // Prove the exact object's reachable mine pair on the inexpensive pre-fill,
      // before committing terrain or spending a full settle on an impossible start.
      if (guess && !lastAttempt && N <= 96 * 96) {
        const layout = [...rivers, ...bad.features, startOf(guess)];
        const bw = build(layout, "water");
        const model = waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }));
        const pf = prefill(model);
        const pb = { ...bw, waterModel: model, water: pf.depth, contamination: pf.contamination } as BuildResult;
        const obj = planExtras({ spec, base: pb, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh }).filter(f => f.params.kind === "mineSite");
        const mb = build([...layout, ...obj], "water");
        const objs = mapObjects({ entities: mb.entities.map(entityJson) });
        const wet = Uint8Array.from(pf.depth, d => d > WET ? 1 : 0);
        if (!mb.start || minesReached(objs, W, H, colonyReach(W, H, mb.heights, wet, objs, mb.start)) < minesWanted(W, H)) return fail("mine pair (pre-fill)", null, true);
      }
      firstLook = Math.round(performance.now() - t0);
      landStage = { hLand, bundle: planned!, keep, ramps, firstLook, cache, fields: fieldCache, counted, tried, mineKeep, mineWay, pads: info.pads, prepared: [guess, second, ...prepared].filter((p): p is StartPick => !!p).map((p) => ({ ...p, levelled: false, shore: undefined })), sheet: info.sheet, rise: info.rise, lakeStraight: info.lakeStraight, preWet: info.preWet, fillWalls: info.fillWalls, hollows: bad.features.length ? { count: bad.count, features: bad.features, avoid: bad.avoid } : null, unsettled: 0, dropped: droppedPre, fed: {}, springs: [] };
      opts.onLand?.({ attempt, heights: hLand, water: hy.water });
    }
    // (every later attempt on the shown land keeps its hollows as they were dug: its ground holds
    // them already)
    if (from?.hollows) {
      bad = { ...structuredClone(from.hollows), heights: h };
      for (const f of bad.features) contains.add(f.id);
    }
  }
  opts.onProgress?.({ attempt, stage: "start" });
  // ---- the one settle: the rivers and the hollows
  // (water still changing after the settle's four days, water.settles, on the shown land, D348: when
  // the rivers' water alone settles, the hollows unsettled it, and the next plan keeps off them; when
  // it does not, no plan on this land settles, and the attempts stop there, never drawing new land)
  const floodLine = rulesFor(spec).maxWaterShare;
  const floodShare = (b: BuildResult) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (b.water[i] > WET) n++;
    return n / N;
  };
  const wearFix = (b: BuildResult): BuildResult | null => {
    // Round 2: a shown height is immutable, including outlet wear.
    if (landStage) return null;
    const keepW = new Uint8Array(N);
    for (const e of b.waterModel.emitters)
      for (const i of e.cells) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) keepW[(y + dy) * W + x + dx] = 1;
      }
    for (let i = 0; i < N; i++) if (bad.avoid[i] || protect?.[i] || ctx?.locked?.mask[i]) keepW[i] = 1;
    // (a source's tiles are no way out: the game walls them off from the edge)
    const sourceTiles = new Uint8Array(N);
    for (const e of b.waterModel.emitters) for (const i of e.cells) sourceTiles[i] = 1;
    // (the basin standing over its spill level, then the water still rising at the end of the
    // settle, found by running it on: a plain whose water stands over its own level rises too, and
    // what rises is not always the basin over its level)
    const risen = risenBasin(h, W, H, b.water, sourceTiles);
    const rising = risingWater(b);
    const stuck = [risen, rising].filter((s): s is { tiles: number[]; level: number } => !!s);
    if (stuck.length === 2) {
      const inRisen = new Uint8Array(N);
      for (const i of stuck[0].tiles) inRisen[i] = 1;
      let both = 0;
      for (const i of stuck[1].tiles) both += inRisen[i];
      if (both * 2 >= stuck[1].tiles.length) stuck.pop();
    }
    // (a cut no bigger than this: past it the way out is no small local wear, and the map is fixed
    // at its source instead, D358, D360)
    const most = WEAR_MOST;
    for (const [k, stuckWater] of stuck.entries())
    for (const width of WEAR_WIDTHS) {
      const w = wearOutlet(h, W, H, b.water, { seed: hash32(seed, "outlet-wear", attempt, width + 100 * k), width, keep: keepW, noOutlet: sourceTiles, basin: stuckWater, floor: BED_FLOOR });
      if (!w || w.cut.length > most) break;
      const before = h.slice();
      h.set(w.heights);
      const b2 = build([...rivers, ...bad.features], "resources");
      if (b2.settle.settled) {
        // (the worn way out is the land from here on, for this attempt's later plans and the next)
        for (const j of w.cut) {
          hLand[j] = w.heights[j];
          if (from) from.hLand[j] = w.heights[j];
          bad.heights[j] = w.heights[j];
        }
        fixes.push("way out worn wider");
        info.worn = { cut: w.cut, basin: w.basin.length, level: w.level, width, route: w.route };
        return b2;
      }
      h.set(before);
    }
    return null;
  };
  // D350: a lake fed less than it loses falls for days from where the pre-fill started it (full,
  // at its spill level): the sources whose water reaches it run stronger (1.6, then 2.5 times) until
  // it settles within the water's flood line; recorded in the features, so the link rebuilds it
  // A rising basin can drain at a gentler inflow while keeping its terrain.
  const drainFix = (b: BuildResult): BuildResult | null => {
    if (W < 256 || (shown.theme !== "riverValley" && shown.theme !== "lakeBasin")) return null;
    const sourceTiles = new Uint8Array(N);
    for (const e of b.waterModel.emitters) for (const i of e.cells) sourceTiles[i] = 1;
    const risen = risenBasin(h, W, H, b.water, sourceTiles);
    if (!risen) return null;
    const basin = new Uint8Array(N);
    for (const i of risen.tiles) basin[i] = 1;
    const spill = spillLevels(b.waterModel);
    const feeders = rivers.filter(f => {
      if (f.kind !== "river" && f.kind !== "lake") return false;
      if (f.kind === "river" && f.params.badwater) return false;
      const cells: number[] = [];
      for (const e of b.entities) if (e.owner === f.id && e.template === "WaterSource" && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) cells.push(e.y * W + e.x);
      return cells.length > 0 && reachesDown(cells, spill, W, H, basin);
    });
    if (!feeders.length) return null;
    const flowOf = (f: Feature) => f.kind === "river" ? f.params.flow : f.kind === "lake" && "spring" in f.params.inflow ? f.params.inflow.spring : 0;
    const setFlow = (f: Feature, v: number) => { if (f.kind === "river") f.params.flow = v; else if (f.kind === "lake") f.params.inflow = { spring: v }; };
    const flows = feeders.map(flowOf);
    for (const ratio of [0.7, 0.49, 0.343]) {
      feeders.forEach((f, i) => setFlow(f, Math.round(flows[i] * ratio * 1000) / 1000));
      const repaired = build([...rivers, ...bad.features], "resources");
      if (repaired.settle.settled && floodShare(repaired) <= floodLine) {
        fixes.push("rising basin fed gently");
        if (landStage) feeders.forEach(f => landStage!.fed[f.id] = flowOf(f));
        return repaired;
      }
    }
    feeders.forEach((f, i) => setFlow(f, flows[i]));
    return null;
  };
  const feedFix = (b: BuildResult): BuildResult | null => {
    const falling = fallingWater(b);
    if (!falling) return null;
    const spill = spillLevels(b.waterModel);
    const feeders = rivers.filter((f) => {
      if (f.kind !== "river" && f.kind !== "lake") return false;
      if (f.kind === "river" && f.params.badwater) return false;
      const cells: number[] = [];
      for (const e of b.entities) if (e.owner === f.id && e.template === "WaterSource" && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) cells.push(e.y * W + e.x);
      return cells.length > 0 && reachesDown(cells, spill, W, H, falling);
    });
    if (!feeders.length) return null;
    const flowOf = (f: Feature) => (f.kind === "river" ? f.params.flow : f.kind === "lake" && "spring" in f.params.inflow ? f.params.inflow.spring : 0);
    const setFlow = (f: Feature, v: number) => {
      if (f.kind === "river") f.params.flow = v;
      else if (f.kind === "lake") f.params.inflow = { spring: v };
    };
    const base = feeders.map(flowOf);
    for (const k of [1.6, 2.5]) {
      feeders.forEach((f, n) => setFlow(f, Math.round(base[n] * k * 1000) / 1000));
      const b2 = build([...rivers, ...bad.features], "resources");
      if (b2.settle.settled && floodShare(b2) <= floodLine) {
        fixes.push("lake fed");
        if (landStage) feeders.forEach((f) => (landStage!.fed[f.id] = flowOf(f)));
        return b2;
      }
    }
    feeders.forEach((f, n) => setFlow(f, base[n]));
    return null;
  };
  // (a lake nothing reaches, filled by the pre-fill and falling as it evaporates: a small spring at its
  // deepest tile keeps it full, about three times what it loses; the field holds it, no channel cut)
  const lakeSpring = (b: BuildResult): BuildResult | null => {
    const falling = fallingWater(b);
    if (!falling) return null;
    let deep = -1;
    let n = 0;
    for (let i = 0; i < N; i++)
      if (falling[i]) {
        n++;
        if (deep < 0 || b.water[i] > b.water[deep]) deep = i;
      }
    if (deep < 0) return null;
    const x = deep % W;
    const y = (deep - x) / W;
    const role = "river/lakeSpring";
    const f: RiverFeature = {
      id: featureId(seed, "river", `${role}/${attempt}`),
      kind: "river",
      origin: "generated",
      role,
      locked: false,
      params: { path: [[x, y], [x + 1, y]], width: 1, bedDepth: 1, bedProfile: { start: b.heights[deep], steps: [] }, flow: Math.max(0.2, Math.round(n * 0.0001 * 2 * 3 * 1000) / 1000), style: "straight", entry: { spring: [x, y] }, exit: { basin: [x, y] }, badwater: false },
    };
    contains.add(f.id);
    rivers.push(f);
    const b2 = build([...rivers, ...bad.features], "resources");
    const inFlow = sourcesInFlow(b2.waterModel, mapObjects({ entities: b2.entities.map(entityJson) }), b2.water).inFlow.length;
    if (b2.settle.settled && !inFlow) {
      fixes.push("lake spring");
      landStage?.springs.push(structuredClone(f));
      return b2;
    }
    rivers.pop();
    contains.delete(f.id);
    return null;
  };
  const unsettled = (b: BuildResult): Attempt => {
    if (landStage) landStage.unsettled++;
    if (bad.features.length) {
      const now = h.slice();
      h.set(hLand);
      const bare = build([...rivers], "resources");
      h.set(now);
      // (the hollows' water keeps it from settling: they stay, D348, and no plan on this land settles)
      if (bare.settle.settled) return { ...fail("water.settles", b, false), stuck: true };
    }
    // (the rivers' water alone does not settle either; hollows elsewhere may still hold it, so a
    // second plan is tried before the attempts stop)
    return (landStage?.unsettled ?? 2) >= 2 ? { ...fail("water.settles", b, false), stuck: true } : fail("water.settles", b, true);
  };
  let b1 = build([...rivers, ...bad.features], "resources");
  // (a plug that holds its lake back, D274, and keeps the water from settling: its lake fills for
  // days over the plug's narrow line. It is opened, and stays open on the later attempts on this
  // land; the land stays)
  if (!b1.settle.settled && !lastAttempt && plug && rivers.some((f) => f.id === plug.feature.id)) {
    const open = rivers.filter((f) => f.id !== plug.feature.id);
    const b2 = build([...open, ...bad.features], "resources");
    if (b2.settle.settled) {
      rivers = open;
      b1 = b2;
      fixes.push("plug opened");
      landStage?.dropped.push(plug.feature.id);
    }
  }
  // D350 (b): a basin whose water rose over its spill level, its way out too narrow: that way out worn
  // wider as the map arrives (the smallest cut that settles it, as if water wore it), recorded in the
  // land (the field), so the map's link rebuilds it
  if (!b1.settle.settled && !lastAttempt) {
    const worn = drainFix(b1) ?? wearFix(b1);
    if (worn) b1 = worn;
  }
  if (!b1.settle.settled && !lastAttempt) {
    const fed = feedFix(b1) ?? lakeSpring(b1);
    if (fed) b1 = fed;
  }
  // (not on the last attempt, whose map is kept)
  if (!b1.settle.settled && !lastAttempt) return unsettled(b1);
  // D348: water over more of the map than the flood line (water.no_flood) on the shown land: its
  // rivers and springs run gentler, 0.7 of their flow at a time, at most twice; the land stays
  for (let k = 0; k < 2 && !lastAttempt && floodShare(b1) > floodLine; k++) {
    for (const f of rivers) {
      if (f.kind === "river" && !f.params.badwater) f.params.flow = Math.round(f.params.flow * 700) / 1000;
      else if (f.kind === "lake" && "spring" in f.params.inflow) f.params.inflow = { spring: Math.round(f.params.inflow.spring * 700) / 1000 };
    }
    b1 = build([...rivers, ...bad.features], "resources");
    if (!b1.settle.settled) return unsettled(b1);
    if (!fixes.includes("gentler rivers")) fixes.push("gentler rivers");
  }
  // D171: a source that another source's water reaches fails the map (water.source_in_flow). A
  // spring-fed river whose spring is reached leaves the map (its valley stays, dry; a river that
  // joined it now joins where it went), and a badwater hollow that is reached is planned again
  // elsewhere; the water is settled once more. D333 (2), the land kept: a river whose row of
  // sources on the edge is reached (another's water backs up to its head behind the edge's lip)
  // leaves too, its valley holding the water that reaches it, unless the player set the Rivers
  // count; what still fails is planned again (the check at the end).
  for (let round = 0; round < 2 && !lastAttempt; round++) {
    const owners = sourcesInFlowOwners(b1);
    if (!owners.size) break;
    // (never the main river: the map shown keeps it, D348)
    let springs = hy.rivers.filter((r) => owners.has(r.id) && r.role !== "river/main" && ("spring" in r.params.entry || ("edge" in r.params.entry && !g.hydro.exactInflows)));
    if (springs.length >= hy.rivers.length) springs = [];
    // (a reached river that must stay, the Rivers count's or the only one: a spring-fed river whose
    // water reaches it leaves instead, D348)
    const stay = [...owners].filter((id) => hy.rivers.some((r) => r.id === id) && !springs.some((r) => r.id === id));
    if (stay.length && !lastAttempt) {
      const reachers = sourcesInFlowReachers(b1);
      const leave = new Set<string>();
      for (const id of stay) for (const o of reachers.get(id) ?? []) if (hy.rivers.some((r) => r.id === o && "spring" in r.params.entry)) leave.add(o);
      if (leave.size && leave.size < hy.rivers.length) {
        for (const id of stay) owners.delete(id);
        for (const id of leave) {
          owners.add(id);
          const r = hy.rivers.find((x) => x.id === id)!;
          if (!springs.includes(r)) springs.push(r);
        }
      }
    }
    const badHit = bad.features.some((f) => owners.has(f.id));
    if ([...owners].some((id) => !springs.some((r) => r.id === id) && !bad.features.some((f) => f.id === id))) break;
    if (springs.length) {
      dropRivers(springs.map((r) => r.id));
      // (the same rivers leave on every later attempt on this land, before its first settle)
      if (landStage) landStage.dropped.push(...springs.map((r) => r.id));
    }
    // (a hollow whose source another's water reaches: the hollows stay, D348, so no plan on this
    // land passes)
    if (badHit) return { ...fail("water.source_in_flow", b1, false), stuck: true };
    b1 = build([...rivers, ...bad.features], "resources");
    if (!b1.settle.settled) return unsettled(b1);
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
  // (near the guess: the hollows were planned from it, so they keep the distance the settings ask
  // for, and the land was judged and shaped round it before it was shown: its second place for a
  // start, its mine-site pads, D363)
  const near = guess;
  // the land the start's ground joins, on the settled water and the ground as it now stands (a
  // floodplain's water or a hollow cuts the planned land apart: item 47, a start on a strip of land
  // cut off by water and cliffs reaches neither its mine sites nor room to grow)
  const footOf = (b: BuildResult) => {
    const wetNow = new Uint8Array(N);
    for (let i = 0; i < N; i++) wetNow[i] = b.water[i] > 0.05 ? 1 : 0;
    return footComponents(h, W, H, wetNow);
  };
  foot = footOf(b1);
  // (D363: a start in land with room for the mine sites it must reach, level ground clear of the
  // settled water, where the land has any: the pads were made as the land was shaped, round the
  // plan's start)
  // (what the objects' placement keeps off, gen/extras.ts: the hollows' ground and what the start
  // keeps off, channels, objects, lakes, protected set pieces)
  const roomKeepOf = (b: typeof b1) => {
    const k = avoidOf(bad, false);
    for (let i = 0; i < N; i++) if (ctx?.locked?.mask[i] || b.channel[i] || b.occupied[i] || b.cache.terrain.protect[i] || hy.water[i] === 2) k[i] = 1;
    return k;
  };
  const scale = bandScale(W, H);
  const mineRoomAt = roomMap(h, W, H, { wet: b1.water, keep: roomKeepOf(b1), want: minesWanted(W, H), lo: MINE_REACH_LO * scale + 1 });
  let anyRoom = false;
  for (let i = 0; i < N && !anyRoom; i++) if (mineRoomAt[i]) anyRoom = true;
  const roomy = (a: Uint8Array): Uint8Array => {
    if (!anyRoom) return a;
    for (let i = 0; i < N; i++) if (!mineRoomAt[i]) a[i] = 1;
    return a;
  };
  // the start on the shown land: one that needs no levelling, so the land stays as it was shown
  // (D348; the plan's start had its ground levelled as the land was shaped)
  const chooseStart = (): StartPick | null => {
    // (a place whose pad and mine sites' room were made ready as the land was shaped, still dry and
    // clear: before any start without room, D373 (3))
    const ready = (): StartPick | null => {
      for (const q of landStage?.prepared ?? []) {
        if (tried[q.y * W + q.x] || avoidOf(bad)[q.y * W + q.x] || wetRing(b1, q) || padFloods(h, W, H, b1.water, q.x, q.y, q.level)) continue;
        if (anyRoom && !mineRoomAt[q.y * W + q.x]) continue;
        return q;
      }
      return null;
    };
    let p = settlerOn(b1.water, b1.contamination, b1.moisture, 1, roomy(beyondBad(b1)), 1, near) ?? settlerOn(b1.water, b1.contamination, b1.moisture, 1, roomy(avoidOf(bad)), 1, near) ?? ready() ?? settlerOn(b1.water, b1.contamination, b1.moisture, 1, avoidOf(bad), 1, near);
    // D348: no place for a start on the settled water: the start goes where the plan put it (the
    // land was shown because it had one), when that is still dry ground clear of the hollows and of
    // the starts that failed here; a spring by it gives it water below when the settled water left
    // none
    if (!p && guess) {
      if ((allowLevel || !guess.levelled) && !wetRing(b1, guess) && !avoidOf(bad)[guess.y * W + guess.x] && !padFloods(h, W, H, b1.water, guess.x, guess.y, guess.level)) p = guess;
      else {
        // (else a start the plan's water gives that is dry ground on the settled water too)
        const est = plannedWater(h, hy, W, H, true);
        const both = new Float64Array(N);
        for (let i = 0; i < N; i++) both[i] = Math.max(est[i], b1.water[i]);
        const zero = new Float64Array(N);
        const av = avoidOf(bad);
        for (let i = 0; i < N; i++) if (b1.water[i] > 0.001) av[i] = 1;
        p = settlerOn(both, zero, moisture(h, both, zero, W, H, null), 3, av);
        if (!p && landStage && allowLevel) markTried(landStage.tried, guess, W, H);
      }
      if (p) fixes.push("start from the plan");
    }

    // (else level dry ground joined to enough land, nearest the water: its spring comes below)
    if (!p) {
      p = dryStart(h, W, H, b1.water, hy, { avoid: roomy(avoidOf(bad)), foot, minFoot, near: guess, level: allowLevel }) ?? dryStart(h, W, H, b1.water, hy, { avoid: avoidOf(bad), foot, minFoot, near: guess, level: allowLevel });
      if (p) fixes.push("start on dry ground");
    }
    return p;
  };
  allowLevel = false;
  let pick = chooseStart();
  // (no start on the settled water or the plan: the shown land has no place left for one, D348)
  if (!pick) return guess ? fail("no start", b1, true) : { ...fail("no start", b1, true), stuck: true };
  // (a start that fails here, its ground under the settled water or its water gone, gives way to
  // another on the same settled water, START_TRIES in all, before the attempt is planned again:
  // each new plan settles the water again)
  let layout: Feature[] = [];
  let base!: BuildResult;
  let provedObjects: MapObjectFeature[] | null = null;
  let cur: StartPick = pick;
  // (another start on the same settled water, off the one that failed and the ground round it)
  const nextStart = (failed: StartPick): StartPick | null => {
    markTried(tried, failed, W, H);
    const ready = N <= 96 * 96 ? landStage?.prepared.find(q => !tried[q.y * W + q.x] && !avoidOf(bad)[q.y * W + q.x] && !wetRing(b1, q) && !padFloods(h, W, H, b1.water, q.x, q.y, q.level)) : null;
    if (ready) return ready;
    return settlerOn(b1.water, b1.contamination, b1.moisture, 7, roomy(beyondBad(b1)), 1, near) ?? settlerOn(b1.water, b1.contamination, b1.moisture, 7, roomy(avoidOf(bad)), 1, near) ?? dryStart(h, W, H, b1.water, hy, { avoid: roomy(avoidOf(bad)), foot, minFoot, near: guess, level: allowLevel }) ?? settlerOn(b1.water, b1.contamination, b1.moisture, 7, avoidOf(bad), 1, near);
  };
  for (let tryN = 0; ; tryN++) {
    const hBefore = h.slice();
    levelStart(cur);
    // (a start chosen where its walk had room for the mine sites whose own pad leaves it none, D363,
    // a pad dug down to the water's level, gives way to the next start before its water is settled;
    // a start chosen where no walk had room is kept: there was none to choose)
    if (tryN + 1 < START_TRIES && !lastAttempt && mineRoomAt[cur.y * W + cur.x] && mineRoom(h, W, H, { start: cur, wet: b1.water, keep: roomKeepOf(b1), want: minesWanted(W, H), lo: MINE_REACH_LO * scale + 1 }) < minesWanted(W, H)) {
      const levelled = h.slice();
      h.set(hBefore);
      const again = nextStart(cur);
      if (again) {
        cur = again;
        continue;
      }
      h.set(levelled);
    }
    layout = [...rivers, ...bad.features, startOf(cur)];
    // (a start whose pad changes the water is first judged on the water warm-started from the
    // settle before it, which costs a fraction of a settle: a pad the water would cover gives way to
    // the next start before its water is settled)
    if (tryN + 1 < START_TRIES && !lastAttempt) {
      const bw = build(layout, "water");
      const model = waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }));
      if (!cache.get(model)) {
        const pv = previewSettle({ model: b1.waterModel, water: b1.settle }, model);
        if (wetRing({ ...bw, water: pv.depth, contamination: pv.contamination, waterModel: model } as BuildResult, cur)) {
          // (the next start is found on the ground as it was, before this one's pad)
          const levelled = h.slice();
          h.set(hBefore);
          const again = nextStart(cur);
          if (again) {
            cur = again;
            continue;
          }
          h.set(levelled);
        }
      }
    }
    // a start on level ground and no new hollow keep the water: this build reuses the settle
    let b = build(layout, "resources");
    let why: string | null = null;
    // (the settled water covers the start's ground)
    if (wetRing(b, cur)) why = "start water moved";
    else if (!(startWaterServed(b, rule, droughtDays) <= rule - 2)) {
      // the water beside the start only a sealed puddle (D302), or the water moved away. The land is
      // shown (D348): a spring by the start (D330's fix) gives it water, the first place and strength
      // that serves it and leaves no source in another's flow
      const sealed = startWaterWalk(b) <= rule - 2;
      const at = cur;
      const lay = layout;
      const spring = springByStart(b, rule, seed, attempt + 1000 * tryN, (f) => {
        // (the field holds it: its sources are placed, no channel is cut)
        contains.add(f.id);
        // (first on the pre-fill's water, which costs no settle: a spring whose pond would stand on
        // the start's ground, or give it no water, is passed over before its water is settled)
        {
          const bw = build([...lay, f], "water");
          const model = waterModel(W, H, bw.heights, mapObjects({ entities: bw.entities.map(entityJson) }));
          const pf = prefill(model);
          const guessB = { ...bw, water: pf.depth, contamination: pf.contamination, waterModel: model } as BuildResult;
          if (wetRing(guessB, at) || !(startWaterServed(guessB, rule, droughtDays) <= rule - 2)) {
            contains.delete(f.id);
            return false;
          }
        }
        const bs = build([...lay, f], "resources");
        const ok = bs.settle.settled && !wetRing(bs, at) && startWaterServed(bs, rule, droughtDays) <= rule - 2 && !sourcesInFlow(bs.waterModel, mapObjects({ entities: bs.entities.map(entityJson) }), bs.water).inFlow.length;
        if (ok) b = bs;
        else contains.delete(f.id);
        return ok;
      });
      if (!spring) why = sealed ? "start water a sealed puddle" : "start water moved";
      else {
        layout.push(spring);
        fixes.push("spring by the start");
      }
    }
    if (!why && N <= 96 * 96) {
      const objects = planExtras({ spec, base: b, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh });
      const mb = build([...layout, ...objects.filter(f => f.params.kind === "mineSite")], "resources");
      const objs = mapObjects({ entities: mb.entities.map(entityJson) });
      const wet = Uint8Array.from(mb.water, d => d > WET ? 1 : 0);
      if (!mb.start || minesReached(objs, W, H, colonyReach(W, H, mb.heights, wet, objs, mb.start)) < minesWanted(W, H)) why = "mine pair (settled)";
      else provedObjects = objects;
    }
    base = b;
    if (!why) break;
    // (another start on the same settled water, off this one and the ground round it; the last
    // attempt keeps what it has)
    if (!(tryN + 1 < START_TRIES) || lastAttempt) return fail(why, b, true);
    const levelled = h.slice();
    h.set(hBefore);
    const again = nextStart(cur);
    if (!again) {
      h.set(levelled);
      return fail(why, b, true);
    }
    cur = again;
  }
  pick = cur;
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
  // (the mine sites the colony reaches on a build, read with the mine sites' own check: one function
  // for the check and the generator, D342)
  const wantMines = minesWanted(W, H);
  const minesReachedOn = (b: BuildResult): number => {
    if (!b.start) return 0;
    const wetB = new Uint8Array(N);
    for (let i = 0; i < N; i++) wetB[i] = b.water[i] > WET ? 1 : 0;
    const objs = mapObjects({ entities: b.entities.map(entityJson) });
    return minesReached(objs, W, H, colonyReach(W, H, b.heights, wetB, objs, b.start));
  };
  const objects = provedObjects ?? planExtras({ spec, base, features: layout, protect, avoid: avoidOf(bad, false), candidate: 0, attempt, relicHigh: !!g.relicHigh });
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
    // (and none that cuts the colony off from a mine site it reached before they were placed: an
    // object set after the sites, across the slope or the way to one, is left out, thorns first,
    // then the largest; never a mine site)
    if (minesReachedOn(b2) < wantMines) {
      const sitesOnly = kept.filter((f) => f.params.kind === "mineSite");
      const before = Math.min(wantMines, minesReachedOn(build([...layout, ...sitesOnly], "resources")));
      while (minesReachedOn(b2) < before) {
        const blockers = kept.filter((f) => f.params.kind !== "mineSite");
        if (!blockers.length) break;
        blockers.sort((a, c) => (a.params.kind === "thornBelt" ? 0 : 1) - (c.params.kind === "thornBelt" ? 0 : 1) || own(c) - own(a));
        kept.splice(kept.indexOf(blockers[0]), 1);
        b2 = build([...layout, ...kept], "resources");
      }
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
          // (the debris never cuts the colony off from a mine site it reached: Delta 128² seed 37's
          // stood across the way to both)
          if (startWalksTo(b3, x, y) || minesReachedOn(b3) < Math.min(wantMines, minesReachedOn(b2))) continue;
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
    stage: landStage,
    // (a ruler-straight channel on a shown land is its water's shape: no plan on it mends that)
    stuck: !passed && !!straight,
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
