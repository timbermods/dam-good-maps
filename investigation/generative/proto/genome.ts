// The genome: every continuous parameter one map is made from, drawn from its theme's prior.
//
// A theme is not a layout. It is a prior over the same parameter space: how likely each landform
// part is, how strong the processes run, how much water enters and where. Every theme can draw
// every part; the prior only weights them. Variety (0–100) widens every range and flattens the
// part weights toward uniform, so at 100 any theme can make anything the system can make.
// A recipe (a named premise) is at most a forced part with its parameters drawn in a narrower
// range; it never fixes the rest of the map.

import { stream, type Rng } from "../../../src/core/math/rng";
import type { ThemeId } from "../../../src/core/spec/mapspec";
import { clamp } from "./num";

export type PartKind = "ridge" | "trough" | "basin" | "caldera" | "mesa" | "mesaField" | "escarpment" | "cone" | "plateau" | "knolls" | "spiral";

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
  /** Basins only (design version 2): a round bowl (a pond, a crater-like lake), a valley-shaped
   *  lake (the default for large basins), or an island sea. */
  shape?: "round" | "valley" | "sea";
}

export interface Genome {
  theme: ThemeId;
  variety: number;
  recipe: string | null;
  /** Lowest ground level before rivers cut (1–4) and the spread of levels the terrain aims for. */
  base: number;
  relief: number;
  /** The regional slope toward the outlet side: one of the 8 flow directions (E first, CCW). */
  flowDir: number;
  tilt: number;
  /** linear: the land falls toward the outlet side; radial: it falls toward a basin, whose outlet
   *  leaves toward the flow direction (lakes and seas gather the rivers). */
  tiltKind: "linear" | "radial";
  /** Where a radial slope falls to (fractions of the map). */
  focus: [number, number];
  noise: { amp: number; cell: number; octaves: number; warp: number; warpCell: number; ridged: number };
  parts: Part[];
  erosion: { iterations: number; k: number; diffusion: number };
  /** Terraces: bench height in levels (1 smooth steps, 2–3 cliffs), the share of the map terraced,
   *  and the waviness of contour edges. */
  terrace: { step: number; share: number; cell: number; jitter: number };
  hydro: {
    inflows: number;
    springs: number;
    /** Total clean flow as a multiple of the size-aware official median (River flow). */
    flowMul: number;
    /** The largest share of the map one lake may cover before its outlet is cut down. */
    lakeBudget: number;
    /** Chance that a river splits round an island, and that it fans into a delta near its outlet. */
    split: number;
    delta: number;
    /** Extra levels a river cuts below the ground round it (canyons), and the half-width of the
     *  floor it clears beside its channel (a canyon floor, a floodplain). */
    incise: number;
    floor: number;
  };
  hazards: { badwater: "none" | "pit" | "stream"; ratio: number; thorns: boolean };
  resources: { forest: number; bushes: number; ruins: number; grove: "scattered" | "normal" | "bigWoods" };
  /** What kind of place the settler looks for first (weights over lake shore, river bank, a
   *  confluence, below a fall, a high bench, a spring's stream). */
  settler: number[];
}

interface Range {
  lo: number;
  hi: number;
}
interface Prior {
  base: Range;
  relief: Range;
  tilt: Range;
  amp: Range;
  cell: Range;
  warp: Range;
  ridged: Range;
  /** Part weights; counts scale with the map's area (per 128² map). */
  parts: Partial<Record<PartKind, number>>;
  partCount: Range;
  knollsPer128: Range;
  erosion: { iterations: Range; k: Range; diffusion: Range };
  terrace: { step: number[]; share: Range };
  inflows: number[];
  springs: Range;
  flowMul: Range;
  lakeBudget: Range;
  split: number;
  delta: number;
  radial: number;
  incise: Range;
  floor: Range;
  badwater: [number, number, number];
  thorns: number;
  recipes: Partial<Record<string, number>>;
}

const P: Record<ThemeId, Prior> = {
  riverValley: {
    base: { lo: 2, hi: 4 }, relief: { lo: 9, hi: 13 }, tilt: { lo: 2, hi: 5 }, amp: { lo: 3, hi: 6 }, cell: { lo: 28, hi: 56 }, warp: { lo: 4, hi: 16 }, ridged: { lo: 0, hi: 0.4 },
    parts: { ridge: 2, trough: 1, basin: 1, mesa: 1, escarpment: 1, plateau: 2, knolls: 2, caldera: 0.3, cone: 0.3, mesaField: 0.3 },
    partCount: { lo: 1, hi: 4 }, knollsPer128: { lo: 4, hi: 14 },
    erosion: { iterations: { lo: 8, hi: 22 }, k: { lo: 0.01, hi: 0.035 }, diffusion: { lo: 0.02, hi: 0.12 } },
    terrace: { step: [1, 1, 1, 2], share: { lo: 0, hi: 0.5 } },
    inflows: [0, 1, 1, 1, 2, 2], springs: { lo: 0, hi: 3 }, flowMul: { lo: 0.9, hi: 2.2 }, lakeBudget: { lo: 0.02, hi: 0.08 },
    split: 0.25, delta: 0.1, radial: 0.1, incise: { lo: 0, hi: 1 }, floor: { lo: 0, hi: 5 }, badwater: [0.2, 0.55, 0.25], thorns: 0.5,
    recipes: { "island-in-a-river": 0.08, "great-scarp": 0.06 },
  },
  canyon: {
    base: { lo: 2, hi: 3 }, relief: { lo: 11, hi: 14 }, tilt: { lo: 1, hi: 5 }, amp: { lo: 2.5, hi: 5.5 }, cell: { lo: 24, hi: 48 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0.2, hi: 0.7 },
    parts: { mesa: 2, mesaField: 1.5, escarpment: 1.5, plateau: 2, ridge: 1, trough: 1.5, knolls: 0.5, cone: 0.2 },
    partCount: { lo: 2, hi: 5 }, knollsPer128: { lo: 0, hi: 6 },
    erosion: { iterations: { lo: 14, hi: 30 }, k: { lo: 0.025, hi: 0.06 }, diffusion: { lo: 0, hi: 0.04 } },
    terrace: { step: [1, 2, 2, 3], share: { lo: 0.3, hi: 0.9 } },
    inflows: [1, 1, 1, 2], springs: { lo: 0, hi: 2 }, flowMul: { lo: 0.9, hi: 1.8 }, lakeBudget: { lo: 0.01, hi: 0.05 },
    split: 0.1, delta: 0, radial: 0, incise: { lo: 2, hi: 5 }, floor: { lo: 2, hi: 8 }, badwater: [0.25, 0.5, 0.25], thorns: 0.2,
    recipes: { "mesa-field": 0.1, "great-scarp": 0.08 },
  },
  highlands: {
    base: { lo: 2, hi: 4 }, relief: { lo: 11, hi: 14 }, tilt: { lo: 1, hi: 4 }, amp: { lo: 3.5, hi: 7 }, cell: { lo: 22, hi: 44 }, warp: { lo: 6, hi: 18 }, ridged: { lo: 0.1, hi: 0.6 },
    parts: { plateau: 3, mesa: 2, ridge: 2, escarpment: 1, cone: 0.7, caldera: 0.5, knolls: 1.5, basin: 0.5, spiral: 0.1 },
    partCount: { lo: 2, hi: 6 }, knollsPer128: { lo: 6, hi: 18 },
    erosion: { iterations: { lo: 8, hi: 20 }, k: { lo: 0.012, hi: 0.035 }, diffusion: { lo: 0.01, hi: 0.08 } },
    terrace: { step: [1, 1, 2, 2, 3], share: { lo: 0.2, hi: 0.7 } },
    inflows: [0, 0, 1, 1, 2], springs: { lo: 1, hi: 5 }, flowMul: { lo: 0.9, hi: 2 }, lakeBudget: { lo: 0.02, hi: 0.07 },
    split: 0.1, delta: 0, radial: 0.15, incise: { lo: 0, hi: 2.5 }, floor: { lo: 0, hi: 4 }, badwater: [0.35, 0.45, 0.2], thorns: 0.5,
    recipes: { "badwater-volcano": 0.08, "hanging-lake": 0.08 },
  },
  lakeBasin: {
    base: { lo: 2, hi: 4 }, relief: { lo: 8, hi: 12 }, tilt: { lo: 0, hi: 2.5 }, amp: { lo: 2.5, hi: 5 }, cell: { lo: 30, hi: 60 }, warp: { lo: 4, hi: 14 }, ridged: { lo: 0, hi: 0.3 },
    parts: { basin: 4, caldera: 1.5, plateau: 1, knolls: 1.5, ridge: 1, mesa: 0.5, cone: 0.3 },
    partCount: { lo: 1, hi: 4 }, knollsPer128: { lo: 3, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 16 }, k: { lo: 0.008, hi: 0.025 }, diffusion: { lo: 0.03, hi: 0.12 } },
    terrace: { step: [1, 1, 1, 2], share: { lo: 0, hi: 0.4 } },
    inflows: [0, 1, 1, 2, 2], springs: { lo: 0, hi: 3 }, flowMul: { lo: 1.2, hi: 2.6 }, lakeBudget: { lo: 0.1, hi: 0.26 },
    split: 0.05, delta: 0, radial: 0.85, incise: { lo: 0, hi: 1 }, floor: { lo: 0, hi: 4 }, badwater: [0.25, 0.5, 0.25], thorns: 0.2,
    recipes: { caldera: 0.12, "chain-of-lakes": 0.1 },
  },
  delta: {
    base: { lo: 2, hi: 3 }, relief: { lo: 6, hi: 10 }, tilt: { lo: 2, hi: 5 }, amp: { lo: 2, hi: 4 }, cell: { lo: 30, hi: 64 }, warp: { lo: 6, hi: 20 }, ridged: { lo: 0, hi: 0.2 },
    parts: { plateau: 1, trough: 1, knolls: 2, basin: 1, ridge: 0.5, escarpment: 0.5 },
    partCount: { lo: 1, hi: 3 }, knollsPer128: { lo: 4, hi: 12 },
    erosion: { iterations: { lo: 6, hi: 14 }, k: { lo: 0.008, hi: 0.02 }, diffusion: { lo: 0.05, hi: 0.15 } },
    terrace: { step: [1], share: { lo: 0, hi: 0.2 } },
    inflows: [1, 1, 2], springs: { lo: 0, hi: 2 }, flowMul: { lo: 1.5, hi: 2.8 }, lakeBudget: { lo: 0.02, hi: 0.08 },
    split: 0.5, delta: 0.85, radial: 0, incise: { lo: 0, hi: 0.5 }, floor: { lo: 2, hi: 8 }, badwater: [0.25, 0.5, 0.25], thorns: 0.1,
    recipes: { "island-in-a-river": 0.12 },
  },
  islands: {
    base: { lo: 2, hi: 3 }, relief: { lo: 7, hi: 11 }, tilt: { lo: 0, hi: 2 }, amp: { lo: 3, hi: 6 }, cell: { lo: 18, hi: 36 }, warp: { lo: 4, hi: 14 }, ridged: { lo: 0, hi: 0.3 },
    parts: { basin: 5, knolls: 2, cone: 0.7, caldera: 0.5, mesa: 0.5, plateau: 0.5 },
    partCount: { lo: 1, hi: 3 }, knollsPer128: { lo: 6, hi: 16 },
    erosion: { iterations: { lo: 4, hi: 12 }, k: { lo: 0.006, hi: 0.02 }, diffusion: { lo: 0.03, hi: 0.1 } },
    terrace: { step: [1, 1, 2], share: { lo: 0, hi: 0.3 } },
    inflows: [1, 1, 2, 2], springs: { lo: 0, hi: 3 }, flowMul: { lo: 1.8, hi: 3.2 }, lakeBudget: { lo: 0.2, hi: 0.4 },
    split: 0.05, delta: 0, radial: 1, incise: { lo: 0, hi: 0.5 }, floor: { lo: 0, hi: 3 }, badwater: [0.4, 0.45, 0.15], thorns: 0.1,
    recipes: { "volcano-island": 0.12 },
  },
};

const ALL_PARTS: PartKind[] = ["ridge", "trough", "basin", "caldera", "mesa", "mesaField", "escarpment", "cone", "plateau", "knolls", "spiral"];

/** Draw from a range widened by Variety: at 0 the middle third, at 70 the range, at 100 half as
 *  wide again on each side. */
function draw(rng: Rng, r: Range, vy: number): number {
  const mid = (r.lo + r.hi) / 2;
  const half = (r.hi - r.lo) / 2;
  const k = vy <= 70 ? 1 / 3 + ((2 / 3) * vy) / 70 : 1 + (0.5 * (vy - 70)) / 30;
  return mid + (rng.float() * 2 - 1) * half * k;
}

function pickWeighted<T extends string>(rng: Rng, w: Partial<Record<T, number>>, keys: readonly T[], vy: number): T {
  // Variety flattens the weights toward uniform: at 100, every part is at least a third as likely
  const flat = vy >= 85 ? 0.5 : vy >= 60 ? 0.15 : 0;
  const total = keys.reduce((s, k) => s + (w[k] ?? 0), 0) / keys.length;
  return keys[rng.weighted(keys.map((k) => (w[k] ?? 0) * (1 - flat) + flat * total))];
}

function randomPart(rng: Rng, kind: PartKind, W: number, H: number, vy: number): Part {
  const side = Math.min(W, H);
  // parts keep their size in tiles, so a bigger map holds more of them (decisions-pending #21)
  const at: [number, number] = [0.15 + 0.7 * rng.float(), 0.15 + 0.7 * rng.float()];
  const turn = rng.float();
  const w = (lo: number, hi: number) => draw(rng, { lo, hi }, vy);
  switch (kind) {
    case "ridge":
      return { kind, at, size: w(40, Math.min(110, 0.9 * side)), height: w(2, 5), turn, extra: w(5, 11), soft: 0 };
    case "trough":
      return { kind, at, size: w(40, Math.min(110, 0.9 * side)), height: -w(2, 4), turn, extra: w(6, 12), soft: 0 };
    case "basin":
      return { kind, at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size: w(14, 30), height: -w(2.5, 5), turn, extra: w(0, 2), soft: 0 };
    case "caldera":
      return { kind, at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size: w(12, 22), height: w(2.5, 4.5), turn, extra: rng.float() < 0.6 ? w(3, 6) : 0, soft: 3 };
    case "mesa":
      return { kind, at, size: w(8, 18), height: w(3, 6), turn, extra: w(0.2, 0.8), soft: w(0.6, 2) };
    case "mesaField":
      return { kind, at, size: w(18, 34), height: w(2, 5), turn, extra: Math.round(w(4, 10)), soft: 0.8 };
    case "escarpment":
      return { kind, at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size: w(4, 12), height: w(2, 5), turn, extra: w(4, 10), soft: w(0.8, 2.5) };
    case "cone":
      return { kind, at: [0.25 + 0.5 * rng.float(), 0.25 + 0.5 * rng.float()], size: w(10, 18), height: w(4, 7), turn, extra: rng.float() < 0.7 ? w(2, 4) : 0, soft: 0 };
    case "plateau":
      return { kind, at, size: w(14, 30), height: w(2, 4), turn, extra: w(0.2, 0.8), soft: w(1.5, 4) };
    case "knolls":
      return { kind, at, size: w(18, 40), height: w(1, 2.5), turn, extra: Math.round(w(4, 10)), soft: 0 };
    case "spiral":
      return { kind, at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size: w(14, 22), height: w(5, 8), turn, extra: w(1.25, 2.25), soft: 0 };
  }
}

/** Recipes: a forced part (and a nudge to the water), never the whole map. */
function applyRecipe(g: Genome, recipe: string, rng: Rng, W: number, H: number): void {
  const vy = g.variety;
  const add = (kind: PartKind, over: Partial<Part> = {}) => g.parts.push({ ...randomPart(rng, kind, W, H, vy), ...over });
  switch (recipe) {
    case "island-in-a-river":
      g.hydro.split = 1;
      break;
    case "great-scarp":
      add("escarpment", { height: 4 + 2 * rng.float(), soft: 1 });
      break;
    case "mesa-field":
      add("mesaField", { extra: 8 + Math.floor(6 * rng.float()) });
      break;
    case "badwater-volcano":
      add("cone", { height: 6 + 2 * rng.float(), extra: 3 });
      g.hazards.badwater = "pit";
      break;
    case "hanging-lake":
      add("mesa", { size: 16 + 6 * rng.float(), height: 5 + 2 * rng.float(), soft: 0.8 });
      g.hydro.springs = Math.max(1, g.hydro.springs);
      break;
    case "caldera":
      add("caldera", { extra: 4 + 2 * rng.float() });
      break;
    case "chain-of-lakes":
      for (let k = 0; k < 3; k++) add("basin", { size: 10 + 8 * rng.float(), height: -(2.5 + 2 * rng.float()) });
      break;
    case "volcano-island":
      add("cone", { at: [0.4 + 0.2 * rng.float(), 0.4 + 0.2 * rng.float()], height: 7, extra: 2.5 });
      break;
  }
}

export const RECIPES = ["island-in-a-river", "great-scarp", "mesa-field", "badwater-volcano", "hanging-lake", "caldera", "chain-of-lakes", "volcano-island"] as const;

export function drawGenome(theme: ThemeId, seed: number, W: number, H: number, attempt: number, variety = 70): Genome {
  const rng = stream(seed, "genome", theme, attempt);
  const p = P[theme];
  const vy = clamp(variety, 0, 100);
  const areaK = (W * H) / (128 * 128);
  const g: Genome = {
    theme,
    variety: vy,
    recipe: null,
    base: Math.round(draw(rng, p.base, vy)),
    relief: draw(rng, p.relief, vy),
    flowDir: rng.int(0, 8),
    tilt: Math.max(0, draw(rng, p.tilt, vy)),
    tiltKind: rng.float() < (vy >= 85 ? Math.max(p.radial, 0.2) : p.radial) ? "radial" : "linear",
    focus: [0.25 + 0.5 * rng.float(), 0.25 + 0.5 * rng.float()],
    noise: {
      amp: draw(rng, p.amp, vy),
      cell: draw(rng, p.cell, vy),
      octaves: 3 + rng.int(0, 2),
      warp: Math.max(0, draw(rng, p.warp, vy)),
      warpCell: 30 + 40 * rng.float(),
      ridged: clamp(draw(rng, p.ridged, vy), 0, 1),
    },
    parts: [],
    erosion: {
      iterations: Math.round(Math.max(0, draw(rng, p.erosion.iterations, vy))),
      k: Math.max(0, draw(rng, p.erosion.k, vy)),
      diffusion: clamp(draw(rng, p.erosion.diffusion, vy), 0, 0.2),
    },
    terrace: {
      step: p.terrace.step[rng.int(0, p.terrace.step.length)],
      share: clamp(draw(rng, p.terrace.share, vy), 0, 1),
      cell: 20 + 30 * rng.float(),
      jitter: 0.12 + 0.18 * rng.float(),
    },
    hydro: {
      inflows: p.inflows[rng.int(0, p.inflows.length)],
      springs: Math.round(Math.max(0, draw(rng, p.springs, vy))),
      flowMul: Math.max(0.8, draw(rng, p.flowMul, vy)),
      lakeBudget: clamp(draw(rng, p.lakeBudget, vy), 0.01, 0.4),
      split: p.split,
      delta: p.delta,
      incise: Math.max(0, draw(rng, p.incise, vy)),
      floor: Math.max(0, draw(rng, p.floor, vy)),
    },
    hazards: { badwater: (["none", "pit", "stream"] as const)[rng.weighted(p.badwater)], ratio: 0.3 + 0.7 * rng.float(), thorns: rng.float() < p.thorns },
    resources: {
      forest: Math.round(clamp(draw(rng, { lo: 60, hi: 180 }, vy), 50, 200)),
      bushes: Math.round(clamp(draw(rng, { lo: 70, hi: 260 }, vy), 50, 300)),
      ruins: Math.round(clamp(draw(rng, { lo: 50, hi: 220 }, vy), 25, 300)),
      grove: (["scattered", "normal", "normal", "bigWoods"] as const)[rng.int(0, 4)],
    },
    settler: [0, 0, 0, 0, 0, 0].map(() => 0.2 + rng.float()),
  };
  if (g.hydro.inflows === 0 && g.hydro.springs === 0) g.hydro.springs = 2;
  // parts: counts per 128² map, scaled by area
  const n = Math.max(1, Math.round((draw(rng, p.partCount, vy) + 0.5) * Math.max(1, Math.sqrt(areaK))));
  const keys = vy >= 85 ? ALL_PARTS : (Object.keys(p.parts) as PartKind[]);
  for (let k = 0; k < n; k++) g.parts.push(randomPart(rng, pickWeighted(rng, p.parts, keys, vy), W, H, vy));
  // a radial slope falls toward the first basin (or caldera) when there is one
  const bowl = g.parts.find((q) => q.kind === "basin" || q.kind === "caldera");
  if (g.tiltKind === "radial" && bowl) g.focus = [bowl.at[0], bowl.at[1]];
  if (theme === "islands" && g.tiltKind === "radial") {
    // the sea: a wide shallow bowl round the focus, lobed; islands are the ground that stays above
    // it: hills and cones standing in it, as many as the sea is big
    const R = Math.min(W, H) * (0.28 + 0.2 * rng.float());
    g.parts.push({ kind: "basin", at: [g.focus[0], g.focus[1]], size: R, height: -(3 + 2 * rng.float()), turn: 0, extra: 0, soft: 0 });
    const isles = 2 + Math.round(5 * rng.float() * Math.max(1, (W * H) / (128 * 128)));
    for (let k = 0; k < isles; k++) {
      const [ux, uy] = [rng.float() * 2 - 1, rng.float() * 2 - 1];
      const r = (0.25 + 0.6 * rng.float()) / Math.max(1, Math.sqrt(ux * ux + uy * uy));
      g.parts.push({ kind: rng.float() < 0.3 ? "cone" : "mesa", at: [g.focus[0] + (ux * r * R) / W, g.focus[1] + (uy * r * R) / H], size: 4 + 6 * rng.float(), height: 3 + 3 * rng.float(), turn: rng.float(), extra: 0, soft: 1 + rng.float() });
    }
    g.tilt = Math.max(g.tilt, 3);
  }
  // knolls and hills everywhere, as many per tile on every size (#21)
  const knolls = Math.round(draw(rng, p.knollsPer128, vy) * areaK);
  if (knolls > 0) g.parts.push({ kind: "knolls", at: [0.5, 0.5], size: 0, height: 1.5 + rng.float(), turn: 0, extra: knolls, soft: 0 });
  // a recipe, sometimes: the theme's own, or any at Variety 85+
  const rec = Object.entries(p.recipes) as [string, number][];
  const pool = vy >= 85 ? RECIPES.map((r) => [r, 0.03] as [string, number]).concat(rec) : rec;
  for (const [name, chance] of pool) {
    if (!g.recipe && rng.float() < chance * (vy / 70)) {
      g.recipe = name;
      applyRecipe(g, name, rng, W, H);
    }
  }
  return g;
}
