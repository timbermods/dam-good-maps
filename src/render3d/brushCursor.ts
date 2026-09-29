// The brush on the map (live editing): a soft disc laid on the terrain under the cursor, as strong
// as the brush's falloff (even, for a target's hard edges, D322), with a ring at its edge; for a
// target, a see-through plane at the level it works to. It follows the ground's steps, and is rebuilt
// as the cursor moves (a few thousand quads at most, in buffers made once: past a 24-tile radius the
// disc is laid a few tiles at a time, D322 item 42's brushes up to half the map).

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Scene } from "three";
import { WATER_UI } from "./palette";

export interface BrushCursorState {
  /** Middle of the brush, in tiles (x east, y north). */
  x: number;
  y: number;
  /** Radius in tiles. */
  radius: number;
  /** Tint: raise warm, lower cool, flatten pale, smooth green, naturalize brown. */
  tool: "raise" | "lower" | "flatten" | "smooth" | "naturalize";
  /** The target's level (its plane), or null. */
  level: number | null;
  /** A target's stroke (D322): hard edges, the disc even. */
  hard?: boolean;
  /** Smart Lower: a stroke here carves a bed the water follows (the ring turns water-blue, D198). */
  water?: boolean;
  /** A square brush: a square disc and ring. */
  square?: boolean;
  /** The ring pulses once. */
  pulse?: boolean;
  /** Sources: Clear is on (D249, D322): a small red mark on the ring, so it's never on unnoticed. */
  mark?: boolean;
}

const TINT: Record<BrushCursorState["tool"], [number, number, number]> = {
  raise: [1.0, 0.72, 0.3],
  lower: [0.66, 0.6, 0.86],
  flatten: [0.95, 0.95, 0.9],
  smooth: [0.5, 0.95, 0.55],
  naturalize: [0.85, 0.62, 0.38],
};

/** Clear's mark on the ring (D249): Remove's red. */
const MARK: [number, number, number] = [0.86, 0.2, 0.16];

/** Smart Lower, where the water will follow the brush: the faint fill, in the ring's water-blue. */
const WATER_TINT: [number, number, number] = [...WATER_UI.ring];

/** Most quads the disc can take: a 24-tile radius, and the ring (a dash and its outline, up to 1024
 *  dashes round the largest brush). */
const MAX_QUADS = 49 * 49 + 2 * 1024 + 8;

export class BrushCursor {
  readonly mesh: Mesh;
  private readonly plane: Mesh;
  private readonly pos = new Float32Array(MAX_QUADS * 12);
  private readonly col = new Float32Array(MAX_QUADS * 16);
  private readonly geo = new BufferGeometry();
  private readonly planeGeo = new BufferGeometry();

  constructor(scene: Scene) {
    const idx = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new BufferAttribute(this.col, 4));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.planeGeo.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    this.planeGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.plane = new Mesh(this.planeGeo, new MeshBasicMaterial({ color: 0xf4f1e6, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide }));
    this.plane.frustumCulled = false;
    this.plane.renderOrder = 6;
    this.plane.visible = false;
    scene.add(this.mesh);
    scene.add(this.plane);
  }

  /** Show the brush at `s` on the terrain `heights` (W × H), or hide it (null). */
  set(s: BrushCursorState | null, heights: Uint8Array, W: number, H: number): void {
    if (!s) {
      this.mesh.visible = false;
      this.plane.visible = false;
      return;
    }
    const r = Math.max(0.5, s.radius);
    // past a 24-tile radius, the disc a block of tiles at a time (the ring stays exact)
    const cell = Math.max(1, Math.ceil(r / 24));
    const [cr, cg, cb] = s.water ? WATER_TINT : TINT[s.tool];
    const pos = this.pos;
    const col = this.col;
    let q = 0;
    const quad = (x0: number, z0: number, x1: number, z1: number, y: number, a: number, c: [number, number, number] = [cr, cg, cb]) => {
      if (q >= MAX_QUADS) return;
      pos.set([x0, y, -z0, x1, y, -z0, x1, y, -z1, x0, y, -z1], q * 12);
      for (let v = 0; v < 4; v++) col.set([c[0], c[1], c[2], a], q * 16 + v * 4);
      q++;
    };
    const tx0 = Math.max(0, Math.floor(s.x - r));
    const tx1 = Math.min(W - 1, Math.floor(s.x + r));
    const ty0 = Math.max(0, Math.floor(s.y - r));
    const ty1 = Math.min(H - 1, Math.floor(s.y + r));
    const R2 = r * r;
    // the soft disc: each tile's top, as strong as the brush presses there (square: by the larger
    // of the two distances)
    for (let y = ty0; y <= ty1; y += cell)
      for (let x = tx0; x <= tx1; x += cell) {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        const d2 = s.square ? Math.max((cx - s.x) ** 2, (cy - s.y) ** 2) : (cx - s.x) ** 2 + (cy - s.y) ** 2;
        if (d2 >= R2) continue;
        const f = s.hard ? 0.35 : (1 - d2 / R2) ** 2;
        const h = heights[Math.min(H - 1, y + (cell >> 1)) * W + Math.min(W - 1, x + (cell >> 1))] + 0.03;
        quad(x, y, Math.min(W, x + cell), Math.min(H, y + cell), h, 0.12 + 0.3 * f);
      }
    // the ring at its edge: short dashes laid on the ground, each with a thin dark outline so it
    // holds on bright shallows and pale ground; white, or with smart Lower a clear water-blue and a
    // little thicker (D198)
    const n = Math.max(24, Math.min(1024, Math.round(r * 12)));
    const ring: [number, number, number] = s.water ? [...WATER_UI.ring] : [1, 1, 1];
    const edge: [number, number, number] = [...WATER_UI.ringEdge];
    const w = (0.09 + r * 0.004) * (s.water ? 1.45 : 1) * (s.pulse ? 1.8 : 1);
    const o = w + 0.035;
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        // a square brush's ring runs round the square
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const f = s.square ? 1 / Math.max(Math.abs(c), Math.abs(sn)) : 1;
        const px = s.x + c * r * f;
        const py = s.y + sn * r * f;
        const tx = Math.floor(px);
        const ty = Math.floor(py);
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const h = heights[ty * W + tx] + 0.05;
        if (pass === 0) quad(px - o, py - o, px + o, py + o, h - 0.005, 0.85, edge);
        else quad(px - w, py - w, px + w, py + w, h, 0.97, ring);
      }
    // Clear (D249, D322): a small red mark on the ring's north-east, outlined like the ring
    if (s.mark) {
      const a = -Math.PI / 4;
      const f = s.square ? Math.SQRT2 : 1;
      const px = s.x + Math.cos(a) * r * f;
      const py = s.y - Math.sin(a) * r * f;
      const tx = Math.max(0, Math.min(W - 1, Math.floor(px)));
      const ty = Math.max(0, Math.min(H - 1, Math.floor(py)));
      const h = heights[ty * W + tx] + 0.07;
      const m = 0.22 + r * 0.01;
      quad(px - m - 0.05, py - m - 0.05, px + m + 0.05, py + m + 0.05, h - 0.005, 0.9, edge);
      quad(px - m, py - m, px + m, py + m, h, 1, MARK);
    }
    this.geo.setDrawRange(0, q * 6);
    (this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as BufferAttribute).needsUpdate = true;
    this.mesh.visible = q > 0;
    // a target: the level it works to, as a plane over the brush
    if (s.level !== null) {
      const y = s.level + 0.04;
      const p = this.planeGeo.getAttribute("position") as BufferAttribute;
      (p.array as Float32Array).set([s.x - r, y, -(s.y - r), s.x + r, y, -(s.y - r), s.x + r, y, -(s.y + r), s.x - r, y, -(s.y + r)]);
      p.needsUpdate = true;
      this.plane.visible = true;
    } else this.plane.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.planeGeo.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    (this.plane.material as MeshBasicMaterial).dispose();
  }
}

/** Most dashes a force's ring takes (a crater's, 90 tiles round at most). */
const RING_DASHES = 720;

/** A force's size at the cursor (D312; one ring, never two, D321 item 13): one calm ring, white with
 *  the brush ring's thin dark edge, drawn once where the cursor is: on the water's surface over water,
 *  on the ground elsewhere. How big, never what shape (D258). */
export class ForceRing {
  readonly mesh: Mesh;
  private readonly pos = new Float32Array(RING_DASHES * 2 * 12);
  private readonly col = new Float32Array(RING_DASHES * 2 * 16);
  private readonly geo = new BufferGeometry();

  constructor(scene: Scene) {
    const n = RING_DASHES * 2;
    const idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new BufferAttribute(this.col, 4));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.mesh = new Mesh(this.geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Show the ring round (x, y), `r` tiles across its radius, each dash at `level(tx, ty)` (the water's
   *  surface where there is water, else the ground); null hides it. */
  set(s: { x: number; y: number; r: number } | null, level: (tx: number, ty: number) => number, W: number, H: number): void {
    if (!s) {
      this.mesh.visible = false;
      return;
    }
    const r = Math.max(0.75, s.r);
    const n = Math.max(24, Math.min(RING_DASHES, Math.round(r * 8)));
    const w = 0.08 + Math.min(r, 40) * 0.003;
    const o = w + 0.035;
    const edge: [number, number, number] = [...WATER_UI.ringEdge];
    let q = 0;
    const quad = (px: number, py: number, h: number, half: number, a: number, c: readonly number[]) => {
      this.pos.set([px - half, h, -(py - half), px + half, h, -(py - half), px + half, h, -(py + half), px - half, h, -(py + half)], q * 12);
      for (let v = 0; v < 4; v++) this.col.set([c[0], c[1], c[2], a], q * 16 + v * 4);
      q++;
    };
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = s.x + Math.cos(a) * r;
        const py = s.y + Math.sin(a) * r;
        const tx = Math.floor(px);
        const ty = Math.floor(py);
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const h = level(tx, ty) + 0.06;
        if (pass === 0) quad(px, py, h - 0.005, o, 0.7, edge);
        else quad(px, py, h, w, 0.82, [1, 1, 1]);
      }
    this.geo.setDrawRange(0, q * 6);
    (this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as BufferAttribute).needsUpdate = true;
    this.mesh.visible = q > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
