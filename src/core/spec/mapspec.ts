// MapSpec v1 (PLAN §19.1): everything that determines a generated map. The settings panel, the
// URL codec, the editor's SpecPatch and Claude all produce one. Complete, never a diff.

export const GENERATOR_VERSION = "0.6.2";
export const SPEC_VERSION = 1;

export type ThemeId = "riverValley" | "canyon" | "highlands" | "lakeBasin" | "delta" | "islands";
export type ArchetypeId = ThemeId;
export type Difficulty = "easy" | "normal" | "hard";
export type SizePreset = "small" | "medium" | "large" | "max";

export const THEMES: readonly ThemeId[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
/** Themes the generator can build (all six since M7). */
export const AVAILABLE_THEMES: readonly ThemeId[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
export const THEME_NAMES: Record<ThemeId, string> = {
  riverValley: "River Valley",
  canyon: "Canyon",
  highlands: "Highlands",
  lakeBasin: "Lake Basin",
  delta: "Delta",
  islands: "Islands",
};

export const SIZE_PRESETS: Record<SizePreset, number> = { small: 96, medium: 128, large: 192, max: 256 };
export const MIN_SIDE = 48;
export const MAX_SIDE = 256;

export interface Settings {
  terrain: {
    relief: number; // 0–100
    highestTerrain: number; // 10–16
    terracing: number; // 0–100
    buildableLand: "tight" | "normal" | "generous";
  };
  water: {
    rivers: number; // 0–3
    riverStyle: "straight" | "meandering" | "braided";
    riverFlow: "trickle" | "normal" | "strong" | "lush";
    droughtReserve: "scarce" | "normal" | "plenty";
    lakes: "none" | "few" | "some" | "many";
    waterfalls: "off" | "few" | "many";
  };
  hazards: {
    badwater: "off" | "low" | "normal" | "high";
    badwaterDistance: number; // 8–60 (a target, D85)
    thornBelts: "off" | "some";
    unstableCores: "off" | "on";
  };
  resources: {
    forestDensity: number; // 50–200 (%)
    groveSize: "scattered" | "normal" | "bigWoods";
    speciesMix: { pine: number; birch: number; oak: number; succulent: number }; // weights 0–100
    berriesNearStart: number; // 20–100 (the generator aims at least at Minimum starting bushes)
    berryBushes: number; // 50–300 (%)
    ruins: number; // 25–300 (%)
    relics: "off" | "some";
    geothermal: "off" | "some";
    mineSites: number; // 1–4: every map has at least one (Kyler, 2026-09-25)
  };
  start: {
    area: "small" | "normal" | "large";
    /** The start requirements and targets (PLAN §5.6, D85). The first three reject a map:
     *  water without stairs, Minimum starting wood and Minimum starting bushes. */
    rules: {
      waterWithin: number; // water without stairs: tiles' walk over the map's own ground and slopes to a shore a pump works from (4–40)
      woodWithin20: number; // Minimum starting wood: logs of grown trees within 20 tiles' walk (0–800; D164)
      bushesWithin20: number; // Minimum starting bushes: living, within 20 tiles' walk (0–200)
      badwaterWithin: number; // target: no badwater within this many tiles (8–60)
      ruinsWithin: number; // target: no ruins within this many tiles
    };
  };
}

export interface Region {
  runs: [number, number, number][];
}

export interface SetPieceRequest {
  kind: string;
  params: Record<string, unknown>;
  region?: Region;
}

export interface MapSpec {
  specVersion: 1;
  generatorVersion: string;
  seed: number;
  size: { x: number; y: number };
  theme: ThemeId;
  archetype: ArchetypeId;
  premise?: string;
  designedFor: Difficulty;
  settings: Settings;
  /** Room for Timber Together multi-colony maps (PLAN §20, D5). The generator builds only
   *  {count: 1, mod: "none"} until a milestone schedules multi-colony maps. */
  colonies: { count: 1 | 2 | 3 | 4; mod: "none" | "timberTogether" };
  setPieces: SetPieceRequest[];
  constraints: { locks: Region[]; keepOut: Region[]; keep: string[] };
  accepted?: { attempt: number; candidate: number };
}

// ---------------------------------------------------------------------------- presets (PLAN §6)

interface ThemePreset {
  relief: number;
  terracing: number;
  buildableLand: Settings["terrain"]["buildableLand"];
  rivers: number;
  riverStyle: Settings["water"]["riverStyle"];
  riverFlow: Settings["water"]["riverFlow"];
  droughtReserve: Settings["water"]["droughtReserve"];
  lakes: Settings["water"]["lakes"];
  waterfalls: Settings["water"]["waterfalls"];
  badwater: Settings["hazards"]["badwater"];
  thornBelts: Settings["hazards"]["thornBelts"];
  forestDensity: number;
  ruins: number;
}

export const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  riverValley: { relief: 50, terracing: 45, buildableLand: "normal", rivers: 1, riverStyle: "meandering", riverFlow: "normal", droughtReserve: "normal", lakes: "some", waterfalls: "few", badwater: "normal", thornBelts: "some", forestDensity: 100, ruins: 100 },
  canyon: { relief: 80, terracing: 75, buildableLand: "tight", rivers: 1, riverStyle: "straight", riverFlow: "normal", droughtReserve: "normal", lakes: "few", waterfalls: "many", badwater: "normal", thornBelts: "off", forestDensity: 80, ruins: 120 },
  highlands: { relief: 90, terracing: 60, buildableLand: "tight", rivers: 2, riverStyle: "meandering", riverFlow: "normal", droughtReserve: "normal", lakes: "some", waterfalls: "many", badwater: "low", thornBelts: "some", forestDensity: 90, ruins: 100 },
  lakeBasin: { relief: 40, terracing: 40, buildableLand: "normal", rivers: 2, riverStyle: "meandering", riverFlow: "strong", droughtReserve: "plenty", lakes: "many", waterfalls: "few", badwater: "normal", thornBelts: "off", forestDensity: 100, ruins: 100 },
  delta: { relief: 20, terracing: 25, buildableLand: "generous", rivers: 1, riverStyle: "braided", riverFlow: "strong", droughtReserve: "scarce", lakes: "few", waterfalls: "off", badwater: "normal", thornBelts: "off", forestDensity: 120, ruins: 80 },
  islands: { relief: 35, terracing: 30, buildableLand: "normal", rivers: 1, riverStyle: "meandering", riverFlow: "lush", droughtReserve: "plenty", lakes: "none", waterfalls: "off", badwater: "low", thornBelts: "off", forestDensity: 100, ruins: 100 },
};

/** Starting wood a tree of the old count stands for (D164): the living trees the start rule
 *  counted before, on seeds 1–30 of every theme at 128² with the default settings, gave 3.0 logs
 *  each (2.8–3.4 by theme, as the default species mix does: pine 2, birch 1, oak 8 logs), and 66%
 *  of those logs stood on grown trees (a third of the living trees are saplings): 2 logs of grown
 *  wood a tree. It turns the tree counts of old share links and project files into logs, and set
 *  the difficulties' defaults. */
export const LOGS_PER_TREE = 2;

/** Start rules by difficulty (PLAN §5.6; D85, Kyler's start requirements): water without stairs
 *  within 12 / 20 / 28 tiles' walk, Minimum starting wood 120 / 80 / 40 logs of grown trees (D164:
 *  the tree counts 60 / 40 / 20 at `LOGS_PER_TREE`), Minimum starting bushes 40 / 30 / 20, badwater
 *  distance 30 / 15 / 8 (a target). Berries near start never aims below Minimum starting bushes
 *  (Easy's 20 became 40). */
export const DIFFICULTY_RULES: Record<Difficulty, Settings["start"]["rules"] & { berriesTarget: number }> = {
  easy: { waterWithin: 12, woodWithin20: 120, bushesWithin20: 40, badwaterWithin: 30, ruinsWithin: 20, berriesTarget: 40 },
  normal: { waterWithin: 20, woodWithin20: 80, bushesWithin20: 30, badwaterWithin: 15, ruinsWithin: 15, berriesTarget: 48 },
  hard: { waterWithin: 28, woodWithin20: 40, bushesWithin20: 20, badwaterWithin: 8, ruinsWithin: 12, berriesTarget: 60 },
};

/** The wood a tree count of before D164 stands for: `LOGS_PER_TREE` logs a tree, within the
 *  setting's range. */
export function woodForTrees(trees: number): number {
  return Math.max(0, Math.min(800, Math.round(trees * LOGS_PER_TREE)));
}

/** A spec stored before D164 (a project file, a saved autosave) counts starting trees: its
 *  `treesWithin20` becomes `woodWithin20` by `woodForTrees`. Changes the spec in place; anything
 *  else is left for the schema to judge. */
export function upgradeSpec(spec: unknown): void {
  const rules = (spec as { settings?: { start?: { rules?: Record<string, unknown> } } } | null)?.settings?.start?.rules;
  if (!rules || typeof rules !== "object" || !("treesWithin20" in rules)) return;
  const trees = rules.treesWithin20;
  delete rules.treesWithin20;
  if (!("woodWithin20" in rules) && typeof trees === "number" && Number.isFinite(trees)) rules.woodWithin20 = woodForTrees(trees);
}

/** A spec stored before every map had a mine site (Kyler, 2026-09-25) may ask for none: it asks for
 *  one. Changes the spec in place; anything else is left for the schema to judge. */
export function upgradeMineSites(spec: unknown): void {
  const r = (spec as { settings?: { resources?: Record<string, unknown> } } | null)?.settings?.resources;
  if (r && typeof r === "object" && r.mineSites === 0) r.mineSites = 1;
}

export function mineSitesForSize(x: number, y: number): number {
  const area = x * y;
  return area <= 96 * 96 ? 1 : area <= 128 * 128 ? 2 : 3;
}

export function defaultSettings(theme: ThemeId, designedFor: Difficulty, size: { x: number; y: number }): Settings {
  const p = THEME_PRESETS[theme];
  const d = DIFFICULTY_RULES[designedFor];
  return {
    terrain: { relief: p.relief, highestTerrain: 16, terracing: p.terracing, buildableLand: p.buildableLand },
    water: {
      rivers: p.rivers,
      riverStyle: p.riverStyle,
      riverFlow: p.riverFlow,
      droughtReserve: p.droughtReserve,
      lakes: p.lakes,
      waterfalls: p.waterfalls,
    },
    hazards: { badwater: p.badwater, badwaterDistance: d.badwaterWithin, thornBelts: p.thornBelts, unstableCores: "off" },
    resources: {
      forestDensity: p.forestDensity,
      groveSize: "normal",
      speciesMix: { pine: 47, birch: 27, oak: 20, succulent: 6 },
      berriesNearStart: d.berriesTarget,
      berryBushes: 100,
      ruins: p.ruins,
      relics: "some",
      geothermal: "some",
      mineSites: mineSitesForSize(size.x, size.y),
    },
    start: {
      area: "normal",
      rules: {
        waterWithin: d.waterWithin,
        woodWithin20: d.woodWithin20,
        bushesWithin20: d.bushesWithin20,
        badwaterWithin: d.badwaterWithin,
        ruinsWithin: d.ruinsWithin,
      },
    },
  };
}

export function makeSpec(opts: {
  seed: number;
  size?: { x: number; y: number };
  theme?: ThemeId;
  designedFor?: Difficulty;
}): MapSpec {
  const theme = opts.theme ?? "riverValley";
  const designedFor = opts.designedFor ?? "normal";
  const size = opts.size ?? { x: 128, y: 128 };
  return {
    specVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    seed: opts.seed >>> 0,
    size: { x: size.x, y: size.y },
    theme,
    archetype: theme,
    designedFor,
    settings: defaultSettings(theme, designedFor, size),
    colonies: { count: 1, mod: "none" },
    setPieces: [],
    constraints: { locks: [], keepOut: [], keep: [] },
  };
}

// ---------------------------------------------------------------------------- URL codec

export { decodeSpecFragment, encodeSpecFragment, seedFromText, shareLink, type DecodedFragment } from "./codec";
