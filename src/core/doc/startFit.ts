// Where the district center may stand: the one fit rule (PLAN §20 D342; EDITOR_PLAN §4). Its 3×3 and the tile at
// its door must be on the map, clear of rivers and water and of every other object's whole footprint, the
// footprint and not only the tile an object is anchored on, which is what the checks read ("Start overlapping
// another object", "Start entrance blocked"). The core's `startProblem` (the shelf's move, the forces, the fixes)
// and the page's hover preview both call this, each handing it the objects' tiles from the map they hold, so
// the preview never says yes where the checks say no. Under a roof `startRoofProblem` is the rule: the game's, at the
// start's level (D491).
//
// Beyond the refusals, `startFitWarnings` says what the checks would flag with the start there, though it fits: the
// generation's relics, geothermal fields, mine sites, thorn belts and unstable cores keep their distance band from
// the start (`extras.placement`).

import type { Feature, MapObjectKind } from "../features/schema";
import { objectTiles, OBJECT_NAMES, openPart, standProblem, type StandGround } from "../features/objects";
import { coordinatesForMinCorner, startEntranceTile, type Orientation } from "../format/footprints";
import { bandScale, EXTRA_BANDS } from "../validate/playability";

/** Objects a generated map's resources place and then make room for the start: the start takes their ground (D368 (10)). */
const MAKES_ROOM = /^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d)$/;

/** Whether an object of `template` is cleared from under the start rather than keeping it away: a generated plant or
 *  ruin column (`raw`: from an imported file, which keeps its own objects). The start itself never counts. */
export function makesRoomForStart(template: string, raw: boolean): boolean {
  return template === "StartingLocation" || (!raw && MAKES_ROOM.test(template));
}

/** An object as `takenTiles` reads it: its template, who placed it, whether it was read from a file, and its footprint's tiles
 *  (asked only of the objects that keep the start away). */
export interface StartFitObject {
  template: string;
  owner?: string;
  raw?: unknown;
  tiles: () => Iterable<readonly [number, number]>;
}

/** The tiles other objects' whole footprints cover, on a W × H map (index y·W + x, 1 where covered): every object but
 *  the start's own feature's (`ignoreOwner`) and those that make room for it. The one list the core's `startProblem`
 *  and the page's preview both hand `startFitProblem` as `taken`. */
export function takenTiles(W: number, H: number, objects: Iterable<StartFitObject>, ignoreOwner: string | null): Uint8Array {
  const out = new Uint8Array(W * H);
  for (const e of objects) {
    if ((ignoreOwner !== null && e.owner === ignoreOwner) || makesRoomForStart(e.template, !!e.raw)) continue;
    for (const [x, y] of e.tiles()) if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 1;
  }
  return out;
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

// ---------------------------------------------------------------------------------- what the checks flag

/** A map object the generation placed that keeps a distance from the start (validate/playability.ts
 *  `EXTRA_BANDS`: relics, geothermal fields, mine sites, thorn belts, unstable cores), with the tiles it covers. */
export interface StartFitExtra {
  kind: MapObjectKind;
  tiles: readonly (readonly [number, number])[];
}

/** The generation's objects that keep a distance from the start, from a document's features: what the check
 *  `extras.placement` measures (an object the player placed is not asked). */
export function startFitExtras(features: readonly Feature[], W: number, H: number): StartFitExtra[] {
  const out: StartFitExtra[] = [];
  for (const f of features) if (f.kind === "mapObject" && f.origin === "generated" && f.params.kind in EXTRA_BANDS) out.push({ kind: f.params.kind, tiles: objectTiles(f, W, H) });
  return out;
}

/** What the checks would flag with the district center's middle at (x, y), though it fits (`startFitProblem`
 *  null): each generated object out of its distance band from the start, in the check's own words and
 *  distance (the chamfer distance, 1 and √2 a step, from the start's 3×3 to the object's nearest tile; the
 *  bands scale on maps under 128²). The start is amber there, and "Move the start here" is not for it (D361). */
export function startFitWarnings(extras: readonly StartFitExtra[], W: number, H: number, x: number, y: number): string[] {
  const scale = bandScale(W, H);
  const out: string[] = [];
  for (const e of extras) {
    const band = EXTRA_BANDS[e.kind];
    const lo = band.scaled ? band.lo * scale : band.lo;
    const hi = band.scaled ? band.hi * scale : band.hi;
    let near = Infinity;
    for (const [tx, ty] of e.tiles) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const ax = Math.max(Math.abs(tx - x) - 1, 0);
      const ay = Math.max(Math.abs(ty - y) - 1, 0);
      const d = Math.SQRT2 * Math.min(ax, ay) + Math.abs(ax - ay);
      if (d < near) near = d;
    }
    if (near === Infinity || (near >= lo && near <= hi)) continue;
    out.push(`${OBJECT_NAMES[e.kind]} ${Math.round(near)} tiles from the start, wanted ${Math.round(lo)}${hi < Infinity ? `–${Math.round(hi)}` : "+"}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------- under a roof (D491)

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
