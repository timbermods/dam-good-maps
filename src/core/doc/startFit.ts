// Where the district center may stand: the one fit rule (PLAN §20 D342; EDITOR_PLAN §4). Its 3×3 and the tile at
// its door must be on the map, clear of rivers and water and of every other object's whole footprint, the
// footprint and not only the tile an object is anchored on, which is what the checks read ("Start overlapping
// another object", "Start entrance blocked"). The core's `startProblem` (the shelf's move, the forces, the fixes)
// and the page's hover preview both call this, each handing it the objects' tiles from the map they hold, so
// the preview never says yes where the checks say no. Under a roof `startRoofProblem` is the rule: the game's, at the
// start's level (D491).

import { coordinatesForMinCorner, startEntranceTile, type Orientation } from "../format/footprints";
import { openPart, standProblem, type StandGround } from "../features/objects";

/** Objects a generated map's resources place and then make room for the start: the start takes their ground (D368 (10)). */
const MAKES_ROOM = /^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d)$/;

/** Whether an object of `template` is cleared from under the start rather than keeping it away: a generated plant or
 *  ruin column (`raw`: from an imported file, which keeps its own objects). The start itself never counts. */
export function makesRoomForStart(template: string, raw: boolean): boolean {
  return template === "StartingLocation" || (!raw && MAKES_ROOM.test(template));
}

/** What the rule reads of a map, tile by tile (index y·W + x). */
export interface StartFitGround {
  W: number;
  H: number;
  /** A river's channel is on the tile. */
  river(i: number): boolean;
  /** The water on the tile, blocks deep. */
  depth(i: number): number;
  /** Another object's footprint covers the tile (not the start's own, and not one that makes room for it). */
  taken(i: number): boolean;
}

/** Why the district center cannot stand with its middle at (x, y) and its door at `door`, or null when it can. Rivers,
 *  water, the map's edge and objects stop it; the ground never does (a bench or a cut footprint levels it, D328), unless
 *  `flat` asks for level ground (an imported map, which has no bench) or `extra` finds a reason of its own. */
export function startFitProblem(g: StartFitGround, x: number, y: number, door: readonly [number, number], opts: { flat?: (i: number) => boolean; extra?: (i: number) => string | null } = {}): string | null {
  const { W, H } = g;
  const tiles: [number, number][] = [[door[0], door[1]]];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([x + dx, y + dy]);
  for (const [tx, ty] of tiles) {
    if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return "too close to the map edge";
    const i = ty * W + tx;
    if (g.river(i)) return "in a river";
    if (g.depth(i) > 0.05) return "under water";
    if (opts.flat && !opts.flat(i)) return "not on level ground";
    if (g.taken(i)) return "on an object";
    const why = opts.extra?.(i);
    if (why) return why;
  }
  return null;
}

/** Why a start without a level does not stand where a cave or an overhang is: it stands on open ground, its bench and its
 *  levelling there, or at a level wholly under a roof (`startRoofProblem`). */
export const START_OPEN_GROUND = "the start needs open ground: there is a cave or overhang there";

/** Whether the start's 3×3 or the tile at its door, with its middle at (x, y) facing `o`, has a cave or an overhang
 *  (a column that is not one plain run from the bottom). */
export function startOverRoof(g: StandGround, x: number, y: number, o: Orientation): boolean {
  const [cx, cy] = coordinatesForMinCorner(3, 3, x - 1, y - 1, o);
  const door = startEntranceTile(cx, cy, o);
  const tiles: [number, number][] = [door];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([x + dx, y + dy]);
  for (const [tx, ty] of tiles) {
    if (tx < 0 || ty < 0 || tx >= g.W || ty >= g.H) continue;
    const m = g.mask[ty * g.W + tx];
    if ((m & (m + 1)) !== 0) return true;
  }
  return false;
}

/** The ground the rule reads under a roof: the ground voxel by voxel and the top of each tile. */
export interface StartRoofGround extends StandGround {
  heights: ArrayLike<number>;
}

/** Why the district center cannot stand under a roof (a cave's floor, the ground under a ledge) with its middle at (x, y),
 *  facing `o`, at level `z`, or null when it can (D491). Timberborn keeps a start wherever its 3×3×5 is air on level
 *  ground and the tile at its door is ground at its level that nothing blocks: nothing looks for the sky
 *  (`StartingBuildingPlacementValidator` reads only the entrance; `StartingBuildingSpawner` builds the district center at
 *  the StartingLocation's own placement; investigation/terrain3d/GAME_RULES.md §5). The editor asks one thing more, as of
 *  every object with a level: its 3×3 stands wholly under the roof, so no brush or force reaches its ground (D491).
 *  Nothing is levelled there and it has no bench. `taken(x, y, z)` names another object holding a cell, if any. */
export function startRoofProblem(g: StartRoofGround, x: number, y: number, o: Orientation, z: number, taken?: (x: number, y: number, z: number) => string | null): string | null {
  const { W, H, heights, mask } = g;
  const [cx, cy] = coordinatesForMinCorner(3, 3, x - 1, y - 1, o);
  const door = startEntranceTile(cx, cy, o);
  const foot: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) foot.push([x + dx, y + dy]);
  for (const [tx, ty] of [...foot, door]) if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return "too close to the map edge";
  const top = heights[y * W + x];
  if (z >= top) return `level ${z} is not under a roof here: the ground's top is ${top}, where the start stands without a level`;
  if (openPart(foot, z, g)) return "part of the start would stand in the open: under a roof it stands wholly under it";
  const why = standProblem("StartingLocation", { x: cx, y: cy, z, orientation: o }, g, taken);
  if (why) return why;
  const solid = (i: number, l: number) => l < 0 || (l < 23 && ((mask[i] >>> l) & 1) === 1);
  const d = door[1] * W + door[0];
  if (solid(d, z)) return "its door would open onto rock";
  if (!solid(d, z - 1)) return "there is no ground at its door: the tile in front of it needs ground at its level";
  const other = taken?.(door[0], door[1], z) ?? taken?.(door[0], door[1], z + 1);
  if (other) return "something stands in front of its door";
  return null;
}
