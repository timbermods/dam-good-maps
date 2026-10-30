// The High look's trees and bushes on the map (#66, investigation/vegetation forest.ts; PLAN §20
// D241): whole-species instancing, at most 32 draws whatever the map's size or tree count. A plant is
// drawn with its close-up model while a unit of it takes more than 23 pixels on screen (staying close
// up down to 18, so it doesn't flicker) and with its far silhouette otherwise, and off screen (it
// still casts its shadow). The models change only when the camera does. Placement is deterministic
// (a few hundredths of a tile off the tile's middle, never out of it), and each batch carries the
// renderer's per-instance bookkeeping (`objects`, `follows`, `ty0`), so highlighting, removing, the
// pop of a placed plant and following painted ground work as they do for today's models.

import { BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type Camera, type Object3D, type ShaderMaterial } from "three";
import { whenIdle } from "../idle";
import { DEAD, DYING, YOUNG, type EntityView } from "../model";
import { model, noise, placement, registry, species, type Detail, type PlantState, type Species } from "./models";

export const isPlant = (name: string): name is Species => (species as readonly string[]).includes(name);

/** The renderer's batch names of the models the forest replaces (entities3d.ts `modelKeyOf`). */
export function replacedBatch(name: string): boolean {
  const base = name.replace(/\.(dead|dying)$/, "");
  return isPlant(base);
}

/** A plant's state from its flags: dead over dying. */
const stateOf = (flags: number): PlantState => (flags & DEAD ? "dead" : flags & DYING ? "dying" : "alive");

/** Dead trees grow on screen when far off, with **Markers** (entities3d.ts GROW_DEAD). */
const GROW_DEAD = [14, 0, 2.5] as const;
const TREES = new Set(["Pine", "Birch", "Oak"]);

const cache = new Map<string, BufferGeometry>();
/** A model's geometry, made once for every view. */
function shape(name: Species, variant: number, detail: Detail, state: PlantState): BufferGeometry {
  const key = `${name}.${variant}.${detail}.${state}`;
  let g = cache.get(key);
  if (!g) {
    g = model(name, variant, detail, state);
    cache.set(key, g);
  }
  return g;
}

/** The plants' models the forest may yet need, not made yet (a living species' dead and dying models: water drowns plants,
 *  dry ground starts them dying),
 *  each as a job for the page to do when idle (renderer `modelsAhead`). */
export function shapesAhead(view: EntityView): (() => void)[] {
  const out: (() => void)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < view.count; i++) {
    const name = view.templates[view.template[i]];
    if (!isPlant(name) || view.flags[i] & DEAD || seen.has(name)) continue;
    seen.add(name);
    for (const state of ["dead", "dying"] as const)
      for (const detail of ["near", "far"] as const)
        for (let v = 0; v < (detail === "near" ? 3 : 1); v++) if (!cache.has(`${name}.${v}.${detail}.${state}`)) out.push(() => void shape(name, v, detail, state));
  }
  return out;
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
  /** Young (drawn smaller) in the view the forest was made from (`reindex`). */
  young: boolean;
  species: Species;
  state: PlantState;
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

/** One batch of a species in one state (alive, dying or dead) and one model: its instances can hold every plant of the
 *  species, so a plant can change state without the batches being made again. */
function makeBatch(material: ShaderMaterial, name: Species, state: PlantState, detail: Detail, v: number, n: number): InstancedMesh {
  const mesh = new InstancedMesh(batchGeometry(shape(name, v, detail, state), n), material, n);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = `high.${name}${state === "alive" ? "" : `.${state}`}.${detail}.${v}`;
  mesh.userData.objects = new Int32Array(n).fill(-1);
  mesh.userData.follows = new Int32Array(n).fill(-1);
  mesh.userData.ty0 = new Float32Array(n);
  return mesh;
}

export class Forest {
  readonly meshes: InstancedMesh[] = [];
  /** Where the batches are drawn from (a batch made later joins it), set by the look. */
  parent: Object3D | null = null;
  private entries: Entry[] = [];
  private batches = new Map<string, InstancedMesh>();
  private perSpecies = new Map<string, number>();
  private still: boolean;
  private key = "";
  private offsetFn: ((tx: number, ty: number) => number) | null = null;
  /** Bumped at every re-layout (the depth map is drawn again). */
  revision = 0;
  stats = { plants: 0, near: 0, far: 0, triangles: 0, draws: 0, lodMs: 0 };

  /** `still`: no wind (the shelf's icons and ghosts). */
  constructor(view: EntityView, private material: ShaderMaterial, still = false) {
    this.still = still;
    const m = new Matrix4();
    const byBatch = new Map<string, number>();
    const pending: Omit<Entry, "nearBatch" | "farBatch">[] = [];
    for (let i = 0; i < view.count; i++) {
      const name = view.templates[view.template[i]];
      if (!isPlant(name)) continue;
      const x = view.x[i];
      const y = view.y[i];
      const z = view.z[i];
      const state = stateOf(view.flags[i]);
      const dead = state === "dead";
      const p = placement(x, y, view.flags[i] & YOUNG ? 0.35 : 1, name);
      m.makeRotationY(p.turn).scale(new Vector3(p.scale, p.scaleY, p.scale));
      m.setPosition(x + 0.5 + p.dx, z, -y - 0.5 + p.dz);
      pending.push({
        index: i,
        young: !!(view.flags[i] & YOUNG),
        species: name,
        state,
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
      const k = `${name}.${state}`;
      byBatch.set(k, (byBatch.get(k) ?? 0) + 1);
      this.perSpecies.set(name, (this.perSpecies.get(name) ?? 0) + 1);
    }
    for (const k of byBatch.keys()) {
      const [name, state] = k.split(".") as [Species, PlantState];
      this.ensure(name, state);
    }
    for (const e of pending) this.entries.push({ ...e, nearBatch: this.batches.get(`${e.species}.${e.state}.near.${e.variant}`)!, farBatch: this.batches.get(`${e.species}.${e.state}.far.0`)! });
    this.stats.plants = this.entries.length;
  }

  /** The batches of a species in a state, made when first needed (room for every plant of the species). */
  private ensure(name: Species, state: PlantState): void {
    if (this.batches.has(`${name}.${state}.far.0`)) return;
    const n = this.perSpecies.get(name) ?? 0;
    for (const detail of ["near", "far"] as const)
      for (let v = 0; v < (detail === "near" ? 3 : 1); v++) {
        const mesh = makeBatch(this.material, name, state, detail, v, n);
        this.batches.set(`${name}.${state}.${detail}.${v}`, mesh);
        this.meshes.push(mesh);
        // (made after the look drew the forest: it joins the same group, as the others did)
        if (this.parent) {
          mesh.renderOrder = 1;
          this.parent.add(mesh);
        }
      }
  }

  /** The same plants as the forest was made from, in the same order, numbered as `view` numbers them (objects put in
   *  or taken out among them move the plants' numbers): the batches' bookkeeping follows, nothing else is made again
   *  (a plant that died, started dying or came back since: `setState`). False, with nothing changed, when the plants differ. */
  reindex(view: EntityView): boolean {
    const index: number[] = [];
    // (each template asked once: a map has thousands of objects and a handful of templates)
    const plant = view.templates.map(isPlant);
    for (let i = 0; i < view.count; i++) if (plant[view.template[i]]) index.push(i);
    if (index.length !== this.entries.length) return false;
    for (let j = 0; j < index.length; j++) {
      const e = this.entries[j];
      const i = index[j];
      if (view.templates[view.template[i]] !== e.species || view.x[i] !== e.tx || view.y[i] !== e.ty || view.z[i] !== e.y || !!(view.flags[i] & YOUNG) !== e.young) return false;
    }
    if (this.entries.every((e, j) => e.index === index[j])) return true;
    this.entries.forEach((e, j) => (e.index = index[j]));
    // (each instance's object, laid out as `layout` lays them)
    const slot = new Map<InstancedMesh, number>();
    for (const e of this.entries) {
      const mesh = e.near ? e.nearBatch : e.farBatch;
      const i = slot.get(mesh) ?? 0;
      slot.set(mesh, i + 1);
      (mesh.userData.objects as Int32Array)[i] = e.index;
      (mesh.userData.follows as Int32Array)[i] = e.index;
    }
    return true;
  }

  /** Plants change state in place (the Weather view's withering, the ground starting them dying): each plant whose DEAD
   *  or DYING flag differs from the state it is drawn in moves to that state's batch, and every plant is laid out again,
   *  which is cheap (the models, the batches and the shadows' casters are not made again). `flags` is indexed like the
   *  view the forest was made from. Returns how many plants changed. */
  setState(flags: ArrayLike<number>): number {
    let changed = 0;
    for (const e of this.entries) {
      const state = stateOf(flags[e.index]);
      if (state === e.state) continue;
      changed++;
      e.state = state;
      const dead = state === "dead";
      e.wind[2] = dead || this.still ? 0 : registry[e.species].wind;
      e.grow = dead && TREES.has(e.species) ? GROW_DEAD : [0, 0, 1];
      this.ensure(e.species, state);
      e.nearBatch = this.batches.get(`${e.species}.${state}.near.${e.variant}`)!;
      e.farBatch = this.batches.get(`${e.species}.${state}.far.0`)!;
    }
    if (changed) this.layout();
    return changed;
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
      // a batch still drawn; the GPU buffers let go when the page has a moment, as each one put away searches all of
      // three.js's state)
      whenIdle(() => {
        mesh.geometry.dispose();
        mesh.dispose();
      });
    }
    this.meshes.length = 0;
  }
}
