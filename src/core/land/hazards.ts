// Badwater found in the terrain (docs/m9-design.md §4.8; D200: badwater on every map). Badwater
// rises in a hollow on high ground (a pit dug two levels into the rock, its outline irregular) and
// drains by its own winding ditch down the slope to a river below the start's water, or to the
// map's edge, so the colony meets it later, downstream or across the valley, as a threat and a
// late-game resource. A levee on the ditch is the counterplay; badwater may join rivers and lakes (D469,
// `water.badwater_contained` is information). The set piece carries the pit's source, floor and outlet; the pit's own shape is the
// terrain's, which the generated field holds.
//
// Every map gets `count` hollows unless its player chose No badwater (D200), each beyond the
// difficulty's badwater distance from the start (plus the reach of its water and soil), apart from
// each other. The ditch winds (noise in its route's cost) and never runs ruler-straight (D209).
//
// Ported from the design version 2 prototype (investigation/generative/v2/hazards.ts).

import * as portable from "../math/portable";
import { featureId } from "../features/ids";
import { OFFICIAL_BADWATER as B } from "../gen/calibrated";
import { channelTiles } from "../features/route";
import type { Feature, SetPieceFeature } from "../features/schema";
import { hash32 } from "../math/hash";
import { distanceFrom, MinHeap, N4 } from "../math/grid";
import { fbm } from "../math/noise";
import { stream } from "../math/rng";
import { windRoute } from "./wind";
import { basinLeak } from "../validate/playability";
import { drainage } from "./drainage";
import type { Hydro } from "./hydro";
import { BED_FLOOR } from "./genome";
import { mouthTilesOf } from "../features/raster/terrain";
import { LIP_REACH } from "../water/edgeLip";
import { dist } from "./num";

export interface Hazards {
  /** Hollows planned (0 when none fits, or No badwater). */
  count: number;
  features: Feature[];
  /** The terrain with the pits and their ditches dug (the input when there are none). */
  heights: Uint8Array;
  /** Tiles the objects and resources keep off (the pits, their rims and their ditches). */
  avoid: Uint8Array;
}

export interface BadwaterAsk {
  /** Hollows to plan (at least one unless No badwater). */
  count: number;
  /** Each source's strength, blocks per second over its 3×3. */
  strength: number;
  /** No badwater within this many tiles of the start: the larger of the Badwater distance setting
   *  and the start rule's (D85, D200). */
  distance: number;
  /** Tiles no pit or ditch may take (the weir's pool). */
  keepOff?: Uint8Array | null;
}

/** The route of a ditch from the pit's edge down to a river or the map edge: side-to-side steps,
 *  cheapest where the ground falls, never near the start; noise in the cost makes it wind as a gully
 *  does. */
function ditchRoute(h: Uint8Array, W: number, H: number, from: number[], pit: Uint8Array, goal: Uint8Array, avoid: Uint8Array, sill: number, wander: number): { tiles: number[]; end: number } | null {
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  for (const i of from) {
    cost[i] = 0;
    heap.push(0, i);
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > cost[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    if (goal[c] || x === 0 || y === 0 || x === W - 1 || y === H - 1) {
      const tiles: number[] = [];
      for (let i = c; i >= 0; i = prev[i]) tiles.push(i);
      return { tiles: tiles.reverse(), end: c };
    }
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (pit[n] || avoid[n]) continue;
      // uphill is dear (the ditch must cut through it), downhill cheap
      const rise = Math.max(0, h[n] - Math.min(h[c], sill));
      // noise makes the ditch wind as a gully does, not run along the grid
      const nk = k + 1 + 3 * rise + 1.6 * (1 + fbm(wander, xx, yy, 5, 2)) + 1.4 * (1 + fbm(wander + 7, xx, yy, 13, 2));
      if (nk < cost[n]) {
        cost[n] = nk;
        prev[n] = c;
        heap.push(nk, n);
      }
    }
  }
  return null;
}

/** The longest straight stretch a ditch may run, in tiles (D209: a one-tile ditch's banks are a
 *  canal as long as the stretch; real terrain's and the official maps' longest are 34 and 44). */
const DITCH_STRAIGHT = 24;

/** The most tiles in a row of `tiles` whose middles all lie within 0.75 of one straight line (the
 *  line through the stretch's two ends): how far a ditch runs ruler-straight. */
export function straightStretch(tiles: readonly number[], W: number): number {
  const n = tiles.length;
  const px = tiles.map((i) => i % W);
  const py = tiles.map((i) => (i - (i % W)) / W);
  let best = Math.min(n, 2);
  for (let a = 0; a + best < n; a++) {
    for (let b = a + best; b < n; b++) {
      const vx = px[b] - px[a];
      const vy = py[b] - py[a];
      const l = portable.sqrt(vx * vx + vy * vy);
      if (!(l > 0)) continue;
      let ok = true;
      for (let k = a + 1; k < b && ok; k++) if (Math.abs((px[k] - px[a]) * vy - (py[k] - py[a]) * vx) / l > 0.75) ok = false;
      if (ok) best = b - a + 1;
    }
  }
  return best;
}

export function planBadwater(h: Uint8Array, W: number, H: number, wetNow: ArrayLike<number>, hy: Pick<Hydro, "water" | "rivers">, ask: BadwaterAsk, seed: number, attempt: number, start: { x: number; y: number }): Hazards {
  const N = W * H;
  const avoid = new Uint8Array(N);
  const out: Hazards = { count: 0, features: [], avoid, heights: h };
  if (!(ask.count > 0)) return out;
  const rng = stream(seed, "badwater", attempt);
  const D = ask.distance;
  const sm = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) sm[y * W + x] = 1;
  const sd = distanceFrom(sm, W, H);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = wetNow[i] > 0.02 || hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  const dWet = distanceFrom(wet, W, H);
  // the start's water and what flows past it: badwater must join below it
  const startWater = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wet[i] && sd[i] <= 24) startWater[i] = 1;
  let hh = h;
  // (item 27: no ditch near a river's head at the edge, within the lip's reach: it took the head's
  // water off the map)
  const byMouth = new Uint8Array(N);
  for (const r of hy.rivers)
    for (const m of mouthTilesOf(r, W, H)) {
      const mx = m % W;
      const my = (m - mx) / W;
      for (let y = Math.max(0, my - LIP_REACH); y <= Math.min(H - 1, my + LIP_REACH); y++) for (let x = Math.max(0, mx - LIP_REACH); x <= Math.min(W - 1, mx + LIP_REACH); x++) byMouth[y * W + x] = 1;
    }
  // where a ditch may end (see the comments inside): a river's last stretch before it leaves the
  // map, off the start's water, never through a lake or a broad level reach; and the tiles it keeps
  // off (the start's ground, other water and the ring beside it)
  const outlets = (hh: Uint8Array, dn: ReturnType<typeof drainage>): { goal: Uint8Array; keepOff: Uint8Array } => {
    // (M9b, D294: a ditch into a stream that feeds a lake or a sea turned the whole of it to
    // badwater: it joins only a channel whose water leaves the map without passing a lake, else it
    // runs to the map edge by itself)
    // (and near where that water leaves: joined higher up, it turned the rest of the river purple,
    // the main river's whole lower course with it)
    const lakeFree = new Uint8Array(N);
    const toEdge = new Int32Array(N);
    for (let q = 0; q < dn.order.length; q++) {
      const j = dn.order[q];
      const r = dn.rcv[j];
      lakeFree[j] = hy.water[j] !== 2 && (r < 0 || lakeFree[r]) ? 1 : 0;
      toEdge[j] = r < 0 ? 0 : toEdge[r] + 1;
    }
    const lastStretch = Math.max(10, Math.round(0.12 * Math.min(W, H)));
    // (item 47, badwater contained: the last stretch measured along each river's own course to where
    // it leaves the map; the terrain's drainage alone took the stretch by a river's inflow, its head
    // at the edge, and the whole river ran purple from there)
    const exitEnd = new Uint8Array(N);
    for (const r of hy.rivers) {
      if (!("edge" in r.params.exit)) continue;
      const p = r.params.path;
      let s = 0;
      const reach = r.params.width / 2 + 1.5;
      for (let k = p.length - 1; k >= 0 && s <= lastStretch; k--) {
        if (k < p.length - 1) s += portable.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
        const [px, py] = p[k];
        for (let y = Math.max(0, Math.floor(py - reach)); y <= Math.min(H - 1, Math.ceil(py + reach)); y++)
          for (let x = Math.max(0, Math.floor(px - reach)); x <= Math.min(W - 1, Math.ceil(px + reach)); x++) if ((x - px) * (x - px) + (y - py) * (y - py) <= reach * reach) exitEnd[y * W + x] = 1;
      }
    }
    // (and never into a broad level reach: badwater mixes up a slack, level body as far as it goes,
    // and the whole lower course ran purple from a join by its exit)
    const body = new Int32Array(N).fill(-1);
    const bodySize: number[] = [];
    {
      const q = new Int32Array(N);
      for (let s0 = 0; s0 < N; s0++) {
        if (!wet[s0] || body[s0] >= 0) continue;
        const id = bodySize.length;
        let head = 0;
        let tail = 0;
        q[tail++] = s0;
        body[s0] = id;
        while (head < tail) {
          const c = q[head++];
          const x = c % W;
          const y = (c - x) / W;
          const sc = hh[c] + wetNow[c];
          for (const [dx, dy] of N4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const n = yy * W + xx;
            if (!wet[n] || body[n] >= 0 || Math.abs(hh[n] + wetNow[n] - sc) > 0.2) continue;
            body[n] = id;
            q[tail++] = n;
          }
        }
        bodySize.push(tail);
      }
    }
    const slack = Math.max(60, 4 * lastStretch);
    const goal = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (hy.water[j] === 1 && exitEnd[j] && lakeFree[j] && toEdge[j] <= lastStretch && !startWater[j] && sd[j] > D + 6 && bodySize[body[j]] <= slack) goal[j] = 1;
    const keepOff = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (sd[j] < D + 6 || startWater[j] || avoid[j] || ask.keepOff?.[j] || byMouth[j]) keepOff[j] = 1;
    // (on its way it never crosses nor runs beside other water: a ditch through a river higher up or
    // a lake turned them purple)
    for (let j = 0; j < N; j++) {
      if (!(hy.water[j] === 1 || hy.water[j] === 2) || goal[j]) continue;
      const x = j % W;
      const y = (j - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !goal[yy * W + xx]) keepOff[yy * W + xx] = 1;
        }
    }
      return { goal, keepOff };
  };
  // (item 47, badwater contained: how far a ditch from each tile would run to where it may end, a
  // river's last stretch or the map edge; pits near one rank first, so no ditch runs far across the
  // map poisoning the land along it)
  const ditchEst = new Float64Array(N).fill(Infinity);
  {
    const o = outlets(hh, drainage(hh, W, H, { eight: false }));
    const q = new Int32Array(N);
    let head = 0;
    let tail = 0;
    for (let j = 0; j < N; j++) {
      const x = j % W;
      const y = (j - x) / W;
      if (o.goal[j] || ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !o.keepOff[j])) {
        ditchEst[j] = 0;
        q[tail++] = j;
      }
    }
    while (head < tail) {
      const c = q[head++];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx;
        if (o.keepOff[n] || ditchEst[n] <= ditchEst[c] + 1) continue;
        ditchEst[n] = ditchEst[c] + 1;
        q[tail++] = n;
      }
    }
  }
  // candidate pit centres: beyond the distance, off the water, on ground that stands above its
  // surroundings (a hollow dug there keeps a rim two levels high). They aim at about the distance
  // (its pit and the soil it soaks a few tiles further out): the Badwater distance setting is how
  // far the colony's first badwater lies, and moves it (ROADMAP M6)
  const cands: [number, number][] = [];
  for (let y = 8; y < H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      if (sd[i] < D + 8 || dWet[i] < 9 || ask.keepOff?.[i]) continue;
      let lo = 99;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
      // (its pit two below the lowest ground round it, never below the beds' floor, item 47)
      if (lo < BED_FLOOR + 2) continue;
      cands.push([Math.abs(sd[i] - (D + 11)) + 8 * rng.float() - 0.3 * h[i] + 0.5 * Math.max(0, Math.min(ditchEst[i], 4 * W) - 10), i]);
    }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const placed: [number, number][] = [];
  // (item 47, badwater contained: a pit whose ditch runs far across the map poisons the land along
  // it; its ditch reaches a river's last stretch or the map edge within a quarter of the side, and
  // only where none does, farther)
  const maxDitch = Math.max(16, Math.round(0.25 * Math.min(W, H)));
  let cached: { hh: Uint8Array; dn: ReturnType<typeof drainage>; outs: { goal: Uint8Array; keepOff: Uint8Array } } | null = null;
  for (const limit of [maxDitch, Infinity])
  for (let c = 0; c < cands.length && c < 60 && out.count < ask.count; c++) {
    const i = cands[c][1];
    const cx = i % W;
    const cy = (i - cx) / W;
    if (placed.some(([px, py]) => Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 24)) continue;
    // where water on each tile goes (side to side, as the game's water moves), and where a ditch
    // may end: the same until a pit is dug (reused across candidates)
    if (!cached || cached.hh !== hh) {
      const d0 = drainage(hh, W, H, { eight: false });
      cached = { hh, dn: d0, outs: outlets(hh, d0) };
    }
    const dn = cached.dn;
    const passesStart = (from: number) => {
      for (let j = from, n = 0; j >= 0 && n < 4 * (W + H); j = dn.rcv[j], n++) if (sd[j] <= 26) return true;
      return false;
    };
    let lo = 99;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, hh[(cy + dy) * W + cx + dx]);
    const floor = lo - 2;
    const s = hash32(seed, "pit", attempt, out.count);
    // the pit: the 3×3 source and an irregular blob round it, radius 2.5–4
    const pit = new Uint8Array(N);
    const r0 = 2.6 + 1.2 * rng.float();
    // the fall of the ground round the pit (from its high side to its low), else east
    let gx = 0;
    let gy = 0;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        gx -= dx * hh[y * W + x];
        gy -= dy * hh[y * W + x];
      }
    const gl = portable.sqrt(gx * gx + gy * gy);
    const fx = gl > 0 ? gx / gl : 1;
    const fy = gl > 0 ? gy / gl : 0;
    const elong = 1.5 + 0.6 * rng.float();
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const inCore = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        // (M9b, D294: the hollows read as round red discs: the pit is long along the fall of the
        // ground, 1.5–2.1 times as long as wide, so the soil it stains runs down toward its ditch)
        const along = (x - cx) * fx + (y - cy) * fy;
        const across = -(x - cx) * fy + (y - cy) * fx;
        const e = portable.sqrt((along / elong) * (along / elong) + across * across * elong * 0.5);
        if (inCore || e < r0 * (1 + 0.35 * fbm(s, x, y, 4, 2))) pit[y * W + x] = 1;
      }
    // the ditch: from the pit's edge to a river channel (not the start's reach) or the map edge
    const edge: number[] = [];
    for (let y = Math.max(1, cy - 9); y <= Math.min(H - 2, cy + 9); y++)
      for (let x = Math.max(1, cx - 9); x <= Math.min(W - 2, cx + 9); x++) {
        const j = y * W + x;
        if (pit[j]) continue;
        if (N4.some(([dx, dy]) => pit[(y + dy) * W + x + dx])) edge.push(j);
      }
    const { goal, keepOff } = cached.outs;
    let clear = true;
    for (let j = 0; j < N && clear; j++) if (pit[j] && ask.keepOff?.[j]) clear = false;
    // (and the ground the basin keeps clear of resources, a square 5 tiles either way of its
    // middle, setpieces/badwaterBasin.ts `clears`: it took a player's forest beside the pit)
    if (ask.keepOff)
      for (let y = Math.max(0, cy - 5); y <= Math.min(H - 1, cy + 5) && clear; y++)
        for (let x = Math.max(0, cx - 5); x <= Math.min(W - 1, cx + 5) && clear; x++) if (ask.keepOff[y * W + x]) clear = false;
    if (!clear) continue;
    const straight = ditchRoute(hh, W, H, edge, pit, goal, keepOff, floor + 1, hash32(seed, "ditch", attempt, c));
    if (!straight || straight.tiles.length < 3 || straight.tiles.length > limit) continue;
    const onBorder = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      return x === 0 || y === 0 || x === W - 1 || y === H - 1;
    };
    const wound = windRoute(straight.tiles, W, H, (i) => !pit[i] && !keepOff[i], (i) => goal[i] === 1 || onBorder(i), stream(seed, "ditch-wave", attempt, c));
    // (D209: a ditch that could not be wound, running straight across a flat, is no gully: the
    // pit goes elsewhere)
    if (straightStretch(wound, W) > DITCH_STRAIGHT) continue;
    const route = { tiles: wound, end: wound[wound.length - 1] };
    // its water must never pass the start's water on the way out
    if (passesStart(route.end)) continue;
    // bed levels: the sill one above the floor, then never rising, cut two below the ground beside
    // (M9b, D302: cut one below, the water refilling it after a drought rose over its banks and
    // spread a sheet of badwater over the flat beside it, which stayed until the badtide)
    const tiles = route.tiles.slice(0, goal[route.end] ? route.tiles.length - 1 : route.tiles.length);
    if (tiles.length < 2) continue;
    const onDitch = new Set(tiles);
    const levels: number[] = [];
    let run = floor + 1;
    for (let k = 0; k < tiles.length; k++) {
      const j = tiles[k];
      const x = j % W;
      const y = (j - x) / W;
      let ring = hh[j];
      for (const [dx, dy] of N4) {
        const n = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (pit[n] || onDitch.has(n) || hy.water[n] === 1 || hy.water[n] === 2) continue;
        ring = Math.min(ring, hh[n]);
      }
      run = Math.min(run, ring - 2);
      if (run < BED_FLOOR) run = BED_FLOOR;
      levels.push(run);
    }
    const outlet: number[] = [];
    for (const j of tiles) outlet.push(j % W, Math.floor(j / W));
    const plan = { mode: "basin", x: cx - 1, y: cy - 1, floor, strength: ask.strength, outlet, outletLevels: levels, outletWidth: 1, outletTo: goal[route.end] ? "river" : "edge" };
    // dig it into a copy and prove it holds before touching the map
    const next = hh.slice();
    for (let j = 0; j < N; j++) if (pit[j]) next[j] = floor;
    for (let k = 0; k < tiles.length; k++) next[tiles[k]] = Math.min(next[tiles[k]], levels[k]);
    const bedKeys = channelTiles({ tiles: outlet, levels, width: 1, to: "" }, W, H).bed;
    let flat = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (next[(cy + dy) * W + cx + dx] !== floor) flat = false;
    if (!flat || basinLeak(plan, next, W, H)) continue;
    // banks: every tile beside the ditch stands above its bed
    let banks = true;
    for (let k = 0; k < tiles.length && banks; k++) {
      const j = tiles[k];
      const x = j % W;
      const y = (j - x) / W;
      for (const [dx, dy] of N4) {
        const n = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (pit[n] || bedKeys.has(n) || hy.water[n] === 1 || hy.water[n] === 2) continue;
        if (next[n] < levels[k] + 1) banks = false;
      }
    }
    if (!banks) continue;
    hh = next;
    for (let j = 0; j < N; j++) if (pit[j]) avoid[j] = 1;
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H) avoid[y * W + x] = 1;
    for (const j of bedKeys.keys()) avoid[j] = 1;
    const role = `setpiece/badwaterBasin/${out.count}`;
    const f: SetPieceFeature = {
      id: featureId(seed, "setPiece", role),
      kind: "setPiece",
      origin: "generated",
      role,
      locked: false,
      params: { kind: "badwaterBasin", request: { mode: "basin", at: [cx, cy], strength: ask.strength }, plan, report: ["a hollow found in the land: badwater rises in its pit and leaves by a winding ditch"] },
    };
    out.features.push(f);
    out.count++;
    placed.push([cx, cy]);
  }
  // fewer hollows fit than were asked for (a small map, few rises): the ones placed carry the
  // budget's total between them, each up to the builder's strongest, so the map's badwater stays
  // about what the official maps have for its size (D200)
  if (out.count > 0 && out.count < ask.count) {
    const each = Math.min(B.each.max, Math.max(ask.strength, Math.floor((ask.count * ask.strength) / out.count / B.each.step) * B.each.step));
    for (const f of out.features) {
      if (f.kind !== "setPiece") continue;
      (f.params.plan as { strength: number }).strength = each;
      (f.params.request as { strength: number }).strength = each;
    }
  }
  out.heights = hh;
  return out;
}
