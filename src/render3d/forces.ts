// The forces' moments on the land (PLAN §20 D202, D203, D205, D206, D216), from the forces-core
// investigation's shared effects (PR #59: Craterize's impact, Quake's rupture, Erupt's plume and
// heat): an impactor streaking down, its flash, a shock ring, dust and thrown blocks; a fault's crack
// racing along it with dust at its head; a volcano's plume of soft rolling puffs, bigger and darker
// the more powerful the eruption (D216), the lava's glow on the ground, cooling to a crust; a glacier's
// ice gathering where it was asked, its tongue advancing down the valley and melting back (D246, from
// investigation/glaciate `effects.ts`: fixed cross sections, a travelling nose and streaks). Fixed
// pools, no allocation in the frame loop; each plays on its own clock and leaves when it is done.
// The camera never shakes or moves with them (D265: it moves only when the player moves it). None
// of them plays with reduced motion or in software rendering (the renderer decides); the land's
// result never depends on them.
// A carve's surge is its own (effects.ts `Surge`).

import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type Scene,
} from "three";
import { JUICE } from "./palette";

/** A force's moment, as its worker sends it (core/forces/runs.ts `ForceCue`). */
export interface ForceMoment {
  verb: "carve" | "craterize" | "erupt" | "quake" | "glaciate";
  phase: string;
  progress: number;
  x: number;
  y: number;
  z: number;
  size: number;
  power: number;
  crater?: { a: number; b: number; angle: number; glance: number; radius: number; datum: number };
  erupt?: { vents: { x: number; y: number }[]; radius: number; fissure: boolean; line: { x: number; y: number }[] };
  quake?: { path: { x: number; y: number }[]; slide: boolean; side: 1 | -1 };
  glaciate?: { seconds: number; path?: { x: number; y: number; s: number; r: number; floor: number }[] };
}

const css = (c: readonly number[]) => "rgb(" + c.map((v) => Math.round(v * 255)).join(",") + ")";
const smooth = (v: number) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};

/** The ground's height at (x, y) in tiles, as shown. */
export type Ground = (x: number, y: number) => number;

/** Craterize's moment: the impactor falls, then flash, ring, dust and blocks. */
class Impact {
  readonly group = new Group();
  private dust = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: css(JUICE.impactDust), transparent: true, opacity: 0.3, depthWrite: false }), 64);
  private chunks = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: css(JUICE.rock) }), 32);
  private shock = new Mesh(new RingGeometry(0.97, 1, 96), new MeshBasicMaterial({ color: css(JUICE.impactFlash), transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false }));
  private flash = new Mesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: css(JUICE.impactFlash), transparent: true, opacity: 0.8, depthWrite: false }));
  private streak = new Mesh(new CylinderGeometry(0.1, 0.5, 1, 6), new MeshBasicMaterial({ color: css(JUICE.streak) }));
  private dummy = new Object3D();
  private a: NonNullable<ForceMoment["crater"]> | null = null;
  private at = { x: 0, y: 0 };
  private t0 = 0;
  /** When it struck (null: still falling). */
  struck: number | null = null;

  constructor() {
    this.shock.rotation.x = -Math.PI / 2;
    this.dust.frustumCulled = this.chunks.frustumCulled = this.shock.frustumCulled = this.flash.frustumCulled = this.streak.frustumCulled = false;
    this.dust.renderOrder = this.shock.renderOrder = this.flash.renderOrder = 5;
    this.group.add(this.dust, this.chunks, this.shock, this.flash, this.streak);
    this.group.visible = false;
  }

  begin(m: ForceMoment, now: number): void {
    this.a = m.crater!;
    this.at = { x: m.x, y: m.y };
    this.t0 = now;
    this.struck = null;
  }

  strike(now: number): void {
    this.struck ??= now;
  }

  get active(): boolean {
    return !!this.a && (this.struck === null || performance.now() - this.struck < 1850);
  }

  update(now: number): void {
    const a = this.a;
    this.group.visible = !!a && this.active;
    if (!this.group.visible || !a) return;
    const d = this.dummy;
    const x = this.at.x + 0.5;
    const z = -this.at.y - 0.5;
    const ground = a.datum;
    const arrival = 0.24;
    const fall = this.struck === null ? Math.min(0.95, (now - this.t0) / 1000 / arrival) : 1;
    const age = this.struck === null ? -1 : (now - this.struck) / 1000;
    const dx = Math.cos(a.angle) * a.glance;
    const dy = Math.sin(a.angle) * a.glance;
    this.streak.visible = age < 0;
    if (this.streak.visible) {
      const from = new Vector3(x - dx * 70, ground + 85, z + dy * 70);
      const to = new Vector3(x, ground, z);
      this.streak.position.copy(from).lerp(to, fall);
      this.streak.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), from.clone().sub(to).normalize()));
      this.streak.scale.set(1, 19, 1);
    }
    const hit = age >= 0;
    this.flash.visible = hit && age < 0.16;
    this.flash.position.set(x, ground + 1, z);
    this.flash.scale.setScalar(Math.max(0.01, a.radius * 0.52 * (1 - age / 0.16)));
    this.shock.visible = hit;
    this.shock.position.set(x, ground + 0.5, z);
    this.shock.scale.setScalar(Math.max(0.01, a.radius * (0.2 + age * 2.5)));
    (this.shock.material as MeshBasicMaterial).opacity = Math.max(0, 0.65 - age * 0.5);
    this.dust.visible = this.chunks.visible = hit;
    if (!hit) return;
    for (let k = 0; k < 64; k++) {
      const theta = k * 2.399;
      const rad = a.radius * (0.12 + age * (0.7 + (k % 7) / 12));
      d.position.set(x + Math.cos(theta) * rad, ground + 1 + Math.sin(Math.min(1, age) * Math.PI) * (1 + (k % 5)), z + Math.sin(theta) * rad);
      d.scale.setScalar(Math.max(0, 1.7 - age) * (0.4 + a.radius * 0.055) * (1 + (k % 3) * 0.3));
      d.rotation.set(k, 0, k);
      d.updateMatrix();
      this.dust.setMatrixAt(k, d.matrix);
    }
    this.dust.instanceMatrix.needsUpdate = true;
    (this.dust.material as MeshBasicMaterial).opacity = Math.max(0, 0.32 - age * 0.18);
    for (let k = 0; k < 32; k++) {
      const theta = k * 2.4;
      const vel = a.radius * (0.4 + (k % 5) * 0.15);
      const flight = Math.min(age, 1.2);
      d.position.set(x + Math.cos(theta) * vel * flight + dx * vel * flight, ground + 3 + 18 * flight - 17 * flight * flight, z + Math.sin(theta) * vel * flight - dy * vel * flight);
      d.scale.setScalar(age < 1.25 ? 0.2 + (k % 4) * 0.12 : 0);
      d.rotation.set(age * 4, k, age * 3);
      d.updateMatrix();
      this.chunks.setMatrixAt(k, d.matrix);
    }
    this.chunks.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.a = null;
    this.group.visible = false;
  }

  dispose(): void {
    for (const m of [this.dust, this.chunks]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
    for (const m of [this.shock, this.flash, this.streak]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
  }
}

/** Quake's moment: the crack runs along the fault, dust thrown up at its head. */
class Rupture {
  readonly group = new Group();
  private dust = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: css(JUICE.impactDust), transparent: true, opacity: 0.38, depthWrite: false }), 64);
  private crack = new Line(new BufferGeometry(), new LineBasicMaterial({ color: css(JUICE.crack), depthTest: false, transparent: true }));
  private dummy = new Object3D();
  private head: { x: number; y: number; z: number } | null = null;
  private ended: number | null = null;
  private t0 = 0;
  private slide = false;

  constructor() {
    this.dust.frustumCulled = this.crack.frustumCulled = false;
    this.crack.renderOrder = 8;
    this.group.add(this.crack, this.dust);
    this.group.visible = false;
  }

  set(m: ForceMoment, ground: Ground, now: number): void {
    const q = m.quake!;
    if (!this.head) this.t0 = now;
    this.head = { x: m.x, y: m.y, z: m.z };
    this.ended = m.phase === "done" ? (this.ended ?? now) : null;
    this.slide = q.slide;
    const upTo = Math.max(2, Math.ceil(Math.max(m.progress, m.phase === "rumble" ? 0.08 : 0) * q.path.length));
    const pts = q.path.slice(0, upTo).map((p) => new Vector3(p.x + 0.5, ground(p.x, p.y) + 0.16, -p.y - 0.5));
    this.crack.geometry.dispose();
    this.crack.geometry = new BufferGeometry().setFromPoints(pts);
  }

  finish(now: number): void {
    this.ended ??= now;
  }

  get active(): boolean {
    return !!this.head && (this.ended === null || performance.now() - this.ended < 1500);
  }

  update(now: number): void {
    this.group.visible = this.active;
    const h = this.head;
    if (!this.group.visible || !h) return;
    const fade = this.ended === null ? 1 : 1 - smooth((now - this.ended) / 1500);
    (this.crack.material as LineBasicMaterial).opacity = fade;
    const t = (now - this.t0) / 1000;
    const d = this.dummy;
    for (let k = 0; k < 64; k++) {
      const phase = (t * 0.85 + k * 0.381) % 1;
      const a = k * 2.4;
      const spread = (this.slide ? 1.2 : 0.5) + phase * 4;
      d.position.set(h.x + 0.5 + Math.cos(a) * spread, h.z + 0.3 + phase * 4, -h.y - 0.5 + Math.sin(a) * spread);
      d.rotation.set(k, phase, k * 0.2);
      d.scale.setScalar((0.18 + (k % 6) * 0.07) * (1 - phase) * fade);
      d.updateMatrix();
      this.dust.setMatrixAt(k, d.matrix);
    }
    this.dust.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.head = null;
    this.ended = null;
    this.group.visible = false;
  }

  dispose(): void {
    this.dust.geometry.dispose();
    (this.dust.material as MeshBasicMaterial).dispose();
    this.dust.dispose();
    this.crack.geometry.dispose();
    (this.crack.material as LineBasicMaterial).dispose();
  }
}

/** How big and how dark an eruption's plume is at `power` (D216: it billows bigger and darker at
 *  high power): its puffs' scale, their grey (1 white, 0 black), how opaque, how fast they rise. */
export function plumeLook(power: number): { scale: number; grey: number; alpha: number; rise: number } {
  const p = Math.max(0, Math.min(1, power / 100));
  const dark = smooth((p - 0.35) / 0.65);
  return { scale: 0.75 + 1.1 * p ** 1.3, grey: 0.58 - 0.36 * dark, alpha: 0.8 + 0.7 * dark, rise: 0.8 + 0.7 * p };
}

/** Erupt's moment: a pool of soft rolling puffs (a vent's, or along a fissure), then cooling. */
class Plume {
  readonly group = new Group();
  private material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { clock: { value: 0 }, grey: { value: 0.54 } },
    vertexShader: /* glsl */ `
      attribute float puffAlpha; attribute float puffSeed;
      varying vec2 uvP; varying float alphaP; varying float seedP;
      void main() {
        uvP = uv; alphaP = puffAlpha; seedP = puffSeed;
        vec4 p = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        p.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 uvP; varying float alphaP; varying float seedP;
      uniform float clock; uniform float grey;
      void main() {
        vec2 p = uvP * 2.0 - 1.0;
        float r = length(p);
        float roll = sin(p.x * 8.0 + clock * 0.8 + seedP) * sin(p.y * 7.0 - clock * 0.9 + seedP * 3.0);
        float edge = 1.0 - smoothstep(0.30, 0.98, r + roll * 0.075);
        float light = grey + p.y * 0.11 + roll * 0.035;
        gl_FragColor = vec4(vec3(light, light * 0.97, light * 0.94), edge * alphaP);
      }`,
  });
  private geometry = new PlaneGeometry(2, 2);
  private smoke = new InstancedMesh(this.geometry, this.material, 128);
  private opacity = new Float32Array(128);
  private seeds = Float32Array.from({ length: 128 }, (_, k) => k * 1.618);
  private dummy = new Object3D();
  private emitters: { x: number; y: number; along: number }[] = [];
  private radius = 10;
  private fissure = false;
  private look = plumeLook(60);
  private datum = 0;
  t0 = 0;
  /** When it ended (the plume thins and the lava cools from then). */
  ended: number | null = null;

  constructor() {
    this.geometry.setAttribute("puffAlpha", new InstancedBufferAttribute(this.opacity, 1));
    this.geometry.setAttribute("puffSeed", new InstancedBufferAttribute(this.seeds, 1));
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 5;
    this.group.add(this.smoke);
    this.group.visible = false;
  }

  begin(m: ForceMoment, now: number): void {
    const e = m.erupt!;
    this.t0 = now;
    this.ended = null;
    this.radius = e.radius;
    this.fissure = e.fissure;
    this.datum = m.z;
    this.look = plumeLook(m.power);
    this.material.uniforms.grey.value = this.look.grey;
    this.emitters = [];
    if (e.fissure && e.line.length > 1) {
      let total = 0;
      for (let k = 1; k < e.line.length; k++) total += Math.hypot(e.line[k].x - e.line[k - 1].x, e.line[k].y - e.line[k - 1].y);
      let along = 0;
      for (let k = 1; k < e.line.length; k++) {
        const a = e.line[k - 1];
        const b = e.line[k];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d < l; d += 1.4) this.emitters.push({ x: a.x + ((b.x - a.x) * d) / l, y: a.y + ((b.y - a.y) * d) / l, along: (along + d) / (total || 1) });
        along += l;
      }
    }
    if (!this.emitters.length) for (const v of e.vents) this.emitters.push({ x: v.x, y: v.y, along: 0 });
  }

  finish(now: number): void {
    this.ended ??= now;
  }

  /** Seconds since it began, and since it ended (0 while it runs). */
  ages(now: number): { age: number; cooling: number } {
    return { age: (now - this.t0) / 1000, cooling: this.ended === null ? 0 : (now - this.ended) / 1000 };
  }

  get active(): boolean {
    return !!this.emitters.length && (this.ended === null || performance.now() - this.ended < 6500);
  }

  update(now: number, ground: Ground): void {
    this.group.visible = this.active;
    if (!this.group.visible) return;
    const { age: t, cooling } = this.ages(now);
    this.material.uniforms.clock.value = t;
    const d = this.dummy;
    const L = this.look;
    for (let k = 0; k < 128; k++) {
      const e = this.emitters[k % this.emitters.length];
      const birth = (k / 128) * 2.7 + e.along * 0.75;
      const age = t - birth;
      const life = 4.2 + (k % 11) * 0.15;
      const live = age > 0 && age < life;
      const fade = live ? smooth(age / 0.48) * (1 - smooth((age - life * 0.48) / (life * 0.52))) : 0;
      const u = Math.max(0, age);
      const theta = k * 2.399;
      const spread = (0.35 + u * 0.62) * (1 + this.radius * 0.017) * L.scale;
      const wind = u * u * 0.23;
      const base = ground(e.x, e.y) || this.datum;
      d.position.set(e.x + 0.5 + Math.cos(theta + u * 0.65) * spread + wind, base + 0.6 + u * 5.4 * L.rise + Math.sin(u * 2 + k) * 0.65, -e.y - 0.5 + Math.sin(theta + u * 0.5) * spread + wind * 0.35);
      d.scale.setScalar((0.65 + u * 1.05) * (1 + this.radius * 0.018) * L.scale);
      d.updateMatrix();
      this.smoke.setMatrixAt(k, d.matrix);
      this.opacity[k] = fade * (this.fissure ? 0.45 : 0.28) * L.alpha * (1 - smooth(cooling / 6.5));
    }
    (this.geometry.attributes.puffAlpha as InstancedBufferAttribute).needsUpdate = true;
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.emitters = [];
    this.ended = null;
    this.group.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.smoke.dispose();
  }
}

type Stations = NonNullable<NonNullable<ForceMoment["glaciate"]>["path"]>;

/** Glaciate's moment: the ice gathers where it was asked while the glacier is planned; then its
 *  tongue (fixed cross sections over the land as it was, a curved nose and streaks flowing down it)
 *  advances for three seconds and melts back for two, on its own clock (it never waits for the
 *  water or the worker). */
class Glacier {
  readonly group = new Group();
  private gatherMat = new MeshBasicMaterial({ color: css(JUICE.ice), transparent: true, opacity: 0.55, depthWrite: false });
  private gather = new Mesh(new IcosahedronGeometry(1, 2), this.gatherMat);
  private crystals = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: css(JUICE.ice), transparent: true, opacity: 0.8, depthWrite: false }), 24);
  private dummy = new Object3D();
  private material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: { front: { value: 0 }, back: { value: 1 }, clock: { value: 0 }, deep: { value: new Vector3(...JUICE.iceDeep) }, white: { value: new Vector3(...JUICE.ice) } },
    vertexShader: /* glsl */ `
      attribute float station; attribute float across; varying float s; varying float v;
      void main() { s = station; v = across; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float front; uniform float back; uniform float clock; uniform vec3 deep; uniform vec3 white;
      varying float s; varying float v;
      void main() {
        float nose = front + 0.04 * (1.0 - v * v);
        if (s > nose || s > back) discard;
        float flow = sin((s - clock * 0.13) * 85.0 + v * 4.0 + sin(v * 13.0) * 0.8);
        float crevasse = smoothstep(0.91, 1.0, flow) * 0.13;
        float streak = pow(abs(sin(v * 21.0 + sin(s * 8.0 - clock * 0.6) * 0.35)), 16.0);
        vec3 color = mix(deep, white, 0.68 - 0.2 * abs(v));
        color -= crevasse;
        color += streak * 0.1;
        float lip = 1.0 - smoothstep(0.0, 0.025, nose - s);
        color = mix(color, white * 0.98, lip * 0.5);
        gl_FragColor = vec4(color, 0.92);
      }`,
  });
  private tongue: Mesh | null = null;
  private at = { x: 0, y: 0, z: 0, r: 4 };
  private t0 = 0;
  /** When the tongue began (null: the ice is still gathering), and when it ended. */
  private began: number | null = null;
  private ended: number | null = null;
  private live = false;

  constructor() {
    this.gather.frustumCulled = this.crystals.frustumCulled = false;
    this.gather.renderOrder = this.crystals.renderOrder = 5;
    this.group.add(this.gather, this.crystals);
    this.group.visible = false;
  }

  /** The ice gathers at (x, y) (the pointer's press, then while it is planned). */
  gatherAt(m: ForceMoment, now: number): void {
    if (this.live && this.began === null && this.at.x === m.x && this.at.y === m.y) return;
    this.clear();
    this.live = true;
    this.at = { x: m.x, y: m.y, z: m.z, r: Math.max(3, m.size * 0.22) };
    this.t0 = now;
  }

  /** Its tongue from the stations, over the land as it is now; its clock starts. */
  advance(path: Stations, ground: Ground, now: number): void {
    if (this.began !== null) return;
    this.live = true;
    this.began = now;
    this.ended = null;
    const vertices: number[] = [];
    const st: number[] = [];
    const across: number[] = [];
    const index: number[] = [];
    const profile = [-1, -0.84, -0.5, 0, 0.5, 0.84, 1];
    for (let k = 0; k < path.length; k++) {
      const p = path[k];
      const a = path[Math.max(0, k - 2)];
      const b = path[Math.min(path.length - 1, k + 2)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const taper = Math.min(1, 0.4 + Math.min(p.s, 1 - p.s) * 9);
      const r = p.r * taper * 0.96;
      const centre = ground(p.x - 0.5, p.y - 0.5);
      for (const c of profile) {
        const x = p.x + nx * r * c;
        const y = p.y + ny * r * c;
        const z = Math.max(p.floor + 0.8, centre + 0.8, ground(x - 0.5, y - 0.5) + 0.4) + (1 - c * c) * 2.8;
        vertices.push(x, z, -y);
        st.push(p.s);
        across.push(c);
      }
      if (k)
        for (let j = 0; j < profile.length - 1; j++) {
          const i = k * profile.length + j;
          index.push(i - profile.length, i, i + 1, i - profile.length, i + 1, i - profile.length + 1);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    g.setAttribute("station", new Float32BufferAttribute(st, 1));
    g.setAttribute("across", new Float32BufferAttribute(across, 1));
    g.setIndex(index);
    this.dropTongue();
    this.tongue = new Mesh(g, this.material);
    this.tongue.frustumCulled = false;
    this.tongue.renderOrder = 4;
    this.group.add(this.tongue);
  }

  finish(now: number): void {
    if (this.live) this.ended ??= now;
  }

  get active(): boolean {
    if (!this.live) return false;
    const now = performance.now();
    if (this.began === null) return true;
    return (now - this.began) / 1000 < 5.2 && (this.ended === null || now - this.ended < 1200);
  }

  update(now: number): void {
    this.group.visible = this.active;
    if (!this.group.visible) return;
    const growing = this.began === null ? (now - this.t0) / 1000 : Math.max(0, 0.9 - (now - this.began) / 1000 / 0.6);
    const g = smooth(Math.min(1, growing / 0.9));
    this.gather.visible = this.crystals.visible = g > 0.01;
    const x = this.at.x + 0.5;
    const z = -this.at.y - 0.5;
    const r = this.at.r * (0.35 + 0.65 * g);
    this.gather.position.set(x, this.at.z + 0.2, z);
    this.gather.scale.set(r, r * 0.32, r);
    this.gatherMat.opacity = 0.35 + 0.25 * g;
    const t = (now - this.t0) / 1000;
    const d = this.dummy;
    for (let k = 0; k < 24; k++) {
      const a = k * 2.399 + t * (0.6 + (k % 5) * 0.08);
      const rad = r * (0.5 + (k % 7) / 9);
      d.position.set(x + Math.cos(a) * rad, this.at.z + 0.6 + ((k * 0.37 + t * 0.5) % 1) * 2.2 * g, z + Math.sin(a) * rad);
      d.scale.setScalar(g * (0.12 + (k % 4) * 0.05));
      d.rotation.set(t + k, k, t * 0.7);
      d.updateMatrix();
      this.crystals.setMatrixAt(k, d.matrix);
    }
    this.crystals.instanceMatrix.needsUpdate = true;
    if (this.tongue && this.began !== null) {
      const s = (now - this.began) / 1000;
      const u = this.material.uniforms;
      u.front.value = Math.min(1, s / 3);
      u.back.value = s <= 3 ? 1 : Math.max(-0.01, 1 - (s - 3) / 2);
      u.clock.value = s;
    }
  }

  private dropTongue(): void {
    if (!this.tongue) return;
    this.group.remove(this.tongue);
    this.tongue.geometry.dispose();
    this.tongue = null;
  }

  clear(): void {
    this.dropTongue();
    this.live = false;
    this.began = null;
    this.ended = null;
    this.group.visible = false;
  }

  dispose(): void {
    this.dropTongue();
    this.material.dispose();
    this.gather.geometry.dispose();
    this.gatherMat.dispose();
    this.crystals.geometry.dispose();
    (this.crystals.material as MeshBasicMaterial).dispose();
    this.crystals.dispose();
  }
}

/** The forces' moments together, on the renderer's scene. The renderer asks each frame for the
 *  eruption's heat (the terrain shader's). */
export class ForceEffects {
  private impact = new Impact();
  private rupture = new Rupture();
  private plume = new Plume();
  private glacier = new Glacier();
  private frame = 0;
  private verb: ForceMoment["verb"] | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly render: () => void,
    private readonly ground: Ground,
  ) {
    scene.add(this.impact.group, this.rupture.group, this.plume.group, this.glacier.group);
  }

  /** A force's latest moment (from its frame). */
  set(m: ForceMoment): void {
    const now = performance.now();
    if (m.verb === "craterize") {
      if (this.verb !== "craterize" || !this.impact.active) this.impact.begin(m, now);
      if (m.phase === "impact" || m.phase === "done") this.impact.strike(now);
    } else if (m.verb === "quake") {
      this.rupture.set(m, this.ground, now);
    } else if (m.verb === "erupt") {
      if (this.verb !== "erupt" || !this.plume.active) this.plume.begin(m, now);
      if (m.phase === "done") this.plume.finish(now);
    } else if (m.verb === "glaciate") {
      if (m.phase === "gather") this.glacier.gatherAt(m, now);
      else if (m.glaciate?.path) this.glacier.advance(m.glaciate.path, this.ground, now);
      if (m.phase === "done") this.glacier.finish(now);
    }
    this.verb = m.verb;
    this.kick();
  }

  /** The force was kept or ended: its tails play out (the dust settles, the lava cools). */
  finish(): void {
    const now = performance.now();
    this.rupture.finish(now);
    this.plume.finish(now);
    this.glacier.finish(now);
    this.impact.strike(now);
    this.kick();
  }

  /** Esc, undo, a new map: every moment goes at once. */
  clear(): void {
    this.impact.clear();
    this.rupture.clear();
    this.plume.clear();
    this.glacier.clear();
    this.verb = null;
    this.render();
  }

  /** The eruption's heat on the ground now: its age and its cooling (seconds), or null. */
  heat(now: number): { age: number; cooling: number } | null {
    return this.plume.active || (this.plume.ended !== null && now - this.plume.ended < 6500) ? this.plume.ages(now) : null;
  }

  get active(): boolean {
    return this.impact.active || this.rupture.active || this.plume.active || this.glacier.active;
  }

  private kick(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.frame = 0;
    const now = performance.now();
    this.impact.update(now);
    this.rupture.update(now);
    this.plume.update(now, this.ground);
    this.glacier.update(now);
    this.render();
    if (this.active) this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.scene.remove(this.impact.group, this.rupture.group, this.plume.group, this.glacier.group);
    this.impact.dispose();
    this.rupture.dispose();
    this.plume.dispose();
    this.glacier.dispose();
  }
}
