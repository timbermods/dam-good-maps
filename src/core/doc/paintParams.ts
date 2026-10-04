// The `paintObjects` operation's parameters and the check they pass (PLAN §20 D235, D338, D342): a brush stroke
// of trees, bushes, succulents, mixed woods, ruin fields or thorn patches, in plain terms (the tiles it covers,
// a density, an age, a seed). Applying it plans the objects on the map as it stands (`doc/paint.ts`) and places
// them as one undo step; the log keeps the objects it placed, so a replay never plans again.

import type { Runs } from "../math/grid";

export type PaintKind = "trees" | "bushes" | "succulents" | "woods" | "ruins" | "thorns";
export type PaintAge = "grown" | "mixed";

export interface PaintParams {
  kind: PaintKind;
  /** Trees: Pine, Birch or Oak. Bushes: BlueberryBush. Succulents: Succulent. The rest have none. */
  template?: string;
  /** The tiles the stroke covers. */
  area: Runs;
  /** 0.05 to 1: how densely the objects land (a sparse scatter to a dense grove; the share of the ground a ruin
   *  field or a thorn patch covers). */
  density: number;
  /** Trees, succulents and mixed woods: grown (the default) or mixed with saplings. */
  age?: PaintAge;
  seed: number;
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
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 0x7fffffff) return [`the seed is a whole number from 0 to ${0x7fffffff}: ${String(p.seed)} is not`];
  return [];
}
