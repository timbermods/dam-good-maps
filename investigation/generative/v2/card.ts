// The "how it plays" card, design version 2: a few plain sentences for a Timberborn player
// (CLAUDE.md's writing rule: short, action first, plain words, each thing once). It reads the
// opening (lib/opening.ts), the exact cycle model's first Normal drought and later Hard drought,
// the intentions that emerged and the map's reach. It says what the land does, never how it was
// made, and never promises survival.

import type { Opening } from "../lib/opening";
import type { IntentionId } from "./intentions";

const KIND: Record<string, string> = { river: "a river", lake: "a lake", pond: "a pond", stream: "a stream", none: "water" };

function list(v: string[]): string {
  if (v.length <= 1) return v.join("");
  return `${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}`;
}

function sides(v: string[]): string {
  if (v.length >= 6) return "every side";
  const main = v.filter((d) => !d.includes("-"));
  return list(main.length >= 2 ? main : v);
}

/** What each emerged intention means for the player, in one sentence. */
const SAYS: Record<IntentionId, string> = {
  "under-cliff": "You start under a cliff, with your water below.",
  landmark: "A landmark stands out: you can see it from anywhere on the map.",
  "farmland-past-gorge": "The best farmland lies across the gorge: bridge it to grow.",
  "safe-water-uphill": "In a long drought the river runs low, but a lake uphill keeps its water.",
  "falls-shield": "A waterfall's cliff stands between you and the nearest threat.",
  "hidden-valley": "A valley up the cliffs holds riches: build stairs to reach it.",
  "high-lake": "A lake high on the heights spills over a fall.",
  "meeting-waters": "Two rivers meet by the start.",
  "long-view": "You start on high ground, looking out over the land below.",
  "snaking-river": "A river snakes down a hill, dropping a level at its bends.",
  "crater-rivers": "Rivers meet in a crater lake that spills out through one gap in its rim.",
  "cliff-falls-lake": "A waterfall plunges off a cliff into a big, round lake.",
};

import { woodKind, type StartingWood } from "./rules";

export interface CardInput {
  opening: Opening;
  /** The exact model: the day the start loses pumpable water in the first Normal drought and in
   *  the later Hard one (null: never), and each drought's length. */
  firstNormal: { lostDay: number | null; days: number };
  lateHard: { lostDay: number | null; days: number };
  intentions: IntentionId[];
  /** Dry land reached on foot from the start, as a share. */
  onFoot: number;
  /** Kyler's start water rule: the walk to the pump shore, and whether it is on the start's level. */
  water?: { walk: number; sameLevel: boolean } | null;
  /** Starting wood (D164). */
  wood?: StartingWood | null;
}

export function card2(x: CardInput): string[] {
  const f = x.opening.facts;
  const out: string[] = [];
  const w = x.water && !x.water.sameLevel ? x.water : null;
  if (w) out.push(`You start above ${KIND[f.waterKind]}: a pump shore ${Math.max(1, Math.round(w.walk))} tiles' walk away, down a slope.`);
  else out.push(`You start by ${KIND[f.waterKind]}, ${f.waterWalk <= 1 ? "right beside you" : `${f.waterWalk} tiles away on your level`}.`);
  const fn = x.firstNormal;
  const lh = x.lateHard;
  if (fn.lostDay === null) out.push(lh.lostDay === null ? `It lasts through the first drought and a ${lh.days}-day Hard one.` : `It lasts through the first drought; in a ${lh.days}-day Hard drought it is gone by day ${Math.max(1, lh.lostDay)}.`);
  else out.push(`In the first drought it is gone by day ${Math.max(1, fn.lostDay)}: store water before it.`);
  const an = (n: number) => (/^(8|11|18)/.test(String(n)) ? "An" : "A");
  if (f.dam && f.dam.dist <= 40) out.push(`${an(f.dam.length)} ${f.dam.length}-tile dam ${f.dam.dist <= 8 ? "by the start" : `${f.dam.dist} tiles ${f.dam.dir}`} holds a drought's water.`);
  else out.push("No short dam holds a drought's water near the start: build levees or dig a reservoir.");
  if (f.threat?.kind === "badwater") out.push(`Badwater lies ${f.threat.dist} tiles ${f.threat.dir}${f.threat.upstream ? ", and some reaches your water" : ""}.`);
  else if (f.threat?.kind === "thorns") out.push(`Thorns bar the way ${f.threat.dir}, ${f.threat.dist} tiles out.`);
  if (x.wood && x.wood.logs) out.push(`${x.wood.logs} logs of wood within 20 tiles' walk, ${woodKind(x.wood)}${x.wood.growing >= 10 ? `; plus about ${Math.round(x.wood.growing / 10) * 10} logs growing` : ""}.`);
  for (const id of x.intentions) out.push(SAYS[id]);
  const land = f.land === "wide" ? "wide, level land" : f.land === "some" ? "some level land" : "narrow ledges";
  const where = sides(f.openTo);
  out.push(f.openTo.length ? `Expand ${where === "every side" ? "on every side" : `to the ${where}`}, on ${land}.` : "The start is boxed in: stairs lead out.");
  if (x.onFoot < 0.15) out.push("Most of the high ground needs stairs.");
  if (f.hidden.length) out.push(`Further out: ${list(f.hidden)}.`);
  return out;
}
