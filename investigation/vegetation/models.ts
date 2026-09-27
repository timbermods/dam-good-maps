import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';

export const species = ['Pine', 'Birch', 'Oak', 'BlueberryBush'] as const;
export type Species = typeof species[number];
export type Detail = 'near' | 'far';
export const paletteDefaults = {
  pine: '#356345', birch: '#92ad50', oak: '#648044', bush: '#395c39',
  bark: '#806044', birchBark: '#ded9c5', dead: '#c1b69a', berry: '#617baa', marks: '#494239',
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

/** Irregular star skirt with a raised shoulder: a pine's needles, not a stack of perfect cones. */
function tier(m: Shape, radius: number, base: number, height: number, seed: number, detailed: boolean) {
  const points: number[] = [], n = detailed ? 12 : 6;
  const ring: V[] = Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 + seed * 0.57;
    const r = radius * (i % 2 && detailed ? 0.70 : 0.88 + noise(i, seed, 13) * 0.12);
    return [Math.cos(a) * r, base + (detailed ? noise(i, seed) * 0.07 : 0), Math.sin(a) * r];
  });
  const tip: V = [0.015 * Math.sin(seed), base + height, 0.015 * Math.cos(seed)];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    points.push(...a, ...tip, ...b);
    if (detailed) points.push(...b, ...[0, base + 0.06, 0], ...a);
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(points, 3));
  m.add(g, 'pine', 0.88 + base * 0.12);
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
        tier(m, 0.34 * (1 - f * 0.64), 0.28 + f * (h - 0.65), 0.62 - f * 0.13, v * 4 + i, near);
      }
      if (near) tier(m, 0.095, h - 0.37, 0.37, v + 19, true);
    }
  } },
  Birch: { height: 1.51, wind: 0.049, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'dead' : 'birchBark';
    m.branch([0, 0, 0], [0.015, 0.94, 0], 0.046, bark, near ? 6 : 3, 0.5);
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
          [near ? 0.17 : 0.20, near ? 0.25 : 0.40, near ? 0.13 : 0.16], 'birch', 0.85 + i / n * 0.22, a);
      }
    }
  } },
  Oak: { height: 1.46, wind: 0.027, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'dead' : 'bark';
    m.branch([0, 0, 0], [0.02, 0.87, 0], 0.10, bark, near ? 7 : 4, 0.52);
    const n = near ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + v * 0.4;
      m.branch([0, 0.42 + i * 0.03, 0], [Math.cos(a) * 0.27, 0.99 + i * 0.055, Math.sin(a) * 0.27], near ? 0.04 : 0.025, bark, near ? 5 : 3, 0.18);
      if (dead && near) m.branch([Math.cos(a) * 0.20, 0.87 + i * 0.055, Math.sin(a) * 0.20], [Math.cos(a + 0.4) * 0.34, 1.12 + i * 0.055, Math.sin(a + 0.4) * 0.34], 0.021, bark, 3, 0.05);
    }
    if (!dead) {
      for (let i = 0; i < (near ? 8 : 3); i++) {
        const a = i * 2.4 + v * 0.6, r = near ? 0.18 + (i % 2) * 0.04 : 0.15;
        m.crown([Math.cos(a) * r, 0.95 + (i % 3) * 0.09, Math.sin(a) * r], [near ? 0.20 : 0.24, 0.27, near ? 0.20 : 0.24], 'oak', 0.86 + (i % 3) * 0.08, a);
      }
      if (near) m.crown([0, 1.23, 0], [0.24, 0.23, 0.23], 'oak', 1.08, v);
    }
  } },
  BlueberryBush: { height: 0.47, wind: 0.008, build(m, v, detail, dead) {
    const near = detail === 'near';
    if (dead) {
      for (let i = 0; i < 4; i++) m.branch([0, 0, 0], [Math.cos(i * 2.4) * 0.21, 0.28, Math.sin(i * 2.4) * 0.21], 0.022, 'dead', 3, 0.1);
      return;
    }
    for (let i = 0; i < (near ? 5 : 2); i++) {
      const a = i * 2.4 + v;
      m.crown([Math.cos(a) * 0.13, 0.20 + (i % 2) * 0.08, Math.sin(a) * 0.13], [0.20, 0.19, 0.20], 'bush', 0.86 + (i % 3) * 0.1, a);
    }
    for (let i = 0; i < (near ? 11 : 3); i++) {
      const a = i * 2.4 + v;
      m.crown([Math.cos(a) * 0.19, 0.34 + (i % 3) * 0.028, Math.sin(a) * 0.19], [0.026, 0.025, 0.026], 'berry', 0.9 + (i % 2) * 0.18);
    }
  } },
};

export function model(spec: Species, variant = 0, detail: Detail = 'near', dead = false): BufferGeometry {
  const shape = new Shape(); registry[spec].build(shape, variant, detail, dead); return shape.geometry();
}
