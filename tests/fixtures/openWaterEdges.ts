// Windows in the water between two wet tiles (D154 as amended 2026-11-08): where the tops on either side of a tile's
// edge stand apart and nothing of the water's mesh (a skirt or a curtain) or of the ground fills the gap between them, the
// cliff or the sky shows through. Counted from the meshes themselves, layer by layer, along every tile edge, in thirds
// (a fall's slope has its vertices there), at three points of each third.

import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { chunkCount } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";
import { plainLayers, type WaterLayer } from "../../src/render3d/waterLayers";

/** A gap between the two tops smaller than this is not counted (the mesher draws no skirt under `STEP`, 0.02). */
const TOL = 0.025;
const EPS = 1e-4;
const SAMPLES = [0.1, 0.5, 0.9];

interface Cell {
  /** Each side's top height at the samples (side 0: the lower x or y). */
  tops: (number[] | undefined)[];
  /** Spans covered at each sample by the water's sides. */
  cover: [number, number][][];
}

/** The tile edges of `W` × `H` with a window between the tops of the water on either side: each layer's meshes (every
 *  chunk's) on that layer's ground (`ground`, by tile). */
export function openWaterEdges(W: number, H: number, layers: readonly { meshes: readonly WaterMeshData[]; ground: ArrayLike<number> }[]): string[] {
  const open = new Set<string>();
  for (const { meshes, ground } of layers) {
    const cells = new Map<string, Cell>();
    const cell = (key: string): Cell => {
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { tops: [undefined, undefined], cover: SAMPLES.map(() => []) }));
      return c;
    };
    const onLine = (v: number) => Math.abs(v - Math.round(v)) < EPS;
    /** The cells along the line an edge from (ax, ay) to (bx, by) lies on (map axes), with each sample's place along
     *  the edge (0 at a, 1 at b); none where the edge lies on no tile edge. */
    const along = (ax: number, ay: number, bx: number, by: number, each: (key: string, s: number, f: number) => void): "x" | "y" | null => {
      const vertical = Math.abs(ax - bx) < EPS && onLine(ax);
      const horizontal = Math.abs(ay - by) < EPS && onLine(ay);
      if (vertical === horizontal) return null;
      const line = vertical ? `x${Math.round(ax)}` : `y${Math.round(ay)}`;
      const ta = vertical ? ay : ax;
      const tb = vertical ? by : bx;
      const lo = Math.min(ta, tb);
      const hi = Math.max(ta, tb);
      for (let c = Math.round(lo * 3); c < Math.round(hi * 3); c++)
        SAMPLES.forEach((s, k) => {
          const t = (c + s) / 3;
          each(`${line}:${c}`, k, (t - ta) / (tb - ta));
        });
      return vertical ? "x" : "y";
    };
    for (const m of meshes) {
      const p = m.positions;
      for (let q = 0; q < m.quads; q++) {
        const v = q * 4;
        const X = (k: number) => p[(v + k) * 3];
        const Y = (k: number) => p[(v + k) * 3 + 1];
        const Z = (k: number) => -p[(v + k) * 3 + 2];
        if (m.normals[v * 3 + 1] > 0) {
          // a top: each of its edges lying on a tile edge, the side its middle is on
          const mx = (X(0) + X(1) + X(2) + X(3)) / 4;
          const mz = (Z(0) + Z(1) + Z(2) + Z(3)) / 4;
          for (let e = 0; e < 4; e++) {
            const a = e;
            const b = (e + 1) & 3;
            along(X(a), Z(a), X(b), Z(b), (key, s, f) => {
              const c = cell(key);
              const vertical = key[0] === "x";
              const side = (vertical ? mx < Math.round(X(a)) : mz < Math.round(Z(a))) ? 0 : 1;
              (c.tops[side] ??= [NaN, NaN, NaN])[s] = Y(a) + f * (Y(b) - Y(a));
            });
          }
        } else {
          // a side: [A bottom, B bottom, B top, A top]
          along(X(0), Z(0), X(1), Z(1), (key, s, f) => {
            const lo = Y(0) + f * (Y(1) - Y(0));
            const hi = Y(3) + f * (Y(2) - Y(3));
            cell(key).cover[s].push([Math.min(lo, hi), Math.max(lo, hi)]);
          });
        }
      }
    }
    for (const [key, c] of cells) {
      const [t0, t1] = c.tops;
      if (!t0 || !t1) continue;
      // the ground: rock up to the higher of the two tiles' grounds, at the line
      const vertical = key[0] === "x";
      const [line, third] = key.slice(1).split(":").map(Number);
      const n = Math.floor(third / 3);
      const [i0, i1] = vertical ? [n * W + line - 1, n * W + line] : [(line - 1) * W + n, line * W + n];
      if (i0 < 0 || i1 >= W * H) continue;
      const rock = Math.max(ground[i0], ground[i1]);
      for (let s = 0; s < SAMPLES.length; s++) {
        let lo = Math.min(t0[s], t1[s]);
        const hi = Math.max(t0[s], t1[s]);
        if (!(hi - lo >= TOL)) continue;
        lo = Math.max(lo, rock);
        for (const [a, b] of [...c.cover[s]].sort((u, w) => u[0] - w[0])) if (a <= lo + 1e-3 && b > lo) lo = b;
        if (lo < hi - 1e-3) {
          open.add(`${vertical ? "x" : "y"}=${line} at ${n}`);
          break;
        }
      }
    }
  }
  return [...open].sort();
}

/** The open edges of a generated map's water. */
export function openEdgesOn(theme: ThemeId, size: number, seed: number): string[] {
  const b = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
  const { W, H, heights } = b;
  const sw = surfaceWater(W, H, waterFromDepth(heights, b.water, b.contamination));
  return openWaterEdges(W, H, meshed(W, H, plainLayers(heights, sw)));
}

/** Each layer's meshes, every chunk, with its ground. */
export function meshed(W: number, H: number, layers: readonly WaterLayer[]): { meshes: WaterMeshData[]; ground: Uint8Array }[] {
  const { nx, ny } = chunkCount(W, H);
  const none = new Uint8Array(nx * ny);
  return layers.map((layer, L) => {
    // (one layer at a time, each in its own place among them: the open sky's draws its still films back)
    const only = layers.map((l, k) => (k === L ? l : { ...l, chunks: none }));
    const meshes: WaterMeshData[] = [];
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) meshes.push(meshWaterChunk(W, H, only, cx, cy));
    return { meshes, ground: layer.ground };
  });
}
