// Placing from the left shelf and Remove (PLAN §20 D184), as the map's pointer tools.
//
// The shelf: the picked object's ghost follows the pointer, its footprint green where it fits and
// red where it doesn't, the reason in a quiet word beside the pointer; a click places it. Trees and
// bushes: a drag paints many, clustered as the generator's groves and patches are, and the release
// plants them as one step.
//
// Remove: the objects under the pointer glow red; a click removes them, a drag removes everything
// in its rectangle that the filters take, as one step. It never changes the ground, and the start
// stays.

import type { PointerTool, TileHit } from "../render3d";
import { rectTilesBetween } from "./select";

export interface ShelfHost {
  W: number;
  H: number;
  /** The pointer is over tile (x, y), or off the map: show the ghost there. */
  hover(hit: TileHit | null, ev: PointerEvent): void;
  /** A click on tile (x, y): place it. */
  place(x: number, y: number): void;
  /** Trees and bushes: the tiles a drag paints round a point (x, y), or null for anything else. */
  paintAround(x: number, y: number): number[] | null;
  /** The tiles a drag has painted so far (null: none, the drag is over). */
  painting(tiles: number[] | null): void;
  /** The drag let go: plant on these tiles. */
  plant(tiles: number[]): void;
}

/** The shelf's pointer tool: hover shows the ghost, a click places, a drag paints (trees, bushes). */
export function shelfTool(host: ShelfHost): PointerTool {
  let down: [number, number] | null = null;
  let painted: Set<number> | null = null;
  let last: [number, number] | null = null;
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
      last = [hit.x, hit.y];
      painted = host.paintAround(hit.x + 0.5, hit.y + 0.5) ? new Set() : null;
      return true;
    },
    move(hit, ev) {
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
      down = null;
      painted = null;
      last = null;
      host.painting(null);
      if (!d) return;
      if (p && p.size) return host.plant([...p]);
      const at = hit ? [hit.x, hit.y] : d;
      host.place(at[0], at[1]);
    },
    cancel() {
      down = null;
      painted = null;
      last = null;
      host.painting(null);
    },
    hover(hit, ev) {
      host.hover(hit, ev);
    },
  };
}

export interface RemoveHost {
  W: number;
  H: number;
  /** The corner tiles of the objects Remove takes on these tiles (with the filters). */
  objectsOn(tiles: readonly number[]): number[];
  /** The source the pointer on tile (x, y) targets (D249: within about two tiles), or null. */
  target?(x: number, y: number): { corner: number; tiles: number[] } | null;
  /** The corner tiles of the sources on these tiles (whatever the filters say). */
  sourcesOn?(tiles: readonly number[]): number[];
  /** Show these objects in red, or none. */
  highlight(corners: number[] | null): void;
  /** The rectangle being dragged, or null; `sources`: the tiles a drag that takes only sources
   *  takes them from. */
  drawing(tiles: number[] | null, ev: PointerEvent | null, sources?: number[]): void;
  /** Remove what the filters take on these tiles, or with `sources` only the sources there. */
  remove(tiles: number[], sources?: boolean): void;
}

/** Remove's pointer tool: hover glows red, a click removes, a drag removes a rectangle's. A press on
 *  a source (within its targeting range, D249) takes only sources: that one on a click, those in
 *  the rectangle on a drag, whatever the filters say; the red glow shows exactly what will go. */
export function removeTool(host: RemoveHost): PointerTool {
  let from: [number, number] | null = null;
  let to: [number, number] | null = null;
  let source: { corner: number; tiles: number[] } | null = null;
  const rect = () => (from && to ? rectTilesBetween(from, to, host.W, host.H) : []);
  /** What a drag takes: the rectangle's tiles, and the pressed source's own. */
  const taking = () => {
    const tiles = rect();
    return source ? [...new Set([...tiles, ...source.tiles])] : tiles;
  };
  const glowOf = (tiles: readonly number[]) => (source ? (host.sourcesOn?.(tiles) ?? [source.corner]) : host.objectsOn(tiles));
  return {
    down(hit, ev) {
      if (ev.button !== 0) return false;
      if (!hit) return true;
      from = to = [hit.x, hit.y];
      source = host.target?.(hit.x, hit.y) ?? null;
      return true;
    },
    move(hit, ev) {
      if (!from || !hit) return;
      to = [hit.x, hit.y];
      const tiles = rect();
      host.drawing(tiles.length > 1 ? tiles : null, ev, source ? taking() : undefined);
      host.highlight(glowOf(taking()));
    },
    up() {
      const tiles = taking();
      const sources = !!source;
      from = to = null;
      source = null;
      host.drawing(null, null);
      host.highlight(null);
      if (tiles.length) host.remove(tiles, sources);
    },
    cancel() {
      from = to = null;
      source = null;
      host.drawing(null, null);
      host.highlight(null);
    },
    hover(hit) {
      if (!hit) return host.highlight(null);
      const t = host.target?.(hit.x, hit.y);
      host.highlight(t ? [t.corner] : host.objectsOn([hit.y * host.W + hit.x]));
    },
  };
}
