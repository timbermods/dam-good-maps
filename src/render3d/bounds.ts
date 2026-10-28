// A mesh's bounds as plain numbers, so a worker can make them beside the mesh (waterMesh.worker.ts) and
// the page's thread never walks a chunk's vertices again to find them (chunkGeometry.ts).

/** The bounding sphere (x, y, z, radius) of vertex positions, three at a time: the same numbers as
 *  three.js's `computeBoundingSphere` (the box's middle, then the farthest vertex from it), without
 *  its objects, and without three.js (a worker makes it beside the mesh). With `floors` (the water's
 *  `WaterMeshData.cut`, its floor every other number) each vertex is also taken down to its column's
 *  floor, where a layer cut may fold it (cutWater.ts). */
export function boundingSphereOf(p: Float32Array, floors?: Float32Array): Float64Array {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  /** The lowest point of vertex k: its column's floor, or the vertex itself. */
  const low = (k: number) => {
    const f = floors ? floors[k * 2] : NaN;
    return f === f ? Math.min(f, p[k * 3 + 1]) : p[k * 3 + 1];
  };
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]);
    y0 = Math.min(y0, p[i + 1], low(i / 3));
    z0 = Math.min(z0, p[i + 2]);
    x1 = Math.max(x1, p[i]);
    y1 = Math.max(y1, p[i + 1]);
    z1 = Math.max(z1, p[i + 2]);
  }
  const empty = x1 < x0 || y1 < y0 || z1 < z0;
  const cx = empty ? 0 : (x0 + x1) * 0.5;
  const cy = empty ? 0 : (y0 + y1) * 0.5;
  const cz = empty ? 0 : (z0 + z1) * 0.5;
  let most = 0;
  for (let i = 0; i < p.length; i += 3) {
    const dx = cx - p[i];
    const dy = Math.max(Math.abs(cy - p[i + 1]), Math.abs(cy - low(i / 3)));
    const dz = cz - p[i + 2];
    most = Math.max(most, dx * dx + dy * dy + dz * dz);
  }
  // (doubles, as three.js keeps them: a Float32Array would round them)
  return Float64Array.of(cx, cy, cz, Math.sqrt(most));
}
