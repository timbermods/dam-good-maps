// Other versions of a map (PLAN §20 D329, from Kyler's UI round; amends D278 (1a) and D325's
// reading of the forces-preview feedback's item 22). The first candidate that passes the absolutes
// is the map, shown at once and never swapped (gen/generate.ts). When it misses an outcome that
// matters to the player, a search goes on in the background (a worker of its own, so the editor
// never slows) for a version that meets all three (a readable water story, the theme's promise, a
// standout intention); the first found goes to the candidates strip for the player to take or
// ignore, with a short note naming what it has. Nothing else is generated until the player asks for
// More, which makes siblings the same way.
//
// A version is a sibling (D278 (1c), D143): the same seed, theme, settings and intentions on other
// land, `variation` 1, 2, … past the map's own, so each has its own share link. A sibling whose land
// matches the map's (analysis/story.ts `sameLand`) is passed over.

import { sameLand } from "../analysis/story";
import type { MapSpec, ThemeId } from "../spec/mapspec";
import { generate, type GenerateOptions, type GenerateResult } from "./generate";
import type { Outcomes } from "./outcomes";

/** The most versions the background search makes before it gives up (the session's default,
 *  decisions-pending). */
export const VERSION_TRIES = 6;

/** Which outcomes a map missed. */
export interface Misses {
  promise: boolean;
  water: boolean;
  standout: boolean;
}

export function missesOf(o: Outcomes): Misses {
  return { promise: !o.promise, water: !o.story.readable, standout: !o.standout };
}

/** Whether a miss is worth a background search and a note (the session's default, from Kyler's
 *  suggestion, decisions-pending): the theme's promise and readable water yes, a missing standout
 *  no (every map shows a character of its own, found or steered). */
export function worthSearching(m: Misses): boolean {
  return m.promise || m.water;
}

/** What a version that meets all three has that the map missed, in a few words, for its note:
 *  "A version with its sea is ready". */
const PROMISE_WORDS: Record<Exclude<ThemeId, "any">, string> = {
  riverValley: "its broad valley",
  canyon: "its canyon",
  highlands: "its highlands",
  lakeBasin: "its big lakes",
  delta: "its delta",
  islands: "its sea",
};

export function versionNote(theme: ThemeId, m: Misses): string {
  const parts: string[] = [];
  if (m.promise && theme !== "any") parts.push(PROMISE_WORDS[theme]);
  if (m.water) parts.push(parts.length ? "clearer water" : "water you can follow");
  return `A version with ${parts.join(" and ") || "all it promises"} is ready`;
}

/** The sibling spec for `variation`: the map's seed, theme, settings and intentions. */
export function siblingSpec(spec: MapSpec, variation: number, intentions: readonly string[]): MapSpec {
  const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), variation, ...(intentions.length ? { intentions: [...intentions] } : {}) };
  delete s.accepted;
  return s;
}

export interface VersionSearch {
  /** The version found, or null after `VERSION_TRIES` siblings. */
  result: GenerateResult | null;
  /** Siblings made. */
  tried: number;
}

/**
 * The background search: siblings of the map (its spec, the intentions it was steered toward, its
 * land) past its own variation, until one passes and meets all three outcomes. `stop()` ends it
 * early (a new map was asked for); `onTry` hears each sibling.
 */
export function findVersion(from: { spec: MapSpec; intentions: readonly string[]; heights: ArrayLike<number> }, opts: { tries?: number; stop?: () => boolean; onTry?: (variation: number, r: GenerateResult) => void; generate?: GenerateOptions } = {}): VersionSearch {
  const spec = from.spec;
  const intentions = spec.intentions ?? from.intentions;
  const tries = opts.tries ?? VERSION_TRIES;
  let variation = spec.variation ?? 0;
  for (let k = 0; k < tries; k++) {
    if (opts.stop?.()) return { result: null, tried: k };
    variation++;
    const r = generate(siblingSpec(spec, variation, intentions), opts.generate ?? {});
    opts.onTry?.(variation, r);
    if (!r.report.passed || !r.outcomes?.met || sameLand(from.heights, r.built.heights)) continue;
    return { result: r, tried: k + 1 };
  }
  return { result: null, tried: tries };
}
