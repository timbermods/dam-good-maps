// A river that starts at the map's edge flows into the map, never off it (the forces-preview
// feedback's item 27, PLAN §20 D325). The game drains every map-edge tile but a source's own (their
// out-of-map sides are walls, sim/water.ts): water from a row of sources on the edge that reaches the
// edge tiles beside it pours straight off the map. Where a river's head is at the edge, the land
// beside and behind its sources at the boundary stands at least one level above the water: a natural
// lip, the edge tiles the head's water could reach raised, and the tiles just inside them eased up
// behind, never a wall along the whole edge. The water's only way is then inward along the river.
//
// One piece for every caller that puts a row of sources on an edge: the generator (an edge river's
// mouth, M9b), the forces (Carve's source row, Glaciate's meltwater, batch 1) and the Real places
// conversion when it resumes (D319). Pure and deterministic: integer heights in, integer heights out.

/** How far along the boundary from the row the lip may reach, in tiles: the head's water spreading
 *  farther along a low edge is a leak for the course check to judge (land/courses.ts). */
export const LIP_REACH = 16;

export interface EdgeLipRequest {
  /** The row's tiles (y·W + x), each on the map's boundary. */
  row: readonly number[];
  /** The water's surface at the head: the row's bed plus its depth. The lip stands a level above
   *  it: `floor(surface) + 1`, at least the bed plus two. */
  surface: number;
  /** Tiles never raised (a channel inland, another river's mouth, a player's locked ground). */
  keep?: Uint8Array | null;
  reach?: number;
}

export interface EdgeLipResult {
  /** The lip's level. */
  level: number;
  /** Tiles raised, and to what: the boundary tiles to `level`, the tiles just inside them to one
   *  below it. */
  raised: number[];
  /** Boundary tiles the head's water still reaches below the lip beyond `reach` (none: held). */
  open: number;
}

const onBoundary = (i: number, W: number, H: number): boolean => {
  const x = i % W;
  const y = (i - x) / W;
  return x === 0 || y === 0 || x === W - 1 || y === H - 1;
};

/** The step inward from a boundary tile (its neighbour one tile in; a corner's diagonal). */
function inward(i: number, W: number, H: number): number {
  const x = i % W;
  const y = (i - x) / W;
  const dx = x === 0 ? 1 : x === W - 1 ? -1 : 0;
  const dy = y === 0 ? 1 : y === H - 1 ? -1 : 0;
  return (y + dy) * W + (x + dx);
}

/**
 * Raises the lip round an edge row of sources in `h` (in place). The head's water spreads from the
 * row over ground lower than the lip, within `reach` tiles of the row; every boundary tile it would
 * reach (not the row's own) is raised to the lip, and the tile just inside each to one below it where
 * lower, so the lip rises from the land instead of standing as a wall. Returns what it raised.
 */
export function edgeLip(h: Uint8Array, W: number, H: number, req: EdgeLipRequest): EdgeLipResult {
  const N = W * H;
  const reach = req.reach ?? LIP_REACH;
  let bed = Infinity;
  for (const i of req.row) bed = Math.min(bed, h[i]);
  const level = Math.max(Math.floor(req.surface) + 1, bed + 2);
  const row = new Set(req.row);
  const cx: number[] = req.row.map((i) => i % W);
  const cy: number[] = req.row.map((i) => Math.floor(i / W));
  const near = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < cx.length; k++) if (Math.max(Math.abs(x - cx[k]), Math.abs(y - cy[k])) <= reach) return true;
    return false;
  };
  // where the head's water goes: 4-connected ground under the lip, from the row
  const seen = new Uint8Array(N);
  const q: number[] = [];
  for (const i of req.row) {
    seen[i] = 1;
    q.push(i);
  }
  const edges: number[] = [];
  let open = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (seen[n] || h[n] >= level) continue;
      seen[n] = 1;
      if (!near(n)) {
        if (onBoundary(n, W, H)) open++;
        continue;
      }
      if (onBoundary(n, W, H) && !row.has(n)) {
        // (a boundary tile the lip takes stops the water there; it is raised below)
        edges.push(n);
        continue;
      }
      q.push(n);
    }
  }
  const raised: number[] = [];
  for (const i of edges) {
    if (req.keep?.[i]) continue;
    if (h[i] < level) {
      h[i] = level;
      raised.push(i);
    }
    const j = inward(i, W, H);
    if (!row.has(j) && !req.keep?.[j] && h[j] < level - 1) {
      h[j] = level - 1;
      raised.push(j);
    }
  }
  return { level, raised, open };
}

/** An edge row's tiles (y·W + x) from its positions along the edge (raster/terrain.ts `mouthRowAt`). */
export function rowTiles(edge: "west" | "east" | "south" | "north", along: readonly number[], W: number, H: number): number[] {
  return along.map((a) => (edge === "west" ? a * W : edge === "east" ? a * W + W - 1 : edge === "south" ? a : (H - 1) * W + a));
}
