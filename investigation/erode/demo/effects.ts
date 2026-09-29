// The moment's effects on the land (visual only, D240: the final land and water never depend on
// them): dust rising and drifting off the worn rock, and rubble falling from it to the ground below,
// bouncing once and settling into the dust. Off with reduced motion, but for a faint dust. Nothing
// here moves the camera (D265).

import * as THREE from "three";
import { Terrain } from "../core/terrain";

interface Dust {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  shade: number;
}
interface Stone {
  p: THREE.Vector3;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  s: number;
  age: number;
  life: number;
  landed: boolean;
  shade: number;
}

const MAX_DUST = 1800;
const MAX_STONES = 420;

export class Effects {
  private dust: Dust[] = [];
  private stones: Stone[] = [];
  private points: THREE.Points;
  private dustGeo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_DUST * 3);
  private size = new Float32Array(MAX_DUST);
  private alpha = new Float32Array(MAX_DUST);
  private shade = new Float32Array(MAX_DUST);
  private rocks: THREE.InstancedMesh;
  reduced = false;
  /** Called when a stone lands (for the sound), with how hard. */
  onLand: ((hard: number, at: THREE.Vector3) => void) | null = null;

  constructor(group: THREE.Group, dustMat: THREE.ShaderMaterial, private terrain: () => Terrain | null) {
    this.dustGeo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.dustGeo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.dustGeo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.dustGeo.setAttribute("aShade", new THREE.BufferAttribute(this.shade, 1));
    this.points = new THREE.Points(this.dustGeo, dustMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    const g = new THREE.DodecahedronGeometry(0.5, 0);
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.rocks = new THREE.InstancedMesh(g, m, MAX_STONES);
    this.rocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STONES * 3), 3);
    this.rocks.count = 0;
    this.rocks.frustumCulled = false;
    group.add(this.points, this.rocks);
  }

  get busy(): boolean {
    return this.dust.length > 0 || this.stones.length > 0;
  }

  clear(): void {
    this.dust = [];
    this.stones = [];
  }

  /** A puff of dust at a world point, pushed along `dir` (the way the rock opened). */
  puff(at: THREE.Vector3, dir: THREE.Vector3, amount = 1, seed = Math.random()): void {
    const n = Math.round((this.reduced ? 1 : 3) * amount);
    for (let k = 0; k < n && this.dust.length < MAX_DUST; k++) {
      const r = (a: number) => Math.sin((seed + k * 0.37 + a) * 91.7) * 0.5 + 0.5;
      this.dust.push({
        p: at.clone().add(new THREE.Vector3(r(1) - 0.5, r(2) * 0.6, r(3) - 0.5)),
        v: dir.clone().multiplyScalar(0.5 + 1.2 * r(4)).add(new THREE.Vector3((r(5) - 0.5) * 0.6, 0.25 + 0.5 * r(6), (r(7) - 0.5) * 0.6)),
        age: 0,
        life: 0.9 + 1.0 * r(8),
        size: 0.5 + 0.8 * r(9),
        shade: 0.7 + 0.25 * r(10),
      });
    }
  }

  /** A stone breaking off at a world point and falling out of the rock along `dir`. */
  drop(at: THREE.Vector3, dir: THREE.Vector3, seed = Math.random()): void {
    if (this.reduced || this.stones.length >= MAX_STONES) return;
    const r = (a: number) => Math.sin((seed + a) * 57.3) * 0.5 + 0.5;
    this.stones.push({
      p: at.clone(),
      v: dir.clone().multiplyScalar(0.8 + 1.8 * r(1)).add(new THREE.Vector3((r(2) - 0.5) * 0.8, 0.4 + r(3) * 0.8, (r(4) - 0.5) * 0.8)),
      spin: new THREE.Vector3(r(5) * 6 - 3, r(6) * 6 - 3, r(7) * 6 - 3),
      rot: new THREE.Euler(r(8) * 6, r(9) * 6, r(10) * 6),
      s: 0.2 + 0.3 * r(11),
      age: 0,
      life: 2.2 + r(12),
      landed: false,
      shade: 0.8 + 0.35 * r(13),
    });
  }

  /** The ground under a world point (the top of the solid below it), in world Y. */
  private groundBelow(p: THREE.Vector3): number {
    const t = this.terrain();
    if (!t) return 0;
    const x = Math.floor(p.x), y = Math.floor(-p.z);
    if (x < 0 || y < 0 || x >= t.W || y >= t.H) return -50;
    let z = Math.min(22, Math.floor(p.y));
    while (z >= 0 && !t.solid(x, y, z)) z--;
    return z + 1;
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    // stones
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    this.stones = this.stones.filter((s) => (s.age += dt) < s.life);
    for (const s of this.stones) {
      if (!s.landed) {
        s.v.y -= 9.8 * dt;
        s.p.addScaledVector(s.v, dt);
        s.rot.x += s.spin.x * dt;
        s.rot.y += s.spin.y * dt;
        s.rot.z += s.spin.z * dt;
        const g = this.groundBelow(s.p);
        if (s.p.y - s.s * 0.4 < g) {
          s.p.y = g + s.s * 0.4;
          const hard = Math.abs(s.v.y);
          if (hard > 2.2) {
            s.v.y = hard * 0.3;
            s.v.x *= 0.5;
            s.v.z *= 0.5;
          } else {
            s.landed = true;
            s.v.set(0, 0, 0);
          }
          this.onLand?.(hard, s.p);
          this.puff(s.p, new THREE.Vector3(0, 0.3, 0), 0.5, s.age);
        }
      }
      const fade = Math.min(1, (s.life - s.age) / 0.6);
      const sc = s.s * fade;
      q.setFromEuler(s.rot);
      m4.compose(s.p, q, new THREE.Vector3(sc, sc, sc));
      this.rocks.setMatrixAt(n, m4);
      this.rocks.setColorAt(n, new THREE.Color(0.55 * s.shade, 0.52 * s.shade, 0.46 * s.shade));
      n++;
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    // dust
    this.dust = this.dust.filter((d) => (d.age += dt) < d.life);
    let k = 0;
    for (const d of this.dust) {
      d.v.multiplyScalar(1 - 1.4 * dt);
      d.v.y += 0.12 * dt;
      d.p.addScaledVector(d.v, dt);
      const f = d.age / d.life;
      this.pos[k * 3] = d.p.x;
      this.pos[k * 3 + 1] = d.p.y;
      this.pos[k * 3 + 2] = d.p.z;
      this.size[k] = d.size * (0.7 + 1.6 * f);
      this.alpha[k] = 0.3 * Math.min(1, f * 6) * (1 - f) * (1 - f);
      this.shade[k] = d.shade;
      k++;
    }
    this.dustGeo.setDrawRange(0, k);
    for (const a of ["position", "aSize", "aAlpha", "aShade"]) (this.dustGeo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
  }
}
