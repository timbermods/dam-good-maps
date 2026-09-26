// What the settings panel shows (PLAN §5, §14.1): each setting's label, its choices, its reference
// band from the official maps (investigation/calibration.json, official aggregates), and the
// feasibility guards (PLAN §5.3). The share text for "Copy seed + settings" is built here too.

import { density, LAKES, officialRange, RESERVE, reservoirNeeded, RIVER_FLOW_MULTIPLIER } from "../core/gen/calibrated";
import { resourceBudget } from "../core/resources/budget";
import { flowBudget } from "../core/features/setpieces/common";
import { THEME_NAMES, type Difficulty, type MapSpec, type Settings } from "../core/spec/mapspec";

export type Choice<T extends string> = { value: T; label: string; disabled?: string };

export const BUILDABLE: Choice<Settings["terrain"]["buildableLand"]>[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "generous", label: "Generous" },
];
export const STYLES: Choice<Settings["water"]["riverStyle"]>[] = [
  { value: "straight", label: "Straight" },
  { value: "meandering", label: "Meandering" },
  { value: "braided", label: "Braided" },
];
export const FLOWS: Choice<Settings["water"]["riverFlow"]>[] = [
  { value: "trickle", label: "Trickle" },
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
  { value: "lush", label: "Lush" },
];
export const RESERVES: Choice<Settings["water"]["droughtReserve"]>[] = [
  { value: "scarce", label: "Scarce" },
  { value: "normal", label: "Normal" },
  { value: "plenty", label: "Plenty" },
];
export const LAKE_CHOICES: Choice<Settings["water"]["lakes"]>[] = [
  { value: "none", label: "None" },
  { value: "few", label: "Few" },
  { value: "some", label: "Some" },
  { value: "many", label: "Many" },
];
export const FALLS: Choice<Settings["water"]["waterfalls"]>[] = [
  { value: "off", label: "Off" },
  { value: "few", label: "Few" },
  { value: "many", label: "Many" },
];
export const BADWATER: Choice<Settings["hazards"]["badwater"]>[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];
export const OFF_SOME: Choice<"off" | "some">[] = [
  { value: "off", label: "Off" },
  { value: "some", label: "Some" },
];
export const CORES: Choice<Settings["hazards"]["unstableCores"]>[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];
export const GROVES: Choice<Settings["resources"]["groveSize"]>[] = [
  { value: "scattered", label: "Scattered" },
  { value: "normal", label: "Normal" },
  { value: "bigWoods", label: "Big woods" },
];
export const AREAS: Choice<Settings["start"]["area"]>[] = [
  { value: "small", label: "Small" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
];

/** Blocks of water a reservoir holds per tile: 2 deep, 3 on Hard (PLAN §5.3, §11.4). */
function depthFor(d: Difficulty): number {
  return d === "hard" ? 3 : 2;
}

/** Tiles a reservoir needs for this difficulty and reserve. */
export function reservoirTiles(d: Difficulty, r: Settings["water"]["droughtReserve"]): number {
  return Math.ceil((reservoirNeeded(d) * RESERVE[r]) / depthFor(d));
}

/** The drought-reserve guard (PLAN §5.3): a reserve whose reservoir would cover more than 15% of the
 *  map does not fit, and says why; Hard with a Scarce reserve is allowed, with a warning (D13). */
export function reserveGuard(d: Difficulty, r: Settings["water"]["droughtReserve"], W: number, H: number): { fits: boolean; note: string } {
  const tiles = reservoirTiles(d, r);
  const cap = Math.floor(0.15 * W * H);
  if (tiles > cap) return { fits: false, note: `needs a reservoir of about ${tiles.toLocaleString()} tiles; this map allows ${cap.toLocaleString()}` };
  if (d === "hard" && r === "scarce") return { fits: true, note: "Hard with a scarce reserve: the first long drought will hurt" };
  return { fits: true, note: "" };
}

/** Falls of 2 levels that fit under the highest terrain on the main river (the planner's rule). */
export function fallsRoom(top: number): number {
  return Math.max(0, Math.floor((top - 3) / 2));
}

/** A count rounded to two significant figures, as a range on the panel reads. */
function roundNice(v: number): number {
  const p = v >= 1000 ? 100 : v >= 100 ? 10 : 1;
  return Math.round(v / p) * p;
}

/** One line per reference band (official maps), keyed by setting. */
export function band(key: string, spec: MapSpec): string {
  const s = spec.settings;
  const area = spec.size.x * spec.size.y;
  // this map's resource amounts (the seed moves them within the official range), and that range
  const budget = () => resourceBudget(spec.size.x, spec.size.y, s.resources, spec.seed);
  const range = (k: "trees" | "bushes" | "scrap") => {
    const r = officialRange(k, area);
    return `${roundNice(r.low).toLocaleString()}–${roundNice(r.high).toLocaleString()}`;
  };
  switch (key) {
    case "relief":
      return `Height range about ${Math.round(7 + 0.08 * s.terrain.relief)} levels. Official maps: 9–15, most 13.`;
    case "highestTerrain":
      return "Official maps all top out at 16, the map editor's limit.";
    case "terracing":
      return `About ${Math.round((0.86 - 0.0059 * s.terrain.terracing) * 100)}% of steps are one level. Official maps: 27–86%.`;
    case "buildableLand":
      return "Land you can walk to from the start. Official maps: 765–6,022 tiles, most about 1,300.";
    case "rivers":
      return s.water.rivers === 0 ? "No river enters from the edge: springs feed the water." : "Rivers that enter from the map edge.";
    case "riverStyle":
      return s.water.riverStyle === "braided" ? "The river splits into 2–4 channels across a low plain before the map edge." : "";
    case "riverFlow":
      return `About ${(flowBudget(spec.size.x, spec.size.y) * RIVER_FLOW_MULTIPLIER[s.water.riverFlow]).toFixed(1)} water/s. Official maps: 0.5–12 per 10,000 tiles.`;
    case "droughtReserve":
      return `Keep about ${Math.round(reservoirNeeded(spec.designedFor) * RESERVE[s.water.droughtReserve]).toLocaleString()} water near the start through the worst drought.`;
    case "lakes":
      return `About ${Math.round(LAKES[s.water.lakes] * density("basins_ge20", area))} natural basins on this map. Official maps: 0–25.`;
    case "waterfalls":
      return "Falls of 2+ levels on the rivers. Official maps: 0–41, most 4.";
    case "badwater":
      return "Badwater strength against the rivers'. Official maps: 0.18–2.2, most 0.65.";
    case "badwaterDistance":
      return "A target: the map card warns when badwater is nearer. Official maps: most 15 tiles.";
    case "thornBelts":
      return "Belts of thorns bar the way to relics and geothermal fields. Clearing them takes builders and hurts. Official maps: 8 of 19 have some.";
    case "unstableCores":
      return "Cores explode after a few cycles and take the ground round them. They can't be removed.";
    case "relics":
      return "Science for the beavers who reach them: 200, 800 or 3,000. The farther out, the bigger.";
    case "geothermal":
      return "Free power for a geothermal engine, on dry ground 30–120 tiles out.";
    case "mineSites":
      return "Where the late scrap mine can be built. Every map has at least one. Official maps: 1–4.";
    case "forestDensity":
      return `About ${budget().trees.toLocaleString()} trees, in groves with clearings. Official maps this size: ${range("trees")}.`;
    case "groveSize":
      return "Official groves: most about 40 trees.";
    case "berriesNearStart":
      return "Never fewer than Minimum starting bushes. Official maps: most 57 within 20 tiles' walk.";
    case "berryBushes":
      return `About ${budget().bushes.toLocaleString()} bushes, in a few large patches. Official maps this size: ${range("bushes")}.`;
    case "ruins":
      return `About ${budget().scrap.toLocaleString()} scrap. Official maps this size: ${range("scrap")}.`;
    case "waterWithin":
      return "The walk to clean water a pump reaches, using only the map's own slopes. Official maps: most 12 tiles.";
    case "woodWithin20":
      return "Logs from grown trees within 20 tiles' walk: an oak gives 8, a pine 2, a birch 1. Saplings count once grown. Official maps: most 110.";
    case "bushesWithin20":
      return "Living berry bushes within 20 tiles' walk. Official maps: most 57.";
    case "ruinsWithin":
      return "A target: the map card warns when ruins are nearer. Official maps: most 45 tiles.";
    default:
      return "";
  }
}

/** What set pieces this map size allows (PLAN §9.10), for the Limits note. */
export function limitsText(W: number, H: number): string[] {
  const side = Math.min(W, H);
  return [
    // PLAN §9.10: 40% of the side along the lip; a drop of at most 15 on editor-safe terrain
    `Waterfalls: up to ${Math.floor(0.4 * Math.max(W, H))} tiles wide, up to 15 levels high.`,
    `Water budget: ${flowBudget(W, H)} water/s at Normal flow.`,
    `Dam basins: up to ${Math.floor(0.15 * W * H).toLocaleString()} tiles.`,
    ...(side < 96 ? ["Small maps fit fewer set pieces: some settings are reduced."] : []),
  ];
}

const DIFF_NAME: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** "Copy seed + settings": the map in one line of plain words, then the link. */
export function shareText(spec: MapSpec, link: string): string {
  return `Dam Good Maps ${spec.generatorVersion}: ${THEME_NAMES[spec.theme]}, seed ${spec.seed}, ${spec.size.x}×${spec.size.y}, designed for ${DIFF_NAME[spec.designedFor]}.\n${link}`;
}
