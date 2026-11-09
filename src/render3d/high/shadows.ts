// Soft shadows from the real meshes for the High look (#38, investigation/maplook2 effects.ts; PLAN
// §20 D147): the terrain, the trees and the ruins drawn from the sun into a depth map (2048², fitted to the map as
// the sun sees it), which the High shaders read as four bilinear compares, spread as wide as the game's edge in play
// (shaders.ts). It is redrawn only when what casts shadows changed (the terrain, the objects, and the trees' close-up
// and far models once the camera's changes to them have settled, highLook.ts `LOD_SETTLE`: a birch's far crown is two
// octahedra, which cast diamonds), never for the camera's moves themselves, the water's movement or the wind (the trees'
// shadows stay still: their sway is a few hundredths of a tile).
// Water, falls and the effects cast none. Objects faded round the pointer (objectFade.ts) cast none while faded: the
// depth pass drops them by the objects' own test, and is drawn again when the region moves.

import { DepthTexture, DoubleSide, Matrix4, MeshDepthMaterial, NearestFilter, OrthographicCamera, RedFormat, UnsignedByteType, UnsignedIntType, Vector3, WebGLRenderTarget, type Scene, type Vector4, type WebGLRenderer } from "three";
import { SUN } from "../materials";
import { OBJECT_FADE_GLSL } from "../objectFade";

/** The depth map's side (texels). Fitted to the map as the sun sees it, a texel is 0.06–0.09 of a tile over a 128² map
 *  and 0.10–0.18 over a 256² one, against the game's 0.057 in play. The game's own High preset's 4096 reaches its edge,
 *  but waits on the smoothness gate's integrated-GPU profile (docs/progress/3d-view.md, "High's shadow edge"). */
export const SHADOW_SIZE = 2048;
/** The highest a caster reaches (levels): the tallest terrain, 22, and an object on it (light.ts `shadowReach`'s 30),
 *  and a little under the map's floor. */
const CASTER_TOP = 32;
const CASTER_BOTTOM = -2;
/** The layer the depth map draws: what casts a shadow has it (the High look enables it on the
 *  terrain, the map's base and the objects), nothing else does. */
export const CASTER_LAYER = 1;

export class SunShadows {
  readonly target: WebGLRenderTarget;
  /** The sun's view of the map the depth map was drawn with (the shaders' `hlShadowMatrix`): it moves only when the map
   *  is drawn, so a frame never reads a depth map through another sun's matrix (the shadows sliding as the camera
   *  turns, then snapping back). */
  readonly matrix = new Matrix4();
  private camera = new OrthographicCamera();
  private depth: MeshDepthMaterial;
  private centre = new Vector3();
  private W = 1;
  private H = 1;
  /** The depth map's side (texels). */
  readonly size: number;
  /** Toward the sun (world space): it turns with the camera (light.ts `sunOfYaw`), set by `setSun`. */
  private sun = SUN.clone();
  /** Something that casts shadows changed: draw the map again before the next frame. */
  dirty = true;
  /** Times drawn (information). */
  passes = 0;

  /** `u`: the scene's uniforms (the objects' fade round the pointer and their hiding, shared). */
  /** `u`: the scene's uniforms (the objects' fade round the pointer and their hiding, shared); `maxTexture`: the GPU's
   *  largest texture side. */
  constructor(u: ObjectFadeUniforms, maxTexture = SHADOW_SIZE) {
    this.depth = fadingDepth(u);
    this.camera.layers.set(CASTER_LAYER);
    this.size = Math.min(SHADOW_SIZE, maxTexture);
    // (the depth is what the shaders read; the colour, which the pass needs to draw to, is a byte a texel)
    this.target = new WebGLRenderTarget(this.size, this.size, { minFilter: NearestFilter, magFilter: NearestFilter, format: RedFormat, type: UnsignedByteType });
    this.target.depthTexture = new DepthTexture(this.size, this.size, UnsignedIntType);
  }

  /** Frame the map (W × H tiles) from the sun. */
  fit(W: number, H: number): void {
    this.W = W;
    this.H = H;
    this.centre.set(W / 2, (CASTER_TOP + CASTER_BOTTOM) / 2, -H / 2);
    this.place();
  }

  /** The sun turned (with the camera): the depth map is drawn from it, before the next frame. Returns whether it
   *  changed. */
  setSun(sun: Vector3): boolean {
    if (this.sun.equals(sun)) return false;
    this.sun.copy(sun);
    this.place();
    return true;
  }

  /** The sun's view, fitted to the map's box (its tiles, from under its floor to the tallest caster) as the sun sees it
   *  now: a rectangle in the light's plane, so no texel is spent beyond the map (a square round any turn of it took
   *  half again as much). */
  private place(): void {
    const cam = this.camera;
    cam.position.copy(this.centre).addScaledVector(this.sun, this.W + this.H + 100);
    cam.lookAt(this.centre);
    cam.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const v = new Vector3();
    for (const x of [0, this.W])
      for (const y of [CASTER_BOTTOM, CASTER_TOP])
        for (const z of [0, -this.H]) {
          v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
          z0 = Math.min(z0, v.z);
          z1 = Math.max(z1, v.z);
        }
    // (a tile round it, for a tree's crown over the edge)
    Object.assign(cam, { left: x0 - 1, right: x1 + 1, bottom: y0 - 1, top: y1 + 1, near: Math.max(0.5, -z1 - 1), far: -z0 + 1 });
    cam.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Draw the depth map if it is out of date (what is on CASTER_LAYER). */
  render(gl: WebGLRenderer, scene: Scene): void {
    if (!this.dirty) return;
    const target = gl.getRenderTarget();
    const override = scene.overrideMaterial;
    try {
      scene.overrideMaterial = this.depth;
      gl.setRenderTarget(this.target);
      gl.clear(false, true, false);
      gl.render(scene, this.camera);
      this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.passes++;
      this.dirty = false;
    } finally {
      scene.overrideMaterial = override;
      gl.setRenderTarget(target);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.depth.dispose();
  }
}

/** The uniforms the depth pass reads of the scene's (materials.ts `SceneUniforms`). */
export interface ObjectFadeUniforms {
  objectFade: { value: Vector4 };
  objectHide: { value: number };
}

/** The depth pass's material: three.js's own, with the objects (the instanced casters: the terrain is not instanced) a
 *  fade round the pointer takes, or hidden, dropped (objectFade.ts `shadowDropped`; every instanced caster is an object
 *  batch, with its `grow`), never the land's own shape. (The renderer warms its programs with one of its own,
 *  `highCopyList`.) */
export function fadingDepth(u: ObjectFadeUniforms): MeshDepthMaterial {
  // (only the depth is read: no colour is written)
  const m = new MeshDepthMaterial({ side: DoubleSide, colorWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.objectFade = u.objectFade;
    shader.uniforms.objectHide = u.objectHide;
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      /* glsl */ `${OBJECT_FADE_GLSL}
      #ifdef USE_INSTANCING
        attribute vec3 grow;
      #endif
      varying float vDropped;
      void main() {
        vDropped = 0.0;
        #ifdef USE_INSTANCING
          vec3 at = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          if (shadowDropped(vec2(at.x, -at.z), grow)) vDropped = 1.0;
        #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      /* glsl */ `varying float vDropped;
      void main() {
        if (vDropped > 0.5) discard;`,
    );
  };
  // (one program per kind of mesh, as three.js's own depth material has)
  m.customProgramCacheKey = () => "dgm-fading-depth";
  return m;
}
