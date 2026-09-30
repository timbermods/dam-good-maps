import { MapRenderer } from '../../src/render3d/renderer';
import { FlowFlecks } from './flecks';
import { SurfaceMotion } from './surface';
import type { FlowMap } from './flow';
const $=(id:string)=>document.getElementById(id)!;
const select=(id:string)=>$(id) as HTMLSelectElement;
const toggle=$('toggle') as HTMLInputElement,canvas=$('mapCanvas') as HTMLCanvasElement;
const renderer=new MapRenderer(canvas);
renderer.setLookChoice('high',false);
// A demo-only bridge; adopt these hooks at the material/map lifecycle in production.
const bridge=renderer as any;
const surface=new SurfaceMotion(),flecks=new FlowFlecks(bridge.scene);
const media=matchMedia('(prefers-reduced-motion: reduce)');
let data:any,current:FlowMap,edited=false,revision=0,loading=false,loadId=0;
let frozen:number|null=null,surfaceTime=0,fleckTime=0,last=performance.now(),benchmark=false;
// Own the animation clock so there is one frame driver. Unrelated scenery stays at its
// reference time, making recordings repeatable. Native water side/fall shaders stay intact.
renderer.setClock(12.5);
const render=renderer.renderNow.bind(renderer);
renderer.renderNow=()=>{
  if(bridge.std?.water)surface.attach(bridge.std.water);
  if(bridge.high?.materials?.water)surface.attach(bridge.high.materials.water);
  surface.uniforms.currentTime.value=frozen===null?surfaceTime:frozen*(media.matches?.025:1);
  flecks.tick(frozen===null?fleckTime:media.matches?0:frozen,canvas.width,canvas.height,canvas.width/Math.max(1,canvas.clientWidth));
  render();
};
function frame(now:number){
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!document.hidden){surfaceTime+=dt*(media.matches?.025:1);if(!media.matches)fleckTime+=dt;if(!benchmark&&frozen===null)renderer.renderNow();}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function revive(raw: any): FlowMap {
  const v = structuredClone(raw);
  v.heights = Uint8Array.from(v.heights);
  v.columns.tiles = Int32Array.from(v.columns.tiles); v.columns.voxels = Uint8Array.from(v.columns.voxels);
  for (const key of ['tile', 'floor', 'depth', 'contamination']) v.water[key] = key === 'tile' ? Int32Array.from(v.water[key]) : Float32Array.from(v.water[key]);
  for (const key of ['template','owner']) v.entities[key] = Uint16Array.from(v.entities[key]);
  for (const key of ['x','y','z']) v.entities[key] = Int16Array.from(v.entities[key]);
  for (const key of ['flags','orientation','variant']) v.entities[key] = Uint8Array.from(v.entities[key]);
  v.entities.strength = Float32Array.from(v.entities.strength);
  v.soil.moisture = Uint8Array.from(v.soil.moisture); v.soil.contamination = Uint8Array.from(v.soil.contamination);
  if(v.flow) { v.flow.out=Float64Array.from(v.flow.out); v.flow.depth=Float64Array.from(v.flow.depth); }
  return v;
}

function status(){
  if(loading)return;
  $('status').textContent=`${select('map').selectedOptions[0].text} · ${renderer.look} · ${toggle.checked?`Flow on · ${flecks.count} flecks`:'surface motion'}${media.matches?' · reduced motion':''}${edited?' · edited water':''}`;
}
function applyMap(keepView=false){
  current=revive(edited?data.edited:data.original);
  // Commit the matching water and flow together, before the next animation frame.
  surface.setMap(current);flecks.setMap(current);renderer.setMap(current,keepView);revision++;
  $('edit').textContent=select('map').value==='wrongWay'?(edited?'Restore west source':'Move source east'):(edited?'Undo bed edit':'Edit riverbed');
  $('case').textContent=select('map').value==='wrongWay'?(edited?'SOURCE EAST · water now runs WEST':'SOURCE WEST · water runs EAST'):'';
  renderer.renderNow();status();
}
async function load(){
  const id=++loadId;loading=true;($('edit') as HTMLButtonElement).disabled=true;$('status').textContent='Loading settled water…';
  const response=await fetch(`./local/${select('map').value}.json`);
  if(!response.ok)throw Error('Run npm run generate first');
  const next=await response.json();if(id!==loadId)return;
  data=next;edited=false;loading=false;applyMap();($('edit') as HTMLButtonElement).disabled=false;
}
function close(){const {x,y}=data.edit;renderer.setView({target:[x+.5,current.heights[y*current.W+x]+1,-y-.5],distance:35,pitch:.95});renderer.renderNow();}
function fail(e:unknown){loading=false;$('status').textContent=String(e);console.error(e);}
select('map').onchange=()=>load().catch(fail);
select('look').onchange=()=>{renderer.setLookChoice(select('look').value as 'high'|'standard',false);renderer.renderNow();};
renderer.listenLook(()=>{renderer.renderNow();status();});
toggle.onchange=()=>{flecks.enabled=toggle.checked;renderer.renderNow();status();};
$('overview').onclick=()=>renderer.resetView();$('close').onclick=close;
$('edit').onclick=()=>{if(!loading){edited=!edited;applyMap(true);}};
media.addEventListener('change',status);
Object.assign(window,{flowDemo:{renderer,surface,flecks,get current(){return current;},get revision(){return revision;},get ready(){return !!data&&!loading;},get times(){return {surface:surfaceTime,flecks:fleckTime,reduced:media.matches};},
  freeze(t:number|null){frozen=t;renderer.renderNow();},close,
  async bench(both:boolean,ms=5000){benchmark=true;surface.enable(both);flecks.enabled=both;renderer.renderNow();await new Promise(r=>setTimeout(r,600));
    const result=await renderer.benchOrbit(ms);benchmark=false;return result;}
}});
window.addEventListener('pagehide',()=>{surface.dispose();flecks.dispose();renderer.dispose();},{once:true});
load().catch(fail);
