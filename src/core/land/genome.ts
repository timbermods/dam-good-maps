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

import * as portable from "../math/portable";
import { stream, type Rng } from "../math/rng";
import { hash32 } from "../math/hash";
import { RESERVE, reservoirNeeded } from "../gen/calibrated";
import { EDITOR_LEVEL, TALL_TOP, THEME_PRESETS, VT_DEFAULT, VT_TALL, type Difficulty, type Settings, type ThemeId } from "../spec/mapspec";
import { drawIntentions, nudgeFor, tooSmallFor, type IntentionId } from "./intentions";
import { unit } from "./num";
import { clamp, smoothstep } from "../math/clamp";
import { TWO_PI } from "../math/detmath";
import { fbm } from "../math/noise";

export type PartKind = "ridge" | "trough" | "basin" | "caldera" | "mesa" | "mesaField" | "escarpment" | "cone" | "plateau" | "knolls" | "spiral" | "isle";

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
  /** An island sea only: the rim's broad lobes of mainland (round 4, D417; `rimLobe`). */
  lobes?: RimLobe[];
  /** An island a strait off the shore: a calmer coast, a fifth the wobble (round 5). */
  calm?: boolean;
  /** An island sea only: the seed its coast's noise draws from (`rimKeep`), so the genome places
   *  islands against the coast the field will draw (round 6). */
  coast?: number;
  /** An island sea only: Islands' lip, a tile or two at the map's edge (round 6); else round 5's, 6–10
   *  tiles (`rimKeep`). */
  thinLip?: boolean;
}

/** A lobe of the rim of land round an island sea (round 4, D417): its middle, as a place round the
 *  map's perimeter (0–4, along its edges from the corner at the origin: x along the first, y along the
 *  second, back along x and y), its half-width and how far it reaches into the map, both as
 *  shares of the side. */
export type RimLobe = [number, number, number];

/** How far the rim's lobes reach into the map at a place on its perimeter, as a share of the side:
 *  the furthest lobe's, each flat over the middle half of its width and falling over the rest, a broad
 *  landmass (a hump came to a point, a wedge of land). */
export function rimLobe(lobes: readonly RimLobe[] | undefined, u: number): number {
  if (!lobes) return 0;
  let d = 0;
  for (const [lu, lw, ld] of lobes) {
    const du = Math.min(Math.abs(u - lu), 4 - Math.abs(u - lu));
    if (du < lw) {
      // (round 6: level across a third of its width, not half, and its front warped (rimKeep): level
      // across half, its coast ran parallel to the edge, a straight seam)
      const q = Math.min(1, (1.5 * (lw - du)) / lw);
      d = Math.max(d, ld * q * q * (3 - 2 * q));
    }
  }
  return d;
}

/** How much of a sea's depth a tile takes: 0 on the land at the map's edge (D350: the game drains
 *  every edge tile, so the sea keeps a lip of land; below 0 on a lobe, lifted) to 1 in the sea. The
 *  lip is 1–2 tiles at the very edge, falling to the sea in a tile or two (round 6), and the mainland
 *  is the broad lobes addSea drew, their coast warped so it bends at every scale. `s` is the sea's
 *  `coast` seed: the field draws the land with it and addSea reads it to place islands. */
/** The lip alone (`rimKeep` without the mainland): 0 on the land at the map's edge, 1 past its fall
 *  to the sea. Islands' (`thin`) is 1–2 tiles falling in a tile or two (round 6); Any's sea maps keep
 *  round 5's, 6–10 tiles with rounded corners, falling over 2–4. */
export function lipKeep(s: number, x: number, y: number, W: number, H: number, thin = false): number {
  const side = Math.min(W, H);
  if (thin) {
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    const base = 1 + 0.5 * (fbm(s + 17, x, y, 0.3 * side, 2) + 1);
    const fall = 1.5 + 0.5 * (fbm(s + 41, x, y, 0.2 * side, 2) + 1);
    return smoothstep((e - base) / fall);
  }
  const ex = Math.min(x, W - 1 - x);
  const ey = Math.min(y, H - 1 - y);
  const rc = 6;
  const e = ex < rc && ey < rc ? rc - portable.sqrt((rc - ex) * (rc - ex) + (rc - ey) * (rc - ey)) : Math.min(ex, ey);
  const t = 0.5 * (fbm(s + 17, x, y, 0.3 * side, 2) + 1);
  const head = Math.max(0, 1 - 2 * Math.abs(fbm(s + 29, x, y, 0.14 * side, 2)) - 0.72) / 0.28;
  return smoothstep((e - (6 + 2 * t + 2 * head)) / (2 + (fbm(s + 41, x, y, 0.2 * side, 2) + 1)));
}

export function rimKeep(s: number, x: number, y: number, W: number, H: number, lobes?: readonly RimLobe[], thin = false): number {
  const side = Math.min(W, H);
  const e = Math.min(x, W - 1 - x, y, H - 1 - y);
  // (round 6, Kyler: the sea runs to the map's edge, a lip of 1–2 tiles there so it reads as the sea
  // going on past the map. Round 5's 6–10 tiles boxed the sea in with ruler-straight coasts and
  // square corners; it was widened because a narrow lip drained the sea, and the cause was the
  // rivers: one traced through the sea ran on across the lip and cut its bed there. A river now ends
  // where it meets the sea, hydro.ts.)
  let k = lipKeep(s, x, y, W, H, thin);
  if (!lobes || !lobes.length) return k;
  // (round 4, D417: the rim's broad lobes of mainland, which addSea placed clear of the islands, each
  // its edge's own band reaching in, the land the union of the four edges' bands, so no seam runs
  // down a corner's diagonal)
  // (round 6: the coast bends at every scale, never a ruler-straight seam: the bands are read at a
  // point warped by a third of the deepest lobe's reach, so a lobe's front curls into bays and
  // headlands, and its front wanders by a third of its own reach and a tile and a half more in
  // finer coves; round 5's ±6 tiles on a front level across half the lobe ran straight for 20–40)
  let deep = 0;
  for (const l of lobes) deep = Math.max(deep, l[2]);
  const A = 0.34 * side * deep;
  const cw = 0.16 * side;
  const xw = x + A * fbm(s + 61, x, y, cw, 3);
  const yw = y + A * fbm(s + 67, x, y, cw, 3);
  const wob = 0.06 * fbm(s + 53, x, y, 0.1 * side, 3);
  const swing = fbm(s + 59, xw, yw, 0.07 * side, 3);
  const fine = 1.5 * fbm(s + 71, x, y, 6, 2);
  const fx = clamp(xw / (W - 1), 0, 1);
  const fy = clamp(yw / (H - 1), 0, 1);
  let lift = 0;
  for (const [d, u] of [[yw, fx], [W - 1 - xw, 1 + fy], [H - 1 - yw, 2 + (1 - fx)], [xw, 3 + (1 - fy)]]) {
    const lobe = rimLobe(lobes, (u + wob + 4) % 4);
    if (lobe <= 0) continue;
    const kE = smoothstep((d - (thin ? 2 : 8) - side * lobe * (1 + 0.33 * swing) - fine) / (thin ? 2 : 3));
    k = Math.min(k, kE);
    lift = Math.max(lift, (1 - kE) * Math.min(1, lobe / 0.08));
  }
  // (a lobe's land is lifted by an eighth of the sea's depth on Islands, a quarter on Any's sea maps, ground over the water that ends in a fall to
  // it: lifted 0.7, an island near the coast was joined to it by ground too high for the strait pass to
  // part, round 5. Islands' an eighth: lifted a quarter, with round 5's low lip gone, its mainland met
  // the sea in a cliff and some lands had no field land by the water for a start, round 6; Any's sea
  // maps a quarter, whose lower lands an eighth left under sheets of water)
  return k - (thin ? 0.125 : 0.25) * lift;
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
    /** The player set Rivers to 0: no river enters by the map's edge, a spring feeds the main river
     *  (set by `leanGenome`; a theme's own default inflow never overrides it). */
    noInflows?: boolean;
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
  /** The slow regional field (playbook #1): levels and cell; warped on a sea's map (D417). */
  regional: { amp: number; cell: number; warped?: boolean };
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
  /** How the island sea lies (M9b, D209, D294, D410): one large island with smaller ones round it,
   *  a sea off one edge, a scatter of islands, an island chain, an atoll, or two large islands parted
   *  by a strait; null without a sea. */
  seaLayout?: SeaLayout | null;
  /** An inland sea in a ring of land (D417, D423: at most one sea map in four); on the others the
   *  rim's broad lobes of mainland reach into the sea and break the land round it. */
  seaRing?: boolean;
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
    tilt: { lo: 1.6, hi: 4 }, linear: 0.55, radial: 0.08, regional: { lo: 3, hi: 6.5 },
    amp: { lo: 3, hi: 6 }, cell: { lo: 24, hi: 56 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0, hi: 0.35 },
    parts: { plateau: 1.2, trough: 1, knolls: 2, basin: 1.2, ridge: 0.7, escarpment: 0.7, mesa: 0.5, cone: 0.3, caldera: 0.3 },
    partCount: { lo: 1, hi: 4 }, knollsPer128: { lo: 4, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 14 }, k: { lo: 0.008, hi: 0.02 }, diffusion: { lo: 0.05, hi: 0.15 } },
    terrace: { step: [1, 1, 2, 2], share: { lo: 0.05, hi: 0.4 } },
    // (D416: lakes up to 15% of the map, not 30%: a lake the fan's river fills that broad stood a few
    // hundredths over the flats at its sill, Delta 128² seed 4)
    inflows: [1, 1, 2, 2, 3], springs: { lo: 0, hi: 3 }, flowMul: { lo: 1.4, hi: 2.9 }, lakeBudget: { lo: 0.03, hi: 0.15 }, lakes: { lo: 0, hi: 3 }, lakeSprings: 0.5,
    // (D416: narrower floors along the rivers: a broad floor at the banks' level took the water of
    // the rivers that join on it as a thin sheet, Delta 128² seed 23)
    split: 0.65, delta: 1, incise: { lo: 0, hi: 0.8 }, floor: { lo: 1, hi: 4 }, cap: { lo: 0, hi: 0.15 },
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
    case "isle":
      return { kind, at, size: w(8, 18), height: w(4, 8) * tall, turn, extra: w(1, 1.9), soft: 0 };
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
  // Broaden River Valley's floors without changing Any's combined prior or its seed draws.
  const p = theme === "riverValley" ? { ...PRIORS[theme], floor: { lo: 12, hi: 16 } } : PRIORS[theme];
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
      springs: Math.round(Math.max(0, d(p.springs)) * Math.max(1, portable.sqrt(areaK))),
      flowMul: Math.max(0.8, d(p.flowMul)),
      lakeBudget: clamp(d(p.lakeBudget), 0.01, 0.45),
      split: p.split,
      delta: p.delta,
      incise: Math.max(0, d(p.incise)) + 3 * v * v,
      // (M9b: a valley floor grows with the map, as the square root of its side: at 256² River
      // Valley's floor was a 128²'s, a narrow strip across a large map, and never kept its promise)
      floor: Math.max(0, d(p.floor)) * portable.sqrt(Math.min(W, H) / 128),
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
  const lakes = Math.max(0, Math.round(d(p.lakes) * Math.max(1, portable.sqrt(areaK))));
  for (let k = 0; k < lakes; k++) g.parts.push(randomPart(rng, "basin", W, H, vy, tallK));
  // a radial slope falls toward the first bowl when there is one
  const bowl = g.parts.find((q) => q.kind === "basin" || q.kind === "caldera");
  if (g.tiltKind === "radial" && bowl) g.focus = [bowl.at[0], bowl.at[1]];
  const seaFrom = g.parts.length;
  if (sea) addSea(g, stream(seed, "sea-layout", theme, attempt), W, H, attempt, areaK, tallK);
  const seaTo = g.parts.length;
  const knolls = Math.round(d(p.knollsPer128) * areaK);
  if (knolls > 0) g.parts.push({ kind: "knolls", at: [0.5, 0.5], size: 0, height: 1.5 + rng.float(), turn: 0, extra: knolls, soft: 0 });
  // (M9b, D275 (1): the recipes are folded into intentions, one concept checked by outcome: the
  // island in a river is "the river splits around a big island", the great scarp "a long cliff
  // splits the map", the chain of lakes "lakes step down the valley", the hanging lake "a lake high on
  // the heights", the caldera Kyler's crater, the mesa field a landmark; the badwater volcano and
  // the volcano island are dropped, the Islands layouts standing for the second)
  g.woods = drawWoods(theme, seed, attempt, vy);
  // intentions: outcomes the processes are steered toward, never built (D138)
  g.intentions = o.intentions === undefined || o.intentions === null ? drawIntentions(theme, vt, rng, { W, H }, !!g.seaLayout) : o.intentions.filter((id) => !tooSmallFor(id, W, H));
  for (const id of g.intentions) nudgeFor(id)(g, rng, W, H);
  // (round 6: on an open island sea, the landforms whose middle lies in the open sea are dropped, the
  // mainland's kept: a mesa or an escarpment there stood as a flat shoal with straight sides under the
  // water, Islands 128² seed 5)
  const seaPart = sea ? g.parts[seaFrom] : undefined;
  if (seaPart?.lobes && seaPart.coast !== undefined) {
    const { coast, lobes, thinLip } = seaPart;
    g.parts = g.parts.filter((q, k) => (k >= seaFrom && k < seaTo) || q.kind === "knolls" || rimKeep(coast, q.at[0] * (W - 1), q.at[1] * (H - 1), W, H, lobes, thinLip) < 0.5);
  }
  return g;
}

/** The ways an island sea lies (M9b; D209: "archipelagos across the whole map, a sea off one edge,
 *  island chains, atolls"; D294: Islands had no sea). */
export const SEA_LAYOUTS = ["central", "edge", "archipelago", "chain", "atolls", "twoSeas"] as const;
export type SeaLayout = (typeof SEA_LAYOUTS)[number];
const SEA_WEIGHTS = [0.1, 0.22, 0.24, 0.16, 0.13, 0.15];

/** How much deeper the basins the Lakes setting adds are (D333 (6)). */
const LAKES_DEEPER = 1.6;

/** And the sea's basin, beyond its layout's radius (round 4: an open map's sea is drawn past the rim,
 *  its coast drawn by the islands and the rim's lobes; a ring map's within the ring, addSea). */
const SEA_GROW = 1.12;

/** Islands' lake budget, its water cap (D369: its sea may be most of the map); every other theme's,
 *  Any's sea maps too, is held to half the map (round 5). */
const ISLANDS_LAKE_MOST = 0.7;
/** The most a genome's lakes may take, as a share of the map: Islands' sea its own, the rest half. */
const lakeMost = (g: Genome) => (g.theme === "islands" && g.seaLayout ? ISLANDS_LAKE_MOST : 0.5);

/**
 * Islands in a sea (Kyler, 2026-09-25; M9b: in many layouts, D209, D294; D408, D410: from the
 * field's own processes, no template): a broad body of water held in a bowl so the land rises from it
 * toward the edges (water that reaches an edge leaves the map, and edges are never walled), with
 * islands that have relief of their own, so the erosion, the terraces and the springs make their
 * valleys, benches and streams. The layout says where the sea lies and how its islands stand: one
 * large island with smaller ones round it; a sea off one edge, behind a strip of coast, with islands
 * off the mainland (the map's orientation turns it to any edge, D275); a scatter of mid-sized islands,
 * one big enough for a colony; a chain of islands along an arc; an atoll, a lobed ring of islets round
 * a lagoon with passes to the sea; or two large islands parted by a strait. Its own random stream, so
 * the rest of the genome keeps its draws.
 */
function addSea(g: Genome, rng: Rng, W: number, H: number, attempt: number, areaK: number, tallK: number): void {
  const first = g.parts.length;
  const layout = SEA_LAYOUTS[rng.weighted(SEA_WEIGHTS)];
  g.seaLayout = layout;
  // (D427, D432: never one large island in a moat inside a ring of land. D423, D427: a ring of land
  // round the whole sea on at most one map in four. Round 5: only the scatter and the atolls, whose
  // islands stay many and small in the ring's smaller sea, one draw in four of theirs; a chain or two
  // islands there fused into one in a moat, and central's big island is one)
  g.seaRing = rng.float() < 0.25 && (layout === "archipelago" || layout === "atolls");
  g.tiltKind = "radial";
  g.regional.warped = true;
  const side = Math.min(W, H);
  // (D432, round 3: under 128² a map that needed a new genome gets a smaller sea, so the shore keeps
  // room for a start on a small map, whose sea crowds it. From 128² up the sea keeps its size: the
  // lands drawn again had mostly missed the promise, which a smaller sea misses more surely.)
  const shrink = W * H < 128 * 128 ? Math.max(0.75, 1 - 0.05 * attempt) : 1;
  // (round 4: the islands grow with the map, their radii with its side, so their area grows with the
  // area as the promise's island does (30 tiles × the area): the same map, larger. The straits between
  // them stay in tiles, the game's reach (D429: 8 tiles of water), not a share of the map.)
  // (inside a ring of land the sea is smaller, and its islands with it, or they reach the ring)
  const isleK = (side / 128) * (g.seaRing ? 0.75 : 1);
  let seaDepth = 9;
  // (round 5, D427: on an open map the sea is most of the map and runs to the map's edges on two or
  // three sides, held there by a lip of land a few tiles wide (edges are sinks, D350), and the mainland
  // stands on one side or two side by side, its coast lobed in bays and points. Round 4's rim of lobes
  // on every side framed the sea on all four, the ring D427 rejected. Inside a ring of land (D423, at
  // most one map in four) the sea is drawn smaller, so the ring is broad land round its own outline.)
  // (the basin's own outline wanders from 0.55 to 1.45 of its radius with its noise, and the land
  // outside it stands a level over the sea's spill: an open map's basin is drawn one and a half sides
  // across, so no flat of that land is left inside the lip to join the islands to the shore)
  const open = () => side * (g.seaRing ? 0.28 + 0.04 * rng.float() : 1.5);
  // (round 6: the coast's own seed, so the islands below are placed against the coast the field draws;
  // a variation's land its own, D143)
  const coast = hash32(rng.int(0, 0x7fffffff), "coast", g.variation);
  // (Islands' lip a tile or two, round 6; Any's sea maps keep round 5's 6–10 tiles: on the thin one's
  // lands their starts found no place)
  const thin = g.theme === "islands";
  const sea = (at: [number, number], R: number, depth: number, turn: number, aspect: number) => {
    seaDepth = depth;
    g.parts.push({ kind: "basin", at, size: R * shrink * SEA_GROW, height: -depth, turn, extra: aspect, soft: 0, shape: "sea", coast, thinLip: thin });
  };
  // an island with relief of its own (D410, Kyler's review): a broad dome rising from the sea's
  // floor, a spine along it and a peak or two off its middle, so the erosion cuts valleys down its
  // flanks and the terraces step it, never a flat table with a bump
  // (each island's parts, the island first, so the island moves as one piece)
  const groups: { from: number; to: number }[] = [];
  const island = (at: [number, number], R: number, rise: number, depth: number, aspect = 1 + 0.9 * rng.float(), turn = rng.float()) => {
    const [ax, ay] = unit(turn);
    const r = R * isleK;
    const from = g.parts.length;
    g.parts.push({ kind: "isle", at, size: r, height: depth * 1.1 + rise * 0.75 * tallK, turn, extra: aspect, soft: 0, isle: true });
    // a spine along it, and a peak off its middle, sometimes two
    g.parts.push({ kind: "ridge", at, size: r * (1 + 0.5 * rng.float()), height: rise * (0.2 + 0.15 * rng.float()) * tallK, turn: turn + 0.25 * (rng.float() < 0.5 ? 1 : 0), extra: r * (0.25 + 0.12 * rng.float()), soft: 0 });
    const peaks = 1 + Math.floor(2 * rng.float());
    for (let k = 0; k < peaks; k++) {
      const off = r * (0.15 + 0.35 * rng.float()) * (k ? -1 : 1);
      g.parts.push({ kind: "isle", at: [at[0] + (ax * off) / W, at[1] + (ay * off) / H], size: r * (0.3 + 0.2 * rng.float()), height: rise * (0.15 + 0.2 * rng.float()) * tallK, turn: rng.float(), extra: 1 + rng.float(), soft: 0 });
    }
    groups.push({ from, to: g.parts.length });
  };
  // (round 5: islands vary in size and shape, never polka dots: a large island is its dome and one
  // to three arms reaching off it, long and turned their own ways, so its coast runs long and
  // irregular in bays and points; the rest come down in size from it, some long and thin)
  const landmass = (x: number, y: number, size: number, rise: number, depth: number, aspect: number, arms: number, turn = rng.float()) => {
    const from = g.parts.length;
    island([x / W, y / H], size, rise, depth, aspect, turn);
    // (the dome and each arm keep their straits as discs of their own, so the sea between the arms
    // stays the other islands' to use)
    placed.push([x, y, size * isleK * (1 + 0.3 * (aspect - 1))]);
    for (let k = 0; k < arms; k++) {
      const t = turn + (k % 2 ? 0.5 : 0) + 0.18 * (rng.float() - 0.5) + (k >= 2 ? 0.25 : 0);
      const [vx, vy] = unit(t);
      const off = size * isleK * portable.sqrt(aspect) * (0.55 + 0.25 * rng.float());
      const s = size * (0.38 + 0.2 * rng.float());
      const asp = 1.5 + 0.8 * rng.float();
      island([(x + vx * off) / W, (y + vy * off) / H], s, rise * 0.75, depth, asp, t + 0.12 * (rng.float() - 0.5));
      placed.push([x + vx * off, y + vy * off, s * isleK * (1 + 0.3 * (asp - 1))]);
    }
    // (one group: the island and its arms move as one piece)
    groups.splice(groups.length - 1 - arms, arms + 1, { from, to: g.parts.length });
  };
  // (a size's shape: two in five long and thin, 1.9–2.7 long; the rest 1–1.6)
  const shape = () => (rng.float() < 0.4 ? 1.9 + 0.8 * rng.float() : 1 + 0.6 * rng.float());
  // (round 4: neighbours keep a strait of 4–7 tiles, the game's reach (D429: 8), between the coasts
  // the field's island draws, about its radius, its warp and aspect turning it a little further or
  // nearer; where they meet, the strait pass parts them across the low ground)
  const placed: [number, number, number][] = [];
  const strait = () => 4 + 3 * rng.float();
  const reachOf = (size: number, aspect: number) => size * isleK * (1 + 0.3 * (aspect - 1));
  const clearOf = (x: number, y: number, r: number, gap: number) => placed.every(([px, py, pr]) => portable.hypot(px - x, py - y) >= pr + r + gap);
  const put = (x: number, y: number, size: number, rise: number, depth: number, aspect = shape(), turn = rng.float()) => {
    placed.push([x, y, reachOf(size, aspect)]);
    island([x / W, y / H], size, rise, depth, aspect, turn);
  };
  // (round 5, D417, D427: the mainland, the rim's lobes along one side or two side by side (the edge
  // layout's one, deeper; central's one, so its big island stands in the open sea, never a moat), two
  // or three a side of different reach, so its coast bends in bays and points; drawn here and kept on
  // the sea's part, so the islands are placed knowing where it lies (rimKeep in field.ts draws it))
  const lobes: RimLobe[] = [];
  const main: number[] = [];
  if (!g.seaRing) {
    const s0 = layout === "edge" ? 2 : Math.floor(4 * rng.float());
    main.push(s0);
    if (layout !== "edge" && layout !== "central" && rng.float() < 0.45) main.push((s0 + 1) % 4);
    // (three or four a side, of reach from a tenth of the side to a third, so the coast bends in deep
    // bays and broad points; two of like reach a side ran it straight along the edge)
    for (const s of main) {
      const m = 3 + Math.floor(2 * rng.float());
      for (let k = 0; k < m; k++) {
        const deep = layout === "edge" ? 0.22 + 0.18 * rng.float() : 0.13 + 0.2 * rng.float();
        lobes.push([(s + (k + 0.5) / m + 0.12 * (rng.float() - 0.5) + 4) % 4, 0.38 / m + 0.04 + 0.06 * rng.float(), deep]);
      }
    }
    // (two sides side by side meet in their corner, broad land)
    if (main.length === 2) lobes.push([main[1] % 4, 0.22 + 0.1 * rng.float(), 0.16 + 0.12 * rng.float()]);
    // (round 6: the mainland reaches in until the sea, before its islands, is under three fifths of the
    // map, read on a coarse grid by the coast the field draws (rimKeep); the islands are then placed in
    // that sea. Grown after them, held back wherever a lobe faced an island (every lobe at 256²), the
    // mainland was a sliver; at two thirds, the water crossed Islands' cap (D369's 0.70) on many lands
    // and some found no place for a start)
    const G = 32;
    const openSea = () => {
      let n = 0;
      for (let gy = 0; gy < G; gy++)
        for (let gx = 0; gx < G; gx++) if (rimKeep(coast, ((gx + 0.5) / G) * (W - 1), ((gy + 0.5) / G) * (H - 1), W, H, lobes, thin) >= 0.5) n++;
      return n / (G * G);
    };
    // (all together, in proportion, so they keep their different reaches; each grown to a cap of its own
    // ran them all to it, one straight front)
    // (D432, round 3's rule: under 128² a land drawn again has a smaller sea, so the shore keeps room
    // for a start; the basin no longer sets the sea's size, so the open sea's share shrinks with it)
    // (Any's sea maps keep under half, their lobes reaching further: their water cap is 0.55, Islands' 0.70)
    const openMost = (thin ? 0.58 : 0.46) * shrink;
    const lobeMost = g.theme === "islands" ? 0.5 : 0.6;
    for (let k = 0; k < 14 && openSea() > openMost && Math.max(...lobes.map((l) => l[2])) * 1.1 <= lobeMost; k++) for (const l of lobes) l[2] *= 1.1;
  }
  // (the land along an edge, from it: the lip (1–2 tiles) and its fall, its lobe, and as far as its
  // warp and noise mostly carry it (rimKeep))
  // (the margins in tiles shrink with the map under 128², whose sea and islands are smaller and whose
  // room they took: at full size, 96² drew lands without islands enough twice as often)
  const tight = Math.min(1, side / 128);
  const rimAt = (u: number) => (thin ? 4 : 10) * tight + side * rimLobe(lobes, u) * 1.35 + (rimLobe(lobes, u) > 0 ? 0.12 * side * Math.max(0, ...lobes.map((l) => l[2])) : 0);
  // (an island's centre keeps the land along each edge and its own foot from the map's edges, so it
  // stands in the sea; one rooted in that land was the shore's own, joined to it by high ground)
  const room = (x: number, y: number, r: number) => {
    const fx = x / (W - 1);
    const fy = y / (H - 1);
    // (6 tiles past its reach: its warp carries its coast up to 5 further, and the lobes' lifted ground
    // joined it to the shore by high ground the strait pass can't cut)
    const m = r + 6 * tight;
    return y - rimAt(fx) >= m && H - 1 - y - rimAt(2 + (1 - fx)) >= m && x - rimAt(3 + (1 - fy)) >= m && W - 1 - x - rimAt(1 + fy) >= m;
  };
  // (somewhere in the sea for an island of `size`: drawn till it has room and a strait from the rest)
  const somewhere = (size: number, aspect: number, x0: number, x1: number, y0: number, y1: number): [number, number] | null => {
    for (let draw = 0; draw < 150; draw++) {
      const x = (x0 + (x1 - x0) * rng.float()) * W;
      const y = (y0 + (y1 - y0) * rng.float()) * H;
      const r = reachOf(size, aspect);
      if (room(x, y, r) && clearOf(x, y, r, strait())) return [x, y];
    }
    return null;
  };
  // (smaller islands, coming down in size from `from` by about a fifth each to about 7 tiles at 128²,
  // some long and thin: smaller and lower, they stood out of the sea as pebbles of a few tiles, or not
  // at all, and the promise's three islands were missing on a third of the lands)
  // (round 6: each drawn from a broad range round its step, the least ones too, so no run of
  // islands of one size: at 256² the later ones all stood at the least, rows of like dots)
  const scatter = (count: number, from: number, least: number, depth: number, x0 = 0.08, x1 = 0.92, y0 = 0.08, y1 = 0.92) => {
    let size = from;
    for (let k = 0; k < count; k++) {
      const s = Math.max(least * (0.85 + 0.45 * rng.float()), size * (0.8 + 0.4 * rng.float()));
      const asp = shape();
      const at = somewhere(s, asp, x0, x1, y0, y1);
      if (at) put(at[0], at[1], s, 3.5 + 0.3 * s * rng.float(), depth, asp);
      size *= 0.72 + 0.12 * rng.float();
    }
  };
  let tilt = 3 + rng.float();
  switch (layout) {
    case "central": {
      // one big island in the open sea, a long coast of bays and points, with smaller ones round it
      // (round 5: every layout's sea 4 levels deeper than round 4's, its floor's noise well under the
      // water: shallower, the floor's high ground stood dry a level over the sea, flats that joined the
      // islands to the shore on a third of the lands)
      // (round 5: 18–22 tiles at 128² with two arms; round 4's 19–23, a round dome)
      g.focus = [0.4 + 0.2 * rng.float(), 0.4 + 0.2 * rng.float()];
      const depth = 13 + 2.5 * rng.float();
      sea([g.focus[0], g.focus[1]], open(), depth, rng.float(), 1.1 + 0.3 * rng.float());
      const big = 18 + 4 * rng.float();
      landmass(g.focus[0] * W, g.focus[1] * H, big, 7 + 3 * rng.float(), depth, 1.3 + 0.5 * rng.float(), 2);
      // (smaller ones off it, stepping stones from the shore, down from 10 tiles)
      scatter(4 + Math.floor(3 * rng.float()), 10, 7, depth);
      break;
    }
    case "edge": {
      // a mainland along one edge and a sea off it, open to the map's other edges, with islands off
      // the mainland's coast (the map's orientation turns it to any edge, D275)
      g.focus = [0.5, 0.35];
      const depth = 12.5 + 2 * rng.float();
      sea([0.5, 0.5], open(), depth, 0, 1.2);
      // (D432: the islands lie off the mainland, in the sea's half: one large one, the rest down from it)
      const at = somewhere(15, 1.6, 0.2, 0.8, 0.25, 0.6) ?? [0.5 * W, 0.42 * H];
      landmass(at[0], at[1], 13 + 4 * rng.float(), 6 + 3 * rng.float(), depth, 1.4 + 0.6 * rng.float(), 1 + Math.floor(2 * rng.float()), 0.25 * Math.floor(2 * rng.float()));
      scatter(4 + Math.floor(3 * rng.float()), 10, 7, depth, 0.08, 0.92, 0.08, 0.7);
      // (its water leaves by the sea's edge, the south: D275 turns it)
      g.flowDir = 6;
      break;
    }
    case "archipelago": {
      // islands scattered across the map, one large with a long coast, the rest coming down from it,
      // the water between them straits and channels (round 5: one of 15–18 tiles with arms, then down
      // by about a sixth each to 7; round 4's six to nine of 9–13 were dots of much the same size)
      g.focus = [0.45 + 0.1 * rng.float(), 0.45 + 0.1 * rng.float()];
      const depth = 12.5 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], open(), depth, rng.float(), 1 + 0.3 * rng.float());
      const big = 15 + 3 * rng.float();
      const at = somewhere(big, 1.6, 0.25, 0.75, 0.25, 0.75) ?? [g.focus[0] * W, g.focus[1] * H];
      landmass(at[0], at[1], big, 6 + 3 * rng.float(), depth, 1.4 + 0.6 * rng.float(), 1 + Math.floor(2 * rng.float()));
      scatter(6 + Math.floor(3 * rng.float()), 12, 7, depth);
      tilt = 3 + rng.float();
      break;
    }
    case "chain": {
      // a line of islands along an arc across the map, the largest in its middle, long along the arc,
      // a strait between each and the next
      g.focus = [0.42 + 0.16 * rng.float(), 0.42 + 0.16 * rng.float()];
      const depth = 12.5 + 2 * rng.float();
      const turn = rng.float();
      sea([g.focus[0], g.focus[1]], open(), depth, turn, 1.1 + 0.3 * rng.float());
      const bend = (rng.float() < 0.5 ? 1 : -1) * side * (0.7 + 0.8 * rng.float());
      const [ax, ay] = unit(turn);
      const ccx = g.focus[0] * W - ay * bend;
      const ccy = g.focus[1] * H + ax * bend;
      const base = turn + (bend > 0 ? -0.25 : 0.25);
      const length = side * (0.7 + 0.12 * rng.float());
      const count = 3 + Math.floor(2 * rng.float());
      const spacing = length / (count - 1);
      const span = length / Math.abs(bend) / TWO_PI;
      for (let k = 0; k < count; k++) {
        const t = k / (count - 1) - 0.5;
        const [ux, uy] = unit(base + t * span);
        const mid = 1 - Math.abs(t) * 0.9;
        // (long along the arc, 1–2.2, a strait of 4–7 tiles between neighbours at any size: the
        // middle one largest, the ends smaller; round 6: each its own size and turn, never a row of
        // like ovals)
        const asp = 1 + 1.2 * rng.float();
        const size = (((spacing - strait()) / (2.2 * portable.sqrt(asp))) * (0.65 + 0.35 * mid) * (0.7 + 0.3 * rng.float())) / isleK;
        put(ccx + ux * Math.abs(bend), ccy + uy * Math.abs(bend), size, 3 + 5 * mid + 2 * rng.float(), depth, asp, base + t * span + 0.25 + 0.16 * (rng.float() - 0.5));
      }
      scatter(1 + Math.floor(2 * rng.float()), 7, 7, depth);
      break;
    }
    case "atolls": {
      // a ring of land round a lagoon in open sea, lobed, never a circle, with one to three passes to
      // the sea, and islands off it coming down in size
      g.focus = [0.42 + 0.16 * rng.float(), 0.42 + 0.16 * rng.float()];
      const depth = 12 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], open(), depth, rng.float(), 1.05 + 0.2 * rng.float());
      const cx = g.focus[0] * W;
      const cy = g.focus[1] * H;
      const ra = isleK * (17 + 4 * rng.float());
      const k1 = 2 + (rng.float() < 0.5 ? 1 : 0);
      const p1 = rng.float();
      const k2 = 4 + (rng.float() < 0.5 ? 1 : 0);
      const p2 = rng.float();
      const gaps = 2 + Math.floor(2 * rng.float());
      const gapAt = Array.from({ length: gaps }, () => rng.float());
      // (D417: broader pieces with relief of their own, crescents rather than a necklace of islets)
      const pieces = 10 + Math.floor(4 * rng.float());
      for (let k = 0; k < pieces; k++) {
        const t = (k + 0.3 * (rng.float() - 0.5)) / pieces;
        if (gapAt.some((q) => Math.abs(((t - q + 1.5) % 1) - 0.5) < 0.05)) continue;
        const [ux, uy] = unit(t);
        const r = ra * (1 + 0.16 * unit(k1 * t + p1)[1] + 0.08 * unit(k2 * t + p2)[1]);
        island([(cx + ux * r) / W, (cy + uy * r) / H], 6 + 2 * rng.float(), 3 + 3.5 * rng.float(), depth);
      }
      placed.push([cx, cy, ra + 8 * isleK]);
      if (rng.float() < 0.5) island([g.focus[0], g.focus[1]], 4 + 3 * rng.float(), 5 + 3 * rng.float(), depth);
      // (the atoll alone is one ring of land; islands off it keep the promise's three)
      scatter(3 + Math.floor(2 * rng.float()), 13, 7, depth);
      tilt = 3 + rng.float();
      break;
    }
    case "twoSeas": {
      // two large islands parted by a strait (D209's two seas became Kyler's strait, 2026-10-02), one
      // larger than the other, both long along the strait with arms off their far sides
      g.focus = [0.44 + 0.12 * rng.float(), 0.44 + 0.12 * rng.float()];
      const turn = rng.float();
      const [ax, ay] = unit(turn);
      const depth = 12.5 + 2 * rng.float();
      sea([g.focus[0], g.focus[1]], open(), depth, turn, 1.1 + 0.3 * rng.float());
      const r1 = 17 + 4 * rng.float();
      const r2 = r1 * (0.6 + 0.25 * rng.float());
      // (each island's coast lies about its radius ÷ √aspect across its long axis, its warp beyond)
      const apart = (r1 + r2) * isleK * 0.5 + strait() / 2;
      for (const [sgn, r] of [[-1, r1], [1, r2]] as const) {
        const x = g.focus[0] * W + sgn * -ay * apart + ax * side * 0.08 * (rng.float() - 0.5);
        const y = g.focus[1] * H + sgn * ax * apart + ay * side * 0.08 * (rng.float() - 0.5);
        // (long along the strait, so the two face each other across it; an arm off each one's far side)
        landmass(x, y, r, 5 + 4 * rng.float(), depth, 1.4 + 0.5 * rng.float(), 0, turn + 0.02 * (rng.float() - 0.5));
        const [vx, vy] = [sgn * -ay, sgn * ax];
        const off = r * isleK * (0.7 + 0.2 * rng.float());
        const s = r * (0.4 + 0.15 * rng.float());
        const from = groups[groups.length - 1].from;
        island([(x + vx * off) / W, (y + vy * off) / H], s, 4, depth, 1.5 + 0.7 * rng.float());
        groups.splice(groups.length - 2, 2, { from, to: g.parts.length });
      }
      scatter(2 + Math.floor(2 * rng.float()), 9, 7, depth);
      tilt = 3 + rng.float();
      break;
    }
  }
  const offshore: { from: number; to: number }[] = [];
  // (the isle parts of each island, the parts the field raises out of the sea: its dome and arms)
  const islesOf = (grp: { from: number; to: number }) => g.parts.slice(grp.from, grp.to).filter((q) => q.kind === "isle" && q.isle);
  // (an island's reach across and along the map, each part's ellipse's, a tenth more for its warp)
  const boxOf = (grp: { from: number; to: number }) => {
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const q of islesOf(grp)) {
      const [ux, uy] = unit(q.turn);
      const a = q.size * portable.sqrt(q.extra) * 1.1;
      const b = (q.size / portable.sqrt(q.extra)) * 1.1;
      const rx = portable.hypot(a * ux, b * uy) + 4;
      const ry = portable.hypot(a * uy, b * ux) + 4;
      const x = q.at[0] * (W - 1);
      const y = q.at[1] * (H - 1);
      x0 = Math.min(x0, x - rx);
      x1 = Math.max(x1, x + rx);
      y0 = Math.min(y0, y - ry);
      y1 = Math.max(y1, y + ry);
    }
    return { x0, x1, y0, y1 };
  };
  // (D432: an island stands in the sea, clear of the lip round it, else it is drawn in toward the
  // sea's middle until it is; one rooted in the lip was the shore's own)
  {
    const sea = g.parts.find((q) => q.shape === "sea")!;
    for (const grp of groups) {
      if (offshore.includes(grp)) continue;
      const b = boxOf(grp);
      const p = g.parts[grp.from];
      const cx = p.at[0] * (W - 1);
      const cy = p.at[1] * (H - 1);
      const sx = sea.at[0] * (W - 1);
      const sy = sea.at[1] * (H - 1);
      let t = 1;
      // (its reach, 4 tiles beyond its coast, 14 tiles from the map's edge: the lip, its fall, a strait
      // and open sea past it, so it stands clear of the edge)
      const m = (thin ? 14 : 22) * tight;
      if (b.x0 < m && cx < sx) t = Math.min(t, (sx - (cx - b.x0) - m) / (sx - cx));
      if (b.x1 > W - 1 - m && cx > sx) t = Math.min(t, (W - 1 - m - (b.x1 - cx) - sx) / (cx - sx));
      if (b.y0 < m && cy < sy) t = Math.min(t, (sy - (cy - b.y0) - m) / (sy - cy));
      if (b.y1 > H - 1 - m && cy > sy) t = Math.min(t, (H - 1 - m - (b.y1 - cy) - sy) / (cy - sy));
      if (!(t < 1)) continue;
      t = Math.max(0, t);
      const ddx = ((sx + (cx - sx) * t) - cx) / (W - 1);
      const ddy = ((sy + (cy - sy) * t) - cy) / (H - 1);
      for (let k = grp.from; k < grp.to; k++) g.parts[k].at = [g.parts[k].at[0] + ddx, g.parts[k].at[1] + ddy];
    }
  }
  // (the mainland's lobes give way to the islands: a lobe reaching over one joined it to the shore,
  // so it draws back until each keeps a strait from it; only the lobes the island faces)
  const rimClashes = () => {
    const at: number[] = [];
    for (const grp of groups) {
      if (offshore.includes(grp)) continue;
      const b = boxOf(grp);
      const p = g.parts[grp.from];
      if (b.y0 < rimAt(p.at[0])) at.push(p.at[0]);
      if (H - 1 - b.y1 < rimAt(3 - p.at[0])) at.push(3 - p.at[0]);
      if (b.x0 < rimAt(4 - p.at[1])) at.push((4 - p.at[1]) % 4);
      if (W - 1 - b.x1 < rimAt(1 + p.at[1])) at.push(1 + p.at[1]);
    }
    return at;
  };
  // (round 6: to three fifths of its reach at most, the strait pass parting what still meets it: a
  // chain across the map drew every lobe back to a sliver of mainland, and the start found no place)
  const reach0 = lobes.map((l) => l[2]);
  for (let k = 0; k < 12; k++) {
    const at = rimClashes();
    if (!at.length) break;
    lobes.forEach((l, i) => {
      if (at.some((u) => Math.min(Math.abs(u - l[0]), 4 - Math.abs(u - l[0])) < l[1])) l[2] = Math.max(0.6 * reach0[i], l[2] * 0.85);
    });
  }
  // (the sea kept under Islands' water cap (D369: 0.70; over it the shown land fails water.no_flood)
  // and Any's sea maps' half map. The land the islands and the mainland will raise is read on a coarse
  // grid (the coast as the field draws it, rimKeep; each island part an ellipse to 0.78 of its radius,
  // where its lobed and coved coast mostly lies), and the mainland's lobes reach further in while the
  // islands keep their straits, until the reading leaves 45% of the map to the sea on Islands (the
  // reading short of the water the land holds), 44% on Any.)
  if (!g.seaRing && lobes.length) {
    const most = g.theme === "islands" ? 0.45 : 0.44;
    const isles = groups.flatMap(islesOf);
    const G = 48;
    const wet = () => {
      let n = 0;
      for (let gy = 0; gy < G; gy++)
        for (let gx = 0; gx < G; gx++) {
          const x = ((gx + 0.5) / G) * (W - 1);
          const y = ((gy + 0.5) / G) * (H - 1);
          // (the land along the edges: the lip, and the mainland's lobes, as the field draws them)
          if (rimKeep(coast, x, y, W, H, lobes, thin) < 0.5) continue;
          const inIsle = isles.some((q) => {
            const [ux, uy] = unit(q.turn);
            const dx = x - q.at[0] * (W - 1);
            const dy = y - q.at[1] * (H - 1);
            const a = (dx * ux + dy * uy) / (q.size * portable.sqrt(q.extra));
            const b = (-dx * uy + dy * ux) / (q.size / portable.sqrt(q.extra));
            // (round 6: to 0.78 of its radius, its lobes and coves taking about a fifth of its ellipse)
            return a * a + b * b < 0.61;
          });
          if (!inIsle) n++;
        }
      return n / (G * G);
    };
    for (let k = 0; k < 16 && wet() > most; k++) {
      const before = lobes.map((l) => l[2]);
      if (Math.max(...lobes.map((l) => l[2])) * 1.12 > (g.theme === "islands" ? 0.5 : 0.6)) break;
      for (const l of lobes) l[2] *= 1.12;
      const at = rimClashes();
      lobes.forEach((l, i) => {
        if (at.some((u) => Math.min(Math.abs(u - l[0]), 4 - Math.abs(u - l[0])) < l[1])) l[2] = before[i];
      });
      if (lobes.every((l, i) => l[2] === before[i])) break;
    }
  }
  // (round 5: one island a strait off the mainland, so the start's land has one within the game's
  // reach (D429) however much of the map the sea takes; with the sea most of the map, the nearest
  // island stood out of reach on half the lands)
  // (round 6: placed last, against the coast the field will draw (rimKeep, the lobes as they now
  // reach), off the mainland's sides only: the lip is a tile or two at the map's edge, no shore; its
  // whole outline `off` tiles out from its coast stands in the sea, else another place is drawn; where
  // none is clear, the clearest found, an island it meets joined to it and in reach in its turn)
  // (it stands where it was put: the pull-in and the lobes' giving way above have passed)
  if (main.length) {
    // (two on a larger map, one 3 tiles off and one 7, so one of them stands in the strait the coast's
    // noise leaves; one 5 tiles off on a smaller map)
    const gaps = side > 160 ? [3, 7] : [5];
    for (const off of gaps) {
      let best: { score: number; x: number; y: number; size: number; asp: number; s: number } | null = null;
      for (let draw = 0; draw < 60; draw++) {
        const s = main[Math.floor(main.length * rng.float())];
        const f = 0.15 + 0.7 * rng.float();
        const size = 10 + 3 * rng.float();
        const asp = 1.4 + 0.6 * rng.float();
        // (long along the coast: its reach toward the coast is its short axis)
        const a = size * isleK * portable.sqrt(asp);
        const b = (size * isleK) / portable.sqrt(asp);
        const at = (d: number): [number, number] => (s === 0 ? [f * (W - 1), d] : s === 1 ? [W - 1 - d, f * (H - 1)] : s === 2 ? [(1 - f) * (W - 1), H - 1 - d] : [d, (1 - f) * (H - 1)]);
        // (the coast: where the sea begins, walking in from the edge)
        let dc = 0;
        while (dc < side / 2 && rimKeep(coast, ...at(dc), W, H, lobes, thin) < 0.5) dc++;
        if (dc >= side / 2) continue;
        const [x, y] = at(dc + b + off);
        // (its outline, `off` less a tile out from its coast, all sea)
        const [ux, uy] = s % 2 ? [0, 1] : [1, 0];
        let land = 0;
        for (let q = 0; q < 24; q++) {
          const [cx, cy] = unit(q / 24);
          const px = x + ux * cx * (a + off - 1) - uy * cy * (b + off - 1);
          const py = y + uy * cx * (a + off - 1) + ux * cy * (b + off - 1);
          if (px < 0 || py < 0 || px > W - 1 || py > H - 1 || rimKeep(coast, px, py, W, H, lobes, thin) < 0.5) land++;
        }
        const rr = reachOf(size, asp);
        const gap = Math.min(...placed.map(([px, py, pr]) => portable.hypot(px - x, py - y) - pr - rr), Infinity);
        const score = Math.min(gap, 6) - 3 * land;
        if (!best || score > best.score) best = { score, x, y, size, asp, s };
        if (gap >= 6 && land === 0) break;
      }
      if (best) {
        put(best.x, best.y, best.size, 3 + 3 * rng.float(), seaDepth, best.asp, best.s % 2 ? 0.25 : 0);
        const grp = groups[groups.length - 1];
        g.parts[grp.from].calm = true;
        offshore.push(grp);
      }
    }
  } else if (g.seaRing) {
    // (inside a ring of land, a stepping stone out toward the ring's shore, the clearest of a few)
    const sea = g.parts[first];
    let best: { gap: number; x: number; y: number } | null = null;
    for (let draw = 0; draw < 24; draw++) {
      const [vx, vy] = unit(rng.float());
      const x = sea.at[0] * W + vx * sea.size * 0.62;
      const y = sea.at[1] * H + vy * sea.size * 0.62;
      const gap = Math.min(...placed.map(([px, py, pr]) => portable.hypot(px - x, py - y) - pr - 9 * isleK), Infinity);
      if (!best || gap > best.gap) best = { gap, x, y };
      if (gap >= 6) break;
    }
    if (best) put(best.x, best.y, 9 + 2 * rng.float(), 3 + 3 * rng.float(), seaDepth);
  }
  if (lobes.length) g.parts[first].lobes = lobes;
  // (D432: the sea is the map's water, not a lake of the budget: the budget is the most the settings
  // allow a lake (half the map), so the hydrology never cuts the sea's sill down to fit it. Cut down,
  // the sill fell to the sea's floor and the rivers' channels ran on through it and out, and the sea
  // drained: most open layouts at 128² had no sea at the land stage.)
  // (round 5: Islands' own budget is its water cap, D369's 0.70, so its sea may be most of the map;
  // Any's sea maps keep the half map every other theme has)
  g.hydro.lakeBudget = g.theme === "islands" ? ISLANDS_LAKE_MOST : Math.max(g.hydro.lakeBudget, 0.42 + 0.1 * rng.float(), 0.5);
  // (D432: the sea's outlet pours over its sill: a river's bed past a lake is cut `incise` levels
  // under the ground beside it, and the sea's sill with it; a shallow sea drained to its floor. On
  // a sea's map the rivers run shallow channels, cut one level under the land.)
  g.hydro.incise = Math.min(g.hydro.incise, 0.4);
  // the sea is fed from the heights round it: springs, whose rivers pour down into it (a river from
  // an edge enters low on the bowl's rim, and no sea stands above where its water comes in)
  g.hydro.inflows = 0;
  g.hydro.springs = Math.max(g.hydro.springs, 2 + (rng.float() < 0.5 ? 1 : 0));
  // the land rises from the sea toward the edges: a bowl, quiet noise, levels spread by height
  // rather than equal area, so the sea keeps a broad floor below its shores
  // (D410: a low bowl, its rim a shore, not a frame of high land; the islands keep the noise's relief)
  // (round 5: an open sea runs to the map's edges, so its floor lies level: the radial tilt raised it
  // toward the edges to the lip's own height, the outlet set the sea a level below that, and the floor's
  // outer reaches stood dry, flats that joined the islands to the shore or drained the sea)
  // (round 6: a quarter to a half of a level: at a half to one, the edges, where the lip now holds the
  // sea, stood a level over the middle, and the low tops of islands there stood under the water)
  g.tilt = g.seaRing ? tilt : 0.25 + 0.25 * rng.float();
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
  // the highest terrain (item 36): a ceiling on every map that no Variety goes past (Kyler,
  // 2026-10-03; the release-gate generator hunt's finding 3: a land drawn tall by Variety kept the
  // default cap's 22 under a Highest terrain of 16); a tall land under a cap of 16 or lower is not tall
  const cap = s.terrain.highestTerrain;
  if (!g.tall) g.top = Math.min(g.top, cap, EDITOR_TOP);
  else {
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
    g.hydro.noInflows = true;
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
  g.hydro.lakeBudget = clamp(g.hydro.lakeBudget * (storeRatio > 1 ? portable.sqrt(storeRatio) : s.water.droughtReserve === "scarce" && p.droughtReserve !== "scarce" ? 0.8 : 1), 0.01, lakeMost(g));
  const moreBasins = storeRatio > 1 ? Math.round(1.3 * portable.log2(storeRatio)) : s.water.droughtReserve === "scarce" && p.droughtReserve !== "scarce" ? -1 : 0;
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
    g.hydro.lakeBudget = clamp(g.hydro.lakeBudget * (1 + 0.5 * dl), 0.01, lakeMost(g));
  } else if (dl < 0) {
    for (let k = 0; k < -2 * dl; k++) {
      const at = g.parts.findIndex((q) => q.kind === "basin" && q.shape !== "sea");
      if (at >= 0) g.parts.splice(at, 1);
    }
    g.troughs *= portable.pow(0.5, -dl);
    g.lakeSprings *= portable.pow(0.6, -dl);
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
