import * as THREE from 'three';
import type { Station,Point } from './model';
/** Fixed tongue geometry, with a travelling curved nose and advected surface bands.
 * Neither the cross section nor the lobe inflates in place. */
export class Ice {
 readonly group=new THREE.Group();readonly ghost=new THREE.Group();private mesh:THREE.Mesh|null=null;
 private material=new THREE.ShaderMaterial({transparent:true,depthWrite:true,side:THREE.DoubleSide,
  uniforms:{front:{value:0},back:{value:1},clock:{value:0}},
  vertexShader:`attribute float station; attribute float across; varying float s; varying float v; varying vec3 normalView;
   void main(){s=station;v=across;normalView=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float front;uniform float back;uniform float clock;varying float s;varying float v;varying vec3 normalView;
   void main(){float nose=front+.04*(1.-v*v);if(s>nose||s>back)discard;
    float flow=sin((s-clock*.13)*85.+v*4.+sin(v*13.)*.8);
    float crevasse=smoothstep(.91,1.,flow)*.13;
    float streak=pow(abs(sin(v*21.+sin(s*8.-clock*.6)*.35)),16.);
    vec3 color=mix(vec3(.32,.66,.78),vec3(.9,.97,1.),.68-.2*abs(v));
    color-=crevasse;color+=streak*.10;
    float lip=1.-smoothstep(0.,.025,nose-s);color=mix(color,vec3(.95,.99,1.),lip*.5);
    gl_FragColor=vec4(color,.92);
   }`});
 clear(){if(this.mesh){this.group.remove(this.mesh);this.mesh.geometry.dispose();this.mesh=null;}this.preview([]);}
 set(path:Station[],base:Uint8Array,W:number,_lobe=false){
  this.clear();const vertices:number[]=[],st:number[]=[],crosses:number[]=[],indices:number[]=[],H=base.length/W;
  const surface=(x:number,y:number)=>base[Math.max(0,Math.min(H-1,Math.floor(y)))*W+Math.max(0,Math.min(W-1,Math.floor(x)))];
  const profile=[-1,-.84,-.5,0,.5,.84,1];
  for(let k=0;k<path.length;k++){
   const p=path[k],a=path[Math.max(0,k-2)],b=path[Math.min(path.length-1,k+2)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
   const taper=Math.min(1,.4+Math.min(p.s,1-p.s)*9),r=p.r*taper*.96;
   const centre=surface(p.x,p.y);
   for(const cross of profile){const x=p.x+nx*r*cross,y=p.y+ny*r*cross;
    const side=surface(x,y),z=Math.max(p.floor+.8,centre+.8,side+.4)+(1-cross*cross)*2.8;
    vertices.push(x,z,-y);st.push(p.s);crosses.push(cross);
   }
   if(k)for(let j=0;j<profile.length-1;j++){const i=k*profile.length+j;indices.push(i-profile.length,i,i+1,i-profile.length,i+1,i-profile.length+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('station',new THREE.Float32BufferAttribute(st,1));g.setAttribute('across',new THREE.Float32BufferAttribute(crosses,1));g.setIndex(indices);g.computeVertexNormals();
  this.mesh=new THREE.Mesh(g,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.group.add(this.mesh);this.update(0);
 }
 update(t:number){this.material.uniforms.front.value=Math.min(1,t/3);this.material.uniforms.back.value=t<=3?1:Math.max(-.01,1-(t-3)/2);this.material.uniforms.clock.value=t;}
 preview(points:Point[],heights?:Uint8Array,W=1){for(const a of [...this.ghost.children]){this.ghost.remove(a);(a as THREE.Line).geometry.dispose();((a as THREE.Line).material as THREE.Material).dispose();}
  if(points.length<2)return;const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,(heights?.[Math.floor(p.y)*W+Math.floor(p.x)]??0)+.2,-p.y)));
  this.ghost.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xeafcff,transparent:true,opacity:.45,depthTest:false})));}
}
