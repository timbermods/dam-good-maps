import {snapshot,plainEntities,modelFor,type ForceMap} from '../forces-core/core/map';
import {entityTiles,isPlant,ride} from '../forces-core/core/objects';
import {trimRock,hardAt} from '../forces-core/core/rock';
import {prefill,spillLevels} from '../../src/core/sim/prefill';
import {waterSource} from '../../src/core/format/entities';
import {guidFrom} from '../../src/core/math/hash';
import {slopeHighSide} from '../../src/core/format/footprints';
import {EMITTERS} from '../../src/core/sim/model';
import {Valley,validate,route,sizeOf,noise,clamp,sinuosity,type Plan,type Settings,type Intent,type Point,type Station,type Basin,type Hanging} from './model';
export const PHYSICAL='At the map floor: no ground left to carve';
export const lengthOf=(p:Point[])=>p.reduce((s,q,k)=>s+(k?Math.hypot(q.x-p[k-1].x,q.y-p[k-1].y):0),0);
const quantile=(a:number[],q:number)=>a.length?a.sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]:0;
const N4=[[-1,0],[1,0],[0,-1],[0,1]];
const texture=(seed:number,x:number,y:number,scale:number)=>{const gx=Math.floor(x/scale),gy=Math.floor(y/scale),tx=x/scale-gx,ty=y/scale-gy,u=tx*tx*(3-2*tx),v=ty*ty*(3-2*ty),at=(xx:number,yy:number)=>noise(seed,Math.imul(xx,73856093)^Math.imul(yy,19349663))*2-1;return (at(gx,gy)*(1-u)+at(gx+1,gy)*u)*(1-v)+(at(gx,gy+1)*(1-u)+at(gx+1,gy+1)*u)*v;};

export function makePlan(input:ForceMap,settings:Settings,intent:Intent,valley=new Valley(input)):Plan {
 validate(input,settings,intent);
 const before=snapshot(input),m=snapshot(input),s={...settings},W=m.W,H=m.H,n=W*H,p=s.power/100,r=sizeOf(s)/2,phase=noise(s.seed,7)*Math.PI*2;
 const tile=(q:Point)=>clamp(Math.floor(q.y),0,H-1)*W+clamp(Math.floor(q.x),0,W-1),sample=(x:number,y:number)=>before.heights[tile({x,y})];
 let reference=route(m,s,intent,valley);const head=reference[0],regional:number[]=[],radius=Math.max(16,Math.min(W*.2,r*2));
 for(let y=Math.max(0,Math.floor(head.y-radius));y<Math.min(H,head.y+radius);y+=2)for(let x=Math.max(0,Math.floor(head.x-radius));x<Math.min(W,head.x+radius);x+=2)regional.push(sample(x,y));
 const base=quantile(Array.from(m.heights),.08),relief=quantile(regional,.9)-Math.min(base,quantile(regional,.15));
 // Relief chooses depth, never permission. Even a plateau gets three levels of
 // excavation where its ground allows it; only the physical map floor stops it.
 const depth=Math.max(3,Math.round(relief*(.28+.48*p))),headFloor=Math.max(0,Math.min(sample(head.x,head.y)-4,quantile(regional,.8)-depth-1));
 let arc=0,bar=8+noise(s.seed,80)*15,level=headFloor,barIndex=0;
 const preliminary:Station[]=reference.map((q,k)=>{if(k)arc+=Math.hypot(q.x-reference[k-1].x,q.y-reference[k-1].y);if(arc>=bar&&level>0){level--;bar+=8+noise(s.seed,81+barIndex++)*17;}
  const a=reference[Math.max(0,k-3)],b=reference[Math.min(reference.length-1,k+3)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
  const rim=Math.max(sample(q.x+nx*r*1.15,q.y+ny*r*1.15),sample(q.x-nx*r*1.15,q.y-ny*r*1.15)),hard=hardAt(m,tile(q),Math.round(rim))?1:m.rockLayers[Math.round(rim)]??0,confluence=Math.min(.1,Math.log2(1+valley.area[tile(q)])*.011);
  const width=clamp(.94+.14*Math.sin(arc*.11+phase)+.10*Math.sin(arc*.27-phase)+confluence-hard*.10,.7,1.3),cirque=1+.72*Math.exp(-((arc/(r*.95))**2));
  return {...q,s:arc,r:Math.max(2,Math.min(r*width*cirque,Math.max(2,Math.min(q.x,q.y,W-q.x,H-q.y)-1)*.9)),floor:level,outlet:rim};
 });
 let lowRun=0,end=preliminary.length;
 if(s.mode==='flow')for(let k=0;k<preliminary.length;k++){const q=preliminary[k];lowRun=q.outlet<base+1+relief*.35?lowRun+1:0;if(q.s>Math.max(16,sizeOf(s)*1.15)&&(lowRun>=7||Math.min(q.x,q.y,W-q.x,H-q.y)<r*.5)){end=Math.max(8,k-(lowRun>=7?5:0));break;}}
 const path=preliminary.slice(0,end);reference=reference.slice(0,end);const length=lengthOf(reference)||1;for(const q of path)q.s/=length;
 // A new floor cannot dam an old river crossing below its proposed datum.
 // Lower the terrace sequence together, retaining single-level bars, rather
 // than cutting a separate deep drainage slot through the new valley.
 let riverClearance=0;for(const q of path)for(let y=Math.max(0,Math.floor(q.y-q.r));y<Math.min(H,q.y+q.r);y++)for(let x=Math.max(0,Math.floor(q.x-q.r));x<Math.min(W,q.x+q.r);x++){const i=y*W+x;if(before.water.depth[i]>.05&&Math.hypot(x+.5-q.x,y+.5-q.y)<=q.r)riverClearance=Math.max(riverClearance,q.floor-before.heights[i]);}
 for(const q of path)q.floor=Math.max(0,q.floor-riverClearance);
 const nearest=new Int32Array(n).fill(-1),closest=new Float64Array(n).fill(Infinity),dist=new Float64Array(n).fill(Infinity),mask=new Uint8Array(n),arrival=new Float32Array(n).fill(1),floor=new Uint8Array(n),fan=new Uint8Array(n),stream=new Uint8Array(n);
 for(let k=0;k<path.length;k++){const q=path[k],rr=q.r+7;for(let y=Math.max(0,Math.floor(q.y-rr));y<Math.min(H,q.y+rr);y++)for(let x=Math.max(0,Math.floor(q.x-rr));x<Math.min(W,q.x+rr);x++){
  const i=y*W+x,angle=Math.atan2(y+.5-q.y,x+.5-q.x),rim=1+.045*Math.sin(angle*3+q.s*11+phase)+.1*texture(s.seed,x,y,9)+.045*texture(s.seed^812,x,y,3),physical=Math.hypot(x+.5-q.x,y+.5-q.y),d=physical/(q.r*rim);if(d<dist[i])dist[i]=d;if(physical<closest[i]){closest[i]=physical;nearest[i]=k;}
 }}
 for(let i=0;i<n;i++){if(nearest[i]<0)continue;const k=nearest[i],q=path[k],d=dist[i],shift=Math.round(2.2*Math.sin((i%W)*.22+Math.floor(i/W)*.16+phase)),f=path[clamp(k+shift,0,path.length-1)].floor;floor[i]=f;
  if(d<=1){m.heights[i]=Math.min(22,f+1);mask[i]=1;arrival[i]=q.s;}
  else if(d<1+3/q.r){const M=before.heights[i],hard=hardAt(m,i,M)?1:m.rockLayers[Math.max(f+1,Math.floor((f+M)/2))]??0;if(M-f>=5&&hard<.5&&Math.sin(q.s*19+phase)>.15){m.heights[i]=Math.min(M,f+Math.round((M-f)*.58));mask[i]=2;arrival[i]=q.s;}}
 }
 // Original drainage intersections supply hanging mouths. Sparse fed mouths
 // guide broad river bends; unfed gullies remain high and dry rather than ducts.
 const incoming:{lip:number;landing:number;k:number;area:number;oldWet:boolean}[]=[];
 for(let i=0;i<n;i++)if(mask[i]!==1&&nearest[i]>=0){const k=nearest[i],q=path[k];if(q.s<.12||q.s>.88)continue;const x=i%W,y=Math.floor(i/W),inside=N4.map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(a=>a.x>=0&&a.y>=0&&a.x<W&&a.y<H).map(a=>a.y*W+a.x).filter(j=>mask[j]===1);if(!inside.length||before.heights[i]-q.floor<4)continue;
  const parent=valley.parent[i],oldWet=before.water.depth[i]>.03&&before.water.contamination[i]<.01;if(!oldWet&&(parent<0||mask[parent]!==1||valley.area[i]<10))continue;incoming.push({lip:i,landing:inside[0],k,area:valley.area[i],oldWet});
 }
 incoming.sort((a,b)=>(b.oldWet?100000:0)+b.area-((a.oldWet?100000:0)+a.area)||a.lip-b.lip);
 const mouths:typeof incoming=[];for(const c of incoming)if(!mouths.some(h=>Math.hypot(h.lip%W-c.lip%W,Math.floor(h.lip/W)-Math.floor(c.lip/W))<7))mouths.push(c);
 const bends:typeof incoming=[];for(const c of mouths)if((c.oldWet||c.area>=20)&&!bends.some(b=>Math.abs(path[b.k].s-path[c.k].s)*length<Math.max(14,r*1.2)))bends.push(c);
 const streamPath:Point[]=path.map((q,k)=>{const a=path[Math.max(0,k-3)],b=path[Math.min(path.length-1,k+3)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;let off=Math.sin(q.s*8+phase)*q.r*.35*Math.sin(Math.PI*q.s),weight=0;
  for(const c of bends){const d=(q.s-path[c.k].s)*length,w=Math.exp(-((d/Math.max(10,r*.85))**2)),target=(c.landing%W+.5-q.x)*nx+(Math.floor(c.landing/W)+.5-q.y)*ny;off+=clamp(target,-q.r*.82,q.r*.82)*w;weight+=w;}off=clamp(off/(1+weight*.18),-q.r*.84,q.r*.84);return {x:q.x+nx*off,y:q.y+ny*off};
 });
 const channel=(points:Point[],beds:number[],width:number,at:number,kind=2,record?:number[],exact=false)=>{for(let k=0;k<points.length;k++){const a=points[Math.max(0,k-1)],b=points[k],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*3));for(let j=0;j<=steps;j++){const t=j/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,bed=Math.min(beds[Math.max(0,k-1)],beds[k]);for(let yy=Math.max(0,Math.floor(y-width));yy<Math.min(H,y+width+1);yy++)for(let xx=Math.max(0,Math.floor(x-width));xx<Math.min(W,x+width+1);xx++){if(Math.hypot(xx+.5-x,yy+.5-y)>width)continue;const i=yy*W+xx;if(kind<=2&&at<1&&mask[i]!==1)continue;m.heights[i]=exact?bed:Math.min(m.heights[i],bed);stream[i]=kind;arrival[i]=at>=0?at:path[Math.min(k,path.length-1)].s;record?.push(i);}}}};
 // Swept sources contribute their effective clean strength to the new head.
 // Badwater contributes nothing. Outside sources and forests are never moved.
 let cleanAbsorbed=0,badSwept=0;const sweptSourceIds=new Set<string>();
 const absorb=()=>{for(const e of before.entities){if(!EMITTERS[e.template]||sweptSourceIds.has(e.id)||!entityTiles(m,e).some(i=>mask[i]===1||before.heights[i]!==m.heights[i]||stream[i]))continue;const emitters=modelFor({...before,entities:[e]}).emitters;if(!emitters.length)continue;sweptSourceIds.add(e.id);for(const emitter of emitters)if(emitter.contamination>0)badSwept+=emitter.strength;else cleanAbsorbed+=emitter.strength;}};absorb();
 const potentialCleanFlow=modelFor(before).emitters.filter(e=>e.contamination===0).reduce((sum,e)=>sum+e.strength,0);
 const riverRadius=clamp(1+sizeOf(s)/32+Math.sqrt(potentialCleanFlow)*.2,1,2.5);
 // The river occupies the lowest floor datum, with broad banks a single voxel
 // above it. There is no F-2/F-3 slot and no raised levee or collector network.
 channel(streamPath,path.map(q=>q.floor),riverRadius,-1,1,undefined,true);
 const riverCells=Uint8Array.from(stream,v=>v===1?1:0);
 for(let i=0;i<n;i++)if(riverCells[i])for(const [dx,dy]of N4){const x=i%W+dx,y=Math.floor(i/W)+dy,j=y*W+x;if(x>=0&&y>=0&&x<W&&y<H&&mask[j]===1&&!riverCells[j])m.heights[j]=Math.min(22,floor[j]+1);}
 const tarn=streamPath[Math.min(3,path.length-1)],lakeSeeds:number[]=[];
 for(let y=Math.max(0,Math.floor(tarn.y-4));y<Math.min(H,tarn.y+4);y++)for(let x=Math.max(0,Math.floor(tarn.x-5));x<Math.min(W,tarn.x+5);x++){const i=y*W+x;if(((x+.5-tarn.x)/4.2)**2+((y+.5-tarn.y)/3.1)**2<1&&mask[i]===1){m.heights[i]=Math.max(0,path[0].floor-1);lakeSeeds.push(i);stream[i]=2;arrival[i]=0;}}
 const hanging:Hanging[]=[],upstream:number[][]=Array.from({length:n},()=>[]);for(let i=0;i<n;i++)if(valley.parent[i]>=0)upstream[valley.parent[i]].push(i);
 for(const c of mouths){const chain=[c.lip];let at=c.lip;for(let k=0;k<Math.max(18,r*2.5);k++){const options=upstream[at].filter(j=>mask[j]!==1);if(!options.length)break;at=options.reduce((a,b)=>valley.area[a]>valley.area[b]?a:b);chain.push(at);if(k>8&&before.heights[at]>=before.heights[c.lip]+2)break;}
  const head=chain.at(-1)!,from={x:c.landing%W+.5,y:Math.floor(c.landing/W)+.5},near=streamPath.reduce((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)<Math.hypot(b.x-from.x,b.y-from.y)?a:b),gap=Math.max(0,Math.hypot(near.x-from.x,near.y-from.y)-riverRadius-1.5),enough=chain.length>=4&&c.area>=18&&before.heights[head]>=before.heights[c.lip],feed=s.meltwater&&enough&&!c.oldWet&&gap<=5,cells:number[]=[];
  if(feed||c.oldWet){channel(chain.slice().reverse().map(i=>({x:i%W+.5,y:Math.floor(i/W)+.5})),chain.slice().reverse().map(i=>Math.max(0,before.heights[i]-1)),.76,path[c.k].s,3,cells);for(const i of cells)if(mask[i]!==1)m.heights[i]=Math.max(m.heights[i],before.heights[i]-2);}
  m.heights[c.lip]=before.heights[c.lip]-(feed||c.oldWet?1:0);arrival[c.lip]=path[c.k].s;
  // Small plunge pool; only a short AT-GRADE joining reach. Far mouths are left
  // without invented springs rather than connected by long excavation ditches.
  if(feed||c.oldWet){channel([from],[Math.max(0,path[c.k].floor-1)],1.8,path[c.k].s,2,cells);if(gap<=5)channel([from,near],[path[c.k].floor,path[c.k].floor],Math.max(1,riverRadius*.7),path[c.k].s,2,cells,true);}
  hanging.push({mouth:c.lip,lip:c.lip,landing:c.landing,source:feed?head:null,catchment:c.area,drop:m.heights[c.lip]-m.heights[c.landing],s:path[c.k].s,wet:false,channel:[...new Set(cells)],joinLength:feed||c.oldWet?gap:0});
 }
 const scree=hanging.filter(h=>h.source!==null||before.water.depth[h.mouth]>.03).map(h=>h.landing);for(let k=6;k<path.length;k+=7)if(noise(s.seed,k+550)>.68){const q=path[k],a=path[k-2],b=path[Math.min(k+2,path.length-1)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,side=noise(s.seed,k+900)>.5?1:-1;scree.push(tile({x:q.x-(b.y-a.y)/len*q.r*.87*side,y:q.y+(b.x-a.x)/len*q.r*.87*side}));}
 for(const centre of scree){const cx=centre%W+.5,cy=Math.floor(centre/W)+.5,rad=2.5+noise(s.seed,centre)*2;for(let y=Math.max(0,Math.floor(cy-rad));y<Math.min(H,cy+rad);y++)for(let x=Math.max(0,Math.floor(cx-rad));x<Math.min(W,cx+rad);x++){const i=y*W+x,d=Math.hypot(x+.5-cx,y+.5-cy);if(mask[i]!==1||stream[i]||d>rad)continue;m.heights[i]=Math.max(floor[i],Math.min(before.heights[i],floor[i]+Math.floor((1-d/rad)*3)));}}
 const snout=path.at(-1)!,prior=path[Math.max(0,path.length-7)],dl=Math.hypot(snout.x-prior.x,snout.y-prior.y)||1,dx=(snout.x-prior.x)/dl,dy=(snout.y-prior.y)/dl;
 for(let i=0;i<n;i++){const ex=i%W+.5-snout.x,ey=Math.floor(i/W)+.5-snout.y,along=ex*dx+ey*dy,rad=Math.hypot(ex,ey),angle=Math.atan2(ey,ex);if(along>0&&Math.abs(rad-snout.r*.92*(1+.10*Math.sin(angle*3+phase)))<1.6&&!stream[i]){m.heights[i]=Math.max(m.heights[i],Math.min(22,snout.floor+1+(noise(s.seed,i)>.73?1:0)));mask[i]=2;arrival[i]=1;}
  const across=-ex*dy+ey*dx,width=r*(.75+along/(r*3));if(along>snout.r&&along<snout.r+r*2.8&&Math.abs(across)<width*(1+.1*Math.sin(along*.2+phase))&&before.heights[i]<snout.floor&&!stream[i]){const target=Math.max(0,snout.floor-Math.floor((along-snout.r)/(10+noise(s.seed,19)*7)));if(target>before.heights[i]){m.heights[i]=target;fan[i]=1;arrival[i]=1;}}
 }
 // One open downstream river, continuing to the original drainage outlet.
 // This is a broad extension at its floor level, not several fan braids.
 const tail=valley.path(tile(snout),n);let tailIndex=tile(tail.at(-1)!);while(valley.parent[tailIndex]>=0){tailIndex=valley.parent[tailIndex];tail.push({x:tailIndex%W+.5,y:Math.floor(tailIndex/W)+.5});}
 let bed=snout.floor;const beds=tail.map(q=>bed=Math.min(bed,before.heights[tile(q)]));channel([streamPath.at(-1)!,...tail],[snout.floor,...beds],riverRadius,1,1);
 // Seal only the banks, including the tarn and plunge pools. Keeping a bank at
 // the adjacent higher datum prevents a bar's one-level drop opening a second
 // accidental river across the dry floor. The river itself remains at F.
 for(let i=0;i<n;i++)if(mask[i]===1&&!stream[i])m.heights[i]=Math.max(m.heights[i],Math.min(22,floor[i]+1));
 absorb();let treesRemoved=0,objectsRemoved=0,startMoved=false;const originalStart=m.entities.find(e=>e.template==='StartingLocation');
 m.entities=m.entities.filter(e=>{if(e.template==='StartingLocation')return true;const cells=entityTiles(m,e);if(cells.some(i=>mask[i]===1||stream[i]||before.heights[i]!==m.heights[i])){if(isPlant(e))treesRemoved++;else objectsRemoved++;return false;}return true;});
 if(originalStart&&entityTiles(m,originalStart).some(i=>mask[i]===1||before.heights[i]!==m.heights[i])){const old={x:originalStart.x,y:originalStart.y};let best=Infinity,dest:Point|null=null;const occupied=new Uint8Array(n);for(const e of m.entities)if(e!==originalStart)for(const i of entityTiles(m,e))occupied[i]=1;
  for(let y=0;y<H-2;y++)for(let x=0;x<W-2;x++){const cells=entityTiles(m,{...originalStart,x,y}),d=(x-old.x)**2+(y-old.y)**2;if(d>=best||cells.length!==9||cells.some(i=>mask[i]===1||occupied[i]||m.heights[i]!==m.heights[cells[0]]))continue;best=d;dest={x,y};}
  if(!dest)throw Error('No level ground remains for the map’s start');originalStart.x=dest.x;originalStart.y=dest.y;ride(originalStart,m.heights[dest.y*W+dest.x]);delete originalStart.raw;startMoved=true;const cells=new Set(entityTiles(m,originalStart));m.entities=m.entities.filter(e=>e===originalStart||!entityTiles(m,e).some(i=>cells.has(i)));
 }
 let removed=true;while(removed){removed=false;const slopes=new Map(m.entities.filter(e=>e.template==='Slope').map(e=>[e.y*W+e.x,e]));m.entities=m.entities.filter(e=>{if(e.template!=='Slope')return true;const [dx,dy]=slopeHighSide(e.orientation),hx=e.x+dx,hy=e.y+dy,lx=e.x-dx,ly=e.y-dy;if(hx>=0&&hy>=0&&hx<W&&hy<H&&lx>=0&&ly>=0&&lx<W&&ly<H&&m.heights[hy*W+hx]===e.z+1&&(m.heights[ly*W+lx]===e.z||slopes.get(ly*W+lx)?.z===e.z-1))return true;removed=true;objectsRemoved++;return false;});}
 m.fallen=m.fallen.filter(f=>m.entities.some(e=>e.id===f.id));trimRock(m);
 let serial=0;const addSource=(i:number,strength:number)=>{let id=guidFrom('glaciate',s.seed,intent.origin,serial++);while(m.entities.some(e=>e.id===id))id=guidFrom('glaciate',s.seed,intent.origin,serial++);m.entities.push(waterSource({id,owner:'glaciate',x:i%W,y:Math.floor(i/W),z:m.heights[i],strength}));};
 if(s.meltwater){let strength=.65+cleanAbsorbed;const sites=[tile(tarn),...lakeSeeds.filter(i=>i!==tile(tarn))];let index=0;while(strength>0){const amount=Math.min(8,strength);addSource(sites[index++%sites.length],amount);strength-=amount;}for(const h of hanging)if(h.source!==null)addSource(h.source,.25+Math.min(.35,h.catchment/800));}m.entities=plainEntities(m.entities);
 const model=modelFor(m),spill=spillLevels(model),feed=prefill(model),seen=new Uint8Array(n),basins:Basin[]=[],retained={tiles:[] as number[],floor:[] as number[],depth:[] as number[],contamination:[] as number[]};
 for(const i of lakeSeeds){if(seen[i]||spill[i]<=m.heights[i])continue;const level=spill[i],queue=[i];seen[i]=1;for(let k=0;k<queue.length;k++){const j=queue[k],x=j%W,y=Math.floor(j/W);for(const [dx,dy]of N4){const xx=x+dx,yy=y+dy,a=yy*W+xx;if(xx<0||yy<0||xx>=W||yy>=H||seen[a]||spill[a]!==level||m.heights[a]>=level)continue;seen[a]=1;queue.push(a);}}if(queue.length<3)continue;const floor=Math.min(...queue.map(j=>m.heights[j]));basins.push({tiles:queue.sort((a,b)=>a-b),floor,outlet:level,depth:level-floor,fed:queue.some(j=>feed.depth[j]>.01)});}
 for(const i of [...new Set(basins.flatMap(b=>b.tiles))].sort((a,b)=>a-b)){retained.tiles.push(i);retained.floor.push(m.heights[i]);retained.depth.push(s.meltwater?Math.max(0,spill[i]-m.heights[i]-.04):0);retained.contamination.push(0);}m.water=prefill({...model,retained:[retained]});
 let cut=0,deposited=0,outwash=0;for(let i=0;i<n;i++){cut+=Math.max(0,before.heights[i]-m.heights[i]);deposited+=Math.max(0,m.heights[i]-before.heights[i]);if(fan[i])outwash+=Math.max(0,m.heights[i]-before.heights[i]);}
 if(!cut&&!deposited&&m.entities.length===before.entities.length)throw Error(PHYSICAL);
 const result:Plan={before,map:m,request:{verb:'glaciate',settings:s,intent:{...intent}},path,reference,arrival,mask,floor,nearest,streamPath,stream,fan,retained,basins,hanging,notice:'',metrics:{cut,deposited,carriedAway:cut-deposited,ratio:cut?deposited/cut:0,floorWidth:0,widthMin:0,widthMax:0,requestedWidth:sizeOf(s),crossRange:0,flatShare:0,centreline:sinuosity(path),valley:sinuosity(reference),outwash,treesMoved:0,treesUnmoved:0,treesRemoved,objectsRemoved,cleanAbsorbed,badSwept,riverWidthMin:0,riverWidthMax:0,channels:0,maxPoolJoin:Math.max(0,...hanging.map(h=>h.joinLength)),startMoved,dryFloor:0,newFloor:0,newFloorShare:0,wallMedian:0,wallMax:0,hangingValleys:0,waterfalls:0,troughTiles:0,wetShare:0,length,valleyLength:lengthOf(reference),longestWall:0,buildableBefore:0,buildableAfter:0,buildableGain:0,directGain:0,outwashDry:0}};
 measure(result);return result;
}
/** Round 2's dry 2×2-pad definition, without a protected start collar. */
export function buildable(m:ForceMap){const {W,H}=m,blocked=new Uint8Array(W*H),flat=new Uint8Array(W*H);for(const e of m.entities)if(!isPlant(e))for(const i of entityTiles(m,e))blocked[i]=1;
 for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){const i=y*W+x,a=[i,i+1,i+W,i+W+1];if(a.every(j=>!blocked[j]&&m.water.depth[j]<=.05&&m.heights[j]===m.heights[i]))for(const j of a)flat[j]=1;}return flat;}
export function measure(p:Plan){
 const {map:m,before,mask,fan}=p,{W,H}=m,a=buildable(before),b=buildable(m),q=p.metrics;
 q.troughTiles=0;q.dryFloor=0;q.newFloor=0;q.wetShare=0;q.buildableBefore=0;q.buildableAfter=0;q.outwashDry=0;q.directGain=0;
 const region=new Uint8Array(W*H),mark=(i:number)=>{const x=i%W,y=Math.floor(i/W);for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)region[yy*W+xx]=1;};
 for(let i=0;i<W*H;i++)if(mask[i]||before.heights[i]!==m.heights[i]||(before.water.depth[i]>.05)!==(m.water.depth[i]>.05))mark(i);
 const oldEntities=new Map(before.entities.map(e=>[e.id,e])),newEntities=new Map(m.entities.map(e=>[e.id,e]));for(const e of [...before.entities,...m.entities]){if(isPlant(e))continue;const old=oldEntities.get(e.id),now=newEntities.get(e.id);if(!old||!now||old.x!==now.x||old.y!==now.y||old.z!==now.z)for(const i of entityTiles(m,e))mark(i);}
 let wet=0,level=0;const widths:number[]=[],ranges:number[]=[],walls:number[]=[];
 for(let i=0;i<W*H;i++){if(mask[i]===1){q.troughTiles++;wet+=Number(m.water.depth[i]>.05);q.dryFloor+=b[i];q.newFloor+=b[i]&&!a[i]?1:0;level+=Number([i-1,i+1,i-W,i+W].every(j=>j>=0&&j<W*H&&m.heights[j]===m.heights[i]));}if(mask[i]||before.heights[i]!==m.heights[i])q.directGain+=b[i]-a[i];if(region[i]){q.buildableBefore+=a[i];q.buildableAfter+=b[i];}if(fan[i]&&m.heights[i]>before.heights[i])q.outwashDry+=b[i];}
 q.wetShare=wet/(q.troughTiles||1);q.flatShare=level/(q.troughTiles||1);q.newFloorShare=q.newFloor/(q.dryFloor||1);q.buildableGain=q.buildableAfter-q.buildableBefore;
 let longest=0;for(let y=0;y<=H;y++){let run=0,last=0;for(let x=0;x<W;x++){const side=(y>0&&mask[(y-1)*W+x]===1?1:0)-(y<H&&mask[y*W+x]===1?1:0);run=side&&side===last?run+1:side?1:0;last=side;longest=Math.max(longest,run);}}for(let x=0;x<=W;x++){let run=0,last=0;for(let y=0;y<H;y++){const side=(x>0&&mask[y*W+x-1]===1?1:0)-(x<W&&mask[y*W+x]===1?1:0);run=side&&side===last?run+1:side?1:0;last=side;longest=Math.max(longest,run);}}q.longestWall=longest;
 for(let k=3;k<p.path.length-3;k+=3){const pt=p.path[k],aa=p.path[k-3],bb=p.path[k+3],len=Math.hypot(bb.x-aa.x,bb.y-aa.y)||1,nx=-(bb.y-aa.y)/len,ny=(bb.x-aa.x)/len,heights:number[]=[];let count=0;
  for(let u=-Math.ceil(pt.r*1.25);u<=pt.r*1.25;u++){const x=clamp(Math.floor(pt.x+nx*u),0,W-1),y=clamp(Math.floor(pt.y+ny*u),0,H-1),i=y*W+x;if(mask[i]===1){count++;if(!p.stream[i])heights.push(m.heights[i]);}}
  widths.push(count);if(heights.length)ranges.push(Math.max(...heights)-Math.min(...heights));
  for(const side of [-1,1])for(let u=pt.r*.5;u<pt.r*1.5;u+=.5){const x=clamp(Math.floor(pt.x+nx*u*side),0,W-1),y=clamp(Math.floor(pt.y+ny*u*side),0,H-1),i=y*W+x;if(mask[i]!==1){walls.push(Math.max(0,before.heights[i]-pt.floor-1));break;}}
 }
 q.floorWidth=quantile(widths,.5);q.widthMin=widths.length?Math.min(...widths):0;q.widthMax=widths.length?Math.max(...widths):0;q.crossRange=quantile(ranges,.5);q.wallMedian=quantile(walls,.5);q.wallMax=walls.length?Math.max(...walls):0;
 // Water can spill a few pixels along an irregular lip. Count the actual wet
 // top-to-bottom edge near that original mouth, not a planned source or dry lip.
 // Inspect the entire wet cliff boundary: existing rivers can reach a different
 // lip than a predicted catchment mouth. Exclude main-river cascades inside the
 // floor and the outgoing river. Adjacent wet edge pixels form one waterfall.
 const edges:{lip:number;landing:number;drop:number}[]=[];
 for(let i=0;i<W*H;i++)if(mask[i]!==1&&m.water.depth[i]>.015)for(const [dx,dy]of N4){const x=i%W+dx,y=Math.floor(i/W)+dy,j=y*W+x;if(x<0||y<0||x>=W||y>=H||mask[j]!==1||m.water.depth[j]<=.01)continue;const drop=m.heights[i]-m.heights[j];if(drop>=3)edges.push({lip:i,landing:j,drop});}
 edges.sort((a,b)=>b.drop-a.drop||a.lip-b.lip);const falls:typeof edges=[];for(const e of edges)if(!falls.some(f=>Math.hypot(f.lip%W-e.lip%W,Math.floor(f.lip/W)-Math.floor(e.lip/W))<5))falls.push(e);p.falls=falls;
 for(const h of p.hanging){const edge=falls.find(f=>Math.hypot(f.lip%W-h.mouth%W,Math.floor(f.lip/W)-Math.floor(h.mouth/W))<8);h.wet=!!edge;if(edge){h.lip=edge.lip;h.landing=edge.landing;h.drop=edge.drop;}}
 q.hangingValleys=Math.max(p.hanging.length,falls.length);q.waterfalls=falls.length;
 const riverWidths:number[]=[];let channels=0;
 for(let k=5;k<p.path.length-5;k+=3){const pt=p.streamPath[k],aa=p.streamPath[k-3],bb=p.streamPath[k+3],len=Math.hypot(bb.x-aa.x,bb.y-aa.y)||1,nx=-(bb.y-aa.y)/len,ny=(bb.x-aa.x)/len;let run=0,total=0,main=false;const seen=new Set<number>();
  const finish=()=>{if(run){total++;if(main)riverWidths.push(run);}run=0;main=false;};
  for(let u=-Math.ceil(p.path[k].r*2);u<=p.path[k].r*2;u++){const x=Math.floor(pt.x+nx*u),y=Math.floor(pt.y+ny*u),i=y*W+x;if(x<0||y<0||x>=W||y>=H||seen.has(i))continue;seen.add(i);if(mask[i]===1&&m.water.depth[i]>.05){run++;main||=p.stream[i]===1;}else finish();}finish();channels=Math.max(channels,total);
 }q.riverWidthMin=riverWidths.length?Math.min(...riverWidths):0;q.riverWidthMax=riverWidths.length?Math.max(...riverWidths):0;q.channels=channels;return q;
}
