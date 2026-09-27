// Tall shapes for the support rule's tests (tests/unit/support.test.ts), from the investigation's
// carving operators (investigation/terrain3d/proto/carve3d.ts): a voxel grid and the three operators
// the 38 shapes of proto/support-tests.ts use.

import type { SupportTerrain } from "../../src/core/terrain/support";

export const LAYERS = 23;
/** Terrain in layers 0–21, so the highest surface is 22. */
export const MAX_SURFACE = 22;
const DX = [0, -1, 0, 1];
const DY = [-1, 0, 1, 0];

export class Vox {
  readonly N: number;
  readonly v: Uint8Array;
  constructor(
    readonly W: number,
    readonly H: number,
    readonly L = LAYERS,
  ) {
    this.N = W * H;
    this.v = new Uint8Array(this.N * L);
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  get(x: number, y: number, z: number): boolean {
    if (!this.inside(x, y) || z < 0) return z < 0;
    if (z >= this.L) return false;
    return this.v[z * this.N + y * this.W + x] === 1;
  }
  set(x: number, y: number, z: number, s: boolean): void {
    if (!this.inside(x, y) || z < 0 || z >= MAX_SURFACE) return;
    this.v[z * this.N + y * this.W + x] = s ? 1 : 0;
  }
  top(x: number, y: number): number {
    for (let z = this.L - 1; z >= 0; z--) if (this.get(x, y, z)) return z + 1;
    return 0;
  }
  column(x: number, y: number, h: number): void {
    for (let z = 0; z < this.L; z++) this.set(x, y, z, z < h);
  }
  masks(): SupportTerrain {
    const mask = new Uint32Array(this.N);
    for (let z = 0; z < this.L; z++) for (let i = 0; i < this.N; i++) if (this.v[z * this.N + i]) mask[i] |= 1 << z;
    return { W: this.W, H: this.H, mask };
  }
}

export interface Face {
  tiles: [number, number][];
  dir: number;
  top: number;
  base: number;
}

export interface Gap {
  a: [number, number];
  b: [number, number];
  dir: number;
  level: number;
  span: number;
  floor: number;
}

/** Lean a face out: from layer `z0` up to the face's top, each layer reaches `rate` further (at most
 *  3) than the one below. Returns the overhang reached at the top. */
export function leanOut(vx: Vox, face: Face, z0: number, rate: (t: number, z: number) => number): number {
  let maxExt = 0;
  for (let t = 0; t < face.tiles.length; t++) {
    const [fx, fy] = face.tiles[t];
    const top = vx.top(fx, fy);
    let ext = 0;
    for (let z = z0; z < top; z++) {
      ext += Math.min(3, Math.max(0, rate(t, z)));
      for (let k = 1; k <= ext; k++) {
        const x = fx + DX[face.dir] * k;
        const y = fy + DY[face.dir] * k;
        if (!vx.inside(x, y)) break;
        if (!vx.get(x, y, z)) vx.set(x, y, z, true);
      }
    }
    if (ext > maxExt) maxExt = ext;
  }
  return maxExt;
}

/** A natural bridge over a gap at its deck level, corbelled from each row's own walls: each layer
 *  reaches at most 3 further than the one below. */
export function skyBridge(vx: Vox, g: Gap, width: number): { layers: number } {
  const deck = g.level - 1;
  const ax = DY[g.dir] !== 0 ? 1 : 0;
  const ay = DY[g.dir] !== 0 ? 0 : 1;
  const lo = -Math.floor((width - 1) / 2);
  let layers = 0;
  for (let w = lo; w < lo + width; w++) {
    const ox = g.a[0] + ax * w;
    const oy = g.a[1] + ay * w;
    const topAt = (t: number) => (vx.inside(ox + DX[g.dir] * t, oy + DY[g.dir] * t) ? vx.top(ox + DX[g.dir] * t, oy + DY[g.dir] * t) : -1);
    let tw = 0;
    while (tw > -6 && topAt(tw) < g.level) tw--;
    if (topAt(tw) < g.level) continue;
    let t0 = tw + 1;
    while (t0 <= g.span + 3 && topAt(t0) >= g.level) t0++;
    let t1 = t0;
    while (t1 <= g.span + 6 && topAt(t1) >= 0 && topAt(t1) < g.level) t1++;
    const span = t1 - t0;
    if (span <= 0 || topAt(t1) < g.level) continue;
    const reach: number[] = [Math.ceil(span / 2)];
    while (reach[reach.length - 1] > 0) {
      const step = reach.length <= 1 ? 1 : reach.length === 2 ? 2 : 3;
      reach.push(Math.max(0, reach[reach.length - 1] - step));
    }
    layers = Math.max(layers, reach.length - 1);
    for (let t = t0; t < t1; t++) {
      const dEnd = Math.min(t - t0 + 1, t1 - t);
      for (let j = 0; j < reach.length; j++) if (dEnd <= reach[j]) vx.set(ox + DX[g.dir] * t, oy + DY[g.dir] * t, deck - j, true);
    }
  }
  return { layers };
}

/** A window arch through a wall: an opening `span` long and `height` high, its top corbelled in
 *  (steps 1, 2, 3, 3 … from the crown down). */
export function windowArch(vx: Vox, cx: number, cy: number, dir: number, z0: number, span: number, height: number, across: number): number {
  let n = 0;
  const ax = DY[dir] !== 0 ? 1 : 0;
  const ay = DY[dir] !== 0 ? 0 : 1;
  const halfSpan = Math.floor(span / 2);
  const halfAt: number[] = new Array(height).fill(halfSpan);
  let hw = Math.min(2, halfSpan);
  const steps = [1, 2, 3];
  for (let k = 0; k < height; k++) {
    halfAt[height - 1 - k] = Math.min(halfSpan, hw);
    hw += steps[Math.min(k, 2)];
  }
  for (let dz = 0; dz < height; dz++) {
    const half = halfAt[dz];
    for (let s = -half; s <= half; s++)
      for (let k = 0; k < across; k++) {
        const x = cx + ax * s + DX[dir] * k;
        const y = cy + ay * s + DY[dir] * k;
        if (vx.get(x, y, z0 + dz)) {
          vx.set(x, y, z0 + dz, false);
          n++;
        }
      }
  }
  return n;
}

/** The 38 shapes of the investigation (proto/support-tests.ts), each with the outcome the game's
 *  rule predicts: whether it stands (nothing deleted). */
export function supportShapes(): { name: string; vox: Vox; stands: boolean }[] {
  const out: { name: string; vox: Vox; stands: boolean }[] = [];
  // 1. cantilevers: one layer sticking out of a wall 20 levels high
  for (let L = 1; L <= 6; L++) {
    const vx = new Vox(20, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) vx.column(x, y, 20);
    for (let k = 1; k <= L; k++) vx.set(2 + k, 2, 19, true);
    out.push({ name: `cantilever ${L} long at layer 19`, vox: vx, stands: L <= 3 });
  }
  // 2. flat roofs over a gap between two walls, 1 and 3 thick
  for (const thick of [1, 3])
    for (let G = 4; G <= 8; G++) {
      const vx = new Vox(G + 6, 5);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 3; x++) vx.column(x, y, 20);
        for (let x = 3 + G; x < 6 + G; x++) vx.column(x, y, 20);
        for (let x = 3; x < 3 + G; x++) for (let z = 20 - thick; z < 20; z++) vx.set(x, y, z, true);
      }
      out.push({ name: `flat roof ${thick} thick over a ${G}-wide gap`, vox: vx, stands: G <= 6 });
    }
  // 3. corbelled sky bridges at the top of the game's height (deck walkable at 22), gaps 6–40
  for (const G of [6, 10, 16, 24, 32, 40]) {
    const vx = new Vox(G + 8, 7);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 4; x++) vx.column(x, y, MAX_SURFACE);
      for (let x = 4 + G; x < 8 + G; x++) vx.column(x, y, MAX_SURFACE);
      for (let x = 4; x < 4 + G; x++) vx.column(x, y, 2);
    }
    skyBridge(vx, { a: [3, 3], b: [4 + G, 3], dir: 3, level: MAX_SURFACE, span: G, floor: 2 }, 3);
    out.push({ name: `sky bridge over a ${G}-wide gorge, deck at 22`, vox: vx, stands: true });
  }
  // the same bridge with corbel steps of 4 (one too many)
  {
    const G = 24;
    const vx = new Vox(G + 8, 7);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 4; x++) vx.column(x, y, MAX_SURFACE);
      for (let x = 4 + G; x < 8 + G; x++) vx.column(x, y, MAX_SURFACE);
    }
    const reach = [12, 8, 4, 0];
    for (let t = 1; t <= G; t++) {
      const dEnd = Math.min(t, G + 1 - t);
      for (let j = 0; j < reach.length; j++) if (dEnd <= reach[j]) for (let y = 2; y <= 4; y++) vx.set(3 + t, y, MAX_SURFACE - 1 - j, true);
    }
    out.push({ name: "sky bridge over a 24-wide gorge with corbel steps of 4", vox: vx, stands: false });
  }
  // 4. leaning cliffs 20 levels tall, leaning out from layer 8 at 1–4 tiles per level
  for (const rate of [1, 2, 3, 4]) {
    const vx = new Vox(70, 6);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) vx.column(x, y, 20);
    leanOut(vx, { tiles: [[9, 1], [9, 2], [9, 3], [9, 4]], dir: 3, top: 20, base: 0 }, 8, () => rate);
    if (rate === 4) for (let z = 8; z < 20; z++) for (let k = 1; k <= 4 * (z - 7); k++) for (let y = 1; y <= 4; y++) if (9 + k < 70) vx.set(9 + k, y, z, true);
    out.push({ name: `cliff 20 tall leaning ${rate} per level from layer 8`, vox: vx, stands: rate <= 3 });
  }
  // 5. a 20-level cliff undercut along its whole face (3 deep holds, 4 loses its edge) or as a notch
  for (const [depth, full] of [[3, true], [4, true], [4, false], [6, false]] as const) {
    const vx = new Vox(20, 6);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) vx.column(x, y, 20);
    const y0 = full ? 0 : 1;
    const y1 = full ? 5 : 4;
    for (let y = y0; y <= y1; y++) for (let k = 0; k < depth; k++) for (let z = 2; z <= 5; z++) vx.set(11 - k, y, z, false);
    out.push({ name: `20-level cliff undercut ${depth} deep, 4 high, ${full ? "along the whole face" : "as a 4-wide notch"}`, vox: vx, stands: depth <= 3 || !full });
  }
  // 6. window arches through a 3-thick fin 20 high, openings 5–25 wide and 6–15 high
  for (const [span, height] of [[5, 6], [11, 8], [17, 10], [25, 15]]) {
    const vx = new Vox(span + 12, 5);
    for (let x = 0; x < span + 12; x++) for (let y = 1; y <= 3; y++) vx.column(x, y, 20);
    windowArch(vx, Math.floor((span + 12) / 2), 1, 2, 1, span, height, 3);
    out.push({ name: `window arch ${span} wide and ${height} high through a fin 20 tall`, vox: vx, stands: true });
  }
  // 7. hanging and floating rock
  {
    const vx = new Vox(9, 9);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) vx.column(x, y, 2);
    for (let z = 10; z < 20; z++) vx.set(4, 4, z, true);
    out.push({ name: "floating pillar with air below (a sky island without support)", vox: vx, stands: false });
  }
  {
    const vx = new Vox(12, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) vx.column(x, y, 20);
    for (let z = 12; z < 19; z++) vx.set(5, 2, z, true);
    vx.set(4, 2, 19, true);
    vx.set(5, 2, 19, true);
    out.push({ name: "stalactite hanging from a 2-long ledge", vox: vx, stands: false });
  }
  {
    const vx = new Vox(12, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) vx.column(x, y, 20);
    for (let k = 1; k <= 3; k++) for (let z = 15; z < 20; z++) vx.set(3 + k, 2, z, true);
    out.push({ name: "a 5-thick slab 3 long out of a wall (every layer a 3-long cantilever)", vox: vx, stands: true });
  }
  return out;
}

/** The rule as the investigation ported it (proto/support.ts): a queue over the voxel array with
 *  distances, repeated until nothing is deleted. The reference the mask version must equal. */
export function referenceSupport(W: number, H: number, voxels: Uint8Array, layers = LAYERS, stackTops: readonly number[] = []): number[] {
  const N = W * H;
  const vox = voxels.slice();
  const unsupported: number[] = [];
  for (;;) {
    const dist = new Uint8Array(N * layers).fill(255);
    for (let v = 0; v < N * layers; v++) if (vox[v]) dist[v] = 99;
    const queue: number[] = [];
    const push = (v: number, d: number) => {
      if (vox[v] && d < dist[v]) {
        dist[v] = d;
        queue.push(v);
      }
    };
    for (let i = 0; i < N; i++) push(i, 0);
    for (const k of stackTops) if (k + N < N * layers) push(k + N, 0);
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      const d = dist[v];
      const z = Math.floor(v / N);
      const i = v - z * N;
      const x = i % W;
      const y = (i - x) / W;
      if (z + 1 < layers) push(v + N, 0);
      if (d < 3) {
        if (x > 0) push(v - 1, d + 1);
        if (x < W - 1) push(v + 1, d + 1);
        if (y > 0) push(v - W, d + 1);
        if (y < H - 1) push(v + W, d + 1);
      }
    }
    let removed = 0;
    for (let i = 0; i < N; i++) {
      let z = 0;
      while (z < layers && vox[z * N + i]) z++;
      for (; z < layers; z++) {
        const v = z * N + i;
        if (vox[v] && dist[v] === 99) {
          vox[v] = 0;
          unsupported.push(v);
          removed++;
        }
      }
    }
    if (!removed) break;
  }
  return unsupported.sort((a, b) => a - b);
}
