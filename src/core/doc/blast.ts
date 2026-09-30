// What an Unstable Core will do to the map (PLAN §20 D338 (1), D339, D342): questions the editor asks, answered
// as plain data, headless. `blastInfo` is what a selected core shows as information (what it will clear);
// `explosionAfter` is the map as it will be after the core goes off: the land and objects the game's rule clears
// (`sim/explosion.ts`) and the water settled again from there. A view only: the document is never touched.

import { canonicalSettle } from "../sim/prefill";
import { moisture } from "../sim/moisture";
import { soilContamination } from "../sim/contamination";
import { blastRadius, blastSummary, explode, type BlastObject } from "../sim/explosion";
import { moistureBarrier, waterModel } from "../sim/model";
import { toMapObject } from "../features/build";
import { placementOf, type EntitySpec } from "../format/entities";
import { plainOf, type JsonValue } from "../format/json";
import { ColumnTerrain, TERRAIN_LAYERS } from "../terrain/runs";
import type { MapSession } from "./session";

export interface BlastInfo {
  /** The sphere's radius: the core's plus the blueprint's inner radius (radius + 1). */
  radius: number;
  /** Tiles whose ground the blast changes, the objects it takes, the cores that go off (the chain), and the
   *  most any tile's surface drops. */
  tiles: number;
  objects: number;
  cores: number;
  heightLost: number;
}

const componentsOf = (e: EntitySpec): Record<string, unknown> => (e.raw ? (e.raw.Components as Record<string, unknown>) : { ...(e.before ?? {}), ...e.components });

/** The map's terrain as solid runs, and its objects as the blast sees them. */
export function blastMap(s: MapSession): { terrain: ColumnTerrain; objects: BlastObject[] } {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const terrain = ColumnTerrain.fromHeights(b.heights, W, H);
  for (const [i, col] of s.columns) {
    let m = 0;
    for (let z = 0; z < col.length && z < TERRAIN_LAYERS; z++) if (col[z]) m |= 1 << z;
    terrain.mask[i] = m >>> 0;
  }
  const objects: BlastObject[] = [];
  for (const e of b.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    let radius = NaN;
    if (e.template === "UnstableCore") {
      const uc = plainOf(componentsOf(e).UnstableCore as JsonValue) as { ExplosionRadius?: unknown } | undefined;
      radius = Number(uc?.ExplosionRadius);
    }
    objects.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, ...(Number.isFinite(radius) ? { radius } : {}) });
  }
  return { terrain, objects };
}

/** What the core with this id would clear on this map (the chain of cores it sets off included). */
export function blastInfo(s: MapSession, id: string): BlastInfo {
  const m = blastMap(s);
  return blastSummary(m.terrain, m.objects, id);
}

export interface ExplosionAfter {
  /** The map's surface heights after, and the columns that are not one plain run from the bottom (caves and
   *  overhangs the blast leaves, and those the map had). */
  heights: Uint8Array;
  columns: Map<number, Uint8Array>;
  /** The objects that stand after. */
  entities: EntitySpec[];
  /** The water settled again on the ground that is left, and the soil it wets or spoils. */
  depth: Float64Array;
  contamination: Float64Array;
  moisture: Float64Array;
  soilContamination: Float64Array;
  info: BlastInfo & { removedVoxels: number; fellVoxels: number };
  /** Tiles whose column is not plain: the water there is the heightfield model's, approximate under roofs. */
  roofed: number;
}

/** The map as it will be after the core goes off, its chain included. */
export function explosionAfter(s: MapSession, id: string): ExplosionAfter {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const m = blastMap(s);
  const after = explode(m.terrain, m.objects, [id]);
  const heights = after.terrain.heights();
  const columns = new Map<number, Uint8Array>();
  for (let i = 0; i < W * H; i++) {
    if (after.terrain.isPlain(i)) continue;
    const col = new Uint8Array(TERRAIN_LAYERS);
    for (let z = 0; z < TERRAIN_LAYERS; z++) if (after.terrain.solid(i, z)) col[z] = 1;
    columns.set(i, col);
  }
  const entities = b.entities.filter((e) => !after.removed.has(e.id) && !(e.raw && !placementOf(e.raw)));
  const objects = entities.map(toMapObject);
  const model = waterModel(W, H, heights, objects);
  const settle = canonicalSettle(model);
  const barrier = moistureBarrier(W, H, objects);
  const sum = blastSummary(m.terrain, m.objects, id);
  return {
    heights,
    columns,
    entities,
    depth: settle.depth,
    contamination: settle.contamination,
    moisture: moisture(heights, settle.depth, settle.contamination, W, H, barrier),
    soilContamination: soilContamination(heights, settle.depth, settle.contamination, W, H, barrier),
    info: { ...sum, radius: blastRadius(m.objects.find((o) => o.id === id)?.radius ?? 5), removedVoxels: after.removedVoxels, fellVoxels: after.fellVoxels },
    roofed: columns.size,
  };
}
