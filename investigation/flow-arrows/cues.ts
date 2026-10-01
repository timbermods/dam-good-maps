import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, Vector2, type Scene } from 'three';
import { WATER, HIGH_WATER } from '../../src/render3d/waterPalette';
import { CurrentPaths, DT, type Sample } from './paths';
/** Water-coloured ribbons: advected foam, anchored bank wakes and joining seams. */
export class SurfaceCues {
  material=new ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:DoubleSide,forceSinglePass:true,
    uniforms:{time:{value:0},viewport:{value:new Vector2(1,1)},dpr:{value:1},high:{value:1}},
    vertexShader:`
      uniform vec2 viewport;uniform float dpr;
      attribute vec3 direction;attribute vec4 detail;attribute vec4 energy;
      varying vec4 d,e;
      void main(){
        vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        vec4 across=projectionMatrix*modelViewMatrix*vec4(position+direction*energy.w,1.0);
        vec2 offset=(across.xy/across.w-clip.xy/clip.w)*viewport*0.5;
        float pixels=clamp(length(offset),0.72*dpr,1.8*dpr);
        clip.xy+=normalize(offset+vec2(0.00001))*pixels*detail.y*2.0/viewport*clip.w;
        gl_Position=clip;d=detail;e=energy;
      }`,
    fragmentShader:`
      uniform float time,high;varying vec4 d,e;
      void main(){
        float phase=fract((d.x-time)/10.0+e.z);
        float body=smoothstep(0.0,0.20,phase)*(1.0-smoothstep(0.27,0.34,phase));
        float tail=mix(0.25,1.0,smoothstep(0.0,0.23,phase));
        float crossLine=exp(-3.0*pow(d.y/max(tail,0.25),2.0));
        float signal=body;
        if(d.w>0.5){
          crossLine=exp(-3.4*d.y*d.y);
          signal=d.w>1.5?0.36+body*0.38:0.80+0.20*sin(d.x*2.4-time*1.7+e.z*6.28);
        }
        float alpha=crossLine*signal*e.x*e.y;
        if(alpha<0.006)discard;
        vec3 clean=mix(vec3(${WATER.foam.join(",")}),vec3(${HIGH_WATER.foam.join(",")}),high);
        vec3 colour=mix(clean,mix(vec3(${WATER.badFoam.join(",")}),vec3(${HIGH_WATER.badFoam.join(",")}),high),d.z);
        gl_FragColor=vec4(colour,alpha*mix(1.0,0.72,d.z));
      }`});
  mesh=new Mesh(new BufferGeometry(),this.material);stats={lines:0,wakes:0,seams:0,triangles:0};
  constructor(scene:Scene){this.mesh.frustumCulled=false;this.mesh.renderOrder=7;scene.add(this.mesh);}
  setPaths(paths:CurrentPaths){
    const pos:number[]=[],dir:number[]=[],detail:number[]=[],energy:number[]=[];
    const ribbon=(points:Sample[],kind:number,seed:number,strength=1)=>{
      if(points.length<3)return;
      const vertex=(k:number,side:number)=>{
        const p=points[k],a=points[Math.max(0,k-1)],b=points[Math.min(points.length-1,k+1)];
        const dx=b.x-a.x,dy=b.y-a.y,length=Math.max(.0001,Math.hypot(dx,dy));
        const rush=Math.max(0,Math.min(1,(p.speed-.14)/1.9));
        pos.push(p.x,p.h+.014,-p.y);dir.push(-dy/length,0,-dx/length);
        detail.push(k*DT,side,p.bad,kind);
        const end=Math.min(1,k/3,(points.length-1-k)/3);
        energy.push((kind===1?.52:kind===2?.26:.43)*Math.sqrt(rush)*strength,end,seed,.075+Math.min(.12,p.speed*.025));
      };
      for(let k=0;k<points.length-1;k++)for(const [i,side] of [[k,-1],[k,1],[k+1,-1],[k,1],[k+1,1],[k+1,-1]])vertex(i,side);
    };
    paths.lanes.forEach((lane,i)=>ribbon(lane.points,0,(i*.6180339)%1));
    paths.seams.forEach((lane,i)=>ribbon(lane.points,2,(i*.381966)%1));
    let wakes=0;
    for(const p of paths.wakes){
      const dx=p.vx/p.speed,dy=p.vy/p.speed,nx=-dy,ny=dx;let complete=false;
      for(let echo=0;echo<2;echo++)for(const wing of [-1,1]){
        const points:Sample[]=[];
        for(let k=0;k<=16;k++){
          const f=k/16,along=-.65+2.7*f+echo*.8,across=wing*1.55*(1-f)*(1-.58*f);
          const q=paths.sample(p.x+dx*along+nx*across,p.y+dy*along+ny*across);
          if(!q||Math.abs(q.h-p.h)>.4){if(points.length>3)ribbon(points,1,.1+echo*.2,1-echo*.35);points.length=0;continue;}
          points.push(q);
        }
        if(points.length>5){ribbon(points,1,.1+echo*.2,1-echo*.35);complete=true;}
      }
      if(complete)wakes++;
    }
    const geometry=new BufferGeometry();
    for(const [name,values,size] of [['position',pos,3],['direction',dir,3],['detail',detail,4],['energy',energy,4]] as const)
      geometry.setAttribute(name,new BufferAttribute(new Float32Array(values),size));
    this.mesh.geometry.dispose();this.mesh.geometry=geometry;
    this.stats={lines:paths.lanes.length,wakes,seams:paths.seams.length,triangles:pos.length/9};
  }
  tick(time:number,width:number,height:number,dpr:number,high:boolean){
    this.material.uniforms.time.value=time;this.material.uniforms.viewport.value.set(width,height);this.material.uniforms.dpr.value=dpr;this.material.uniforms.high.value=high?1:0;
  }
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();}
}
