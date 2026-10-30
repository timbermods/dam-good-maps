// The forces' moments on the land (PLAN §20 D202, D203, D205, D206, D216), from the forces-core
// investigation's shared effects (PR #59: Craterize's impact, Quake's rupture, Erupt's plume and
// heat): an impactor streaking down, its flash, a shock ring, dust and thrown blocks; a fault's crack
// racing along it with dust at its head; a volcano's plume of soft rolling puffs, bigger and darker
// the more powerful the eruption (D216), the lava's glow on the ground, cooling to a crust; a glacier's
// ice gathering where it was asked, its tongue advancing down the valley and melting back (D246, from
// investigation/glaciate `effects.ts`: fixed cross sections, a travelling nose and streaks); rock
// wearing away (D281, from investigation/erode `effects.ts`): fine dust drifting out of the opening
// and small stones dropping, bouncing once and resting (`Wear`; where they start, `wear.ts`). Fixed
// pools, no allocation in the frame loop; each plays on its own clock and leaves when it is done.
// The camera never shakes or moves with them (D265: it moves only when the player moves it). None
// of them plays with reduced motion or in software rendering (the renderer decides); the land's
// result never depends on them.
// A carve's surge is its own (effects.ts `Surge`).

import {
  BoxGeometry,
  BufferGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
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
import { JUICE, wallColor } from "./palette";
import { SUN } from "./materials";
import { STONE_REACH, WEAR_STRIDE, wearCount, wearSamples, type Voxels } from "./wear";

/** A force's moment, as its worker sends it (core/forces/runs.ts `ForceCue`). */
export interface ForceMoment {
  verb: "carve" | "craterize" | "erupt" | "quake" | "glaciate" | "rift" | "deposit" | "erode";
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
  /** An erosion (D281): the voxels that went in the stage just shown (z·N + tile), how many it takes in
   *  all, and whether it scoured open ground. */
  erode?: { went: ArrayLike<number>; worn: number; scoured: boolean };
  /** Its own seconds a second of its showing (Fast, Slow forces: D344 A7); absent, 1. */
  pace?: number;
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

  /** Where it is and how far it has gone (seconds since it struck; null while it falls), or null. */
  showing(now: number): { x: number; y: number; struck: number | null } | null {
    return this.active ? { ...this.at, struck: this.struck === null ? null : (now - this.struck) / 1000 } : null;
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

  /** Its head and its seconds since it began, or null. */
  showing(now: number): { x: number; y: number; age: number } | null {
    return this.active && this.head ? { x: this.head.x, y: this.head.y, age: (now - this.t0) / 1000 } : null;
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
    // (only a plume that began cools: one cleared, or never begun, has no lava to show)
    if (this.emitters.length) this.ended ??= now;
  }

  /** Seconds since it began, and since it ended (0 while it runs). */
  ages(now: number): { age: number; cooling: number } {
    return { age: (now - this.t0) / 1000, cooling: this.ended === null ? 0 : (now - this.ended) / 1000 };
  }

  get active(): boolean {
    return !!this.emitters.length && (this.ended === null || performance.now() - this.ended < 6500);
  }

  /** Its first vent and its ages, or null. */
  showing(now: number): { x: number; y: number; age: number; cooling: number } | null {
    return this.active ? { x: this.emitters[0].x, y: this.emitters[0].y, ...this.ages(now) } : null;
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
 *  advances for three of its seconds and melts back for two, kept to the land's own showing (D344,
 *  A7): its clock is the glacier's stage as its frames bring it, run on between them at the showing's
 *  pace (Fast compresses it, Slow forces stretch it) and never ahead of the next stage, so the front
 *  reaches each tile as the land there changes and the ice is gone as the land settles. Skipped to its
 *  end (Esc, Slow forces' click), it melts away at once. */
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
  /** A tongue with nothing in it, kept in the group: the mesh the ice's program is compiled ahead with (a plain mesh
   *  reading the tongue's attributes, as the tongue made when the force plays is: ForceEffects.shaderMaterials). */
  private readonly standIn = (() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([], 3));
    g.setAttribute("station", new Float32BufferAttribute([], 1));
    g.setAttribute("across", new Float32BufferAttribute([], 1));
    const m = new Mesh(g, this.material);
    m.frustumCulled = false;
    return m;
  })();
  private at = { x: 0, y: 0, z: 0, r: 4 };
  private t0 = 0;
  /** When the tongue began (null: the ice is still gathering), and when it ended. */
  private began: number | null = null;
  private ended: number | null = null;
  private live = false;
  /** The glacier's own seconds as its last frame had them, when it came, and the showing's pace. */
  private cue = { s: 0, at: 0, pace: 1 };
  /** Its seconds when it ended (kept, or skipped to its end). */
  private endS = 0;

  constructor() {
    this.gather.frustumCulled = this.crystals.frustumCulled = false;
    this.gather.renderOrder = this.crystals.renderOrder = 5;
    this.group.add(this.gather, this.crystals, this.standIn);
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

  /** The glacier's own seconds from its frame (its stage), and the showing's pace. */
  clockTo(seconds: number, pace: number, now: number): void {
    this.cue = { s: seconds, at: now, pace: pace > 0 ? pace : 1 };
  }

  /** Its own seconds now: the last frame's, run on at the showing's pace, never past the next stage
   *  (a tenth of its seconds); once ended (kept the moment its land is final), on to its end at that
   *  pace: the ice melts back on the page, and a new force puts it away (ForceEffects.skip). */
  private seconds(now: number): number {
    const c = this.cue;
    const s = Math.min(c.s + 0.1, c.s + ((now - c.at) / 1000) * c.pace);
    if (this.ended === null) return Math.min(5, s);
    return Math.min(5, Math.max(s, this.endS + ((now - this.ended) / 1000) * c.pace));
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
    if (!this.live || this.ended !== null) return;
    this.endS = this.seconds(now);
    this.ended = now;
  }

  get active(): boolean {
    if (!this.live) return false;
    const now = performance.now();
    // (still gathering: until it is planned, or a moment after it ended)
    if (this.began === null) return this.ended === null || now - this.ended < 350;
    return this.seconds(now) < 5;
  }

  /** Where it gathered and its own seconds (null while it gathers), or null. */
  showing(now: number): { x: number; y: number; seconds: number | null } | null {
    return this.active ? { x: this.at.x, y: this.at.y, seconds: this.began === null ? null : this.seconds(now) } : null;
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
      const s = this.seconds(now);
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
    this.cue = { s: 0, at: 0, pace: 1 };
    this.endS = 0;
    this.group.visible = false;
  }

  dispose(): void {
    this.dropTongue();
    this.material.dispose();
    this.standIn.geometry.dispose();
    this.gather.geometry.dispose();
    this.gatherMat.dispose();
    this.crystals.geometry.dispose();
    (this.crystals.material as MeshBasicMaterial).dispose();
    this.crystals.dispose();
  }
}

/** Erode's pools, sized once: its dust puffs, its stones, and the voxels a stage's dust and stones
 *  start from (at most). */
const WEAR_DUST = 320;
const WEAR_STONES = 48;
const WEAR_SAMPLES = 14;
/** A dust puff's floats: its origin (x, y, z, world), its velocity, when it is born (ms), its life (s; 0:
 *  free), its size, its alpha, how dim it is in the rock's shade, its colour, how far it drifts before it
 *  is out from under the roof (tiles along the opening; -1 in the open) and its speed along the opening. */
const DUST_F = 16;
/** Dust puffs a second at most (the pool's turnover: no stage takes them all, so the last stages get
 *  their share), and a stage's when it has none before it. */
const DUST_RATE = 190;
/** How far (tiles) dust from under a roof is pushed out at most. */
const DUST_PUSH = 5;
const STAGE_MS = 100;
/** A stone's floats: its origin (x, y, z), its speed across (x, z), up (y) as it breaks off, the height it
 *  rests at, when it lands, how high it bounces, when it is born (ms), its radius, its spin (x, y, z),
 *  its end (s; 0: free). */
const STONE_F = 15;
/** Levels a second a second, a little brisker than the game's tiles would fall: the stones read at a glance. */
const GRAVITY = 16;
/** A stone's rest on the ground before it fades, and its fade (s). */
const STONE_REST = 0.45;
const STONE_FADE = 0.35;
/** The dust's drag (it drifts out of the opening and slows), a second. */
const DUST_DRAG = 1.8;

/** Each level's wall stone (palette.ts `wallColor`), r, g, b a level: a stone takes its wall's. */
const WALLS = Float32Array.from({ length: 32 * 3 }, (_, k) => wallColor(Math.floor(k / 3))[k % 3]);

/** A repeatable 0–1 from k. */
const hash = (k: number) => {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Erode's moment (D281, D240): fine rock dust drifting out of the opening as the rock goes, more where
 *  more went, settling and fading; a few small stones a stage dropping from where the rock went, bouncing
 *  once on the ground below and resting a moment, then fading; a faint dust at the face as the ground
 *  rumbles. The stones are the walls' own stone, the dust that stone ground fine (never white smoke).
 *  Visual only: the land kept is exactly the land shown (D368 (9)). Fixed pools: nothing is allocated
 *  once it begins; a pool full takes no more until a puff or a stone is gone. */
class Wear {
  readonly group = new Group();
  private dustGeometry = new PlaneGeometry(2, 2);
  private dustAlpha = new Float32Array(WEAR_DUST);
  private dustColor = new Float32Array(WEAR_DUST * 3);
  private dustMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float dustAlpha; attribute vec3 dustColor;
      varying vec2 uvD; varying float alphaD; varying vec3 colorD;
      void main() {
        uvD = uv; alphaD = dustAlpha; colorD = dustColor;
        vec4 p = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        p.xy += position.xy * instanceMatrix[0][0];
        // (drawn a little toward the eye, so a puff by a wall is not cut square by it)
        p.z += instanceMatrix[0][0] * 0.3;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 uvD; varying float alphaD; varying vec3 colorD;
      void main() {
        vec2 p = uvD * 2.0 - 1.0;
        float r = dot(p, p);
        if (r > 1.0) discard;
        float a = alphaD * (1.0 - r) * (1.0 - r);
        if (a < 0.004) discard;
        gl_FragColor = vec4(colorD * (0.93 + 0.12 * p.y), a);
      }`,
  });
  private dust = new InstancedMesh(this.dustGeometry, this.dustMaterial, WEAR_DUST);
  private dustState = new Float32Array(WEAR_DUST * DUST_F);
  private stoneGeometry = new DodecahedronGeometry(1, 0);
  private stoneColor = new Float32Array(WEAR_STONES * 3);
  private stoneMaterial = new ShaderMaterial({
    uniforms: { sun: { value: SUN.clone() } },
    vertexShader: /* glsl */ `
      attribute vec3 stoneColor; varying vec3 colorS; varying vec3 worldS;
      void main() {
        colorS = stoneColor;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        worldS = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sun; varying vec3 colorS; varying vec3 worldS;
      void main() {
        // (faceted: each face its own light, the soft wrapped sun the objects take)
        vec3 n = normalize(cross(dFdx(worldS), dFdy(worldS)));
        float ndl = clamp(dot(n, sun) * 0.75 + 0.25, 0.0, 1.0);
        gl_FragColor = vec4(colorS * (0.55 + 0.6 * ndl), 1.0);
      }`,
  });
  private stones = new InstancedMesh(this.stoneGeometry, this.stoneMaterial, WEAR_STONES);
  private stoneState = new Float32Array(WEAR_STONES * STONE_F);
  private samples = new Float32Array(WEAR_SAMPLES * WEAR_STRIDE);
  private dummy = new Object3D();
  private at = { x: 0, y: 0 };
  private live = false;
  private t0 = 0;
  private ended: number | null = null;
  /** When the last puff or stone given so far is gone (ms). */
  private until = 0;
  /** Its own count, so no two puffs or stones are the same. */
  private seq = 0;
  private dustNext = 0;
  /** When the last stage's dust came (ms; 0: none yet). */
  private lastStage = 0;
  private stoneNext = 0;

  constructor() {
    this.dustGeometry.setAttribute("dustAlpha", new InstancedBufferAttribute(this.dustAlpha, 1));
    this.dustGeometry.setAttribute("dustColor", new InstancedBufferAttribute(this.dustColor, 3));
    this.stoneGeometry.setAttribute("stoneColor", new InstancedBufferAttribute(this.stoneColor, 3));
    this.dust.frustumCulled = this.stones.frustumCulled = false;
    this.dust.renderOrder = 6;
    this.stones.renderOrder = 5;
    this.group.add(this.stones, this.dust);
    this.group.visible = false;
    this.empty();
  }

  begin(m: ForceMoment, now: number): void {
    this.empty();
    this.live = true;
    this.at = { x: m.x, y: m.y };
    this.t0 = now;
    this.ended = null;
    this.until = now;
    this.seq = (m.x * 7919 + m.y * 104729 + Math.round(now)) % 100000;
    this.lastStage = 0;
  }

  /** A stage's moment: the faint dust of the rumble, then dust and stones from the voxels that went. */
  cue(m: ForceMoment, now: number, voxels: Voxels | null): void {
    if (!this.live) return;
    if (m.phase === "rumble") {
      // (a faint stir of dust at the face, before the rock begins to go)
      const x = m.x + 0.5;
      const y = m.z + 0.4;
      const z = -m.y - 0.5;
      for (let k = 0; k < 8; k++) {
        const a = k * 2.399 + hash(this.seq + k) * 0.8;
        this.puff(now, x + Math.cos(a) * 0.6, y + hash(this.seq + k + 3) * 0.6, z + Math.sin(a) * 0.6, Math.cos(a) * 0.45, 0.25, Math.sin(a) * 0.45, 1.3, 0.45, 0.16, 0);
      }
      this.seq += 8;
      return;
    }
    const e = m.erode;
    if (!e || !e.went.length || !voxels) return;
    const n = wearSamples(e.went, voxels, this.at, wearCount(e.went.length, WEAR_SAMPLES), this.samples);
    // the stage's dust: more where more went, within the stage's share of the pool's turnover
    const dt = Math.max(40, Math.min(200, this.lastStage ? now - this.lastStage : STAGE_MS));
    this.lastStage = now;
    const puffs = Math.max(2, Math.min(Math.round(3 + Math.sqrt(e.went.length)), Math.floor((DUST_RATE * dt) / 1000), 2 * n));
    // a few stones a stage, more where more went
    const stones = Math.max(1, Math.min(4, Math.round(Math.sqrt(e.went.length) / 4)));
    const every = Math.max(1, Math.floor(n / stones));
    for (let j = 0; j < n; j++) {
      const o = j * WEAR_STRIDE;
      const s = this.samples;
      const x = s[o];
      const yRow = s[o + 1];
      const level = s[o + 2];
      const dx = s[o + 3];
      const dy = s[o + 4];
      const dz = s[o + 5];
      // (under a roof, its dust starts a little further out, in the rock's shade and thinner, and
      // brightens only as it drifts out past where the roof ends)
      const roofed = s[o + 7] > 0;
      const many = Math.floor(((j + 1) * puffs) / n) - Math.floor((j * puffs) / n);
      for (let k = 0; k < many; k++) {
        const q = this.seq++;
        // (out of the opening: from a little way along it, quickly at first, slowing as it spreads)
        const out = (roofed ? 0.8 : 0.4) + 0.6 * hash(q + 0.23);
        const h = Math.hypot(dx, dy);
        const exit = roofed && h > 0.05 ? Math.max(0, s[o + 8] - out * h) : 0;
        // (pushed out: under a roof, fast enough to carry it a little past the roof's end, as far as
        // DUST_PUSH tiles; dust from deeper stays in the cave's shade)
        const speed = exit > 0 ? (Math.min(DUST_PUSH, exit + 0.6 + 0.9 * hash(q)) * DUST_DRAG) / h : 1.3 + 1.7 * hash(q);
        const jx = (hash(q + 0.31) - 0.5) * 0.7;
        const jy = (hash(q + 0.57) - 0.5) * 0.7;
        this.puff(
          now,
          x + dx * out + jx * 0.6,
          level - 0.2 + dz * out + hash(q + 0.83) * 0.5,
          -(yRow + dy * out + jy * 0.6),
          dx * speed + jx * 0.6,
          exit > 0 ? 0.15 + 0.3 * hash(q + 0.37) : dz * speed * 0.6 + 0.15,
          -(dy * speed + jy * 0.6),
          1.2 + 0.7 * hash(q + 0.13),
          0.5 + 0.4 * hash(q + 0.71),
          (0.34 + 0.18 * hash(q + 0.93)) * (roofed ? 0.75 : 1),
          hash(q + 0.41),
          roofed ? 0.35 : 1,
          0,
          // (open air: out already; under a roof straight up: out as it rises)
          !roofed ? -1 : exit,
          h > 0.05 ? speed * h : 1.5,
        );
      }
      if (j % every === 0) this.stone(now, x, yRow, level, dx, dy, dz, s[o + 6]);
    }
  }

  /** A dust puff from (x, y, z) moving (vx, vy, vz), born `delay` ms on. */
  private puff(now: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, alpha: number, warm: number, dim = 1, delay = 0, exit = -1, along = 0): void {
    const d = this.dustState;
    let k = -1;
    for (let t = 0; t < WEAR_DUST; t++) {
      const c = (this.dustNext + t) % WEAR_DUST;
      const o = c * DUST_F;
      if (d[o + 7] === 0 || now > d[o + 6] + d[o + 7] * 1000) {
        k = c;
        break;
      }
    }
    if (k < 0) return;
    this.dustNext = (k + 1) % WEAR_DUST;
    const o = k * DUST_F;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = now + delay;
    d[o + 7] = life;
    d[o + 8] = size;
    d[o + 9] = alpha;
    d[o + 10] = dim;
    d[o + 14] = exit;
    d[o + 15] = along;
    const shade = 0.88 + 0.2 * hash(this.seq + 0.17);
    for (let c = 0; c < 3; c++) d[o + 11 + c] = (JUICE.wearDust[c] + (JUICE.wearDustWarm[c] - JUICE.wearDust[c]) * warm) * shade;
    this.until = Math.max(this.until, now + delay + life * 1000);
  }

  /** A stone breaking off the voxel at (x, y, level) (map axes), out along (dx, dy, dz), landing on `floor`. */
  private stone(now: number, x: number, y: number, level: number, dx: number, dy: number, dz: number, floor: number): void {
    const st = this.stoneState;
    let k = -1;
    for (let t = 0; t < WEAR_STONES; t++) {
      const c = (this.stoneNext + t) % WEAR_STONES;
      const o = c * STONE_F;
      if (st[o + 14] === 0 || now > st[o + 9] + st[o + 14] * 1000) {
        k = c;
        break;
      }
    }
    if (k < 0) return;
    this.stoneNext = (k + 1) % WEAR_STONES;
    const q = this.seq++;
    const r = 0.11 + 0.12 * hash(q + 0.2);
    const rest = floor + r * 0.8;
    const h = Math.hypot(dx, dy);
    const hx = h > 0.05 ? dx / h : 0;
    const hy = h > 0.05 ? dy / h : 0;
    // (it breaks off the face, a little way out of the rock, and lands STONE_REACH out from the voxel,
    // where `floor` is: so each lands on the ground below the opening)
    const ox = x + hx * 0.3 + (hash(q + 0.4) - 0.5) * 0.3;
    const oyRow = y + hy * 0.3 + (hash(q + 0.6) - 0.5) * 0.3;
    const oy = Math.max(rest, level + (hash(q + 0.8) - 0.5) * 0.4);
    // (up as it breaks off: a hop from a scoured hollow, a little lift from a wall)
    const vy0 = 0.4 + 2.4 * Math.max(0, dz - 0.4) + 0.5 * hash(q + 0.9);
    const t1 = (vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAVITY * (oy - rest))) / GRAVITY;
    const bounce = Math.max(1.1, 0.33 * Math.abs(vy0 - GRAVITY * t1));
    const t2 = t1 + (2 * bounce) / GRAVITY;
    const across = (STONE_REACH - 0.3) / Math.max(0.12, t1);
    const o = k * STONE_F;
    st[o] = ox;
    st[o + 1] = oy;
    st[o + 2] = -oyRow;
    st[o + 3] = hx * across;
    st[o + 4] = -hy * across;
    st[o + 5] = vy0;
    st[o + 6] = rest;
    st[o + 7] = t1;
    st[o + 8] = bounce;
    st[o + 9] = now;
    st[o + 10] = r;
    st[o + 11] = (hash(q + 0.1) - 0.5) * 12;
    st[o + 12] = (hash(q + 0.3) - 0.5) * 12;
    st[o + 13] = (hash(q + 0.5) - 0.5) * 12;
    st[o + 14] = t2 + STONE_REST + STONE_FADE;
    // the stone of the wall it came from, some a shade browner
    const w = Math.max(0, Math.min(31, Math.floor(level))) * 3;
    const brown = hash(q + 0.7) * 0.45;
    const shade = 0.85 + 0.3 * hash(q + 0.75);
    for (let c = 0; c < 3; c++) this.stoneColor[k * 3 + c] = (WALLS[w + c] + (JUICE.rock[c] - WALLS[w + c]) * brown) * shade;
    (this.stoneGeometry.attributes.stoneColor as InstancedBufferAttribute).needsUpdate = true;
    this.until = Math.max(this.until, now + st[o + 14] * 1000);
    // a little dust where it lands
    const lx = ox + st[o + 3] * t1;
    const lz = -oyRow + st[o + 4] * t1;
    for (let p = 0; p < 2; p++) {
      const a = hash(q + p * 0.37) * Math.PI * 2;
      this.puff(now, lx, rest, lz, Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5, 0.9, 0.3, 0.26, 0.6, 1, t1 * 1000);
    }
  }

  finish(now: number): void {
    if (this.live) this.ended ??= now;
  }

  get active(): boolean {
    return this.live && (this.ended === null || performance.now() < this.until);
  }

  /** Where it acts, its seconds since it began and how many puffs and stones are in the air, or null. */
  showing(now: number): { x: number; y: number; age: number; dust: number; stones: number } | null {
    if (!this.active) return null;
    let dust = 0;
    let stones = 0;
    for (let k = 0; k < WEAR_DUST; k++) {
      const t = (now - this.dustState[k * DUST_F + 6]) / 1000;
      if (t >= 0 && t <= this.dustState[k * DUST_F + 7]) dust++;
    }
    for (let k = 0; k < WEAR_STONES; k++) {
      const t = (now - this.stoneState[k * STONE_F + 9]) / 1000;
      if (t >= 0 && t <= this.stoneState[k * STONE_F + 14]) stones++;
    }
    return { ...this.at, age: (now - this.t0) / 1000, dust, stones };
  }

  update(now: number): void {
    this.group.visible = this.active;
    if (!this.group.visible) return;
    const d = this.dustState;
    const dm = this.dust.instanceMatrix.array as Float32Array;
    for (let k = 0; k < WEAR_DUST; k++) {
      const o = k * DUST_F;
      const t = (now - d[o + 6]) / 1000;
      const life = d[o + 7];
      const m = k * 16;
      if (life === 0 || t < 0 || t > life) {
        dm[m] = 0;
        this.dustAlpha[k] = 0;
        continue;
      }
      const u = t / life;
      const e = (1 - Math.exp(-DUST_DRAG * t)) / DUST_DRAG;
      // (drifting out of the opening, rising a little, then settling as it thins)
      dm[m] = d[o + 8] * (0.7 + 1.7 * smooth(u));
      dm[m + 12] = d[o] + d[o + 3] * e;
      dm[m + 13] = d[o + 1] + d[o + 4] * e + 0.12 * t - 0.12 * t * t;
      dm[m + 14] = d[o + 2] + d[o + 5] * e;
      // (out from under the roof: as far along the opening as it has drifted, past where the roof ends)
      const out = d[o + 14] < 0 ? 1 : smooth((d[o + 15] * e - d[o + 14] + 0.3) / 0.9);
      this.dustAlpha[k] = d[o + 9] * smooth(t / 0.12) * (1 - smooth((u - 0.3) / 0.7)) * (0.45 + 0.55 * out);
      const light = d[o + 10] + (1 - d[o + 10]) * out;
      for (let c = 0; c < 3; c++) this.dustColor[k * 3 + c] = d[o + 11 + c] * light;
    }
    this.dust.instanceMatrix.needsUpdate = true;
    (this.dustGeometry.attributes.dustColor as InstancedBufferAttribute).needsUpdate = true;
    (this.dustGeometry.attributes.dustAlpha as InstancedBufferAttribute).needsUpdate = true;
    const st = this.stoneState;
    const g = this.dummy;
    for (let k = 0; k < WEAR_STONES; k++) {
      const o = k * STONE_F;
      const t = (now - st[o + 9]) / 1000;
      const end = st[o + 14];
      if (end === 0 || t < 0 || t > end) {
        g.scale.setScalar(0);
        g.position.set(0, -1000, 0);
      } else {
        const t1 = st[o + 7];
        const b = st[o + 8];
        const t2 = t1 + (2 * b) / GRAVITY;
        const fly = Math.min(t, t1) + 0.35 * Math.max(0, Math.min(t, t2) - t1);
        let y: number;
        if (t < t1) y = st[o + 1] + st[o + 5] * t - 0.5 * GRAVITY * t * t;
        else if (t < t2) y = st[o + 6] + b * (t - t1) - 0.5 * GRAVITY * (t - t1) * (t - t1);
        else y = st[o + 6];
        g.position.set(st[o] + st[o + 3] * fly, y, st[o + 2] + st[o + 4] * fly);
        const spin = Math.min(t, t2);
        g.rotation.set(st[o + 11] * spin, st[o + 12] * spin, st[o + 13] * spin);
        g.scale.setScalar(st[o + 10] * smooth(t / 0.08) * (1 - smooth((t - (end - STONE_FADE)) / STONE_FADE)));
      }
      g.updateMatrix();
      this.stones.setMatrixAt(k, g.matrix);
    }
    this.stones.instanceMatrix.needsUpdate = true;
  }

  /** Every puff and stone gone. */
  private empty(): void {
    this.dustState.fill(0);
    this.stoneState.fill(0);
    this.dustAlpha.fill(0);
    const dm = this.dust.instanceMatrix.array as Float32Array;
    for (let k = 0; k < WEAR_DUST; k++) dm[k * 16] = 0;
    this.dust.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.empty();
    this.live = false;
    this.ended = null;
    this.group.visible = false;
  }

  dispose(): void {
    this.dustGeometry.dispose();
    this.dustMaterial.dispose();
    this.dust.dispose();
    this.stoneGeometry.dispose();
    this.stoneMaterial.dispose();
    this.stones.dispose();
  }
}

/** The forces' moments together, on the renderer's scene. The renderer asks each frame for the
 *  eruption's heat (the terrain shader's). */
export class ForceEffects {
  private impact = new Impact();
  private rupture = new Rupture();
  private plume = new Plume();
  private glacier = new Glacier();
  private wear = new Wear();
  private frame = 0;
  private verb: ForceMoment["verb"] | null = null;
  /** The last force is over (kept or dropped): the next moment is a new force's (D378). */
  private over = true;

  constructor(
    private readonly scene: Scene,
    private readonly render: () => void,
    private readonly ground: Ground,
    /** The map's voxels as shown (Erode's stones land on them), or null. */
    private readonly voxels: () => Voxels | null = () => null,
  ) {
    scene.add(this.impact.group, this.rupture.group, this.plume.group, this.glacier.group, this.wear.group);
  }

  /** A force's latest moment (from its frame). The first moment after the last force was kept or
   *  dropped is a new force's (D378): whatever of the last one still plays skips to its end, and the
   *  new one plays in full, however quickly it came. A carve's moments count too, its surge its own.
   *  True for a new force's first moment. */
  set(m: ForceMoment): boolean {
    const now = performance.now();
    const fresh = this.over;
    if (fresh) {
      this.over = false;
      this.skip();
    }
    if (m.verb === "carve") return fresh;
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
      // (its last frame comes the moment its land is final, #275: the ice melts back from where it is)
      if (m.glaciate && m.phase !== "gather" && m.phase !== "done") this.glacier.clockTo(m.glaciate.seconds, m.pace ?? 1, now);
      if (m.phase === "done") this.glacier.finish(now);
    } else if (m.verb === "erode") {
      if (this.verb !== "erode" || !this.wear.active) this.wear.begin(m, now);
      this.wear.cue(m, now, this.voxels());
      if (m.phase === "done") this.wear.finish(now);
    }
    this.verb = m.verb;
    this.kick();
    return fresh;
  }

  /** The force was kept or ended: its tails play out (the dust settles, the lava cools). */
  finish(): void {
    const now = performance.now();
    this.rupture.finish(now);
    this.plume.finish(now);
    this.glacier.finish(now);
    this.wear.finish(now);
    this.impact.strike(now);
    this.over = true;
    this.kick();
  }

  /** Esc, undo, a new map: every moment goes at once. */
  clear(): void {
    this.skip();
    this.over = true;
    this.render();
  }

  /** Every moment at its end: gone. */
  private skip(): void {
    this.impact.clear();
    this.rupture.clear();
    this.plume.clear();
    this.glacier.clear();
    this.wear.clear();
    this.verb = null;
  }

  /** What plays now (tests): each moment's place and age, or null. */
  showing(now = performance.now()) {
    return { craterize: this.impact.showing(now), quake: this.rupture.showing(now), erupt: this.plume.showing(now), glaciate: this.glacier.showing(now), erode: this.wear.showing(now) };
  }

  /** The eruption's heat on the ground now: its age and its cooling (seconds), or null (no eruption
   *  playing or cooling: a later force's end never brings an old one's back). */
  heat(now: number): { age: number; cooling: number } | null {
    return this.plume.active ? this.plume.ages(now) : null;
  }

  get active(): boolean {
    return this.impact.active || this.rupture.active || this.plume.active || this.glacier.active || this.wear.active;
  }

  /** The moments' materials (Erode's dust and stones, Erupt's puffs, Glaciate's ice, its gathering ice and crystals,
   *  Craterize's dust, rocks and flash), each drawn by its mesh in the scene (hidden until its force plays; Glaciate's
   *  ice by an empty stand-in of its tongue, which is made when it plays): the renderer compiles their programs ahead
   *  (programs.ts), so a force's first moment never waits on a compile (D453; the first Erode on a page held a frame
   *  265–435 ms). Lines (Quake's crack) are left out: their program is compiled with a line, which the warm-up has no
   *  stand-in for. */
  materials(): Material[] {
    const out = new Set<Material>();
    for (const g of [this.impact.group, this.rupture.group, this.plume.group, this.glacier.group, this.wear.group])
      g.traverse((o) => {
        const mesh = o as Mesh & { isPoints?: boolean };
        if (!mesh.isMesh && !mesh.isPoints) return;
        const m = mesh.material;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) out.add(x);
      });
    return [...out];
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
    this.wear.update(now);
    this.render();
    if (this.active) this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.scene.remove(this.impact.group, this.rupture.group, this.plume.group, this.glacier.group, this.wear.group);
    this.impact.dispose();
    this.rupture.dispose();
    this.plume.dispose();
    this.glacier.dispose();
    this.wear.dispose();
  }
}
