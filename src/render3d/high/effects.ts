// The High look's effects (PLAN §20 D242, D250, D284): each one switchable, all on by default. The
// lower-cost tier (D250 (2)) drops the ones that cost the most on a weaker GPU before the automatic
// fallback gives up on High altogether (fallback.ts).

export interface HighEffect {
  key: HighEffectKey;
  /** Its name on the page (the look's menu). */
  label: string;
  /** Where it comes from: the investigation it was adopted from. */
  from: "#38" | "#65" | "#66" | "#67";
}

export type HighEffectKey =
  | "water"
  | "shadows"
  | "sunlight"
  | "ao"
  | "tone"
  | "grade"
  | "haze"
  | "sky"
  | "strata"
  | "soilEdges"
  | "variation"
  | "vegetation"
  | "sway"
  | "geology"
  | "soilCap"
  | "section"
  | "crown"
  | "landing"
  | "bubbles"
  | "mist"
  | "rings"
  | "roughWater"
  | "landmarks"
  | "objectDetail"
  | "poison";

export const HIGH_EFFECTS: readonly HighEffect[] = [
  { key: "water", label: "Water", from: "#38" },
  { key: "shadows", label: "Soft shadows", from: "#38" },
  { key: "sunlight", label: "Warm sunlight", from: "#65" },
  { key: "ao", label: "Ambient occlusion", from: "#65" },
  { key: "tone", label: "Tone curve", from: "#65" },
  { key: "grade", label: "Colour grade", from: "#65" },
  { key: "haze", label: "Distance haze", from: "#65" },
  { key: "sky", label: "Sky", from: "#65" },
  { key: "strata", label: "Rock strata", from: "#65" },
  { key: "soilEdges", label: "Soil edges", from: "#65" },
  { key: "variation", label: "Colour variation", from: "#65" },
  { key: "vegetation", label: "Trees and bushes", from: "#66" },
  { key: "sway", label: "Wind in the trees", from: "#66" },
  { key: "geology", label: "Rock at the map's edge", from: "#67" },
  { key: "soilCap", label: "Soil at the map's edge", from: "#67" },
  { key: "section", label: "Water at the map's edge", from: "#67" },
  { key: "crown", label: "Waterfall crowns", from: "#67" },
  { key: "landing", label: "Waterfall landings", from: "#67" },
  { key: "bubbles", label: "Bubbly froth", from: "#67" },
  { key: "mist", label: "Mist", from: "#67" },
  { key: "rings", label: "Splash rings", from: "#67" },
  { key: "roughWater", label: "Rough water", from: "#67" },
  { key: "landmarks", label: "Landmarks", from: "#67" },
  { key: "objectDetail", label: "Fine detail", from: "#67" },
  { key: "poison", label: "Poisoned soil", from: "#67" },
];

export type HighEffects = Record<HighEffectKey, boolean>;

export function allEffects(on = true): HighEffects {
  return Object.fromEntries(HIGH_EFFECTS.map((e) => [e.key, on])) as HighEffects;
}

/** The effects on, all but those named (the player's saved switches). */
export function effectsFrom(off: readonly string[]): HighEffects {
  const e = allEffects();
  for (const k of off) if (k in e) e[k as HighEffectKey] = false;
  return e;
}

/** What the lower-cost tier turns off (D250 (2)): the soft shadows (the baked ones stay), mist and
 *  splash rings, the wind, the trees' close-up models (their far silhouettes stay) and the
 *  landmarks' fine detail; and it draws at 85% of the pixels (`LOWER_PIXELS`). */
export const LOWER_COST_DROPS: readonly HighEffectKey[] = ["shadows", "mist", "rings", "sway", "objectDetail"];
export const LOWER_PIXELS = 0.85;

/** The effects in force: the player's switches, less what the tier drops. */
export function effectiveEffects(chosen: HighEffects, lower: boolean): HighEffects {
  if (!lower) return { ...chosen };
  const out = { ...chosen };
  for (const k of LOWER_COST_DROPS) out[k] = false;
  return out;
}
