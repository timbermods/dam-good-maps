// Which themes each intention is offered for (planning, 2026-11-14; amended 2026-11-15, D138 and
// docs/design/intentions-by-design.md §7): "an intention that emerges once in thirty seeds is a promise we do not keep".
// Each intention is offered only for the themes where it emerged on at least 8 of seeds 1–12 asked alone, at 128² and
// at 256² both (intentionTable.json, counted by tools/intention-table.ts, `npm run intentions`). The table is also the
// generator's: a map draws an intention only on a theme it is offered for (land/intentions.ts `drawIntentions`), so a
// regenerated table that moves the offered list moves the maps that draw (a generator version and a re-pin). Nightly
// counts it again, a theme and a side a job, the 256² side in parts (`--check --theme --side --part`), and only
// Nightly: not pull requests, not the release gate (planning). A red Nightly on it means the list moved: the table is
// regenerated in a pull request that says which intention moved, on which theme, and why. The MCP server offers and
// refuses intentions by it ("Not offered now." for one offered nowhere); the page offers none by name (it only keeps a
// map's own for Another like this).

import TABLE from "./intentionTable.json" with { type: "json" };
import { THEME_NAMES, type ThemeId } from "../spec/mapspec";
import { INTENTIONS, type IntentionId } from "./intentions";

/** A theme an intention can be offered for (Any resolves to one of these). */
export type StyleTheme = Exclude<ThemeId, "any">;
export const STYLE_THEMES: readonly StyleTheme[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];

/** The count's map sides (square), its seeds and the least of them an intention must emerge on, at every side, to be
 *  offered. */
export const INTENTION_SIDES: readonly number[] = [128, 256];
export const INTENTION_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const INTENTION_LEAST = 8;

/** Of the seeds, how many maps an intention emerged on, by side ("128", "256"). */
export type SideCounts = Record<string, number>;

export interface IntentionTable {
  /** The generator that made the count. */
  generatorVersion: string;
  sides: number[];
  seeds: number[];
  least: number;
  /** Of the seeds, how many maps the intention emerged on, by theme and side. */
  counts: Record<IntentionId, Record<StyleTheme, SideCounts>>;
  /** The themes it is offered for: those it emerged on at least `least` times at every side. */
  offered: Record<IntentionId, StyleTheme[]>;
}

export const INTENTION_TABLE = TABLE as IntentionTable;

/** The table's rule: the themes where the intention emerged on at least `least` maps at every side. */
export function offeredBy(counts: Record<StyleTheme, SideCounts>, sides: readonly number[] = INTENTION_SIDES, least = INTENTION_LEAST): StyleTheme[] {
  return STYLE_THEMES.filter((t) => sides.every((s) => (counts[t]?.[String(s)] ?? 0) >= least));
}

/** The themes an intention is offered for (none: it is not offered now). */
export function offeredThemes(id: IntentionId): readonly StyleTheme[] {
  return INTENTION_TABLE.offered[id] ?? [];
}

/** The sides in words: "128² and 256²". */
export function sidesWords(sides: readonly number[] = INTENTION_SIDES): string {
  const w = sides.map((s) => `${s}²`);
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : w.join("");
}

/** Why an intention is not offered for a theme, in one line, or null when it is. Any is refused while the seed would
 *  pick the theme: the intention names the themes it is offered for. */
export function intentionRefusal(id: string, theme: ThemeId): string | null {
  if (!(INTENTIONS as readonly string[]).includes(id)) return `"${id}" is not an intention: they are ${INTENTIONS.join(", ")}`;
  const themes = offeredThemes(id as IntentionId);
  if (theme !== "any" && themes.includes(theme)) return null;
  if (!themes.length) return `${id} is not offered now: on no theme did it emerge on ${INTENTION_LEAST} of ${INTENTION_SEEDS.length} maps at ${sidesWords()}`;
  return `${id} is offered for ${themes.map((t) => THEME_NAMES[t]).join(", ")}: give one of those themes`;
}
