import * as THREE from "three";
import { BlockDocument, cell, deeper, line, water, type Face, type Plan, type Stamp } from "../core/block";
import { makeCase, faces, type CaseId } from "../core/cases";
import type { MapJson } from "../../erode/core/map";
import type { CameraPose } from "../../erode/demo/view";
import { BlockView } from "./view";
import { Sound } from "./audio";

const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>("land"),view=new BlockView(canvas),sound=new Sound();
view.resize();
let doc:BlockDocument, id:CaseId="cliff",size=1,shift=false,preview:Plan|null=null,lastFace:Face|null=null;
let pointer={x:0,y:0},resize:{x:number,size:number}|null=null,orbit:{x:number,y:number,pan:boolean}|null=null;
let stroke:{face:Face,last:Face,mode:"add"|"remove",x:number,y:number,moved:boolean,next:number,blocked:boolean}|null=null;
let near:CameraPose, ready=false, lighting:number|undefined;
const keys=new Set<string>(),cache=new Map<string,MapJson>();
const fixtures={canyon:new URL("../../erode/maps/canyon.json.gz",import.meta.url).href,highlands:new URL("../../erode/maps/highlands.json.gz",import.meta.url).href};
const metrics={ghostMs:[] as number[],editMs:[] as number[],inputToRenderMs:[] as number[],nextFrameMs:[] as number[],renderMs:[] as number[]};
let pendingInput:number|undefined;

async function fixture(name:string) {
  if(!cache.has(name)) {
    const url=fixtures[name as keyof typeof fixtures];
    const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());
    // Vite serves .gz with Content-Encoding; static servers may send the raw gzip instead.
    const text=bytes[0]===0x1f&&bytes[1]===0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : new TextDecoder().decode(bytes);
    cache.set(name,JSON.parse(text));
  }
  return cache.get(name)!;
}
function notice(message:string,bad=false){$("notice").textContent=message;$("notice").classList.toggle("bad",bad);}
function stamp(face:Face):Stamp{return {face,size,mode:stroke?.mode??(shift?"remove":"add"),layer:view.layer};}
function show(face:Face|null){
  if(face)face={x:face.x,y:face.y,z:face.z,nx:face.nx,ny:face.ny,nz:face.nz};
  lastFace=face;
  const start=performance.now();
  preview=face?doc.preview(stamp(face)):null;view.ghost(preview);
  metrics.ghostMs.push(performance.now()-start);
  if(preview)notice(preview.reason||`${preview.stamp.mode==="add"?"Add":"Remove"} ${preview.voxels.length} block${preview.voxels.length===1?"":"s"} · ${size} × ${size}`,!!preview.reason);
  else notice("Point at a face to begin.");
  const tip=$("pointer");tip.hidden=!face&&!resize;
  tip.textContent=`${size} × ${size}${resize?" · release F to set":""}`;
  tip.style.left=`${Math.min(innerWidth-150,pointer.x+19)}px`;tip.style.top=`${pointer.y+18}px`;
}
function sync(p?:Plan){
  const wet=p??water(doc.terrain,doc.map);
  view.sync(doc.terrain,doc.things,wet.pools);
  clearTimeout(lighting);
  lighting=window.setTimeout(()=>view.relightAll(),320);
}
function apply(p:Plan){
  const start=performance.now();
  if(!doc.apply(p))return false;
  sync(p);view.openCells(p.stamp.mode==="remove"?p.voxels:[]);
  if($<HTMLInputElement>("sound").checked)sound.play(p.stamp.mode==="remove");
  metrics.editMs.push(performance.now()-start);
  return true;
}
function stop(cancel=false){
  if(!stroke)return;
  stroke=null;
  if(cancel){doc.cancel();sync();}else doc.end();
  show(view.pick(pointer.x,pointer.y));
}
async function open(next:CaseId){
  ready=false;stop(true);id=next;$<HTMLSelectElement>("case").value=next;view.layer=22;$<HTMLInputElement>("layer").value="22";$("layer-value").textContent="All";
  const c=makeCase(next,await fixture(next==="flat"?"highlands":"canyon"));doc=new BlockDocument(c.map,c.terrain);
  view.open(doc.terrain,c.map);sync();
  if(next==="flat"){
    // A real, level patch of Highlands seed 5; no synthetic flattening.
    let best={x:64,y:64,z:8},found=false;
    for(let y=20;y<108&&!found;y++)for(let x=25;x<108&&!found;x++){
      const z=doc.terrain.surface(y*128+x);let flat=true;
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++)if(doc.terrain.surface((y+dy)*128+x+dx)!==z||c.map.water[(y+dy)*128+x+dx]>.02)flat=false;
      if(flat){best={x,y,z};found=true;}
    }
    near={target:[best.x,best.z,-best.y],yaw:.3,pitch:.65,distance:24};
  }else near={target:[94,5.5,-71],yaw:.3,pitch:.11,distance:15};
  view.pose=structuredClone(near);view.applyPose();show(null);ready=true;document.body.dataset.ready="1";
}
function planeFace(x:number,y:number,base:Face):Face|null {
  const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),view.camera);
  const normal=new THREE.Vector3(base.nx,base.nz,-base.ny);
  const center=new THREE.Vector3(base.x+.5+base.nx*.5,base.z+.5+base.nz*.5,-base.y-.5-base.ny*.5);
  const p=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center),new THREE.Vector3());
  if(!p)return null;
  return {...base,x:base.nx?base.x:Math.floor(p.x),y:base.ny?base.y:Math.floor(-p.z),z:base.nz?base.z:Math.floor(p.y)};
}
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointerdown",e=>{
  if(!ready)return;canvas.focus();pointer={x:e.clientX,y:e.clientY};shift=e.shiftKey;pendingInput=performance.now();
  if(e.button===1||e.button===2){orbit={x:e.clientX,y:e.clientY,pan:e.button===1||e.shiftKey};canvas.setPointerCapture(e.pointerId);return;}
  if(e.button!==0||resize||stroke||e.ctrlKey||e.metaKey||e.altKey)return;
  void sound.unlock();show(view.pick(e.clientX,e.clientY));
  if(!preview||!lastFace)return;
  stroke={face:{...lastFace},last:{...lastFace},mode:shift?"remove":"add",x:e.clientX,y:e.clientY,moved:false,next:performance.now()+420,blocked:false};
  doc.begin();canvas.setPointerCapture(e.pointerId);
  const changed=apply(preview);
  if(stroke.mode==="remove"&&!stroke.face.nz){
    if(changed)stroke.last=deeper(stroke.last);else stroke.blocked=true;
    show(stroke.last);
  }
});
canvas.addEventListener("pointermove",e=>{
  if(!ready)return;pointer={x:e.clientX,y:e.clientY};shift=e.shiftKey;pendingInput=performance.now();
  if(resize){setSize(resize.size+Math.round((e.clientX-resize.x)/18));show(lastFace);return;}
  if(orbit){const dx=e.clientX-orbit.x,dy=e.clientY-orbit.y;if(orbit.pan)view.pan(dx,dy);else view.orbit(dx,dy);orbit.x=e.clientX;orbit.y=e.clientY;return;}
  if(stroke){
    if(Math.hypot(e.clientX-stroke.x,e.clientY-stroke.y)>5)stroke.moved=true;
    if(!stroke.moved)return;
    doc.kind("drag");const f=planeFace(e.clientX,e.clientY,stroke.face);if(!f)return;
    // A hold may have advanced its depth. The painted layer still uses the press's plane.
    const previous={...stroke.last,x:stroke.face.nx?stroke.face.x:stroke.last.x,y:stroke.face.ny?stroke.face.y:stroke.last.y,z:stroke.face.nz?stroke.face.z:stroke.last.z};
    for(const q of line(previous,f)){show(q);if(preview)apply(preview);}
    stroke.last=f;show(f);return;
  }
  show(view.pick(e.clientX,e.clientY));
});
canvas.addEventListener("pointerup",e=>{if(e.button===0)stop();orbit=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener("pointercancel",()=>{stop(true);orbit=null;});
canvas.addEventListener("lostpointercapture",()=>{stop(true);orbit=null;});
canvas.addEventListener("pointerleave",()=>{if(!stroke&&!orbit&&!resize){show(null);}});
canvas.addEventListener("wheel",e=>{e.preventDefault();if(!stroke)view.zoom(e.deltaY);},{passive:false});
function setSize(n:number){size=Math.max(1,Math.min(8,n));$<HTMLInputElement>("size").value=String(size);$("size-value").textContent=`${size} × ${size}`;}
$<HTMLInputElement>("size").oninput=e=>{stop();setSize(Number((e.target as HTMLInputElement).value));show(lastFace);};
$<HTMLInputElement>("layer").oninput=e=>{stop(true);view.layer=Number((e.target as HTMLInputElement).value);$("layer-value").textContent=view.layer===22?"All":String(view.layer);sync();show(view.pick(pointer.x,pointer.y));};
$("case").onchange=e=>void open((e.target as HTMLSelectElement).value as CaseId);
$("near").onclick=()=>{view.pose=structuredClone(near);};
$("overview").onclick=()=>{view.pose={target:[64,6,-64],yaw:.3,pitch:.75,distance:145};};
$("reset").onclick=()=>void open(id);
function history(redo=false){stop(true);redo?doc.redo():doc.undo();sync();show(view.pick(pointer.x,pointer.y));}
$("undo").onclick=()=>history();$("redo").onclick=()=>history(true);
window.addEventListener("keydown",e=>{
  if(!ready)return;
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(k==="escape"){e.preventDefault();if(resize){setSize(resize.size);resize=null;}stop(true);show(lastFace);return;}
  if(mod&&(k==="z"||k==="y")){e.preventDefault();if(stroke){stop(true);return;}history(k==="y"||e.shiftKey);return;}
  if(["INPUT","SELECT","TEXTAREA"].includes((e.target as HTMLElement).tagName))return;
  if(k==="shift"){shift=true;if(!stroke)show(lastFace);return;}
  if(k==="f"&&!mod&&!stroke){e.preventDefault();if(!resize)resize={x:pointer.x,size};show(lastFace);return;}
  if((k==="["||k==="]")&&!stroke){setSize(size+(k==="]"?1:-1));show(lastFace);return;}
  keys.add(k);
});
window.addEventListener("keyup",e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==="f"){resize=null;show(lastFace);}if(k==="shift"){shift=false;if(stroke?.mode==="remove")stop();show(lastFace);}});
window.addEventListener("blur",()=>{keys.clear();resize=null;orbit=null;stop(true);});
window.addEventListener("resize",()=>view.resize());
let previousTime=performance.now();
function frame(now:number){
  const dt=Math.min(.05,(now-previousTime)/1000);previousTime=now;
  if(ready){
    if(stroke&&!stroke.moved&&!stroke.blocked&&stroke.mode==="remove"&&!stroke.face.nz&&now>=stroke.next){
      doc.kind("hold");const p=preview;
      if(p&&apply(p)){stroke.last=deeper(stroke.last);show(stroke.last);}else stroke.blocked=true;
      stroke.next=now+240;
    }
    if(!stroke&&!resize){
      const speed=240*dt;
      if(keys.has("a")||keys.has("arrowleft"))view.pan(speed,0);
      if(keys.has("d")||keys.has("arrowright"))view.pan(-speed,0);
      if(keys.has("w")||keys.has("arrowup"))view.pan(0,speed);
      if(keys.has("s")||keys.has("arrowdown"))view.pan(0,-speed);
      if(keys.has("q"))view.orbit(-200*dt,0);if(keys.has("e"))view.orbit(200*dt,0);
    }
    view.time.value=now/1000;
    const start=performance.now();view.render();metrics.renderMs.push(performance.now()-start);
    if(pendingInput!==undefined){const input=pendingInput;metrics.inputToRenderMs.push(performance.now()-input);requestAnimationFrame(()=>metrics.nextFrameMs.push(performance.now()-input));pendingInput=undefined;}
    for(const values of Object.values(metrics))if(values.length>2000)values.splice(0,1000);
  }
  requestAnimationFrame(frame);
}
// Deterministic harness seam. Real pointer events are tested separately by captures.ts.
Object.assign(window,{block:{
  open, view, metrics, get doc(){return doc;}, get ghostPlan(){return preview;}, get ready(){return ready;},
  pose(p:CameraPose){view.pose=structuredClone(p);view.applyPose();},
  project(f:Face){view.applyPose();const v=new THREE.Vector3(f.x+.5+f.nx*.501,f.z+.5+f.nz*.501,-f.y-.5-f.ny*.501).project(view.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};},
  faces(){return faces(doc.terrain);},
  clearGhost(){preview=null;view.ghost(null);$("pointer").hidden=true;},
  snapshot(){return {cols:Array.from(doc.terrain.cols),things:doc.things,pose:structuredClone(view.pose),undo:doc.undoCount,operations:doc.operations};},
  preview(s:Stamp){size=s.size;shift=s.mode==="remove";setSize(size);show(s.face);return {reason:preview?.reason,voxels:preview?.voxels,unsupported:preview?.unsupported};},
  gesture(stamps:Stamp[],kind:"click"|"drag"|"hold"="click"){
    doc.begin(kind);const results=stamps.map(s=>{const p=doc.preview(s);return {accepted:apply(p),reason:p.reason,count:p.voxels.length};});doc.end();show(null);return results;
  },
  sync, history,
}});
void open("cliff").catch(e=>{notice(`Could not open the land: ${e.message}`,true);console.error(e);});requestAnimationFrame(frame);
