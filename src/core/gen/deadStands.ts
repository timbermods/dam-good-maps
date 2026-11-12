// Dead stands on the dry land (D516; planning's ruling on #236, 2026-11-11): standing dead pines, birches and oaks in
// clumped stands where forest was, as the game's own maps have them (Canyon 124, Plains 65, Oasis 36 per 1,000 dry
// tiles), aimed near the low end, about 40 per 1,000 dry tiles. One pass shared by every generator path: the
// resource pass (`resources.ts` `planResources`) runs it, so the themes and the premises both get it.
//
// They gather in a few old woods (two to four on a 128² map), each a region of stands, the rest of the dry land bare.
// Where a wood goes is read from the land, never a random field: the old water line (the dry band just beyond the
// moist ground, where the water used to reach), the banks of dry beds, the top of a mesa or butte (a level plate with
// no higher ground beside it), and dry hollows and their rims; its trees are the site's (pines on dry tops, birches by
// old water, a few old oaks among them), so a 128² map holds hundreds of dead logs, not thousands. Never on moist ground (living trees belong
// there), nor in a living grove's clearing; none within the start's own walk and few out to the starting-logs floor's,
// and none on the start's bench near it, so this is wood a colony travels for. A dead tree keeps its logs
// (`data/log-floor.json` `deadTreesKeepLogs`, from the game's blueprints) and grows none back: finite wood, never a
// carpet (MAPCRAFT §4).

import { levelRegions, distanceFrom } from "../math/grid";
import type { Rng } from "../math/rng";
import { growGroveAt, type BaselineGround } from "../resources/baseline";
import { drainage } from "../land/drainage";
import { pickSeeds } from "./blobs";

/** The pass's numbers. */
export const DEAD_STANDS = {
  /** Dead trees per 1,000 dry tiles at Forests 100 %, the seed moving it within this range. */
  per1000: [36, 48] as const,
  /** Trees in one stand: the least, and two draws added on top (15 to 60, most 25 to 50). */
  stand: { least: 15, a: 21, b: 26 },
  /** Of a stand's ground, the share under a tree (thinned from the edge, as the living groves are). */
  fill: 0.52,
  /** Stand seeds within a wood at least this far apart, tiles. */
  gap: 8,
  /** The old woods: two to four on a 128² map (by area elsewhere, one at least), each a region of stands within
   *  `radius` of its middle, on the kind of place its middle stands on; woods at least `apart` tiles apart (a fifth of
   *  the map's side when that is more). One wood stands in the start's opening view where the land allows: its middle
   *  past the start's clear walk and within `view` tiles' walk. */
  wood: { per128: [2, 4] as const, radius: 20, apart: 30, view: 60 },
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
  /** A dry bed's bank: dry tiles this far from a channel. */
  bank: [1, 3] as const,
  /** A dry hollow: ground at least this many levels under its spill, and its rim this far out. */
  hollowDepth: 1,
  hollowRim: 3,
  /** A mesa or butte top: a level plate with no higher ground beside it, this many tiles at least. */
  topLeast: 8,
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
  tiles: number[];
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
  // the banks of dry beds (a channel's dry stretch)
  if (inp.channel) {
    const dryBed = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++)
      if (inp.channel[i] && !wet[i] && !moist[i]) {
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
    for (let i = 0; i < N; i++) {
      const l = reg.labels[i];
      if (allowed[i] && !higher[l] && reg.size[l] >= DEAD_STANDS.topLeast) mark(i, "top", l);
    }
  }

  const ground: BaselineGround = { W, H, heights, water: wet, moisture: moist, soilContamination: new Uint8Array(0), taken: new Uint8Array(N) };
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
  const seen = walk ? cands.find((c) => walk[c.at] > DEAD_STANDS.clearWalk && walk[c.at] <= w.view && c.room >= each / DEAD_STANDS.fill / 2) : undefined;
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
  // each wood: stands on its middle's kind of place within its radius (any kind there on the second pass), till its share
  for (let pass = 0; pass < 2 && got < want; pass++)
    for (let k = 0; k < woods.length && got < want; k++) {
      const at = woods[k];
      const goal = Math.min(want, Math.round(each * (k + 1)) + (pass ? want : 0));
      const p0 = placeOf[at];
      const z0 = zoneOf[at];
      for (let tries = 0; tries < 8 && got < goal; tries++) {
        const local = new Float64Array(N);
        within(at, (i) => {
          if (allowed[i] && placeOf[i] >= 0 && (pass || (placeOf[i] === p0 && zoneOf[i] === z0))) local[i] = 1;
        });
        const seeds = pickSeeds(rng, local, W, 1, DEAD_STANDS.gap);
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
        const grown = growGroveAt(ground, rng, zone, seed, n, DEAD_STANDS.fill, true);
        if (!grown || grown.tiles.length < 3) {
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
        out.push({ tiles, area: grown.area, species: sp(PLACES[p]), place: PLACES[p] });
        if (oaks.length) out.push({ tiles: oaks.sort((a, c) => a - c), area: [], species: "Oak", place: PLACES[p], giants: true });
        got += grown.tiles.length;
      }
    }
  return out;
}
