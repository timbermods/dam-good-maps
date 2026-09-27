// The floor's water as one river (Kyler, 2026-09-27, D292). Round 4's floor still had extra wet
// passages beside its main river: pools at the foot of the falls and the side inflows, joined to it by
// long channels across the floor or along the walls' feet. Here the river itself swings over to them:
// it winds across the level floor from one fall's pool or inflow to the next (the biggest first), so
// their water drops straight into it; what it can't reach (a fall facing another across the floor at
// the same place) runs the nearest way to it (plan.ts `joinRiver`). Literal land throughout: the
// river's course, its pools and its joins are carved, and the water is the game's own (no water is
// masked or hidden: what you see is what you get).

import { MinHeap, N8 } from "../../math/grid";
import { clamp, type Point, type Station } from "./model";

/** A place the river should visit: a fall's landing or an inflow's entry on the floor, at station
 *  `k`; the bigger the `weight`, the sooner it is chosen. */
export interface Visit {
  k: number;
  x: number;
  y: number;
  weight: number;
}

/** How far short of a visit's water the river may pass (tiles), and how steeply it crosses the floor
 *  between visits (along the valley per tile across). */
export let SLACK = Number(process.env.GLACIATE_SLACK ?? 2);
export let CROSSING = Number(process.env.GLACIATE_CROSSING ?? 0.7);

const smooth = (v: number) => {
  v = clamp(v, 0, 1);
  return v * v * (3 - 2 * v);
};

/** The unit normal of the trough at station k (left of its way down). */
export function normalAt(path: readonly Point[], k: number): Point {
  const a = path[Math.max(0, k - 3)];
  const b = path[Math.min(path.length - 1, k + 3)];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** The river's course across the floor (D292): a line through the stations that reaches the chosen
 *  visits' water at the river's edge, easing between them, with round 4's gentle meander where no
 *  visit holds it; it starts in the cirque's middle and leaves by the snout's. Returns the course and
 *  the visits it reaches. */
export function riverCourse(
  path: readonly Station[],
  visits: readonly Visit[],
  length: number,
  riverRadius: number,
  phase: number,
  floor: { mask: Uint8Array; W: number; H: number },
): { course: Point[]; reached: Visit[] } {
  // how far the floor reaches each side of each station, the river's whole width kept on it
  const { mask, W, H } = floor;
  const room = path.map((q, k) => {
    const nrm = normalAt(path, k);
    const edge = (side: number) => {
      let u = 0;
      for (; u < q.r * 1.4; u += 0.5) {
        const x = Math.floor(q.x + nrm.x * u * side);
        const y = Math.floor(q.y + nrm.y * u * side);
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x] !== 1) break;
      }
      return Math.max(0, u - riverRadius - 1.5);
    };
    return { left: edge(1), right: edge(-1) };
  });
  const within = (k: number, off: number) => clamp(off, -room[k].right, room[k].left);
  const aims = visits.map((v) => {
    const q = path[v.k];
    const nrm = normalAt(path, v.k);
    const side = (v.x - q.x) * nrm.x + (v.y - q.y) * nrm.y;
    // the river's edge near the visit's water: a short run from it at most
    const reach = Math.max(0, Math.abs(side) - riverRadius - 0.6 - SLACK);
    return { v, s: q.s, aim: within(v.k, Math.sign(side) * reach) };
  });
  const order = aims.slice().sort((a, b) => b.v.weight - a.v.weight || a.v.k - b.v.k);
  const chosen: typeof aims = [];
  for (const c of order) {
    // (the river crosses the floor between visits at a gentle angle: facing falls at the same place
    // can't both be reached, the bigger one is)
    const fits = chosen.every((a) => {
      const d = Math.abs(c.s - a.s) * length;
      const across = Math.abs(c.aim - a.aim);
      return d >= 5 && d >= across * CROSSING;
    });
    if (fits && c.s > 0.04 && c.s < 0.97) chosen.push(c);
  }
  chosen.sort((a, b) => a.s - b.s);
  const controls = [{ s: 0, aim: 0 }, ...chosen.map((c) => ({ s: c.s, aim: c.aim })), { s: 1, aim: 0 }];
  const course = path.map((q, k) => {
    let j = 0;
    while (j < controls.length - 2 && controls[j + 1].s <= q.s) j++;
    const a = controls[j];
    const b = controls[j + 1];
    const t = b.s > a.s ? (q.s - a.s) / (b.s - a.s) : 0;
    const base = a.aim + (b.aim - a.aim) * smooth(t);
    // round 4's gentle meander, faded out where a visit holds the river
    const gap = Math.min((q.s - a.s) * length, (b.s - q.s) * length);
    const meander = Math.sin(q.s * 8 + phase) * q.r * 0.35 * Math.sin(Math.PI * q.s) * smooth(gap / 14) * 0.6;
    const off = within(k, base + meander);
    const nrm = normalAt(path, k);
    return { x: q.x + nrm.x * off, y: q.y + nrm.y * off };
  });
  return { course, reached: chosen.map((c) => c.v) };
}

/** A fall whose pool is this near the river (tiles across the floor) keeps its spring and runs into
 *  it; a farther one the river couldn't visit stays a dry hanging valley (D292: one river). */
export const FALL_REACH = 6;

/** Each floor tile's distance to the river across the floor (8-neighbour steps, diagonals √2); off
 *  the floor, Infinity. */
export function floorDistance(mask: Uint8Array, stream: Uint8Array, W: number, H: number): Float64Array {
  const n = W * H;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  for (let i = 0; i < n; i++)
    if (stream[i] === 1) {
      dist[i] = 0;
      heap.push(0, i);
    }
  while (heap.size) {
    const i = heap.pop();
    const d = heap.lastKey;
    if (d !== dist[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (mask[j] !== 1) continue;
      const next = d + (dx && dy ? Math.SQRT2 : 1);
      if (next < dist[j]) {
        dist[j] = next;
        heap.push(next, j);
      }
    }
  }
  return dist;
}
