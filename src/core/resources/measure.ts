// What a map holds in trees, berry bushes, ruins, mine sites and badwater sources, and how they are laid out
// (investigation/official-baselines.json measures the official maps with it; the batch and the
// comparison tools measure generated maps the same way). Pure: a map's objects, its surface and its
// stored or settled water and soil in, numbers out.
//
// - A grove is trees within 2 tiles of each other (Chebyshev), 5 or more: official forests are
//   painted about 40% full, so trees that touch split one painted grove into many. A clearing is the
//   gap between two groves: the Chebyshev distance between their nearest trees, less one.
// - A berry patch is bushes within 2 tiles of each other, 3 or more.
// - A ruin field is columns that touch (Chebyshev 1), 10 or more, as the `ruins.fields` check counts.
//   A column of H storeys yields 15·H scrap.
// - A badwater source's lowness is the share of the tiles 4–6 tiles from its 3×3's centre
//   (Chebyshev) whose top stands above the source's level: near 1 in a hollow or a side valley, near
//   0 on a rise.

import { FOOTPRINTS, worldBlocks } from "../format/footprints";
import { JsonFloat } from "../format/json";
import type { TimberFile } from "../format/timber";
import { storedSoil, storedWater, surfaceOf } from "../format/world";
import { isDelayed, mapObjects, objectTile, specifiedStrength, type MapObject } from "../sim/model";

export const MAP_TREES = ["Pine", "Birch", "Oak", "Succulent"] as const;
export type MapTree = (typeof MAP_TREES)[number];
export const RUIN_VARIANT_IDS = ["A", "B", "C", "D", "E"] as const;
/** Storeys from which a ruin column counts as a tower. */
export const TOWER = 6;
export const GROVE_GAP = 2;
export const GROVE_MIN = 5;
export const PATCH_GAP = 2;
export const PATCH_MIN = 3;
export const FIELD_MIN = 10;

export interface ResourceGroundInput {
  W: number;
  H: number;
  /** Each tile's top. */
  heights: ArrayLike<number>;
  /** Water depth on each tile's top. */
  depth: ArrayLike<number>;
  /** Soil moisture on each tile's top. */
  moisture: ArrayLike<number>;
  objects: readonly MapObject[];
}

export interface GroupStats {
  count: number;
  /** Members of each group, ascending. */
  sizes: number[];
  /** Share of all members that stand in a group. */
  inGroups: number;
  /** For each group, the clearing to its nearest neighbour group, in tiles (null alone). */
  gaps: number[];
}

export interface RuinFieldStats {
  columns: number;
  scrap: number;
  meanStoreys: number;
  sdStoreys: number;
  maxStoreys: number;
  /** Columns of TOWER storeys or more. */
  towers: number;
  /** Columns ÷ the tiles of the field's bounding box. */
  fill: number;
  /** Longer side ÷ shorter side of the bounding box. */
  aspect: number;
  /** Mean storey difference between touching columns. */
  neighbourStep: number;
  /** Distinct model variants. */
  variants: number;
}

export interface ResourceMeasures {
  W: number;
  H: number;
  area: number;
  trees: {
    total: number;
    living: number;
    /** Stored as saplings (Growable.GrowthProgress below 1). */
    young: number;
    bySpecies: Record<MapTree, { total: number; dead: number }>;
    /** Dead share of Pine, Birch and Oak together. */
    deadShare: number;
    groves: GroupStats;
    /** Mean share of a tree's 8 neighbours that hold a tree, over trees in groves. */
    groveFill: number;
    /** Living trees ÷ moist dry-footed tiles; dead trees ÷ dry tiles. */
    moistCover: number;
    dryCover: number;
    /** Share of living trees on moist soil, of dead ones on dry soil. */
    livingOnMoist: number;
    deadOnDry: number;
    /** Share of the dominant species in groves of 20+ (median). */
    groveDominant: number | null;
  };
  bushes: {
    total: number;
    living: number;
    patches: GroupStats;
    /** Mean share of a bush's 8 neighbours that hold a bush, over bushes in patches. */
    patchFill: number;
    moistCover: number;
    /** Median distance from a bush to the nearest water (Chebyshev tiles). */
    toWater: number | null;
  };
  ruins: {
    columns: number;
    scrap: number;
    /** Columns of 1…8 storeys. */
    storeys: number[];
    variants: Record<string, number>;
    orientations: Record<string, number>;
    fields: RuinFieldStats[];
    inFields: number;
  };
  mines: { count: number; fromStart: number[] };
  /** BadwaterSource objects: each one's strength and lowness (in the order of the map's objects),
   *  how many wait for a cycle to start (time-activated), their total strength and the clean
   *  WaterSources' total, and each one's distance from the start (its footprint's nearest tile to
   *  the start's centre), nearest first; and the map's BadwaterSeeps, the other lasting supply. */
  badwater: { count: number; delayed: number; strengths: number[]; lowness: number[]; total: number; clean: number; fromStart: number[]; seeps: number };
  /** The start's centre, when the map has exactly one. */
  start: { x: number; y: number } | null;
}

const isDead = (o: MapObject) => (o.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead === true;
/** A sapling: Growable.GrowthProgress below 1 (a float parses as a JsonFloat; missing means grown). */
const isYoung = (o: MapObject) => {
  const g = o.components.Growable as { GrowthProgress?: unknown } | undefined;
  const p = g?.GrowthProgress;
  const v = p instanceof JsonFloat ? p.value : typeof p === "number" ? p : 1;
  return v < 1;
};

/** Groups of tiles within `gap` of each other (Chebyshev). Each group's tiles, ascending. */
export function groupsWithin(tiles: readonly number[], W: number, H: number, gap: number): number[][] {
  const at = new Map<number, number>();
  tiles.forEach((t, k) => at.set(t, k));
  const parent = tiles.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]];
      k = parent[k];
    }
    return k;
  };
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k];
    const x = t % W;
    const y = (t - x) / W;
    for (let dy = 0; dy <= gap; dy++)
      for (let dx = -gap; dx <= gap; dx++) {
        if (dy === 0 && dx <= 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy >= H) continue;
        const j = at.get(yy * W + xx);
        if (j === undefined) continue;
        const a = find(k);
        const b = find(j);
        if (a !== b) parent[a < b ? b : a] = a < b ? a : b;
      }
  }
  const groups = new Map<number, number[]>();
  tiles.forEach((t, k) => {
    const r = find(k);
    const g = groups.get(r);
    if (g) g.push(t);
    else groups.set(r, [t]);
  });
  return [...groups.values()].map((g) => g.sort((a, b) => a - b));
}

/** The clearing from each group to its nearest other group: the Chebyshev distance between their
 *  nearest members, less one. Searched outward from each group's members up to `reach`. */
function clearings(groups: readonly number[][], W: number, H: number, reach: number): number[] {
  const owner = new Map<number, number>();
  groups.forEach((g, k) => {
    for (const t of g) owner.set(t, k);
  });
  const out: number[] = [];
  groups.forEach((g, k) => {
    let best = Infinity;
    for (const t of g) {
      const x = t % W;
      const y = (t - x) / W;
      for (let r = 1; r < Math.min(best, reach + 1); r++) {
        let hit = false;
        for (let d = -r; d <= r && !hit; d++)
          for (const [xx, yy] of [
            [x + d, y - r],
            [x + d, y + r],
            [x - r, y + d],
            [x + r, y + d],
          ]) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const o = owner.get(yy * W + xx);
            if (o !== undefined && o !== k) {
              hit = true;
              break;
            }
          }
        if (hit) {
          best = r;
          break;
        }
      }
    }
    if (best < Infinity) out.push(best - 1);
  });
  return out.sort((a, b) => a - b);
}

function groupStats(tiles: readonly number[], W: number, H: number, gap: number, min: number): { stats: GroupStats; groups: number[][] } {
  const groups = groupsWithin(tiles, W, H, gap).filter((g) => g.length >= min);
  let inGroups = 0;
  for (const g of groups) inGroups += g.length;
  return {
    groups,
    stats: {
      count: groups.length,
      sizes: groups.map((g) => g.length).sort((a, b) => a - b),
      inGroups: tiles.length ? inGroups / tiles.length : 0,
      gaps: clearings(groups, W, H, 64),
    },
  };
}

/** Mean share of 8 neighbours that hold a member, over the members of the groups. */
function neighbourFill(groups: readonly number[][], has: (i: number) => boolean, W: number): number {
  let sum = 0;
  let n = 0;
  for (const g of groups)
    for (const t of g) {
      const x = t % W;
      const y = (t - x) / W;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < W && has((y + dy) * W + x + dx)) k++;
      sum += k / 8;
      n++;
    }
  return n ? sum / n : 0;
}

/** Chebyshev distance to the nearest wet tile, by a two-pass sweep. */
function waterDistance(W: number, H: number, wet: (i: number) => boolean): Int32Array {
  const N = W * H;
  const d = new Int32Array(N).fill(1 << 20);
  for (let i = 0; i < N; i++) if (wet(i)) d[i] = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - W] + 1);
        if (x > 0) d[i] = Math.min(d[i], d[i - W - 1] + 1);
        if (x < W - 1) d[i] = Math.min(d[i], d[i - W + 1] + 1);
      }
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < H - 1) {
        d[i] = Math.min(d[i], d[i + W] + 1);
        if (x < W - 1) d[i] = Math.min(d[i], d[i + W + 1] + 1);
        if (x > 0) d[i] = Math.min(d[i], d[i + W - 1] + 1);
      }
    }
  return d;
}

/** The distance from `p` to an object's footprint's nearest ground tile, to a tenth of a tile. */
function nearestTo(o: MapObject, p: { x: number; y: number }): number {
  let d = Infinity;
  for (const b of worldBlocks(FOOTPRINTS[o.template], o)) if (b.localZ === 0) d = Math.min(d, Math.hypot(b.x - p.x, b.y - p.y));
  return Math.round(d * 10) / 10;
}

/** A badwater source's lowness: the share of the tiles 4–6 tiles (Chebyshev) from its 3×3's centre
 *  whose top stands above the source's level (see the file's header). */
export function sourceLowness(heights: ArrayLike<number>, W: number, H: number, o: Pick<MapObject, "template" | "x" | "y" | "z" | "orientation" | "flipped">): number {
  const [cx, cy] = objectTile(o, 1, 1);
  return lownessAt(heights, W, H, cx, cy, o.z);
}

/** The share of the tiles 4–6 tiles (Chebyshev) from (cx, cy) whose top stands above `level`. */
export function lownessAt(heights: ArrayLike<number>, W: number, H: number, cx: number, cy: number, level: number): number {
  let above = 0;
  let all = 0;
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      all++;
      if (heights[y * W + x] > level) above++;
    }
  return all ? Math.round((above / all) * 1000) / 1000 : 0;
}

/** The centre tile of a StartingLocation's 3×3. */
export function startCentreOf(o: MapObject): { x: number; y: number } {
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, o).filter((b) => b.localZ === 0);
  let sx = 0;
  let sy = 0;
  for (const b of cells) {
    sx += b.x;
    sy += b.y;
  }
  return { x: Math.round(sx / cells.length), y: Math.round(sy / cells.length) };
}

/** A map file's ground as it stores it: the top of each column, the water standing on it, its soil
 *  moisture, and its objects. */
export function groundOfFile(file: TimberFile): ResourceGroundInput {
  const w = file.world;
  const W = w.sizeX;
  const H = w.sizeY;
  const heights = surfaceOf(w);
  const water = storedWater(w.singletons, W, H);
  const depth = new Float32Array(W * H);
  water.tile.forEach((t, k) => {
    if (water.floor[k] < 0 || water.floor[k] === heights[t]) depth[t] = Math.max(depth[t], water.depth[k]);
  });
  return { W, H, heights, depth, moisture: storedSoil(w.singletons, W, H).moisture, objects: mapObjects(w) };
}

export function measureResources(g: ResourceGroundInput): ResourceMeasures {
  const { W, H, depth, moisture, objects } = g;
  const N = W * H;
  const on = (o: MapObject) => o.x >= 0 && o.y >= 0 && o.x < W && o.y < H;
  const wet = (i: number) => depth[i] > 0.05;
  const bySpecies = Object.fromEntries(MAP_TREES.map((s) => [s, { total: 0, dead: 0 }])) as Record<MapTree, { total: number; dead: number }>;
  const treeTiles: number[] = [];
  const treeAt = new Map<number, MapTree>();
  let living = 0;
  let young = 0;
  let livingOnMoist = 0;
  let deadOnDry = 0;
  const bushTiles: number[] = [];
  let bushLiving = 0;
  const ruinAt = new Map<number, { h: number; v: string }>();
  const storeys = new Array<number>(8).fill(0);
  const variants: Record<string, number> = {};
  const orientations: Record<string, number> = {};
  let scrap = 0;
  let columns = 0;
  const mines: MapObject[] = [];
  const starts: MapObject[] = [];
  const bad: MapObject[] = [];
  let clean = 0;
  let seeps = 0;
  for (const o of objects) {
    const t = o.template;
    if ((MAP_TREES as readonly string[]).includes(t)) {
      if (!on(o)) continue;
      const i = o.y * W + o.x;
      const s = t as MapTree;
      bySpecies[s].total++;
      const dead = isDead(o);
      if (dead) {
        bySpecies[s].dead++;
        if (!(moisture[i] > 0)) deadOnDry++;
      } else {
        living++;
        if (isYoung(o)) young++;
        if (moisture[i] > 0) livingOnMoist++;
      }
      if (!treeAt.has(i)) {
        treeAt.set(i, s);
        treeTiles.push(i);
      }
    } else if (t === "BlueberryBush") {
      if (!on(o)) continue;
      bushTiles.push(o.y * W + o.x);
      if (!isDead(o)) bushLiving++;
    } else if (t.startsWith("RuinColumnH")) {
      const h = Number(t.slice(11));
      if (!(h >= 1 && h <= 8)) continue;
      columns++;
      scrap += 15 * h;
      storeys[h - 1]++;
      const v = String((o.components.RuinModels as { VariantId?: unknown } | undefined)?.VariantId ?? "?");
      variants[v] = (variants[v] ?? 0) + 1;
      orientations[o.orientation] = (orientations[o.orientation] ?? 0) + 1;
      if (on(o)) ruinAt.set(o.y * W + o.x, { h, v });
    } else if (t === "UndergroundRuins") mines.push(o);
    else if (t === "StartingLocation") starts.push(o);
    else if (t === "BadwaterSource") bad.push(o);
    else if (t === "BadwaterSeep") seeps++;
    else if (t === "WaterSource") clean += specifiedStrength(o.components);
  }
  let moistFree = 0;
  let dryFree = 0;
  for (let i = 0; i < N; i++) {
    if (wet(i)) continue;
    if (moisture[i] > 0) moistFree++;
    else dryFree++;
  }
  const treeTotal = treeTiles.length;
  const pbo = ["Pine", "Birch", "Oak"] as const;
  const pboTotal = pbo.reduce((a, s) => a + bySpecies[s].total, 0);
  const pboDead = pbo.reduce((a, s) => a + bySpecies[s].dead, 0);
  const deadTotal = MAP_TREES.reduce((a, s) => a + bySpecies[s].dead, 0);
  const grove = groupStats(treeTiles, W, H, GROVE_GAP, GROVE_MIN);
  let fillSum = 0;
  let fillN = 0;
  const dominant: number[] = [];
  for (const gr of grove.groups) {
    const counts = new Map<MapTree, number>();
    for (const t of gr) {
      const x = t % W;
      const y = (t - x) / W;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < W && treeAt.has((y + dy) * W + x + dx)) n++;
      fillSum += n / 8;
      fillN++;
      const s = treeAt.get(t)!;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    if (gr.length >= 20) dominant.push(Math.max(...counts.values()) / gr.length);
  }
  dominant.sort((a, b) => a - b);
  const patch = groupStats(bushTiles, W, H, PATCH_GAP, PATCH_MIN);
  const bushSet = new Set(bushTiles);
  const toWater = waterDistance(W, H, wet);
  const bushWater = bushTiles.map((i) => toWater[i]).sort((a, b) => a - b);

  // ruin fields: touching columns
  const fieldGroups = groupsWithin([...ruinAt.keys()], W, H, 1).filter((f) => f.length >= FIELD_MIN);
  const fields: RuinFieldStats[] = fieldGroups.map((f) => {
    const hs = f.map((t) => ruinAt.get(t)!.h);
    const n = hs.length;
    const mean = hs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(hs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
    let x0 = W;
    let x1 = 0;
    let y0 = H;
    let y1 = 0;
    let step = 0;
    let steps = 0;
    for (const t of f) {
      const x = t % W;
      const y = (t - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        if (x + dx >= W) continue;
        const nb = ruinAt.get((y + dy) * W + x + dx);
        if (nb) {
          step += Math.abs(nb.h - ruinAt.get(t)!.h);
          steps++;
        }
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    return {
      columns: n,
      scrap: 15 * hs.reduce((a, b) => a + b, 0),
      meanStoreys: mean,
      sdStoreys: sd,
      maxStoreys: Math.max(...hs),
      towers: hs.filter((h) => h >= TOWER).length,
      fill: n / (bw * bh),
      aspect: Math.max(bw, bh) / Math.min(bw, bh),
      neighbourStep: steps ? step / steps : 0,
      variants: new Set(f.map((t) => ruinAt.get(t)!.v)).size,
    };
  });
  fields.sort((a, b) => b.columns - a.columns);
  const inFields = fieldGroups.reduce((a, f) => a + f.length, 0);

  const start = starts.length === 1 ? startCentreOf(starts[0]) : null;
  const fromStart = start ? mines.map((m) => nearestTo(m, start)).sort((a, b) => a - b) : [];
  return {
    W,
    H,
    area: N,
    trees: {
      total: treeTotal,
      living,
      young,
      bySpecies,
      deadShare: pboTotal ? pboDead / pboTotal : 0,
      groves: grove.stats,
      groveFill: fillN ? fillSum / fillN : 0,
      moistCover: moistFree ? living / moistFree : 0,
      dryCover: dryFree ? deadTotal / dryFree : 0,
      livingOnMoist: living ? livingOnMoist / living : 0,
      deadOnDry: deadTotal ? deadOnDry / deadTotal : 0,
      groveDominant: dominant.length ? dominant[dominant.length >> 1] : null,
    },
    bushes: {
      total: bushTiles.length,
      living: bushLiving,
      patches: patch.stats,
      patchFill: neighbourFill(patch.groups, (i) => bushSet.has(i), W),
      moistCover: moistFree ? bushLiving / moistFree : 0,
      toWater: bushWater.length ? bushWater[bushWater.length >> 1] : null,
    },
    ruins: { columns, scrap, storeys, variants, orientations, fields, inFields: columns ? inFields / columns : 0 },
    mines: { count: mines.length, fromStart },
    badwater: {
      count: bad.length,
      delayed: bad.filter((o) => isDelayed(o.components)).length,
      strengths: bad.map((o) => specifiedStrength(o.components)),
      lowness: bad.map((o) => sourceLowness(g.heights, W, H, o)),
      total: bad.reduce((a, o) => a + specifiedStrength(o.components), 0),
      clean,
      fromStart: start ? bad.map((o) => nearestTo(o, start)).sort((a, b) => a - b) : [],
      seeps,
    },
    start,
  };
}
