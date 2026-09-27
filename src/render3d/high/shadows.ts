// Soft shadows from the real meshes for the High look (#38, investigation/maplook2 effects.ts; PLAN
// §20 D147): the terrain, the trees and the ruins drawn from the sun into a 2048² depth map, which
// the High shaders read with a 25-tap filter (shaders.ts). It is redrawn only when what casts
// shadows changed (the terrain, the objects, a tree's close-up or far model), never for the water's
// movement or the wind (the trees' shadows stay still: their sway is a few hundredths of a tile).
// Water, falls and the effects cast none.

import { Color, DepthTexture, DoubleSide, Matrix4, MeshDepthMaterial, NearestFilter, OrthographicCamera, UnsignedIntType, Vector3, WebGLRenderTarget, type Scene, type WebGLRenderer } from "three";
import { SUN } from "../materials";

export const SHADOW_SIZE = 2048;
/** The layer the depth map draws: what casts a shadow has it (the High look enables it on the
 *  terrain, the map's base and the objects), nothing else does. */
export const CASTER_LAYER = 1;

export class SunShadows {
  readonly target: WebGLRenderTarget;
  readonly matrix = new Matrix4();
  private camera = new OrthographicCamera();
  private depth = new MeshDepthMaterial({ side: DoubleSide });
  private centre = new Vector3();
  /** Something that casts shadows changed: draw the map again before the next frame. */
  dirty = true;
  /** Times drawn (information). */
  passes = 0;

  constructor() {
    this.camera.layers.set(CASTER_LAYER);
    this.target = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { minFilter: NearestFilter, magFilter: NearestFilter });
    this.target.depthTexture = new DepthTexture(SHADOW_SIZE, SHADOW_SIZE, UnsignedIntType);
  }

  /** Frame the map (W × H tiles) from the sun. */
  fit(W: number, H: number): void {
    const extent = Math.max(W, H) * 0.76 + 24;
    Object.assign(this.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 700 });
    this.centre.set(W / 2, 8, -H / 2);
    this.camera.position.copy(this.centre).addScaledVector(SUN, 330);
    this.camera.lookAt(this.centre);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.dirty = true;
  }

  /** Draw the depth map if it is out of date (what is on CASTER_LAYER). */
  render(gl: WebGLRenderer, scene: Scene): void {
    if (!this.dirty) return;
    const target = gl.getRenderTarget();
    const override = scene.overrideMaterial;
    const clear = gl.getClearColor(new Color());
    const alpha = gl.getClearAlpha();
    try {
      scene.overrideMaterial = this.depth;
      gl.setRenderTarget(this.target);
      gl.setClearColor(0xffffff, 1);
      gl.clear();
      gl.render(scene, this.camera);
      this.passes++;
      this.dirty = false;
    } finally {
      scene.overrideMaterial = override;
      gl.setRenderTarget(target);
      gl.setClearColor(clear, alpha);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.depth.dispose();
  }
}
