// Empty land (planning on #236, 2026-11-12): how much of a map's land is bare slab, level dry ground with nothing on or
// in it. One advisory row beside ruled land, `terrain.empty_land`, in the one gate every map passes (checks.ts), for
// every path. It gives the land's rounds a number to drive down and says what the game's own maps do with their dry
// land; it has no limit until planning calibrates it on the game's built-in maps.
//
// - Something is on or in a tile when: water stands on it (the settled water, depth 0.1+), its ground is moist (green)
//   or contaminated (the checks' soil), or an object covers it or a tile next to it (8 ways: any object's footprint,
//   trees, bushes, ruins, rocks, sources, slopes, the start; so a stand of trees a few tiles apart covers its ground,
//   while a lone tree takes out only its own square).
// - A slab: tiles with nothing on or in them, at one level, joined 4-ways (a step bounds a slab: the ground above and
//   below it are two), `EMPTY_MIN`+ tiles.
// - The number: the slabs' tiles as a share of the map's land (its tiles not under water), and the largest slab.
// Integers throughout but the share (one division).

import { footprintTiles, type Placement } from "../format/footprints";

/** A slab: this many tiles, at least (a plate of about 6 × 6). */
export const EMPTY_MIN = 36;

export interface EmptyLand {
  /** The map's land: its tiles not under water. */
  land: number;
  /** The slabs' tiles. */
  empty: number;
  /** `empty` over `land`. */
  share: number;
  /** The largest slab: its tiles and its middle (null when there is none). */
  largest: { tiles: number; x: number; y: number } | null;
}

/** The tiles objects cover (1), from their placements. */
export function occupiedBy(objects: Iterable<Placement>, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  for (const o of objects) {
    for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 1;
  }
  return out;
}

/** Empty land of a map from its top surface `h`, its wet tiles, its moist or contaminated ground (`soil`: 1 where the
 *  ground is moist or contaminated) and the tiles objects cover. */
export function emptyLand(h: ArrayLike<number>, wet: ArrayLike<number>, soil: ArrayLike<number>, occupied: ArrayLike<number>, W: number, H: number): EmptyLand {
  const N = W * H;
  // free: nothing on or in the tile (an object on it or next to it counts)
  const free = new Uint8Array(N);
  let land = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (wet[i]) continue;
      land++;
      if (soil[i]) continue;
      let near = 0;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && occupied[yy * W + xx]) {
            near = 1;
            break;
          }
        }
      }
      if (!near) free[i] = 1;
    }
  }
  // slabs: free tiles at one level joined 4-ways
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  let empty = 0;
  let largest: EmptyLand["largest"] = null;
  for (let s = 0; s < N; s++) {
    if (!free[s] || seen[s]) continue;
    const level = h[s];
    let tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    let sx = 0;
    let sy = 0;
    for (let head = 0; head < tail; head++) {
      const i = queue[head];
      const x = i % W;
      const y = (i - x) / W;
      sx += x;
      sy += y;
      if (x > 0 && free[i - 1] && !seen[i - 1] && h[i - 1] === level) (seen[i - 1] = 1), (queue[tail++] = i - 1);
      if (x + 1 < W && free[i + 1] && !seen[i + 1] && h[i + 1] === level) (seen[i + 1] = 1), (queue[tail++] = i + 1);
      if (y > 0 && free[i - W] && !seen[i - W] && h[i - W] === level) (seen[i - W] = 1), (queue[tail++] = i - W);
      if (y + 1 < H && free[i + W] && !seen[i + W] && h[i + W] === level) (seen[i + W] = 1), (queue[tail++] = i + W);
    }
    if (tail < EMPTY_MIN) continue;
    empty += tail;
    if (!largest || tail > largest.tiles) largest = { tiles: tail, x: Math.round(sx / tail), y: Math.round(sy / tail) };
  }
  return { land, empty, share: land ? empty / land : 0, largest };
}

/** The row's one-line message. */
export function emptyLandMessage(r: EmptyLand): string {
  const pct = `${Math.round(r.share * 100)} %`;
  if (!r.largest) return "No bare slab: every stretch of level dry land has something on it";
  return `${pct} of the land is bare slab (level, dry, with nothing on it); the largest is ${r.largest.tiles} tiles at X ${r.largest.x} · Y ${r.largest.y}`;
}
