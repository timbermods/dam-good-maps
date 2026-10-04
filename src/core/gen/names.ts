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

/** Titles per standout: eight to sixteen each, more for the standouts most maps get, nearly all
 *  carrying the land's noun (`{land}`) so that a title seldom repeats across themes; across seeds
 *  1–30 of every theme at 128² no name appears more than twice (investigation/theme-critique: 102
 *  distinct names over 210 maps, "Standing Stone" nine times). */
const TITLES: Record<IntentionId, string[]> = {
  "under-cliff": ["Cliff Shelter {land}", "Under the Bluff", "Bluff Hollow {land}", "Crag Foot {land}", "Sheltered Ledge {land}", "Bluff Foot {land}", "Cliff Foot {land}", "Under the Crag {land}", "Shelter {land}", "Lee {land}", "Crag Shelter {land}", "Bluff Lee {land}", "Cliff Lee {land}", "Bluff Shelter {land}", "Under the Cliff {land}"],
  landmark: ["Lone Spire {land}", "Old Watchstone {land}", "Needle {land}", "Standing Stone {land}", "Sentinel {land}", "Pillar {land}", "Spire {land}", "Lone Rock {land}", "Watchstone {land}", "High Needle {land}", "Stone Finger {land}", "Beacon Rock {land}", "Tall Stone {land}", "Lone Tower {land}", "Grey Spire {land}", "One Stone {land}"],
  "farmland-past-gorge": ["Beyond the Gorge {land}", "Far Fields {land}", "Gorge Crossing {land}", "Fields Past the Chasm", "Across the Cut {land}", "Past the Gorge {land}", "Far Side {land}", "Fields Beyond {land}"],
  "falls-shield": ["Falls Guard {land}", "Behind the Falls", "Falls Watch {land}", "Curtain Falls {land}", "Waterfall Ward {land}", "Falls Wall {land}", "Guarded Falls {land}", "Falls Shield {land}"],
  "hidden-valley": ["Hidden Vale {land}", "Secret Shelf {land}", "High Hollow {land}", "Tucked Vale {land}", "Lost Shelf {land}", "Hidden {land}", "Secret Vale {land}", "Quiet Shelf {land}", "Tucked Shelf {land}", "Hollow {land}"],
  "high-lake": ["Sky Lake {land}", "Perched Lake {land}", "Upper Pool {land}", "Hanging Tarn", "Summit Water {land}", "High Lake {land}", "Perched Pool {land}", "Tarn {land}"],
  "meeting-waters": ["Two Rivers Meet", "Confluence {land}", "River Fork {land}", "Joining Waters {land}", "Meeting Waters {land}", "Meeting Streams {land}", "Two Waters {land}", "Join {land}", "Forks {land}", "Meeting {land}"],
  "long-view": ["The Overlook", "High Watch {land}", "Lookout {land}", "Far Sight {land}", "Watch Ridge {land}", "Wide View {land}", "Overlook {land}", "Clear Sight {land}", "Long View {land}", "Ridge Watch {land}", "Far View {land}", "High Lookout {land}", "Wide Sight {land}", "Watch {land}", "Far Watch {land}"],
  "snaking-river": ["Winding Water {land}", "Serpent Run {land}", "Snakeback {land}", "Coiled River {land}", "Twisting Stream {land}", "Serpent {land}", "Winding {land}", "Crooked River {land}", "Looping Water {land}", "Coil {land}", "Long Bends {land}", "Meander {land}", "Snake River {land}", "Bending Water {land}", "Many Bends {land}", "Wandering Water {land}"],
  "crater-rivers": ["Crater Meet {land}", "Gathering Bowl {land}", "Crater of Rivers", "Rim Lake {land}", "Bowl of Streams {land}", "Crater {land}", "Round Basin {land}", "Bowl {land}"],
  "cliff-falls-lake": ["Plunge Lake", "Fallwater Lake", "Cliff Pool {land}", "Cascade Basin", "Roaring Pool", "Plunge Pool {land}", "Falls Lake {land}", "Cascade {land}"],
  oxbow: ["Oxbow Bend {land}", "Cutoff Bend {land}", "Old Bend {land}", "Horseshoe Lake {land}", "Crescent Water {land}", "Oxbow {land}", "Old Loop {land}", "Cutoff {land}", "Horseshoe {land}", "Crescent {land}"],
  "stepped-lakes": ["Stair Lakes {land}", "Step Lakes {land}", "Terrace Waters {land}", "Cascade Lakes", "Ladder Lakes {land}", "Step Lake {land}", "Lake Stairs {land}", "Stepped {land}"],
  "split-island": ["Midstream Isle", "River Isle", "The Parting Isle", "Fork Island", "Twin Channel {land}", "River Island {land}", "Parting {land}", "Split Stream {land}"],
  "twin-falls": ["Paired Falls", "Double Cascade", "Twin Drops {land}", "Sister Falls", "Two Veils", "Twin Falls {land}", "Double Falls {land}", "Two Falls {land}"],
  "upper-lower": ["Great Step {land}", "Two Tier {land}", "Upper and Lower {land}", "Long Cliff {land}", "Split Level {land}", "Step {land}", "Divide {land}", "High and Low {land}", "Great Ledge {land}", "Cliff Divide {land}", "Two Levels {land}", "Upper Shelf {land}", "Lower Shelf {land}", "Big Step {land}", "Twin Shelves {land}", "Shelf Above {land}"],
  "hanging-valleys": ["Hanging Vales", "Perched Valleys", "Side Falls {land}", "Ledge Valleys", "Falling Vales", "Hanging {land}", "Side Vales {land}", "High Vales {land}"],
  "two-ways": ["Fields and Heights", "Two Roads {land}", "Fork in the Land", "Choice of Ways {land}", "Crossroads {land}", "Two Ways {land}", "Either Way {land}", "Parting Ways {land}", "Fork {land}", "Choice {land}"],
  "badwater-rich": ["Tainted Meadows", "Bitter Bottoms", "Poisoned Plenty", "Fouled Fields", "Sour Lowlands", "Bitter {land}", "Tainted {land}", "Sour {land}"],
  "relic-pinnacle": ["Relic Spire {land}", "Relic Pillar {land}", "Summit Relic {land}", "Relic Perch {land}", "Crowned Rock {land}", "Relic {land}", "High Relic {land}", "Pinnacle Relic {land}", "Crown {land}", "Old Perch {land}", "Relic Rock {land}", "Relic Needle {land}", "Relic Crag {land}", "Relic Height {land}", "Crowned {land}"],
  "plug-lake": ["The Plug", "Stopper Lake {land}", "Held Water {land}", "Bottled Lake {land}", "Pent Lake {land}", "Plug {land}", "Dammed Hollow {land}", "Stopper {land}"],
  "district-behind": ["Beyond the Rubble", "Cleared Way", "Second Shelf {land}", "The Blocked Ramp", "Neighbor Terrace", "Rubble {land}", "Second Place {land}", "Blocked Way {land}"],
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
  // (the seed walks the pool, offset by the theme and the standout: thirty seeds in a row of one
  // theme never land three on one title of a pool of fifteen or more, and the next title is tried
  // where one is forbidden)
  const k0 = (Math.abs(o.seed) + hash32(0, "name", o.theme, o.standout ?? "none")) % pool.length;
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
