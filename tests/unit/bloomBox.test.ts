import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector4 } from "three";
import { BloomBox } from "../../src/render3d/bloomBox";

/** A camera at the origin looking down −z, a 100 × 100 frame, and a batch of three instances 10 in front of it: one in
 *  the frame's middle, one at its edge, one far off to the side. */
function scene() {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const group = new Group();
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 3);
  [0, 5, 50].forEach((x, i) => mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, 0, -10)));
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3);
  mesh.geometry.setAttribute("grow", new InstancedBufferAttribute(new Float32Array([0, 0, 1, 0, 0, 2, 0, 0, 3]), 3));
  group.add(mesh);
  group.updateMatrixWorld();
  const near = new Mesh(new BoxGeometry(1, 1, 1));
  near.position.set(0, 0, -10);
  const far = new Mesh(new BoxGeometry(1, 1, 1));
  far.position.set(40, 0, -10);
  for (const m of [near, far]) m.updateMatrixWorld();
  return { camera, group, mesh, near, far };
}

describe("the bloom's box (bloomBox.ts)", () => {
  it("draws only the instances and chunks that meet the box round a start, and puts the batch back after", () => {
    const { camera, group, mesh, near, far } = scene();
    const ownGeometry = mesh.geometry;
    const ownMatrix = mesh.instanceMatrix;
    const box = new BloomBox();
    // the frame's middle fifth
    box.enter(group, [[near, far]], camera, new Vector4(40, 40, 20, 20), 100, 100);
    expect(mesh.count).toBe(1);
    expect(mesh.instanceMatrix.array[12]).toBe(0);
    expect(Array.from(mesh.instanceColor!.array.slice(0, 3))).toEqual([1, 0, 0]);
    expect(Array.from((mesh.geometry.getAttribute("grow") as InstancedBufferAttribute).array.slice(0, 3))).toEqual([0, 0, 1]);
    // (the batch's own geometry's other attributes shared, never copied)
    expect(mesh.geometry.getAttribute("position")).toBe(ownGeometry.getAttribute("position"));
    expect([near.visible, far.visible]).toEqual([true, false]);
    box.leave();
    expect(mesh.count).toBe(3);
    expect(mesh.geometry).toBe(ownGeometry);
    expect(mesh.instanceMatrix).toBe(ownMatrix);
    expect(far.visible).toBe(true);
    // the whole frame: the instance at the edge too
    box.enter(group, [[near, far]], camera, new Vector4(0, 0, 100, 100), 100, 100);
    expect(mesh.count).toBe(2);
    box.leave();
    box.dispose();
  });

  it("sends a box again only when the instances in it change, not as the camera turns a little", () => {
    const { camera, group, mesh } = scene();
    const box = new BloomBox();
    const rect = new Vector4(40, 40, 20, 20);
    box.enter(group, [], camera, rect, 100, 100);
    const sent = mesh.instanceMatrix.version;
    box.leave();
    camera.rotation.y = 0.001;
    camera.updateMatrixWorld();
    box.enter(group, [], camera, rect, 100, 100);
    expect(mesh.count).toBe(1);
    expect(mesh.instanceMatrix.version).toBe(sent);
    box.leave();
    // a batch moved: sent again
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(0.5, 0, -10));
    mesh.instanceMatrix.needsUpdate = true;
    box.enter(group, [], camera, rect, 100, 100);
    expect(mesh.instanceMatrix.array[12]).toBe(0.5);
    box.leave();
    box.dispose();
  });
});
