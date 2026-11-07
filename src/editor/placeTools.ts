// Placing from the left shelf (PLAN §20 D184), as the map's pointer tool.
//
// The shelf: the picked object's ghost follows the pointer, its footprint green where it fits and
// red where it doesn't, the reason in a quiet word beside the pointer; a click places it. Trees and
// bushes: a drag paints many, clustered as the generator's groves and patches are, and the release
// plants them as one step. The Slope: a drag from high ground down to low ground shows a stair of
// slopes, and the release lays it as one step (core/doc/stair.ts).
//
// (Removing things is Select and Delete, and Delete on what the pointer is on: D288.)

import type { PointerTool, TileHit } from "../render3d";

export interface ShelfHost {
  W: number;
  H: number;
  /** The pointer is over tile (x, y), or off the map: show the ghost there. */
  hover(hit: TileHit | null, ev: PointerEvent): void;
  /** A click on tile (x, y): place it, on the ground the voxel pick hit there (`hit`: a cave's floor, D491). */
  place(x: number, y: number, hit: TileHit | null): void;
  /** Trees and bushes: the tiles a drag paints round a point (x, y), or null for anything else. */
  paintAround(x: number, y: number): number[] | null;
  /** The tiles a drag has painted so far (null: none, the drag is over). */
  painting(tiles: number[] | null): void;
  /** The drag let go: plant on these tiles, at the ground the stroke began on (`hit`: a cave's floor, D491). */
  plant(tiles: number[], hit: TileHit | null): void;
  /** The held object lays a stair when dragged (the Slope). */
  stairs?(): boolean;
  /** A stair being dragged from tile `from` to tile `to`: show it (`to` null: the drag is back on its first tile). */
  stairing?(from: [number, number], to: [number, number] | null, ev?: PointerEvent): void;
  /** The stair's drag let go on tile `to`: lay it (nothing shows any more). */
  stair?(from: [number, number], to: [number, number] | null): void;
}

/** How far the pointer goes, in pixels, before a press with the Slope becomes a stair's drag. */
const STAIR_PX = 6;

/** The shelf's pointer tool: hover shows the ghost, a click places, a drag paints (trees, bushes) or lays a stair (the
 *  Slope). It aims at the
 *  ground the player sees (the voxel pick): a cave's floor through its mouth or under the level cut (D491). */
export function shelfTool(host: ShelfHost): PointerTool {
  let down: [number, number] | null = null;
  let downHit: TileHit | null = null;
  let painted: Set<number> | null = null;
  let last: [number, number] | null = null;
  /** A stair's drag: on while the held object lays one; `stairTo`, the tile it reaches (null: back on its first). */
  let stairs = false;
  let moved = false;
  let stairTo: [number, number] | null = null;
  /** Where on the screen the press was: a click that jitters a few pixels over a tile's border stays a click. */
  let pressedAt: [number, number] = [0, 0];
  const paint = (x: number, y: number) => {
    const around = host.paintAround(x + 0.5, y + 0.5);
    if (!around || !painted) return;
    for (const i of around) painted.add(i);
    host.painting([...painted]);
  };
  return {
    down(hit, ev) {
      if (ev.button !== 0) return false;
      if (!hit) return true;
      down = [hit.x, hit.y];
      downHit = hit;
      last = [hit.x, hit.y];
      painted = host.paintAround(hit.x + 0.5, hit.y + 0.5) ? new Set() : null;
      stairs = !painted && !!host.stairs?.();
      pressedAt = [ev.clientX, ev.clientY];
      moved = false;
      stairTo = null;
      return true;
    },
    move(hit, ev) {
      if (down && stairs) {
        // (off its first tile a click becomes a stair; back on it, the stair shows nothing, and letting go there lays none)
        if (hit) stairTo = hit.x === down[0] && hit.y === down[1] ? null : [hit.x, hit.y];
        if (stairTo && Math.hypot(ev.clientX - pressedAt[0], ev.clientY - pressedAt[1]) >= STAIR_PX) moved = true;
        if (moved) return host.stairing?.(down, stairTo, ev);
      }
      host.hover(hit, ev);
      if (!down || !hit || !painted) return;
      // a drag: paint along the way, a tile at a time (from the first tile once the pointer leaves
      // it: a click stays a click)
      const [lx, ly] = last!;
      const n = Math.max(Math.abs(hit.x - lx), Math.abs(hit.y - ly));
      if (n && painted.size === 0) paint(down[0], down[1]);
      for (let k = 1; k <= n; k++) paint(Math.round(lx + ((hit.x - lx) * k) / n), Math.round(ly + ((hit.y - ly) * k) / n));
      if (n) last = [hit.x, hit.y];
    },
    up(hit) {
      const d = down;
      const p = painted;
      const at0 = downHit;
      const stair = stairs && moved ? stairTo : undefined;
      down = null;
      downHit = null;
      painted = null;
      last = null;
      stairs = false;
      moved = false;
      stairTo = null;
      host.painting(null);
      if (!d) return;
      if (stair !== undefined) return host.stair?.(d, stair);
      if (p && p.size) return host.plant([...p], at0);
      if (hit) host.place(hit.x, hit.y, hit);
      else host.place(d[0], d[1], at0);
    },
    cancel() {
      const stair = stairs && moved && down;
      down = null;
      downHit = null;
      painted = null;
      last = null;
      stairs = false;
      moved = false;
      stairTo = null;
      host.painting(null);
      if (stair) host.stairing?.(stair, null);
    },
    hover(hit, ev) {
      host.hover(hit, ev);
    },
    voxel: true,
  };
}
