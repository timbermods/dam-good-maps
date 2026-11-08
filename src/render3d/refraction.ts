// The game's refraction of the ground behind its water (Q9 P2, investigation/notes/water_and_soil.md), in the looks
// that follow the game's high-quality water (Standard and High: the game draws it wherever it draws the see-through,
// `WaterQualitySetting.HighQualityWaterEnabled`, the Medium preset and up, which also turns on URP's opaque texture;
// the light look, as the game's Low quality, has neither).
//
// The game (PhysicalWaterURP_Opaque's forward pass, ps 285-313) reads the screen behind its water from
// `_CameraOpaqueTexture` (the opaque scene, its water not in it) at the pixel's screen position moved by its
// `PerlinNoise3` (t10, `_ContaminationVisualizationNoise`) sampled at (xz + T × `_DistortionSpeed` 0.075) ×
// `_DistortionScale` 1.1, n × 2 − 1 × `_DistortionWeights` (0.003, 0.004) of the screen, full within 40 units of the
// camera and none past 60 (`_DistortionDistanceFalloff`, a smoothstep), × (1 − the waterfall mask) (fallMask.ts), and
// kept only where the camera's depth there is not nearer than at the pixel (it lands behind the water); its see-through
// (P13) and its depth (P3) are read at that position. So the ground that shows through the water (at most 17.5 % of
// it, `WATER_SURFACE.seeThrough`) shimmers by up to about five pixels, close up.
//
// Ours: the screen as drawn before the water (the ground, the objects, the sky) is copied once a frame into a texture
// just before the first water is drawn (`Refraction.before`, the water meshes' `onBeforeRender`), and the water's shader
// adds what the moved position changes, (copy(moved) − copy(here)) × (1 − alpha) / alpha, so the blend over the ground
// gives alpha × the water + (1 − alpha) × copy(moved), as the game's composite. Not the game's, ours by need: the noise
// is our own (the pattern texture's value noise at the game's statistics: `WATER_REFRACTION.noise`, held by
// tests/unit/water-refraction.test.ts); we have no depth of the opaque scene, so in place of the game's depth test the
// shift is taken off where a tile's shore is within its reach (and on a film's sliver, our anti-aliasing), which keeps
// the dry bank from smearing into the water; an object standing in front of the water close by can still lend its
// edge a few pixels of itself. No copy is made, and nothing moves, while no water can be within 60 of the camera
// (the camera stands more than 60 over the map's highest ground), as at the game's opening camera and farther.

import { FramebufferTexture, LinearFilter, Vector2, Vector4, type Camera, type Material, type WebGLRenderer } from "three";

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
} as const;

/** The refraction in GLSL, for the water's shader (after the scene's uniforms, `vnoise` and `time`):
 *  `waterRefraction(g, world, alpha, shore, film)`, what the moved position adds to a pixel of water whose opacity is
 *  `alpha`, `shore` tiles (as the shader measures it) from its tile's shore, `film` its film curve (1 past a sliver). */
export const REFRACTION_GLSL = /* glsl */ `
  uniform sampler2D refractTex;
  /** x: 1 while the copy is this frame's; zw: one over its size (pixels). */
  uniform vec4 refractView;
  vec3 waterRefraction(vec2 g, vec3 world, float alpha, float shore, float film) {
    // (the derivatives and the mipmapped noise first, in uniform control flow: after a branch a pixel's neighbours may
    // not have run them, and their values are undefined)
    float fw = max(fwidth(g.x), fwidth(g.y));
    float n = clamp((vnoise((g + time * ${f(WATER_REFRACTION.speed)}) * ${f(WATER_REFRACTION.noise.cells)}) - 0.5) * ${f(WATER_REFRACTION.noise.gain)} + ${f(WATER_REFRACTION.noise.mean)}, -1.0, 1.0);
    if (refractView.x < 0.5 || alpha >= 0.999) return vec3(0.0);
    float dist = length(cameraPosition - world);
    float far = clamp((dist - ${f(WATER_REFRACTION.falloff[1])}) / ${f(WATER_REFRACTION.falloff[0] - WATER_REFRACTION.falloff[1])}, 0.0, 1.0);
    float k = far * far * (3.0 - 2.0 * far) * (1.0 - waterFall) * film;
    if (k <= 0.0) return vec3(0.0);
    vec2 shift = k * n * vec2(${f(WATER_REFRACTION.weights[0])}, ${f(WATER_REFRACTION.weights[1])});
    // (in place of the game's depth test: none where the shift could reach past the tile's shore onto the bank)
    float reach = length(shift / refractView.zw) * fw;
    shift *= clamp(shore / max(reach, 0.0001) - 1.0, 0.0, 1.0);
    vec2 here = gl_FragCoord.xy * refractView.zw;
    vec2 lim = 1.0 - 0.5 * refractView.zw;
    vec3 moved = texture2D(refractTex, clamp(here + shift, 0.5 * refractView.zw, lim)).rgb;
    vec3 still = texture2D(refractTex, here).rgb;
    return (moved - still) * (1.0 - alpha) / max(alpha, 0.05);
  }
`;

function f(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

/** The scene's uniforms the refraction reads (materials.ts SceneUniforms). */
export interface RefractionUniforms {
  refractTex: { value: FramebufferTexture | null };
  refractView: { value: Vector4 };
}

export function refractionUniforms(): RefractionUniforms {
  return { refractTex: { value: null }, refractView: { value: new Vector4(0, 0, 1, 1) } };
}

/** The copy of the screen behind the water, made once a frame just before the first water is drawn. The renderer
 *  brackets its view's frame with `begin` and `end`; water drawn outside one (a picture, a depth map) never refracts. */
export class Refraction {
  private texture: FramebufferTexture | null = null;
  private readonly size = new Vector2();
  /** A frame of the view is being drawn and wants the copy, not made yet. */
  private pending = false;

  constructor(private readonly uniforms: RefractionUniforms) {}

  /** The view's frame starts: `wanted`, whether the look draws the refraction and water may be within its reach. */
  begin(wanted: boolean): void {
    this.pending = wanted;
    this.uniforms.refractView.value.x = 0;
  }

  /** The view's frame is drawn. */
  end(): void {
    this.pending = false;
    this.uniforms.refractView.value.x = 0;
  }

  /** A water mesh's `onBeforeRender`: on the first water drawn in the view's frame, the copy of what is drawn so far. */
  readonly before = (gl: WebGLRenderer, _scene: unknown, _camera: Camera, _geometry: unknown, material: Material): void => {
    if (!this.pending || !(material as { defines?: Record<string, unknown> }).defines?.WATER_REFRACTS) return;
    this.pending = false;
    if (gl.getRenderTarget() !== null) return;
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (!this.texture || this.texture.image.width !== w || this.texture.image.height !== h) {
      this.texture?.dispose();
      this.texture = new FramebufferTexture(w, h);
      this.texture.minFilter = this.texture.magFilter = LinearFilter;
      this.uniforms.refractTex.value = this.texture;
    }
    gl.copyFramebufferToTexture(this.texture);
    this.uniforms.refractView.value.set(1, 0, 1 / w, 1 / h);
  };

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
    this.uniforms.refractTex.value = null;
  }
}
