// The `paintObjects` operation's parameters and the check they pass (PLAN §20 D235, D338, D342): a brush stroke
// of trees, bushes, succulents, mixed woods, ruins or thorn patches, in plain terms (the tiles it covers,
// a density, an age or a ruin's height, a seed, and under a roof the level its tiles paint at). Applying it plans the objects on the map as
// it stands (`doc/paint.ts`) and places them as one undo step; the log keeps the objects it placed, so a replay never
// plans again.

import { runsToTiles, type Runs } from "../math/grid";

export type PaintKind = "trees" | "bushes" | "succulents" | "woods" | "ruins" | "thorns";
export type PaintAge = "grown" | "mixed";
/** Ruins: every column at the height (Same) or each from 1 up to it by its tile (Mixed, D548). */
export type RuinHeights = "same" | "mixed";

/** A painted ruin column's height in levels (the shelf's Height): the game's 1 to 8, 3 unless set. */
export const RUIN_HEIGHT = { min: 1, max: 8, default: 3 } as const;

/** Some of a stroke's tiles and the level they paint at under a roof (D491): a cave's floor, the ground under a ledge. */
export interface PaintLevel {
  z: number;
  area: Runs;
}

export interface PaintParams {
  kind: PaintKind;
  /** Trees: Pine, Birch or Oak. Bushes: BlueberryBush. Succulents: Succulent. The rest have none. */
  template?: string;
  /** The tiles the stroke covers. */
  area: Runs;
  /** 0.05 to 1: how densely the objects land (a sparse scatter to a dense grove; the share of the ground a thorn
   *  patch covers). */
  density: number;
  /** Trees, succulents and mixed woods: grown (the default) or mixed with saplings. */
  age?: PaintAge;
  /** Ruins: the columns' height in levels, 1 to 8 (3 unless given), and whether every column is that tall (Same, the
   *  default) or each from 1 up to it (Mixed). */
  height?: number;
  heights?: RuinHeights;
  seed: number;
  /** Under a roof (D491): groups of the stroke's tiles and the level each paints at, as the page's pick found it; a
   *  tile in none paints the ground's top, as does a level at the top. Each object there stands by the game's rule at
   *  its level (a pine needs 3 levels of air): a tile that can't hold one gets none, never one on the roof's top. */
  levels?: PaintLevel[];
}

export const PAINT_KINDS: readonly PaintKind[] = ["trees", "bushes", "succulents", "woods", "ruins", "thorns"];
export const DENSITY_MIN = 0.05;

const TEMPLATES: Record<PaintKind, readonly string[]> = { trees: ["Pine", "Birch", "Oak"], bushes: ["BlueberryBush"], succulents: ["Succulent"], woods: [], ruins: [], thorns: [] };

/** Why the parameters (but not the area, which the map checks) would not do, or nothing. */
export function paintParamProblems(p: PaintParams): string[] {
  if (!PAINT_KINDS.includes(p.kind)) return [`${String(p.kind)} is not something to paint: trees, bushes, succulents, woods, ruins or thorns`];
  const allowed = TEMPLATES[p.kind];
  if (allowed.length && !allowed.includes(p.template ?? "")) return [`${p.kind} are painted as ${allowed.join(", ")}: ${String(p.template)} is not one`];
  if (!allowed.length && p.template) return [`${p.kind} take no template: ${p.template} is not needed`];
  if (!(typeof p.density === "number" && p.density >= DENSITY_MIN - 1e-9 && p.density <= 1)) return [`the density is from ${DENSITY_MIN} to 1: ${String(p.density)} is not`];
  if (p.age !== undefined && p.age !== "grown" && p.age !== "mixed") return [`the age is grown or mixed: ${String(p.age)} is not`];
  if (p.age === "mixed" && (p.kind === "bushes" || p.kind === "ruins" || p.kind === "thorns")) return [`${p.kind} have no age`];
  if (p.kind !== "ruins" && (p.height !== undefined || p.heights !== undefined)) return [`${p.kind} have no height: only ruins do`];
  if (p.height !== undefined && !(Number.isInteger(p.height) && p.height >= RUIN_HEIGHT.min && p.height <= RUIN_HEIGHT.max)) return [`a ruin's height is a whole number from ${RUIN_HEIGHT.min} to ${RUIN_HEIGHT.max} levels: ${String(p.height)} is not`];
  if (p.heights !== undefined && p.heights !== "same" && p.heights !== "mixed") return [`the heights are same or mixed: ${String(p.heights)} is not`];
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 0x7fffffff) return [`the seed is a whole number from 0 to ${0x7fffffff}: ${String(p.seed)} is not`];
  for (const l of p.levels ?? []) if (!Number.isInteger(l.z) || l.z < 0 || l.z > 22) return [`a level is a whole number from 0 to 22: ${String(l.z)} is not`];
  return [];
}

/** Why a stroke's levels don't fit its area on a map `W` wide (empty when they do): each level's tiles lie in the
 *  stroke, and no tile has two levels. */
export function paintLevelProblems(p: PaintParams, W: number): string[] {
  if (!p.levels?.length) return [];
  const area = new Set(runsToTiles(p.area, W));
  const seen = new Set<number>();
  for (const l of p.levels) {
    for (const i of runsToTiles(l.area, W)) {
      if (!area.has(i)) return [`X ${i % W} · Y ${Math.floor(i / W)} has a level but is not in the stroke`];
      if (seen.has(i)) return [`X ${i % W} · Y ${Math.floor(i / W)} has two levels`];
      seen.add(i);
    }
  }
  return [];
}
