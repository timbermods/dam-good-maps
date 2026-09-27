import {
  Color, DepthTexture, DoubleSide, Matrix4, MeshDepthMaterial, NearestFilter,
  OrthographicCamera, UnsignedIntType, Vector3, WebGLRenderTarget,
  type Mesh, type Scene, type ShaderMaterial, type WebGLRenderer,
} from 'three';
import { MapRenderer } from '../../src/render3d/renderer';
import { SUN, waterMaterial, type SceneUniforms } from '../../src/render3d/materials';
import { highWater } from './water';

// Investigation-only bridge. Integration should make these explicit extension points.
interface Internals {
  gl: WebGLRenderer; scene: Scene; sky: Mesh; water: Map<string, Mesh>;
  uniforms: SceneUniforms; terrainMat: ShaderMaterial; objectMat: ShaderMaterial; waterMat: ShaderMaterial;
}
export const bridge = (renderer: MapRenderer) => renderer as unknown as Internals;

const shadowGLSL = /* glsl */ `
uniform sampler2D mlDepth;
uniform mat4 mlMatrix;
uniform float mlTexel;
uniform float mlEnabled;
float sunLit(vec2 g, float z) {
  if (mlEnabled < 0.5) return bakedSunLit(g, z);
  // World position and real normals retain cave/overhang occlusion and object silhouettes.
  vec3 n = normalize(vNormal);
  vec4 p = mlMatrix * vec4(vWorld + n * 0.045, 1.0);
  vec3 q = p.xyz / p.w * 0.5 + 0.5;
  if (any(lessThan(q, vec3(0.0))) || any(greaterThan(q, vec3(1.0)))) return 1.0;
  // Receiver-plane correction prevents striped self-shadowing on sloping light-space
  // surfaces without a large constant bias that would detach tree/ruin shadows.
  vec3 dx = dFdx(q), dy = dFdy(q);
  float determinant = dx.x * dy.y - dx.y * dy.x;
  vec2 gradient = abs(determinant) > 1e-10 ?
    vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant : vec2(0.0);
  gradient = clamp(gradient, vec2(-2.0), vec2(2.0));
  float bias = 0.00006 + dot(abs(gradient), vec2(mlTexel)) * 0.7;
  float light = 0.0;
  // Fixed 5x5 PCF: stable soft edge, no temporal noise or history buffer.
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 offset = vec2(float(x), float(y)) * mlTexel * 0.8;
    float d = texture2D(mlDepth, q.xy + offset).r;
    light += step(q.z + dot(gradient, offset) - bias, d);
  }
  return light / 25.0;
}
`;

export class Effects {
  private b: Internals;
  private depth = new MeshDepthMaterial({ side: DoubleSide });
  private target: WebGLRenderTarget;
  private camera = new OrthographicCamera();
  private matrix = new Matrix4();
  private standard: ShaderMaterial;
  private high: ShaderMaterial;
  private originalShaders = new Map<ShaderMaterial, string>();
  private sun: Color;
  private sky: Color;
  shadows = false;
  water = false;
  passes = 0;
  private center = new Vector3();
  constructor(private renderer: MapRenderer) {
    this.b = bridge(renderer);
    this.standard = this.b.waterMat;
    // waterMaterial shares its uniforms object; detach before adding local ones.
    this.standard.uniforms = { ...this.standard.uniforms };
    this.high = highWater(waterMaterial(this.b.uniforms, false));
    this.high.uniforms = { ...this.high.uniforms };
    this.target = new WebGLRenderTarget(2048, 2048, { minFilter: NearestFilter, magFilter: NearestFilter });
    this.target.depthTexture = new DepthTexture(2048, 2048, UnsignedIntType);
    this.sun = this.b.uniforms.sunColor.value.clone();
    this.sky = this.b.uniforms.skyColor.value.clone();
    for (const material of [this.b.terrainMat, this.b.objectMat, this.standard, this.high]) {
      this.originalShaders.set(material, material.fragmentShader);
      material.uniforms = { ...material.uniforms,
        mlDepth: { value: this.target.depthTexture }, mlMatrix: { value: this.matrix },
        mlTexel: { value: 1 / 2048 }, mlEnabled: { value: 0 },
      };
      const source = material.fragmentShader.replace('float sunLit(vec2 g, float z)', 'float bakedSunLit(vec2 g, float z)');
      const anchor = '  /** Sky light and sun light';
      if (!source.includes(anchor) || source === material.fragmentShader) throw new Error('Shadow shader bridge needs updating');
      material.fragmentShader = source.replace(anchor, shadowGLSL + anchor);
      material.needsUpdate = true;
    }
    const render = this.b.gl.render.bind(this.b.gl);
    this.b.gl.render = (scene, camera) => {
      if (scene === this.b.scene && this.shadows) {
        const oldTarget = this.b.gl.getRenderTarget();
        const override = this.b.scene.overrideMaterial;
        const hidden = [this.b.sky, ...this.b.water.values()];
        const visible = hidden.map(m => m.visible);
        const clear = this.b.gl.getClearColor(new Color());
        const alpha = this.b.gl.getClearAlpha();
        try {
          hidden.forEach(m => { m.visible = false; });
          this.b.scene.overrideMaterial = this.depth;
          this.b.gl.setRenderTarget(this.target);
          this.b.gl.setClearColor(0xffffff, 1);
          render(scene, this.camera);
          this.passes++;
        } finally {
          this.b.scene.overrideMaterial = override;
          hidden.forEach((m, i) => { m.visible = visible[i]; });
          this.b.gl.setRenderTarget(oldTarget);
          this.b.gl.setClearColor(clear, alpha);
        }
      }
      render(scene, camera);
    };
  }
  fit(W: number, H: number) {
    const span = Math.max(W, H);
    const extent = span * 0.76 + 24;
    Object.assign(this.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 700 });
    this.center.set(W / 2, 8, -H / 2);
    this.sunAngle(0);
    this.apply();
  }
  sunAngle(degrees: number) {
    const dir = SUN.clone().applyAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180);
    this.b.uniforms.sunDir.value.copy(this.shadows ? dir : SUN);
    this.camera.position.copy(this.center).addScaledVector(dir, 330);
    this.camera.lookAt(this.center);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.renderer.requestRender();
  }
  apply() {
    this.b.waterMat = this.water ? this.high : this.standard;
    for (const mesh of this.b.water.values()) mesh.material = this.b.waterMat;
    for (const material of this.originalShaders.keys()) material.uniforms.mlEnabled.value = this.shadows ? 1 : 0;
    // Lighting only. Do not alter the terrain's textures, finish/grade or contact shading.
    this.b.uniforms.sunColor.value.copy(this.sun).multiply(this.shadows ? new Color(1.12, 1.06, 0.97) : new Color(1, 1, 1));
    this.b.uniforms.skyColor.value.copy(this.sky).multiplyScalar(this.shadows ? 0.83 : 1);
    if (!this.shadows) this.b.uniforms.sunDir.value.copy(SUN);
    this.renderer.requestRender();
  }
  dispose() { this.standard.dispose(); this.high.dispose(); this.target.dispose(); this.depth.dispose(); }
}
