// The objects a start's bloom box holds (D453; renderer.ts `bloomRect`, bloom.ts `drawSource`). The bloom's source is the
// frame drawn again, only inside the box round each start whose fire shows; the scissor spares it the pixels outside,
// not the vertices: every plant on the map would be drawn a second time (three quarters of a million triangles, 0.75 ms
// of a frame's 3.5 at Four Lakes' opening camera), for a few in the box. So while the source is drawn, each instanced
// batch of objects draws only its instances whose bounds meet the box's frustum (the camera's, narrowed to the box):
// their copies, made again only when the camera, the box or the batch changes; and the land's and the water's chunks
// wholly outside it are not drawn. What stands in the box is drawn as the view draws it, the plants in front of a
// lantern hiding it; nothing outside the box could be.

import { BufferGeometry, Frustum, InstancedBufferAttribute, Matrix4, Sphere, type Camera, type InstancedMesh, type Mesh, type Object3D, type Vector4 } from "three";

/** A batch's instances in the box: its geometry with its own instanced attributes (the rest shared), its matrices and
 *  colours, how many. */
interface Box {
  geometry: BufferGeometry;
  matrix: InstancedBufferAttribute;
  colour: InstancedBufferAttribute | null;
  count: number;
  /** Which of the batch's instances these are, and the versions of the batch's instanced attributes they were copied
   *  from. */
  pick: Int32Array;
  from: number[];
}

/** A batch as it was before `enter` swapped its box in. */
interface Kept {
  mesh: InstancedMesh;
  geometry: BufferGeometry;
  matrix: InstancedBufferAttribute;
  colour: InstancedBufferAttribute | null;
  count: number;
}

/** What an instance can grow by on screen beyond its matrix (materials.ts `objectMaterial`'s `grow`, its third number the
 *  most) is read per instance; this is the margin the plants' sway adds (high/shaders.ts `bendNormal`). */
const SWAY = 1.1;
const IDENTITY = new Matrix4();

export class BloomBox {
  private boxes = new Map<InstancedMesh, Box>();
  private kept: Kept[] = [];
  private hidden: Mesh[] = [];
  /** What the boxes were made for: the camera's matrices, the box, and each batch's state. */
  private made: number[] = [];
  private readonly now: number[] = [];
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  private readonly sphere = new Sphere();

  /** Swap into each instanced batch under `objects` its instances in the box (`rect`, the drawing buffer's pixels from
   *  its lower left, of `width` × `height`), and hide the `chunks` (the land's and the water's) wholly outside it, until
   *  `leave`. */
  enter(objects: Object3D | null, chunks: Iterable<Mesh>[], camera: Camera, rect: Vector4, width: number, height: number): void {
    const meshes: InstancedMesh[] = [];
    for (const c of objects?.children ?? []) if (c.visible && (c as InstancedMesh).isInstancedMesh) meshes.push(c as InstancedMesh);
    const key = this.now;
    key.length = 0;
    key.push(...camera.matrixWorldInverse.elements, ...camera.projectionMatrix.elements, rect.x, rect.y, rect.z, rect.w, width, height);
    for (const mesh of meshes) {
      key.push(mesh.id, mesh.count, mesh.instanceMatrix.version, mesh.instanceColor?.version ?? -1, ...mesh.matrixWorld.elements);
      for (const a of Object.values(mesh.geometry.attributes)) if ((a as InstancedBufferAttribute).isInstancedBufferAttribute) key.push((a as InstancedBufferAttribute).version);
    }
    if (key.length !== this.made.length || key.some((v, i) => v !== this.made[i])) {
      this.made = [...key];
      this.make(meshes, camera, rect, width, height);
    }
    for (const list of chunks)
      for (const c of list) {
        if (!c.visible) continue;
        const g = c.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        this.sphere.copy(g.boundingSphere!).applyMatrix4(c.matrixWorld);
        if (this.frustum.intersectsSphere(this.sphere)) continue;
        c.visible = false;
        this.hidden.push(c);
      }
    for (const mesh of meshes) {
      const box = this.boxes.get(mesh);
      if (!box) continue;
      // (the batch's own bounds, for the view's culling, worked out from its own instances, never the box's)
      if (mesh.frustumCulled && !mesh.boundingSphere) mesh.computeBoundingSphere();
      this.kept.push({ mesh, geometry: mesh.geometry, matrix: mesh.instanceMatrix, colour: mesh.instanceColor, count: mesh.count });
      mesh.geometry = box.geometry;
      mesh.instanceMatrix = box.matrix;
      mesh.instanceColor = box.colour;
      mesh.count = box.count;
    }
  }

  /** Put every batch's own instances back. */
  leave(): void {
    for (const c of this.hidden) c.visible = true;
    this.hidden.length = 0;
    for (const k of this.kept) {
      k.mesh.geometry = k.geometry;
      k.mesh.instanceMatrix = k.matrix;
      k.mesh.instanceColor = k.colour;
      k.mesh.count = k.count;
    }
    this.kept.length = 0;
  }

  dispose(): void {
    this.leave();
    for (const box of this.boxes.values()) drop(box);
    this.boxes.clear();
    this.made = [];
  }

  private make(meshes: InstancedMesh[], camera: Camera, rect: Vector4, width: number, height: number): void {
    // the camera's frustum narrowed to the box: clip space scaled so the box's edges are its own
    const x0 = (2 * rect.x) / width - 1;
    const x1 = (2 * (rect.x + rect.z)) / width - 1;
    const y0 = (2 * rect.y) / height - 1;
    const y1 = (2 * (rect.y + rect.w)) / height - 1;
    const sx = 2 / Math.max(1e-6, x1 - x0);
    const sy = 2 / Math.max(1e-6, y1 - y0);
    this.m.set(sx, 0, 0, -(x1 + x0) / Math.max(1e-6, x1 - x0), 0, sy, 0, -(y1 + y0) / Math.max(1e-6, y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
    this.m.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m, camera.coordinateSystem);
    const live = new Set(meshes);
    for (const [mesh, box] of this.boxes)
      if (!live.has(mesh)) {
        drop(box);
        this.boxes.delete(mesh);
      }
    for (const mesh of meshes) {
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bounds = g.boundingSphere!;
      const n = mesh.count;
      let box = this.boxes.get(mesh);
      if (!box || box.matrix.count < n || box.geometry.userData.of !== g) {
        if (box) drop(box);
        box = this.boxOf(mesh, n);
        this.boxes.set(mesh, box);
      }
      const grow = g.getAttribute("grow") as InstancedBufferAttribute | undefined;
      // (`grow`'s third number: the most an instance grows; instanced, three to an instance)
      const own = Object.entries(g.attributes).filter(([, a]) => (a as InstancedBufferAttribute).isInstancedBufferAttribute) as [string, InstancedBufferAttribute][];
      const src = mesh.instanceMatrix.array;
      const colours = mesh.instanceColor?.array;
      const growing = grow?.array;
      const w = mesh.matrixWorld;
      const plain = w.equals(IDENTITY);
      const worldScale = plain ? 1 : w.getMaxScaleOnAxis();
      const { x: bx, y: by, z: bz } = bounds.center;
      const p = this.planes;
      this.frustum.planes.forEach((q, j) => p.set([q.normal.x, q.normal.y, q.normal.z, q.constant], j * 4));
      const pick = box.pick;
      let k = 0;
      let same = true;
      for (let i = 0; i < n; i++) {
        // (inline, for the thousands of a map's plants: the bounds' centre through the instance's matrix, its radius by
        // its largest axis, as large as the instance can grow when small on screen, and the plants' sway)
        const o = i * 16;
        const c = this.sphere.center.set(
          src[o] * bx + src[o + 4] * by + src[o + 8] * bz + src[o + 12],
          src[o + 1] * bx + src[o + 5] * by + src[o + 9] * bz + src[o + 13],
          src[o + 2] * bx + src[o + 6] * by + src[o + 10] * bz + src[o + 14],
        );
        if (!plain) c.applyMatrix4(w);
        const s2 = Math.max(src[o] ** 2 + src[o + 1] ** 2 + src[o + 2] ** 2, src[o + 4] ** 2 + src[o + 5] ** 2 + src[o + 6] ** 2, src[o + 8] ** 2 + src[o + 9] ** 2 + src[o + 10] ** 2);
        const r = bounds.radius * Math.sqrt(s2) * worldScale * (growing ? Math.max(1, Math.abs(growing[i * 3 + 2])) : 1) * SWAY;
        let inside = true;
        for (let j = 0; j < 24; j += 4)
          if (p[j] * c.x + p[j + 1] * c.y + p[j + 2] * c.z + p[j + 3] < -r) {
            inside = false;
            break;
          }
        if (!inside) continue;
        if (pick[k] !== i) same = false;
        pick[k++] = i;
      }
      // (the same instances from the same batch as before, as the camera turns a little: nothing to send again, a
      // buffer the last frame drew from being rewritten costing the GPU more than the box saves)
      const from = [mesh.instanceMatrix.version, mesh.instanceColor?.version ?? -1, ...own.map(([, a]) => a.version)];
      if (same && k === box.count && from.every((v, j) => v === box!.from[j])) continue;
      box.from = from;
      box.count = k;
      for (let j = 0; j < k; j++) {
        const i = pick[j];
        (box.matrix.array as Float32Array).set(src.subarray(i * 16, i * 16 + 16), j * 16);
        if (colours && box.colour) (box.colour.array as Float32Array).set(colours.subarray(i * 3, i * 3 + 3), j * 3);
        for (const [name, a] of own) {
          const to = box.geometry.getAttribute(name) as InstancedBufferAttribute;
          (to.array as Float32Array).set((a.array as Float32Array).subarray(i * a.itemSize, (i + 1) * a.itemSize), j * a.itemSize);
        }
      }
      for (const a of [box.matrix, box.colour, ...own.map(([name]) => box!.geometry.getAttribute(name) as InstancedBufferAttribute)]) {
        if (!a || !k) continue;
        a.clearUpdateRanges();
        a.addUpdateRange(0, k * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
  private readonly planes = new Float64Array(24);

  /** A batch's box, with room for `n` instances: its geometry sharing the batch's own attributes but the instanced ones. */
  private boxOf(mesh: InstancedMesh, n: number): Box {
    const g = mesh.geometry;
    const geometry = new BufferGeometry();
    geometry.setIndex(g.index);
    for (const [name, a] of Object.entries(g.attributes)) {
      const i = a as InstancedBufferAttribute;
      geometry.setAttribute(name, i.isInstancedBufferAttribute ? new InstancedBufferAttribute(new Float32Array(n * i.itemSize), i.itemSize) : a);
    }
    for (const gr of g.groups) geometry.addGroup(gr.start, gr.count, gr.materialIndex);
    geometry.setDrawRange(g.drawRange.start, g.drawRange.count);
    geometry.boundingSphere = g.boundingSphere;
    geometry.boundingBox = g.boundingBox;
    geometry.userData.of = g;
    return {
      geometry,
      matrix: new InstancedBufferAttribute(new Float32Array(n * 16), 16),
      colour: mesh.instanceColor ? new InstancedBufferAttribute(new Float32Array(n * 3), 3) : null,
      count: 0,
      pick: new Int32Array(n),
      from: [],
    };
  }
}

/** A box's own buffers freed: its geometry disposed with only its own attributes on it (disposing it with the batch's
 *  shared ones would free those under the batch). */
function drop(box: Box): void {
  const g = box.geometry;
  for (const name of Object.keys(g.attributes)) if (!(g.attributes[name] as InstancedBufferAttribute).isInstancedBufferAttribute) g.deleteAttribute(name);
  g.setIndex(null);
  g.setAttribute("instanceMatrix", box.matrix);
  if (box.colour) g.setAttribute("instanceColor", box.colour);
  g.dispose();
}
