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
export interface Hanging {mouth:number;lip:number;landing:number;source:number|null;catchment:number;drop:number;s:number;wet:boolean;channel:number[];joinLength:number}
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
 readonly area:Uint32Array;
 constructor(readonly m:ForceMap){
  const {W,H,heights:h}=m,n=W*H,cost=new Float64Array(n).fill(Infinity),heap=new MinHeap();
  this.parent=new Int32Array(n).fill(-1);this.area=new Uint32Array(n).fill(1);const order:number[]=[];
  for(let i=0;i<n;i++){const x=i%W,y=Math.floor(i/W);if(x===0||y===0||x===W-1||y===H-1){cost[i]=h[i];heap.push(cost[i],i);}}
  while(heap.size){const i=heap.pop(),c=heap.lastKey;if(c!==cost[i])continue;order.push(i);const x=i%W,y=Math.floor(i/W);
   for(const [dx,dy] of N8){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;
    // Crossing high ground costs much more; this finds the existing low corridors.
    const nc=Math.max(c,h[j])+Math.hypot(dx,dy)*.001;
    if(nc<cost[j]){cost[j]=nc;this.parent[j]=i;heap.push(nc,j);}
   }
  }
  for(const i of order.reverse())if(this.parent[i]>=0)this.area[this.parent[i]]+=this.area[i];
 }
 path(origin:number,reach:number):Point[]{
  const {W,H}=this.m,out:Point[]=[];let i=origin,l=0;
  while(i>=0&&out.length<W*H){const p={x:i%W+.5,y:Math.floor(i/W)+.5};if(out.length)l+=distance(p,out.at(-1)!);out.push(p);
   if(l>=reach||p.x<3||p.y<3||p.x>W-3||p.y>H-3)break;i=this.parent[i];
  }
  // Two tile running average removes grid stairs, not the valley's broad bends.
  let smooth=out;for(let pass=0;pass<3;pass++)smooth=smooth.map((p,k)=>{if(k<2||k>smooth.length-3)return p;const a=smooth.slice(Math.max(0,k-5),Math.min(smooth.length,k+6));return {x:a.reduce((s,q)=>s+q.x,0)/a.length,y:a.reduce((s,q)=>s+q.y,0)/a.length};});return smooth;
 }
}
export interface Plan {
 before:ForceMap; map:ForceMap; request:Request; path:Station[]; reference:Point[];
 arrival:Float32Array; mask:Uint8Array; retained:RetainedWater; basins:Basin[];
 notice:string; hanging:Hanging[]; floor:Uint8Array; nearest:Int32Array; streamPath:Point[];
 falls?:{lip:number;landing:number;drop:number}[];
 fan:Uint8Array; stream:Uint8Array;
 metrics:{cut:number;deposited:number;carriedAway:number;ratio:number;floorWidth:number;widthMin:number;widthMax:number;requestedWidth:number;crossRange:number;flatShare:number;centreline:number;valley:number;outwash:number;treesMoved:number;treesUnmoved:number;treesRemoved:number;objectsRemoved:number;cleanAbsorbed:number;badSwept:number;riverWidthMin:number;riverWidthMax:number;channels:number;maxPoolJoin:number;startMoved:boolean;dryFloor:number;newFloor:number;newFloorShare:number;wallMedian:number;wallMax:number;hangingValleys:number;waterfalls:number;troughTiles:number;wetShare:number;length:number;valleyLength:number;longestWall:number;buildableBefore:number;buildableAfter:number;buildableGain:number;directGain:number;outwashDry:number};
}
/** Flat neighbourhoods have no useful downhill direction. A seeded choice among
 * nearby lower ground / edges makes Try another find a different way there. */
export function flatHead(m:ForceMap,origin:number){const x=origin%m.W,y=Math.floor(origin/m.W),a:number[]=[];for(let yy=Math.max(0,y-24);yy<=Math.min(m.H-1,y+24);yy++)for(let xx=Math.max(0,x-24);xx<=Math.min(m.W-1,x+24);xx++)a.push(m.heights[yy*m.W+xx]);return Math.max(...a)-Math.min(...a)<=1;}
export function route(m:ForceMap,s:Settings,intent:Intent,v=new Valley(m)){
 const start={x:intent.origin%m.W+.5,y:Math.floor(intent.origin/m.W)+.5},reach=m.W*(.22+.85*s.power/100);
 if(s.mode==='flow'){
  const ordinary=v.path(intent.origin,reach);
  if(!flatHead(m,intent.origin)&&ordinary.length>=8)return ordinary;
  const targets:Point[]=[],h=m.heights[intent.origin];
  for(let y=1;y<m.H-1;y+=3)for(let x=1;x<m.W-1;x+=3)if(m.heights[y*m.W+x]<h)targets.push({x:x+.5,y:y+.5});
  targets.push({x:1.5,y:start.y},{x:m.W-1.5,y:start.y},{x:start.x,y:1.5},{x:start.x,y:m.H-1.5});
  const usable=targets.filter(q=>distance(q,start)>=8).sort((a,b)=>distance(a,start)-distance(b,start)),nearest=usable[0]??{x:m.W-start.x,y:m.H-start.y},near=usable.filter(q=>distance(q,start)<=distance(nearest,start)*1.5+8),end=near[Math.floor(noise(s.seed,927)*near.length)]??nearest;
  const len=Math.min(reach,Math.max(8,distance(start,end))),dx=(end.x-start.x)/(distance(start,end)||1),dy=(end.y-start.y)/(distance(start,end)||1),out:Point[]=[];
  for(let k=0;k<=Math.ceil(len);k++){const t=k/Math.ceil(len),bend=Math.sin(t*Math.PI)*Math.min(4,len*.08)*(noise(s.seed,319)*2-1);out.push({x:clamp(start.x+dx*len*t-dy*bend,.5,m.W-.5),y:clamp(start.y+dy*len*t+dx*bend,.5,m.H-.5)});}return out;
 }
 // Directional least-cost pass. Terrain, never the variation seed, chooses its
 // bends. Crossing a ridge is allowed; a modest corridor cost preserves intent.
 const goal=intent.end!,end={x:goal%m.W+.5,y:Math.floor(goal/m.W)+.5},len=distance(start,end),dx=(end.x-start.x)/len,dy=(end.y-start.y)/len;
 const costs=new Float64Array(m.W*m.H).fill(Infinity),parent=new Int32Array(m.W*m.H).fill(-1),heap=new MinHeap();costs[intent.origin]=0;heap.push(0,intent.origin);
 while(heap.size){const i=heap.pop(),c=heap.lastKey;if(c!==costs[i])continue;if(i===goal)break;const x=i%m.W,y=Math.floor(i/m.W);
  for(const [xx,yy]of N8){const nx=x+xx,ny=y+yy;if(nx<1||ny<1||nx>=m.W-1||ny>=m.H-1)continue;const j=ny*m.W+nx,across=Math.abs((nx-start.x)*dy-(ny-start.y)*dx);
   const nc=c+Math.hypot(xx,yy)*(1+m.heights[j]*.12+(across/Math.max(6,len*.22))**2*.7);
   if(nc<costs[j]){costs[j]=nc;parent[j]=i;heap.push(nc,j);}
  }
 }
 const out:Point[]=[];let at=goal;while(at>=0){out.push({x:at%m.W+.5,y:Math.floor(at/m.W)+.5});if(at===intent.origin)break;at=parent[at];}out.reverse();
 return out.map((p,k)=>k<3||k>out.length-4?p:{x:out.slice(k-3,k+4).reduce((a,b)=>a+b.x,0)/7,y:out.slice(k-3,k+4).reduce((a,b)=>a+b.y,0)/7});
}
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
