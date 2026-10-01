// Mist and splash rings where falls land, for the High look (#67 stage 2, investigation/maplook-finish
// water-finish.ts; D201's mist, spray and splash rings): soft points rising from each landing and
// rings spreading on the pool below, read from the falls the renderer draws (their joined lips give
// the real landing). At most 2,048 mist points and 768 rings; they cast no shadow. They move with the
// water's clock, so a held clock holds them too.

import { BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, Group, Mesh, NearestFilter, Points, RGBAFormat, ShaderMaterial, Vector2, type InstancedBufferGeometry } from "three";
import type { SurfaceWater } from "../model";
import { HIGH_WATER, type Rgb } from "../waterPalette";

const gl = (c: Rgb) => `vec3(${c.join(", ")})`;

export const MAX_MIST = 2048;
export const MAX_RINGS = 768;

export class Mist {
  readonly group = new Group();
  private mistMat: ShaderMaterial;
  private ringMat: ShaderMaterial;
  private wet: DataTexture | null = null;
  private size = { value: new Vector2(1, 1) };
  private field: { value: DataTexture | null } = { value: null };
  stats = { mist: 0, rings: 0 };

  constructor(time: { value: number }) {
    const uniforms = { time, field: this.field, size: this.size };
    this.mistMat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float seed;
        attribute float radius;
        attribute float bad;
        uniform float time;
        varying float vFade;
        varying float vBad;
        void main() {
          float cycle = fract(time * 0.24 + seed);
          vec3 p = position;
          p.x += sin(seed * 83.7 + cycle * 3.0) * radius * 0.38;
          p.z += cos(seed * 37.1 + cycle * 2.0) * radius * 0.32;
          p.y += cycle * radius * 0.85;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(radius * (0.5 + cycle) * 340.0 / max(1.0, -view.z), 2.0, 100.0);
          vFade = sin(cycle * 3.14159) * 0.105;
          vBad = bad;
        }`,
      fragmentShader: /* glsl */ `
        varying float vFade;
        varying float vBad;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.65, 1.0, d)) * vFade;
          if (a < 0.002) discard;
          gl_FragColor = vec4(mix(${gl(HIGH_WATER.mist)}, ${gl(HIGH_WATER.badMist)}, vBad), a);
        }`,
    });
    this.ringMat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: 2,
      vertexShader: /* glsl */ `
        attribute vec3 center;
        attribute float seed;
        attribute float radius;
        attribute float bad;
        uniform float time;
        varying vec2 vUv;
        varying float vCycle;
        varying float vBad;
        varying vec3 vWorld;
        void main() {
          float c = fract(time * 0.42 + seed);
          vCycle = c;
          vUv = position.xz;
          vBad = bad;
          vec3 p = center + vec3(position.x * radius * (0.2 + 0.8 * c), 0.02, position.z * radius * (0.2 + 0.8 * c));
          vWorld = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D field;
        uniform vec2 size;
        varying vec2 vUv;
        varying float vCycle;
        varying float vBad;
        varying vec3 vWorld;
        void main() {
          vec2 uv = vec2(vWorld.x, -vWorld.z) / size;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
          vec4 state = texture2D(field, uv);
          if (state.g < 0.001 || abs(state.r - vWorld.y) > 0.22) discard;
          float d = length(vUv), aa = max(fwidth(d), 0.01);
          float ring = 1.0 - smoothstep(0.014 + aa, 0.045 + aa, abs(d - 0.78));
          float broken = 0.70 + 0.30 * sin(atan(vUv.y, vUv.x) * 5.0 + vCycle * 2.0);
          float a = ring * sin(vCycle * 3.14159) * (1.0 - vCycle) * 0.22 * broken;
          gl_FragColor = vec4(mix(${gl(HIGH_WATER.ring)}, ${gl(HIGH_WATER.badRing)}, vBad), a);
        }`,
    });
    this.group.name = "high.mist";
  }

  /** Build them again from the falls drawn (their instance data) and the water's surface. */
  set(W: number, H: number, sw: SurfaceWater, falls: Iterable<{ geometry: BufferGeometry }>): void {
    const wet = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      wet[i * 4] = sw.surface[i] === sw.surface[i] ? sw.surface[i] : -100;
      wet[i * 4 + 1] = sw.depth[i];
    }
    if (this.wet && this.wet.image.width === W && this.wet.image.height === H) (this.wet.image.data as Float32Array).set(wet);
    else {
      this.wet?.dispose();
      this.wet = new DataTexture(wet, W, H, RGBAFormat, FloatType);
      this.wet.minFilter = this.wet.magFilter = NearestFilter;
    }
    this.wet.needsUpdate = true;
    this.field.value = this.wet;
    this.size.value.set(W, H);
    this.clear();
    const pts: number[] = [];
    const seeds: number[] = [];
    const radii: number[] = [];
    const bad: number[] = [];
    const rp: number[] = [];
    const rc: number[] = [];
    const rs: number[] = [];
    const rr: number[] = [];
    const rb: number[] = [];
    for (const mesh of falls) {
      const g = mesh.geometry as InstancedBufferGeometry;
      const a = g.getAttribute("fA");
      const top = g.getAttribute("fTop");
      const shape = g.getAttribute("fShape");
      const more = g.getAttribute("fMore");
      if (!a || !top || !shape || !more) continue;
      for (let i = 0; i < g.instanceCount; i++) {
        const side = Math.round(a.getZ(i)) % 4;
        const ox = [1, -1, 0, 0][side];
        const oz = [0, 0, -1, 1][side];
        const tx = oz;
        const tz = -ox;
        const reach = (shape.getX(i) + shape.getY(i)) / 2;
        const land = (top.getZ(i) + top.getW(i)) / 2;
        const drop = (top.getX(i) + top.getY(i)) / 2 - land;
        const f = (a.getW(i) + more.getW(i)) / 2;
        if (drop < 0.6 || f < 0.1) continue;
        const x = a.getX(i) + tx * 0.5 + ox * reach;
        const z = a.getY(i) + tz * 0.5 + oz * reach;
        const c = (more.getX(i) + more.getY(i)) / 2;
        const seed = Math.abs((Math.sin(x * 71.3 + z * 39.7) * 437.1) % 1);
        if (seeds.length < MAX_MIST) {
          pts.push(x, land + 0.08, z);
          seeds.push(seed);
          radii.push(Math.min(2.2, 0.3 + drop * 0.09 + Math.sqrt(f) * 0.25));
          bad.push(c);
        }
        if (rs.length < MAX_RINGS * 6 && seed > 0.25) {
          const radius = Math.min(1.7, 0.45 + drop * 0.06);
          for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
            rp.push(u, 0, v);
            rc.push(x + ox * 0.3, land, z + oz * 0.3);
            rs.push(seed);
            rr.push(radius);
            rb.push(c);
          }
        }
      }
    }
    if (seeds.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(pts, 3));
      g.setAttribute("seed", new Float32BufferAttribute(seeds, 1));
      g.setAttribute("radius", new Float32BufferAttribute(radii, 1));
      g.setAttribute("bad", new Float32BufferAttribute(bad, 1));
      const mist = new Points(g, this.mistMat);
      mist.name = "mist";
      mist.renderOrder = 5;
      mist.frustumCulled = false;
      this.group.add(mist);
    }
    if (rs.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(rp, 3));
      g.setAttribute("center", new Float32BufferAttribute(rc, 3));
      g.setAttribute("seed", new Float32BufferAttribute(rs, 1));
      g.setAttribute("radius", new Float32BufferAttribute(rr, 1));
      g.setAttribute("bad", new Float32BufferAttribute(rb, 1));
      const rings = new Mesh(g, this.ringMat);
      rings.name = "rings";
      rings.frustumCulled = false;
      rings.renderOrder = 4;
      this.group.add(rings);
    }
    this.stats = { mist: seeds.length, rings: rs.length / 6 };
  }

  show(mist: boolean, rings: boolean): void {
    for (const c of this.group.children) c.visible = c.name === "mist" ? mist : rings;
  }

  private clear(): void {
    for (const c of [...this.group.children]) {
      (c as Mesh).geometry.dispose();
      c.removeFromParent();
    }
  }

  dispose(): void {
    this.clear();
    this.wet?.dispose();
    this.mistMat.dispose();
    this.ringMat.dispose();
    this.group.removeFromParent();
  }
}
