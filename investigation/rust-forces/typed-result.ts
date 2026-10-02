import {preserveRawFloats} from './protocol';
// Cold fixture/suite reconstruction from finite typed layouts. Production uses
// task.result(verb), retaining typed views and opaque object metadata. This helper
// deliberately reconstructs raw and final maps for complete identity comparisons.
const reasons=['','power spent','destination','map edge','lake'];
const events=['surge','waterfall','rapids','split','oxbow','breakthrough','rock',''];
const metricNames=['cut','deposited','exported','suspended','bankCuts','bendCuts','steps','stable','distance','splits','waterfalls','rapids','oxbows'];
function metrics(a:ArrayLike<number>,names=metricNames){const o:any={};for(let k=0;k<names.length;k++)o[names[k]]=names[k]==='stable'?!!a[k]:a[k];if(a.length===14&&names===metricNames)o.reason=reasons[a[13]];return o;}
export function typedResult(task:any,j:any,makeFloat:(n:number)=>any=(n=>({value:n}))):any {
 const record=task.records(j.verb);
 if(j.verb==='footprint')return Array.from({length:record.offsets.length-1},(_,i)=>Array.from(record.tiles.subarray(record.offsets[i],record.offsets[i+1])));
 const object=task.objects,raw=task.raw,g=task.geometry;
 const ids=task.ids??Array.from({length:object.idOffsets.length-1},(_,i)=>new TextDecoder().decode(object.idBytes.subarray(object.idOffsets[i],object.idOffsets[i+1])));
 const entity=(slot:number,x:number,y:number,z:number,flags:number,strength:number,kind:number)=>{
  let e:any;if(kind){const f=(n:number)=>kind===2||kind===3?n:makeFloat(n);e={id:ids[slot],owner:kind===2?'glaciate':'placed',x,y,z,orientation:'Cw0',flipped:false,template:'WaterSource',before:{WaterSource:{SpecifiedStrength:f(strength),CurrentStrength:f(strength)}},components:{TimeActivatedComponent:{IsEnabled:false,CyclesUntilCountdownActivation:5,DaysUntilActivation:f(10),DaysPassed:f(0)}}};}
  else {const original=task.metadata?.(slot,!!(flags&8))??(flags&8?j.plainEntities??j.map.entities:j.map.entities)[slot];if(!original)throw Error('Missing object metadata '+slot);e={...original};if(!e)throw Error('Missing object metadata '+slot);e.x=x;e.y=y;e.z=z;}
  if(flags&1)e.components={...(e.components??{}),LivingNaturalResource:{IsDead:true}};if(flags&2)delete e.raw;return e;
 };
 const entityRows=(a:ArrayLike<number>)=>{const es=[];for(let k=0;k<a.length;k+=7)es.push(entity(a[k],a[k+1],a[k+2],a[k+3],a[k+4],a[k+5],a[k+6]));return es;};
 const fallenRows=(a:ArrayLike<number>)=>{const fs=[];for(let k=0;k<a.length;k+=7){const id=ids[a[k]],original=j.map.fallen.find((f:any)=>f.id===id);fs.push({...structuredClone(original??{}),id,x:a[k+1],y:a[k+2],z:a[k+3],dx:a[k+4],dy:a[k+5],length:a[k+6]});}return fs;};
 const numericMap=(a:any,es:any[],fs:any[])=>({...j.map,heights:a.heights,lava:a.lava,rockLayers:Array.from(a.rock??a.rockLayers),water:a.water??{depth:a.depth,contamination:a.contamination},entities:es,fallen:fs});
 const map=numericMap(task.map,Array.from(object.order,(i:any)=>entity(i,object.x[i],object.y[i],object.z[i],object.flags[i],object.sourceStrength[i],object.sourceKind[i])),fallenRows(object.fallen));
 if(j.verb==='footprint')return Array.from({length:record.offsets.length-1},(_,i)=>Array.from(record.tiles.subarray(record.offsets[i],record.offsets[i+1])));
 const rawMap=numericMap(raw,entityRows(raw.objects),fallenRows(raw.fallen));
 const regions=task.regions,lr=task.literalObjects;let lp=3;
 const literal:any={tiles:regions.tiles,heights:regions.heights,removed:Array.from({length:lr[0]},()=>ids[lr[lp++]])};
 if(regions.rockTiles.length)literal.rock={tiles:regions.rockTiles,bits:regions.bits};
 if(lr[1])literal.moved=Array.from({length:lr[1]},()=>({id:ids[lr[lp++]],x:lr[lp++],y:lr[lp++]}));
 if(lr[2])literal.felled=Array.from({length:lr[2]},()=>({id:ids[lr[lp++]],dx:lr[lp++],dy:lr[lp++]}));
 let at=0;const n=()=>g[at++],point=()=>({x:n(),y:n()}),counted=(count:number,read:()=>any)=>Array.from({length:count},read);
 let result:any;
 if(j.verb==='craterize'){
  const names=['x','y','W','H','edgeInset','radius','a','b','angle','glance','diameter','depth','rim','datum','floor'];const anatomy:any=metrics(counted(15,n),names);anatomy.centre=['auto','bowl','peak','ring','flat'][n()];const nr=n(),strength=n();anatomy.rays=counted(nr,()=>{const r=metrics(counted(8,n),['dx','dy','start','length','width','bend','phase','seed']);r.pits=counted(n(),()=>({x:n(),y:n(),r:n()}));return r;});
  result={anatomy,strength,stats:metrics(record.stats,['cut','raised','changed','erased','flattened']),keep:record.keep,arrival:record.arrival,total:11};
 }else if(j.verb==='erupt'){
  const anatomy:any={x:n(),y:n(),datum:n(),radius:n(),height:n(),summit:['auto','peak','crater','caldera'][n()],phase:n(),length:n(),scale:n(),ceiling:n()};const nv=n(),ns=n(),nl=n(),strength=n(),asked=n(),askedPoint=point();if(asked)anatomy.asked=askedPoint;
  anatomy.vents=counted(nv,point);anatomy.segments=counted(ns,()=>({a:point(),b:point(),length:n(),along:n()}));anatomy.lobes=counted(nl,()=>{const length=n(),strength=n(),np=n();return {length,strength,points:counted(np,()=>({...point(),width:n()}))};});
  result={anatomy,strength,stats:metrics(record.stats,['raised','changed','flattened','erased','hard']),keep:record.keep,flows:record.flows,heat:record.heat,total:30};
 }else if(j.verb==='quake'){
  const fault:any={length:n(),reach:n(),lift:n(),slide:n(),heading:point()},total=n(),np=n(),ns=n(),nd=n();fault.points=counted(np,point);fault.segments=counted(ns,()=>{const a=point(),b=point(),dxIndex=at,dx=n(),dy=n(),length=n(),along=n();return preserveRawFloats({a,b,dx,dy,length,along},g,{dx:dxIndex,dy:dxIndex+1});});fault.directions=counted(nd,point);
  result={fault,total,stats:metrics(record.stats,['changed','raised','dropped','moved','toppled','channel','transported','fullOffset']),arrival:record.arrival,dx:record.dx,dy:record.dy,source:record.source,extras:Array.from({length:record.extras.length/2},(_,k)=>({i:record.extras[k*2],at:record.extras[k*2+1]})),finalWater:{depth:record.finalDepth,contamination:record.finalContamination}};
 }else if(j.verb==='glaciate'){
  const total=n(),np=n(),nr=n(),ns=n();const path=counted(np,()=>({x:n(),y:n(),s:n(),r:n(),floor:n(),outlet:n()})),reference=counted(nr,point),streamPath=counted(ns,point);
  const nt=n(),nb=n(),nh=n(),nj=n(),course=n(),skip=n(),finished={style:['visits','bends','meander','round 4'][course]+(skip||course===3?'':', benches by water'),visits:n(),reached:n(),floods:n(),floodTicks:n()};if(course===3){delete (finished as any).floods;delete (finished as any).floodTicks;}
  const retained:any={tiles:[],floor:[],depth:[],contamination:[]};for(let i=0;i<nt;i++)for(const key of ['tiles','floor','depth','contamination'])retained[key].push(n());
  const basins=counted(nb,()=>{const floor=n(),outlet=n(),depth=n(),fed=!!n(),size=n();return {floor,outlet,depth,fed,tiles:counted(size,n)};});
  const hanging=counted(nh,()=>{const mouth=n(),landing=n(),src=n(),catchment=n(),drop=n(),s=n(),wet=!!n(),joinLength=n(),size=n();return {mouth,lip:mouth,landing,source:Number.isNaN(src)?null:src,catchment,drop,s,wet,joinLength,channel:counted(size,n)};});
  const joins=counted(nj,()=>({kind:['fall','spill','inflow'][n()],from:n(),length:n()}));
  result={total,path,reference,streamPath,retained,basins,hanging,finished,joins,arrival:record.arrival,mask:record.mask,floor:record.floor,nearest:record.nearest,stream:record.stream,fan:record.fan,metrics:metrics(record.metrics,['cut','deposited','carriedAway','treesRemoved','objectsRemoved','cleanAbsorbed','badSwept','maxPoolJoin','length','valleyLength','centreline','valley','outwash','requestedWidth'])};
 }else if(j.verb==='carve'){
  const total=n(),strengthDepth=n(),reason=reasons[n()],removedCount=n(),spreadCount=n(),groupCount=n(),hasClosure=n(),no=n(),ne=n(),nb=n(),unleashed=n(),badwater=!!n(),hasRetained=n(),retainedCount=n();
  const removedAt=counted(removedCount,()=>[ids[n()],n()]),goneSpread=counted(spreadCount,()=>[ids[n()],n()]),group=counted(groupCount,()=>({id:ids[n()],tile:n(),strength:n()}));
  const oxbows=counted(no,()=>{const start=n(),end=n(),step=n(),floor=n(),neckCount=n(),poolCount=n(),bars=counted(2,()=>({x:n(),y:n(),dx:n(),dy:n(),width:n(),level:n()}));return {start,end,step,floor,bars,neck:counted(neckCount,point),pool:counted(poolCount,()=>{const x=n(),y=n(),bed=n(),width=n(),dx=n(),dy=n(),bend=n(),lanes=counted(n(),()=>({x:n(),y:n(),width:n()}));return {x,y,bed,width,dx,dy,bend,lanes};})};});const edgeLeaks=counted(ne,point),oxbowBasin=counted(nb,n);const retained:any=hasRetained?{tiles:[],floor:[],depth:[],contamination:[]}:null;if(retained)for(let i=0;i<retainedCount;i++)for(const key of ["tiles","floor","depth","contamination"])retained[key].push(n());
  const slices=(a:any,offsets:any,read:(v:any)=>any)=>Array.from({length:offsets.length-1},(_,i)=>read(a.subarray(offsets[i],offsets[i+1])));
  const heads=slices(record.heads,record.headOffsets,a=>{const h:any={x:a[0],y:a[1],z:a[2],dx:a[3],dy:a[4],width:a[5],event:events[a[6]],cut:a[7]};if(a[8])h.lanes=Array.from({length:a[8]},(_,i)=>({x:a[9+i*3],y:a[10+i*3],width:a[11+i*3]}));return h;});
  const path=slices(record.path,record.pathOffsets,a=>({x:a[0],y:a[1],bed:a[2],width:a[3],dx:a[4],dy:a[5],bend:a[6],lanes:Array.from({length:a[7]},(_,i)=>({x:a[8+i*3],y:a[9+i*3],width:a[10+i*3]}))}));
  const stepMetrics=j.trace===false?[]:Array.from({length:record.stepMetrics.length/14},(_,i)=>metrics(record.stepMetrics.subarray(i*14,i*14+14)));const initialEntities=entityRows(record.stepObjects),stepObjectChanges=Array.from({length:record.stepObjectChanges.length/5},(_,i)=>{const a=record.stepObjectChanges,k=i*5;return {step:a[k],id:ids[a[k+1]],x:a[k+2],y:a[k+3],z:a[k+4]};});
  const closure=hasClosure?numericMap(task.closure,entityRows(task.closure.objects),fallenRows(task.closure.fallen)):null;
  result={total,strengthDepth:Number.isNaN(strengthDepth)?null:strengthDepth,metrics:{...metrics(record.metrics),reason},removedAt,goneSpread,group,oxbows,edgeLeaks,oxbowBasin,unleashedId:Number.isNaN(unleashed)?null:ids[unleashed],badwater,retained,closure,path,heads,lengths:record.lengths,changes:slices(record.changes,record.changeOffsets,(a:any)=>a),...(j.trace===false?{}:{rawChanges:slices(record.rawChanges,record.rawOffsets,(a:any)=>a),stepMetrics,stepObjectChanges,initialEntities})};
 }else throw Error('Unknown force');
 if(at!==g.length)throw Error('Unconsumed typed geometry '+j.verb+': '+at+'/'+g.length);
 return {...result,map,raw:rawMap,literal};
}
