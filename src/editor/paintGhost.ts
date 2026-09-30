// What a shelf brush will place, shown before the button comes up (PLAN §20 D235, D338): the tiles a drag covers
// (a disc round each point the pointer passes, sized like the terrain brushes), the plan `core/gen/paint.ts` makes
// of them on the page's own copy of the map (the same plan the operation makes on the worker's), and which of its
// trees and bushes stand on ground that will kill them (dry ground; for succulents, moist ground): the brush
// tints those amber with a quiet word, and still allows them.

import type { PaintAge, PaintKind } from "../core/doc/paintParams";
import { FOOTPRINTS, footprintTiles, type Orientation } from "../core/format/footprints";
import { planPaint, type PaintGround, type PlannedObject } from "../core/gen/paint";
import { ORIENTATION_NAMES, type EntityView } from "../render3d/model";
import type { ShelfItem, ShelfOptions } from "./shelfItems";

/** The tiles within `size` of the middle of tile (x, y): size 1 is the tile alone, 1.5 the tile and its four
 *  neighbours, 2 adds the corners, as the terrain brushes' sizes grow. */
export function discTiles(x: number, y: number, size: number, W: number, H: number): number[] {
  const out: number[] = [];
  const R = Math.ceil(size);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      if (Math.hypot(dx, dy) < size - 1e-9) out.push(ty * W + tx);
    }
  return out;
}

/** The ground a brush plans on, from the page's copy of the map: dry (no water deeper than 0.05), no object's
 *  footprint, no cave. */
export function pageGround(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number> | null, entities: EntityView, caves: ArrayLike<number>): PaintGround {
  const free = new Uint8Array(W * H).fill(1);
  if (depth) for (let i = 0; i < W * H; i++) if (depth[i] > 0.05) free[i] = 0;
  for (let k = 0; k < caves.length; k++) free[caves[k]] = 0;
  for (let k = 0; k < entities.count; k++) {
    const template = entities.templates[entities.template[k]];
    if (!FOOTPRINTS[template]) continue;
    for (const [tx, ty] of footprintTiles(template, { template, x: entities.x[k], y: entities.y[k], z: 0, orientation: ORIENTATION_NAMES[entities.orientation[k]] as Orientation, flipped: false })) {
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) free[ty * W + tx] = 0;
    }
  }
  return { W, H, heights, free };
}

const SAME: Record<PaintKind, readonly string[]> = { trees: [], bushes: ["BlueberryBush"], succulents: ["Succulent"], woods: ["Pine", "Birch", "Oak"], ruins: [], thorns: [] };

export interface Ghost {
  /** The tiles a stroke will place on. */
  tiles: number[];
  /** Of those, the tiles whose ground will kill what is planted there, still allowed. */
  amber: number[];
  plan: PlannedObject[];
}

/** What the stroke over `region` will place, on the page's copy of the map. `moisture`: the soil's moisture
 *  bytes (above 0: moist), or null. */
export function ghostFor(item: ShelfItem, o: ShelfOptions, g: PaintGround, region: readonly number[], entities: EntityView, moisture: ArrayLike<number> | null, seed: number): Ghost {
  const kind = item.brush!;
  const template = kind === "trees" ? item.template : kind === "bushes" ? "BlueberryBush" : kind === "succulents" ? "Succulent" : "";
  let existing = 0;
  const same = kind === "trees" ? [item.template] : SAME[kind];
  if (same.length) {
    const inRegion = new Set(region);
    for (let k = 0; k < entities.count; k++) if (same.includes(entities.templates[entities.template[k]]) && inRegion.has(entities.y[k] * g.W + entities.x[k])) existing++;
  }
  const plan = planPaint(g, { kind, template, region, density: o.density[kind], age: kind === "bushes" || kind === "ruins" || kind === "thorns" ? "grown" : o.age, seed, existing });
  const tiles = plan.map((p) => p.tile);
  const amber: number[] = [];
  if (moisture && (kind === "trees" || kind === "bushes" || kind === "woods" || kind === "succulents")) {
    for (const t of tiles) {
      const moist = moisture[t] > 0;
      // trees and bushes die on dry ground, succulents on moist ground
      if (kind === "succulents" ? moist : !moist) amber.push(t);
    }
  }
  return { tiles, amber, plan };
}

/** The quiet word for a stroke that lands some of its plants where they will die (D235 (4)). */
export function dyingWord(kind: PaintKind, n: number): string | null {
  if (!n) return null;
  return kind === "succulents" ? "wet ground: these will die" : "dry ground: these will die";
}
