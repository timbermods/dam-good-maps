// Refreshed objects and landmarks for the High look (#67 stage 3, investigation/maplook-finish
// landmarks.ts; PLAN §20 D250): procedural models of our own, in place of today's, on the same
// transforms, footprints and tints: relics as plain chipped stumps, geothermal vents, a bramble of
// thorns, rubble and log debris for blockages and natural dams, and a few steel gussets and bolts on the
// ruins' scaffolds and the mine's frame. The start (the game's lantern tower) and the water and badwater
// sources (its rock outcrop and crater) are Standard's models, the game's shapes (D496), in High's
// materials. Slopes keep their ramp in natural materials. Each replacement carries the original batch's
// per-instance bookkeeping, so highlighting, removing and following the ground work as before; off, the
// originals come back.

import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, TorusGeometry, Vector3, type Group, type ShaderMaterial } from "three";
import type { EntityView } from "../model";
import { whenIdle } from "../idle";
import { GEOTHERMAL, GEOTHERMAL_ROCK, MINE, RELIC_STONE, RUIN, THORNS, type Rgb } from "../palette";

const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const hash = (i: number) => {
  const x = Math.sin(i * 73.17 + 9.31) * 4173.91;
  return x - Math.floor(x);
};

class Parts {
  pos: number[] = [];
  norm: number[] = [];
  col: number[] = [];
  lod: number[] = [];
  add(g: BufferGeometry, c: Rgb, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, lod = 0): this {
    const source = g.index ? g.toNonIndexed() : g;
    source.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    const p = source.getAttribute("position");
    const n = source.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.norm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(c[0], c[1], c[2]);
      this.lod.push(lod);
    }
    source.dispose();
    if (source !== g) g.dispose();
    return this;
  }
  copy(g: BufferGeometry): this {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute("position");
    const n = src.getAttribute("normal");
    const c = src.getAttribute("pcolor");
    const l = src.getAttribute("lod");
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.norm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(c.getX(i), c.getY(i), c.getZ(i));
      this.lod.push(l ? l.getX(i) : 0);
    }
    if (src !== g) src.dispose();
    return this;
  }
  beam(a: number[], b: number[], r: number, c: Rgb, lod = 0): this {
    const A = new Vector3(a[0], a[1], a[2]);
    const B = new Vector3(b[0], b[1], b[2]);
    const d = B.clone().sub(A);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
    const g = new CylinderGeometry(r * 0.85, r, d.length(), 6).applyQuaternion(q);
    const centre = A.add(B).multiplyScalar(0.5);
    return this.add(g, c, centre.x, centre.y, centre.z, 0, 0, 0, lod);
  }
  box(w: number, h: number, d: number, c: Rgb, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, lod = 0): this {
    return this.add(new BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz, lod);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.norm, 3));
    g.setAttribute("pcolor", new Float32BufferAttribute(this.col, 3));
    g.setAttribute("lod", new Float32BufferAttribute(this.lod, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function rock(m: Parts, x: number, y: number, z: number, r: number, c: Rgb, seed: number, lod = 0): void {
  const g = new IcosahedronGeometry(r, 0);
  g.scale(0.82 + hash(seed) * 0.35, 0.63 + hash(seed + 1) * 0.35, 0.82 + hash(seed + 2) * 0.35);
  m.add(g, c, x, y, z, 0, seed, seed * 0.31, lod);
}

function relic(type: string): BufferGeometry {
  const m = new Parts();
  const large = type === "LargeRelic";
  const medium = type === "MediumRelic";
  const w = type === "SmallRelic" ? 1.86 : 2.86;
  const d = large ? 2.86 : medium ? 1.86 : 0.86;
  // the same simple stumps and footprint as Standard, no classical trim
  m.box(w, 0.13, d, shade(RELIC_STONE, 0.77), 0, 0.065);
  const columns = large ? [[-1, -1, 1.9], [1, -1, 1.5], [-1, 1, 1.2], [1, 1, 0.7], [0, -1, 0.4]] : medium ? [[-1, -0.5, 1.2], [0, -0.5, 0.5], [1, -0.5, 0.95], [-1, 0.5, 0.35], [1, 0.5, 1.4]] : [[-0.5, 0, 0.9], [0.5, 0, 0.45]];
  for (const [index, [x, z, h]] of columns.entries()) {
    const g = new CylinderGeometry(0.17, 0.2, h, 7, 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getZ(i), p.getX(i));
      const chip = 0.9 + 0.1 * hash(Math.round(angle * 100) + index * 31);
      const y = p.getY(i);
      p.setXYZ(i, p.getX(i) * chip, y + (y > h * 0.48 ? (hash(Math.round(angle * 100) + index * 19) - 0.5) * 0.16 : 0), p.getZ(i) * chip);
    }
    g.computeVertexNormals();
    m.add(g, shade(RELIC_STONE, 0.94 + hash(index) * 0.1), x, 0.13 + h / 2, z);
  }
  for (let k = 0; k < (large ? 4 : 2); k++) rock(m, (hash(k + 37) - 0.5) * w, 0.15, (hash(k + 73) - 0.5) * d, 0.045 + hash(k + 4) * 0.065, shade(RELIC_STONE, 0.86), k, 1);
  return m.geometry();
}

function bramble(): BufferGeometry {
  const m = new Parts();
  for (let k = 0; k < 10; k++) {
    const a = k * 2.4;
    const r = 0.22 + hash(k) * 0.13;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const end = [x * 1.27, 0.26 + hash(k + 1) * 0.28, z * 1.27];
    m.beam([x * 0.3, 0.04, z * 0.3], end, 0.028, shade(THORNS, 0.72 + hash(k + 7) * 0.52));
    m.beam(end, [end[0] * 0.4, end[1] * 1.25, end[2] * 0.4], 0.017, shade(THORNS, 1.22));
    for (let j = 0; j < 3; j++) {
      const y = 0.15 + j * 0.08;
      m.beam([x * 0.8, y, z * 0.8], [x * 1.15, y + 0.11, z * 1.15], 0.013, [0.61, 0.39, 0.25], 1);
    }
  }
  rock(m, 0, 0.12, 0, 0.22, shade(THORNS, 0.67), 11);
  return m.geometry();
}

function geothermal(): BufferGeometry {
  const m = new Parts();
  for (let k = 0; k < 15; k++) rock(m, (hash(k) - 0.5) * 2.45, 0.16, (hash(k + 16) - 0.5) * 2.45, 0.35 + hash(k + 8) * 0.3, shade(GEOTHERMAL_ROCK, 0.9 + hash(k) * 0.4), k);
  for (const [x, z, r] of [[-0.72, -0.58, 0.23], [0.61, 0.45, 0.18], [0.12, -0.41, 0.16], [-0.38, 0.68, 0.2]]) {
    m.add(new CylinderGeometry(r, r * 1.35, 0.16, 8), shade(GEOTHERMAL_ROCK, 0.75), x, 0.36, z);
    m.add(new CylinderGeometry(r * 0.81, r * 0.81, 0.025, 9), shade(GEOTHERMAL, 1.15), x, 0.45, z);
    m.add(new TorusGeometry(r * 1.02, 0.025, 3, 8), [0.59, 0.42, 0.24], x, 0.46, z, Math.PI / 2, 0, 0, 1);
  }
  return m.geometry();
}

function debris(dam: boolean): BufferGeometry {
  const m = new Parts();
  for (let k = 0; k < 6; k++) rock(m, (hash(k) - 0.5) * 0.56, 0.18 + (k > 3 ? 0.19 : 0), (hash(k + 12) - 0.5) * 0.56, 0.23 + hash(k + 3) * 0.09, dam ? [0.45, 0.4, 0.28] : [0.53, 0.49, 0.42], k);
  if (dam)
    for (let k = 0; k < 7; k++) {
      const z = (k - 3) * 0.1;
      const y = 0.26 + (k % 3) * 0.07;
      m.beam([-0.44, y, z - 0.07], [0.43, y + 0.04, z + 0.07], 0.055, [0.39 + 0.025 * k, 0.27 + 0.017 * k, 0.14 + 0.012 * k]);
    }
  else for (let k = 0; k < 5; k++) rock(m, (hash(k + 92) - 0.5) * 0.67, 0.05, (hash(k + 55) - 0.5) * 0.67, 0.1, [0.65, 0.58, 0.46], k, 1);
  return m.geometry();
}

/** Today's model with a little more: steel gussets and bolts on a ruin's scaffold, bolts and slats on the mine's
 *  frame. The approved shapes stay. */
function augment(key: string, base: BufferGeometry): BufferGeometry {
  const m = new Parts().copy(base);
  if (key.startsWith("scaffold.")) {
    for (const x of [-0.42, 0.42])
      for (const z of [-0.42, 0.42]) {
        m.box(0.14, 0.08, 0.14, shade(RUIN.rust, 0.77), x, 0.06, z, 0, 0, 0, 1);
        m.add(new CylinderGeometry(0.025, 0.025, 0.012, 6), [0.61, 0.47, 0.31], x, 0.11, z, 0, 0, 0, 1);
      }
  } else if (key === "UndergroundRuins") {
    for (const x of [-2.37, 2.37]) for (const z of [-2.37, 2.37]) m.add(new CylinderGeometry(0.065, 0.065, 0.025, 6), [0.62, 0.52, 0.35], x, 0.185, z, 0, 0, 0, 1);
    for (const z of [-2.25, 2.25]) for (let k = 0; k < 11; k++) m.box(0.026, 0.014, 0.18, shade(MINE.wood, 0.7), -2 + k * 0.4, 0.2, z, 0, 0, 0, 1);
  }
  return m.geometry();
}

/** A template's kind of landmark, or undefined for one the look leaves as it is. */
export function landmarkKind(template: string): string | undefined {
  if (template.startsWith("RuinColumn")) return "ruins";
  return (
    {
      UndergroundRuins: "mine",
      SmallRelic: "relics",
      MediumRelic: "relics",
      LargeRelic: "relics",
      StartingLocation: "start",
      GeothermalField: "geothermal",
      Thorns: "thorns",
      Slope: "slopes",
      NaturalDam: "dams",
      Blockage: "blocks",
      WaterSource: "sources",
      BadwaterSource: "sources",
    } as Record<string, string>
  )[template];
}

const models = new Map<string, BufferGeometry>();
/** A landmark's geometry, made once (the ones built on today's models, per model: today's batch, whatever object it
 *  draws first). */
function geometryFor(name: string, batch: string, base: BufferGeometry): BufferGeometry {
  const key = name === "StartingLocation" || name.endsWith("Relic") || ["Thorns", "GeothermalField", "WaterSource", "BadwaterSource", "Blockage", "NaturalDam"].includes(name) ? name : `|${batch}`;
  let g = models.get(key);
  if (!g) {
    // (the start and the sources are the game's models, D496: Standard's own, in High's materials and light)
    if (name === "StartingLocation" || name === "WaterSource" || name === "BadwaterSource") g = new Parts().copy(base).geometry();
    else if (name.endsWith("Relic")) g = relic(name);
    else if (name === "Thorns") g = bramble();
    else if (name === "GeothermalField") g = geothermal();
    else if (name === "Blockage" || name === "NaturalDam") g = debris(name === "NaturalDam");
    else g = augment(batch, base);
    models.set(key, g);
  }
  return g;
}

export interface Replacement {
  /** Today's batch it replaces, hidden while the landmarks show. */
  old: InstancedMesh;
  fresh: InstancedMesh;
  /** The instances of `old` it draws, in order. */
  slots: number[];
}

/** The landmarks for the objects the renderer built (`group`, from entities3d.ts buildEntities), as
 *  new batches beside today's; `slopes` draws the slopes' ramps. `kept`: landmarks of batches the renderer kept as
 *  they were (buildEntities' reuse), kept with them, their objects as the batch's are now. */
export function buildLandmarks(group: Group, e: EntityView, material: ShaderMaterial, slopes: ShaderMaterial, kept: readonly Replacement[] = []): Replacement[] {
  const out: Replacement[] = [];
  const m = new Matrix4();
  const keep = new Map<InstancedMesh, Replacement[]>();
  for (const r of kept) keep.set(r.old, [...(keep.get(r.old) ?? []), r]);
  for (const child of [...group.children]) {
    const old = child as InstancedMesh;
    const objects = old.userData.objects as Int32Array | undefined;
    if (!old.isInstancedMesh || !objects?.length || old.name.startsWith("high.")) continue;
    const same = keep.get(old);
    if (same) {
      const follows = old.userData.follows as Int32Array | undefined;
      const ty0 = old.userData.ty0 as Float32Array | undefined;
      for (const r of same) {
        const n = r.slots.length;
        const own = new Int32Array(n);
        for (let j = 0; j < n; j++) own[j] = objects[r.slots[j]];
        r.fresh.userData.objects = own;
        // (the heights the batch now settles to, as its own: `buildEntities` renewed them)
        if (follows && ty0 && r.fresh.userData.follows) {
          const f = new Int32Array(n);
          const t = new Float32Array(n);
          for (let j = 0; j < n; j++) {
            f[j] = follows[r.slots[j]];
            t[j] = ty0[r.slots[j]];
          }
          r.fresh.userData.follows = f;
          r.fresh.userData.ty0 = t;
        }
        out.push(r);
      }
      keep.delete(old);
      continue;
    }
    // the slope's arrow and the start's entrance keep their exact size
    if (old.name === "Slope.mark" || old.name === "start.entrance") continue;
    const first = e.templates[e.template[objects[0]]];
    if (!landmarkKind(first)) continue;
    const names = old.name === "block.rubble" ? new Set(Array.from(objects, (k) => e.templates[e.template[k]])) : new Set([first]);
    for (const name of names) {
      const slots = Array.from(objects, (_, i) => i).filter((i) => old.name !== "block.rubble" || e.templates[e.template[objects[i]]] === name);
      const shared = geometryFor(name, old.name, old.geometry);
      const g = new BufferGeometry();
      for (const [k, a] of Object.entries(shared.attributes)) g.setAttribute(k, a);
      g.boundingSphere = shared.boundingSphere;
      const fresh = new InstancedMesh(g, name === "Slope" ? slopes : material, slots.length);
      const grow = old.geometry.getAttribute("grow");
      const tint = old.instanceColor;
      const grows = new Float32Array(slots.length * 3);
      const colours = new Float32Array(slots.length * 3);
      const follows = old.userData.follows as Int32Array | undefined;
      const ty0 = old.userData.ty0 as Float32Array | undefined;
      // (debris carries its own colours)
      const tinted = !!tint && name !== "NaturalDam" && name !== "Blockage";
      if (slots.length === objects.length && grow) {
        // (every instance of today's batch, in order: its arrays as they are)
        fresh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, slots.length * 16));
        grows.set(grow.array.subarray(0, slots.length * 3) as Float32Array);
        if (tinted) colours.set(tint.array.subarray(0, slots.length * 3) as Float32Array);
        else colours.fill(1);
      } else
        slots.forEach((i, j) => {
          old.getMatrixAt(i, m);
          fresh.setMatrixAt(j, m);
          if (grow) grows.set([grow.getX(i), grow.getY(i), grow.getZ(i)], j * 3);
          else grows.set([0, 0, 1], j * 3);
          if (tinted) colours.set([tint.getX(i), tint.getY(i), tint.getZ(i)], j * 3);
          else colours.set([1, 1, 1], j * 3);
        });
      g.setAttribute("grow", new InstancedBufferAttribute(grows, 3));
      fresh.instanceColor = new InstancedBufferAttribute(colours, 3);
      fresh.instanceMatrix.needsUpdate = true;
      fresh.frustumCulled = false;
      fresh.name = `high.${name}`;
      fresh.userData.objects = Int32Array.from(slots, (i) => objects[i]);
      if (follows && ty0) {
        fresh.userData.follows = Int32Array.from(slots, (i) => follows[i]);
        fresh.userData.ty0 = Float32Array.from(slots, (i) => ty0[i]);
      }
      out.push({ old, fresh, slots });
    }
  }
  // (kept for a batch that is no longer drawn: put away)
  disposeLandmarks([...keep.values()].flat());
  return out;
}

/** Make ahead the landmark of a ruin's scaffold batch `batch` drawn with the model `base` (entities3d.ts `modelsAhead`):
 *  nothing for a batch the look leaves as it is. */
export function landmarkAhead(batch: string, base: BufferGeometry): void {
  if (batch.startsWith("scaffold.")) geometryFor("", batch, base);
}

/** Put a set of replacements away. */
export function disposeLandmarks(r: readonly Replacement[]): void {
  for (const { old, fresh } of r) {
    old.visible = true;
    fresh.removeFromParent();
    // (its GPU buffers let go when the page has a moment: each one put away searches all the renderer's state)
    whenIdle(() => {
      fresh.geometry.dispose();
      fresh.dispose();
    });
  }
}
