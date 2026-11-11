// The Gate's lake shore read on the grid (PREMISES §5.1, shape round): a straight run is shore tiles along one row or
// column all facing the same way onto dry land, measured end to end, tile centre to tile centre, as `water.meander`
// reads a course. `lake.shore` holds Wall Lake to `SHORE_STRAIGHT`; the plan nicks its arms where its outline by
// stage 1's rule would break it.

/** The longest straight shore run, in tiles end to end. */
export const SHORE_STRAIGHT = 6;

/** A straight run: its last tile, its length end to end, the way its tiles face. */
export interface ShoreRun {
  x: number;
  y: number;
  len: number;
  nx: number;
  ny: number;
}

/** Every run of shore longer than `SHORE_STRAIGHT` in the box: `ours` is the lake's tile, `wet` a tile of other water
 *  (no shore faces it), `aside` a tile whose shore is a work's site. */
export function straightShores(
  W: number,
  H: number,
  box: [number, number, number, number],
  ours: (i: number) => boolean,
  wet: (i: number) => boolean,
  aside: (i: number) => boolean,
): ShoreRun[] {
  const [x0, y0, x1, y1] = box;
  const out: ShoreRun[] = [];
  for (const [nx, ny] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const shore = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const i = y * W + x;
      const xx = x + nx;
      const yy = y + ny;
      if (!ours(i) || xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
      const j = yy * W + xx;
      return !ours(j) && !wet(j) && !aside(i);
    };
    // (along a row for a run facing up or down, along a column for one facing left or right)
    const along = ny !== 0;
    const [a0, a1, b0, b1] = along ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
    for (let a = a0; a <= a1; a++) {
      let run = 0;
      for (let b = b0; b <= b1 + 1; b++) {
        const [x, y] = along ? [b, a] : [a, b];
        if (b <= b1 && shore(x, y)) {
          run++;
          continue;
        }
        if (run - 1 > SHORE_STRAIGHT) {
          const [ex, ey] = along ? [b - 1, a] : [a, b - 1];
          out.push({ x: ex, y: ey, len: run - 1, nx, ny });
        }
        run = 0;
      }
    }
  }
  return out;
}
