// The style seam (docs/PREMISES.md §1.5): a premise map takes its theme's style where the theme defines one. The
// premise keeps its water, levels, works and frame (stages 0, 1, 3 and 4 never read the style); the style reaches
// two stages only:
//   - stage 2, the relief between (`raster/relief.ts` `reliefBetween`): the uplands take the theme's form (`form`,
//     `span`, `deep`: Canyon's high tables cut by dry canyons, Highlands' peaks with valleys between, River Valley's
//     terraces climbing from the water, Lake Basin's low rolling ground) and rise and fall by Relief (`amp`); the
//     hillside past each meadow takes the theme's crags and benches (Canyon's walls, Lake Basin's broad shores); the
//     uplands are graded by the theme's grade (#956, `land/genome.ts` `GRADE`), benched `step` apart over Terracing's
//     share. The meadows, the water, the ground stage 1 fixes and the green of day 1's water are the premise's in
//     every theme. The game's terrain has one material, so the ground and rock look the same in every theme: what
//     reads as canyon country or highlands is the land's shape, and the ground's tone is the game's own by its
//     moisture (D496).
//   - stage 6, life (`life.ts` `premiseLife`): the theme's woods (`land/genome.ts` `drawWoods`: oak-rich,
//     birch-rich or mixed by the theme's lean) when the species mix is the panel's own, as the themes do
//     (`gen/generate.ts` `specFor`); Forests, Grove size and Berries are the settings, whose preset is the theme's.

import { drawGrade, drawWoods, type Grade } from "../land/genome";
import { DEFAULT_SPECIES_MIX as DEFAULT_MIX, type MapSpec, type Settings } from "../spec/mapspec";
import type { StyleTheme } from "./choice";

/** The land's character past the meadows (PREMISES §1.5): Canyon's mesas, flat-topped and cut by dry canyons; Highlands'
 *  peaks, rolling heights with summits; River Valley's terraces, broad benches stepping up away from the water; Lake
 *  Basin's low ground, broad and gentle round its lakes. */
export type UplandForm = "mesas" | "peaks" | "terraces" | "basin";

/** What stage 2 takes from the style (`reliefBetween`'s third argument; without one the relief is the premise's own). */
export interface ReliefStyle {
  /** The theme's grade, drawn for the map (`drawGrade`). */
  grade: Grade;
  /** The uplands' character. */
  form: UplandForm;
  /** Where the uplands stand in the room between the stair's ground and the highest ground, as shares: lowest and
   *  highest (Relief widens or narrows it about its middle). */
  span: [number, number];
  /** Levels between the uplands' benches where they are benched (1: none, rolling ground only). */
  step: number;
  /** The share of the uplands benched (Terracing ÷ 100). */
  benched: number;
  /** The hillside past a meadow: its first crag's height and its second's, levels, its first bench's width, tiles
   *  (each drawn in its range by noise), and its later crags' height (the premise's own: 1 to 4, 1 to 3, 4 to 16, 2). */
  crag: readonly [number, number];
  crag2: readonly [number, number];
  bench: readonly [number, number];
  later: number;
  /** How far past the green of day 1's water the uplands' ground comes down toward the map's floor, as a share (0:
   *  it stays at the stair's ground; 1: Canyon's canyons and the valleys between Highlands' peaks reach the floor). */
  deep: number;
  /** The uplands' rise and fall against the theme's own (Relief ÷ 55, Any's preset: 1). */
  amp: number;
}

export interface PremiseStyle {
  theme: StyleTheme;
  relief: ReliefStyle;
  /** The plants' palette: the theme's woods, or null when the player chose the species mix (theirs wins). */
  woods: Settings["resources"]["speciesMix"] | null;
}

/** Each theme's land past the meadows, in the room up to Highest terrain (22 on a premise map: the plan's `sky`).
 *  Canyon's walls rise tall from the meadows to mesas high in the room, benched three apart and cut by deep dry
 *  canyons; Highlands' heights roll low between peaks whose summits reach the highest ground; River Valley's terraces
 *  step up two at a time away from the lakes, broad; Lake Basin's floor stays low and gentle inside one bold rim along
 *  the edges, its benches wide; Delta lower still; Islands' ground rises to rounded heights. The stair and its meadows
 *  are the premise's in every theme. */
export const THEME_UPLANDS: Record<StyleTheme, Omit<ReliefStyle, "grade" | "benched" | "amp">> = {
  riverValley: { form: "terraces", span: [0.1, 0.85], step: 2, crag: [1, 3], crag2: [1, 2], bench: [12, 22], later: 1, deep: 0.3 },
  canyon: { form: "mesas", span: [0.5, 0.85], step: 3, crag: [3, 6], crag2: [3, 4], bench: [5, 9], later: 3, deep: 1 },
  highlands: { form: "peaks", span: [0.2, 1.15], step: 1, crag: [1, 3], crag2: [1, 2], bench: [3, 7], later: 1, deep: 0.8 },
  lakeBasin: { form: "basin", span: [0, 0.55], step: 1, crag: [1, 2], crag2: [1, 1], bench: [16, 28], later: 1, deep: 0 },
  delta: { form: "basin", span: [0, 0.3], step: 1, crag: [1, 2], crag2: [1, 1], bench: [16, 28], later: 1, deep: 0 },
  islands: { form: "peaks", span: [0.1, 0.8], step: 1, crag: [2, 3], crag2: [1, 2], bench: [6, 12], later: 2, deep: 0.6 },
};

/** Relief's value at which the uplands rise and fall as the premise's own (Any's preset). */
export const RELIEF_BASE = 55;

/** The style a premise map takes from its theme, for one attempt (the grade and woods drawn from their own streams). */
export function premiseStyle(theme: StyleTheme, spec: MapSpec, attempt: number): PremiseStyle {
  const t = spec.settings.terrain;
  const mix = spec.settings.resources.speciesMix;
  const own = mix.pine === DEFAULT_MIX.pine && mix.birch === DEFAULT_MIX.birch && mix.oak === DEFAULT_MIX.oak && mix.succulent === DEFAULT_MIX.succulent;
  const w = own ? drawWoods(theme, spec.seed, attempt, t.variety) : null;
  return {
    theme,
    relief: { grade: drawGrade(theme, spec.seed, attempt, 0), ...THEME_UPLANDS[theme], benched: t.terracing / 100, amp: t.relief / RELIEF_BASE },
    woods: w ? { pine: w.pine, birch: w.birch, oak: w.oak, succulent: w.succulent } : null,
  };
}
