import './style.css';
import * as THREE from 'three';
import { View, type ViewState, type Lighting } from './view';
import { ImpactEffects } from './effects';
import { MAPS } from './maps';
import { DEFAULTS, anatomy, naturalSize, type Settings, type Intent, type Anatomy } from './engine';
import type { Chunk } from './meshes';
import type { CraterOperation } from './operation';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id),button=(id:string)=>$<HTMLButtonElement>(id);
const canvas=$<HTMLCanvasElement>('view'),view=new View(canvas),worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
const effects=new ImpactEffects();view.scene.add(effects.group);
// Compile the fixed effect pool during loading, before the first strike.
effects.group.visible=true;void view.gl.compileAsync(view.scene,view.camera).catch(()=>{});effects.group.visible=false;
const ring=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf7e4be,depthTest:false,transparent:true,opacity:.9}));
ring.renderOrder=8;ring.visible=false;view.scene.add(ring);
const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,0xffe5ad,2,1);arrow.visible=false;view.scene.add(arrow);
let mode:Settings['mode']='strike',busy=true,active=false,settling=false,epoch=0,hover:number|null=null,drag:Intent|null=null;
interface Cache extends ViewState {meta:{settings:Settings;operation:CraterOperation|null;saved:unknown}}
let pendingBefore:Cache|null=null,history:{before:Cache;after:Cache}[]=[],redo:{before:Cache;after:Cache}[]=[];
let queuedReady=false,queuedFinish:any=null,animStart:number|null=null,impactAnatomy:Anatomy|null=null,finishSent=false,lastOperation:CraterOperation|null=null,savedRun:unknown=null;
let lastSeed=0,lastWorkMs=0,frameSamples:number[]=[],lastFPS=0;
interface Batch{chunks:Chunk[];lighting:Lighting|null;frame:any;transition:boolean;begun:boolean}
let batches:Batch[]=[],incoming:Batch|null=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
input('motion').checked=!reduced.matches;
const motion=()=>!reduced.matches&&input('motion').checked;
let lastReduced=reduced.matches;
function syncMotion(){
  if(lastReduced===reduced.matches)return;
  lastReduced=reduced.matches;
  if(lastReduced){input('motion').checked=false;input('shake').checked=false;input('follow').checked=false;}
  stateControls();
}
function notice(text:string,invalid=false){$('notice').textContent=text;$('notice').parentElement!.classList.toggle('invalid',invalid);}
function stateControls(){
  const locked=active||busy||batches.length>0;
  for(const id of ['map','reset','strike','aim','power','auto-size','walls','centre','debris','rays','replay-file'])($<HTMLInputElement>(id)).disabled=locked;
  input('size').disabled=locked||input('auto-size').checked;
  button('reroll').disabled=locked||!history.length;
  button('undo').disabled=!active&&(busy||!history.length);button('redo').disabled=locked||!redo.length;
  for(const id of ['motion','shake','follow'])input(id).disabled=reduced.matches;
}
function collect(){view.collect([...history.flatMap(h=>[h.before,h.after]),...redo.flatMap(h=>[h.before,h.after]),...(pendingBefore?[pendingBefore]:[])]);}
function cache(empty=false):Cache{return {...view.capture(),meta:{settings:{...(empty?DEFAULTS:lastOperation?.params.settings??settings())},operation:empty?null:lastOperation,saved:empty?null:savedRun}};}
function restore(c:Cache){view.restore(c);lastOperation=c.meta.operation;savedRun=c.meta.saved;showSettings(c.meta.settings);button('save-run').disabled=!savedRun;}
function send(msg:Record<string,unknown>){busy=true;worker.postMessage(msg);stateControls();}
function settings():Settings{return {...DEFAULTS,mode,power:Number(input('power').value),size:input('auto-size').checked?null:Number(input('size').value),seed:lastSeed,
  walls:$<HTMLSelectElement>('walls').value as Settings['walls'],centre:$<HTMLSelectElement>('centre').value as Settings['centre'],
  debris:$<HTMLSelectElement>('debris').value as Settings['debris'],rays:input('rays').checked};}
function labels(){
  const p=Number(input('power').value),d=input('auto-size').checked?naturalSize(p):Number(input('size').value);
  $('power-label').textContent=p+' · '+(p<20?'Pebble':p<50?'Impact':p<80?'Cataclysm':'Extinction');
  $('size-label').textContent=d+' tiles';if(input('auto-size').checked)input('size').value=String(d);stateControls();preview();
}
function showSettings(s:Settings){
  lastSeed=s.seed;$('seed-label').textContent='Personality '+lastSeed;
  mode=s.mode;input('power').value=String(s.power);input('auto-size').checked=s.size===null;if(s.size!==null)input('size').value=String(s.size);
  $<HTMLSelectElement>('walls').value=s.walls;$<HTMLSelectElement>('centre').value=s.centre;$<HTMLSelectElement>('debris').value=s.debris;input('rays').checked=s.rays;
  modeLabels();labels();
}
function modeLabels(){button('strike').setAttribute('aria-pressed',String(mode==='strike'));button('aim').setAttribute('aria-pressed',String(mode==='aim'));
  $('gesture').textContent=mode==='strike'?'Click the land for a vertical impact.':'Drag from the impact, along its travel.';}
function begin(intent:Intent,reroll=false){
  if(active||busy||batches.length)return;
  pendingBefore=cache();active=true;finishSent=false;animStart=null;queuedReady=false;ring.visible=arrow.visible=false;
  notice(reroll?'Trying another personality…':'A moment from the sky…');
  send(reroll?{type:'reroll'}:{type:'start',settings:settings(),intent});drag=null;
}
function cancel(){
  if(!active)return;
  epoch++;batches=[];incoming=null;queuedFinish=null;queuedReady=false;animStart=null;finishSent=false;active=false;settling=false;
  if(pendingBefore)restore(pendingBefore);pendingBefore=null;view.activeMorph=0;effects.update(2,false);collect();
  worker.postMessage({type:'cancel'});busy=true;notice('Whole impact reverted.');stateControls();
}
function undoImpact(){
  if(active){cancel();return;}if(busy||!history.length)return;
  const entry=history.pop()!;redo.push(entry);restore(entry.before);send({type:'undo'});notice('Impact undone.');collect();
}
function redoImpact(){if(active||busy||!redo.length)return;const entry=redo.pop()!;history.push(entry);restore(entry.after);send({type:'redo'});notice('Exact result restored.');collect();}
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
      impactAnatomy=m.anatomy;effects.set(m.anatomy);settling=false;break;
    case 'impactReady':queuedReady=true;impactAnatomy=m.anatomy;
      $('metrics').textContent=m.stats.cut.toLocaleString()+' cut · '+m.stats.raised.toLocaleString()+' raised';break;
    case 'settling':settling=true;notice('Water finding its level…');break;
    case 'status':notice(m.text);break;
    case 'cancelled':
      if(pendingBefore)restore(pendingBefore);pendingBefore=null;batches=[];incoming=null;queuedReady=false;queuedFinish=null;
      active=false;settling=false;animStart=null;effects.update(2,false);collect();notice('Whole impact reverted.');break;
    case 'operation':lastOperation=m.op;savedRun={format:1,base:m.base,impactBase:m.impactBase,operation:m.op};
      if(!active)showSettings(m.op.params.settings);button('save-run').disabled=false;break;
    case 'finished':queuedFinish=m;break;
    case 'ready':busy=false;lastWorkMs=m.workMs??0;stateControls();break;
    case 'error':
      if(pendingBefore){restore(pendingBefore);pendingBefore=null;}active=false;animStart=null;queuedReady=false;notice(m.text,true);stateControls();break;
  }
};
worker.onerror=e=>{if(active)cancel();busy=false;notice('Worker error: '+e.message,true);stateControls();};
const select=$<HTMLSelectElement>('map');
for(const[id,name]of MAPS){const option=document.createElement('option');option.value=id;option.textContent=name;select.add(option);}
select.value='fixture:plain:128';
function load(){
  if(active)return;history=[];redo=[];savedRun=null;lastOperation=null;pendingBefore=null;button('save-run').disabled=true;ring.visible=arrow.visible=false;
  $('metrics').textContent='';lastSeed=0;$('seed-label').textContent='Personality 0';send({type:'load',id:select.value});
}
select.onchange=load;button('reset').onclick=load;
for(const value of ['strike','aim'] as const)button(value).onclick=()=>{mode=value;drag=null;modeLabels();preview();};
for(const id of ['power','size'])input(id).oninput=labels;input('auto-size').onchange=labels;
for(const id of ['walls','centre','debris','rays'])$(id).onchange=preview;
button('reroll').onclick=()=>begin({origin:0},true);button('undo').onclick=undoImpact;button('redo').onclick=redoImpact;
button('home').onclick=()=>{view.resetView();button('top').textContent='Top-down';};
button('top').onclick=()=>{view.topView();button('top').textContent=view.top?'Orbit':'Top-down';};
function preview(){
  if(hover===null||!view.W||active||busy){ring.visible=false;return;}
  const origin=drag?.origin??hover,s=settings(),intent={origin,end:drag?.end??hover};
  // Anatomy only needs terrain here; validation and protected ground are authoritative in the worker.
  const a=anatomy({W:view.W,H:view.H,heights:view.heights} as any,s,intent),points:THREE.Vector3[]=[];
  for(let k=0;k<128;k++){
    const t=k*Math.PI/64,u=Math.cos(t)*a.a,v=Math.sin(t)*a.b,x=a.x+.5+u*Math.cos(a.angle)-v*Math.sin(a.angle),y=a.y+.5+u*Math.sin(a.angle)+v*Math.cos(a.angle);
    const ix=Math.max(0,Math.min(view.W-1,Math.floor(x))),iy=Math.max(0,Math.min(view.H-1,Math.floor(y)));
    points.push(new THREE.Vector3(x,view.heights[iy*view.W+ix]+.24,-y));
  }
  ring.geometry.dispose();ring.geometry=new THREE.BufferGeometry().setFromPoints(points);ring.visible=true;
  const blocked=!!view.keep[origin];ring.material.color.set(blocked?0xee655d:0xffe5ad);
  if(blocked)notice('Start here',true);
  else if(drag)notice('Release to strike · '+Math.round(a.glance*100)+'% glancing');
  else notice(mode==='strike'?'Click the land. Leave a crater.':'Drag from the impact, along its travel.');
  arrow.visible=!!drag&&a.glance>.03;arrow.position.set(a.x+.5,view.heights[origin]+1,-a.y-.5);
  arrow.setDirection(new THREE.Vector3(Math.cos(a.angle),0,-Math.sin(a.angle)));arrow.setLength(Math.max(1,Math.hypot((intent.end!%view.W)-a.x,Math.floor(intent.end!/view.W)-a.y)),2,1);
}
function tileAt(e:PointerEvent){const hit=view.hit(e.clientX,e.clientY);return hit?hit.y*view.W+hit.x:null;}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||active||busy||batches.length)return;hover=tileAt(e);if(hover===null)return;
  canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);drag={origin:hover,end:hover};preview();
});
canvas.addEventListener('pointermove',e=>{
  if(active||busy||batches.length)return;const tile=tileAt(e);if(tile!==null){hover=tile;if(drag)drag.end=tile;preview();}
});
canvas.addEventListener('pointerup',e=>{
  if(e.button!==0||!drag)return;const intent=drag;drag=null;if(view.keep[intent.origin]){notice('Start here',true);preview();return;}
  if(mode==='strike')delete intent.end;begin(intent);
});
canvas.addEventListener('pointercancel',()=>{drag=null;arrow.visible=false;});
canvas.addEventListener('pointerleave',()=>{if(!drag){ring.visible=false;arrow.visible=false;}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const keys=new Set<string>();
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();if(active)cancel();else if(drag){drag=null;arrow.visible=false;preview();}else undoImpact();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoImpact();else undoImpact();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoImpact();return;}
  if(/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;
  if(e.target===canvas&&e.key==='Enter'&&hover!==null){e.preventDefault();if(mode==='strike')begin({origin:hover});else if(drag)begin(drag);else{drag={origin:hover,end:hover};preview();}return;}
  if(e.target===canvas&&e.key.startsWith('Arrow')&&hover!==null){
    e.preventDefault();let x=hover%view.W,y=Math.floor(hover/view.W);x+=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;y+=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;
    hover=Math.max(0,Math.min(view.H-1,y))*view.W+Math.max(0,Math.min(view.W-1,x));if(drag)drag.end=hover;preview();return;
  }
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();drag=null;});
reduced.addEventListener('change',syncMotion);
button('save-run').onclick=()=>{
  if(!savedRun)return;const text=JSON.stringify(savedRun,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v);
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download='craterize-impact.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
input('replay-file').onchange=async()=>{
  const f=input('replay-file').files?.[0];if(!f||active||busy)return;if(f.size>48*1024*1024){notice('Saved impact is too large',true);return;}
  busy=true;stateControls();notice('Reading saved impact…');
  try{send({type:'replay',bundle:JSON.parse(await f.text())});}catch{busy=false;stateControls();notice('Could not read this impact',true);}
};
let prior=performance.now(),fpsAt=prior,frames=0,timings:number[]=[];
function animate(t:number){
  syncMotion();
  requestAnimationFrame(animate);const ms=Math.max(0,t-prior),dt=Math.min(.05,ms/1000);prior=t;frames++;timings.push(ms);frameSamples.push(ms);if(frameSamples.length>600)frameSamples.shift();
  const batch=batches[0];
  if(batch){
    if(!batch.begun){view.begin(batch.transition);batch.begun=true;}
    const start=performance.now();let n=0;while(batch.chunks.length&&n<2&&performance.now()-start<3){view.upload(batch.chunks.shift()!);n++;}
    if(!batch.chunks.length&&batch.frame){view.commit(batch.frame.heights,batch.frame.protected,batch.lighting);if(batch.frame.captureBefore)pendingBefore=cache(true);batches.shift();stateControls();collect();if(!active&&!batches.length&&$('notice').textContent==='Loading land…')preview();}
  }
  if(queuedReady&&!batches.length){queuedReady=false;animStart=t;effects.set(impactAnatomy!);notice('The land is changing. Esc to revert.');}
  const age=animStart===null?2:(t-animStart)/1000;
  if(active&&animStart!==null&&!finishSent){
    view.progress=motion()?Math.min(1,Math.max(0,(age-.24)/1.35)):1;
    if(motion()&&input('follow').checked&&impactAnatomy){
      const a=impactAnatomy,delta=new THREE.Vector3(a.x,a.datum,-a.y).sub(view.controls.target).multiplyScalar(1-Math.exp(-dt*1.4));view.controls.target.add(delta);view.camera.position.add(delta);
    }
    if((!motion()||age>=1.65)&&!busy){finishSent=true;view.progress=1;send({type:'finish'});}
  }
  if(queuedFinish&&!batches.length){
    if(pendingBefore){history.push({before:pendingBefore,after:cache()});if(history.length>16)history.shift();redo=[];}
    pendingBefore=null;active=false;settling=false;animStart=null;view.activeMorph=0;collect();
    notice(queuedFinish.settled?'A new crater. One undo step.':'Crater kept · water reached the simulation limit.');
    queuedFinish=null;stateControls();
  }
  const pan=view.W*.3*dt*(keys.has('shift')?3:1),dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
  view.camera.position.x+=dx*pan;view.camera.position.z+=dz*pan;view.controls.target.x+=dx*pan;view.controls.target.z+=dz*pan;
  const turn=(keys.has('q')?1:0)-(keys.has('e')?1:0);if(turn){const offset=view.camera.position.clone().sub(view.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),turn*dt);view.camera.position.copy(view.controls.target).add(offset);}
  effects.update(age,motion()&&active&&!settling);
  view.controls.enableDamping=motion();let shake=0;
  if(motion()&&input('shake').checked&&active&&age>.24&&age<.8)shake=Math.sin(age*95)*(.8-age)*.6;
  view.camera.position.x+=shake;view.camera.position.y+=shake*.5;view.render(t/1000,motion());view.camera.position.x-=shake;view.camera.position.y-=shake*.5;
  if(t-fpsAt>=1000){const sorted=timings.slice().sort((a,b)=>a-b);lastFPS=Math.round(frames*1000/(t-fpsAt));$('fps').textContent=lastFPS+' fps · p95 '+Math.round(sorted[Math.floor(sorted.length*.95)]??0)+' ms';frames=0;fpsAt=t;timings=[];}
}
Object.assign(window,{craterize:{
  get state(){return {W:view.W,H:view.H,busy,active,settling,queued:batches.length,mode,seed:lastSeed,undo:history.length,redo:redo.length,motion:motion(),fps:lastFPS,lastWorkMs,age:animStart===null?null:(performance.now()-animStart)/1000,frameMs:frameSamples.slice()};},
  get operation(){return lastOperation;},get saved(){return savedRun;},get heights(){return Array.from(view.heights);},
  setSettings:showSettings,strike:(intent:Intent)=>begin(intent),load:(id:string)=>{select.value=id;load();},
  focus:(x:number,y:number,span:number)=>{view.controls.target.set(x,7,-y);view.camera.position.set(x+span*.72,7+span*.93,-y+span*.78);view.controls.update();},
  image:()=>view.gl.domElement.toDataURL('image/png'),
  screen:(x:number,y:number)=>{const v=new THREE.Vector3(x+.5,view.heights[y*view.W+x]+.1,-y-.5).project(view.camera),r=canvas.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},
  get renderer(){return {calls:view.gl.info.render.calls,triangles:view.gl.info.render.triangles,geometries:view.gl.info.memory.geometries};}
}});
labels();requestAnimationFrame(animate);load();
