// MapSpec v1 (PLAN §19.1): everything that determines a generated map. The settings panel and the
// URL codec produce one. Complete, never a diff.

export const GENERATOR_VERSION = "0.9.0";

/** "any" (Surprise me, the default, D208, D209) draws from all six themes' ranges at once; a named
 *  theme only leans the generator toward that kind of land. */
export type ThemeId = "any" | "riverValley" | "canyon" | "highlands" | "lakeBasin" | "delta" | "islands";
export type ArchetypeId = ThemeId;
export type Difficulty = "easy" | "normal" | "hard";
export type SizePreset = "small" | "medium" | "large" | "max";

/** The themes the settings panel offers, in its order: Any first (the app's default, D209), then
 *  the six leanings. */
export const THEMES: readonly ThemeId[] = ["any", "riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
/** Themes the generator can build (all of them since M9a). */
export const AVAILABLE_THEMES: readonly ThemeId[] = THEMES;
export const THEME_NAMES: Record<ThemeId, string> = {
  any: "Any",
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
    /** The highest the land may rise: 10–16, or up to 22 at Verticality 70+ (item 36): its
     *  default follows Verticality (`highestTerrainDefault`), so the two never contradict. */
    highestTerrain: number; // 10–22
    terracing: number; // 0–100
    buildableLand: "tight" | "normal" | "generous";
    /** Verticality (`vt`, D132): how vertical the land is, 0–100. Heights above 16 from 70 (D172). */
    verticality: number; // 0–100
    /** Variety (`vy`, M9b, D276): how far the land strays from its theme's ranges, 0–100 (70 the
     *  default; at 100 anything goes). */
    variety: number; // 0–100
  };
  water: {
    rivers: number; // 0–3
    riverStyle: "straight" | "meandering" | "braided";
    riverFlow: "trickle" | "normal" | "strong" | "lush";
    droughtReserve: "scarce" | "normal" | "plenty";
    lakes: "none" | "few" | "some" | "many";
    waterfalls: "off" | "few" | "many";
    /** Sources (D330, the UI brief §8): Placed, the map as generated; None, the map generated as
     *  usual, then every water and badwater source and its water removed, the dry valleys, basins
     *  and pits kept, the trees as generated. A spec without it reads as Placed. */
    sources?: "placed" | "none";
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
    mineSites: number; // 2–4: every map has at least two the colony reaches (item 47; one before)
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
  /** Another like this (M9b, D278 (1c)): a sibling's index (1, 2, …; absent for the map itself):
   *  the same theme, settings and intentions, different land. */
  variation?: number;
  /** The intentions a sibling keeps (D278 (1c)); absent when the map draws its own. */
  intentions?: string[];
  designedFor: Difficulty;
  settings: Settings;
  /** Room for Timber Together multi-colony maps (PLAN §20, D5). The generator builds only
   *  {count: 1, mod: "none"} until a milestone schedules multi-colony maps. */
  colonies: { count: 1 | 2 | 3 | 4; mod: "none" | "timberTogether" };
  setPieces: SetPieceRequest[];
  constraints: { keepOut: Region[]; keep: string[] };
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
  any: { relief: 55, terracing: 45, buildableLand: "normal", rivers: 1, riverStyle: "meandering", riverFlow: "normal", droughtReserve: "normal", lakes: "some", waterfalls: "few", badwater: "normal", thornBelts: "some", forestDensity: 100, ruins: 100 },
  riverValley: { relief: 50, terracing: 45, buildableLand: "normal", rivers: 1, riverStyle: "meandering", riverFlow: "normal", droughtReserve: "normal", lakes: "some", waterfalls: "few", badwater: "normal", thornBelts: "some", forestDensity: 100, ruins: 100 },
  canyon: { relief: 80, terracing: 75, buildableLand: "tight", rivers: 1, riverStyle: "straight", riverFlow: "normal", droughtReserve: "normal", lakes: "few", waterfalls: "many", badwater: "normal", thornBelts: "off", forestDensity: 80, ruins: 120 },
  highlands: { relief: 90, terracing: 60, buildableLand: "tight", rivers: 2, riverStyle: "meandering", riverFlow: "normal", droughtReserve: "normal", lakes: "some", waterfalls: "many", badwater: "low", thornBelts: "some", forestDensity: 90, ruins: 100 },
  lakeBasin: { relief: 40, terracing: 40, buildableLand: "normal", rivers: 2, riverStyle: "meandering", riverFlow: "strong", droughtReserve: "plenty", lakes: "many", waterfalls: "few", badwater: "normal", thornBelts: "off", forestDensity: 100, ruins: 100 },
  delta: { relief: 20, terracing: 25, buildableLand: "generous", rivers: 1, riverStyle: "braided", riverFlow: "strong", droughtReserve: "scarce", lakes: "few", waterfalls: "off", badwater: "normal", thornBelts: "off", forestDensity: 120, ruins: 80 },
  islands: { relief: 35, terracing: 30, buildableLand: "normal", rivers: 1, riverStyle: "meandering", riverFlow: "lush", droughtReserve: "plenty", lakes: "none", waterfalls: "off", badwater: "low", thornBelts: "off", forestDensity: 100, ruins: 100 },
};

/** Verticality from which land may rise above 16 (D123, D132, D172). */
export const VT_TALL = 70;
/** The game's highest terrain level (FORMAT.md: 23 layers, layer 22 kept empty). */
export const TALL_TOP = 22;
/** The in-game map editor's highest level, and the top of every map below Verticality 70. */
export const EDITOR_LEVEL = 16;

/** Highest terrain's default (item 36, the forces-preview feedback): 16 below Verticality 70, and 22
 *  from it, where the land may rise above 16; share links carry it only when it differs, so the two
 *  controls never contradict. */
export function highestTerrainDefault(verticality: number): number {
  return verticality >= VT_TALL ? TALL_TOP : EDITOR_LEVEL;
}

/** A spec stored before generator 0.8.0 (M9b) at Verticality 70+ with Highest terrain at 16: the tall map
 *  ignored it then, so it means no cap (22). Changes the spec in place. */
export function upgradeHighestTerrain(spec: unknown): void {
  const s = spec as { generatorVersion?: unknown; settings?: { terrain?: Record<string, unknown> } } | null;
  const t = s?.settings?.terrain;
  if (!t || typeof t !== "object" || typeof t.verticality !== "number" || t.verticality < VT_TALL || t.highestTerrain !== EDITOR_LEVEL) return;
  const v = typeof s!.generatorVersion === "string" ? s!.generatorVersion.split(".").map(Number) : [0];
  if ((v[0] ?? 0) === 0 && (v[1] ?? 0) < 8) t.highestTerrain = TALL_TOP;
}

/** Verticality's defaults by theme (investigation/terrain3d; decisions-pending #60, D209): ordinary
 *  maps within 16; "any" at about the six themes' mean. */
export const VT_DEFAULT: Record<ThemeId, number> = { any: 25, riverValley: 20, canyon: 40, highlands: 45, lakeBasin: 10, delta: 10, islands: 20 };

/** Starting wood a tree of the old count stands for (D164): the living trees the start rule
 *  counted before, on seeds 1–30 of every theme at 128² with the default settings, gave 3.0 logs
 *  each (2.8–3.4 by theme, as the default species mix does: pine 2, birch 1, oak 8 logs), and 66%
 *  of those logs stood on grown trees (a third of the living trees are saplings): 2 logs of grown
 *  wood a tree. It turns the tree counts of old share links and project files into logs (and set
 *  the difficulties' defaults until D227). */
export const LOGS_PER_TREE = 2;

/** Start rules by difficulty (PLAN §5.6; D85, Kyler's start requirements): water without stairs
 *  within 12 / 20 / 28 tiles' walk, Minimum starting wood 250 / 200 / none of grown trees within 20
 *  tiles' walk ("how comfortable is it"; D227, replacing D164's 120 / 80 / 40: Hard keeps no minimum
 *  nearby beyond the starting-logs floor, which every map meets within 40 tiles' walk,
 *  `start.wood_floor`), Minimum starting bushes 40 / 30 / 30, badwater distance 30 / 15 / 8 (a
 *  target). Berries near start never aims below Minimum starting bushes (Easy's 20 became 40).
 *  Hard's 30 (20 before; item 47: enough berries for an Iron Teeth start): its 13 beavers eat 2.67
 *  food a day each (the game's NeedModificationService) and start with 90 food; Iron Teeth's first
 *  harvest, Kohlrabi 3 days after a FarmHouse of 20 logs is planted, comes about day 6, so the
 *  berries ripe near the start (3 a bush) bridge 13 × 2.67 × 5 − 90 ≈ 84 food: 28 bushes, plus the
 *  breeding pod's berry a kit. Normal (130 food: 44, 15 bushes) and Easy (300 food) have room. */
export const DIFFICULTY_RULES: Record<Difficulty, Settings["start"]["rules"] & { berriesTarget: number }> = {
  easy: { waterWithin: 12, woodWithin20: 250, bushesWithin20: 40, badwaterWithin: 30, ruinsWithin: 20, berriesTarget: 40 },
  normal: { waterWithin: 20, woodWithin20: 200, bushesWithin20: 30, badwaterWithin: 15, ruinsWithin: 15, berriesTarget: 48 },
  hard: { waterWithin: 28, woodWithin20: 0, bushesWithin20: 30, badwaterWithin: 8, ruinsWithin: 12, berriesTarget: 60 },
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

/** A spec stored before M9a has no Verticality: it takes its theme's default. Changes the spec in
 *  place; anything else is left for the schema to judge. */
export function upgradeVerticality(spec: unknown): void {
  const s = spec as { theme?: unknown; settings?: { terrain?: Record<string, unknown> } } | null;
  const t = s?.settings?.terrain;
  if (!t || typeof t !== "object" || "verticality" in t) return;
  const theme = typeof s!.theme === "string" && s!.theme in VT_DEFAULT ? (s!.theme as ThemeId) : "riverValley";
  t.verticality = VT_DEFAULT[theme];
}

/** Variety's default (M9b, D276; design version 2's 70). */
export const VARIETY_DEFAULT = 70;

/** A spec stored before M9b has no Variety: it takes the default. Changes the spec in place;
 *  anything else is left for the schema to judge. */
export function upgradeVariety(spec: unknown): void {
  const t = (spec as { settings?: { terrain?: Record<string, unknown> } } | null)?.settings?.terrain;
  if (!t || typeof t !== "object" || "variety" in t) return;
  t.variety = VARIETY_DEFAULT;
}

/** A spec stored before every map had two mine sites (item 47; one from Kyler's 2026-09-25, none
 *  before) may ask for none or one: it asks for two. Changes the spec in place; anything else is
 *  left for the schema to judge. */
export function upgradeMineSites(spec: unknown): void {
  const r = (spec as { settings?: { resources?: Record<string, unknown> } } | null)?.settings?.resources;
  if (r && typeof r === "object" && (r.mineSites === 0 || r.mineSites === 1)) r.mineSites = 2;
}

/** Maps smaller than this (in tiles) scale item 47 to their size (PLAN §20 D333 (7): Kyler named 48²;
 *  the session's default draws the line at 80², decisions-pending): one mine site the colony reaches
 *  (validate/playability.ts `minesWanted`) and no district behind an obstacle (land/intentions.ts);
 *  the starting-logs floor and the other absolutes stay. */
export const SMALL_MAP = 80 * 80;

export function mineSitesForSize(x: number, y: number): number {
  const area = x * y;
  return area <= 128 * 128 ? 2 : 3;
}

export function defaultSettings(theme: ThemeId, designedFor: Difficulty, size: { x: number; y: number }): Settings {
  const p = THEME_PRESETS[theme];
  const d = DIFFICULTY_RULES[designedFor];
  return {
    terrain: { relief: p.relief, highestTerrain: highestTerrainDefault(VT_DEFAULT[theme]), terracing: p.terracing, buildableLand: p.buildableLand, verticality: VT_DEFAULT[theme], variety: VARIETY_DEFAULT },
    water: {
      rivers: p.rivers,
      riverStyle: p.riverStyle,
      riverFlow: p.riverFlow,
      droughtReserve: p.droughtReserve,
      lakes: p.lakes,
      waterfalls: p.waterfalls,
      sources: "placed",
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
    constraints: { keepOut: [], keep: [] },
  };
}

// ---------------------------------------------------------------------------- URL codec

export { decodeSpecFragment, encodeSpecFragment, seedFromText, shareLink, type DecodedFragment } from "./codec";
