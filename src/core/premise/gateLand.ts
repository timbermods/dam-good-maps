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
import { pathDist } from "./geom";
import type { ReliefStyle } from "./style";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";
import { bandAt, gateOf, localRuns, onLocal, RIM_DEPTH, NOTCH, turnOf, type GateNumbers } from "./premises/wallGate";

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
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      const [lo, hi] = bandAt(runs, u);
      fromFace[i] = v - lo;
      zone[i] = v < lo ? 0 : v < hi ? 1 : 2;
      if (zone[i] !== 2) continue;
      const far = v >= N - RIM_DEPTH;
      const side = u < RIM_DEPTH || u >= N - RIM_DEPTH;
      // (and any of the beds' own ground that reaches the far edge: the notch is theirs)
      const notch = far && (Math.abs(u - nu) <= NOTCH / 2 + 0.5 || (beds?.[i] ?? 0) > 0);
      if ((far || side) && !notch) rim[i] = 1;
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
      if (rim[i]) h[i] = g.rim;
      else {
        const d = dist[i];
        const b = bed[i] === bed[i] && d < Infinity ? bed[i] : BED_FLOOR;
        // (the beds cut three wide at the least: the Pass Bed is the leat's channel, one wide, and reads as a dry river
        // only at three; then the terraces in steps of two so each casts an edge, planning's ruling; past them broad
        // warped plates at the low or the high terrace's level, under the sill + 1)
        const wx = x + 9 * fbm(sWarp, x, y, 30, 2);
        const wy = y + 9 * fbm(sWarp + 1, x, y, 30, 2);
        const high = fbm(sPlate, wx, wy, TERRACES.plate, 2) > 0;
        // (on levels two apart from the floor's own, `BED_FLOOR`: a bed falls a level at a time, and terraces read off it
        // stepped by one where it did)
        const step = (v: number) => BED_FLOOR + 2 * Math.ceil((v - BED_FLOOR) / 2);
        const low = step(b + TERRACES.low);
        const cap = top - ((top - BED_FLOOR) % 2);
        const upper = low + 2 <= cap ? low + 2 : low;
        h[i] = d <= TERRACES.bedReach ? Math.max(BED_FLOOR, b) : d <= TERRACES.lowReach ? Math.min(cap, low) : d <= TERRACES.highReach || high ? Math.min(cap, upper) : Math.min(cap, low);
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
 *  crest's level. */
const gateSlot: GateLandInvariant = {
  id: "gate.slot",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone } = gateZones(plan, g);
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
      } else if (heights[i] <= g.sill + 1) return fail(`The wall is cut to ${heights[i]} at ${i % W}, ${Math.floor(i / W)}, outside the Gate's slot`);
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
      } else if (!r.fixed[i] && heights[i] > g.sill + 1) return fail(`The basin's floor stands at ${heights[i]} at ${x}, ${y}, over the lake's sill + 1 (${g.sill + 1})`);
    }
    // (the far edge's open tiles one run, as wide as the notch and two more at most)
    open.sort((p, q) => p - q);
    for (let k = 1; k < open.length; k++) if (open[k] - open[k - 1] > 1.01) return fail("The basin's far edge is open in more than one place");
    if (open.length > NOTCH + 2) return fail(`The notch is ${open.length} tiles wide on the map's edge (${NOTCH + 2} at most)`);
    return OK;
  },
};
const RIM_LEAST = 12;

/** `basin.terraces` (§5.1, planning's ruling: steps of two so each casts an edge from the opening camera): a floor tile
 *  within 4 of a dry bed stands at most three over it, within 10 at most five (the steps follow the bed, never the wall),
 *  and most of the floor's steps (60 % or more) are two levels or more. */
const basinTerraces: GateLandInvariant = {
  id: "basin.terraces",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { W, H } = plan;
    const r = water.raster;
    const { zone, rim } = gateZones(plan, g);
    const { dist, bed } = basinBeds(plan, water, zone);
    let steps = 0;
    let ones = 0;
    for (let i = 0; i < W * H; i++) {
      if (zone[i] !== 2 || rim[i] || r.fixed[i]) continue;
      const over = heights[i] - bed[i];
      if (dist[i] <= TERRACES.lowReach && over > TERRACES.low + 1) return fail(`A floor tile ${dist[i].toFixed(1)} from its bed stands ${over} over it (${TERRACES.low + 1} within ${TERRACES.lowReach})`);
      if (dist[i] <= TERRACES.highReach && over > TERRACES.high + 1) return fail(`A floor tile ${dist[i].toFixed(1)} from its bed stands ${over} over it (${TERRACES.high + 1} within ${TERRACES.highReach})`);
      for (const j of [i + 1, i + W]) {
        if (j >= W * H || (j === i + 1 && (i + 1) % W === 0) || zone[j] !== 2 || rim[j] || r.fixed[j] || heights[j] === heights[i]) continue;
        steps++;
        if (Math.abs(heights[j] - heights[i]) >= 2) ones++;
      }
    }
    if (steps && ones / steps < TWO_STEPS) return fail(`${Math.round((100 * ones) / steps)} % of the basin floor's steps are two levels or more (${100 * TWO_STEPS} % or more)`);
    return OK;
  },
};
const TWO_STEPS = 0.6;

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
export const GATE_LAND_CHECKS: GateLandInvariant[] = [wallFaces, wallCamera, gateSlot, basinBowl, basinTerraces, valleyEnclosed, frameLip];

/** The land invariants a gate plan's ground fails, each with its one line. */
export function gateLandFailures(ctx: GateLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of GATE_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
