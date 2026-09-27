import { snapshot, plainEntities, modelFor, type ForceMap } from '../forces-core/core/map';
import { protectedGround, entityTiles, isPlant, ride, topple } from '../forces-core/core/objects';
import { trimRock } from '../forces-core/core/rock';
import { MinHeap, N8 } from '../../src/core/math/grid';
import { spillLevels, prefill, canonicalRun } from '../../src/core/sim/prefill';
import { waterSource } from '../../src/core/format/entities';
import { guidFrom } from '../../src/core/math/hash';
import { slopeHighSide } from '../../src/core/format/footprints';
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
export const sizeOf=(s:Settings)=>s.size??Math.round(6+26*s.power/100);
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
 metrics:{cut:number;deposited:number;ratio:number;floorWidth:number;requestedWidth:number;crossRange:number;flatShare:number;centreline:number;valley:number;outwash:number;treesMoved:number;treesUnmoved:number};
}
export function route(m:ForceMap,s:Settings,intent:Intent,v=new Valley(m)){
 const start={x:intent.origin%m.W+.5,y:Math.floor(intent.origin/m.W)+.5},reach=m.W*(.16+.62*s.power/100);
 if(s.mode==='flow'){
  const path=v.path(intent.origin,reach),margin=Math.min(m.W*.22,sizeOf(s)*1.15);
  // Leave receiving ground beyond the snout. Never crop a gesture already near an edge to nothing.
  const end=path.findIndex((q,k)=>k>sizeOf(s)*.8&&Math.min(q.x,q.y,m.W-q.x,m.H-q.y)<margin);
  return end>=0?path.slice(0,end+1):path;
 }
 const end={x:intent.end!%m.W+.5,y:Math.floor(intent.end!/m.W)+.5},len=distance(start,end),n=Math.ceil(len),p:Point[]=[];
 const bend=(noise(s.seed,9)-.5)*Math.min(8,len*.12),dx=(end.x-start.x)/len,dy=(end.y-start.y)/len;
 for(let k=0;k<=n;k++){const t=k/n,off=Math.sin(t*Math.PI)*bend+Math.sin(t*Math.PI*2)*bend*.25;
  p.push({x:clamp(start.x+(end.x-start.x)*t-dy*off,.5,m.W-.5),y:clamp(start.y+(end.y-start.y)*t+dx*off,.5,m.H-.5)});}
 return p;
}
export function flatAt(m:ForceMap,origin:number,r:number){const ox=origin%m.W+.5,oy=Math.floor(origin/m.W)+.5;let min=22,max=0;
 for(let y=Math.max(0,Math.floor(oy-r));y<Math.min(m.H,oy+r);y++)for(let x=Math.max(0,Math.floor(ox-r));x<Math.min(m.W,ox+r);x++){const h=m.heights[y*m.W+x];min=Math.min(min,h);max=Math.max(max,h);}return max-min<=1;}
export function makePlan(input:ForceMap,settings:Settings,intent:Intent,valley=new Valley(input)):Plan {
 validate(input,settings,intent);
 const before=snapshot(input),m=snapshot(input),s={...settings},W=m.W,H=m.H,n=W*H,keep=protectedGround(m),p=s.power/100;
 const tile=(q:Point)=>clamp(Math.floor(q.y),0,H-1)*W+clamp(Math.floor(q.x),0,W-1);
 if(keep[intent.origin])throw Error('Start here');
 let reference=route(m,s,intent,valley),r=sizeOf(s)/2;
 if(reference.length<2)throw Error('Choose ground farther from the edge');
 const lobe=s.mode==='flow'&&flatAt(m,intent.origin,r);
 const shallow=m.heights[intent.origin]<=2;
 if(shallow)r*=1.35;
 if(lobe){const a=reference[0],b=reference[Math.min(reference.length-1,Math.round(r*.7))];reference=[a,b];}
 const length=reference.reduce((a,q,k)=>a+(k?distance(q,reference[k-1]):0),0),depth=Math.round(1+5*p),h0=before.heights[intent.origin];
 // A smoothed valley datum descends in steps; basins lie BELOW their downstream step.
 const endHeight=before.heights[tile(reference.at(-1)!)],top=Math.max(1,h0-depth),bottom=Math.min(top,Math.max(0,endHeight-Math.round(depth*.65)));
 let acc=0;const phase=noise(s.seed,7),segments=lobe?1:Math.max(2,Math.round(length/(r*1.35)));
 const path:Station[]=reference.map((q,k)=>{if(k)acc+=distance(q,reference[k-1]);const t=acc/(length||1),b=Math.min(segments-1,Math.floor(t*segments)),u=t*segments-b;
  const outlet=Math.max(0,Math.round(top+(bottom-top)*(b/(segments-1||1))));
  const basinDepth=1+Math.floor(noise(s.seed,b+200)*(1+p*2));
  const scour=u>.15+phase*.08&&u<.80-noise(s.seed,b+600)*.1?basinDepth:0;
  return {...q,s:t,r:r*(.91+.12*Math.sin(t*7+phase*6)+.07*Math.sin(t*17+phase*4)),floor:Math.max(0,outlet-scour),outlet};});
 const nearest=new Int32Array(n).fill(-1),d=new Float64Array(n).fill(Infinity),mask=new Uint8Array(n),arrival=new Float32Array(n).fill(1);
 // Nearest station wins; a nearby deeper basin must not eat its neighbour's sill.
 for(let k=0;k<path.length;k++){const q=path[k],rr=q.r*(lobe?1.6:1.45);
  for(let y=Math.max(0,Math.floor(q.y-rr));y<Math.min(H,q.y+rr);y++)for(let x=Math.max(0,Math.floor(q.x-rr));x<Math.min(W,q.x+rr);x++){
   const i=y*W+x,dd=Math.hypot(x+.5-q.x,y+.5-q.y)/q.r;if(dd<d[i]){d[i]=dd;nearest[i]=k;}
  }
 }
 for(let i=0;i<n;i++){if(nearest[i]<0)continue;const q=path[nearest[i]],dd=d[i];if(dd>1.38)continue;
  if(keep[i])throw Error('Start here');
  const cirque=q.s<.12,datum=lobe?Math.max(0,h0-Math.min(2,depth)):q.floor;
  const shoulder=Math.max(datum,q.outlet+Math.max(3,depth));
  const target=dd<=1?datum:Math.round(datum+(shoulder-datum)*Math.pow((dd-1)/.38,.65));
  m.heights[i]=Math.min(m.heights[i],target);mask[i]=dd<=1?1:2;
  // Preserve whole-floor sills even where an older narrow channel crossed the valley.
  if(dd<1&&q.floor===q.outlet&&!lobe)m.heights[i]=q.floor;
  if(cirque&&dd<.6&&!lobe)m.heights[i]=Math.max(0,m.heights[i]-1);
  arrival[i]=lobe?clamp(dd/1.5,0,1):q.s;
 }
 let cut=0,already=0;for(let i=0;i<n;i++){cut+=Math.max(0,before.heights[i]-m.heights[i]);already+=Math.max(0,m.heights[i]-before.heights[i]);}
 if(already>cut)throw Error('Not enough material for this valley');
 // Sediment has one ledger. First a low curved terminal dam, then side ridges and a broad fan.
 const end=path.at(-1)!,prior=path[Math.max(0,path.length-5)],dl=distance(end,prior)||1,dx=(end.x-prior.x)/dl,dy=(end.y-prior.y)/dl;
 const candidates:{i:number;score:number;cap:number;fan:boolean}[]=[];
 const fanLevel=Math.min(CEILING,endHeight+2);
 for(let i=0;i<n;i++){if(keep[i]||mask[i]||before.water.depth[i]>.05)continue;const x=i%W+.5,y=Math.floor(i/W)+.5,ex=x-end.x,ey=y-end.y;
  const along=ex*dx+ey*dy,across=Math.abs(ex*dy-ey*dx),rad=Math.hypot(ex,ey),rough=1+.08*Math.sin(Math.atan2(ey,ex)*5+phase*6);
  const terminal=lobe?Math.abs(rad-r*1.25*rough)<2:along>0&&Math.abs(rad-r*1.3*rough)<2;
  const side=nearest[i]>=0&&d[i]>1.38&&d[i]<1.7;
  const fan=along>r*1.35&&along<r*3.6&&across<r*(1.8-along/(r*6));
  if(terminal||side||fan)candidates.push({i,score:terminal?0:fan?3+along/r:6,cap:Math.min(CEILING,fan?Math.max(before.heights[i],fanLevel):before.heights[i]+(terminal?3:2)),fan});
 }
 // Broader deposition falloff is permitted when the cut exceeds the local ridges' capacity.
 const occupied=new Set(candidates.map(c=>c.i));
 for(let i=0;i<n;i++)if(!occupied.has(i)&&!mask[i]&&!keep[i]&&before.water.depth[i]<.01){const x=i%W+.5,y=Math.floor(i/W)+.5,dist=distance({x,y},end);
  if(dist<r*5)candidates.push({i,score:16+dist/r,cap:Math.min(CEILING,before.heights[i]+4),fan:false});}
 const heap=new MinHeap(),by=new Map(candidates.map(c=>[c.i,c]));for(const c of candidates)if(m.heights[c.i]<c.cap)heap.push(c.score+m.heights[c.i]*.4,c.i);
 let left=cut-already,deposited=already,outwash=0;
 while(left&&heap.size){const i=heap.pop(),c=by.get(i)!;m.heights[i]++;left--;deposited++;arrival[i]=.8+noise(s.seed,i)*.2;if(c.fan)outwash++;
  if(m.heights[i]<c.cap)heap.push(c.score+(m.heights[i]-before.heights[i])*2+m.heights[i]*.4,i);}
 if(left)throw Error('Not enough room to deposit the moraine · choose a smaller glacier');
 const hanging:number[]=[];
 for(let i=0;i<n;i++)if(mask[i]===2&&before.water.depth[i]>.03&&before.heights[i]-m.heights[i]>=2)hanging.push(i);
 // Trees keep real entity coordinates/species. No render-only fallen pose that the game cannot export.
 const used=new Set<number>();for(const e of m.entities){const cells=entityTiles(m,e);if(!isPlant(e)||cells.every(i=>!mask[i]))for(const i of cells)used.add(i);}
 let treesMoved=0,treesUnmoved=0;
 m.entities=m.entities.filter(e=>{const cells=entityTiles(m,e);if(e.template==='StartingLocation')return true;
  const touched=cells.some(i=>mask[i]||before.heights[i]!==m.heights[i]);if(!touched)return true;
  if(e.owner.startsWith('pinned:')){if(cells.some(i=>before.heights[i]!==m.heights[i]||mask[i]))throw Error('Pinned object here');return true;}
  if(isPlant(e)&&cells.some(i=>mask[i])){
   const options=candidates.filter(c=>!used.has(c.i)&&m.heights[c.i]>=before.heights[c.i]);
   options.sort((a,b)=>Math.hypot(a.i%W-e.x,Math.floor(a.i/W)-e.y)-Math.hypot(b.i%W-e.x,Math.floor(b.i/W)-e.y)||a.i-b.i);
   const dest=options[0]?.i;if(dest===undefined)throw Error('Not enough room for trees at the ice edge');
   const ox=e.x,oy=e.y;e.x=dest%W;e.y=Math.floor(dest/W);used.add(dest);const len=Math.hypot(e.x-ox,e.y-oy)||1;
   ride(e,m.heights[dest]);delete e.raw;treesMoved++;return true;
  }
  if(cells.every(i=>m.heights[i]===m.heights[cells[0]])){ride(e,m.heights[cells[0]]);return true;}
  // Unsupported non-plants lose their ground, matching shared-core excavation policy.
  return false;
 });
 // A changed neighbour can disconnect a slope even when its own floor survived.
 // Prune to a fixed point so removed lower ramps cannot support a stale chain.
 let removedSlope=true;
 while(removedSlope){removedSlope=false;const slopes=new Map(m.entities.filter(e=>e.template==='Slope').map(e=>[e.y*W+e.x,e]));
  m.entities=m.entities.filter(e=>{if(e.template!=='Slope')return true;
   const [dx,dy]=slopeHighSide(e.orientation),hx=e.x+dx,hy=e.y+dy,lx=e.x-dx,ly=e.y-dy;
   const lower=slopes.get(ly*W+lx),inside=(x:number,y:number)=>x>=0&&y>=0&&x<W&&y<H;
   const valid=inside(hx,hy)&&m.heights[hy*W+hx]===e.z+1&&inside(lx,ly)&&(m.heights[ly*W+lx]===e.z||lower?.z===e.z-1);
   if(valid)return true;if(e.owner.startsWith('pinned:'))throw Error('Pinned slope would lose its connection');
   removedSlope=true;return false;
  });
 }
 trimRock(m);
 if(s.meltwater){let serial=0,id=guidFrom('glaciate',s.seed,intent.origin,serial);while(m.entities.some(e=>e.id===id))id=guidFrom('glaciate',s.seed,intent.origin,++serial);
  m.entities.push(waterSource({id,owner:'glaciate',x:intent.origin%W,y:Math.floor(intent.origin/W),z:m.heights[intent.origin],strength:Math.min(8,.75+sizeOf(s)*.16)}));}
 m.entities=plainEntities(m.entities);
 const model=modelFor(m),spill=spillLevels(model),seen=new Uint8Array(n),basins:Basin[]=[],retained:RetainedWater={tiles:[],floor:[],depth:[],contamination:[]};
 const feed=prefill(model);
 for(let i=0;i<n;i++)if(!seen[i]&&mask[i]===1&&spill[i]>m.heights[i]){
  const level=spill[i],queue=[i];seen[i]=1;
  for(let k=0;k<queue.length;k++){const j=queue[k],x=j%W,y=Math.floor(j/W);for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   const a=yy*W+xx;if(xx<0||yy<0||xx>=W||yy>=H||seen[a]||spill[a]!==level||m.heights[a]>=level)continue;seen[a]=1;queue.push(a);}}
  const floor=Math.min(...queue.map(j=>m.heights[j]));if(queue.length<4)continue;
  basins.push({tiles:queue.sort((a,b)=>a-b),floor,outlet:level,depth:level-floor,fed:queue.some(j=>feed.depth[j]>.05)});
 }
 const kept=basins.flatMap(b=>b.tiles).sort((a,b)=>a-b);
 for(const i of kept){(retained.tiles as number[]).push(i);(retained.floor as number[]).push(m.heights[i]);(retained.depth as number[]).push(s.meltwater?Math.max(0,spill[i]-m.heights[i]-.04):0);(retained.contamination as number[]).push(0);}
 m.water=prefill({...model,retained:[retained]});
 if(!s.meltwater){for(let i=0;i<n;i++)if(mask[i]){m.water.depth[i]=0;m.water.contamination[i]=0;}}
 const core=[...mask.keys()].filter(i=>mask[i]===1),flat=core.filter(i=>{const x=i%W,y=Math.floor(i/W);return x>0&&y>0&&x<W-1&&y<H-1&&[i-1,i+1,i-W,i+W].every(j=>m.heights[j]===m.heights[i]);});
 const widths:number[]=[],ranges:number[]=[];
 for(let k=2;k<path.length-2;k+=3){const q=path[k],a=path[k-2],b=path[k+2],len=distance(a,b)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len,hs:number[]=[];
  for(let u=-Math.floor(q.r);u<=q.r;u++)hs.push(m.heights[tile({x:q.x+nx*u,y:q.y+ny*u})]);
  const center=hs[Math.floor(hs.length/2)];let width=1;for(let j=Math.floor(hs.length/2)-1;j>=0&&hs[j]===center;j--)width++;for(let j=Math.floor(hs.length/2)+1;j<hs.length&&hs[j]===center;j++)width++;
  widths.push(width);ranges.push(Math.max(...hs)-Math.min(...hs));}
 const median=(a:number[])=>a.length?a.sort((a,b)=>a-b)[Math.floor(a.length/2)]:0;
 if(lobe){const q=path[0],row=Math.floor(q.y),center=Math.floor(q.x),z=m.heights[row*W+center];let width=1;for(let x=center-1;x>=0&&mask[row*W+x]===1&&m.heights[row*W+x]===z;x--)width++;for(let x=center+1;x<W&&mask[row*W+x]===1&&m.heights[row*W+x]===z;x++)width++;widths.push(width);}
 return {before,map:m,request:{verb:'glaciate',settings:s,intent:{...intent}},path,reference,arrival,mask,retained,basins,lobe,shallow,hanging,
  notice:shallow?'No room to deepen here · widening and building moraines':lobe?'Ice spreads into a lobe':'',
  metrics:{cut,deposited,ratio:cut?deposited/cut:1,floorWidth:median(widths),requestedWidth:sizeOf(s)*(shallow?1.35:1),crossRange:median(ranges),flatShare:flat.length/(core.length||1),centreline:sinuosity(path),valley:sinuosity(reference),outwash,treesMoved,treesUnmoved}};
}
export function waterRun(p:Plan){return canonicalRun({...modelFor(p.map),retained:[p.retained]});}
export function reveal(p:Plan,t:number):ForceMap{
 const m=snapshot(p.before),advance=clamp(t/3,0,1),retreat=clamp((t-3)/2,0,1);
 for(let i=0;i<m.heights.length;i++)if(p.arrival[i]<=advance){m.heights[i]=p.map.heights[i];m.lava[i]=p.map.lava[i];
  if(t>=3&&p.arrival[i]>=1-retreat){m.water.depth[i]=p.map.water.depth[i];m.water.contamination[i]=p.map.water.contamination[i];}
  else {m.water.depth[i]=Math.max(0,p.before.water.depth[i]+p.before.heights[i]-m.heights[i]);}}
 const final=new Map(p.map.entities.map(e=>[e.id,e]));
 m.entities=m.entities.flatMap(e=>{const i=e.y*m.W+e.x;if(p.arrival[i]>advance)return[e];return final.has(e.id)?[structuredClone(final.get(e.id)!)]:[];});
 if(t>=3)m.entities.push(...p.map.entities.filter(e=>!p.before.entities.some(b=>b.id===e.id)).map(e=>structuredClone(e)));
 m.fallen=p.map.fallen.filter(f=>m.entities.some(e=>e.id===f.id&&e.x===Math.floor(f.x)&&e.y===Math.floor(f.y)));
 return t>=5?snapshot(p.map):m;
}
