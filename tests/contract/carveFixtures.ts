// Carve's process studies (from investigation/carve/maps.ts, PR #47): small made-up maps that show
// one behaviour each, never presented as generated or real terrain.

import { bush, startingLocation, tree, type EntitySpec } from "../../src/core/format/entities";
import type { ForceMap } from "../../src/core/forces/force";

export type StudyKind = "mountain" | "ridge" | "uphill" | "oxbow";

/** A W × W study: "mountain" drains to a lake, "ridge" stands across an aimed course, "uphill"
 *  rises toward the aimed end, "oxbow" is level ground where a winding carve can cut off a bend.
 *  Each has a start on a bench and rows of trees and bushes. */
export function study(kind: StudyKind = "mountain", W = 96): ForceMap {
  const H = W;
  const h = new Uint8Array(W * H);
  const depth = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = y / (H - 1);
      const bend = 5 * (u - 0.5) * (u - 0.5);
      const side = Math.abs(x - W * 0.5 - bend);
      let level = Math.round(3 + 11 * u + Math.max(0, side - 3) * 0.36);
      if (u < 0.3) level = side < W * 0.23 ? 2 : Math.min(16, 5 + Math.floor((side - W * 0.23) * 0.4));
      if (y < 3 && side < W * 0.23) level = 4;
      if (kind === "ridge") level = Math.round(5 + 9 * Math.exp(-Math.pow((y - W * 0.5) / (W * 0.1), 2)) + 1.3 * Math.sin(x * 0.11));
      if (kind === "uphill") level = Math.round(4 + 11 * (1 - u) + Math.max(0, side - 8) * 0.18);
      if (kind === "oxbow") level = 14;
      h[y * W + x] = Math.min(16, level);
      if (kind === "mountain" && u < 0.3 && side < W * 0.23) depth[y * W + x] = Math.max(0, 4 - h[y * W + x]);
    }
  const sy = Math.floor(W * 0.35);
  const level = h[sy * W + 9];
  for (let yy = sy - 2; yy <= sy + 4; yy++) for (let xx = 7; xx <= 13; xx++) h[yy * W + xx] = level;
  const at = (x: number, y: number, id: string) => ({ x, y, z: h[y * W + x], id, owner: "study" });
  const entities: EntitySpec[] = [startingLocation({ ...at(9, sy, "start"), orientation: "Cw0" })];
  for (let y = Math.floor(W * 0.32); y < W - 4; y += 3)
    for (let x = Math.floor(W * 0.43); x < W * 0.65; x += 3) entities.push(x % 2 ? tree({ ...at(x, y, `tree-${x}-${y}`), species: "Pine" }) : bush({ ...at(x, y, `bush-${x}-${y}`), ripe: true }));
  return { W, H, heights: h, entities, water: { depth, contamination: new Float64Array(W * H) }, maxHeight: 16 };
}
