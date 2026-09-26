import './style.css';
import * as THREE from 'three';
import { View, type ViewState, type Lighting } from './view';
import { EruptEffects } from './effects';
import { MAPS } from './maps';
import { DEFAULTS, anatomy, ventRadius, type Settings, type Intent, type Anatomy } from './engine';
import type { Chunk } from './meshes';
import type { EruptOperation } from './operation';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id),button=(id:string)=>$<HTMLButtonElement>(id);
const canvas=$<HTMLCanvasElement>('view'),view=new View(canvas),worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
const effects=new EruptEffects();view.scene.add(effects.group);
// Compile the plume before the first gesture, while the initial land is loading.
effects.group.visible=true;view.gl.compile(view.scene,view.camera);effects.group.visible=false;
const ring=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf7e4be,depthTest:false,transparent:true,opacity:.9}));
ring.renderOrder=8;ring.visible=false;view.scene.add(ring);
const arrow=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffb16f,depthTest:false}));arrow.visible=false;view.scene.add(arrow);
let canReroll=false;
let mode:Settings['mode']='vent',busy=true,active=false,settling=false,epoch=0,hover:number|null=null,drag:Intent|null=null;
interface History {before:ViewState;after:ViewState;op:EruptOperation|null;bundle:unknown}
let pendingBefore:ViewState|null=null,history:History[]=[],redo:History[]=[];
let queuedReady=false,queuedFinish:any=null,animStart:number|null=null,eruptionAnatomy:Anatomy|null=null,finishSent=false,lastOperation:EruptOperation|null=null,savedRun:unknown=null;
let pulse=0,pulseAt=0,morphAt=0,coolAt:number|null=null;let personality=crypto.getRandomValues(new Uint32Array(1))[0];
let lastSeed=0,lastWorkMs=0,frameSamples:number[]=[],lastFPS=0;
interface Batch{chunks:Chunk[];lighting:Lighting|null;frame:any;transition:boolean;begun:boolean;captureBefore?:boolean}
let batches:Batch[]=[],incoming:Batch|null=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let wasReduced=reduced.matches;
input('motion').checked=!reduced.matches;
const motion=()=>!reduced.matches&&input('motion').checked;
function notice(text:string,invalid=false){$('notice').textContent=text;$('notice').parentElement!.classList.toggle('invalid',invalid);}
function stateControls(){
  const locked=active||busy||batches.length>0;
  for(const id of ['map','reset','vent','fissure','power','shape','summit','flows','ridges','replay-file'])($<HTMLInputElement>(id)).disabled=locked;
  button('reroll').disabled=locked||!history.length||!canReroll;
  button('undo').disabled=!active&&(busy||!history.length);button('redo').disabled=locked||!redo.length;
  for(const id of ['motion','shake','follow'])input(id).disabled=reduced.matches;
}
function collect(){view.collect([...history.flatMap(h=>[h.before,h.after]),...redo.flatMap(h=>[h.before,h.after]),...(pendingBefore?[pendingBefore]:[])]);}
function restoreSaved(){const h=history.at(-1);lastOperation=h?.op??null;savedRun=h?.bundle??null;button('save-run').disabled=!savedRun;}
function clearEffects(){animStart=null;coolAt=null;effects.update(0,false);view.heat(-1,0);}
function send(msg:Record<string,unknown>){busy=true;worker.postMessage(msg);stateControls();}

function settings():Settings{return {...DEFAULTS,mode,power:Number(input('power').value),seed:personality,
  shape:$<HTMLSelectElement>('shape').value as Settings['shape'],summit:$<HTMLSelectElement>('summit').value as Settings['summit'],
  flows:$<HTMLSelectElement>('flows').value as Settings['flows'],ridges:input('ridges').checked};}
function labels(){const p=Number(input('power').value);$('power-label').textContent=p+' · '+(p<25?'Hill':p<75?'Volcano':'Supervolcano');stateControls();preview();}
function showSettings(s:Settings){mode=s.mode;input('power').value=String(s.power);personality=s.seed;
  $<HTMLSelectElement>('shape').value=s.shape;$<HTMLSelectElement>('summit').value=s.summit;$<HTMLSelectElement>('flows').value=s.flows;input('ridges').checked=s.ridges;modeLabels();labels();}
function modeLabels(){button('vent').setAttribute('aria-pressed',String(mode==='vent'));button('fissure').setAttribute('aria-pressed',String(mode==='fissure'));$('gesture').textContent=mode==='vent'?'Click the land. Raise a volcano.':'Draw a line. Let it bend.';}
function begin(intent:Intent,reroll=false){
  if(active||busy||batches.length)return;
  pendingBefore=view.capture();active=true;finishSent=false;clearEffects();queuedReady=false;ring.visible=arrow.visible=false;
  pulse=0;pulseAt=performance.now();
  if(!reroll){personality=(personality+1)>>>0;try{eruptionAnatomy=anatomy({W:view.W,H:view.H,heights:view.heights},settings(),intent);view.setHeat(effects.set(eruptionAnatomy,view.heights,view.W,settings()));animStart=performance.now();}catch{}}
  notice(reroll?'Trying another personality…':'The ground stirs…');
  send(reroll?{type:'reroll'}:{type:'start',settings:settings(),intent});drag=null;
}
function cancel(){
  if(!active)return;
  epoch++;batches=[];incoming=null;queuedFinish=null;queuedReady=false;animStart=null;finishSent=false;active=false;settling=false;
  if(pendingBefore)view.restore(pendingBefore);pendingBefore=null;view.activeMorph=0;clearEffects();collect();
  restoreSaved();worker.postMessage({type:'cancel'});busy=true;notice('Whole eruption reverted.');stateControls();
}
function undoEruption(){
  if(active){cancel();return;}if(busy||!history.length)return;
  clearEffects();const entry=history.pop()!;redo.push(entry);view.restore(entry.before);restoreSaved();send({type:'undo'});notice('Eruption undone.');collect();
}
function redoEruption(){if(active||busy||!redo.length)return;clearEffects();const entry=redo.pop()!;history.push(entry);view.restore(entry.after);restoreSaved();send({type:'redo'});notice('Exact result restored.');collect();}
worker.onmessage=(event:MessageEvent)=>{
  const m=event.data;if(m.epoch<epoch)return;epoch=m.epoch;
  switch(m.type){
    case 'reset':
      history=[];redo=[];batches=[];incoming=null;view.reset(m.W,m.H,m.rockLayers);hover=Math.floor(m.H/2)*m.W+Math.floor(m.W/2);
      $('dimensions').textContent=m.W+' × '+m.H;collect();break;
    case 'batch':incoming={chunks:[],lighting:null,frame:null,transition:m.transition,begun:false};batches.push(incoming);break;
    case 'chunk':incoming?.chunks.push(m.chunk);break;
    case 'lighting':if(incoming)incoming.lighting=m;break;
    case 'frame':if(incoming)incoming.frame=m;break;
    case 'started':active=true;showSettings(m.settings);lastSeed=m.settings.seed;$('seed-label').textContent='Personality '+lastSeed;
      eruptionAnatomy=m.anatomy;view.setHeat(effects.set(m.anatomy,view.heights,view.W,m.settings));animStart??=performance.now();settling=false;break;
    case 'impactReady':queuedReady=true;eruptionAnatomy=m.anatomy;
      $('metrics').textContent=m.stats.raised.toLocaleString()+' levels raised';break;
    case 'settling':settling=true;notice('Water finding its level…');break;
    case 'status':notice(m.text);break;
    case 'cancelled':
      if(pendingBefore)view.restore(pendingBefore);pendingBefore=null;batches=[];incoming=null;queuedReady=false;queuedFinish=null;
      active=false;settling=false;clearEffects();restoreSaved();collect();notice('Whole eruption reverted.');break;
    case 'operation':lastOperation=m.op;savedRun={format:1,base:m.base,eruptionBase:m.eruptionBase,operation:m.op};button('save-run').disabled=false;break;
    case 'finished':queuedFinish=m;break;
    case 'replayBase':if(incoming)incoming.captureBefore=true;break;
    case 'ready':busy=false;lastWorkMs=m.workMs??0;stateControls();break;
    case 'error':
      if(pendingBefore){view.restore(pendingBefore);pendingBefore=null;}active=false;animStart=null;queuedReady=false;notice(m.text,true);stateControls();break;
  }
};
worker.onerror=e=>{if(active)cancel();busy=false;notice('Worker error: '+e.message,true);stateControls();};
const select=$<HTMLSelectElement>('map');
for(const[id,name]of MAPS){const option=document.createElement('option');option.value=id;option.textContent=name;select.add(option);}
select.value='fixture:plain:128';
function load(){
  if(active)return;clearEffects();history=[];redo=[];savedRun=null;lastOperation=null;pendingBefore=null;button('save-run').disabled=true;ring.visible=arrow.visible=false;
  $('metrics').textContent='';$('seed-label').textContent='Personality 0';send({type:'load',id:select.value});
}
select.onchange=load;button('reset').onclick=load;
for(const value of ['vent','fissure'] as const)button(value).onclick=()=>{mode=value;drag=null;modeLabels();preview();};
input('power').oninput=labels;
for(const id of ['shape','summit','flows','ridges'])$(id).onchange=preview;
button('reroll').onclick=()=>begin({origin:0},true);button('undo').onclick=undoEruption;button('redo').onclick=redoEruption;
button('home').onclick=()=>{view.resetView();button('top').textContent='Top-down';};
button('top').onclick=()=>{view.topView();button('top').textContent=view.top?'Orbit':'Top-down';};

function preview(){
  if(hover===null||!view.W||active||busy){ring.visible=false;return;}
  const origin=drag?.origin??hover,s=settings(),x=origin%view.W,y=Math.floor(origin/view.W),radius=ventRadius(s),points:THREE.Vector3[]=[];
  for(let k=0;k<96;k++){const t=k*Math.PI/48,xx=x+.5+Math.cos(t)*radius,yy=y+.5+Math.sin(t)*radius,ix=Math.max(0,Math.min(view.W-1,Math.floor(xx))),iy=Math.max(0,Math.min(view.H-1,Math.floor(yy)));points.push(new THREE.Vector3(xx,view.heights[iy*view.W+ix]+.25,-yy));}
  ring.geometry.dispose();ring.geometry=new THREE.BufferGeometry().setFromPoints(points);ring.visible=true;
  let blocked=!!view.keep[origin];
  if(drag?.path?.length){for(let k=1;k<drag.path.length;k++){const a=drag.path[k-1],b=drag.path[k],n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y));for(let j=0;j<=n;j++){const t=n?j/n:0;blocked ||= !!view.keep[Math.round(a.y+(b.y-a.y)*t)*view.W+Math.round(a.x+(b.x-a.x)*t)];}}}
  ring.material.color.set(blocked?0xee655d:0xffd398);arrow.material.color.copy(ring.material.color);
  if(blocked)notice('Start here',true);else notice(drag?'Release to raise the ridge.':mode==='vent'?'Click the land. Raise a volcano.':'Draw a line. Let it bend.');
  arrow.visible=!!drag;arrow.geometry.dispose();arrow.geometry=new THREE.BufferGeometry().setFromPoints((drag?.path??[]).map(p=>new THREE.Vector3(p.x+.5,view.heights[Math.round(p.y)*view.W+Math.round(p.x)]+.4,-p.y-.5)));
}
function tileAt(e:PointerEvent){const hit=view.hit(e.clientX,e.clientY);return hit?hit.y*view.W+hit.x:null;}
function append(tile:number){if(!drag)return;const p={x:tile%view.W,y:Math.floor(tile/view.W)},last=drag.path!.at(-1)!;if(Math.hypot(p.x-last.x,p.y-last.y)>=2&&drag.path!.length<512)drag.path!.push(p);}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||active||busy||batches.length)return;hover=tileAt(e);if(hover===null)return;
  canvas.focus({preventScroll:true});if(view.keep[hover]){notice('Start here',true);return;}
  if(mode==='vent'){begin({origin:hover});return;}canvas.setPointerCapture(e.pointerId);drag={origin:hover,path:[{x:hover%view.W,y:Math.floor(hover/view.W)}]};preview();
});
canvas.addEventListener('pointermove',e=>{if(active||busy||batches.length)return;const tile=tileAt(e);if(tile!==null){hover=tile;append(tile);preview();}});
canvas.addEventListener('pointerup',e=>{if(e.button!==0||!drag)return;const tile=tileAt(e);if(tile!==null)append(tile);const intent=drag;drag=null;arrow.visible=false;if((intent.path?.length??0)<2){notice('Draw a longer fissure');return;}begin(intent);});
canvas.addEventListener('pointercancel',()=>{drag=null;arrow.visible=false;});
canvas.addEventListener('pointerleave',()=>{if(!drag){ring.visible=false;arrow.visible=false;}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const keys=new Set<string>();
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();if(active)cancel();else if(drag){drag=null;arrow.visible=false;preview();}else undoEruption();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoEruption();else undoEruption();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoEruption();return;}
  if(/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;
  if(e.target===canvas&&e.key==='Enter'&&hover!==null){e.preventDefault();if(mode==='vent')begin({origin:hover});else if(drag)begin(drag);else{drag={origin:hover,path:[{x:hover%view.W,y:Math.floor(hover/view.W)}]};preview();}return;}
  if(e.target===canvas&&e.key.startsWith('Arrow')&&hover!==null){
    e.preventDefault();let x=hover%view.W,y=Math.floor(hover/view.W);x+=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;y+=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;
    hover=Math.max(0,Math.min(view.H-1,y))*view.W+Math.max(0,Math.min(view.W-1,x));if(drag)append(hover);preview();return;
  }
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();drag=null;});
function syncMotion(){wasReduced=reduced.matches;if(wasReduced){input('motion').checked=false;input('shake').checked=false;input('follow').checked=false;}stateControls();}
reduced.addEventListener('change',syncMotion);
button('save-run').onclick=()=>{
  if(!savedRun)return;const text=JSON.stringify(savedRun,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v);
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download='erupt-run.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
input('replay-file').onchange=async()=>{
  const f=input('replay-file').files?.[0];if(!f||active||busy)return;if(f.size>48*1024*1024){notice('Saved eruption is too large',true);return;}
  try{clearEffects();send({type:'replay',bundle:JSON.parse(await f.text())});}catch{notice('Could not read this eruption',true);}
};
let prior=performance.now(),fpsAt=prior,frames=0,timings:number[]=[];
function animate(t:number){
  if(wasReduced!==reduced.matches)syncMotion();
  requestAnimationFrame(animate);const ms=t-prior,dt=Math.min(.05,ms/1000);prior=t;frames++;timings.push(ms);frameSamples.push(ms);if(frameSamples.length>4096)frameSamples.shift();
  const batch=batches[0];
  if(batch){
    if(!batch.begun){view.begin(batch.transition);batch.begun=true;}
    const start=performance.now();let n=0;while(batch.chunks.length&&n<2&&performance.now()-start<3){view.upload(batch.chunks.shift()!);n++;}
    if(!batch.chunks.length&&batch.frame){view.commit(batch.frame.heights,batch.frame.protected,batch.lighting);canReroll=batch.frame.canReroll;if(batch.transition)morphAt=t;if(batch.captureBefore)pendingBefore=view.capture();batches.shift();stateControls();collect();if(!active&&!batches.length&&$('notice').textContent==='Loading land…')preview();}
  }
  if(queuedReady&&!batches.length){queuedReady=false;animStart??=t;notice('The land is changing. Esc to revert.');}
  const age=animStart===null?2:(t-animStart)/1000;
  view.progress=motion()?Math.min(1,Math.max(0,(t-morphAt)/220)):1;
  if(active&&animStart!==null&&!finishSent){

    if(motion()&&input('follow').checked&&eruptionAnatomy){const a=eruptionAnatomy,delta=new THREE.Vector3(a.x,a.datum,-a.y).sub(view.controls.target).multiplyScalar(1-Math.exp(-dt*1.4));view.controls.target.add(delta);view.camera.position.add(delta);}
    if(!busy&&!queuedReady&&!batches.length&&view.progress>=1&&t-pulseAt>220){
      if(pulse<8){pulse++;pulseAt=t;send({type:'advance',progress:motion()?pulse/8:1});if(!motion())pulse=8;}
      else {finishSent=true;coolAt=t;view.progress=1;send({type:'finish'});}
    }
  }

  if(queuedFinish&&!batches.length){
    lastSeed=queuedFinish.seed??lastSeed;$('seed-label').textContent='Personality '+lastSeed;
    if(pendingBefore){history.push({before:pendingBefore,after:view.capture(),op:lastOperation,bundle:savedRun});if(history.length>16)history.shift();redo=[];}
    canReroll=queuedFinish.canReroll??true;pendingBefore=null;active=false;settling=false;view.activeMorph=0;personality=(lastSeed+1)>>>0;collect();
    notice(queuedFinish.settled?(lastOperation?.op==='carveStudyResult'?'Carve follows the softer ground.':'A new volcano. One undo step.'):'Land kept · water reached the simulation limit.');
    queuedFinish=null;stateControls();
  }
  const pan=view.W*.3*dt*(keys.has('shift')?3:1),dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
  view.camera.position.x+=dx*pan;view.camera.position.z+=dz*pan;view.controls.target.x+=dx*pan;view.controls.target.z+=dz*pan;
  const turn=(keys.has('q')?1:0)-(keys.has('e')?1:0);if(turn){const offset=view.camera.position.clone().sub(view.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),turn*dt);view.camera.position.copy(view.controls.target).add(offset);}
  const cooling=coolAt===null?0:(t-coolAt)/1000,visible=motion()&&animStart!==null&&cooling<6.5;
  effects.update(age,visible,cooling,(x,y)=>view.surfaceAt(x,y));view.heat(visible?age:-1,cooling);
  if(cooling>=6.5)clearEffects();
  view.controls.enableDamping=motion();let shake=0;
  if(motion()&&input('shake').checked&&active&&age>.24&&age<.8)shake=Math.sin(age*95)*(.8-age)*.6;
  view.camera.position.x+=shake;view.camera.position.y+=shake*.5;view.render(t/1000,motion());view.camera.position.x-=shake;view.camera.position.y-=shake*.5;
  if(t-fpsAt>=1000){const sorted=timings.slice().sort((a,b)=>a-b);lastFPS=Math.round(frames*1000/(t-fpsAt));$('fps').textContent=lastFPS+' fps · p95 '+Math.round(sorted[Math.floor(sorted.length*.95)]??0)+' ms';frames=0;fpsAt=t;timings=[];}
}
Object.assign(window,{erupt:{
  get state(){return {W:view.W,H:view.H,busy,active,settling,queued:batches.length,mode,seed:lastSeed,undo:history.length,redo:redo.length,motion:motion(),fps:lastFPS,lastWorkMs,age:animStart===null?null:(performance.now()-animStart)/1000,cooling:coolAt===null?null:(performance.now()-coolAt)/1000,effects:effects.group.visible,morph:view.progress,frameMs:frameSamples.slice()};},
  get operation(){return lastOperation;},get saved(){return savedRun;},get heights(){return Array.from(view.heights);},heightAt:(x:number,y:number)=>view.heights[y*view.W+x],clearTimings:()=>{frameSamples=[];},
  carve:(intent:{origin:number;end:number})=>{if(active||busy)return;clearEffects();pendingBefore=view.capture();active=true;finishSent=true;send({type:'carve',intent});},
  setSettings:showSettings,erupt:(intent:Intent)=>begin(intent),load:(id:string)=>{select.value=id;load();},
  screen:(x:number,y:number)=>{const v=new THREE.Vector3(x+.5,view.heights[y*view.W+x]+.1,-y-.5).project(view.camera),r=canvas.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},
  get renderer(){return {calls:view.gl.info.render.calls,triangles:view.gl.info.render.triangles,geometries:view.gl.info.memory.geometries};}
}});
labels();requestAnimationFrame(animate);load();
