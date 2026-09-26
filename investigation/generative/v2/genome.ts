// The genome, design version 2 (docs/m9-design.md §3). Version 1's genome (../proto/genome.ts) with
// four changes:
// 1. Relief at the official and workshop medians: the land spans from a low base (1–2) to a top of
//    15–16, and the hypsometry (how the land shares out over the levels) is its own draw.
// 2. Verticality (`vt`, 0–100, D132): how vertical the land is. It sets the cliff benches, the
//    caprock that weathers into stacks and mesas, how deep rivers cut (gorges, hanging valleys),
//    and, at 70 and above, a top above 16, which stays locked until a DGM Probe batch confirms such
//    maps load (Kyler, 2026-09-25): locked, the top is 16 whatever the value.
// 3. Wider priors (task b): every part in every theme at some weight, a slow regional field beside
//    (or instead of) the regional tilt, so the layout is not one tilted plane turned eight ways, and
//    water drawn over the whole workshop range (lakes, islands, several rivers).
// 4. Intentions (D138): zero, one or two outcomes the processes are steered toward.
//
// A theme is still a prior over one parameter space; nothing here fixes a layout.

import { stream, type Rng } from "../../../src/core/math/rng";
import type { ThemeId } from "../../../src/core/spec/mapspec";
import type { Genome, Part, PartKind } from "../proto/genome";
import { clamp } from "../proto/num";
import { drawIntentions, nudgeFor, type IntentionId } from "./intentions";

export type { Part, PartKind };

/** The theme defaults of Verticality (investigation/terrain3d, PLAN §5.9). */
export const VT_DEFAULT: Record<ThemeId, number> = { riverValley: 20, canyon: 40, highlands: 45, lakeBasin: 10, delta: 10, islands: 20 };
/** "High Verticality" (D123, D132). */
export const VT_HIGH = 70;
/** The game's highest terrain (FORMAT.md: 23 layers, layer 22 kept empty). */
export const GAME_TOP = 22;
export const EDITOR_TOP = 16;

export interface GenomeV2 extends Genome {
  /** The Verticality setting, and the value the map was drawn with (Surprise me and high Variety
   *  may jump it). */
  vtSetting: number;
  vt: number;
  /** Heights above 16 (D172: confirmed in the game; the prototype measures them before the build). */
  unlocked: boolean;
  /** The highest level the land reaches, and the lowest ground before rivers cut. */
  top: number;
  /** Hypsometry: `eq` blends the field toward equal area per level (0–0.8); `lean` < 1 raises the
   *  land (more upland), > 1 lowers it (more lowland). */
  hyps: { eq: number; lean: number };
  /** The slow regional field (an independent spatial control, playbook #1): levels and cell. */
  regional: { amp: number; cell: number };
  /** Caprock: hard rock high in the land that weathering leaves standing (stacks, buttes, mesas). */
  cap: { share: number; cell: number; level: number };
  /** How far soft high ground weathers down toward the ground round it (0–1). */
  weathering: number;
  /** Extra levels the main river cuts below its tributaries (hanging valleys, falls at confluences). */
  hanging: number;
  /** Knickpoints: a river's drops within this many tiles gather into one fall (0: none). */
  knick: number;
  /** The chance that a big hollow no river crosses holds a spring (a spring lake). */
  lakeSprings: number;
  /** How far the water's way wanders from the steepest descent (noise in levels; 0.9 when absent),
   *  and the size of its wanders in tiles (14 when absent). */
  wander?: number;
  wanderCell?: number;
  /** Chance that an upland cut off by cliffs gets a natural ramp (talus or gully) down to the land
   *  below; the rest need stairs (rewards). */
  ramps: number;
  /** Where terraces sit: a phase for the bench grid, in levels. */
  benchPhase: number;
  intentions: IntentionId[];
  /** A variation index (D143): 0 for the map itself. */
  variation: number;
  /** The woods (D164: starting wood counts logs by species): the grove species weights the
   *  resources planner draws from, and the character they give the map. Oak-rich woods hold
   *  plenty of wood and regrow slowly (30 days); birch-rich ones little a tree and regrow fast
   *  (7 days); mixed is the product's default mix. */
  woods: { kind: "oak" | "mixed" | "birch"; pine: number; birch: number; oak: number; succulent: number };
}

/** How often each theme's woods lean oak-rich or birch-rich at Variety 70 (the rest are mixed). */
const WOODS: Record<ThemeId, [number, number]> = {
  riverValley: [0.3, 0.25],
  canyon: [0.35, 0.2],
  highlands: [0.4, 0.2],
  lakeBasin: [0.25, 0.35],
  delta: [0.2, 0.4],
  islands: [0.3, 0.3],
};

/** The woods, from their own stream (so the other draws stay as they were). */
export function drawWoods(theme: ThemeId, seed: number, attempt: number, vy: number): GenomeV2["woods"] {
  const rng = stream(seed, "woods", attempt);
  const [po, pb] = WOODS[theme];
  const k = Math.min(1.25, vy / 70);
  const r = rng.float();
  const j = (lo: number, hi: number) => Math.round(lo + (hi - lo) * rng.float());
  if (r < po * k) return { kind: "oak", oak: j(55, 75), pine: j(15, 30), birch: j(3, 12), succulent: j(0, 6) };
  if (r < (po + pb) * k) return { kind: "birch", birch: j(45, 65), pine: j(25, 40), oak: j(0, 8), succulent: j(0, 6) };
  return { kind: "mixed", pine: j(38, 56), birch: j(20, 34), oak: j(14, 26), succulent: j(3, 9) };
}

interface Range {
  lo: number;
  hi: number;
}

interface PriorV2 {
  base: Range;
  top: Range;
  eq: Range;
  lean: Range;
  tilt: Range;
  /** Chances of a linear tilt, a radial one (toward a bowl), else the regional field alone. */
  linear: number;
  radial: number;
  regional: Range;
  amp: Range;
  cell: Range;
  warp: Range;
  ridged: Range;
  parts: Partial<Record<PartKind, number>>;
  partCount: Range;
  knollsPer128: Range;
  erosion: { iterations: Range; k: Range; diffusion: Range };
  terrace: { step: number[]; share: Range };
  inflows: number[];
  springs: Range;
  flowMul: Range;
  lakeBudget: Range;
  /** Extra basins (lakes) drawn beyond the parts, as a count range. */
  lakes: Range;
  /** Spring lakes (hydro.ts). */
  lakeSprings: number;
  split: number;
  delta: number;
  incise: Range;
  floor: Range;
  cap: Range;
  badwater: [number, number, number];
  thorns: number;
  recipes: Partial<Record<string, number>>;
}

const ALL: PartKind[] = ["ridge", "trough", "basin", "caldera", "mesa", "mesaField", "escarpment", "cone", "plateau", "knolls", "spiral"];
/** Every part can appear in every theme (task b): the theme's weight, or this floor. */
const PART_FLOOR = 0.3;

const P: Record<ThemeId, PriorV2> = {
  riverValley: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.3, hi: 18.3 }, eq: { lo: 0.4, hi: 0.9 }, lean: { lo: 0.75, hi: 1.35 },
    tilt: { lo: 0.3, hi: 2.6 }, linear: 0.4, radial: 0.12, regional: { lo: 3, hi: 7 },
    amp: { lo: 3, hi: 6.5 }, cell: { lo: 24, hi: 56 }, warp: { lo: 4, hi: 18 }, ridged: { lo: 0, hi: 0.5 },
    parts: { ridge: 2, trough: 1, basin: 1.2, mesa: 1, escarpment: 1.2, plateau: 2, knolls: 2, caldera: 0.4, cone: 0.4, mesaField: 0.4 },
    partCount: { lo: 2, hi: 5 }, knollsPer128: { lo: 4, hi: 14 },
    erosion: { iterations: { lo: 8, hi: 22 }, k: { lo: 0.01, hi: 0.035 }, diffusion: { lo: 0.02, hi: 0.1 } },
    terrace: { step: [1, 2, 2, 3, 3], share: { lo: 0.15, hi: 0.65 } },
    inflows: [0, 1, 1, 1, 2, 2, 3], springs: { lo: 0, hi: 4 }, flowMul: { lo: 0.9, hi: 2.4 }, lakeBudget: { lo: 0.04, hi: 0.25 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.5,
    split: 0.5, delta: 0.12, incise: { lo: 0, hi: 1.5 }, floor: { lo: 0, hi: 5 }, cap: { lo: 0, hi: 0.25 },
    badwater: [0.2, 0.55, 0.25], thorns: 0.5, recipes: { "island-in-a-river": 0.08, "great-scarp": 0.06 },
  },
  canyon: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.8, hi: 18.4 }, eq: { lo: 0.45, hi: 0.9 }, lean: { lo: 0.7, hi: 1.3 },
    tilt: { lo: 0.3, hi: 2.6 }, linear: 0.45, radial: 0.08, regional: { lo: 3, hi: 6.5 },
    amp: { lo: 2.5, hi: 5.5 }, cell: { lo: 22, hi: 48 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0.2, hi: 0.7 },
    parts: { mesa: 2, mesaField: 1.5, escarpment: 1.5, plateau: 2, ridge: 1, trough: 1.5, knolls: 0.5, cone: 0.3, basin: 0.5, caldera: 0.3 },
    partCount: { lo: 2, hi: 6 }, knollsPer128: { lo: 0, hi: 6 },
    erosion: { iterations: { lo: 14, hi: 30 }, k: { lo: 0.025, hi: 0.06 }, diffusion: { lo: 0, hi: 0.04 } },
    terrace: { step: [2, 2, 3, 3, 4], share: { lo: 0.35, hi: 0.9 } },
    inflows: [0, 1, 1, 1, 2, 2], springs: { lo: 0, hi: 3 }, flowMul: { lo: 0.9, hi: 2 }, lakeBudget: { lo: 0.02, hi: 0.2 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.45,
    split: 0.45, delta: 0.03, incise: { lo: 2, hi: 5 }, floor: { lo: 2, hi: 8 }, cap: { lo: 0.1, hi: 0.5 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.2, recipes: { "mesa-field": 0.1, "great-scarp": 0.08 },
  },
  highlands: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.8, hi: 18.6 }, eq: { lo: 0.45, hi: 0.9 }, lean: { lo: 0.7, hi: 1.25 },
    tilt: { lo: 0.3, hi: 2.4 }, linear: 0.3, radial: 0.15, regional: { lo: 3, hi: 7.5 },
    amp: { lo: 3.5, hi: 7 }, cell: { lo: 20, hi: 44 }, warp: { lo: 6, hi: 18 }, ridged: { lo: 0.1, hi: 0.6 },
    parts: { plateau: 3, mesa: 2, ridge: 2, escarpment: 1.2, cone: 0.8, caldera: 0.6, knolls: 1.5, basin: 0.7, spiral: 0.1 },
    partCount: { lo: 2, hi: 7 }, knollsPer128: { lo: 6, hi: 18 },
    erosion: { iterations: { lo: 8, hi: 20 }, k: { lo: 0.012, hi: 0.035 }, diffusion: { lo: 0.01, hi: 0.08 } },
    terrace: { step: [1, 2, 2, 3, 3], share: { lo: 0.25, hi: 0.75 } },
    inflows: [0, 0, 1, 1, 2, 3], springs: { lo: 1, hi: 6 }, flowMul: { lo: 0.9, hi: 2.2 }, lakeBudget: { lo: 0.03, hi: 0.2 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.55,
    split: 0.3, delta: 0.02, incise: { lo: 0, hi: 2.5 }, floor: { lo: 0, hi: 4 }, cap: { lo: 0.05, hi: 0.4 },
    badwater: [0.35, 0.45, 0.2], thorns: 0.5, recipes: { "badwater-volcano": 0.08, "hanging-lake": 0.08 },
  },
  lakeBasin: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 12.8, hi: 18.2 }, eq: { lo: 0.4, hi: 0.85 }, lean: { lo: 0.75, hi: 1.35 },
    tilt: { lo: 0.3, hi: 2.4 }, linear: 0.15, radial: 0.55, regional: { lo: 3, hi: 7 },
    amp: { lo: 2.5, hi: 5.5 }, cell: { lo: 26, hi: 60 }, warp: { lo: 4, hi: 14 }, ridged: { lo: 0, hi: 0.35 },
    parts: { basin: 4, caldera: 1.5, plateau: 1, knolls: 1.5, ridge: 1, mesa: 0.6, cone: 0.4, escarpment: 0.4 },
    partCount: { lo: 2, hi: 5 }, knollsPer128: { lo: 3, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 16 }, k: { lo: 0.008, hi: 0.025 }, diffusion: { lo: 0.03, hi: 0.12 } },
    terrace: { step: [1, 1, 2, 2, 3], share: { lo: 0.05, hi: 0.55 } },
    inflows: [0, 1, 1, 2, 2, 3], springs: { lo: 0, hi: 4 }, flowMul: { lo: 1.1, hi: 2.6 }, lakeBudget: { lo: 0.1, hi: 0.4 }, lakes: { lo: 1, hi: 4 }, lakeSprings: 1,
    split: 0.25, delta: 0.02, incise: { lo: 0, hi: 1 }, floor: { lo: 0, hi: 4 }, cap: { lo: 0, hi: 0.2 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.2, recipes: { caldera: 0.12, "chain-of-lakes": 0.1 },
  },
  delta: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 12.3, hi: 17.8 }, eq: { lo: 0.35, hi: 0.8 }, lean: { lo: 0.8, hi: 1.45 },
    tilt: { lo: 0.4, hi: 2.8 }, linear: 0.45, radial: 0.08, regional: { lo: 3, hi: 6.5 },
    amp: { lo: 2, hi: 4.5 }, cell: { lo: 28, hi: 64 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0, hi: 0.3 },
    parts: { plateau: 1.2, trough: 1, knolls: 2, basin: 1.2, ridge: 0.7, escarpment: 0.7, mesa: 0.5, cone: 0.3, caldera: 0.3 },
    partCount: { lo: 1, hi: 4 }, knollsPer128: { lo: 4, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 14 }, k: { lo: 0.008, hi: 0.02 }, diffusion: { lo: 0.05, hi: 0.15 } },
    terrace: { step: [1, 1, 2, 2], share: { lo: 0.05, hi: 0.4 } },
    inflows: [1, 1, 2, 2, 3], springs: { lo: 0, hi: 3 }, flowMul: { lo: 1.4, hi: 2.9 }, lakeBudget: { lo: 0.05, hi: 0.3 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.5,
    split: 0.65, delta: 0.8, incise: { lo: 0, hi: 0.8 }, floor: { lo: 2, hi: 8 }, cap: { lo: 0, hi: 0.15 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.1, recipes: { "island-in-a-river": 0.12 },
  },
  islands: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 12.8, hi: 18 }, eq: { lo: 0.35, hi: 0.8 }, lean: { lo: 0.8, hi: 1.45 },
    tilt: { lo: 0, hi: 2 }, linear: 0.05, radial: 0.75, regional: { lo: 3, hi: 7 },
    amp: { lo: 3, hi: 6 }, cell: { lo: 16, hi: 36 }, warp: { lo: 4, hi: 14 }, ridged: { lo: 0, hi: 0.35 },
    parts: { basin: 5, knolls: 2, cone: 1, caldera: 0.6, mesa: 0.8, plateau: 0.6, ridge: 0.3 },
    partCount: { lo: 1, hi: 4 }, knollsPer128: { lo: 6, hi: 16 },
    erosion: { iterations: { lo: 4, hi: 12 }, k: { lo: 0.006, hi: 0.02 }, diffusion: { lo: 0.03, hi: 0.1 } },
    terrace: { step: [1, 2, 2, 3], share: { lo: 0.05, hi: 0.45 } },
    inflows: [1, 1, 2, 2, 3], springs: { lo: 0, hi: 3 }, flowMul: { lo: 1.6, hi: 3.2 }, lakeBudget: { lo: 0.2, hi: 0.5 }, lakes: { lo: 0, hi: 2 }, lakeSprings: 0.6,
    split: 0.15, delta: 0.02, incise: { lo: 0, hi: 0.5 }, floor: { lo: 0, hi: 3 }, cap: { lo: 0, hi: 0.2 },
    badwater: [0.4, 0.45, 0.15], thorns: 0.1, recipes: { "volcano-island": 0.12 },
  },
};

/** Variety widens a range: at 0 the middle third, at 70 the range, at 100 half as wide again. */
export function draw(rng: Rng, r: Range, vy: number): number {
  const mid = (r.lo + r.hi) / 2;
  const half = (r.hi - r.lo) / 2;
  const k = vy <= 70 ? 1 / 3 + ((2 / 3) * vy) / 70 : 1 + (0.5 * (vy - 70)) / 30;
  return mid + (rng.float() * 2 - 1) * half * k;
}

function pickPart(rng: Rng, w: Partial<Record<PartKind, number>>, vy: number): PartKind {
  // every part at least at the floor; Variety flattens further toward uniform
  const flat = vy >= 85 ? 0.5 : vy >= 60 ? 0.15 : 0;
  const base = ALL.map((k) => Math.max(w[k] ?? 0, k === "spiral" ? 0.05 : PART_FLOOR));
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  return ALL[rng.weighted(base.map((b) => b * (1 - flat) + flat * mean))];
}

/** Terrace bench heights by Verticality: taller benches (cliffs) as it rises. */
function stepsFor(theme: number[], vt: number): number[] {
  if (vt >= 85) return [3, 4, 4, 5];
  if (vt >= 70) return [2, 3, 3, 4];
  if (vt >= 55) return theme.map((s) => Math.min(4, s + 1));
  if (vt >= 35) return theme.map((s, k) => (k % 2 ? Math.min(3, s + 1) : s));
  return theme;
}

function randomPart(rng: Rng, kind: PartKind, W: number, H: number, vy: number, tall: number): Part {
  const side = Math.min(W, H);
  const at: [number, number] = [0.12 + 0.76 * rng.float(), 0.12 + 0.76 * rng.float()];
  const turn = rng.float();
  const w = (lo: number, hi: number) => draw(rng, { lo, hi }, vy);
  switch (kind) {
    case "ridge":
      return { kind, at, size: w(40, Math.min(110, 0.9 * side)), height: w(2, 5) * tall, turn, extra: w(5, 11), soft: 0 };
    case "trough":
      return { kind, at, size: w(40, Math.min(110, 0.9 * side)), height: -w(2, 4) * tall, turn, extra: w(6, 12), soft: 0 };
    case "basin":
      return { kind, at: [0.2 + 0.6 * rng.float(), 0.2 + 0.6 * rng.float()], size: w(12, 32), height: -w(2.5, 5.5), turn, extra: w(0, 2.5), soft: rng.float() < 0.35 ? w(1.5, 4) : 0 };
    case "caldera":
      return { kind, at: [0.25 + 0.5 * rng.float(), 0.25 + 0.5 * rng.float()], size: w(12, 24), height: w(2.5, 4.5) * tall, turn, extra: rng.float() < 0.6 ? w(3, 6) : 0, soft: 3 };
    case "mesa":
      return { kind, at, size: w(8, 20), height: w(3, 6.5) * tall, turn, extra: w(0.2, 0.8), soft: w(0.5, 2) / tall };
    case "mesaField":
      return { kind, at, size: w(16, 34), height: w(2, 5) * tall, turn, extra: Math.round(w(4, 11)), soft: 0.8 / tall };
    case "escarpment":
      // `size` is the band's length in tiles (a scarp that dies out, not a step across the map)
      return { kind, at: [0.2 + 0.6 * rng.float(), 0.2 + 0.6 * rng.float()], size: w(36, Math.min(110, 0.9 * side)), height: w(2, 5.5) * tall, turn, extra: w(4, 10), soft: w(0.6, 2.5) / tall };
    case "cone":
      return { kind, at: [0.2 + 0.6 * rng.float(), 0.2 + 0.6 * rng.float()], size: w(10, 18), height: w(4, 7.5) * tall, turn, extra: rng.float() < 0.7 ? w(2, 4) : 0, soft: 0 };
    case "plateau":
      return { kind, at, size: w(14, 32), height: w(2, 4.5) * tall, turn, extra: w(0.2, 0.8), soft: w(1.2, 4) / tall };
    case "knolls":
      return { kind, at, size: w(18, 40), height: w(1, 2.5), turn, extra: Math.round(w(4, 10)), soft: 0 };
    case "spiral":
      return { kind, at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size: w(14, 22), height: w(5, 8), turn, extra: w(1.25, 2.25), soft: 0 };
  }
}

function applyRecipe(g: GenomeV2, recipe: string, rng: Rng, W: number, H: number, tall: number): void {
  const vy = g.variety;
  const add = (kind: PartKind, over: Partial<Part> = {}) => g.parts.push({ ...randomPart(rng, kind, W, H, vy, tall), ...over });
  switch (recipe) {
    case "island-in-a-river":
      g.hydro.split = 1;
      break;
    case "great-scarp":
      add("escarpment", { size: 3 * Math.max(W, H), height: (4 + 2 * rng.float()) * tall, soft: 1 / tall });
      break;
    case "mesa-field":
      add("mesaField", { extra: 8 + Math.floor(6 * rng.float()) });
      break;
    case "badwater-volcano":
      add("cone", { height: (6 + 2 * rng.float()) * tall, extra: 3 });
      g.hazards.badwater = "pit";
      break;
    case "hanging-lake":
      add("mesa", { size: 16 + 6 * rng.float(), height: (5 + 2 * rng.float()) * tall, soft: 0.8 / tall });
      g.hydro.springs = Math.max(1, g.hydro.springs);
      break;
    case "caldera":
      add("caldera", { extra: 4 + 2 * rng.float() });
      break;
    case "chain-of-lakes":
      for (let k = 0; k < 3; k++) add("basin", { size: 10 + 8 * rng.float(), height: -(2.5 + 2 * rng.float()) });
      break;
    case "volcano-island":
      add("cone", { at: [0.4 + 0.2 * rng.float(), 0.4 + 0.2 * rng.float()], height: 7 * tall, extra: 2.5 });
      break;
  }
}

export const RECIPES = ["island-in-a-river", "great-scarp", "mesa-field", "badwater-volcano", "hanging-lake", "caldera", "chain-of-lakes", "volcano-island"] as const;

export interface DrawOptions {
  variety?: number;
  /** The Verticality setting (the theme's default when absent). */
  vt?: number;
  /** Heights above 16 allowed (D172; the product's build still caps at 16 until M9a). */
  unlocked?: boolean;
  /** Intentions: drawn when absent; [] for none; a list forces those (steering tests). */
  intentions?: IntentionId[] | null;
  /** D143: a sibling of the map (1, 2, …): the same draws, nudged, over different land. */
  variation?: number;
}

/** The Verticality the map is drawn with: the setting, jittered at high Variety, and now and then
 *  jumped to the extremes by Surprise me (Variety 85+). */
export function effectiveVt(setting: number, vy: number, rng: Rng): number {
  let vt = setting;
  if (vy >= 60) vt += (rng.float() * 2 - 1) * 15 * ((vy - 60) / 40);
  if (vy >= 85 && rng.float() < 0.04 + (0.12 * (vy - 85)) / 15) vt = 70 + 30 * rng.float();
  return Math.round(clamp(vt, 0, 100));
}

export function drawGenomeV2(theme: ThemeId, seed: number, W: number, H: number, attempt: number, o: DrawOptions = {}): GenomeV2 {
  const variation = o.variation ?? 0;
  // a variation draws from the same stream as the map (so its settings and intentions match) and
  // nudges the continuous values; its land comes from its own noise seeds (field.ts)
  const rng = stream(seed, "genome2", theme, attempt);
  const nudge = variation ? stream(seed, "variation", theme, attempt, variation) : null;
  const p = P[theme];
  const vy = clamp(o.variety ?? 70, 0, 100);
  const areaK = (W * H) / (128 * 128);
  const vtSetting = clamp(o.vt ?? VT_DEFAULT[theme], 0, 100);
  const vt = effectiveVt(vtSetting, vy, rng);
  const v = vt / 100;
  const unlocked = !!o.unlocked && vt >= VT_HIGH;
  // taller parts as Verticality rises
  const tall = 1 + 0.6 * v;
  const d = (r: Range) => {
    const x = draw(rng, r, vy);
    return nudge ? x + (nudge.float() * 2 - 1) * 0.12 * (r.hi - r.lo) : x;
  };
  const tiltRoll = rng.float();
  const tiltKind: GenomeV2["tiltKind"] = tiltRoll < p.linear ? "linear" : tiltRoll < p.linear + (vy >= 85 ? Math.max(p.radial, 0.2) : p.radial) ? "radial" : "linear";
  const fieldOnly = tiltRoll >= p.linear + p.radial;
  const topLocked = d(p.top) + 0.8 * v;
  const top = unlocked ? EDITOR_TOP + ((GAME_TOP - EDITOR_TOP) * (vt - VT_HIGH)) / (100 - VT_HIGH) : Math.min(EDITOR_TOP, topLocked);
  const g: GenomeV2 = {
    theme,
    variety: vy,
    recipe: null,
    base: clamp(d(p.base), 0.2, 3),
    relief: 0,
    flowDir: rng.int(0, 8),
    tilt: fieldOnly ? 0.3 * Math.max(0, d(p.tilt)) : Math.max(0, d(p.tilt)),
    tiltKind,
    focus: [0.25 + 0.5 * rng.float(), 0.25 + 0.5 * rng.float()],
    noise: {
      amp: d(p.amp),
      cell: d(p.cell),
      octaves: 3 + rng.int(0, 2),
      warp: Math.max(0, d(p.warp)),
      warpCell: 30 + 40 * rng.float(),
      ridged: clamp(d(p.ridged) + 0.2 * v, 0, 1),
    },
    parts: [],
    erosion: {
      iterations: Math.round(Math.max(0, d(p.erosion.iterations))),
      k: Math.max(0, d(p.erosion.k)) * (1 + 0.5 * v),
      diffusion: clamp(d(p.erosion.diffusion) * (1 - 0.6 * v), 0, 0.2),
    },
    terrace: {
      step: 1,
      share: clamp(d(p.terrace.share) + 0.3 * v, 0, 1),
      cell: 20 + 30 * rng.float(),
      jitter: 0.12 + 0.18 * rng.float(),
    },
    hydro: {
      inflows: p.inflows[rng.int(0, p.inflows.length)],
      springs: Math.round(Math.max(0, d(p.springs))),
      flowMul: Math.max(0.8, d(p.flowMul)),
      lakeBudget: clamp(d(p.lakeBudget), 0.01, 0.45),
      split: p.split,
      delta: p.delta,
      incise: Math.max(0, d(p.incise)) + 3 * v * v,
      floor: Math.max(0, d(p.floor)),
    },
    hazards: { badwater: (["none", "pit", "stream"] as const)[rng.weighted(p.badwater)], ratio: 0.3 + 0.7 * rng.float(), thorns: rng.float() < p.thorns },
    resources: {
      forest: Math.round(clamp(d({ lo: 60, hi: 190 }), 50, 200)),
      bushes: Math.round(clamp(d({ lo: 70, hi: 280 }), 50, 300)),
      ruins: Math.round(clamp(d({ lo: 50, hi: 230 }), 25, 300)),
      grove: (["scattered", "normal", "normal", "bigWoods"] as const)[rng.int(0, 4)],
    },
    settler: [0, 0, 0, 0, 0, 0].map(() => 0.2 + rng.float()),
    vtSetting,
    vt,
    unlocked,
    top,
    hyps: { eq: clamp(d(p.eq) + 0.15 * v, 0, 0.9), lean: clamp(d(p.lean), 0.45, 2) },
    regional: { amp: Math.max(0, d(p.regional)) * (fieldOnly ? 1.4 : 1), cell: (0.28 + 0.32 * rng.float()) * Math.min(W, H) },
    cap: { share: clamp(d(p.cap) + 0.5 * v * v, 0, 0.75), cell: (5 + 9 * rng.float()) * (1 - 0.6 * v), level: 0.45 + 0.35 * rng.float() },
    weathering: clamp(0.15 + 0.85 * v * (0.6 + 0.8 * rng.float()), 0, 1),
    hanging: (0.6 + 2.6 * v) * rng.float(),
    knick: rng.float() < 0.25 + 0.6 * v ? 5 + 12 * v * rng.float() + 4 * rng.float() : 0,
    lakeSprings: p.lakeSprings,
    ramps: clamp(1 - 0.75 * v * v, 0.2, 1),
    benchPhase: rng.float(),
    intentions: [],
    variation,
    woods: { kind: "mixed", pine: 47, birch: 27, oak: 20, succulent: 6 },
  };
  g.terrace.step = (() => {
    const s = stepsFor(p.terrace.step, vt);
    return s[rng.int(0, s.length)];
  })();
  g.relief = g.top - g.base;
  if (g.hydro.inflows === 0 && g.hydro.springs === 0) g.hydro.springs = 2;
  // parts: counts per 128² map, in proportion to the area (#21: the same detail per tile)
  const n = Math.max(1, Math.round((d(p.partCount) + 0.5) * Math.max(1, areaK)));
  for (let k = 0; k < n; k++) g.parts.push(randomPart(rng, pickPart(rng, p.parts, vy), W, H, vy, tall));
  // extra lakes: basins beyond the parts, so water spans the workshop's range
  const lakes = Math.max(0, Math.round(d(p.lakes) * Math.max(1, Math.sqrt(areaK))));
  for (let k = 0; k < lakes; k++) g.parts.push(randomPart(rng, "basin", W, H, vy, tall));
  // a radial slope falls toward the first bowl when there is one
  const bowl = g.parts.find((q) => q.kind === "basin" || q.kind === "caldera");
  if (g.tiltKind === "radial" && bowl) g.focus = [bowl.at[0], bowl.at[1]];
  if (theme === "islands") {
    // Kyler (2026-09-25): islands in a sea: a broad body of water with the land scattered through
    // it, on every Islands map (a sea inland, since water that reaches the edge leaves the map)
    // the sea lies in the map's middle, so the land rises from it toward every edge
    g.tiltKind = "radial";
    g.focus = [0.42 + 0.16 * rng.float(), 0.42 + 0.16 * rng.float()];
    // a map that needed a new genome gets a smaller sea (a broad sea settles slowly on large maps)
    const R = Math.min(W, H) * (0.36 + 0.08 * rng.float()) * Math.max(0.75, 1 - 0.05 * attempt);
    const depth = 9 + 2.5 * rng.float();
    g.parts.push({ kind: "basin", at: [g.focus[0], g.focus[1]], size: R, height: -depth, turn: rng.float(), extra: 0, soft: 0, shape: "sea" });
    g.hydro.lakeBudget = Math.max(g.hydro.lakeBudget, 0.42 + 0.1 * rng.float());
    // islands scattered through the sea, standing clear of it
    const isles = Math.round((12 + 10 * rng.float()) * Math.max(1, areaK));
    for (let k = 0; k < isles; k++) {
      const [ux, uy] = [rng.float() * 2 - 1, rng.float() * 2 - 1];
      const r = (0.1 + 0.8 * rng.float()) / Math.max(1, Math.sqrt(ux * ux + uy * uy));
      g.parts.push({ kind: rng.float() < 0.35 ? "cone" : "mesa", at: [g.focus[0] + (ux * r * R) / W, g.focus[1] + (uy * r * R) / H], size: 3 + 6 * rng.float(), height: depth + (1.5 + 4 * rng.float()) * tall, turn: rng.float(), extra: 0, soft: (1 + rng.float()) / tall });
    }
    // the land rises from the sea toward every edge: a steep bowl, quiet noise, levels spread by
    // height rather than equal area, so the sea keeps a broad floor below its shores
    g.tilt = Math.max(g.tilt, 8.5 + rng.float());
    g.regional.amp *= 0.4;
    g.noise.amp *= 0.5;
    g.hyps.eq = 0.1 + 0.1 * rng.float();
    // islands are high, soft ground in a low sea: weathering would waste them into it
    g.weathering = Math.min(g.weathering, 0.1);
  }
  const knolls = Math.round(d(p.knollsPer128) * areaK);
  if (knolls > 0) g.parts.push({ kind: "knolls", at: [0.5, 0.5], size: 0, height: 1.5 + rng.float(), turn: 0, extra: knolls, soft: 0 });
  // a recipe, sometimes (at most a forced part)
  const rec = Object.entries(p.recipes) as [string, number][];
  const pool = vy >= 85 ? RECIPES.map((r) => [r, 0.03] as [string, number]).concat(rec) : rec;
  for (const [name, chance] of pool) {
    if (!g.recipe && rng.float() < chance * (vy / 70)) {
      g.recipe = name;
      applyRecipe(g, name, rng, W, H, tall);
    }
  }
  g.woods = drawWoods(theme, seed, attempt, vy);
  // intentions: outcomes the processes are steered toward, never built (D138)
  g.intentions = o.intentions === undefined || o.intentions === null ? drawIntentions(theme, vt, rng) : o.intentions.slice();
  for (const id of g.intentions) nudgeFor(id)(g, rng, W, H);
  return g;
}

export { randomPart };
