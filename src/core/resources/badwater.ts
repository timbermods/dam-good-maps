// Badwater on every map (Kyler, 2026-09-26, PLAN §20 D200): badwater is a late-game resource (it
// makes Extract, and from it Catalyst, Grease and Explosives), not only a hazard, so every map has
// at least one permanent badwater source, unless the player chose "No badwater" for a peaceful map.
//
// - `badwaterBudget`: how many sources a map gets and how strong each is. The official maps' median
//   for the size (investigation/official-baselines.json: 1 source on small maps, 2 at 128², 4 at 192²,
//   3.5 at 256², each about 1.5 strong), moved within their typical range by the seed, then scaled by
//   the Badwater setting. The generator builds each as a side basin (gen/water.ts `placeBadwater`).
// - `pickBadwaterSprings`: where they go on ground the generator did not shape (Real places, Pick a
//   place): a flat, dry 3×3 in a hollow or a side valley (most of the tiles 4–6 tiles round it stand
//   higher, as 84% of the official sources do), beyond the difficulty's badwater distance from the
//   start (30 / 15 / 8 tiles, plus the 14 tiles its water and soil spread, as the generator keeps).
//   `planMapResources` (plan.ts) calls it, settles the water again and checks the start stays clean.
//
// Everything is deterministic (PLAN §2.1): basic arithmetic, the seeded streams and literal tables.

import { waterSource, type EntitySpec } from "../format/entities";
import { entityId } from "../features/ids";
import { BADWATER_SETTING, lnDet, OFFICIAL_BADWATER as B, officialPerMap } from "../gen/calibrated";
import { expDet } from "../math/detmath";
import { distanceFrom } from "../math/grid";
import { stream } from "../math/rng";
import type { Settings } from "../spec/mapspec";
import { lownessAt } from "./measure";

export type BadwaterSetting = Settings["hazards"]["badwater"];

/** The line a map's description carries when its player chose No badwater (gen/pack.ts); the
 *  validators read it on a map that comes without its settings. */
export const NO_BADWATER_NOTE = "No badwater: a peaceful map (badtides still turn every source bad).";

/** Whether a map should have a badwater source: its setting when it has one (anything but No
 *  badwater asks for one), else its description (a map that says No badwater does not). */
export function asksForBadwater(setting: BadwaterSetting | null, description = ""): boolean {
  if (setting) return setting !== "off";
  return !/\bNo badwater\b/i.test(description);
}

export interface BadwaterBudget {
  /** Sources to place, and each one's strength (blocks per second over its 3×3). */
  sources: number;
  strength: number;
  /** The official maps' typical range at this size (25th to 75th percentile), at Normal. */
  official: { sources: [number, number]; strength: [number, number] };
}

/** Between lo and hi at t in [0, 1], evenly in ln (a ratio, so a factor of the median). */
function between(lo: number, hi: number, t: number): number {
  return lo * expDet(t * lnDet(hi / lo));
}

/** A map's badwater sources for its size and setting (see the file's header). The seed alone moves
 *  them within the typical range, so a map keeps them whatever attempt the generator took. No
 *  badwater gives none; any other setting at least one. */
export function badwaterBudget(W: number, H: number, setting: BadwaterSetting, seed: number): BadwaterBudget {
  const area = W * H;
  const n = officialPerMap(B.sources, area);
  const s = officialPerMap(B.strength, area);
  const official = { sources: [n * B.sourcesSpread[0], n * B.sourcesSpread[1]] as [number, number], strength: [s * B.strengthSpread[0], s * B.strengthSpread[1]] as [number, number] };
  const f = BADWATER_SETTING[setting];
  if (!(f.sources > 0)) return { sources: 0, strength: 0, official };
  const rng = stream(seed, "badwater", "budget");
  const u = { sources: rng.float(), strength: rng.float() };
  const total = between(official.strength[0], official.strength[1], u.strength) * f.strength;
  let sources = Math.max(1, Math.round(between(official.sources[0], official.sources[1], u.sources) * f.sources));
  // each between the builder's 1 and 3: fewer, stronger sources for a small total; more for a large one
  sources = Math.max(1, Math.min(sources, Math.floor(total / B.each.min)), Math.ceil(total / B.each.max));
  const each = Math.min(B.each.max, Math.max(B.each.min, Math.round(total / sources / B.each.step) * B.each.step));
  return { sources, strength: each, official };
}

// ------------------------------------------------------------------ springs on ground as it stands

export interface BadwaterSpring {
  /** Minimum corner of the 3×3 (it is placed Cw0, so this is its Coordinates), and its level. */
  x: number;
  y: number;
  z: number;
  strength: number;
  /** Share of the tiles 4–6 tiles round it that stand higher (measure.ts `lownessAt`). */
  lowness: number;
  /** Straight tiles from the start's centre to the 3×3's nearest tile. */
  fromStart: number;
}

export interface SpringInput {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** The settled water's depth before the springs. */
  water: ArrayLike<number>;
  /** Tiles the map's objects take (sources, the start's zone, slopes, mine sites). */
  taken: Uint8Array;
  start: { x: number; y: number };
  /** No badwater within this many tiles of the start (the difficulty's rule: 30 / 15 / 8). */
  within: number;
  budget: BadwaterBudget;
  seed: number;
  /** Tiles no spring may use (ones tried before and dropped). */
  refused?: Uint8Array;
}

/** A spring's least distance from the start: the difficulty's distance plus the reach of its water
 *  and soil (the generator's basins keep `within + 12` to their floor, `+ 14` as the target). */
export const SPRING_MARGIN = 14;
/** A spring stands in a hollow or a side valley: at least this share of the tiles 4–6 tiles round it
 *  stand higher. */
export const SPRING_LOWNESS = 0.5;
const WET = 0.05;

/** Where a map's badwater springs go on its ground as it stands (see the file's header): flat, dry
 *  3×3s in hollows or side valleys, at least `within + 14` tiles from the start, the first nearest
 *  that distance and the next each 6 tiles further, 12 tiles apart. May find fewer than the budget
 *  (none on a map without such ground). */
export function pickBadwaterSprings(inp: SpringInput): BadwaterSpring[] {
  const { W, H, heights: h, water, start } = inp;
  const N = W * H;
  const want = inp.budget.sources;
  if (!(want > 0)) return [];
  const startMask = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  // no spring within 2 tiles of water or of a taken tile: its 3×3 needs dry, free ground round it
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!(water[i] > WET) && !inp.taken[i] && !inp.refused?.[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) blocked[yy * W + xx] = 1;
      }
  }
  const least = inp.within + SPRING_MARGIN;
  const cands: { x: number; y: number; z: number; low: number; d: number; jitter: number }[] = [];
  const rng = stream(inp.seed, "badwater", "springs");
  for (let y = 3; y + 2 < H - 3; y++)
    for (let x = 3; x + 2 < W - 3; x++) {
      const z = h[y * W + x];
      let ok = true;
      let d = Infinity;
      for (let dy = 0; dy < 3 && ok; dy++)
        for (let dx = 0; dx < 3 && ok; dx++) {
          const i = (y + dy) * W + x + dx;
          if (blocked[i] || h[i] !== z) ok = false;
          else d = Math.min(d, sd[i]);
        }
      if (!ok || d < least) continue;
      const low = lownessAt(h, W, H, x + 1, y + 1, z);
      if (low < SPRING_LOWNESS) continue;
      cands.push({ x, y, z, low, d, jitter: rng.float() });
    }
  const out: BadwaterSpring[] = [];
  const used = new Uint8Array(N);
  for (let k = 0; k < want; k++) {
    const target = least + 6 * k;
    // nearest the target first, the lowest ground breaking near ties
    let best: (typeof cands)[number] | null = null;
    let bestKey = Infinity;
    for (const c of cands) {
      if (used[c.y * W + c.x]) continue;
      const key = Math.abs(c.d - target) + 6 * c.jitter - 8 * c.low;
      if (key < bestKey || (key === bestKey && best && c.y * W + c.x < best.y * W + best.x)) {
        best = c;
        bestKey = key;
      }
    }
    if (!best) break;
    out.push({ x: best.x, y: best.y, z: best.z, strength: inp.budget.strength, lowness: best.low, fromStart: Math.round(best.d * 10) / 10 });
    // the next springs keep 12 tiles from this one
    for (let dy = -14; dy <= 14; dy++)
      for (let dx = -14; dx <= 14; dx++) {
        const xx = best.x + dx;
        const yy = best.y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) used[yy * W + xx] = 1;
      }
  }
  return out;
}

/** Springs as BadwaterSource entities, with ids hashed from `owner`, the template and the tile. */
export function springEntities(springs: readonly BadwaterSpring[], W: number, owner: string): EntitySpec[] {
  return springs.map((s) => waterSource({ id: entityId(owner, "BadwaterSource", s.y * W + s.x), owner, x: s.x, y: s.y, z: s.z, strength: s.strength, bad: true }));
}
