// What stands in an area (PLAN §20 D345, B5; D342): the objects on some tiles, and the ones the map's
// resource features hold under water there, which stand again when the water drains (a forest
// planted round a lake grows back on its bed). A plain question of the core, used by Delete's menu
// and by Delete itself, so that "Everything" means everything, submerged objects included.

import { entityTiles } from "../features/edits";
import { isResource, rasterizeResource, resourceOrder, type ResourceGround } from "../features/raster/resources";
import { placementOf } from "../format/entities";
import { runsToTiles } from "../math/grid";
import type { MapSession } from "./session";

/** An object a resource feature would plant on a tile now under water. */
export interface SubmergedObject {
  /** The resource feature that holds it (its area is what keeps it from growing back). */
  feature: string;
  template: string;
  /** Its tile (y · W + x). */
  tile: number;
}

/** The resource features' objects that stand on wet tiles among `tiles` if the water there were gone:
 *  what each feature places on them in a dry world, minus what it places now. */
export function submergedIn(s: MapSession, tiles: Iterable<number>): SubmergedObject[] {
  const b = s.built;
  const { x: W, y: H } = s.size;
  const cache = b.cache;
  if (!cache.occupiedBeforeResources) return [];
  const inside = new Set<number>();
  for (const i of tiles) if (i >= 0 && i < W * H) inside.add(i);
  const want = new Set<number>();
  for (const i of inside) if (b.water[i] > 0) want.add(i);
  if (!want.size) return [];
  // the water with those tiles dry; everything else as the build had it
  const water = Float64Array.from(b.water);
  for (const i of want) water[i] = 0;
  const occupied = cache.occupiedBeforeResources.slice();
  const out: SubmergedObject[] = [];
  for (const f of resourceOrder(s.features)) {
    if (!isResource(f)) continue;
    // (a ruin field's heights are assigned over its whole area, so it can't give tiles up: it counts,
    // and goes, only when the selection holds all of it, see `ruinFieldsWithin`)
    if (f.kind === "ruinField" && !runsToTiles(f.params.area, W).every((i) => inside.has(i))) continue;
    const now = cache.resources.get(f.id)?.placed;
    const ground: ResourceGround = { W, seed: b.seed, heights: b.heights, water, moisture: b.moisture, soilContamination: b.soilContamination, occupied: occupied.slice(), channel: b.channel, locked: null };
    const dry = rasterizeResource(f, ground);
    const here = new Set(now?.entities.map((e) => e.id) ?? []);
    for (const e of dry.entities) {
      const i = e.y * W + e.x;
      if (want.has(i) && !here.has(e.id)) out.push({ feature: f.id, template: e.template, tile: i });
    }
    // (the next feature takes its tiles after this one's, as the build has them)
    if (now) for (const i of now.tiles) occupied[i] = 1;
  }
  return out;
}

/** What stands in `tiles`: each object once, counted by its template, and the resource features'
 *  submerged objects there (also counted in `counts`, so that "everything" is the sum). */
export function objectsIn(s: MapSession, tiles: Iterable<number>): { counts: Record<string, number>; submerged: Record<string, number> } {
  const { x: W, y: H } = s.size;
  const want = new Set<number>();
  for (const i of tiles) if (i >= 0 && i < W * H) want.add(i);
  const counts: Record<string, number> = {};
  const submerged: Record<string, number> = {};
  if (!want.size) return { counts, submerged };
  for (const e of s.built.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    if (!entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && want.has(ty * W + tx))) continue;
    counts[e.template] = (counts[e.template] ?? 0) + 1;
  }
  for (const o of submergedIn(s, want)) {
    counts[o.template] = (counts[o.template] ?? 0) + 1;
    submerged[o.template] = (submerged[o.template] ?? 0) + 1;
  }
  return { counts, submerged };
}

/** The ruin fields that lie wholly inside `tiles`: Delete takes such a field as a whole, so that what the
 *  water hides of it does not stand again as the water drains. */
export function ruinFieldsWithin(s: MapSession, tiles: Iterable<number>): string[] {
  const { x: W, y: H } = s.size;
  const inside = new Set<number>();
  for (const i of tiles) if (i >= 0 && i < W * H) inside.add(i);
  const out: string[] = [];
  for (const f of s.features) if (f.kind === "ruinField" && runsToTiles(f.params.area, W).every((i) => inside.has(i))) out.push(f.id);
  return out;
}
