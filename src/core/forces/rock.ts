// Fresh volcanic rock (PLAN §20 D206, from investigation/forces-core `core/rock.ts`): each tile keeps a
// bit per occupied level (0–21) of hard rock an eruption laid there. Erupt adds it, digging takes away
// the levels it removes, Lift moves it up or down with the land and Slide carries it with its tiles.
// Carve finds it hard (it bends round it). It is the project's, never the .timber file's: the game has
// no such thing, so it never becomes an invented component.

/** A tile's volcanic levels as a bit mask (bit z: the level from z to z + 1 is fresh rock). */
export interface RockMap {
  heights: Uint8Array;
  lava?: Uint32Array;
}

/** The level just under `height` on `tile` is fresh volcanic rock. */
export function hardAt(m: RockMap, tile: number, height: number): boolean {
  return !!((m.lava?.[tile] ?? 0) & (1 << Math.max(0, height - 1)));
}

/** Levels above the ground are gone: a tile keeps only the rock under its surface. */
export function trimRock(m: Required<RockMap>): void {
  for (let i = 0; i < m.lava.length; i++) m.lava[i] &= (1 << m.heights[i]) - 1;
}

/** Carry the rock with the land: `source[j]` is the tile each tile's ground came from; vertical,
 *  the rock rises or sinks with the ground (Lift); otherwise it keeps its levels (Slide). */
export function transportRock(before: Required<RockMap>, after: Required<RockMap>, source: Uint32Array, vertical: boolean): void {
  for (let j = 0; j < source.length; j++) {
    const i = source[j];
    const dz = vertical ? after.heights[j] - before.heights[i] : 0;
    const bits = before.lava[i];
    after.lava[j] = (dz >= 0 ? bits << dz : bits >>> -dz) & ((1 << after.heights[j]) - 1);
  }
  trimRock(after);
}
