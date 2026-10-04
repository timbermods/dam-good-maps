// A chunk's geometry kept on the GPU between remeshes (R1, the performance audit): a brush remeshes the
// same chunks every frame, and making new GPU buffers for each (and uploading an index the same for
// every chunk of that size) cost the page's thread more than the vertices that changed. A chunk's new
// mesh goes into its existing buffers when it fits (only the vertices it uses go up, and the index,
// the same pattern for any chunk, stays); else new buffers with room to grow. What is drawn is the
// same mesh, byte for byte: the draw range covers exactly its quads.

import { BufferAttribute, BufferGeometry, Sphere, Vector3, type TypedArray } from "three";
import { boundingSphereOf } from "./bounds";

/** A chunk mesh's vertex arrays (four vertices a quad) and how many quads it has. */
export interface ChunkArrays {
  quads: number;
  attributes: { name: string; array: Float32Array | Int8Array; itemSize: number; normalized?: boolean }[];
  /** Its bounding sphere (x, y, z, radius) when already made (`boundingSphereOf`, in a worker). */
  sphere?: Float64Array | null;
}

/** Room to grow, so a stroke's next remesh of the chunk fits. */
const HEADROOM = 1.5;

/** The quads' index (two triangles a quad, counter-clockwise), for `quads` quads. */
function quadIndex(quads: number): Uint32Array {
  const index = new Uint32Array(quads * 6);
  for (let q = 0; q < quads; q++) {
    const v = q * 4;
    const o = q * 6;
    index[o] = v;
    index[o + 1] = v + 1;
    index[o + 2] = v + 2;
    index[o + 3] = v;
    index[o + 4] = v + 2;
    index[o + 5] = v + 3;
  }
  return index;
}

/** How many quads the geometry has room for (0: none). */
function capacity(g: BufferGeometry): number {
  return g.index ? g.index.count / 6 : 0;
}

/** The chunk's mesh `d` in `g` when it fits there (true), with only the used vertices to go up. */
export function refillChunk(g: BufferGeometry, d: ChunkArrays): boolean {
  if (d.quads > capacity(g)) return false;
  for (const a of d.attributes) {
    const attr = g.getAttribute(a.name) as BufferAttribute | undefined;
    if (!attr || attr.itemSize !== a.itemSize || attr.normalized !== (a.normalized ?? false) || attr.array.constructor !== a.array.constructor) return false;
  }
  for (const a of d.attributes) {
    const attr = g.getAttribute(a.name) as BufferAttribute;
    (attr.array as TypedArray).set(a.array);
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, a.array.length);
    attr.needsUpdate = true;
  }
  g.setDrawRange(0, d.quads * 6);
  g.boundingSphere = sphereOf(d);
  return true;
}

/** A new geometry for the chunk's mesh `d`, with room to grow. */
export function chunkGeometry(d: ChunkArrays): BufferGeometry {
  const room = Math.ceil(d.quads * HEADROOM);
  const g = new BufferGeometry();
  for (const a of d.attributes) {
    const array = new (a.array.constructor as new (n: number) => Float32Array | Int8Array)(room * 4 * a.itemSize);
    array.set(a.array);
    g.setAttribute(a.name, new BufferAttribute(array, a.itemSize, a.normalized ?? false));
  }
  g.setIndex(new BufferAttribute(quadIndex(room), 1));
  g.setDrawRange(0, d.quads * 6);
  g.boundingSphere = sphereOf(d);
  return g;
}

/** The bounding sphere of the mesh's own vertices (not the room left after them). */
function sphereOf(d: ChunkArrays): Sphere {
  const s = d.sphere ?? boundingSphereOf(d.attributes.find((a) => a.name === "position")!.array as Float32Array);
  return new Sphere(new Vector3(s[0], s[1], s[2]), s[3]);
}
