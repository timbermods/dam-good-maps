// The High look's trees and bushes on the map (#66, investigation/vegetation forest.ts; PLAN §20
// D241): whole-species instancing, at most 32 draws whatever the map's size or tree count. A plant is
// drawn with its close-up model while a unit of it takes more than 23 pixels on screen (staying close
// up down to 18, so it doesn't flicker) and with its far silhouette otherwise, and off screen (it
// still casts its shadow). The models change only when the camera does. Placement is deterministic
// (a few hundredths of a tile off the tile's middle, never out of it), and each batch carries the
// renderer's per-instance bookkeeping (`objects`, `follows`, `ty0`), so highlighting, removing, the
// pop of a placed plant and following painted ground work as they do for today's models.

import { BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type Camera, type ShaderMaterial } from "three";
import { DEAD, YOUNG, type EntityView } from "../model";
import { model, noise, placement, registry, species, type Detail, type Species } from "./models";

export const isPlant = (name: string): name is Species => (species as readonly string[]).includes(name);

/** The renderer's batch names of the models the forest replaces (entities3d.ts `modelKeyOf`). */
export function replacedBatch(name: string): boolean {
  const base = name.endsWith(".dead") ? name.slice(0, -5) : name;
  return isPlant(base);
}

/** Dead trees grow on screen when far off, with **Markers** (entities3d.ts GROW_DEAD). */
const GROW_DEAD = [14, 0, 2.5] as const;
const TREES = new Set(["Pine", "Birch", "Oak"]);

const cache = new Map<string, BufferGeometry>();
/** A model's geometry, made once for every view. */
function shape(name: Species, variant: number, detail: Detail, dead: boolean): BufferGeometry {
  const key = `${name}.${variant}.${detail}.${dead}`;
  let g = cache.get(key);
  if (!g) {
    g = model(name, variant, detail, dead);
    cache.set(key, g);
  }
  return g;
}

/** A batch's own geometry: the shared model's attributes, and its own instance data. */
function batchGeometry(base: BufferGeometry, n: number): BufferGeometry {
  const g = new BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) g.setAttribute(k, a);
  g.setAttribute("wind", new InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute("grow", new InstancedBufferAttribute(new Float32Array(n * 3), 3));
  g.boundingSphere = base.boundingSphere;
  g.boundingBox = base.boundingBox;
  return g;
}

interface Entry {
  index: number;
  species: Species;
  dead: boolean;
  variant: number;
  matrix: Matrix4;
  tint: Color;
  wind: [number, number, number, number];
  grow: readonly [number, number, number];
  near: boolean;
  /** World position of its root, and its tile. */
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  nearBatch: InstancedMesh;
  farBatch: InstancedMesh;
}

export class Forest {
  readonly meshes: InstancedMesh[] = [];
  private entries: Entry[] = [];
  private key = "";
  private offsetFn: ((tx: number, ty: number) => number) | null = null;
  /** Bumped at every re-layout (the depth map is drawn again). */
  revision = 0;
  stats = { plants: 0, near: 0, far: 0, triangles: 0, draws: 0, lodMs: 0 };

  /** `still`: no wind (the shelf's icons and ghosts). */
  constructor(view: EntityView, material: ShaderMaterial, still = false) {
    const m = new Matrix4();
    const byBatch = new Map<string, number>();
    const pending: Omit<Entry, "nearBatch" | "farBatch">[] = [];
    for (let i = 0; i < view.count; i++) {
      const name = view.templates[view.template[i]];
      if (!isPlant(name)) continue;
      const x = view.x[i];
      const y = view.y[i];
      const z = view.z[i];
      const dead = !!(view.flags[i] & DEAD);
      const p = placement(x, y, view.flags[i] & YOUNG ? 0.35 : 1);
      m.makeRotationY(p.turn).scale(new Vector3(p.scale, p.scale, p.scale));
      m.setPosition(x + 0.5 + p.dx, z, -y - 0.5 + p.dz);
      pending.push({
        index: i,
        species: name,
        dead,
        variant: p.variant,
        matrix: m.clone(),
        tint: new Color(1 + p.hue, 0.98 + noise(x, y, 9) * 0.04, 1 - p.hue),
        wind: [p.phase, p.rate, dead || still ? 0 : registry[name].wind, registry[name].height],
        grow: dead && TREES.has(name) ? GROW_DEAD : [0, 0, 1],
        // (an icon or ghost is always seen close up)
        near: still,
        x: x + 0.5,
        y: z,
        z: -y - 0.5,
        tx: x,
        ty: y,
      });
      const k = `${name}.${dead}`;
      byBatch.set(k, (byBatch.get(k) ?? 0) + 1);
    }
    const batches = new Map<string, InstancedMesh>();
    for (const [k, n] of byBatch) {
      const [name, deadText] = k.split(".") as [Species, string];
      const dead = deadText === "true";
      for (const detail of ["near", "far"] as const)
        for (let v = 0; v < (detail === "near" ? 3 : 1); v++) {
          const mesh = new InstancedMesh(batchGeometry(shape(name, v, detail, dead), n), material, n);
          mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.name = `high.${name}${dead ? ".dead" : ""}.${detail}.${v}`;
          mesh.userData.objects = new Int32Array(n).fill(-1);
          mesh.userData.follows = new Int32Array(n).fill(-1);
          mesh.userData.ty0 = new Float32Array(n);
          batches.set(`${k}.${detail}.${v}`, mesh);
          this.meshes.push(mesh);
        }
    }
    for (const e of pending) this.entries.push({ ...e, nearBatch: batches.get(`${e.species}.${e.dead}.near.${e.variant}`)!, farBatch: batches.get(`${e.species}.${e.dead}.far.0`)! });
    this.stats.plants = this.entries.length;
  }

  /** How far the ground under a tile has moved from the map's (the renderer's ground following);
   *  every re-layout stands the plants on it. */
  setGroundOffset(fn: ((tx: number, ty: number) => number) | null): void {
    this.offsetFn = fn;
  }

  /** Pick each plant's model for this camera (`pixels`: the view's height in CSS pixels; `detail`
   *  false: far models only, the lower-cost tier). Returns whether anything changed. */
  update(camera: Camera, pixels: number, detail: boolean, force = false): boolean {
    camera.updateMatrixWorld();
    const key = `${detail}|${pixels}|${camera.projectionMatrix.elements.join(",")}|${camera.matrixWorld.elements.join(",")}`;
    if (!force && key === this.key) return false;
    let changed = force || !this.key;
    this.key = key;
    const t0 = performance.now();
    const c = camera.matrixWorldInverse.elements;
    const proj = camera.projectionMatrix.elements;
    const ortho = proj[15] === 1;
    for (const e of this.entries) {
      const depth = -(c[2] * e.x + c[6] * e.y + c[10] * e.z + c[14]);
      const perUnit = (pixels * 0.5 * proj[5]) / (ortho ? 1 : Math.max(0.1, depth));
      const cx = c[0] * e.x + c[4] * e.y + c[8] * e.z + c[12];
      const cy = c[1] * e.x + c[5] * e.y + c[9] * e.z + c[13];
      const w = ortho ? 1 : depth;
      const onScreen = w > 0 && Math.abs(cx * proj[0]) < w * 1.25 && Math.abs(cy * proj[5]) < w * 1.25;
      const near = detail && onScreen && perUnit > (e.near ? 18 : 23);
      if (near !== e.near) changed = true;
      e.near = near;
    }
    if (changed) this.layout();
    this.stats.lodMs = performance.now() - t0;
    return changed;
  }

  /** Put every plant into its batch. */
  layout(): void {
    this.revision++;
    this.stats.near = this.stats.far = this.stats.triangles = this.stats.draws = 0;
    for (const mesh of this.meshes) {
      mesh.count = 0;
      (mesh.userData.objects as Int32Array).fill(-1);
      (mesh.userData.follows as Int32Array).fill(-1);
    }
    const m = new Matrix4();
    for (const e of this.entries) {
      const mesh = e.near ? e.nearBatch : e.farBatch;
      const i = mesh.count++;
      m.copy(e.matrix);
      const off = this.offsetFn?.(e.tx, e.ty) ?? 0;
      if (off) m.elements[13] += off;
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, e.tint);
      (mesh.geometry.getAttribute("wind") as InstancedBufferAttribute).setXYZW(i, ...e.wind);
      (mesh.geometry.getAttribute("grow") as InstancedBufferAttribute).setXYZ(i, ...e.grow);
      (mesh.userData.objects as Int32Array)[i] = e.index;
      (mesh.userData.follows as Int32Array)[i] = e.index;
      (mesh.userData.ty0 as Float32Array)[i] = e.matrix.elements[13];
      this.stats[e.near ? "near" : "far"]++;
    }
    for (const mesh of this.meshes) {
      mesh.visible = mesh.count > 0;
      if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.geometry.getAttribute("wind").needsUpdate = true;
      mesh.geometry.getAttribute("grow").needsUpdate = true;
      this.stats.triangles += (mesh.count * mesh.geometry.getAttribute("position").count) / 3;
      this.stats.draws++;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      // (the models' own attributes are shared with other batches: three.js uploads them again for
      // a batch still drawn)
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.meshes.length = 0;
  }
}
