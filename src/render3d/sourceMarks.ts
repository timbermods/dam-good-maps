// The sources' texture (renderer.ts `markSources`, the water's shader's `sourceTex`): where each source's middle is,
// for our rings and bubbles (D196) and a highlighted source (D249), and where the game draws its own pattern over a
// source (Q9 P7, materials.ts `waterSourcePattern`).

import { footprintTiles } from "../core/format/footprints";
import { SEEP_MARK } from "./materials";
import type { EntityView } from "./model";

const ORIENTATIONS = ["Cw0", "Cw90", "Cw180", "Cw270"] as const;

/** The sources' texture's R and G (RGBA bytes, W × H; cleared first): a water source's middle R 255, a badwater
 *  source's G 255 (254 of no strength: its rings stay, the game's own pattern does not), a seep's footprint's first
 *  tile R `SEEP_MARK` while it can run (not in a `drought`), for the game's own pattern over it (Q9 P7). */
export function markSourceTiles(d: Uint8Array, e: EntityView, W: number, H: number, drought: boolean): void {
  d.fill(0);
  for (let k = 0; k < e.count; k++) {
    const name = e.templates[e.template[k]];
    if (name === "WaterSeep" || name === "BadwaterSeep") {
      if (drought) continue;
      const tiles = footprintTiles(name, { template: name, x: e.x[k], y: e.y[k], z: e.z[k], orientation: ORIENTATIONS[e.orientation[k]], flipped: false });
      const x = Math.min(...tiles.map((p) => p[0]));
      const y = Math.min(...tiles.map((p) => p[1]));
      if (x >= 0 && y >= 0 && x < W && y < H) d[(y * W + x) * 4] = SEEP_MARK;
      continue;
    }
    const i = sourceMiddle(e, k, W, H);
    if (i >= 0) d[i * 4 + (name === "WaterSource" ? 0 : 1)] = name === "BadwaterSource" && !(e.strength[k] > 0) ? 254 : 255;
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
