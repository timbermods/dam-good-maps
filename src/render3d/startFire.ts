// The fire the game lights in the district center's bowl (D178 as amended 2026-11-10, D496: draw as the game draws),
// the same for both factions: its prefab `DistrictCenterFire`, drawn by its own numbers (palette.ts `START_FIRE`, read
// with tools/game-particles.py; docs/progress/3d-view.md, "The Iron Teeth's start and the fire, read"; numbers only, no
// texture of the game's). Its `Flames`: 50 particles a second from a disc 0.09 round in the bowl, each living 2–3 s and
// rising straight up at 0.2–0.5 m/s, a camera-facing square 0.5–1 across times its size curve, turned at random and
// spinning 45° a second, its colour over its life a dark grey, yellow, orange and red flame turning to a grey smoke,
// drawn unlit and alpha-blended as its FireParticles shader draws it: colour 2 × texel × particle colour, alpha 2 ×
// texel alpha × particle alpha × 0.349, its texture white with a soft round alpha (`textureAlpha`). The game's frame is
// HDR and keeps the doubled colour, which feeds the bloom (bloom.ts) where particles stack, as ours does. Its light, a
// spot in the flue pointing down, is the terrain's and the objects' (materials.ts `START_LIGHT_GLSL`).
//
// Placed and timed on the GPU from each particle's seed: 125 particles a start (the game's 50 a second × its mean life
// of 2.5 s), each born again as it dies with new draws of its speed, size, turn and place on the disc, so the stream is
// the game's; nothing is done a frame. Drawn in Standard and High, never in the light look (software drawing, no
// motion), on the objects' clock: still with reduced motion, as the geothermal steam is. An object's: hidden with the
// objects and faded round the pointer with them (objectFade.ts, by the start's middle), and cut away above the game's
// layer (the slice), each particle by where it is.

import { DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, type IUniform, type Vector4 } from "three";
import { rotate, type Orientation } from "../core/format/footprints";
import { ORIENTATION_NAMES, type EntityView } from "./model";
import { OBJECT_FADE_GLSL } from "./objectFade";
import { BLOOM_SOURCE, GAME_POST_GLSL } from "./materials";
import { START_FIRE as F } from "./palette";

/** The particles alive over a start: the game's 50 a second times its mean life, 2.5 s. */
export const FIRE_PARTICLES = 125;

/** A number as GLSL writes a float. */
const g = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));

/** Each start's district center's middle (x east, its level, z south, as the objects are placed): where its fire and
 *  its light stand, `START_FIRE.emitter` and `.light` above it (the fire's attachment is the footprint's middle in both
 *  factions' blueprints). */
export function startCentres(e: EntityView): [number, number, number][] {
  const out: [number, number, number][] = [];
  const t = e.templates.indexOf("StartingLocation");
  if (t < 0) return out;
  for (let k = 0; k < e.count; k++) {
    if (e.template[k] !== t) continue;
    const [dx, dy] = rotate(ORIENTATION_NAMES[e.orientation[k]] as Orientation, 1, 1);
    out.push([e.x[k] + dx + 0.5, e.z[k], -(e.y[k] + dy + 0.5)]);
  }
  return out;
}

/** The size curve over a particle's life (Unity's curve: Hermite between keys, each key's slope in = out, the last
 *  key held to the end). */
const SIZE_GLSL = (() => {
  const k = F.sizeOverLife;
  const seg = (a: readonly number[], b: readonly number[]) => {
    const dt = b[0] - a[0];
    return `{ float s = (u - ${g(a[0])}) / ${g(dt)}; float s2 = s * s; float s3 = s2 * s;
      return (2.0 * s3 - 3.0 * s2 + 1.0) * ${g(a[1])} + (s3 - 2.0 * s2 + s) * ${g(dt * a[2])} + (-2.0 * s3 + 3.0 * s2) * ${g(b[1])} + (s3 - s2) * ${g(dt * b[2])}; }`;
  };
  return `float fireSize(float u) {
    if (u < ${g(k[1][0])}) ${seg(k[0], k[1])}
    if (u < ${g(k[2][0])}) ${seg(k[1], k[2])}
    return ${g(k[2][1])};
  }`;
})();

/** The colour and the alpha over a particle's life: linear between the gradient's keys. */
const GRADIENT_GLSL = (() => {
  const c = F.colourOverLife;
  const a = F.alphaOverLife;
  let col = `vec3 fireColour(float u) {\n    if (u <= ${g(c[0][0])}) return vec3(${c[0].slice(1).map(g).join(", ")});\n`;
  for (let i = 1; i < c.length; i++) col += `    if (u <= ${g(c[i][0])}) return mix(vec3(${c[i - 1].slice(1).map(g).join(", ")}), vec3(${c[i].slice(1).map(g).join(", ")}), (u - ${g(c[i - 1][0])}) / ${g(c[i][0] - c[i - 1][0])});\n`;
  col += `    return vec3(${c[c.length - 1].slice(1).map(g).join(", ")});\n  }`;
  let al = `float fireAlpha(float u) {\n`;
  for (let i = 1; i < a.length; i++) al += `    if (u <= ${g(a[i][0])}) return mix(${g(a[i - 1][1])}, ${g(a[i][1])}, (u - ${g(a[i - 1][0])}) / ${g(a[i][0] - a[i - 1][0])});\n`;
  al += `    return 0.0;\n  }`;
  return `${col}\n  ${al}`;
})();

/** The texture's alpha by the distance from its middle (texture widths): the ring means of `textureAlpha`, each at its
 *  ring's middle, linear between them, none past half a width. */
const TEXTURE_GLSL = (() => {
  const t = F.textureAlpha;
  let s = `float fireTexture(float r) {\n    if (r <= 0.025) return ${g(t[0])};\n`;
  for (let i = 1; i < t.length; i++) s += `    if (r <= ${g(0.025 + 0.05 * i)}) return mix(${g(t[i - 1])}, ${g(t[i])}, (r - ${g(0.025 + 0.05 * (i - 1))}) / 0.05);\n`;
  s += `    return 0.0;\n  }`;
  return s;
})();

const VERTEX = /* glsl */ `
  attribute vec3 fireAt;
  attribute vec4 fireSeed;
  uniform float time;${OBJECT_FADE_GLSL}
  varying vec2 uvF;
  varying float worldY;
  varying float alphaF;
  varying vec3 colourF;
  ${SIZE_GLSL}
  ${GRADIENT_GLSL}
  float fireHash(float k) { return fract(sin(k * 12.9898 + 78.233) * 43758.5453); }
  void main() {
    // (hidden with the objects, faded round the pointer with them: the whole fire by its start's middle)
    float shows = objectShowsAt(vec2(fireAt.x, -fireAt.z), vec3(1.0));
    if (shows <= 0.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    float life = ${g(F.lifetime[0])} + ${g(F.lifetime[1] - F.lifetime[0])} * fireSeed.x;
    float clock = time + fireSeed.y * life;
    float age = mod(clock, life);
    float u = age / life;
    // (each life its own draws: its speed, size, turn and place on the disc)
    float k = floor(clock / life) * 7.31 + fireSeed.z * 1000.0;
    float speed = mix(${g(F.speed[0])}, ${g(F.speed[1])}, fireHash(k + 1.0));
    float size = mix(${g(F.size[0])}, ${g(F.size[1])}, fireHash(k + 2.0)) * fireSize(u);
    float turn = mix(${g(F.rotation[0])}, ${g(F.rotation[1])}, fireHash(k + 3.0)) + ${g(F.spin)} * age;
    float r = ${g(F.discRadius)} * sqrt(fireHash(k + 4.0));
    float a = 6.2831853 * fireHash(k + 5.0);
    vec3 at = fireAt + vec3(cos(a) * r, speed * age, sin(a) * r);
    alphaF = shows * fireAlpha(u);
    colourF = fireColour(u);
    vec2 q = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * position.xy;
    uvF = q + 0.5;
    // (facing the camera: its corners along the view's right and up, in the world, so the layer cuts it where it is)
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec4 w = modelMatrix * vec4(at, 1.0);
    w.xyz += (right * position.x + up * position.y) * size;
    worldY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAGMENT = /* glsl */ `
  uniform float slice;
  varying vec2 uvF;
  varying float worldY;
  varying float alphaF;
  varying vec3 colourF;
  ${GAME_POST_GLSL}
  ${TEXTURE_GLSL}
  void main() {
    // the game's layers: what stands above the slice is cut away, as the objects' program cuts them
    if (worldY > slice + 0.02) discard;
    float texel = fireTexture(length(uvF - 0.5));
    float alpha = clamp(2.0 * texel * alphaF * ${g(F.tint[3])}, 0.0, 1.0);
    if (alpha < 0.002) discard;
    // (its FireParticles colour, 2 × the white texel × the particle's colour, kept above 1 for the bloom as the game's
    // HDR frame keeps it, through the post chain as every look material's colour)
    vec3 c = gamePost(2.0 * colourF);
    gl_FragColor = vec4(bloomSource > 0.5 ? gpSource : c, alpha);
  }`;

/** The fires in the starts' bowls: one batch of particles placed and timed on the GPU, nothing a frame. */
export class StartFire {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly geometry = new PlaneGeometry(1, 1);
  private starts = "";

  /** On the objects' clock, their layer cut (`slice`) and their fade and hiding (`objectFade`, `objectHide`): the
   *  scene's own uniforms, shared, so the fire follows them with nothing to do. */
  constructor(uniforms: { time: IUniform<number>; slice: IUniform<number>; objectFade: IUniform<Vector4>; objectHide: IUniform<number> }) {
    const { time, slice, objectFade, objectHide } = uniforms;
    this.material = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, uniforms: { time, slice, objectFade, objectHide, bloomSource: BLOOM_SOURCE }, vertexShader: VERTEX, fragmentShader: FRAGMENT });
    this.mesh = new InstancedMesh(this.geometry, this.material, 0);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = "StartingLocation.fire";
  }

  /** Its material (compiled ahead with the others: renderer.ts `scheduleWarm`). */
  get shader(): ShaderMaterial {
    return this.material;
  }

  /** How many starts burn. */
  get count(): number {
    return this.mesh.count / FIRE_PARTICLES;
  }

  /** Fires in the bowls of the starts centred here (`startCentres`); the same starts again change nothing. */
  set(centres: readonly (readonly [number, number, number])[]): boolean {
    const key = centres.map((c) => c.join(",")).join(";");
    if (key === this.starts) return false;
    this.starts = key;
    const n = centres.length * FIRE_PARTICLES;
    const at = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    const [ex, ey, ez] = F.emitter;
    for (let s = 0; s < centres.length; s++)
      for (let k = 0; k < FIRE_PARTICLES; k++) {
        const i = s * FIRE_PARTICLES + k;
        // (the emitter in the model's frame, its footprint's corner the origin: the middle is (1.5, 1.5))
        at.set([centres[s][0] + ex - 1.5, centres[s][1] + ey, centres[s][2] - (ez - 1.5)], i * 3);
        // (each particle's own: its life, its moment in it, its draws' key)
        const h = (j: number) => {
          const v = Math.sin((i + 1) * 12.9898 + j * 78.233 + s * 3.17) * 43758.5453;
          return v - Math.floor(v);
        };
        seed.set([h(1), h(2), h(3), h(4)], i * 4);
      }
    // (the last starts' buffers let go: they are made again for these)
    this.geometry.dispose();
    this.geometry.setAttribute("fireAt", new InstancedBufferAttribute(at, 3));
    this.geometry.setAttribute("fireSeed", new InstancedBufferAttribute(seed, 4));
    // (the matrices are unused: each particle is placed in the program)
    if (n > this.mesh.instanceMatrix.count) this.mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(n * 16), 16);
    const one = new Matrix4();
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, one);
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    return true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
