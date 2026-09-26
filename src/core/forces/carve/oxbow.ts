// A cut-off bend (D199, high Wander): a long bend on one side of its shortcut, with a narrow neck
// the river can cut through. Only one cutoff per carve. Sediment settles in both old mouths, two
// bars across the bend, so the crescent between them holds its water as an oxbow lake (D216).
//
// Ported from investigation/carve/oxbow.ts (PR #47), kept to its structure.

import type { Point } from "./course";
import type { Station } from "./run";

/** A sediment bar across an old mouth: its middle, the river's heading there, its half-width and
 *  the level its top holds. */
export interface MouthBar extends Point {
  dx: number;
  dy: number;
  width: number;
  level: number;
}

export interface Oxbow {
  start: number;
  end: number;
  step: number;
  floor: number;
  neck: Point[];
  pool: Point[];
  bars: [MouthBar, MouthBar];
}

/** Detect an actual long bend with a short neck, not a decorative pond added beside an arbitrary
 *  channel. */
export function findNeck(path: Station[], step: number): Oxbow | null {
  const end = path.length - 1;
  const B = path[end];
  if (!B || B.bed < 2 || end < 25) return null;
  for (let start = Math.max(5, end - 100); start < end - 20; start++) {
    const A = path[start];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy);
    const radius = Math.min(A.width, B.width);
    const arc = (end - start) * 1.35;
    if (d < radius * 2 + 3 || d > radius * 4 + 10 || arc < d * 2.2) continue;
    const bow = path.slice(start, end + 1);
    const sides = bow.map((p) => ((p.x - A.x) * dy - (p.y - A.y) * dx) / d);
    const swing = Math.max(...sides.map(Math.abs));
    if (Math.min(...sides) < -0.25 && Math.max(...sides) > 0.25) continue;
    if (swing < radius * 2 + 3) continue;
    const neck = Array.from({ length: Math.ceil(d / 1.1) + 1 }, (_, k) => {
      const t = k / Math.ceil(d / 1.1);
      return { x: A.x + dx * t, y: A.y + dy * t };
    });
    // Two transverse sediment bars, set back from the shortcut. Keep a genuine crescent between
    // them and a sill reachable by the game's water.
    const far = sides.map((s, k) => (Math.abs(s) > radius * 1.8 + 3 ? k : -1)).filter((k) => k >= 0);
    if (far.length < 12) continue;
    const first = far[0];
    const last = far[far.length - 1];
    const level = Math.min(A.bed, B.bed + 2);
    const bar = (p: Station): MouthBar => ({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, width: p.width + 2, level });
    return { start, end, step, floor: B.bed - 1, neck, pool: bow.slice(first + 2, last - 1), bars: [bar(bow[first]), bar(bow[last])] };
  }
  return null;
}

/** The net surface reserved for each tile of the mouth bars (0 elsewhere): scour below it is filled
 *  with sediment in the same step, so the bar's ground holds while the crescent deepens. */
export function mouthFloors(cut: Oxbow, W: number, H: number, original: Uint8Array): Uint8Array {
  const floor = new Uint8Array(W * H);
  for (const b of cut.bars) {
    const radius = b.width + 5;
    for (let y = Math.max(0, Math.floor(b.y - radius)); y <= Math.min(H - 1, Math.ceil(b.y + radius)); y++)
      for (let x = Math.max(0, Math.floor(b.x - radius)); x <= Math.min(W - 1, Math.ceil(b.x + radius)); x++) {
        const along = (x - b.x) * b.dx + (y - b.y) * b.dy;
        const side = -(x - b.x) * b.dy + (y - b.y) * b.dx;
        if (Math.abs(along) > 2 || Math.abs(side) > b.width + 3) continue;
        const level = b.level + Math.max(0, Math.ceil((Math.abs(side) - b.width) * 4));
        const i = y * W + x;
        floor[i] = Math.max(floor[i], Math.min(original[i], level));
      }
  }
  return floor;
}
