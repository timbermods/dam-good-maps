import { BufferAttribute, BufferGeometry, DataTexture, FloatType, NearestFilter, Points, RGBAFormat, ShaderMaterial, Vector2, type Scene } from 'three';
import { CurrentPaths, STEPS, DT } from './paths';
/** A few repeated, tapered streaks on separated current lanes. One GPU draw. */
export class FlowFlecks {
  material=new ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,
    uniforms:{paths:{value:null as DataTexture|null},rows:{value:1},time:{value:0},viewport:{value:new Vector2(1,1)},dpr:{value:1}},
    vertexShader:`
      uniform sampler2D paths;uniform float rows,time,dpr;uniform vec2 viewport;
      attribute vec3 track;varying vec2 heading;varying float fade,bad,rush;
      vec4 at(float k){return texture2D(paths,vec2((k+0.5)/256.0,(track.x+0.5)/rows));}
      void main(){
        float age=mod(time+track.z,track.y);float f=age/0.18;float k=floor(f);
        vec4 a=at(k),b=at(min(k+1.0,255.0)),p=mix(a,b,fract(f));
        vec4 clip=projectionMatrix*modelViewMatrix*vec4(p.xyz,1.0);
        vec4 next=projectionMatrix*modelViewMatrix*vec4(b.xyz,1.0),prev=projectionMatrix*modelViewMatrix*vec4(a.xyz,1.0);
        vec2 direction=(next.xy/next.w-prev.xy/prev.w)*viewport;
        heading=length(direction)>0.0001?normalize(direction):vec2(1.0,0.0);
        rush=smoothstep(0.1,3.0,length(b.xz-a.xz)/0.18);
        bad=p.w;fade=smoothstep(0.0,min(0.6,track.y*0.18),age)*smoothstep(0.0,min(0.6,track.y*0.18),track.y-age);
        gl_Position=clip;gl_PointSize=mix(22.0,40.0,rush)*dpr;
      }`,
    fragmentShader:`
      varying vec2 heading;varying float fade,bad,rush;
      void main(){
        vec2 p=gl_PointCoord-0.5;p.y=-p.y;
        vec2 q=vec2(dot(p,heading),dot(p,vec2(-heading.y,heading.x)));
        // Long dim tail, small rounded leading end. No symmetric dot or arrowhead.
        float along=smoothstep(-0.46,0.24,q.x)*(1.0-smoothstep(0.27,0.37,q.x));
        float width=mix(0.025,0.065,smoothstep(-0.43,0.25,q.x));
        float core=exp(-pow(q.y/width,2.0));float halo=exp(-pow(q.y/(width*2.8),2.0));
        float alpha=along*(core*0.90+halo*0.20)*fade*mix(0.65,1.0,rush)*mix(1.0,0.85,bad);
        alpha=min(alpha,0.86);
        if(alpha<0.01)discard;
        gl_FragColor=vec4(mix(vec3(0.54,0.89,0.94),vec3(0.95,0.43,0.15),bad),alpha);
      }`});
  mesh=new Points(new BufferGeometry(),this.material);count=0;buildMs=0;lanes=0;
  constructor(scene:Scene){this.mesh.frustumCulled=false;this.mesh.renderOrder=8;this.mesh.visible=false;scene.add(this.mesh);}
  get enabled(){return this.mesh.visible;}set enabled(v:boolean){this.mesh.visible=v;}
  setPaths(paths:CurrentPaths){
    const start=performance.now(),rgba:number[]=[],tracks:number[]=[],positions:number[]=[];
    paths.lanes.forEach(({points,length},row)=>{
      const life=(points.length-1)*DT;
      for(let k=0;k<STEPS;k++){const p=points[Math.min(k,points.length-1)];rgba.push(p.x,p.h,-p.y,p.bad);}
      // Repeated passengers on the SAME lane; bounded count, widely separated heads.
      const count=Math.min(4,Math.max(1,Math.ceil(length/16)));
      for(let n=0;n<count;n++){
        tracks.push(row,life,life*(n+((row*.61803398875)%1))/count);
        positions.push(points[0].x,points[0].h,-points[0].y);
      }
    });
    this.count=tracks.length/3;this.lanes=paths.lanes.length;
    const texture=new DataTexture(new Float32Array(rgba.length?rgba:new Array(STEPS*4).fill(0)),STEPS,Math.max(1,this.lanes),RGBAFormat,FloatType);
    texture.minFilter=texture.magFilter=NearestFilter;texture.needsUpdate=true;
    this.material.uniforms.paths.value?.dispose();this.material.uniforms.paths.value=texture;this.material.uniforms.rows.value=Math.max(1,this.lanes);
    const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setAttribute('track',new BufferAttribute(new Float32Array(tracks),3));
    this.mesh.geometry.dispose();this.mesh.geometry=geometry;this.buildMs=performance.now()-start;
  }
  tick(time:number,width:number,height:number,dpr:number){this.material.uniforms.time.value=time;this.material.uniforms.viewport.value.set(width,height);this.material.uniforms.dpr.value=dpr;}
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.uniforms.paths.value?.dispose();this.material.dispose();}
}
