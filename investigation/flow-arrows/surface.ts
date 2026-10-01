import { DataTexture, FloatType, LinearFilter, RGBAFormat, ShaderMaterial, Vector2 } from 'three';
import { surfaceWater } from '../../src/render3d/model';
import { settledVelocity, type FlowMap } from './flow';

const declarations = `
uniform sampler2D currentField;
uniform vec2 currentSize;
uniform float currentTime;
vec2 currentAt(vec2 g) { return texture2D(currentField, g / currentSize).rg; }
// Two overlapping phases: a phase resets only while its weight is zero.
float flowBlend(vec2 g) { return abs(fract(currentTime / 6.0) * 2.0 - 1.0) * step(0.015,length(currentAt(g))); }
vec2 flowPoint(vec2 g, float second) {
  vec2 v = currentAt(g);
  float age = fract(currentTime / 6.0 + second * 0.5) * 6.0;
  return g - v * age;
}
`;
function replace(s:string,a:string,b:string) {
  if(!s.includes(a)) throw Error(`Water shader has changed: ${a.slice(0,70)}`);
  return s.replace(a,b);
}
export class SurfaceMotion {
  uniforms={currentField:{value:null as DataTexture|null},currentSize:{value:new Vector2(1,1)},currentTime:{value:0}};
  originals=new Map<ShaderMaterial,string>();
  active=true;
  setMap(m:FlowMap) {
    const v=settledVelocity(m.W,m.H,m.flow),sw=surfaceWater(m.W,m.H,m.water),pixels=new Float32Array(m.W*m.H*4);
    for(let i=0;i<m.W*m.H;i++) { pixels[i*4]=v?.[i*2]??0;pixels[i*4+1]=v?.[i*2+1]??0;pixels[i*4+2]=sw.surface[i];pixels[i*4+3]=sw.depth[i]; }
    const texture=new DataTexture(pixels,m.W,m.H,RGBAFormat,FloatType);
    texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;
    this.uniforms.currentField.value?.dispose();this.uniforms.currentField.value=texture;this.uniforms.currentSize.value.set(m.W,m.H);
  }
  attach(material:ShaderMaterial) {
    if(this.originals.has(material)) return;
    this.originals.set(material,material.fragmentShader);Object.assign(material.uniforms,this.uniforms);
    this.apply(material);
  }
  enable(enabled:boolean) {this.active=enabled;for(const m of this.originals.keys())this.apply(m);}
  private apply(material:ShaderMaterial) {
    let s=this.originals.get(material)!;
    if(!this.active){material.fragmentShader=s;material.needsUpdate=true;return;}
    s=declarations+s;
    // Standard's existing top-surface formulas, evaluated at two advected positions.
    // Banks, depth, contamination, lighting, transparency, overlays and side faces stay fixed.
    const start=s.indexOf('        if (n.y > 0.5) {');
    const end=s.indexOf('        } else {',start);
    if(start<0||end<0)throw Error('Standard surface hook missing');
    const original=s.slice(start+'        if (n.y > 0.5) {'.length,end);
    const fields=['foam','glints','pale','bubbles','crest','trough'];
    const sums=fields.map(f=>`float sum_${f}=0.0;`).join('\n');
    const resets=fields.map(f=>`${f}=0.0;`).join('\n');
    const add=fields.map(f=>`sum_${f}+=${f}*weight;`).join('\n');
    const finish=fields.map(f=>`${f}=sum_${f};`).join('\n');
    s=s.slice(0,start)+`if(n.y>0.5) {
      vec2 fixedG=g;float baseAlpha=alpha;float sumAlpha=0.0;vec3 sumN=vec3(0.0);${sums}
      for(int phaseIndex=0;phaseIndex<2;phaseIndex++) {
        float weight=phaseIndex==0?1.0-flowBlend(fixedG):flowBlend(fixedG);
        vec2 g=flowPoint(fixedG,float(phaseIndex)); float t=0.0;
        alpha=baseAlpha;${resets}
        ${original}
        sumAlpha+=alpha*weight;sumN+=N*weight;${add}
      }
      alpha=sumAlpha;N=normalize(sumN);${finish}
`+s.slice(end);
    if(s.includes('vec4 measuredSurfaceWater(')) {
      s=replace(s,'vec2 drift = velocity * 0.65 + vec2(0.018, -0.012) * (1.0 - speed);','vec2 drift = currentAt(g);');
      s=replace(s,'float phase = fract(t / 12.0), second = fract(t / 12.0 + 0.5);','float phase = fract(currentTime / 6.0), second = fract(currentTime / 6.0 + 0.5);');
      s=replace(s,'float blend = abs(phase * 2.0 - 1.0);','float blend = flowBlend(g);');
      s=replace(s,'vec2 p = g - drift * (phase * 12.0), p2 = g - drift * (second * 12.0) + vec2(19.13, 7.71);','vec2 p = g - drift * (phase * 6.0), p2 = g - drift * (second * 6.0);');
      // Keep the style field: changing it would change the soul proposal's texture mix.
      s=s.replaceAll('microFlecks(p, t,','microFlecks(p, 0.0,').replaceAll('microFlecks(p2, t,','microFlecks(p2, 0.0,');
      s=replace(s,'hlRippleNormal(g, time)','normalize(mix(hlRippleNormal(flowPoint(g, 0.0), 0.0), hlRippleNormal(flowPoint(g, 1.0), 0.0), flowBlend(g)))');
      s=replace(s,'float bt = t * mix(1.0, 0.55, contamination);','float bt = 0.0;');
      s=replace(s,'vnoise(g * 5.0 + vec2(bt * 0.05, -bt * 0.08))','mix(vnoise(p*5.0),vnoise(p2*5.0),blend)');
      s=replace(s,'vnoise(g * 1.3 - vec2(0.0, bt * 0.04))','mix(vnoise(p*1.3),vnoise(p2*1.3),blend)');
      s=replace(s,'vnoise(g * 4.0 + vec2(hlT * 0.1, -hlT * 0.2))','mix(vnoise(flowPoint(g,0.0)*4.0),vnoise(flowPoint(g,1.0)*4.0),flowBlend(g))');
      s=replace(s,'vnoise(g * 6.0 + vec2(hlT * 0.7, -hlT * 1.4))','mix(vnoise(flowPoint(g,0.0)*6.0),vnoise(flowPoint(g,1.0)*6.0),flowBlend(g))');
      s=replace(s,'detailNoise(g * 1.71 - vel * hlT * 0.23)','mix(detailNoise(flowPoint(g,0.0)*1.71),detailNoise(flowPoint(g,1.0)*1.71),flowBlend(g))');
    }
    material.fragmentShader=s;material.needsUpdate=true;
  }
  dispose(){this.uniforms.currentField.value?.dispose();}
}
