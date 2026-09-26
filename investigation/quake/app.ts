import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pickHeightfield } from '../../src/render3d/pick';
import { sceneUniforms,terrainMaterial,waterMaterial,objectMaterial,tileTexture,lightTexture,overlayTexture,drawPatterns } from '../../src/render3d/materials';
import { MAPS } from './maps';
import type { Chunk,Geometry } from './meshes';
import type { QuakeOperation } from './operation';
import { strokeReason,clamp,slideTiles,type Settings,type Point,type Intent } from './engine';
import { FaultBrush } from './brush';
import { Rupture,type Head } from './effects';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id),canvas=$<HTMLCanvasElement>('view'),notice=$('notice');
const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
const scene=new THREE.Scene();scene.background=new THREE.Color('#b8cbd8');
const camera=new THREE.PerspectiveCamera(42,1,.1,3000),gl=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
gl.setPixelRatio(Math.min(devicePixelRatio,1.5));gl.outputColorSpace=THREE.LinearSRGBColorSpace;
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.49;
controls.mouseButtons={LEFT:undefined,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
scene.add(new THREE.HemisphereLight(0xffffff,0x687366,2));
const sun=new THREE.DirectionalLight(0xfff4d6,2);sun.position.set(-80,160,100);scene.add(sun);
const uniforms=sceneUniforms(1,1,tileTexture(1,1,new Uint8Array(4)),lightTexture(1,1,new Uint8Array(16)),overlayTexture(1,1),overlayTexture(1,1));
uniforms.patternTex.value=drawPatterns(gl).texture;uniforms.markers.value=0;
const groundMat=terrainMaterial(uniforms,0,16),waterMat=waterMaterial(uniforms),objectsMat=objectMaterial(uniforms);
groundMat.uniforms.rockBeds={value:new Array(23).fill(0)};
groundMat.fragmentShader='uniform float rockBeds[23];\n'+groundMat.fragmentShader.replace('float py = fwidth(y);','wc *= mix(vec3(1.04,1.01,.95),vec3(.78,.85,.87),rockBeds[int(clamp(level,0.0,22.0))]); float py = fwidth(y);');
// The immediate local lurch follows the pen on the GPU; the worker supplies
// lasting whole-level ground behind it. No per-vertex search along the path.
const pen={value:new THREE.Vector4()},penForce={value:new THREE.Vector2()};
const glideClock={value:0},glideEnabled={value:1};
for(const material of [groundMat,waterMat,objectsMat]){
 material.uniforms.pen=pen;material.uniforms.penForce=penForce;
 material.uniforms.glideClock=glideClock;material.uniforms.glideEnabled=glideEnabled;
 material.vertexShader='attribute vec4 slideFrom; uniform float glideClock; uniform float glideEnabled; uniform vec4 pen; uniform vec2 penForce;\n'+material.vertexShader.replace('vWorld = w.xyz;',`
 w.xyz+=slideFrom.xyz*(1.0-smoothstep(0.0,240.0,glideClock-slideFrom.w))*glideEnabled;
 vec2 q=vec2(w.x,-w.z)-pen.xy;
 float wake=(1.0-smoothstep(1.0,7.0,length(q)))*(1.0-smoothstep(0.0,2.0,dot(q,pen.zw)));
 float side=smoothstep(-.4,.4,(pen.z*q.y-pen.w*q.x)*sign(penForce.x))-.35;
 w.y+=wake*side*abs(penForce.x)*(1.0-penForce.y);
 vWorld = w.xyz;`);
}
const chunks=new Map<string,THREE.Group>(),uploads:(Chunk|{checkpoint:{heights:Uint8Array}}|{lighting:Lighting})[]=[];
const retained=new Set<THREE.BufferGeometry>(),retainedInstances=new Set<THREE.InstancedMesh>();
const marker=new THREE.Mesh(new THREE.TorusGeometry(.9,.12,5,20),new THREE.MeshBasicMaterial({color:0xffeac2}));
marker.rotation.x=Math.PI/2;marker.visible=false;scene.add(marker);
const linePositions=new Float32Array(12288*3),tintPositions=new Float32Array(12288*18);
const lineGeometry=new THREE.BufferGeometry(),tintGeometry=new THREE.BufferGeometry();
lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3).setUsage(THREE.DynamicDrawUsage));
tintGeometry.setAttribute('position',new THREE.BufferAttribute(tintPositions,3).setUsage(THREE.DynamicDrawUsage));
const aimLine=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0x443d30,depthTest:false}));
const sideTint=new THREE.Mesh(tintGeometry,new THREE.MeshBasicMaterial({color:0xe9cf88,transparent:true,opacity:.12,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
aimLine.frustumCulled=sideTint.frustumCulled=false;aimLine.visible=sideTint.visible=false;scene.add(aimLine,sideTint);aimLine.renderOrder=9;sideTint.renderOrder=8;
const surge=new Rupture();scene.add(surge.group);
let W=0,H=0,heights=new Uint8Array(),keep=new Uint8Array(),busy=true,active=false,mode:'lift'|'slide'='lift',path:Point[]=[],effectPath:Point[]=[];
let steps=0,epoch=0,top=false,settling=false,head:Head|null=null,startedAt=0;
let canReroll=false,historyIndex=0,cachedAfterIndex=-1;
let tileGlides=new Float32Array(),priorGlides=new Float32Array(),motionId=-1;
let glideUploads=0,maxGlide=0;
let savedRun:unknown=null,lastOperation:QuakeOperation|null=null,finishCache=false;
interface Drawing {brush:FaultBrush;settings:Settings;id:number;started:boolean;ended:boolean;pickHeights:Uint8Array;keep:Uint8Array;refused:string|null;sentAt:number}
let drawing:Drawing|null=null,painting:Drawing|null=null,strokeId=0,sideChoice:1|-1=1;
const pendingStrokes:Drawing[]=[];
interface Lighting {tiles:Uint8Array;light:Uint8Array;checks:any}
let lighting:Lighting|null=null;
interface Cache {groups:Map<string,THREE.Group>;heights:Uint8Array;lighting:Lighting}
let beforeCache:Cache|null=null,afterCache:Cache|null=null,quakeBaseCache:Cache|null=null;
let priorCaches:{before:Cache|null;after:Cache|null;base:Cache|null;index:number}|null=null;
const historyCaches=new Map<number,Cache>();
const allCaches=()=>[beforeCache,afterCache,quakeBaseCache,priorCaches?.before,priorCaches?.after,priorCaches?.base,...historyCaches.values()];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');input('motion').checked=!reduced.matches;
const motion=()=>!reduced.matches&&input('motion').checked;
function send(msg:Record<string,unknown>){busy=true;worker.postMessage(msg);}
function stateControls(){
 for(const id of ['map','reset','lift','slide','power','scarp','replay-file'])($<HTMLButtonElement>(id)).disabled=active||busy;
 $<HTMLButtonElement>('reroll').disabled=active||busy||!!uploads.length||finishCache||!canReroll;
 if(active){$<HTMLButtonElement>('undo').disabled=false;$<HTMLButtonElement>('redo').disabled=true;}
}
function resetView(){
  controls.target.set(W*.52,3,-H*.52);camera.position.set(W*1.05,Math.max(W,H)*.95,H*.38);controls.update();top=false;$('top').textContent='Top-down';
}
function geometry(d:Geometry){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(d.positions,3));
  g.setAttribute('normal',new THREE.BufferAttribute(d.normals,3,d.normals instanceof Int8Array));
  g.setAttribute('pcolor',new THREE.BufferAttribute(d.colors,3));g.setAttribute('grow',new THREE.BufferAttribute(new Float32Array(d.positions.length),3));
  if(d.data)g.setAttribute('wdata',new THREE.BufferAttribute(d.data,2));
  if(d.flags)g.setAttribute('wflags',new THREE.BufferAttribute(d.flags,1));
  if(d.indices)g.setIndex(new THREE.BufferAttribute(d.indices,1));g.computeBoundingSphere();return g;
}
function dispose(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh&&!retained.has(o.geometry))o.geometry.dispose();if(o instanceof THREE.InstancedMesh&&!retainedInstances.has(o))o.dispose();});}
function retain(c:Cache|null){c?.groups.forEach(g=>g.traverse(o=>{if(o instanceof THREE.Mesh)retained.add(o.geometry);if(o instanceof THREE.InstancedMesh)retainedInstances.add(o);}));}
function cache():Cache|null{return lighting?{groups:new Map(chunks),heights:heights.slice(),lighting}:null;}
function setLighting(l:Lighting){
  lighting=l;uniforms.tileTex.value.dispose();uniforms.lightTex.value.dispose();
  uniforms.tileTex.value=tileTexture(W,H,l.tiles);uniforms.lightTex.value=lightTexture(W,H,l.light);uniforms.mapSize.value.set(W,H);
  const c=l.checks;$('checks').textContent=c.present?('Start · '+(c.meets?'resources in reach':'resources missing')+'\n'+c.reach.toLocaleString()+' reachable tiles\nWater '+(c.water===null?'out of reach':c.water+' tiles')+' · Wood '+c.trees+' · Berries '+c.bushes):'No start on this map';
  updateReach();
}
function updateReach(){
  const tex=uniforms.overlay.value;tex.dispose();uniforms.overlay.value=overlayTexture(W||1,H||1);
  const a=uniforms.overlay.value.image.data as Uint8Array,reach=lighting?.checks.tiles;
  if(input('reach').checked&&reach)for(let i=0;i<reach.length;i++)if(reach[i]){a[i*4]=125;a[i*4+1]=202;a[i*4+2]=133;a[i*4+3]=75;}
  uniforms.overlay.value.needsUpdate=true;
}
input('reach').onchange=updateReach;
function restoreView(c:Cache|null){
  if(!c)return;tileGlides.fill(0);motionId=-1;uploads.length=0;for(const g of chunks.values()){scene.remove(g);dispose(g);}chunks.clear();
  for(const [key,g]of c.groups){
    g.traverse(o=>{if(o instanceof THREE.Mesh){const a=o.geometry.getAttribute('slideFrom');if(a){a.array.fill(0);a.needsUpdate=true;}}});
    chunks.set(key,g);scene.add(g);
  }heights=c.heights.slice();setLighting(c.lighting);
}
function pruneCaches(){
  const oldInstances=new Set(retainedInstances),old=new Set(retained);
  retainedInstances.clear();retained.clear();allCaches().forEach(c=>retain(c??null));
  const currentInstances=new Set<THREE.InstancedMesh>(),current=new Set<THREE.BufferGeometry>();
  chunks.forEach(g=>g.traverse(o=>{if(o instanceof THREE.Mesh)current.add(o.geometry);if(o instanceof THREE.InstancedMesh)currentInstances.add(o);}));
  for(const o of oldInstances)if(!retainedInstances.has(o)&&!currentInstances.has(o))o.dispose();
  for(const g of old)if(!retained.has(g)&&!current.has(g))g.dispose();
}
function releaseCaches(){beforeCache=afterCache=quakeBaseCache=null;priorCaches=null;historyCaches.clear();pruneCaches();}
function preserveCaches(){priorCaches={before:beforeCache,after:afterCache,base:quakeBaseCache,index:cachedAfterIndex};}
function rollbackCaches(){
  if(!priorCaches)return;
  beforeCache=priorCaches.before;afterCache=priorCaches.after;quakeBaseCache=priorCaches.base;cachedAfterIndex=priorCaches.index;
  priorCaches=null;pruneCaches();
}
function upload(c:Chunk){
  if(c.motionId!==undefined&&c.motionId!==motionId){motionId=c.motionId;priorGlides=tileGlides.slice();}
  const now=performance.now(),prior=c.motionId===undefined?tileGlides:priorGlides;
  const carry=(x:number,z:number,delta:ArrayLike<number>)=>{
    const xx=clamp(Math.floor(x+delta[0]),0,W-1),yy=clamp(Math.floor(-z-delta[2]),0,H-1),i=(yy*W+xx)*4;
    const t=clamp((now-prior[i+3])/240,0,1),left=1-t*t*(3-2*t);
    // Water/lighting remeshes retain the remaining motion and original clock.
    if(!delta[0]&&!delta[1]&&!delta[2])return [prior[i]||0,prior[i+1]||0,prior[i+2]||0,prior[i+3]||0];
    return [delta[0]+(prior[i]||0)*left,delta[1]+(prior[i+1]||0)*left,delta[2]+(prior[i+2]||0)*left,now];
  };
  const attribute=(d:Geometry)=>{
    const a=new Float32Array(d.positions.length/3*4);
    for(let v=0;v<d.positions.length;v+=12){let x=0,z=0;for(let k=0;k<4;k++){x+=d.positions[v+k*3]/4;z+=d.positions[v+k*3+2]/4;}
      x-=Math.sign(d.normals[v])*.001;z-=Math.sign(d.normals[v+2])*.001;
      const q=carry(x,z,d.glide?.subarray(v,v+3)??[0,0,0]);for(let k=0;k<4;k++)a.set(q,(v/3+k)*4);
    }return new THREE.BufferAttribute(a,4);
  };
  // Match shader height/water bytes to the chunk on screen. Stale height bytes
  // classify newly lowered ground as a cave and turn it almost black.
  if(lighting&&allCaches().some(saved=>saved?.lighting===lighting))setLighting({...lighting,tiles:lighting.tiles.slice()});
  const bytes=uniforms.tileTex.value.image.data as Uint8Array,[cx,cy]=c.key.split(',').map(Number);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const xx=cx*32+x,yy=cy*32+y;if(xx>=W||yy>=H)continue;
    const i=(yy*W+xx)*4,j=(y*32+x)*2;bytes[i]=c.surface[j];bytes[i+3]=c.surface[j+1];
  }
  uniforms.tileTex.value.needsUpdate=true;
  let group=chunks.get(c.key);
  if(group&&allCaches().some(saved=>saved?.groups.get(c.key)===group)){
    scene.remove(group);group=group.clone(true);scene.add(group);chunks.set(c.key,group);
  }
  if(!group){group=new THREE.Group();scene.add(group);chunks.set(c.key,group);}
  if(c.floor&&motion()){
    const prior=group.getObjectByName('slide-floor') as THREE.Mesh|undefined;if(prior){if(!retained.has(prior.geometry))prior.geometry.dispose();group.remove(prior);}
    const g=geometry(c.floor);g.setAttribute('slideFrom',new THREE.BufferAttribute(new Float32Array(c.floor.positions.length/3*4),4));
    const floor=new THREE.Mesh(g,groundMat);floor.name='slide-floor';floor.userData.until=now+260;floor.renderOrder=-1;group.add(floor);
  }
  for(const name of ['terrain','water']){
    const old=group.getObjectByName(name) as THREE.Mesh|undefined;
    if(old){if(!retained.has(old.geometry))old.geometry.dispose();group.remove(old);}
    const d=name==='terrain'?c.terrain:c.water,g=geometry(d);g.setAttribute('slideFrom',attribute(d));
    const mesh=new THREE.Mesh(g,name==='terrain'?groundMat:waterMat);mesh.frustumCulled=false;
    mesh.name=name;mesh.renderOrder=name==='water'?2:0;group.add(mesh);
  }
  if(c.objects){
    const old=group.getObjectByName('objects') as THREE.Group|undefined;if(old){dispose(old);group.remove(old);}
    const objects=new THREE.Group();objects.name='objects';
    for(const o of c.objects){
      const m=new THREE.InstancedMesh(geometry(o.geometry),objectsMat,o.count);m.instanceMatrix.array.set(o.matrices);m.instanceMatrix.needsUpdate=true;
      const a=new Float32Array(o.count*4);
      for(let k=0;k<o.count;k++)a.set(carry(o.matrices[k*16+12],o.matrices[k*16+14],o.glide?.subarray(k*3,k*3+3)??[0,0,0]),k*4);
      m.geometry.setAttribute('slideFrom',new THREE.InstancedBufferAttribute(a,4));m.frustumCulled=false;
      m.instanceColor=new THREE.InstancedBufferAttribute(o.colors,3);m.computeBoundingSphere();objects.add(m);
    }group.add(objects);
  }
  // Update only after all mesh attributes have read the previous visible pose.
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const xx=cx*32+x,yy=cy*32+y;if(xx>=W||yy>=H)continue;
    const d=c.travel?.subarray((y*32+x)*3,(y*32+x)*3+3)??[0,0,0];
    tileGlides.set(carry(xx+.5,-yy-.5,d),(yy*W+xx)*4);
    if(c.travel){const distance=Math.hypot(d[0],d[2]);maxGlide=Math.max(maxGlide,distance);if(distance)glideUploads++;}
  }
  canvas.dataset.glideTiles=String(maxGlide);canvas.dataset.glideUploads=String(glideUploads);
}
function instruction(){notice.textContent=drawing?'Keep painting · X flips the side · Esc reverts':'Paint a fault across the land.';}
worker.onmessage=(event:MessageEvent)=>{
 const m=event.data;if(m.epoch<epoch)return;epoch=m.epoch;
 if(m.type==='reset'){W=m.W;H=m.H;tileGlides=new Float32Array(W*H*4);priorGlides=tileGlides.slice();motionId=-1;glideUploads=maxGlide=0;releaseCaches();uploads.length=0;for(const g of chunks.values()){dispose(g);scene.remove(g);}chunks.clear();groundMat.uniforms.rockBeds.value=m.rockLayers;resetView();}
 if(m.type==='chunk')uploads.push(m.chunk);
 if(m.type==='checkpoint')uploads.push({checkpoint:{heights:heights.slice()}});
 if(m.type==='lighting')uploads.push({lighting:m});
 if(m.type==='frame'){
  canReroll=!!m.canReroll;historyIndex=m.undo;heights=m.heights;keep=m.keep;head=m.head;effectPath=m.path;
  if(m.seed!==null)$('seed-label').textContent='Personality '+m.seed;
  if(!drawing)surge.set(head,effectPath,heights,W);
  if(m.metrics){steps=m.metrics.steps;$('metrics').textContent=(mode==='slide'?m.metrics.transported:m.metrics.changed).toLocaleString()+' tiles moved · '+m.metrics.toppled+' trees toppled';}
  else $('metrics').textContent='';
  $<HTMLButtonElement>('undo').disabled=!active&&!m.undo;$<HTMLButtonElement>('redo').disabled=active||!m.redo;
 }
 if(m.type==='status')notice.textContent=m.text;
 if(m.type==='settling'){settling=true;canvas.dataset.ruptureMs=String(performance.now()-startedAt);notice.textContent='Water finding its level · Esc reverts';}
 if(m.type==='started'){showSettings(m.settings);$('seed-label').textContent='Personality '+m.seed;active=true;settling=false;steps=0;effectPath=m.path;const p=m.path[0];head={...p,z:heights[Math.round(p.y)*W+Math.round(p.x)],progress:.02};surge.set(head,effectPath,heights,W);notice.textContent=m.brush?'Keep painting · X flips the side · Esc reverts':'The fault is moving · Esc reverts';}
 if(m.type==='painted'){canvas.dataset.paintedRevision=String(m.revision);if(drawing?.started&&!drawing.ended)canvas.dataset.paintedWhileHeld='true';}
 if(m.type==='cancelled'){rollbackCaches();active=false;settling=false;head=null;surge.set(null,[],heights,W);notice.textContent=drawing?.refused??'Whole quake reverted.';}
 if(m.type==='finished'){
  priorCaches=null;canReroll=true;historyIndex=m.undo;cachedAfterIndex=m.undo;active=false;settling=false;head=null;painting=null;finishCache=true;surge.set(null,[],heights,W);if(!drawing){path=[];aimLine.visible=sideTint.visible=false;}
  const sorted=measurements.slice().sort((a,b)=>a-b);canvas.dataset.eventP95Ms=String(sorted[Math.floor(sorted.length*.95)]??0);canvas.dataset.eventMaxMs=String(Math.max(0,...measurements));
  notice.textContent=m.settled?'A new piece of land. One undo brings it back.':'Quake saved. Water reached the repository’s settle limit.';$<HTMLButtonElement>('undo').disabled=false;
 }
 if(m.type==='operation'){lastOperation=m.op;savedRun={format:1,base:m.base,quakeBase:m.quakeBase,operation:m.op};$<HTMLButtonElement>('save-run').disabled=false;}
 if(m.type==='replayed'){
  notice.textContent='Exact saved quake restored.';finishCache=true;cachedAfterIndex=historyIndex;
  let option=select.querySelector<HTMLOptionElement>('option[value="saved"]');if(!option){option=document.createElement('option');option.value='saved';select.add(option);}option.textContent='Saved quake · '+W+' × '+H;select.value='saved';
  if(lastOperation)showSettings(lastOperation.params.settings);
 }
 if(m.type==='error'){notice.textContent=m.text;if(active){restoreView(beforeCache);rollbackCaches();}if(painting){painting.refused=m.text;if(drawing===painting)drawing.refused=m.text;drawLine(painting.brush.intent().path,painting.brush.side,true);}painting=null;active=false;settling=false;head=null;}
 if(m.type==='ready'){busy=false;stateControls();if(notice.textContent==='Loading land…')instruction();}
};
worker.onerror=e=>{notice.textContent='Worker error: '+e.message;busy=false;active=false;stateControls();};
const select=$<HTMLSelectElement>('map');for(const [id,name]of MAPS){const o=document.createElement('option');o.value=id;o.textContent=name;select.add(o);}
select.value='fixture:river:128';
function load(){
 if(select.value==='saved'&&savedRun){send({type:'replay',bundle:savedRun});stateControls();return;}
 select.querySelector('option[value="saved"]')?.remove();canReroll=false;cachedAfterIndex=-1;path=[];drawing=painting=null;pendingStrokes.length=0;marker.visible=false;aimLine.visible=sideTint.visible=false;savedRun=null;lastOperation=null;head=null;$('metrics').textContent='';notice.textContent='Loading land…';$<HTMLButtonElement>('save-run').disabled=true;send({type:'load',id:select.value});stateControls();
}
select.onchange=load;$('reset').onclick=load;
for(const value of ['lift','slide'] as const)$(value).onclick=()=>{mode=value;for(const a of ['lift','slide'])$(a).setAttribute('aria-pressed',String(a===mode));powerLabel();instruction();};
function powerLabel(){const p=Number(input('power').value);$('power-label').textContent=(mode==='lift'?1+Math.round(p*.075):slideTiles(p))+(mode==='lift'?' levels':' tiles');}
input('power').oninput=powerLabel;
let nextSeed=crypto.getRandomValues(new Uint32Array(1))[0];
function settings():Settings{return {mode,power:Number(input('power').value),scarp:$<HTMLSelectElement>('scarp').value as Settings['scarp'],seed:nextSeed++>>>0};}
function showSettings(s:Settings){mode=s.mode;input('power').value=String(s.power);$<HTMLSelectElement>('scarp').value=s.scarp;for(const a of ['lift','slide'])$(a).setAttribute('aria-pressed',String(a===mode));powerLabel();}
$('reroll').onclick=()=>{if(!canReroll||busy||active||uploads.length)return;preserveCaches();beforeCache=cache();if(beforeCache)historyCaches.set(historyIndex,beforeCache);afterCache=null;retain(beforeCache);if(historyIndex===cachedAfterIndex)restoreView(quakeBaseCache);else quakeBaseCache=null;pruneCaches();active=true;path=[];aimLine.visible=false;startedAt=performance.now();measurements.length=0;delete canvas.dataset.firstChangeMs;notice.textContent='Trying another personality…';send({type:'reroll'});stateControls();};
function begin(side:1|-1,explicit?:{settings:Settings;intent:Intent}){
 if(busy||active||uploads.length)return;
 preserveCaches();beforeCache=cache();afterCache=null;quakeBaseCache=beforeCache;pruneCaches();active=true;marker.visible=false;aimLine.visible=false;
 if(beforeCache)historyCaches.set(historyIndex,beforeCache);for(const k of historyCaches.keys())if(k>historyIndex)historyCaches.delete(k);measurements.length=0;
 const intent=explicit?.intent??{path:path.map(p=>({...p})),side};startedAt=performance.now();delete canvas.dataset.firstChangeMs;send({type:'start',settings:explicit?.settings??settings(),intent});path=[];notice.textContent='The fault is waking · Esc reverts';stateControls();
}
function startPaint(d:Drawing){
 const intent=d.brush.intent(),reason=strokeReason(intent.path,keep,W);
 if(reason){d.refused=reason;notice.textContent=reason;return;}
 preserveCaches();beforeCache=cache();afterCache=null;quakeBaseCache=beforeCache;pruneCaches();
 if(beforeCache)historyCaches.set(historyIndex,beforeCache);for(const k of historyCaches.keys())if(k>historyIndex)historyCaches.delete(k);
 active=true;painting=d;d.started=true;d.sentAt=performance.now();startedAt=d.sentAt;measurements.length=0;
 delete canvas.dataset.firstChangeMs;delete canvas.dataset.paintedWhileHeld;canvas.dataset.strokeId=String(d.id);
 send({type:'brush-begin',id:d.id,settings:d.settings,intent});
 if(d.ended)worker.postMessage({type:'brush-end',id:d.id,intent});stateControls();
}
function cancel(){
 pendingStrokes.length=0;drawing=null;controls.enabled=true;path=[];aimLine.visible=sideTint.visible=false;penForce.value.set(0,0);
 if(!active){marker.visible=false;if(!busy&&historyIndex)$('undo').click();else instruction();return;}
 epoch++;active=false;painting=null;settling=false;head=null;restoreView(beforeCache);rollbackCaches();surge.set(null,[],heights,W);busy=true;worker.postMessage({type:'cancel'});notice.textContent='Whole quake reverted.';stateControls();
}
$('undo').onclick=()=>{if(active){cancel();return;}if(busy)return;restoreView(historyCaches.get(historyIndex-1)??(historyIndex===cachedAfterIndex?beforeCache:null));send({type:'undo'});notice.textContent='Whole quake reverted.';};
$('redo').onclick=()=>{if(busy)return;restoreView(historyCaches.get(historyIndex+1)??(historyIndex===cachedAfterIndex-1?afterCache:null));send({type:'redo'});notice.textContent='Stored result restored.';};
$('save-run').onclick=()=>{if(!savedRun)return;const text=JSON.stringify(savedRun,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v),a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download='quake-run.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
input('replay-file').onchange=async()=>{const f=input('replay-file').files?.[0];if(!f||active||busy)return;if(f.size>32*1024*1024){notice.textContent='Quake file is too large.';return;}try{send({type:'replay',bundle:JSON.parse(await f.text())});}catch{notice.textContent='This quake file could not be read.';}};
$('home').onclick=resetView;$('top').onclick=()=>{if(top){resetView();return;}camera.position.set(controls.target.x,Math.max(W,H)*1.55,controls.target.z+.01);controls.update();top=true;$('top').textContent='Orbit';};
function hitAt(e:PointerEvent){const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
 const h=pickHeightfield({origin:ray.ray.origin.toArray(),direction:ray.ray.direction.toArray()},W,H,drawing?.pickHeights??heights);
 return h?{x:clamp(h.point[0]-.5,0,W-1),y:clamp(-h.point[2]-.5,0,H-1)}:null;
}
function drawLine(points:Point[],side:1|-1,bad:boolean){
 let vertices=0,tints=0;const z=(x:number,y:number)=>heights[clamp(Math.round(y),0,H-1)*W+clamp(Math.round(x),0,W-1)]+.25;
 const vertex=(x:number,y:number,buffer:Float32Array,at:number)=>{buffer[at]=x+.5;buffer[at+1]=z(x,y);buffer[at+2]=-y-.5;};
 for(let k=1;k<points.length;k++){
  const a=points[k-1],b=points[k],length=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(length*2)),nx=-(b.y-a.y)/(length||1)*side*7,ny=(b.x-a.x)/(length||1)*side*7;
  for(let j=0;j<=n&&vertices<12288;j++){
   const x=a.x+(b.x-a.x)*j/n,y=a.y+(b.y-a.y)*j/n;vertex(x,y,linePositions,vertices++*3);
   if(j&&tints+6<12288*6){const px=a.x+(b.x-a.x)*(j-1)/n,py=a.y+(b.y-a.y)*(j-1)/n;
    for(const [xx,yy]of [[px,py],[x,y],[x+nx,y+ny],[px,py],[x+nx,y+ny],[px+nx,py+ny]])vertex(clamp(xx,0,W-1),clamp(yy,0,H-1),tintPositions,tints++*3);
   }
  }
 }
 lineGeometry.setDrawRange(0,vertices);lineGeometry.attributes.position.needsUpdate=true;tintGeometry.setDrawRange(0,tints);tintGeometry.attributes.position.needsUpdate=true;
 aimLine.material.color.set(bad?0xd44c40:0x443d30);aimLine.visible=true;sideTint.visible=!bad&&!!drawing;
 canvas.dataset.penPoints=String(vertices);canvas.dataset.side=side===1?'left':'right';canvas.dataset.refused=String(bad);
}
function paintFrame(dt:number,t:number){
 penForce.value.set(0,0);
 if(!active&&!busy&&!uploads.length&&!finishCache){
  const candidate=drawing?.brush.intent().path;
  // Slide needs the first movement's heading, not a guessed tap direction.
  // A true tap is queued on release and still produces one full quake.
  const headingReady=drawing?.settings.mode!=='slide'||!!candidate&&candidate.some(p=>Math.hypot(p.x-candidate[0].x,p.y-candidate[0].y)>.01);
  const d=pendingStrokes.shift()??(drawing&&!drawing.started&&!drawing.refused&&headingReady?drawing:null);if(d)startPaint(d);
 }
 if(!drawing)return;const d=drawing;d.brush.advance(dt);const intent=d.brush.intent();path=intent.path;
 const reason=d.refused??strokeReason(path,d.keep,W);
 if(reason&&!d.refused){if(d.started){cancel();drawing=d;}d.refused=reason;notice.textContent=reason;}
 drawLine(path,d.brush.side,!!d.refused);
 if(d.refused)return;
 const p=path.at(-1)!;let a=path.at(-2)!;
 for(let k=path.length-2;k>=0&&Math.hypot(p.x-a.x,p.y-a.y)<.05;k--)a=path[k];
 const len=Math.hypot(p.x-a.x,p.y-a.y)||1;
 head={...p,z:heights[clamp(Math.round(p.y),0,H-1)*W+clamp(Math.round(p.x),0,W-1)],progress:1};
 surge.moveHead(head);pen.value.set(p.x+.5,p.y+.5,(p.x-a.x)/len,(p.y-a.y)/len);
 if(motion())penForce.value.set(d.brush.side*(.6+d.settings.power*.01),d.settings.mode==='slide'?1:0);
 if(d.started&&t-d.sentAt>=70){worker.postMessage({type:'brush-update',id:d.id,intent});d.sentAt=t;}
}
// Primary pen/touch belongs to painting; OrbitControls owns right/middle only.
canvas.addEventListener('pointerdown',e=>{if(e.button===0)controls.enabled=false;},{capture:true});
canvas.addEventListener('pointerup',e=>{if(e.button===0)controls.enabled=true;});
canvas.addEventListener('pointercancel',()=>{controls.enabled=true;});
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||drawing||!W||heights.length!==W*H)return;const p=hitAt(e);if(!p)return;
 if(e.isTrusted)canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
 drawing={brush:new FaultBrush(p,W,H,sideChoice),settings:settings(),id:++strokeId,started:false,ended:false,pickHeights:heights.slice(),keep:keep.slice(),refused:null,sentAt:0};
 path=drawing.brush.intent().path;notice.textContent='Keep painting · X flips the side · Esc reverts';paintFrame(0,performance.now());
});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;const h=hitAt(e);if(h)drawing.brush.aim(h);});
canvas.addEventListener('pointerup',e=>{
 if(!drawing||e.button!==0)return;const d=drawing,h=hitAt(e);if(h)d.brush.aim(h);d.brush.advance(0,true);paintFrame(0,performance.now());d.ended=true;
 if(!d.refused){if(d.started)worker.postMessage({type:'brush-end',id:d.id,intent:d.brush.intent()});else pendingStrokes.push(d);notice.textContent='Finishing the rupture · Esc reverts';}
 drawing=null;sideTint.visible=false;penForce.value.set(0,0);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointercancel',()=>{if(drawing){if(drawing.started&&!drawing.refused)cancel();else{drawing=null;path=[];aimLine.visible=sideTint.visible=false;}}});
function flipSide(value:1|-1){sideChoice=value;$<HTMLSelectElement>('side').value=String(value);if(drawing){drawing.brush.side=value;if(drawing.started&&!drawing.refused){worker.postMessage({type:'brush-update',id:drawing.id,intent:drawing.brush.intent()});drawing.sentAt=performance.now();}}}
$<HTMLSelectElement>('side').onchange=()=>flipSide(Number($<HTMLSelectElement>('side').value) as 1|-1);
canvas.addEventListener('wheel',e=>{if(e.shiftKey&&!active&&!busy){e.preventDefault();e.stopImmediatePropagation();input('power').value=String(Math.max(0,Math.min(100,Number(input('power').value)+(e.deltaY<0?5:-5))));powerLabel();}},{capture:true,passive:false});
const keys=new Set<string>();window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();if(drawing&&(!drawing.started||drawing.refused)){drawing=null;path=[];aimLine.visible=sideTint.visible=false;notice.textContent='Stroke cancelled.';}else cancel();return;}
 if(e.key.toLowerCase()==='x'&&!e.ctrlKey&&!e.metaKey&&!e.repeat&&!/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)){e.preventDefault();flipSide(sideChoice===1?-1:1);return;}
 if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();$(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo').click();return;}
 if(/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;keys.add(e.key.toLowerCase());
});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();if(drawing){if(drawing.started)cancel();else{drawing=null;path=[];aimLine.visible=sideTint.visible=false;}}});
$('capture-view').onclick=async()=>{
 gl.render(scene,camera);const jpeg=canvas.toDataURL('image/jpeg',.85);
 const response=await fetch('/__quake_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jpeg,metrics:{...canvas.dataset,fps:$('fps').textContent,map:select.value}})});
 notice.textContent=response.ok?'View saved in the demo’s local folder.':'View could not be saved.';
};
new ResizeObserver(()=>{gl.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();uniforms.viewHeight.value=canvas.clientHeight;}).observe(canvas);
let previous=performance.now(),fpsAt=previous,frames=0,frameMs:number[]=[],effectTime=0;
const measurements:number[]=[];
function animate(t:number){
 glideClock.value=performance.now();glideEnabled.value=motion()?1:0;
 requestAnimationFrame(animate);const dt=Math.min(.05,(t-previous)/1000);frameMs.push(t-previous);if(active)measurements.push(t-previous);previous=t;frames++;
 const hadUploads=uploads.length>0,at=performance.now();let count=0;while(uploads.length&&count<2&&performance.now()-at<3){
  const item=uploads.shift()!;if('lighting' in item)setLighting(item.lighting);else if('checkpoint' in item){if(lighting){beforeCache={groups:new Map(chunks),...item.checkpoint,lighting};historyCaches.set(0,beforeCache);retain(beforeCache);}}else upload(item);
  count++;if(active&&!canvas.dataset.firstChangeMs)canvas.dataset.firstChangeMs=String(performance.now()-startedAt);
 }
 if(hadUploads&&!uploads.length)stateControls();if(finishCache&&!uploads.length){afterCache=cache();if(afterCache)historyCaches.set(historyIndex,afterCache);retain(afterCache);finishCache=false;pruneCaches();stateControls();}
 paintFrame(dt,t);
 const pan=Math.max(W,H)*.25*dt*(keys.has('shift')?3:1),x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 if(x||z){camera.position.x+=x*pan;camera.position.z+=z*pan;controls.target.x+=x*pan;controls.target.z+=z*pan;}
 const turn=(keys.has('q')?1:0)-(keys.has('e')?1:0);if(turn){const off=camera.position.clone().sub(controls.target);off.applyAxisAngle(new THREE.Vector3(0,1,0),turn*dt);camera.position.copy(controls.target).add(off);}
 if(active&&head&&input('follow').checked&&motion()&&!settling){const target=new THREE.Vector3(head.x,head.z,-head.y),offset=target.sub(controls.target).multiplyScalar(1-Math.exp(-dt*1.4));controls.target.add(offset);camera.position.add(offset);}
 if(motion())effectTime+=dt;uniforms.time.value=motion()?effectTime:0;surge.update(effectTime,motion()&&active&&!settling);controls.update();
 for(const [key,g] of chunks){const [cx,cy]=key.split(',').map(Number),near=head&&Math.hypot(cx*32+16-head.x,cy*32+16-head.y)<18+Number(input('power').value)*.5;
  const floor=g.getObjectByName('slide-floor') as THREE.Mesh|undefined;if(floor&&t>=floor.userData.until){g.remove(floor);if(!retained.has(floor.geometry))floor.geometry.dispose();}
  g.position.y=motion()&&active&&!settling&&near?Math.sin(t*.04+cx+cy)*.12:0;}
 const shake=motion()&&input('shake').checked&&active&&!settling ? .12 : 0;camera.position.x+=Math.sin(t*.045)*shake;camera.position.y+=Math.cos(t*.061)*shake;gl.render(scene,camera);camera.position.x-=Math.sin(t*.045)*shake;camera.position.y-=Math.cos(t*.061)*shake;
 if(t-fpsAt>=1000){const sorted=frameMs.sort((a,b)=>a-b);$('fps').textContent=Math.round(frames*1000/(t-fpsAt))+' fps · p95 '+Math.round(sorted[Math.floor(sorted.length*.95)]??0)+' ms';frameMs=[];frames=0;fpsAt=t;}
 if(!painting&&!busy&&!uploads.length&&active&&!settling&&t>=startedAt+Math.max(1,steps)*150)send({type:'advance'});
}
requestAnimationFrame(animate);powerLabel();
function glideSample(){
 const now=performance.now();
 for(const g of chunks.values()){
  const mesh=g.getObjectByName('terrain') as THREE.Mesh|undefined,a=mesh?.geometry.getAttribute('slideFrom'),p=mesh?.geometry.getAttribute('position');if(!a||!p)continue;
  for(let k=0;k<a.count;k+=4){const dx=a.getX(k),dz=a.getZ(k),distance=Math.hypot(dx,dz),u=clamp((now-a.getW(k))/240,0,1);
   if(distance>=2&&u>0&&u<1)return {distance,progress:u,remaining:distance*(1-u*u*(3-2*u)),enabled:glideEnabled.value,target:[p.getX(k),p.getZ(k)]};
  }
 }return null;
}
Object.assign(window,{quake:{get operation(){return lastOperation;},get bundle(){return savedRun;},get state(){return {steps,active,busy,settling,queued:uploads.length,finishCache,historyIndex,pending:pendingStrokes.length,drawing:!!drawing,W,H,mode,head,path,heights,measurements};},
 get glide(){return glideSample();},
 capture:()=>{gl.render(scene,camera);const copy=document.createElement('canvas');copy.width=800;copy.height=Math.round(800*canvas.height/canvas.width);copy.getContext('2d')!.drawImage(canvas,0,0,copy.width,copy.height);return copy.toDataURL('image/jpeg',.78);},
 start:(settings:Settings,intent:Intent)=>begin(intent.side,{settings,intent}),
 project:(x:number,y:number)=>{const p=new THREE.Vector3(x+.5,heights[Math.floor(y)*W+Math.floor(x)]+.1,-y-.5).project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
}});
// A shareable local entry point for trying the revised Slide immediately.
if(new URLSearchParams(location.search).has('slide')){select.value='fixture:slide:128';showSettings({mode:'slide',power:100,scarp:'sheer',seed:0});}
load();
