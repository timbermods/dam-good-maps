// What each generator setting does, in one line, for its tooltip (D351), with the official maps' range where it has
// one; and what the page gives the settings.

import type { MapSpec, Settings, ThemeId } from "../../core/spec/mapspec";

export interface SettingsProps {
  spec: MapSpec;
  seedText: string;
  onSeed(text: string): void;
  /** The seed is kept (typed, or from a link): Generate makes that map again. */
  seedPinned: boolean;
  onUnpinSeed(): void;
  /** Keep the seed in the box: Generate makes that map again. */
  onPinSeed(): void;
  onSize(size: { x: number; y: number }): void;
  onTheme(theme: ThemeId): void;
  onSettings(s: Settings): void;
  onReset(): void;
}

/** What each setting does, in one line, for its tooltip (D351). */
export const HINT: Record<string, string> = {
  seed: "The same seed and settings make the same map",
  size: "The map's size: the game's, or your own",
  "size-x": "The map's width in tiles (48 to 256)",
  "size-y": "The map's height in tiles (48 to 256)",
  relief: "How much the land rises and falls",
  verticality: "How steep and tall the cliffs and slopes are",
  highest: "The highest level the land may reach",
  variety: "How far the land strays from its theme",
  terracing: "How much land is cut into terraces",
  buildable: "Flat land to build on",
  rivers: "How many rivers cross the map",
  "river-style": "How the rivers run: straight, meandering or braided",
  "river-flow": "Water the rivers carry",
  reserve: "Water kept to last through a drought",
  lakes: "How many lakes and basins the map has",
  falls: "How many waterfalls the rivers make",
  sources: "Keep the water sources, or start with none",
  badwater: "Badwater on the map",
  "badwater-distance": "Badwater's distance from the start",
  thorns: "Thorns that block some ways",
  cores: "How many unstable cores the map has: an advanced hazard",
  forest: "How thickly trees grow",
  groves: "How big each grove is",
  "mix-pine": "How many of the trees are pines",
  "mix-birch": "How many of the trees are birches",
  "mix-oak": "How many of the trees are oaks",
  "mix-succulent": "How many of the trees are succulents",
  "berries-start": "Berry bushes near the start",
  berries: "Berry bushes elsewhere",
  ruins: "Ruins and scrap metal",
  relics: "How many relics are placed",
  geothermal: "Whether geothermal fields are placed, and how many",
  mines: "How many mine sites the map has",
  "start-area": "How roomy the land round the start is",
  "rule-water": "Longest walk to water",
  "rule-wood": "Logs the start reaches on foot",
  "rule-bushes": "Berry bushes in walking reach",
  "rule-ruins": "How far ruins stay from the start",
};

/** The official maps' range a setting's reference line gave, as a short phrase for its tooltip ("Official maps:
 *  9–15"; Kyler, 2026-10-03: no line under any setting, and nothing else of it moves into the tooltip). */
export function officialPhrase(band: string | undefined): string {
  // (to the sentence's end, a decimal point aside; the range only, in its shortest words)
  const m = /Official (?:maps|groves)(?:[^.]|\.(?=\d))*/.exec(band ?? "");
  if (!m) return "";
  return m[0]
    .split(", ")[0]
    .replace(/^Official maps this size:/, "Official maps:")
    .replace(/^Official groves: most about (\d+) trees/, "Official maps: about $1 trees")
    .replace(/^Official maps all top out at (\d+)/, "Official maps: $1")
    .replace(/ within 20 tiles' walk$/, "")
    .replace(/(most \d+) tiles$/, "$1")
    .replace(/ have some$/, "")
    .replace(/10,000 tiles$/, "10k tiles")
    .trim();
}

/** A setting's tooltip: what it does, then the official maps' range where it has one (D351). */
export function tipOf(id: string, band?: string): string {
  const o = officialPhrase(band);
  return [HINT[id], o].filter(Boolean).join(" · ");
}
