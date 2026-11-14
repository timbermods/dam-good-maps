// Basins where the real water lies (planning's ruling on #236, D(new), with D271 and D311): under the game's water
// rules a place's water spreads as thin films over the flat terraces of its 16 levels, and the films dry where the
// port's rules kept them. Every body of `BASIN_TILES` tiles or more that the port's build showed and the game's rules
// lose, and every film above floor 0 the game's build shows (placeWater.ts `films`), is cut where the place's real
// water lies (the observed-water mask, tools/places-real-water.ts): the body's real-water tiles one level down inside
// its flat's own rim, so the place's own rivers fill them. Where no real water lies, a lost body goes and a film gets a
// bed (`cutBed`). Nothing else is moved: no height mapping, scale or land swapped (D245).

import { compareWater, bodies, films, WET } from "./placeWater";

/** A body this big or bigger that the game's rules lose is cut where real water lies (planning: 300 tiles). */
export const BASIN_TILES = 300;
/** A lost body lies over real water when this many of its tiles do. */
export const BASIN_REAL_TILES = 30;

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Basin {
  /** "lost": a body the port's build showed and the game's rules lose; "film": a film above floor 0 the game's build shows. */
  kind: "lost" | "film";
  /** The body: its size, where it starts, the real-water tiles under it. */
  size: number;
  at: [number, number];
  real: number;
  /** The tiles cut one level down (0 where no real water lies: it goes). */
  cut: number;
  level: number;
}

/**
 * The heights with a basin cut under every lost body and film over real water. `port` and `game` are the place's
 * settled depths under each rules on the same heights; `real` marks the observed water. Under a body with
 * `BASIN_REAL_TILES` real-water tiles or more, each real-water tile whose four neighbours all stand at its level or
 * higher (the flat's own rim stays) goes one level down; floor 0 has no level below it.
 */
export function cutBasins(heights: Uint8Array, W: number, H: number, port: ArrayLike<number>, game: ArrayLike<number>, floor: ArrayLike<number>, real: Uint8Array): { heights: Uint8Array; basins: Basin[] } {
  const N = W * H;
  const out = Uint8Array.from(heights);
  const basins: Basin[] = [];
  const lost = compareWater(port, game, W, H).lost.filter((l) => l.size >= BASIN_TILES);
  const starts = new Set(lost.map((l) => l.at[1] * W + l.at[0]));
  const candidates: { kind: Basin["kind"]; body: Int32Array }[] = [
    ...bodies(port, W, H).filter((b) => starts.has(b[0])).map((body) => ({ kind: "lost" as const, body })),
    ...films(game, floor, W, H).filter((f) => f.floor0 * 2 <= f.tiles.length).map((f) => ({ kind: "film" as const, body: f.tiles })),
  ];
  for (const { kind, body } of candidates) {
    const inBody = new Uint8Array(N);
    let realTiles = 0;
    for (const i of body) {
      inBody[i] = 1;
      if (real[i]) realTiles++;
    }
    const basin: Basin = { kind, size: body.length, at: [body[0] % W, Math.floor(body[0] / W)], real: realTiles, cut: 0, level: -1 };
    basins.push(basin);
    if (realTiles < BASIN_REAL_TILES) continue;
    // where the real water lies under the body, the ground one level down inside its flat's rim (a tile whose four
    // neighbours all stand at its level or higher), so the lake or the river takes the real water's own shape
    for (const i of body) {
      const L = heights[i];
      if (!real[i] || L === 0) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
      if (N4.every(([dx, dy]) => heights[(y + dy) * W + x + dx] >= L)) {
        out[i] = L - 1;
        basin.cut++;
        basin.level = Math.max(basin.level, L - 1);
      }
    }
  }
  return { heights: out, basins };
}

/** The real-water mask's tiles as a per-tile mark. */
export function realMask(W: number, H: number, tiles: readonly number[]): Uint8Array {
  const m = new Uint8Array(W * H);
  for (const i of tiles) m[i] = 1;
  return m;
}

/** Of `depth`'s floor-0 sheet (wet tiles `≤ 0.11` deep on floor 0 in bodies of `FILM_TILES` or more, held by the
 *  edge's spill, D303), the tiles over real water and over real dry land. */
export function floor0Sheet(depth: ArrayLike<number>, floor: ArrayLike<number>, W: number, H: number, real: Uint8Array, thin: number, least: number): { tiles: number; real: number; dry: number } {
  let tiles = 0;
  let r = 0;
  for (const b of bodies(depth, W, H)) {
    if (b.length < least) continue;
    for (const i of b)
      if (floor[i] === 0 && depth[i] > WET && depth[i] <= thin) {
        tiles++;
        if (real[i]) r++;
      }
  }
  return { tiles, real: r, dry: tiles - r };
}

/**
 * A bed through a film above floor 0 that no real water lies under (planning's ruling: a fed film on a terrace gets a
 * bed): from each place its water comes in (a source in it, or water on higher ground beside it), the cheapest way through the film's tiles to where its water leaves it (the
 * map's edge, or a tile beside lower ground outside it), the ground along it one level down. The way follows the land
 * (each step up costs more, and a little by a hash of the tile so no line is ruled). `avoidWet`: not out onto ground
 * another water already runs on (where the bed's water would join a river another source feeds). Cuts `heights` in place and returns
 * the tiles cut (none when the film has no source or no way out: its water stands, and the caller reports it).
 */
export function cutBed(heights: Uint8Array, W: number, H: number, film: Int32Array, depth: ArrayLike<number>, sources: readonly [number, number, number][], seed: number, avoidWet = false): number[] {
  const N = W * H;
  const inFilm = new Uint8Array(N);
  for (const i of film) inFilm[i] = 1;
  // where its water leaves the flat it stands on: the map's edge (above floor 0, where the edge drains), or a tile beside
  // lower ground outside the film
  const isExit = (i: number): boolean => {
    const x = i % W;
    const y = (i - x) / W;
    if (heights[i] > 0 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) return true;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!inFilm[j] && heights[j] < heights[i] && !(avoidWet && depth[j] > 0)) return true;
    }
    return false;
  };
  // where its water comes in: a source in it, or a tile beside water on higher ground outside it (a stream thinner than
  // the wet line still feeds it)
  const heads = sources.map(([x, y]) => y * W + x).filter((i) => inFilm[i]);
  for (const i of film) {
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!inFilm[j] && depth[j] > 0 && heights[j] > heights[i]) {
        heads.push(i);
        break;
      }
    }
  }
  if (!heads.length) return [];
  const noise = (i: number) => (((Math.imul(i ^ seed, 2654435761) >>> 0) % 1000) / 1000) * 0.6;
  const cut = new Set<number>();
  for (const head of heads) {
    // Dijkstra from the head to the nearest way out
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[head] = 0;
    const open: number[] = [head];
    let end = -1;
    while (open.length) {
      let k = 0;
      for (let q = 1; q < open.length; q++) if (dist[open[q]] < dist[open[k]]) k = q;
      const i = open[k];
      open[k] = open[open.length - 1];
      open.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (isExit(i)) {
        end = i;
        break;
      }
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        // through the film, or on across the dry flat it stands on (the same level), to the flat's way out
        if (done[j] || !(inFilm[j] || heights[j] === heights[i])) continue;
        const d = dist[i] + (inFilm[j] ? 1 : 2) + Math.max(0, heights[j] - heights[i]) * 4 + noise(j);
        if (d < dist[j]) {
          dist[j] = d;
          prev[j] = i;
          open.push(j);
        }
      }
    }
    if (end < 0) continue;
    const path: number[] = [];
    for (let i = end; i >= 0; i = prev[i]) path.push(i);
    path.reverse();
    for (const i of path) if (heights[i] > 0) cut.add(i);
  }
  // the bed one level down
  for (const i of cut) heights[i] -= 1;
  return [...cut];
}
