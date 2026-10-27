// The map's shape (D357, custom map sizes part 2): the generator uses the proportions, never just
// stretching. A long map (one side at least LONG_RATIO times the other) gets its water along its
// length: a long river down a long map, a canyon running its length, a chain of islands down a strip,
// a long lake; and its start where the theme wants it along that length (`startAlong`). A square map,
// or one nearly square, is drawn as before, byte for byte.

import { DIRS8 } from "./num";
import type { ThemeId } from "../spec/mapspec";

/** How much longer than wide a map is before it is drawn as a long map. */
export const LONG_RATIO = 1.5;

export interface MapShape {
  /** The longer side over the shorter (1 on a square map). */
  ratio: number;
  /** Whether the long side runs east to west (x). */
  alongX: boolean;
  /** Drawn as a long map. */
  long: boolean;
}

export function mapShape(W: number, H: number): MapShape {
  const ratio = Math.max(W, H) / Math.min(W, H);
  return { ratio, alongX: W >= H, long: ratio >= LONG_RATIO };
}

/** A flow direction (DIRS8's index) turned onto the map's long axis, keeping its sense along it: east
 *  or west on a map long east to west, north or south on one long north to south. A direction across
 *  the axis takes the sense of its first part along the other. */
export function alongLongAxis(dir: number, W: number, H: number): number {
  const [fx, fy] = DIRS8[dir];
  if (W >= H) return fx > 0.1 ? 0 : fx < -0.1 ? 4 : fy > 0 ? 0 : 4;
  return fy > 0.1 ? 2 : fy < -0.1 ? 6 : fx > 0 ? 2 : 6;
}

/** Where each theme's start lies along a long map (D357: "at one end for a journey, or in the middle
 *  with two directions to expand", chosen per theme). Canyon's gorge is a journey down its length,
 *  Islands' chain is crossed island to island and Delta's fan lies ahead at the river's mouth: one end.
 *  River Valley's valley, Lake Basin's lake, Highlands' heights and Any open both ways: the middle. */
export const START_ALONG: Record<ThemeId, "end" | "middle"> = {
  any: "middle",
  riverValley: "middle",
  canyon: "end",
  highlands: "middle",
  lakeBasin: "middle",
  delta: "end",
  islands: "end",
};

/** How well tile (x, y) suits the theme's start on a long map, 0 to 1 (0 everywhere on a map that is
 *  not long): the middle third best for a middle start, the outer fifths for an end start. */
export function startAlong(theme: ThemeId, x: number, y: number, W: number, H: number): number {
  const s = mapShape(W, H);
  if (!s.long) return 0;
  const t = s.alongX ? x / (W - 1) : y / (H - 1);
  const off = Math.abs(t - 0.5) * 2;
  return START_ALONG[theme] === "middle" ? Math.max(0, 1 - off / 0.66) : Math.max(0, Math.min(1, (off - 0.4) / 0.4));
}
