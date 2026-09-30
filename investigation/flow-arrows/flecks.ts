import { BufferAttribute, BufferGeometry, DataTexture, FloatType, NearestFilter, Points, RGBAFormat, ShaderMaterial, Vector2, type Scene } from 'three';
import { surfaceWater } from '../../src/render3d/model';
import { settledVelocity, type FlowMap } from './flow';

const STEPS=96, DT=.12;
/** Streamlines prepared only when the matching water snapshot changes. One GPU draw. */
export class FlowFlecks {
  material=new ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,
    uniforms:{paths:{value:null as DataTexture|null},rows:{value:1},time:{value:0},viewport:{value:new Vector2(1,1)},dpr:{value:1}},
    vertexShader:`
      uniform sampler2D paths;uniform float rows,time,dpr;uniform vec2 viewport;
      attribute vec3 track; varying vec2 heading;varying float fade,bad;
      vec4 at(float k){return texture2D(paths,vec2((k+0.5)/96.0,(track.x+0.5)/rows));}
      void main(){
        float age=mod(time+track.z,track.y);float f=age/0.12;float k=floor(f);
        vec4 a=at(k),b=at(min(k+1.0,95.0));vec4 p=mix(a,b,fract(f));
        vec4 clip=projectionMatrix*modelViewMatrix*vec4(p.xyz,1.0);
        vec4 next=projectionMatrix*modelViewMatrix*vec4(b.xyz,1.0);
        vec4 prev=projectionMatrix*modelViewMatrix*vec4(a.xyz,1.0);
        vec2 direction=(next.xy/next.w-prev.xy/prev.w)*viewport;
        heading=length(direction)>0.0001?normalize(direction):vec2(1.0,0.0);
        bad=p.w;fade=smoothstep(0.0,0.6,age)*smoothstep(0.0,0.6,track.y-age);
        gl_Position=clip;gl_PointSize=9.0*dpr;
      }`,
    fragmentShader:`
      varying vec2 heading;varying float fade,bad;
      void main(){vec2 p=gl_PointCoord-0.5;p.y=-p.y;
        vec2 q=vec2(dot(p,heading),dot(p,vec2(-heading.y,heading.x)));
        float core=exp(-dot(q*vec2(4.5,12.0),q*vec2(4.5,12.0)));
        float halo=exp(-dot(q*vec2(3.7,6.0),q*vec2(3.7,6.0)));
        float alpha=(core*0.68+halo*0.16)*fade;
        if(alpha<0.015)discard;
        gl_FragColor=vec4(mix(vec3(0.72,0.92,0.94),vec3(1.0,0.68,0.53),bad),alpha);
      }`});
  mesh=new Points(new BufferGeometry(),this.material);
  count=0;
  constructor(scene:Scene){this.mesh.frustumCulled=false;this.mesh.renderOrder=8;this.mesh.visible=false;scene.add(this.mesh);}
  get enabled(){return this.mesh.visible;}set enabled(v:boolean){this.mesh.visible=v;}
  setMap(m:FlowMap) {
    const start=performance.now(),v=settledVelocity(m.W,m.H,m.flow),s=surfaceWater(m.W,m.H,m.water);
    const rgba:number[]=[],tracks:number[]=[],positions:number[]=[];
    let seed=417;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const sample=(x:number,y:number):[number,number,number,number]|null=>{
      const xx=Math.floor(x),yy=Math.floor(y),i=yy*m.W+xx;
      if(xx<0||yy<0||xx>=m.W||yy>=m.H||s.depth[i]<.05||!v)return null;
      // Wet-only bilinear interpolation avoids a dry bank pulling a path onto land.
      let vx=0,vy=0,w=0;const bx=Math.floor(x-.5),by=Math.floor(y-.5),fx=x-.5-bx,fy=y-.5-by;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
        const ax=bx+dx,ay=by+dy,j=ay*m.W+ax;
        if(ax<0||ay<0||ax>=m.W||ay>=m.H||s.depth[j]<.05||Math.abs(s.surface[j]-s.surface[i])>.8)continue;
        const weight=(dx?fx:1-fx)*(dy?fy:1-fy);vx+=v[j*2]*weight;vy+=v[j*2+1]*weight;w+=weight;
      }
      return [vx/Math.max(w,.0001),vy/Math.max(w,.0001),s.surface[i]+.035,s.contamination[i]];
    };
    if(v)for(let i=0;i<m.W*m.H;i++) {
      const speed=Math.hypot(v[i*2],v[i*2+1]);
      if(s.depth[i]<.05||speed<.025)continue;
      // One candidate per wet tile, fewer on slow reaches. Cap density by map scale.
      const density=Math.min(.38,.045+speed*.10)*Math.min(1,16384/(m.W*m.H));
      if(random()>density)continue;
      let x=i%m.W+.2+random()*.6,y=Math.floor(i/m.W)+.2+random()*.6;
      const path:number[]=[];let valid=0;
      for(let k=0;k<STEPS;k++) {
        const a=sample(x,y);if(!a)break;
        path.push(x,a[2],-y,a[3]);valid++;
        // Midpoint integration; substeps stop before crossing a dry tile.
        const substeps=Math.max(1,Math.ceil(Math.hypot(a[0],a[1])*DT/.25));
        let stopped=false;
        for(let j=0;j<substeps;j++) {
          const b=sample(x,y)!;const h=DT/substeps;
          const mid=sample(x+b[0]*h/2,y+b[1]*h/2);if(!mid){stopped=true;break;}
          const nx=x+mid[0]*h,ny=y+mid[1]*h;
          if(!sample(nx,ny)){stopped=true;break;}x=nx;y=ny;
        }
        if(stopped)break;
      }
      if(valid<14)continue;
      const life=(valid-1)*DT;
      tracks.push(tracks.length/3,life,random()*life);positions.push(path[0],path[1],path[2]);
      while(path.length<STEPS*4)path.push(...path.slice(-4));rgba.push(...path);
    }
    this.count=tracks.length/3;
    const texture=new DataTexture(new Float32Array(rgba.length?rgba: new Array(STEPS*4).fill(0)),STEPS,Math.max(1,this.count),RGBAFormat,FloatType);
    texture.minFilter=texture.magFilter=NearestFilter;texture.needsUpdate=true;
    this.material.uniforms.paths.value?.dispose();this.material.uniforms.paths.value=texture;this.material.uniforms.rows.value=Math.max(1,this.count);
    const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setAttribute('track',new BufferAttribute(new Float32Array(tracks),3));
    this.mesh.geometry.dispose();this.mesh.geometry=geometry;
    this.buildMs=performance.now()-start;
  }
  buildMs=0;
  tick(time:number,width:number,height:number,dpr:number){this.material.uniforms.time.value=time;this.material.uniforms.viewport.value.set(width,height);this.material.uniforms.dpr.value=dpr;}
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.uniforms.paths.value?.dispose();this.material.dispose();}
}
