// The game's bloom (D497 as amended 2026-11-08, D496's rule: draw as the game draws), in Standard and High, not in the
// light look. The game's `Rendering/Volume` profile turns URP's Bloom on at its default preset and up (High; the
// decompiled `BloomSetting`), on an HDR camera (`tools/game-bloom.py` reads the values below from its files). URP 17
// draws it from the frame before the grade, at half resolution, as its compiled programs do (the game's
// `globalgamemanagers.assets`, "Hidden/Universal Render Pipeline/Bloom" and "UberPost", read with D3DDisassemble):
//   - Prefilter: the 13-tap average of the frame's colour (the game renders in Gamma colour space, so these are display
//     values, above 1 where bright), at most `clamp`, times max(b − threshold, soft) / b, b its brightest channel and
//     soft = clamp(b − threshold + knee, 0, 2 knee)² / (4 knee), the threshold `Mathf.GammaToLinearSpace(1.5)` 2.537
//     and the knee half of it (taken against display values: only a pixel brighter than 1.269 feeds it); stored as its
//     square root, as every pass of the pyramid stores it (each squares what it reads).
//   - Down: `levels` − 1 times, a 9-tap Gaussian across (taps 2 texels apart: half the size) and a 5-tap one down.
//   - Up: from the smallest, each level's own mixed toward the bicubic of the one below by the scatter (lerp(0.05,
//     0.95, 0.55) = 0.545).
//   - Uber: the result's bicubic squared × `intensity` (50) added to the frame's colour in linear values, before the
//     exposure, the tonemap and the grade (materials.ts GAME_POST_GLSL).
// Ours: the finish is applied per material (materials.ts `finishLit`), and the canvas holds the graded colour, which
// reaches 255 from a display value of 1.28; the bloom wants them up to `clamp`, 2. So the frame before the grade is drawn
// a second time, at the bloom's half resolution into a half-float target, every look material writing its colour
// before the post chain (`bloomSource` 1: the colour `gamePost` was given, with no editing aid on it); the editing aids
// drawn as objects of their own (the cursor, the glow, the ghosts, the slopes' arrows, the Flow view's cues, the drought
// line, the juice) are on `AID_LAYER` (aidLayer.ts), left out of it. Its
// prefilter takes that target's texel and the four between its neighbours (bilinear) at the 13-tap's weights, so its
// average spans 3 × 3 of its texels where the game's spans 4 × 4 of the full frame's (2 × 2 of these): a texel wider,
// under the pyramid's blur. The rest is the game's, pass for pass. The result is put on the canvas as what it changes: the
// canvas's colour plus post(its colour before the grade + the bloom) − post(its colour before the grade), its colour
// before the grade read back through the grey's curve (`inverseTable`: exact up to the post chain's saturation, where
// adding the bloom changes nothing), so a pixel the bloom leaves alone is its own to the bit, editing aids included.

import {
  AddEquation,
  BufferAttribute,
  Color,
  CustomBlending,
  BufferGeometry,
  DataTexture,
  FloatType,
  FramebufferTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OneFactor,
  OrthographicCamera,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  type Camera,
  type WebGLRenderer,
} from "three";
import { AID_LAYER } from "./aidLayer";
import { BLOOM_SOURCE, GAME_POST_GLSL } from "./materials";
import { gamePostRgb } from "./palette";

/** The game's bloom (`Rendering/Volume` Bloom, Timberborn 1.1.2.8; `tools/game-bloom.py`). */
export const GAME_BLOOM = {
  /** Display values (the game's frame in Gamma colour space); URP's `Mathf.GammaToLinearSpace(1.5)`. */
  threshold: ((1.5 + 0.055) / 1.055) ** 2.4,
  intensity: 50,
  /** URP's lerp(0.05, 0.95, scatter 0.55). */
  scatter: 0.05 + 0.9 * 0.55,
  clamp: 2,
  maxIterations: 6,
} as const;

/** Which looks draw it: Standard and High, as the game's default preset (High) and Medium and Ultra do; never the
 *  light look (the game's Low preset turns it off). */
export const GAME_BLOOM_LOOKS = { standard: true, high: true } as const;

export { AID_LAYER } from "./aidLayer";

/** The canvas's code (0–255) → the linear colour before the grade that the post chain turns into it, for a grey (the
 *  post chain's saturation, +3 %, left out: `apply` puts on only what the bloom changes). The last code is the least
 *  colour that rounds to it (a linear 1.75, a display value of 1.27), past which the chain changes nothing. */
export function inverseTable(): Float32Array {
  const post = (lin: number) => gamePostRgb([toDisplay(lin), toDisplay(lin), toDisplay(lin)])[0];
  const out = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const want = Math.min(k, 254.5) / 255;
    let lo = 0;
    let hi = 8;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (post(mid) < want) lo = mid;
      else hi = mid;
    }
    out[k] = k === 0 ? 0 : hi;
  }
  return out;
}

function toDisplay(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** The number of levels URP's pyramid takes for a target of `w` × `h` (`CalcBloomMipCount`). */
export function bloomLevels(w: number, h: number): number {
  return Math.min(GAME_BLOOM.maxIterations, Math.max(1, Math.floor(Math.log2(Math.max(w, h)) - 1)));
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** URP's bicubic (Filtering.hlsl `BicubicFilter`, a B-spline in four bilinear taps): `size` xy one over the texture's
 *  size, zw its size. */
const BICUBIC = /* glsl */ `
  vec3 bicubic(sampler2D t, vec2 uv, vec4 size) {
    vec2 xy = uv * size.zw + 0.5;
    vec2 ic = floor(xy);
    vec2 fc = fract(xy);
    vec2 w0 = (1.0 / 6.0) * (fc * (fc * (-fc + 3.0) - 3.0) + 1.0);
    vec2 w1 = (1.0 / 6.0) * (fc * fc * (3.0 * fc - 6.0) + 4.0);
    vec2 w2 = (1.0 / 6.0) * (fc * (fc * (-3.0 * fc + 3.0) + 3.0) + 1.0);
    vec2 w3 = (1.0 / 6.0) * (fc * fc * fc);
    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 p0 = min((ic + w1 / g0 - 1.0 - 0.5) * size.xy, vec2(1.0));
    vec2 p1 = min((ic + w3 / g1 + 1.0 - 0.5) * size.xy, vec2(1.0));
    return g0.y * (g0.x * texture2D(t, p0).rgb + g1.x * texture2D(t, vec2(p1.x, p0.y)).rgb)
         + g1.y * (g0.x * texture2D(t, vec2(p0.x, p1.y)).rgb + g1.x * texture2D(t, p1).rgb);
  }
`;

const PREFILTER = /* glsl */ `
  uniform sampler2D src;
  uniform vec2 texel;
  varying vec2 vUv;
  void main() {
    vec3 c = 0.5 * texture2D(src, vUv).rgb + 0.125 * (texture2D(src, vUv + texel * vec2(-0.5, -0.5)).rgb
      + texture2D(src, vUv + texel * vec2(0.5, -0.5)).rgb + texture2D(src, vUv + texel * vec2(-0.5, 0.5)).rgb
      + texture2D(src, vUv + texel * vec2(0.5, 0.5)).rgb);
    c = min(c, vec3(${f(GAME_BLOOM.clamp)}));
    float b = max(c.r, max(c.g, c.b));
    float knee = ${f(GAME_BLOOM.threshold / 2)};
    float soft = clamp(b - ${f(GAME_BLOOM.threshold)} + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    c *= max(b - ${f(GAME_BLOOM.threshold)}, soft) / max(b, 1e-4);
    gl_FragColor = vec4(sqrt(max(c, vec3(0.0))), 1.0);
  }
`;

/** The 9-tap Gaussian across, from a level twice the size (`texel` its texel). */
const BLUR_ACROSS = /* glsl */ `
  uniform sampler2D src;
  uniform vec2 texel;
  varying vec2 vUv;
  vec3 at(float k) { vec3 s = texture2D(src, vUv + vec2(k * texel.x, 0.0)).rgb; return s * s; }
  void main() {
    vec3 c = at(-8.0) * 0.01621622 + at(-6.0) * 0.05405405 + at(-4.0) * 0.12162162 + at(-2.0) * 0.19459459
      + at(0.0) * 0.22702703 + at(2.0) * 0.19459459 + at(4.0) * 0.12162162 + at(6.0) * 0.05405405 + at(8.0) * 0.01621622;
    gl_FragColor = vec4(sqrt(c), 1.0);
  }
`;

/** The 5-tap Gaussian down, on its own size (bilinear taps between texels). */
const BLUR_DOWN = /* glsl */ `
  uniform sampler2D src;
  uniform vec2 texel;
  varying vec2 vUv;
  vec3 at(float k) { vec3 s = texture2D(src, vUv + vec2(0.0, k * texel.y)).rgb; return s * s; }
  void main() {
    vec3 c = at(-3.23076923) * 0.07027027 + at(-1.38461538) * 0.31621622 + at(0.0) * 0.22702703
      + at(1.38461538) * 0.31621622 + at(3.23076923) * 0.07027027;
    gl_FragColor = vec4(sqrt(c), 1.0);
  }
`;

const UPSAMPLE = /* glsl */ `
  uniform sampler2D src;
  uniform sampler2D low;
  uniform vec4 lowSize;
  varying vec2 vUv;${BICUBIC}
  void main() {
    vec3 h = texture2D(src, vUv).rgb;
    vec3 l = bicubic(low, vUv, lowSize);
    h *= h;
    gl_FragColor = vec4(sqrt(max(h + ${f(GAME_BLOOM.scatter)} * (l * l - h), vec3(0.0))), 1.0);
  }
`;

/** What the bloom changes on the canvas: post(before + bloom) − post(before), before read back from its code. */
const COMPOSITE = /* glsl */ `
  uniform sampler2D frame;
  uniform sampler2D bloom;
  uniform sampler2D inverse;
  uniform vec4 bloomSize;
  varying vec2 vUv;${BICUBIC}${GAME_POST_GLSL}
  float back(float v) { return texelFetch(inverse, ivec2(int(v * 255.0 + 0.5), 0), 0).r; }
  vec3 toDisplay(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
  void main() {
    vec3 b = bicubic(bloom, vUv, bloomSize);
    b *= b * ${f(GAME_BLOOM.intensity)};
    if (max(b.r, max(b.g, b.b)) < 1e-5) discard;
    vec3 c = texelFetch(frame, ivec2(gl_FragCoord.xy), 0).rgb;
    vec3 lin = vec3(back(c.r), back(c.g), back(c.b));
    gl_FragColor = vec4(gamePost(toDisplay(lin + b)) - gamePost(toDisplay(lin)), 0.0);
  }
`;

function pass(fragmentShader: string, uniforms: Record<string, { value: unknown }>, additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...(additive
      ? { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor }
      : { blending: NoBlending }),
  });
}

const target = (w: number, h: number) =>
  new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });

/** The game's bloom on a view's frames. `source` draws the frame before the grade into its target; `apply` builds the
 *  pyramid from it and puts the bloom on the canvas. */
export class GameBloom {
  private source: WebGLRenderTarget | null = null;
  private down: WebGLRenderTarget[] = [];
  private up: WebGLRenderTarget[] = [];
  private frame: FramebufferTexture | null = null;
  private readonly inverse: DataTexture;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readonly size = new Vector2();
  private readonly prefilter = pass(PREFILTER, { src: { value: null }, texel: { value: new Vector2() } });
  private readonly across = pass(BLUR_ACROSS, { src: { value: null }, texel: { value: new Vector2() } });
  private readonly downward = pass(BLUR_DOWN, { src: { value: null }, texel: { value: new Vector2() } });
  private readonly upsample: ShaderMaterial[] = [];
  private readonly composite: ShaderMaterial;

  constructor() {
    this.inverse = new DataTexture(inverseTable(), 256, 1, RedFormat, FloatType);
    this.inverse.minFilter = this.inverse.magFilter = NearestFilter;
    this.inverse.needsUpdate = true;
    this.composite = pass(COMPOSITE, { frame: { value: null }, bloom: { value: null }, inverse: { value: this.inverse }, bloomSize: { value: new Vector4() } }, true);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new Mesh(g, this.prefilter);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Draw the frame before the grade (every look material's colour before the post chain, no editing aid) into the
   *  bloom's half-resolution target, for the canvas's present size. */
  drawSource(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x) >> 1);
    const h = Math.max(1, Math.floor(this.size.y) >> 1);
    this.fit(w, h);
    const before = gl.getRenderTarget();
    const clear = gl.getClearAlpha();
    const was = gl.getClearColor(this.clearWas);
    BLOOM_SOURCE.value = 1;
    const aids = camera.layers.isEnabled(AID_LAYER);
    camera.layers.disable(AID_LAYER);
    try {
      gl.setRenderTarget(this.source);
      gl.setClearColor(0x000000, 1);
      gl.clear(true, true, false);
      const auto = gl.autoClear;
      gl.autoClear = false;
      gl.render(scene, camera);
      gl.autoClear = auto;
    } finally {
      BLOOM_SOURCE.value = 0;
      if (aids) camera.layers.enable(AID_LAYER);
      gl.setRenderTarget(before);
      gl.setClearColor(was, clear);
    }
  }
  private readonly clearWas = new Color();

  /** Build the pyramid from the source and put the bloom on the canvas (the view's frame, drawn). */
  apply(gl: WebGLRenderer): void {
    const src = this.source;
    if (!src) return;
    const fw = Math.max(1, Math.floor(this.size.x));
    const fh = Math.max(1, Math.floor(this.size.y));
    if (!this.frame || this.frame.image.width !== fw || this.frame.image.height !== fh) {
      this.frame?.dispose();
      this.frame = new FramebufferTexture(fw, fh);
      this.frame.minFilter = this.frame.magFilter = NearestFilter;
    }
    const before = gl.getRenderTarget();
    const auto = gl.autoClear;
    gl.autoClear = false;
    try {
      // the canvas's colour, read back where the bloom lands
      gl.setRenderTarget(null);
      gl.copyFramebufferToTexture(this.frame);
      const levels = this.down.length;
      this.draw(gl, this.prefilter, this.down[0], { src: src.texture, texel: this.texelOf(src) });
      for (let i = 1; i < levels; i++) {
        this.draw(gl, this.across, this.up[i], { src: this.down[i - 1].texture, texel: this.texelOf(this.down[i - 1]) });
        this.draw(gl, this.downward, this.down[i], { src: this.up[i].texture, texel: this.texelOf(this.up[i]) });
      }
      for (let i = levels - 2; i >= 0; i--) {
        const low = i === levels - 2 ? this.down[i + 1] : this.up[i + 1];
        this.draw(gl, this.upsample[i], this.up[i], { src: this.down[i].texture, low: low.texture, lowSize: this.sizeOf(low) });
      }
      const result = levels === 1 ? this.down[0] : this.up[0];
      this.draw(gl, this.composite, null, { frame: this.frame, bloom: result.texture, bloomSize: this.sizeOf(result) });
    } finally {
      gl.autoClear = auto;
      gl.setRenderTarget(before);
    }
  }

  dispose(): void {
    this.source?.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    this.source = null;
    this.frame?.dispose();
    this.frame = null;
    this.inverse.dispose();
    this.quad.geometry.dispose();
    for (const m of [this.prefilter, this.across, this.downward, this.composite, ...this.upsample]) m.dispose();
  }

  private fit(w: number, h: number): void {
    if (this.source && this.source.width === w && this.source.height === h) return;
    this.source?.dispose();
    this.source = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, generateMipmaps: false });
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    const levels = bloomLevels(w, h);
    let lw = w;
    let lh = h;
    for (let i = 0; i < levels; i++) {
      this.down.push(target(lw, lh));
      this.up.push(target(lw, lh));
      lw = Math.max(1, lw >> 1);
      lh = Math.max(1, lh >> 1);
    }
    while (this.upsample.length < levels) this.upsample.push(pass(UPSAMPLE, { src: { value: null }, low: { value: null }, lowSize: { value: new Vector4() } }));
  }

  private readonly texels = new WeakMap<WebGLRenderTarget, Vector2>();
  private readonly sizes = new WeakMap<WebGLRenderTarget, Vector4>();

  private texelOf(t: WebGLRenderTarget): Vector2 {
    let v = this.texels.get(t);
    if (!v) this.texels.set(t, (v = new Vector2(1 / t.width, 1 / t.height)));
    return v;
  }

  private sizeOf(t: WebGLRenderTarget): Vector4 {
    let v = this.sizes.get(t);
    if (!v) this.sizes.set(t, (v = new Vector4(1 / t.width, 1 / t.height, t.width, t.height)));
    return v;
  }

  private draw(gl: WebGLRenderer, m: ShaderMaterial, to: WebGLRenderTarget | null, values: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(values)) m.uniforms[k].value = v;
    this.quad.material = m;
    gl.setRenderTarget(to);
    gl.render(this.scene, this.camera);
  }
}
