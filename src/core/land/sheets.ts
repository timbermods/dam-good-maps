// A shallow sheet over a flat (D372): where a planned lake's water stands at a level whose ground
// round it is a broad flat, the water spreads over all of that flat as a sheet about a level deep or
// less, which fills for days and never settles within the canonical settle (Canyon 256² seed 22: its
// lakes standing at 5.3 over 5,802 tiles of ground at 5 and 721 at 4). A land whose water would stand
// so over more than `SHEET_MOST` of the map is drawn again before it is shown, as a sea over its shelf
// is. Read from the land and the water planned on it: each planned lake at the level the plan stands
// it (just above its outlet), over the ground under that level joined to it; the deep water a lake's
// banks hold is no sheet, and a river in its channel is none.

import type { Hydro } from "./hydro";

/** The most of the map a shallow sheet may cover (D372: about 5%). */
export const SHEET_MOST = 0.05;
/** How far over its outlet's bed the plan stands a lake at least (gen/generate.ts `plannedWater`). */
const LAKE_TOP = 0.6;

/**
 * The largest shallow sheet the planned lakes would stand as, in tiles: from each planned lake at its
 * planned level, the ground under that level joined to it (four ways), counting the tiles under a
 * level of water or less.
 */
export function shallowSheet(h: ArrayLike<number>, W: number, H: number, hy: Pick<Hydro, "lakes" | "rivers">): { tiles: number; share: number; at: number } {
  const N = W * H;
  // (the water a lake's outlet must pass: its river's flow and every river joining it, its way out
  // as wide as its river's channel; the depth that takes at 0.44 deep per 0.82 blocks/s per tile of
  // width, D26: a lake fed more than its outlet passes at the plan's level stands that much higher)
  const flowInto = (id: string): number => {
    const r = hy.rivers.find((x) => x.id === id);
    if (!r) return 0;
    let q = r.params.flow;
    for (const o of hy.rivers) if ("river" in o.params.exit && o.params.exit.river === id) q += o.params.flow;
    return q;
  };
  const mark = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let best = 0;
  let at = -1;
  hy.lakes.forEach((lk, k) => {
    const r = hy.rivers.find((x) => x.id === lk.river);
    const width = r ? Math.max(1, r.params.width) : 3;
    const level = lk.outletBed + Math.max(LAKE_TOP, 0.44 * Math.sqrt(flowInto(lk.river) / width / 0.82));
    let head = 0;
    let tail = 0;
    let shallow = 0;
    for (const i of lk.tiles)
      if (mark[i] !== k && h[i] < level) {
        mark[i] = k;
        q[tail++] = i;
      }
    while (head < tail) {
      const i = q[head++];
      if (level - h[i] <= 1) shallow++;
      const x = i % W;
      const y = (i - x) / W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W);
      if (y < H - 1) push(i + W);
    }
    if (shallow > best) {
      best = shallow;
      at = lk.tiles[0] ?? -1;
    }
    function push(j: number): void {
      if (mark[j] === k || !(h[j] < level)) return;
      mark[j] = k;
      q[tail++] = j;
    }
  });
  return { tiles: best, share: N ? best / N : 0, at };
}
