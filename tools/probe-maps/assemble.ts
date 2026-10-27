// The build steps the generator and Real places use, for a probe test map given as heights and objects
// (places/place.ts `buildFileFromHeights`, under the game's rules, D298): the canonical water settle, the game's soil
// on it, the world with its settled singletons and outflows (gen/pack.ts `worldOf`), metadata and thumbnail. What it
// writes is what a generated map with the same ground and objects stores. Shared by the probe's map writers (tall.ts,
// sizes.ts).

import type { EntitySpec } from "../../src/core/format/entities";
import { FOOTPRINTS, footprintTiles, type Placement } from "../../src/core/format/footprints";
import { LAYERS } from "../../src/core/format/world";
import { buildFileFromHeights, type BuiltPlace } from "../../src/core/places/place";
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

export type Built = BuiltPlace;

export const placement = (e: EntitySpec): Placement => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped });

/** The tiles an object's blocks cover (its own tile for a template without a footprint). */
export function tilesOf(e: EntitySpec): [number, number][] {
  return FOOTPRINTS[e.template] ? footprintTiles(e.template, placement(e)) : [[e.x, e.y]];
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
  let max = 0;
  for (const h of d.heights) max = Math.max(max, h);
  if (max > TALL_MAX) throw new Error(`a tile reaches ${max}, above the game's ${TALL_MAX}`);
  return buildFileFromHeights(d.W, d.H, d.heights, d.entities, d.description);
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
