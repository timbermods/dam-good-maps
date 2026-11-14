// Dead stands on the dry land (D516; planning's ruling on #236, 2026-11-11): standing dead pines, birches and oaks in
// clumped stands where forest was, as the game's own maps have them (Canyon 124, Plains 65, Oasis 36 per 1,000 dry
// tiles), aimed near the low end, about 40 per 1,000 dry tiles. One pass shared by every generator path: the resource
// pass (`resources.ts` `planResources`) runs it, so the themes and the premises both get it.
//
// They gather in a few old woods (two to four on a 128² map), each a group of stands grown outward from its middle, the
// rest of the dry land bare: at most a quarter of the dry land within 6 tiles of a dead tree (the aim gives way first).
// Where a wood goes is read from the land, never a random field: the old water line (the dry band just beyond the moist
// ground, where the water used to reach), the banks of dry beds and washes, the top of a mesa or butte (a level plate
// with no higher ground beside it; a stand keeps to its rim), and dry hollows and their rims; its trees are the site's
// (pines on dry tops, birches by old water, a few old oaks among them), so a 128² map holds hundreds of dead logs, not
// thousands. A stand is irregular knots of 3 to 8 trunks with gaps between, never four in a square, thinning to single
// trees at its edge, its outline the place's own, and a third of its trees died young and stand shorter (D518,
// `clumpStand`). Never on moist ground
// (living trees belong there), nor in a living grove's clearing; none within the start's own walk and few out to the
// starting-logs floor's, and none on the start's bench near it, so this is wood a colony travels for. A dead tree keeps
// its logs (`data/log-floor.json` `deadTreesKeepLogs`, from the game's blueprints) and grows none back: finite wood,
// never a carpet (MAPCRAFT §4).

import { levelRegions, distanceFrom, MinHeap } from "../math/grid";
import { valueNoise } from "../math/noise";
import { sqrt } from "../math/portable";
import type { Rng } from "../math/rng";
import { drainage } from "../land/drainage";
import { pickSeeds } from "./blobs";

/** The pass's numbers. */
export const DEAD_STANDS = {
  /** Dead trees per 1,000 dry tiles at Forests 100 %, the seed moving it within this range. */
  per1000: [36, 48] as const,
  /** Trees in one stand: the least, and two draws added on top (15 to 60, most 25 to 50); a stand its ground holds
   *  short of the least joins its wood's stand within `join` tiles of it, or is none. */
  stand: { least: 15, a: 21, b: 26, join: 6 },
  /** A stand's ground, tiles a tree: it grows from its seed along its place (a rim, a bank, the old water line), its
   *  outline the land's, never a box. */
  spread: 2.6,
  /** Its trees stand in knots with gaps between (planning's rulings on #236, 6819039430 and its follow-up: knots of 3 to
   *  8, irregular, never a filled square): knots of `core` trunks (least, most; the ground may leave fewer, never under
   *  3) for its first `inner` share of trees, of `mid` out to `outer`, single trees for the rest (the knots come nearest
   *  its seed first, so it thins to singles at its edge); each knot grown trunk by trunk within `reach` tiles of its
   *  middle (`reachBig` for six or more), that reach drawn out along one axis by up to `stretch` more and narrowed across
   *  it by up to `narrow`, each knot grown from its last trunk by up to `chain` of its steps (each knot its own shape,
   *  never one stamp), never beside another knot's trunk, so a tile's gap at least parts them; its knots' middles the
   *  ground nearest its seed, give or take `shuffle` of its reach; a
   *  single tree `single` tiles from any other at least (up to `singleMore` more; `near` of that where the first sweep
   *  left the stand short); where its knots crowd it so its nearest neighbours' spread is under `cv` of their mean,
   *  single trees set apart `lone` tiles from any other till it holds, and a stand still under `least` is none; its last single trees may stray `off`
   *  tiles off its place onto free ground beside it (each such step costing `offCost` more on its walk). */
  knot: { core: [6, 8] as const, mid: [4, 7] as const, inner: 0.75, outer: 0.92, reach: 1.5, reachBig: 2.0, stretch: 0.9, narrow: 0.35, chain: 0.6, shuffle: 0.1, single: 3, lone: 3, singleMore: 2, near: 0.7, cv: 0.55, least: 0.5, off: 1, offCost: 4 },
  /** A share of its trees died young, standing shorter (6819039430: mixed heights; the game stores a tree a drought
   *  killed growing as dead with its growth, and it keeps no logs). */
  young: 0.33,
  /** The old woods: two to four on a 128² map (by area elsewhere, one at least), about one a `trees` dead trees of the
   *  aim, so each is one broad group; each a group of stands within `radius` of its middle, each stand's seed the free
   *  ground nearest it give or take `near` tiles, on the kind of place its middle stands on (any kind, then any dry
   *  ground there, where its places are narrow); woods at least `apart` tiles apart (a fifth of the map's side when that
   *  is more), and where their land falls short, more woods up to the most. One wood stands in the start's opening view
   *  where the land allows: its middle past the start's clear walk and within `view` tiles' walk. */
  wood: { per128: [2, 4] as const, trees: 250, radius: 20, near: 4, apart: 30, view: 60 },
  /** The rest of the dry land bare (#236, after 6819039430): at most `most` of the dry tiles within `reach` tiles of a
   *  dead tree; a stand that would pass it is not grown, and after `misses` such the woods stop short of the aim. */
  bare: { reach: 6, most: 0.245, misses: 8 },
  /** An old giant among a stand's trees: an oak for every `oakEvery` trees, `oakMost` a stand at most. */
  oakEvery: 25,
  oakMost: 2,
  /** No stand within this many tiles' walk of the start (its wood's 20 and a margin). */
  clearWalk: 24,
  /** Out to this walk (the starting-logs floor's 40), a seed is this much less likely. */
  thinWalk: 40,
  thinWeight: 0.15,
  /** The start's bench is kept clear out to this walk. */
  benchWalk: 50,
  /** The old water line: dry tiles this far from moist ground or water. */
  shore: [2, 7] as const,
  /** A dry bed's bank: dry tiles this far from a dry channel or a wash's bed (`land/washes.ts`). */
  bank: [1, 3] as const,
  /** A dry hollow: ground at least this many levels under its spill, and its rim this far out. */
  hollowDepth: 1,
  hollowRim: 3,
  /** A mesa or butte top: a level plate with no higher ground beside it, this many tiles at least; a stand on it keeps
   *  to its rim, this many tiles in from its edge. */
  topLeast: 8,
  topRim: 4,
} as const;

/** The kinds of place a dead stand stands on. */
export type DeadPlace = "shore" | "bank" | "top" | "hollow";
const PLACES: readonly DeadPlace[] = ["shore", "bank", "top", "hollow"];

/** How likely each place is to hold a wood, and the tree the land would have had there: pines on dry tops, birches
 *  along old water and beds. */
const PLACE: Record<DeadPlace, { like: number; tree: "Pine" | "Birch" }> = {
  shore: { like: 1, tree: "Birch" },
  bank: { like: 1.5, tree: "Birch" },
  top: { like: 1, tree: "Pine" },
  hollow: { like: 1.5, tree: "Birch" },
};

export const DEAD_SPECIES = ["Pine", "Birch", "Oak"] as const;
export type DeadSpecies = (typeof DEAD_SPECIES)[number];

export interface DeadStandsInput {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Water on the tile (no tree stands in it). */
  wet: Uint8Array;
  /** Moist, dry-footed, clean ground (living trees' ground). */
  moist: Uint8Array;
  /** Where a tree may stand (no object, water, channel or kept-off ground on it), and no living grove's clearing. */
  free: Uint8Array;
  /** River and bed channels, wet or dry. */
  channel?: Uint8Array;
  /** The dry washes' beds and hollows (`land/washes.ts` `bedMask`). */
  beds?: Uint8Array;
  /** The walk from the start to each tile (null without a start). */
  walk: Float64Array | null;
  start?: { x: number; y: number };
  /** Forests, % (the stands scale with it). */
  forestDensity: number;
  /** The species mix's weights: pine, birch, oak. */
  mix: readonly [number, number, number];
  /** Dead trees on dry ground already planted (the start's fallback): they count toward the aim. */
  already: number;
  rng: Rng;
}

export interface DeadStand {
  /** Its grown trees. */
  tiles: number[];
  /** Its trees that died young (a shorter growth stage). */
  young: number[];
  area: number[];
  species: DeadSpecies;
  place: DeadPlace;
  /** A stand's old oaks, standing among its trees (its ground is the stand's). */
  giants?: boolean;
}

/** The dry tiles: no water and no moisture. The aim is per 1,000 of them. */
export function dryTiles(wet: Uint8Array, moist: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < wet.length; i++) if (!wet[i] && !moist[i]) n++;
  return n;
}

/** The start's bench tiles (`validate/playability.ts` `startBench`'s flood: the start's level joined to its 3×3
 *  without a slope; trees block neither it nor the walk). */
function benchTiles(h: Uint8Array, W: number, H: number, start: { x: number; y: number }): Uint8Array {
  const out = new Uint8Array(W * H);
  const level = h[start.y * W + start.x];
  const queue: number[] = [];
  for (let y = start.y - 1; y <= start.y + 1; y++)
    for (let x = start.x - 1; x <= start.x + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (h[i] === level && !out[i]) {
        out[i] = 1;
        queue.push(i);
      }
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (const n of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < H ? i + W : -1, y > 0 ? i - W : -1]) {
      if (n < 0 || out[n] || h[n] !== level) continue;
      out[n] = 1;
      queue.push(n);
    }
  }
  return out;
}

/** The spread of trees' nearest-neighbour distances: their standard deviation over their mean. */
export function nnSpread(tiles: readonly number[], W: number): number {
  const n = tiles.length;
  if (n < 2) return 0;
  const nn: number[] = [];
  for (let a = 0; a < n; a++) {
    const ax = tiles[a] % W;
    const ay = (tiles[a] - ax) / W;
    let best = Infinity;
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const dx = (tiles[b] % W) - ax;
      const dy = (tiles[b] - (tiles[b] % W)) / W - ay;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    nn.push(sqrt(best));
  }
  let mean = 0;
  for (const v of nn) mean += v;
  mean /= n;
  let vr = 0;
  for (const v of nn) vr += (v - mean) * (v - mean);
  return sqrt(vr / n) / mean;
}

/** A knot's next trunk: a step from one of its trunks, beside it (the 8 neighbours, six times as likely) or a tile
 *  past (the 12 tiles two out), so a knot's trunks touch or stand a tile apart, never in rows. */
const KNOT_STEPS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const c = Math.max(Math.abs(dx), Math.abs(dy));
      if (c === 1) for (let k = 0; k < 6; k++) out.push([dx, dy]);
      else if (c === 2 && Math.abs(dx) + Math.abs(dy) <= 3) out.push([dx, dy]);
    }
  return out;
})();

/** A knot's axes: along a row, a column or a diagonal (its reach drawn out along one). */
const KNOT_AXES: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** One stand's trees (6819039430, and its follow-up on #236): its ground grows from `seed` within `zone` (a noisy walk,
 *  so its outline is the place's own, a rim's, a bank's or the old water line's, ragged, never a box), `spread` tiles a
 *  tree; its trees stand in knots of 3 to 8 trunks with gaps between, each knot grown trunk by trunk from its middle
 *  (touching or a tile apart, never four in a square, never beside another knot's), thinning to pairs and single trees
 *  at its edge, the knots' middles drawn at random over its ground (no tile-grid beat). Its trees, and its ground. */
export function clumpStand(zone: Uint8Array, loose: Uint8Array, seed: number, n: number, W: number, H: number, rng: Rng): { tiles: number[]; area: number[] } {
  const k = DEAD_STANDS.knot;
  const nSeed = rng.int(0, 0x7fffffff);
  // (its ground: the zone's tiles by a noisy walk from its seed, the nearest first, as far as `most` tiles; and the
  // `loose` ground beside the zone, up to `off` tiles out at a dearer step, where its last single trees may stray)
  const most = Math.ceil(n * DEAD_STANDS.spread * 3);
  const off = new Map<number, number>();
  off.set(seed, 0);
  const cost = new Map<number, number>();
  const heap = new MinHeap();
  heap.push(0, seed);
  const ground: number[] = [];
  const reach = new Map<number, number>();
  cost.set(seed, 0);
  while (heap.size && ground.length < most) {
    const i = heap.pop();
    const c = heap.lastKey;
    if (reach.has(i) || c > (cost.get(i) ?? Infinity)) continue;
    reach.set(i, c);
    ground.push(i);
    const x = i % W;
    const y = (i - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (reach.has(j)) continue;
      const o = zone[j] ? 0 : (off.get(i) ?? 0) + 1;
      if (o && (!loose[j] || o > k.off)) continue;
      const cj = c + 1 + 1.5 * (0.5 + 0.5 * valueNoise(nSeed, nx, ny, 3)) + (o ? k.offCost : 0);
      if (cj < (cost.get(j) ?? Infinity)) {
        cost.set(j, cj);
        off.set(j, o);
        heap.push(cj, j);
      }
    }
  }
  // (its trees: as many as its ground holds at `spread`, `n` at most; how far out its edge comes, the walk to the tile
  // its last tree's share of the ground reaches)
  let onZone = 0;
  for (const t of ground) if (zone[t]) onZone++;
  const m = Math.max(1, Math.min(n, Math.floor(onZone / DEAD_STANDS.spread)));
  // (the trees the knots leave for the edge's singles)
  const singles = Math.ceil((1 - k.outer) * m);
  const far = reach.get(ground[Math.min(ground.length - 1, Math.ceil(m * DEAD_STANDS.spread))]) || 1;
  // (the knots: middles drawn from the ground nearest first, a little shuffled, kept apart from the trees already
  // standing; the first trees in big knots, the last single trees, so the stand thins to singles at its edge)
  const order = ground.map((t) => ({ t, key: (reach.get(t) ?? 0) + k.shuffle * far * rng.float() }));
  order.sort((a, b) => a.key - b.key || a.t - b.t);
  const owner = new Map<number, number>();
  const out: number[] = [];
  let knots = 0;
  let edge = 0;
  const treeAt = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && owner.has(y * W + x);
  // (no tree nearer the tile than `d`)
  const clear = (t: number, d: number) => {
    const x = t % W;
    const y = (t - x) / W;
    const R = Math.ceil(d);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy < d * d && treeAt(x + dx, y + dy)) return false;
    return true;
  };
  // (a trunk there would stand beside another knot's, or make four in a square)
  const refused = (t: number, knot: number) => {
    const x = t % W;
    const y = (t - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && treeAt(x + dx, y + dy) && owner.get((y + dy) * W + x + dx) !== knot) return true;
      }
    for (let sy = -1; sy <= 0; sy++)
      for (let sx = -1; sx <= 0; sx++) {
        let n4 = 0;
        for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) if (treeAt(x + sx + ax, y + sy + ay)) n4++;
        if (n4 === 3) return true;
      }
    return false;
  };
  // (a second sweep, where the first left the edge short, sets single trees in the gaps left)
  for (let sweep = 0; sweep < 2 && out.length < m; sweep++)
    for (const { t: c } of order) {
      if (out.length >= m) break;
      const e = sweep ? 1 : out.length / m;
      const size = sweep || m - out.length <= singles ? 1 : e < k.inner ? rng.int(k.core[0], k.core[1] + 1) : rng.int(k.mid[0], k.mid[1] + 1);
      if (owner.has(c) || refused(c, knots) || (size === 1 && !clear(c, (sweep ? k.near : 1) * (k.single + k.singleMore * rng.float())))) continue;
      const take = Math.min(size, m - out.length - (size > 1 ? singles : 0));
      if (take < 1) continue;
      const id = knots++;
      owner.set(c, id);
      out.push(c);
      const mine = [c];
      // (its trunks: steps from its own, within its reach of its middle, on the stand's ground; each knot its own shape,
      // never one stamp: its reach drawn out along one of four axes by its own amount, and its trunks grown from its
      // last one by its own share of the steps (a chain) and from any of its own by the rest (a clump))
      const r = size >= 6 ? k.reachBig : k.reach;
      const [ux, uy] = KNOT_AXES[rng.int(0, KNOT_AXES.length)];
      const len = ux * ux + uy * uy;
      const along = r * (1 + k.stretch * rng.float());
      const across = r * (1 - k.narrow * rng.float());
      const chain = k.chain * rng.float();
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let tries = 0; mine.length < take && tries < 12 * take; tries++) {
        const from = rng.float() < chain ? mine[mine.length - 1] : mine[rng.int(0, mine.length)];
        const [dx, dy] = KNOT_STEPS[rng.int(0, KNOT_STEPS.length)];
        const x = (from % W) + dx;
        const y = Math.floor(from / W) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const a = (x - cx) * ux + (y - cy) * uy;
        const b = (y - cy) * ux - (x - cx) * uy;
        if ((a * a) / (along * along) + (b * b) / (across * across) > len) continue;
        const t = y * W + x;
        if (!reach.has(t) || owner.has(t) || refused(t, id)) continue;
        owner.set(t, id);
        out.push(t);
        mine.push(t);
      }
      // (a knot the ground left under 3 trunks is none: the stand's trees stand in knots or alone, never strewn in pairs)
      if (size >= 3 && mine.length < 3) {
        for (const t of mine) owner.delete(t);
        out.length -= mine.length;
        continue;
      }
      const rc = reach.get(c) ?? 0;
      if (rc > edge) edge = rc;
    }
  // (where its knots crowd it, so its nearest neighbours' spread falls under `cv` of their mean, single trees set apart,
  // the nearest the seed first, `single` tiles from any other at least, till it holds or a fifth more trees stand)
  for (let q = 0; q < order.length && out.length > 2 && out.length < m * 1.2 && nnSpread(out, W) < k.cv; q++) {
    const c = order[q].t;
    if (owner.has(c) || !clear(c, k.lone)) continue;
    owner.set(c, knots++);
    out.push(c);
    const rc = reach.get(c) ?? 0;
    if (rc > edge) edge = rc;
  }
  // (its ground: what the walk reached out to its farthest knot and a tile beyond, and its trees)
  const area = ground.filter((t) => (reach.get(t) ?? 0) <= edge + 1.5 || owner.has(t));
  return { tiles: out, area };
}

/** The dead stands (see the file's header), each one species on one kind of place. */
export function planDeadStands(inp: DeadStandsInput): DeadStand[] {
  const { W, H, heights, wet, moist, free, walk, rng } = inp;
  const N = W * H;
  if (!(inp.forestDensity > 0) || !inp.mix.some((v) => v > 0)) return [];
  const rate = DEAD_STANDS.per1000[0] + (DEAD_STANDS.per1000[1] - DEAD_STANDS.per1000[0]) * rng.float();
  const want = Math.round((rate * dryTiles(wet, moist) * inp.forestDensity) / 100 / 1000) - inp.already;
  if (want < DEAD_STANDS.stand.least) return [];

  // where a dead tree may stand: dry, free ground off the old water line's near edge, clear of the start
  const wetOrMoist = new Uint8Array(N);
  for (let i = 0; i < N; i++) wetOrMoist[i] = wet[i] || moist[i] ? 1 : 0;
  const fromGreen = distanceFrom(wetOrMoist, W, H);
  const bench = inp.start ? benchTiles(heights, W, H, inp.start) : null;
  const allowed = new Uint8Array(N);
  const near = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (!free[i] || wet[i] || moist[i] || fromGreen[i] < DEAD_STANDS.shore[0]) continue;
    const d = walk ? walk[i] : Infinity;
    if (d <= DEAD_STANDS.clearWalk) continue;
    if (bench && bench[i] && d <= DEAD_STANDS.benchWalk) continue;
    allowed[i] = 1;
    near[i] = d <= DEAD_STANDS.thinWalk ? DEAD_STANDS.thinWeight : 1;
  }

  // the places: each allowed tile's kind (the likeliest it qualifies for) and its zone (a stand grows within it)
  const placeOf = new Int8Array(N).fill(-1);
  const zoneOf = new Int32Array(N).fill(-1);
  const mark = (i: number, p: DeadPlace, zone: number) => {
    const k = PLACES.indexOf(p);
    if (placeOf[i] < 0 || PLACE[p].like > PLACE[PLACES[placeOf[i]]].like) {
      placeOf[i] = k;
      zoneOf[i] = zone;
    }
  };
  // the old water line
  for (let i = 0; i < N; i++) if (allowed[i] && fromGreen[i] <= DEAD_STANDS.shore[1]) mark(i, "shore", -1);
  // the banks of dry beds (a channel's dry stretch, a wash's bed)
  if (inp.channel || inp.beds) {
    const dryBed = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++)
      if ((inp.channel?.[i] || inp.beds?.[i]) && !wet[i] && !moist[i]) {
        dryBed[i] = 1;
        any = true;
      }
    if (any) {
      const fromBed = distanceFrom(dryBed, W, H);
      for (let i = 0; i < N; i++) if (allowed[i] && fromBed[i] >= DEAD_STANDS.bank[0] && fromBed[i] <= DEAD_STANDS.bank[1]) mark(i, "bank", -2);
    }
  }
  // dry hollows (ground under its spill, the priority flood's) and their rims
  {
    const fl = drainage(heights, W, H).filled;
    const hollow = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++)
      if (fl[i] - heights[i] >= DEAD_STANDS.hollowDepth && !wet[i]) {
        hollow[i] = 1;
        any = true;
      }
    if (any) {
      const fromHollow = distanceFrom(hollow, W, H);
      for (let i = 0; i < N; i++) if (allowed[i] && fromHollow[i] <= DEAD_STANDS.hollowRim) mark(i, "hollow", -3);
    }
  }
  // mesa and butte tops: level plates with no higher ground beside them; a stand stays on its own top
  {
    const reg = levelRegions(heights, W, H);
    const higher = new Uint8Array(reg.level.length);
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const l = reg.labels[i];
      if (x + 1 < W && heights[i + 1] > heights[i]) higher[l] = 1;
      if (x > 0 && heights[i - 1] > heights[i]) higher[l] = 1;
      if (i + W < N && heights[i + W] > heights[i]) higher[l] = 1;
      if (i - W >= 0 && heights[i - W] > heights[i]) higher[l] = 1;
    }
    // (its rim: a top's tiles near its edge, where the ground falls away)
    const edge = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const l = reg.labels[i];
      if (higher[l] || reg.size[l] < DEAD_STANDS.topLeast) continue;
      if ((x + 1 < W && heights[i + 1] < heights[i]) || (x > 0 && heights[i - 1] < heights[i]) || (i + W < N && heights[i + W] < heights[i]) || (i - W >= 0 && heights[i - W] < heights[i])) edge[i] = 1;
    }
    const fromEdge = distanceFrom(edge, W, H);
    for (let i = 0; i < N; i++) {
      const l = reg.labels[i];
      if (allowed[i] && !higher[l] && reg.size[l] >= DEAD_STANDS.topLeast && fromEdge[i] <= DEAD_STANDS.topRim) mark(i, "top", l);
    }
  }

  const out: DeadStand[] = [];
  // (the dry land the woods stand over: dry tiles within `bare.reach` of a dead tree, `bare.most` of the dry land at most,
  // so the rest stays bare; a stand that would pass it is not grown, and the woods stop there)
  const dryN = dryTiles(wet, moist);
  const over = new Uint8Array(N);
  let overN = 0;
  let full = false;
  let missed = 0;
  const B = DEAD_STANDS.bare;
  const R = Math.ceil(B.reach);
  const overBy = (tiles: readonly number[], mark: boolean): number => {
    const seen = mark ? over : Uint8Array.from(over);
    let n = 0;
    for (const t of tiles) {
      const tx = t % W;
      const ty = (t - tx) / W;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || dx * dx + dy * dy > B.reach * B.reach) continue;
          const i = y * W + x;
          if (seen[i] || wet[i] || moist[i]) continue;
          seen[i] = 1;
          n++;
        }
    }
    return n;
  };
  let got = 0;
  const s = DEAD_STANDS.stand;
  const w = DEAD_STANDS.wood;
  const r2 = w.radius * w.radius;
  // the old woods: their count by area, their middles on the places the land gives, the roomiest first
  const area = N / (128 * 128);
  const woodsWanted = Math.max(1, Math.round(area * w.per128[0]), Math.min(Math.round(area * w.per128[1]), Math.round(want / w.trees)));
  const weight = new Float64Array(N);
  for (let i = 0; i < N; i++) weight[i] = allowed[i] && placeOf[i] >= 0 ? PLACE[PLACES[placeOf[i]]].like * near[i] : 0;
  const within = (at: number, f: (i: number) => void) => {
    const ax = at % W;
    const ay = (at - ax) / W;
    for (let y = Math.max(0, ay - w.radius); y <= Math.min(H - 1, ay + w.radius); y++)
      for (let x = Math.max(0, ax - w.radius); x <= Math.min(W - 1, ax + w.radius); x++) if ((x - ax) * (x - ax) + (y - ay) * (y - ay) <= r2) f(y * W + x);
  };
  const roomOf = (at: number) => {
    let n = 0;
    within(at, (i) => {
      if (allowed[i] && placeOf[i] === placeOf[at] && zoneOf[i] === zoneOf[at]) n++;
    });
    return n;
  };
  const apart = Math.max(w.apart, Math.round(Math.min(W, H) / 5));
  const cands = pickSeeds(rng, weight, W, 6 * woodsWanted + 6, apart).map((at) => ({ at, room: roomOf(at) * (0.6 + 0.8 * rng.float()) }));
  cands.sort((p, q) => q.room - p.room);
  const each = (want - got) / woodsWanted;
  const woods: number[] = [];
  // (one in the start's opening view: the roomiest middle past its clear walk and within `view`)
  const seen = walk ? cands.find((c) => walk[c.at] > DEAD_STANDS.clearWalk && walk[c.at] <= w.view && c.room >= (each * DEAD_STANDS.spread) / 2) : undefined;
  if (seen) woods.push(seen.at);
  for (const c of cands) {
    if (woods.length >= woodsWanted) break;
    const cx = c.at % W;
    const cy = (c.at - cx) / W;
    if (woods.some((o) => (o % W - cx) * (o % W - cx) + (Math.floor(o / W) - cy) * (Math.floor(o / W) - cy) < apart * apart)) continue;
    woods.push(c.at);
  }
  const sp = (p: DeadPlace): DeadSpecies => {
    const tree = PLACE[p].tree;
    const k = DEAD_SPECIES.indexOf(tree);
    if (inp.mix[k] > 0) return tree;
    const other = tree === "Pine" ? 1 : 0;
    return inp.mix[other] > 0 ? DEAD_SPECIES[other] : "Oak";
  };
  // a wood: stands on its middle's kind of place within its radius (any kind there on the second pass, and on the third
  // any dry ground there, where the places are narrow) till `goal`, each stand's seed the free ground nearest the
  // wood's middle, so a wood grows outward as one group and the land round it stays bare
  // (a stand's trees taken: the land within `bare.reach` of its trees counted, and a tile's clearing round its trees,
  // so the next stand's knots keep apart from its; the gaps between its knots stay the wood's, where the next stand's
  // knots may stand, so a wood is dense inside its outline and the land round it bare)
  const claim = (trees: readonly number[]): void => {
    overN += overBy(trees, true);
    for (const i of trees)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (i % W) + dx;
          const y = Math.floor(i / W) + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) allowed[y * W + x] = 0;
        }
  };
  // (the wood each stand of `out` belongs to, -1 for a stand's oaks)
  const woodOf: number[] = [];
  // (wood `k`'s stand with a tree nearest `trees`, within `join` tiles; -1 where none is)
  const hostOf = (trees: readonly number[], k: number): number => {
    let best = -1;
    let bd = s.join * s.join + 1;
    for (let o = 0; o < out.length; o++) {
      if (woodOf[o] !== k) continue;
      for (const a of [...out[o].tiles, ...out[o].young])
        for (const b of trees) {
          const dx = (a % W) - (b % W);
          const dy = Math.floor(a / W) - Math.floor(b / W);
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
    }
    return best;
  };
  const grow = (k: number, goal: number): void => {
    const at = woods[k];
    const p0 = placeOf[at];
    const z0 = zoneOf[at];
    const ax = at % W;
    const ay = (at - ax) / W;
    for (let pass = 0; pass < 3 && got < goal && !full; pass++)
      for (let tries = 0; tries < 20 && got < goal && !full; tries++) {
        // (one stand's seed at a time, the free ground nearest the wood's middle, give or take `near` tiles: the
        // clearing round each stand keeps the next apart)
        let seed = -1;
        let best = Infinity;
        within(at, (i) => {
          if (!allowed[i] || (pass < 2 && (placeOf[i] < 0 || (!pass && (placeOf[i] !== p0 || zoneOf[i] !== z0))))) return;
          const dx = (i % W) - ax;
          const dy = Math.floor(i / W) - ay;
          const key = sqrt(dx * dx + dy * dy) + w.near * rng.float();
          if (key < best) {
            best = key;
            seed = i;
          }
        });
        if (seed < 0) break;
        const p = pass < 2 ? placeOf[seed] : p0;
        const z = zoneOf[seed];
        const zone = new Uint8Array(N);
        within(at, (i) => {
          zone[i] = allowed[i] && (pass === 2 || (placeOf[i] === p && zoneOf[i] === z)) ? 1 : 0;
        });
        const n = Math.min(goal - got, s.least + rng.int(0, s.a) + rng.int(0, s.b));
        if (n < 3) return;
        const grown = clumpStand(zone, allowed, seed, n, W, H, rng);
        const tiles = [...grown.tiles].sort((a, c) => a - c);
        // (a few old oaks among them, the giants that outlasted the rest)
        const oaks: number[] = [];
        if (inp.mix[2] > 0) {
          const k2 = Math.min(DEAD_STANDS.oakMost, Math.floor(tiles.length / DEAD_STANDS.oakEvery));
          for (let q = 0; q < k2; q++) oaks.push(tiles.splice(rng.int(0, tiles.length), 1)[0]);
        }
        // (a stand its ground holds short of a stand's least: where it lies beside one of this wood's stands, within
        // `join` tiles of its trees, its trees are that stand's, reaching into the narrow ground beside it, so long as
        // that stand stays a stand's most and its spread holds; elsewhere it is none, its ground left bare)
        if (grown.tiles.length < Math.min(n, s.least)) {
          const host = grown.tiles.length >= 3 ? hostOf(grown.tiles, k) : -1;
          if (host >= 0) {
            const st = out[host];
            const both = [...st.tiles, ...st.young, ...grown.tiles];
            if (both.length <= s.least + s.a + s.b - 2 && nnSpread(both, W) >= DEAD_STANDS.knot.least && overN + overBy(grown.tiles, false) <= B.most * dryN) {
              claim(grown.tiles);
              for (const t of grown.tiles) (rng.float() < DEAD_STANDS.young ? st.young : st.tiles).push(t);
              st.tiles.sort((a, c) => a - c);
              st.young.sort((a, c) => a - c);
              st.area.push(...grown.area);
              got += grown.tiles.length;
              continue;
            }
          }
          for (const i of grown.area) allowed[i] = 0;
          allowed[seed] = 0;
          continue;
        }
        // (a stand whose knots its ground crowded into an even spread is none: its seed's ground is left bare)
        if (grown.tiles.length < 3 || (tiles.length >= 10 && nnSpread(tiles, W) < DEAD_STANDS.knot.least)) {
          allowed[seed] = 0;
          continue;
        }
        // (a stand that would pass the bare land's share is not grown, its ground left bare; the next try is nearer
        // the wood's trees, under the land they already stand over; after `misses` such, the woods are full)
        if (overN + overBy(grown.tiles, false) > B.most * dryN) {
          for (const i of grown.area) allowed[i] = 0;
          allowed[seed] = 0;
          if (++missed >= B.misses) full = true;
          continue;
        }
        claim(grown.tiles);
        // (a third of the rest died young, standing shorter)
        const grownTiles: number[] = [];
        const young: number[] = [];
        for (const t of tiles) (rng.float() < DEAD_STANDS.young ? young : grownTiles).push(t);
        out.push({ tiles: grownTiles, young, area: grown.area, species: sp(PLACES[p]), place: PLACES[p] });
        woodOf.push(k);
        if (oaks.length) {
          out.push({ tiles: oaks.sort((a, c) => a - c), young: [], area: [], species: "Oak", place: PLACES[p], giants: true });
          woodOf.push(-1);
        }
        got += grown.tiles.length;
      }
  };
  // each wood to its share, then on to the aim while its land holds; where the woods' land falls short, more woods (as
  // many as the most a map's area takes), each to what is left
  for (let k = 0; k < woods.length && got < want; k++) grow(k, Math.min(want, Math.round(each * (k + 1))));
  for (let k = 0; k < woods.length && got < want; k++) grow(k, want);
  const most = Math.max(1, Math.round((w.per128[1] * N) / (128 * 128)));
  for (const c of cands) {
    if (got >= want || full || woods.length >= most) break;
    const cx = c.at % W;
    const cy = (c.at - cx) / W;
    if (!allowed[c.at] || woods.some((o) => (o % W - cx) * (o % W - cx) + (Math.floor(o / W) - cy) * (Math.floor(o / W) - cy) < apart * apart)) continue;
    woods.push(c.at);
    grow(woods.length - 1, want);
  }
  return out;
}
