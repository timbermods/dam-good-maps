// The outcomes a generated map is chosen by (M9b; PLAN §20 D273, D278): a readable water story
// (outcome 1), the theme's promise (outcome 2, checked like an intention), and a character (outcome
// 3: at least one standout intention). The generator makes candidates until one meets them, within
// a capped number (gen/generate.ts); the rest of D273's outcomes (any handful differs, nothing
// stamped, chaos) are judged across maps, by Kyler's eye, with the measures as information.

import { signatureOf, type Signature } from "../analysis/signature";
import { waterStory, type WaterStory } from "../analysis/story";
import type { Feature } from "../features/schema";
import { KYLERS, type IntentionId } from "../land/intentions";
import type { ThemeId } from "../spec/mapspec";

/** Each theme's promise (D273 (2)) as a line on its signature's measures, and in words. Any makes
 *  no promise. The lines sit where the theme's maps part from the others' (M9b's measures,
 *  docs/progress/m9b.md). */
export const PROMISES: Record<Exclude<ThemeId, "any">, { text: string; holds: (s: Signature, side: number) => boolean }> = {
  // (a floor 20% of the side at 128², growing with the square root of the side, as the floor does)
  riverValley: { text: "a main river through a broad valley", holds: (s, side) => s.valley * side >= 0.2 * 128 * Math.sqrt(side / 128) },
  canyon: { text: "a river cut deep between cliffs for a real stretch", holds: (s, side) => s.canyon >= Math.max(16, 0.16 * side) && s.canyonShare >= 0.2 },
  highlands: { text: "high, rugged ground with plateaus and valleys among it", holds: (s) => s.high >= 0.6 && s.plateaus >= 3 && s.cliffs >= 0.1 },
  lakeBasin: { text: "big lakes that dominate the water", holds: (s) => s.lakeShare >= 0.55 && s.bigLake >= 0.04 },
  delta: { text: "a river splitting into several channels as it reaches low ground", holds: (s) => s.mouths >= 3 },
  islands: { text: "land broken by water into islands", holds: (s) => s.islands >= 3 && s.mainBody >= 0.25 && s.apart >= 0.05 },
};

export interface OutcomeInput {
  spec: { theme: ThemeId; size: { x: number; y: number } };
  built: { W: number; H: number; heights: Uint8Array; water: Float64Array; contamination: Float64Array };
  features: readonly Feature[];
  intentions: readonly { id: IntentionId; ok: boolean }[];
}

export interface Outcomes {
  story: WaterStory;
  signature: Signature;
  /** The theme's promise kept (always for Any). */
  promise: boolean;
  /** The standout intention: the first of the map's that emerged (Kyler's own first), or null. */
  standout: IntentionId | null;
  /** All three held. */
  met: boolean;
  /** How many of the three held, for the best candidate when none holds all three. */
  score: number;
  summary: string;
}

export function outcomesOf(r: OutcomeInput): Outcomes {
  const { W, H } = r.built;
  const story = waterStory(W, H, r.built.water, r.features, r.built.contamination);
  const signature = signatureOf(W, H, r.built.heights, r.built.water, r.features);
  const theme = r.spec.theme;
  const promise = theme === "any" ? true : PROMISES[theme].holds(signature, Math.min(W, H));
  const emerged = r.intentions.filter((x) => x.ok).map((x) => x.id);
  const standout = emerged.find((id) => KYLERS.has(id)) ?? emerged[0] ?? null;
  const score = (story.readable ? 1 : 0) + (promise ? 1 : 0) + (standout ? 1 : 0);
  const summary = [story.readable ? "water reads" : `water: ${story.why.join("; ")}`, theme === "any" ? "" : promise ? "promise kept" : `no ${PROMISES[theme].text}`, standout ? `standout: ${standout}` : "no standout"].filter(Boolean).join(" | ");
  return { story, signature, promise, standout, met: score === 3, score, summary };
}
