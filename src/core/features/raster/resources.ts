// Resource rasterizers (PLAN §19.8 step 11): berry patches, forests and ruin fields, placed on the
// settled water's soil moisture. Each feature draws from its own streams (PLAN §19.7) and places on
// free tiles only, so a feature's entities depend only on its own params and on the ground, water
// and occupancy under its area: an unchanged feature on unchanged ground is reused by a rebuild.

import { ORIENTATIONS } from "../../format/footprints";
import { bush, RUIN_VARIANTS, ruin, tree, type EntitySpec, type TreeSpecies } from "../../format/entities";
import { hash32, tileHash01 } from "../../math/hash";
import { runsToTiles } from "../../math/grid";
import { stream, type Rng } from "../../math/rng";
import { entityId } from "../ids";
import { ruinColumns } from "../../resources/baseline";
import type { BerryPatchFeature, Feature, ForestFeature, RuinFieldFeature } from "../schema";

/** What resources are placed on. `occupied` is updated as tiles are taken. */
export interface ResourceGround {
  W: number;
  seed: number;
  heights: Uint8Array;
  water: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  occupied: Uint8Array;
  /** Tiles a regeneration kept (locks): generated features place nothing there. */
  locked: Uint8Array | null;
}

export interface Placed {
  entities: EntitySpec[];
  /** Tiles taken, in placement order. */
  tiles: number[];
}

function take(g: ResourceGround, f: Feature, i: number, out: Placed): boolean {
  if (g.occupied[i] || g.water[i] > 0) return false;
  if (g.locked && g.locked[i] && f.origin === "generated") return false;
  g.occupied[i] = 1;
  out.tiles.push(i);
  return true;
}

export function isResource(f: Feature): f is BerryPatchFeature | ForestFeature | RuinFieldFeature {
  return f.kind === "berryPatch" || f.kind === "forest" || f.kind === "ruinField";
}

/** Resource features in placement order: berries, then forests, then ruin fields, each in
 *  document order. */
export function resourceOrder(features: readonly Feature[]): (BerryPatchFeature | ForestFeature | RuinFieldFeature)[] {
  const out: (BerryPatchFeature | ForestFeature | RuinFieldFeature)[] = [];
  for (const kind of ["berryPatch", "forest", "ruinField"] as const) for (const f of features) if (f.kind === kind) out.push(f);
  return out;
}

export function rasterizeResource(f: BerryPatchFeature | ForestFeature | RuinFieldFeature, g: ResourceGround): Placed {
  if (f.kind === "berryPatch") return rasterizeBerries(f, g);
  if (f.kind === "forest") return rasterizeForest(f, g);
  return rasterizeRuins(f, g);
}

function rasterizeBerries(f: BerryPatchFeature, g: ResourceGround): Placed {
  const { W } = g;
  const out: Placed = { entities: [], tiles: [] };
  const sPlace = hash32(g.seed, f.id, "place");
  const sRipe = hash32(g.seed, f.id, "ripe");
  const sGrow = hash32(g.seed, f.id, "regrow");
  for (const i of runsToTiles(f.params.area, W)) {
    const x = i % W;
    const y = (i - x) / W;
    if (i < 0 || i >= g.heights.length) continue;
    if (f.params.density < 1 && tileHash01(sPlace, x, y) >= f.params.density) continue;
    if (g.moisture[i] <= 0 || g.soilContamination[i] > 0) continue; // a bush on dry or contaminated soil dies
    if (!take(g, f, i, out)) continue;
    const ripe = tileHash01(sRipe, x, y) < f.params.ripeShare;
    const regrowth = Math.round((0.1 + 0.8 * tileHash01(sGrow, x, y)) * 1000) / 1000;
    out.entities.push(bush({ id: entityId(f.id, "BlueberryBush", i), owner: f.id, x, y, z: g.heights[i], ripe, regrowth }));
  }
  return out;
}

function rasterizeForest(f: ForestFeature, g: ResourceGround): Placed {
  const { W } = g;
  const out: Placed = { entities: [], tiles: [] };
  const species = (Object.keys(f.params.speciesMix) as TreeSpecies[]).sort();
  const weights = species.map((s) => f.params.speciesMix[s] ?? 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const sPlace = hash32(g.seed, f.id, "place");
  const sSpecies = hash32(g.seed, f.id, "species");
  const sYoung = hash32(g.seed, f.id, "young");
  const sGrowth = hash32(g.seed, f.id, "growth");
  for (const i of runsToTiles(f.params.area, W)) {
    if (i < 0 || i >= g.heights.length) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (f.params.density < 1 && tileHash01(sPlace, x, y) >= f.params.density) continue;
    let sp = species[0];
    if (species.length > 1 && total > 0) {
      let k = tileHash01(sSpecies, x, y) * total;
      for (let j = 0; j < species.length; j++) {
        k -= weights[j];
        if (k < 0) {
          sp = species[j];
          break;
        }
      }
    }
    const moist = g.moisture[i] > 0;
    const poisoned = g.soilContamination[i] > 0;
    let dead: boolean;
    if (sp === "Succulent") {
      if (moist || poisoned || f.params.life === "dead") continue; // succulents live only on dry, clean soil
      dead = false;
    } else if (f.params.life === "alive") {
      if (!moist || poisoned) continue;
      dead = false;
    } else if (f.params.life === "dead") dead = true;
    else dead = !moist || poisoned; // auto: official maps store trees on dry soil dead
    if (!take(g, f, i, out)) continue;
    let growth = 1;
    if (!dead && tileHash01(sYoung, x, y) < f.params.youngShare) {
      growth = Math.round((0.2 + 0.75 * tileHash01(sGrowth, x, y)) * 1000) / 1000;
    }
    out.entities.push(tree({ id: entityId(f.id, sp, i), owner: f.id, x, y, z: g.heights[i], species: sp, dead, growth }));
  }
  return out;
}

/** Heights for a ruin field's tiles (PLAN §9.7): sampled from the height mix, assigned by smooth
 *  noise (clumps, lattice 2.5 tiles) plus centerBias·(1 − r/rmax) plus a little jitter, tallest to
 *  the highest key. Depends only on the area and the feature's stream. */
export function assignRuinHeights(tiles: number[], W: number, rng: Rng, mix: number[], centerBias: number): number[] {
  const n = tiles.length;
  if (!n) return [];
  const hs: number[] = [];
  for (let k = 0; k < n; k++) hs.push(rng.weighted(mix) + 1);
  const xs = tiles.map((i) => i % W);
  const ys = tiles.map((i) => (i - (i % W)) / W);
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < n; k++) {
    cx += xs[k];
    cy += ys[k];
  }
  cx /= n;
  cy /= n;
  const r = xs.map((x, k) => Math.sqrt((x - cx) * (x - cx) + (ys[k] - cy) * (ys[k] - cy)));
  let rmax = 0;
  for (const v of r) if (v > rmax) rmax = v;
  if (rmax === 0) rmax = 1;
  const clump = 2.5;
  const x0 = xs.reduce((a, v) => Math.min(a, v), Infinity);
  const y0 = ys.reduce((a, v) => Math.min(a, v), Infinity);
  const gx = Math.floor((xs.reduce((a, v) => Math.max(a, v), -Infinity) - x0) / clump) + 2;
  const gy = Math.floor((ys.reduce((a, v) => Math.max(a, v), -Infinity) - y0) / clump) + 2;
  const lat: number[] = [];
  for (let k = 0; k < gx * gy; k++) lat.push(rng.float());
  const keys = tiles.map((_, k) => {
    const fx = (xs[k] - x0) / clump;
    const fy = (ys[k] - y0) / clump;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = lat[iy * gx + ix] * (1 - tx) + lat[iy * gx + ix + 1] * tx;
    const b = lat[(iy + 1) * gx + ix] * (1 - tx) + lat[(iy + 1) * gx + ix + 1] * tx;
    return a * (1 - ty) + b * ty + centerBias * (1 - r[k] / rmax) + 0.15 * rng.float();
  });
  const order = tiles.map((_, k) => k).sort((a, b) => keys[b] - keys[a] || a - b);
  const sorted = [...hs].sort((a, b) => b - a);
  const out = new Array<number>(n);
  order.forEach((k, rank) => (out[k] = sorted[rank]));
  return out;
}

function rasterizeRuins(f: RuinFieldFeature, g: ResourceGround): Placed {
  const { W } = g;
  const out: Placed = { entities: [], tiles: [] };
  const tiles = runsToTiles(f.params.area, W).filter((i) => i >= 0 && i < g.heights.length);
  if (f.params.layout) {
    // the official maps' look (resources/baseline.ts)
    const c = ruinColumns(tiles, W, stream(g.seed, f.id, "heights"), f.params.layout.tallness);
    tiles.forEach((i, k) => {
      if (!take(g, f, i, out)) return;
      const h = c.storeys[k];
      out.entities.push(ruin({ id: entityId(f.id, `RuinColumnH${h}`, i), owner: f.id, x: i % W, y: (i - (i % W)) / W, z: g.heights[i], height: h, variant: c.variants[k], orientation: c.orientations[k] }));
    });
    return out;
  }
  const heights = assignRuinHeights(tiles, W, stream(g.seed, f.id, "heights"), f.params.heightMix, f.params.centerBias);
  const sVariant = hash32(g.seed, f.id, "variant");
  const sOrient = hash32(g.seed, f.id, "orientation");
  tiles.forEach((i, k) => {
    if (!take(g, f, i, out)) return;
    const x = i % W;
    const y = (i - x) / W;
    const variant = RUIN_VARIANTS[Math.floor(tileHash01(sVariant, x, y) * RUIN_VARIANTS.length)];
    const orientation = ORIENTATIONS[Math.floor(tileHash01(sOrient, x, y) * 4)];
    out.entities.push(ruin({ id: entityId(f.id, `RuinColumnH${heights[k]}`, i), owner: f.id, x, y, z: g.heights[i], height: heights[k], variant, orientation }));
  });
  return out;
}
