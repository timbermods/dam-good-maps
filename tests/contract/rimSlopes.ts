// The slopes a ramped Flatten laid along its own rim (D270), as the editor planned them before D322
// retired ramped edges. The planner is gone from the product; a saved ramped stroke keeps its slopes
// and replays them (features/build.ts), and tests/contract/rampedSlopes.test.ts uses this to make
// such a stroke.

/** A ramped Flatten's slopes stand at least this far apart along a stretch of its rim (D270). */
export const RIM_SPACING = 6;

/** A slope a stroke lays: its tile and its orientation (an index into ORIENTATIONS: its high side
 *  Cw0 north, Cw90 west, Cw180 south, Cw270 east). */
export type RimSlope = [number, number, number];

const RIM_DIRS: readonly [number, number, number][] = [
  [0, -1, 0],
  [-1, 0, 1],
  [0, 1, 2],
  [1, 0, 3],
];

/** The slopes a ramped Flatten lays along its own rim (D270): wherever the ground it shaped (`own`:
 *  the tiles it pressed on) meets ground one level lower (the pad's rim stepping down, and its last
 *  step onto the ground round it), a slope on the low tile, its high side on the step, the tile
 *  behind it at its own level; spaced along each stretch of rim (the low tiles of one level facing
 *  one way, joined corner to corner): its middle when it is short, else every `RIM_SPACING` tiles,
 *  so the pad is walkable from every side that has such ground. `occupied`: tiles where nothing may
 *  stand (objects, water, round the start). Deterministic, from the heights after the stroke. */
export function rimSlopes(h: Uint8Array, W: number, H: number, own: Uint8Array, occupied: Uint8Array): RimSlope[] {
  // candidates: low tile, orientation, level
  const groups = new Map<number, number[]>();
  const orient = new Map<number, number>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (occupied[i]) continue;
      for (const [dx, dy, o] of RIM_DIRS) {
        const hx = x + dx;
        const hy = y + dy;
        const bx = x - dx;
        const by = y - dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const j = hy * W + hx;
        const k = by * W + bx;
        if (!own[i] && !own[j]) continue;
        if (h[j] !== h[i] + 1 || h[k] !== h[i] || occupied[k]) continue;
        const key = o * 64 + h[i];
        let g = groups.get(key);
        if (!g) groups.set(key, (g = []));
        g.push(i);
        if (!orient.has(i)) orient.set(i, o);
      }
    }
  const out: RimSlope[] = [];
  const taken = new Uint8Array(W * H);
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const o = Math.floor(key / 64);
    const [dx] = RIM_DIRS[o];
    const tiles = groups.get(key)!;
    const index = new Map(tiles.map((t, n) => [t, n]));
    // stretches: the low tiles joined corner to corner
    const seen = new Uint8Array(tiles.length);
    for (let n = 0; n < tiles.length; n++) {
      if (seen[n]) continue;
      const stretch: number[] = [];
      const stack = [n];
      seen[n] = 1;
      while (stack.length) {
        const m = stack.pop()!;
        const t = tiles[m];
        stretch.push(t);
        const x = t % W;
        const y = (t - x) / W;
        for (let yy = y - 1; yy <= y + 1; yy++)
          for (let xx = x - 1; xx <= x + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const q = index.get(yy * W + xx);
            if (q !== undefined && !seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          }
      }
      // along the stretch: by the coordinate across the slopes' way (x for north and south, y for
      // east and west), then the other
      const along = (t: number) => (dx === 0 ? (t % W) * H + Math.floor(t / W) : Math.floor(t / W) * W + (t % W));
      stretch.sort((a, b) => along(a) - along(b));
      const want: number[] = [];
      if (stretch.length <= RIM_SPACING) want.push(Math.floor((stretch.length - 1) / 2));
      else for (let p = Math.floor(RIM_SPACING / 2); p < stretch.length; p += RIM_SPACING) want.push(p);
      for (const p of want) {
        // the wanted place, or the nearest free one after it in the stretch
        for (let q = p; q < stretch.length; q++) {
          const t = stretch[q];
          const x = t % W;
          const y = (t - x) / W;
          const [ddx, ddy] = RIM_DIRS[o];
          const k = (y - ddy) * W + (x - ddx);
          if (taken[t] || taken[k]) continue;
          taken[t] = 1;
          taken[k] = 1;
          out.push([x, y, o]);
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a[1] * W + a[0] - (b[1] * W + b[0]) || a[2] - b[2]);
}
