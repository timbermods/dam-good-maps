// What a place for the start is worth (#1193; planning's ruling on #236, comment 6949595157): one measure, read by
// the settler's picker (`gen/settler.ts` `pickStart`) among the places that pass the start's hard rules, and by the
// land stage on the planned water before the settle (#1227), so the place the land offers and the place the picker
// takes are judged alike.
//
// The terms are what a player feels in a colony's first hours, each read as a ratio to its target on a log scale and
// never capped: 3,000 tiles of bench are worth more than 1,000, and a tile counts for less the more there are.
// - **bench:** D515's bench, the dry ground at the start's level joined to it without a slope (`benchRegions`);
// - **foot:** the land the start's ground joins by one-level steps (the settler's `foot`), its walkable land;
// - **wood:** the wood is planted after the pick (`gen/resources.ts`: the start's groves and the natural ones grow on
//   moist ground), so the pick reads the ground that will hold it: moist dry ground a level either side of the
//   start's within `WOOD_BOX` tiles (`woodAt`);
// - **ways:** the bench's ways out, the other dry level regions one level up or down that it meets along at least
//   `WAY_CONTACT` tiles (where the build's slope can stand), of `WAY_LAND` tiles or more each (`benchWays`);
// - **water:** the walk to the start's pumpable water against the walk the Water without stairs rule aims at (D59: the
//   rule sets how far the start stands from its water), a cost either side of it on the same log scale, and a cost
//   where that water does not last the first drought.
//
// The hard rules (the water within the rule, the bench's floor, the door, the moist land) stay the picker's gate; this
// measure only ranks what passes. Ties break on `startTie`, a hash of the tile and the seed, never on a random draw or
// the order the places were read in.
//
// Pure functions of plain arrays: no water model, no settle. Everything here is integer arithmetic or `portable`
// maths, so every engine ranks alike (D366).

import { log2 } from "../math/portable";

/** What a place offers (`startTerms`). */
export interface StartTerms {
  /** D515's bench: dry tiles at the start's level joined to it without a slope (`benchRegions`). */
  bench: number;
  /** The land the start's ground joins by one-level steps (the settler's `foot`), tiles. */
  foot: number;
  /** The ground its wood will stand on: moist dry tiles a level either side of its own within `WOOD_BOX` (`woodAt`). */
  wood: number;
  /** Its ways out (`benchWays`). */
  ways: number;
  /** The walk to its pumpable water, tiles. */
  water: number;
  /** Whether that water lasts the first drought; undefined where it was not read. */
  droughtOk?: boolean;
}

/** What each term is weighed against (`startTargets` gives the defaults). */
export interface StartTargets {
  /** D515's bench floor at the Start area (`rulesFor(spec).levelLand`). */
  bench: number;
  /** The land the start's ground should join (the settler's `footWant`: twice Buildable land's walkable land). */
  foot: number;
  /** Moist ground for the start's wood (`WOOD_WANT`). */
  wood: number;
  /** Ways out (`WAYS_WANT`). */
  ways: number;
  /** The walk to water the rule aims at (`waterWant`). */
  water: number;
}

/** How much each term weighs: the bench, the start's own room, most; then its water, its walkable land and its wood;
 *  its ways out least, since the walkable land already counts the land they reach. */
export const START_WEIGHTS = { bench: 1, foot: 0.6, wood: 0.6, ways: 0.3, water: 1 } as const;
/** The cost of water that a first drought takes, in the measure's units. */
export const DROUGHT_COST = 0.5;
/** How far under the best place's worth a place may stand and still be chosen by the intentions' preference and the
 *  opening frame (D502, D507): at the bench's target, 0.15 is about 15 % more or less bench, or a tile's walk to the
 *  water near the rule's aim. */
export const VALUE_MARGIN = 0.15;

/** The wood's window: moist ground within this many tiles (a box) of the start, a level either side of its own. */
export const WOOD_BOX = 14;
/** Moist tiles in that window the wood term is weighed against. */
export const WOOD_WANT = 500;
/** Ways out a start is weighed against. */
export const WAYS_WANT = 3;
/** A way out: the bench meets the region along this many tiles at least... */
export const WAY_CONTACT = 3;
/** ...and the region holds this many tiles at least. */
export const WAY_LAND = 30;

/** The walk to water the Water without stairs rule aims at (D59): 0.45 of the rule past 5, between 2 and 9 tiles. */
export function waterWant(rule: number): number {
  return Math.max(2, Math.min(9, 0.45 * (rule - 5)));
}

/** The targets, with what the caller knows (`bench`, `foot`) and the defaults for the rest. */
export function startTargets(rule: number, known: Partial<StartTargets> = {}): StartTargets {
  return { bench: known.bench ?? 640, foot: known.foot ?? 2600, wood: known.wood ?? WOOD_WANT, ways: known.ways ?? WAYS_WANT, water: known.water ?? waterWant(rule) };
}

/** More is better, never capped: 0 for none, 1 at the target, 2 at three times it, 3 at seven. */
function more(x: number, want: number): number {
  return log2(1 + Math.max(0, x) / Math.max(1, want));
}

/** Each term's part of the worth, weighed (`startValue` is their sum). */
export function startParts(t: StartTerms, want: StartTargets): Record<"bench" | "foot" | "wood" | "ways" | "water", number> {
  const off = Math.abs(log2((Math.max(0, t.water) + 1) / (want.water + 1)));
  return {
    bench: START_WEIGHTS.bench * more(t.bench, want.bench),
    foot: START_WEIGHTS.foot * more(t.foot, want.foot),
    wood: START_WEIGHTS.wood * more(t.wood, want.wood),
    ways: START_WEIGHTS.ways * more(t.ways, want.ways),
    water: -START_WEIGHTS.water * off - (t.droughtOk === false ? DROUGHT_COST : 0),
  };
}

/** What a place for the start is worth: the higher the better. */
export function startValue(t: StartTerms, want: StartTargets): number {
  const p = startParts(t, want);
  return p.bench + p.foot + p.wood + p.ways + p.water;
}

/** The tie-break between places of equal worth: a hash of the tile and the seed (lower first). */
export function startTie(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Orders two places: the worthier first, then by `startTie`, then by tile. */
export function byWorth(seed: number) {
  return (a: { i: number; value: number }, b: { i: number; value: number }): number => b.value - a.value || startTie(seed, a.i) - startTie(seed, b.i) || a.i - b.i;
}

/** The dry level regions a start's bench is read from (D515, `startBench`): dry ground (no water on it, off the
 *  hydrology's channels and lakes) joined at one level, 4-connected, with each region's size; water is -1. */
export function benchRegions(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number>, water: ArrayLike<number>): { labels: Int32Array; size: number[] } {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  const size: number[] = [];
  const dry = (i: number) => !(D[i] > 0.001) && water[i] !== 1 && water[i] !== 2;
  const queue = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (labels[s0] >= 0 || !dry(s0)) continue;
    const lab = size.length;
    const lv = h[s0];
    labels[s0] = lab;
    let head = 0;
    let tail = 0;
    queue[tail++] = s0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      const y = (i - x) / W;
      if (x + 1 < W && labels[i + 1] < 0 && h[i + 1] === lv && dry(i + 1)) { labels[i + 1] = lab; queue[tail++] = i + 1; }
      if (x > 0 && labels[i - 1] < 0 && h[i - 1] === lv && dry(i - 1)) { labels[i - 1] = lab; queue[tail++] = i - 1; }
      if (y + 1 < H && labels[i + W] < 0 && h[i + W] === lv && dry(i + W)) { labels[i + W] = lab; queue[tail++] = i + W; }
      if (y > 0 && labels[i - W] < 0 && h[i - W] === lv && dry(i - W)) { labels[i - W] = lab; queue[tail++] = i - W; }
    }
    size.push(tail);
  }
  return { labels, size };
}

/** The bench a start at tile i stands on (`benchRegions`), in tiles: 0 on water. */
export function benchAt(benches: { labels: Int32Array; size: number[] }, i: number): number {
  const k = benches.labels[i];
  return k >= 0 ? benches.size[k] : 0;
}

/** Each bench region's ways out (indexed by its label): the regions one level up or down it meets along `WAY_CONTACT`
 *  tiles or more, of `WAY_LAND` tiles or more each. */
export function benchWays(h: ArrayLike<number>, W: number, H: number, benches: { labels: Int32Array; size: number[] }): Int32Array {
  const R = benches.size.length;
  const contact = new Map<number, number>();
  const { labels } = benches;
  const meet = (i: number, j: number) => {
    const a = labels[i];
    const b = labels[j];
    if (a < 0 || b < 0 || a === b || Math.abs(h[i] - h[j]) !== 1) return;
    const k = a < b ? a * R + b : b * R + a;
    contact.set(k, (contact.get(k) ?? 0) + 1);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (labels[i] < 0) continue;
      if (x + 1 < W) meet(i, i + 1);
      if (y + 1 < H) meet(i, i + W);
    }
  const ways = new Int32Array(R);
  for (const [k, n] of contact) {
    if (n < WAY_CONTACT) continue;
    const a = Math.floor(k / R);
    const b = k - a * R;
    if (benches.size[b] >= WAY_LAND) ways[a]++;
    if (benches.size[a] >= WAY_LAND) ways[b]++;
  }
  return ways;
}

/** Moist dry ground a level either side of each level, as summed-area tables read by `woodAt` (one table a level,
 *  made when first asked). */
export function moistBoxes(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number>, moisture: ArrayLike<number>): (L: number, x0: number, y0: number, x1: number, y1: number) => number {
  const N = W * H;
  const moist = new Uint8Array(N);
  for (let i = 0; i < N; i++) moist[i] = moisture[i] > 0 && !(D[i] > 0) ? 1 : 0;
  const satFor = new Map<number, Int32Array>();
  const satOf = (L: number) => {
    let t = satFor.get(L);
    if (t) return t;
    t = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = moist[i] && h[i] >= L - 1 && h[i] <= L + 1 ? 1 : 0;
        t[(y + 1) * (W + 1) + x + 1] = v + t[y * (W + 1) + x + 1] + t[(y + 1) * (W + 1) + x] - t[y * (W + 1) + x];
      }
    satFor.set(L, t);
    return t;
  };
  return (L, x0, y0, x1, y1) => {
    const s2 = satOf(L);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1);
    y1 = Math.min(H - 1, y1);
    return s2[(y1 + 1) * (W + 1) + x1 + 1] - s2[y0 * (W + 1) + x1 + 1] - s2[(y1 + 1) * (W + 1) + x0] + s2[y0 * (W + 1) + x0];
  };
}

/** The ground a start at (x, y) on level L will grow its wood on (`StartTerms.wood`). */
export function woodAt(boxes: ReturnType<typeof moistBoxes>, x: number, y: number, L: number): number {
  return boxes(L, x - WOOD_BOX, y - WOOD_BOX, x + WOOD_BOX, y + WOOD_BOX);
}

/** What the measure reads of a land and its water (planned or settled), once: the bench regions, their ways out and
 *  the moist ground. `depth` is the water (the plan's or the settle's), `channels` the hydrology's channel and lake
 *  tiles (1, 2), `moisture` the soil's moisture on that water. */
export interface StartField {
  benches: { labels: Int32Array; size: number[] };
  ways: Int32Array;
  boxes: ReturnType<typeof moistBoxes>;
}

export function startField(h: ArrayLike<number>, W: number, H: number, depth: ArrayLike<number>, channels: ArrayLike<number>, moisture: ArrayLike<number>): StartField {
  const benches = benchRegions(h, W, H, depth, channels);
  return { benches, ways: benchWays(h, W, H, benches), boxes: moistBoxes(h, W, H, depth, moisture) };
}

/** The terms of a start at tile i (x, y on level `h[i]`), with the walkable land it joins (`foot`) and the walk to its
 *  water (`water`), which its caller reads on its own water and slopes. */
export function startTerms(field: StartField, h: ArrayLike<number>, W: number, i: number, foot: number, water: number, droughtOk?: boolean): StartTerms {
  const x = i % W;
  const y = (i - x) / W;
  const k = field.benches.labels[i];
  return { bench: benchAt(field.benches, i), foot, wood: woodAt(field.boxes, x, y, h[i]), ways: k >= 0 ? field.ways[k] : 0, water, ...(droughtOk === undefined ? {} : { droughtOk }) };
}
