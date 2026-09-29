// The map card's numbers (docs/UI-BRIEF.md §3; PLAN §20 D325, D330): trees within walking reach with
// their logs, and the five difficulty levers as marks graded easier, middling or harder, with the
// detail a hover shows. Plain questions over M9b's numbers (D342 (3)).
//
// The numbers are M9b's `analysis.walkReach` and `analysis.levers` (src/core/validate/playability.ts
// on feature/m9b). They are not on dev yet, so their types are written out here to match; once M9b
// merges, `WalkReach` and `Levers` become `NonNullable<PlayabilityAnalysis["walkReach"]>` and
// `...["levers"]`.

import { LOG_FLOOR_WALK } from "../data/logFloor";

/** M9b's `analysis.walkReach`: the trees within the starting-logs floor's walk (40 tiles) and the
 *  logs their grown trees hold; the start's farmland and level building land within 20 tiles' walk. */
export interface WalkReach {
  trees: number;
  logs: number;
  farmland: number;
  level: number;
}

/** M9b's `analysis.levers` (item 47's five difficulty levers, information): the start's farmland and
 *  level building land within 20 tiles' walk; the tiles to the nearest metal and to the nearest
 *  badwater (null: none); the shortest dam within 40 tiles that stores the drought's need, in tiles
 *  (null: none does). */
export interface Levers {
  farmland: number;
  metal: number | null;
  badwater: number | null;
  shelter: number | null;
  buildable: number;
}

/** "182 trees in reach, 640 logs": the trees within the starting-logs floor's walk. */
export function reachText(r: WalkReach): string {
  return `${r.trees.toLocaleString("en-US")} ${r.trees === 1 ? "tree" : "trees"} in reach, ${r.logs.toLocaleString("en-US")} logs`;
}

export const REACH_DETAIL = `Trees within ${LOG_FLOOR_WALK} tiles' walk of the start, and the logs their grown trees give.`;

export type LeverKey = keyof Levers;
/** A lever's mark: how much it eases or tightens the start. */
export type Grade = "easier" | "middling" | "harder";

/**
 * Where each lever's mark changes, in tiles (a default this step chose, for Kyler's audit and the
 * design pass to tune; recorded in docs/progress/page-editor.md). `more` levers are easier the
 * bigger they are (farmland, building land); `less` ones the smaller (metal, a dam); badwater is
 * easier the farther away. At or past `easy` the mark is "easier"; short of `hard` it is "harder".
 */
export const LEVER_BANDS: Record<LeverKey, { easier: "more" | "less"; easy: number; hard: number }> = {
  // item 47's floor is 100 tiles of farmland, the settler's ask 160
  farmland: { easier: "more", easy: 300, hard: 150 },
  // the tiles to the nearest mine site or ruin column
  metal: { easier: "less", easy: 25, hard: 60 },
  // the tiles to the nearest badwater: Normal's start rule is 15, Easy's 30
  badwater: { easier: "more", easy: 40, hard: 15 },
  // the shortest dam that stores the drought's need
  shelter: { easier: "less", easy: 8, hard: 16 },
  // level building land: item 47's floor is 79 to 180 by Start area
  buildable: { easier: "more", easy: 400, hard: 200 },
};

export const LEVER_NAMES: Record<LeverKey, string> = {
  farmland: "Farmland",
  metal: "Metal",
  badwater: "Badwater",
  shelter: "Shelter from a badtide",
  buildable: "Building land",
};

export const LEVER_ORDER: readonly LeverKey[] = ["farmland", "metal", "badwater", "shelter", "buildable"];

/** A lever's mark. A missing metal or dam is "harder"; missing badwater is "easier". */
export function leverGrade(key: LeverKey, v: number | null): Grade {
  const b = LEVER_BANDS[key];
  if (v === null) return key === "badwater" ? "easier" : "harder";
  if (b.easier === "more") return v >= b.easy ? "easier" : v >= b.hard ? "middling" : "harder";
  return v <= b.easy ? "easier" : v <= b.hard ? "middling" : "harder";
}

const GRADE_WORDS: Record<Grade, string> = { easier: "easier", middling: "middling", harder: "harder" };

/** The detail a lever's mark shows on hover. */
export function leverDetail(key: LeverKey, v: number | null): string {
  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  const what = (() => {
    switch (key) {
      case "farmland":
        return `${n(v ?? 0)} tiles of moist farmland within 20 tiles' walk of the start`;
      case "metal":
        return v === null ? "No metal on the map" : `The nearest metal (a mine site or ruins) is ${n(v)} tiles from the start`;
      case "badwater":
        return v === null ? "No badwater on the map" : `The nearest badwater is ${n(v)} tiles from the start`;
      case "shelter":
        return v === null ? "No dam near the start holds the drought's water" : `A ${n(v)}-tile dam near the start holds the drought's water`;
      case "buildable":
        return `${n(v ?? 0)} tiles of level building land within 20 tiles' walk of the start`;
    }
  })();
  return `${LEVER_NAMES[key]}: ${GRADE_WORDS[leverGrade(key, v)]}. ${what}.`;
}

export interface LeverMark {
  key: LeverKey;
  name: string;
  grade: Grade;
  detail: string;
}

export function leverMarks(l: Levers): LeverMark[] {
  return LEVER_ORDER.map((key) => ({ key, name: LEVER_NAMES[key], grade: leverGrade(key, l[key]), detail: leverDetail(key, l[key]) }));
}
