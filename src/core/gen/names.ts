// A generated map's name and its one-line "how it plays" description (M9b; PLAN §20 D278 (1b)), from
// the map's standout intention and its read-back features. The name leads with what the player
// will find (the standout: "Stair Lakes", "Relic Spire") and, where a title has room, the land
// the map shows ("Oxbow Bend Valley"); the description says the standout in a sentence, then one
// thing about how the map plays, read from the finished map (its start's water in the first
// drought, a dam site near the start, where the badwater drains, its woods). Deterministic: the
// title among a few is chosen by the seed, and never one the study's list forbids (an official or
// workshop map's title, a real place: src/core/data/forbiddenNames.json, from investigation/names).

import FORBIDDEN from "../data/forbiddenNames.json" with { type: "json" };
import type { Signature } from "../analysis/signature";
import type { IntentionId } from "../land/intentions";
import { INTENTION_TEXT } from "../land/intentions";
import type { SeaLayout } from "../land/genome";
import { hash32 } from "../math/hash";
import type { ThemeId } from "../spec/mapspec";
import * as portable from "../math/portable";

/** Titles per standout, five each (two maps of one standout seldom share one); `{land}` is the
 *  land's noun. */
const TITLES: Record<IntentionId, string[]> = {
  "under-cliff": ["Cliff Shelter", "Under the Bluff", "Bluff Hollow {land}", "Crag Foot", "Sheltered Ledge"],
  landmark: ["Lone Spire", "The Watchstone", "Needle {land}", "Standing Stone", "Sentinel {land}"],
  "farmland-past-gorge": ["Beyond the Gorge", "Far Fields", "Gorge Crossing", "Fields Past the Chasm", "Across the Cut"],
  "falls-shield": ["Falls Guard", "Behind the Falls", "Falls Watch {land}", "Curtain Falls", "Waterfall Ward"],
  "hidden-valley": ["Hidden Vale", "The Secret Shelf", "High Hollow", "Tucked Vale", "Lost Shelf {land}"],
  "high-lake": ["Sky Lake", "Perched Lake", "Upper Pool {land}", "Hanging Tarn", "Summit Water"],
  "meeting-waters": ["Two Rivers Meet", "The Confluence", "River Fork {land}", "Joining Waters", "Where Waters Meet"],
  "long-view": ["The Overlook", "High Watch", "Lookout {land}", "Far Sight", "Watch Ridge"],
  "snaking-river": ["Winding Water", "Serpent Run", "Snakeback {land}", "Coiled River", "Twisting Stream"],
  "crater-rivers": ["Crater Meet", "The Gathering Bowl", "Crater of Rivers", "Rim Lake", "Bowl of Streams"],
  "cliff-falls-lake": ["Plunge Lake", "Fallwater Lake", "Cliff Pool {land}", "Cascade Basin", "Roaring Pool"],
  oxbow: ["Oxbow Bend", "The Cutoff", "Old Bend {land}", "Horseshoe Lake", "Crescent Water"],
  "stepped-lakes": ["Stair Lakes", "Step Lakes", "Terrace Waters", "Cascade Lakes", "Ladder Lakes"],
  "split-island": ["Midstream Isle", "River Isle", "The Parting Isle", "Fork Island", "Twin Channel {land}"],
  "twin-falls": ["Paired Falls", "Double Cascade", "Twin Drops {land}", "Sister Falls", "Two Veils"],
  "upper-lower": ["The Great Step", "Two Tier {land}", "Upper and Lower", "The Long Cliff", "Split Level {land}"],
  "hanging-valleys": ["Hanging Vales", "Perched Valleys", "Side Falls {land}", "Ledge Valleys", "Falling Vales"],
  "two-ways": ["Fields and Heights", "Two Roads", "Fork in the Land", "Choice of Ways", "Crossroads {land}"],
  "badwater-rich": ["Tainted Meadows", "Bitter Bottoms", "Poisoned Plenty", "Fouled Fields", "Sour Lowlands"],
  "relic-pinnacle": ["Relic Spire", "The Relic Pillar", "Summit Relic", "Relic Perch", "Crowned Rock"],
  "plug-lake": ["The Plug", "Stopper Lake", "Held Water {land}", "Bottled Lake", "Pent Lake"],
  "district-behind": ["Beyond the Rubble", "Cleared Way", "Second Shelf {land}", "The Blocked Ramp", "Neighbor Terrace"],
};

/** When a map has no standout (the best candidate after the cap): its land. */
const FALLBACK = ["Quiet {land}", "Open {land}", "Wide {land}"];

const SEA_NOUNS: Record<SeaLayout, string> = { central: "Isles", edge: "Coast", archipelago: "Archipelago", chain: "Island Chain", atolls: "Atolls", twoSeas: "Twin Seas" };

/** The land's noun: the theme's, or for Any what the map shows most. */
export function landNoun(theme: ThemeId, sig: Signature, seaLayout: SeaLayout | null | undefined): string {
  if (seaLayout) return SEA_NOUNS[seaLayout];
  switch (theme) {
    case "riverValley":
      return "Valley";
    case "canyon":
      return "Gorge";
    case "highlands":
      return "Heights";
    case "lakeBasin":
      return "Lakelands";
    case "delta":
      return "Delta";
    case "islands":
      return "Isles";
    default:
      if (sig.mouths >= 3) return "Delta";
      if (sig.lakeShare >= 0.55 && sig.bigLake >= 0.04) return "Lakelands";
      if (sig.canyon >= 20) return "Gorge";
      if (sig.high >= 0.6 && sig.plateaus >= 3) return "Heights";
      if (sig.valley >= 0.2) return "Valley";
      return "Lands";
  }
}

function normal(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const EXACT = new Set(FORBIDDEN.exact.map(normal));
const PHRASES = FORBIDDEN.phrase.map(normal);

/** Whether a title may be used: not an official or workshop title, no real place in it. */
export function allowedName(title: string): boolean {
  const n = normal(title);
  if (EXACT.has(n) || EXACT.has(n.replace(/ /g, ""))) return false;
  return !PHRASES.some((p) => ` ${n} `.includes(` ${p} `));
}

export interface PlayFacts {
  W: number;
  H: number;
  start: { x: number; y: number } | null;
  /** The start's water stays pumpable through the first Normal drought. */
  startDrought: boolean | null;
  bestDam: { x: number; y: number; volume: number; length: number } | null;
  /** Where the nearest badwater lies from the start, when there is some. */
  badwater: { x: number; y: number; distance: number } | null;
  woods: "oak" | "mixed" | "birch" | null;
}

const COMPASS = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];

/** The compass direction from a to b (north is +y). */
function compass(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  // the octant by comparing the two components (no trigonometry)
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > 2.414 * ady) return dx >= 0 ? COMPASS[0] : COMPASS[4];
  if (ady > 2.414 * adx) return dy >= 0 ? COMPASS[2] : COMPASS[6];
  if (dx >= 0) return dy >= 0 ? COMPASS[1] : COMPASS[7];
  return dy >= 0 ? COMPASS[3] : COMPASS[5];
}

/** One thing about how the map plays, from the finished map. */
export function playHint(f: PlayFacts): string {
  if (f.start && f.startDrought === false) return "The start's water runs low in the first drought: store some early.";
  if (f.start && f.bestDam && f.bestDam.volume >= 300) {
    const d = Math.round(portable.sqrt((f.bestDam.x - f.start.x) * (f.bestDam.x - f.start.x) + (f.bestDam.y - f.start.y) * (f.bestDam.y - f.start.y)));
    const len = f.bestDam.length;
    const article = String(len).startsWith("8") || len === 11 || len === 18 ? "An" : "A";
    const held = String(Math.round(f.bestDam.volume / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${article} ${len}-tile dam ${d} tiles ${compass(f.start.x, f.start.y, f.bestDam.x, f.bestDam.y)} of the start holds ${held} water.`;
  }
  if (f.start && f.badwater) return `Badwater lies ${Math.round(f.badwater.distance)} tiles ${compass(f.start.x, f.start.y, f.badwater.x, f.badwater.y)} of the start.`;
  if (f.woods === "oak") return "Its woods are mostly oak: plenty of logs, slow to regrow.";
  if (f.woods === "birch") return "Its woods are mostly birch: quick to regrow, few logs a tree.";
  return "Start by the water and follow it.";
}

export interface MapWords {
  name: string;
  description: string;
}

export function mapWords(o: { seed: number; theme: ThemeId; standout: IntentionId | null; signature: Signature; seaLayout?: SeaLayout | null; facts: PlayFacts; say?: string }): MapWords {
  const land = landNoun(o.theme, o.signature, o.seaLayout);
  const pool = o.standout ? TITLES[o.standout] : FALLBACK;
  const k0 = hash32(o.seed, "name", o.standout ?? "none") % pool.length;
  let name = "";
  for (let k = 0; k < pool.length && !name; k++) {
    const title = pool[(k0 + k) % pool.length].replace("{land}", land);
    if (allowedName(title)) name = title;
  }
  // (never a seed or an invented word: the land alone)
  if (!name) name = `The ${land}`;
  // (the standout in the map's own numbers where its check gave them, else in general words)
  const sentence = o.standout ? (o.say ?? INTENTION_TEXT[o.standout]) : "";
  return { name, description: [sentence, playHint(o.facts)].filter(Boolean).join(" ") };
}
