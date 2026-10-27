// What an Unstable Core does when it goes off (PLAN §20 D339), by the game's own rule, read from the code of
// Timberborn 1.1.2.4 (`Explosions/ExplosionOutcomeGatherer`, `UnstableCore`, `ExplosionService`, and the terrain
// physics of investigation/terrain3d/GAME_RULES.md §2):
//
// - The blast is a sphere of radius `ExplosionRadius + InnerRadius` (the blueprint's InnerRadius: 1, so radius + 1),
//   centred on the core's footprint centre at the height of its base (`BlockObjectCenter.GridCenterGrounded`: the
//   x and y of the footprint's middle, the z of its Coordinates). A voxel is in it when its centre (x + ½, y + ½,
//   z + ½) is within the radius. Inside the map only.
// - Every solid voxel in the sphere is removed, and every object that has a block in it is deleted (all but stock
//   piles of recovered goods, which a map has none of).
// - An object standing on removed ground (its base blocks are `Ground` or `GroundOrStackable` matter and the voxel
//   below them goes) is deleted too.
// - Terrain physics then runs: a voxel is kept only if it is reached from a supported voxel (one with solid ground
//   under it) through at most 3 sideways steps in its layer (`TerrainPhysicsValidator.MaxSupportDistance`); what
//   the removal left unsupported falls, and the objects on it go.
// - A core inside the blast, or beside a voxel it removes, goes off itself, as `UnstableCore.DeleteEntity` and
//   `OnTilesExplosion` do; the chain runs until no more join.
//
// The game removes the sphere one ring a tick (`floor(distance)`), so the land goes in shells; only the end result
// is worked out here, which is what the shells add up to. Pure: the terrain is the map's solid runs
// (`terrain/runs.ts` ColumnTerrain), the objects their footprints (`format/footprints.ts`).

import { CORE } from "../data/parity";
import { FOOTPRINTS, rotate, type Orientation } from "../format/footprints";
import { ColumnTerrain, TERRAIN_LAYERS } from "../terrain/runs";
import { unsupportedVoxels as unsupported } from "../terrain/support";

export interface BlastObject {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  flipped: boolean;
  /** An unstable core: its radius. */
  radius?: number;
}

/** A core's blast radius: its own plus the blueprint's inner radius. */
export function blastRadius(radius: number): number {
  return radius + CORE.innerRadius;
}

/** Every block of an object in world voxels (matter below included: a block with no occupation still holds its
 *  place, as `GetObjectsAt` counts it). */
function blocksOf(o: BlastObject): { x: number; y: number; z: number; ground: boolean; base: boolean }[] {
  const fp = FOOTPRINTS[o.template];
  if (!fp) return [{ x: o.x, y: o.y, z: o.z, ground: true, base: true }];
  const sx = fp.size[0];
  return fp.blocks.map(([lx0, ly, lz, below]) => {
    const lx = o.flipped && fp.flippable ? sx - 1 - lx0 : lx0;
    const [dx, dy] = rotate(o.orientation, lx, ly);
    return { x: o.x + dx, y: o.y + dy, z: o.z + lz, ground: below === "ground" || below === "groundOrStackable", base: lz === 0 };
  });
}

/** The centre of a core's blast in grid coordinates (a tile covers [x, x + 1)): its footprint's middle, at its
 *  base's height. */
export function blastCentre(o: BlastObject): [number, number, number] {
  const tiles = new Set<string>();
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of blocksOf(o)) {
    const k = `${b.x},${b.y}`;
    if (tiles.has(k)) continue;
    tiles.add(k);
    sx += b.x + 0.5;
    sy += b.y + 0.5;
    n++;
  }
  return [n ? sx / n : o.x + 0.5, n ? sy / n : o.y + 0.5, o.z];
}

/** The voxels of the sphere round a centre inside the map, as [x, y, z] triples' tile index and layer:
 *  `visit(tile, z)`. */
export function sphereVoxels(W: number, H: number, centre: readonly [number, number, number], radius: number, visit: (tile: number, z: number) => void): void {
  const [cx, cy, cz] = centre;
  const r2 = radius * radius;
  for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
      for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
        if (x < 0 || y < 0 || x >= W || y >= H || z < 0 || z >= TERRAIN_LAYERS) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dz = z + 0.5 - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) visit(y * W + x, z);
      }
}

export interface Explosion {
  /** The terrain after: solid runs per tile. */
  terrain: ColumnTerrain;
  /** The objects the blast and the falling ground took. */
  removed: Set<string>;
  /** The cores that went off, the first ones named and those the chain added, in the order they joined. */
  detonated: string[];
  /** Voxels the spheres removed, and the ones that fell because they lost their support. */
  removedVoxels: number;
  fellVoxels: number;
  /** The tiles whose column changed. */
  tiles: number[];
}

/** Set off the named cores (`first`: their ids) on a copy of the terrain and the objects, and follow the chain.
 *  `terrain` is left as it was. */
export function explode(terrain: ColumnTerrain, objects: readonly BlastObject[], first: readonly string[]): Explosion {
  const { W, H, N } = terrain;
  const t = new ColumnTerrain(W, H, terrain.mask.slice());
  const before = terrain.mask;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const removed = new Set<string>();
  const detonated: string[] = [];
  const queue = [...first];
  const affected = new Set<number>();
  let removedVoxels = 0;
  const pending = unsupported(t);
  // (voxels the map has unsupported already are not the blast's: the game drops them when it loads)
  const blocksById = new Map<string, ReturnType<typeof blocksOf>>();
  const blocks = (o: BlastObject) => {
    let b = blocksById.get(o.id);
    if (!b) blocksById.set(o.id, (b = blocksOf(o)));
    return b;
  };
  // which object has a block at each voxel, by tile·layers + z
  const at = new Map<number, string[]>();
  for (const o of objects)
    for (const b of blocks(o)) {
      if (b.x < 0 || b.y < 0 || b.x >= W || b.y >= H || b.z < 0 || b.z >= TERRAIN_LAYERS) continue;
      const k = (b.y * W + b.x) * TERRAIN_LAYERS + b.z;
      const list = at.get(k);
      if (list) list.push(o.id);
      else at.set(k, [o.id]);
    }
  const joined = new Set<string>();
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const core = byId.get(id);
    if (!core || joined.has(id)) continue;
    joined.add(id);
    detonated.push(id);
    const voxels = new Set<number>();
    sphereVoxels(W, H, blastCentre(core), blastRadius(core.radius ?? CORE.defaultRadius), (tile, z) => {
      voxels.add(tile * TERRAIN_LAYERS + z);
    });
    for (const k of voxels) {
      affected.add(k);
      const tile = Math.floor(k / TERRAIN_LAYERS);
      const z = k - tile * TERRAIN_LAYERS;
      if (t.solid(tile, z)) {
        t.mask[tile] = (t.mask[tile] & ~(1 << z)) >>> 0;
        removedVoxels++;
      }
      for (const oid of at.get(k) ?? []) {
        if (removed.has(oid)) continue;
        removed.add(oid);
        // a core the blast deletes goes off itself
        if (byId.get(oid)?.template === "UnstableCore") queue.push(oid);
      }
    }
    // a core beside a voxel that goes joins the chain
    for (const o of objects) {
      if (o.template !== "UnstableCore" || joined.has(o.id) || removed.has(o.id)) continue;
      const own = new Set(blocks(o).map((b) => `${b.x},${b.y},${b.z}`));
      let hit = false;
      for (const b of blocks(o)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = b.x + dx;
          const ny = b.y + dy;
          if (own.has(`${nx},${ny},${b.z}`) || nx < 0 || ny < 0 || nx >= W || ny >= H || b.z < 0 || b.z >= TERRAIN_LAYERS) continue;
          if (voxels.has((ny * W + nx) * TERRAIN_LAYERS + b.z)) hit = true;
        }
      }
      if (hit) queue.push(o.id);
    }
  }
  // what fell: newly unsupported terrain, and everything standing on ground that is gone
  let fellVoxels = 0;
  for (let round = 0; round < 64; round++) {
    const bad = unsupported(t);
    let any = false;
    for (let v = 0; v < TERRAIN_LAYERS * N; v++) {
      if (!bad[v] || pending[v]) continue;
      const z = Math.floor(v / N);
      const i = v - z * N;
      t.mask[i] = (t.mask[i] & ~(1 << z)) >>> 0;
      fellVoxels++;
      any = true;
    }
    if (!any) break;
  }
  for (const o of objects) {
    if (removed.has(o.id)) continue;
    for (const b of blocks(o)) {
      if (!b.base || !b.ground || b.z < 1 || b.x < 0 || b.y < 0 || b.x >= W || b.y >= H) continue;
      const i = b.y * W + b.x;
      // its ground: solid before, gone now
      if ((before[i] & (1 << (b.z - 1))) !== 0 && !t.solid(i, b.z - 1)) {
        removed.add(o.id);
        break;
      }
    }
  }
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) if (t.mask[i] !== before[i]) tiles.push(i);
  return { terrain: t, removed, detonated, removedVoxels, fellVoxels, tiles };
}

/** What a core would clear, in words for its options row: the sphere's size and, on this map, how many tiles of
 *  ground and objects it takes (`explode` on a copy; the counts include the chain). */
export function blastSummary(terrain: ColumnTerrain, objects: readonly BlastObject[], id: string): { radius: number; tiles: number; objects: number; cores: number; heightLost: number } {
  const core = objects.find((o) => o.id === id);
  const r = blastRadius(core?.radius ?? CORE.defaultRadius);
  const e = explode(terrain, objects, [id]);
  let lost = 0;
  for (const i of e.tiles) lost = Math.max(lost, terrain.surface(i) - e.terrain.surface(i));
  return { radius: r, tiles: e.tiles.length, objects: e.removed.size, cores: e.detonated.length, heightLost: lost };
}
