// Rivers that can be followed (M9b, D273 (1)): on the land as it stands before the water settles,
// each river's water must leave the map where its system does. The hydrology plans every course
// downhill, but the game drains every map edge but a mouth's sources, and later steps (a
// tributary's channel, a valley lake's floor, an outlet, the relaxed edges) can open a lower way
// out: an inflow whose water runs back out by the edge beside its own mouth, or a lake that drains
// by another valley to another edge. Water takes the lowest way, and the rest of its course then
// stands dry: the map's water can no longer be read from where it starts to where it leaves.
//
// The check: a priority flood over the side-to-side neighbours from every edge tile that drains
// (all but the tiles round an inflow's mouth, which its sources seal) gives each tile the edge
// tile its water leaves by. Every tile of a river's course must lead to its system's way out: the
// main river's exit (or a delta mouth), within a few tiles along its edge; a tributary's water
// leaves with the river it joins; a river of its own by its own exit.

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

/** The rivers whose water leaves the map somewhere other than where their system does. `mouths`
 *  are extra ways out of the main river (a delta's arms, their paths ending on the edge). */
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
  const d = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] });
  // the edge tile each tile's water leaves by
  const out = new Int32Array(N).fill(-1);
  for (let q = 0; q < d.order.length; q++) {
    const i = d.order[q];
    const r = d.rcv[i];
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
  const near = (a: number, b: number, tol: number) => Math.abs((a % W) - (b % W)) + Math.abs(Math.floor(a / W) - Math.floor(b / W)) <= tol;
  const blocked: Blocked[] = [];
  for (const r of rivers) {
    if (r.params.badwater) continue;
    const exits = exitsOf(r);
    if (!exits.length) continue;
    const tol = Math.max(12, Math.ceil(r.params.width) + 6);
    const cells = courseCells(r.params.path, W, H);
    for (const c of cells) {
      const e = out[c];
      if (e < 0 || exits.some((x) => near(e, x, tol))) continue;
      blocked.push({ id: r.id, at: [c % W, (c - (c % W)) / W], leaves: [e % W, (e - (e % W)) / W] });
      break;
    }
  }
  return blocked;
}
