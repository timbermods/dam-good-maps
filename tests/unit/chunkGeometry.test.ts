// A chunk's geometry kept on the GPU between remeshes (R1, chunkGeometry.ts): what is drawn is exactly the new
// mesh (its vertices, the same index pattern, a draw range over its quads and its own bounding sphere), whether
// it went into the chunk's existing buffers or new ones.

import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import { chunkGeometry, refillChunk, type ChunkArrays } from "../../src/render3d/chunkGeometry";
import { meshChunk } from "../../src/render3d/mesh";

function terrain(W: number, H: number, seed: number) {
  const heights = new Uint8Array(W * H);
  let s = seed;
  for (let i = 0; i < W * H; i++) heights[i] = ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % 7) + 2;
  return { W, H, heights, columns: new Map<number, Uint8Array>() };
}

const arraysOf = (d: ReturnType<typeof meshChunk>): ChunkArrays => ({
  quads: d.quads,
  attributes: [
    { name: "position", array: d.positions, itemSize: 3 },
    { name: "normal", array: d.normals, itemSize: 3, normalized: true },
  ],
});

/** What the geometry draws: each attribute's used part and the index over the draw range. */
function drawn(g: BufferGeometry) {
  const quads = g.drawRange.count / 6;
  return {
    position: Array.from((g.getAttribute("position") as BufferAttribute).array.slice(0, quads * 12)),
    normal: Array.from((g.getAttribute("normal") as BufferAttribute).array.slice(0, quads * 12)),
    index: Array.from(g.index!.array.slice(0, quads * 6)),
    normalized: (g.getAttribute("normal") as BufferAttribute).normalized,
  };
}

/** The geometry as the renderer made it before R1. */
function plain(d: ReturnType<typeof meshChunk>) {
  return { position: Array.from(d.positions), normal: Array.from(d.normals), index: Array.from(d.indices), normalized: true };
}

describe("a chunk's geometry kept between remeshes (R1)", () => {
  it("draws exactly the mesh, new or refilled, smaller or larger", () => {
    const first = meshChunk(terrain(64, 64, 1), 0, 0);
    const g = chunkGeometry(arraysOf(first));
    expect(drawn(g)).toEqual(plain(first));
    // a flatter remesh fits: same buffers
    const flat = { ...terrain(64, 64, 1), heights: new Uint8Array(64 * 64).fill(3) };
    const smaller = meshChunk(flat, 0, 0);
    expect(smaller.quads).toBeLessThan(first.quads);
    const position = g.getAttribute("position");
    expect(refillChunk(g, arraysOf(smaller))).toBe(true);
    expect(g.getAttribute("position")).toBe(position);
    expect(drawn(g)).toEqual(plain(smaller));
    // its own bounding sphere, not the room left after it
    const own = new BufferGeometry();
    own.setAttribute("position", new BufferAttribute(smaller.positions, 3));
    own.computeBoundingSphere();
    expect(g.boundingSphere!.radius).toBeCloseTo(own.boundingSphere!.radius, 6);
    expect(g.boundingSphere!.center.toArray()).toEqual(own.boundingSphere!.center.toArray());
    // a remesh too big for the room left is refused (the renderer makes new buffers)
    const big = { quads: Math.ceil(first.quads * 1.5) + 1, attributes: arraysOf(first).attributes.map((a) => ({ ...a, array: new (a.array.constructor as new (n: number) => Float32Array)((Math.ceil(first.quads * 1.5) + 1) * 4 * a.itemSize) })) };
    expect(refillChunk(g, big)).toBe(false);
  });

  it("refuses a mesh whose attributes differ (another kind of chunk)", () => {
    const d = meshChunk(terrain(32, 32, 2), 0, 0);
    const g = chunkGeometry(arraysOf(d));
    expect(refillChunk(g, { quads: 1, attributes: [{ name: "position", array: new Float32Array(12), itemSize: 3 }, { name: "wdata", array: new Float32Array(8), itemSize: 2 }] })).toBe(false);
    expect(refillChunk(g, { quads: 1, attributes: [{ name: "position", array: new Float32Array(12), itemSize: 3 }, { name: "normal", array: new Int8Array(12), itemSize: 3 }] })).toBe(false);
  });
});
