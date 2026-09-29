// Refreshed objects and landmarks for the High look (#67 stage 3, investigation/maplook-finish
// landmarks.ts; PLAN §20 D250): procedural models of our own, in place of today's, on the same
// transforms, footprints and tints: the district centre with a shingled roof and banner, relics as
// plain chipped stumps, a murky seep for a badwater source, rocks and a pool for a water source,
// geothermal vents, a bramble of thorns, rubble and log debris for blockages and natural dams, and a
// few steel gussets and bolts on the ruins' scaffolds and the mine's frame. Slopes keep their ramp
// in natural materials. Each replacement carries the original batch's per-instance bookkeeping, so
// highlighting, removing and following the ground work as before; off, the originals come back.

import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, TorusGeometry, Vector3, type Group, type ShaderMaterial } from "three";
import type { EntityView } from "../model";
import { badwaterBody, GEOTHERMAL, GEOTHERMAL_ROCK, MINE, RELIC_STONE, RUIN, START, THORNS, type Rgb } from "../palette";

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

function district(): BufferGeometry {
  const m = new Parts();
  const wood = START.walls;
  const roof = START.roof;
  m.box(3, 0.1, 3, shade(START.deck, 0.72), 0, 0.05);
  for (let k = 0; k < 15; k++) m.box(0.18, 0.11, 2.94, shade(START.deck, 0.9 + hash(k) * 0.16), -1.4 + k * 0.2, 0.15);
  m.box(1.75, 0.96, 1.35, wood, 0, 0.72);
  for (let y = 0.35; y < 1.18; y += 0.16) for (const z of [-0.7, 0.7]) m.beam([-1, y, z], [1, y, z], 0.073, shade(wood, 0.75 + hash(y) * 0.16));
  for (const x of [-0.84, 0.84]) for (const z of [-0.65, 0.65]) m.box(0.11, 1.1, 0.11, shade(wood, 0.67), x, 0.74, z);
  // shingle courses along the A roof; the strong red roof still reads
  for (const side of [-1, 1])
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++) {
        const z = side * (0.09 + row * 0.168);
        const y = 1.98 - Math.abs(z) * 0.9;
        m.box(0.27, 0.07, 0.25, shade(roof, 0.82 + hash(row * 31 + col * 7 + side) * 0.36), -0.96 + col * 0.275, y, z, side * 0.73, 0, 0);
      }
  m.beam([-1.12, 2.01, 0], [1.12, 2.01, 0], 0.055, shade(roof, 1.18));
  m.box(0.43, 0.63, 0.055, [0.24, 0.16, 0.095], 0, 0.55, 0.705);
  m.box(0.55, 0.06, 0.08, shade(wood, 0.68), 0, 0.89, 0.74);
  for (const x of [-0.6, 0.6]) {
    m.box(0.32, 0.32, 0.05, [0.2, 0.32, 0.31], x, 0.84, 0.715);
    for (const dx of [-0.18, 0.18]) m.box(0.035, 0.39, 0.08, START.deck, x + dx, 0.84, 0.74);
    m.box(0.39, 0.035, 0.08, START.deck, x, 0.65, 0.74);
    m.box(0.39, 0.035, 0.08, START.deck, x, 1.03, 0.74);
    m.box(0.028, 0.33, 0.08, START.deck, x, 0.84, 0.74);
  }
  m.box(0.73, 0.08, 0.49, roof, 0, 1.02, 0.94, 0.2);
  for (const x of [-0.9, 0.9]) {
    m.beam([x, 0.2, 1.15], [x, 0.73, 1.15], 0.06, shade(wood, 0.66));
    m.beam([x, 0.72, 1.15], [x, 0.72, 1.48], 0.035, START.deck);
  }
  m.box(0.31, 0.66, 0.32, [0.49, 0.48, 0.42], 0.57, 1.86, -0.26);
  m.box(0.39, 0.1, 0.4, [0.3, 0.31, 0.28], 0.57, 2.2, -0.26);
  m.beam([-1.17, 0.2, -1.1], [-1.17, 2.96, -1.1], 0.045, [0.29, 0.2, 0.12]);
  m.box(0.85, 0.5, 0.05, START.banner, -0.72, 2.69, -1.1);
  m.box(0.85, 0.09, 0.057, [0.36, 0.15, 0.075], -0.72, 2.48, -1.1);
  // a simple crossed-tools emblem of our own
  m.beam([-0.86, 2.57, -1.064], [-0.61, 2.82, -1.064], 0.025, [0.37, 0.21, 0.095], 1);
  m.beam([-0.61, 2.57, -1.06], [-0.86, 2.82, -1.06], 0.025, [0.37, 0.21, 0.095], 1);
  return m.geometry();
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

function badSource(): BufferGeometry {
  const m = new Parts();
  // a dark stone basin over the whole 3 × 3 footprint (D324, feedback item 28): a stained rim of
  // chipped blocks and boulders round a crimson pool, the badwater boiling up in a low dome with
  // slow orange-brown bubbles
  m.box(2.96, 0.1, 2.96, [0.13, 0.11, 0.1], 0, 0.05);
  for (let k = 0; k < 7; k++) {
    const t = -1.27 + (k * 2.54) / 6;
    const w = 0.42 + hash(k + 3) * 0.1;
    const rimColour = (n: number) => shade([0.25, 0.22, 0.2], 0.85 + hash(n) * 0.3);
    m.box(w, 0.24 + hash(k) * 0.06, 0.4, rimColour(k), t, 0.22, -1.27, 0, (hash(k + 9) - 0.5) * 0.2);
    m.box(w, 0.24 + hash(k + 20) * 0.06, 0.4, rimColour(k + 20), t, 0.22, 1.27, 0, (hash(k + 29) - 0.5) * 0.2);
    if (k > 0 && k < 6) {
      m.box(0.4, 0.24 + hash(k + 40) * 0.06, w, rimColour(k + 40), -1.27, 0.22, t, 0, (hash(k + 49) - 0.5) * 0.2);
      m.box(0.4, 0.24 + hash(k + 60) * 0.06, w, rimColour(k + 60), 1.27, 0.22, t, 0, (hash(k + 69) - 0.5) * 0.2);
    }
  }
  for (let k = 0; k < 4; k++) rock(m, k % 2 ? 1.3 : -1.3, 0.3, k < 2 ? -1.3 : 1.3, 0.38, [0.3, 0.26, 0.23], k, 1);
  m.box(2.14, 0.05, 2.14, badwaterBody(0.8), 0, 0.15);
  const dome = new IcosahedronGeometry(0.8, 1);
  dome.scale(1, 0.26, 1);
  m.add(dome, shade(badwaterBody(0.3), 1.05), 0, 0.17);
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    const r = 0.15 + hash(k + 33) * 0.78;
    const b = new IcosahedronGeometry(0.08 + hash(k) * 0.1, 1);
    b.scale(1, 0.7, 1);
    m.add(b, [0.56, 0.29, 0.13], Math.sin(a) * r, 0.23, Math.cos(a) * r);
  }
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

function source(bad: boolean): BufferGeometry {
  if (bad) return badSource();
  // a stone basin with water welling up (D324, feedback item 28): chipped blocks round a pool, the
  // water domed over a small spout, rings spreading from it
  const m = new Parts();
  const stone: Rgb = [0.5, 0.52, 0.52];
  m.box(0.98, 0.1, 0.98, [0.34, 0.36, 0.37], 0, 0.05);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI * 2) / 8 + 0.39;
    const along = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    const x = Math.cos(a) * 0.4 * (along ? 1.16 : 0.86);
    const z = Math.sin(a) * 0.4 * (along ? 0.86 : 1.16);
    m.box(0.3, 0.2 + hash(k) * 0.07, 0.3, shade(stone, 0.85 + hash(k + 7) * 0.3), x, 0.19, z, 0, a + hash(k + 3) * 0.3);
  }
  m.box(0.58, 0.04, 0.58, [0.2, 0.5, 0.58], 0, 0.14);
  m.add(new CylinderGeometry(0.25, 0.25, 0.012, 14), [0.78, 0.9, 0.92], 0, 0.165);
  m.add(new CylinderGeometry(0.2, 0.2, 0.012, 14), [0.24, 0.56, 0.64], 0, 0.173);
  const dome = new IcosahedronGeometry(0.17, 1);
  dome.scale(1, 0.6, 1);
  m.add(dome, [0.34, 0.68, 0.75], 0, 0.19);
  m.add(new CylinderGeometry(0.04, 0.05, 0.14, 7), [0.8, 0.92, 0.94], 0, 0.26);
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

/** Today's model with a little more: steel gussets and bolts on a ruin's scaffold, a pulley and
 *  bolts on the mine's frame. The approved shapes stay. */
function augment(key: string, base: BufferGeometry): BufferGeometry {
  const m = new Parts().copy(base);
  if (key.startsWith("scaffold.")) {
    for (const x of [-0.42, 0.42])
      for (const z of [-0.42, 0.42]) {
        m.box(0.14, 0.08, 0.14, shade(RUIN.rust, 0.77), x, 0.06, z, 0, 0, 0, 1);
        m.add(new CylinderGeometry(0.025, 0.025, 0.012, 6), [0.61, 0.47, 0.31], x, 0.11, z, 0, 0, 0, 1);
      }
  } else if (key === "UndergroundRuins") {
    m.add(new TorusGeometry(0.18, 0.032, 5, 12), shade(MINE.frame, 0.8), 0, 1.52, 0, 0, Math.PI / 2, 0, 1);
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
/** A landmark's geometry, made once (the ones built on today's models, per model). */
function geometryFor(name: string, batch: string, base: BufferGeometry): BufferGeometry {
  const key = name === "StartingLocation" || name.endsWith("Relic") || ["Thorns", "GeothermalField", "WaterSource", "BadwaterSource", "Blockage", "NaturalDam"].includes(name) ? name : `${name}|${batch}`;
  let g = models.get(key);
  if (!g) {
    if (name === "StartingLocation") g = district();
    else if (name.endsWith("Relic")) g = relic(name);
    else if (name === "Thorns") g = bramble();
    else if (name === "GeothermalField") g = geothermal();
    else if (name === "WaterSource" || name === "BadwaterSource") g = source(name === "BadwaterSource");
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
}

/** The landmarks for the objects the renderer built (`group`, from entities3d.ts buildEntities), as
 *  new batches beside today's; `slopes` draws the slopes' ramps. */
export function buildLandmarks(group: Group, e: EntityView, material: ShaderMaterial, slopes: ShaderMaterial): Replacement[] {
  const out: Replacement[] = [];
  const m = new Matrix4();
  for (const child of [...group.children]) {
    const old = child as InstancedMesh;
    const objects = old.userData.objects as Int32Array | undefined;
    if (!old.isInstancedMesh || !objects?.length || old.name.startsWith("high.")) continue;
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
      slots.forEach((i, j) => {
        old.getMatrixAt(i, m);
        fresh.setMatrixAt(j, m);
        if (grow) grows.set([grow.getX(i), grow.getY(i), grow.getZ(i)], j * 3);
        else grows.set([0, 0, 1], j * 3);
        // (debris carries its own colours)
        if (tint && name !== "NaturalDam" && name !== "Blockage") colours.set([tint.getX(i), tint.getY(i), tint.getZ(i)], j * 3);
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
      out.push({ old, fresh });
    }
  }
  return out;
}

/** Put a set of replacements away. */
export function disposeLandmarks(r: readonly Replacement[]): void {
  for (const { old, fresh } of r) {
    old.visible = true;
    fresh.removeFromParent();
    fresh.geometry.dispose();
    fresh.dispose();
  }
}
