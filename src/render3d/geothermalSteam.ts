// A geothermal field's steam (D178, D496): the game's `GeothermalFieldSmoke`, a particle system on the field's middle at
// its ground, drawn by its own numbers (read from its ParticleSystem and its `Dust` material; numbers only, no texture
// of the game's): 100 puffs alive (its most), each living 2–3 s, born on a ring 0.48 round the middle (a circle 0.06
// across scaled 8 times, from its edge), drifting in toward it at 0.15 a second and rising under a twentieth of
// gravity turned upward (0.49 a second², 1.5 high by the end of the longest life); 0.8–1.0 across, holding its size
// through half its life and shrinking to a tenth by its end (its size curve); its colour the game's pale grey
// (0.83/0.82/0.79) through its colour over life, a brown-grey darkening to grey and paling, and as faint as the game's:
// its alpha 0 rising to 0.094 at 0.44 of its life, 0.039 at 0.86 and 0 at its end, times its material's 0.6.
// The game runs it while the field is not blocked: not built over (our maps have no buildings) and not flooded, its
// water object at its middle with no water above its base (`FloodableObject`: the water's height there, ceiled, over
// its level), so it stops while any water stands on its middle tile, as ours does (`steamFields`). Left out: the
// game's wind, which carries the puffs (`WindParticleController`), and its puffs' own texture, here a soft round puff
// of our own. Drawn in Standard and High, never in the light look (software drawing, no motion), with the objects'
// clock; still with reduced motion. An object's, not the land's shape: hidden with the objects and faded round the
// pointer with them (objectFade.ts, by the field's middle), and cut away above the game's layer as every object is
// (the slice), each puff by where it is.

import { DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, type IUniform, type Vector4 } from "three";
import { waterAboveBase } from "../core/sim/withering";
import { rotate, type Orientation } from "../core/format/footprints";
import { ORIENTATION_NAMES, type EntityView } from "./model";
import { OBJECT_FADE_GLSL } from "./objectFade";

/** The puffs alive over a field: the game's `maxNumParticles`, which its 80 a second for 2–3 s fills. */
export const STEAM_PUFFS = 100;

/** The fields whose steam runs: each one's middle (x east, its level, z south, as the objects are placed). */
export function steamFields(e: EntityView, W: number, H: number, surface: { floor: ArrayLike<number>; depth: ArrayLike<number> } | null | undefined, lower: ReadonlyMap<number, number> | null): [number, number, number][] {
  const out: [number, number, number][] = [];
  const t = e.templates.indexOf("GeothermalField");
  if (t < 0) return out;
  for (let k = 0; k < e.count; k++) {
    if (e.template[k] !== t) continue;
    const [dx, dy] = rotate(ORIENTATION_NAMES[e.orientation[k]] as Orientation, 1, 1);
    const x = e.x[k] + dx;
    const y = e.y[k] + dy;
    const z = e.z[k];
    if (x >= 0 && y >= 0 && x < W && y < H) {
      const i = y * W + x;
      const above = Math.max(surface ? waterAboveBase(z, surface.floor[i], surface.depth[i]) : 0, lower?.get(z * W * H + i) ?? 0);
      if (above > 0) continue;
    }
    out.push([x + 0.5, z, -(y + 0.5)]);
  }
  return out;
}

const VERTEX = /* glsl */ `
  attribute vec3 puffAt;
  attribute vec4 puffSeed;
  uniform float time;${OBJECT_FADE_GLSL}
  varying vec2 uvP;
  varying float worldY;
  varying float alphaP;
  varying vec3 colourP;
  varying float seedP;
  // (a key of a curve: piecewise linear between its keys, as the game's gradients are)
  float ramp(float u, float u0, float v0, float u1, float v1) { return mix(v0, v1, clamp((u - u0) / (u1 - u0), 0.0, 1.0)); }
  void main() {
    // (hidden with the objects, faded round the pointer with them: the whole field's steam by its middle)
    float shows = objectShowsAt(vec2(puffAt.x, -puffAt.z), vec3(1.0));
    if (shows <= 0.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    float life = 2.0 + puffSeed.x;
    float age = mod(time + puffSeed.y * life, life);
    float u = age / life;
    float turn = puffSeed.z * 6.2831853;
    float r = max(0.0, 0.48 - 0.15 * age);
    vec3 at = puffAt + vec3(cos(turn) * r, 0.24525 * age * age, sin(turn) * r);
    // (its size curve: 1 held, falling to 0.108 at its end with a slope of -2.016 there)
    float h = (2.0 * u * u * u - 3.0 * u * u + 1.0) + (-2.0 * u * u * u + 3.0 * u * u) * 0.108 - 2.016 * (u * u * u - u * u);
    float size = (0.8 + 0.2 * puffSeed.w) * h;
    alphaP = shows * 0.6 * (u < 0.439 ? ramp(u, 0.0, 0.0, 0.439, 0.094) : u < 0.858 ? ramp(u, 0.439, 0.094, 0.858, 0.039) : ramp(u, 0.858, 0.039, 1.0, 0.0));
    vec3 c0 = vec3(0.302, 0.26, 0.209);
    vec3 c1 = vec3(0.509);
    vec3 c2 = vec3(0.887);
    colourP = vec3(0.83, 0.82, 0.787) * (u < 0.446 ? mix(c0, c1, u / 0.446) : mix(c1, c2, (u - 0.446) / 0.554));
    float spin = puffSeed.y * 6.2831853;
    vec2 q = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * position.xy;
    uvP = q + 0.5;
    seedP = puffSeed.z * 17.0;
    // (facing the camera: its corner along the view's right and up, in the world, so the layer cuts it where it is)
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec4 w = modelMatrix * vec4(at, 1.0);
    w.xyz += (right * position.x + up * position.y) * size;
    worldY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAGMENT = /* glsl */ `
  uniform float slice;
  varying vec2 uvP;
  varying float worldY;
  varying float alphaP;
  varying vec3 colourP;
  varying float seedP;
  void main() {
    // the game's layers: what stands above the slice is cut away, as the objects' program cuts them
    if (worldY > slice + 0.02) discard;
    vec2 p = uvP * 2.0 - 1.0;
    float r = length(p);
    float roll = sin(p.x * 6.0 + seedP) * sin(p.y * 5.0 + seedP * 1.7);
    float edge = 1.0 - smoothstep(0.15, 1.0, r + roll * 0.08);
    if (edge * alphaP < 0.002) discard;
    gl_FragColor = vec4(colourP, edge * alphaP);
  }`;

/** The steam over the map's geothermal fields: one batch of puffs placed and timed on the GPU, nothing a frame. */
export class GeothermalSteam {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly geometry = new PlaneGeometry(1, 1);
  private fields = "";

  /** On the objects' clock, their layer cut (`slice`) and their fade and hiding (`objectFade`, `objectHide`): the
   *  scene's own uniforms, shared, so the steam follows them with nothing to do. */
  constructor(uniforms: { time: IUniform<number>; slice: IUniform<number>; objectFade: IUniform<Vector4>; objectHide: IUniform<number> }) {
    const { time, slice, objectFade, objectHide } = uniforms;
    this.material = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, uniforms: { time, slice, objectFade, objectHide }, vertexShader: VERTEX, fragmentShader: FRAGMENT });
    this.mesh = new InstancedMesh(this.geometry, this.material, 0);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = "GeothermalField.steam";
  }

  /** How many fields steam. */
  get count(): number {
    return this.mesh.count / STEAM_PUFFS;
  }

  /** Steam over these fields (`steamFields`); the same fields again change nothing. */
  set(fields: readonly (readonly [number, number, number])[]): boolean {
    const key = fields.map((f) => f.join(",")).join(";");
    if (key === this.fields) return false;
    this.fields = key;
    const n = fields.length * STEAM_PUFFS;
    const at = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let f = 0; f < fields.length; f++)
      for (let k = 0; k < STEAM_PUFFS; k++) {
        const i = f * STEAM_PUFFS + k;
        at.set(fields[f], i * 3);
        // (each puff's own: its life, its moment in it, where round the ring it was born, its size)
        const h = (j: number) => {
          const s = Math.sin((i + 1) * 12.9898 + j * 78.233 + f * 3.17) * 43758.5453;
          return s - Math.floor(s);
        };
        seed.set([h(1), h(2), h(3), h(4)], i * 4);
      }
    // (the last fields' buffers let go: they are made again for these)
    this.geometry.dispose();
    this.geometry.setAttribute("puffAt", new InstancedBufferAttribute(at, 3));
    this.geometry.setAttribute("puffSeed", new InstancedBufferAttribute(seed, 4));
    // (the matrices are unused: each puff is placed in the program)
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
