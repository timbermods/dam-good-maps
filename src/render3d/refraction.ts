// The game's see-through and refraction of the ground behind its water (Q9 P13, P2,
// investigation/notes/water_and_soil.md), in the looks that follow the game's high-quality water (Standard and High:
// the game draws both with `WaterQualitySetting.HighQualityWaterEnabled`, the Medium preset and up, which also turns on
// URP's opaque texture; the light look, as the game's Low quality, has neither).
//
// The game's water is drawn opaque (PhysicalWaterURP_Opaque's forward pass, ps 285-313): all that shows through it is
// read from `_CameraOpaqueTexture`, the opaque scene (its water not in it) as URP copies it at the game's pipeline
// asset's `m_OpaqueDownsampling` 1, `_2xBilinear` (globalgamemanagers.assets, read as tools/game-bloom.py reads the
// asset): a texture of half the screen's width and height, each texel the screen sampled bilinearly at its centre (a
// 2 × 2 box), read bilinearly by the water. So the ground behind the water shows at half the screen's resolution,
// softened. It is read at the pixel's screen position moved by its `PerlinNoise3` (t10,
// `_ContaminationVisualizationNoise`) sampled at (xz + T × `_DistortionSpeed` 0.075) × `_DistortionScale` 1.1,
// n × 2 − 1 × `_DistortionWeights` (0.003, 0.004) of the screen, full within 40 units of the camera and none past 60
// (`_DistortionDistanceFalloff`, a smoothstep), × (1 − the waterfall mask) (fallMask.ts), and kept only where the
// camera's depth there is not nearer than at the pixel (it lands behind the water); its see-through (P13) and its depth
// (P3) are read at that position. So the ground that shows through the water (at most 17.5 % of it,
// `WATER_SURFACE.seeThrough`) shimmers by up to about five pixels, close up.
//
// Ours: the screen as drawn before the water (the ground, the objects, the sky) is copied once a frame just before the
// first water is drawn (`Refraction.before`, the water meshes' `onBeforeRender`), at its own size (the canvas is
// multisampled, and the copy resolves it), and that copy is blitted with a linear filter to one of half its size, URP's
// opaque texture. Our water is blended over the screen, so its shader adds what reading the ground from the half-size
// copy at the moved position changes, (half(moved) − copy(here)) × (1 − alpha) / alpha, and the blend over the ground
// gives alpha × the water + (1 − alpha) × half(moved), the game's composite. Not the game's, ours by need: the noise is
// our own (the pattern texture's value noise at the game's statistics: `WATER_REFRACTION.noise`, held by
// tests/unit/water-refraction.test.ts); we have no depth of the opaque scene, so in place of the game's depth test the
// shift is taken off where a tile's shore is within its reach (and on a film's sliver, our anti-aliasing), which keeps
// the dry bank from smearing into the water; an object standing in front of the water close by can still lend its
// edge a few pixels of itself.

import {
  FramebufferTexture,
  LinearFilter,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Texture,
  type WebGLRenderer,
} from "three";

export const WATER_REFRACTION = {
  /** Which looks draw it: the game's high-quality water (Standard and High, as the see-through); a look the pixel judge
   *  finds reads further from the game's frames would turn it off here. */
  looks: { standard: true, high: true } as const,
  /** The shift's size, of the screen's width and height (`_DistortionWeights`). */
  weights: [0.003, 0.004] as const,
  /** The noise's drift (tiles a second along x and y, `_DistortionSpeed`) and its repeats a tile (`_DistortionScale`). */
  speed: 0.075,
  scale: 1.1,
  /** Full within `falloff[0]` of the camera, none past `falloff[1]` (world units, tiles; a smoothstep). */
  falloff: [40, 60] as const,
  /** The game's noise (PerlinNoise3, measured by tools/game-water-shader.py --textures, numbers only): its
   *  autocorrelation's half-width 0.038 of its repeat (78 texels of 2048), so 0.0345 tiles at 1.1 repeats a tile; its
   *  n × 2 − 1 a mean of −0.064 and a spread of 0.607, clipped at both ends (10 % of its texels at 0, 7 % at 255).
   *  Ours: the pattern texture's value noise (materials.ts `vnoise`, mipmapped, a smoothstep-interpolated lattice: its
   *  half-width 0.729 cells) at `cells` lattice cells a tile, so the same half-width, as (v − 0.5) × `gain` + `mean`,
   *  held to −1…1: a spread of 0.600, 7.7 % and 4.9 % clipped. */
  noise: { halfWidth: 0.0345, mean: -0.064, spread: 0.607, cells: 21.1, gain: 3 },
  /** URP's opaque texture's downsampling (the game's `m_OpaqueDownsampling` 1, `_2xBilinear`): the screen behind the
   *  water is read from a copy of 1/`downsampling` its width and height (URP's integer division), each texel the
   *  screen sampled bilinearly at its centre. */
  downsampling: 2,
} as const;

/** The see-through and the refraction in GLSL, for the water's shader (after the scene's uniforms, `vnoise` and
 *  `time`): `waterRefraction(g, world, alpha, shore, film)`, what reading the ground behind from the half-size copy at
 *  the moved position adds to a pixel of water whose opacity is `alpha`, `shore` tiles (as the shader measures it) from
 *  its tile's shore, `film` its film curve (1 past a sliver). */
export const REFRACTION_GLSL = /* glsl */ `
  /** The screen as drawn before the water, at its own size. */
  uniform sampler2D refractTex;
  /** The same at half its size (URP's opaque texture, 2× bilinear): what shows through the water. */
  uniform sampler2D refractHalf;
  /** x: 1 while the copies are this frame's; zw: one over the screen's size (pixels). */
  uniform vec4 refractView;
  vec3 waterRefraction(vec2 g, vec3 world, float alpha, float shore, float film) {
    // (the derivatives and the mipmapped noise first, in uniform control flow: after a branch a pixel's neighbours may
    // not have run them, and their values are undefined)
    float fw = max(fwidth(g.x), fwidth(g.y));
    float n = clamp((vnoise((g + time * ${f(WATER_REFRACTION.speed)}) * ${f(WATER_REFRACTION.noise.cells)}) - 0.5) * ${f(WATER_REFRACTION.noise.gain)} + ${f(WATER_REFRACTION.noise.mean)}, -1.0, 1.0);
    if (refractView.x < 0.5 || alpha >= 0.999) return vec3(0.0);
    vec2 here = gl_FragCoord.xy * refractView.zw;
    float dist = length(cameraPosition - world);
    float far = clamp((dist - ${f(WATER_REFRACTION.falloff[1])}) / ${f(WATER_REFRACTION.falloff[0] - WATER_REFRACTION.falloff[1])}, 0.0, 1.0);
    float k = far * far * (3.0 - 2.0 * far) * (1.0 - waterFall) * film;
    vec2 shift = vec2(0.0);
    if (k > 0.0) {
      shift = k * n * vec2(${f(WATER_REFRACTION.weights[0])}, ${f(WATER_REFRACTION.weights[1])});
      // (in place of the game's depth test: none where the shift could reach past the tile's shore onto the bank)
      float reach = length(shift / refractView.zw) * fw;
      shift *= clamp(shore / max(reach, 0.0001) - 1.0, 0.0, 1.0);
    }
    vec3 behind = texture2D(refractHalf, clamp(here + shift, 0.0, 1.0)).rgb;
    vec3 drawn = texture2D(refractTex, here).rgb;
    return (behind - drawn) * (1.0 - alpha) / max(alpha, 0.05);
  }
`;

function f(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

/** The scene's uniforms the refraction reads (materials.ts SceneUniforms). */
export interface RefractionUniforms {
  refractTex: { value: FramebufferTexture | null };
  refractHalf: { value: Texture | null };
  refractView: { value: Vector4 };
}

export function refractionUniforms(): RefractionUniforms {
  return { refractTex: { value: null }, refractHalf: { value: null }, refractView: { value: new Vector4(0, 0, 1, 1) } };
}

/** The copies of the screen behind the water, made once a frame just before the first water is drawn. The renderer
 *  brackets its view's frame with `begin` and `end`; water drawn outside one (a picture, a depth map) never reads them. */
export class Refraction {
  private texture: FramebufferTexture | null = null;
  /** URP's opaque texture: the copy at half its size. */
  private half: WebGLRenderTarget | null = null;
  /** The framebuffer the full copy is read from for the blit. */
  private readFbo: WebGLFramebuffer | null = null;
  private gl: WebGLRenderer | null = null;
  private readonly size = new Vector2();
  /** A frame of the view is being drawn and wants the copies, not made yet. */
  private pending = false;

  constructor(private readonly uniforms: RefractionUniforms) {}

  /** The view's frame starts: `wanted`, whether the look shows the ground behind its water from the copies. */
  begin(wanted: boolean): void {
    this.pending = wanted;
    this.uniforms.refractView.value.x = 0;
  }

  /** The view's frame is drawn. */
  end(): void {
    this.pending = false;
    this.uniforms.refractView.value.x = 0;
  }

  /** A water mesh's `onBeforeRender`: on the first water drawn in the view's frame, the copies of what is drawn so far. */
  readonly before = (gl: WebGLRenderer, _scene: unknown, _camera: Camera, _geometry: unknown, material: Material): void => {
    if (!this.pending || !(material as { defines?: Record<string, unknown> }).defines?.WATER_REFRACTS) return;
    this.pending = false;
    if (gl.getRenderTarget() !== null) return;
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    const hw = Math.max(1, Math.floor(w / WATER_REFRACTION.downsampling));
    const hh = Math.max(1, Math.floor(h / WATER_REFRACTION.downsampling));
    if (!this.texture || this.texture.image.width !== w || this.texture.image.height !== h) {
      this.texture?.dispose();
      this.texture = new FramebufferTexture(w, h);
      this.texture.minFilter = this.texture.magFilter = LinearFilter;
      this.uniforms.refractTex.value = this.texture;
    }
    if (!this.half || this.half.width !== hw || this.half.height !== hh) {
      this.half?.dispose();
      this.half = new WebGLRenderTarget(hw, hh, { depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
      gl.initRenderTarget(this.half);
      this.uniforms.refractHalf.value = this.half.texture;
    }
    gl.copyFramebufferToTexture(this.texture);
    this.downsample(gl, w, h, this.half);
    this.uniforms.refractView.value.set(1, 0, 1 / w, 1 / h);
  };

  /** URP's `_2xBilinear` copy: the full copy blitted to half its size with a linear filter, each texel the bilinear
   *  sample at its centre (a 2 × 2 box where the size is even). */
  private downsample(gl: WebGLRenderer, w: number, h: number, half: WebGLRenderTarget): void {
    const ctx = gl.getContext() as WebGL2RenderingContext;
    const src = (gl.properties.get(this.texture!) as { __webglTexture?: WebGLTexture }).__webglTexture;
    const dst = (gl.properties.get(half) as { __webglFramebuffer?: WebGLFramebuffer }).__webglFramebuffer;
    if (!src || !dst) return;
    this.gl = gl;
    this.readFbo ??= ctx.createFramebuffer();
    gl.state.bindFramebuffer(ctx.READ_FRAMEBUFFER, this.readFbo);
    ctx.framebufferTexture2D(ctx.READ_FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, src, 0);
    gl.state.bindFramebuffer(ctx.DRAW_FRAMEBUFFER, dst);
    ctx.blitFramebuffer(0, 0, w, h, 0, 0, half.width, half.height, ctx.COLOR_BUFFER_BIT, ctx.LINEAR);
    gl.state.bindFramebuffer(ctx.READ_FRAMEBUFFER, null);
    gl.state.bindFramebuffer(ctx.DRAW_FRAMEBUFFER, null);
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
    this.half?.dispose();
    this.half = null;
    if (this.readFbo) this.gl?.getContext().deleteFramebuffer(this.readFbo);
    this.readFbo = null;
    this.uniforms.refractTex.value = null;
    this.uniforms.refractHalf.value = null;
  }
}
