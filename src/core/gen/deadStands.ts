// Dead stands on the dry land (D516; planning's ruling on #236, 2026-11-11): standing dead pines, birches and oaks in
// clumped stands where forest was, as the game's own maps have them (Canyon 124, Plains 65, Oasis 36 per 1,000 dry
// tiles), aimed near the low end, about 40 per 1,000 dry tiles. One pass shared by every generator path: the resource
// pass (`resources.ts` `planResources`) runs it, so the themes and the premises both get it.
//
// They gather in a few old woods (two to four on a 128² map), each a region of stands, the rest of the dry land bare.
// Where a wood goes is read from the land, never a random field: the old water line (the dry band just beyond the moist
// ground, where the water used to reach), the banks of dry beds and washes, the top of a mesa or butte (a level plate
// with no higher ground beside it; a stand keeps to its rim), and dry hollows and their rims; its trees are the site's
// (pines on dry tops, birches by old water, a few old oaks among them), so a 128² map holds hundreds of dead logs, not
// thousands. A stand is knots of trunks with gaps between, thinning to single trees at its edge, its outline the
// place's own, and a third of its trees died young and stand shorter (D518, `clumpStand`). Never on moist ground
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
  /** Trees in one stand: the least, and two draws added on top (15 to 60, most 25 to 50). */
  stand: { least: 15, a: 21, b: 26 },
  /** A stand's ground, tiles a tree: it grows from its seed along its place (a rim, a bank, the old water line), its
   *  outline the land's, never a box. */
  spread: 4.5,
  /** Its trees stand in knots with gaps between (planning's ruling on #236, 6819039430: the stands read as a field of
   *  posts): knots of `core` trunks (least, most) for its first `inner` share of trees, of `mid` out to `outer`, single
   *  trees for the rest (the knots come nearest its seed first, so it thins to singles at its edge); each knot within
   *  `reach` tiles of its middle (`reachBig` for the biggest), knots `gap` tiles apart at least (up to `gapMore` more),
   *  so within a stand the nearest neighbours' spread is half their mean or more; its last single trees may stray `off`
   *  tiles off its place onto free ground beside it (each such step costing `offCost` more on its walk). */
  knot: { core: [4, 8] as const, mid: [3, 5] as const, inner: 0.45, outer: 0.72, reach: 1.5, reachBig: 2.0, gap: 1.5, gapMore: 1.5, off: 3, offCost: 4 },
  /** A share of its trees died young, standing shorter (6819039430: mixed heights; the game stores a tree a drought
   *  killed growing as dead with its growth, and it keeps no logs). */
  young: 0.33,
  /** The old woods: two to four on a 128² map (by area elsewhere, one at least; as many again where the land's places
   *  are narrow and the woods fall short), each a region of stands within `radius` of its middle, on the kind of place its middle stands on; woods at least `apart` tiles apart (a fifth of
   *  the map's side when that is more). One wood stands in the start's opening view where the land allows: its middle
   *  past the start's clear walk and within `view` tiles' walk. */
  wood: { per128: [2, 4] as const, radius: 32, apart: 30, view: 60 },
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
  shore: [2, 9] as const,
  /** A dry bed's bank: dry tiles this far from a dry channel or a wash's bed (`land/washes.ts`). */
  bank: [1, 4] as const,
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

/** One stand's trees (6819039430): its ground grows from `seed` within `zone` (a noisy walk, so its outline is the
 *  place's own, a rim's, a bank's or the old water line's, ragged, never a box), `spread` tiles a tree; its trees stand
 *  in knots of 3 to 8 trunks with gaps between, thinning to pairs and single trees at its edge, the knots' middles drawn
 *  at random over its ground (no tile-grid beat). Its trees, and its ground. */
export function clumpStand(zone: Uint8Array, loose: Uint8Array, seed: number, n: number, W: number, H: number, rng: Rng): { tiles: number[]; area: number[] } {
  const k = DEAD_STANDS.knot;
  const nSeed = rng.int(0, 0x7fffffff);
  // (its ground: the zone's tiles by a noisy walk from its seed, the nearest first, as far as `most` tiles; and the
  // `loose` ground beside the zone, up to `off` tiles out at a dearer step, where its last single trees may stray)
  const most = Math.ceil(n * DEAD_STANDS.spread * 4);
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
  // (the knots: middles drawn from the ground nearest first, a little shuffled, kept apart from the others; the first
  // trees in big knots, the last single trees, so the stand thins to singles at its edge)
  const order = ground.map((t) => ({ t, key: (reach.get(t) ?? 0) + 0.35 * far * rng.float() }));
  order.sort((a, b) => a.key - b.key || a.t - b.t);
  const knots: { x: number; y: number; r: number }[] = [];
  const used = new Set<number>();
  const out: number[] = [];
  let edge = 0;
  // (a second sweep, where the first left the edge short, sets single trees in the gaps left)
  for (let sweep = 0; sweep < 2 && out.length < m; sweep++)
    for (const { t: c } of order) {
      if (out.length >= m) break;
      const e = sweep ? 1 : out.length / m;
      const size = e < k.inner ? rng.int(k.core[0], k.core[1] + 1) : e < k.outer ? rng.int(k.mid[0], k.mid[1] + 1) : 1;
      const r = size >= 7 ? k.reachBig : size >= 3 ? k.reach : 0.5;
      const cx = c % W;
      const cy = (c - cx) / W;
      const gap = k.gap + k.gapMore * rng.float();
      let near = false;
      for (const o of knots) {
        const d = sqrt((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy));
        if (d < o.r + r + gap) {
          near = true;
          break;
        }
      }
      if (near) continue;
      // (its trunks: the ground's tiles within its reach, the nearest its middle first, a little shuffled)
      const R = Math.ceil(r);
      const cand: { t: number; d: number }[] = [];
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (cx + dx < 0 || cy + dy < 0 || cx + dx >= W || cy + dy >= H) continue;
          const t = (cy + dy) * W + cx + dx;
          if (!reach.has(t) || used.has(t)) continue;
          const d = sqrt(dx * dx + dy * dy);
          if (d > r) continue;
          cand.push({ t, d: d + 0.9 * rng.float() });
        }
      if (!cand.length) continue;
      cand.sort((a, b) => a.d - b.d || a.t - b.t);
      const take = Math.min(size, cand.length, m - out.length - (size > 1 ? singles : 0));
      if (take < 1) continue;
      for (let q = 0; q < take; q++) {
        used.add(cand[q].t);
        out.push(cand[q].t);
      }
      knots.push({ x: cx, y: cy, r });
      const rc = reach.get(c) ?? 0;
      if (rc > edge) edge = rc;
    }
  // (its ground: what the walk reached out to its farthest knot and a tile beyond, and its trees)
  const area = ground.filter((t) => (reach.get(t) ?? 0) <= edge + 1.5 || used.has(t));
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
  let got = 0;
  const s = DEAD_STANDS.stand;
  const w = DEAD_STANDS.wood;
  const r2 = w.radius * w.radius;
  // the old woods: their count by area, their middles on the places the land gives, the roomiest first
  const woodsWanted = Math.max(1, Math.round(((w.per128[0] + rng.int(0, w.per128[1] - w.per128[0] + 1)) * N) / (128 * 128)));
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
  // each wood: stands on its middle's kind of place within its radius (any kind there on the second pass), till its share;
  // where the land's places are narrow and the woods fall short, a third pass adds woods (the next middles, half as far
  // apart), as many again at most
  const first = woods.length;
  for (let pass = 0; pass < 3 && got < want; pass++) {
    if (pass === 2)
      for (const c of cands) {
        if (woods.length >= 2 * first) break;
        const cx = c.at % W;
        const cy = (c.at - cx) / W;
        if (!allowed[c.at] || woods.some((o) => (o % W - cx) * (o % W - cx) + (Math.floor(o / W) - cy) * (Math.floor(o / W) - cy) < (apart * apart) / 4)) continue;
        woods.push(c.at);
      }
    for (let k = pass === 2 ? first : 0; k < woods.length && got < want; k++) {
      const at = woods[k];
      const goal = Math.min(want, Math.round(each * (k + 1)) + (pass ? want : 0));
      const p0 = placeOf[at];
      const z0 = zoneOf[at];
      for (let tries = 0; tries < 20 && got < goal; tries++) {
        const local = new Float64Array(N);
        within(at, (i) => {
          if (allowed[i] && placeOf[i] >= 0 && (pass || (placeOf[i] === p0 && zoneOf[i] === z0))) local[i] = 1;
        });
        // (one stand's seed at a time: the clearing round each stand keeps the next apart)
        const seeds = pickSeeds(rng, local, W, 1, 0);
        if (!seeds.length) break;
        const seed = seeds[0];
        const p = placeOf[seed];
        const z = zoneOf[seed];
        const zone = new Uint8Array(N);
        within(at, (i) => {
          zone[i] = allowed[i] && placeOf[i] === p && zoneOf[i] === z ? 1 : 0;
        });
        const n = Math.min(goal - got, s.least + rng.int(0, s.a) + rng.int(0, s.b));
        if (n < 3) break;
        const grown = clumpStand(zone, allowed, seed, n, W, H, rng);
        if (grown.tiles.length < 3) {
          allowed[seed] = 0;
          continue;
        }
        // (a stand keeps a tile's clearing from the next, so stands stay apart and read as stands)
        for (const i of grown.area)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const x = (i % W) + dx;
              const y = Math.floor(i / W) + dy;
              if (x >= 0 && y >= 0 && x < W && y < H) allowed[y * W + x] = 0;
            }
        const tiles = [...grown.tiles].sort((a, c) => a - c);
        // (a few old oaks among them, the giants that outlasted the rest)
        const oaks: number[] = [];
        if (inp.mix[2] > 0) {
          const k2 = Math.min(DEAD_STANDS.oakMost, Math.floor(tiles.length / DEAD_STANDS.oakEvery));
          for (let q = 0; q < k2; q++) oaks.push(tiles.splice(rng.int(0, tiles.length), 1)[0]);
        }
        // (a third of the rest died young, standing shorter)
        const grownTiles: number[] = [];
        const young: number[] = [];
        for (const t of tiles) (rng.float() < DEAD_STANDS.young ? young : grownTiles).push(t);
        out.push({ tiles: grownTiles, young, area: grown.area, species: sp(PLACES[p]), place: PLACES[p] });
        if (oaks.length) out.push({ tiles: oaks.sort((a, c) => a - c), young: [], area: [], species: "Oak", place: PLACES[p], giants: true });
        got += grown.tiles.length;
      }
    }
  }
  return out;
}
