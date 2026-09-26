import './style.css';
import * as THREE from 'three';
import {View,type ViewState,type Lighting} from './view';
import {ForceEffects} from '../core/effects';
import {ForceInput} from '../core/input';
import {OPTIONS} from '../core/options';
import {DEFAULTS,type Verb,type ForceRequest} from '../verbs';
import {strokeReason} from '../core/objects';
import {MAPS} from './maps';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('view'),view=new View(canvas),effects=new ForceEffects(view);
const worker=new Worker(new URL('../worker.ts',import.meta.url),{type:'module'});
const input=new ForceInput(128,128),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const settings=structuredClone(DEFAULTS);
let verb:Verb='carve',busy=true,active=false,painting=false,settling=false,paused=false,epoch=0,index=0,lastVerb:Verb|null=null;
let action=0,pendingStop=false,deferred=false;const pendingStrokes:{id:number;request:ForceRequest}[]=[];
let before:ViewState|null=null,lighting:Lighting|null=null,event:any=null,drawing=false,pointerId=-1,stroke=0,begun=false,lastPaint=0,straight=false;
let lastPoint:{x:number;y:number}|null=null,frameTime=0,frames:number[]=[],automatic=0,water:Float64Array=new Float64Array();
let longTasks:number[]=[];new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});
const caches=new Map<number,ViewState>(),errors:string[]=[];
const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.1,6,64),new THREE.MeshBasicMaterial({color:0xfff1c7,depthTest:false}));
ring.rotation.x=Math.PI/2;ring.renderOrder=10;ring.visible=false;view.scene.add(ring);
const guide=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x394d3e,depthTest:false}));
guide.renderOrder=9;view.scene.add(guide);
const motion=()=>!reduced.matches&&$<HTMLInputElement>('motion').checked;
$<HTMLInputElement>('motion').checked=!reduced.matches;
const notice=(text:string)=>{$('notice').textContent=text;};
function controls(){
 for(const el of document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('#options input,#options select,#options button,#forces button,#map,#reset,#save,#open'))el.disabled=active||busy;
 $<HTMLButtonElement>('undo').disabled=!active&&!index;$<HTMLButtonElement>('redo').disabled=active||busy||!caches.has(index+1);
 $<HTMLButtonElement>('again').disabled=active||busy||!index||lastVerb!==verb;
 document.querySelector<HTMLElement>('.event-tools')!.style.display=active?'flex':'none';
 $('stop').style.display=verb==='carve'?'':'none';
}
function row(){
 $('options').replaceChildren();
 for(const o of OPTIONS[verb]){
  const label=document.createElement('label');label.append(o.label+' ');
  let el:HTMLInputElement|HTMLSelectElement;
  if(o.choices){
   el=document.createElement('select');for(const [value,text] of o.choices)el.add(new Option(text,value));el.value=String(o.key==='side'?input.side:(settings[verb] as any)[o.key]);
  }else{
   el=document.createElement('input');el.type=o.toggle?'checkbox':'range';
   if(o.toggle)el.checked=(settings[verb] as any)[o.key];else{el.min=String(o.min);el.max=String(o.max);el.step=String(o.step??1);el.value=String((settings[verb] as any)[o.key]??(verb==='carve'?9:50));}
  }
  el.id=o.key;el.setAttribute('aria-label',o.label);
  const out=document.createElement('output');if(!o.choices&&!o.toggle)out.textContent=(settings[verb] as any)[o.key]??'Auto';
  el.oninput=()=>{let v:any=el instanceof HTMLSelectElement?el.value:el.type==='checkbox'?el.checked:Number(el.value);if(v==='true'||v==='false')v=v==='true';if(o.key==='side')input.side=Number(v) as 1|-1;else (settings[verb] as any)[o.key]=v;out.textContent=String(v);if(o.auto)$<HTMLInputElement>(o.key+'-auto').checked=false;hint();};
  label.append(el,out);
  if(o.auto){const auto=document.createElement('input');auto.id=o.key+'-auto';auto.type='checkbox';auto.checked=(settings[verb] as any)[o.key]===null;auto.setAttribute('aria-label',o.label+' automatic');auto.onchange=()=>{(settings[verb] as any)[o.key]=auto.checked?null:Number(el.value);out.textContent=auto.checked?'Auto':el.value;};label.append(auto,' Auto');}
  $('options').append(label);
 }
 const seed=document.createElement('label');seed.textContent='Seed ';
 const number=document.createElement('input');number.id='seed';number.type='number';number.min='0';number.max='4294967295';number.value=String(settings[verb].seed??0);
 number.onchange=()=>{const n=Number(number.value);if(Number.isInteger(n)&&n>=0&&n<=0xffffffff)settings[verb].seed=n;else number.value=String(settings[verb].seed??0);};seed.append(number);$('options').append(seed);
 const again=document.createElement('button');again.id='again';again.textContent=verb==='carve'?'Try another path':'Try another';again.onclick=()=>begin({type:'reroll'});$('options').append(again);
 document.querySelectorAll<HTMLButtonElement>('[data-verb]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.verb===verb)));hint();controls();
}
function hint(){
 const mode=settings[verb].mode;
 $('hint').textContent=(verb==='quake'?'Paint a fault · X flips the side':mode==='fissure'?'Paint a fissure':mode==='aim'?'Drag to aim':'Click to '+(verb==='carve'?'unleash':verb==='erupt'?'erupt':'strike'))+' · Shift-click a straight line · Esc reverts';
}
document.querySelectorAll<HTMLButtonElement>('[data-verb]').forEach(b=>b.onclick=()=>{verb=b.dataset.verb as Verb;input.cancel();row();});
const map=$<HTMLSelectElement>('map');for(const [id,title] of MAPS)map.add(new Option(title,id));
function send(m:any){busy=true;controls();worker.postMessage(m);}
function load(){before=null;caches.clear();index=0;lastVerb=null;active=painting=drawing=false;pendingStrokes.length=0;input.cancel();effects.clear();send({type:'load',id:map.value});}
map.onchange=load;$('reset').onclick=load;
function begin(m:any){action++;pendingStop=false;before=view.capture();active=true;settling=false;paused=false;effects.begin();clearTimeout(automatic);send({...m,action});}
function restore(){if(before)view.restore(before);effects.clear();guide.visible=false;ring.visible=false;}
function cancel(){clearTimeout(automatic);drawing=false;pendingStrokes.length=0;input.cancel();if(active){epoch++;restore();active=painting=false;send({type:'cancel',action});}else{guide.visible=false;ring.visible=false;}}
function undo(){effects.clear();clearTimeout(automatic);if(active){cancel();return;}if(index){const c=caches.get(index-1);if(c)view.restore(c);send({type:'undo'});}}
$('cancel').onclick=cancel;$('undo').onclick=undo;
$('redo').onclick=()=>{effects.clear();const c=caches.get(index+1);if(c)view.restore(c);send({type:'redo'});};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';if(!paused)pump();};
$('stop').onclick=()=>{clearTimeout(automatic);if(busy)pendingStop=true;else send({type:'finish'});};
$('top').onclick=()=>view.topView();$('reset-view').onclick=()=>view.resetView();
$('save').onclick=()=>send({type:'export'});
$<HTMLInputElement>('open').onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)try{send({type:'import',project:JSON.parse(await file.text())});}catch{notice('Could not read this study');}};
function pump(){clearTimeout(automatic);if(active&&!painting&&!busy&&!paused&&!settling)automatic=window.setTimeout(()=>send({type:'advance'}),verb==='carve'?70:90);}
worker.onmessage=({data:m})=>{
 if(m.epoch<epoch)return;epoch=m.epoch;
 if(m.type==='reset'){effects.clear();view.reset(m.W,m.H,m.layers);input.W=m.W;input.H=m.H;lighting=null;}
 if(m.type==='batch')view.begin(m.transition);
 if(m.type==='chunk')view.upload(m.chunk);
 if(m.type==='lighting')lighting={tiles:m.tiles,light:m.light};
 if(m.type==='frame'){
  view.commit(m.heights,m.keep,lighting);water=m.water;index=m.undo;active=m.active;
  if(m.event){event=m.event;effects.set(event);}
  if(!active){caches.set(index,view.capture());for(const k of [...caches.keys()])if(k>index+m.redo)caches.delete(k);}
  view.collect([...caches.values(),...(before?[before]:[])]);
 }
 if(m.type==='started'){active=true;effects.begin();if(m.request){verb=m.request.verb;(settings as any)[verb]=m.request.settings;row();}notice(verb==='carve'?'Carving…':verb==='quake'?'Ground moving…':verb==='erupt'?'Erupting…':'Impact…');}
 if(m.type==='planned'){event=m.event;effects.set(event);}
 if(m.type==='settling'){settling=true;effects.finish();notice('Water finding its level…');}
 if(m.type==='status')notice(m.text);
 if(m.type==='cancelled'){active=painting=settling=false;restore();notice('Reverted');}
 if(m.type==='operation'){lastVerb=m.op.params.request.verb;before=null;}
 if(m.type==='finished'){active=painting=settling=false;notice(m.warning??(m.settled?'Land settled':'Water reached the simulation limit'));}
 if(m.type==='error'){errors.push(m.text);active=painting=settling=false;restore();notice(m.text);}
 if(m.type==='project'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(m.project)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forces-study.json';a.click();URL.revokeObjectURL(url);
 }
 if(m.type==='ready'){busy=false;active=m.active;controls();if(!active&&pendingStrokes.length){const next=pendingStrokes.shift()!;painting=true;begin({type:"brush-begin",id:next.id,request:next.request});worker.postMessage({type:"brush-end",id:next.id,request:next.request});}else if(pendingStop&&active){pendingStop=false;send({type:"finish"});}else pump();if(!active&&!errors.length&&index===0)notice('Choose a force. Make the land move.');}
};
worker.onerror=e=>{errors.push(e.message);notice(e.message);busy=active=false;controls();};
function point(e:PointerEvent){const hit=view.hit(e.clientX,e.clientY);return hit?{x:Math.max(0,Math.min(view.W-1,hit.x)),y:Math.max(0,Math.min(view.H-1,hit.y))}:null;}
function reason(r:ForceRequest){
 if(r.verb==='quake')return strokeReason(r.intent.path,view.keep,view.W,3.5);
 if(r.verb==='erupt'&&r.settings.mode==='fissure'&&r.intent.path)return strokeReason(r.intent.path,view.keep,view.W,2);
 const i=r.intent as {origin:number;end?:number},points=[i.origin,...(r.verb==='carve'&&i.end!==undefined?[i.end]:[])];
 return points.some(k=>view.keep[k])?'Start here':null;
}
function show(p:{x:number;y:number},r?:ForceRequest){
 const why=r?reason(r):strokeReason([p],view.keep,view.W);ring.visible=true;ring.position.set(p.x+.5,view.surfaceAt(p.x,p.y)+.25,-p.y-.5);
 ring.material.color.set(why?0xd8443f:0xffefbe);if(why)notice(why);
 if(input.brush){
  const points=input.brush.intent().path;guide.geometry.dispose();guide.geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x+.5,view.surfaceAt(p.x,p.y)+.3,-p.y-.5)));guide.visible=true;guide.material.color.set(why?0xd8443f:input.side===1?0x435538:0x7f663a);
 }
}
function paintRequest(r:ForceRequest,end=false){
 if(reason(r)){notice('Start here');if(begun)cancel();return;}
 if(!begun){begun=true;painting=true;begin({type:'brush-begin',id:stroke,request:r});}
 if(end)worker.postMessage({type:'brush-end',id:stroke,request:r});
 else if(performance.now()-lastPaint>60){lastPaint=performance.now();worker.postMessage({type:'brush-update',id:stroke,request:r});}
}
canvas.onpointerdown=e=>{
 if(e.button!==0||(busy||active)&&verb!=='quake'||!view.heights.length)return;deferred=busy||active;const p=point(e);if(!p)return;
 canvas.focus();canvas.setPointerCapture(e.pointerId);pointerId=e.pointerId;drawing=true;begun=false;stroke++;lastPoint=p;straight=e.shiftKey;
 input.begin(p,straight);show(p);
 if(verb==='quake'&&!straight&&!deferred)paintRequest(input.request(verb,settings[verb]));
};
canvas.onpointermove=e=>{
 const p=point(e);if(!p)return;lastPoint=p;
 if(drawing){
  if(straight){input.brush!.points.splice(1);input.brush!.aim(p);input.brush!.advance(0,true);}else input.move(p);
  const r=input.request(verb,settings[verb]);show(p,r);
  if(!straight&&!deferred&&(verb==='quake'||verb==='erupt'&&settings.erupt.mode==='fissure'&&input.brush!.points.length>4))paintRequest(r);
 }else show(p);
};
canvas.onpointerup=e=>{
 if(!drawing||e.pointerId!==pointerId)return;drawing=false;
 const p=point(e)??lastPoint;if(!p)return;const r=input.request(verb,settings[verb],p);
 if(reason(r)){notice('Start here');if(begun)cancel();input.end(p);return;}
 if(deferred){pendingStrokes.push({id:stroke,request:r});notice('Fault queued');}
 else if(begun)paintRequest(r,true);
 else if(verb==='quake') {painting=true;begin({type:'brush-begin',id:stroke,request:r});worker.postMessage({type:'brush-end',id:stroke,request:r});}
 else if(r.verb==='carve'&&r.settings.mode==='aim'&&r.intent.end===r.intent.origin){notice('Drag to aim, or Shift-click an end point');}
 else begin({type:'start',request:r});
 input.end(p);guide.visible=false;
};
canvas.onpointercancel=cancel;
window.addEventListener('keydown',e=>{
 const editing=/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName);
 if(e.key==='Escape'){e.preventDefault();cancel();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?$('redo').click():undo();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();return;}
 if(editing)return;
 if(e.key.toLowerCase()==='x'){input.flip();if(verb==='quake')$<HTMLSelectElement>('side').value=String(input.side);if(drawing&&verb==='quake'){const r=input.request(verb,settings[verb]);if(lastPoint)show(lastPoint,r);if(begun)worker.postMessage({type:'brush-update',id:stroke,request:r});}}
 if(e.code==='Space'&&active){e.preventDefault();$('pause').click();}
 if(['1','2','3','4'].includes(e.key)&&!active&&!busy){verb=(['carve','craterize','quake','erupt'] as Verb[])[Number(e.key)-1];row();}
});
function animate(t:number){
 const dt=Math.min(.05,(t-frameTime)/1000||.016);if(frameTime)frames.push(t-frameTime);if(frames.length>600)frames.shift();frameTime=t;
 view.progress=motion()?Math.min(1,view.progress+dt*6):1;
 effects.update(dt,motion(),$<HTMLInputElement>('follow').checked,active&&!settling);
 view.penForce.value.set(0,0);
 if(drawing&&input.brush&&verb==='quake'&&motion()){
  const pts=input.brush.intent().path,p=pts.at(-1)!,a=pts.at(-2)??p,dx=p.x-a.x,dy=p.y-a.y,length=Math.hypot(dx,dy)||1;
  view.pen.value.set(p.x,p.y,dx/length,dy/length);view.penForce.value.set(input.side*(.6+settings.quake.power*.01),settings.quake.mode==='slide'?1:0);
 }
 const shake=motion()&&$<HTMLInputElement>('shake').checked&&active&&!settling?.09:0;
 view.render(t/1000,motion(),shake);
 requestAnimationFrame(animate);
}
(window as any).forces={
 get state(){return {verb,busy,active,painting,settling,index,epoch,errors:[...errors],motion:motion()};},
 get heights(){return Array.from(view.heights);},get water(){return Array.from(water);},get frames(){return [...frames];},get longTasks(){return [...longTasks];},resetFrames(){frames=[];longTasks=[];},
 screen(x:number,y:number){const r=canvas.getBoundingClientRect(),v=new THREE.Vector3(x+.5,view.surfaceAt(x,y),-y-.5).project(view.camera);return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},
 run(request:ForceRequest){verb=request.verb;(settings as any)[verb]=request.settings;row();begin({type:'start',request});},
 load(id:string){map.value=id;load();},view,worker
};
row();load();requestAnimationFrame(animate);
