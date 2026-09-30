// Water under the new roofs: AN APPROXIMATION until the water engine lands (terrain3d's stacked-column
// simulation, 3D-a). The map's own water (its canonical settle) stays exactly where it was on every
// tile's open top, because Erode never changes a surface. A hollow opened beside water fills to the
// level of the water beside it, and passes that level on to the hollows it touches, capped by its
// roof. No pressure, no flow, no evaporation: the real game settles these columns by its own rules
// (GAME_RULES.md §3), which can differ (a sealed pocket pressurises; water through a passage can
// siphon; a hollow opening to the map's edge drains).

import { Terrain } from "./terrain";

/** A water surface in one air gap of a tile: the gap's floor and the water's level. */
export interface Pool {
  tile: number;
  floor: number;
  level: number;
  /** True for water under a roof (the approximation). */
  under: boolean;
}

/** Air gaps of a tile, bottom to top: [floor, ceiling) (the top one's ceiling is 99). */
function gaps(t: Terrain, i: number): [number, number][] {
  const r = t.runs(i);
  const out: [number, number][] = [];
  for (let k = 0; k < r.length; k += 2) {
    const top = r[k + 1];
    const next = k + 2 < r.length ? r[k + 2] : 99;
    if (next > top) out.push([top, next]);
  }
  return out;
}

export function waterPools(t: Terrain, depth: ArrayLike<number>): Pool[] {
  const { W, H, N } = t;
  const pools: Pool[] = [];
  // levels already known per (tile, gap floor)
  const level = new Map<number, number>();
  const key = (i: number, f: number) => f * N + i;
  const queue: [number, number, number][] = []; // tile, floor, level
  for (let i = 0; i < N; i++) {
    if (depth[i] <= 0.02) continue;
    const s = t.surface(i);
    level.set(key(i, s), s + depth[i]);
    pools.push({ tile: i, floor: s, level: s + depth[i], under: false });
    queue.push([i, s, s + depth[i]]);
  }
  // flood into roofed gaps beside water, highest levels first
  queue.sort((a, b) => b[2] - a[2]);
  const multi = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!t.plain(i)) multi[i] = 1;
  const hasCaves = multi.some((v) => v);
  if (!hasCaves) return pools;
  for (let h = 0; h < queue.length; h++) {
    const [i, f, L] = queue[h];
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!multi[j]) continue;
      const g = gaps(t, j);
      for (let k = 0; k < g.length - 1; k++) {
        // roofed gaps only (the top gap keeps the map's own water)
        const [gf, gc] = g[k];
        if (gf >= L - 0.02) continue;
        // the gaps must overlap below the water's level: water passes sideways between them
        const lo = Math.max(gf, f), hi = Math.min(gc, L);
        if (hi <= lo) continue;
        const nl = Math.min(L, gc);
        const was = level.get(key(j, gf));
        if (was !== undefined && was >= nl - 1e-6) continue;
        level.set(key(j, gf), nl);
        queue.push([j, gf, nl]);
      }
    }
  }
  for (const [k, L] of level) {
    const f = Math.floor(k / N), i = k - f * N;
    if (f !== t.surface(i)) pools.push({ tile: i, floor: f, level: L, under: true });
  }
  return pools;
}
