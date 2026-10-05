// A force's settings as each force's options row sets them (PLAN §20 D194, D202, D203, D206, D246; D342):
// one table of every force's choices, switches and ranges, the ranges as named constants, and the one
// check every path uses: the operation's (op.ts `forceProblems`), and each force's own when it starts
// (CarveRun, `validateCrater`, `validateErupt`, `validateQuake`, `glaciateProblem`). A setting no row
// could give is refused with a one-line reason, never clamped. ops.schema.json's `forceResult.settings`
// holds the union of these ranges (a test keeps it containing every force's own).

import { SOURCES_RULES } from "./clear";
import { floorProblem } from "./floor";
import type { Verb } from "./op";

export const POWER_MIN = 0;
export const POWER_MAX = 100;
export const SEED_MAX = 0xffffffff;
/** Carve's Wander (straight to winding). */
export const WANDER_MIN = 0;
export const WANDER_MAX = 100;
/** Carve's Width, in tiles (null: it follows Power). */
export const CARVE_WIDTH_MIN = 2;
export const CARVE_WIDTH_MAX = 24;
/** Carve's Depth, in levels below the land (D226; null: it follows Power). */
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 12;
/** Carve's River depth, in levels (item 17; null: Off). */
export const RIVER_DEPTH_MIN = 1;
export const RIVER_DEPTH_MAX = 22;
/** Carve's Banks, in tiles (item 18). */
export const BANKS_MIN = 0;
export const BANKS_MAX = 10;
/** Craterize's Size, in tiles across (null: it follows Power). */
export const CRATER_SIZE_MIN = 4;
export const CRATER_SIZE_MAX = 180;
/** Erupt's Size, in tiles across (D226; null or absent: it follows Power). */
export const ERUPT_SIZE_MIN = 6;
export const ERUPT_SIZE_MAX = 140;
/** Glaciate's Size, in tiles (the row's slider; null: Auto). */
export const GLACIATE_SIZE_MIN = 4;
export const GLACIATE_SIZE_MAX = 64;

/** A number setting: its range, whole levels or not, whether it may be null (`"null"`) or also absent
 *  (`"nullish"`), and the reason given for anything else. */
export interface SettingRange {
  key: string;
  min: number;
  max: number;
  whole?: boolean;
  empty: "required" | "null" | "nullish";
  why: string;
}

/** A detail that may be absent or null (left to nature): one of `options`, or true or false. */
interface SettingDetail {
  key: string;
  options?: readonly string[];
  why: string;
}

export interface ForceSettingsTable {
  /** The force as a reason names it ("a carve", "an impact"). */
  name: string;
  /** Settings that are one of a list. */
  choices: Readonly<Record<string, readonly string[]>>;
  /** Settings that are true or false. */
  flags: readonly string[];
  ranges: readonly SettingRange[];
  details?: readonly SettingDetail[];
}

/** Every force's settings. Power (0–100), the seed (a whole number, 0–4294967295), the Floor
 *  (floor.ts) and Sources (clear.ts, D474: ride or clear; absent, it rode) are every force's. */
export const FORCE_SETTINGS: Readonly<Record<Verb, ForceSettingsTable>> = {
  carve: {
    name: "a carve",
    choices: { mode: ["unleash", "aim"], walls: ["steep", "wide"] },
    flags: ["defyGravity", "dry"],
    ranges: [
      { key: "wander", min: WANDER_MIN, max: WANDER_MAX, empty: "required", why: `a carve's wander is ${WANDER_MIN} to ${WANDER_MAX}` },
      { key: "width", min: CARVE_WIDTH_MIN, max: CARVE_WIDTH_MAX, empty: "null", why: `a carve's width is ${CARVE_WIDTH_MIN} to ${CARVE_WIDTH_MAX} tiles, or null (it follows Power)` },
      { key: "depth", min: DEPTH_MIN, max: DEPTH_MAX, whole: true, empty: "nullish", why: `a carve's depth is ${DEPTH_MIN} to ${DEPTH_MAX} levels, or null (it follows Power)` },
      { key: "riverDepth", min: RIVER_DEPTH_MIN, max: RIVER_DEPTH_MAX, whole: true, empty: "nullish", why: `a carve's river depth is ${RIVER_DEPTH_MIN} to ${RIVER_DEPTH_MAX} levels, or null (Off)` },
      { key: "banks", min: BANKS_MIN, max: BANKS_MAX, empty: "nullish", why: `a carve's banks are ${BANKS_MIN} to ${BANKS_MAX} tiles` },
    ],
  },
  craterize: {
    name: "an impact",
    choices: { mode: ["strike", "aim"], walls: ["steep", "terraced"], centre: ["auto", "bowl", "peak", "ring", "flat"], debris: ["light", "heavy"] },
    flags: ["rays"],
    ranges: [{ key: "size", min: CRATER_SIZE_MIN, max: CRATER_SIZE_MAX, empty: "null", why: `an impact's size is ${CRATER_SIZE_MIN} to ${CRATER_SIZE_MAX} tiles, or null (it follows Power)` }],
  },
  erupt: {
    name: "an eruption",
    choices: { mode: ["vent", "fissure"], shape: ["steep", "broad"], summit: ["auto", "peak", "crater", "caldera"], flows: ["light", "heavy"] },
    flags: ["ridges"],
    ranges: [{ key: "size", min: ERUPT_SIZE_MIN, max: ERUPT_SIZE_MAX, empty: "nullish", why: `an eruption's size is ${ERUPT_SIZE_MIN} to ${ERUPT_SIZE_MAX} tiles, or null (it follows Power)` }],
  },
  quake: {
    name: "a quake",
    choices: { mode: ["lift", "slide"], scarp: ["sheer", "stepped"] },
    flags: [],
    ranges: [],
  },
  rift: { name: "a rift", choices: { mode: ["drop"], walls: ["auto", "sheer", "stepped"] }, flags: [], ranges: [{ key: "size", min: 4, max: 64, empty: "null", why: "a rift's size is 4 to 64 tiles, or null (it follows Power)" }] },
  deposit: { name: "a deposit", choices: { mode: ["fan"], channels: ["auto", "few", "many"] }, flags: [], ranges: [{ key: "size", min: 4, max: 64, empty: "null", why: "a deposit's size is 4 to 64 tiles, or null (it follows Power)" }] },
  glaciate: {
    name: "a glacier",
    choices: { mode: ["flow", "aim"] },
    flags: ["meltwater"],
    ranges: [{ key: "size", min: GLACIATE_SIZE_MIN, max: GLACIATE_SIZE_MAX, empty: "null", why: `a glacier's size is ${GLACIATE_SIZE_MIN} to ${GLACIATE_SIZE_MAX} tiles, or null (it follows Power)` }],
    // its details behind More (D309): each absent or null is left to nature
    details: [
      { key: "benches", options: ["none", "some", "many"], why: "a glacier's benches are none, some or many" },
      { key: "steps", options: ["few", "some", "many"], why: "a glacier's steps are few, some or many" },
      { key: "tarn", why: "a glacier's tarn is true or false" },
      { key: "scree", why: "a glacier's scree is true or false" },
    ],
  },
};

/** Why a force's settings are not ones its row could set (null when they are). */
export function forceSettingsProblem(verb: Verb, s: Record<string, unknown>): string | null {
  const t = FORCE_SETTINGS[verb];
  for (const [k, list] of Object.entries(t.choices)) if (!list.includes(s[k] as string)) return `${t.name}'s ${k} is one of ${list.join(", ")}`;
  for (const k of t.flags) if (typeof s[k] !== "boolean") return `${t.name}'s ${k} is true or false`;
  const power = s.power as number;
  if (!(Number.isFinite(power) && power >= POWER_MIN && power <= POWER_MAX)) return `${t.name}'s power is ${POWER_MIN} to ${POWER_MAX}`;
  const seed = s.seed as number;
  if (!(Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX)) return `${t.name}'s seed is a whole number from 0 to ${SEED_MAX}`;
  const floor = floorProblem(s.floor);
  if (floor) return floor;
  if (s.sources !== undefined && !SOURCES_RULES.includes(s.sources as never)) return `${t.name}'s sources are ride or clear`;
  for (const r of t.ranges) {
    const v = s[r.key] as number;
    if ((v === null && r.empty !== "required") || (v === undefined && r.empty === "nullish")) continue;
    if (!((r.whole ? Number.isInteger(v) : Number.isFinite(v)) && v >= r.min && v <= r.max)) return r.why;
  }
  for (const d of t.details ?? []) {
    const v = s[d.key];
    if (v != null && !(d.options ? d.options.includes(v as string) : typeof v === "boolean")) return d.why;
  }
  return null;
}

/** The same, as the list the operation's check returns (empty when they are fine). */
export function forceSettingsProblems(verb: Verb, s: Record<string, unknown>): string[] {
  const why = forceSettingsProblem(verb, s);
  return why ? [why] : [];
}
