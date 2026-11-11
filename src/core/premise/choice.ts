// A theme and a premise are two choices (docs/PREMISES.md §1.3, §1.5; build step 9): the theme is the land's style
// (its relief's grade, its ground and its plants), the premise the problem (its water, its works and its frame). Each
// may be Any, which the seed resolves. This module answers the page's questions about the pair, headless (D342):
// which themes a premise honours and why it refuses the rest (`pairRefusal`), what an Any resolves to
// (`resolvePremise`), why a spec makes no premise map (`premiseRefusal`, one line the page shows), and what every
// setting of the generator panel does to a premise map (`PREMISE_SETTINGS`, `premiseSettings`), so the page can grey
// out the settings that do not apply.

import { hash32 } from "../math/hash";
import { PREMISE_IDS, PREMISE_NAMES, THEME_NAMES, type MapSpec, type PremiseChoice, type PremiseId, type ThemeId } from "../spec/mapspec";
import { PREMISES } from "./premises";

/** A theme a premise can take as its style (never Any: Any resolves to one of these). */
export type StyleTheme = Exclude<ThemeId, "any">;

/** The themes each premise honours, in the panel's order. A theme left out has a reason in `PAIR_REFUSALS`. */
export const PREMISE_THEMES: Record<PremiseId, readonly StyleTheme[]> = {
  lakeStair: ["riverValley", "canyon", "highlands", "lakeBasin"],
};

/** Why a premise cannot take a theme's style, one line each (the page shows it beside the pair). */
export const PAIR_REFUSALS: Record<PremiseId, Partial<Record<StyleTheme, string>>> = {
  lakeStair: {
    delta: "The lake stair needs high ground for its falls, and a Delta is low and flat",
    islands: "The lake stair climbs one valley, and Islands breaks the land into isles",
  },
};

/** Why this theme and premise make no premise map together, in one line, or null when they do. Any on either side
 *  refuses only when nothing on the other side fits. */
export function pairRefusal(theme: ThemeId, premise: PremiseChoice): string | null {
  const premises: readonly PremiseId[] = premise === "any" ? PREMISE_IDS : [premise];
  if (theme === "any") return null;
  if (premises.some((p) => PREMISE_THEMES[p].includes(theme))) return null;
  if (premise !== "any") return PAIR_REFUSALS[premise][theme] ?? `${PREMISE_NAMES[premise]} does not take the ${THEME_NAMES[theme]} style`;
  return `No premise takes the ${THEME_NAMES[theme]} style yet`;
}

/** The pair a spec's premise map is made of: Any resolved from the seed (premise first, then the theme among those the
 *  premise honours), so a share link always makes the same pair. */
export interface ResolvedPremise {
  premise: PremiseId;
  theme: StyleTheme;
}

/** The pair a spec with a premise resolves to, or why it has none (one line). */
export function resolvePremise(spec: Pick<MapSpec, "seed" | "theme" | "premise">): ResolvedPremise | { reason: string } {
  if (spec.premise === undefined) return { reason: "The spec names no premise" };
  if (!(spec.premise === "any" || (PREMISE_IDS as readonly string[]).includes(spec.premise))) return { reason: `There is no premise "${String(spec.premise)}"` };
  const why = pairRefusal(spec.theme, spec.premise);
  if (why) return { reason: why };
  const premises = spec.premise === "any" ? PREMISE_IDS.filter((p) => spec.theme === "any" || PREMISE_THEMES[p].includes(spec.theme as StyleTheme)) : [spec.premise];
  const premise = premises[hash32(spec.seed, "premise.any") % premises.length];
  const themes = PREMISE_THEMES[premise];
  const theme = spec.theme === "any" ? themes[hash32(spec.seed, "premise.theme") % themes.length] : spec.theme;
  return { premise, theme };
}

/** Why a spec with a premise makes no premise map, in one line the page shows, or null when it makes one (no premise
 *  named: null). The pair first, then the settings the premise rules out (its `eligible`: the size, Lakes None,
 *  Waterfalls Off, Sources None, Easy start, a highest ground too low). Generate then has the themes make the map
 *  and records the same line (`info.premise.fellBack`, D471, D508 (4)): never silently. */
export function premiseRefusal(spec: MapSpec): string | null {
  if (spec.premise === undefined) return null;
  const r = resolvePremise(spec);
  if ("reason" in r) return r.reason;
  return PREMISES[r.premise].eligible(spec);
}

// ------------------------------------------------------------------------------------------------ the settings

/** What a setting does on a premise map (§1.3): `plan` moves the plan's numbers inside the premise's ranges (its water,
 *  levels, works or frame); `style` moves the land's style (the relief between, stage 2); `life` the plants and
 *  resources (stage 6); `rules` is a start rule or target the checks hold every map to; `refuses` is read only to say
 *  no (some values make no premise map: `premiseRefusal`); `none` does nothing on a premise map (the page greys it
 *  out, saying `does`). */
export type SettingRole = "plan" | "style" | "life" | "rules" | "refuses" | "none";

export interface PremiseSetting {
  /** The share link's key (`spec/codec.ts` `SETTING_KEYS`; `z` the size, `d` the difficulty). */
  key: string;
  /** Its place in the spec: `size`, `designedFor`, or the path under `settings`, dotted. */
  path: string;
  role: SettingRole;
  /** What it does on a premise map, or why it does nothing, in one line. */
  does: string;
}

/** Every setting of the generator panel, on a lake stair (§1.3). The values that refuse a premise map are its
 *  `eligible`'s; every other value makes one. */
export const PREMISE_SETTINGS: Record<PremiseId, readonly PremiseSetting[]> = {
  lakeStair: [
    { key: "z", path: "size", role: "plan", does: "Square maps from 128 to 256 a side: more lakes, tarns and works on a larger map" },
    { key: "d", path: "designedFor", role: "plan", does: "The breach in the start's weir and the drought the lakes are dug to last" },
    { key: "rl", path: "terrain.relief", role: "style", does: "How far the uplands rise and fall away from the lakes" },
    { key: "ht", path: "terrain.highestTerrain", role: "plan", does: "How many levels the stair may climb; too low for its lakes and fall makes no lake stair" },
    { key: "tr", path: "terrain.terracing", role: "style", does: "How much of the uplands stands on benches with cliffs between" },
    { key: "bl", path: "terrain.buildableLand", role: "plan", does: "The lakes' meadows and the start's bench, narrower or wider" },
    { key: "vt", path: "terrain.verticality", role: "plan", does: "How tall each step of the stair is, three to five levels" },
    { key: "vy", path: "terrain.variety", role: "plan", does: "One tarn more or fewer" },
    { key: "rv", path: "water.rivers", role: "none", does: "The lake stair's water rises from its springs, not rivers from the edge" },
    { key: "rs", path: "water.riverStyle", role: "none", does: "The lake stair's channels follow its valley" },
    { key: "fl", path: "water.riverFlow", role: "plan", does: "How strong the springs are, and so how wide each fall's lip" },
    { key: "dr", path: "water.droughtReserve", role: "plan", does: "How wide the breach in the start's weir is" },
    { key: "lk", path: "water.lakes", role: "plan", does: "The lakes on the stair and the tarns beside it; None makes no lake stair" },
    { key: "wf", path: "water.waterfalls", role: "refuses", does: "The stair's falls are its own; Off makes no lake stair" },
    { key: "so", path: "water.sources", role: "refuses", does: "The stair needs its springs; None makes no lake stair" },
    { key: "bw", path: "hazards.badwater", role: "plan", does: "The badwater spring in the gorge below the stair, or none when Off" },
    { key: "bd", path: "hazards.badwaterDistance", role: "rules", does: "How far from the start badwater must stay" },
    { key: "tb", path: "hazards.thornBelts", role: "none", does: "Not on a lake stair yet" },
    { key: "uc", path: "hazards.unstableCores", role: "none", does: "Not on a lake stair yet" },
    { key: "fd", path: "resources.forestDensity", role: "life", does: "How many trees, inside the stair's wood budget" },
    { key: "gs", path: "resources.groveSize", role: "life", does: "How big the stands of trees are" },
    { key: "sm", path: "resources.speciesMix", role: "life", does: "Which trees grow; left as it is, the theme's woods" },
    { key: "bn", path: "resources.berriesNearStart", role: "life", does: "Berry bushes near the start" },
    { key: "bb", path: "resources.berryBushes", role: "life", does: "How many berry bushes, inside the stair's budget" },
    { key: "ru", path: "resources.ruins", role: "life", does: "How much scrap lies in ruins" },
    { key: "rc", path: "resources.relics", role: "none", does: "Not on a lake stair yet" },
    { key: "gt", path: "resources.geothermal", role: "none", does: "Not on a lake stair yet" },
    { key: "ms", path: "resources.mineSites", role: "life", does: "How many mine sites, each one the colony reaches" },
    { key: "sa", path: "start.area", role: "rules", does: "How much level land the start needs around it" },
    { key: "es", path: "start.easyStart", role: "refuses", does: "Not offered with the lake stair yet; on, it makes no lake stair" },
    { key: "sw", path: "start.rules.waterWithin", role: "rules", does: "How far the start may walk to water" },
    { key: "sl", path: "start.rules.woodWithin20", role: "rules", does: "The wood the start needs within 20 tiles' walk" },
    { key: "sb", path: "start.rules.bushesWithin20", role: "rules", does: "The berry bushes the start needs within 20 tiles' walk" },
    { key: "sx", path: "start.rules.badwaterWithin", role: "rules", does: "How far from the start badwater must stay" },
    { key: "sr", path: "start.rules.ruinsWithin", role: "rules", does: "How far from the start ruins must stay" },
  ],
};

/** What every setting does on a spec's premise map, and the paths the page greys out (`role` `none`). For Any, a
 *  setting applies when it applies to any premise. */
export function premiseSettings(premise: PremiseChoice): { settings: readonly PremiseSetting[]; greyed: string[] } {
  if (premise !== "any") return { settings: PREMISE_SETTINGS[premise], greyed: PREMISE_SETTINGS[premise].filter((s) => s.role === "none").map((s) => s.path) };
  const all = PREMISE_IDS.map((p) => PREMISE_SETTINGS[p]);
  const greyed = all[0].filter((s) => s.role === "none" && all.every((list) => list.find((t) => t.path === s.path)?.role === "none")).map((s) => s.path);
  return { settings: all[0], greyed };
}
