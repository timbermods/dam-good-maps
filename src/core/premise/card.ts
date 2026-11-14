// The map card's words for a premise map (docs/PREMISES.md §7 step 9): the premise's short name, the style it took,
// its landmark and the ladder's first rung, from `info.premise` alone, as plain data the page shows. Player text
// (docs/RULES.md, "Writing README and website text"): short, plain words, the map's own names, no internals.

import { PREMISE_NAMES, THEME_NAMES } from "../spec/mapspec";
import type { WorkSite } from "./ladder";
import type { PremisePlan } from "./types";
import type { StyleTheme } from "./choice";

export interface PremiseCard {
  /** The premise's short name: "Lake stair". */
  name: string;
  /** The theme whose style the land took: "Canyon". */
  style: string;
  /** The landmark: "The Great Fall, a six-level fall into Low Lake, the start's lake". */
  landmark: string;
  /** The ladder's first rung, what to do first and what it buys, or null when the map has none yet. */
  first: string | null;
  /** The problem in one line, in the map's own names (the plan's `line`). */
  line: string;
}

const NUMBER = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const number = (n: number) => NUMBER[n] ?? String(n);
const tiles = (n: number) => `${number(n)} tile${n === 1 ? "" : "s"}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** One work in a sentence: what to build or clear, where and how much, and what it buys. */
export function workWords(plan: PremisePlan, w: WorkSite): string {
  const name = (id: string) => plan.names[id] ?? id;
  const link = plan.links.find((l) => l.id === w.on);
  const on = name(w.on);
  const above = link ? name(link.from) : on;
  const n = tiles(w.tiles.length);
  const green = w.green > 0 ? `about ${w.green} tiles of dry land` : "the dry land below it";
  switch (w.kind) {
    case "breach":
      return `Mend the breach in the old weir at ${on} (${n}), so ${above} keeps its water in a drought.`;
    case "notch":
      return `Clear the Blockages in ${on} (${n}) to water ${green}.`;
    case "damToPond":
      return `Dam ${on} (${n}) to pond its water and green ${green}.`;
    case "levee":
      return `Build a levee across ${on} (${n}) to fill its basin.`;
    case "leat":
      return `Clear ${on} (${n}) to bring water to ${green}.`;
    case "raisedSill":
      return `Raise the sill at ${on} (${n}), so ${above} stores more water.`;
    case "bypass":
      return `Open ${on} (${n}), so a badtide can run round the lakes.`;
    case "megadam":
      return `Dam ${on} (${n}) to raise ${above} into a reservoir.`;
    default:
      return `Build at ${on} (${n}).`;
  }
}

/** The card's words for a premise map's `info.premise`, or null when it holds no plan (the themes made the map: its
 *  `fellBack` is the line to show). */
export function premiseCard(p: { id: string; theme?: StyleTheme; plan?: PremisePlan; ladder?: { works: WorkSite[] } }): PremiseCard | null {
  const plan = p.plan;
  if (!plan || !p.theme) return null;
  const name = (id: string) => plan.names[id] ?? id;
  const fall = plan.links.find((l) => l.id === plan.frame.landmark);
  const H = plan.stair?.H ?? fall?.fall?.height ?? 0;
  const into = fall ? fall.to : "";
  const home = plan.stair?.startLake;
  const landmark = `${cap(name(plan.frame.landmark))}, a ${number(H)}-level fall into ${name(into)}${into === home ? ", the start's lake" : ""}`;
  // the first rung: the first work of the cheapest rung that has ground to build or clear on
  const works = p.ladder?.works ?? [];
  const rungs = ["first", "small", "medium", "large"] as const;
  const first = rungs.map((r) => works.find((w) => w.rung === r && w.tiles.length > 0)).find((w) => w);
  return {
    name: PREMISE_NAMES[plan.premise],
    style: THEME_NAMES[p.theme],
    landmark,
    first: first ? workWords(plan, first) : null,
    line: plan.line,
  };
}
