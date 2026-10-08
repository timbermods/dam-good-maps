// Placing things on the map (EDITOR_PLAN §4): an object, a source or the start from the shelf, and
// moving one. Each plans on the document's current map and returns the operations that apply it, or
// why it does not fit: an invalid placement is shown and refused, never placed (the game would delete
// it on load).

import { entityTiles } from "../features/edits";
import { isPickable } from "../features/objects";
import { floorBesideWater, platformLevel } from "../features/footprintLevel";
import { FOOTPRINTS, worldBlocks, type Orientation } from "../format/footprints";
import { FLUIDS } from "../data/parity";
import { placeComponents } from "./objectOps";
import { distanceFrom, runsToTiles, tilesToRuns } from "../math/grid";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Resource features make room for what is placed by hand (they are placed after it, build step
 *  11): their entities do not count as taking a tile. */
export function resourceOwners(s: MapSession): Set<string> {
  return new Set(s.features.filter((f) => f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField").map((f) => f.id));
}

/** The settled water depth per tile (an import's file water where the map shows it). */
export function waterDepth(s: MapSession): ArrayLike<number> {
  if (!s.showsStoredWater) return s.built.water;
  const { x: W, y: H } = s.size;
  const out = new Float64Array(W * H);
  const w = s.storedWater();
  for (let k = 0; k < w.tile.length; k++) if (w.depth[k] > out[w.tile[k]]) out[w.tile[k]] = w.depth[k];
  return out;
}

// ------------------------------------------------------------------------------------- entities

/** Why the game would not keep an object placed at (x, y) on the current map (its loader's rules,
 *  validate/checks.ts `entities.placement`), or null when it would; one plain reason (D290).
 *  `ignore` is the entity being moved. Resources make room (they are placed after it). `level`:
 *  a placement by the shelf, which levels its own footprint (D290 for the badwater source, D328 for
 *  every object): uneven ground doesn't stop it, so only the map's edge, a cave, another object's
 *  tiles and the start do (a badwater source also takes the hand-placed objects on its nine tiles,
 *  `levelFootprint`). */
export function entityProblem(s: MapSession, p: { template: string; x: number; y: number; orientation: Orientation; flipped?: boolean }, ignore: string | null = null, opts: { level?: boolean } = {}): string | null {
  const fp = FOOTPRINTS[p.template];
  if (!fp) return `${p.template} can't be placed`;
  const { x: W, y: H } = s.size;
  const b = s.built;
  if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return "it is off the map";
  const z = b.heights[p.y * W + p.x];
  const skip = resourceOwners(s);
  // a resource's own entity moves after the resources are placed: they do not make room for it
  const moved = ignore ? b.entities.find((e) => e.id === ignore) : undefined;
  if (moved && skip.has(moved.owner)) skip.clear();
  const taken = new Map<number, string>();
  for (const e of b.entities) {
    if (e.id === ignore || skip.has(e.owner)) continue;
    for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) taken.set(ty * W + tx, e.template);
  }
  const level = !!opts.level;
  const pool = level && p.template === "BadwaterSource";
  // the drill stands on an aquifer (its `UnderstructureConstraintSpec`), at the aquifer's own coordinates
  const understructure = FLUIDS[p.template]?.on;
  if (understructure && !b.entities.some((e) => e.id !== ignore && understructure.includes(e.template) && e.x === p.x && e.y === p.y)) return "a drill needs an aquifer under it";
  for (const blk of worldBlocks(fp, { template: p.template, x: p.x, y: p.y, z, orientation: p.orientation, flipped: !!p.flipped })) {
    if (blk.x < 0 || blk.y < 0 || blk.x >= W || blk.y >= H || blk.z >= 33) return "it does not fit on the map";
    const i = blk.y * W + blk.x;
    if (!s.plainAt(i)) return "there is a cave or overhang there";
    const top = b.heights[i];
    const other = taken.get(i);
    if (pool) {
      if (other === "StartingLocation") return "the district center stands there";
      continue;
    }
    // (an aquifer under a drill is what the drill needs, not what is in its way)
    if (understructure && other && understructure.includes(other)) continue;
    if (!level) {
      if (blk.z < top) return "the ground under it is not level";
      if ((blk.below === "ground" || blk.below === "groundOrStackable") && blk.z > top) return "the ground under it is not level";
    }
    if (other) {
      if (other === "StartingLocation") return "the district center stands there";
      const name = other === "UndergroundRuins" ? "mine site" : other.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name} stands there`;
    }
  }
  return level ? levelProblem(s, p) : null;
}

/** Why a shelf object can't be levelled where it is: its ground isn't level and part of it stands
 *  in water, so levelling it would fill or drain water (D345, B6: placing an object never visibly
 *  spills water). Null when it can stand, or for a source (which is cut-only, D290). `extra`: further
 *  tiles that level with it (the start's door). */
export function levelProblem(s: MapSession, p: { template?: string; x: number; y: number; orientation: Orientation; flipped?: boolean }, extra: readonly number[] = []): string | null {
  const template = p.template ?? "BadwaterSource";
  const fp = FOOTPRINTS[template];
  if (!fp || FLUIDS[template]?.tiles) return null;
  const { x: W, y: H } = s.size;
  const tiles = new Set<number>(extra.filter((i) => i >= 0 && i < W * H));
  for (const blk of worldBlocks(fp, { template, x: p.x, y: p.y, z: 0, orientation: p.orientation, flipped: !!p.flipped })) if (blk.x >= 0 && blk.y >= 0 && blk.x < W && blk.y < H) tiles.add(blk.y * W + blk.x);
  const list = [...tiles];
  if (!list.length) return null;
  return platformLevel(s.built.heights, waterDepth(s), W, H, list) === null ? "the water is in the way: the ground here is uneven, and levelling it would spill the water" : null;
}

/** Planned operations that make no feature (an entity placed by hand). */
export type PlannedOps = { ok: true; ops: EditOp[]; report: string[]; label: string; tiles: number[] } | { ok: false; errors: string[] };

export interface EntityRequest {
  template: string;
  x: number;
  y: number;
  orientation: Orientation;
  flipped?: boolean;
  /** Components that differ from the template's defaults (an unstable core's radius). */
  components?: Record<string, unknown>;
}

/** Plan an entity placed from the shelf: the loader's rules first; where its ground isn't level it
 *  levels its own footprint (D290 cuts, D328 fills where dry), in the same step. */
export function planEntity(s: MapSession, req: EntityRequest, id: string): PlannedOps {
  if (!req.components) req = { ...req, components: placeComponents(req.template) };
  if (!FOOTPRINTS[req.template]) return fail(`${req.template} can't be placed`);
  const why = entityProblem(s, req, null, { level: true });
  if (why) return fail(why);
  const { x: W } = s.size;
  const tiles = worldBlocks(FOOTPRINTS[req.template], { ...req, z: 0, flipped: !!req.flipped }).map((b) => b.y * W + b.x);
  const op: EditOp = { op: "placeEntity", params: { id, template: req.template, x: req.x, y: req.y, orientation: req.orientation, ...(req.flipped ? { flipped: true } : {}), ...(req.components ? { components: req.components } : {}) } };
  const pool = levelFootprint(s, req);
  const name = req.template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return { ok: true, ops: [...pool, op], report: [`a ${name} at (${req.x}, ${req.y})`], label: `Place ${name}`, tiles: [...new Set(tiles)] };
}

/** Plan an object moved by (dx, dy) tiles (D345, B7): the same rules as placing it there, its ground
 *  levelled as a placement's is (D328), in one step. `id` is the object's entity id. */
export function planMoveEntity(s: MapSession, id: string, dx: number, dy: number): PlannedOps {
  const e = s.built.entities.find((g) => g.id === id);
  if (!e) return fail("that object is gone");
  if (!isPickable(e.template)) return fail(`a ${e.template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} can't be moved`);
  const req = { template: e.template, x: e.x + dx, y: e.y + dy, orientation: e.orientation, flipped: e.flipped };
  const why = entityProblem(s, req, id, { level: true });
  if (why) return fail(why);
  const { x: W } = s.size;
  const tiles = worldBlocks(FOOTPRINTS[e.template], { ...req, z: 0, flipped: !!req.flipped }).map((b) => b.y * W + b.x);
  const level = levelFootprint(s, req, new Set([id]));
  const name = e.template === "UndergroundRuins" ? "mine site" : e.template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const op: EditOp = { op: "moveEntity", params: { id, x: req.x, y: req.y } };
  return { ok: true, ops: [...level, op], report: [`a ${name} moved to (${req.x}, ${req.y})`], label: `Move ${name}`, tiles: [...new Set(tiles)] };
}

/** The most distance a placement's natural edge reaches past its footprint, in tiles. */
const EDGE_REACH = 6;

/** An object's own levelling (D290 for the badwater source, D328 for every object the shelf places).
 *  A water or badwater source is cut-only (D290): the ground under its footprint is cut down to the
 *  lowest of its tiles, so no water is dammed. Every other object (and the start) levels to the
 *  height most of its footprint already stands at (of equal shares, the one that moves the ground
 *  least): what is above is cut, what is below is filled, except that a wet tile is never filled
 *  (the settled water is the map's own): where the level would fill one, the footprint is cut down
 *  to its lowest tile instead. The edge then meets the land around it in short natural slopes (one
 *  level a tile, out to `EDGE_REACH`), never a step or a wall, and leaves wet tiles, other objects'
 *  tiles and caves as they are. All in the placement's own step, before it.
 *
 *  A badwater source is 3 × 3 and the game keeps it only on level ground: it also takes what stands
 *  on its nine tiles (hand-placed objects; a generated tree makes room by itself; never the start,
 *  which `entityProblem` refuses). Other objects keep the objects on their tiles: `entityProblem`
 *  refuses those. `extra`: further tiles to level with it (the start's door). The operations that
 *  make it, none on level ground. `ignore`: entities the same step removes already (a clean source
 *  switched to bad). */
export function levelFootprint(s: MapSession, p: { template?: string; x: number; y: number; orientation: Orientation; flipped?: boolean }, ignore: ReadonlySet<string> = new Set(), extra: readonly number[] = []): EditOp[] {
  const template = p.template ?? "BadwaterSource";
  const fp = FOOTPRINTS[template];
  if (!fp) return [];
  const { x: W, y: H } = s.size;
  const b = s.built;
  const tiles = new Set<number>();
  for (const blk of worldBlocks(fp, { template, x: p.x, y: p.y, z: 0, orientation: p.orientation, flipped: !!p.flipped }))
    if (blk.x >= 0 && blk.y >= 0 && blk.x < W && blk.y < H) tiles.add(blk.y * W + blk.x);
  for (const i of extra) if (i >= 0 && i < W * H) tiles.add(i);
  const list = [...tiles];
  if (!list.length) return [];
  let low = Infinity;
  for (const i of list) low = Math.min(low, b.heights[i]);
  const ops: EditOp[] = [];
  // (the water objects are cut-only, so no water is dammed: the sources, the seeps, an aquifer, the drain)
  const isSource = template === "BadwaterSource" || template === "WaterSource" || !!FLUIDS[template]?.tiles;
  if (template === "BadwaterSource") {
    const skip = resourceOwners(s);
    const gone = new Set<string>();
    for (const e of b.entities) {
      if (ignore.has(e.id) || skip.has(e.owner) || e.template === "StartingLocation") continue;
      if (entityTiles(e).some(([tx, ty]) => tiles.has(ty * W + tx))) gone.add(e.id);
    }
    if (gone.size) ops.push({ op: "deleteEntities", params: { entities: [...gone] } });
  }
  if (isSource) {
    if (list.some((i) => b.heights[i] !== low)) ops.push({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(list, W), level: low } });
    return ops;
  }
  const h = b.heights;
  if (list.every((i) => h[i] === h[list[0]])) return ops;
  const water = waterDepth(s);
  // the level most of the footprint stands at, raised where a tile can't be cut beside water; a
  // footprint standing in water is refused before this (`levelProblem`), so the fallback is only
  // for callers that skip it
  let level = platformLevel(h, water, W, H, list) ?? low;
  const target = new Map<number, number>();
  for (const i of list) target.set(i, level);
  // the natural edge: out from the footprint the land keeps within a level a tile of the platform
  // (a bank rising, an embankment falling), only where it differs, dry, and free of other objects
  const skip = resourceOwners(s);
  const held = new Set<number>();
  for (const e of b.entities) {
    if (ignore.has(e.id) || skip.has(e.owner)) continue;
    for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) held.add(ty * W + tx);
  }
  // the edge fades: the ground moves by no more than the footprint's own biggest move, less a level
  // a tile out, so a steep hillside is left alone rather than cut back
  let biggest = 0;
  for (const i of list) biggest = Math.max(biggest, Math.abs(h[i] - level));
  const dist = new Set<number>(list);
  let ring = list;
  for (let d = 1; d <= EDGE_REACH && ring.length; d++) {
    const next: number[] = [];
    for (const i of ring) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist.has(j)) continue;
        dist.add(j);
        next.push(j);
      }
    }
    for (const j of next) {
      if (!s.plainAt(j) || held.has(j) || water[j] > 0) continue;
      const hv = h[j];
      const want = hv > level ? Math.min(hv, level + d) : Math.max(hv, level - d);
      const room = biggest - d + 1;
      let to = want < hv ? Math.max(want, hv - room) : Math.min(want, hv + room);
      // (never cut below the water beside it: that would let the water flow in)
      if (to < hv) to = Math.min(hv, Math.max(to, floorBesideWater(h, water, W, H, j)));
      if (room > 0 && to !== hv && to >= 0 && to <= 32) target.set(j, to);
    }
    ring = next;
  }
  // (exact: the integrity pass would round a lone tile off, cutting it below the water beside it)
  const byLevel = new Map<number, number[]>();
  for (const [i, t] of target) if (h[i] !== t) (byLevel.get(t) ?? byLevel.set(t, []).get(t)!).push(i);
  for (const [lv, ts] of [...byLevel].sort((a, c) => a[0] - c[0])) ops.push({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(ts, W), level: lv, exact: true } });
  return ops;
}

export { distanceFrom, runsToTiles };

/** A badwater source placed or moved in a group of edits (a clean source switched to bad: the old
 *  one removed, the new one placed; a source dragged) cuts its own spring pool where its ground
 *  isn't level (D290), in the same step, before it. The worker's group of edits (`applyAll`) adds it;
 *  a single edit, the shelf, Select and a stroke do not. */
export function withSpringPools(s: MapSession, ops: EditOp[]): EditOp[] {
  const bad = (op: EditOp) =>
    op.op === "placeEntity" ? op.params.template === "BadwaterSource" : op.op === "moveEntity" ? s.built.entities.some((e) => e.id === op.params.id && e.template === "BadwaterSource") : false;
  if (!ops.some(bad)) return ops;
  const out: EditOp[] = [];
  const removed = new Set<string>();
  for (const op of ops) {
    if (op.op === "deleteEntities") for (const id of op.params.entities) removed.add(id);
    if (op.op === "placeEntity" && bad(op)) out.push(...levelFootprint(s, { ...op.params, template: "BadwaterSource" }, removed));
    if (op.op === "moveEntity" && bad(op)) {
      const e = s.built.entities.find((g) => g.id === op.params.id)!;
      out.push(...levelFootprint(s, { template: "BadwaterSource", x: op.params.x, y: op.params.y, orientation: op.params.orientation ?? e.orientation }, new Set([...removed, e.id])));
    }
    out.push(op);
  }
  return out;
}

// --------------------------------------------------------------------------------- planting

/** Trees or bushes painted by a drag from the shelf (D184): one `template` on each of `tiles` where
 *  it can stand (on the map's ground, dry, no object there), as one step; `newId` names each. The
 *  operations, their label and the tiles planted, or why nothing can grow there. */
export function planPlant(s: MapSession, template: string, tiles: readonly number[], newId: () => string): { ok: true; ops: EditOp[]; label: string; planted: number[] } | { ok: false; errors: string[] } {
  const { x: W } = s.size;
  const b = s.built;
  const taken = new Uint8Array(W * s.size.y);
  for (const e of b.entities) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < s.size.y) taken[ty * W + tx] = 1;
  const ops: EditOp[] = [];
  const planted: number[] = [];
  for (const i of new Set(tiles)) {
    if (i < 0 || i >= taken.length || taken[i] || b.water[i] > 0.05) continue;
    const x = i % W;
    const y = (i - x) / W;
    const p = { template, x, y, orientation: "Cw0" as Orientation };
    if (entityProblem(s, p)) continue;
    taken[i] = 1;
    planted.push(i);
    ops.push({ op: "placeEntity", params: { id: newId(), ...p } });
  }
  if (!ops.length) return fail("nothing can grow there: it needs dry ground with nothing on it");
  const name = template === "BlueberryBush" ? "blueberry bush" : template.toLowerCase();
  const label = ops.length === 1 ? `Plant a ${name}` : `Plant ${ops.length} ${name === "blueberry bush" ? "blueberry bushes" : `${name}s`}`;
  return { ok: true, ops, label, planted };
}

// ------------------------------------------------------------------------------ hover preview

/** Where an entity would stand, and why the game would refuse it there (null when it may): the
 *  editor paints the footprint green or red under the pointer before the click. */
export function footprintCheck(s: MapSession, req: EntityRequest): { tiles: number[]; problem: string | null; level?: number } {
  const { x: W, y: H } = s.size;
  const fp = FOOTPRINTS[req.template];
  if (!fp) return { tiles: [], problem: `${req.template} can't be placed` };
  const tiles = worldBlocks(fp, { ...req, z: 0, flipped: !!req.flipped }).filter((b) => b.x >= 0 && b.y >= 0 && b.x < W && b.y < H).map((b) => b.y * W + b.x);
  const own = [...new Set(tiles)];
  const problem = entityProblem(s, req, null, { level: true });
  // the level the object will stand at (the ghost shows it there)
  const level = !problem && own.length && req.template !== "BadwaterSource" && req.template !== "WaterSource" ? platformLevel(s.built.heights, waterDepth(s), W, H, own) : null;
  return { tiles: own, problem, ...(level !== null ? { level } : {}) };
}
