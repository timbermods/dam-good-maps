// Badwater found in the terrain (docs/m9-design.md §4.8; D200: badwater on every map). Badwater
// rises in a hollow on high ground (a pit dug two levels into the rock, its outline irregular) and
// drains by its own winding ditch down the slope to a river below the start's water, or to the
// map's edge, so the colony meets it later, downstream or across the valley, as a threat and a
// late-game resource. The containment rule is the product's (`water.badwater_contained`): with the
// outlet blocked, the water rising in the pit cannot leave its rim, so a levee on the ditch is the
// counterplay. The set piece carries the pit's source, floor and outlet; the pit's own shape is the
// terrain's, which the generated field holds.
//
// Every map gets `count` hollows unless its player chose No badwater (D200), each beyond the
// difficulty's badwater distance from the start (plus the reach of its water and soil), apart from
// each other. The ditch winds (noise in its route's cost) and never runs ruler-straight (D209).
//
// Ported from the design version 2 prototype (investigation/generative/v2/hazards.ts).

import { featureId } from "../features/ids";
import { OFFICIAL_BADWATER as B } from "../gen/calibrated";
import { channelTiles } from "../features/route";
import type { Feature, SetPieceFeature } from "../features/schema";
import { hash32 } from "../math/hash";
import { distanceFrom, MinHeap } from "../math/grid";
import { fbm } from "../math/noise";
import { PI, sinDet, TWO_PI } from "../math/detmath";
import { stream, type Rng } from "../math/rng";
import { basinLeak } from "../validate/playability";
import { drainage } from "./drainage";
import type { Hydro } from "./hydro";
import { dist, N4 } from "./num";

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
  /** Tiles no pit or ditch may take (a regeneration's constraints, PLAN §7.0). */
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

/** A ditch's route wound like a gully (D209: badwater streams never run ruler-straight). A ditch
 *  across a flat to the nearest map edge is otherwise a straight line (any sideways step only adds
 *  length). The line of its tiles, smoothed, is moved sideways by a wave (up to 2.5 tiles, 9–15
 *  tiles long, none at either end) and drawn again as side-to-side steps; it ends at the first goal
 *  or map-edge tile it meets. Kept only if every tile is allowed; otherwise the route as it was. */
function windRoute(tiles: readonly number[], W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, rng: Rng): number[] {
  const n = tiles.length;
  if (n < 8) return tiles.slice();
  const wave = 9 + 6 * rng.float();
  const phase = TWO_PI * rng.float();
  const amp = Math.min(2.5, n / 6);
  // the wave as drawn, else the other way round, else half as wide
  for (const [a, p] of [[amp, phase], [amp, phase + PI], [amp / 2, phase], [amp / 2, phase + PI]]) {
    const out = windOnce(tiles, W, H, allowed, isEnd, wave, p, a);
    if (out) return out;
  }
  return tiles.slice();
}

function windOnce(tiles: readonly number[], W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, wave: number, phase: number, amp: number): number[] | null {
  const n = tiles.length;
  const px = tiles.map((i) => i % W);
  const py = tiles.map((i) => (i - (i % W)) / W);
  // the smoothed line: a moving average over 7 tiles
  const sx: number[] = [];
  const sy: number[] = [];
  for (let k = 0; k < n; k++) {
    let ax = 0;
    let ay = 0;
    let c = 0;
    for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) {
      ax += px[j];
      ay += py[j];
      c++;
    }
    sx.push(ax / c);
    sy.push(ay / c);
  }
  const out: number[] = [tiles[0]];
  let cx = px[0];
  let cy = py[0];
  for (let k = 1; k < n; k++) {
    const k0 = Math.max(0, k - 2);
    const k1 = Math.min(n - 1, k + 2);
    const tx = sx[k1] - sx[k0];
    const ty = sy[k1] - sy[k0];
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    const off = amp * sinDet((PI * k) / (n - 1)) * sinDet((TWO_PI * k) / wave + phase);
    const x = k === n - 1 ? px[k] : Math.round(sx[k] - (ty / tl) * off);
    const y = k === n - 1 ? py[k] : Math.round(sy[k] + (tx / tl) * off);
    while (cx !== x || cy !== y) {
      if (Math.abs(x - cx) >= Math.abs(y - cy)) cx += Math.sign(x - cx);
      else cy += Math.sign(y - cy);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
      const i = cy * W + cx;
      if (!allowed(i)) return null;
      // a loop is cut back to where it began
      const at = out.indexOf(i);
      if (at >= 0) out.length = at + 1;
      else out.push(i);
      if (isEnd(i)) return out;
    }
  }
  return out;
}

export function planBadwater(h: Uint8Array, W: number, H: number, wetNow: ArrayLike<number>, hy: Pick<Hydro, "water">, ask: BadwaterAsk, seed: number, attempt: number, start: { x: number; y: number }): Hazards {
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
      if (lo < 3) continue;
      cands.push([Math.abs(sd[i] - (D + 11)) + 8 * rng.float() - 0.3 * h[i], i]);
    }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const placed: [number, number][] = [];
  for (let c = 0; c < cands.length && c < 60 && out.count < ask.count; c++) {
    const i = cands[c][1];
    const cx = i % W;
    const cy = (i - cx) / W;
    if (placed.some(([px, py]) => Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 24)) continue;
    // where water on each tile goes (side to side, as the game's water moves)
    const dn = drainage(hh, W, H, { eight: false });
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
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const inCore = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        if (inCore || dist(x, y, cx, cy) < r0 * (1 + 0.35 * fbm(s, x, y, 4, 2))) pit[y * W + x] = 1;
      }
    // the ditch: from the pit's edge to a river channel (not the start's reach) or the map edge
    const edge: number[] = [];
    for (let y = cy - 5; y <= cy + 5; y++)
      for (let x = cx - 5; x <= cx + 5; x++) {
        const j = y * W + x;
        if (pit[j]) continue;
        if (N4.some(([dx, dy]) => pit[(y + dy) * W + x + dx])) edge.push(j);
      }
    const goal = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (hy.water[j] === 1 && !startWater[j] && sd[j] > D + 6) goal[j] = 1;
    const keepOff = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (sd[j] < D + 6 || startWater[j] || avoid[j] || ask.keepOff?.[j]) keepOff[j] = 1;
    let clear = true;
    for (let j = 0; j < N && clear; j++) if (pit[j] && ask.keepOff?.[j]) clear = false;
    if (!clear) continue;
    const straight = ditchRoute(hh, W, H, edge, pit, goal, keepOff, floor + 1, hash32(seed, "ditch", attempt, c));
    if (!straight || straight.tiles.length < 3) continue;
    const onBorder = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      return x === 0 || y === 0 || x === W - 1 || y === H - 1;
    };
    const wound = windRoute(straight.tiles, W, H, (i) => !pit[i] && !keepOff[i], (i) => goal[i] === 1 || onBorder(i), stream(seed, "ditch-wave", attempt, c));
    const route = { tiles: wound, end: wound[wound.length - 1] };
    // its water must never pass the start's water on the way out
    if (passesStart(route.end)) continue;
    // bed levels: the sill one above the floor, then never rising, cut one below the ground beside
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
      run = Math.min(run, ring - 1);
      if (run < 0) run = 0;
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
