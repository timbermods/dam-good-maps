import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { applyBrush } from '../../src/core/features/raster/brush';
import { buildMap } from '../../src/core/features/build';
import { validateOp, emptyState, LOG_OPS, type EditOp } from '../../src/core/doc/ops';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { modelOf } from '../../src/core/forces/runs';
import { moisture } from '../../src/core/sim/moisture';
import { soilContamination } from '../../src/core/sim/contamination';
import { Journal, Claims, touches, waterNotices } from './architecture';
import { Mask, fromSession, difference, clone, plain, stable, tileValue, type State, type Player } from './state';
import { gesture, prepare, PreviewCache, forceMap } from './forces';
import { pack, unpack, exportMap, presence } from './snapshot';
import { makeSession, random, brush } from './spike';
import { Host, receiveCommit, PresenceReceiver, type Request } from './channel';
const result:any={base:'32aee5cf7b5d9386e386037f36a5081cdb6dd035',machine:{cpu:os.cpus()[0].model,node:process.version},checks:0};
function check(x:unknown,message:string){assert.ok(x,message);result.checks++;}
const hash=(s:State)=>createHash('sha256').update(stable({...s,entities:[...s.entities].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
const percent=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)};};
function coreAction(s:State,op:EditOp):State {
  const errors=validateOp(op,{state:emptyState([]),W:s.W,H:s.H,generated:false,entityIds:new Set(s.entities.map(e=>e.id)),slopeTiles:new Set(s.entities.filter(e=>e.template==='Slope').map(e=>e.y*s.W+e.x)),lockedColumns:new Set(s.columns.map(c=>c[0]))});
  assert.deepEqual(errors,[],`invalid ${op.op}`);
  const applied={...op,seq:1,origin:'user' as const};
  const sculpts=['brush','sculpt','carve','forceResult'].includes(op.op)?[applied]:[];
  const slopeEdits=['pinSlope','removeSlope'].includes(op.op)?[applied]:[];
  const entityEdits=['placeEntity','moveEntity','deleteEntities','setEntityProps','carve','forceResult'].includes(op.op)?[applied]:[];
  const b=buildMap({W:s.W,H:s.H,seed:349,features:[],base:{heights:s.heights,columns:new Map(s.columns.map(([i,c])=>[i,Uint8Array.from(c)])),entities:s.entities},sculpts:sculpts as any,slopeEdits:slopeEdits as any,entityEdits:entityEdits as any},{stopBeforeWater:true});
  return {...s,heights:b.heights,entities:plain(b.entities)};
}
function fastBrush(s:State,op:EditOp):State {assert.equal(op.op,'brush');const after={...s,heights:s.heights.slice()};if(op.op==='brush')applyBrush(op.params,after.heights,s.W,s.H);return after;}
function safeUndo(j:Journal,p:Player){
  const before=clone(j.state),r=j.undo(p);
  if(r.action!==null){const a=j.entries.find(e=>e.seq===r.action)!;
    const later=j.entries.filter(e=>e.active&&e.seq>a.seq&&e.author!==p),touch=new Mask(j.state.W*j.state.H);
    for(const e of later)touch.union(e.touch);
    // Literal tile comparison includes height, rock, voxel columns and ALL object components.
    for(const i of touch.tiles())assert.equal(tileValue(before,i),tileValue(j.state,i),'allowed undo changed later peer tile');
    result.checks++;
  }
  return r;
}
console.log('Core fixture, claim races and selective undo');
const session=makeSession(),initial=fromSession(session);
const c=new Claims(48,48);c.claim('host',[[3,3,10],[4,3,3],[5,3,10]]);
assert.throws(()=>c.claim('guest',[[3,9,12]]));check(c.owner[3*48+11]===0,'claim is atomic');
c.release('host',[[3,5,7]]);check(c.owner[3*48+6]===0&&c.owner[3*48+4]===1,'partial release');
c.offer('o1','host','guest',[[5,3,5]]);c.answer('o1','guest',false);check(c.owner[5*48+3]===1,'decline keeps owner');
c.offer('o2','host','guest',[[5,3,5]]);c.answer('o2','guest',true);check(c.owner[5*48+3]===2,'accepted partial offer');
c.offer('o3','host','guest',[[4,3,3]]);c.release('host',[[4,3,3]]);assert.throws(()=>c.answer('o3','guest',true));
assert.throws(()=>c.claim('guest',[[48,0,0]]));assert.throws(()=>c.release('host',[[5,3,3]]));
const j=new Journal(clone(initial));
const pairedHost=new Journal(clone(initial)),pairedGuest=new Journal(clone(initial));
const adapter={apply:coreAction,hash},host=new Host(pairedHost,adapter,'s1','e1');
const request:Request={kind:'request',session:'s1',epoch:'e1',counter:1,baseSeq:0,claimRevision:0,command:{kind:'edit',op:brush(12,12),label:'Raise'}};
check(host.request('guest',request).kind==='reject','both players pause on drop');host.ready=true;
const commit=host.request('guest',request);check(commit.kind==='commit','host orders guest edit');
if(commit.kind==='commit')receiveCommit(pairedGuest,commit,adapter);
check(hash(pairedHost.state)===hash(pairedGuest.state),'paired core replicas converge');
check(host.request('guest',request).kind==='reject','duplicate request cannot apply twice');
check(host.request('host',{...request,counter:1}).kind==='reject','concurrent stale edit refused');host.drop();
check(host.request('guest',{...request,counter:2,baseSeq:1}).kind==='reject','drop makes host read only too');
host.ready=true;
const hg=gesture('craterize',48,812);hg.baseSeq=pairedHost.seq;
host.preview('host',hg);const computations=host.previewCache.computations;
const forceRequest:Request={...request,counter:2,baseSeq:pairedHost.seq,command:{kind:'force',gesture:hg}};
const fc=host.request('host',forceRequest);check(fc.kind==='commit'&&host.previewCache.computations===computations,'host release reuses the pre-release force plan');
if(fc.kind==='commit')receiveCommit(pairedGuest,fc,adapter);
const beforeReplacement=hash(pairedHost.state),rg={...hg,id:'00000000-0000-4000-8000-000000000813',baseSeq:pairedHost.seq,replaces:pairedHost.entries.at(-1)!.seq,settings:{...hg.settings,seed:813}};
const replacement=host.request('host',{...forceRequest,counter:3,baseSeq:pairedHost.seq,command:{kind:'force',gesture:rg}});
check(replacement.kind==='commit','Try another starts on original ground');if(replacement.kind==='commit')receiveCommit(pairedGuest,replacement,adapter);
const replacementUndo=host.request('host',{...forceRequest,counter:4,baseSeq:pairedHost.seq,command:{kind:'undo'}});
check(replacementUndo.kind==='commit'&&hash(pairedHost.state)===beforeReplacement,'replacement undo restores previous force');
if(replacementUndo.kind==='commit')receiveCommit(pairedGuest,replacementUndo,adapter);
const a=brush(10,10),b=brush(10,10,'lower'),far=brush(35,35);
j.accept('host','Raise at south lake',fastBrush(j.state,a),a);
j.accept('host','Raise at north hill',fastBrush(j.state,far),far);
j.accept('guest','Lower at south lake',fastBrush(j.state,b),b);
check(safeUndo(j,'host').action===2,'undo skips blocked newer own actions');
const blocked=safeUndo(j,'host');check(blocked.action===null&&blocked.skipped[0].reason.includes('guest'),'names blocking edit');
safeUndo(j,'guest');check(safeUndo(j,'host').action===1,'undo becomes available again');
check(hash(j.state)===hash(initial),'exact patch round trip');
assert.throws(()=>j.accept('guest','stale',initial,a,0));
const locked=new Journal(clone(initial));locked.claims.claim('guest',[[10,8,14]]);
assert.throws(()=>locked.accept('host','Raise',fastBrush(locked.state,a),a));check(locked.seq===0,'claim refusal does not advance order');
// A saturated/no-op stroke inside a claim is still an attempted edit.
assert.throws(()=>locked.accept('host','No-op Raise',locked.state,a));
// Reading a neighbour builds on that neighbour, even if the later stroke changes another tile.
const n=new Journal(clone(initial)),one:EditOp={op:'sculpt',params:{mode:'flatten',cells:[[15,15,15]],level:8,exact:true}};
n.accept('host','Select Flatten',coreAction(n.state,one),one);
const neighbour:EditOp={op:'sculpt',params:{mode:'smooth',cells:[[15,16,16]]}};
n.accept('guest','Smooth beside it',coreAction(n.state,neighbour),neighbour);
check(n.blocker(n.entries[0])!==null,'neighbour dependency');
// Exercise current operation families against the real core pipeline.
const family:any[]=[];
let material=clone(initial);
const id='00000000-0000-4000-8000-000000000001';
const ops:EditOp[]=[brush(20,20),{op:'sculpt',params:{mode:'flatten',cells:[[25,25,28],[26,25,28]],level:6,exact:true}},
 {op:'placeEntity',params:{id,template:'Pine',x:25,y:25,orientation:'Cw0'}},
 {op:'moveEntity',params:{id,x:30,y:30,orientation:'Cw90'}},
 {op:'setEntityProps',params:{id,components:{Growable:{GrowthProgress:0.5}}}},
 {op:'deleteEntities',params:{entities:[id]}},{op:'pinSlope',params:{x:20,y:20,orientation:'Cw0'}}];
for(const op of ops){const after=coreAction(material,op),f=touches(op,material,after),d=difference(material,after);
  check(d.writes.tiles().every(i=>f.write.has(i)),`${op.op} footprint`);family.push({op:op.op,tiles:d.writes.tiles().length});material=after;}
const slope=material.entities.find(e=>e.template==='Slope');if(slope){const op:EditOp={op:'removeSlope',params:{x:slope.x,y:slope.y}};
  const after=coreAction(material,op);check(difference(material,after).writes.tiles().every(i=>touches(op,material,after).write.has(i)),'removeSlope footprint');family.push({op:'removeSlope'});}
result.coreFamilies=family;
// Last 50 means last 50 actions, including undone ones. Eviction must preserve blockers.
const bounded=new Journal(clone(initial));bounded.accept('host','old raise',fastBrush(bounded.state,a),a);
for(let i=0;i<51;i++)bounded.accept('guest',`guest ${i}`,fastBrush(bounded.state,i===0?b:far),i===0?b:far);
check(bounded.entries.filter(e=>e.author==='guest').length===50,'bounded history');
check(bounded.blocker(bounded.entries[0])!==null,'evicted peer dependency survives');
console.log('Random patch interleaving');
const rng=random(362),sweep=new Journal(clone(initial)),undoTimes:number[]=[];
let accepted=0,undone=0,skipped=0;
for(let k=0;k<1200;k++){
  const p:Player=rng()<.5?'host':'guest';
  if(k%4===0){const t=performance.now(),r=safeUndo(sweep,p);undoTimes.push(performance.now()-t);if(r.action!==null)undone++;skipped+=r.skipped.length;}
  else {const op=brush(3+Math.floor(rng()*40),3+Math.floor(rng()*40),['raise','lower','smooth'][Math.floor(rng()*3)] as any);
    sweep.accept(p,`stroke ${k}`,fastBrush(sweep.state,op),op);accepted++;}
}
result.undo={accepted,undone,skipped,history:sweep.entries.length,comparison:'all later peer read/touch tiles including objects',timingMs:percent(undoTimes)};
console.log('Force plans: all verbs and painted variants');
const modes:[any,string|undefined][]=[['carve',undefined],['craterize',undefined],['erupt',undefined],['erupt','fissure'],['quake',undefined],['quake','slide'],['glaciate',undefined]];
result.forces=[];
for(const size of [48,256]){
  const t=performance.now(),s=size===48?clone(initial):fromSession(makeSession(size));
  if(size===256){result.generation256Ms=performance.now()-t;await writeFile(new URL('./fixture-256.bin',import.meta.url),Buffer.from(s.heights));}
  for(const [verb,mode]of modes){
    const cache=new PreviewCache(),g=gesture(verb,size,362,mode);
    if(verb==='carve'||verb==='glaciate') {
      let high=5*size+5,low=5*size+5;
      for(let y=5;y<size-5;y++)for(let x=5;x<size-5;x++){const i=y*size+x;if(s.heights[i]>s.heights[high])high=i;if(s.heights[i]<s.heights[low])low=i;}
      g.where.origin=[high%size,Math.floor(high/size)];g.where.end=[low%size,Math.floor(low/size)];
    }
    const row:any={size,verb,mode:mode??g.settings.mode,updates:[]};
    for(let u=0;u<2;u++){
      const next=clone(g);if(u){if(next.where.path)next.where.path[1][0]+=2;else if(next.where.end)next.where.end[0]+=2;else next.where.origin![0]+=2;}
      const p=cache.preview(s,next),calls=cache.computations;
      check(cache.preview(s,next)===p&&cache.computations===calls,'unchanged preview is cached');
      const release=cache.release(g.id,0,0);check(release===p&&cache.computations===calls,'release reuses force plan');
      const d=difference(s,release.after);check(d.writes.tiles().every(i=>release.footprint.has(i)),'force escaped preview');
      // A real force whose drawing is unclaimed but effect hits a claim must be refused atomically.
      const drawn=g.where.origin?g.where.origin[1]*size+g.where.origin[0]:-1;
      const tile=d.writes.tiles().find(i=>i!==drawn);
      if(tile!==undefined){const jj=new Journal(clone(s));jj.claims.claim('guest',[[Math.floor(tile/size),tile%size,tile%size]]);
        assert.throws(()=>jj.accept('host',verb,release.after,release.op));check(jj.seq===0,'force claim effect rejected');}
      const fj=new Journal(clone(s));fj.accept('host',verb,release.after,release.op);
      const r=safeUndo(fj,'host');check(r.action!==null&&hash(fj.state)===hash(s),'force exact undo including objects/rock');
      row.updates.push({planningMs:p.planningMs,finalizeMs:p.buildMs,tiles:p.footprint.tiles().length});
      if(size===48&&u===0){const peer=prepare(s,next);check(stable(peer.op)===stable(p.op)&&hash(peer.after)===hash(p.after),'two force replicas match');}
    }
    const stale=new PreviewCache();stale.preview(s,g);assert.throws(()=>stale.release(g.id,1,0));assert.throws(()=>stale.release(g.id,0,1));
    result.forces.push(row);console.log(`${size} ${verb}/${row.mode}: ${Math.round(row.updates[1].planningMs)} + ${Math.round(row.updates[1].finalizeMs)} ms`);
    if(size===256&&verb==='carve')result.longBase=s;
  }
}
console.log('Water notices after real canonical settling');
// A small closed basin with one clean source; then remove its source outside the other claim.
const waterState=clone(initial);waterState.heights.fill(5);waterState.entities=[];waterState.fallen=[];
for(let y=15;y<30;y++)for(let x=15;x<30;x++)waterState.heights[y*48+x]=2;
const sourceOp:EditOp={op:'placeEntity',params:{id:'00000000-0000-4000-8000-000000000002',template:'WaterSource',x:16,y:16,orientation:'Cw0',components:{WaterSource:{SpecifiedStrength:1}}}};
const wet=coreAction(waterState,sourceOp);
const settle=(s:State)=>{const w=canonicalSettle({...modelOf(forceMap(s)),retained:s.retained.map(r=>r.water)});return {...s,water:w.depth,contamination:w.contamination,
  moisture:moisture(s.heights,w.depth,w.contamination,s.W,s.H),soilContamination:soilContamination(s.heights,w.depth,w.contamination,s.W,s.H)};};
const flooded=settle(wet),dry=settle(waterState),wc=new Claims(48,48);wc.claim('guest',[[20,20,25],[21,20,25]]);
const noticeTimes:number[]=[];let note:any;
for(let i=0;i<50;i++){const t=performance.now();note=waterNotices(dry,flooded,wc,'host',1);noticeTimes.push(performance.now()-t);}
check(note?.flooded>0,'source floods inside peer claim');check(waterNotices(flooded,dry,wc,'host',2)?.drained!>0,'source removal drains peer claim');
check(waterNotices(flooded,flooded,wc,'host',3)===null,'no-change water is silent');
result.water={tiles:note.tiles.length,bounds:note.bounds,timingMs:percent(noticeTimes)};
const hydrology=new Journal(clone(dry));hydrology.accept('host','Source feeding the lake',flooded,sourceOp);
const lakeBrush=brush(22,20);hydrology.accept('guest','Raise at the lake',settle(coreAction(hydrology.state,lakeBrush)),lakeBrush);
const waterBlocked=hydrology.undo('host',settle);
check(waterBlocked.action===null&&waterBlocked.skipped[0].reason.includes('water dependency'),'undo protects later peer water tiles too');
hydrology.undo('guest',settle);check(hydrology.undo('host',settle).action!==null,'water dependency clears after peer undo');
console.log('256 squared long session and snapshot + tail');
const long=new Journal(result.longBase as State);delete result.longBase;
const times:number[]=[];
for(let k=0;k<10000;k++){
  const op=brush(4+Math.floor(rng()*246),4+Math.floor(rng()*246),k%2?'lower':'raise');
  long.accept(k%2?'host':'guest',`brush ${k}`,fastBrush(long.state,op),op);
}
// Keep large recent inverses in the measured checkpoint too, not just sparse brush history.
for(const [k,verb]of (['quake','erupt','craterize','quake'] as const).entries()){
  const g=gesture(verb,256,370+k,k===3?'slide':undefined);g.baseSeq=long.seq;
  const f=prepare(long.state,g);long.accept(k%2?'host':'guest',`${verb} late session`,f.after,f.op);
}
for(let k=0;k<12;k++){
  const op:EditOp={op:'placeEntity',params:{id:`00000000-0000-4000-8000-${(900+k).toString(16).padStart(12,'0')}`,template:'Pine',x:20+k*3,y:100,orientation:'Cw0'}};
  long.accept(k%2?'host':'guest',`Pine ${k}`,coreAction(long.state,op),op);
}
const settleStart=performance.now();Object.assign(long.state,settle(long.state));result.finalSettle256Ms=performance.now()-settleStart;
long.claims.claim('guest',[[200,200,220],[201,200,210]]);
long.claims.offer('rejoin-offer','guest','host',[[201,200,205]]);
const packTimes:number[]=[],unpackTimes:number[]=[];let bytes!:Uint8Array,rejoined!:Journal;
for(let k=0;k<3;k++){let t=performance.now();bytes=pack(long,result.base,'session-362');packTimes.push(performance.now()-t);
  t=performance.now();rejoined=unpack(bytes,result.base,'session-362');unpackTimes.push(performance.now()-t);}
check(hash(long.state)===hash(rejoined.state),'lossless current-map rejoin');
check(stable(long.entries)===stable(rejoined.entries)&&stable(long.fences)===stable(rejoined.fences),'rejoin keeps undo and eviction fences');
check(stable(long.claims)===stable(rejoined.claims),'rejoin keeps claims and pending offer');
assert.throws(()=>unpack(bytes,'other-build','session-362'));
check(!JSON.stringify(exportMap(long.state)).includes('rejoin-offer'),'claims absent from saved map data');
// Operations since the snapshot are replayed once on the exact snapshot state, in host order.
const tail:EditOp[]=[];const ttail=performance.now();
for(let k=0;k<20;k++){const op=brush(10+k*3,40,'raise');tail.push(op);long.accept('host',`tail ${k}`,fastBrush(long.state,op),op);
  rejoined.accept('host',`tail ${k}`,fastBrush(rejoined.state,op),op);}
const tail20BothPeersMs=performance.now()-ttail;
check(hash(long.state)===hash(rejoined.state),'snapshot + 20 operations converges');
const undoHost=safeUndo(long,'host'),undoGuest=safeUndo(rejoined,'host');check(stable(undoHost)===stable(undoGuest)&&hash(long.state)===hash(rejoined.state),'rejoin selective undo parity');
result.snapshot={sessionEdits:10016,fixture:'10000 brush actions + 4 broad forces + 12 placements; last 50 per player retained',historyEntries:rejoined.entries.length,bytes:bytes.length,tailBytes:Buffer.byteLength(JSON.stringify(tail)),
  packMs:percent(packTimes),openMs:percent(unpackTimes),tail20BothPeersMs};
// Cheap notice scan remains O(N) at full scale.
const dry256=clone(long.state),wet256=clone(dry256);for(let i=0;i<wet256.water.length;i++)wet256.water[i]+=.2;
const waterTimes:number[]=[];for(let k=0;k<20;k++){const t=performance.now();waterNotices(dry256,wet256,long.claims,'host',10020);waterTimes.push(performance.now()-t);}
result.water.scan256Ms=percent(waterTimes);
const p=presence(7),presenceBytes=Buffer.byteLength(JSON.stringify(p));
result.presence={payloadBytes:presenceBytes,hz:15,payloadBytesPerSecond:presenceBytes*15,pointsPerSecond:45,
  estimatedWith56BytePacketOverhead:15*(presenceBytes+56)};
const receiver=new PresenceReceiver('join-2',256,256);check(receiver.accept(p),'presence accepted');
check(!receiver.accept(p)&&!receiver.accept({...p,counter:6}),'presence reordered/duplicate ignored');
check(!receiver.accept({...p,counter:8,epoch:'old'})&&!receiver.accept({...p,counter:8,cursor:[99999,0]}),'presence epochs and bounds checked');
result.operationCoverage={families:LOG_OPS,featureEdits:'conservative whole-map guard; existing feature builder retained for milestone',forceSemantics:'gesture+seed on wire, literal patch in local session journal'};
await mkdir(new URL('.',import.meta.url),{recursive:true});
await writeFile(new URL('./results.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({checks:result.checks,undo:result.undo,snapshot:result.snapshot,water:result.water,presence:result.presence},null,2));
