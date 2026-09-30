// Demo-only land transport. Product code stays untouched.
import { fullMap, snapshotMap, type ForceMap, type FullForceMap } from "../../src/core/forces/force";
import { floorProblem, forceFloor, holdAtFloor } from "../../src/core/forces/floor";
import { footprint, startProblem } from "../../src/core/forces/objects";
import { hash, clamp, smooth } from "../../src/core/forces/random";
import { resamplePath, pathLength, type PathPoint } from "../../src/core/forces/path";
import { hardAt, trimRock } from "../../src/core/forces/rock";
import { WaterSim, settle as canonicalSettle } from "../../src/core/sim/water";
import { MinHeap } from "../../src/core/math/grid";
import { modelOf } from "../../src/core/forces/runs";
export type Style = "rockfall" | "slump" | "flow";
export interface Settings { power: number; size: number | null; style: Style | "auto"; floor: number; seed: number }
export interface Intent { path?: PathPoint[]; click?: PathPoint }
export const DEFAULTS: Settings = { power: 70, size: null, style: "auto", floor: 1, seed: 1 };
export const widthOf = (s: Settings) => s.size ?? 10 + s.power * .18;
export interface Operation { version: 1; verb: "landslide"; settings: Settings; path: PathPoint[]; tiles: number[]; heights: number[]; entities: FullForceMap["entities"]; lava: number[] }
export interface Plan {
 before: FullForceMap; map: FullForceMap; arrival: Float32Array; route: PathPoint[]; width: number; transport: Int32Array;
 settings: Settings; operation: Operation;
 stats: { changed: number; drop: number; removed: number; deposited: number; edgeLoss: number; held: number; style: Style; startCarried: boolean; saddleTiles: number[]; stoppedUphill: boolean };
}
export function validate(m: ForceMap, s: Settings, intent: Intent): void {
 if (!Number.isFinite(s.power) || s.power < 0 || s.power > 100 || (s.size !== null && (!Number.isFinite(s.size) || s.size < 4 || s.size > 64)) ||
 !["auto","rockfall","slump","flow"].includes(s.style) || floorProblem(s.floor,m.maxHeight) || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff) throw Error("Invalid Landslide settings");
 const path=intent.path ?? (intent.click ? [intent.click] : []);
 if (!path.length || path.length > 512 || path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>m.W-1||p.y>m.H-1)) throw Error("Draw the Landslide on the map");
}
const tileAt=(m: ForceMap,p: PathPoint)=>Math.round(p.y)*m.W+Math.round(p.x);
function routeOf(m: ForceMap,s: Settings,intent: Intent): { route: PathPoint[]; stopped: boolean } {
 const origin=intent.click ?? intent.path![0];
 let drawn=intent.path && intent.path.length>1 ? resamplePath(intent.path,.65,384) : null;
 if (!drawn) {
  // Read the steepest fall over six tiles, so clicks on terraced ground find its slope.
  let dx=0,dy=0,best=0;
  for(let k=0;k<32;k++) {
   const a=k*Math.PI/16, p={x:clamp(origin.x+Math.cos(a)*6,0,m.W-1),y:clamp(origin.y+Math.sin(a)*6,0,m.H-1)};
   const drop=(m.heights[tileAt(m,origin)]-m.heights[tileAt(m,p)])/Math.max(1,Math.hypot(p.x-origin.x,p.y-origin.y));
   if(drop>best) { best=drop;dx=Math.cos(a);dy=Math.sin(a); }
  }
  const length=widthOf(s)*2.3;
  drawn=resamplePath([origin,{x:clamp(origin.x+dx*length,0,m.W-1),y:clamp(origin.y+dy*length,0,m.H-1)}],.65,384);
 }
 const target=drawn.at(-1)!,start=tileAt(m,origin),goal=tileAt(m,target);
 const extent=pathLength(drawn),band=intent.path&&intent.path.length>1 ? clamp(extent*.48,8,48) : widthOf(s);
 const cost=new Float64Array(m.heights.length).fill(Infinity),parent=new Int32Array(m.heights.length).fill(-1),heap=new MinHeap();
 cost[start]=0;heap.push(0,start);
 let closest=start,best=Infinity;
 const guide=Array.from({length:m.heights.length},(_,i)=>nearest(drawn!,i%m.W,Math.floor(i/m.W)));
 while(heap.size) {
  const i=heap.pop(),x=i%m.W,y=Math.floor(i/m.W);
  const d=Math.hypot(x-target.x,y-target.y);if(d<best){best=d;closest=i;}if(i===goal)break;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
   const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=m.W||yy>=m.H)continue;
   const j=yy*m.W+xx,g=guide[j];
   if(m.heights[j]>m.heights[i]||g.d>band*.5||g.along<-.5||g.along>extent+.5)continue;
   const c=cost[i]+Math.hypot(dx,dy)*(1+g.d/band*3);
   if(c>=cost[j])continue;cost[j]=c;parent[j]=i;
   heap.push(c+Math.hypot(xx-target.x,yy-target.y),j);
  }
 }
 const tiles=[closest];for(let i=closest;i!==start && parent[i]>=0;) {i=parent[i];tiles.push(i);}
 tiles.reverse();
 return {route:tiles.map(i=>({x:i%m.W,y:Math.floor(i/m.W)})),stopped:closest!==goal};
}

type Segment={x:number;y:number;dx:number;dy:number;length:number;inverse:number;along:number};
const segmentCache=new WeakMap<PathPoint[],Segment[]>();
function nearest(route: PathPoint[],x:number,y:number): {along:number;cross:number;d:number} {
 let segments=segmentCache.get(route);
 if(!segments) {
  segments=[];let along=0;
  for(let k=1;k<route.length;k++) {
   const a=route[k-1],b=route[k],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
   if(length)segments.push({x:a.x,y:a.y,dx,dy,length,inverse:1/(length*length),along});
   along+=length;
  }
  segmentCache.set(route,segments);
 }
 let best=Infinity,along=0,cross=0;
 for(let k=0;k<segments.length;k++) {
  const s=segments[k],xx=x-s.x,yy=y-s.y,t=(xx*s.dx+yy*s.dy)*s.inverse,f=clamp(t,0,1),rx=xx-s.dx*f,ry=yy-s.dy*f,d=rx*rx+ry*ry;
  if(d<best) {
   best=d;along=s.along+(k===0&&t<0 || k===segments.length-1&&t>1 ? t:f)*s.length;
   cross=(xx*-s.dy+yy*s.dx)/s.length;
  }
 }
 return {along,cross,d:Math.sqrt(best)};
}

/** Integer blocks cut from the crown fund every deposited block. Capacity stops extraction. */
export function* planLandslide(input: ForceMap, settings: Settings,intent: Intent): Generator<void,Plan> {
 validate(input,settings,intent);
 const before=fullMap(input),map=snapshotMap(before),s={...settings},{route,stopped}=routeOf(before,s,intent),length=pathLength(route);
 const origin=route[0],head=before.heights[tileAt(before,origin)],end=route.at(-1)!;
 const slope=(head-before.heights[tileAt(before,end)])/Math.max(1,length);
 const wet=route.some(p=>before.water.depth[tileAt(before,p)]>.1);
 const rocky=hardAt(before,tileAt(before,origin),head)||before.rockLayers[Math.max(0,head-1)]>.5;
 const style: Style=s.style==='auto' ? slope>.42 ? 'rockfall' : length>38 && (wet || slope<.2) ? 'flow' : rocky && slope>.3 ? 'rockfall' : 'slump' : s.style;
 // A drag sets its entire extent; Size only changes a click. Width derives from drawn length.
 const width=intent.path && intent.path.length>1 ? clamp(pathLength(intent.path)*.48,8,48) : widthOf(s);
 const arrival=new Float32Array(map.heights.length).fill(2),transport=new Int32Array(map.heights.length).fill(-1);
 const stats={changed:0,drop:0,removed:0,deposited:0,edgeLoss:0,held:0,style,startCarried:false,saddleTiles:[] as number[],stoppedUphill:stopped};
 const positions=Array.from({length:map.heights.length},(_,i)=>nearest(route,i%map.W,Math.floor(i/map.W)));
 const donors: number[]=[], donorLevels: number[]=[];
 if(length>3 && slope>0 && s.power>0) {
  const cutLength=Math.min(length*.36,width*.8),depth=s.power*.115;
  for(let y=0;y<map.H;y++) {
   for(let x=0;x<map.W;x++) {
    const i=y*map.W+x,f=positions[i],side=f.cross/(width*.5);
    const irregular=1+.12*Math.sin(side*8+s.seed)+.07*Math.sin(side*17+s.seed*.31);
    const crown=cutLength*(-.18+.30*side*side)+.8*Math.sin(side*9+s.seed);
    const u=(f.along-crown)/cutLength;
    if(Math.abs(side)>irregular || u<0 || u>1 || before.heights[i]<head-3) continue;
    const edge=smooth((irregular-Math.abs(side))/.18),front=smooth((1-u)/.17);
    // Tall rockfall crown; slump blocks retain uphill-facing tilted benches.
    const bench=style==='slump' ? .66+.28*((Math.floor(u*4)+1)/4)-.18*((u*4)%1) : 1;
    const cut=Math.round(depth*edge*front*bench*(.90+.17*hash(s.seed,Math.floor(x/4)+Math.floor(y/4)*53)));
    map.heights[i]=Math.max(0,before.heights[i]-cut);arrival[i]=clamp(.03+u*.16,.03,.2);
   }
   if(y%8===7) yield;
  }
  stats.held=holdAtFloor(before.heights,map.heights,forceFloor(s,map.maxHeight));
  for(let i=0;i<map.heights.length;i++) if(map.heights[i]<before.heights[i]) for(let z=map.heights[i];z<before.heights[i];z++) { donors.push(i);donorLevels.push(z); }
  // Keep a low winding saddle along the original river, not a wall across every wet tile.
  // Only the narrowest, deepest part of each river cross-section gets this lower capacity.
  const saddle=new Set<number>();
  for(let i=0;i<map.heights.length;i++) if(before.water.depth[i]>.08) {
   const x=i%map.W,y=Math.floor(i/map.W),level=before.heights[i];
   let deeper=false;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=map.W||yy>=map.H)continue;
    const j=yy*map.W+xx;
    if(before.water.depth[j]>.08 && before.heights[j]<level) deeper=true;
   }
   if(!deeper)saddle.add(i);
  }
  const slots: { i:number; score:number }[]=[];
  const runEnd=style==='slump' ? .72 : 1.02;
  for(let i=0;i<map.heights.length;i++) {
   const f=positions[i],t=f.along/length,h=before.heights[i];
   if(map.heights[i]<h || h>head-3 || t<.18 || t>runEnd || h>=head)continue;
   const toe=smooth((t-.42)/.35),spread=style==='flow' ? .6+toe*.62 : style==='rockfall' ? .55+toe*.3 : .72;
   const bend=width*.09*Math.sin(t*11+s.seed),side=(f.cross-bend)/(width*spread);
   const lobe=1+.17*Math.sin(t*17+s.seed)+.10*Math.sin(side*7+s.seed);
   if(Math.abs(side)>lobe || f.d>width*spread*lobe)continue;
   const taper=smooth((t-.18)/.13)*smooth((runEnd-t)/.16)*smooth((lobe-Math.abs(side))/.28);
   if(taper<.035)continue;
   const hummock=.8+.4*hash(s.seed,Math.floor(i%map.W/4)+Math.floor(i/map.W/4)*51);
   const block=style==='slump' ? .75+.45*((t*7)%1) : 1;
   const weight=taper*hummock*block*(style==='rockfall' ? 1.4-Math.abs(t-.58)*1.4 : 1);
   const max=saddle.has(i)?Math.min(map.maxHeight,h+2):Math.min(map.maxHeight,head+2);
   for(let z=1;z<=max-h;z++) slots.push({i,score:z/Math.max(.01,weight)+(hash(s.seed,i)*.15)});
   arrival[i]=clamp(.20+t*.59,.23,.81);
  }
  slots.sort((a,b)=>a.score-b.score||a.i-b.i);
  // No off-map sink is used: excess mass stays attached to the hillside.
  const volume=Math.min(donors.length,slots.length);
  for(let k=volume;k<donors.length;k++)map.heights[donors[k]]++;
  const destByDonor=new Map<number,{i:number;d:number}>();
  for(let k=0;k<volume;k++) {
   const dest=slots[k].i,src=donors[k];
   map.heights[dest]++;
   const d=Math.abs(positions[dest].cross-positions[src].cross)+Math.abs(positions[dest].along-positions[src].along-length*.42)*.2;
   const old=destByDonor.get(src);if(!old||d<old.d)destByDonor.set(src,{i:dest,d});
   const z=map.heights[dest]-1,sz=donorLevels[k];
   if(before.lava[src] & (1<<sz))map.lava[dest]|=1<<z;
  }
  // Anchor travel follows the same extracted mass. Objects and sources remain upright.
  for(const [src,dest] of destByDonor) if(map.heights[src]<before.heights[src])transport[src]=dest.i;
  stats.saddleTiles=[...saddle].filter(i=>map.heights[i]>before.heights[i]);
 }
 trimRock(map);
 for(const e of map.entities) {
  const src=e.y*map.W+e.x,dest=transport[src];
  if(dest>=0) {e.x=dest%map.W;e.y=Math.floor(dest/map.W);e.z+=map.heights[dest]-before.heights[src];delete e.raw;}
  else if(map.heights[src]!==before.heights[src]) {e.z+=map.heights[src]-before.heights[src];delete e.raw;}
 }
 stats.startCarried=carryStart(map,before);
 const tiles:number[]=[],heights:number[]=[];
 for(let i=0;i<map.heights.length;i++) {
  const delta=map.heights[i]-before.heights[i];
  if(delta) {tiles.push(i);heights.push(map.heights[i]);stats.changed++;stats.drop=Math.max(stats.drop,-delta);if(delta<0)stats.removed-=delta;else stats.deposited+=delta;}
  else if(transport[i]<0)arrival[i]=2;
 }
 return {before,map,arrival,route,width,transport,settings:s,stats,operation:{version:1,verb:'landslide',settings:s,path:route,tiles,heights,entities:structuredClone(map.entities),lava:tiles.map(i=>map.lava[i])}};
}
export function plan(input: ForceMap,s: Settings,intent: Intent): Plan {const g=planLandslide(input,s,intent);for(;;){const r=g.next();if(r.done)return r.value;}}
/** Standalone adapter uses the shared footprint/start check; adoption uses carryStartOps. */
function carryStart(m: FullForceMap,before: FullForceMap): boolean {
 const start=m.entities.find(e=>e.template==='StartingLocation');if(!start||!startProblem(m))return false;
 const old=before.entities.find(e=>e.id===start.id)!;
 const candidates:{x:number;y:number;d:number}[]=[];
 for(let y=2;y<m.H-2;y++)for(let x=2;x<m.W-2;x++)candidates.push({x,y,d:(x-old.x)**2+(y-old.y)**2});
 candidates.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
 const occupied=new Set(m.entities.filter(e=>e.id!==start.id&&!/^(Pine|Oak|Birch|BlueberryBush|Succulent)$/.test(e.template)).flatMap(e=>footprint(m,e)));
 for(const p of candidates) {
  const e={...start,x:p.x,y:p.y,z:m.heights[p.y*m.W+p.x]},tiles=footprint(m,e,1);
  if(tiles.some(i=>m.heights[i]!==e.z||m.water.depth[i]>.05||occupied.has(i)))continue;
  Object.assign(start,e);delete start.raw;return true;
 }
 throw Error('No level ground remains for the start');
}
export function replay(before: ForceMap,op: Operation): FullForceMap {
 const m=fullMap(before);op.tiles.forEach((i,k)=>{m.heights[i]=op.heights[k];m.lava[i]=op.lava[k];});m.entities=structuredClone(op.entities);return m;
}
export function reveal(p: Plan,progress: number): FullForceMap {
 if(progress>=1)return snapshotMap(p.map);
 const out=snapshotMap(p.before);
 for(let i=0;i<out.heights.length;i++)if(p.arrival[i]<=progress){out.heights[i]=p.map.heights[i];out.lava[i]=p.map.lava[i];}
 const final=new Map(p.map.entities.map(e=>[e.id,e]));
 out.entities=p.before.entities.map(e=>structuredClone(footprint(out,e).some(i=>p.arrival[i]<=progress)?final.get(e.id)!:e));
 return out;
}
export const waterSim=(m: FullForceMap)=>new WaterSim(modelOf(m),m.water);
export function settle(m: FullForceMap) {const sim=waterSim(m),result=canonicalSettle(sim);m.water={depth:sim.D.slice(),contamination:sim.C.slice()};return result;}
