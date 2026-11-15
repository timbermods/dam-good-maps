// Which themes each intention is offered for (planning, 2026-11-14; amended 2026-11-15, D138 and
// docs/design/intentions-by-design.md §7): "an intention that emerges once in thirty seeds is a promise we do not keep".
// An intention is offered for a theme at a side where it emerged on at least 8 of seeds 1–12 asked alone at that side
// (intentionTable.json, counted at 128² and 256² by tools/intention-table.ts, `npm run intentions`); a map between two
// counted sides takes the larger side's list, one under 128² the 128² list, one over 256² the 256² list (planning,
// 2026-11-15: under-cliff stays on River Valley at 128² and leaves it at 256²). The table is also the generator's: a
// map draws an intention only on a theme it is offered for at its side (land/intentions.ts `drawIntentions`), so a
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

/** The count's map sides (square), its seeds and the least of them an intention must emerge on, at a side, to be
 *  offered at that side. */
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
  /** By side ("128", "256"), the themes each intention is offered for there: those it emerged on at least `least`
   *  times at that side. */
  offered: Record<string, Record<IntentionId, StyleTheme[]>>;
}

export const INTENTION_TABLE = TABLE as IntentionTable;

/** The table's rule: the themes where the intention emerged on at least `least` maps at the side. */
export function offeredBy(counts: Record<StyleTheme, SideCounts>, side: number, least = INTENTION_LEAST): StyleTheme[] {
  return STYLE_THEMES.filter((t) => (counts[t]?.[String(side)] ?? 0) >= least);
}

/** The offered lists of every side, from the counts. */
export function offeredOf(counts: IntentionTable["counts"]): IntentionTable["offered"] {
  return Object.fromEntries(INTENTION_SIDES.map((s) => [String(s), Object.fromEntries(INTENTIONS.map((id) => [id, offeredBy(counts[id], s)]))])) as IntentionTable["offered"];
}

/** The counted side whose list a W×H map takes: the smallest counted side whose square holds the map's area (a map
 *  between two counted sides takes the larger), the largest for a map bigger than every counted side. */
export function countedSide(W: number, H: number, sides: readonly number[] = INTENTION_SIDES): number {
  return sides.find((s) => s * s >= W * H) ?? sides[sides.length - 1];
}

/** The themes an intention is offered for on a W×H map (128² when no size is given; none: not offered there). */
export function offeredThemes(id: IntentionId, size: { W: number; H: number } | null = null): readonly StyleTheme[] {
  const side = size ? countedSide(size.W, size.H) : INTENTION_SIDES[0];
  return INTENTION_TABLE.offered[String(side)]?.[id] ?? [];
}

/** The sides in words: "128² and 256²". */
export function sidesWords(sides: readonly number[] = INTENTION_SIDES): string {
  const w = sides.map((s) => `${s}²`);
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : w.join("");
}

/** Why an intention is not offered for a theme on a W×H map, in one line, or null when it is. Any is refused while the
 *  seed would pick the theme: the intention names the themes it is offered for at that size. */
export function intentionRefusal(id: string, theme: ThemeId, size: { W: number; H: number } | null = null): string | null {
  if (!(INTENTIONS as readonly string[]).includes(id)) return `"${id}" is not an intention: they are ${INTENTIONS.join(", ")}`;
  const themes = offeredThemes(id as IntentionId, size);
  if (theme !== "any" && themes.includes(theme)) return null;
  const at = size ? `${countedSide(size.W, size.H)}²` : `${INTENTION_SIDES[0]}²`;
  const elsewhere = INTENTION_SIDES.filter((s) => (INTENTION_TABLE.offered[String(s)]?.[id as IntentionId] ?? []).length).map((s) => `${s}²`);
  if (!themes.length)
    return elsewhere.length
      ? `${id} is not offered at this size (the ${at} list): it is offered on maps of ${elsewhere.join(" and ")}`
      : `${id} is not offered now: on no theme did it emerge on ${INTENTION_LEAST} of ${INTENTION_SEEDS.length} maps at ${sidesWords()}`;
  return `${id} is offered for ${themes.map((t) => THEME_NAMES[t]).join(", ")} at this size: give one of those themes`;
}
