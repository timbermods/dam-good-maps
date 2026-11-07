// A stair of slopes (EDITOR_PLAN §4, the shelf's Slope; showcase-craft gap 6): the Slope dragged from high ground down
// to low ground lays a walkable way down in one step. A slope climbs one level, so leaving a mesa four levels high took
// four tiles lowered or raised by hand and four slopes placed and turned one by one. The stair is the player's own
// placement (D368 (10): only the player places objects): a run of tiles from the higher end of the drag toward the lower
// one, straight along the drag's main axis, each tile set exactly a level below the one before and a Slope on it whose
// high side faces the top, until the stair reaches the lower end's level; the ground beyond its foot is that level, so a
// beaver walks off it. Trees and bushes placed by hand on its tiles go in the same step (a generated forest makes room by
// itself); anything else in the way, water, a cave or the map's edge refuses it with one plain reason, never clamped.

import { entityTiles } from "../features/edits";
import { orientationForHigh } from "../features/setpieces";
import { tilesToRuns } from "../math/grid";
import { PLANT_CLEARANCE } from "../terrain/clearance";
import { itemName, withArticle } from "./labels";
import type { EditOp } from "./ops";
import { resourceOwners, waterDepth, type PlannedOps } from "./placing";
import type { MapSession } from "./session";

/** One slope of a stair: its tile, the level it stands on, and its turn. */
export interface StairStep {
  x: number;
  y: number;
  z: number;
  orientation: ReturnType<typeof orientationForHigh>;
}

export type StairPlan = (PlannedOps & { ok: true; steps: StairStep[] }) | { ok: false; errors: string[] };

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Water this deep or more on a tile is in the stair's way (the brushes' wet tile, drawn as water). */
const WET = 0.05;

/** Plan the stair a Slope dragged from tile `from` to tile `to` lays (nothing applied). `newId` names each slope. */
export function planStair(s: MapSession, from: readonly [number, number], to: readonly [number, number], newId: () => string): StairPlan {
  const { x: W, y: H } = s.size;
  const h = s.built.heights;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (!on(from[0], from[1]) || !on(to[0], to[1])) return fail("The stair runs off the map");
  if (from[0] === to[0] && from[1] === to[1]) return fail("Drag the slope down to the ground it leads to");
  // the higher end is the top, whichever way the drag went
  let top = from;
  let end = to;
  if (h[top[1] * W + top[0]] < h[end[1] * W + end[0]]) [top, end] = [end, top];
  const high = h[top[1] * W + top[0]];
  const low = h[end[1] * W + end[0]];
  if (high === low) return fail(`Both ends are at level ${high}: drag down from higher ground`);
  // straight along the drag's main axis (a slope faces one of four ways)
  const ddx = end[0] - top[0];
  const ddy = end[1] - top[1];
  const [dx, dy] = Math.abs(ddx) >= Math.abs(ddy) ? [Math.sign(ddx), 0] : [0, Math.sign(ddy)];
  const n = high - low;
  const orientation = orientationForHigh(-dx, -dy);
  const steps: StairStep[] = [];
  for (let k = 1; k <= n; k++) steps.push({ x: top[0] + dx * k, y: top[1] + dy * k, z: high - k, orientation });
  const foot = [top[0] + dx * (n + 1), top[1] + dy * (n + 1)] as const;
  if (!steps.every((t) => on(t.x, t.y)) || !on(foot[0], foot[1])) return fail(`The stair runs off the map: it needs ${n + 1} tiles from its top`);
  const water = waterDepth(s);
  const tiles = steps.map((t) => t.y * W + t.x);
  const footTile = foot[1] * W + foot[0];
  for (const i of [...tiles, footTile]) {
    if (!s.plainAt(i)) return fail("A cave or an overhang is in the stair's way");
    if (water[i] >= WET) return fail("Water is in the stair's way");
  }
  if (h[footTile] !== low) return fail(`The stair's foot would meet ${h[footTile] > low ? "a wall" : "a drop"}: it ends at level ${low}, the ground past it is at ${h[footTile]}`);
  // what stands on its tiles: hand-placed trees and bushes go with it; a generated forest makes room by itself
  const path = new Set(tiles);
  const skip = resourceOwners(s);
  const gone: string[] = [];
  for (const e of s.built.entities) {
    if (skip.has(e.owner) || !entityTiles(e).some(([x, y]) => on(x, y) && path.has(y * W + x))) continue;
    if (!(e.template in PLANT_CLEARANCE)) return fail(`${upper(withArticle(itemName(e.template)))} is in the stair's way`);
    gone.push(e.id);
  }
  const ops: EditOp[] = [];
  if (gone.length) ops.push({ op: "deleteEntities", params: { entities: gone } });
  // (exact: each step at its own level, which the integrity pass would otherwise round off a lone tile)
  for (const t of steps) {
    const i = t.y * W + t.x;
    if (h[i] !== t.z) ops.push({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns([i], W), level: t.z, exact: true } });
  }
  for (const t of steps) ops.push({ op: "placeEntity", params: { id: newId(), template: "Slope", x: t.x, y: t.y, orientation: t.orientation } });
  const label = `Lay a stair of ${n} slope${n === 1 ? "" : "s"}`;
  return { ok: true, ops, report: [`${n} slopes from level ${high} down to ${low}`], label, tiles, steps };
}

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
