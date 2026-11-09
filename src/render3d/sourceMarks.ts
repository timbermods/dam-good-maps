// The sources' texture (renderer.ts `markSources`, the water's shader's `sourceTex`): where each source's middle is,
// for our rings and bubbles (D249, with Markers on) and a highlighted source (D249), and where the game draws its own pattern over a
// source (Q9 P7, materials.ts `waterSourcePattern`).

import { footprintTiles } from "../core/format/footprints";
import { SOURCE_FOOTPRINT } from "./materials";
import type { EntityView } from "./model";

const ORIENTATIONS = ["Cw0", "Cw90", "Cw180", "Cw270"] as const;

/** The sources' texture's R and G (RGBA bytes, W × H; cleared first): a water source's middle R 255, a badwater
 *  source's G 255 (254 of no strength: its rings stay, the game's own pattern does not); and in R each tile's place in
 *  the footprint of a source the game draws its own pattern over (Q9 P7, `SOURCE_FOOTPRINT`): a running badwater
 *  source's 3 × 3, a seep's 2 × 2 while it can run (not in a `drought`). */
export function markSourceTiles(d: Uint8Array, e: EntityView, W: number, H: number, drought: boolean): void {
  d.fill(0);
  const mark = (x: number, y: number, code: number) => {
    // (never over a water source's own mark: their buildings block each other, but an imported map may not)
    if (x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4] !== 255) d[(y * W + x) * 4] = code;
  };
  for (let k = 0; k < e.count; k++) {
    const name = e.templates[e.template[k]];
    if (name === "WaterSeep" || name === "BadwaterSeep") {
      if (drought) continue;
      const tiles = footprintTiles(name, { template: name, x: e.x[k], y: e.y[k], z: e.z[k], orientation: ORIENTATIONS[e.orientation[k]], flipped: false });
      const x0 = Math.min(...tiles.map((p) => p[0]));
      const y0 = Math.min(...tiles.map((p) => p[1]));
      for (const [x, y] of tiles) mark(x, y, SOURCE_FOOTPRINT.seep + (x - x0) + 2 * (y - y0));
      continue;
    }
    const i = sourceMiddle(e, k, W, H);
    if (i < 0) continue;
    if (name === "WaterSource") {
      d[i * 4] = 255;
      continue;
    }
    const on = e.strength[k] > 0;
    d[i * 4 + 1] = on ? 255 : 254;
    if (on) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark((i % W) + dx, Math.floor(i / W) + dy, SOURCE_FOOTPRINT.square + dx + 1 + 3 * (dy + 1));
  }
}

/** A source's middle tile (a badwater source's: one tile in from its corner, turned with it), or -1 for
 *  anything else or off the map. */
export function sourceMiddle(e: EntityView, k: number, W: number, H: number): number {
  const name = e.templates[e.template[k]];
  if (name !== "WaterSource" && name !== "BadwaterSource") return -1;
  let x = e.x[k];
  let y = e.y[k];
  if (name === "BadwaterSource") {
    const o = e.orientation[k];
    x += o === 0 || o === 1 ? 1 : -1;
    y += o === 0 || o === 3 ? 1 : -1;
  }
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
}
