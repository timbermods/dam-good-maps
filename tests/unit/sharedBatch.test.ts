// A batch sharing its model's attributes (High's forest and landmarks) is put away without its model's: three.js frees
// what a geometry holds when it is disposed, and the model's buffers are still drawn by the other batches of it.

import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { disposeSharedBatch } from "../../src/render3d/high/sharedBatch";

describe("disposeSharedBatch", () => {
  it("lets go of the batch's own instance data only, never the model's attributes", () => {
    const model = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(9), 3);
    const normal = new BufferAttribute(new Float32Array(9), 3);
    model.setAttribute("position", position);
    model.setAttribute("normal", normal);
    const batch = new BufferGeometry();
    for (const [k, a] of Object.entries(model.attributes)) batch.setAttribute(k, a);
    const grow = new InstancedBufferAttribute(new Float32Array(6), 3);
    batch.setAttribute("grow", grow);
    const mesh = new InstancedMesh(batch, new MeshBasicMaterial(), 2);
    // (what three.js frees: the attributes the geometry holds when its dispose event fires)
    let freed: unknown[] = [];
    batch.addEventListener("dispose", () => (freed = Object.values(batch.attributes)));
    let meshDisposed = false;
    mesh.addEventListener("dispose", () => (meshDisposed = true));
    disposeSharedBatch(mesh);
    expect(freed).toEqual([grow]);
    expect(meshDisposed).toBe(true);
    expect(model.getAttribute("position")).toBe(position);
    expect(model.getAttribute("normal")).toBe(normal);
  });
});
