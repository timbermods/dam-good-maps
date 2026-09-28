import { DataTexture, LinearFilter, NearestFilter, RGBAFormat, FloatType, UnsignedByteType, Vector2, Group, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, type Mesh, type InstancedInterleavedBuffer } from 'three';
import { surfaceWater, type MapView } from '../../src/render3d/model';
import { replace } from './lighting';
import { bridge } from './base-effects';
import type { MapRenderer } from '../../src/render3d/renderer';

const bubblesGLSL=/* glsl */ `
float ffHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ffBubbles(vec2 p,float t){
  // Independently jittered circular bubbles, never cell borders. Two sizes, no
  // relationship to the one-tile mesh; subpixel bubbles fade to their coverage.
  vec2 q=mat2(.83,.56,-.56,.83)*p*8.73;
  vec2 cell=floor(q);vec2 f=fract(q);float bubbles=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y)),id=cell+o;
    vec2 center=o+vec2(ffHash(id+13.7),ffHash(id-48.2))*.82+.09;
    float radius=.08+.19*ffHash(id+71.4);
    float d=length(f-center);
    float aa=max(fwidth(d),.025);
    float ring=(1.0-smoothstep(radius-aa,radius+aa,d))*smoothstep(radius*.33-aa,radius*.75+aa,d);
    bubbles=max(bubbles,ring*(.55+.45*sin(t*1.8+ffHash(id)*19.0)*sin(t*1.8+ffHash(id)*19.0)));
  }
  return mix(bubbles,.30,smoothstep(.35,.95,max(fwidth(q.x),fwidth(q.y))));
}
`;

export {riverField} from './river';
import {riverAnalysis} from './river';
export class WaterFinish {
 crown={value:1};landing={value:1};bubbles={value:1};river={value:1};
 mist=true;rings=true;low=false;group=new Group();
 private flowTex?:DataTexture;private wetTex?:DataTexture;
 private size={value:new Vector2(1,1)};private foam={value:null as DataTexture|null};private wet={value:null as DataTexture|null};
 private mistMat:ShaderMaterial;private ringMat:ShaderMaterial;
 stats={buildMs:0,particles:0,rings:0,bytes:0,rough:{falls:0,rapids:0,obstacles:0,wet:0}};
 constructor(private renderer:MapRenderer,private water:ShaderMaterial){
  const b=bridge(renderer),fall=b.fallMat;
  Object.assign(fall.uniforms,{ffCrown:this.crown,ffLanding:this.landing,ffBubbles:this.bubbles});
  fall.vertexShader='uniform float ffCrown; uniform float time;\n'+fall.vertexShader;
  fall.vertexShader=replace(fall.vertexShader,'        vNormal = n;', /* glsl */ `
        if(kind>4.5 && ffCrown>0.5){
          // Shared world field at both sides of every joined edge.
          float billow=.84+.10*sin(p.x*2.17+p.z*1.31+time*.9)+.06*sin(p.z*4.37-p.x*1.73-time*1.1);
          p.y=land+.012+(p.y-land-.012)*billow;
        }
        vNormal = n;`);
  fall.fragmentShader='uniform float ffCrown,ffLanding,ffBubbles;\n'+fall.fragmentShader;
  fall.fragmentShader=replace(fall.fragmentShader,'      void main() {',bubblesGLSL+'\n      void main() {');
  fall.fragmentShader=replace(fall.fragmentShader,'        vec3 N = normalize(vNormal);','        vec3 N = kind > 4.5 && ffCrown > 0.5 ? vec3(0.0,1.0,0.0) : normalize(vNormal);');
  fall.fragmentShader=replace(fall.fragmentShader,'          float swirl = vRib.y;', '          float swirl = vRib.y;');
  fall.fragmentShader=replace(fall.fragmentShader,'            float bil = mix(0.6, 0.6 * b1 + 0.4 * b2, fine);', /* glsl */ `
            if(ffCrown>0.5){
              b1=vnoise(g*4.17+vec2(t*.4,-t*.71)+vWorld.y*.37);
              b2=vnoise(g*9.31+vec2(-t*.8,t*.93)+vWorld.y*.81);
            }
            float bil = mix(0.6, 0.6 * b1 + 0.4 * b2, fine);`);
  fall.fragmentShader=replace(fall.fragmentShader,'          c = foamColour;\n          alpha = foam * FALL_FOAM;\n        } else if (kind > 3.5)', /* glsl */ `
          if(ffCrown>0.5){
            // The front of a billow dissolves into the splash instead of ending
            // as a bright ruler at the base of each cylindrical crown.
            float front=smoothstep(.55,.93,swirl);
            foam*=mix(1.0,smoothstep(.02,.28+bil*.24,up),front);
          }
          c = foamColour;
          alpha = foam * FALL_FOAM;
        } else if (kind > 3.5)`);
  // Replace only the landing branch; retain the accepted ribbon, connected corners,
  // concentration palette and free-end attenuation.
  fall.fragmentShader=replace(fall.fragmentShader,'          float broken = pow(tail, 0.7) * mix(0.6, 1.0, froth);', /* glsl */ `
          float broken = pow(tail, 0.7) * mix(0.6, 1.0, froth);
          if(ffBubbles>0.5) {
            float bubble=ffBubbles(g-vec2(.037,-.083)*t,t);
            broken=pow(tail,1.1)*(.10+.78*bubble+.12*froth);
          }`.replaceAll('ffBubbles(g','ffBubblePattern(g'));
  // Uniform and function must have distinct names.
  fall.fragmentShader=fall.fragmentShader.replaceAll('float ffBubbles(vec2','float ffBubblePattern(vec2');
  fall.fragmentShader=replace(fall.fragmentShader,'          c = foamColour;\n          alpha = foam * FALL_FOAM;\n        } else {', /* glsl */ `
          if(ffLanding>0.5){
            // Continuous world-space taper eats into the envelope before its
            // geometric edge. No straight transparent-to-milky pool seam.
            float irregular=.12+.22*vnoise(g*2.73+vec2(t*.11,17.7));
            foam*=smoothstep(irregular,irregular+.30,vEdge.x);
          }
          c = foamColour;
          alpha = foam * FALL_FOAM;
        } else {`);
  fall.fragmentShader=replace(fall.fragmentShader,'        // clear water (D196, D212;', /* glsl */ `
        if(ffLanding>0.5 && kind<3.5){
          float dissolve=.06+.22*vnoise(g*3.17+vec2(t*.09,11.7));
          alpha*=smoothstep(-.02,dissolve,vRib.z);
        }
        // clear water (D196, D212;`);
  fall.needsUpdate=true;
  Object.assign(water.uniforms,{ffRiver:this.river,ffField:this.foam,ffSize:this.size});
  water.fragmentShader='uniform float ffRiver;uniform sampler2D ffField;uniform vec2 ffSize;\n'+water.fragmentShader;
  water.fragmentShader=replace(water.fragmentShader,'  foam *= 1.0 - bad * 0.55;', /* glsl */ `
  if(ffRiver>0.5 && n.y>0.5){
    // Keep #38's shore and landing foam. Additional froth marks only localized
    // rough water; ordinary current uses the approved surface without mottling.
    float strength=texture2D(ffField,g/ffSize).r;
    vec2 vel=(texture2D(mlFlow,g/mlFlowSize).rg*255.0-128.0)/63.5;
    if(strength>.005){
      float frothPatch=smoothstep(.40,.78,detailNoise(g*1.71-vel*t*.23));
      foam=max(foam,strength*.68*frothPatch);
    }
  }
  if(ffRiver>0.5 && n.y<0.5 && vFlags<9.0){
    // Tiny hydraulic steps use the same body colour as their neighbouring
    // surfaces, eliminating bright dotted seams along the simulation tiles.
    vec4 joined=measuredSurfaceWater(g,d,1.0,cont,vec3(0.0,1.0,0.0),V,lit,time);
    c=joined.rgb;alpha=joined.a;foam=0.0;
  }
  foam *= 1.0 - bad * 0.55;`);
  water.needsUpdate=true;
  const uniforms={time:b.uniforms.time,field:this.wet,size:this.size,cheap:{value:0}};
  this.mistMat=new ShaderMaterial({uniforms,transparent:true,depthWrite:false,vertexShader:`
    attribute float seed;attribute float radius;attribute float bad;uniform float time;uniform float cheap;varying float vFade;varying float vBad;
    void main(){float cycle=fract(time*.24+seed);vec3 p=position; p.x+=sin(seed*83.7+cycle*3.0)*radius*.38;p.z+=cos(seed*37.1+cycle*2.0)*radius*.32;p.y+=cycle*radius*.85;
      vec4 view=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*view;
      gl_PointSize=clamp(radius*(.5+cycle)*340.0/max(1.0,-view.z),2.0,100.0);
      vFade=sin(cycle*3.14159)*.105*(1.0-cheap);vBad=bad;}
  `,fragmentShader:`varying float vFade;varying float vBad;void main(){float d=length(gl_PointCoord-.5)*2.0;float a=exp(-d*d*4.0)*(1.0-smoothstep(.65,1.0,d))*vFade;if(a<.002)discard;gl_FragColor=vec4(mix(vec3(.85,.94,.95),vec3(.67,.54,.36),vBad),a);}`});
  this.ringMat=new ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:2,vertexShader:`
    attribute vec3 center;attribute float seed;attribute float radius;attribute float bad;uniform float time;varying vec2 vUv;varying float vCycle;varying float vBad;varying vec3 vWorld;varying float vRadius;
    void main(){float c=fract(time*.42+seed);vCycle=c;vUv=position.xz;vBad=bad;vRadius=radius;vec3 p=center+vec3(position.x*radius*(.2+.8*c),.02,position.z*radius*(.2+.8*c));vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}
  `,fragmentShader:`
    uniform sampler2D field;uniform vec2 size;varying vec2 vUv;varying float vCycle;varying float vBad;varying vec3 vWorld;varying float vRadius;
    void main(){vec2 uv=vec2(vWorld.x,-vWorld.z)/size;if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard;
      vec4 state=texture2D(field,uv);if(state.g<.001||abs(state.r-vWorld.y)>.22)discard;
      float d=length(vUv),aa=max(fwidth(d),.01);float ring=1.0-smoothstep(.014+aa,.045+aa,abs(d-.78));
      float broken=.70+.30*sin(atan(vUv.y,vUv.x)*5.0+vCycle*2.0);float a=ring*sin(vCycle*3.14159)*(1.0-vCycle)*.22*broken;
      gl_FragColor=vec4(mix(vec3(.80,.94,.93),vec3(.62,.45,.28),vBad),a);}
  `});
  this.group.name='finish-water-particles';this.group.userData.noShadow=true;b.scene.add(this.group);
 }
 setMap(map:MapView,velocity:Float32Array){
  const start=performance.now(),{W,H}=map,sw=surfaceWater(W,H,map.water);
  const analysis=riverAnalysis(map,velocity),field=analysis.field,data=new Uint8Array(W*H*4),wet=new Float32Array(W*H*4);
  for(let i=0;i<W*H;i++){data[i*4]=Math.round(field[i]*255);wet[i*4]=Number.isFinite(sw.surface[i])?sw.surface[i]:-100;wet[i*4+1]=sw.depth[i];}
  this.flowTex?.dispose();this.flowTex=new DataTexture(data,W,H,RGBAFormat,UnsignedByteType);this.flowTex.minFilter=this.flowTex.magFilter=LinearFilter;this.flowTex.needsUpdate=true;this.foam.value=this.flowTex;
  this.wetTex?.dispose();this.wetTex=new DataTexture(wet,W,H,RGBAFormat,FloatType);this.wetTex.minFilter=this.wetTex.magFilter=NearestFilter;this.wetTex.needsUpdate=true;this.wet.value=this.wetTex;this.size.value.set(W,H);
  for(const c of [...this.group.children]){(c as Points).geometry.dispose();c.removeFromParent();}
  const pts:number[]=[],seeds:number[]=[],radii:number[]=[],bad:number[]=[],rp:number[]=[],rc:number[]=[],rs:number[]=[],rr:number[]=[],rb:number[]=[];
  // The renderer's shared, joined fall data gives the actual impact position.
  for(const mesh of bridge(this.renderer).falls.values()){
    const a=mesh.geometry.getAttribute('fA'),top=mesh.geometry.getAttribute('fTop'),shape=mesh.geometry.getAttribute('fShape'),more=mesh.geometry.getAttribute('fMore');
    for(let i=0;i<a.count;i++){
      const side=Math.round(a.getZ(i))%4,ox=[1,-1,0,0][side],oz=[0,0,-1,1][side],tx=oz,tz=-ox;
      const reach=(shape.getX(i)+shape.getY(i))/2,land=(top.getZ(i)+top.getW(i))/2,drop=(top.getX(i)+top.getY(i))/2-land;
      const f=(a.getW(i)+more.getW(i))/2;if(drop<.6||f<.1)continue;
      const x=a.getX(i)+tx*.5+ox*reach,z=a.getY(i)+tz*.5+oz*reach,c=(more.getX(i)+more.getY(i))/2;
      const hash=(Math.sin(x*71.3+z*39.7)*437.1)%1,seed=Math.abs(hash);
      if(pts.length/3<2048){pts.push(x,land+.08,z);seeds.push(seed);radii.push(Math.min(2.2,.3+drop*.09+Math.sqrt(f)*.25));bad.push(c);}
      if(rs.length<768*6&&seed>.25){
        const radius=Math.min(1.7,.45+drop*.06);
        for(const [u,v]of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){rp.push(u,0,v);rc.push(x+ox*.3,land,z+oz*.3);rs.push(seed);rr.push(radius);rb.push(c);}
      }
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pts,3));g.setAttribute('seed',new Float32BufferAttribute(seeds,1));g.setAttribute('radius',new Float32BufferAttribute(radii,1));g.setAttribute('bad',new Float32BufferAttribute(bad,1));
  const mist=new Points(g,this.mistMat);mist.name='mist';mist.renderOrder=5;this.group.add(mist);
  const rg=new BufferGeometry();rg.setAttribute('position',new Float32BufferAttribute(rp,3));rg.setAttribute('center',new Float32BufferAttribute(rc,3));rg.setAttribute('seed',new Float32BufferAttribute(rs,1));rg.setAttribute('radius',new Float32BufferAttribute(rr,1));rg.setAttribute('bad',new Float32BufferAttribute(rb,1));
  // Avoid incorrect bounds computed from the unit quad, rather than its centers.
  const rings=new MeshClass(rg,this.ringMat);rings.name='rings';rings.frustumCulled=false;rings.renderOrder=4;this.group.add(rings);
  this.stats={buildMs:performance.now()-start,particles:seeds.length,rings:rs.length/6,bytes:data.byteLength+wet.byteLength,rough:analysis.counts};
  this.apply();
 }
 apply(){for(const c of this.group.children)c.visible=c.name==='mist'?this.mist&&!this.low:this.rings&&!this.low;}
 dispose(){this.flowTex?.dispose();this.wetTex?.dispose();for(const c of this.group.children)(c as Points).geometry.dispose();this.mistMat.dispose();this.ringMat.dispose();this.group.removeFromParent();}
}
import { Mesh as MeshClass } from 'three';
