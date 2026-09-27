import { View,type ViewState,type Lighting } from './view';
import { Ice } from './effects';
import { valleyView } from './camera';
import './mountain.css';
import { Sound } from './audio';
import { MAPS } from './maps';
import { DEFAULTS,sizeOf,nextSeed,type Settings,type Request } from './model';
import type { ForceMap } from '../forces-core/core/map';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('land'),view=new View(canvas),ice=new Ice(),sound=new Sound();view.scene.add(ice.group);
const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
let settings={...DEFAULTS},map:ForceMap|null=null,running=false,ready=false,epoch=0,minEpoch=0,light:Lighting|null=null,baseline:ViewState|null=null;
const past:ViewState[]=[],future:ViewState[]=[];let aim:number|null=null,down:{x:number;y:number}|null=null,dragged=false,motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.id='aim-arrow';arrow.innerHTML='<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#f6ffff" stroke-width="1"/></marker></defs><line stroke="#f6ffff" stroke-width="1.5" marker-end="url(#arrowhead)"/>';canvas.parentElement!.append(arrow);
const valleyButton=document.createElement('button');valleyButton.id='valley';valleyButton.textContent='Valley view';$('reset').before(valleyButton);valleyButton.onclick=()=>{if(evidence.plan?.path)valleyView(view,evidence.plan.path);};
const clearArrow=()=>{arrow.style.display='none';};clearArrow();
let started=0,phaseTime=0,frames:number[]=[],longTasks:number[]=[],previousFrame=0,measure=false;
const evidence:any={errors:[],frames:[],longTasks:[],ready:false,finished:0,signature:'',planningMs:0,stage:0};
let gestureSeed=DEFAULTS.seed;
new PerformanceObserver(list=>{if(measure)for(const e of list.getEntries())longTasks.push(e.duration);}).observe({entryTypes:['longtask']});
const send=(a:any)=>worker.postMessage(a);
function status(s:string){$('status').textContent=s;}
function download(name:string,data:BlobPart,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
function sync(){$<HTMLInputElement>('power').value=String(settings.power);$('power-value').textContent=String(settings.power);
 $<HTMLInputElement>('size').value=String(sizeOf(settings));$('size-value').textContent=String(sizeOf(settings));$('auto').setAttribute('aria-pressed',String(settings.size===null));$<HTMLInputElement>('meltwater').checked=settings.meltwater;}
function start(req?:Request,reroll=false){if(!ready||running)return;baseline=view.capture();clearArrow();$('pointer').style.display='none';running=true;ready=false;evidence.ready=false;measure=true;frames=[];longTasks=[];previousFrame=0;started=performance.now();phaseTime=0;evidence.inputTime=started;evidence.firstTerrainMs=null;evidence.advanceFrames=[];evidence.retreatFrames=[];
 evidence.stage=0;evidence.terrainFinalMs=null;evidence.retreatEndMs=null;$('phase').textContent='Ice gathering…';status('Esc or Undo brings everything back.');sound.warm();sound.begin();
 if(req){const i=req.intent.origin,x=i%view.W+.5,y=Math.floor(i/view.W)+.5;ice.set([{x,y,s:0,r:3,floor:0,outlet:0},{x:x+.7,y:y+.7,s:1,r:3,floor:0,outlet:0}],view.heights,view.W);}
 send({type:reroll?'reroll':'start',request:req});}
function cancel(){if(!map)return;sound.stop();ice.clear();measure=false;minEpoch=epoch+1;ready=false;evidence.ready=false;
 if(running&&baseline)view.restore(baseline);else if(past.length){future.push(view.capture());view.restore(past.pop()!);}baseline=null;running=false;send({type:'undo'});$('phase').textContent='Back to the land before';}
function load(id:string){ready=false;evidence.ready=false;evidence.plan=null;evidence.refusal=null;running=false;sound.stop();ice.clear();clearArrow();past.length=0;future.length=0;$<HTMLSelectElement>('maps').value=id;$('loading').style.display='block';send({type:'load',id});}
worker.onmessage=({data:a})=>{
 if(a.epoch<minEpoch)return;epoch=a.epoch;
 if(a.type==='begin'){ready=false;evidence.ready=false;}
 if(a.type==='reset'){map=a.map;view.reset(a.map.W,a.map.H,a.map.rockLayers);past.length=0;future.length=0;}
 if(a.type==='batch')view.begin(false); // Explicitly disable the study renderer's unused morph machinery.
 if(a.type==='chunk')view.upload(a.chunk);
 if(a.type==='lighting')light=a.lighting;
 if(a.type==='frame'){view.commit(a.heights,a.keep,light);light=null;evidence.signature=a.signature;if(running&&evidence.firstTerrainMs===null)evidence.firstTerrainMs=performance.now()-evidence.inputTime;view.collect([...past,...future,...(baseline?[baseline]:[])]);}
 if(a.type==='planned'){ice.set(a.path,a.baseHeights,view.W);started=performance.now();settings=a.settings;sync();status('Ice grinds through the mountains.');evidence.plan=a;evidence.planningMs=a.planningMs;}
 if(a.type==='stage'){phaseTime=a.t;evidence.stage=a.t;if(a.t>=5&&evidence.retreatEndMs===null)evidence.retreatEndMs=performance.now()-evidence.inputTime;if(a.terrainFinal&&evidence.terrainFinalMs===null){evidence.terrainFinalMs=performance.now()-evidence.inputTime;evidence.terrainExact=view.heights.every((h,i)=>h===evidence.plan.finalHeights[i]);}$('phase').textContent=a.t<3?'Advance · ice taking the valley':'Retreat · the valley comes to light';if(a.t>=3)status('Dry terraces emerge beside the meltwater stream.');}
 if(a.type==='settling'){$('phase').textContent='Water finding its level…';ice.update(5);status('The final water is settling before the result is kept.');}
 if(a.type==='finished'){evidence.finished++;evidence.result=a;evidence.frames=frames;evidence.longTasks=longTasks;evidence.duration=performance.now()-(started-evidence.planningMs);measure=false;ice.clear();sound.stop();running=false;
  if(baseline)past.push(baseline);baseline=null;future.length=0;$('phase').textContent='A valley through the mountains';status(`${a.metrics.dryFloor.toLocaleString()} dry floor tiles · ${a.metrics.waterfalls} waterfalls${a.settled?'':' · water still moving'}`);}
 if(a.type==='error'){const physical=a.message.includes('At the map floor');if(!physical)evidence.errors.push(a.message);evidence.refusal=a.message;sound.stop();ice.clear();measure=false;running=false;if(baseline)view.restore(baseline);baseline=null;if(physical){$('pointer').textContent='At the map floor: no ground left to carve';$('pointer').style.display='block';status('');}else{$('phase').textContent=a.message.replace(/^Error: /,'');status('');}}
 if(a.type==='ready'){ready=true;evidence.ready=true;$('loading').style.display='none';}
 if(a.type==='project')download('glaciate-study.json',JSON.stringify(a.project));
 if(a.type==='timber')download('Glaciate.timber',a.bytes,'application/octet-stream');
 if(a.type==='snapshot'){map=a.map;evidence.map=a.map;}
};
for(const [id,label]of MAPS){const option=document.createElement('option');option.value=id;option.textContent=label;$('maps').append(option);}
$('maps').onchange=()=>load($<HTMLSelectElement>('maps').value);
$('power').oninput=()=>{settings.power=Number($<HTMLInputElement>('power').value);sync();};
$('size').oninput=()=>{settings.size=Number($<HTMLInputElement>('size').value);sync();};$('auto').onclick=()=>{settings.size=null;sync();};$('meltwater').onchange=()=>settings.meltwater=$<HTMLInputElement>('meltwater').checked;
$('undo').onclick=cancel;$('redo').onclick=()=>{if(running)return;const s=future.pop();if(s){past.push(view.capture());view.restore(s);}send({type:'redo'});};$('another').onclick=()=>start(undefined,true);
$('sound').onclick=()=>{sound.enabled=!sound.enabled;if(!sound.enabled)sound.stop();else sound.warm();$('sound').textContent=sound.enabled?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound.enabled));};
$('motion').onclick=()=>{motion=!motion;$('motion').textContent=motion?'Motion on':'Motion off';$('motion').setAttribute('aria-pressed',String(motion));};
$('top').onclick=()=>view.topView();$('reset').onclick=()=>view.resetView();$('save').onclick=()=>{if(!running)send({type:'export'});};$('open').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$<HTMLInputElement>('file').files?.[0];if(file&&!running){try{send({type:'import',project:JSON.parse(await file.text())});}catch{status('Invalid study file');}}};
$('export').onclick=()=>{if(!running)send({type:'timber'});};
canvas.addEventListener('pointermove',e=>{const hit=view.hit(e.clientX,e.clientY);if(!hit||running)return;
 const tip=$('pointer');tip.style.left=e.offsetX+16+'px';tip.style.top=e.offsetY+20+'px';tip.style.display='none';
 if(aim!==null&&down){dragged||=Math.hypot(e.clientX-down.x,e.clientY-down.y)>6;if(!dragged)return;ice.clear();const x=aim%view.W,y=Math.floor(aim/view.W),p=new (view.camera.position.constructor as any)(x+.5,view.surfaceAt(x,y)+.2,-y-.5).project(view.camera),r=canvas.getBoundingClientRect(),line=arrow.querySelector('line')!;arrow.style.display='block';arrow.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);line.setAttribute('x1',String((p.x+1)*r.width/2));line.setAttribute('y1',String((1-p.y)*r.height/2));line.setAttribute('x2',String(e.clientX-r.left));line.setAttribute('y2',String(e.clientY-r.top));}});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||running||!ready)return;sound.warm();const hit=view.hit(e.clientX,e.clientY);if(!hit)return;const origin=hit.y*view.W+hit.x;
 aim=origin;down={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);const x=hit.x+.5,y=hit.y+.5;ice.set([{x,y,s:0,r:2,floor:0,outlet:0},{x:x+.7,y:y+.7,s:1,r:2,floor:0,outlet:0}],view.heights,view.W);ice.update(.2);});
canvas.addEventListener('pointerup',e=>{if(aim===null)return;const hit=view.hit(e.clientX,e.clientY),origin=aim,end=hit?hit.y*view.W+hit.x:origin,isAim=dragged&&end!==origin;aim=null;down=null;clearArrow();settings.mode=isAim?'aim':'flow';settings.seed=gestureSeed;gestureSeed=nextSeed(gestureSeed);start({verb:'glaciate',settings:{...settings},intent:{origin,...(isAim?{end}:{})}});});
canvas.addEventListener('pointerleave',()=>{$('pointer').style.display='none';});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(running)cancel();else{aim=null;down=null;clearArrow();ice.clear();}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();cancel();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.stop();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{motion=!e.matches;});
function animate(now:number){if(measure&&previousFrame){const dt=now-previousFrame;frames.push(dt);if(phaseTime<3)evidence.advanceFrames.push(dt);else if(phaseTime<5)evidence.retreatFrames.push(dt);}previousFrame=now;
 if(running)ice.update(motion?(now-started)/1000:5);view.render(now/1000,motion);requestAnimationFrame(animate);}
requestAnimationFrame(animate);sync();setTimeout(()=>sound.init(),500);
// Local browser test seam: uses the same command path, geometry, shaders and controls as the demo.
(window as any).glaciate={evidence,view,load,start,cancel,send,valley:(path:any)=>valleyView(view,path),settings:(s:Partial<Settings>)=>{settings={...settings,...s};sync();},snapshot:()=>send({type:'snapshot'}),
 show:(m:ForceMap)=>{ready=false;evidence.ready=false;evidence.plan=null;evidence.refusal=null;send({type:'show',map:m});},project:(x:number,y:number)=>{view.camera.updateMatrixWorld(true);const p=new (view.camera.position.constructor as any)(x+.5,view.surfaceAt(x,y),-y-.5).project(view.camera),r=canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}};
load('canyon-128');
