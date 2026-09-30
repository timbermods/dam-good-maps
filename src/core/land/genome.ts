// The genome (docs/m9-design.md §3): every number one map is made from, drawn from its theme's
// prior. A theme is not a layout: it is a prior over one parameter space (how likely each landform
// part is, how strong the processes run, how much water enters and where). Every part can appear in
// every theme; the prior only weights them. Variety (0–100) widens every range and flattens the part
// weights toward uniform. The recipes are folded into intentions (D275 (1)).
//
// "Any" (the default, D208, D209) draws from broad ranges across all six themes: each range spans
// the lowest to the highest of theirs, each chance is their mean, and the island sea is one of the
// water features it may combine with anything else. Choosing a theme only leans the ranges.
//
// Verticality (`vt`, 0–100, D132) sets the cliff benches, the caprock that weathers into stacks and
// mesas, how deep rivers cut, and, at 70 and above, a top above 16 (up to 22; the tall-maps probe
// batch confirmed such maps load, D172). Intentions (D138): zero, one or two outcomes the processes
// are steered toward (intentions.ts).
//
// Ported from the design version 2 prototype (investigation/generative/v2/genome.ts, with version
// 1's types from proto/genome.ts). The draws are the prototype's, in its order, so a theme's genome
// is the prototype's for the same seed; `leanGenome` then applies the map's settings.

import { stream, type Rng } from "../math/rng";
import { RESERVE, reservoirNeeded } from "../gen/calibrated";
import { EDITOR_LEVEL, highestTerrainDefault, TALL_TOP, THEME_PRESETS, VT_DEFAULT, VT_TALL, type Difficulty, type Settings, type ThemeId } from "../spec/mapspec";
import { drawIntentions, nudgeFor, tooSmallFor, type IntentionId } from "./intentions";
import { clamp, unit } from "./num";
import { TWO_PI } from "../math/detmath";

export type PartKind = "ridge" | "trough" | "basin" | "caldera" | "mesa" | "mesaField" | "escarpment" | "cone" | "plateau" | "knolls" | "spiral";

/** One landform part added to the uplift (field.ts). */
export interface Part {
  kind: PartKind;
  /** Centre or anchor, as fractions of the map (0–1). */
  at: [number, number];
  /** Main size in tiles (radius, half-width, length). */
  size: number;
  /** Levels it adds (negative lowers). */
  height: number;
  /** Turns (0–1) for oriented parts. */
  turn: number;
  /** A second size or a count, by kind. */
  extra: number;
  /** Softness of its edge in tiles (cliffs are sharp). */
  soft: number;
  /** Basins only: a round bowl (a pond, a crater lake), a valley-shaped lake (the default for large
   *  basins), or an island sea. */
  shape?: "round" | "valley" | "sea";
  /** An island of a sea layout (D350: the land stage keeps it apart from the shore). */
  isle?: boolean;
}

/** The six themes the generator knows, without "Any". */
export type Leaning = Exclude<ThemeId, "any">;
export const LEANINGS: readonly Leaning[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];

export interface Genome {
  theme: ThemeId;
  variety: number;
  /** Lowest ground level before rivers cut, and the spread of levels (`top` − `base`). */
  base: number;
  relief: number;
  /** The regional slope toward the outlet side: one of the 8 flow directions (east first, CCW). */
  flowDir: number;
  tilt: number;
  /** linear: the land falls toward the outlet side; radial: it falls toward a basin. */
  tiltKind: "linear" | "radial";
  /** Where a radial slope falls to (fractions of the map). */
  focus: [number, number];
  noise: { amp: number; cell: number; octaves: number; warp: number; warpCell: number; ridged: number };
  parts: Part[];
  erosion: { iterations: number; k: number; diffusion: number };
  /** Terraces: bench height in levels, the share of the map terraced, the noise cell of the
   *  terraced mask and the waviness of contour edges. */
  terrace: { step: number; share: number; cell: number; jitter: number };
  hydro: {
    inflows: number;
    /** The Rivers setting's count, which the hydrology finds exactly when it can (set by `leanGenome`). */
    exactInflows?: boolean;
    /** Springs added toward land far from the water (D333 (3)); false where the player asked for
     *  Generous buildable land (set by `leanGenome`). */
    reachSprings?: boolean;
    /** River style Straight: how far (0–1) each course is drawn toward the line between its ends
     *  (set by `leanGenome`). */
    straighten?: number;
    /** River style Braided: the delta fans into one more mouth (set by `leanGenome`). */
    braided?: boolean;
    springs: number;
    /** Total clean flow as a multiple of the size-aware official median. */
    flowMul: number;
    /** The largest share of the map one lake may cover before its outlet is cut down. */
    lakeBudget: number;
    /** Chances that a river splits round an island, and that it fans into a delta. */
    split: number;
    delta: number;
    /** Extra levels a big river cuts below the ground round it, and the half-width of the floor it
     *  clears beside its channel. */
    incise: number;
    floor: number;
    /** M9b intentions' steering (D274): a crescent lake left beside a bend (the oxbow), a chain of
     *  valley lakes stepping down the main river (how many), and a wider, longer island in a split. */
    oxbow?: boolean;
    chainLakes?: number;
    bigSplit?: boolean;
    /** Twin falls: the split goes round the main river's biggest drop. */
    splitAtFall?: boolean;
  };
  /** M9b intentions' steering (D274): a relic on ground the start cannot walk to; a plug across a
   *  big lake's outlet. */
  relicHigh?: boolean;
  plugLake?: boolean;
  /** Item 47's second district close to the start, behind debris on its ramps. */
  districtBehind?: boolean;
  hazards: { badwater: "none" | "pit" | "stream"; ratio: number; thorns: boolean };
  resources: { forest: number; bushes: number; ruins: number; grove: "scattered" | "normal" | "bigWoods" };
  /** What kind of place the settler looks for first: weights over a lake shore, a river bank, a
   *  confluence, below a fall, a high bench, a spring's stream. */
  settler: number[];
  /** The Verticality setting, and the value the map was drawn with (high Variety may jump it). */
  vtSetting: number;
  vt: number;
  /** Heights above 16 (Verticality 70+, D132, D172). */
  tall: boolean;
  /** The highest level the land reaches. */
  top: number;
  /** Hypsometry: `eq` blends the field toward equal area per level; `lean` < 1 raises the land. */
  hyps: { eq: number; lean: number };
  /** The slow regional field (playbook #1): levels and cell. */
  regional: { amp: number; cell: number };
  /** Caprock: hard rock high in the land that weathering leaves standing. */
  cap: { share: number; cell: number; level: number };
  /** How far soft high ground weathers down toward the ground round it (0–1). */
  weathering: number;
  /** Extra levels the main river cuts below its tributaries (hanging valleys). */
  hanging: number;
  /** Knickpoints: a river's drops within this many tiles gather into one fall (0: none). */
  knick: number;
  /** The chance that a big hollow no river crosses holds a spring (a spring lake). */
  lakeSprings: number;
  /** The most spring lakes, and the least hollow that may hold one, in tiles (Lakes and basins
   *  above the theme's own; 4 and 100 when absent). */
  lakeSpringMax?: number;
  lakeSpringMin?: number;
  /** How far the water's way wanders from the steepest descent (levels), and the size of its
   *  wanders in tiles. */
  wander: number;
  wanderCell: number;
  /** Chance that an upland cut off by cliffs gets a natural ramp down to the land below. */
  ramps: number;
  /** Where terraces sit: a phase for the bench grid, in levels. */
  benchPhase: number;
  /** Valley lakes: stretches of a river's valley deepened in their middle (hydro.ts), the mean count. */
  troughs: number;
  /** An island sea in the map's middle, with islands scattered through it (Islands; one of the
   *  water features "Any" combines freely). */
  sea: boolean;
  /** How the island sea lies (M9b, D209, D294): in the map's middle, off one edge, an archipelago
   *  across the map, an island chain, atolls, or two seas; null without a sea. */
  seaLayout?: SeaLayout | null;
  /** Falls on the rivers (the Waterfalls setting): 0 spreads every drop along the course (no
   *  falls), 1 lets the land decide, 2 gathers more of them. */
  falls: 0 | 1 | 2;
  intentions: IntentionId[];
  /** A variation index (D143): 0 for the map itself. */
  variation: number;
  /** The orientation the map's land was turned into (M9b, D275 (2); land/orient.ts). */
  orientation?: number;
  /** The woods (D164): the grove species weights the resources planner draws. */
  woods: { kind: "oak" | "mixed" | "birch"; pine: number; birch: number; oak: number; succulent: number };
}

export { VT_DEFAULT };
/** "High Verticality" (D123, D132): heights above 16 from here. */
export const VT_HIGH = VT_TALL;
/** The game's highest terrain (FORMAT.md: 23 layers, layer 22 kept empty). */
export const GAME_TOP = TALL_TOP;
/** The in-game map editor's highest level, and the top of every map below high Verticality. */
export const EDITOR_TOP = EDITOR_LEVEL;
/** The land isn't built at the bottom (the forces-preview feedback's item 47, PLAN §20 D325): the
 *  deepest bed of any water stands at least this many levels above the map's floor, so a player has
 *  room to dig and terraform early. The land's lowest level is a level above it. */
export const BED_FLOOR = 3;
/** Variety's default (M9b adds the setting). */
export const DEFAULT_VARIETY = 70;

interface Range {
  lo: number;
  hi: number;
}

interface Prior {
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
  lakeSprings: number;
  split: number;
  delta: number;
  incise: Range;
  floor: Range;
  cap: Range;
  badwater: [number, number, number];
  thorns: number;
  /** Valley lakes (the mean count, hydro.ts). */
  troughs: number;
  /** The chance of an island sea. */
  sea: number;
  /** How often the woods lean oak-rich or birch-rich at Variety 70 (the rest are mixed). */
  woods: [number, number];
}

const ALL: PartKind[] = ["ridge", "trough", "basin", "caldera", "mesa", "mesaField", "escarpment", "cone", "plateau", "knolls", "spiral"];
/** Every part can appear in every theme: the theme's weight, or this floor. */
const PART_FLOOR = 0.3;

const P: Record<Leaning, Prior> = {
  riverValley: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.3, hi: 18.3 }, eq: { lo: 0.4, hi: 0.9 }, lean: { lo: 0.75, hi: 1.35 },
    tilt: { lo: 0.3, hi: 2.6 }, linear: 0.4, radial: 0.12, regional: { lo: 3, hi: 7 },
    amp: { lo: 3, hi: 6.5 }, cell: { lo: 24, hi: 56 }, warp: { lo: 4, hi: 18 }, ridged: { lo: 0, hi: 0.5 },
    parts: { ridge: 2, trough: 1, basin: 1.2, mesa: 1, escarpment: 1.2, plateau: 2, knolls: 2, caldera: 0.4, cone: 0.4, mesaField: 0.4 },
    partCount: { lo: 2, hi: 5 }, knollsPer128: { lo: 4, hi: 14 },
    erosion: { iterations: { lo: 8, hi: 22 }, k: { lo: 0.01, hi: 0.035 }, diffusion: { lo: 0.02, hi: 0.1 } },
    terrace: { step: [1, 2, 2, 3, 3], share: { lo: 0.15, hi: 0.65 } },
    inflows: [0, 1, 1, 1, 2, 2, 3], springs: { lo: 0, hi: 4 }, flowMul: { lo: 0.9, hi: 2.4 }, lakeBudget: { lo: 0.04, hi: 0.25 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.5,
    split: 0.5, delta: 0.12, incise: { lo: 0, hi: 1.5 }, floor: { lo: 7, hi: 13 }, cap: { lo: 0, hi: 0.25 },
    badwater: [0.2, 0.55, 0.25], thorns: 0.5,
    troughs: 0.8, sea: 0, woods: [0.3, 0.25],
  },
  canyon: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.8, hi: 18.4 }, eq: { lo: 0.45, hi: 0.9 }, lean: { lo: 0.7, hi: 1.3 },
    tilt: { lo: 0.3, hi: 2.6 }, linear: 0.45, radial: 0.08, regional: { lo: 3, hi: 6.5 },
    amp: { lo: 2.5, hi: 5.5 }, cell: { lo: 22, hi: 48 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0.2, hi: 0.7 },
    parts: { mesa: 2, mesaField: 1.5, escarpment: 1.5, plateau: 2, ridge: 1, trough: 1.5, knolls: 0.5, cone: 0.3, basin: 0.5, caldera: 0.3 },
    partCount: { lo: 2, hi: 6 }, knollsPer128: { lo: 0, hi: 6 },
    erosion: { iterations: { lo: 14, hi: 30 }, k: { lo: 0.025, hi: 0.06 }, diffusion: { lo: 0, hi: 0.04 } },
    terrace: { step: [2, 2, 3, 3, 4], share: { lo: 0.35, hi: 0.9 } },
    inflows: [0, 1, 1, 1, 2, 2], springs: { lo: 2, hi: 5 }, flowMul: { lo: 0.9, hi: 2 }, lakeBudget: { lo: 0.02, hi: 0.2 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.45,
    split: 0.45, delta: 0.03, incise: { lo: 3, hi: 6 }, floor: { lo: 0, hi: 2.5 }, cap: { lo: 0.1, hi: 0.5 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.2,
    troughs: 0.5, sea: 0, woods: [0.35, 0.2],
  },
  highlands: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 13.8, hi: 18.6 }, eq: { lo: 0.45, hi: 0.9 }, lean: { lo: 0.55, hi: 0.9 },
    tilt: { lo: 0.3, hi: 2.4 }, linear: 0.3, radial: 0.15, regional: { lo: 3, hi: 7.5 },
    amp: { lo: 3.5, hi: 7 }, cell: { lo: 20, hi: 44 }, warp: { lo: 6, hi: 18 }, ridged: { lo: 0.1, hi: 0.6 },
    parts: { plateau: 4, mesa: 2.5, ridge: 2, escarpment: 1.2, cone: 0.8, caldera: 0.6, knolls: 1.2, basin: 0.7, spiral: 0.1 },
    partCount: { lo: 4, hi: 8 }, knollsPer128: { lo: 6, hi: 18 },
    erosion: { iterations: { lo: 8, hi: 20 }, k: { lo: 0.012, hi: 0.035 }, diffusion: { lo: 0.01, hi: 0.08 } },
    terrace: { step: [2, 2, 3, 3], share: { lo: 0.4, hi: 0.8 } },
    inflows: [0, 0, 1, 1, 2, 3], springs: { lo: 1, hi: 6 }, flowMul: { lo: 0.9, hi: 2.2 }, lakeBudget: { lo: 0.03, hi: 0.2 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.55,
    split: 0.3, delta: 0.02, incise: { lo: 1.5, hi: 3.5 }, floor: { lo: 0, hi: 3 }, cap: { lo: 0.05, hi: 0.4 },
    badwater: [0.35, 0.45, 0.2], thorns: 0.5,
    troughs: 1, sea: 0, woods: [0.4, 0.2],
  },
  lakeBasin: {
    base: { lo: 0.3, hi: 1.3 }, top: { lo: 12.8, hi: 18.2 }, eq: { lo: 0.4, hi: 0.85 }, lean: { lo: 0.75, hi: 1.35 },
    tilt: { lo: 0.3, hi: 2.4 }, linear: 0.15, radial: 0.55, regional: { lo: 3, hi: 7 },
    amp: { lo: 2.5, hi: 5.5 }, cell: { lo: 26, hi: 60 }, warp: { lo: 4, hi: 14 }, ridged: { lo: 0, hi: 0.35 },
    parts: { basin: 4, caldera: 1.5, plateau: 1, knolls: 1.5, ridge: 1, mesa: 0.6, cone: 0.4, escarpment: 0.4 },
    partCount: { lo: 2, hi: 5 }, knollsPer128: { lo: 3, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 16 }, k: { lo: 0.008, hi: 0.025 }, diffusion: { lo: 0.03, hi: 0.12 } },
    terrace: { step: [1, 1, 2, 2, 3], share: { lo: 0.05, hi: 0.55 } },
    inflows: [0, 1, 1, 1, 2, 2], springs: { lo: 1, hi: 4 }, flowMul: { lo: 0.8, hi: 1.7 }, lakeBudget: { lo: 0.2, hi: 0.45 }, lakes: { lo: 2, hi: 5 }, lakeSprings: 1,
    split: 0.25, delta: 0.02, incise: { lo: 0, hi: 1 }, floor: { lo: 0, hi: 3 }, cap: { lo: 0, hi: 0.2 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.2,
    troughs: 2.2, sea: 0, woods: [0.25, 0.35],
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
    split: 0.65, delta: 1, incise: { lo: 0, hi: 0.8 }, floor: { lo: 2, hi: 8 }, cap: { lo: 0, hi: 0.15 },
    badwater: [0.25, 0.5, 0.25], thorns: 0.1,
    troughs: 0.3, sea: 0, woods: [0.2, 0.4],
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
    badwater: [0.4, 0.45, 0.15], thorns: 0.1,
    troughs: 0.3, sea: 1, woods: [0.3, 0.3],
  },
};

function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function union(rs: readonly Range[]): Range {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rs) {
    if (r.lo < lo) lo = r.lo;
    if (r.hi > hi) hi = r.hi;
  }
  return { lo, hi };
}

/** "Any" (D209): every range from the lowest of the six themes to the highest, every chance and
 *  weight their mean, every list their lists joined (so each theme's options come as often as that
 *  theme would draw them). The island sea is one water feature among the rest (a sixth of maps). */
function anyPrior(): Prior {
  const ps = LEANINGS.map((t) => P[t]);
  const r = (f: (p: Prior) => Range) => union(ps.map(f));
  const m = (f: (p: Prior) => number) => mean(ps.map(f));
  const parts: Partial<Record<PartKind, number>> = {};
  for (const k of ALL) {
    const w = mean(ps.map((p) => p.parts[k] ?? 0));
    if (w > 0) parts[k] = w;
  }
  return {
    base: r((p) => p.base),
    top: r((p) => p.top),
    eq: r((p) => p.eq),
    lean: r((p) => p.lean),
    tilt: r((p) => p.tilt),
    linear: m((p) => p.linear),
    radial: m((p) => p.radial),
    regional: r((p) => p.regional),
    amp: r((p) => p.amp),
    cell: r((p) => p.cell),
    warp: r((p) => p.warp),
    ridged: r((p) => p.ridged),
    parts,
    partCount: r((p) => p.partCount),
    knollsPer128: r((p) => p.knollsPer128),
    erosion: { iterations: r((p) => p.erosion.iterations), k: r((p) => p.erosion.k), diffusion: r((p) => p.erosion.diffusion) },
    terrace: { step: ps.flatMap((p) => p.terrace.step), share: r((p) => p.terrace.share) },
    inflows: ps.flatMap((p) => p.inflows),
    springs: r((p) => p.springs),
    flowMul: r((p) => p.flowMul),
    lakeBudget: r((p) => p.lakeBudget),
    lakes: r((p) => p.lakes),
    lakeSprings: m((p) => p.lakeSprings),
    split: m((p) => p.split),
    delta: m((p) => p.delta),
    incise: r((p) => p.incise),
    floor: r((p) => p.floor),
    cap: r((p) => p.cap),
    badwater: [m((p) => p.badwater[0]), m((p) => p.badwater[1]), m((p) => p.badwater[2])],
    thorns: m((p) => p.thorns),
    troughs: m((p) => p.troughs),
    sea: m((p) => p.sea),
    woods: [m((p) => p.woods[0]), m((p) => p.woods[1])],
  };
}

const PRIORS: Record<ThemeId, Prior> = { any: anyPrior(), ...P };

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
  const avg = base.reduce((a, b) => a + b, 0) / base.length;
  return ALL[rng.weighted(base.map((b) => b * (1 - flat) + flat * avg))];
}

/** Terrace bench heights by Verticality: taller benches (cliffs) as it rises. */
function stepsFor(theme: number[], vt: number): number[] {
  if (vt >= 85) return [3, 4, 4, 5];
  if (vt >= 70) return [2, 3, 3, 4];
  if (vt >= 55) return theme.map((s) => Math.min(4, s + 1));
  if (vt >= 35) return theme.map((s, k) => (k % 2 ? Math.min(3, s + 1) : s));
  return theme;
}

export function randomPart(rng: Rng, kind: PartKind, W: number, H: number, vy: number, tall: number): Part {
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
      // `size` is the band's length in tiles: a scarp that dies out, not a step across the map
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

/** The woods, from their own stream (so the other draws stay as they are). */
export function drawWoods(theme: ThemeId, seed: number, attempt: number, vy: number): Genome["woods"] {
  const rng = stream(seed, "woods", attempt);
  const [po, pb] = PRIORS[theme].woods;
  const k = Math.min(1.25, vy / 70);
  const r = rng.float();
  const j = (lo: number, hi: number) => Math.round(lo + (hi - lo) * rng.float());
  if (r < po * k) return { kind: "oak", oak: j(55, 75), pine: j(15, 30), birch: j(3, 12), succulent: j(0, 6) };
  if (r < (po + pb) * k) return { kind: "birch", birch: j(45, 65), pine: j(25, 40), oak: j(0, 8), succulent: j(0, 6) };
  return { kind: "mixed", pine: j(38, 56), birch: j(20, 34), oak: j(14, 26), succulent: j(3, 9) };
}

export interface DrawOptions {
  variety?: number;
  /** The Verticality setting (the theme's default when absent). */
  vt?: number;
  /** Heights above 16 at Verticality 70+ (D172: confirmed in the game). Default true; false keeps
   *  every map within 16 (the prototype's locked draw, for comparisons). */
  tallAllowed?: boolean;
  /** Intentions: drawn when absent; [] for none; a list forces those (steering). */
  intentions?: IntentionId[] | null;
  /** D143: a sibling of the map (1, 2, …): the same draws, nudged, over different land. */
  variation?: number;
}

/** The Verticality the map is drawn with: the setting, jittered at high Variety, and now and then
 *  jumped to the extremes (Variety 85+). */
export function effectiveVt(setting: number, vy: number, rng: Rng): number {
  let vt = setting;
  if (vy >= 60) vt += (rng.float() * 2 - 1) * 15 * ((vy - 60) / 40);
  if (vy >= 85 && rng.float() < 0.04 + (0.12 * (vy - 85)) / 15) vt = 70 + 30 * rng.float();
  return Math.round(clamp(vt, 0, 100));
}

/** The top of a tall map (Verticality 70+): 16 at 70, rising to 22 at 100 (decisions-pending #60). */
export function tallTop(vt: number): number {
  return EDITOR_TOP + ((GAME_TOP - EDITOR_TOP) * (vt - VT_HIGH)) / (100 - VT_HIGH);
}

export function drawGenome(theme: ThemeId, seed: number, W: number, H: number, attempt: number, o: DrawOptions = {}): Genome {
  const variation = o.variation ?? 0;
  // a variation draws from the same stream as the map (so its settings and intentions match) and
  // nudges the continuous values; its land comes from its own noise seeds (field.ts)
  const rng = stream(seed, "genome2", theme, attempt);
  const nudge = variation ? stream(seed, "variation", theme, attempt, variation) : null;
  const p = PRIORS[theme];
  const vy = clamp(o.variety ?? DEFAULT_VARIETY, 0, 100);
  const areaK = (W * H) / (128 * 128);
  const vtSetting = clamp(o.vt ?? VT_DEFAULT[theme], 0, 100);
  const vt = effectiveVt(vtSetting, vy, rng);
  const v = vt / 100;
  const tall = (o.tallAllowed ?? true) && vt >= VT_HIGH;
  // taller parts as Verticality rises
  const tallK = 1 + 0.6 * v;
  const d = (r: Range) => {
    const x = draw(rng, r, vy);
    return nudge ? x + (nudge.float() * 2 - 1) * 0.12 * (r.hi - r.lo) : x;
  };
  const tiltRoll = rng.float();
  const tiltKind: Genome["tiltKind"] = tiltRoll < p.linear ? "linear" : tiltRoll < p.linear + (vy >= 85 ? Math.max(p.radial, 0.2) : p.radial) ? "radial" : "linear";
  const fieldOnly = tiltRoll >= p.linear + p.radial;
  const topLocked = d(p.top) + 0.8 * v;
  const top = tall ? tallTop(vt) : Math.min(EDITOR_TOP, topLocked);
  // the island sea: always for Islands, sometimes for Any, from its own stream so the rest of the
  // draws stay as they are
  const sea = p.sea >= 1 ? true : p.sea > 0 && stream(seed, "sea", theme, attempt).float() < p.sea;
  const g: Genome = {
    theme,
    variety: vy,
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
      // (D333 (3): River Valley's promise is a main river through its valley: one enters at an edge)
      inflows: Math.max(theme === "riverValley" ? 1 : 0, p.inflows[rng.int(0, p.inflows.length)]),
      // (M9b: more springs on a larger map, as the square root of its area: a 256² map had a 128²'s,
      // and most of its land lay far from water)
      springs: Math.round(Math.max(0, d(p.springs)) * Math.max(1, Math.sqrt(areaK))),
      flowMul: Math.max(0.8, d(p.flowMul)),
      lakeBudget: clamp(d(p.lakeBudget), 0.01, 0.45),
      split: p.split,
      delta: p.delta,
      incise: Math.max(0, d(p.incise)) + 3 * v * v,
      // (M9b: a valley floor grows with the map, as the square root of its side: at 256² River
      // Valley's floor was a 128²'s, a narrow strip across a large map, and never kept its promise)
      floor: Math.max(0, d(p.floor)) * Math.sqrt(Math.min(W, H) / 128),
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
    tall,
    top,
    hyps: { eq: clamp(d(p.eq) + 0.15 * v, 0, 0.9), lean: clamp(d(p.lean), 0.45, 2) },
    regional: { amp: Math.max(0, d(p.regional)) * (fieldOnly ? 1.4 : 1), cell: (0.28 + 0.32 * rng.float()) * Math.min(W, H) },
    cap: { share: clamp(d(p.cap) + 0.5 * v * v, 0, 0.75), cell: (5 + 9 * rng.float()) * (1 - 0.6 * v), level: 0.45 + 0.35 * rng.float() },
    weathering: clamp(0.15 + 0.85 * v * (0.6 + 0.8 * rng.float()), 0, 1),
    hanging: (0.6 + 2.6 * v) * rng.float(),
    knick: rng.float() < 0.25 + 0.6 * v ? 5 + 12 * v * rng.float() + 4 * rng.float() : 0,
    lakeSprings: p.lakeSprings,
    wander: 0.9,
    wanderCell: 14,
    ramps: clamp(1 - 0.75 * v * v, 0.2, 1),
    benchPhase: rng.float(),
    troughs: p.troughs,
    sea,
    falls: 1,
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
  // parts: counts per 128² map, in proportion to the area (the same detail per tile)
  const n = Math.max(1, Math.round((d(p.partCount) + 0.5) * Math.max(1, areaK)));
  for (let k = 0; k < n; k++) g.parts.push(randomPart(rng, pickPart(rng, p.parts, vy), W, H, vy, tallK));
  // extra lakes: basins beyond the parts, so water spans the workshop's range
  const lakes = Math.max(0, Math.round(d(p.lakes) * Math.max(1, Math.sqrt(areaK))));
  for (let k = 0; k < lakes; k++) g.parts.push(randomPart(rng, "basin", W, H, vy, tallK));
  // a radial slope falls toward the first bowl when there is one
  const bowl = g.parts.find((q) => q.kind === "basin" || q.kind === "caldera");
  if (g.tiltKind === "radial" && bowl) g.focus = [bowl.at[0], bowl.at[1]];
  if (sea) addSea(g, stream(seed, "sea-layout", theme, attempt), W, H, attempt, areaK, tallK);
  const knolls = Math.round(d(p.knollsPer128) * areaK);
  if (knolls > 0) g.parts.push({ kind: "knolls", at: [0.5, 0.5], size: 0, height: 1.5 + rng.float(), turn: 0, extra: knolls, soft: 0 });
  // (M9b, D275 (1): the recipes are folded into intentions, one concept checked by outcome: the
  // island in a river is "the river splits around a big island", the great scarp "a long cliff
  // splits the map", the chain of lakes "lakes step down the valley", the hanging lake "a lake high on
  // the heights", the caldera Kyler's crater, the mesa field a landmark; the badwater volcano and
  // the volcano island are dropped, the Islands layouts standing for the second)
  g.woods = drawWoods(theme, seed, attempt, vy);
  // intentions: outcomes the processes are steered toward, never built (D138)
  g.intentions = o.intentions === undefined || o.intentions === null ? drawIntentions(theme, vt, rng, { W, H }) : o.intentions.filter((id) => !tooSmallFor(id, W, H));
  for (const id of g.intentions) nudgeFor(id)(g, rng, W, H);
  return g;
}

/** The ways an island sea lies (M9b; D209: "archipelagos across the whole map, a sea off one edge,
 *  island chains, atolls"; D294: Islands had no sea). */
export const SEA_LAYOUTS = ["central", "edge", "archipelago", "chain", "atolls", "twoSeas"] as const;
export type SeaLayout = (typeof SEA_LAYOUTS)[number];
const SEA_WEIGHTS = [0.1, 0.22, 0.24, 0.16, 0.13, 0.15];

/**
 * Islands in a sea (Kyler, 2026-09-25; M9b: in many layouts, D209, D294): a broad body of water with
 * the land scattered through it, held in a bowl so the land rises from it toward the edges (water
 * that reaches an edge leaves the map, and edges are never walled). The layout says where the sea
 * lies and how its islands stand: in the middle; off one edge, behind a strip of coast (the map's
 * orientation turns it to any edge, D275); an archipelago of many islands of every size across most
 * of the map; a chain of islands along an arc; atolls, rings of islets round a lagoon (lobed, never a
 * circle); or two seas with a ridge between them. The islands are parts like any other: where they
 * stand clear of the water is the land's doing. Its own random stream, so the rest of the genome
 * keeps its draws.
 */
/** How much deeper the basins the Lakes setting adds are (D333 (6)). */
const LAKES_DEEPER = 1.6;

/** How much bigger and higher the scattered islands of a sea stand (D333: first maps keep Islands'
 *  promise, three islands or more). */
const ISLE_GROW = 1.15;
const ISLE_RISE = 2.5;
/** And the sea (a quarter of the map or more, the promise's line). */
const SEA_GROW = 1.12;

function addSea(g: Genome, rng: Rng, W: number, H: number, attempt: number, areaK: number, tallK: number): void {
  const layout = SEA_LAYOUTS[rng.weighted(SEA_WEIGHTS)];
  g.seaLayout = layout;
  g.tiltKind = "radial";
  const side = Math.min(W, H);
  // a map that needed a new genome gets a smaller sea (a broad sea settles slowly on large maps)
  const shrink = Math.max(0.75, 1 - 0.05 * attempt);
  // (D350: on a larger map fewer, larger islands, the same share of the land: count × area^0.3, size
  // × area^0.35, so an island clears the promise's size, which grows with the map, as at 128²)
  const n = (k: number) => Math.max(1, Math.round(k * Math.pow(Math.max(1, areaK), 0.3)));
  const isleK = Math.pow(Math.max(1, areaK), 0.35);
  const isle = (at: [number, number], size: number, rise: number, depth: number, kind?: PartKind) => {
    const k: PartKind = kind ?? (rng.float() < 0.35 ? "cone" : "mesa");
    g.parts.push({ kind: k, at, size: size * isleK, height: depth + rise * tallK, turn: rng.float(), extra: 0, soft: (1 + rng.float()) / tallK, isle: true });
  };
  let seaShape = { turn: 0, aspect: 1 };
  const sea = (at: [number, number], R: number, depth: number, turn: number, aspect: number) => {
    g.parts.push({ kind: "basin", at, size: R * shrink * SEA_GROW, height: -depth, turn, extra: aspect, soft: 0, shape: "sea" });
    seaShape = { turn, aspect };
  };
  // islands scattered through a sea: evenly over its area (its ellipse, D350: over a round area an
  // elongated sea's islands stood on its shores, joined to the land), of mixed sizes
  const scatter = (cx: number, cy: number, R: number, count: number, depth: number, big = 0.1) => {
    const [tx, ty] = unit(seaShape.turn);
    const sa = Math.sqrt(seaShape.aspect);
    for (let k = 0; k < count; k++) {
      const [vx, vy] = unit(rng.float());
      const r = 0.85 * Math.sqrt(rng.float()) * R;
      const a = vx * sa;
      const b = vy / sa;
      const ux = a * tx - b * ty;
      const uy = a * ty + b * tx;
      const roll = rng.float();
      const size = roll < big ? 9 + 5 * rng.float() : roll < big + 0.3 ? 5.5 + 3.5 * rng.float() : 3 + 2.5 * rng.float();
      // (D333: the islands stand clear of the sea's water; on the beds' floor, item 47, the land's
      // relief is squeezed a little and islands that rose 1.5 levels stood awash, joined by shelves)
      isle([cx + (ux * r) / W, cy + (uy * r) / H], size * ISLE_GROW, ISLE_RISE + 4.5 * rng.float(), depth);
    }
  };
  let tilt = 8.5 + rng.float();
  switch (layout) {
    case "central": {
      g.focus = [0.36 + 0.28 * rng.float(), 0.36 + 0.28 * rng.float()];
      const R = side * (0.34 + 0.08 * rng.float());
      const depth = 9 + 2.5 * rng.float();
      sea([g.focus[0], g.focus[1]], R, depth, rng.float(), 1.2 + 0.6 * rng.float());
      scatter(g.focus[0], g.focus[1], R, n(12 + 8 * rng.float()), depth);
      break;
    }
    case "edge": {
      // the sea lies along the south edge, behind a strip of coast its outlet crosses
      // (D350: a quarter of the map at least, the promise's line; it lay half beyond the rim before)
      g.focus = [0.35 + 0.3 * rng.float(), 0.3 + 0.06 * rng.float()];
      const R = side * (0.38 + 0.08 * rng.float());
      const depth = 8 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], R, depth, rng.float() < 0.5 ? 0 : 0.5, 1.9 + 0.7 * rng.float());
      scatter(g.focus[0], g.focus[1], R, n(9 + 7 * rng.float()), depth);
      tilt = 7.5 + rng.float();
      // (its water leaves by the coast: the south edge is the way out, D275 turns it)
      g.flowDir = 6;
      break;
    }
    case "archipelago": {
      // (its islands scattered where the water is deep: at its shores they stood on the dry floor,
      // joined to the land)
      g.focus = [0.42 + 0.16 * rng.float(), 0.42 + 0.16 * rng.float()];
      const R = side * (0.42 + 0.08 * rng.float());
      const depth = 8.5 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], R, depth, rng.float(), 1 + 0.4 * rng.float());
      scatter(g.focus[0], g.focus[1], 0.85 * R, n(18 + 10 * rng.float()), depth, 0.14);
      tilt = 7.5 + 1.5 * rng.float();
      break;
    }
    case "chain": {
      g.focus = [0.38 + 0.24 * rng.float(), 0.38 + 0.24 * rng.float()];
      const R = side * (0.36 + 0.08 * rng.float());
      const depth = 8.5 + 2 * rng.float();
      const turn = rng.float();
      sea([g.focus[0], g.focus[1]], R, depth, turn, 1.5 + 0.6 * rng.float());
      // an arc through the sea's middle, bending round a centre off to one side of its long axis
      const [ax, ay] = unit(turn);
      const bend = (rng.float() < 0.5 ? 1 : -1) * R * (1.3 + 1.2 * rng.float());
      const ccx = g.focus[0] * W - ay * bend;
      const ccy = g.focus[1] * H + ax * bend;
      // (the arc's middle points back at the sea's middle; it spans about one and a half radii)
      const base = turn + (bend > 0 ? -0.25 : 0.25);
      const span = (1.5 * R) / Math.abs(bend) / TWO_PI;
      // (the chain's count stays as at 128²: its islands grow with the map instead, and more of them
      // along the same arc ran together into one)
      const count = Math.max(1, Math.round(9 + 5 * rng.float()));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.3 * (rng.float() - 0.5)) / Math.max(1, count - 1) - 0.5;
        const [ux, uy] = unit(base + t * span);
        const mid = 1 - Math.abs(t) * 1.2;
        const size = 3.5 + 4.5 * Math.max(0, mid) * (0.6 + 0.4 * rng.float());
        isle([(ccx + ux * Math.abs(bend)) / W, (ccy + uy * Math.abs(bend)) / H], size, 2 + 4 * rng.float(), depth, rng.float() < 0.6 ? "cone" : "mesa");
      }
      scatter(g.focus[0], g.focus[1], R, n(3 + 4 * rng.float()), depth, 0);
      break;
    }
    case "atolls": {
      g.focus = [0.38 + 0.24 * rng.float(), 0.38 + 0.24 * rng.float()];
      const R = side * (0.38 + 0.08 * rng.float());
      const depth = 8 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], R, depth, rng.float(), 1.1 + 0.5 * rng.float());
      const atolls = rng.float() < 0.6 ? 1 : 2;
      const [ox, oy] = unit(rng.float());
      for (let a = 0; a < atolls; a++) {
        const off = R * (atolls === 1 ? 0.3 * rng.float() : 0.35 + 0.2 * rng.float()) * (a === 1 ? -1 : 1);
        const cx = g.focus[0] * W + ox * off;
        const cy = g.focus[1] * H + oy * off;
        const ra = (side / 128) * (atolls === 1 ? 9 + 5 * rng.float() : 7 + 3 * rng.float());
        // lobed: the ring's radius swings with two waves, so it is never a circle
        const k1 = 2 + (rng.float() < 0.5 ? 1 : 0);
        const p1 = rng.float();
        const k2 = 4 + (rng.float() < 0.5 ? 1 : 0);
        const p2 = rng.float();
        const islets = n(11 + 6 * rng.float());
        // one to three passes where the ring stays open to the sea
        const gaps = 1 + Math.floor(3 * rng.float());
        const gapAt = Array.from({ length: gaps }, () => rng.float());
        for (let k = 0; k < islets; k++) {
          const t = (k + 0.4 * (rng.float() - 0.5)) / islets;
          if (gapAt.some((q) => Math.abs(((t - q + 1.5) % 1) - 0.5) < 0.045)) continue;
          const [ux, uy] = unit(t);
          const r = ra * (1 + 0.2 * unit(k1 * t + p1)[1] + 0.1 * unit(k2 * t + p2)[1]);
          isle([(cx + ux * r) / W, (cy + uy * r) / H], 2.4 + 2.2 * rng.float(), 1 + 1.5 * rng.float(), depth, "mesa");
        }
      }
      scatter(g.focus[0], g.focus[1], R, n(4 + 6 * rng.float()), depth);
      break;
    }
    case "twoSeas": {
      g.focus = [0.44 + 0.12 * rng.float(), 0.44 + 0.12 * rng.float()];
      const turn = rng.float();
      const [ax, ay] = unit(turn);
      const apart = side * (0.23 + 0.05 * rng.float());
      const depth = 8.5 + 2 * rng.float();
      for (const sgn of [-1, 1]) {
        const cx = g.focus[0] + (sgn * ax * apart) / W;
        const cy = g.focus[1] + (sgn * ay * apart) / H;
        const R = side * (0.23 + 0.06 * rng.float());
        sea([cx, cy], R, depth, rng.float(), 1.1 + 0.5 * rng.float());
        scatter(cx, cy, R, n(6 + 5 * rng.float()), depth);
      }
      // a ridge between them, so they stay two
      g.parts.push({ kind: "ridge", at: [g.focus[0], g.focus[1]], size: side * 1.2, height: 4 + 2 * rng.float(), turn: turn + 0.25, extra: 5 + 3 * rng.float(), soft: 0 });
      tilt = 7 + 1.5 * rng.float();
      break;
    }
  }
  g.hydro.lakeBudget = Math.max(g.hydro.lakeBudget, 0.42 + 0.1 * rng.float());
  // the sea is fed from the heights round it: springs, whose rivers pour down into it (a river from
  // an edge enters low on the bowl's rim, and no sea stands above where its water comes in)
  g.hydro.inflows = 0;
  g.hydro.springs = Math.max(g.hydro.springs, 2 + (rng.float() < 0.5 ? 1 : 0));
  // the land rises from the sea toward the edges: a bowl, quiet noise, levels spread by height
  // rather than equal area, so the sea keeps a broad floor below its shores
  g.tilt = Math.max(g.tilt, tilt);
  g.regional.amp *= 0.4;
  g.noise.amp *= 0.5;
  g.hyps.eq = 0.1 + 0.1 * rng.float();
  // islands are high, soft ground in a low sea: weathering would waste them into it
  g.weathering = Math.min(g.weathering, 0.1);
}

// ------------------------------------------------------------------------------- the settings

const LEVEL3 = { tight: -1, normal: 0, generous: 1 } as const;
const STYLE_WANDER = { straight: 0.45, meandering: 1, braided: 1 } as const;
const FLOW = { trickle: 0.55, normal: 1, strong: 1.5, lush: 2.4 } as const;

const LAKE_STEP = { none: 0, few: 1, some: 2, many: 3 } as const;
const FALL_STEP = { off: 0, few: 1, many: 2 } as const;
const BADWATER = { off: 0, low: 0.6, normal: 1, high: 1.6 } as const;

/**
 * The player's settings lean the drawn genome (PLAN §5; M9a). At the theme's own preset nothing
 * moves: the genome is the theme's (or Any's) draw. A setting moved from its preset moves the
 * parameters it names, by how far it moved: Relief spreads the levels, Highest terrain caps the top
 * (below high Verticality), Terracing sets the benched share, Buildable land quiets the land and
 * gives cliffs more ramps, Rivers sets the edge inflows (0: springs feed the water), River style how
 * far rivers wander (never ruler-straight, D209) and whether they braid, River flow the water, Drought
 * reserve and Lakes and basins the lakes, Waterfalls the gathered drops, and Badwater its strength
 * (No badwater: none, D200). Draws it needs come from their own stream.
 */
export function leanGenome(g: Genome, s: Settings, W: number, H: number, seed: number, attempt: number, designedFor: Difficulty = "normal"): void {
  const p = THEME_PRESETS[g.theme];
  const rng = stream(seed, "lean", g.theme, attempt);
  // relief: the spread of the land's levels
  const dr = (s.terrain.relief - p.relief) / 100;
  if (dr < 0) {
    // (no higher than the spread Relief asks for above the base, PLAN §5.2: 7 + 0.08·relief levels
    // from p5 to p95, the top a level and a half above p95)
    g.top = Math.max(g.base + 5, Math.min(g.top + 11 * dr, g.base + 7 + 0.08 * s.terrain.relief + 1.5));
    g.hyps.eq = clamp(g.hyps.eq + 0.5 * dr, 0, 0.9);
    g.noise.amp *= 1 + 0.6 * dr;
  } else if (dr > 0) {
    g.hyps.eq = clamp(g.hyps.eq + 0.6 * dr, 0, 0.9);
    g.base = Math.max(0.2, g.base - 2.5 * dr);
    g.noise.amp *= 1 + 0.5 * dr;
  }
  // buildable land (flat share 0.40 / 0.52 / 0.60 and walkable land from the start, PLAN §5.2):
  // Generous asks for quieter, a little lower land with more benches and ramps; Tight for rougher
  // land whose benches end in cliffs, with fewer ramps
  const bl = LEVEL3[s.terrain.buildableLand] - LEVEL3[p.buildableLand];
  if (bl > 0) {
    g.noise.amp *= 1 - 0.2 * bl;
    g.regional.amp *= 1 - 0.15 * bl;
    g.ramps = clamp(g.ramps + 0.3 * bl, 0.1, 1);
    g.terrace.share = clamp(g.terrace.share + 0.2 * bl, 0, 1);
    g.top = Math.max(g.base + 4, g.top - 1.5 * bl);
  } else if (bl < 0) {
    g.terrace.step = Math.max(g.terrace.step, 2);
    g.noise.amp *= 1 - 0.15 * bl;
    g.regional.amp *= 1 - 0.1 * bl;
    g.ramps = clamp(g.ramps + 0.2 * bl, 0.1, 1);
    g.terrace.share = clamp(g.terrace.share + 0.1 * bl, 0, 1);
  }
  // start area: a large one asks for broad level ground, a small one for less (the start's bench,
  // radius 5 / 6 / 8, PLAN §5.7; nothing is levelled for it, D209)
  if (s.start.area === "large") {
    g.terrace.share = clamp(g.terrace.share + 0.15, 0, 1);
    g.noise.amp *= 0.85;
  } else if (s.start.area === "small") g.noise.amp *= 1.1;
  // the highest terrain (item 36): a cap on every map; at its default (22 from Verticality 70, 16
  // below) a tall map's top is Verticality's, and one drawn tall by Variety keeps it too
  const cap = s.terrain.highestTerrain;
  if (!g.tall) g.top = Math.min(g.top, cap, EDITOR_TOP);
  else if (cap < highestTerrainDefault(s.terrain.verticality)) {
    g.top = Math.min(g.top, cap);
    if (g.top <= EDITOR_TOP) g.tall = false;
  }
  // the land stands on a floor (item 47): every level moves up by `BED_FLOOR`, so the deepest bed
  // is that far above the map's floor, and the relief is kept within the ceiling (the land squeezed
  // only where it would rise past it)
  const ceiling = g.tall ? g.top : Math.min(EDITOR_TOP, cap);
  g.base += BED_FLOOR;
  g.top = Math.min(g.top + BED_FLOOR, ceiling);
  g.relief = g.top - g.base;
  // terracing: the benched share
  const dt = (s.terrain.terracing - p.terracing) / 100;
  g.terrace.share = clamp(g.terrace.share + 0.9 * dt, 0, 1);
  if (dt >= 0.25 && g.terrace.step < 2) g.terrace.step = 2;
  // (D333 (3): no springs added toward far land where the player asked for Generous buildable land,
  // which keeps its flats, or moved the Drought reserve from the theme's own, which plans the water
  // near the start itself: the added tributaries drew starts to water a Scarce reserve should lack
  // and away from the water a Plenty one stores)
  g.hydro.reachSprings = s.terrain.buildableLand !== "generous" && s.water.droughtReserve === p.droughtReserve;
  // rivers entering on the edges (0: springs feed the water)
  // (a count the player set is the count that enters, PLAN §5.3; the preset's leaves the genome's)
  if (s.water.rivers === 0) {
    g.hydro.inflows = 0;
    g.hydro.springs = Math.max(1, g.hydro.springs);
  } else if (s.water.rivers !== p.rivers) {
    g.hydro.inflows = s.water.rivers;
    g.hydro.exactInflows = true;
  }
  // river style: how far rivers wander, and braids
  g.wander *= STYLE_WANDER[s.water.riverStyle] / STYLE_WANDER[p.riverStyle];
  // straight: the rivers keep close to the line from where they begin to where they leave, cutting
  // through what stands in the way (meander amplitude at most 0.05·H, PLAN §5.3; never
  // ruler-straight, D209: they still wander a little)
  if (s.water.riverStyle === "straight" && p.riverStyle !== "straight") g.hydro.straighten = 0.85;
  if (s.water.riverStyle === "braided" && p.riverStyle !== "braided") {
    g.hydro.split = Math.max(g.hydro.split, 0.85);
    g.hydro.delta = 1;
    g.hydro.braided = true;
    g.hydro.floor += 2;
  } else if (p.riverStyle === "braided" && s.water.riverStyle !== "braided") {
    g.hydro.split *= 0.4;
    g.hydro.delta *= 0.3;
  }
  // flow
  g.hydro.flowMul = Math.max(0.3, (g.hydro.flowMul * FLOW[s.water.riverFlow]) / FLOW[p.riverFlow]);
  // drought reserve and the difficulty's drought: the stored water the start should have (the
  // colony's need times the reserve, PLAN §5.3, §11.4) against the theme's own, as room for lakes
  // and as basins more or fewer (the settler then prefers a start near the water they keep)
  const storeRatio = (reservoirNeeded(designedFor) * RESERVE[s.water.droughtReserve]) / (reservoirNeeded("normal") * RESERVE[p.droughtReserve]);
  g.hydro.lakeBudget = clamp(g.hydro.lakeBudget * (storeRatio > 1 ? Math.sqrt(storeRatio) : s.water.droughtReserve === "scarce" && p.droughtReserve !== "scarce" ? 0.8 : 1), 0.01, 0.5);
  const moreBasins = storeRatio > 1 ? Math.round(1.3 * Math.log2(storeRatio)) : s.water.droughtReserve === "scarce" && p.droughtReserve !== "scarce" ? -1 : 0;
  for (let k = 0; k < moreBasins; k++) g.parts.push(randomPart(rng, "basin", W, H, g.variety, 1 + (0.6 * g.vt) / 100));
  for (let k = 0; k < -moreBasins; k++) {
    const at = g.parts.findIndex((q) => q.kind === "basin" && q.shape !== "sea");
    if (at >= 0) g.parts.splice(at, 1);
  }
  // the reserve itself (not the difficulty's drought): valley lakes along the rivers, where starts
  // are found, more for a larger reserve and fewer for a smaller one
  const rr = RESERVE[s.water.droughtReserve] / RESERVE[p.droughtReserve];
  if (rr > 1) g.troughs += 1.2 * (rr - 1);
  else if (rr < 1) g.troughs *= rr;
  // lakes and basins
  const dl = LAKE_STEP[s.water.lakes] - LAKE_STEP[p.lakes];
  // (M9b, D294: only a setting moved from the theme's own; at Islands' preset, None, the sea is its
  // water and kept its budget: the lake budget cut every Islands sea down to nothing)
  if (s.water.lakes === "none" && p.lakes !== "none") {
    // (a river crossing a hollow leaves no lake: the lake budget cuts its outlet down to nothing)
    g.parts = g.parts.filter((q) => q.kind !== "basin" || q.shape === "sea");
    g.troughs = 0;
    g.lakeSprings = 0;
    g.hydro.lakeBudget = 0.0005;
  } else if (dl > 0) {
    // (D333 (6): half again as deep: on the beds' floor, item 47, a basin in the low land was cut
    // off at the land's lowest level and held no lake)
    for (let k = 0; k < 6 * dl; k++) {
      const b = randomPart(rng, "basin", W, H, g.variety, 1 + (0.6 * g.vt) / 100);
      b.height *= LAKES_DEEPER;
      g.parts.push(b);
    }
    g.troughs += 2 * dl;
    g.lakeSprings = Math.min(1, g.lakeSprings + 0.5 * dl);
    // more of the land's hollows hold water, smaller ones too (dry ones are filled)
    g.lakeSpringMax = 4 + 3 * dl;
    g.lakeSpringMin = Math.max(50, 100 - 20 * dl);
    g.hydro.lakeBudget = clamp(g.hydro.lakeBudget * (1 + 0.5 * dl), 0.01, 0.5);
  } else if (dl < 0) {
    for (let k = 0; k < -2 * dl; k++) {
      const at = g.parts.findIndex((q) => q.kind === "basin" && q.shape !== "sea");
      if (at >= 0) g.parts.splice(at, 1);
    }
    g.troughs *= 0.5 ** -dl;
    g.lakeSprings *= 0.6 ** -dl;
  }
  // waterfalls
  const df = FALL_STEP[s.water.waterfalls] - FALL_STEP[p.waterfalls];
  if (s.water.waterfalls === "off") {
    g.falls = 0;
    g.knick = 0;
    g.hanging = 0;
  } else if (df > 0) {
    g.falls = 2;
    g.knick = Math.max(g.knick, 8 + 6 * rng.float());
    g.hanging += 1;
  } else if (df < 0) {
    g.knick = 0;
    g.hanging *= 0.5;
  }
  // badwater: at least one source on every map, unless No badwater (D200)
  if (s.hazards.badwater === "off") g.hazards.badwater = "none";
  else {
    if (g.hazards.badwater === "none") g.hazards.badwater = "pit";
    g.hazards.ratio = clamp((g.hazards.ratio * BADWATER[s.hazards.badwater]) / (BADWATER[p.badwater] || 1), 0.15, 1.8);
  }
}

export type { Settings };
