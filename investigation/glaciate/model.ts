import { snapshot, modelFor, type ForceMap } from '../forces-core/core/map';
import { MinHeap, N8 } from '../../src/core/math/grid';
import { canonicalRun } from '../../src/core/sim/prefill';
import type { RetainedWater } from '../../src/core/sim/water';

export interface Settings { mode:'flow'|'aim'; power:number; size:number|null; meltwater:boolean; seed:number }
export interface Intent { origin:number; end?:number }
export interface Request { verb:'glaciate'; settings:Settings; intent:Intent }
export interface Point { x:number; y:number }
export interface Station extends Point { s:number; r:number; floor:number; outlet:number }
export interface Basin { tiles:number[]; floor:number; outlet:number; depth:number; fed:boolean }
export const DEFAULTS:Settings={mode:'flow',power:60,size:null,meltwater:true,seed:891};
export const CEILING=22;
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const noise=(seed:number,i:number)=>{let v=Math.imul(seed^i,0x45d9f3b);v=Math.imul(v^(v>>>16),0x45d9f3b);return ((v^(v>>>16))>>>0)/4294967296;};
export const nextSeed=(s:number)=>(Math.imul(s,1664525)+1013904223)>>>0;
export const sizeOf=(s:Settings)=>s.size??Math.round(8+36*s.power/100);
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function sinuosity(p:Point[]){let l=0;for(let i=1;i<p.length;i++)l+=distance(p[i-1],p[i]);return l/(distance(p[0],p.at(-1)!)||1);}
export function validate(m:ForceMap,s:Settings,intent:Intent){
 const n=m.W*m.H;
 if(!['flow','aim'].includes(s.mode)||!Number.isFinite(s.power)||s.power<0||s.power>100||
   (s.size!==null&&(!Number.isFinite(s.size)||s.size<4||s.size>64))||typeof s.meltwater!=='boolean'||
   !Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!Number.isInteger(intent.origin)||intent.origin<0||intent.origin>=n||
   (s.mode==='aim'&&(!Number.isInteger(intent.end)||intent.end!<0||intent.end!>=n||intent.end===intent.origin)))throw Error('Invalid Glaciate gesture or settings');
 if(m.maxHeight!==CEILING)throw Error('Glaciate requires D244 ceiling 22');
}

/** A map-owned drainage field; seed never changes the valley being followed. */
export class Valley {
 readonly parent:Int32Array;
 constructor(readonly m:ForceMap){
  const {W,H,heights:h}=m,n=W*H,cost=new Float64Array(n).fill(Infinity),heap=new MinHeap();
  this.parent=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){const x=i%W,y=Math.floor(i/W);if(x===0||y===0||x===W-1||y===H-1){cost[i]=h[i];heap.push(cost[i],i);}}
  while(heap.size){const i=heap.pop(),c=heap.lastKey;if(c!==cost[i])continue;const x=i%W,y=Math.floor(i/W);
   for(const [dx,dy] of N8){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;
    // Crossing high ground costs much more; this finds the existing low corridors.
    const nc=Math.max(c,h[j])+Math.hypot(dx,dy)*.001;
    if(nc<cost[j]){cost[j]=nc;this.parent[j]=i;heap.push(nc,j);}
   }
  }
 }
 path(origin:number,reach:number):Point[]{
  const {W,H}=this.m,out:Point[]=[];let i=origin,l=0;
  while(i>=0&&out.length<W*H){const p={x:i%W+.5,y:Math.floor(i/W)+.5};if(out.length)l+=distance(p,out.at(-1)!);out.push(p);
   if(l>=reach||p.x<3||p.y<3||p.x>W-3||p.y>H-3)break;i=this.parent[i];
  }
  // Two tile running average removes grid stairs, not the valley's broad bends.
  return out.map((p,k)=>k<2||k>out.length-3?p:{x:out.slice(k-2,k+3).reduce((a,b)=>a+b.x,0)/5,y:out.slice(k-2,k+3).reduce((a,b)=>a+b.y,0)/5});
 }
}
export interface Plan {
 before:ForceMap; map:ForceMap; request:Request; path:Station[]; reference:Point[];
 arrival:Float32Array; mask:Uint8Array; retained:RetainedWater; basins:Basin[];
 lobe:boolean; shallow:boolean; notice:string; hanging:number[];
 fan:Uint8Array; stream:Uint8Array;
 metrics:{cut:number;deposited:number;ratio:number;floorWidth:number;requestedWidth:number;crossRange:number;flatShare:number;centreline:number;valley:number;outwash:number;treesMoved:number;treesUnmoved:number;objectsRemoved:number;dryFloor:number;troughTiles:number;wetShare:number;length:number;valleyLength:number;longestWall:number;buildableBefore:number;buildableAfter:number;buildableGain:number;directGain:number;outwashDry:number};
}
export function route(m:ForceMap,s:Settings,intent:Intent,v=new Valley(m)){
 const start={x:intent.origin%m.W+.5,y:Math.floor(intent.origin/m.W)+.5},reach=m.W*(.22+.85*s.power/100);
 if(s.mode==='flow'){
  const path=v.path(intent.origin,reach),margin=Math.max(4,sizeOf(s)*.38),starts=m.entities.filter(e=>e.template==='StartingLocation');
  // A valley tongue stops before the protected settlement; it does not cross it.
  const end=path.findIndex((q,k)=>k>sizeOf(s)&&
   (Math.min(q.x,q.y,m.W-q.x,m.H-q.y)<margin||starts.some(e=>Math.hypot(q.x-e.x-1,q.y-e.y-1)<sizeOf(s)*.55+3)));
  return end>=0?path.slice(0,end+1):path;
 }
 const end={x:intent.end!%m.W+.5,y:Math.floor(intent.end!/m.W)+.5},len=distance(start,end),n=Math.ceil(len),p:Point[]=[];
 const bend=(noise(s.seed,9)>.5?1:-1)*len*(.12+noise(s.seed,10)*.06),dx=(end.x-start.x)/len,dy=(end.y-start.y)/len;
 for(let k=0;k<=n;k++){const t=k/n,off=Math.sin(t*Math.PI)*bend+Math.sin(t*Math.PI*2)*bend*.3;
  p.push({x:clamp(start.x+(end.x-start.x)*t-dy*off,.5,m.W-.5),y:clamp(start.y+(end.y-start.y)*t+dx*off,.5,m.H-.5)});}
 return p;
}
export function flatAt(m:ForceMap,origin:number,r:number){const ox=origin%m.W+.5,oy=Math.floor(origin/m.W)+.5;let min=22,max=0;
 for(let y=Math.max(0,Math.floor(oy-r));y<Math.min(m.H,oy+r);y++)for(let x=Math.max(0,Math.floor(ox-r));x<Math.min(m.W,ox+r);x++){const h=m.heights[y*m.W+x];min=Math.min(min,h);max=Math.max(max,h);}return max-min<=1;}
export { makePlan,measure } from './morphology';
export function waterRun(p:Plan){return canonicalRun({...modelFor(p.map),retained:[p.retained]});}
export function reveal(p:Plan,t:number):ForceMap{
 const m=snapshot(p.before),advance=clamp(t/3,0,1),retreat=clamp((t-3)/2,0,1);
 for(let i=0;i<m.heights.length;i++)if(p.arrival[i]<=advance){m.heights[i]=p.map.heights[i];m.lava[i]=p.map.lava[i];
  if(t>=3&&p.arrival[i]>=1-retreat){m.water.depth[i]=p.map.water.depth[i];m.water.contamination[i]=p.map.water.contamination[i];}
  else {m.water.depth[i]=p.before.water.depth[i]>.01?Math.max(0,p.before.water.depth[i]+p.before.heights[i]-m.heights[i]):0;}}
 const final=new Map(p.map.entities.map(e=>[e.id,e]));
 m.entities=m.entities.flatMap(e=>{const i=e.y*m.W+e.x;if(p.arrival[i]>advance)return[e];return final.has(e.id)?[structuredClone(final.get(e.id)!)]:[];});
 if(t>=3)m.entities.push(...p.map.entities.filter(e=>!p.before.entities.some(b=>b.id===e.id)).map(e=>structuredClone(e)));
 m.fallen=p.map.fallen.filter(f=>m.entities.some(e=>e.id===f.id&&e.x===Math.floor(f.x)&&e.y===Math.floor(f.y)));
 return t>=5?snapshot(p.map):m;
}
