// The style seam (docs/PREMISES.md §1.5): a premise map takes its theme's style where the theme defines one. The
// premise keeps its water, levels, works and frame (stages 0, 1, 3 and 4 never read the style); the style reaches
// two stages only:
//   - stage 2, the relief between (`raster/relief.ts` `reliefBetween`): the outlands stand at the theme's height over
//     the stair (`lift`, `room`) and rise and fall by Relief (`amp`); the hillside past each meadow takes the theme's
//     crags and benches (Canyon's walls, Highlands' tall terraces, Lake Basin's gentle shores); the uplands' plates
//     are graded by the theme's grade (#956, `land/genome.ts` `GRADE`): Canyon's and Highlands' tableland on benches
//     of three and four levels with cliffs between (over Terracing's share), River Valley's and Lake Basin's rolling
//     ground. The meadows, the water and the ground stage 1 fixes are the premise's in every theme. The
//     game's terrain has one material, so the ground and rock look the same in every theme: what reads as canyon
//     country or highlands is the land's shape, and the ground's tone is the game's own by its moisture (D496).
//   - stage 6, life (`life.ts` `premiseLife`): the theme's woods (`land/genome.ts` `drawWoods`: oak-rich,
//     birch-rich or mixed by the theme's lean) when the species mix is the panel's own, as the themes do
//     (`gen/generate.ts` `specFor`); Forests, Grove size and Berries are the settings, whose preset is the theme's.

import { drawGrade, drawWoods, type Grade } from "../land/genome";
import { DEFAULT_SPECIES_MIX as DEFAULT_MIX, type MapSpec, type Settings } from "../spec/mapspec";
import type { StyleTheme } from "./choice";

/** What stage 2 takes from the style (`reliefBetween`'s third argument; without one the relief is the premise's own). */
export interface ReliefStyle {
  /** The theme's grade, drawn for the map (`drawGrade`). */
  grade: Grade;
  /** Levels between the uplands' benches where they are benched (1: none, rolling ground only). */
  step: number;
  /** The share of the uplands benched (Terracing ÷ 100). */
  benched: number;
  /** How far the outlands stand over the stair beyond the premise's own, levels, and the share of the room under the
   *  highest ground they may take (the premise's own: 0.75). */
  lift: number;
  room: number;
  /** The hillside past a meadow: its first two crags this many levels taller, its benches this many times as wide,
   *  its later crags this tall (the premise's own: 0, 1, 2). */
  crag: number;
  bench: number;
  later: number;
  /** The uplands' rise and fall against the premise's own (Relief ÷ 55, Any's preset: 1). */
  amp: number;
}

export interface PremiseStyle {
  theme: StyleTheme;
  relief: ReliefStyle;
  /** The plants' palette: the theme's woods, or null when the player chose the species mix (theirs wins). */
  woods: Settings["resources"]["speciesMix"] | null;
}

/** Each theme's land past the meadows. Canyon stands high over the stair on tableland, its walls a level taller and
 *  its benches narrow; Highlands' terraces are tall and broad (benches four apart, as its own maps from 128² up,
 *  `land/highlands.ts`); River Valley's is the premise's own land, rolling; Lake Basin and Delta lie lower and
 *  gentler. */
export const THEME_UPLANDS: Record<StyleTheme, Omit<ReliefStyle, "grade" | "benched" | "amp">> = {
  riverValley: { step: 1, lift: 0, room: 0.75, crag: -0.8, bench: 1.3, later: 1 },
  canyon: { step: 3, lift: 4, room: 1, crag: 1, bench: 0.6, later: 3 },
  highlands: { step: 4, lift: 3, room: 1, crag: 0.5, bench: 1.4, later: 4 },
  lakeBasin: { step: 1, lift: -0.5, room: 0.7, crag: 0, bench: 1, later: 2 },
  delta: { step: 1, lift: -1, room: 0.6, crag: 0, bench: 1.2, later: 1 },
  islands: { step: 1, lift: 0, room: 0.75, crag: 0, bench: 1, later: 2 },
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
