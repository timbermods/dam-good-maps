// Playability (PLAN §11.3–11.5): whether a colony can survive and grow from its start. The checks
// themselves run in Rust (rust/checks, D465; their TypeScript is tag `ts-checks-final`): validateMap
// (checks.ts) runs them. What stays here is what the generator and the editor read the same way the
// checks do: the thresholds for a map (`rulesFor`), the colony's reach and its mine sites
// (`colonyReach`, `minesReached`, `mineSitesCutAt`), a badwater basin's leak (`basinLeak`), the extras'
// distance bands and flood margin (`EXTRA_BANDS`, `nearWater`), and what the checks measured
// (`PlayabilityAnalysis`).

import type { DamSite } from "../analysis/damsites";
import { landRegions, walkRegions } from "../analysis/regions";
import { walkWorld, WALK_BLOCKERS } from "../analysis/walk";
import type { WoodBySpecies } from "../analysis/wood";
import { footprintTiles, startMiddleTile } from "../format/footprints";
import { channelTiles } from "../features/route";
import { DROUGHT, REACH_MIN, RESERVE, reservoirNeeded } from "../gen/calibrated";
import type { MapObject } from "../sim/model";
import { asksForBadwater } from "../resources/badwater";
import { distanceFrom } from "../math/grid";
import { DIFFICULTY_RULES, SMALL_MAP, type Difficulty, type MapSpec } from "../spec/mapspec";

/** Water deeper than this counts as a water tile (prototype `wet = D > 0.05`). */
export const WET = 0.05;
/** Water with this much contamination or more is badwater to a beaver. */
export const BAD = 0.05;
/** (`analysis/walk.ts` holds it, beside the walk graph; the editor's start indicators read it here.) */
export { WALK_BLOCKERS };
const START_AREA = { small: 0.6, normal: 1, large: 1.8 } as const;

/** Thresholds for one map: from its spec, or the difficulty's defaults for an imported map. The
 *  three start requirements (PLAN §5.6, D85) are `waterWithin` (water without stairs: tiles' walk
 *  over the map's own ground and slopes to a shore a pump works from), `woodWithin20` (Minimum
 *  starting wood, in logs, D164) and `bushesWithin20` (Minimum starting bushes); the other start
 *  rules are targets with an advisory warning. */
export interface Rules {
  difficulty: Difficulty;
  waterWithin: number;
  woodWithin20: number;
  bushesWithin20: number;
  badwaterWithin: number;
  ruinsWithin: number;
  reachMin: number;
  /** Item 47 (no stairs, no heavy terraforming to get going): the level building land (tiles of a
   *  level, dry 2×2) and the moist farmland within 20 tiles' walk the start needs. */
  levelLand: number;
  farmland: number;
  /** Sources: None (D330): the map was generated without its sources, for the player to place. */
  sourcesNone: boolean;
  droughtDays: number;
  /** Stored water needed near the start: the colony's drought need × the drought reserve. */
  reservoirNeed: number;
  /** The least mean depth a dam site's reservoir must have (Hard: 3, PLAN §11.4; else 0), and the
   *  dam heights sampled (crests of 4 only when a depth is asked). */
  reservoirDepth: number;
  maxWaterShare: number;
  multipliers: { scrap: number; trees: number; bushes: number };
  /** Whether the map should have a badwater source (D200): its Badwater setting is anything but No
   *  badwater, or, for a map without its settings, its description does not say No badwater. */
  badwaterSource: boolean;
}

/** The level building land a start needs within 20 tiles' walk, by Start area (item 47: its first
 *  buildings without reshaping): the start's bench the settler asks for (radius 5 / 6 / 8, PLAN
 *  §5.7), as tiles of a level, dry 2×2. */
export const LEVEL_LAND = { small: 79, normal: 113, large: 180 } as const;
/** Moist farmland (dry, clean soil the water keeps moist) a start needs within 20 tiles' walk (item
 *  47: its first farmland without stairs); the settler asks for 160 of moist land before the
 *  resources take some. */
export const FARMLAND_NEAR = 100;

export function rulesFor(spec: MapSpec | null, designedFor: Difficulty = "normal", description = ""): Rules {
  const difficulty = spec?.designedFor ?? designedFor;
  const d = DIFFICULTY_RULES[difficulty];
  const s = spec?.settings;
  const r = s?.start.rules ?? d;
  return {
    difficulty,
    waterWithin: r.waterWithin,
    woodWithin20: r.woodWithin20,
    bushesWithin20: r.bushesWithin20,
    // the Badwater distance setting and the start rule say the same thing: the stricter counts
    badwaterWithin: s ? Math.max(s.hazards.badwaterDistance, s.start.rules.badwaterWithin) : r.badwaterWithin,
    ruinsWithin: r.ruinsWithin,
    reachMin: REACH_MIN[s?.terrain.buildableLand ?? "normal"] * START_AREA[s?.start.area ?? "normal"],
    levelLand: LEVEL_LAND[s?.start.area ?? "normal"],
    farmland: FARMLAND_NEAR,
    sourcesNone: s?.water.sources === "none",
    droughtDays: DROUGHT[difficulty].days,
    reservoirNeed: reservoirNeeded(difficulty) * RESERVE[s?.water.droughtReserve ?? "normal"],
    reservoirDepth: difficulty === "hard" ? 3 : 0,
    // (the total water cap per theme, D369: Islands' sea may be most of the map)
    maxWaterShare: spec?.theme === "islands" ? 0.7 : spec && (spec.theme === "lakeBasin" || spec.theme === "any") ? 0.55 : 0.35,
    multipliers: s
      ? { scrap: s.resources.ruins / 100, trees: s.resources.forestDensity / 100, bushes: s.resources.berryBushes / 100 }
      : { scrap: 1, trees: 1, bushes: 1 },
    badwaterSource: asksForBadwater(s?.hazards.badwater ?? null, description),
  };
}

/** What the checks measured, for the preview layers and the map card. */
export interface PlayabilityAnalysis {
  moisture: Float64Array;
  soilContamination: Float64Array;
  /** Land walkable from the start (1), for the reach layer. */
  reach: Uint8Array;
  /** Chamfer distance from the start's 3×3, in tiles. */
  startDistance: Float64Array | null;
  /** Walking distance from the start, over the map's own ground and slopes, to a shore tile that
   *  touches clean water a pump on it reaches (Infinity if none within the walk limit): the water
   *  rule (D85, amended by D153). */
  waterDistance: number;
  /** Living trees and living berry bushes within 20 tiles' walk of the start (slopes allowed). */
  treesNear: number;
  bushesNear: number;
  /** Starting wood (D164): the logs of the grown trees within 20 tiles' walk, and by species;
   *  and the logs of the saplings there, still growing. */
  woodNear: number;
  woodBySpecies: WoodBySpecies;
  woodGrowing: number;
  damSites: DamSite[];
  /** The best dam site within 40 tiles of the start, and the natural water kept there. */
  bestDam: DamSite | null;
  naturalStorage: number;
  /** Water storage near the start (water.storage_possible): the clean flow feeding the start's water
   *  and what it needs, and what a dam, natural pools and levees hold, against the need. */
  storage: { running: number; runningNeed: number; dam: number; natural: number; levee: number; need: number } | null;
}

/** The mine sites out of the colony's reach on a map as it stands, as the tile index of each one's
 *  first tile (the editor takes it once, when the map is opened: `ValidateOptions.mineCutAtOpen`).
 *  Reach is the checks' one reading (`colonyReach`, D342), on the map's own water (`wet`). */
export function mineSitesCutAt(objects: readonly MapObject[], h: Uint8Array, wet: Uint8Array, W: number, H: number): Set<number> {
  const start = objects.find((o) => o.template === "StartingLocation");
  const out = new Set<number>();
  if (!start) return out;
  const [sx, sy] = startMiddleTile(start);
  for (const [x, y] of minesOutOfReach(objects, W, H, colonyReach(W, H, h, wet, objects, { x: sx, y: sy }))) out.add(y * W + x);
  return out;
}

const N4: readonly [number, number][] = [[0, -1], [-1, 0], [0, 1], [1, 0]];

/** The mine sites a map needs (item 47 of the forces-preview feedback, PLAN §20 D325; Kyler,
 *  2026-09-25, before it: one): at least two, the late game's lasting source of scrap metal, and
 *  with a start, two the colony reaches from it (a mine's entrance ring on the start's reach, or on
 *  dry land joined to the start's by steps of one level: a flight of stairs at most, never across
 *  water or up a cliff; decisions-pending, the session's default). */
export const MINES_WANTED = 2;
/** The mine sites a map of this size needs the colony to reach (one below `SMALL_MAP`, D333 (7)). */
export function minesWanted(W: number, H: number): number {
  return W * H < SMALL_MAP ? 1 : MINES_WANTED;
}

/** The land the colony reaches from the start (item 47, D342: the one function the mine sites'
 *  check and the generator read "reached" with): the start's walk over the map's own ground and its
 *  slopes, round the objects that block walking, and the dry land joined to the start's by steps of
 *  one level (a flight of stairs at most, never across water or up a cliff). */
export function colonyReach(W: number, H: number, h: Uint8Array, wet: Uint8Array, objects: readonly MapObject[], start: { x: number; y: number }): Uint8Array {
  const N = W * H;
  const { blocked, links } = walkWorld(objects, W, H);
  const labels = walkRegions(h, W, H, blocked, links);
  const root = labels[start.y * W + start.x];
  const land = landRegions(h, W, H, wet);
  const landRoot = land[start.y * W + start.x];
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) if ((root >= 0 && labels[i] === root) || (landRoot >= 0 && land[i] === landRoot)) out[i] = 1;
  return out;
}

/** The mine sites the colony does not reach, as each one's first tile: a site is reached when a
 *  tile beside its footprint is on `reach` (`colonyReach`). */
export function minesOutOfReach(objects: readonly MapObject[], W: number, H: number, reach: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "UndergroundRuins") continue;
    const tiles = footprintTiles(o.template, o);
    const own = new Set<number>();
    for (const [x, y] of tiles) own.add(y * W + x);
    let hit = false;
    for (const i of own) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1 && !hit; dy++)
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !own.has(yy * W + xx) && reach[yy * W + xx]) hit = true;
        }
      if (hit) break;
    }
    if (!hit && tiles.length) out.push(tiles[0]);
  }
  return out;
}

/** The mine sites the colony reaches: those with a tile beside their footprint on `reach`. */
export function minesReached(objects: readonly MapObject[], W: number, H: number, reach: Uint8Array): number {
  let mines = 0;
  for (const o of objects) if (o.template === "UndergroundRuins") mines++;
  return mines - minesOutOfReach(objects, W, H, reach).length;
}


interface ContainedPlan {
  x: number;
  y: number;
  floor: number;
  outlet: number[];
  outletLevels: number[];
  outletWidth: number;
}

/** Where water rising in a basin with its outlet blocked would leave it below its rim, or null. */
export function basinLeak(p: ContainedPlan, h: Uint8Array, W: number, H: number): [number, number] | null {
  const rim = p.floor + 2;
  const cx = p.x + 1;
  const cy = p.y + 1;
  const blocked = channelTiles({ tiles: p.outlet, levels: p.outletLevels, width: p.outletWidth, to: "" }, W, H).bed;
  const seen = new Uint8Array(W * H);
  const queue: number[] = [];
  for (let y = p.y; y < p.y + 3; y++)
    for (let x = p.x; x < p.x + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      seen[y * W + x] = 1;
      queue.push(y * W + x);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return [x, y];
      const n = ny * W + nx;
      if (seen[n] || blocked.has(n) || h[n] >= rim) continue;
      if (Math.abs(nx - cx) > 5 || Math.abs(ny - cy) > 5) return [nx, ny];
      seen[n] = 1;
      queue.push(n);
    }
  }
  return null;
}

/** Distance bands of the 1.0 objects from the start (PLAN §5.4–5.5, §11.4), in tiles on maps of
 *  128² and larger; smaller maps scale the scaled bands by their side ÷ 128. Thorn belts and unstable
 *  cores keep their distance on every map. */
/** A mine site stands 60+ tiles from the start where it can (the official maps' nearest is 61); one
 *  the colony reaches may stand nearer, from 30 (item 47: two mine sites it reaches). */
export const MINE_REACH_LO = 30;
export const MINE_LO = 60;

export const EXTRA_BANDS: Record<string, { lo: number; hi: number; scaled: boolean }> = {
  relicSmall: { lo: 13, hi: 70, scaled: true },
  relicMedium: { lo: 40, hi: 140, scaled: true },
  relicLarge: { lo: 140, hi: Infinity, scaled: true },
  geothermal: { lo: 30, hi: 120, scaled: true },
  mineSite: { lo: MINE_REACH_LO, hi: Infinity, scaled: true },
  thornBelt: { lo: 20, hi: Infinity, scaled: false },
  unstableCore: { lo: 40, hi: Infinity, scaled: false },
};

/** How much a map shrinks the scaled bands: its longer side ÷ 128, at most 1. */
export function bandScale(W: number, H: number): number {
  const side = W > H ? W : H;
  return side >= 128 ? 1 : side / 128;
}

/** No water tile within this many tiles (Chebyshev) of such an object: it stays out of flood reach. */
export const FLOOD_MARGIN = 2;

/** The nearest badwater or contaminated soil to the start, measured from the district center's 3×3
 *  middle: start.badwater's reading (rust/checks `playability.rs` reads it the same way), which the
 *  generator holds as a rule (Kyler, 2026-10-05, #265). `at` is its tile, -1 where the map has none. */
export function nearestBadwater(W: number, H: number, middle: readonly [number, number], depth: ArrayLike<number>, contamination: ArrayLike<number>, soilContamination: ArrayLike<number>): { distance: number; at: number } {
  const N = W * H;
  const mask = new Uint8Array(N);
  const [sx, sy] = middle;
  for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
  const d = distanceFrom(mask, W, H);
  let distance = Infinity;
  let at = -1;
  for (let i = 0; i < N; i++) {
    if ((soilContamination[i] > 0 || (depth[i] > WET && contamination[i] >= BAD)) && d[i] < distance) {
      distance = d[i];
      at = i;
    }
  }
  return { distance, at };
}

/** The tiles within `margin` (a square round each, Chebyshev) of the water: deeper than `WET`. The
 *  objects keep `FLOOD_MARGIN + 1` (gen/extras.ts `objectKeepOff`), the mine pads more
 *  (land/minePads.ts), and `extras.placement` checks `FLOOD_MARGIN`. */
export function nearWater(wet: ArrayLike<number>, W: number, H: number, margin: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  // (a square dilation, rows then columns)
  const rows = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -Infinity;
    for (let x = 0; x < W; x++) {
      if (wet[y * W + x] > WET) last = x;
      if (x - last <= margin) rows[y * W + x] = 1;
    }
    last = Infinity;
    for (let x = W - 1; x >= 0; x--) {
      if (wet[y * W + x] > WET) last = x;
      if (last - x <= margin) rows[y * W + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -Infinity;
    for (let y = 0; y < H; y++) {
      if (rows[y * W + x]) last = y;
      if (y - last <= margin) out[y * W + x] = 1;
    }
    last = Infinity;
    for (let y = H - 1; y >= 0; y--) {
      if (rows[y * W + x]) last = y;
      if (last - y <= margin) out[y * W + x] = 1;
    }
  }
  return out;
}

