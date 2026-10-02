// The High look's trees and bushes (#66, investigation/vegetation models.ts; PLAN §20 D241): our own
// procedural geometry, no textures or game assets. Distinct pine (a dark pointed cone of scalloped
// tiers), birch (light broken clusters on a white, marked trunk), oak (one broad round crown on
// heavy limbs) and blueberry bushes (low, with big blue fruit outside the leaves), each with bare dead
// forms; three silhouettes a species close up and one far off. Colours are palette regions (the
// vegetation material's uniforms), never baked, so tuning them rebuilds nothing.

// (ported from investigation/vegetation/models.ts)
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, OctahedronGeometry, TetrahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';

export const species = ['Pine', 'Birch', 'Oak', 'BlueberryBush'] as const;
export type Species = typeof species[number];
export type Detail = 'near' | 'far';
export const paletteDefaults = {
  pine: '#2b6936', birch: '#a7cc45', oak: '#489a38', bush: '#387632',
  bark: '#806044', birchBark: '#f2efdd', dead: '#c1b69a', berry: '#7f9bff', marks: '#494239',
};
export type Palette = typeof paletteDefaults;
export const slots = Object.keys(paletteDefaults) as (keyof Palette)[];
type V = [number, number, number];

/** Integer mixing: stable placement, never time- or traversal-order dependent. */
export function noise(x: number, y: number, salt = 0): number {
  let n = Math.imul(x + 193, 73856093) ^ Math.imul(y + 421, 19349663) ^ Math.imul(salt + 11, 83492791);
  n = Math.imul(n ^ (n >>> 16), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function growthScale(progress: number): number { return 0.18 + 0.82 * Math.max(0, Math.min(1, progress)); }
export function placement(x: number, y: number, growth = 1) {
  return { dx: (noise(x, y, 1) - 0.5) * 0.14, dz: (noise(x, y, 2) - 0.5) * 0.14,
    scale: growthScale(growth) * (0.92 + 0.12 * noise(x, y, 3)), turn: noise(x, y, 4) * Math.PI * 2,
    variant: Math.floor(noise(x, y, 5) * 3), hue: (noise(x, y, 6) - 0.5) * 0.075,
    phase: noise(x, y, 7) * Math.PI * 2, rate: 0.65 + 0.5 * noise(x, y, 8) };
}

/** One combined opaque geometry; material regions are indices, never baked colours. */
class Shape {
  positions: number[] = []; normals: number[] = []; regions: number[] = []; shades: number[] = [];
  add(source: BufferGeometry, slot: keyof Palette, shade = 1, translate: V = [0, 0, 0], scale: V = [1, 1, 1], turn = 0) {
    source.scale(...scale).rotateY(turn).translate(...translate);
    const g = source.index ? source.toNonIndexed() : source;
    g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i)); this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      this.regions.push(slots.indexOf(slot)); this.shades.push(shade, shade, shade);
    }
    if (g !== source) g.dispose(); source.dispose(); return this;
  }
  branch(a: V, b: V, radius: number, slot: keyof Palette, sides = 5, tip = 0.35) {
    const start = new Vector3(...a), end = new Vector3(...b), dir = end.clone().sub(start);
    const g = new CylinderGeometry(radius * tip, radius, dir.length(), sides, 1, false);
    g.applyMatrix4(new Matrix4().compose(start.add(end).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()), new Vector3(1, 1, 1)));
    return this.add(g, slot);
  }
  crown(pos: V, scale: V, slot: keyof Palette, shade: number, turn = 0) {
    return this.add(new IcosahedronGeometry(1, 0), slot, shade, pos, scale, turn);
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('region', new Float32BufferAttribute(this.regions, 1));
    g.setAttribute('pcolor', new Float32BufferAttribute(this.shades, 3));
    g.setAttribute('lod', new Float32BufferAttribute(new Float32Array(this.regions.length), 1));
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}

/** Shallow scallops retain one pointed conical outline, including from above. */
function tier(m: Shape, radius: number, base: number, height: number, seed: number, detailed: boolean) {
  const points: number[] = [], n = detailed ? 12 : 6;
  const ring: V[] = Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 + seed * 0.57;
    const r = radius * (i % 2 && detailed ? 0.86 : 0.94 + noise(i, seed, 13) * 0.06);
    return [Math.cos(a) * r, base + (detailed ? noise(i, seed) * 0.035 : 0), Math.sin(a) * r];
  });
  const tip: V = [0.015 * Math.sin(seed), base + height, 0.015 * Math.cos(seed)];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    points.push(...a, ...tip, ...b);
    if (detailed) points.push(...b, ...[0, base + 0.06, 0], ...a);
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(points, 3));
  m.add(g, 'pine', 0.96 + base * 0.10);
}

export interface SpeciesDefinition { height: number; wind: number; build: (m: Shape, variant: number, detail: Detail, dead: boolean) => void }
/** Add species here; batching, icons, ghosts and palette binding use this same registry. */
export const registry: Record<Species, SpeciesDefinition> = {
  Pine: { height: 1.72, wind: 0.038, build(m, v, detail, dead) {
    const near = detail === 'near', h = 1.58 + v * 0.07;
    m.branch([0, 0, 0], [0.015, dead ? h * 0.94 : h, 0], near ? 0.055 : 0.045, dead ? 'dead' : 'bark', near ? 6 : 3, 0.35);
    if (dead) {
      for (let i = 0; i < (near ? 7 : 3); i++) {
        const a = i * 2.4 + v, y = 0.45 + i * 0.14;
        m.branch([0, y, 0], [Math.cos(a) * 0.23, y + 0.10, Math.sin(a) * 0.23], 0.023, 'dead', 3, 0.1);
      }
    } else {
      for (let i = 0; i < (near ? 4 : 3); i++) {
        const f = i / (near ? 4 : 3);
        tier(m, 0.365 * (1 - f * 0.64), 0.28 + f * (h - 0.65), 0.66 - f * 0.13, v * 4 + i, near);
      }
      if (near) tier(m, 0.095, h - 0.37, 0.37, v + 19, true);
    }
  } },
  Birch: { height: 1.51, wind: 0.049, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'dead' : 'birchBark';
    m.branch([0, 0, 0], [0.015, 0.94, 0], 0.046, bark, near ? 6 : 3, 0.5);
    if (!near && !dead) {
      for (const side of [-1, 1]) m.add(new OctahedronGeometry(1), 'birch', side === 1 ? 1.04 : 0.92, [side * 0.12, side === 1 ? 1.08 : 0.99, 0], [0.21, 0.42, 0.16]);
      return;
    }
    for (const side of [-1, 1]) {
      m.branch([0, 0.60, 0], [side * 0.16, 1.24 + (side + 1) * 0.06, 0.02 * v], 0.027, bark, near ? 5 : 3, 0.1);
      if (near) m.branch([side * 0.08, 0.94, 0], [side * 0.27, 1.10, -0.12], 0.016, bark, 3, 0.05);
    }
    if (near) for (let i = 0; i < 5; i++) {
      // Small asymmetric marks on the white bark, geometry rather than a texture.
      m.branch([0, 0.15 + i * 0.135, 0], [0.003, 0.17 + i * 0.135, 0], 0.047 - i * 0.002, 'marks', 5, 1);
    }
    if (!dead) {
      const n = near ? 7 : 2;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, a = i * 2.4 + v * 0.7;
        m.crown([side * (near ? 0.11 : 0.12), 0.85 + (near ? i * 0.072 : i * 0.13), near ? Math.sin(a) * 0.10 : 0],
          [near ? 0.17 : 0.20, near ? 0.25 : 0.40, near ? 0.13 : 0.16], 'birch', 0.97 + i / n * 0.15, a);
      }
    }
  } },
  Oak: { height: 1.46, wind: 0.027, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'dead' : 'bark';
    m.branch([0, 0, 0], [0.02, dead ? 0.87 : 0.68, 0], dead ? 0.10 : 0.125, bark, near ? 7 : 3, dead ? 0.52 : 0.62);
    if (!near && !dead) {
      // The same broad main crown and low shoulder as today's signature oak; 36 total triangles.
      m.crown([0, 0.95, 0], [0.49, 0.39, 0.46], 'oak', 1.02);
      m.add(new TetrahedronGeometry(1), 'oak', 1.06, [0.18, 0.81, 0.10], [0.30, 0.28, 0.29]);
      return;
    }
    const n = near ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + v * 0.4;
      m.branch([0, 0.42 + i * 0.03, 0], [Math.cos(a) * 0.27, 0.99 + i * 0.055, Math.sin(a) * 0.27], near ? 0.04 : 0.025, bark, near ? 5 : 3, 0.18);
      if (dead && near) m.branch([Math.cos(a) * 0.20, 0.87 + i * 0.055, Math.sin(a) * 0.20], [Math.cos(a + 0.4) * 0.34, 1.12 + i * 0.055, Math.sin(a + 0.4) * 0.34], 0.021, bark, 3, 0.05);
    }
    if (!dead) {
      // One continuous, squat round crown does the reading; small shoulders only soften its edge.
      const width = [1, 0.94, 1.04][v];
      m.add(new IcosahedronGeometry(1, 1), 'oak', 1.02, [0, 0.97 + (v === 1 ? 0.04 : 0), 0], [0.47 * width, 0.36, 0.44 * width], v * 0.25);
      m.crown([0.21, 0.82, 0.12], [0.29, 0.27, 0.28], 'oak', 1.06, v * 0.3);
      m.crown([-0.22, 0.89, 0.08], [0.25, 0.25, 0.27], 'oak', 0.97, v * 0.7);
      m.crown([0.02, 0.94, -0.22], [0.27, 0.25, 0.24], 'oak', 1.04, v);
    }
  } },
  BlueberryBush: { height: 0.47, wind: 0.008, build(m, v, detail, dead) {
    const near = detail === 'near';
    if (dead) {
      for (let i = 0; i < 4; i++) m.branch([0, 0, 0], [Math.cos(i * 2.4) * 0.21, 0.28, Math.sin(i * 2.4) * 0.21], 0.022, 'dead', 3, 0.1);
      return;
    }
    if (!near) {
      for (const side of [-1, 1]) m.add(new OctahedronGeometry(1), 'bush', side === 1 ? 1 : 0.96, [side * 0.12, 0.19, 0], [0.23, 0.18, 0.24]);
      for (let i = 0; i < 3; i++) m.add(new OctahedronGeometry(0.079), 'berry', 1.04, [Math.cos(i * 2.4 + v) * 0.145, 0.35, Math.sin(i * 2.4 + v) * 0.145]);
      m.add(new OctahedronGeometry(0.079), 'berry', 1, [0.24, 0.21, 0.12]);
      return;
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + v;
      m.crown([Math.cos(a) * 0.13, 0.18 + (i % 2) * 0.04, Math.sin(a) * 0.13], [0.205, 0.155, 0.195], 'bush', 0.96 + (i % 3) * 0.06, a);
    }
    // Big blue fruit sits outside the leaves: a top cluster and a ring readable from any side.
    for (let i = 0; i < 3; i++) { const a = i * 2.4 + v; m.add(new OctahedronGeometry(0.075), 'berry', 1.04, [Math.cos(a) * 0.145, 0.355, Math.sin(a) * 0.145]); }
    m.add(new OctahedronGeometry(0.068), 'berry', 1.10, [0.015, 0.375, 0.015]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + v * 0.7; m.add(new OctahedronGeometry(0.073), 'berry', 1, [Math.cos(a) * 0.275, 0.23, Math.sin(a) * 0.275]); }
  } },
};

export function model(spec: Species, variant = 0, detail: Detail = 'near', dead = false): BufferGeometry {
  const shape = new Shape(); registry[spec].build(shape, variant, detail, dead); return shape.geometry();
}
