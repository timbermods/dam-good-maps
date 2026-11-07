// Painting objects on the map (PLAN §20 D235, D338, D342): the `paintObjects` operation. The plan is made on the
// map as it stands (its water, its objects, its caves), by `gen/paint.ts`; the objects go in as `placeEntity`
// operations, one undo step, one rebuild (`MapSession.applyBatch`). Plain in, plain out: it runs headless.

import { entityTiles } from "../features/edits";
import { guidFrom } from "../math/hash";
import { runsToTiles, tilesToRuns, type Runs } from "../math/grid";
import { standProblem } from "../features/objects";
import { planPaint, type PaintGround, type PlannedObject } from "../gen/paint";
import type { ApplyResult, MapSession } from "./session";
import type { EditOp, OpOrigin } from "./ops";
import { paintLabel, paintOps } from "./paintOps";
import type { PaintLevel, PaintParams } from "./paintParams";
import { objectCells, waterDepth } from "./placing";
import { dyingTiles, SUCCULENT_MOIST } from "./plantSoil";

/** The templates a plant kind counts as already there: painting over them fills the gaps up to the density. */
const SAME: Record<string, readonly string[]> = { trees: [], bushes: ["BlueberryBush"], succulents: ["Succulent"], woods: ["Pine", "Birch", "Oak"] };

/** Where an object may stand on the map as it is: on the map, dry, nothing there. A stroke paints the ground's top,
 *  a roof's top too, where the game keeps what stands on it (D491). Under a roof (`levels`: the tiles a stroke paints
 *  at a level below their top, a cave's floor or the ground under a ledge) a tile is free where it has ground at that
 *  level and no object holds that cell; its height is then that level. On a map with caves or overhangs a tile's
 *  water is the water on the run top it paints at (`wetAt`), never a cave's seen through its roof. */
export function paintGround(s: MapSession, levels: ReadonlyMap<number, number> = new Map()): PaintGround {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const free = new Uint8Array(W * H).fill(1);
  const wet = wetAt(s);
  for (let i = 0; i < W * H; i++) if (!levels.has(i) && wet(i, b.heights[i])) free[i] = 0;
  for (const e of b.entities) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H && !levels.has(y * W + x)) free[y * W + x] = 0;
  if (!levels.size) return { W, H, heights: b.heights, free };
  const heights = Uint8Array.from(b.heights);
  const mask = s.standGround().mask;
  const cells = objectCells(b.entities, W, H, () => false);
  const solid = (i: number, z: number) => z < 0 || (z < 23 && ((mask[i] >>> z) & 1) === 1);
  for (const [i, z] of levels) {
    heights[i] = z;
    const x = i % W;
    if (solid(i, z) || !solid(i, z - 1) || cells(x, (i - x) / W, z) || wet(i, z)) free[i] = 0;
  }
  return { W, H, heights, free };
}

/** Whether level `z` of tile `i` has water enough on it that nothing is planted there (over 0.05, the planting rule's):
 *  on a map with caves or overhangs the water on that run top (`MapSession.runGrounds`), else the tile's. */
function wetAt(s: MapSession): (i: number, z: number) => boolean {
  const runs = s.runGrounds();
  if (runs) return (i, z) => (runs(i, z)?.depth ?? 0) > 0.05;
  const depth = waterDepth(s);
  return (i) => depth[i] > 0.05;
}

/** The level each tile of a stroke paints at under a roof, from one level the page's pick found (D491: the floor it
 *  aimed at): on each tile, the floor of the air at that level, where the tile has ground above it; a tile whose top is
 *  at or below the level paints its top, and one that is rock at the level keeps it, so the rule refuses it there
 *  rather than paint the roof's top. The groups for `PaintParams.levels`, empty on open ground. */
export function paintLevels(s: MapSession, area: Runs, z: number): PaintLevel[] {
  const { x: W, y: H } = s.size;
  const mask = s.standGround().mask;
  const solid = (i: number, l: number) => l < 0 || (l < 23 && ((mask[i] >>> l) & 1) === 1);
  const by = new Map<number, number[]>();
  for (const i of runsToTiles(area, W)) {
    if (i < 0 || i >= W * H || s.built.heights[i] <= z) continue;
    let f = z;
    if (!solid(i, z)) while (!solid(i, f - 1)) f--;
    const list = by.get(f);
    if (list) list.push(i);
    else by.set(f, [i]);
  }
  return [...by].sort((a, c) => a[0] - c[0]).map(([l, tiles]) => ({ z: l, area: tilesToRuns(tiles, W) }));
}

/** The tiles of a stroke that paint at a level under a roof, and that level (`PaintParams.levels`; those at their top
 *  left out: they paint the top). */
function levelMap(s: MapSession, p: PaintParams): Map<number, number> {
  const { x: W } = s.size;
  const out = new Map<number, number>();
  for (const l of p.levels ?? []) for (const i of runsToTiles(l.area, W)) if (l.z !== s.built.heights[i]) out.set(i, l.z);
  return out;
}

/** The plant a stroke of `p.kind` is judged by for its soil (trees, bushes and succulents die on different ground; mixed
 *  woods' trees all live on the same), or null for ruins and thorns. */
function soilTemplate(p: PaintParams): string | null {
  if (p.kind === "trees") return p.template ?? null;
  if (p.kind === "woods") return "Pine";
  if (p.kind === "bushes") return "BlueberryBush";
  if (p.kind === "succulents") return "Succulent";
  return null;
}

/** The tiles of a stroke whose ground kills its plants, by the rule `plants.survive` applies (plantSoil.ts `dyingTiles`):
 *  on a map with caves or overhangs the run top each tile paints at, under a roof (`p.levels`) or on top, as the check
 *  reads each plant there (D491); else the build's moisture, contamination and water. Empty for ruins and thorns. */
function soilKills(s: MapSession, p: PaintParams): number[] {
  const template = soilTemplate(p);
  if (!template) return [];
  const { x: W, y: H } = s.size;
  const region = runsToTiles(p.area, W).filter((i) => i >= 0 && i < W * H);
  const levels = levelMap(s, p);
  const b = s.built;
  const runs = s.runGrounds();
  const at = runs ? new Map(region.map((i) => [i, levels.get(i) ?? b.heights[i]])) : levels;
  return dyingTiles(template, region, { moisture: b.moisture, contamination: b.soilContamination, depth: waterDepth(s), runs }, at);
}

/** The tiles of a stroke where its plants would die (D235's warning, "dry ground: these will die"; the stroke still
 *  paints), as `soilKills` reads them. A succulent stroke never has any: succulents are planted only where they live
 *  (`planPaintObjects` leaves moist ground empty), so there is nothing to warn of. */
export function paintDying(s: MapSession, p: PaintParams): number[] {
  return p.kind === "succulents" ? [] : soilKills(s, p);
}

export type PaintPlan = { ok: true; plan: PlannedObject[]; ops: EditOp[]; label: string } | { ok: false; errors: string[] };

/** What a stroke would place on this map: the objects, the operations and the history's words, or the plain
 *  reason nothing can be placed. (A question the page asks for its ghost; `applyPaintObjects` answers it and
 *  places the objects.) */
export function planPaintObjects(s: MapSession, p: PaintParams, nextSeq: number = s.nextSeq): PaintPlan {
  const errors = s.check({ op: "paintObjects", params: p });
  if (errors.length) return { ok: false, errors };
  const { x: W, y: H } = s.size;
  const region = runsToTiles(p.area, W).filter((i) => i >= 0 && i < W * H);
  const levels = levelMap(s, p);
  const g = paintGround(s, levels);
  // succulents die on moist ground: they go only where they live (trees and bushes keep the warning, D235)
  let moist = 0;
  if (p.kind === "succulents") {
    for (const i of soilKills(s, p)) if (g.free[i]) (g.free[i] = 0, moist++);
  }
  let existing = 0;
  const same = p.kind === "trees" ? [p.template ?? ""] : (SAME[p.kind] ?? []);
  if (same.length) {
    const inRegion = new Set(region);
    for (const e of s.built.entities) {
      const i = e.y * W + e.x;
      if (same.includes(e.template) && inRegion.has(i) && (!levels.size || (levels.get(i) ?? s.built.heights[i]) === e.z)) existing++;
    }
  }
  const planned = planPaint(g, { kind: p.kind, template: p.template ?? "", region, density: p.density, age: p.age ?? "grown", seed: p.seed, existing });
  // under a roof each object stands by the game's rule at its level (a pine needs 3 levels of air, D491): where one
  // can't, that tile gets none, never a place on the roof's top
  const refused: string[] = [];
  let plan = planned;
  if (levels.size) {
    const stand = s.standGround();
    const cells = objectCells(s.built.entities, W, H, () => false);
    plan = planned.filter((o) => {
      const z = levels.get(o.tile);
      if (z === undefined) return true;
      const x = o.tile % W;
      const why = standProblem(o.template, { x, y: (o.tile - x) / W, z, orientation: o.orientation, flipped: o.flipped }, stand, cells);
      if (why) refused.push(`nothing can stand at level ${z} there: ${why}`);
      return !why;
    });
  }
  if (!plan.length) return { ok: false, errors: [refused[0] ?? nothingReason(p, region, g, existing, levels, moist)] };
  let k = 0;
  const ops = paintOps(plan, W, () => guidFrom("paint", p.seed, nextSeq, k++), levels);
  return { ok: true, plan, ops, label: paintLabel(p.kind, p.template ?? "", plan.length) };
}

function nothingReason(p: PaintParams, region: number[], g: PaintGround, existing: number, levels: ReadonlyMap<number, number>, moist: number): string {
  let free = 0;
  for (const i of region) if (g.free[i]) free++;
  if (!free && moist) return SUCCULENT_MOIST;
  if (!free && levels.size) return "there is no free ground at that level under the stroke: it is rock, air or other objects";
  if (!free) return "there is no free ground under the stroke: it is water or other objects";
  if (p.kind === "ruins") return "the ground under the stroke is too small or broken for a ruin field: a field stands on one level";
  if (p.kind === "thorns") return "the stroke is too small for a thorn patch";
  if (existing) return "the stroke already holds as many as its density asks for";
  return "the density asks for none on so little ground: raise it or paint more";
}

/** Apply a `paintObjects` operation: plan it on the map as it stands and place the objects as one step. */
export function applyPaintObjects(s: MapSession, p: PaintParams, origin: OpOrigin, label?: string): ApplyResult {
  const r = planPaintObjects(s, p);
  if (!r.ok) return { ok: false, errors: r.errors, applied: [], dirty: null };
  return s.applyBatch(r.ops, origin, label ?? r.label);
}
