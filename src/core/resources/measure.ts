// The trees a map holds, and how low a badwater source lies (the share of the tiles 4–6 tiles (Chebyshev)
// from its 3×3's centre whose top stands above the source's level: near 1 in a hollow or a side valley,
// near 0 on a rise). The measures of a whole map's trees, bushes, ruins, mine sites and badwater sources
// are a tool's, in tools/lib/resources.ts.

export const MAP_TREES = ["Pine", "Birch", "Oak", "Succulent"] as const;
export type MapTree = (typeof MAP_TREES)[number];

/** The share of the tiles 4–6 tiles (Chebyshev) from (cx, cy) whose top stands above `level`. */
export function lownessAt(heights: ArrayLike<number>, W: number, H: number, cx: number, cy: number, level: number): number {
  let above = 0;
  let all = 0;
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      all++;
      if (heights[y * W + x] > level) above++;
    }
  return all ? Math.round((above / all) * 1000) / 1000 : 0;
}
