// Rivers that can be followed (M9b, D273 (1)): on the land as it stands before the water settles,
// each river's water must leave the map where its system does. The hydrology plans every course
// downhill, but the game drains every map edge but a mouth's sources, and later steps (a
// tributary's channel, a valley lake's floor, an outlet, the relaxed edges) can open a lower way
// out: an inflow whose water runs back out by the edge beside its own mouth, or a lake that drains
// by another valley to another edge. Water takes the lowest way, and the rest of its course then
// stands dry: the map's water can no longer be read from where it starts to where it leaves.
//
// The check: a priority flood over the side-to-side neighbours from every edge tile that drains
// (all but the tiles round an inflow's mouth, which its sources seal) gives each tile the level its
// water spills out at; a second, from the stretch of edge the river's system leaves by (35% of the
// side either way of its exit, and a delta's mouths), the level it would spill out at there. Where
// the first is lower, by a level or more, anywhere along a river's course, its water leaves by that
// lower way. A tributary's water leaves with the river it joins.

import { drainage } from "./drainage";
import type { Point, RiverFeature } from "../features/schema";

/** The course's tiles in order, inside the map. */
export function courseCells(path: readonly (readonly [number, number])[], W: number, H: number): number[] {
  const out: number[] = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let t = 0; t <= n; t++) {
      const x = Math.round(ax + ((bx - ax) * t) / n);
      const y = Math.round(ay + ((by - ay) * t) / n);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (out[out.length - 1] !== i) out.push(i);
    }
  }
  return out;
}

/** The edge tile nearest a point (its way out of the map). */
function edgeTile(p: readonly [number, number], W: number, H: number): number {
  const x = Math.min(W - 1, Math.max(0, Math.round(p[0])));
  const y = Math.min(H - 1, Math.max(0, Math.round(p[1])));
  const dx = Math.min(x, W - 1 - x);
  const dy = Math.min(y, H - 1 - y);
  if (dx <= dy) return y * W + (x < W - 1 - x ? 0 : W - 1);
  return (y < H - 1 - y ? 0 : H - 1) * W + x;
}

export interface Blocked {
  id: string;
  /** The course tile whose water leaves elsewhere, and the edge tile it leaves by. */
  at: [number, number];
  leaves: [number, number];
}

/** The rivers whose water leaves the map somewhere other than where their system does: some way
 *  out is strictly lower (a level or more) than the best way out by the stretch of edge the system
 *  leaves by. A way out at the same level is a tie, not a leak (the water leaves the lower way); the
 *  exit's stretch is 35% of the side either way along its edge (a river on a coastal plain spreads
 *  before it leaves). `mouths` are the main river's other ways out (a delta's arms). */
export function blockedCourses(h: ArrayLike<number>, W: number, H: number, rivers: readonly RiverFeature[], mouths: readonly (readonly Point[])[] = []): Blocked[] {
  const N = W * H;
  const sealed = new Uint8Array(N);
  for (const r of rivers) {
    if (!("edge" in r.params.entry)) continue;
    const [px, py] = r.params.path[Math.min(1, r.params.path.length - 1)];
    const reach = Math.ceil(r.params.width / 2) + 2;
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const y = (i - x) / W;
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && Math.abs(x - px) <= reach && Math.abs(y - py) <= reach) sealed[i] = 1;
    }
  }
  const all = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] });
  const out = new Int32Array(N).fill(-1);
  for (let q = 0; q < all.order.length; q++) {
    const i = all.order[q];
    const r = all.rcv[i];
    out[i] = r < 0 ? i : out[r];
  }
  // each river's system's ways out: follow joins to a river that leaves by an edge
  const byId = new Map(rivers.map((r) => [r.id, r]));
  const exitsOf = (r: RiverFeature, seen = new Set<string>()): number[] => {
    const e = r.params.exit;
    if ("river" in e) {
      const to = byId.get(e.river);
      if (!to || seen.has(to.id)) return [];
      seen.add(r.id);
      return exitsOf(to, seen);
    }
    const tiles = [edgeTile(r.params.path[r.params.path.length - 1], W, H)];
    if (r.role === "river/main") for (const m of mouths) if (m.length) tiles.push(edgeTile(m[m.length - 1], W, H));
    return tiles;
  };
  const tol = Math.max(12, Math.round(0.35 * Math.min(W, H)));
  const onStretch = (i: number, exits: readonly number[]) => {
    const x = i % W;
    const y = (i - x) / W;
    return exits.some((e) => {
      const ex = e % W;
      const ey = (e - ex) / W;
      // the same edge, within the stretch along it
      if ((ex === 0 || ex === W - 1) && x === ex && Math.abs(y - ey) <= tol) return true;
      if ((ey === 0 || ey === H - 1) && y === ey && Math.abs(x - ex) <= tol) return true;
      return false;
    });
  };
  // the spill levels with only the system's exit stretch draining, once per system
  const byExits = new Map<string, Float64Array>();
  const blocked: Blocked[] = [];
  for (const r of rivers) {
    if (r.params.badwater) continue;
    const exits = exitsOf(r);
    if (!exits.length) continue;
    const key = exits.join(",");
    let viaExit = byExits.get(key);
    if (!viaExit) {
      viaExit = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] && onStretch(i, exits) }).filled;
      byExits.set(key, viaExit);
    }
    for (const c of courseCells(r.params.path, W, H)) {
      if (!(all.filled[c] < viaExit[c])) continue;
      const e = out[c];
      blocked.push({ id: r.id, at: [c % W, (c - (c % W)) / W], leaves: e >= 0 ? [e % W, (e - (e % W)) / W] : [-1, -1] });
      break;
    }
  }
  return blocked;
}
