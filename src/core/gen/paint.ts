// Painting objects by brush (PLAN §20 D235, completed by D338, D548): trees, bushes, succulents, a mix of woods,
// ruins and thorn patches, planned from the tiles a drag covers. Pure and deterministic: the page plans the
// ghost it shows before the button comes up with these functions on its own copy of the map, the same plan
// becomes the operations of one undo step, and the tests read the same plan against the generator's and the
// official maps' numbers.
//
// - Trees, bushes and succulents land on free tiles by a density (a sparse scatter to a dense grove, denser
//   toward the middle of the stroke, ragged at its edge). Painting over what is there fills the gaps up to
//   the density: what already stands counts toward it, and nothing is ever stacked. Trees and succulents
//   take an age: Grown (the default), or Mixed, the generator's own share of saplings.
// - Ruins land as trees do (D548): scattered over the free tiles by the density, filling the gaps, never stacked,
//   each column at the Height asked (Same) or from 1 up to it (Mixed), its model and turn mixed by its tile.
// - A thorn patch is shaped as the official maps' are (docs/FINDINGS.md "Thorns"): a blotchy blob of about 7 tiles
//   (3 to 13 in the middle half of the maps' patches), stretched about twice as long as wide, filling about
//   0.6 of its box, in any direction; a stroke makes as many as its area holds at its density.
// - One click (or the smallest size) is never a patch: it places exactly one object (the shelf's own placement).

import { ORIENTATIONS, type Orientation } from "../format/footprints";
import { bush, ruin, RUIN_VARIANTS, tree, type TreeSpecies } from "../format/entities";
import { plainOf, type JsonValue } from "../format/json";
import { hash32, tileHash01 } from "../math/hash";
import * as portable from "../math/portable";
import { stream, type Rng } from "../math/rng";
import { growBlob } from "./blobs";
import { FOREST } from "./calibrated";

import { RUIN_HEIGHT, type PaintAge, type PaintKind, type RuinHeights } from "../doc/paintParams";
export type { PaintKind };

/** Tree age: Grown (the default) or Mixed, a natural blend of grown trees and saplings. */
export type Age = PaintAge;

/** The mix of Mixed woods: the generator's own (`speciesMix` 47 / 27 / 20 of pine, birch, oak; the succulents
 *  are their own item). */
export const WOODS_MIX: readonly (readonly [TreeSpecies, number])[] = [["Pine", 47], ["Birch", 27], ["Oak", 20]];

/** How densely each brush lands when the player has not set it: the shelf's earlier fixed shares (a grove
 *  at 0.8, a berry patch at 0.55). */
export const DEFAULT_DENSITY: Record<PaintKind, number> = { trees: 0.8, bushes: 0.55, succulents: 0.5, woods: 0.8, ruins: 0.8, thorns: 0.6 };

/** The share of saplings among Mixed trees, and their growth: the generator's (`FOREST.youngShare`, growth
 *  0.2 to 0.95 to a thousandth). */
export const YOUNG_SHARE = FOREST.youngShare;

export interface PaintGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** 1 where an object may stand: on the map, dry, not a cave, nothing there. */
  free: Uint8Array;
}

/** One object a stroke places. `components` are the game's, as plain JSON (`placeEntity` writes them). */
export interface PlannedObject {
  tile: number;
  template: string;
  orientation: Orientation;
  flipped?: boolean;
  components?: Record<string, unknown>;
}

const stub = (x: number, y: number) => ({ id: "", owner: "", x, y, z: 0 });

/** The components of a tree the game's editor would place there: grown, or a sapling at `growth`. */
export function treeComponents(species: TreeSpecies, growth: number): Record<string, unknown> {
  return plainOf(tree({ ...stub(0, 0), species, ...(growth < 1 ? { growth } : {}) }).components as unknown as JsonValue) as Record<string, unknown>;
}

/** A blueberry bush's components: ripe, or regrowing at `regrowth`. */
export function bushComponents(ripe: boolean, regrowth: number): Record<string, unknown> {
  return plainOf(bush({ ...stub(0, 0), ripe, regrowth }).components as unknown as JsonValue) as Record<string, unknown>;
}

/** A ruin column's components. */
export function ruinComponents(height: number, variant: string): Record<string, unknown> {
  return plainOf(ruin({ ...stub(0, 0), height, variant, orientation: "Cw0" }).components as unknown as JsonValue) as Record<string, unknown>;
}

/** The species a tile takes: a single species, or the mix. */
export function speciesAt(kind: PaintKind, template: string, seed: number, x: number, y: number): TreeSpecies {
  if (kind !== "woods") return template as TreeSpecies;
  const total = WOODS_MIX.reduce((a, [, w]) => a + w, 0);
  let k = tileHash01(hash32(seed, "species"), x, y) * total;
  for (const [s, w] of WOODS_MIX) {
    k -= w;
    if (k < 0) return s;
  }
  return "Pine";
}

/** A tree's growth on a tile: 1 (grown), or a sapling's for the share of Mixed that are young. */
export function growthAt(age: Age, seed: number, x: number, y: number): number {
  if (age !== "mixed" || tileHash01(hash32(seed, "young"), x, y) >= YOUNG_SHARE) return 1;
  return Math.round((0.2 + 0.75 * tileHash01(hash32(seed, "growth"), x, y)) * 1000) / 1000;
}

export interface ScatterOptions {
  /** The tiles the stroke covers (the union of its discs). */
  region: readonly number[];
  /** 0.05–1: the share of the plantable tiles that hold a plant. */
  density: number;
  seed: number;
  /** Plants of this kind standing in the region already (they count toward the density). */
  existing: number;
}

/** The tiles a scatter stroke plants (trees, bushes, succulents): `density` of the plantable tiles (the free
 *  ones and those the same kind already holds), less what stands there, chosen by a hash of the tile and the
 *  seed with a lean toward the middle of the stroke: dense inside, ragged at the edge. */
export function scatterTiles(g: PaintGround, o: ScatterOptions): number[] {
  const { W, H } = g;
  const inRegion = new Set(o.region);
  // how far each tile of the stroke is from its edge, in steps (a tile beside the outside is 1)
  const depth = new Map<number, number>();
  let frontier: number[] = [];
  for (const i of inRegion) {
    if (i < 0 || i >= W * H) continue;
    const x = i % W;
    const y = (i - x) / W;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1 && !edge; dx++) if ((dx || dy) && !inRegion.has((y + dy) * W + x + dx)) edge = true;
    if (edge) {
      depth.set(i, 1);
      frontier.push(i);
    }
  }
  for (let d = 2; frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = (y + dy) * W + x + dx;
        if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H || !inRegion.has(j) || depth.has(j)) continue;
        depth.set(j, d);
        next.push(j);
      }
    }
    frontier = next;
  }
  // the lean toward the middle: as far in as half the stroke's own radius, so a big stroke has a solid heart
  const reach = Math.max(2, 0.5 * portable.sqrt(inRegion.size / Math.PI));
  const s = hash32(o.seed, "scatter");
  const cands: { i: number; key: number }[] = [];
  for (const i of inRegion) {
    if (i < 0 || i >= W * H || !g.free[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    cands.push({ i, key: tileHash01(s, x, y) + 0.6 * Math.max(0, 1 - (depth.get(i) ?? 1) / reach) });
  }
  const plantable = cands.length + o.existing;
  const want = Math.round(Math.max(0, Math.min(1, o.density)) * plantable) - o.existing;
  if (want <= 0) return [];
  cands.sort((a, b) => a.key - b.key || a.i - b.i);
  return cands.slice(0, Math.min(want, cands.length)).map((c) => c.i);
}

/** The plan of a scatter stroke: each tile's species and age. `template` is the item's own (a tree, a
 *  bush, the succulent), or "Woods" for the mix. */
export function planScatter(g: PaintGround, kind: "trees" | "bushes" | "succulents" | "woods", template: string, age: Age, o: ScatterOptions): PlannedObject[] {
  const { W } = g;
  return scatterTiles(g, o).map((i) => {
    const x = i % W;
    const y = (i - x) / W;
    if (kind === "bushes") {
      const ripe = tileHash01(hash32(o.seed, "ripe"), x, y) < 0.5;
      const regrowth = Math.round((0.1 + 0.8 * tileHash01(hash32(o.seed, "regrow"), x, y)) * 1000) / 1000;
      return { tile: i, template: "BlueberryBush", orientation: "Cw0" as Orientation, components: bushComponents(ripe, regrowth) };
    }
    const species = speciesAt(kind, template, o.seed, x, y);
    return { tile: i, template: species, orientation: "Cw0" as Orientation, components: treeComponents(species, growthAt(age, o.seed, x, y)) };
  });
}

// ---------------------------------------------------------------------------------------- ruins

/** The plan of a ruin stroke (D548): scattered as trees are (`scatterTiles`: `density` of the free tiles, the ruins
 *  standing there counting toward it, never stacked), each column `height` levels tall (Same) or from 1 up to it by its
 *  tile (Mixed), its model and turn mixed by its tile. */
export function planRuins(g: PaintGround, o: ScatterOptions, height: number, heights: RuinHeights): PlannedObject[] {
  const { W } = g;
  const tall = hash32(o.seed, "ruin", "height");
  const look = hash32(o.seed, "ruin", "look");
  return scatterTiles(g, o).map((i) => {
    const x = i % W;
    const y = (i - x) / W;
    const h = heights === "mixed" ? 1 + Math.min(height - 1, Math.floor(tileHash01(tall, x, y) * height)) : height;
    const variant = RUIN_VARIANTS[Math.floor(tileHash01(look, x, y) * RUIN_VARIANTS.length) % RUIN_VARIANTS.length];
    const orientation = ORIENTATIONS[Math.floor(tileHash01(look, y, x) * ORIENTATIONS.length) % ORIENTATIONS.length];
    return { tile: i, template: `RuinColumnH${h}`, orientation, components: ruinComponents(h, variant) };
  });
}

// ---------------------------------------------------------------------------------------- thorns

/** What the official maps' thorn patches measure (docs/FINDINGS.md "Thorns", 223 patches of thorns within a tile
 *  of each other on eight maps): tiles a patch, its stretch and how much of its box it fills. */
export const THORN_PATCH = { median: 8, sigma: 0.5, min: 3, max: 24, fill: 0.45, aspect: [1.5, 3.2] as const, compactness: 0.8 as const };

const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.7071067811865476, 0.7071067811865476],
  [0, 1],
  [-0.7071067811865476, 0.7071067811865476],
];

/** How much of a stroke's ground its thorns cover at a density: 0.1 sparse to 0.5 dense. */
export function thornCover(densityShare: number): number {
  return 0.1 + 0.4 * Math.max(0, Math.min(1, densityShare));
}

/** One thorn patch grown from `start` over `allowed` (an ellipse of the patch's box area over its fill, of a
 *  random stretch and direction, as the ruin fields' ground is), `n` tiles. */
export function growThornPatch(rng: Rng, g: PaintGround, allowed: Uint8Array, start: number, n: number): number[] {
  const { W, H } = g;
  const sx = start % W;
  const sy = (start - sx) / W;
  const aspect = THORN_PATCH.aspect[0] + rng.float() * (THORN_PATCH.aspect[1] - THORN_PATCH.aspect[0]);
  const [ax, ay] = AXES[rng.int(0, 4)];
  const area = n / THORN_PATCH.fill / 0.85;
  const major = portable.sqrt((area * aspect) / Math.PI);
  const minor = portable.sqrt(area / (aspect * Math.PI));
  const inside = new Uint8Array(W * H);
  const r = Math.ceil(major) + 1;
  for (let y = Math.max(0, sy - r); y <= Math.min(H - 1, sy + r); y++)
    for (let x = Math.max(0, sx - r); x <= Math.min(W - 1, sx + r); x++) {
      const i = y * W + x;
      if (!allowed[i]) continue;
      const dx = x - sx;
      const dy = y - sy;
      const u = (dx * ax + dy * ay) / major;
      const v = (-dx * ay + dy * ax) / minor;
      if (u * u + v * v <= 1) inside[i] = 1;
    }
  inside[start] = 1;
  return growBlob(rng, inside, W, H, start, n, THORN_PATCH.compactness);
}

/** Thorn patches for a stroke: patches of the official size and shape wherever the stroke has room, a tile
 *  apart, until they cover its ground by `thornCover`. Each thorn is turned and flipped at random, as the
 *  game's editor does. */
export function planThorns(g: PaintGround, region: readonly number[], densityShare: number, seed: number): PlannedObject[] {
  const { W, H } = g;
  const rng = stream(seed, "paint", "thorns");
  const allowed = new Uint8Array(W * H);
  let free = 0;
  for (const i of region) if (i >= 0 && i < W * H && g.free[i] && !allowed[i]) (allowed[i] = 1, free++);
  let left = Math.round(free * thornCover(densityShare));
  const sTurn = hash32(seed, "turn");
  const out: PlannedObject[] = [];
  for (let tries = 0; tries < 200 && left >= THORN_PATCH.min; tries++) {
    const cands: number[] = [];
    for (const i of region) if (allowed[i]) cands.push(i);
    if (!cands.length) break;
    const start = cands[rng.int(0, cands.length)];
    let n = Math.floor(rng.logNormal(THORN_PATCH.median, THORN_PATCH.sigma));
    n = Math.max(THORN_PATCH.min, Math.min(THORN_PATCH.max, n, left));
    const tiles = growThornPatch(rng, g, allowed, start, n);
    if (tiles.length < Math.min(THORN_PATCH.min, left)) {
      allowed[start] = 0;
      continue;
    }
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      out.push({ tile: i, template: "Thorns", orientation: ORIENTATIONS[Math.floor(tileHash01(sTurn, x, y) * 4)], flipped: tileHash01(sTurn, y, x) < 0.5 });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) allowed[(y + dy) * W + x + dx] = 0;
    }
    left -= tiles.length;
  }
  return out;
}

// ------------------------------------------------------------------------------------------ plan

export interface PaintRequest {
  kind: PaintKind;
  /** The item's own template for a scatter: Pine, Birch, Oak, BlueberryBush or Succulent ("" for Mixed woods). */
  template: string;
  region: readonly number[];
  density: number;
  age: Age;
  seed: number;
  /** Same-kind plants (or ruins) standing in the region already (scatter). */
  existing: number;
  /** Ruins: the columns' height and whether it is every column's or the tallest's (D548). */
  height?: number;
  heights?: RuinHeights;
}

/** What a stroke will place. */
export function planPaint(g: PaintGround, r: PaintRequest): PlannedObject[] {
  if (r.kind === "ruins") return planRuins(g, { region: r.region, density: r.density, seed: r.seed, existing: r.existing }, r.height ?? RUIN_HEIGHT.default, r.heights ?? "same");
  if (r.kind === "thorns") return planThorns(g, r.region, r.density, r.seed);
  return planScatter(g, r.kind, r.template, r.age, { region: r.region, density: r.density, seed: r.seed, existing: r.existing });
}
