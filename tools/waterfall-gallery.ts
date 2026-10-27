// The fall gallery (PLAN §20 D201): a small map of our own for the waterfall captures
// (tools/capture-waterfalls.ts), its water settled by the game's water rules (the canonical
// settle) and its soil by the game's rules (sim/soil.ts): a tall fall, a stepped cascade, a strong
// wide fall beside a thin weak one, a badwater fall, and (D215) a fall over an L-shaped lip and one
// over a staircase lip, each fed by its own source and facing south (or south-east), toward the
// view's default camera.

import { canonicalSettle } from "../src/core/sim/prefill";
import { gameSoil } from "../src/core/sim/soil";
import type { Emitter } from "../src/core/sim/water";

export interface Gallery {
  W: number;
  H: number;
  heights: number[];
  depth: number[];
  contamination: number[];
  moisture: number[];
  soil: number[];
}

/** The gallery's ground (x east, y north): a channel along the south carrying the falls' water off
 *  the west edge, a basin of its own for the badwater fall draining south, and to the north, each
 *  in its own block, a channel fed by a source running south to a lip over the cliff. To the east
 *  (D215), two lips that turn corners, over a basin draining south: a channel whose last three
 *  tiles also pour east into a bay beside it (an L-shaped lip round an outer corner), and a band of
 *  water running diagonally, pouring over a staircase lip (outer and inner corners, one after
 *  another, as where a river crosses a cliff at a slant). */
export function galleryMap(): { W: number; H: number; heights: Uint8Array; emitters: Emitter[] } {
  const W = 80;
  const H = 48;
  const h = new Uint8Array(W * H).fill(4);
  const set = (x0: number, x1: number, y0: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) h[y * W + x] = v;
  };
  // the channel below the falls, and a pool before each fall
  set(0, 38, 9, 15, 2);
  for (const [x0, x1] of [[3, 8], [11, 16], [19, 31], [34, 37]]) set(x0, x1, 11, 15, 1);
  // the badwater fall's basin, draining off the south edge
  set(39, 44, 0, 15, 2);
  set(39, 44, 11, 15, 1);
  // the plateau
  set(0, W, 15, H, 10);
  // a tall fall: a channel at 14 in ground at 17, three wide
  set(0, 10, 15, H, 17);
  set(4, 7, 15, 46, 14);
  // a stepped cascade: a channel three wide stepping down 2 levels every 2 tiles, in ground that
  // steps with it
  const bed = (y: number) => (y >= 23 ? 12 : y >= 21 ? 10 : y >= 19 ? 8 : y >= 17 ? 6 : 4);
  for (let y = 15; y < H; y++) {
    set(10, 17, y, y + 1, y < 46 ? bed(y) + 3 : 15);
    if (y < 46) set(12, 15, y, y + 1, bed(y));
  }
  // a strong wide fall (ten wide) and a thin weak one (one wide), 8 into 1–2
  set(20, 30, 15, 46, 8);
  set(35, 36, 15, 46, 8);
  // a badwater fall, three wide
  set(40, 43, 15, 46, 8);
  // the basin below the corners, draining off the south edge
  set(46, 78, 0, 11, 2);
  set(47, 78, 11, 15, 1);
  // an L-shaped lip: a channel three wide (8 into 1), its last three tiles also pouring east into a
  // bay beside it
  set(49, 52, 15, 46, 8);
  set(52, 55, 15, 18, 1);
  // a staircase lip: a band of water four wide running north-east at 45°, its south-east side a
  // staircase over the basin (8 into 1), the basin open to the south-east of it; fed from the north
  // by a channel three wide
  for (let x = 58; x < 78; x++) {
    const d = 15 + (x - 60);
    if (x >= 60) for (let y = 15; y < Math.min(29, d); y++) h[y * W + x] = 1;
    if (x < 74) for (let y = Math.max(15, d); y < Math.min(46, d + 4); y++) h[y * W + x] = 8;
  }
  set(71, 74, 31, 46, 8);
  const row = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 }, (_, k) => y * W + x0 + k);
  const emitters: Emitter[] = [
    { cells: row(4, 7, 44), strength: 2.4, contamination: 0 },
    { cells: row(12, 15, 44), strength: 2.1, contamination: 0 },
    { cells: row(20, 30, 44), strength: 18, contamination: 0 },
    { cells: row(35, 36, 44), strength: 0.1, contamination: 0 },
    { cells: row(40, 43, 44), strength: 2.1, contamination: 1 },
    { cells: row(49, 52, 44), strength: 4, contamination: 0 },
    { cells: row(71, 74, 44), strength: 3, contamination: 0 },
  ];
  return { W, H, heights: h, emitters };
}

export function gallery(): Gallery {
  const { W, H, heights, emitters } = galleryMap();
  const settled = canonicalSettle({ W, H, floor: Float64Array.from(heights), dam: null, emitters });
  // the soil on it by the game's rules, as the generator's build takes it (D298)
  const { moisture: m, contamination: s } = gameSoil(W, H, heights, settled.depth, settled.contamination, [], settled.sat);
  console.log(`the gallery's water: ${settled.settled ? "settled" : "not settled"} after ${settled.ticks} ticks`);
  return { W, H, heights: [...heights], depth: [...settled.depth], contamination: [...settled.contamination], moisture: [...m], soil: [...s] };
}

