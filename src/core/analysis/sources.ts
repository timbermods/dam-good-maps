// Water sources start rivers (Kyler, 2026-09-25, D171): a source is where water begins, never in
// the middle of a flow. `water.source_in_flow` flags a WaterSource or BadwaterSource that stands
// where water from another source comes down to it. prototype/playability.py `sources_in_flow` is
// the same rule.
//
// The rule, on the map's terrain, its objects and its settled water:
// 1. Every emitter (sources, seeps, aquifers, badtide drains) with its tiles, and its strength as
//    the water model runs it at map start (sim/model.ts).
// 2. Emitters whose tiles touch (8-neighbour) are one group: a sealed river mouth's row, a cluster
//    of sources side by side at a river's head, a BadwaterSource with the seals beside it. So are
//    the sources of a row across a river's mouth (step 3b), which the survey's inflows lay with gaps.
// 3. Which way water runs: down the spill levels (the priority flood from the draining map edge,
//    as the canonical pre-fill reads them, sim/prefill.ts), and on a flat of one spill level across
//    it and on toward its way out (a tile beside lower ground, or a draining map edge), never back
//    away from it. A pool (a depression, its spill level above its floor) fills: water that runs
//    into it reaches all of it.
// 4. Where a group's water goes: from its tiles, over the settled water (any depth), each step
//    one way water runs. It runs down a river's bed, over its falls, through every pool and lake it
//    passes, and never up a stream, back up a flat reach or across dry ground.
// 5. A group is inside an existing flow when the water of a running group (strength above 0)
//    reaches one of its sources and its own water does not reach that group back: that water comes
//    down to it from elsewhere. Groups whose water reaches each other (springs spread across one
//    pool) are side by side, and neither is downstream of the other.
// Each WaterSource and BadwaterSource of a group inside a flow is flagged.
//
// A row is one head (step 3b, `ROW_REACH`). Two sources of one template are one head only when all hold:
//  a. they stand in the same connected water at the same surface level, with no fall between them: both
//     tiles hold settled water, and a path of settled-water tiles of one spill level joins them (4-neighbour,
//     within ROW_REACH tiles of the first);
//  b. they are within ROW_REACH (6) tiles of each other (Chebyshev);
//  c. neither lies down the other's flow by more than the channel's width there: the steps to the flat's way
//     out (`exitDist`) differ by no more than the narrower of the two sources' channel widths, a channel's
//     width at a tile being the shorter of its wet runs of that spill level along x and along y.
// A row is the transitive group of such pairs, and the check treats it as one source: the water of a row's
// head reaches its other members, so none of them is flagged for that. The definition is narrow on purpose, so
// a source set downstream (across a fall, further down the flow than the channel is wide, or in other water)
// is never excused. Planning's ruling, #236.

import { objectTile, EMITTERS, isDelayed, MAX_STRENGTH_PER_TILE, specifiedStrength, type MapObject } from "../sim/model";
import { spillLevels } from "../sim/prefill";
import type { WaterModel } from "../sim/water";

/** The objects the rule is about: they start water. Seeps and the rest only take part as flows. */
export const SOURCE_TEMPLATES = new Set(["WaterSource", "BadwaterSource"]);

export interface SourcesInFlow {
  /** Sources (WaterSource, BadwaterSource) on the map. */
  sources: number;
  /** Indices into `objects` of the sources inside an existing flow, in object order, and the
   *  first tile of each. */
  inFlow: number[];
  tiles: [number, number][];
  /** For each of `inFlow`, the objects whose water reaches it (their groups' emitters). */
  reachedBy?: number[][];
}

interface Unit {
  object: number;
  cells: number[];
  strength: number;
  source: boolean;
  template: string;
}

/** Sources of one template within this many tiles of each other can stand in one row (a head). */
export const ROW_REACH = 6;

export function sourcesInFlow(model: WaterModel, objects: readonly MapObject[], depth: ArrayLike<number>): SourcesInFlow {
  const { W, H } = model;
  const N = W * H;
  // 1. the emitters, as the water model reads them
  const units: Unit[] = [];
  objects.forEach((o, k) => {
    const rule = EMITTERS[o.template];
    if (!rule) return;
    const cells: number[] = [];
    for (const [lx, ly] of rule.tiles) {
      const [x, y] = objectTile(o, lx, ly);
      if (x >= 0 && x < W && y >= 0 && y < H) cells.push(y * W + x);
    }
    if (!cells.length) return;
    let strength = rule.runs && !isDelayed(o.components) ? specifiedStrength(o.components) : 0;
    if (strength > MAX_STRENGTH_PER_TILE * rule.tiles.length) strength = MAX_STRENGTH_PER_TILE * rule.tiles.length;
    if (!(strength > 0)) strength = 0;
    units.push({ object: k, cells, strength, source: SOURCE_TEMPLATES.has(o.template), template: o.template });
  });
  const sources = units.filter((u) => u.source).length;
  if (!sources) return { sources: 0, inFlow: [], tiles: [] };

  // 2. groups of touching emitters (union-find over the units)
  const parent = units.map((_, k) => k);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const owner = new Int32Array(N).fill(-1);
  units.forEach((u, k) => {
    for (const c of u.cells) if (owner[c] < 0) owner[c] = k;
  });
  units.forEach((u, k) => {
    for (const c of u.cells) {
      const x = c % W;
      const y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const o = owner[yy * W + xx];
          if (o < 0) continue;
          const ra = find(o);
          const rb = find(k);
          if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
        }
    }
  });
  // 3. which way water runs: down the spill levels, across a flat toward its way out, and all
  //    through a pool
  const spill = spillLevels(model);
  const pool = new Uint8Array(N);
  for (let i = 0; i < N; i++) pool[i] = spill[i] > model.floor[i] + (model.dam && model.dam[i] >= 0 ? model.dam[i] : 0) ? 1 : 0;
  const emitting = new Uint8Array(N);
  for (const u of units) for (const c of u.cells) emitting[c] = 1;
  const exitDist = new Int32Array(N).fill(-1);
  const flatQueue: number[] = [];
  for (let c = 0; c < N; c++) {
    const x = c % W;
    const y = (c - x) / W;
    let exit = (x === 0 || y === 0 || x === W - 1 || y === H - 1) && !emitting[c];
    for (let d = 0; d < 4 && !exit; d++) {
      const n = d === 0 ? (y > 0 ? c - W : -1) : d === 1 ? (x > 0 ? c - 1 : -1) : d === 2 ? (y < H - 1 ? c + W : -1) : x < W - 1 ? c + 1 : -1;
      if (n >= 0 && spill[n] < spill[c]) exit = true;
    }
    if (exit) {
      exitDist[c] = 0;
      flatQueue.push(c);
    }
  }
  for (let head = 0; head < flatQueue.length; head++) {
    const c = flatQueue[head];
    const x = c % W;
    const y = (c - x) / W;
    for (let d = 0; d < 4; d++) {
      const n = d === 0 ? (y > 0 ? c - W : -1) : d === 1 ? (x > 0 ? c - 1 : -1) : d === 2 ? (y < H - 1 ? c + W : -1) : x < W - 1 ? c + 1 : -1;
      if (n < 0 || exitDist[n] >= 0 || spill[n] !== spill[c]) continue;
      exitDist[n] = exitDist[c] + 1;
      flatQueue.push(n);
    }
  }
  const runs = (c: number, n: number) => spill[n] < spill[c] || (spill[n] === spill[c] && ((pool[c] === 1 && pool[n] === 1) || exitDist[n] <= exitDist[c]));

  // 3b. rows: sources across a river's mouth are one head (see the definition above)
  const wetRun = (c: number, ddx: number, ddy: number) => {
    const x = c % W;
    const y = (c - x) / W;
    let run = 1;
    for (const sgn of [1, -1]) {
      let xx = x + sgn * ddx;
      let yy = y + sgn * ddy;
      while (xx >= 0 && yy >= 0 && xx < W && yy < H && depth[yy * W + xx] > 0 && spill[yy * W + xx] === spill[c]) {
        run++;
        xx += sgn * ddx;
        yy += sgn * ddy;
      }
    }
    return run;
  };
  const channelWidth = (c: number) => Math.min(wetRun(c, 1, 0), wetRun(c, 0, 1));
  const sameWater = (ca: number, cb: number) => {
    if (!(depth[ca] > 0) || !(depth[cb] > 0) || spill[ca] !== spill[cb]) return false;
    const ax = ca % W;
    const ay = (ca - ax) / W;
    const seenRow = new Set<number>([ca]);
    const queue = [ca];
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      if (c === cb) return true;
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || Math.abs(xx - ax) > ROW_REACH || Math.abs(yy - ay) > ROW_REACH) continue;
        const n = yy * W + xx;
        if (seenRow.has(n) || !(depth[n] > 0) || spill[n] !== spill[ca]) continue;
        seenRow.add(n);
        queue.push(n);
      }
    }
    return false;
  };
  const heads = units.map((_, k) => k).filter((k) => units[k].source);
  for (let i = 0; i < heads.length; i++)
    for (let j = i + 1; j < heads.length; j++) {
      const a = units[heads[i]];
      const b = units[heads[j]];
      const ca = a.cells[0];
      const cb = b.cells[0];
      if (a.template !== b.template) continue;
      if (Math.max(Math.abs((ca % W) - (cb % W)), Math.abs(Math.floor(ca / W) - Math.floor(cb / W))) > ROW_REACH) continue;
      const ra = find(heads[i]);
      const rb = find(heads[j]);
      if (ra === rb || !sameWater(ca, cb)) continue;
      const fall = exitDist[ca] >= 0 && exitDist[cb] >= 0 ? Math.abs(exitDist[ca] - exitDist[cb]) : 0;
      if (fall > Math.min(channelWidth(ca), channelWidth(cb))) continue;
      parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }

  const byRoot = new Map<number, number[]>();
  units.forEach((_, k) => {
    const r = find(k);
    const g = byRoot.get(r);
    if (g) g.push(k);
    else byRoot.set(r, [k]);
  });
  const groups = [...byRoot.values()];

  // 4. where each group's water goes
  const reach = groups.map((g) => {
    const seen = new Uint8Array(N);
    const queue: number[] = [];
    for (const k of g)
      for (const c of units[k].cells)
        if (!seen[c]) {
          seen[c] = 1;
          queue.push(c);
        }
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      const x = c % W;
      const y = (c - x) / W;
      for (let d = 0; d < 4; d++) {
        const n = d === 0 ? (y > 0 ? c - W : -1) : d === 1 ? (x > 0 ? c - 1 : -1) : d === 2 ? (y < H - 1 ? c + W : -1) : x < W - 1 ? c + 1 : -1;
        if (n < 0 || seen[n] || !(depth[n] > 0) || !runs(c, n)) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    return seen;
  });
  /** Whether group a's water reaches a tile of group b (its sources' only, with `sourcesOnly`). */
  const reaches = (a: number, b: number, sourcesOnly: boolean) => groups[b].some((k) => (!sourcesOnly || units[k].source) && units[k].cells.some((c) => reach[a][c] === 1));

  // 5. groups another running group's water comes down to
  const running = groups.map((g) => g.some((k) => units[k].strength > 0));
  const inFlow: [number, [number, number], number[]][] = [];
  for (let b = 0; b < groups.length; b++) {
    if (!groups[b].some((k) => units[k].source)) continue;
    const by: number[] = [];
    for (let a = 0; a < groups.length; a++) if (a !== b && running[a] && reaches(a, b, true) && !reaches(b, a, false)) for (const k of groups[a]) by.push(units[k].object);
    if (!by.length) continue;
    for (const k of groups[b]) {
      if (!units[k].source) continue;
      const c = units[k].cells[0];
      inFlow.push([units[k].object, [c % W, (c - (c % W)) / W], by]);
    }
  }
  inFlow.sort((p, q) => p[0] - q[0]);
  return { sources, inFlow: inFlow.map(([o]) => o), tiles: inFlow.map(([, t]) => t), reachedBy: inFlow.map(([, , by]) => by) };
}
