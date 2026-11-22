// Levels (docs/m9-design.md §4.5, §4.7): the field snapped to the game's terrain levels, and the
// natural ramps.
//
// The field is spread over the land's own span, from a low base to its top (16, or up to 22 at
// Verticality 70+, D172), with its own hypsometry: `eq` blends it toward equal area per level and
// `lean` tips the land toward uplands or lowlands. Near the top the land bends toward it instead of
// being cut flat. Benches of 2–5 levels (cliffs) cover the terraced share, taller as Verticality
// rises, with a drawn phase so benches never align across the map. Regions under 4 tiles merge;
// single-tile pits and spikes go, as the build's integrity pass would remove them.
//
// Natural ramps: where a cliff band cuts a big upland (or lowland) off from the land round it, a
// gully steps down the cliff along the gentlest line the land offers, one level every two tiles or
// more, three tiles wide. Its steps are slope targets: the build's derived slopes join every step
// of a ramp wherever it is (decisions-pending #62). An upland left without one needs stairs: a
// reward.
//
// Ported from the design version 2 prototype (investigation/generative/v2/levels.ts, with version
// 1's helpers from proto/levels.ts).

import { hash32 } from "../math/hash";
import * as portable from "../math/portable";
import { fbm, warpedFbm } from "../math/noise";
import { levelRegions, MinHeap, N4, N8 } from "../math/grid";
import { stream, type Rng } from "../math/rng";
import { pctSorted } from "./num";
import { clamp, smoothstep } from "../math/clamp";
import { BED_FLOOR, RISES, VT_HIGH, UPLANDS_BASE_PATH, formScale, type Genome, type Grade } from "./genome";
import { windRoute } from "./wind";
import { wanderEdges } from "./wander";
import { edgeSpill } from "./drainage";
import { landRegions } from "../analysis/regions";
import { integrityLevel } from "../features/raster/terrain";
import { planBands } from "./plan";
import { addRingForms, drawRingForms, ringFormRoom } from "./rings";
import { benchValley, boldGorge, standMesas, standsUp, standValley, STAND } from "./bold";
import { headWanted } from "./deltaHead";

/** The rank of every value in [0, 1] (ties broken by index, so it is exact and stable). */
function ranks(v: Float64Array): Float64Array {
  const n = v.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
  const r = new Float64Array(n);
  for (let k = 0; k < n; k++) r[idx[k]] = k / (n - 1);
  return r;
}

export function snapLevels(E: Float64Array, g: Genome, seed: number, W: number, H: number): Uint8Array {
  const N = W * H;
  const sorted = Float64Array.from(E).sort();
  const lo = pctSorted(sorted, 0.02);
  const hi = pctSorted(sorted, 0.98);
  const span = Math.max(1e-6, hi - lo);
  const rk = ranks(E);
  const js = hash32(seed, "contour-jitter", g.variation);
  const ts = hash32(seed, "terrace-mask", g.variation);
  const top = g.top;
  const maxLv = Math.floor(top + 0.5);
  const out = new Uint8Array(N);
  // (a land on a plan has no benches: its tiers' faces are its walls, and benches cut a tier's band into tabletops)
  const st = g.plan && g.plan.strength > 0 ? 1 : g.terrace.step;
  const phase = g.benchPhase * st;
  // (uplands round 2: a land on a plan takes its hypsometry from the plan's tiers, `tieredCurve`, `gatherFaces`, and its
  // tiers roll: a tier is a band of levels the land rolls through, never a tabletop)
  // (uplands round 4: above 128² the land is drawn in rings, `RINGS`: nothing finer than about 8 tiles goes into the
  // snap but where a face is meant, so each level's line runs long and curved round the land's forms. A plan exists
  // only there, `planStrength`)
  // (uplands round 5: Lake Basin and Islands keep the land of 0.10.48, `UPLANDS_BASE_PATH`)
  const f = UPLANDS_BASE_PATH.has(g.theme) ? 1 : formScale(W, H);
  const ringed = f > 1;
  // (uplands round 3: the tiers are laid on the land's regional tilt, not on equal levels across the map: the plane
  // that fits the field best is taken out before the ranks and put back after, `RINGS.tilt` levels from its low corner
  // to its high, so each tier rolls down the land's slope through more levels, while a wall stands its full height
  // wherever it runs)
  const tilt = g.plan && g.plan.strength > 0 ? Math.min(RINGS.tilt[g.plan.kind], (top - g.base) / 3) : 0;
  // (uplands round 4: the land's ringed forms stand in the top `ringRoom` levels, so the land under them leaves them
  // room)
  const ringRoom = ringed ? ringFormRoom(g.theme) : 0;
  const top0 = top - tilt - ringRoom;
  // (uplands round 6: Highlands above 128² stands up, `bold.ts` `STAND`: a valley sunk in its middle, a gentle floor
  // `STAND.floor.relief` levels deep from `STAND.floor.over` over the base, and mesas standing on it)
  const stand = ringed && standsUp(g.theme, W, H) ? standValley(seed, g.variation, g.benchPhase, g.flowDir, W, H, g.hydro.lakeBudget * W * H) : null;
  const floorTop = stand ? g.base + STAND.floor.over + STAND.floor.relief : top0;
  const tiers = g.plan && g.plan.strength > 0 ? planBands(g.plan, g.base, top0) : null;
  const grade = grader(tiers ? { ...g.grade, calm: Math.min(g.grade.calm, PLAN_CALM), roll: g.grade.roll * (ringed && g.plan?.kind === "gorge" ? RINGS.gorgeRoll : RINGS.planRoll) } : g.grade, seed, g.variation, W, H, f);
  const level = new Float64Array(N);
  const curve = tiers ? tieredCurve(tiers, g.base, top0) : null;
  const plane = curve && tilt > 0 ? planeOf(E, W, H) : null;
  const rkd = plane ? ranks(plane.rest) : rk;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lin = (E[i] - lo) / span;
      let t: number;
      if (curve) t = (1 - PLAN_EQ) * (plane ? (plane.rest[i] - plane.lo) / plane.span : lin) + PLAN_EQ * curve(rkd[i]);
      else if (stand) {
        // (the floor: the land's rank among the land outside the valley, leaning as the theme leans)
        t = clamp((rk[i] - stand.share) / Math.max(1e-6, 1 - stand.share), 0, 1);
        if (t > 0 && t < 1) t = t / (t + g.hyps.lean * (1 - t));
        // (rising away from the valley, so the valley lies in a bowl at the map's scale)
        t = STAND.floor.away * stand.away[i] + (1 - STAND.floor.away) * t;
        level[i] = g.base + STAND.floor.over + t * STAND.floor.relief + g.terrace.jitter * warpedFbm(js, x, y, 14 * f, 2, 7 * f);
        continue;
      } else {
        t = (1 - g.hyps.eq) * lin + g.hyps.eq * rk[i];
        // the lean: t / (t + lean (1 − t)) on [0, 1], continued straight beyond it
        if (t > 0 && t < 1) t = t / (t + g.hyps.lean * (1 - t));
      }
      level[i] = g.base + t * (top0 - g.base) + g.terrace.jitter * warpedFbm(js, x, y, 14 * f, 2, 7 * f);
    }
  if (ringed) level.set(smoothed(level, W, H, Math.round(RINGS.smooth * (f - 1)), RINGS.passes));
  // (D549 (6): a Delta's rings broken, `DELTA_RINGS`: the smoothed levels pushed by a slow noise, so a bowl's lines
  // bunch on one side and spread on another, never even rings round its water)
  if (ringed && headWanted(g.theme, W, H)) {
    const rs = hash32(seed, "delta-rings", g.variation);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) level[y * W + x] += DELTA_RINGS.shift * warpedFbm(rs, x, y, DELTA_RINGS.cell * f, 2, (DELTA_RINGS.cell * f) / 2);
  }
  if (tiers) gatherFaces(level, W, H, tiers.bands);
  // (uplands round 4: the land's ringed forms, on the smoothed levels, `rings.ts`)
  if (ringed) addRingForms(level, drawRingForms(g.theme, level, W, H, seed, g.variation, stand ? floorTop + ringRoom : top0 + ringRoom, tiers ? tiers.bands[0][1] : null), W, H);
  for (let i = 0; i < N; i++) {
    let L = level[i] + (plane ? tilt * plane.at[i] : 0);
    // near the top the land bends toward it instead of being cut flat there
    if (L > top - 1) {
      const over = L - (top - 1);
      L = top - 1 + over / (over + 1) + 0.49 * smoothstep(over / 2);
    }
    level[i] = L;
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const benched = st > 1 && g.terrace.share > 0 && smoothstep((warpedFbm(ts, x, y, g.terrace.cell, 2, g.terrace.cell / 2) + 1) / 2 - (1 - g.terrace.share) + 0.5) > 0.5;
      level[i] = grade(level[i], x, y, benched ? st : 1, phase);
    }
  // (uplands round 5, the bold family, `bold.ts`: above 128² Highlands' mesas, their walls a steep band of their
  // profile, and the field the water is planned on raised under them; Canyon's gorge two faces with a bench between,
  // and its hollows)
  // (round 6: the valley sunk under the graded floor, then the mesas, `bold.ts`)
  if (stand)
    for (let i = 0; i < N; i++) {
      const v = g.base + stand.floor[i];
      if (stand.m[i] > 0 && v < level[i]) level[i] += stand.m[i] * (v - level[i]);
    }
  // (round 6b step 2: the floor stepping down to the valley in rings, `bold.ts` `benchValley`)
  if (stand) benchValley(level, stand, g.base, W, H, seed);
  const mesas = stand ? standMesas(level, E, W, H, seed, g.variation, stand, g.base, maxLv, hi) : null;
  if (mesas) g.dryTops = mesas.tops;
  if (stand) g.rockSill = stand.sill;
  if (stand) g.standValley = Uint8Array.from(stand.m, (m, i) => (m >= 0.5 ? (stand.bowl[i] === 1 ? 1 : 2) : 0));
  const keepRims = mesas ? mesas.skip : null;
  if (ringed && tiers && g.plan?.kind === "gorge") boldGorge(level, W, H, seed, g.variation, tiers.bands[0][1], tiers.bands[1][0]);
  // (D544: every level's edge read through a warp, so no edge the field, the grade or the tableland's
  // outline leaves smooth over a dozen tiles runs ruler-straight; the levels' edges, not the field the water is planned
  // on. Above 128² a slow one, `RINGS`, that bends the lines without jagging them: uplands round 4)
  const ws = hash32(seed, "edge-warp", g.variation);
  // (each tile's source in the unwarped levels, so the cliffs the warp makes can be told from the land's own)
  const src = new Int32Array(N);
  const side = Math.min(W, H);
  const reach = ringed ? RINGS.warpReach : side <= EDGE_WARP.full ? EDGE_WARP.reach * (side / EDGE_WARP.full) : Math.min(EDGE_WARP.most, EDGE_WARP.reach * portable.sqrt(side / EDGE_WARP.full));
  const wcell = ringed ? RINGS.warpCell : EDGE_WARP.cell;
  const woct = ringed ? 1 : EDGE_WARP.octaves;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const k = d >= wcell ? reach : (reach * d) / wcell;
      const px = clamp(x + k * warpedFbm(ws, x, y, wcell, woct, 0), 0, W - 1);
      const py = clamp(y + k * warpedFbm((ws ^ 0x5bd1e995) >>> 0, x, y, wcell, woct, 0), 0, H - 1);
      const x0 = Math.min(W - 2, Math.floor(px));
      const y0 = Math.min(H - 2, Math.floor(py));
      const fx = px - x0;
      const fy = py - y0;
      const j = y0 * W + x0;
      src[y * W + x] = Math.round(py) * W + Math.round(px);
      let L = (level[j] * (1 - fx) + level[j + 1] * fx) * (1 - fy) + (level[j + W] * (1 - fx) + level[j + W + 1] * fx) * fy;
      // (round 6b step 4: on a land that stands up, a wall of 4 levels or more is read from its nearest tile, not eased
      // across: the easing split a mesa's face into a 2 and a 3, so its wall lost its height)
      if (stand && Math.max(level[j], level[j + 1], level[j + W], level[j + W + 1]) - Math.min(level[j], level[j + 1], level[j + W], level[j + W + 1]) >= 3.5) L = level[src[y * W + x]];
      // (the land stands a level above the beds' floor, item 47)
      out[y * W + x] = clamp(Math.round(L), BED_FLOOR + 1, maxLv);
    }
  // at high Verticality the land stays wild but readable (item 36): no spike, wall or trench one or
  // two tiles wide standing two levels or more over the land round it
  if (g.vt >= VT_HIGH) readable(out, W, H);
  // no contour runs ruler-straight (D518, the look round): its long one-level runs jog a tile every few tiles
  wanderEdges(out, W, H, hash32(seed, "wander", g.variation));
  // regions under 4 tiles merge (a 2×2 stack survives, as the build's integrity pass keeps it)
  mergeSmallRegions(out, W, H, 4);
  cleanPitsAndSpikes(out, W, H, null);
  // (D544: the warp bends the edges and makes no cliff; the regions its easing leaves under 4 tiles merge too)
  if (easeWarpCliffs(out, level, src, W, H, BED_FLOOR + 1, maxLv)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
  // (uplands round 3: a planned land's walls have ways through, a graded notch about every 40 tiles of wall; round 4:
  // every land above 128², whose ring terraces stand behind walls too)
  // (round 7c: Lake Basin above 128², its benches' faces of 2 and 3 levels, gullies as Highlands' are; its rim, 4 levels
  // or more, a gully only every `BASIN_RIM_EVERY` tiles, so a rim stands whole for 60 tiles or more and the benches
  // behind it are reached)
  if ((tiers || ringed || g.basinWarp) && notchWalls(out, W, H, hash32(seed, "ways", g.variation), keepRims, !!stand || !!g.basinWarp, g.basinWarp ? BASIN_RIM : Infinity)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
  if (g.basinWarp && notchWalls(out, W, H, hash32(seed, "rim ways", g.variation), keepRims, true, Infinity, BASIN_RIM, BASIN_RIM_EVERY)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
  return out;
}

/** Along a wall, a way through about every `NOTCH_EVERY` tiles (32–48 apart). */
const NOTCH_EVERY = 40;
/** A notch's half width, in tiles, and the tiles it takes per level it climbs. */
const NOTCH_HALF = 2.5;
const NOTCH_RUN = 2;
/** Lake Basin above 128² (round 7c): a wall this many levels tall or more is its rim, notched only every
 *  `BASIN_RIM_EVERY` tiles (96–144 apart, the first 48–72 from its end). */
const BASIN_RIM = 4;
const BASIN_RIM_EVERY = 120;

/** Ways through the walls (uplands round 3): a wall is a run of tiles standing 2 or more levels over a 4-neighbour,
 *  and along each one 40 tiles or longer a notch is cut into the higher ground about every `NOTCH_EVERY` tiles,
 *  graded from the wall's foot in one-level steps `NOTCH_RUN` tiles long, so a colony walks up it. Ground is only
 *  taken away. The notch runs up the land's own slope (its normal, from the levels smoothed over 7 tiles) and bends
 *  with a slow noise, so no two are alike and none runs straight. Walls on `keep` (a mesa's rim, which has its own
 *  ways up: uplands round 5, `bold.ts`) are left as they stand. `found` (a land that stands up, Highlands above 128²,
 *  uplands round 6b step 5): the notch is a gully, not a corridor: broad at its foot and narrowing as it climbs, each
 *  side wandering on its own, so its sides are never two parallel lines (seed 2's front read as notches cut with a
 *  ruler). Its sides keep 2 tiles from its line and its treads `NOTCH_RUN`: a narrower notch, or treads drawn 2 to 3
 *  tiles long, left the slopes no room (their spacing rule), and the colony could not walk up it (seed 1's reach fell
 *  by a third or more). Returns whether any ground was cut. */
export function notchWalls(out: Uint8Array, W: number, H: number, seed: number, keep: Uint8Array | null = null, found = false, most = Infinity, least = 2, every = NOTCH_EVERY): boolean {
  const N = W * H;
  const wall = new Uint8Array(N);
  const foot = new Int32Array(N).fill(-1);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (keep?.[i]) continue;
      for (const [dx, dy] of N4) {
        const j = (y + dy) * W + x + dx;
        if (out[i] - out[j] >= 2 && (foot[i] < 0 || out[j] < out[foot[i]])) foot[i] = j;
      }
      if (foot[i] >= 0 && out[i] - out[foot[i]] >= least && out[i] - out[foot[i]] < most) wall[i] = 1;
    }
  // the levels smoothed, for each notch's direction up the land
  const sm = new Float64Array(N);
  {
    const R = 3;
    const tmp = new Float64Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let k = Math.max(0, x - R); k <= Math.min(W - 1, x + R); k++, n++) s += out[y * W + k];
        tmp[y * W + x] = s / n;
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let k = Math.max(0, y - R); k <= Math.min(H - 1, y + R); k++, n++) s += tmp[k * W + x];
        sm[y * W + x] = s / n;
      }
  }
  const seen = new Uint8Array(N);
  const dist = new Int32Array(N).fill(-1);
  const centres: number[] = [];
  const bfs = (from: number, comp: number[] | null): number => {
    const q = [from];
    dist[from] = 0;
    let far = from;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      if (comp) comp.push(i);
      if (dist[i] > dist[far]) far = i;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (wall[j] && dist[j] < 0) {
          dist[j] = dist[i] + 1;
          q.push(j);
        }
      }
    }
    return far;
  };
  for (let s0 = 0; s0 < N; s0++) {
    if (!wall[s0] || seen[s0]) continue;
    const comp: number[] = [];
    const end = bfs(s0, comp);
    for (const i of comp) {
      seen[i] = 1;
      dist[i] = -1;
    }
    // along the wall from one end: a notch at each mark, the marks 32–48 apart
    const order: number[] = [];
    bfs(end, order);
    const len = dist[order[order.length - 1]];
    if (len >= 40) {
      const r = stream(seed, "notch", end);
      let mark = every === NOTCH_EVERY ? 20 + 15 * r.float() : every * (0.4 + 0.2 * r.float());
      const byDist = new Map<number, number>();
      for (const i of order) if (!byDist.has(dist[i]) || out[i] - out[foot[i]] > out[byDist.get(dist[i])!] - out[foot[byDist.get(dist[i])!]]) byDist.set(dist[i], i);
      while (mark <= len - 10) {
        const at = byDist.get(Math.round(mark));
        if (at !== undefined) centres.push(at);
        mark += every * (0.8 + 0.4 * r.float());
      }
    }
    for (const i of order) dist[i] = -1;
  }
  let cut = false;
  for (const c of centres) {
    const lowLv = out[foot[c]];
    const x0 = c % W;
    const y0 = (c - x0) / W;
    const fx = foot[c] % W;
    const fy = (foot[c] - fx) / W;
    // up the land: the smoothed levels' slope, else away from the foot
    let gx = (sm[y0 * W + Math.min(W - 1, x0 + 1)] - sm[y0 * W + Math.max(0, x0 - 1)]) / 2;
    let gy = (sm[Math.min(H - 1, y0 + 1) * W + x0] - sm[Math.max(0, y0 - 1) * W + x0]) / 2;
    let gl = portable.sqrt(gx * gx + gy * gy);
    if (gl < 1e-6) {
      gx = x0 - fx;
      gy = y0 - fy;
      gl = 1;
    }
    gx /= gl;
    gy /= gl;
    const bend = (seed ^ c) >>> 0;
    // from the foot up: each tile of the notch's floor a level higher every NOTCH_RUN tiles, until it meets the ground
    for (let k = 0; k <= 40; k++) {
      const want = lowLv + Math.floor(k / NOTCH_RUN);
      const off = 4 * fbm(bend, k, 0, 24, 2);
      const px = fx + gx * k - gy * off;
      const py = fy + gy * k + gx * off;
      let reached = true;
      // (a found notch's sides: broad at its foot, narrowing to 2.5 tiles a side up it (never under 2), each wandering on
      // its own)
      const taper = Math.max(0, 1 - k / 8);
      const halfL = found ? Math.max(2, 2.5 + 2 * taper + 0.8 * fbm(bend + 1, k, 0, 4, 2)) : 0;
      const halfR = found ? Math.max(2, 2.5 + 2 * taper + 0.8 * fbm(bend + 2, k, 0, 4, 2)) : 0;
      const reachA = found ? Math.ceil(Math.max(halfL, halfR)) : Math.ceil(NOTCH_HALF);
      for (let a = -reachA; a <= reachA; a++) {
        const half = found ? (a < 0 ? halfL : halfR) : NOTCH_HALF + (k < 3 ? 1 : 0);
        if (Math.abs(a) > half) continue;
        const x = Math.round(px - gy * a);
        const y = Math.round(py + gx * a);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const i = y * W + x;
        if (out[i] > want) {
          out[i] = want;
          cut = true;
          reached = false;
        }
      }
      if (reached && k > 2) break;
    }
  }
  return cut;
}

/** How much of a planned land's hypsometry is the tiered curve (the rest the field's own linear spread). */
const PLAN_EQ = 0.85;

/** The plane that fits a field best (least squares over the grid, whose x and y are orthogonal about the middle), the
 *  field less it, and the plane's place at each tile on [0, 1] from its lowest corner to its highest. */
function planeOf(E: Float64Array, W: number, H: number): { rest: Float64Array; lo: number; span: number; at: Float64Array } {
  const N = W * H;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  let sx = 0;
  let sy = 0;
  let xx = 0;
  let yy = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = E[y * W + x];
      sx += (x - cx) * e;
      sy += (y - cy) * e;
      xx += (x - cx) * (x - cx);
      yy += (y - cy) * (y - cy);
    }
  const bx = sx / xx;
  const by = sy / yy;
  const rest = new Float64Array(N);
  const at = new Float64Array(N);
  const pLo = -Math.abs(bx) * cx - Math.abs(by) * cy;
  const pSpan = Math.max(1e-9, -2 * pLo);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = bx * (x - cx) + by * (y - cy);
      rest[i] = E[i] - p;
      at[i] = (p - pLo) / pSpan;
    }
  const sorted = Float64Array.from(rest).sort();
  const lo = pctSorted(sorted, 0.02);
  return { rest, lo, span: Math.max(1e-6, pctSorted(sorted, 0.98) - lo), at };
}
/** How much gentler a planned land's tiers roll on its tableland (the grade's `calm`, at most). */
const PLAN_CALM = 0.25;

/** The tiered curve (uplands round 2): the rank of a tile's field among the land's to its share of the way from the
 *  base to the top, so that the plan's tiers take their bands (the floor's share of the land from the base up its
 *  band, the bench's and the top's theirs), each face between two bands the `face` share of the land about the tiers'
 *  meeting rank. Equal area per level within a band, so a tier rolls through its levels; little land between them. */
export function tieredCurve(t: { bands: [number, number][]; shares: number[]; face: number }, base: number, top: number): (r: number) => number {
  const R = Math.max(1e-6, top - base);
  const xs: number[] = [0];
  const ys: number[] = [0];
  let at = 0;
  for (let k = 0; k < t.bands.length; k++) {
    const last = k === t.bands.length - 1;
    const r0 = k === 0 ? 0 : at + t.face / 2;
    at += t.shares[k];
    const r1 = last ? 1 : at - t.face / 2;
    if (k > 0) {
      xs.push(r0);
      ys.push((t.bands[k][0] - base) / R);
    }
    xs.push(r1);
    ys.push((t.bands[k][1] - base) / R);
  }
  return (r) => {
    let k = 1;
    while (k < xs.length - 1 && r > xs[k]) k++;
    const a = xs[k - 1];
    const b = xs[k];
    return b > a ? ys[k - 1] + ((ys[k] - ys[k - 1]) * clamp((r - a) / (b - a), 0, 1)) : ys[k];
  };
}

/** The faces between a planned land's tiers gathered into walls (uplands round 2): a level between two bands, where
 *  the land climbs through the gap steeply (more than a level a tile), goes to the nearer band, so the step is one
 *  wall of the gap's levels; where it climbs gently (a ramp, a side valley's floor) it keeps its one-level steps. */
export function gatherFaces(level: Float64Array, W: number, H: number, bands: readonly [number, number][], at: { from: number; over: number } = RINGS.gather): void {
  const was = level.slice();
  for (let k = 0; k + 1 < bands.length; k++) {
    const lo = bands[k][1];
    const hi = bands[k + 1][0];
    if (hi - lo < 1) continue;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const L = was[i];
        if (!(L > lo && L < hi)) continue;
        const gx = (was[y * W + Math.min(W - 1, x + 1)] - was[y * W + Math.max(0, x - 1)]) / 2;
        const gy = (was[Math.min(H - 1, y + 1) * W + x] - was[Math.max(0, y - 1) * W + x]) / 2;
        const slope = Math.max(Math.abs(gx), Math.abs(gy));
        const c = smoothstep((slope - at.from) / at.over);
        if (c <= 0) continue;
        const to = L - lo < hi - L ? lo : hi;
        level[i] = L + c * (to - L);
      }
  }
}

/** The contour field (D518): the land's field softened over a tile each way, so no level line has a one-tile jag, and
 *  read through a slow warp (`CONTOUR.warp` tiles over `CONTOUR.cell`), so the straight runs the erosion's grid leaves
 *  in it bend as a land's contours do. The water is planned on this field and the levels snapped from it. */
export function contourField(E: Float64Array, W: number, H: number, seed: number, variation = 0): Float64Array {
  const S = softened(E, W, H, CONTOUR.soften);
  const out = new Float64Array(W * H);
  const ws = hash32(seed, "contour-warp", variation);
  const a = CONTOUR.warp;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // (the warp fades to nothing at the map's edge, so the edge's land and the inflows' mouths stay where they were)
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const k = d >= CONTOUR.cell ? a : (a * d) / CONTOUR.cell;
      const px = clamp(x + k * fbm(ws, x, y, CONTOUR.cell, 2), 0, W - 1);
      const py = clamp(y + k * fbm((ws ^ 0x5bd1e995) >>> 0, x, y, CONTOUR.cell, 2), 0, H - 1);
      const x0 = Math.min(W - 2, Math.floor(px));
      const y0 = Math.min(H - 2, Math.floor(py));
      const fx = px - x0;
      const fy = py - y0;
      const i = y0 * W + x0;
      out[y * W + x] = (S[i] * (1 - fx) + S[i + 1] * fx) * (1 - fy) + (S[i + W] * (1 - fx) + S[i + W + 1] * fx) * fy;
    }
  return out;
}

/** The edge warp bends the levels' edges and makes no cliff (D544). Where it crowds the levels (or folds,
 *  and the small regions it leaves merge), a step can drop two levels or more where the unwarped levels only stepped;
 *  each such step is eased, its lower tile raised to a level under its neighbour, until none is left. A tile whose
 *  source (`src`, in the unwarped levels `level`, before rounding) lies within a tile of a step the unwarped levels
 *  already drop two levels or more keeps its level: the warp moves the land's own cliffs, as Verticality made them.
 *  Returns whether a tile was raised. */
export function easeWarpCliffs(out: Uint8Array, level: Float64Array, src: Int32Array, W: number, H: number, lo: number, hi: number): boolean {
  const N = W * H;
  const u = new Uint8Array(N);
  for (let i = 0; i < N; i++) u[i] = clamp(Math.round(level[i]), lo, hi);
  const cliff = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x + 1 < W && Math.abs(u[i] - u[i + 1]) >= 2) cliff[i] = cliff[i + 1] = 1;
      if (y + 1 < H && Math.abs(u[i] - u[i + W]) >= 2) cliff[i] = cliff[i + W] = 1;
    }
  // (a tile either side of the unwarped cliffs)
  const near = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!cliff[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
        }
    }
  // (sweeps each way in turn: a raise lifts a tile only to a level under a neighbour, so they end)
  let raised = false;
  for (let changed = true, pass = 0; changed; pass++) {
    changed = false;
    const fwd = pass % 2 === 0;
    for (let k = 0; k < N; k++) {
      const i = fwd ? k : N - 1 - k;
      if (near[src[i]]) continue;
      const x = i % W;
      let m = out[i];
      if (x > 0 && out[i - 1] - 1 > m) m = out[i - 1] - 1;
      if (x + 1 < W && out[i + 1] - 1 > m) m = out[i + 1] - 1;
      if (i >= W && out[i - W] - 1 > m) m = out[i - W] - 1;
      if (i + W < N && out[i + W] - 1 > m) m = out[i + W] - 1;
      if (m !== out[i]) {
        out[i] = m;
        changed = raised = true;
      }
    }
  }
  return raised;
}

/** The levels' edge warp (D544) at 128² and under: its reach and its cell, tiles, and its noise's octaves.
 *  The reach is `reach` at `full` (128²), scaled by the map's narrower side over `full` below it (small maps keep their
 *  flats whole), and tapers to nothing over a cell at the map's border. Above 128² the warp is `RINGS`' (uplands round
 *  4: there the fine warp, its reach grown to 8.5 tiles, put a third of the land's fine relief into the levels). On the
 *  land that stays 0.10.48's above 128² (`genome.ts` `UPLANDS_BASE_PATH`, round 5) the reach is 0.10.48's: grown by the
 *  square root of the side's ratio, never over `most`. */
export const EDGE_WARP = { reach: 6, cell: 6, octaves: 2, full: 128, most: 8.5 } as const;

/** Uplands round 4, the land drawn in rings (docs/design/uplands.md): above 128² the levels' field is smoothed
 *  `smooth` × (`formScale` − 1) tiles each way, `passes` times, before its faces are gathered, so no level's line jags
 *  under about 8 tiles; a planned land's walls are gathered where the smoothed land climbs its gap `gather.from` levels
 *  a tile or more (wholly from `gather.over` more), its tiers tilted `tilt` levels along the slope and rolled `planRoll`
 *  times its theme's grade (a gorge's `gorgeRoll`, uplands round 5: rolled three times, its tableland's steps were 75–81 %
 *  one level); the grade's rolling and rises stand at the map's scale (their cells × `formScale`); and the
 *  edge warp bends the lines over `warpCell` tiles by `warpReach`, one octave, instead of jittering them. */
export const RINGS = { smooth: 2, passes: 2, planRoll: 3, gorgeRoll: 1.5, gather: { from: 0.3, over: 0.3 }, tilt: { valley: 3, gorge: 0 }, warpCell: 18, warpReach: 4 } as const;

/** D549 (6): on a Delta above 128² the smoothed levels are pushed by up to `shift` levels of a slow noise over `cell`
 *  tiles (times the map's scale), so the rings a bowl's smooth sides snap to are spaced unevenly round it. */
export const DELTA_RINGS = { shift: 0.8, cell: 16 } as const;

/** A field smoothed by a box `r` tiles each way, `passes` times (`softened`); itself when `r` is 0. */
export function smoothed(f: Float64Array, W: number, H: number, r: number, passes: number): Float64Array {
  let a = f;
  if (r > 0) for (let k = 0; k < passes; k++) a = softened(a, W, H, r);
  return a;
}

/** The contour field's numbers (D518): its softening, tiles each way, and its warp's reach and cell, tiles. */
export const CONTOUR = { soften: 1, warp: 5, cell: 20 } as const;

/** A field softened over `r` tiles each way (a box blur, rows then columns). */
export function softened(f: ArrayLike<number>, W: number, H: number, r: number): Float64Array {
  const a = new Float64Array(W * H);
  const b = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= W) continue;
        s += f[y * W + xx];
        n++;
      }
      a[y * W + x] = s / n;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        s += a[yy * W + x];
        n++;
      }
      b[y * W + x] = s / n;
    }
  return b;
}

/** Ground with grade (#929) as a function of any land's levels, so a theme's field (`snapLevels`) and a
 *  premise's relief (PREMISES §2.2 stage 2, on its outlands' own heights) grade the same way. The land is two
 *  characters, region by region: tableland (benches ending in cliffs, level on top) over the share `gr.mesa`,
 *  and rolling ground elsewhere (each bench's step graded into a flank of one-level steps, `gr.riser`; the
 *  bench levels wandering by `gr.drift` steps; swells and hollows of `gr.roll` levels over `gr.rollCell`
 *  tiles). The returned function takes a level `L` at a tile and the benches it stands on (`st` levels apart
 *  from `phase`; `st` 1 for none) and gives the graded level, unrounded. The same seed and variation give the
 *  same land, at every size (D518; a premise's relief over 128² too since D540). */
export function grader(gr: Grade, seed: number, variation: number, W: number, H: number, scale = 1): (L: number, x: number, y: number, st: number, phase: number) => number {

  const gs = hash32(seed, "grade", variation);
  // (the benches' levels drift over a third of the map; the land's character, tableland or rolling ground,
  // changes over a quarter of it, the share above `table` tableland)
  const wide = Math.min(W, H);
  const table = 0.6 * (0.5 - gr.mesa);
  return (L, x, y, st, phase) => {
    // rolling ground (0) or tableland (1)
    const mesa = smoothstep((warpedFbm(gs + 1, x, y, wide / 4, 2, wide / 8) - table) / 0.1 + 0.5);
    if (st > 1) L = bench(L, phase + gr.drift * st * warpedFbm(gs, x, y, wide / 3, 2, wide / 6), st, gr.riser * (1 - mesa));
    // the rolling ground: swells and hollows of a level or two between the features (gentler on the
    // tableland's tops, which keep broad level ground); the turned noise's two octaves weighed as the lattice's first
    // two were (1 and 1/2 over 1.75), so the swells stand no higher and the flats between them keep their size
    if (gr.roll > 0) L += gr.roll * (1 - gr.calm * mesa) * (1.5 / 1.75) * warpedFbm(gs + 3, x, y, gr.rollCell * scale, 2, 0.5 * gr.rollCell * scale);
    // the rises: hills over the land round them, a level a ring, gentler on the tableland's tops (D518)
    if (gr.roll > 0 && gr.rise > 0) {
      const n = warpedFbm(gs + 5, x, y, RISES.cell * scale, 2, (RISES.cell * scale) / 2);
      if (n > RISES.from) L += (gr.roll * gr.rise * (1 - 0.5 * gr.calm * mesa) * (n - RISES.from)) / RISES.span;
    }
    return L;
  };
}

/** Ground with grade over a whole land's own heights (a premise's relief, PREMISES §2.2 stage 2): every tile
 *  where `where` is set (all of them for null) graded on benches `step` levels apart, rounded and held between
 *  `floor` and `ceiling`; the rest as they were. Its tableland keeps broad level tops and cliffs; its rolling
 *  ground comes out in one-level steps (MAPCRAFT section 5's ground). */
export function gradeLevels(heights: ArrayLike<number>, W: number, H: number, gr: Grade, o: { seed: number; variation?: number; step: number; phase?: number; where?: Uint8Array | null; floor?: number; ceiling: number }): Uint8Array {
  const grade = grader(gr, o.seed, o.variation ?? 0, W, H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      out[i] = !o.where || o.where[i] ? clamp(Math.round(grade(heights[i], x, y, o.step, o.phase ?? 0)), o.floor ?? 1, o.ceiling) : heights[i];
    }
  return out;
}

/** A level `L` on benches `st` levels apart from `phase`: each bench level, then its step up as a flank over
 *  `riser` of the way to the next (0 a cliff, as the benches always were; 1 no bench at all), so a flank the
 *  land crosses slowly comes out in one-level steps. */
export function bench(L: number, phase: number, st: number, riser: number): number {
  const q = (L - phase) / st;
  const k = Math.floor(q);
  const f = q - k;
  const lo = (1 - riser) / 2;
  const up = f < lo ? 0 : f >= 1 - lo ? 1 : riser > 0 ? (f - lo) / riser : 1;
  return (k + up) * st + phase;
}

/** The land's opening and closing by a 3×3 square, applied only where they move a tile two levels
 *  or more: a spike, a wall or a trench one or two tiles wide that stands out that far goes to the
 *  land round it; one-level steps and broader shapes stay as they are. */
export function readable(h: Uint8Array, W: number, H: number): void {
  const N = W * H;
  const pass = (src: Uint8Array, max: boolean): Uint8Array => {
    const out = new Uint8Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = src[y * W + x];
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy < 0 ? 0 : y + dy >= H ? H - 1 : y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx < 0 ? 0 : x + dx >= W ? W - 1 : x + dx;
            const u = src[yy * W + xx];
            if (max ? u > v : u < v) v = u;
          }
        }
        out[y * W + x] = v;
      }
    return out;
  };
  const opened = pass(pass(h, false), true);
  for (let i = 0; i < N; i++) if (h[i] - opened[i] >= 2) h[i] = opened[i];
  const closed = pass(pass(h, true), false);
  for (let i = 0; i < N; i++) if (closed[i] - h[i] >= 2) h[i] = closed[i];
}

// ------------------------------------------------------------------------------------ natural ramps

/** Components of land joined by steps of at most one level (the ground a beaver walks with
 *  slopes), water left out. */
export function footComponents(h: Uint8Array, W: number, H: number, water: Uint8Array): { lab: Int32Array; size: number[] } {
  const lab = landRegions(h, W, H, water);
  const size: number[] = [];
  for (let i = 0; i < lab.length; i++) if (lab[i] >= 0) size[lab[i]] = (size[lab[i]] ?? 0) + 1;
  return { lab, size };
}

export interface Ramps {
  /** The ramps' steps as (low tile, high tile) pairs: slope targets (decisions-pending #62). */
  steps: [number, number][];
  /** Ramps cut, and uplands left to stairs. */
  cut: number;
  leftToStairs: number;
  /** The ramp tiles (kept off by the settler's clearing and by objects). */
  tiles: Uint8Array;
}

/**
 * Cut natural ramps. `water` marks channel and lake tiles (never touched); `keep` tiles are never
 * regraded. Each component of 200+ tiles not joined to the largest gets a ramp with the genome's
 * chance, up to 8 a map.
 */
export function naturalRamps(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, g: Genome, seed: number, attempt: number): Ramps {
  const N = W * H;
  const rng = stream(seed, "ramps", attempt, g.variation);
  // (the D410 round's ramps: each step's length its own draw, so no ramp is a staircase of even treads)
  const lay = stream(seed, "ramp-steps", attempt, g.variation);
  const tiles = new Uint8Array(N);
  const steps: [number, number][] = [];
  let cut = 0;
  let left = 0;
  const minSize = Math.max(200, Math.round(N / 80));
  for (let round = 0; round < 8; round++) {
    const fc = footComponents(h, W, H, water);
    let main = 0;
    for (let k = 1; k < fc.size.length; k++) if (fc.size[k] > fc.size[main]) main = k;
    // the biggest component not yet joined, that has not been decided already
    const order = fc.size.map((s, k) => [s, k]).filter(([s, k]) => k !== main && s >= minSize).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    if (!order.length) break;
    let done = false;
    for (const [, comp] of order) {
      // one decision per component (its first tile keys it across rounds)
      let first = -1;
      for (let i = 0; i < N && first < 0; i++) if (fc.lab[i] === comp) first = i;
      if (tiles[first] === 2) continue;
      if (rng.float() >= g.ramps) {
        // left to stairs: mark it so the next rounds skip it
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      const path = rampPath(h, W, H, water, keep, fc.lab, comp, main);
      if (!path) {
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      // (a path too short for its drop is left to stairs; the prototype tried the same component
      // again every round, so one short path used up all eight)
      if (!cutRamp(h, W, H, water, keep, path, tiles, steps, lay)) {
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      cut++;
      done = true;
      break;
    }
    if (!done) break;
  }
  // the marks of uplands left to stairs are not ramp tiles
  for (let i = 0; i < N; i++) if (tiles[i] === 2) tiles[i] = 0;
  return { steps, cut, leftToStairs: left, tiles };
}

/** The gentlest line from a component to the main one: side-to-side steps over land, each level
 *  climbed costing more the steeper it is, so the line finds the lowest part of the cliff. */
export function rampPath(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, lab: Int32Array, from: number, to: number): number[] | null {
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    if (lab[i] !== from) continue;
    // start from the component's edge tiles
    const x = i % W;
    const y = (i - x) / W;
    let edge = false;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (lab[yy * W + xx] !== from) edge = true;
    }
    if (!edge || !inside(x, y, W, H, 4)) continue;
    cost[i] = 0;
    heap.push(0, i);
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > cost[c]) continue;
    if (lab[c] === to) {
      const out: number[] = [];
      for (let i = c; i >= 0; i = prev[i]) out.push(i);
      return out.reverse();
    }
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (!inside(xx, yy, W, H, 4)) continue;
      const j = yy * W + xx;
      if (water[j] || keep[j] || lab[j] === from) continue;
      const d = Math.abs(h[j] - h[c]);
      const nk = k + 1 + (d > 1 ? 4 * d : 0);
      if (nk < cost[j]) {
        cost[j] = nk;
        prev[j] = c;
        heap.push(nk, j);
      }
    }
  }
  return null;
}

/** A ramp's ground keeps off the map's two outer rows, and its line off the four (the D410 round: ramps ran
 *  along the row beside the edge, a staircase down the map's frame on four Highlands maps; kept off the two
 *  rows alone, they ran along the third). */
function inside(x: number, y: number, W: number, H: number, m = 2): boolean {
  return x >= m && y >= m && x < W - m && y < H - m;
}

/** The most levels one natural ramp climbs. A taller cliff is left to stairs: a ramp of eight levels
 *  was a straight flight of eight slopes two tiles apart, a pier down the valley side (the D410
 *  round: River Valley 128² seed 4, Highlands 128² seeds 2–4). */
export const RAMP_MOST = 4;

/** Regrade a path into steps of one level, three tiles wide, each two to four tiles long (drawn from
 *  `lay`, so a ramp has landings, never even treads); the path is extended into the land on both
 *  sides as far as the drop and its landings need. A ramp that would read as built is not cut: one
 *  taller than `RAMP_MOST`, one whose regrade raises a causeway over the lower ground beside it, and
 *  one running between water or kept ground on both sides, a pier (the D410 round). */
export function cutRamp(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, path: number[], tiles: Uint8Array, steps: [number, number][], lay: Rng): boolean {
  const a = h[path[0]];
  const b = h[path[path.length - 1]];
  const drop = Math.abs(a - b);
  if (drop > RAMP_MOST) return false;
  // extend each end straight on, inside its own ground, until the path is 2 tiles a level + 2, and
  // as far again as the landings drawn for it
  const need = 2 * drop + 2;
  const landings = drop > 1 ? lay.int(1, drop + 1) : 0;
  const want = need + landings;
  const q = path.slice();
  const extend = (atStart: boolean) => {
    const p0 = atStart ? q[0] : q[q.length - 1];
    const p1 = atStart ? q[1] : q[q.length - 2];
    const dx = (p0 % W) - (p1 % W);
    const dy = Math.floor(p0 / W) - Math.floor(p1 / W);
    const lv = h[p0];
    let x = p0 % W;
    let y = Math.floor(p0 / W);
    for (let n = 0; n < want; n++) {
      x += dx;
      y += dy;
      if (!inside(x, y, W, H, 4)) break;
      const j = y * W + x;
      if (water[j] || keep[j] || h[j] !== lv) break;
      if (atStart) q.unshift(j);
      else q.push(j);
      if (q.length >= want) break;
    }
  };
  if (q.length < want && q.length >= 2) {
    extend(true);
    extend(false);
  }
  const n = q.length;
  // a ramp climbs the cliff where two grounds meet: its route between them is no longer than the
  // ramp needs, and every tile of its path stands between its ends' levels. A longer route is a road
  // across the land, regraded straight with right-angle turns (Canyon 128² seed 12 got one 113 tiles
  // long); one over higher ground cuts a ruler-straight slot through it (Highlands 128² seed 16: a
  // 3-wide slot 25 tiles long and 9 deep, with water in it, D209); one over lower ground raises a
  // causeway. Such an upland is left to stairs
  if (path.length > need + 2) return false;
  const top = Math.max(a, b);
  const bottom = Math.min(a, b);
  for (const i of q) if (h[i] > top || h[i] < bottom) return false;
  // a level must span two tiles at least; where it cannot (too short a path), no ramp
  if (n < 2 * (drop + 1)) return false;
  // each level's length: two tiles, and the path's spare tiles dealt to levels drawn at random, so
  // the treads run two, three or four tiles and the slopes stand unevenly apart
  const len = new Array<number>(drop + 1).fill(2);
  dealTreads(len, 0, drop + 1, n - 2 * (drop + 1), lay);
  const sgn = b > a ? 1 : -1;
  const lev: number[] = [];
  for (let k = 0; k <= drop; k++) for (let t = 0; t < len[k]; t++) lev.push(a + sgn * k);
  while (lev.length < n) lev.push(b);
  // a ramp between water or kept ground on most of both sides is not cut: a pier, or a 1-wide ridge
  // with slopes up it (Canyon 128² seed 1)
  const held = new Set<number>();
  for (const i of q) {
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N8) {
      const j = (y + dy) * W + x + dx;
      if (inside(x + dx, y + dy, W, H) && (water[j] || keep[j])) held.add(j);
    }
  }
  if (held.size > 1.5 * n) return false;
  shapeRamp(h, W, H, (j) => !!(water[j] || keep[j]), q, lev, tiles, steps);
  return true;
}

/** Deal `spare` more tiles to the treads `len[from]`…`len[to - 1]`, each drawn from `lay`: a tread takes a fifth tile
 *  only once 48 draws have tried (`most`, the draw a tread of four is passed over until), so the treads run two, three
 *  or four tiles and the slopes stand unevenly apart (natural ramps, and the Slope's stair, core/doc/stair.ts). */
export function dealTreads(len: number[], from: number, to: number, spare: number, lay: Rng, most = 48): void {
  for (let tries = 0; spare > 0 && tries < 64; tries++) {
    const k = from + lay.int(0, to - from);
    if (len[k] >= 4 && tries < most) continue;
    len[k]++;
    spare--;
  }
}

/** Shape the ground under a ramp: its path `q`, each tile at its level `lev` (a level a tile of the path), the middle
 *  line at its level and the tiles beside it, three wide, too where they would stand more than a level off it; the
 *  lower ground beside a fill risen to it a level a tile, two tiles out at most, so the fill is a spur of land, never
 *  a causeway. `held` tiles are never touched, nor an earlier ramp's ground (`tiles` 1). The tiles shaped are marked 1
 *  in `tiles`, and each step's (low tile, high tile) pushed to `steps`: a slope on its low tile, facing up the path
 *  (natural ramps, and the Slope's stair, core/doc/stair.ts). */
export function shapeRamp(h: Uint8Array, W: number, H: number, held: (j: number) => boolean, q: readonly number[], lev: readonly number[], tiles: Uint8Array, steps: [number, number][]): void {
  // (`seen`: this ramp's own tiles, 1 once settled; `tiles` also holds earlier ramps' and the components left to
  // stairs, so it can't say which tiles this band holds)
  const seen = new Uint8Array(W * H);
  const band: number[] = [];
  const n = q.length;
  for (let k = 0; k < n; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (!inside(xx, yy, W, H)) continue;
        const j = yy * W + xx;
        if (held(j)) continue;
        // the middle line takes its level; the sides only where they would not stand above it
        if (ox === 0 && oy === 0) h[j] = lev[k];
        else if (Math.abs(h[j] - lev[k]) > 1) h[j] = lev[k];
        if (!seen[j]) band.push(j);
        seen[j] = 1;
        tiles[j] = 1;
      }
  }
  // the lower ground beside a fill rises to it a level a tile, two tiles out at most: the fill below a
  // ramp is a spur of land, never a three-wide causeway with cliffs down its sides (the D410 round:
  // River Valley 128² seed 4). The cut above it is left as the band cut it, a cleft: shoulders over
  // the cut too, and as far as the drop, wore the cliffs and plateau rims round every ramp away
  // (Highlands missed its promise on more lands)
  let ring = band;
  for (let r = 0; r < 2 && ring.length; r++) {
    const next: number[] = [];
    const visited: number[] = [];
    for (const c of ring) {
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (!inside(xx, yy, W, H)) continue;
        const j = yy * W + xx;
        // (an earlier ramp's ground is never raised: its slopes would stand on a level)
        if (seen[j] || held(j) || tiles[j] === 1) continue;
        seen[j] = 2;
        visited.push(j);
        let lo = -Infinity;
        let hi = Infinity;
        for (const [ex, ey] of N8) {
          const xe = xx + ex;
          const ye = yy + ey;
          if (xe < 0 || ye < 0 || xe >= W || ye >= H) continue;
          const e = ye * W + xe;
          if (seen[e] !== 1) continue;
          lo = Math.max(lo, h[e] - 1);
          hi = Math.min(hi, h[e] + 1);
        }
        if (lo > hi) continue;
        const v = h[j] < lo ? lo : h[j];
        if (v === h[j]) continue;
        h[j] = v;
        next.push(j);
      }
    }
    // (a ring's tiles are read as settled only once the whole ring is shaped)
    for (const j of visited) seen[j] = 1;
    ring = next;
  }
  // each step: a slope on its low tile, facing up the path
  for (let k = 0; k + 1 < n; k++) {
    const hiT = lev[k] > lev[k + 1] ? q[k] : lev[k + 1] > lev[k] ? q[k + 1] : -1;
    if (hiT < 0) continue;
    const loT = hiT === q[k] ? q[k + 1] : q[k];
    steps.push([loT, hiT]);
  }
}

/** The land runs on past the map's edge (Kyler, no edge walls): erosion never lowers the border
 *  tiles (they are outlets with nowhere to drain), and a channel's floor may stop a tile short of
 *  the edge, so a thin raised band can be left along it. Each of the two outer rows is lowered to
 *  the inward profile carried on (the next tile in, plus its rise toward the edge, never a fall), so
 *  land that rises toward the edge keeps rising and a band standing over the land inside it goes.
 *  Never raises a tile. Tiles marked in `keep` stay as they are (M9b: the banks beside an inflow's
 *  mouth, which hold its water in its channel), and no tile is lowered below its `floor` (the water
 *  of a planned channel beside it, `besideCourses`). Returns the number of tiles lowered. */
export function relaxEdges(h: Uint8Array, W: number, H: number, keep: Uint8Array | null = null, floor: ArrayLike<number> | null = null): number {
  let n = 0;
  const edges: [number, (k: number, t: number) => number][] = [
    [H, (k, t) => k * W + t],
    [H, (k, t) => k * W + (W - 1 - t)],
    [W, (k, t) => t * W + k],
    [W, (k, t) => (H - 1 - t) * W + k],
  ];
  for (const [len, at] of edges)
    for (let k = 0; k < len; k++)
      for (let t = 1; t >= 0; t--) {
        const a = h[at(k, t + 1)];
        const b = h[at(k, t + 2)];
        const i = at(k, t);
        const cap = Math.max(a + Math.max(0, a - b), floor ? floor[i] : 0);
        if (h[i] > cap && !keep?.[i]) {
          h[i] = cap;
          n++;
        }
      }
  return n;
}


/** Level regions smaller than `min` tiles take the most common level round them. */
export function mergeSmallRegions(h: Uint8Array, W: number, H: number, min: number, keep: Uint8Array | null = null): void {
  for (let pass = 0; pass < 3; pass++) {
    const { labels, size } = levelRegions(h, W, H);
    let changed = false;
    const votes = new Map<number, Map<number, number>>();
    for (let i = 0; i < W * H; i++) {
      if (size[labels[i]] >= min || keep?.[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (labels[j] === labels[i]) continue;
        const m = votes.get(labels[i]) ?? votes.set(labels[i], new Map()).get(labels[i])!;
        m.set(h[j], (m.get(h[j]) ?? 0) + 1);
      }
    }
    const to = new Map<number, number>();
    for (const [lab, m] of votes) {
      let best = -1;
      let bn = -1;
      for (const [lv, n] of [...m].sort((a, b) => a[0] - b[0])) if (n > bn) {
        bn = n;
        best = lv;
      }
      if (best >= 0) to.set(lab, best);
    }
    for (let i = 0; i < W * H; i++) {
      const v = to.get(labels[i]);
      if (v !== undefined && !keep?.[i]) {
        h[i] = v;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** The build's integrity rule (features/raster/terrain.ts `integrityLevel`, unclipped and off no
 *  channel): a tile lower than all four neighbours rises to the lowest, one higher than all four
 *  falls to the highest. */
export function cleanPitsAndSpikes(h: Uint8Array, W: number, H: number, keep: Uint8Array | null): number {
  const prot = keep ?? new Uint8Array(W * H);
  const channel = new Uint8Array(W * H);
  const any = () => true;
  let changed = 0;
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    const pre = (j: number) => src[j];
    let n = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const v = integrityLevel(pre, W, H, prot, channel, any, i, Infinity);
        if (v !== src[i]) {
          h[i] = v;
          n++;
        }
      }
    changed += n;
    if (!n) break;
  }
  return changed;
}

/** Fill every closed hollow that holds no planned water (`keep`), up to its spill level: a dry hollow
 *  below a source is pre-filled by the canonical settle and then only evaporates, so the water would
 *  never settle (water.settles). Open valleys stay: a dam across one is still a reservoir. Returns the
 *  number of tiles raised. */
export function fillDryHollows(h: Uint8Array, W: number, H: number, keep: Uint8Array): number {
  const N = W * H;
  // priority flood from the edge through the kept water too (it drains through its outlet)
  const filled = edgeSpill(h, W, H);
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (keep[i] || filled[i] <= h[i]) continue;
    h[i] = filled[i];
    n++;
  }
  return n;
}

/** Outlets for the broad basins that hold water (M9a: water that settles). A basin whose spill level
 *  is a wide flat (a sea's shelf at its rim's level) sends its water out as a sheet over the whole
 *  flat, and the sheet takes days to settle (the check's four days are not enough on a sea). Each
 *  such basin gets a channel a level below the flat, winding across it from the basin to where the
 *  land falls away or to the map edge, so its water leaves by one outlet as a river's does. Only
 *  basins of `minArea` tiles or more whose flat at the spill level is `minFlat` tiles or more; the
 *  tiles of `keep` (the river channels) are never cut, a lake's shallow shore may be, and no tile is
 *  cut below its `floor` (the water of a planned channel beside it, `besideCourses`: the outlet
 *  would give that water a second way out). Returns the tiles cut. */
export function carveOutlets(h: Uint8Array, W: number, H: number, keep: Uint8Array, seed: number, width = 5, minArea = 300, minFlat = 120, wet: Uint8Array | null = null, floor: ArrayLike<number> | null = null): number {
  const N = W * H;
  // spill levels from the draining map edge (priority flood)
  const spill = edgeSpill(h, W, H);
  // basins: connected tiles standing below their spill level
  const label = new Int32Array(N).fill(-1);
  const basins: { tiles: number[]; level: number }[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] >= 0 || !(spill[s0] > h[s0])) continue;
    const id = basins.length;
    const tiles = [s0];
    label[s0] = id;
    for (let q = 0; q < tiles.length; q++) {
      const c = tiles[q];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] >= 0 || !(spill[j] > h[j]) || spill[j] !== spill[s0]) continue;
        label[j] = id;
        tiles.push(j);
      }
    }
    basins.push({ tiles, level: spill[s0] });
  }
  let cut = 0;
  basins.forEach((b, id) => {
    if (b.tiles.length < minArea || b.level < BED_FLOOR + 1) return;
    // (with `wet`, only a basin the planned water reaches: its own tiles or beside them)
    if (wet && !b.tiles.some((i) => wet[i] || (i % W > 0 && wet[i - 1]) || (i % W < W - 1 && wet[i + 1]) || (i >= W && wet[i - W]) || (i < N - W && wet[i + W]))) return;
    const S = b.level;
    // the flat at the spill level joined to the basin: a sheet of water would spread over all of it
    const seen = new Uint8Array(N);
    const q: number[] = [];
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || label[j] === id || h[j] !== S || spill[j] !== S) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    for (let k = 0; k < q.length && q.length < minFlat; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || label[j] === id || h[j] !== S || spill[j] !== S) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length < minFlat) return;
    // the flat at the spill level joined to the basin, and a way across it to lower ground or the
    // map edge (cheapest by a noisy cost, so the channel winds)
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    for (const i of b.tiles) {
      cost[i] = 0;
      hp.push(0, i);
    }
    let end = -1;
    const ns = hash32(seed, "outlet", id);
    while (hp.size) {
      const c = hp.pop();
      const k = hp.lastKey;
      if (k > cost[c]) continue;
      const x = c % W;
      const y = (c - x) / W;
      if (label[c] !== id) {
        // lower ground beside it, or the map's edge: the way out
        let out = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && spill[yy * W + xx] < S && label[yy * W + xx] !== id) out = true;
        }
        if (out) {
          end = c;
          break;
        }
      }
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] === id || h[j] !== S || spill[j] !== S || cost[j] <= k) continue;
        const nk = k + 1 + 1.2 * (fbm(ns, xx, yy, 7, 2) + 1);
        if (nk < cost[j]) {
          cost[j] = nk;
          prev[j] = c;
          hp.push(nk, j);
        }
      }
    }
    if (end < 0) return;
    // (wound like a gully, D209: across a flat the cheapest way is a straight line, and a channel
    // cut along it has ruler-straight banks)
    const straight: number[] = [];
    for (let c = end; c >= 0 && label[c] !== id; c = prev[c]) straight.push(c);
    straight.reverse();
    const isOut = (c: number) => {
      const x = c % W;
      const y = (c - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return true;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && spill[yy * W + xx] < S && label[yy * W + xx] !== id) return true;
      }
      return false;
    };
    const route = windRoute(straight, W, H, (i) => label[i] !== id && h[i] === S && spill[i] === S, isOut, stream(seed, "outlet-wind", id));
    // cut the way at a level below the flat, `width` tiles wide (never the kept water)
    const r = (width - 1) / 2;
    for (const c of route) {
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy > r * r + 0.5) continue;
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (keep[j] || h[j] !== S || label[j] === id || (floor && floor[j] > S - 1)) continue;
          h[j] = S - 1;
          cut++;
        }
    }
  });
  return cut;
}

/** The lakes of `lakes` that no river's water reaches on the land as it is now: the water from each
 *  river's head (its mouth tile on the edge, its spring) runs downhill or level on the land filled to
 *  its spill levels, as the canonical pre-fill runs it (sim/prefill.ts; `sealed` edge tiles, a river's
 *  mouth, are not outlets, as the sources' own tiles are not). The land has changed since
 *  the hydrology found its lakes (other rivers cut, edges relaxed, small regions merged), and a lake
 *  its river no longer runs into fills only by seeping over a bank, for days. */
export function unreachedLakes(h: Uint8Array, W: number, H: number, heads: readonly number[], lakes: readonly { tiles: number[] }[], sealed: Uint8Array | null = null): number[] {
  const N = W * H;
  const spill = edgeSpill(h, W, H, sealed);
  const path = new Uint8Array(N);
  const q: number[] = [];
  for (const i of heads)
    if (i >= 0 && i < N && !path[i]) {
      path[i] = 1;
      q.push(i);
    }
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (path[j] || spill[j] > spill[c]) continue;
      path[j] = 1;
      q.push(j);
    }
  }
  const out: number[] = [];
  lakes.forEach((lk, k) => {
    if (!lk.tiles.some((i) => path[i])) out.push(k);
  });
  return out;
}

/** A sea's way out, as wide as its water needs (the canonical settle, PLAN §10): a broad basin
 *  starts full to its spill level, and its water then rises until its outlet passes the flow that
 *  comes in, by as much as a level where the outlet is a river's width (Islands 256² seed 1: the sea
 *  rose a whole level and settled after 6,144 ticks, past the settle's four days). A lip passes
 *  about 3 blocks a second per tile of width and block of depth, so the way out (sill, lips, pools
 *  and the mouth at the map edge) is made 1.6 tiles wide per block a second of the map's flow (7–41
 *  tiles): that sea then rises a third of a level and settles after 2,432 ticks. The route is the
 *  water's own way down to the map edge (never through higher ground, spill levels never rising),
 *  winding by noise; the land within half the width of it takes the level of the route beside it,
 *  a level below the sea's once past the sea's own shore (so the sill is short: a long flat at the
 *  sea's level takes a slope of water to carry the flow), never below the sea's level within two
 *  tiles of it and never on `keep`. A large lake of `lakes` whose floor is at its outlet's level is
 *  such a body too (its water stands as a sheet over the flat). A widening that would drain the
 *  sea or a kept lake is undone. With `organic` (a sea's map, D417) the route winds more and the
 *  banks wander from half the half-width to half as much again, the same width on average: a
 *  straight band of even width cut the shore as a rectangle (Islands 128² seed 20). */
export function widenOutlets(h: Uint8Array, W: number, H: number, keep: Uint8Array, seed: number, flow: number, lakes: readonly (readonly number[])[] = [], minArea = 2500, organic = false): number {
  const N = W * H;
  let spill = edgeSpill(h, W, H);
  const label = new Int32Array(N).fill(-1);
  const basins: { tiles: number[]; level: number; sheet?: boolean }[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] >= 0 || !(spill[s0] > h[s0])) continue;
    const id = basins.length;
    const tiles = [s0];
    label[s0] = id;
    for (let q = 0; q < tiles.length; q++) {
      const c = tiles[q];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] >= 0 || !(spill[j] > h[j]) || spill[j] !== spill[s0]) continue;
        label[j] = id;
        tiles.push(j);
      }
    }
    basins.push({ tiles, level: spill[s0] });
  }
  // a large lake of the hydrology whose floor is its outlet's level stands as a sheet over it, not
  // in a basin: it is a water body of its own, at that level
  for (const lk of lakes) {
    if (lk.length < minArea) continue;
    let flat = 0;
    for (const i of lk) if (label[i] < 0 && spill[i] === h[i]) flat++;
    if (flat < minArea / 2) continue;
    const count = new Map<number, number>();
    for (const i of lk) count.set(spill[i], (count.get(spill[i]) ?? 0) + 1);
    const S = [...count].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
    const id = basins.length;
    const tiles: number[] = [];
    for (const i of lk)
      if (label[i] < 0 && spill[i] === S) {
        label[i] = id;
        tiles.push(i);
      }
    basins.push({ tiles, level: S, sheet: true });
  }
  let lowered = 0;
  basins.forEach((b, id) => {
    if (b.tiles.length < (b.sheet ? minArea / 2 : minArea)) return;
    const S = b.level;
    const width = Math.max(7, Math.min(41, Math.round(Math.max(1.6 * flow, b.tiles.length / 1000)))) | 1;
    const R = (width - 1) / 2;
    // the route: from the basin down to the map edge, never up (spill levels never rise along it,
    // and no tile above the sea's level), cheapest by a noisy cost
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    for (const i of b.tiles) {
      cost[i] = 0;
      hp.push(0, i);
    }
    const ns = hash32(seed, "widen", id);
    let end = -1;
    while (hp.size) {
      const c = hp.pop();
      const k = hp.lastKey;
      if (k > cost[c]) continue;
      const x = c % W;
      const y = (c - x) / W;
      if (label[c] !== id && (x === 0 || y === 0 || x === W - 1 || y === H - 1) && !keep[c]) {
        end = c;
        break;
      }
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] === id || h[j] > S || spill[j] > spill[c] || cost[j] <= k) continue;
        const nk = k + 1 + (organic ? 6 : 3) * (fbm(ns, xx, yy, Math.max(12, width), 2) + 1);
        if (nk < cost[j]) {
          cost[j] = nk;
          prev[j] = c;
          hp.push(nk, j);
        }
      }
    }
    if (end < 0) return;
    const route: number[] = [];
    for (let c = end; c >= 0 && label[c] !== id; c = prev[c]) route.push(c);
    // next to the sea the land stays at its spill level: the sea keeps its level
    const nearSea = new Uint8Array(N);
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) nearSea[yy * W + xx] = 1;
        }
    }
    // each tile within R of the route takes the level of the route tile nearest it; the route
    // itself runs a level below the sea's once past its sill, so the sill is short and as wide as
    // the route (a long flat at the sea's level takes a slope of water to carry the flow)
    const best = new Float64Array(N).fill(Infinity);
    const target = new Int16Array(N).fill(-1);
    const band: number[] = [];
    const Ro = organic ? 1.5 * R : R;
    const Ri = Math.ceil(Ro);
    const bs = hash32(seed, "widen-bank", id);
    for (const r of route) {
      const rx = r % W;
      const ry = (r - rx) / W;
      for (let dy = -Ri; dy <= Ri; dy++)
        for (let dx = -Ri; dx <= Ri; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > Ro * Ro + 0.5) continue;
          const xx = rx + dx;
          const yy = ry + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (organic) {
            const Rb = R * clamp(1 + 1.4 * fbm(bs, xx, yy, Math.max(5, 0.6 * R), 3), 0.5, 1.5);
            if (d2 > Rb * Rb + 0.5) continue;
          }
          const j = yy * W + xx;
          if (target[j] < 0) band.push(j);
          if (d2 < best[j]) {
            best[j] = d2;
            target[j] = h[r] >= S && !nearSea[r] ? Math.max(BED_FLOOR, S - 1) : h[r];
          }
        }
    }
    const before = h.slice();
    const inBand = new Uint8Array(N);
    let n = 0;
    for (const j of band) {
      inBand[j] = 1;
      if (label[j] === id || keep[j]) continue;
      // (organic: off the route's own channel no lower than a level under the sea's: a band cut
      // down to a deep channel's bed it ran through stood as a box canyon, Islands 128² seed 12)
      const t = nearSea[j] ? Math.max(target[j], S) : organic && best[j] > 2.5 ? Math.max(target[j], Math.max(BED_FLOOR, S - 1)) : target[j];
      if (h[j] > t) {
        h[j] = t;
        n++;
      }
    }
    if (!n) return;
    // where it drains the sea or a kept lake (a hollow beside the route may join it), the cut round
    // what drained stands as it was (M9b, D350 (d): before, the whole widening was undone, and a
    // sea kept a way out too narrow for its springs, rising a level over its spill level); undone
    // when that is not enough
    let after = edgeSpill(h, W, H);
    let drained: number[] = [];
    for (let round = 0; round < 4; round++) {
      drained = [];
      for (let i = 0; i < N; i++) if ((label[i] === id || (keep[i] && !inBand[i])) && spill[i] > before[i] && after[i] < spill[i]) drained.push(i);
      if (!drained.length) break;
      const near = new Uint8Array(N);
      for (const i of drained) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
          }
      }
      for (const j of band) if (near[j] && h[j] !== before[j]) {
        h[j] = before[j];
        n--;
      }
      after = edgeSpill(h, W, H);
    }
    if (drained.length || n <= 0) {
      h.set(before);
      return;
    }
    spill = after;
    lowered += n;
  });
  return lowered;
}
