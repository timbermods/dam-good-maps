import * as THREE from 'three';
import type { Station,Point } from './model';
/** A connected ice ribbon, entirely an effect overlay. Terrain remains integer chunk meshes. */
export class Ice {
 readonly group=new THREE.Group();readonly ghost=new THREE.Group();private mesh:THREE.Mesh|null=null;
 private material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{front:{value:0},back:{value:1},clock:{value:0}},
  vertexShader:'attribute float station; varying float s; varying vec3 pos; varying vec3 norm; void main(){s=station;pos=position;norm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float front;uniform float back;uniform float clock;varying float s;varying vec3 pos;varying vec3 norm;void main(){if(s>front||s>back)discard;float ripple=sin(pos.x*.7+pos.z*.31-clock*.65)*.018;float vein=pow(abs(sin(pos.x*.29+pos.z*.17+sin(s*45.)*.5)),32.);vec3 c=mix(vec3(.36,.68,.78),vec3(.88,.97,1.),.35+.5*max(0.,norm.y)+ripple);c+=vein*.065;gl_FragColor=vec4(c,.76);}' });
 clear(){if(this.mesh){this.group.remove(this.mesh);this.mesh.geometry.dispose();this.mesh=null;}this.preview([]);}
 set(path:Station[],base:Uint8Array,W:number,lobe=false){
  this.clear();const vertices:number[]=[],st:number[]=[],indices:number[]=[];
  const surface=(x:number,y:number)=>base[Math.max(0,Math.min(base.length-1,Math.floor(y)*W+Math.floor(x)))];
  if(lobe){const a=path[0],r=a.r*1.35,segments=64;
   vertices.push(a.x,surface(a.x,a.y)+2,-a.y);st.push(0);
   for(let k=0;k<=segments;k++){const t=k/segments*Math.PI*2,rr=r*(1+.05*Math.sin(t*5));const x=a.x+Math.cos(t)*rr,y=a.y+Math.sin(t)*rr;vertices.push(x,surface(x,y)+.1,-y);st.push(1);if(k)indices.push(0,k,k+1);}
  }else{
   for(let k=0;k<path.length;k++){const p=path[k],a=path[Math.max(0,k-2)],b=path[Math.min(path.length-1,k+2)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
    const end=Math.min(1,Math.sqrt(Math.max(.025,Math.min(p.s,1-p.s))*20));
    for(const cross of [-1,-.7,0,.7,1]){const x=p.x+nx*p.r*cross*end,y=p.y+ny*p.r*cross*end;
     const center=surface(p.x,p.y),side=surface(x,y),z=Math.max(center,side*.5+center*.5)+.2+(1-cross*cross)*2.4;
     vertices.push(x,z,-y);st.push(p.s);}
    if(k)for(let j=0;j<4;j++){const i=k*5+j;indices.push(i-5,i,i+1,i-5,i+1,i-4);}
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('station',new THREE.Float32BufferAttribute(st,1));g.setIndex(indices);g.computeVertexNormals();
  this.mesh=new THREE.Mesh(g,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.group.add(this.mesh);this.update(0);
 }
 update(t:number){this.material.uniforms.front.value=Math.min(1,t/3);this.material.uniforms.back.value=t<=3?1:Math.max(-.01,1-(t-3)/2);this.material.uniforms.clock.value=t;}
 preview(points:Point[],heights?:Uint8Array,W=1){for(const a of [...this.ghost.children]){this.ghost.remove(a);(a as THREE.Line).geometry.dispose();((a as THREE.Line).material as THREE.Material).dispose();}
  if(points.length<2)return;const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,(heights?.[Math.floor(p.y)*W+Math.floor(p.x)]??0)+.2,-p.y)));
  this.ghost.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xeafcff,transparent:true,opacity:.45,depthTest:false})));}
}
