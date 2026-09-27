import {snapshot,plainEntities,modelFor,type ForceMap} from '../forces-core/core/map';
import {protectedGround,entityTiles,isPlant,ride} from '../forces-core/core/objects';
import {trimRock} from '../forces-core/core/rock';
import {MinHeap} from '../../src/core/math/grid';
import {prefill,spillLevels} from '../../src/core/sim/prefill';
import {waterSource} from '../../src/core/format/entities';
import {guidFrom} from '../../src/core/math/hash';
import {slopeHighSide} from '../../src/core/format/footprints';
import {Valley,validate,route,flatAt,sizeOf,noise,clamp,sinuosity,CEILING,type Plan,type Settings,type Intent,type Point,type Station,type Basin} from './model';

export const lengthOf=(p:Point[])=>p.reduce((s,q,k)=>s+(k?Math.hypot(q.x-p[k-1].x,q.y-p[k-1].y):0),0);
const quantile=(a:number[],q:number)=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)];

export function makePlan(input:ForceMap,settings:Settings,intent:Intent,valley=new Valley(input)):Plan {
 validate(input,settings,intent);
 const before=snapshot(input),m=snapshot(input),s={...settings},W=m.W,H=m.H,n=W*H,p=s.power/100;
 const keep=protectedGround(m),tile=(q:Point)=>clamp(Math.floor(q.y),0,H-1)*W+clamp(Math.floor(q.x),0,W-1);
 if(keep[intent.origin])throw Error('Start here');
 let reference=route(m,s,intent,valley),r=sizeOf(s)/2;
 const lobe=s.mode==='flow'&&flatAt(m,intent.origin,Math.min(10,r)),shallow=m.heights[intent.origin]<=2;
 if(shallow)r*=1.3;
 if(lobe)reference=reference.slice(0,Math.max(6,Math.round(r*2.2)));
 if(reference.length<3)throw Error('Choose ground farther from the edge');
 const length=lengthOf(reference),phase=noise(s.seed,7)*Math.PI*2;
 // The bank follows the original drainage elevation. It is a dry terrace above a
 // separate incised stream, not the bottom of a full-width longitudinal basin.
 const raw=reference.map(q=>before.heights[tile(q)]),datum=raw.map((_,k)=>{
  const level=quantile(raw.slice(Math.max(0,k-4),Math.min(raw.length,k+7)),.35);
  return clamp(level+1-(p>.85?1:0),2,20);
 });
 let acc=0,previous=shallow?2:22;
 const path:Station[]=reference.map((q,k)=>{
  if(k)acc+=Math.hypot(q.x-reference[k-1].x,q.y-reference[k-1].y);
  const t=acc/length;previous=Math.min(previous,lobe?Math.max(2,raw[0]-1):datum[k]);
  const width=(lobe?(.62+.65*Math.sin(t*Math.PI*.78)):(.83+.13*Math.sin(t*8+phase)+.08*Math.sin(t*21+phase)))+.055*Math.sin(t*39+phase);
  return {...q,s:t,r:Math.max(1.8,Math.min(r*width,(Math.min(q.x,q.y,W-q.x,H-q.y)-1.8)/1.15)),floor:previous,outlet:previous};
 });
 const nearest=new Int32Array(n).fill(-1),dist=new Float64Array(n).fill(Infinity),mask=new Uint8Array(n),arrival=new Float32Array(n).fill(1),fan=new Uint8Array(n),stream=new Uint8Array(n);
 for(let k=0;k<path.length;k++){
  const q=path[k],rr=q.r*4;
  for(let y=Math.max(0,Math.floor(q.y-rr));y<Math.min(H,q.y+rr);y++)for(let x=Math.max(0,Math.floor(q.x-rr));x<Math.min(W,q.x+rr);x++){
   const i=y*W+x,angle=Math.atan2(y+.5-q.y,x+.5-q.x);
   const rim=1+.07*Math.sin(angle*3+q.s*12+phase)+.04*Math.sin(angle*5-phase);
   const d=Math.hypot(x+.5-q.x,y+.5-q.y)/(q.r*rim);
   if(d<dist[i]){dist[i]=d;nearest[i]=k;}
  }
 }
 for(let i=0;i<n;i++){
  if(nearest[i]<0||dist[i]>1.32)continue;
  const q=path[nearest[i]],d=dist[i];
  if(keep[i]){if(d<.9)throw Error('Start here');continue;}
  const bed=q.floor;
  if(d<=1){m.heights[i]=bed;mask[i]=1;}
  else mask[i]=2; // Preserve the upper shoulder; the broad bed meets a steep curved wall.
  arrival[i]=q.s;
 }
 // Narrow stream and a complete drainage continuation. At the snout it passes
 // through a notch in the moraine, rather than damming the entire broad floor.
 const streamPath:Point[]=path.map((q,k)=>{
  const a=path[Math.max(0,k-2)],b=path[Math.min(path.length-1,k+2)],len=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const off=Math.sin(q.s*11+phase)*q.r*.08*Math.sin(q.s*Math.PI);
  return {x:q.x-(b.y-a.y)/len*off,y:q.y+(b.x-a.x)/len*off};
 });
 const end=path.at(-1)!,prior=path[Math.max(0,path.length-6)],dl=Math.hypot(end.x-prior.x,end.y-prior.y)||1,dx=(end.x-prior.x)/dl,dy=(end.y-prior.y)/dl;
 const tail=valley.path(tile(end),W*H);
 // Valley previews stop inside the edge. Hydrology must reach the actual open
 // boundary, otherwise the untouched last two rows become an accidental dam.
 let tailIndex=tile(tail.at(-1)!);
 while(valley.parent[tailIndex]>=0){tailIndex=valley.parent[tailIndex];tail.push({x:tailIndex%W+.5,y:Math.floor(tailIndex/W)+.5});}
 const tailLength=lengthOf(tail);let tailArc=0;
 const softened=tail.map((q,k)=>{
  if(k)tailArc+=Math.hypot(q.x-tail[k-1].x,q.y-tail[k-1].y);
  if(k<2||k>tail.length-3)return q;
  const group=tail.slice(Math.max(0,k-4),Math.min(tail.length,k+5)),a=tail[k-2],b=tail[k+2],len=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const off=Math.sin(tailArc*.22+phase)*.8*Math.sin(Math.PI*tailArc/(tailLength||1));
  return {x:clamp(group.reduce((s,p)=>s+p.x,0)/group.length-(b.y-a.y)/len*off,.5,W-.5),y:clamp(group.reduce((s,p)=>s+p.y,0)/group.length+(b.x-a.x)/len*off,.5,H-.5)};
 });
 const drain=[...streamPath,...softened.slice(1)];
 const channelWidth=shallow?3.8:Math.max(1.1,Math.min(1.6,sizeOf(s)*.045))*Math.max(1,W/128);
 const channelDepth=lobe?2:3;
 let bed=Math.max(0,path[0].floor-channelDepth);
 for(let k=0;k<drain.length;k++){
  const q=drain[k];bed=Math.min(bed,k<path.length?Math.max(0,path[k].floor-channelDepth):Math.max(0,before.heights[tile(q)]-1));
  for(let y=Math.max(0,Math.floor(q.y-channelWidth));y<Math.min(H,q.y+channelWidth+1);y++)for(let x=Math.max(0,Math.floor(q.x-channelWidth));x<Math.min(W,q.x+channelWidth+1);x++){
   const i=y*W+x;if(Math.hypot(x+.5-q.x,y+.5-q.y)>channelWidth)continue;
   if(keep[i])throw Error('Start here');
   m.heights[i]=Math.min(m.heights[i],bed);stream[i]=1;arrival[i]=k<path.length?path[k].s:1;
  }
 }
 // Reconnect wet side-valley entrances before raising a dry floor over the old
 // channel. Otherwise an existing river can back up against its new bank.
 const entrances=new Uint8Array(n),visited=new Uint8Array(n);
 for(let i=0;i<n;i++)if(mask[i]===2&&before.water.depth[i]>.05)entrances[i]=1;
 for(let i=0;i<n;i++)if(entrances[i]&&!visited[i]){
  const group=[i];visited[i]=1;
  for(let k=0;k<group.length;k++){const j=group[k],x=j%W,y=Math.floor(j/W);for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const a=yy*W+xx;if(xx<0||yy<0||xx>=W||yy>=H||visited[a]||!entrances[a])continue;visited[a]=1;group.push(a);}}
  const entry=group.reduce((best,j)=>before.water.depth[j]>before.water.depth[best]?j:best,group[0]),k=nearest[entry],to=streamPath[k],from={x:entry%W+.5,y:Math.floor(entry/W)+.5},len=Math.hypot(to.x-from.x,to.y-from.y),floor=m.heights[tile(to)];
  for(let step=0;step<=Math.ceil(len*3);step++){
   const t=step/Math.max(1,Math.ceil(len*3)),x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,bed=Math.floor(before.heights[entry]+(floor-before.heights[entry])*t);
   const radius=W>128?1.6:1.15;
   for(let yy=Math.max(0,Math.floor(y-radius));yy<Math.min(H,y+radius);yy++)for(let xx=Math.max(0,Math.floor(x-radius));xx<Math.min(W,x+radius);xx++){
    const j=yy*W+xx;if(keep[j]||Math.hypot(xx+.5-x,yy+.5-y)>radius)continue;m.heights[j]=Math.min(m.heights[j],bed);stream[j]=1;arrival[j]=path[k].s;
   }
  }
 }
 // A small head tarn and one narrow terminal lake. The valley banks remain above
 // both outlets; no cross-valley sills are stamped across the buildable floor.
 const lakeSeeds:number[]=[];
 const lakePositions=lobe?[.2]:length<r*3.5?[]:[.1+noise(s.seed,31)*.04,.76+noise(s.seed,32)*.09];
 for(const t of lakePositions){
  const k=path.findIndex(q=>q.s>=t),q=path[Math.max(0,k)],c=streamPath[Math.max(0,k)];
  if(q.floor<channelDepth+1)continue;
  const a=path[Math.max(0,k-2)],b=path[Math.min(path.length-1,k+2)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
  const longitudinal=lobe?3:t<.3?3:Math.min(6,q.r*.55),transverse=lobe?1.6:Math.max(1.6,Math.min(2.6,q.r*.2));
  for(let y=Math.max(0,Math.floor(c.y-longitudinal));y<Math.min(H,c.y+longitudinal+1);y++)for(let x=Math.max(0,Math.floor(c.x-longitudinal));x<Math.min(W,c.x+longitudinal+1);x++){
   const i=y*W+x,ex=x+.5-c.x,ey=y+.5-c.y,along=ex*ux+ey*uy,across=-ex*uy+ey*ux;
   if(mask[i]!==1||(along/longitudinal)**2+(across/transverse)**2>1+.09*Math.sin(along+phase))continue;
   m.heights[i]=Math.min(m.heights[i],q.floor-channelDepth-1);lakeSeeds.push(i);
  }
 }
 // Grade a rounded, downstream fan as part of the cut/fill ledger. Its banks are
 // above the outlet stream. Forward room is a property of this terrain, not a knob.
 const fanLevel=Math.min(CEILING,end.floor),candidates:{i:number;cap:number;score:number;fan:boolean}[]=[];
 for(let i=0;i<n;i++){
  if(keep[i]||mask[i]||stream[i]||before.water.depth[i]>.05)continue;
  const ex=i%W+.5-end.x,ey=Math.floor(i/W)+.5-end.y,along=ex*dx+ey*dy,across=-ex*dy+ey*dx;
  const centre=r*1.65,reach=r*1.55,width=r*1.45;
  const oval=((along-centre)/reach)**2+(across/width)**2;
  if(along>r*.3&&oval<1+.09*Math.sin(across*.22+phase)&&before.heights[i]<=fanLevel+2){
   if(oval<.78){m.heights[i]=fanLevel;fan[i]=1;arrival[i]=1;}
   else if(m.heights[i]<fanLevel)candidates.push({i,cap:fanLevel,score:0,fan:true});
  }
 }
 // Low irregular moraine arcs and lateral ridges, open at the stream. No closed
 // circular rim and no uniform radial apron. Deposition follows the full tongue.
 for(let i=0;i<n;i++){
  if(keep[i]||mask[i]||stream[i]||fan[i]||before.water.depth[i]>.05)continue;
  const ex=i%W+.5-end.x,ey=Math.floor(i/W)+.5-end.y,along=ex*dx+ey*dy,rad=Math.hypot(ex,ey),angle=Math.atan2(ey,ex);
  const terminal=along>0&&Math.abs(rad-r*1.12*(1+.11*Math.sin(angle*3+phase)))<r*.23;
  const side=nearest[i]>=0&&dist[i]>1.32&&dist[i]<2.7;
  if(terminal||side){
   const bump=terminal?3:Math.max(1,Math.round(3.5*Math.sin((dist[i]-1.32)/1.38*Math.PI)));
   candidates.push({i,cap:Math.min(CEILING,before.heights[i]+bump),score:terminal?1:3+Math.abs(dist[i]-1.85)*3,fan:false});
  }
 }
 let cut=0,filled=0;for(let i=0;i<n;i++){cut+=Math.max(0,before.heights[i]-m.heights[i]);filled+=Math.max(0,m.heights[i]-before.heights[i]);}
 if(filled>cut){
  // Near level zero, widening also shears the higher shoulder for the fill that
  // raises dry ground. This is literal cut material, never created sediment.
  const borrow=[...nearest.keys()].filter(i=>nearest[i]>=0&&!keep[i]&&!stream[i]&&dist[i]>1&&dist[i]<1.75&&m.heights[i]>path[nearest[i]].floor);
  borrow.sort((a,b)=>dist[a]-dist[b]||a-b);
  for(const i of borrow){const take=Math.min(filled-cut,m.heights[i]-path[nearest[i]].floor);m.heights[i]-=take;cut+=take;mask[i]=2;if(cut>=filled)break;}
  if(filled>cut)throw Error('Not enough ice-cut material to build the dry valley here');
 }
 // Fill narrow low ledges against existing terraces before adding free-standing
 // ridges. Completing each pad makes usable ground instead of scattered humps.
 for(let i=0;i<n;i++){
  if(nearest[i]<0||dist[i]<1.32||dist[i]>3.8||keep[i]||stream[i]||fan[i]||mask[i]||before.water.depth[i]>.05)continue;
  const x=i%W,y=Math.floor(i/W);let target=before.heights[i];
  for(let yy=Math.max(0,y-3);yy<=Math.min(H-1,y+3);yy++)for(let xx=Math.max(0,x-3);xx<=Math.min(W-1,x+3);xx++)target=Math.max(target,before.heights[yy*W+xx]);
  const cap=Math.min(CEILING,before.heights[i]+4,target);
  if(cap>m.heights[i])candidates.push({i,cap,score:-4+(cap-m.heights[i])*.1,fan:false});
 }
 const by=new Map(candidates.map(c=>[c.i,c])),heap=new MinHeap();
 for(const c of by.values())if(m.heights[c.i]<c.cap)heap.push(c.score+(c.cap-m.heights[c.i])*.1,c.i);
 let left=cut-filled;
 while(left&&heap.size){const i=heap.pop(),c=by.get(i)!;m.heights[i]++;left--;arrival[i]=nearest[i]>=0?path[nearest[i]].s:1;if(c.fan)fan[i]=1;
  if(m.heights[i]<c.cap)heap.push(c.score+(c.cap-m.heights[i])*.1,i);
 }
 if(left)throw Error('Not enough room to deposit the moraine · choose a smaller glacier');
 // Pair one-block cuts and fills to join broken ledges into connected building
 // pads. Each accepted side improves local flat ground; the pair conserves mass.
 // Keep the stream, lakes, fan and protected/entity footprints out of this pass.
 const occupied=new Uint8Array(keep);for(const e of m.entities)if(!isPlant(e))for(const i of entityTiles(m,e))occupied[i]=1;
 const pad=(x:number,y:number,at:number,changed:number)=>{
  const h=(i:number)=>i===at?changed:m.heights[i];
  for(let yy=y-1;yy<=y;yy++)for(let xx=x-1;xx<=x;xx++){
   if(xx<0||yy<0||xx>=W-1||yy>=H-1)continue;
   const j=yy*W+xx;if([j+1,j+W,j+W+1].every(k=>h(k)===h(j)))return 1;
  }return 0;
 };
 const benefit=(i:number,delta:number)=>{
  const x=i%W,y=Math.floor(i/W),h=m.heights[i],to=h+delta;
  if(to<0||to>CEILING)return 0;
  let neighbours=0;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if((xx!==x||yy!==y)&&xx>=0&&yy>=0&&xx<W&&yy<H&&m.heights[yy*W+xx]===to)neighbours++;
  if(neighbours<3)return 0;
  let gain=0;for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)gain+=pad(xx,yy,i,to)-pad(xx,yy,i,h);
  return gain;
 };
 const grading=[...nearest.keys()].filter(i=>nearest[i]>=0&&dist[i]>1.02&&dist[i]<3.8&&!occupied[i]&&!fan[i]&&!stream[i]&&before.water.depth[i]<.01);
 for(let pass=0;pass<6;pass++){
  const donors=grading.filter(i=>benefit(i,-1)>0),receivers=grading.filter(i=>benefit(i,1)>0);
  let a=0,b=0;
  while(a<donors.length&&b<receivers.length){const from=donors[a++];if(benefit(from,-1)<=0)continue;m.heights[from]--;
   while(b<receivers.length&&benefit(receivers[b],1)<=0)b++;
   if(b>=receivers.length){m.heights[from]++;break;}const to=receivers[b++];
   m.heights[to]++;arrival[from]=path[nearest[from]].s;arrival[to]=path[nearest[to]].s;
  }
 }
 cut=0;for(let i=0;i<n;i++)cut+=Math.max(0,before.heights[i]-m.heights[i]);
 const hanging:number[]=[];for(let i=0;i<n;i++)if(mask[i]===2&&before.water.depth[i]>.03&&before.heights[i]-m.heights[i]>=2)hanging.push(i);
 // Non-plants in the swept trough are removed, never kept as pillars/islands.
 // Trees are carried to dry supported moraine ground with real exported positions.
 const used=new Set<number>();for(const e of m.entities)if(!isPlant(e)||entityTiles(m,e).every(i=>!mask[i]))for(const i of entityTiles(m,e))used.add(i);
 let treesMoved=0,objectsRemoved=0;
 const treeSites=[...by.keys()].filter(i=>!mask[i]&&!stream[i]&&!keep[i]&&m.heights[i]>=before.heights[i]);
 m.entities=m.entities.filter(e=>{
  const cells=entityTiles(m,e),swept=cells.some(i=>mask[i]===1||stream[i]),changed=cells.some(i=>before.heights[i]!==m.heights[i]);
  if(e.template==='StartingLocation')return true;
  if(e.owner.startsWith('pinned:')&&(swept||changed))throw Error('Pinned object here');
  if(isPlant(e)&&cells.some(i=>mask[i]||stream[i])){
   let dest=-1,best=Infinity;for(const i of treeSites){if(used.has(i))continue;const d=(i%W-e.x)**2+(Math.floor(i/W)-e.y)**2;if(d<best){best=d;dest=i;}}
   if(dest<0)throw Error('Not enough room for trees at the ice edge');
   e.x=dest%W;e.y=Math.floor(dest/W);ride(e,m.heights[dest]);delete e.raw;used.add(dest);treesMoved++;return true;
  }
  if(!isPlant(e)&&swept){objectsRemoved++;return false;}
  if(!changed)return true;
  if(cells.every(i=>m.heights[i]===m.heights[cells[0]])){ride(e,m.heights[cells[0]]);return true;}
  objectsRemoved++;return false;
 });
 let removed=true;while(removed){removed=false;const slopes=new Map(m.entities.filter(e=>e.template==='Slope').map(e=>[e.y*W+e.x,e]));
  m.entities=m.entities.filter(e=>{if(e.template!=='Slope')return true;const [dx,dy]=slopeHighSide(e.orientation),hx=e.x+dx,hy=e.y+dy,lx=e.x-dx,ly=e.y-dy;
   if(hx>=0&&hy>=0&&hx<W&&hy<H&&lx>=0&&ly>=0&&lx<W&&ly<H&&m.heights[hy*W+hx]===e.z+1&&(m.heights[ly*W+lx]===e.z||slopes.get(ly*W+lx)?.z===e.z-1))return true;
   if(e.owner.startsWith('pinned:'))throw Error('Pinned slope would lose its connection');removed=true;objectsRemoved++;return false;
  });
 }
 m.fallen=m.fallen.filter(f=>m.entities.some(e=>e.id===f.id));trimRock(m);
 if(s.meltwater){let serial=0,id=guidFrom('glaciate',s.seed,intent.origin,serial);while(m.entities.some(e=>e.id===id))id=guidFrom('glaciate',s.seed,intent.origin,++serial);
  const i=tile(streamPath[0]);m.entities.push(waterSource({id,owner:'glaciate',x:i%W,y:Math.floor(i/W),z:m.heights[i],strength:Math.min(2,.4+sizeOf(s)*.025)}));
 }
 m.entities=plainEntities(m.entities);
 const model=modelFor(m),spill=spillLevels(model),feed=prefill(model),seen=new Uint8Array(n),basins:Basin[]=[],retained={tiles:[] as number[],floor:[] as number[],depth:[] as number[],contamination:[] as number[]};
 for(const i of lakeSeeds){if(seen[i]||spill[i]<=m.heights[i])continue;
  const level=spill[i],queue=[i];seen[i]=1;
  for(let k=0;k<queue.length;k++){const j=queue[k],x=j%W,y=Math.floor(j/W);for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   const a=yy*W+xx;if(xx<0||yy<0||xx>=W||yy>=H||seen[a]||spill[a]!==level||m.heights[a]>=level)continue;seen[a]=1;queue.push(a);}}
  if(queue.length<3)continue;const floor=Math.min(...queue.map(j=>m.heights[j]));basins.push({tiles:queue.sort((a,b)=>a-b),floor,outlet:level,depth:level-floor,fed:queue.some(j=>feed.depth[j]>.01)});
 }
 for(const i of [...new Set(basins.flatMap(b=>b.tiles))].sort((a,b)=>a-b)){
  retained.tiles.push(i);retained.floor.push(m.heights[i]);retained.depth.push(s.meltwater?Math.max(0,spill[i]-m.heights[i]-.04):0);retained.contamination.push(0);
 }
 m.water=prefill({...model,retained:[retained]});
 let outwash=0;for(let i=0;i<n;i++)if(fan[i])outwash+=Math.max(0,m.heights[i]-before.heights[i]);
 const result:Plan={before,map:m,request:{verb:'glaciate',settings:s,intent:{...intent}},path,reference,arrival,mask,stream,fan,retained,basins,lobe,shallow,hanging,
  notice:shallow?'No room to deepen here · widening and building dry ground':lobe?'A shallow sweep of land':'',
  metrics:{cut,deposited:cut,ratio:1,floorWidth:0,requestedWidth:sizeOf(s)*(shallow?1.3:1),crossRange:0,flatShare:0,centreline:sinuosity(path),valley:sinuosity(reference),outwash,treesMoved,treesUnmoved:0,objectsRemoved,dryFloor:0,troughTiles:0,wetShare:0,length,valleyLength:lengthOf(reference),longestWall:0,buildableBefore:0,buildableAfter:0,buildableGain:0,directGain:0,outwashDry:0}};
 measure(result);return result;
}

/** Dry tiles belonging to a level 2×2 pad. Trees can be cleared; other objects
 * occupy their actual footprints. This measures building space, not path access. */
export function buildable(m:ForceMap){
 const {W,H}=m,blocked=protectedGround(m),flat=new Uint8Array(W*H);
 for(const e of m.entities)if(!isPlant(e))for(const i of entityTiles(m,e))blocked[i]=1;
 for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
  const i=y*W+x,a=[i,i+1,i+W,i+W+1];
  if(a.every(j=>!blocked[j]&&m.water.depth[j]<=.05&&m.heights[j]===m.heights[i]))for(const j of a)flat[j]=1;
 }return flat;
}

export function measure(p:Plan){
 const {map:m,before,mask,fan}=p,{W,H}=m,a=buildable(before),b=buildable(m),q=p.metrics;
 q.troughTiles=0;q.dryFloor=0;q.wetShare=0;q.buildableBefore=0;q.buildableAfter=0;q.outwashDry=0;q.directGain=0;
 // Count the same affected region before and after: changed ground, wet/dry
 // transitions and changed object footprints, plus the one-tile pad collar.
 const region=new Uint8Array(W*H),mark=(i:number)=>{const x=i%W,y=Math.floor(i/W);for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)region[yy*W+xx]=1;};
 for(let i=0;i<W*H;i++)if(mask[i]||before.heights[i]!==m.heights[i]||(before.water.depth[i]>.05)!==(m.water.depth[i]>.05))mark(i);
 const oldEntities=new Map(before.entities.map(e=>[e.id,e])),newEntities=new Map(m.entities.map(e=>[e.id,e]));
 for(const e of [...before.entities,...m.entities]){if(isPlant(e))continue;const old=oldEntities.get(e.id),now=newEntities.get(e.id);if(!old||!now||old.x!==now.x||old.y!==now.y||old.z!==now.z)for(const i of entityTiles(m,e))mark(i);}
 let wet=0,level=0;const widths:number[]=[],ranges:number[]=[];
 for(let i=0;i<W*H;i++){
  if(mask[i]===1){q.troughTiles++;wet+=Number(m.water.depth[i]>.05);q.dryFloor+=b[i];level+=Number([i-1,i+1,i-W,i+W].every(j=>j>=0&&j<W*H&&m.heights[j]===m.heights[i]));}
  if(mask[i]||before.heights[i]!==m.heights[i])q.directGain+=b[i]-a[i];
  if(region[i]){q.buildableBefore+=a[i];q.buildableAfter+=b[i];}
  if(fan[i]&&m.heights[i]>before.heights[i])q.outwashDry+=b[i];
 }
 q.wetShare=wet/(q.troughTiles||1);q.flatShare=level/(q.troughTiles||1);q.buildableGain=q.buildableAfter-q.buildableBefore;
 // Longest exact cardinal wall run on the rasterized trough outline. Include
 // the whole perimeter (not just the freshly excavated vertical faces).
 let longest=0;
 for(let y=0;y<=H;y++){let run=0,last=0;for(let x=0;x<W;x++){const side=(y>0&&mask[(y-1)*W+x]===1?1:0)-(y<H&&mask[y*W+x]===1?1:0);run=side&&side===last?run+1:side?1:0;last=side;longest=Math.max(longest,run);}}
 for(let x=0;x<=W;x++){let run=0,last=0;for(let y=0;y<H;y++){const side=(x>0&&mask[y*W+x-1]===1?1:0)-(x<W&&mask[y*W+x]===1?1:0);run=side&&side===last?run+1:side?1:0;last=side;longest=Math.max(longest,run);}}
 q.longestWall=longest;
 for(let k=2;k<p.path.length-2;k+=3){const pt=p.path[k],a=p.path[k-2],b=p.path[k+2],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len,heights:number[]=[];let run=0,best=0,previous=-1;
  for(let u=-Math.floor(pt.r);u<=pt.r;u++){const x=clamp(Math.floor(pt.x+nx*u),0,W-1),y=clamp(Math.floor(pt.y+ny*u),0,H-1),i=y*W+x,h=m.heights[i];heights.push(h);run=m.water.depth[i]<=.05?(h===previous?run+1:1):0;previous=h;best=Math.max(best,run);}
  widths.push(best);ranges.push(Math.max(...heights)-Math.min(...heights));
 }
 q.floorWidth=widths.length?quantile(widths,.5):0;q.crossRange=ranges.length?quantile(ranges,.5):0;
 return q;
}
