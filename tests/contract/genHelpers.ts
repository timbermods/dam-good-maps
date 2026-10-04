// Shared helpers for the generator's release-gate tests (investigation/release-gate-generator): a
// generated map read back from its own file, through the public entry points only.
import { readTimber } from "../../src/core/format/timber";
import { storedWater, surfaceOf } from "../../src/core/format/world";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { mapObjects, type MapObject } from "../../src/core/sim/model";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";

export interface ReadBack {
  r: GenerateResult;
  W: number;
  H: number;
  surface: Uint8Array;
  objects: MapObject[];
  /** The water the file stores, per tile (every level summed). */
  depth: Float64Array;
}

/** Generate a share link's map through the public entry points and read its file back. */
export function generateLink(fragment: string): ReadBack {
  const d = decodeSpecFragment(fragment);
  if (!d) throw new Error(`bad fragment ${fragment}`);
  const r = generate(d.spec);
  if (!r.bytes.length) throw new Error(`${fragment}: no file (the map failed: ${r.report.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")})`);
  const w = readTimber(r.bytes).world;
  const W = w.sizeX;
  const H = w.sizeY;
  const sparse = storedWater(w.singletons, W, H);
  const depth = new Float64Array(W * H);
  for (let k = 0; k < sparse.tile.length; k++) depth[sparse.tile[k]] += sparse.depth[k];
  return { r, W, H, surface: surfaceOf(w), objects: mapObjects(w), depth };
}

export interface WetBody {
  tiles: number[];
  fed: boolean;
  /** The deepest tile's depth. */
  deepest: number;
}

/** The 4-connected bodies of the stored water (depth > 0), each saying whether a source stands on it. */
export function wetBodies(m: Pick<ReadBack, "W" | "H" | "objects" | "depth">): WetBody[] {
  const { W, H, depth } = m;
  const N = W * H;
  const sources = new Set<number>();
  for (const o of m.objects) if (o.template === "WaterSource" || o.template === "BadwaterSource") sources.add(o.y * W + o.x);
  const seen = new Uint8Array(N);
  const out: WetBody[] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !(depth[s] > 0)) continue;
    const tiles: number[] = [];
    const stack = [s];
    seen[s] = 1;
    let fed = false;
    let deepest = 0;
    while (stack.length) {
      const i = stack.pop()!;
      tiles.push(i);
      if (sources.has(i)) fed = true;
      if (depth[i] > deepest) deepest = depth[i];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!seen[j] && depth[j] > 0) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push({ tiles: tiles.sort((a, b) => a - b), fed, deepest });
  }
  return out;
}

export const at = (W: number, i: number) => `(${i % W}, ${Math.floor(i / W)})`;
