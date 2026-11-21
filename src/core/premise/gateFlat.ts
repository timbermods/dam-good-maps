// The Gate's dry side, its flat ground (docs/PREMISES.md §5.1, "No knobs, no pits"; planning's look verdict of
// 2026-11-15 on round 5: 128² seed 5's playa carried lone blocks standing two levels over it with sheer sides, read as
// dropped cubes, and one-tile pits). A knob is a rise of fewer than `KNOB.area` tiles standing `KNOB.over` levels or
// more over the ground round it; a pit a tile lower than all four of its neighbours. Both are read on the basin's side
// of the range, off the range's own ground, the water, the beds, the badwater's niche and the rise that carries the
// ruins; the mend takes a knob of four tiles or fewer away into the flat, lowers a larger one to a level over the flat or
// gives it an uneven apron a level over the flat, and fills a pit to its lowest neighbour.

import { fbm } from "../math/noise";
import { hash32 } from "../math/hash";

/** A knob: a rise under `area` tiles standing `over` levels or more over the ground round it. A knob of `goneUpTo`
 *  tiles or fewer is taken away, set to the flat round it (planning's look verdict of 2026-11-15: lowered to a level
 *  over the flat, a 2 × 2 still read as a dropped cube); a larger one is lowered to a level over the flat or keeps its
 *  height and gains an apron (by the seed, `apronShare` of them an apron): a step of one level over the flat, `apron`
 *  tiles wide by a noise of `apronCell` tiles, so its outline wanders. */
export const KNOB = { area: 12, over: 2, goneUpTo: 4, apronShare: 0.5, apron: [1, 3], apronCell: 3 } as const;

export interface Knob {
  /** Its tiles. */
  tiles: number[];
  /** The highest ground round it (every tile round it stands at this level or under). */
  base: number;
  /** Its highest tile's level. */
  top: number;
}

const near4 = (i: number, W: number, N: number): number[] => {
  const x = i % W;
  return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < N);
};

/** The knobs among the tiles `own` marks: each piece of ground standing over the level round it (a joined set of tiles
 *  higher than `base`, every tile beside it at `base` or under and one at `base`), under `KNOB.area` tiles, whose top
 *  stands `KNOB.over` or more over `base`, all of it on `own`. A knob within another is the larger's. */
export function flatKnobs(h: ArrayLike<number>, W: number, H: number, own: ArrayLike<number>, area: number = KNOB.area, over: number = KNOB.over): Knob[] {
  const N = W * H;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < N; i++) {
    lo = Math.min(lo, h[i]);
    hi = Math.max(hi, h[i]);
  }
  const taken = new Uint8Array(N);
  const seen = new Int32Array(N).fill(-1);
  const out: Knob[] = [];
  for (let b = lo; b <= hi - over; b++) {
    for (let s = 0; s < N; s++) {
      if (h[s] <= b || seen[s] === b || !own[s]) continue;
      // (the joined ground over `b` from here; a piece of `KNOB.area` or more is no knob at this level)
      const tiles = [s];
      seen[s] = b;
      let base = -Infinity;
      let top = h[s];
      let ok = true;
      for (let k = 0; k < tiles.length; k++) {
        for (const j of near4(tiles[k], W, N)) {
          if (h[j] > b) {
            if (seen[j] !== b) {
              seen[j] = b;
              tiles.push(j);
              top = Math.max(top, h[j]);
            }
          } else base = Math.max(base, h[j]);
        }
      }
      if (tiles.length >= area || base !== b || top - b < over) continue;
      for (const i of tiles) if (!own[i] || taken[i]) ok = false;
      if (!ok) continue;
      for (const i of tiles) taken[i] = 1;
      out.push({ tiles, base: b, top });
    }
  }
  return out;
}

/** The one-tile pits among the tiles `own` marks: a tile lower than all four of its neighbours (none on the map's edge). */
export function flatPits(h: ArrayLike<number>, W: number, H: number, own: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (own[i] && h[i - 1] > h[i] && h[i + 1] > h[i] && h[i - W] > h[i] && h[i + W] > h[i]) out.push(i);
    }
  return out;
}

/** Mends the flat (`own`): each knob of `KNOB.goneUpTo` tiles or fewer set to the ground round it; each larger one
 *  lowered to a level over that ground, or, by the seed, kept with an apron (`KNOB`): a step a level over that ground, its width wandering 1 to 3 tiles, on `own`'s tiles at the
 *  base's level only (a knob three levels tall or more stands three over the flat, on two such steps); then each pit
 *  filled to its lowest neighbour. Passes until neither is left (at most four). How many knobs were taken away, how many
 *  lowered, how many given an apron, and how many pits filled. */
export function mendFlat(h: Uint8Array, W: number, H: number, own: ArrayLike<number>, seed: number): { gone: number; lowered: number; aproned: number; filled: number } {
  const N = W * H;
  const done = { gone: 0, lowered: 0, aproned: 0, filled: 0 };
  const [w0, w1] = KNOB.apron;
  for (let pass = 0; pass < 4; pass++) {
    const knobs = flatKnobs(h, W, H, own);
    for (const k of knobs) {
      const at = Math.min(...k.tiles);
      const lower = () => {
        for (const i of k.tiles) h[i] = Math.min(h[i], k.base + 1);
        done.lowered++;
      };
      if (k.tiles.length <= KNOB.goneUpTo) {
        for (const i of k.tiles) h[i] = k.base;
        done.gone++;
        continue;
      }
      if (hash32(seed, at, "apron") / 2 ** 32 >= KNOB.apronShare) {
        lower();
        continue;
      }
      // (each step grown from the knob and the steps over it out over the flat at the knob's base, each tile's distance
      // from them against its own width by a noise, so its outline wanders and is no ring; where the flat round it
      // leaves no room for one, `KNOB.area` tiles with the knob, it is lowered instead)
      const was = new Map<number, number>(k.tiles.map((i) => [i, h[i]]));
      const top = Math.min(k.top, k.base + 3);
      for (const i of k.tiles) h[i] = Math.min(h[i], top);
      const held = new Set<number>(k.tiles);
      for (let level = top - 1; level > k.base; level--) {
        const dist = new Map<number, number>([...held].map((i) => [i, 0]));
        const front = [...held];
        for (let q = 0; q < front.length; q++) {
          const i = front[q];
          const d = dist.get(i)!;
          if (d >= w1) continue;
          for (const j of near4(i, W, N)) {
            if (dist.has(j) || !own[j] || h[j] !== k.base) continue;
            const x = j % W;
            const y = (j - x) / W;
            // (the noise spread over the whole width: value noise keeps near its middle, and read as it is, it laid
            // an apron two wide all round, a ring)
            const width = w0 + (w1 - w0) * Math.max(0, Math.min(1, 0.5 + fbm(seed + 17 + level, x, y, KNOB.apronCell, 2)));
            if (d + 1 > width + 0.5) continue;
            dist.set(j, d + 1);
            front.push(j);
            if (!was.has(j)) was.set(j, h[j]);
            h[j] = level;
            held.add(j);
          }
        }
        // (a tile of the flat the step closes round on three sides joins it: left, it read as a notch, a pit open on
        // one side)
        for (let again = 0; again < 2; again++)
          for (const i of [...held])
            for (const j of near4(i, W, N)) {
              if (held.has(j) || !own[j] || h[j] !== k.base) continue;
              if (near4(j, W, N).filter((n) => h[n] >= level).length < 3) continue;
              if (!was.has(j)) was.set(j, h[j]);
              h[j] = level;
              held.add(j);
            }
      }
      if (held.size < KNOB.area) {
        for (const [i, v] of was) h[i] = v;
        lower();
        continue;
      }
      done.aproned++;
    }
    const pits = flatPits(h, W, H, own);
    for (const i of pits) h[i] = Math.min(h[i - 1], h[i + 1], h[i - W], h[i + W]);
    done.filled += pits.length;
    if (!knobs.length && !pits.length) break;
  }
  return done;
}
