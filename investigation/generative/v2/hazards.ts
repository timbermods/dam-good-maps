// Threats found in the terrain. Badwater rises in a hollow on high ground (a pit dug two levels into
// the rock, its outline irregular) and drains by its own winding ditch down the slope to a river
// below the start's water, so the colony meets it later, downstream or across the valley. The
// containment rule is the product's (`water.badwater_contained`): with the outlet blocked, the
// water rising in the pit cannot leave its rim, so a levee on the ditch is the counterplay. The
// set piece carries the pit's source, floor and outlet; the pit's own shape is the terrain's
// (docs/m9-design.md: the refinement's natural pits use the same rule with the pit's outline).

import type { BuildResult } from "../../../src/core/features/build";
import { featureId } from "../../../src/core/features/ids";
import { channelTiles } from "../../../src/core/features/route";
import type { Feature, SetPieceFeature } from "../../../src/core/features/schema";
import { density } from "../../../src/core/gen/calibrated";
import { hash32 } from "../../../src/core/math/hash";
import { distanceFrom, MinHeap } from "../../../src/core/math/grid";
import { fbm } from "../../../src/core/math/noise";
import { stream } from "../../../src/core/math/rng";
import type { MapSpec } from "../../../src/core/spec/mapspec";
import { basinLeak } from "../../../src/core/validate/playability";
import type { Genome } from "../proto/genome";
import type { Hydro } from "./hydro";
import { dist } from "../proto/num";
import { drainage } from "../proto/erode";

export interface Hazards {
  kind: "none" | "pit";
  features: Feature[];
  /** The terrain with the pit and its ditch dug (the input when there is none). */
  heights: Uint8Array;
  /** Tiles the objects and resources keep off (the pit, its rim and its ditch). */
  avoid: Uint8Array;
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The route of a ditch from the pit's edge down to a river or the map edge: side-to-side steps,
 *  cheapest where the ground falls, never near the start. */
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
      const nk = k + 1 + 3 * rise + 1.6 * (1 + fbm(wander, xx, yy, 5, 2));
      if (nk < cost[n]) {
        cost[n] = nk;
        prev[n] = c;
        heap.push(nk, n);
      }
    }
  }
  return null;
}

export function planBadwater(h: Uint8Array, W: number, H: number, base: BuildResult, hy: Hydro, g: Genome, spec: MapSpec, seed: number, attempt: number, start: { x: number; y: number }): Hazards {
  const N = W * H;
  const avoid = new Uint8Array(N);
  const none: Hazards = { kind: "none", features: [], avoid, heights: h };
  if (g.hazards.badwater === "none") return none;
  const rng = stream(seed, "badwater", attempt);
  const D = spec.settings.hazards.badwaterDistance;
  const sm = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) sm[y * W + x] = 1;
  const sd = distanceFrom(sm, W, H);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = base.water[i] > 0.02 || hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  const dWet = distanceFrom(wet, W, H);
  // the start's water and what flows past it: badwater must join below it
  const startWater = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wet[i] && sd[i] <= 24) startWater[i] = 1;
  // the flow on the map, for a first guess of where a ditch's water goes
  const flow = density("water_strength_per_10k", N) * (N / 1e4) * g.hydro.flowMul;
  const strength = Math.round(Math.min(2, Math.max(1, g.hazards.ratio * 0.65 * flow)) * 100) / 100;
  // where water on each tile goes (side to side, as the game's water moves)
  const dn = drainage(h, W, H, { eight: false });
  const passesStart = (from: number) => {
    for (let j = from, n = 0; j >= 0 && n < 4 * (W + H); j = dn.rcv[j], n++) if (sd[j] <= 26) return true;
    return false;
  };
  // candidate pit centres: far enough from the start, off the water, on ground that stands above
  // its surroundings (a hollow dug there keeps a rim two levels high)
  const cands: [number, number][] = [];
  for (let y = 8; y < H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      if (sd[i] < D + 14 || dWet[i] < 9) continue;
      let lo = 99;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
      if (lo < 3) continue;
      cands.push([Math.abs(sd[i] - (D + 20)) + 8 * rng.float() - 0.3 * h[i], i]);
    }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const s = hash32(seed, "pit", attempt);
  for (let c = 0; c < cands.length && c < 40; c++) {
    const i = cands[c][1];
    const cx = i % W;
    const cy = (i - cx) / W;
    let lo = 99;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, h[(cy + dy) * W + cx + dx]);
    const floor = lo - 2;
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
    for (let j = 0; j < N; j++) if (sd[j] < D + 6 || startWater[j]) keepOff[j] = 1;
    const route = ditchRoute(h, W, H, edge, pit, goal, keepOff, floor + 1, hash32(seed, "ditch", attempt, c));
    if (!route || route.tiles.length < 3) continue;
    // its water must never pass the start's water on the way out
    if (passesStart(route.end)) continue;
    // bed levels: the sill one above the floor, then never rising, cut one below the ground beside
    const tiles = route.tiles.slice(0, goal[route.end] ? route.tiles.length - 1 : route.tiles.length);
    if (tiles.length < 2) continue;
    const levels: number[] = [];
    let run = floor + 1;
    for (let k = 0; k < tiles.length; k++) {
      const j = tiles[k];
      const x = j % W;
      const y = (j - x) / W;
      let ring = h[j];
      for (const [dx, dy] of N4) {
        const n = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (pit[n] || tiles.includes(n) || hy.water[n] === 1 || hy.water[n] === 2) continue;
        ring = Math.min(ring, h[n]);
      }
      run = Math.min(run, ring - 1);
      if (run < 0) run = 0;
      levels.push(run);
    }
    const outlet: number[] = [];
    for (const j of tiles) outlet.push(j % W, Math.floor(j / W));
    const plan = { mode: "basin", x: cx - 1, y: cy - 1, floor, strength, outlet, outletLevels: levels, outletWidth: 1, outletTo: goal[route.end] ? "river" : "edge" };
    // dig it into a copy and prove it holds before touching the map
    const hh = h.slice();
    for (let j = 0; j < N; j++) if (pit[j]) hh[j] = floor;
    for (let k = 0; k < tiles.length; k++) hh[tiles[k]] = Math.min(hh[tiles[k]], levels[k]);
    const bedKeys = channelTiles({ tiles: outlet, levels, width: 1, to: "" }, W, H).bed;
    let flat = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (hh[(cy + dy) * W + cx + dx] !== floor) flat = false;
    if (!flat || basinLeak(plan, hh, W, H)) continue;
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
        if (hh[n] < levels[k] + 1) banks = false;
      }
    }
    if (!banks) continue;
    for (let j = 0; j < N; j++) if (pit[j]) avoid[j] = 1;
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H) avoid[y * W + x] = 1;
    for (const j of bedKeys.keys()) avoid[j] = 1;
    const role = "setpiece/badwaterBasin/0";
    const f: SetPieceFeature = {
      id: featureId(seed, "setPiece", role),
      kind: "setPiece",
      origin: "generated",
      role,
      locked: false,
      params: { kind: "badwaterBasin", request: { mode: "basin", at: [cx, cy], strength }, plan, report: ["a natural hollow found in the terrain (prototype)"] },
    };
    return { kind: "pit", features: [f], avoid, heights: hh };
  }
  return none;
}
