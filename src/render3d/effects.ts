// Juice on the land (PLAN §20 D205 (2)): small, quick effects where an edit lands, like Townscaper's
// and Dorfromantik's. A puff of dust where ground is lowered, rings spreading where a source starts;
// a placed object's pop and wiggle is the renderer's (`wiggle`, it moves the object itself). Each
// lasts under a second, costs a draw call or two, and never waits on anything. The renderer leaves
// them out with reduced motion, and in software rendering.
//
// A force at work (D199) has one that lasts as long as it does: `Surge`, round a carve's head (from
// the Carve prototype's effects, PR #47).

import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial, RingGeometry, type Scene } from "three";
import { JUICE, type Rgb } from "./palette";

interface Live {
  obj: Object3D;
  t0: number;
  ms: number;
  /** The effect at t (0–1 of its life). */
  step(t: number): void;
  dispose(): void;
}

/** A soft round dot, for the dust. */
function dotTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  if (!g) return null;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.5, "rgba(255,255,255,0.6)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

export class Effects {
  private live: Live[] = [];
  private frame = 0;
  private dot: CanvasTexture | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly render: () => void,
  ) {}

  /** A puff of dust at tile (x, y), on the ground at `z`: `size` tiles across. */
  puff(x: number, y: number, z: number, size: number, color: Rgb = JUICE.dust): void {
    this.dot ??= dotTexture();
    const n = Math.round(10 + Math.min(14, size * 2));
    const pos = new Float32Array(n * 3);
    const from = new Float32Array(n * 3);
    const to = new Float32Array(n * 3);
    // (a fixed pattern of directions: the same puff every time)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (k % 3) * 0.7;
      const r0 = 0.15 * size * ((k % 4) / 4);
      const r1 = (0.35 + 0.25 * ((k * 7) % 5) / 5) * Math.max(1.2, size);
      from.set([x + 0.5 + Math.cos(a) * r0, z + 0.1, -(y + 0.5) + Math.sin(a) * r0], k * 3);
      to.set([x + 0.5 + Math.cos(a) * r1, z + 0.5 + 0.5 * ((k * 3) % 4) / 4, -(y + 0.5) + Math.sin(a) * r1], k * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({ color: `rgb(${color.map((v) => Math.round(v * 255)).join(",")})`, size: 0.5, sizeAttenuation: true, transparent: true, depthWrite: false, ...(this.dot ? { map: this.dot, alphaMap: this.dot } : {}) });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.add({
      obj: pts,
      t0: performance.now(),
      ms: 650,
      step: (t) => {
        const e = 1 - (1 - t) ** 3;
        for (let k = 0; k < n * 3; k++) pos[k] = from[k] + (to[k] - from[k]) * e;
        geo.attributes.position.needsUpdate = true;
        mat.size = 0.45 + 0.8 * e;
        mat.opacity = 0.75 * (1 - t) ** 1.5;
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** Rings spreading on the water at tile (x, y), at the level `z` (a source starting). */
  ripple(x: number, y: number, z: number, color: Rgb = JUICE.splash): void {
    for (const delay of [0, 180]) {
      const geo = new RingGeometry(0.86, 1, 40);
      geo.rotateX(-Math.PI / 2);
      const mat = new MeshBasicMaterial({ color: `rgb(${color.map((v) => Math.round(v * 255)).join(",")})`, transparent: true, depthWrite: false, side: DoubleSide });
      const ring = new Mesh(geo, mat);
      ring.position.set(x + 0.5, z + 0.05, -(y + 0.5));
      ring.renderOrder = 5;
      ring.visible = false;
      this.add({
        obj: ring,
        t0: performance.now() + delay,
        ms: 800,
        step: (t) => {
          ring.visible = t > 0;
          const s = 0.3 + 2.4 * (1 - (1 - Math.max(0, t)) ** 2);
          ring.scale.set(s, 1, s);
          mat.opacity = 0.8 * (1 - Math.max(0, t));
        },
        dispose: () => {
          geo.dispose();
          mat.dispose();
        },
      });
    }
  }

  private add(l: Live): void {
    this.scene.add(l.obj);
    this.live.push(l);
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.frame = 0;
    const now = performance.now();
    this.live = this.live.filter((l) => {
      const t = (now - l.t0) / l.ms;
      if (t >= 1) {
        this.scene.remove(l.obj);
        l.dispose();
        return false;
      }
      // (a ring that waits its turn gets a t below 0)
      l.step(t);
      return true;
    });
    this.render();
    if (this.live.length) this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const l of this.live) {
      this.scene.remove(l.obj);
      l.dispose();
    }
    this.live = [];
    this.dot?.dispose();
  }
}

/** A stream of a force's head, or of its trail (a split has two). */
export interface SurgeLane {
  x: number;
  y: number;
  width: number;
}

/** Where a force's head is, which way it runs, and whether it is cutting. */
export interface SurgeHead extends SurgeLane {
  dx: number;
  dy: number;
  cut: number;
  lanes?: SurgeLane[];
}

/** A point of the head's last stretch, with its heading. */
export interface SurgePoint extends SurgeLane {
  dx: number;
  dy: number;
  lanes: SurgeLane[];
}

const css = (c: readonly number[]) => "rgb(" + c.map((v) => Math.round(v * 255)).join(",") + ")";

/** A carve's head at work (D199): foam beads surging round it, blocks crumbling and dust thrown up
 *  at its front while it cuts, and a muddy ribbon along its last stretch. A fixed pool, 96 beads and
 *  48 bits of debris, shared by a split's streams; it plays until it is put away. */
export class Surge {
  private readonly group = new Group();
  private readonly foam: InstancedMesh;
  private readonly debris: InstancedMesh;
  private readonly mud: Mesh;
  private readonly dummy = new Object3D();
  private head: SurgeHead | null = null;
  private centers: (SurgeLane & { z: number })[] = [];
  private frame = 0;
  private readonly t0 = performance.now();

  constructor(
    private readonly scene: Scene,
    private readonly render: () => void,
  ) {
    this.foam = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: css(JUICE.foam), transparent: true, opacity: 0.86 }), 96);
    this.debris = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: css(JUICE.debris), transparent: true, opacity: 0.75 }), 48);
    this.mud = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: css(JUICE.mud), transparent: true, opacity: 0.58, side: DoubleSide, depthWrite: false }));
    this.foam.frustumCulled = this.debris.frustumCulled = this.mud.frustumCulled = false;
    this.mud.renderOrder = 4;
    this.foam.renderOrder = 5;
    this.group.add(this.mud, this.foam, this.debris);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** The head where it is now, its last stretch, and the ground under them (null: put it away). */
  set(head: SurgeHead | null, trail: readonly SurgePoint[], heights: Uint8Array, W: number): void {
    this.head = head;
    const z = (s: SurgeLane) => heights[Math.max(0, Math.min(heights.length - 1, Math.round(s.y) * W + Math.round(s.x)))] + 0.8;
    this.centers = head ? (head.lanes ?? [head]).map((s) => ({ ...s, z: z(s) })) : [];
    const pos: number[] = [];
    for (let k = 1; k < trail.length && head; k++) {
      const a = trail[k - 1];
      const b = trail[k];
      const aa = a.lanes.length ? a.lanes : [a];
      const bb = b.lanes.length ? b.lanes : [b];
      for (let j = 0; j < Math.max(aa.length, bb.length); j++) {
        const left = aa[Math.min(j, aa.length - 1)];
        const right = bb[Math.min(j, bb.length - 1)];
        const edge = (s: SurgeLane, h: SurgePoint, side: number) => [s.x + h.dy * s.width * 0.52 * side + 0.5, z(s), -s.y + h.dx * s.width * 0.52 * side - 0.5];
        const a0 = edge(left, a, -1);
        const a1 = edge(left, a, 1);
        const b0 = edge(right, b, -1);
        const b1 = edge(right, b, 1);
        pos.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
      }
    }
    this.mud.geometry.dispose();
    this.mud.geometry = new BufferGeometry();
    this.mud.geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    this.group.visible = !!head;
    if (head && !this.frame) this.frame = requestAnimationFrame(this.tick);
    if (!head) this.render();
  }

  private tick = (): void => {
    this.frame = 0;
    const h = this.head;
    if (!h || !this.centers.length) return;
    const t = (performance.now() - this.t0) / 1000;
    const d = this.dummy;
    const c0 = this.centers;
    for (let k = 0; k < 96; k++) {
      const c = c0[k % c0.length];
      const phase = (t * 1.8 + k * 0.618) % 1;
      const a = k * 2.4;
      const rad = c.width * Math.sqrt((k % 17) / 17) * 0.78;
      d.position.set(c.x + 0.5 + Math.cos(a) * rad - h.dx * phase * 2, c.z + 0.4 + Math.sin(phase * Math.PI) * 0.55, -c.y - 0.5 + Math.sin(a) * rad + h.dy * phase * 2);
      d.scale.set(0.12 + 0.2 * phase, 0.08, 0.25 + 0.3 * phase);
      d.rotation.set(0, -Math.atan2(h.dy, h.dx), 0);
      d.updateMatrix();
      this.foam.setMatrixAt(k, d.matrix);
    }
    this.foam.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 48; k++) {
      const c = c0[k % c0.length];
      const phase = (t * 0.65 + k * 0.381) % 1;
      const a = k * 2.39;
      const rad = c.width + phase * 3;
      d.position.set(c.x + 0.5 + Math.cos(a) * rad, c.z + 1 + 4 * Math.sin(phase * Math.PI), -c.y - 0.5 + Math.sin(a) * rad);
      d.rotation.set(phase * 4, k, phase * 3);
      d.scale.setScalar((h.cut ? 1 : 0) * (0.12 + (k % 5) * 0.07) * (1 - phase));
      d.updateMatrix();
      this.debris.setMatrixAt(k, d.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.render();
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.scene.remove(this.group);
    this.mud.geometry.dispose();
    for (const m of [this.foam, this.debris]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
    (this.mud.material as MeshBasicMaterial).dispose();
  }
}
