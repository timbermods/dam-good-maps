// The bold family (docs/design/uplands.md, round 5): above 128², Highlands' and Canyon's rings bunch. The game's bold
// maps (Terraces, Oasis, Hollows, Canyon, Pressure) hold the same calm ring terraces as its gentle ones, but in places
// the rings close up into a wall four to six levels tall within a tile or two, round a form with a name: a mesa, a
// hollow, a gorge's two faces with a bench between. Each wall here is a steep band in a form's smooth profile, laid on
// the graded levels before the edge warp and the snap (`levels.ts` `snapLevels`), never noise, so its line runs as
// smooth as the rings round it; the warp then bends it as it bends them.
//
// - Highlands stands up (round 6, `STAND`): few forms with tall walls on a floor, as the game's Terraces. A valley sunk
//   in the map's middle (`standValley`: a lobed bowl and the channel the water takes through it, its floor two or more
//   levels under the floor round it, the field the water is planned on sunk with it, `lowerValley`), a gentle floor in
//   rings (`levels.ts`), and on it five to nine mesas a 256² (`standMesas`), 35–80 tiles across, each a wall of 4–6
//   levels over most of its rim and broken, stepped ground over the rest, where the slopes find a way up. The field the
//   water is planned on stands high under each, so no river is planned across one. Their rims are kept from the
//   walls' notches (`notchWalls`): their ways are their own.
// - Canyon, the gorge (`boldGorge`): where the gorge's wall is steep, a bench is cut into the tableland's edge
//   `rise` levels over the floor, its width wandering along the gorge (none in places, where the wall stands whole),
//   so the gorge's side is two faces, the lower the taller; and one or two hollows off the gorge, a lobed bowl cut into
//   the tableland at its rim, its floor `over` levels over the gorge's, open to it.
// Exact arithmetic throughout: + − × ÷, `portable.sqrt`, the integer-hash noise.

import * as portable from "../math/portable";
import { stream } from "../math/rng";
import { fbm, warpedFbm } from "../math/noise";
import { clamp, smoothstep } from "../math/clamp";
import { hash32 } from "../math/hash";
import { sinDet, TWO_PI } from "../math/detmath";
import { formDist, pseudoAngle, type RingForm } from "./rings";
import { DIRS8 } from "./num";

/** The bold family's numbers. `bench`: its rise over the gorge's floor (levels), its width (tiles) and how far that
 *  wanders, over what cell, and how steep (levels a tile) the gorge's wall must be for one. `hollow`: how many (fewest,
 *  most), their radius (tiles), their floor over the gorge's (levels). */
export const BOLD = {
  bench: { rise: 4, width: 9, vary: 8, cell: 64, steep: 0.6 },
  hollow: { fewest: 1, most: 2, rMin: 13, rMax: 20, over: 2, tries: 60 },
} as const;

/** Highlands stands up (uplands round 6): a few mesas with walls on a gentle floor, the valley sunk in the middle.
 *  `valley`: the bowl's radius (a share of the map's narrower side, least and most), how far its middle strays from the
 *  map's (a share of the side), how wide its rim's fall is (tiles, least and most); the channel through it from the
 *  upstream edge to the downstream one, its half width (a share of the side, least and most), how far it wanders
 *  (a share of the side) over what cell (a share of the side), how wide its sides' fall (tiles); the valley's floor
 *  over the base (levels) where it leaves the map downstream and how much higher where it enters. `floor`: the floor's
 *  lowest level over the base and its relief (levels), its grade's roll (times the theme's). `mesa`: how many a 256²
 *  map draws (fewest, most), their radius at 256² (tiles), their wall (levels over the ground at their rim), the calm
 *  ground kept between two and between one and the valley (tiles past their radii), the wall's width (tiles), how
 *  far one stretches along its axis at the most, the share of its rim that is broken and stepped (least and most), the
 *  tiles a level there (least and most) and how far its broken edge eats into the top (tiles), the share of mesas with
 *  an inner ring, the draws tried. `lake` (round 6b): the bowl's bench over the base and the lake's hollow under it
 *  (levels), the lake's share of the bowl and of the plan's lake budget at the most, its middle up the water's line from
 *  the bowl's rim and how far up the line the sill's rock reaches (shares of the radius), the scale it is read at down
 *  the line, its shore's fall (tiles), the channel's run at the bench's level past the rim (tiles), and the main
 *  river's incision on such a land at the most; round 6b step 2: how far down the line the lake is read (`stretch`),
 *  its outline's lobes and the noise its shore is read with (`bays`, over `baysCell` of the radius). `springs`
 *  (step 2): the springs such a land draws at the most. `bench` (step 2): the rings the floor steps down to the bowl
 *  and the channel past the sill in, each `min`–`max` tiles broad over a noise of `cell` tiles, wobbling `wobble`
 *  tiles, `rings` of them, `step` levels each. `mesa.plinth` (step 2): the levels of the one bench a mesa stands on
 *  where its wall keeps `plinthWall` levels over it, `plinthMin`–`plinthMax` tiles broad. */
export const STAND = {
  springs: 3,
  valley: { rMin: 0.14, rMax: 0.18, stray: 0.06, softMin: 1.2, softMax: 3.5, halfMin: 0.026, halfMax: 0.038, wander: 0.11, cell: 0.3, side: 1.5, over: 0, rise: 2 },
  lake: { sill: 2, deep: 2, share: 0.35, budget: 0.6, at: 0.7, sillAt: 0.45, soft: 1, sillRun: 4, incise: 1.4, stretch: 0.5, lobes: 2.6, bays: 0.12, baysCell: 0.35 },
  bench: { min: 5, max: 13, cell: 40, wobble: 3, rings: 3, step: 2 },
  floor: { over: 4, relief: 4, roll: 0, riser: 0, drift: 0, away: 0.5, far: 0.5 },
  mesa: { fewest: 4, most: 6, rMin: 24, rMax: 46, hMin: 4, hMax: 6, gap: 8, edge: 0.6, wall: 1.2, stretch: 0.35, brokenMin: 0.12, brokenMax: 0.25, runMin: 1.8, runMax: 4.5, inset: 7, inner: 0.8, tries: 200, plinth: 2, plinthWall: 5, plinthMin: 4, plinthMax: 9 },
} as const;

/** A form's outline for `formDist`: a mesa's or a hollow's, its lobes gentler than the ringed forms'. */
function outline(s: number, x: number, y: number, r: number, lobes = 1): RingForm {
  const o = stream(s, "outline");
  return { x, y, r, h: 0, kind: "mesa", s, k1: 2 + Math.floor(2 * o.float()), p1: o.float(), a1: (0.08 + 0.1 * o.float()) * lobes, k2: 4 + Math.floor(3 * o.float()), p2: o.float(), a2: (0.03 + 0.05 * o.float()) * lobes, ox: 0, oy: 0 };
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

/** Whether a map's land stands up (round 6): Highlands above 128² (its narrower side), where the land is ringed. */
export function standsUp(theme: string, W: number, H: number): boolean {
  return theme === "highlands" && Math.min(W, H) > 128;
}

/** Highlands' valley (round 6): `m` how much of each tile is the valley (0 to 1), `floor` the valley's floor there
 *  (levels over the base), `share` the share of the map at least half valley, and the bowl's middle and radius. */
export interface StandValley {
  m: Float64Array;
  floor: Float64Array;
  /** How far each tile stands from the valley, 0 at its rim to 1 at `STAND.floor.far` of the side and beyond, eased. */
  away: Float64Array;
  share: number;
  cx: number;
  cy: number;
  r: number;
  /** How far each tile stands from the water's line, the channel's middle (tiles). */
  line: Float64Array;
  /** The bowl's tiles, 1, and the channel's past the sill, 2 (round 6b step 2: the benches step down to them,
   *  `benchValley`). */
  bowl: Uint8Array;
  /** The lake's sill (round 6b): the valley's tiles where the channel leaves the bowl, its rock (`Genome.rockSill`). */
  sill: Uint8Array;
}

/** The valley a land that stands up sinks in its middle: a lobed bowl near the map's middle, and a channel through it
 *  along the water's way (`flowDir`, the land's oriented one) from the upstream edge to the downstream one, wandering.
 *  The bowl's rim falls over one to four tiles as a slow noise has it, so it is a wall in places and a slope in
 *  others; the channel's sides fall gently. Drawn from the genome (its bench phase), so each land draws its own, the
 *  same for the field the water is planned on (`lowerValley`) and for the levels (`levels.ts` `snapLevels`).
 *
 *  The bowl holds a lake (round 6b): its floor is a level bench `lake.sill` levels over the base, the old floor the
 *  river filled as it came in, and against its downstream rim, where the channel leaves it, the floor lies `lake.deep`
 *  levels lower, a lobed hollow lying along the water's line (its middle `lake.at` of the radius up from the rim, read
 *  `lake.stretch` as far down the line as across it, so the bench lies beside the lake and the river reaches it at the
 *  bowl's upstream end; `lake.share` of the bowl, never more than `lake.budget` of the plan's lake budget, `lakeMost`
 *  tiles). The channel leaves the bowl at the bench's level and runs on at it for
 *  `lake.sillRun` tiles before it falls to the downstream edge: that stretch of the bowl's rim is the lake's sill. The
 *  water's plan finds the hollow on its river's way and fills it to the sill (`hydro.ts`, its lakes); nothing here
 *  lays water. Upstream the channel falls to the bench from `rise` levels over it. */
export function standValley(seed: number, variation: number, phase: number, flowDir: number, W: number, H: number, lakeMost = Infinity): StandValley {
  const V = STAND.valley;
  const K = STAND.lake;
  const N = W * H;
  const side = Math.min(W, H);
  const s = hash32(seed, "stand-valley", variation, Math.floor(phase * 1073741824));
  const rng = stream(s, "bowl");
  const r = (V.rMin + (V.rMax - V.rMin) * rng.float()) * side;
  const cx = (W - 1) / 2 + (2 * rng.float() - 1) * V.stray * side;
  const cy = (H - 1) / 2 + (2 * rng.float() - 1) * V.stray * side;
  const bowl = outline(hash32(s, "bowl-outline"), cx, cy, r, 1.4);
  const [ax, ay] = DIRS8[flowDir];
  const half = (V.halfMin + (V.halfMax - V.halfMin) * rng.float()) * side;
  const bowlAt = (x: number, y: number): number => {
    const tin = (1 - formDist(bowl, x, y, cx, cy, r)) * r;
    const soft = V.softMin + (V.softMax - V.softMin) * (fbm(s + 3, x, y, 0.25 * side, 2) + 1) / 2;
    return smoothstep(tin / soft + 0.5);
  };
  const offAt = (along: number): number => V.wander * side * fbm(s + 5, along, 0, V.cell * side, 2);
  // (the water's line: the channel's middle, `along` tiles down the flow from the bowl's middle)
  const lineX = (a: number): number => cx + a * ax - offAt(a) * ay;
  const lineY = (a: number): number => cy + a * ay + offAt(a) * ax;
  const onMap = (a: number): boolean => lineX(a) >= 0 && lineY(a) >= 0 && lineX(a) <= W - 1 && lineY(a) <= H - 1;
  // where the line leaves the bowl, down the flow and up it, and where it leaves the map downstream
  let aOut = 0;
  while (aOut < side && bowlAt(lineX(aOut), lineY(aOut)) >= 0.5) aOut += 0.5;
  let aIn = 0;
  while (aIn > -side && bowlAt(lineX(aIn), lineY(aIn)) >= 0.5) aIn -= 0.5;
  let aEnd = aOut;
  while (aEnd < 2 * side && onMap(aEnd)) aEnd += 1;
  const m = new Float64Array(N);
  const mb = new Float64Array(N);
  const mcs = new Float64Array(N);
  const floor = new Float64Array(N);
  const alongOf = new Float64Array(N);
  const sill = new Uint8Array(N);
  const line = new Float64Array(N);
  const latOf = new Float64Array(N);
  let n = 0;
  let inBowl = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = bowlAt(x, y);
      const along = (x - cx) * ax + (y - cy) * ay;
      const lat = -(x - cx) * ay + (y - cy) * ax;
      const hw = half * (1 + 0.5 * fbm(s + 7, along, 0, 0.5 * V.cell * side, 2));
      latOf[i] = lat - offAt(along);
      line[i] = Math.abs(latOf[i]);
      const mc = smoothstep((hw - line[i]) / V.side + 0.5);
      const v = Math.max(b, mc);
      m[i] = v;
      mb[i] = b;
      mcs[i] = mc;
      alongOf[i] = along;
      if (v >= 0.5) n++;
      if (b >= 0.5) inBowl++;
    }
  // the lake: a lobed hollow on the water's line against the bowl's downstream rim, as much of the bowl as asked
  const aL = aOut - K.at * r;
  const want = Math.min(K.share * inBowl, K.budget * lakeMost);
  const sd = lakeShore(s, W, H, r, aL, lineX(aL), lineY(aL), mb, alongOf, latOf, want, ax, ay);
  for (let i = 0; i < N; i++) {
    if (m[i] <= 0) continue;
    const a = alongOf[i];
    // the channel: falling to the bench from upstream, at the bench's level through the bowl and over its sill, then
    // falling to the downstream edge
    const vChan = a < aIn ? K.sill + V.rise * clamp((aIn - a) / (0.45 * side), 0, 1) : a <= aOut + K.sillRun ? K.sill : K.sill - (K.sill - V.over) * clamp((a - aOut - K.sillRun) / Math.max(8, aEnd - aOut - K.sillRun), 0, 1);
    // the bowl: the bench, and the lake's hollow under it
    const lk = smoothstep(sd[i] / K.soft + 0.5);
    const vBowl = K.sill - K.deep * lk;
    // (round the bowl's rim, off the channel, the ground stands at the bench's level at least: no way round the sill)
    const wb = smoothstep((mb[i] - 0.5) / 0.2 + 0.5);
    floor[i] = wb * vBowl + (1 - wb) * (mcs[i] >= mb[i] ? vChan : Math.max(vChan, K.sill));
    // (the sill: the bench between the lake and the bowl's downstream rim, and the channel's run over it)
    if (a >= aOut - K.sillAt * r && a <= aOut + K.sillRun + 2) sill[i] = 1;
  }
  // how far each tile is from the valley (a chamfer distance, 1 and 1.4 a step), eased to 1 at `far` of the side
  const dist = new Float64Array(N).fill(1e9);
  for (let i = 0; i < N; i++) if (m[i] >= 0.5) dist[i] = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < N; k++) {
      const i = pass ? N - 1 - k : k;
      const x = i % W;
      const y = (i - x) / W;
      const sy = pass ? 1 : -1;
      for (const [dx, dy, c] of [[-1, 0, 1], [0, sy, 1], [-1, sy, 1.4], [1, sy, 1.4], [1, 0, 1]] as const) {
        if ((pass === 0 && dx === 1 && dy === 0) || (pass === 1 && dx === -1 && dy === 0)) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const v = dist[yy * W + xx] + c;
        if (v < dist[i]) dist[i] = v;
      }
    }
  const away = new Float64Array(N);
  for (let i = 0; i < N; i++) away[i] = smoothstep(dist[i] / (STAND.floor.far * side));
  const inBowlT = new Uint8Array(N);
  for (let i = 0; i < N; i++) inBowlT[i] = mb[i] >= 0.5 && mb[i] >= mcs[i] ? 1 : 2 * (mb[i] < 0.5 && alongOf[i] > aOut + K.sillRun + 2 ? 1 : 0);
  return { m, floor, away, share: n / N, cx, cy, r, line, sill, bowl: inBowlT };
}

/** The lake's shore in the bowl (round 6b step 2): found, not laid. The bowl's tiles nearest a lobed outline round the
 *  lake's middle on the water's line (`aL` tiles along it, at `lx`, `ly`), read `STAND.lake.stretch` as far down the
 *  line as across it, so the lake lies along the line with the bench beside it, the `want` nearest are the lake. The
 *  outline's lobes are deep (`lobes`) and the distance is read with a slow warped noise (`bays`), so the shore wanders
 *  into a bay or two and round a spit, and no two lakes share an outline (step 1's lake, of gentle lobes, read as a
 *  laid round basin). Returns each tile's signed distance to the shore (tiles, positive in the lake). */
function lakeShore(s: number, W: number, H: number, r: number, aL: number, lx: number, ly: number, mb: Float64Array, alongOf: Float64Array, latOf: Float64Array, want: number, ax: number, ay: number): Float64Array {
  const K = STAND.lake;
  const N = W * H;
  const lakeF = outline(hash32(s, "lake-outline"), lx, ly, r, K.lobes);
  const bs = hash32(s, "lake-bays");
  const ds: number[] = [];
  const dl = new Float64Array(N).fill(Infinity);
  for (let i = 0; i < N; i++)
    if (mb[i] >= 0.5) {
      const x = i % W;
      const y = (i - x) / W;
      const u = (alongOf[i] - aL) * K.stretch;
      const v = latOf[i];
      dl[i] = formDist(lakeF, lx + u * ax - v * ay, ly + u * ay + v * ax, lx, ly, r) + K.bays * warpedFbm(bs, x, y, K.baysCell * r, 3, 0.2 * r);
      ds.push(dl[i]);
    }
  ds.sort((a, b) => a - b);
  const q = ds.length && want >= 1 ? ds[Math.min(ds.length - 1, Math.floor(want))] : -Infinity;
  const sd = new Float64Array(N);
  for (let i = 0; i < N; i++) sd[i] = Number.isFinite(dl[i]) ? (q - dl[i]) * r : -1e9;
  return sd;
}

/** A chamfer distance (1 and 1.4 a step) to the nearest tile of `src`, and that tile, both ways over the map. */
function nearestOf(src: Uint8Array, W: number, H: number): { dist: Float64Array; from: Int32Array } {
  const N = W * H;
  const dist = new Float64Array(N).fill(1e9);
  const from = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++)
    if (src[i]) {
      dist[i] = 0;
      from[i] = i;
    }
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < N; k++) {
      const i = pass ? N - 1 - k : k;
      const x = i % W;
      const y = (i - x) / W;
      const sy = pass ? 1 : -1;
      const sx = pass ? 1 : -1;
      for (const [dx, dy, c] of [[sx, 0, 1], [0, sy, 1], [-1, sy, 1.4], [1, sy, 1.4]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (dist[j] + c < dist[i]) {
          dist[i] = dist[j] + c;
          from[i] = from[j];
        }
      }
    }
  return { dist, from };
}

/** The benches round the valley (round 6b step 2): the floor steps down to the valley one level at a time, in rings
 *  that follow its rim, each `STAND.bench.min`–`max` tiles broad as a slow noise has it, the first a level over the
 *  valley's floor beside it, so the bowl lies in nested terraces as the game's Terraces do, not behind one wall. The
 *  graded levels `level` (after the valley is sunk in them) are only lowered, never under a level over the valley's
 *  floor, so no way round the lake's sill opens. */
export function benchValley(level: Float64Array, v: StandValley, base: number, W: number, H: number, seed: number): void {
  const B = STAND.bench;
  const N = W * H;
  const inV = new Uint8Array(N);
  for (let i = 0; i < N; i++) inV[i] = v.m[i] >= 0.5 ? 1 : 0;
  // (round the bowl: the tiles whose nearest valley is the bowl's, not the channel's)
  const { dist, from } = nearestOf(inV, W, H);
  const s = hash32(seed, "stand-benches");
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (inV[i] || from[i] < 0 || !v.bowl[from[i]]) continue;
      // (past the sill the channel falls to the edge: its sides step down to it as the bowl's do, so it leaves the map
      // in a terraced valley, not a chute)
      const run = B.min + (B.max - B.min) * (warpedFbm(s, x, y, B.cell, 2, 0.5 * B.cell) + 1) / 2;
      const d = dist[i] + B.wobble * fbm(s + 1, x, y, 0.5 * B.cell, 2);
      const ring = Math.floor(Math.max(0, d) / run);
      if (ring >= B.rings) continue;
      const cap = base + v.floor[from[i]] + B.step * (ring + 1);
      if (level[i] > cap) level[i] = cap;
    }
}

/** The field the water is planned on, sunk in the valley below all the land round it, falling along the channel
 *  toward the downstream edge and across it to the water's line, so the rivers the land plans run down the valley's
 *  middle and through the bowl's lake. */
export function lowerValley(E: Float64Array, v: StandValley, flowDir: number, W: number, H: number): void {
  const sorted = Float64Array.from(E).sort();
  const lo = sorted[Math.floor(0.02 * (sorted.length - 1))];
  const span = Math.max(1e-6, sorted[Math.floor(0.98 * (sorted.length - 1))] - lo);
  const [ax, ay] = DIRS8[flowDir];
  const side = Math.min(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = v.m[i];
      if (k <= 0) continue;
      const t = clamp(((x - v.cx) * ax + (y - v.cy) * ay) / (0.45 * side), -1, 1);
      // (falling to the water's line across the valley too, so the river keeps to its middle and through the lake)
      const target = lo - 0.05 * span - (0.12 * span * (1 + t)) / 2 - 0.04 * span * (1 - Math.min(1, v.line[i] / v.r));
      if (target < E[i]) E[i] += k * (target - E[i]);
    }
}

/** Highlands' mesas on a land that stands up (round 6), on the graded levels `level` (before the warp and the snap),
 *  under `top`: five to nine a 256² (by area), 35–80 tiles across, lobed and stretched, clear of each other and of the
 *  valley. Each stands 4–6 levels over the ground round its rim, a wall over most of its rim; over one or two arcs of it
 *  (an eighth to a quarter of the rim, the first toward the valley) its side is broken and stepped, a level every few
 *  tiles, irregular, and its edge eaten in, so the slopes find a way up (never a ramp laid). Its top is level, half of
 *  them with one inner ring a level or two higher over less than half of it. The field `E` the water is planned on is
 *  raised to `eHigh` under each, so no river is planned across one, and no spring is drawn on a top (`tops`, the
 *  genome's `dryTops`): the tops stay dry, for a dam or a channel to water. Returns the tiles about their rims (`skip`,
 *  for `notchWalls` to leave) and the tops, or null where none stands. */
export function standMesas(level: Float64Array, E: Float64Array, W: number, H: number, seed: number, variation: number, valley: StandValley, base: number, top: number, eHigh: number): { skip: Uint8Array; tops: Uint8Array } | null {
  const side = Math.min(W, H);
  const M = STAND.mesa;
  const sizeK = Math.min(1, side / 256);
  const area = (W * H) / (256 * 256);
  const rng = stream(seed, "stand-mesas", variation, Math.floor(valley.cx * 64), Math.floor(valley.cy * 64));
  const want = Math.max(1, Math.round((M.fewest + rng.int(0, M.most - M.fewest + 1)) * area));
  const at = (x: number, y: number) => level[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  const vat = (x: number, y: number) => valley.m[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  type Mesa = { f: RingForm; e: number; ca: number; sa: number; T: number; foot: number; arcs: [number, number][]; inner: RingForm | null; rise: number };
  const mesas: Mesa[] = [];
  for (let k = 0; k < want; k++) {
    // of the draws that fit, the one whose wall stands 4–7 over most of the ground round its rim (the first the largest)
    let best: { x: number; y: number; r: number; e: number; turn: number; T: number; foot: number; t: number; share: number; plinth: number; p75: number } | null = null;
    for (let t = 0; t < M.tries; t++) {
      const u = rng.float();
      const r = (M.rMin + (M.rMax - M.rMin) * (k === 0 ? 0.7 + 0.3 * u : u)) * sizeK;
      const e = 1 + M.stretch * rng.float();
      const turn = rng.float();
      const reach = r * e;
      // (a mesa may stand partly off the map's edge, as the game's own do)
      const margin = M.edge * reach;
      const x = margin + (W - 1 - 2 * margin) * rng.float();
      const y = margin + (H - 1 - 2 * margin) * rng.float();
      // (walls of 5 and 6 the commoner)
      const h = M.hMin + Math.floor((M.hMax - M.hMin + 1) * portable.sqrt(rng.float()));
      if (W - 1 - 2 * margin <= 0 || H - 1 - 2 * margin <= 0) continue;
      if (mesas.some((q) => {
        const need = q.f.r * q.e + reach + M.gap * sizeK;
        return (q.f.x - x) * (q.f.x - x) + (q.f.y - y) * (q.f.y - y) < need * need;
      })) continue;
      // clear of the valley, its walls standing at the valley's rim where they meet it
      let wet = false;
      for (let v = -reach; v <= reach && !wet; v += 3)
        for (let w = -reach; w <= reach; w += 3)
          if (w * w + v * v <= reach * reach && vat(x + w, y + v) > 0.05) {
            wet = true;
            break;
          }
      if (wet) continue;
      // the ground round its rim and under it, read on a coarse grid
      const rim: number[] = [];
      for (let a = 0; a < 24; a++) {
        const th = (TWO_PI * a) / 24;
        const ux = sinDet(th + TWO_PI / 4);
        const uy = sinDet(th);
        rim.push(at(x + 1.1 * r * (ux * (1 + (e - 1) * Math.abs(ux))), y + 1.1 * r * (uy * (1 + (e - 1) * Math.abs(uy)))));
      }
      let inMin = Infinity;
      let inMax = -Infinity;
      for (let v = -r; v <= r; v += 4)
        for (let w = -r; w <= r; w += 4) {
          if (w * w + v * v > 0.8 * r * r) continue;
          const L = at(x + w, y + v);
          if (L < inMin) inMin = L;
          if (L > inMax) inMax = L;
        }
      const sorted = rim.slice().sort((a, b) => a - b);
      // (round 6b step 2: on a plinth of one or two benches where the top leaves room, its wall over the last)
      const p75 = Math.round(sorted[18]);
      const T = Math.min(p75 + M.plinth + h, top);
      const plinth = T - p75 - M.plinthWall >= M.plinth ? M.plinth : 0;
      if (inMax > T - 2.5 || inMin < base + 2) continue;
      let share = 0;
      for (const L of rim) if (T - plinth - L >= M.hMin - 0.5 && T - plinth - L <= M.hMax + 1.5) share++;
      share /= rim.length;
      if (share >= 0.6 && (!best || share > best.share + 0.05 || (k === 0 && share >= best.share - 0.05 && r > best.r))) best = { x, y, r, e, turn, T, foot: T - h, t, share, plinth, p75 };
    }
    if (!best) continue;
    const { x, y, r, e, turn, T, t, plinth } = best;
    const foot = T - Math.max(M.hMin, T - best.p75 - plinth);
    const f = outline(hash32(seed, "stand-mesa", variation, k, t), x, y, r, 1.5);
    const o = stream(f.s, "mesa-parts");
    // the broken arcs: one or two, an eighth to a quarter of the rim, the first toward the valley
    const share = M.brokenMin + (M.brokenMax - M.brokenMin) * o.float();
    const two = o.float() < 0.5;
    const c0 = pseudoAngle(valley.cx - x, valley.cy - y) + 0.16 * (o.float() - 0.5);
    const arcs: [number, number][] = two ? [[c0, share * 0.6 / 2], [c0 + 0.35 + 0.3 * o.float(), share * 0.4 / 2]] : [[c0, share / 2]];
    let inner: RingForm | null = null;
    let rise = 0;
    if (o.float() < M.inner) {
      const ir = (0.4 + 0.2 * o.float()) * r;
      inner = outline(hash32(f.s, "inner"), x + (o.float() - 0.5) * 0.4 * r, y + (o.float() - 0.5) * 0.4 * r, ir, 1.5);
      rise = Math.min(2, top - T);
      if (rise <= 0) inner = null;
    }
    mesas.push({ f, e, ca: sinDet(TWO_PI * turn + TWO_PI / 4), sa: sinDet(TWO_PI * turn), T, foot, arcs, inner, rise });
  }
  if (!mesas.length) return null;
  const skip = new Uint8Array(W * H);
  const tops = new Uint8Array(W * H);
  const arcOf = (arcs: [number, number][], t: number) => {
    let a = 0;
    for (const [c, hw] of arcs) {
      let d = Math.abs(t - (c - Math.floor(c)));
      if (d > 0.5) d = 1 - d;
      a = Math.max(a, smoothstep((hw - d) / 0.03 + 0.5));
    }
    return a;
  };
  for (const q of mesas) {
    const { f, e, ca, sa, T, foot, arcs, inner, rise } = q;
    const R = (1.5 * f.r + 2) * e + M.runMax * (M.hMax + 2) + M.inset;
    const x0 = Math.max(0, Math.floor(f.x - R));
    const x1 = Math.min(W - 1, Math.ceil(f.x + R));
    const y0 = Math.max(0, Math.floor(f.y - R));
    const y1 = Math.min(H - 1, Math.ceil(f.y + R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const L = level[i];
        // (stretched along its axis: the tile read back into the round outline)
        const du = (x - f.x) * ca + (y - f.y) * sa;
        const dv = -(x - f.x) * sa + (y - f.y) * ca;
        const xs = f.x + (du / e) * ca - dv * sa;
        const ys = f.y + (du / e) * sa + dv * ca;
        const d = formDist(f, xs, ys, f.x, f.y, f.r);
        const tin = (1 - d) * f.r;
        if (d > 0.7 && d < 1.5) skip[i] = 1;
        if (tin > 2) tops[i] = 1;
        let top0 = T;
        if (inner) top0 += rise * smoothstep((1 - formDist(inner, x, y, inner.x, inner.y, inner.r)) * inner.r + 0.5);
        // the plinth: from the wall's foot down to the floor a level a ring, each ring a few tiles, irregular (round
        // 6b step 2)
        let Lp = L;
        if (foot > L && tin < 0 && valley.m[i] <= 0) {
          const run = M.plinthMin + (M.plinthMax - M.plinthMin) * (fbm(f.s + 19, x, y, 14, 2) + 1) / 2;
          const pl = foot - M.plinth * Math.floor(Math.max(0, -tin - M.wall / 2) / run);
          if (pl > L) Lp = pl;
        }
        // the wall: a steep band at the rim, standing on the plinth
        const w = smoothstep((tin + M.wall / 2) / M.wall);
        const vWall = Lp + w * (top0 - Lp);
        // the broken side: the edge eaten in, then a level every few tiles, irregular
        const a = arcOf(arcs, pseudoAngle(x - f.x, y - f.y));
        let v = vWall;
        if (a > 0) {
          const inset = M.inset * (fbm(f.s + 11, x, y, 9, 2) + 1) / 2;
          const run = M.runMin + (M.runMax - M.runMin) * (fbm(f.s + 13, x, y, 7, 2) + 1) / 2;
          const out = Math.max(0, inset - tin);
          // (down to the mesa's foot, the floor it stands on, and no lower: where the ground falls away past it, to
          // the valley, the floor's own fall is the way on)
          const vStep = T - out / run + 0.6 * fbm(f.s + 17, x, y, 6, 2) * smoothstep(out / 2);
          v = (1 - a) * vWall + a * (vStep >= foot - 0.5 ? clamp(vStep, Lp, top0) : Lp);
        }
        if (v > L) level[i] = v;
        if (tin > -1 && E[i] < eHigh) E[i] = eHigh;
      }
  }
  return { skip, tops };
}

/** Each top tile's nearest tile on the gorge's top side beside its floor (`src`) and the distance to it, over the top
 *  side only (a nearest-source sweep, both ways): Infinity and −1 off it or out of reach. */
function nearestRim(low: Uint8Array, W: number, H: number): { dist: Float64Array; src: Int32Array } {
  const N = W * H;
  const dist = new Float64Array(N).fill(Infinity);
  const src = new Int32Array(N).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (low[i]) continue;
      if ((x > 0 && low[i - 1]) || (x + 1 < W && low[i + 1]) || (y > 0 && low[i - W]) || (y + 1 < H && low[i + W])) {
        dist[i] = 0;
        src[i] = i;
      }
    }
  const take = (i: number, x: number, y: number, j: number) => {
    const s = src[j];
    if (s < 0) return;
    const sx = s % W;
    const sy = (s - sx) / W;
    const d = portable.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy));
    if (d < dist[i]) {
      dist[i] = d;
      src[i] = s;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x > 0) take(i, x, y, i - 1);
        if (y > 0) {
          take(i, x, y, i - W);
          if (x > 0) take(i, x, y, i - W - 1);
          if (x + 1 < W) take(i, x, y, i - W + 1);
        }
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x + 1 < W) take(i, x, y, i + 1);
        if (y + 1 < H) {
          take(i, x, y, i + W);
          if (x + 1 < W) take(i, x, y, i + W + 1);
          if (x > 0) take(i, x, y, i + W - 1);
        }
      }
  }
  return { dist, src };
}

/** Canyon's gorge on the graded levels `level` (before the warp and the snap): its floor's band up to `floorTop`, its
 *  tableland's from `topLo`. A bench cut into the tableland's edge where the wall is steep, and the hollows. */
export function boldGorge(level: Float64Array, W: number, H: number, seed: number, variation: number, floorTop: number, topLo: number): void {
  const side = Math.min(W, H);
  if (side <= 128 || topLo - floorTop < 3) return;
  const N = W * H;
  const B = BOLD.bench;
  const sizeK = Math.min(1, side / 256);
  const mid = (floorTop + topLo) / 2;
  const low = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (level[i] < mid) low[i] = 1;
  const { dist, src } = nearestRim(low, W, H);
  // how steep the wall is where each rim tile stands (levels a tile)
  const steep = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    const gx = (level[y * W + Math.min(W - 1, x + 1)] - level[y * W + Math.max(0, x - 1)]) / 2;
    const gy = (level[Math.min(H - 1, y + 1) * W + x] - level[Math.max(0, y - 1) * W + x]) / 2;
    return Math.max(Math.abs(gx), Math.abs(gy));
  };
  const stp = new Float64Array(N).fill(-1);
  const Lb = floorTop + Math.min(B.rise, topLo - floorTop - 1.5);
  const bs = hash32(seed, "gorge-bench", variation);
  const was = level.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = src[i];
      if (s < 0) continue;
      const width = (B.width + B.vary * fbm(bs, x, y, B.cell * sizeK, 2)) * sizeK;
      const D = dist[i];
      if (width < 2.5 || D > width + 2) continue;
      if (stp[s] < 0) stp[s] = steep(s);
      const c = smoothstep((stp[s] - B.steep) / 0.4);
      const L = was[i];
      const P = Lb + (L - Lb) * smoothstep((D - width) / 1.2);
      if (c > 0 && L > P) level[i] = L - c * (L - P);
    }
  // the hollows: a lobed bowl cut into the tableland at the gorge's rim, open to the gorge
  const Hh = BOLD.hollow;
  const rng = stream(seed, "gorge-hollows", variation);
  const area = (W * H) / (256 * 256);
  const want = Math.max(1, Math.round((Hh.fewest + rng.int(0, Hh.most - Hh.fewest + 1)) * area));
  const floorH = floorTop + Hh.over;
  const placed: RingForm[] = [];
  for (let k = 0; k < want; k++) {
    for (let t = 0; t < Hh.tries; t++) {
      const r = (Hh.rMin + (Hh.rMax - Hh.rMin) * rng.float()) * sizeK;
      const x = Math.round(r + 4 + (W - 9 - 2 * r) * rng.float());
      const y = Math.round(r + 4 + (H - 9 - 2 * r) * rng.float());
      const i = y * W + x;
      // its middle on the tableland, a little more than half its radius in from the rim
      if (!(dist[i] >= 0.5 * r && dist[i] <= 0.8 * r)) continue;
      if (placed.some((q) => (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < (q.r + r + 12 * sizeK) * (q.r + r + 12 * sizeK))) continue;
      // the tableland round it stands 3 or more over its floor
      const rim: number[] = [];
      for (let a = 0; a < 16; a++) {
        const th = (TWO_PI * a) / 16;
        const xx = Math.round(clamp(x + 1.1 * r * sinDet(th + TWO_PI / 4), 0, W - 1));
        const yy = Math.round(clamp(y + 1.1 * r * sinDet(th), 0, H - 1));
        if (!low[yy * W + xx]) rim.push(level[yy * W + xx]);
      }
      if (rim.length < 8 || median(rim) < floorH + 3) continue;
      const f = outline(hash32(seed, "gorge-hollow", variation, k, t), x, y, r);
      placed.push(f);
      const R = 1.45 * f.r + 2;
      for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(H - 1, Math.ceil(y + R)); yy++)
        for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(W - 1, Math.ceil(x + R)); xx++) {
          const j = yy * W + xx;
          const tin = (1 - formDist(f, xx, yy, x, y, r)) * r;
          const w = smoothstep((tin + 0.6) / 1.2);
          const v = level[j] + w * (floorH - level[j]);
          if (v < level[j]) level[j] = v;
        }
      break;
    }
  }
}
