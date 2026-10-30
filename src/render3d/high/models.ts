// The High look's trees and bushes (#66, investigation/vegetation models.ts; PLAN §20 D241): our own
// procedural geometry, no textures or game assets. Distinct pine (a dark pointed cone of scalloped
// tiers), birch (light broken clusters on a white, marked trunk), oak (one broad round crown on
// heavy limbs) and blueberry bushes (low, with big blue fruit outside the leaves), each with bare dead
// forms; three silhouettes a species close up and one far off. Colours are palette regions (the
// vegetation material's uniforms), never baked, so tuning them rebuilds nothing.

// (ported from investigation/vegetation/models.ts)
import { DEAD_FORM, deadLeaves, deadWood, DRYING, dryColour, type Rgb } from '../dying';
import { plantScale, RANDOMIZER } from '../plantSize';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, OctahedronGeometry, TetrahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';

export const species = ['Pine', 'Birch', 'Oak', 'BlueberryBush'] as const;
export type Species = typeof species[number];
export type Detail = 'near' | 'far';
/** High's warm sun (highLook.ts `SUNLIGHT.sun`, pinned equal by a test). */
export const WARM_SUN = [1.48, 1.3, 1.1] as const;
/** A colour the game gives (its hue and saturation, as Standard's neutral light shows it) as High's albedo for it: the warm
 *  sun's tint taken out, so a dying crown reads the same olive-ochre in both looks rather than orange. */
const underSun = (c: readonly number[]) => [c[0] * (WARM_SUN[1] / WARM_SUN[0]), c[1], c[2] * (WARM_SUN[1] / WARM_SUN[2])];
const living = { pine: '#2b6936', birch: '#a7cc45', oak: '#489a38', bush: '#387632' } as const;
/** Foliage slots, their species, and their dying slot (dying.ts). */
const FOLIAGE = { pine: ['Pine', 'pineDry'], birch: ['Birch', 'birchDry'], oak: ['Oak', 'oakDry'], bush: ['BlueberryBush', 'bushDry'] } as const;
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as unknown as Rgb;
const bark = '#806044', birchBark = '#f2efdd';
export const paletteDefaults = {
  ...living,
  bark, birchBark, berry: '#7f9bff', marks: '#494239',
  // a dead tree's bare wood, its own bark weathered as the game's is; a dead bush's leaves gone brown (dying.ts DEAD_FORM)
  dead: hex(deadWood('Pine', parse(bark))), birchDead: hex(deadWood('Birch', parse(birchBark))),
  bushDead: hex(underSun(deadLeaves('BlueberryBush', parse(living.bush)))),
  // a dying plant's foliage: the game's dry colour at the living green's lightness (dying.ts), as it reads under the warm sun
  pineDry: hex(underSun(dryColour('Pine', parse(living.pine)))), birchDry: hex(underSun(dryColour('Birch', parse(living.birch)))),
  oakDry: hex(underSun(dryColour('Oak', parse(living.oak)))), bushDry: hex(underSun(dryColour('BlueberryBush', parse(living.bush)))),
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
/** Where a plant stands and its size: `scale` its width and `scaleY` its height, the game's randomizer's factors for its
 *  species (plantSize.ts) at its growth. */
export function placement(x: number, y: number, growth = 1, species = '') {
  const g = RANDOMIZER[species] ? plantScale(species, noise(x, y, 3), noise(x, y, 10)) : null;
  const own = 0.92 + 0.12 * noise(x, y, 3);
  return { dx: (noise(x, y, 1) - 0.5) * 0.14, dz: (noise(x, y, 2) - 0.5) * 0.14,
    scale: growthScale(growth) * (g ? g.width : own), scaleY: growthScale(growth) * (g ? g.height : own), turn: noise(x, y, 4) * Math.PI * 2,
    variant: Math.floor(noise(x, y, 5) * 3), hue: (noise(x, y, 6) - 0.5) * 0.075,
    phase: noise(x, y, 7) * Math.PI * 2, rate: 0.65 + 0.5 * noise(x, y, 8) };
}

/** One combined opaque geometry; material regions are indices, never baked colours. */
class Shape {
  positions: number[] = []; normals: number[] = []; regions: number[] = []; shades: number[] = [];
  /** Built dying: foliage in its dying slot, drawn in toward the trunk and sunk as the game's is (dying.ts). */
  dying = false;
  /** Every part scaled upright by this (a dead plant brought to the game's height for it). */
  upright = 1;
  add(source: BufferGeometry, slot: keyof Palette, shade = 1, translate: V = [0, 0, 0], scale: V = [1, 1, 1], turn = 0) {
    source.scale(...scale).rotateY(turn).translate(...translate);
    if (this.upright !== 1) source.scale(1, this.upright, 1);
    if (this.dying && slot in FOLIAGE) {
      const [name, dry] = FOLIAGE[slot as keyof typeof FOLIAGE];
      source.scale(DRYING[name].reach, DRYING[name].height, DRYING[name].reach);
      slot = dry;
    }
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
  // the game's grown pine (plantSize.ts): a bare trunk to about 1.25, then broad whorls of needles to 3.0, 1.2 across
  Pine: { height: 3.0, wind: 0.038, build(m, v, detail, dead) {
    const near = detail === 'near', h = 2.92 + v * 0.06;
    m.branch([0, 0, 0], [0.015, dead ? h * 0.94 : h, 0], near ? 0.1 : 0.08, dead ? 'dead' : 'bark', near ? 6 : 3, 0.35);
    if (dead) {
      for (let i = 0; i < (near ? 7 : 3); i++) {
        const a = i * 2.4 + v, y = 0.7 + i * 0.26;
        m.branch([0, y, 0], [Math.cos(a) * 0.32, y + 0.14, Math.sin(a) * 0.32], 0.03, 'dead', 3, 0.1);
      }
    } else {
      const n = near ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        tier(m, 0.62 * (1 - f * 0.42), 1.2 + f * (h - 1.85), 0.8 - f * 0.12, v * 4 + i, near);
      }
      if (near) tier(m, 0.18, h - 0.5, 0.5, v + 19, true);
    }
  } },
  // the game's grown birch: a white trunk forking low into two stems, a round crown from 0.95 to 1.92, 1.0 across
  Birch: { height: 1.92, wind: 0.049, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'birchDead' : 'birchBark';
    m.branch([0, 0, 0], [0.015, 0.94, 0], 0.07, bark, near ? 6 : 3, 0.5);
    if (!near && !dead) {
      for (const side of [-1, 1]) m.add(new OctahedronGeometry(1), 'birch', side === 1 ? 1.04 : 0.92, [side * 0.2, side === 1 ? 1.5 : 1.38, 0], [0.34, 0.52, 0.3]);
      return;
    }
    for (const side of [-1, 1]) {
      m.branch([0, 0.45, 0], [side * 0.22, 1.32 + (side + 1) * 0.08, 0.03 * v], 0.042, bark, near ? 5 : 3, 0.15);
      if (near) m.branch([side * 0.1, 1.0, 0], [side * 0.36, 1.28, -0.16], 0.022, bark, 3, 0.05);
    }
    if (near) for (let i = 0; i < 5; i++) {
      // Small asymmetric marks on the white bark, geometry rather than a texture.
      m.branch([0, 0.15 + i * 0.135, 0], [0.003, 0.17 + i * 0.135, 0], 0.047 - i * 0.002, 'marks', 5, 1);
    }
    if (!dead) {
      const n = near ? 7 : 2;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, a = i * 2.4 + v * 0.7;
        m.crown([side * (near ? 0.18 : 0.2), 1.12 + (near ? i * 0.1 : i * 0.2), near ? Math.sin(a) * 0.16 : 0],
          [near ? 0.3 : 0.34, near ? 0.32 : 0.52, near ? 0.24 : 0.3], 'birch', 0.97 + i / n * 0.15, a);
      }
    }
  } },
  // the game's grown oak: a thick trunk to about 1.2, under one broad, flat-layered crown from 1.13 to 2.26, 1.7 across
  Oak: { height: 2.26, wind: 0.027, build(m, v, detail, dead) {
    const near = detail === 'near', bark = dead ? 'dead' : 'bark';
    m.branch([0, 0, 0], [0.02, dead ? 1.45 : 1.25, 0], dead ? 0.17 : 0.2, bark, near ? 7 : 3, dead ? 0.52 : 0.62);
    if (!near && !dead) {
      m.crown([0, 1.66, 0], [0.98, 0.56, 0.94], 'oak', 1.02);
      m.add(new TetrahedronGeometry(1), 'oak', 1.06, [0.32, 1.4, 0.18], [0.5, 0.46, 0.48]);
      return;
    }
    const n = near ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + v * 0.4;
      m.branch([0, 0.75 + i * 0.04, 0], [Math.cos(a) * 0.48, 1.5 + i * 0.07, Math.sin(a) * 0.48], near ? 0.06 : 0.04, bark, near ? 5 : 3, 0.18);
      if (dead && near) m.branch([Math.cos(a) * 0.36, 1.35 + i * 0.07, Math.sin(a) * 0.36], [Math.cos(a + 0.4) * 0.6, 1.72 + i * 0.07, Math.sin(a + 0.4) * 0.6], 0.032, bark, 3, 0.05);
    }
    if (!dead) {
      // One broad, flat crown does the reading, as the game's layered one; small shoulders soften its edge.
      const width = [1, 0.94, 1.04][v];
      m.add(new IcosahedronGeometry(1, 1), 'oak', 1.02, [0, 1.66 + (v === 1 ? 0.05 : 0), 0], [0.84 * width, 0.5, 0.8 * width], v * 0.25);
      m.crown([0.4, 1.42, 0.22], [0.46, 0.38, 0.44], 'oak', 1.06, v * 0.3);
      m.crown([-0.42, 1.52, 0.14], [0.42, 0.38, 0.44], 'oak', 0.97, v * 0.7);
      m.crown([0.04, 2.0, -0.1], [0.46, 0.3, 0.42], 'oak', 1.04, v);
    }
  } },
  // the game's grown blueberry bush: a low, wide mound, 1.1 across and 0.4 tall
  BlueberryBush: { height: 0.4, wind: 0.008, build(m, v, detail, dead) {
    const near = detail === 'near';
    // (dead: the game's keeps its leaves, gone brown, without its berries: its crowns alone, in their dead slot)
    const leaves = dead ? 'bushDead' : 'bush';
    if (!near) {
      for (const side of [-1, 1]) m.add(new OctahedronGeometry(1), leaves, side === 1 ? 1 : 0.96, [side * 0.24, 0.15, 0], [0.4, 0.22, 0.44]);
      if (dead) return;
      for (let i = 0; i < 3; i++) m.add(new OctahedronGeometry(0.085), 'berry', 1.04, [Math.cos(i * 2.4 + v) * 0.26, 0.33, Math.sin(i * 2.4 + v) * 0.26]);
      m.add(new OctahedronGeometry(0.085), 'berry', 1, [0.46, 0.18, 0.2]);
      return;
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + v;
      m.crown([Math.cos(a) * 0.26, 0.14 + (i % 2) * 0.04, Math.sin(a) * 0.26], [0.36, 0.2, 0.34], leaves, 0.96 + (i % 3) * 0.06, a);
    }
    if (dead) return;
    // Big blue fruit sits outside the leaves: a top cluster and a ring readable from any side.
    for (let i = 0; i < 3; i++) { const a = i * 2.4 + v; m.add(new OctahedronGeometry(0.08), 'berry', 1.04, [Math.cos(a) * 0.26, 0.3, Math.sin(a) * 0.26]); }
    m.add(new OctahedronGeometry(0.072), 'berry', 1.10, [0.02, 0.33, 0.02]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + v * 0.7; m.add(new OctahedronGeometry(0.078), 'berry', 1, [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5]); }
  } },
};

/** A plant's state: alive, dying (a cause of death runs: its dying form) or dead. */
export type PlantState = 'alive' | 'dying' | 'dead';
export function model(spec: Species, variant = 0, detail: Detail = 'near', state: PlantState | boolean = 'alive'): BufferGeometry {
  const st = state === true ? 'dead' : state === false ? 'alive' : state;
  const shape = new Shape(); shape.dying = st === 'dying';
  if (st === 'dead') shape.upright = DEAD_FORM[spec].height * heightOf(spec, variant, detail, false) / heightOf(spec, variant, detail, true);
  registry[spec].build(shape, variant, detail, st === 'dead'); return shape.geometry();
}

/** A model's height as built (its highest vertex). */
function heightOf(spec: Species, variant: number, detail: Detail, dead: boolean): number {
  const shape = new Shape(); registry[spec].build(shape, variant, detail, dead);
  let h = 0; for (let k = 1; k < shape.positions.length; k += 3) h = Math.max(h, shape.positions[k]);
  return h;
}
