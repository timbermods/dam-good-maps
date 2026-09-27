import { HalfFloatType, DepthTexture, UnsignedIntType, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, type WebGLRenderer, type DataTexture } from 'three';
import { MapRenderer } from '../../src/render3d/renderer';
import { bridge } from './base-effects';

/** Legacy materials author display RGB. Decode once, tone map/grade in linear light,
 * then encode once. The product renderer and its output colour space stay untouched.
 * Shoulder derived from three.js r186 NeutralToneMapping (MIT), without its toe
 * or highlight desaturation. This is a bridge, not a physical HDR relighting. */
export class Post {
  tone = true;
  grade = true;
  heat = 0;
  climate: {value:DataTexture|null} = {value:null};
  climateSize = {value:new Vector2(1,1)};
  private gl: WebGLRenderer;
  private target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new Vector2();
  private material = new ShaderMaterial({
    uniforms: { inputImage: { value: this.target.texture }, inputDepth:{value:null}, tone: { value: 1 }, grade: { value: 1 }, heat:{value:0}, heatTime:{value:0}, climate:this.climate, climateSize:this.climateSize, inverseViewProjection:{value:new Matrix4()}, pixelSize:{value:new Vector2(1,1)} },
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: /* glsl */ `
      uniform sampler2D inputImage;
      uniform float tone, grade;
      uniform float heat, heatTime;
      uniform sampler2D inputDepth,climate;
      uniform vec2 climateSize,pixelSize;
      uniform mat4 inverseViewProjection;
      varying vec2 vUv;
      vec3 decode(vec3 c) { return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c)); }
      vec3 encode(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      vec3 sunnyShoulder(vec3 c) {
        // Leave shadows/midtones alone. Compress only the peak, scaling every
        // channel equally: no grey lift, subtractive toe or blend toward white.
        float peak = max(c.r, max(c.g, c.b));
        if (peak <= 0.82) return c;
        float d = 0.18;
        float newPeak = 1.0 - d * d / (peak + d - 0.82);
        return c * (newPeak / peak);
      }
      void main() {
        vec2 uv=vUv;
        if(heat>.001){
          float depth=texture2D(inputDepth,vUv).r;
          vec4 p=inverseViewProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
          vec3 world=p.xyz/p.w;vec2 tile=vec2(world.x,-world.z);
          if(depth<.9998 && all(greaterThanEqual(tile,vec2(0.0))) && all(lessThan(tile,climateSize))){
            vec4 state=texture2D(climate,(floor(tile)+.5)/climateSize);
            if(state.r>.5 && state.b<.5){
              // Less than half a display pixel; no geometry or water-level change.
              uv.x+=sin(vUv.y*631.0+heatTime*1.1)*sin(vUv.x*187.0-heatTime*.73)*pixelSize.x*.45*heat;
            }
          }
        }
        vec3 c = decode(texture2D(inputImage, uv).rgb);
        if (grade > 0.5) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = max(mix(vec3(l), c, 1.06), vec3(0.0));
          c *= mix(vec3(1.008, 1.0, 0.995), vec3(1.030, 1.016, 0.960), smoothstep(0.035, 0.55, l));
          // Restrain chroma without dimming the approved afternoon lighting.
          // Neutral earth needs more restraint than already-colourful foliage.
          float litLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float peak = max(c.r, max(c.g, c.b));
          float chroma = peak - min(c.r, min(c.g, c.b));
          float vividness = chroma / max(peak, 0.0001);
          float warmNeutral = smoothstep(0.0, 0.25, (c.r - c.g) / max(chroma, 0.0001))
                            * (1.0 - smoothstep(0.70, 0.95, vividness));
          float restraint = mix(0.65, 0.98, smoothstep(0.35, 0.75, vividness)) * (1.0 - 0.20 * warmNeutral);
          c = mix(vec3(litLuma), c, restraint);
          // Move only bright yellow-greens a little toward green. The R/G
          // exchange preserves linear luminance; sky, earth and shade stay warm.
          float yellowGreen = smoothstep(-0.12, 0.10, (c.g - c.r) / max(chroma, 0.0001))
                            * smoothstep(0.25, 0.70, (c.r - c.b) / max(chroma, 0.0001));
          float shift = 0.06 * chroma * yellowGreen * smoothstep(0.14, 0.40, litLuma);
          c += vec3(-shift, shift * (0.2126 / 0.7152), 0.0);
        }
        // Grade before the bounded shoulder, so warm highlights cannot clip after it.
        if (tone > 0.5) c = sunnyShoulder(c * 1.22);
        gl_FragColor = vec4(encode(max(c, vec3(0.0))), 1.0);
      }
    `,
  });
  private quad = new Mesh(new PlaneGeometry(2, 2), this.material);
  private original: WebGLRenderer['render'];
  constructor(renderer: MapRenderer) {
    const b = bridge(renderer); this.gl = b.gl;
    this.target.samples = Math.min(4, this.gl.capabilities.maxSamples);
    this.target.depthTexture=new DepthTexture(1,1,UnsignedIntType);
    this.material.uniforms.inputDepth.value=this.target.depthTexture;
    this.scene.add(this.quad);
    const draw = this.gl.render.bind(this.gl); this.original = draw;
    this.gl.render = (scene, camera) => {
      if (scene !== b.scene || (!this.tone && !this.grade && !this.heat)) { draw(scene, camera); return; }
      this.gl.getDrawingBufferSize(this.size);
      if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
      this.material.uniforms.tone.value = +this.tone; this.material.uniforms.grade.value = +this.grade;
      this.material.uniforms.heat.value=this.heat;this.material.uniforms.heatTime.value=b.uniforms.time.value;
      this.material.uniforms.climate=this.climate;this.material.uniforms.climateSize=this.climateSize;
      this.material.uniforms.pixelSize.value.set(1/this.size.x,1/this.size.y);
      this.material.uniforms.inverseViewProjection.value.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).invert();
      const previous = this.gl.getRenderTarget();
      try { this.gl.setRenderTarget(this.target); draw(scene, camera); }
      finally { this.gl.setRenderTarget(previous); }
      draw(this.scene, this.camera);
    };
  }
  dispose() { this.gl.render = this.original; this.target.dispose(); this.material.dispose(); this.quad.geometry.dispose(); }
}
