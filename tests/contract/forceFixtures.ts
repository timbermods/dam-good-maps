// The forces' process studies (from investigation/forces-core/demo/maps.ts `fixture`, PR #59): small
// made-up maps that show one behaviour each, never presented as generated or real terrain. The
// forces-core's pinned parity cases (checks/parity.json) were made on them.

import { blockObject, bush, startingLocation, tree, waterSource, type EntitySpec } from "../../src/core/format/entities";
import { plainEntities, type FullForceMap } from "../../src/core/forces/force";
import { geology } from "../../src/core/forces/random";

export type FixtureKind = "river" | "slide" | "lake" | "plain";

/** A W × W study: "river" a river crossing it, "slide" the river with a ridge and ruins, "lake" a
 *  tilted lake, "plain" level ground; each with a start and rows of trees and bushes. */
export function fixture(kind: FixtureKind = "river", W = 128): FullForceMap {
  const H = W;
  const heights = new Uint8Array(W * H);
  const depth = new Float64Array(W * H);
  const rx = Math.floor(W * 0.55);
  const ly = Math.floor(H * 0.7);
  const lr = W * 0.16;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.abs(x - rx);
      let h = 9;
      if (kind === "river" || kind === "slide") {
        h = d <= 3 ? 6 : d <= 6 ? 8 : 9;
        if (d <= 3) depth[i] = 0.65;
      }
      if (kind === "slide" && x > W * 0.23 && x < W * 0.32 && y > H * 0.2 && y < H * 0.84) h = 12 + Math.floor(Math.min(x - W * 0.23, W * 0.32 - x) / 2);
      if (kind === "lake") {
        const r = Math.sqrt((x - rx) ** 2 + (y - ly) ** 2);
        h = r < lr ? 6 : r < lr + 3 ? 9 : 8;
        if (y < ly && d <= 2) h = 7;
        if (r < lr) depth[i] = 2.35;
        else if (y < ly && d <= 2) depth[i] = 0.35;
      }
      heights[i] = h;
    }
  const at = (x: number, y: number, id: string) => ({ x, y, z: heights[y * W + x], id, owner: "quake-study" });
  const entities: EntitySpec[] = [startingLocation({ ...at(9, 10, "start"), orientation: "Cw0" })];
  if (kind === "river" || kind === "slide") for (let dx = -3; dx <= 3; dx++) entities.push(waterSource({ ...at(rx + dx, H - 1, "existing-source-" + dx), strength: 0.8 }));
  if (kind === "lake") entities.push(waterSource({ ...at(rx, ly, "existing-spring"), strength: 2.5 }));
  for (let y = 5; y < H - 5; y += 3)
    for (let x = 5; x < W - 5; x += 3) {
      const i = y * W + x;
      if ((x < 15 && y < 17) || depth[i] || (Math.abs(x - rx) < 7 && kind !== "plain")) continue;
      if ((x * 7 + y * 11) % 17 < 9) entities.push(tree({ ...at(x, y, "tree-" + x + "-" + y), species: (x + y) % 2 ? "Pine" : "Birch" }));
      else if ((x + y) % 7 === 0) entities.push(bush({ ...at(x, y, "bush-" + x + "-" + y), ripe: true }));
    }
  if (kind === "slide")
    for (const yy of [0.37, 0.67])
      for (let k = 0; k < 5; k++) {
        const x = Math.floor(W * 0.76) + k;
        const y = Math.floor(H * yy);
        for (let j = entities.length - 1; j >= 0; j--) if (entities[j].x === x && entities[j].y === y) entities.splice(j, 1);
        entities.push(blockObject({ ...at(x, y, "ruin-" + yy + "-" + k), template: "RuinColumnH" + (2 + (k % 3)), orientation: "Cw0" }));
      }
  return { W, H, heights, entities: plainEntities(entities), water: { depth, contamination: new Float64Array(W * H) }, maxHeight: 22, rockLayers: geology(heights), fallen: [], lava: new Uint32Array(heights.length) };
}
