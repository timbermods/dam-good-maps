// Step runs (planning's look round, item (b), 2026-11-13): a flight of equal one-tile steps in a straight line reads as
// a staircase drawn with a ruler. The measure, exactly:
//
// - A line runs along a row, a column or one of the two diagonals. Along it, a run is `STEP_RUN` or more consecutive
//   tiles, each standing exactly one level above its predecessor, or each exactly one below (one direction the whole
//   run): one-tile treads with one-level risers.
// - Every step's edge runs straight across the line: on one side of the line or the other, the tile next across from
//   each of the step's two tiles stands at that tile's level, so the riser goes on straight across the line for two
//   tiles at least. "Across" is perpendicular to the line: (0, ±1) on a row, (±1, 0) on a column, ±(1, -1) on the
//   diagonal (1, 1) and ±(1, 1) on the diagonal (1, -1). A line that climbs a slope whose contours wander, or that runs
//   along the contours slantwise, does not count.
// - Every tile involved (the run's and those across) is dry (wet: settled water `wetOf` reads, 0.1 deep or more) and
//   on the map.
// - A run is maximal: it is counted once, at its full length; a flight wider than one line is a run on each line.
//
// Stair edges (the same round, 2026-11-14: Highlands 1's long diagonal stair, Canyon 3's square staircases): a level's
// edge that runs at 45° in even one-tile steps reads as drawn with a ruler as a straight one does. Exactly:
//
// - Along a diagonal, `STAIR_EDGE` or more consecutive tiles of one level v, and beside each, one tile along the row
//   (the same way for all), a tile of one other level u: the two diagonal lines of tiles meet in a zigzag edge of unit
//   steps, as long as the run. Any drop counts (a cliff's zigzag reads the same); every tile is dry and on the map.
// - Counted once an edge, from its lower side (v < u), at its full length.
//
// Integers throughout. The generator's tests read it (tests/contract/stepRuns.test.ts).

/** A run counts from this many tiles (planning: five or more). */
export const STEP_RUN = 5;

export interface StepRun {
  /** Tiles in the run. */
  length: number;
  /** Its lower end. */
  x: number;
  y: number;
  /** The direction from the lower end up the run: a unit step along a row, a column or a diagonal. */
  dx: number;
  dy: number;
}

export interface StepRuns {
  /** Runs of `min` (STEP_RUN) tiles or more. */
  count: number;
  /** The longest run's length in tiles (0 when there is none). */
  longest: number;
  /** Every run, longest first (ties by place). */
  runs: StepRun[];
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Step runs of a map from its top surface `h` (levels) and its settled water (`wet`: nonzero on a wet tile; null for
 *  none). */
export function stepRuns(h: ArrayLike<number>, wet: ArrayLike<number> | null, W: number, H: number, min = STEP_RUN): StepRuns {
  const runs: StepRun[] = [];
  // the level of a dry tile on the map, else -1 (levels are never negative)
  const lv = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const i = y * W + x;
    return wet && wet[i] ? -1 : h[i];
  };
  for (const [dx, dy] of DIRS) {
    // across the line
    const px = dy;
    const py = -dx;
    // the step from (x, y) to (x + dx, y + dy): its rise (±1) when it is a one-level step whose edge runs straight
    // across, else 0
    const step = (x: number, y: number): number => {
      const a = lv(x, y);
      const b = lv(x + dx, y + dy);
      if (a < 0 || b < 0) return 0;
      const d = b - a;
      if (d !== 1 && d !== -1) return 0;
      if (lv(x + px, y + py) === a && lv(x + dx + px, y + dy + py) === b) return d;
      if (lv(x - px, y - py) === a && lv(x + dx - px, y + dy - py) === b) return d;
      return 0;
    };
    for (let y0 = 0; y0 < H; y0++)
      for (let x0 = 0; x0 < W; x0++) {
        // each line starts at the tile whose predecessor along it lies off the map
        const qx = x0 - dx;
        const qy = y0 - dy;
        if (qx >= 0 && qy >= 0 && qx < W && qy < H) continue;
        // the current run: its first tile, its steps so far and their rise
        let sx = x0;
        let sy = y0;
        let n = 0;
        let sgn = 0;
        const close = () => {
          if (n + 1 >= min) {
            const up = sgn > 0;
            runs.push({ length: n + 1, x: up ? sx : sx + n * dx, y: up ? sy : sy + n * dy, dx: up ? dx : -dx, dy: up ? dy : -dy });
          }
        };
        for (let x = x0, y = y0; x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H; x += dx, y += dy) {
          const d = step(x, y);
          if (d !== 0 && (n === 0 || d === sgn)) {
            n++;
            sgn = d;
            continue;
          }
          close();
          // a step the other way begins a run of its own from this tile
          sx = x;
          sy = y;
          n = d !== 0 ? 1 : 0;
          sgn = d;
          if (n === 0) {
            sx = x + dx;
            sy = y + dy;
          }
        }
        close();
      }
  }
  runs.sort((a, b) => b.length - a.length || a.y - b.y || a.x - b.x || a.dy - b.dy || a.dx - b.dx);
  return { count: runs.length, longest: runs.length ? runs[0].length : 0, runs };
}

/** A stair edge counts from this many tiles along the diagonal (about 8.5 tiles long, as a straight edge over 8 sides
 *  is cut, D518). */
export const STAIR_EDGE = 6;

export interface StairEdge {
  /** Tiles along the diagonal on its lower side. */
  length: number;
  /** The lower side's first tile, the way along the diagonal, and the drop up to the higher side. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  rise: number;
}

/** Stair edges of a map (see the file's header), longest first. */
export function stairEdges(h: ArrayLike<number>, wet: ArrayLike<number> | null, W: number, H: number, min = STAIR_EDGE): { count: number; longest: number; edges: StairEdge[] } {
  const edges: StairEdge[] = [];
  const lv = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const i = y * W + x;
    return wet && wet[i] ? -1 : h[i];
  };
  for (const [dx, dy] of DIAGONALS)
    for (let y0 = 0; y0 < H; y0++)
      for (let x0 = 0; x0 < W; x0++) {
        const v = lv(x0, y0);
        const u = lv(x0 + dx, y0);
        if (v < 0 || u <= v) continue;
        // (only from the edge's first tile)
        if (lv(x0 - dx, y0 - dy) === v && lv(x0, y0 - dy) === u) continue;
        let n = 0;
        while (lv(x0 + n * dx, y0 + n * dy) === v && lv(x0 + (n + 1) * dx, y0 + n * dy) === u) n++;
        if (n >= min) edges.push({ length: n, x: x0, y: y0, dx, dy, rise: u - v });
      }
  edges.sort((a, b) => b.length - a.length || a.y - b.y || a.x - b.x || a.dy - b.dy || a.dx - b.dx);
  return { count: edges.length, longest: edges.length ? edges[0].length : 0, edges };
}

const DIAGONALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
