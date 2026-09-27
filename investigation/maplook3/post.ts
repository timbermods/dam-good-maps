import { HalfFloatType, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { MapRenderer } from '../../src/render3d/renderer';
import { bridge } from './base-effects';

/** Legacy materials author display RGB. Decode once, tone map/grade in linear light,
 * then encode once. The product renderer and its output colour space stay untouched.
 * Neutral shoulder derived from three.js r186 PBRNeutralToneMapping (MIT), itself
 * the Khronos PBR Neutral curve. This is a bridge, not a physical HDR relighting. */
export class Post {
  tone = true;
  grade = true;
  private gl: WebGLRenderer;
  private target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new Vector2();
  private material = new ShaderMaterial({
    uniforms: { inputImage: { value: this.target.texture }, tone: { value: 1 }, grade: { value: 1 } },
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: /* glsl */ `
      uniform sampler2D inputImage;
      uniform float tone, grade;
      varying vec2 vUv;
      vec3 decode(vec3 c) { return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c)); }
      vec3 encode(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      vec3 neutral(vec3 c) {
        float x = min(c.r, min(c.g, c.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        c -= offset;
        float peak = max(c.r, max(c.g, c.b));
        if (peak < 0.76) return c;
        float d = 0.24;
        float newPeak = 1.0 - d * d / (peak + d - 0.76);
        c *= newPeak / peak;
        float g = 1.0 - 1.0 / (0.15 * (peak - newPeak) + 1.0);
        return mix(c, vec3(newPeak), g);
      }
      void main() {
        vec3 c = decode(texture2D(inputImage, vUv).rgb);
        // Compensate Neutral's toe gently; keep the measured water body near its anchor.
        if (tone > 0.5) c = mix(c, neutral(c * 1.10), 0.32);
        if (grade > 0.5) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.025);
          c *= mix(vec3(0.992, 1.0, 1.010), vec3(1.025, 1.008, 0.980), smoothstep(0.035, 0.55, l));
        }
        gl_FragColor = vec4(encode(max(c, vec3(0.0))), 1.0);
      }
    `,
  });
  private quad = new Mesh(new PlaneGeometry(2, 2), this.material);
  private original: WebGLRenderer['render'];
  constructor(renderer: MapRenderer) {
    const b = bridge(renderer); this.gl = b.gl;
    this.target.samples = Math.min(4, this.gl.capabilities.maxSamples);
    this.scene.add(this.quad);
    const draw = this.gl.render.bind(this.gl); this.original = draw;
    this.gl.render = (scene, camera) => {
      if (scene !== b.scene || (!this.tone && !this.grade)) { draw(scene, camera); return; }
      this.gl.getDrawingBufferSize(this.size);
      if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
      this.material.uniforms.tone.value = +this.tone; this.material.uniforms.grade.value = +this.grade;
      const previous = this.gl.getRenderTarget();
      try { this.gl.setRenderTarget(this.target); draw(scene, camera); }
      finally { this.gl.setRenderTarget(previous); }
      draw(this.scene, this.camera);
    };
  }
  dispose() { this.gl.render = this.original; this.target.dispose(); this.material.dispose(); this.quad.geometry.dispose(); }
}
