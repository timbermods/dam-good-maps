// Stage 2 of the wall with one gate (docs/PREMISES.md §5.1, §2.2): the land round stage 1's water. The shared relief
// (`raster/relief.ts` `reliefBetween`) draws the valley as it draws any premise's (the lake's meadow, the brooks'
// valleys, the outlands as plates, the spur the Low River cuts as a crag), given the spur alone of the plan's ridges.
// Over it this lays what is the gate's own, in the plan's local frame (u along the wall, v toward the basin):
//
// - the wall: every tile of the crest band at the crest's level, the Pass's span at the Pass, both faces one sheer step
//   (no ledge): the valley's foot capped a step of 8 or more under the crest, the basin's floor 9 or more under it;
// - the basin: a bowl under the lake's sill + 1, its beds cut three wide at the least, its floor in river terraces along
//   the Gate Bed and the Pass Bed (a low terrace two over the bed within 4 tiles, two more within 10, then broad plates
//   at either level out to the rim): the steps follow the beds, never the wall, two levels each;
// - the rim along the basin's far edges and down its sides to the wall's back, sheer, but for the one notch;
// - the valley closed at the megadam's level all round but for the Low River's gorge: a band along its map edges
//   stands a level over the megadam's water where the shared outlands fall away to the edge.
//
// Every tile stage 1 fixed keeps its ground, and every other stands at least at its guard. The seeps (§5.1's hollows
// on the basin's flats) are not drawn yet.

import { BED_FLOOR } from "../land/genome";
import { fbm } from "../math/noise";
import { badwaterNiches, reliefBetween } from "./raster/relief";
import { layWorks } from "./ladder";
import type { PremiseLand } from "./map";
import { frameAt, openingCamera, VISTA_ZOOM } from "../analysis/opening";
import type { MapSpec } from "../spec/mapspec";
import { checkFrame } from "./frame";
import type { InvariantResult } from "./types";
import { seedOf } from "./raster/field";
import { dist, pathDist, pointAt } from "./geom";
import { sqrt } from "../math/portable";
import type { ReliefStyle } from "./style";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";
import { bandAt, gateOf, localRuns, onLocal, onMap, NOTCH, RIM_MOST, turnOf, type GateNumbers } from "./premises/wallGate";

/** The basin's terraces along its beds (§5.1): a low terrace `low` over the bed within `lowReach` tiles, one more
 *  within `highReach`, then broad warped plates from `low` to `low + flats` over the bed, under the sill + 1. */
export const TERRACES = { bedReach: 1, low: 2, lowReach: 4, high: 4, highReach: 10, plate: 26 } as const;
/** How far into the valley the wall's foot is held a step of `VALLEY_FACE` under the crest, rising a level every
 *  `FOOT_RISE` tiles past it. */
const FOOT = { reach: 6, rise: 3 } as const;
/** How far under the crest the valley's land stands at most (the wall the map's one great feature). */
export const UNDER_CREST = 5;
/** The band along the valley's map edges held over the megadam's water, in tiles. */
const RING = 6;

export interface GateZones {
  /** 0 the valley, 1 the wall's crest band, 2 the basin (its rim included), per tile. */
  zone: Uint8Array;
  /** 1 on the rim, per tile. */
  rim: Uint8Array;
  /** Each tile's local frame: v less the wall's face there (negative in the valley). */
  fromFace: Float32Array;
}

/** The rim's width at a place along it (4 to 14 tiles, `RIM_WIDTH`), from coarse noise and a finer swing, so its inner
 *  face wanders and no run of it is straight for long. */
export const RIM_WIDTH = [4, 14] as const;
/** Each far corner of the basin is cut by a buttress: the rim's ground within this many tiles of the corner (u + v). */
export const RIM_CORNER = 24;
const RIM_SIDE_WAVE = 10;
/** How far the rim's width wanders over the whole rim, at the least. */
const RIM_SWING = 6;
function rimWidth(seed: number, t: number, cell = 26): number {
  // (the coarse swing stretched to the whole span: fbm keeps near its middle, and a rim 7 to 11 wide read as a band)
  const a = fbm(seed, t, 0.5, cell, 2);
  const b = fbm(seed + 7, t, 3.5, 6, 2) + 0.5 * fbm(seed + 11, t, 1.5, 3, 1);
  const mid = (RIM_WIDTH[0] + RIM_WIDTH[1]) / 2;
  // (folded back at the ends of the span, not clamped: a clamp held one width for a long run)
  const span = RIM_WIDTH[1] - RIM_WIDTH[0];
  const raw = mid + (2.4 * span * a) / 2 + 3 * b - RIM_WIDTH[0];
  const m = ((raw % (2 * span)) + 2 * span) % (2 * span);
  return Math.round(RIM_WIDTH[0] + (m > span ? 2 * span - m : m));
}

/** The rim's crest at a tile: its level, a level under or over it where coarse noise sinks or lifts it. */
export function rimCrest(plan: PremisePlan, g: GateNumbers, x: number, y: number): number {
  // (stretched: fbm keeps near its middle, and the crest held one level over most of the rim)
  const c = Math.max(0, Math.min(0.999, 0.5 + 1.4 * fbm(seedOf(plan, "gate", "crest"), x, y, 16, 2)));
  // (three levels from about a level under the plan's rim, never under the bowl's least nor within three of the
  // wall's crest)
  const lo = Math.max(RIM_LEAST, Math.min(g.rim - 1, g.crest - 5));
  return Math.min(g.crest - 3, lo + Math.floor(c * 3));
}

/** Each tile's zone in the gate's layout. */
export function gateZones(plan: PremisePlan, g: GateNumbers = gateOf(plan)!, beds?: Uint8Array): GateZones {
  const { W, H } = plan;
  const N = W;
  const T = turnOf(plan, g);
  const runs = localRuns(plan, g);
  const zone = new Uint8Array(W * H);
  const rim = new Uint8Array(W * H);
  const fromFace = new Float32Array(W * H);
  const nu = onLocal(T, g.notch.at)[0];
  const sRim = seedOf(plan, "gate", "rim");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      const [lo, hi] = bandAt(runs, u);
      fromFace[i] = v - lo;
      zone[i] = v < lo ? 0 : v < hi ? 1 : 2;
      if (zone[i] !== 2) continue;
      // (the rim's width wanders 4 to 14 along it, and a buttress breaks each far corner: a ruled band of one width
      // made the wall and the rim a box, planning 2026-11-11)
      const far = v >= N - rimWidth(sRim, u);
      // (a side is short: its swing a shorter wave, so it too wanders the span)
      const side = u < rimWidth(sRim + 1, v, RIM_SIDE_WAVE) || u >= N - rimWidth(sRim + 2, v, RIM_SIDE_WAVE);
      const corner = u + (N - v) <= RIM_CORNER || N - u + (N - v) <= RIM_CORNER;
      // (and any of the beds' own ground that reaches the far edge: the notch is theirs)
      const notch = v >= N - RIM_MOST - 1 && (Math.abs(u - nu) <= NOTCH / 2 + 0.5 || (beds?.[i] ?? 0) > 0);
      if ((far || side || corner) && !notch) rim[i] = 1;
    }
  return { zone, rim, fromFace };
}

/** 1 on stage 1's ground of the basin's beds (the Gate's and the leat's channels, their wadi strips): fixed, not lake. */
export function bedGround(plan: PremisePlan, w: StageWater): Uint8Array {
  const g = gateOf(plan)!;
  const r = w.raster;
  const out = new Uint8Array(plan.W * plan.H);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const ours = new Set([li(g.gate), li(g.leat)]);
  for (let i = 0; i < out.length; i++) if (ours.has(r.channel[i]) || (r.fixed[i] && !r.lake[i] && !r.channel[i] && !r.pool[i] && !r.crest[i] && r.heights[i] <= g.sill)) out[i] = 1;
  return out;
}

/** Stage 2 of a gate plan: the whole map's ground round stage 1's water. */
export function gateRelief(plan: PremisePlan, w: StageWater, style?: ReliefStyle): Uint8Array {
  const g = gateOf(plan);
  if (!g) return reliefBetween(plan, w, style);
  const { W, H } = plan;
  const r = w.raster;
  // the shared relief, the spur its only ridge: the wall and the rim are the gate's own rasters
  const h = reliefBetween({ ...plan, ridges: plan.ridges.filter((x) => x.id === g.spur) }, w, style);
  const { zone, rim } = gateZones(plan, g, bedGround(plan, w));
  const T = turnOf(plan, g);
  const span = g.passSpan.map((p) => onLocal(T, p)[0]);
  const [p0, p1] = [Math.min(...span), Math.max(...span)];
  const sPlate = seedOf(plan, "gate", "plate");
  const sWarp = seedOf(plan, "gate", "warp");
  // the basin's beds (the Gate Bed and the Pass Bed): each basin tile's nearest and how far
  const N = W * H;
  const { dist, bed } = basinBeds(plan, w, zone);
  const rings = basinRings(plan, w, zone, rim);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const top = g.floor[1];
  const water = (i: number) => r.lake[i] || r.channel[i] || r.pool[i] || r.crest[i];
  const toWall = wallDistance(plan, zone);
  const spur = plan.ridges.find((x) => x.id === g.spur);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (zone[i] === 1) {
      // (the crest band whole, but its water: stage 1's wadi strips and a lip's shoulders beside the slot or the cleft
      // would cut it)
      if (water(i)) continue;
      const [u] = onLocal(T, [x + 0.5, y + 0.5]);
      h[i] = u >= p0 && u <= p1 ? g.pass : g.crest;
      continue;
    }
    if (r.fixed[i]) continue;
    if (zone[i] === 2) {
      if (rim[i]) h[i] = rimCrest(plan, g, x, y);
      else {
        const d = dist[i];
        const b = bed[i] === bed[i] && d < Infinity ? bed[i] : BED_FLOOR;
        // (a dried lake bed: the floor falls in closed, wandering rings to one pan on the Gate Bed near its end; the beds
        // cut three wide through the rings and two deep at the least where the rings stand over them)
        const ring = rings.level[i];
        h[i] = d <= TERRACES.bedReach ? Math.max(BED_FLOOR, b) : d <= TERRACES.lowReach && ring >= b + 1 ? Math.min(top, Math.max(ring, b + TERRACES.low)) : ring;
      }
    } else {
      // the valley: the wall's foot a sheer step under the crest, rising slowly away from it (read from the nearest
      // wall tile, so a jog's side face is sheer too)
      const d = toWall[i];
      if (d < FOOT.reach) h[i] = Math.min(h[i], g.crest - 8 + Math.floor(Math.max(0, d - 1) / FOOT.rise));
      // the wall the map's one great feature: the valley's land (a style's uplands rise to the highest ground) stands
      // `UNDER_CREST` or more under the crest
      h[i] = Math.min(h[i], g.crest - UNDER_CREST);
      // the spur over the megadam's water by three, whole across the valley (the Low River's gorge through it)
      if (spur && pathDist(x + 0.5, y + 0.5, spur.path).d < spur.half) h[i] = Math.max(h[i], spur.top);
      // the valley's edges a level over the megadam's water (the megadam's rung holds the valley)
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge < RING && !nearLink(r, i, li(g.low), W, H, 4)) h[i] = Math.max(h[i], g.megadam + 1);
    }
    // (every tile at least its guard)
    if (h[i] < r.heights[i]) h[i] = r.heights[i];
  }
  return h;
}

/** Each valley tile's distance to the nearest tile of the wall's crest band (chamfer), Infinity elsewhere. */
function wallDistance(plan: PremisePlan, zone: Uint8Array): Float32Array {
  const { W, H } = plan;
  const d = new Float32Array(W * H).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) if (zone[i] === 1) (d[i] = 0), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    if (d[i] > FOOT.reach + 1) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (zone[j] !== 0) continue;
        const nd = d[i] + (dx && dy ? 1.4142 : 1);
        if (nd < d[j] - 1e-6) {
          d[j] = nd;
          queue.push(j);
        }
      }
  }
  return d;
}

/** Whether a tile stands within `d` tiles of a link's channel. */
function nearLink(r: StageWater["raster"], i: number, li: number, W: number, H: number, d: number): boolean {
  const x = i % W;
  const y = (i - x) / W;
  for (let yy = Math.max(0, y - d); yy <= Math.min(H - 1, y + d); yy++)
    for (let xx = Math.max(0, x - d); xx <= Math.min(W - 1, x + d); xx++) if (r.channel[yy * W + xx] === li) return true;
  return false;
}

/** A gate plan's land as `map.ts` `premiseLand` makes the lake stair's: its relief (stage 2), the permanent badwater's
 *  niche cut into it and the works' own ground (`layWorks`), for `premiseMap`. */
export function gateLand(plan: PremisePlan, water: StageWater, style?: ReliefStyle): PremiseLand {
  const notes: string[] = [];
  const heights = gateRelief(plan, water, style);
  const niches = badwaterNiches(plan, water, heights, notes);
  const laid = layWorks(plan, water, heights);
  return { water, heights, niches, laid, notes };
}

// ------------------------------------------------------------------------------------------------- the land's invariants

/** What a land invariant reads: stage 1's water and stage 2's ground. `StageContext` has no ground yet (§5.1 "As built
 *  (relief)" says the edit), so these run by `gateLandFailures`, not with the def's `land` invariants. */
export interface GateLandContext {
  spec: MapSpec;
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
}

export interface GateLandInvariant {
  id: string;
  test(ctx: GateLandContext): InvariantResult;
}

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });
const N4 = (W: number, H: number, i: number): number[] => {
  const x = i % W;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (i >= W) out.push(i - W);
  if (i < W * (H - 1)) out.push(i + W);
  return out;
};

/** `wall.faces` (§5.1): both faces one sheer step: under every crest tile beside the valley the valley's ground 8 or
 *  more down, beside the basin its floor 9 or more down (no ledge); the Pass's dip, the water's own tiles and the rim
 *  where it meets the wall's back aside. */
const wallFaces: GateLandInvariant = {
  id: "wall.faces",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone, rim } = gateZones(plan, g, bedGround(plan, water));
    const spur = plan.ridges.find((x) => x.id === g.spur);
    for (let i = 0; i < W * H; i++) {
      if (zone[i] !== 1 || r.fixed[i] || heights[i] !== g.crest) continue;
      for (const j of N4(W, H, i)) {
        if (r.fixed[j] || zone[j] === 1 || rim[j]) continue;
        // (the spur and the band along the valley's map edges meet the wall by design: the megadam's rung)
        const jx = j % W;
        const jy = Math.floor(j / W);
        if (zone[j] === 0 && (Math.min(jx, jy, W - 1 - jx, H - 1 - jy) < RING || (spur && pathDist(jx + 0.5, jy + 0.5, spur.path).d < spur.half))) continue;
        const step = heights[i] - heights[j];
        const want = zone[j] === 0 ? VALLEY_STEP : BASIN_STEP;
        if (step < want) return fail(`The wall's ${zone[j] === 0 ? "valley" : "basin"} face steps ${step} at ${i % W}, ${Math.floor(i / W)} (${want} or more)`);
      }
    }
    return OK;
  },
};
const VALLEY_STEP = 8;
const BASIN_STEP = 9;

/** `wall.camera`, its land half (§5.1: "from the opening camera at the vista's zoom the crest crosses the frame from
 *  edge to edge"): the crest in that frame spans 60 % or more of its width. The wall runs 35° off square to the look,
 *  so it leaves the frame by its top on the far side, and at 128² the vista's frame is wider than the map: edge to
 *  edge does not hold for a wall the map's own width. */
const wallCamera: GateLandInvariant = {
  id: "wall.camera",
  test({ plan, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const { zone } = gateZones(plan, g);
    const cam = openingCamera(plan.frame.start, VISTA_ZOOM);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < W * H; i++) {
      // (the crest itself: its band's rock at the crest's level, not the cuts and the Pass)
      if (zone[i] !== 1 || heights[i] < g.crest) continue;
      const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, heights[i]);
      if (!p || Math.abs(p.v) > 1 || Math.abs(p.u) > 1) continue;
      lo = Math.min(lo, p.u);
      hi = Math.max(hi, p.u);
    }
    const span = hi > lo ? (hi - lo) / 2 : 0;
    return span >= CREST_SPAN ? OK : fail(`From the opening camera the crest spans ${Math.round(100 * span)} % of the frame's width (${100 * CREST_SPAN} % or more)`);
  },
};
const CREST_SPAN = 0.6;

/** `gate.slot`, its land half (§5.1): through the crest band only the Gate's slot goes down to the meadow (the cleft, the
 *  Veil's mouth and the leat stand high on the crest), its floor at or under the lake's sill and both its walls the
 *  crest's level. The Veil's plunge pool may lap the face's first tile under the lip: a foot, not a way through. */
const gateSlot: GateLandInvariant = {
  id: "gate.slot",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone, fromFace } = gateZones(plan, g);
    const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
    const leat = plan.links.findIndex((l) => l.id === g.leat) + 1;
    let slot = 0;
    for (let i = 0; i < W * H; i++) {
      if (zone[i] !== 1) continue;
      // (the leat's own cut: along the crest, and its cascade down the basin's face at the Pass)
      if (r.channel[i] === leat) continue;
      if (r.channel[i] === gate) {
        slot++;
        if (heights[i] > g.sill) return fail(`The Gate's slot floor stands at ${heights[i]} in the wall, over the lake's sill (${g.sill})`);
        for (const j of N4(W, H, i)) if (zone[j] === 1 && r.channel[j] !== gate && !r.fixed[j] && heights[j] !== g.crest) return fail(`The Gate's slot wall stands at ${heights[j]}, not the crest's ${g.crest}`);
      } else if (heights[i] <= g.sill + 1 && !(r.lake[i] && fromFace[i] < 1)) return fail(`The wall is cut to ${heights[i]} at ${i % W}, ${Math.floor(i / W)}, outside the Gate's slot`);
    }
    return slot ? OK : fail("No slot through the wall");
  },
};

/** `basin.bowl`, its land half (§5.1): every basin floor tile at or under the lake's sill + 1; the rim, 12 or more,
 *  along the basin's far edges and down its sides (a bed wandering into its inner edge aside); on the map's far edge
 *  only one notch open, the beds' own. */
const basinBowl: GateLandInvariant = {
  id: "basin.bowl",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone, rim } = gateZones(plan, g, bedGround(plan, water));
    const T = turnOf(plan, g);
    const open: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (zone[i] !== 2) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      if (v >= W - 1 && heights[i] < RIM_LEAST) open.push(u);
      if (rim[i]) {
        if (heights[i] < RIM_LEAST && !r.fixed[i]) return fail(`The rim stands at ${heights[i]} at ${x}, ${y} (${RIM_LEAST} or more)`);
      } else if (!r.fixed[i] && r.heights[i] <= g.sill + 1 && heights[i] > g.sill + 1) return fail(`The basin's floor stands at ${heights[i]} at ${x}, ${y}, over the lake's sill + 1 (${g.sill + 1})`);
      // (a tile stage 1's guard holds over the sill + 1 is a bed's bank, the leat's cascade down the basin's face)
    }
    // (the far edge's open tiles one run, as wide as the notch and two more at most)
    open.sort((p, q) => p - q);
    for (let k = 1; k < open.length; k++) if (open[k] - open[k - 1] > 1.01) return fail("The basin's far edge is open in more than one place");
    if (open.length > NOTCH + 2) return fail(`The notch is ${open.length} tiles wide on the map's edge (${NOTCH + 2} at most)`);
    return OK;
  },
};
const RIM_LEAST = 12;

/** `basin.rings` (§5.1, planning 2026-11-11: "a dried lake bed"): the floor falls in three or more closed, wandering
 *  rings to one pan on the Gate Bed: for each ring's level, the floor at or under it round the pan (the beds aside: the
 *  old river runs through) reaches neither the wall nor the rim, and no ring's edge runs straight for more than
 *  `RING_STRAIGHT` tiles; and the pan is one. */
const basinRings_: GateLandInvariant = {
  id: "basin.rings",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone, rim } = gateZones(plan, g, bedGround(plan, water));
    const beds = bedGround(plan, water);
    const floor = (i: number) => zone[i] === 2 && !rim[i] && !beds[i] && !r.fixed[i];
    const { pan } = basinRings(plan, water, zone, rim);
    const p0 = Math.floor(pan[1]) * W + Math.floor(pan[0]);
    // (the pan: the floor tile nearest the pan's middle at the lowest ring's level)
    let start = -1;
    let best = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (!floor(i) || heights[i] > RINGS[0][1]) continue;
      const d = Math.abs((i % W) - (p0 % W)) + Math.abs(Math.floor(i / W) - Math.floor(p0 / W));
      if (d < best) [best, start] = [d, i];
    }
    if (start < 0 || best > PAN_NEAR) return fail("No pan on the basin's floor by the Gate Bed");
    let closed = 0;
    for (const [, level] of RINGS) {
      const seen = new Uint8Array(W * H);
      const q = [start];
      seen[start] = 1;
      let open = false;
      while (q.length && !open) {
        const i = q.pop()!;
        for (const j of N4(W, H, i)) {
          if (seen[j]) continue;
          if (zone[j] !== 2 || rim[j]) {
            if (heights[j] <= level) open = true;
            continue;
          }
          if (beds[j] || r.fixed[j]) continue;
          if (heights[j] > level) continue;
          seen[j] = 1;
          q.push(j);
        }
        const x = i % W;
        const y = (i - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
      }
      if (!open) closed++;
    }
    if (closed < RINGS.length) return fail(`${closed} of the basin's ${RINGS.length} rings close round its pan`);
    // (no ring's edge a ruled line)
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const run = new Int32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        if (!floor(i)) continue;
        const x = i % W;
        const y = (i - x) / W;
        // (an edge tile: a floor neighbour across the run lower than it)
        const a = dx ? i + W : i + 1;
        const ax = a % W;
        const edgeHere = a < W * H && !(dy && ax === 0) && floor(a) && heights[a] < heights[i];
        if (!edgeHere) continue;
        const prev = dx ? (x > 0 ? i - 1 : -1) : y > 0 ? i - W : -1;
        run[i] = prev >= 0 && run[prev] && heights[prev] === heights[i] ? run[prev] + 1 : 1;
        if (run[i] > RING_STRAIGHT) return fail(`A ring's edge runs straight for ${run[i]} tiles at ${x}, ${y} (${RING_STRAIGHT} at most)`);
      }
    }
    return OK;
  },
};
const RING_STRAIGHT = 10;
/** How far from the pan's middle its floor shows, at the most (Manhattan; the Gate Bed's band covers the middle). */
const PAN_NEAR = 10;

/** `rim.shape` (planning 2026-11-11: "the wall and the rim are a box"): the rim's width wanders 4 to 14 along the far edge
 *  and down each side (by `RIM_SWING` or more over the whole rim), no run of it keeps one width for more than 12 tiles, its crest varies by two
 *  levels or more, and each far corner is broken by a buttress. */
const rimShape: GateLandInvariant = {
  id: "rim.shape",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const N = plan.W;
    const T = turnOf(plan, g);
    const { rim } = gateZones(plan, g, bedGround(plan, water));
    const runs = localRuns(plan, g);
    const isRim = (u: number, v: number): boolean => {
      const [x, y] = onMap(T, [u + 0.5, v + 0.5]);
      const i = Math.floor(y) * N + Math.floor(x);
      return i >= 0 && i < N * N && rim[i] === 1;
    };
    const nu = onLocal(T, g.notch.at)[0];
    const sides: { name: string; widths: number[] }[] = [];
    // (the far edge, between the corners, the notch aside)
    const far: number[] = [];
    for (let u = RIM_CORNER; u < N - RIM_CORNER; u++) {
      if (Math.abs(u - nu) <= NOTCH / 2 + 3) continue;
      let w = 0;
      while (w < N && isRim(u, N - 1 - w)) w++;
      far.push(w);
    }
    sides.push({ name: "far edge", widths: far });
    for (const [name, at] of [["west side", (v: number, w: number) => isRim(w, v)], ["east side", (v: number, w: number) => isRim(N - 1 - w, v)]] as const) {
      const list: number[] = [];
      const back = Math.max(...runs.map((r) => r.v + r.thick));
      for (let v = back + 2; v < N - RIM_CORNER; v++) {
        let w = 0;
        while (w < N && at(v, w)) w++;
        list.push(w);
      }
      sides.push({ name, widths: list });
    }
    // (the width over the whole rim: a side between the wall's back and its corner's buttress is short)
    const all = sides.flatMap((sd) => sd.widths);
    if (all.length) {
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      if (hi - lo < RIM_SWING) return fail(`The rim keeps ${lo} to ${hi} wide (its width wanders by ${RIM_SWING} or more)`);
    }
    for (const sd of sides) {
      if (sd.widths.length < 6) continue;
      const lo = Math.min(...sd.widths);
      const hi = Math.max(...sd.widths);
      if (lo < RIM_WIDTH[0] || hi > RIM_WIDTH[1] + 2) return fail(`The rim's ${sd.name} is ${lo} to ${hi} wide (${RIM_WIDTH[0]} to ${RIM_WIDTH[1]})`);
      let run = 1;
      for (let k = 1; k < sd.widths.length; k++) {
        run = sd.widths[k] === sd.widths[k - 1] ? run + 1 : 1;
        if (run > RIM_STRAIGHT) return fail(`The rim's ${sd.name} runs ${run} tiles at one width (${RIM_STRAIGHT} at most)`);
      }
    }
    let cLo = Infinity;
    let cHi = -Infinity;
    for (let i = 0; i < N * N; i++)
      if (rim[i] && !water.raster.fixed[i]) {
        cLo = Math.min(cLo, heights[i]);
        cHi = Math.max(cHi, heights[i]);
      }
    if (cHi - cLo < 2) return fail(`The rim's crest stands at ${cLo} to ${cHi} (two levels or more apart)`);
    const c = Math.floor(RIM_CORNER / 2) - 1;
    for (const u of [c, N - 1 - c]) if (!isRim(u, N - 1 - c)) return fail("A far corner of the basin is not broken by a buttress");
    return OK;
  },
};
const RIM_STRAIGHT = 12;

/** `valley.enclosed`, its land half (§5.1): the valley's floor closed at the megadam's level all round but for the Low
 *  River's gorge: from the lake, over ground at or under the megadam's water, neither the map's edge nor the basin is
 *  reached but through the gorge (the megadam's slot) or the Gate (dammed with it). */
const valleyEnclosed: GateLandInvariant = {
  id: "valley.enclosed",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone } = gateZones(plan, g);
    const lake = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
    const shut = new Set([plan.links.findIndex((l) => l.id === g.low) + 1, plan.links.findIndex((l) => l.id === g.gate) + 1]);
    const seen = new Uint8Array(W * H);
    const queue: number[] = [];
    for (let i = 0; i < W * H; i++) if (r.lake[i] === lake) (seen[i] = 1), queue.push(i);
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return fail(`At the megadam's water (${g.megadam}) the valley spills over the map's edge at ${x}, ${y}`);
      if (zone[i] === 2) return fail(`At the megadam's water (${g.megadam}) the valley spills into the basin at ${x}, ${y}`);
      for (const j of N4(W, H, i)) {
        if (seen[j] || shut.has(r.channel[j]) || heights[j] > g.megadam) continue;
        // (the gorge's own fall, the Low River's lip, is the slot's)
        if (r.crest[j] && plan.links[r.crest[j] - 1]?.id === g.low) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    return OK;
  },
};

/** `frame.lip`, its land half (§5.1, the lake stair's stage 3 `checkFrame` on this land, with no level land of its
 *  own asked: the shared gate holds the start's room): the start's 5 × 5 dry and level with a level door, the Veil's
 *  lip and foot in the first frame, the frame's water shallow. */
const frameLip: GateLandInvariant = {
  id: "frame.lip",
  test({ plan, water, heights }) {
    const f = checkFrame(plan, water, Uint8Array.from(heights), { level: 0, farmland: 0 });
    return f.reason ? fail(f.reason) : OK;
  },
};

/** The dried lake bed's rings (§5.1, planning 2026-11-11): its pan's middle (the point of the Gate Bed's middle reach furthest from
 *  the basin's edge), and each floor tile's ring level, from its warped distance to the pan
 *  against its distance to the basin's edge (the wall's back and the rim): the contours close round the pan whatever
 *  the basin's shape. */
export const RINGS = [
  [0.24, BED_FLOOR],
  [0.48, BED_FLOOR + 2],
  [0.72, BED_FLOOR + 4],
] as const;
/** The share of the Gate Bed's length the pan stands in. */
const PAN_REACH = [0.4, 0.85] as const;
/** The pan's least radius, in tiles. */
const PAN_LEAST = 8;
export function basinRings(plan: PremisePlan, w: StageWater, zone: Uint8Array, rim: Uint8Array): { pan: [number, number]; level: Uint8Array } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const N = W * H;
  const gate = plan.links.find((l) => l.id === g.gate)!;
  const path = gate.path!.slice(g.slot.to);
  // (each floor tile's distance to the basin's edge: a chamfer flood from the tiles that are not floor)
  const edge = new Float32Array(N).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) if (zone[i] !== 2 || rim[i]) (edge[i] = 0), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const nd = edge[i] + (dx && dy ? 1.4142 : 1);
        if (nd < edge[j] - 1e-6) (edge[j] = nd), queue.push(j);
      }
  }
  // (the pan: the point of the Gate Bed's middle reach, `PAN_REACH` of its length, furthest from the basin's edge, so
  // every ring closes round it; three quarters of the way down stood it in the notch's mouth)
  let len = 0;
  for (let k = 0; k + 1 < path.length; k++) len += dist(path[k], path[k + 1]);
  let pan: [number, number] = [path[0][0], path[0][1]];
  let deep = -1;
  for (let t = PAN_REACH[0] * len; t <= PAN_REACH[1] * len; t += 1) {
    const { p } = pointAt(path, t);
    const i = Math.floor(p[1]) * W + Math.floor(p[0]);
    if (i < 0 || i >= N || edge[i] === Infinity) continue;
    if (edge[i] > deep) [deep, pan] = [edge[i], [p[0], p[1]]];
  }
  const sWarp = seedOf(plan, "gate", "rings");
  const top = g.floor[1];
  const level = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (zone[i] !== 2 || rim[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const wx = x + 7 * fbm(sWarp, x, y, 22, 2) - pan[0];
    const wy = y + 7 * fbm(sWarp + 1, x, y, 22, 2) - pan[1];
    const dp = sqrt(wx * wx + wy * wy);
    // (the pan reaches past the Gate Bed's band, slot-wide and stripped either side, however narrow the basin)
    const q = dp < PAN_LEAST ? 0 : dp / (dp + edge[i]);
    let lv = top;
    for (const [t, l] of RINGS)
      if (q < t) {
        lv = l;
        break;
      }
    level[i] = lv;
  }
  return { pan, level };
}

/** The basin's beds (the Gate Bed and the Pass Bed) and each basin tile's distance to the nearest and its bed. */
export function basinBeds(plan: PremisePlan, w: StageWater, zone: Uint8Array): { dist: Float32Array; bed: Float32Array } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = w.raster;
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const [gate, leat] = [li(g.gate), li(g.leat)];
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const bed = new Float32Array(N).fill(NaN);
  const queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (zone[i] === 2 && (r.channel[i] === gate || r.channel[i] === leat)) {
      dist[i] = 0;
      bed[i] = r.heights[i];
      queue.push(i);
    }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (zone[j] !== 2) continue;
        const d = dist[i] + (dx && dy ? 1.4142 : 1);
        if (d < dist[j] - 1e-6) {
          dist[j] = d;
          bed[j] = bed[i];
          queue.push(j);
        }
      }
  }
  return { dist, bed };
}

/** The gate's land invariants, judged on stage 2's ground. */
export const GATE_LAND_CHECKS: GateLandInvariant[] = [wallFaces, wallCamera, gateSlot, basinBowl, basinRings_, rimShape, valleyEnclosed, frameLip];

/** The land invariants a gate plan's ground fails, each with its one line. */
export function gateLandFailures(ctx: GateLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of GATE_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
