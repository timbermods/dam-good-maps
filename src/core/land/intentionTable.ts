// Which themes each intention is offered for (planning, 2026-11-14): "an intention that emerges once in thirty seeds is a
// promise we do not keep". Each intention is offered only for the themes where it emerged on at least 4 of seeds 1–12
// asked alone at 128² (intentionTable.json, counted by tools/intention-table.ts, `npm run intentions`; a heavy test
// counts it again and holds it to the committed one, so it stays true as the generator changes). The MCP server offers
// and refuses intentions by it; the page offers none by name (it only keeps a map's own for Another like this).

import TABLE from "./intentionTable.json" with { type: "json" };
import { THEME_NAMES, type ThemeId } from "../spec/mapspec";
import { INTENTIONS, type IntentionId } from "./intentions";

/** A theme an intention can be offered for (Any resolves to one of these). */
export type StyleTheme = Exclude<ThemeId, "any">;
export const STYLE_THEMES: readonly StyleTheme[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];

/** The count's map side, its seeds and the least of them an intention must emerge on to be offered. */
export const INTENTION_SIDE = 128;
export const INTENTION_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const INTENTION_LEAST = 4;

export interface IntentionTable {
  /** The generator that made the count. */
  generatorVersion: string;
  side: number;
  seeds: number[];
  least: number;
  /** Of the seeds, how many maps the intention emerged on, by theme. */
  counts: Record<IntentionId, Record<StyleTheme, number>>;
  /** The themes it is offered for: those it emerged on at least `least` times. */
  offered: Record<IntentionId, StyleTheme[]>;
}

export const INTENTION_TABLE = TABLE as IntentionTable;

/** The themes an intention is offered for (none: it is not offered now). */
export function offeredThemes(id: IntentionId): readonly StyleTheme[] {
  return INTENTION_TABLE.offered[id] ?? [];
}

/** Why an intention is not offered for a theme, in one line, or null when it is. Any is refused while the seed would
 *  pick the theme: the intention names the themes it is offered for. */
export function intentionRefusal(id: string, theme: ThemeId): string | null {
  if (!(INTENTIONS as readonly string[]).includes(id)) return `"${id}" is not an intention: they are ${INTENTIONS.join(", ")}`;
  const themes = offeredThemes(id as IntentionId);
  if (theme !== "any" && themes.includes(theme)) return null;
  if (!themes.length) return `${id} is not offered now: it emerged on fewer than ${INTENTION_LEAST} of ${INTENTION_SEEDS.length} maps on every theme`;
  return `${id} is offered for ${themes.map((t) => THEME_NAMES[t]).join(", ")}: give one of those themes`;
}
