import { View,type ViewState,type Lighting } from '../forces-core/demo/view';
import { Ice } from './effects';
import { Sound } from './audio';
import { MAPS } from './maps';
import { DEFAULTS,sizeOf,nextSeed,type Settings,type Request } from './model';
import type { ForceMap } from '../forces-core/core/map';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('land'),view=new View(canvas),ice=new Ice(),sound=new Sound();view.scene.add(ice.group,ice.ghost);
const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
let settings={...DEFAULTS},map:ForceMap|null=null,running=false,ready=false,epoch=0,minEpoch=0,light:Lighting|null=null,baseline:ViewState|null=null;
const past:ViewState[]=[],future:ViewState[]=[];let hovered=0,aim:number|null=null,lastPreview=0,previewId=0,motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let started=0,phaseTime=0,frames:number[]=[],longTasks:number[]=[],previousFrame=0,measure=false;
const evidence:any={errors:[],frames:[],longTasks:[],ready:false,finished:0,signature:'',planningMs:0,stage:0};
let gestureSeed=DEFAULTS.seed;
new PerformanceObserver(list=>{if(measure)for(const e of list.getEntries())longTasks.push(e.duration);}).observe({entryTypes:['longtask']});
const send=(a:any)=>worker.postMessage(a);
function status(s:string){$('status').textContent=s;}
function download(name:string,data:BlobPart,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
function sync(){($<HTMLSelectElement>('mode')).value=settings.mode;$<HTMLInputElement>('power').value=String(settings.power);$('power-value').textContent=String(settings.power);
 $<HTMLInputElement>('size').value=String(sizeOf(settings));$('size-value').textContent=String(sizeOf(settings));$('auto').setAttribute('aria-pressed',String(settings.size===null));$<HTMLInputElement>('meltwater').checked=settings.meltwater;}
function start(req?:Request,reroll=false){if(!ready||running)return;baseline=view.capture();ice.preview([]);running=true;ready=false;evidence.ready=false;measure=true;frames=[];longTasks=[];previousFrame=0;started=performance.now();phaseTime=0;evidence.inputTime=started;evidence.firstTerrainMs=null;evidence.advanceFrames=[];evidence.retreatFrames=[];
 evidence.stage=0;evidence.terrainFinalMs=null;evidence.retreatEndMs=null;$('phase').textContent='Ice gathering…';status('Esc or Undo brings everything back.');sound.warm();sound.begin();
 if(req){const i=req.intent.origin,x=i%view.W+.5,y=Math.floor(i/view.W)+.5;ice.set([{x,y,s:0,r:3,floor:0,outlet:0},{x:x+.7,y:y+.7,s:1,r:3,floor:0,outlet:0}],view.heights,view.W,true);}
 send({type:reroll?'reroll':'start',request:req});}
function cancel(){if(!map)return;sound.stop();ice.clear();measure=false;minEpoch=epoch+1;ready=false;evidence.ready=false;
 if(running&&baseline)view.restore(baseline);else if(past.length){future.push(view.capture());view.restore(past.pop()!);}baseline=null;running=false;send({type:'undo'});$('phase').textContent='Back to the land before';}
function load(id:string){ready=false;evidence.ready=false;running=false;sound.stop();ice.clear();past.length=0;future.length=0;$('loading').style.display='block';send({type:'load',id});}
worker.onmessage=({data:a})=>{
 if(a.epoch<minEpoch)return;epoch=a.epoch;
 if(a.type==='begin'){ready=false;evidence.ready=false;}
 if(a.type==='reset'){map=a.map;view.reset(a.map.W,a.map.H,a.map.rockLayers);view.camera.position.sub(view.controls.target).multiplyScalar(1.2).add(view.controls.target);past.length=0;future.length=0;}
 if(a.type==='batch')view.begin(false); // Explicitly disable the study renderer's unused morph machinery.
 if(a.type==='chunk')view.upload(a.chunk);
 if(a.type==='lighting')light=a.lighting;
 if(a.type==='frame'){view.commit(a.heights,a.keep,light);light=null;evidence.signature=a.signature;if(running&&evidence.firstTerrainMs===null)evidence.firstTerrainMs=performance.now()-evidence.inputTime;view.collect([...past,...future,...(baseline?[baseline]:[])]);}
 if(a.type==='preview'&&a.id===previewId&&!running){ice.preview(a.path,view.heights,view.W);if(a.shallow){$('pointer').textContent='No room to deepen here · widening and building moraines';$('pointer').style.display='block';}}
 if(a.type==='planned'){ice.set(a.path,a.baseHeights,view.W,a.lobe);started=performance.now();settings=a.settings;sync();status(a.notice||'Advance · the whole valley opens beneath the ice');evidence.plan=a;evidence.planningMs=a.planningMs;}
 if(a.type==='stage'){phaseTime=a.t;evidence.stage=a.t;if(a.t>=5&&evidence.retreatEndMs===null)evidence.retreatEndMs=performance.now()-evidence.inputTime;if(a.terrainFinal&&evidence.terrainFinalMs===null){evidence.terrainFinalMs=performance.now()-evidence.inputTime;evidence.terrainExact=view.heights.every((h,i)=>h===evidence.plan.finalHeights[i]);}$('phase').textContent=a.t<3?'Advance · ice taking the valley':'Retreat · the valley comes to light';if(a.t>=3)status('Dry terraces emerge beside the meltwater stream.');}
 if(a.type==='settling'){$('phase').textContent='Water finding its level…';ice.update(5);status('The final water is settling before the result is kept.');}
 if(a.type==='finished'){evidence.finished++;evidence.result=a;evidence.frames=frames;evidence.longTasks=longTasks;evidence.duration=performance.now()-(started-evidence.planningMs);measure=false;ice.clear();sound.stop();running=false;
  if(baseline)past.push(baseline);baseline=null;future.length=0;$('phase').textContent='A new valley';status(`${a.metrics.dryFloor.toLocaleString()} dry floor tiles · ${a.metrics.buildableGain>=0?'+':''}${a.metrics.buildableGain} buildable tiles · sediment ${a.metrics.ratio.toFixed(3)}${a.settled?'':' · water tick limit reached'}`);}
 if(a.type==='error'){evidence.errors.push(a.message);sound.stop();ice.clear();measure=false;running=false;if(baseline)view.restore(baseline);baseline=null;$('phase').textContent=a.message.replace(/^Error: /,'');status('Choose another head or a smaller glacier.');}
 if(a.type==='ready'){ready=true;evidence.ready=true;$('loading').style.display='none';}
 if(a.type==='project')download('glaciate-study.json',JSON.stringify(a.project));
 if(a.type==='timber')download('Glaciate.timber',a.bytes,'application/octet-stream');
 if(a.type==='snapshot'){map=a.map;evidence.map=a.map;}
};
for(const [id,label]of MAPS){const option=document.createElement('option');option.value=id;option.textContent=label;$('maps').append(option);}
$('maps').onchange=()=>load($<HTMLSelectElement>('maps').value);
$('mode').onchange=()=>{settings.mode=$<HTMLSelectElement>('mode').value as Settings['mode'];aim=null;sync();$('phase').textContent=settings.mode==='aim'?'Drag from head to end':'Click high ground to gather ice';};
$('power').oninput=()=>{settings.power=Number($<HTMLInputElement>('power').value);sync();};
$('size').oninput=()=>{settings.size=Number($<HTMLInputElement>('size').value);sync();};$('auto').onclick=()=>{settings.size=null;sync();};$('meltwater').onchange=()=>settings.meltwater=$<HTMLInputElement>('meltwater').checked;
$('undo').onclick=cancel;$('redo').onclick=()=>{if(running)return;const s=future.pop();if(s){past.push(view.capture());view.restore(s);}send({type:'redo'});};$('another').onclick=()=>start(undefined,true);
$('sound').onclick=()=>{sound.enabled=!sound.enabled;if(!sound.enabled)sound.stop();else sound.warm();$('sound').textContent=sound.enabled?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound.enabled));};
$('motion').onclick=()=>{motion=!motion;$('motion').textContent=motion?'Motion on':'Motion off';$('motion').setAttribute('aria-pressed',String(motion));};
$('top').onclick=()=>view.topView();$('reset').onclick=()=>view.resetView();$('save').onclick=()=>{if(!running)send({type:'export'});};$('open').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$<HTMLInputElement>('file').files?.[0];if(file&&!running){try{send({type:'import',project:JSON.parse(await file.text())});}catch{status('Invalid study file');}}};
$('export').onclick=()=>{if(!running)send({type:'timber'});};
canvas.addEventListener('pointermove',e=>{const hit=view.hit(e.clientX,e.clientY);if(!hit||running)return;const origin=hit.y*view.W+hit.x;hovered=origin;
 const tip=$('pointer');tip.style.left=e.offsetX+16+'px';tip.style.top=e.offsetY+20+'px';tip.style.display='none';
 if(view.keep[origin]){tip.textContent='Start here';tip.style.display='block';ice.preview([]);return;}
 if(performance.now()-lastPreview>90){lastPreview=performance.now();send({type:'preview',id:++previewId,settings,intent:aim===null?{origin}:{origin:aim,end:origin}});}});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||running||!ready)return;sound.warm();const hit=view.hit(e.clientX,e.clientY);if(!hit)return;const origin=hit.y*view.W+hit.x;
 if(settings.mode==='aim'){aim=origin;canvas.setPointerCapture(e.pointerId);}else{settings.seed=gestureSeed;gestureSeed=nextSeed(gestureSeed);start({verb:'glaciate',settings:{...settings},intent:{origin}});}});
canvas.addEventListener('pointerup',e=>{if(aim===null)return;const hit=view.hit(e.clientX,e.clientY),origin=aim;aim=null;if(hit){settings.seed=gestureSeed;gestureSeed=nextSeed(gestureSeed);start({verb:'glaciate',settings:{...settings},intent:{origin,end:hit.y*view.W+hit.x}});}});
canvas.addEventListener('pointerleave',()=>{if(aim===null&&!running)ice.preview([]);$('pointer').style.display='none';});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(running)cancel();else{aim=null;ice.preview([]);}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();cancel();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.stop();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{motion=!e.matches;});
function animate(now:number){if(measure&&previousFrame){const dt=now-previousFrame;frames.push(dt);if(phaseTime<3)evidence.advanceFrames.push(dt);else if(phaseTime<5)evidence.retreatFrames.push(dt);}previousFrame=now;
 if(running)ice.update(motion?(now-started)/1000:5);view.render(now/1000,motion);requestAnimationFrame(animate);}
requestAnimationFrame(animate);sync();setTimeout(()=>sound.init(),500);
// Local browser test seam: uses the same command path, geometry, shaders and controls as the demo.
(window as any).glaciate={evidence,view,load,start,cancel,send,settings:(s:Partial<Settings>)=>{settings={...settings,...s};sync();},snapshot:()=>send({type:'snapshot'}),
 show:(m:ForceMap)=>{ready=false;evidence.ready=false;send({type:'show',map:m});},project:(x:number,y:number)=>{const p=new (view.camera.position.constructor as any)(x+.5,view.surfaceAt(x,y),-y-.5).project(view.camera),r=canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}};
load('river-128');
