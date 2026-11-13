// The bench-width floor (from the bench-floor work for #956's grade; PREMISES §2.2 stage 2): no level band on shaped
// land narrower than `THIN` tiles across its fall line. A stack of ledges that thin reads as hatching from the
// game's widest view (stair treads, contour bands); broad benches between bold steps read as land. Integer only
// (D366). The grade (land/levels.ts) and a premise's relief (premise/raster/relief.ts) both end with it.

import { ledgeAt, THIN } from "../analysis/ground";
import { fbm } from "../math/noise";

/** The bend (D518): how far the land is read off its own tile, at most, and over how many tiles the push turns. */
export const BEND = { reach: 3, cell: 8 } as const;

/** The benches bent (D518): the bench-width floor reads the land along its rows and columns, so the benches it widens
 *  meet in straight sides and square corners (rectangles from the game's widest view); the land is read back through a
 *  slow push of up to `BEND.reach` tiles, so their sides bend as a land's contours do. Each tile where `where` is set
 *  takes the level of the tile the push reads, when that one is set in `where` too (the water's ground and the start's
 *  are never read nor moved); in place, deterministic for `seed`. */
export function bendLevels(h: Uint8Array, W: number, H: number, where: Uint8Array, seed: number): void {
  const src = h.slice();
  const sy = (seed ^ 0x5bd1e995) >>> 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!where[i]) continue;
      const qx = Math.round(x + BEND.reach * fbm(seed, x, y, BEND.cell, 2));
      const qy = Math.round(y + BEND.reach * fbm(sy, x, y, BEND.cell, 2));
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      const j = qy * W + qx;
      if (where[j]) h[i] = src[j];
    }
}

/** The bench-width floor (#956): no level band on graded land narrower than `THIN` tiles across its fall line,
 *  since a stack of ledges that thin reads as hatching from the game's widest view, where broad benches between
 *  bold steps read as land. A ridgelet (a level standing over the land on both sides, that narrow) falls to the
 *  higher side; a flank's run of thin treads becomes one-level benches `THIN` tiles wide or more and one cliff
 *  taking the rest of its fall (`cliffs`); a thin tread left over, above broad land, merges into it. Integer, in
 *  place; only the tiles where `where` is set (all for null) change. */
export function widenBenches(h: Uint8Array, W: number, H: number, where: Uint8Array | null = null): void {
  const dry = () => false;
  const ends = [0, 0, 0];
  // the ridgelets, and with `treads` the thin treads above land that is no thin ledge itself
  const pass = (treads: boolean): void => {
    const src = h.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (where && !where[i]) continue;
        let to = -1;
        for (let d = 0; d < 2; d++) {
          const kind = ledgeAt(src, W, H, x, y, 1 - d, d, dry, ends);
          if (kind === 2) to = Math.max(to, ends[1]);
          else if (kind === 1 && treads && !ledgeAt(src, W, H, ends[2] % W, Math.floor(ends[2] / W), 1 - d, d, dry)) to = Math.max(to, ends[0]);
        }
        if (to >= 0) h[i] = to;
      }
  };
  pass(false);
  cliffs(h, W, H, where);
  pass(false);
  pass(true);
  pass(true);
  pass(false);
}

/** A flank's run of thin treads, between the broad land below and above it, as one-level benches `THIN` tiles
 *  wide or more and one cliff taking the rest of its fall: in the run's middle, or at its foot on the low land. */
function cliffs(h: Uint8Array, W: number, H: number, where: Uint8Array | null): void {
  const N = W * H;
  const dry = () => false;
  const src = h.slice();
  // the low land (the lowest fifth of the map, where the seas, lakes and valley floors lie)
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < N; i++) hist[src[i]]++;
  let low = 0;
  for (let acc = 0; low < 255 && (acc += hist[low]) < 0.2 * N; low++);
  const kind = [new Uint8Array(N), new Uint8Array(N)];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let d = 0; d < 2; d++) kind[d][y * W + x] = ledgeAt(src, W, H, x, y, 1 - d, d, dry);
  // each tile's choice along each direction, the shorter crossing winning
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (where && !where[i]) continue;
      let best = -1;
      let bestS = 1e9;
      for (let d = 0; d < 2; d++) {
        if (kind[d][i] !== 1) continue;
        const dx = 1 - d;
        const dy = d;
        // the side the land falls to
        const v = src[i];
        let xs = x;
        let ys = y;
        while (xs - dx >= 0 && ys - dy >= 0 && src[(ys - dy) * W + xs - dx] === v) { xs -= dx; ys -= dy; }
        const sgn = src[(ys - dy) * W + xs - dx] < v ? -1 : 1;
        const walk = (s: number): [number, number] => {
          let cx = x;
          let cy = y;
          let prev = v;
          for (let n = 1; n <= 96; n++) {
            cx += s * dx;
            cy += s * dy;
            if (cx < 0 || cy < 0 || cx >= W || cy >= H) return [prev, n];
            const j = cy * W + cx;
            const lv = src[j];
            if (s === sgn ? lv > prev : lv < prev) return [prev, n];
            if (kind[d][j] !== 1) return [lv, n];
            prev = lv;
          }
          return [prev, 96];
        };
        const [lo, dLo] = walk(sgn);
        const [hi, dHi] = walk(-sgn);
        const S = dLo + dHi - 1;
        if (S >= bestS) continue;
        const m = Math.min(Math.floor(S / THIN), Math.max(0, hi - lo - 1));
        const p = dLo - 1;
        let to: number;
        // (on the low land the cliff stands at the run's foot, so no tread sinks toward the water there: the
        // grade never floods a shore; elsewhere it stands in the run's middle, the land neither raised nor lowered)
        const foot = lo <= low;
        if (m === 0) to = foot || 2 * p >= S ? hi : lo;
        else {
          const j = Math.floor((p * m) / S);
          to = !foot && j < Math.ceil(m / 2) ? lo + 1 + j : hi - (m - j);
        }
        best = to;
        bestS = S;
      }
      if (best >= 0) h[i] = best;
    }
}
