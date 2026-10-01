import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {makeMaterials,volume} from './materials';
import {LIGHT_LEVELS} from './geometry';
import type {Fixture,Pose} from './fixtures';
const canvas=document.querySelector('canvas')!,gl=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
gl.setPixelRatio(1);gl.setSize(innerWidth,innerHeight);gl.outputColorSpace=T.LinearSRGBColorSpace;
const scene=new T.Scene();scene.background=new T.Color('#b6c9d3');
const camera=new T.PerspectiveCamera(50,innerWidth/innerHeight,.04,1500),controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.maxPolarAngle=Math.PI;
const group=new T.Group(),waterGroup=new T.Group();scene.add(group,waterGroup);
const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
const chunks=new Map<number,T.Mesh>();
let fixture:Fixture,materials:ReturnType<typeof makeMaterials>,light:T.Data3DTexture,soil:T.Data3DTexture,look='high',level=23,revision=0,applied=0,poseName='outside',animation=false,openToken=0;
let mapSnapshot:{W:number;H:number;heights:Uint8Array;surface:{surface:Float32Array}};
const timings:{worker:number;apply:number;latency:number}[]=[],pending=new Map<number,{resolve:()=>void,reject:(e:Error)=>void,at:number,level:number}>();
function pose(p:Pose){camera.fov=p.fov??50;camera.updateProjectionMatrix();controls.target.fromArray(p.target);camera.position.set(p.target[0]+Math.sin(p.yaw)*Math.cos(p.pitch)*p.distance,p.target[1]+Math.sin(p.pitch)*p.distance,p.target[2]+Math.cos(p.yaw)*Math.cos(p.pitch)*p.distance);controls.update();}
function caption(){document.querySelector('#caption')!.innerHTML=`${fixture.title} · ${look==='high'?'High':'Standard'} · ${poseName} · ${level===23?'all levels':'through '+level}<small>Drag to orbit · wheel to zoom · original procedural materials</small>`;}
function update(mask:number[]){const id=++revision;return new Promise<void>((resolve,reject)=>{pending.set(id,{resolve,reject,at:performance.now(),level});worker.postMessage({id,W:fixture.W,H:fixture.H,mask:Uint32Array.from(mask),moist:fixture.moist,level});});}
worker.onerror=e=>{for(const p of pending.values())p.reject(new Error(e.message));pending.clear();};
worker.onmessage=e=>{
 const data=e.data,p=pending.get(data.id);if(!p)return;
 const start=performance.now();
 // Worker replies are ordered. Each includes geometry + lighting from exactly the same terrain revision.
 light.image.data=data.light;light.needsUpdate=true;soil.image.data=data.soil;soil.needsUpdate=true;
 for(const m of data.geometry){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(m.positions,3));g.setAttribute('normal',new T.BufferAttribute(m.normals,3,true));g.setIndex(new T.BufferAttribute(m.indices,1));g.computeBoundingSphere();
  let mesh=chunks.get(m.key);if(mesh){mesh.geometry.dispose();mesh.geometry=g;}else{mesh=new T.Mesh(g,materials.terrain);chunks.set(m.key,mesh);group.add(mesh);}
 }
 materials.u.slice.value=p.level;applied=data.id;timings.push({worker:data.ms,apply:performance.now()-start,latency:performance.now()-p.at});pending.delete(data.id);p.resolve();
};
function waterMesh(){
 for(const m of [...waterGroup.children]){(m as T.Mesh).geometry.dispose();waterGroup.remove(m);}
 const pos:number[]=[],data:number[]=[],norm:number[]=[],flags:number[]=[],indices:number[]=[];
 for(const [x,y,z,depth,bad]of fixture.water){const b=pos.length/3;pos.push(x,z,-y,x+1,z,-y,x+1,z,-y-1,x,z,-y-1);for(let i=0;i<4;i++){norm.push(0,1,0);data.push(depth,bad);flags.push(0);}indices.push(b,b+1,b+2,b,b+2,b+3);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('wdata',new T.Float32BufferAttribute(data,2));g.setAttribute('wflags',new T.Float32BufferAttribute(flags,1));g.setIndex(indices);waterGroup.add(new T.Mesh(g,materials.water));
}
async function open(id:string){
 const token=++openToken;
 while(pending.size||animation)await new Promise(r=>setTimeout(r,10));
 const loaded=await fetch(`/local/fixtures/${id}.json`).then(r=>r.json());if(token!==openToken)return;
 fixture=loaded;level=23;poseName='outside';
 mapSnapshot={W:fixture.W,H:fixture.H,heights:Uint8Array.from(fixture.mask,v=>32-Math.clz32(v)),surface:{surface:new Float32Array(fixture.W*fixture.H)}};
 for(const m of chunks.values())m.geometry.dispose();chunks.clear();group.clear();
 light?.dispose();soil?.dispose();materials?.dispose();
 light=volume(new Uint8Array(fixture.W*fixture.H*LIGHT_LEVELS*2),fixture.W,fixture.H,true);soil=volume(new Uint8Array(fixture.W*fixture.H*LIGHT_LEVELS*4),fixture.W,fixture.H);
 materials=makeMaterials(gl,fixture.W,fixture.H,look==='high',light,soil);waterMesh();
 // A fresh worker state must send every chunk when the scene objects have been cleared.
 await update(Array(fixture.W*fixture.H).fill(0));await update(fixture.mask);
 pose(fixture.poses.outside);caption();(document.querySelector('#case')as HTMLSelectElement).value=id;(document.querySelector('#level')as HTMLInputElement).value='23';document.querySelector('output')!.value='All';
}
function setLook(value:string){look=value;materials.dispose();materials=makeMaterials(gl,fixture.W,fixture.H,look==='high',light,soil);materials.u.slice.value=level;for(const m of chunks.values())m.material=materials.terrain;waterMesh();caption();}
async function slice(value:number){level=value;await update(fixture.mask);caption();}
async function frame(index:number){await update(fixture.frames?.[index]??fixture.mask);}
async function play(){if(animation||!fixture.frames)return;animation=true;for(let i=0;i<fixture.frames.length;i++){await frame(i);await new Promise(r=>setTimeout(r,55));}animation=false;}
const api={open,setLook,slice,frame,play,pose,gpu(){const c=gl.getContext(),e=c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';},setPose(name:string){poseName=name;pose(fixture.poses[name]??fixture.poses.outside);caption();},get fixture(){return fixture;},get timings(){return timings;},get revisions(){return{requested:revision,applied,pending:pending.size};},gl,canvas,
 renderNow(){materials.u.time.value=performance.now()/1000;gl.render(scene,camera);},
 mapState(){return mapSnapshot??null;},
 clearWater(on:boolean){materials.u.clearWater.value=+on;},
 volume(on:boolean){materials.terrain.uniforms.volumeEnabled.value=+on;materials.water.uniforms.volumeEnabled.value=+on;},
 get terrain(){return chunks;},get water(){return new Map();}
};
(window as any).view=api;(window as any).dgm3d={renderer:api};
const index=await fetch('/local/fixtures/index.json').then(r=>r.json());
document.querySelector('#case')!.innerHTML=index.map((f:any)=>`<option value="${f.id}">${f.title}</option>`).join('');
(document.querySelector('#case')as HTMLSelectElement).onchange=e=>void open((e.target as HTMLSelectElement).value);
(document.querySelector('#look')as HTMLSelectElement).onchange=e=>setLook((e.target as HTMLSelectElement).value);
for(const name of ['outside','inside'])document.querySelector('#'+name)!.addEventListener('click',()=>api.setPose(name));
let debounce:number;document.querySelector('#level')!.addEventListener('input',e=>{const n=+(e.target as HTMLInputElement).value;document.querySelector('output')!.value=n===23?'All':String(n);clearTimeout(debounce);debounce=window.setTimeout(()=>void slice(n),60);});
document.querySelector('#play')!.addEventListener('click',()=>void play());
await open('roof-skylight');
function tick(){api.renderNow();requestAnimationFrame(tick);}tick();document.body.dataset.ready='1';
addEventListener('resize',()=>{gl.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='t')materials.u.clearWater.value=1-materials.u.clearWater.value;});
