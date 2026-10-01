// The build steps the generator and Real places use, for a probe test map given as heights and objects: the
// canonical water settle, soil moisture and contamination on it, the settled singletons, metadata and thumbnail
// (src/core/sim, src/core/format, src/core/render). Shared by the probe's map writers (tall.ts, sizes.ts).

import type { EntitySpec } from "../../src/core/format/entities";
import { entityJson } from "../../src/core/format/entities";
import { FOOTPRINTS, worldBlocks, type Placement } from "../../src/core/format/footprints";
import { mapMetadata, type TimberFile } from "../../src/core/format/timber";
import { GAME_VERSION, LAYERS, settledSimulationSingletons, voxelsFromHeights } from "../../src/core/format/world";
import { toMapObject } from "../../src/core/features/build";
import { TIMESTAMP } from "../../src/core/gen/pack";
import { thumbnailJpeg } from "../../src/core/render/shade";
import { soilContamination } from "../../src/core/sim/contamination";
import { moistureBarrier, waterModel } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../../src/core/sim/prefill";
import type { WaterModel } from "../../src/core/sim/water";
import { validateMap } from "../../src/core/validate/checks";

/** The highest surface the game allows with its top layer empty. */
export const TALL_MAX = LAYERS - 1;

/** A map as heights and objects, before its water is settled. */
export interface Draft {
  W: number;
  H: number;
  heights: Uint8Array;
  entities: EntitySpec[];
  description: string;
  /** What a change removed (objects that no longer fit), by template. */
  removed: Record<string, number>;
}

export interface Built {
  file: TimberFile;
  heights: Uint8Array;
  model: WaterModel;
  settle: CanonicalWater;
}

export const placement = (e: EntitySpec): Placement => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped });

/** The tiles an object's blocks cover. */
export function tilesOf(e: EntitySpec): [number, number][] {
  const fp = FOOTPRINTS[e.template];
  if (!fp) return [[e.x, e.y]];
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const b of worldBlocks(fp, placement(e))) {
    const k = `${b.x},${b.y}`;
    if (!seen.has(k)) (seen.add(k), out.push([b.x, b.y]));
  }
  return out;
}

export function drop(d: Draft, keep: (e: EntitySpec) => boolean): void {
  d.entities = d.entities.filter((e) => {
    if (keep(e)) return true;
    d.removed[e.template] = (d.removed[e.template] ?? 0) + 1;
    return false;
  });
}

/** The generator's and Real places' build steps on a draft: the canonical settle, soil, the file. */
export function assemble(d: Draft): Built {
  const { W, H, heights } = d;
  let max = 0;
  for (const h of heights) max = Math.max(max, h);
  if (max > TALL_MAX) throw new Error(`a tile reaches ${max}, above the game's ${TALL_MAX}`);
  const objects = d.entities.map(toMapObject);
  const model = waterModel(W, H, heights, objects);
  const settle = canonicalSettle(model);
  const barrier = moistureBarrier(W, H, objects);
  const moist = moisture(heights, settle.depth, settle.contamination, W, H, barrier);
  const soil = soilContamination(heights, settle.depth, settle.contamination, W, H, barrier);
  const file: TimberFile = {
    metadata: mapMetadata(W, H, d.description),
    thumbnail: thumbnailJpeg(heights, W, H, settle.depth),
    versionTxt: GAME_VERSION + "\r\n",
    world: {
      gameVersion: GAME_VERSION,
      timestamp: TIMESTAMP,
      sizeX: W,
      sizeY: H,
      layers: LAYERS,
      voxels: voxelsFromHeights(heights, W, H),
      singletons: settledSimulationSingletons(W, H, { floor: heights, depth: settle.depth, contamination: settle.contamination, moisture: moist, soilContamination: soil, sat: settle.sat }),
      entities: d.entities.map(entityJson),
    },
    extraFiles: [],
  };
  return { file, heights, model, settle };
}

/** Assemble, and drop the objects the game would delete or the slopes that join nothing after a change of terrain
 *  (the validator's own lists), until the load checks allow them. */
export function assembleFitting(d: Draft): Built {
  for (let round = 0; round < 4; round++) {
    const b = assemble(d);
    const v = validateMap(b.file, { profile: "export", loadOnly: true });
    const bad = new Set<string>();
    const badTiles = new Set<string>();
    for (const c of v.report.checks) {
      if (c.ok) continue;
      if (c.id === "entities.placement") for (const id of c.where?.entities ?? []) bad.add(id);
      if (c.id === "slopes.connect") for (const [x, y] of c.where?.tiles ?? []) badTiles.add(`${x},${y}`);
    }
    if (!bad.size && !badTiles.size) return b;
    drop(d, (e) => !bad.has(e.id) && !(e.template === "Slope" && badTiles.has(`${e.x},${e.y}`)));
  }
  throw new Error("objects still do not fit after 4 rounds");
}
