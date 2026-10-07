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
// lower way. A tributary's water leaves with the river it joins. An inflow's standing water that can
// leave by its own edge as low as by the exit is a leak too: the near edge takes it all.

import { drainage } from "./drainage";
import type { Edge, Point, RiverFeature } from "../features/schema";
import { mouthTilesOf } from "../features/raster/terrain";

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
  /** Water running back out by the inflow's own edge, at this level (`backEdges` can close it). */
  back?: { level: number; edge: Edge };
}

/** Closes an inflow's own edge where its standing water would run back out (`blocked`'s `back`):
 *  the edge row's tiles at or below the water's level, joined along the edge to the tile it leaves
 *  by, are raised a level over it (the game drains every edge tile; a lip on the edge row holds
 *  the water as the land beyond the map would). A run longer than a quarter of the side, or one
 *  that would rise more than `maxRise` levels, is left: that land is planned again. Returns whether
 *  it changed anything. */
export function closeBackEdges(h: Uint8Array, W: number, H: number, blocked: readonly Blocked[], rivers: readonly RiverFeature[], maxRise = 2): boolean {
  const sealed = sealedMouths(rivers, W, H);
  let changed = false;
  for (const b of blocked) {
    if (!b.back) continue;
    const [lx, ly] = b.leaves;
    if (lx < 0) continue;
    const vertical = b.back.edge === "east" || b.back.edge === "west";
    const len = vertical ? H : W;
    const at = (k: number) => (vertical ? k * W + lx : ly * W + k);
    const top = Math.floor(b.back.level);
    let k0 = vertical ? ly : lx;
    let k1 = k0;
    // (never the mouth's own tiles, which hold its sources)
    while (k0 > 0 && h[at(k0 - 1)] <= top && !sealed[at(k0 - 1)]) k0--;
    while (k1 < len - 1 && h[at(k1 + 1)] <= top && !sealed[at(k1 + 1)]) k1++;
    // (a lip, not a wall: a run that would rise more than `maxRise` levels is planned again)
    let low = Infinity;
    for (let k = k0; k <= k1; k++) low = Math.min(low, h[at(k)]);
    if (k1 - k0 + 1 > 0.25 * len || top + 1 - low > maxRise || sealed[at(vertical ? ly : lx)]) continue;
    for (let k = k0; k <= k1; k++) if (h[at(k)] <= top) h[at(k)] = top + 1;
    changed = true;
  }
  return changed;
}

/** The edge tiles of each inflow's mouth, which hold its sources (not outlets): its row as the
 *  build places it (D314, raster/terrain.ts `mouthRow`; item 27: the edge tiles beside the row
 *  drain, and a wider seal hid the water running off there). */
export function sealedMouths(rivers: readonly RiverFeature[], W: number, H: number): Uint8Array {
  const sealed = new Uint8Array(W * H);
  for (const r of rivers) for (const i of mouthTilesOf(r, W, H)) sealed[i] = 1;
  return sealed;
}

/** Levels of standing water over an inflow's mouth at which its head is drowned. */
const DROWNED = 2;

/** The inflows whose heads stand under water held downstream (the land's spill level, mouths
 *  sealed, two levels or more over the mouth's bed): a lake whose rim stands above the head backs
 *  up the course to the edge, its water stands over the head's sources and runs off the map beside
 *  them, and it never settles (Canyon 256² seed 14: a head at 4 under a lake held at 7). */
export function drownedHeads(h: ArrayLike<number>, W: number, H: number, rivers: readonly RiverFeature[]): string[] {
  const sealed = sealedMouths(rivers, W, H);
  const filled = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] }).filled;
  const out: string[] = [];
  for (const r of rivers) {
    if (!("edge" in r.params.entry)) continue;
    const mouth = mouthTilesOf(r, W, H);
    if (!mouth.length) continue;
    let bed = Infinity;
    for (const i of mouth) bed = Math.min(bed, h[i]);
    let top = -Infinity;
    for (const i of mouth) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const u = x + dx;
        const v = y + dy;
        if (u <= 0 || v <= 0 || u >= W - 1 || v >= H - 1) continue;
        top = Math.max(top, filled[v * W + u]);
      }
    }
    if (top - bed >= DROWNED) out.push(r.id);
  }
  return out;
}

/** The rivers whose water leaves the map somewhere other than where their system does: some way
 *  out is strictly lower (a level or more) than the best way out by the stretch of edge the system
 *  leaves by. A way out at the same level is a tie, not a leak (the water leaves the lower way); the
 *  exit's stretch is 35% of the side either way along its edge (a river on a coastal plain spreads
 *  before it leaves). `mouths` are the main river's other ways out (a delta's arms). */
export function blockedCourses(h: ArrayLike<number>, W: number, H: number, rivers: readonly RiverFeature[], mouths: readonly (readonly Point[])[] = []): Blocked[] {
  const N = W * H;
  const sealed = sealedMouths(rivers, W, H);
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
    // (round 6: a river that ends in a basin, an island sea, leaves the map where that basin's water
    // does)
    if ("basin" in e) {
      const x = Math.min(W - 1, Math.max(0, Math.round(e.basin[0])));
      const y = Math.min(H - 1, Math.max(0, Math.round(e.basin[1])));
      return out[y * W + x] >= 0 ? [out[y * W + x]] : [];
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
    // an inflow's standing water that can leave by its own edge at the level it would leave by the
    // exit runs back out beside its mouth: the near edge takes it all (a tie elsewhere is not a leak)
    let back: ReturnType<typeof drainage> | null = null;
    const side: Edge | null = "edge" in r.params.entry ? r.params.entry.edge : null;
    // (the map's y runs north: the south edge is y = 0)
    const onSide = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      return side === "east" ? x === W - 1 : side === "west" ? x === 0 : side === "north" ? y === H - 1 : side === "south" ? y === 0 : false;
    };
    if (side) back = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] && onSide(i) });
    for (const c of courseCells(r.params.path, W, H)) {
      const runsBack = back !== null && back.filled[c] <= viaExit[c] && back.filled[c] > h[c];
      if (!(all.filled[c] < viaExit[c]) && !runsBack) continue;
      // the edge tile the water leaves by: back out by the inflow's own edge (the lowest way, or as
      // low as the exit's with standing water), or elsewhere
      let e = out[c];
      if (back && runsBack && !(all.filled[c] < back.filled[c])) {
        e = c;
        while (back.rcv[e] >= 0) e = back.rcv[e];
      }
      const at: [number, number] = [c % W, (c - (c % W)) / W];
      const leaves: [number, number] = e >= 0 ? [e % W, (e - (e % W)) / W] : [-1, -1];
      // (by its own edge, the water there can be held at the level it would leave by the exit)
      if (side && e >= 0 && onSide(e)) blocked.push({ id: r.id, at, leaves, back: { level: viaExit[c], edge: side } });
      else blocked.push({ id: r.id, at, leaves });
      break;
    }
  }
  return blocked;
}

/** Where a river's standing water ties with its exit's level on another edge (D350, Delta's lowland
 *  courses on the beds' floor: the water split at the tie, most of it left by the near edge, and
 *  the lower course stood dry), the edge there gets a lip a level over that water: the run of edge
 *  tiles at or under it round where the water leaves, two rows deep, never a mouth's own tiles, never
 *  more than a quarter of the edge or a rise of `maxRise`. Returns whether any lip was raised. */
export function closeSideEdges(h: Uint8Array, W: number, H: number, rivers: readonly RiverFeature[], mouths: readonly (readonly Point[])[] = [], maxRise = 2): boolean {
  const N = W * H;
  const sealed = sealedMouths(rivers, W, H);
  const all = drainage(h, W, H, { eight: false, outlet: (i) => !sealed[i] });
  const out = new Int32Array(N).fill(-1);
  for (let q = 0; q < all.order.length; q++) {
    const i = all.order[q];
    const r = all.rcv[i];
    out[i] = r < 0 ? i : out[r];
  }
  const byId = new Map(rivers.map((r) => [r.id, r]));
  const exitsOf = (r: RiverFeature, seen = new Set<string>()): number[] => {
    const e = r.params.exit;
    if ("river" in e) {
      const to = byId.get(e.river);
      if (!to || seen.has(to.id)) return [];
      seen.add(r.id);
      return exitsOf(to, seen);
    }
    if ("basin" in e) {
      const x = Math.min(W - 1, Math.max(0, Math.round(e.basin[0])));
      const y = Math.min(H - 1, Math.max(0, Math.round(e.basin[1])));
      return out[y * W + x] >= 0 ? [out[y * W + x]] : [];
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
      if ((ex === 0 || ex === W - 1) && x === ex && Math.abs(y - ey) <= tol) return true;
      if ((ey === 0 || ey === H - 1) && y === ey && Math.abs(x - ex) <= tol) return true;
      return false;
    });
  };
  let changed = false;
  const done = new Set<number>();
  for (const r of rivers) {
    if (r.params.badwater) continue;
    const exits = exitsOf(r);
    if (!exits.length) continue;
    for (const c of courseCells(r.params.path, W, H)) {
      const e = out[c];
      if (e < 0 || done.has(e) || onStretch(e, exits) || sealed[e]) continue;
      const lx = e % W;
      const ly = (e - lx) / W;
      if (!(lx === 0 || ly === 0 || lx === W - 1 || ly === H - 1)) continue;
      done.add(e);
      const top = Math.floor(all.filled[c]);
      const vertical = lx === 0 || lx === W - 1;
      const len = vertical ? H : W;
      const rows = [0, 1];
      const at = (k: number, t: number) => (vertical ? k * W + (lx === 0 ? t : W - 1 - t) : (ly === 0 ? t : H - 1 - t) * W + k);
      let k0 = vertical ? ly : lx;
      let k1 = k0;
      while (k0 > 0 && h[at(k0 - 1, 0)] <= top && !sealed[at(k0 - 1, 0)]) k0--;
      while (k1 < len - 1 && h[at(k1 + 1, 0)] <= top && !sealed[at(k1 + 1, 0)]) k1++;
      let low = Infinity;
      for (let k = k0; k <= k1; k++) low = Math.min(low, h[at(k, 0)]);
      if (k1 - k0 + 1 > 0.25 * len || top + 1 - low > maxRise) continue;
      for (let k = k0; k <= k1; k++) for (const t of rows) if (h[at(k, t)] <= top && !sealed[at(k, t)]) h[at(k, t)] = top + 1;
      changed = true;
    }
  }
  return changed;
}
