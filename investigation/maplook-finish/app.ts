import './style.css';
import { type Group, type InstancedMesh, type Camera } from 'three';
import { MapRenderer, type ViewState } from '../../src/render3d/renderer';
import { surfaceWater, type MapView, type SoilView, type WaterView } from '../../src/render3d/model';
import { CHANGES, NOT_ENDORSED, PROVIDER_NOTICES, ELEVATION_SOURCE, ELEVATION_SOURCE_URL } from '../../src/core/places/attribution';
import { THEMES, THEME_NAMES } from '../../src/core/spec/mapspec';
import { Effects, bridge } from './base-effects';
import { WaterFlow, surfaceContamination } from './flow';
import { badwaterBed } from './badwater-bed';
import { Lighting } from './lighting';
import { Terrain } from './terrain';
import { Post } from './post';
import { Forest, isPlant, vegetationMaterial } from './forest';
import { motion } from './wind';
import { DioramaEdge } from './edge';
import { WaterFinish } from './water-finish';
import { Landmarks } from './landmarks';
import type { MapRequest } from './maps.worker';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id), select=(id:string)=>$<HTMLSelectElement>(id);
const standard=new MapRenderer($<HTMLCanvasElement>('standard')), high=new MapRenderer($<HTMLCanvasElement>('high'));
const rs=[standard,high], b=bridge(high), base=new Effects(high);
base.water=base.shadows=base.sunlight=true;base.apply();
const flow=new WaterFlow(b.waterMat), bed=badwaterBed(b.terrainMat,b.waterMat);
const lighting=new Lighting(high,base), terrain=new Terrain(b.terrainMat), edge=new DioramaEdge(b.terrainMat,b.waterMat), post=new Post(high);
const vegMaterial=vegetationMaterial(b.objectMat); motion.vegSway.value=0;
const waterFinish=new WaterFinish(high,b.waterMat);
const landmarks=new Landmarks(b.objectMat);b.scene.add(landmarks.group);
let forest:Forest|undefined, map:MapView|undefined, baseMap:MapView|undefined, velocity=new Float32Array(2), currentKind='', label='', ready=false, worker:Worker|undefined, serial=0;
let clock=8, measuring=false, paused=false, low=false, syncing=false;
let objectIndex=0, activeWeather='normal';
const stageLabels=['The diorama edge','Water’s finishing touches','Objects & landmarks','Visible seasons'];
const effectLabels:Record<string,string>={geology:'Rock beds',soil:'Soil cap',section:'Water section',crown:'Continuous crown',landing:'Irregular landing',bubbles:'Bubbly froth',mist:'Mist',rings:'Splash rings',riverfoam:'River foam',landmarks:'Original models',objectdetail:'Fine detail',dry:'Dry soil & grass',heat:'Heat shimmer',sickly:'Badtide sky'};
Object.assign(effectLabels,{ruins:'Ruins',mine:'Mine site',relics:'Relics',start:'District centre',geothermal:'Geothermal',thorns:'Thorns',slopes:'Slopes',dams:'Natural dams',blocks:'Blockages',sources:'Sources'});
const stageKeys=[['geology','soil','section'],['crown','landing','bubbles','mist','rings','riverfoam'],['landmarks','objectdetail','ruins','mine','relics','start','geothermal','thorns','slopes','dams','blocks','sources'],['dry','heat','sickly']];
const foundationLabels:Record<string,string>={water:'Water (#38)',shadows:'Soft shadows',sunlight:'Warm sunlight',ao:'Ambient occlusion',tone:'Tone mapping',grade:'Colour grade',haze:'Haze',sky:'Sky',strata:'Cliff strata',blend:'Soil edges',variation:'Colour variation',vegetation:'Approved vegetation'};
const flags:Record<string,boolean>=Object.fromEntries([...Object.keys(effectLabels),...Object.keys(foundationLabels)].map(k=>[k,true]));
const stages=[true,true,true,true];
function checkbox(key:string,text:string,parent:HTMLElement,change:()=>void){
  const l=document.createElement('label');l.className='check';const c=document.createElement('input');c.type='checkbox';c.id=key;c.checked=true;c.onchange=change;l.append(c,text);parent.append(l);
}
stageLabels.forEach((text,i)=>{const box=document.createElement('div');box.className='stage';const title=document.createElement('div');title.className='stage-title';title.innerHTML='<span>0'+(i+1)+'</span>';checkbox('stage'+i,text,title,()=>{stages[i]=input('stage'+i).checked;apply();});box.append(title);const effects=document.createElement('div');effects.className='effects';for(const k of stageKeys[i])checkbox(k,effectLabels[k],effects,()=>{flags[k]=input(k).checked;apply();});box.append(effects);$('stages').append(box);});
for(const [k,v]of Object.entries(foundationLabels))checkbox(k,v,$('foundation'),()=>{flags[k]=input(k).checked;apply();});
const on=(stage:number,key:string)=>stages[stage]&&flags[key];
function apply(){
  base.water=flags.water;base.shadows=flags.shadows&&!low;base.sunlight=flags.sunlight;base.apply();bed.setEnabled(flags.water);
  lighting.ao.value=+flags.ao;lighting.haze.value=+flags.haze;lighting.sky.value=+flags.sky;lighting.unclamp.value=+(flags.tone||flags.grade);
  terrain.strata.value=+flags.strata;terrain.blend.value=+flags.blend;terrain.variation.value=+flags.variation;post.tone=flags.tone;post.grade=flags.grade;
  edge.geology.value=+on(0,'geology');edge.soil.value=+on(0,'soil');edge.water.value=+on(0,'section');
  waterFinish.crown.value=+on(1,'crown');waterFinish.landing.value=+on(1,'landing');waterFinish.bubbles.value=+on(1,'bubbles');waterFinish.river.value=+on(1,'riverfoam');
  waterFinish.mist=on(1,'mist');waterFinish.rings=on(1,'rings');waterFinish.low=low;waterFinish.apply();
  if(forest){forest.group.visible=flags.vegetation;forest.low=low;}
  const objects=(high as unknown as {objects:Group}).objects;
  if(objects)for(const child of objects.children){if(isPlant(child.name.split('.')[0]))child.visible=!flags.vegetation;}
  landmarks.apply(on(2,'landmarks'),on(2,'objectdetail')&&!low,flags);
  base.dirty=true;
  high.requestRender();
}
function setEffects(changes:Record<string,boolean>){for(const[k,v]of Object.entries(changes)){flags[k]=v;if(document.getElementById(k))input(k).checked=v;}apply();}
function setStages(values:boolean[]){values.forEach((v,i)=>{stages[i]=v;input('stage'+i).checked=v;});apply();}
let samples:number[]=[], frameCounts=[0,0], drawCounts=[0,0], triangles=[0,0], last=performance.now(), prev=last, adaptAt=last;
rs.forEach((r,i)=>{
 r.setClock(8);const br=bridge(r),draw=br.gl.render.bind(br.gl);br.gl.info.autoReset=false;
 br.gl.render=(scene,camera)=>{
   if(scene===br.scene){
     if((select('layout').value==='high'&&i===0)||(select('layout').value==='standard'&&i===1))return;
     if(i===1&&forest){const rev=forest.revision;forest.update(camera,r.canvas.clientHeight);if(rev!==forest.revision)base.dirty=true;}
     br.gl.info.reset();draw(scene,camera);frameCounts[i]++;drawCounts[i]=br.gl.info.render.calls;triangles[i]=br.gl.info.render.triangles;
   }else draw(scene,camera);
 };
});
function sync(other:MapRenderer,v:ViewState){if(syncing||measuring)return;syncing=true;other.setView(v);syncing=false;}
standard.onView=v=>sync(high,v);high.onView=v=>sync(standard,v);
function camera(v:Partial<ViewState>){rs.forEach(r=>r.setView(v));}
const options:Omit<MapRequest,'id'>[]=[];
function add(label:string,request:Omit<MapRequest,'id'>){select('map').add(new Option(label,String(options.length)));options.push(request);}
add('Waterfall study · settled gallery',{kind:'falls'});add('Landmarks · specimen garden',{kind:'objects'});
for(const theme of THEMES)for(const size of [128,256])add(THEME_NAMES[theme]+' · '+size+'²',{kind:'generated',theme,size});
for(const name of ['near-victoria-falls','near-yosemite-valley','near-danube-delta'])add(name.replaceAll('-',' '),{kind:'place',name});
const objectTypes=['RuinColumnH4','UndergroundRuins','SmallRelic','MediumRelic','LargeRelic','StartingLocation','GeothermalField','Thorns','Slope','NaturalDam','Blockage','WaterSource','BadwaterSource'];
objectTypes.forEach((s,i)=>select('object').add(new Option(s.replace('UndergroundRuins','Mine site').replace('StartingLocation','District centre'),String(i))));
let pendingReject:((e:Error)=>void)|undefined;
async function load(index=Number(select('map').value),seed=Number(input('seed').value),dense=input('dense').checked){
 pendingReject?.(Error('Load superseded'));worker?.terminate();ready=false;const id=++serial;currentKind=options[index].kind;select('map').value=String(index);input('seed').disabled=currentKind!=='generated';input('dense').disabled=currentKind!=='generated';
 $('status').textContent='Loading landscape in worker…';
 worker=new Worker(new URL('./maps.worker.ts',import.meta.url),{type:'module'});
 return new Promise<void>((resolve,reject)=>{pendingReject=reject;const fail=(e:string)=>{$('status').textContent=e;ready=false;reject(Error(e));};
 worker!.onerror=e=>fail(e.message);
 worker!.onmessage=({data})=>{
  if(data.id!==serial)return;
  if(data.progress){$('status').textContent=data.progress;return;}
  if(data.error){fail(data.error);return;}
  if(data.weather||data.restored||data.weatherDone){weatherMessage(data);return;}
  try {
    forest?.dispose();forest=undefined;landmarks.clear();map=data.view;baseMap=structuredClone(map);velocity=data.velocity;label=data.label;
    lighting.setMap(map!);flow.set(map!.W,map!.H,velocity,surfaceContamination(map!));
    rs.forEach(r=>r.setMap(map!));base.fit(map!.W,map!.H);
    forest=new Forest(map!.entities,data.growth,vegMaterial);b.scene.add(forest.group);
    landmarks.setMap(map!,(high as unknown as {objects:Group}).objects);
    waterFinish.setMap(map!,velocity);resetWeather();apply();setPose(currentKind==='objects'?'objects':currentKind==='falls'?'fall':'overview');
    ready=true;pendingReject=undefined;samples=[];adaptAt=performance.now();
    $('status').textContent=label+' · '+map!.entities.count.toLocaleString()+' objects';
    ['normal','drought','badtide'].forEach(k=>($<HTMLButtonElement>(k).disabled=['falls','objects'].includes(currentKind)));
    resolve();
  }catch(e){fail(String(e));}
 };
 worker!.postMessage({...options[index],id,seed,dense});
 });
}
function setPose(kind:string){
 if(!map)return;
 select('pose').value=kind;
 const {W,H,heights}=map,sw=surfaceWater(W,H,map.water);
 let v:Partial<ViewState>={mode:'orbit',target:[W/2,6,-H/2],distance:Math.max(W,H)*1.4,pitch:0.85,yaw:-0.55};
 if(kind==='objects'||kind==='object'||kind==='top'){
   if(currentKind==='objects'){const x=4+objectIndex*6,name=objectTypes[objectIndex],center:Record<string,number[]>={UndergroundRuins:[2,2],StartingLocation:[1,1],BadwaterSource:[1,1],GeothermalField:[1,1],SmallRelic:[.5,0],MediumRelic:[1,.5],LargeRelic:[1,1]},c=center[name]??[0,0];v={mode:kind==='top'?'top':'orbit',target:kind==='objects'?[42,4.5,-13]:[x+c[0]+.5,name.startsWith('Ruin')?6:name==='StartingLocation'?5.5:4.7,-12-c[1]-.5],distance:kind==='objects'?62:name==='UndergroundRuins'?10:name.startsWith('Ruin')||name==='StartingLocation'?8:6.7,pitch:0.58,yaw:-0.5};}
   else if(kind==='top')v.mode='top';
 }else if(kind==='edge'||kind==='badedge'){
   let best=-Infinity,point=[0,0,0],yaw=0;
   for(let side=0;side<4;side++){const length=side<2?H:W;for(let k=2;k<length-2;k++){const x=side===0?0:side===1?W-1:k,y=side===2?0:side===3?H-1:k,i=y*W+x;
     const score=(sw.depth[i]>0.001?10+sw.depth[i]*3:0)+heights[i]*0.12+(kind==='badedge'?sw.contamination[i]*100:0);
     if(score>best){best=score;point=[x+0.5,heights[i]*0.40,-y-0.5];yaw=[-Math.PI/2,Math.PI/2,0,Math.PI][side];}
   }}
   v={mode:'orbit',target:point as [number,number,number],distance:24,pitch:0.18,yaw:yaw+0.30};
 }else if(kind==='fall'||kind==='pool'){
   if(currentKind==='falls')v=kind==='fall'?{target:[5.5,8,-14.5],distance:25,pitch:0.28,yaw:-0.9}:{target:[25,2.6,-13.4],distance:9,pitch:0.52,yaw:-0.35};
   else{
     let best=-1;
     for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(sw.depth[i]<=0.001)continue;for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=(y+dy)*W+x+dx,drop=sw.surface[i]-sw.surface[j];if(sw.depth[j]>0.001&&drop>best){best=drop;v={target:[x+.5+dx,sw.surface[j]+drop*(kind==='pool'?.08:.43),-y-.5-dy],distance:kind==='pool'?10:Math.max(16,drop*2.3+8),pitch:kind==='pool'?.6:.40,yaw:Math.atan2(dx,-dy)-.4};}}}
   }
 }else if(kind==='river'){
   if(currentKind==='falls')v={target:[20,2.8,-11],distance:18,pitch:1.0,yaw:-.35};
   else{let best=-1;for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){const i=y*W+x;if(sw.depth[i]>.02&&sw.depth[i]<2){const speed=Math.hypot(velocity[i*2],velocity[i*2+1]);if(speed>best){best=speed;v={target:[x+.5,sw.surface[i],-y-.5],distance:23,pitch:1.0,yaw:-.3};}}}}
 }
 camera(v);
}
function resetWeather(){activeWeather='normal';$('weather-status').textContent="Map's stored water and moisture";input('day').value='0';['normal','drought','badtide'].forEach(k=>$(k).setAttribute('aria-pressed',String(k==='normal')));}
function weatherMessage(_data:unknown){}
$('load').onclick=()=>void load().catch(console.error);select('map').onchange=()=>void load().catch(console.error);
select('pose').onchange=()=>setPose(select('pose').value);select('object').onchange=()=>{objectIndex=Number(select('object').value);setPose('object');};
$('turn').onclick=()=>camera({yaw:standard.getView().yaw+Math.PI/2});
$('all').onclick=()=>{setStages(stages.some(Boolean)?[false,false,false,false]:[true,true,true,true]);$('all').textContent=stages.some(Boolean)?'Finish off':'Finish on';};
input('low').onchange=()=>{low=input('low').checked;b.gl.setPixelRatio(low?0.85:Math.min(devicePixelRatio,1.5));apply();};
select('layout').onchange=()=>{const v=select('layout').value;document.querySelectorAll('#comparison article').forEach((el,i)=>el.classList.toggle('hidden',v===(i?'standard':'high')));$('comparison').classList.toggle('single',v!=='both');samples=[];adaptAt=performance.now();};
function renderNow(r:MapRenderer){const x=r as unknown as {frame:number};if(x.frame)cancelAnimationFrame(x.frame);x.frame=0;r.renderNow();}
function freeze(t=8){input('pause').checked=true;clock=t;motion.vegTime.value=t;rs.forEach((r,i)=>{r.setClock(t);renderNow(r);renderNow(r);$(i?'high-fps':'standard-fps').textContent='Paused · '+drawCounts[i]+' draws';});}
function frame(now:number){
 const dt=now-prev;prev=now;paused=input('pause').checked||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(ready&&!paused&&!measuring){clock+=Math.min(dt,100)/1000;rs.forEach(r=>r.setClock(clock));motion.vegTime.value=clock;samples.push(dt);if(samples.length>600)samples.shift();}
 if(now-last>1000){rs.forEach((r,i)=>{$(i?'high-fps':'standard-fps').textContent=(paused?'Paused':(frameCounts[i]*1000/(now-last)).toFixed(0)+' fps')+' · '+drawCounts[i]+' draws';});frameCounts.fill(0);last=now;}
 if(ready&&!measuring&&!paused&&!low&&input('adaptive').checked&&select('layout').value==='high'&&now-adaptAt>6000&&samples.length>100){
   if(percentile(samples,.95)>21){input('low').checked=true;input('low').dispatchEvent(new Event('change'));$('status').textContent=label+' · lower-cost mode enabled after sustained frame-budget pressure';}samples=[];adaptAt=now;
 }
 requestAnimationFrame(frame);
}
const percentile=(a:number[],p:number)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]??0;
const nextFrame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
async function measure(mode='both',ms=1800){
 if(!ready||measuring)throw Error('Map not ready or benchmark active');
 measuring=true;const oldLayout=select('layout').value,view=standard.getView();select('layout').value=mode;
 let deltas:number[]=[],costs:number[]=[];const begin=await nextFrame();let prior=begin;
 try{while(true){const now=await nextFrame(),elapsed=now-begin;if(elapsed>ms+700)break;const v={...view,yaw:view.yaw+elapsed*.00015};camera(v);rs.forEach(r=>r.setClock(8+elapsed/1000));const t=performance.now();for(const r of mode==='high'?[high]:mode==='standard'?[standard]:rs){renderNow(r);bridge(r).gl.getContext().finish();}if(elapsed>700){deltas.push(now-prior);costs.push(performance.now()-t);}prior=now;}
 return {mode,frames:deltas.length,fps:1000/(deltas.reduce((a,b)=>a+b,0)/deltas.length),frameP95:percentile(deltas,.95),completedRenderP50:percentile(costs,.5),completedRenderP95:percentile(costs,.95),draws:[...drawCounts],triangles:[...triangles],size:[high.canvas.width,high.canvas.height],stages:[...stages],low};
 }finally{measuring=false;select('layout').value=oldLayout;camera(view);freeze();}
}
async function measureStages(){
 const previous=[...stages],results=[];input('adaptive').checked=false;
 try{setStages([false,false,false,false]);results.push({name:'foundation',...await measure('high')});for(let i=0;i<4;i++){setStages(stages.map((_,j)=>i===j));results.push({name:'stage '+(i+1),...await measure('high')});}setStages([true,true,true,true]);for(const m of ['standard','high','both'])results.push({name:'all',...await measure(m)});$('metrics').textContent=JSON.stringify(results,null,2);return results;}finally{setStages(previous);}
}
$('measure').onclick=()=>void measureStages().catch(e=>$('metrics').textContent=String(e));
$('capture').onclick=()=>{freeze();const c=document.createElement('canvas');c.width=standard.canvas.width+high.canvas.width;c.height=high.canvas.height+36;const ctx=c.getContext('2d')!;ctx.fillStyle='#f4f5ec';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#29382e';ctx.font='16px Segoe UI';ctx.fillText('Standard',12,24);ctx.fillText('High · finish proposal',standard.canvas.width+12,24);ctx.drawImage(standard.canvas,0,36);ctx.drawImage(high.canvas,standard.canvas.width,36);const a=document.createElement('a');a.href=c.toDataURL('image/jpeg',.9);a.download='maplook-finish.jpg';a.click();};
const source=document.createElement('a');source.href=ELEVATION_SOURCE_URL;source.textContent=ELEVATION_SOURCE;$('credits').append(source);
for(const text of [CHANGES,NOT_ENDORSED,...PROVIDER_NOTICES]){const p=document.createElement('p');p.textContent=text;$('credits').append(p);}
$('gpu').textContent=high.gpu().renderer+' · Three.js 0.186.0 · Standard renderer unchanged; full Standard forced on software WebGL';
const api={get ready(){return ready;},get map(){return map;},get label(){return label;},get stages(){return [...stages];},get flags(){return {...flags};},get options(){return options;},get gpu(){return high.gpu();},standard,high,load,setPose,camera,setEffects,setStages,freeze,measure,measureStages,get counts(){return {draws:drawCounts,triangles,vegetation:forest?.stats,ambient:lighting.stats,water:waterFinish.stats,landmarks:landmarks.stats};},selectObject(i:number,top=false){objectIndex=i;select('object').value=String(i);setPose(top?'top':'object');}};
(window as unknown as {finish:typeof api}).finish=api;
requestAnimationFrame(frame);void load(2).catch(console.error);
