import {MapSession} from "./session";
import {decodeProjectObject,baseFeaturesOf,checkDocument,type MapDocument} from "./document";
import type {EditOp,OpOrigin,AppliedOp} from "./ops";
import {ResultStore,type ColdResults} from "./resultStore";
import {readProject,writeProject} from "./projectStream";
import {packState,unpackState,StateBank} from "./stateGraph";
import {archiveSource,readArchive,writeArchive,CHECKPOINT_KEY,STATE_ABI,type CheckpointIndex} from "./projectArchive";
import {HistorySnapshots as RecentStates} from "./historySnapshots";
import {fullMap,forceCeiling} from "../forces/force";
import {forceMapOf,carveForceParams} from "../forces/carve/result";
import {CarveRun,type CarveSettings} from "../forces/carve/run";
import {CraterRun,EruptRun,QuakeRun} from "../forces/runs";
import type {CraterSettings} from "../forces/craterize";
import type {EruptSettings,Point} from "../forces/erupt";
import type {QuakeSettings} from "../forces/quake";
import {GlaciateRun} from "../forces/glaciate/run";
import type {GlaciateSettings} from "../forces/glaciate/model";
import {forceParamsOf,pathRecord} from "../forces/result";
import {forceSettingsProblems} from "../forces/op";
import {areaDepth} from "../features/raster/brush";
import {moveStartNear,startBrokenBy,startMiddle} from "./tools";
import {geologyOf,rockOf,fallenOf,stagedForceMap,buildTouches,withOwned,glacierSprings,featherForce} from "./forceHelpers";
import {planRemoveAt} from "./selectionHelpers";
import {runsToTiles,type Runs} from "../math/grid";
import type {RemoveKind} from "../features/objects";
export {rockOf,fallenOf} from "./forceHelpers";
export {BoundedFields} from "./boundedFields";
export {HistorySnapshots} from "./historySnapshots";

export const REPLAY_VERSION="portable-forces-v1-canonical";
type Where={origin?:[number,number];end?:[number,number];via?:[number,number][];path?:Point[];side?:1|-1};
/** Resolved core request: never screen events, literal result tiles, frame counts or wall time. */
export type ForceGesture = ({verb:"carve";settings:CarveSettings}|{verb:"craterize";settings:CraterSettings}|{verb:"erupt";settings:EruptSettings}|{verb:"quake";settings:QuakeSettings}|{verb:"glaciate";settings:GlaciateSettings}) & {
  where:Where;cut:number|null;area?:[number,number,number][];sourceId:string;unleashed?:string;bad?:boolean;
};
export type GestureEntry={seq:number;origin:OpOrigin;label?:string} & (
  {kind:"operations";ops:EditOp[]}|{kind:"force";gesture:ForceGesture;inputHash:string;inputHashVersion?:1|2;inputCursor:number;forceSeq:number;replaces?:number}|{kind:"legacy";op:AppliedOp}|{kind:"selection";gesture:SelectionGesture;inputHash:string;inputHashVersion?:1|2}
);
export type SelectionGesture={action:"remove";area:Runs;kinds:RemoveKind[]};
export type GestureProject={app:"dam-good-maps";formatVersion:4;replayVersion:typeof REPLAY_VERSION;documentId:string;epoch:number;base:MapDocument;entries:GestureEntry[];nextSeq:number};
export type Policy={results?:number;snapshots?:number;steps?:number;checkpointEvery?:number;checkpointBytes?:number;checkpointCount?:number};
function immutable<T>(value:T):T {if(value&&typeof value==="object"){for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if("value" in d)immutable(d.value);Object.freeze(value);}return value;}
function validArea(area:Runs,W:number,H:number):void {
  if(!Array.isArray(area)||area.some(r=>!Array.isArray(r)||r.length!==3||r.some(n=>!Number.isSafeInteger(n))||r[0]<0||r[0]>=H||r[1]<0||r[2]>=W||r[1]>r[2]))throw Error("working area outside map");
}
function validForce(g:ForceGesture,s:MapSession):void {
  if(!g||!["carve","craterize","erupt","quake","glaciate"].includes(g.verb)||!Number.isSafeInteger(g.settings?.seed)||typeof g.sourceId!=="string"||!g.sourceId||!g.where||g.cut!==null&&(!Number.isSafeInteger(g.cut)||g.cut<0||g.cut>forceCeiling()))throw Error("invalid resolved force gesture");
  const problems=forceSettingsProblems(g.verb,g.settings as unknown as Record<string,unknown>);
  if(problems.length)throw Error(problems.join("; "));
  if(g.area!==undefined)validArea(g.area,s.size.x,s.size.y);
}

export function canonicalForceMap(s:MapSession) {
  s.settleCanonical();const b=s.built,m=forceMapOf(b),down=fallenOf(s);
  return fullMap({...m,rockLayers:geologyOf(s),lava:rockOf(s)??new Uint32Array(m.W*m.H),fallen:m.entities.filter(e=>down.has(e.id)).map(e=>({id:e.id,x:e.x+.5,y:e.y+.5,z:m.heights[e.y*m.W+e.x],...down.get(e.id)!,length:e.template==="Oak"?2.6:2}))});
}
export async function forceInputHash(s:MapSession,version:1|2=2):Promise<string> {
  const m=s.historyTransaction(()=>canonicalForceMap(s)),parts:Uint8Array[]=[m.heights,new Uint8Array(m.water.depth.buffer),new Uint8Array(m.water.contamination.buffer),new Uint8Array(m.lava.buffer),new TextEncoder().encode(JSON.stringify([m.W,m.H,m.maxHeight,m.entities,m.rockLayers,m.fallen]))];
  if(version!==1&&version!==2)throw Error('unsupported force input hash version');
  if(version===2){const t=s.terrainState();for(const v of [t.pre,t.protect,t.channel,t.base,t.field,t.locked,t.columns])parts.push(v?new Uint8Array(v.buffer,v.byteOffset,v.byteLength):new Uint8Array());parts.push(new TextEncoder().encode(JSON.stringify([t.top,!!t.base,!!t.field,!!t.locked,s.features])));}
  // Hash component digests: bounded working storage, including all inputs that a force reads.
  const digests=await Promise.all(parts.map(b=>crypto.subtle.digest("SHA-256",b as BufferSource)));
  const joined=new Uint8Array(digests.length*32);digests.forEach((d,i)=>joined.set(new Uint8Array(d),i*32));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",joined))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function resolveForce(s:MapSession,g:ForceGesture):EditOp {
  validForce(g,s);
  const m=canonicalForceMap(s),{W,H}=m,{where:w}=g,keep=new Uint8Array(W*H);
  const inside=g.area?areaDepth(g.area,W,H):null;
  if(g.cut!==null)for(let i=0;i<keep.length;i++)if(m.heights[i]>g.cut)keep[i]=1;
  for(const i of s.columns.keys())keep[i]=1;
  if(inside)for(let i=0;i<keep.length;i++)if(!inside[i])keep[i]=1;
  const at=(p:[number,number])=>{if(!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[1]<0||p[0]>=W||p[1]>=H)throw Error("force outside map");return p[1]*W+p[0];};
  const origin=w.origin?at(w.origin):0,end=w.end?at(w.end):undefined;
  let params:any;
  if(g.verb==="carve") {
    const run=new CarveRun(m,g.settings,{origin,...(end!==undefined?{end}:{}),...(w.via?.length?{via:w.via.map(at)}:{})},{keep,sourceId:g.sourceId,...(g.unleashed?{unleashed:g.unleashed,bad:g.bad}: {})});
    for(let n=0;!run.done;n++){if(n>=10000)throw Error("carve exceeded deterministic step bound");run.step();}
    params=carveForceParams(m,run,{settings:g.settings,origin:w.origin!,...(w.end?{end:w.end}:{}),cut:g.cut});
    if(params&&w.via?.length)params.where.path=[w.origin!,...w.via,w.end!];
    if(params&&g.unleashed)params.where.source=g.unleashed;
  } else {
    const before=stagedForceMap(m);
    const run=g.verb==="craterize"?new CraterRun(before,g.settings,{origin,...(end!==undefined?{end}:{})},keep)
      :g.verb==="erupt"?new EruptRun(before,g.settings,{origin,...(w.path?{path:w.path}:{})},keep)
      :g.verb==="quake"?new QuakeRun(before,g.settings,{path:w.path!,side:w.side!},keep)
      :new GlaciateRun(before,g.settings,{origin,...(end!==undefined?{end}:{}),...(w.via?.length?{via:w.via.map(at)}:{})},keep);
    run.finalize=buildTouches(s.terrainState(),before.heights,run instanceof GlaciateRun?()=>run.footprint():undefined);
    run.planAll();const after=run.final();if(!after)throw Error("force has no planned result");
    const where=g.verb==="quake"?{path:pathRecord(w.path!),side:w.side}:{origin:w.origin!,...(w.end?{end:w.end}:{}),...(w.path?{path:pathRecord(w.path)}:{})};
    params=forceParamsOf(before,after,{verb:g.verb,settings:g.settings,where,cut:g.cut,steps:run.total,reason:"done"});
    if(params&&run instanceof GlaciateRun&&run.plan)params={...withOwned(params,after.heights,run.footprint()),...glacierSprings(before,after,run.plan.retained)};
  }
  if(params&&inside)params=featherForce(params,m.heights,inside);
  if(!params)throw Error("force changed nothing");
  return {op:"forceResult",params};
}

export function applyResolvedForce(session:MapSession,op:EditOp,origin:OpOrigin="user",label?:string):void {
    const r=session.apply(op,origin,label);if(!r.ok)throw Error(r.errors.join("; "));
    // The worker's deterministic start repair remains in the same undo step.
    if(op.op==="forceResult"&&startBrokenBy(session,new Set(op.params.tiles))){const p=startMiddle(session),moves=p?moveStartNear(session,p[0],p[1],true):null;
      if(moves?.length){session.undo();const grouped=session.applyAll([op,...moves],origin,label);if(!grouped.ok)throw Error(grouped.errors.join("; "));}}
}

/** Gestures are authoritative; all literal force data is a disposable execution cache. */
export class GestureHistory {
  readonly session:MapSession;readonly results:ResultStore;
  private entries:GestureEntry[]=[];private cursor=0;
  private revision=0;
  private tempKey=2**40;
  private checkpoints:CheckpointIndex[]=[];
  private recent=new RecentStates<object>();
  private spacing:number;
  private bank:StateBank;
  checkpointFailure:string|null=null;
  lastSeek={replayed:0,checkpoint:0,cache:false};
  constructor(readonly base:MapDocument,cold:ColdResults,readonly documentId:string,readonly epoch=0,readonly policy:Policy={},execution?:object,executionStore?:ResultStore) {
    if(base.edits.length)throw Error("gesture history needs an immutable generation; legacy literals stay legacy");
    if(!documentId||!Number.isSafeInteger(epoch)||epoch<0)throw Error("invalid document identity");
    this.bank=new StateBank(cold);this.spacing=policy.checkpointEvery??32;if(!Number.isSafeInteger(this.spacing)||this.spacing<0)throw Error('invalid checkpoint spacing');
    this.base=immutable(structuredClone(base));this.session=execution?MapSession.restoreExecution(this.base,execution):MapSession.open(this.base);this.session.setWaterMode("defer");
    if(execution)checkDocument(this.base);
    this.results=executionStore??new ResultStore(cold,policy.results??32*1024*1024);
    this.session.useResultStore(this.results,0,1,!execution);
    this.remember();if(!execution&&this.spacing)this.persistCheckpoint();
  }
  private remember():void {
    const known=this.recent.get(this.cursor) as any,b=this.session.built;
    if(known?.cur.heights===b.heights&&known.cur.water===b.water&&known.cur.entities===b.entities&&known.cur.cache.keys===b.cache.keys&&known.gen.meta===this.session.meta){known.seqNext=this.session.nextOperationSeq;return;}
    this.recent.set(this.cursor,this.session.checkpointExecution());
    const budget=this.policy.snapshots??128*1024*1024,steps=this.policy.steps??16;
    while(this.recent.size>1&&(this.recent.size>steps||this.recent.bytes>budget)){const key=[...this.recent.keys()].find(k=>k!==this.cursor)!;this.recent.delete(key);}
  }
  private persistCheckpoint():void {
    const execution=this.session.checkpointExecution() as any;
    for(const v of [execution.gen,execution.baseCache,execution.st,execution.cur.entities,execution.cur.cache.resources])if(v)this.bank.share(v);
    const packed=packState(execution,this.bank);this.results.cold.put(CHECKPOINT_KEY+this.cursor,packed.bytes);
    this.checkpoints=this.checkpoints.filter(x=>x.at!==this.cursor);this.checkpoints.push({at:this.cursor,bytes:packed.bytes.length,results:packed.results,blobs:packed.blobs});this.checkpoints.sort((a,b)=>a.at-b.at);
    const budget=this.policy.checkpointBytes??128*1024*1024,max=this.policy.checkpointCount??128;
    while(this.checkpoints.length>2&&(this.checkpoints.length>max||this.checkpointBytes()>budget)){
      this.spacing*=2;this.checkpoints=this.checkpoints.filter(c=>c.at===0||c.at===this.cursor||c.at%this.spacing===0);
    }
  }
  private record(entry:GestureEntry):void {
    this.entries.length=this.cursor;this.entries.push(immutable(entry));this.cursor++;this.revision++;
    for(const at of this.recent.keys())if(at>this.cursor)this.recent.delete(at);
    this.checkpoints=this.checkpoints.filter(c=>c.at<this.cursor);
    for(const at of this.canonicalBoundaries)if(at>=this.cursor)this.canonicalBoundaries.delete(at);
    this.remember();if(this.spacing&&this.cursor%this.spacing===0){try{this.persistCheckpoint();this.checkpointFailure=null;}catch(e){this.checkpointFailure=String(e);}}
  }
  private importLegacy(op:AppliedOp):void {
    const applied=this.session.historyTransaction(()=>this.session.importAppliedForReplay(op));
    // Undo metadata is derived, and must stay mutable in the execution log.
    const {undo:_,orphaned:__,...literal}=applied;
    this.record({kind:"legacy",seq:op.seq,origin:op.origin,...(op.label?{label:op.label}:{}),op:literal});
  }
  apply(ops:EditOp[],origin:OpOrigin="user",label?:string):void {
    if(!ops.length||ops.some(o=>o.op==="forceResult"||o.op==="carve"))throw Error("new history accepts gestures, never force literals");
    this.remember();
    const seq=this.session.nextOperationSeq,r=this.session.historyTransaction(()=>this.session.applyAll(ops,origin,label));if(!r.ok)throw Error(r.errors.join("; "));
    this.record({kind:"operations",seq,origin,...(label?{label}:{}),ops:structuredClone(ops)});
  }
  private canonicalBoundaries=new Set<number>();
  adoptWater(...args:Parameters<MapSession['adoptWater']>):boolean {
    const before=this.session.built,ok=this.session.adoptWater(...args);
    if(ok&&before!==this.session.built){this.canonicalBoundaries.add(this.cursor);this.revision++;this.remember();}return ok;
  }
  settleCanonical():void {
    const before=this.session.built;this.session.settleCanonical();
    if(before!==this.session.built){this.canonicalBoundaries.add(this.cursor);this.revision++;this.remember();}
  }
  async select(gesture:SelectionGesture,origin:OpOrigin="user",label?:string,expectedInputHash?:string,inputHashVersion:1|2=2):Promise<void>{
    gesture=structuredClone(gesture);if(gesture.action!=="remove")throw Error("unknown Select action");
    validArea(gesture.area,this.session.size.x,this.session.size.y);
    if(!Array.isArray(gesture.kinds)||!gesture.kinds.length||gesture.kinds.some(k=>!["trees","bushes","ruins","sources","water","badwater","slopes","objects","start"].includes(k)))throw Error("invalid Select kinds");
    this.remember();
    const revision=this.revision,rollback=this.session.checkpointExecution();try {
    const inputHash=await forceInputHash(this.session,inputHashVersion);if(this.revision!==revision)throw Error("gesture superseded by a newer revision");
    if(expectedInputHash!==undefined&&inputHash!==expectedInputHash)throw Error('Select input differs');
    const seq=this.session.nextOperationSeq,plan=planRemoveAt(this.session,runsToTiles(gesture.area,this.session.size.x),gesture.kinds,label);
    const r=this.session.historyTransaction(()=>this.session.applyAll(plan.ops,origin,plan.label));if(!r.ok)throw Error(r.errors.join("; "));
    this.record({kind:"selection",seq,origin,label:plan.label,gesture,inputHash,inputHashVersion});
    }catch(error){if(this.revision===revision)this.session.installExecution(rollback);throw error;}
  }
  private async inputAt(count:number):Promise<MapSession> {
    const offsets=new Map<number,number>(),cold:ColdResults={put:(k,b)=>{let key=offsets.get(k);if(key===undefined){key=this.tempKey++;offsets.set(k,key);}this.results.cold.put(key,b);},get:k=>{const key=offsets.get(k);if(key===undefined)throw Error("missing replay cache");return this.results.cold.get(key);}};
    const cp=this.checkpoints.filter(c=>c.at<=count).at(-1);
    const execution=cp?unpackState(this.results.cold.get(CHECKPOINT_KEY+cp.at),this.results,this.bank):undefined;
    if(execution&&this.entries[cp!.at])execution.seqNext=this.entries[cp!.at].seq;
    const h=new GestureHistory(this.base,cold,this.documentId,this.epoch,{...this.policy,snapshots:0,steps:1,checkpointEvery:0},execution);
    h.entries=this.entries.slice(0,cp?.at??0);h.cursor=cp?.at??0;h.checkpoints=this.checkpoints.filter(c=>c.at<=h.cursor);
    // Nested original-prefix replacements borrow this controller's checkpoint/result store.
    h.inputAt=(at)=>this.inputAt(at);
    if(this.canonicalBoundaries.has(h.cursor))h.settleCanonical();
    for(const e of this.entries.slice(h.cursor,count)){await h.replayEntry(e);if(this.canonicalBoundaries.has(h.cursor))h.settleCanonical();}
    return h.session;
  }
  async force(gesture:ForceGesture,origin:OpOrigin="user",label?:string,replaces?:number,expectedInputHash?:string,inputHashVersion:1|2=2):Promise<EditOp> {
    gesture=structuredClone(gesture);
    validForce(gesture,this.session);
    this.remember();const revision=this.revision,rollback=this.session.checkpointExecution();
    try {
    const previous=this.entries[this.cursor-1];
    if(replaces!==undefined&&(!previous||previous.kind!=="force"||previous.forceSeq!==replaces||previous.gesture.verb!==gesture.verb))throw Error("Try another needs the latest force in its series");
    const inputCursor=replaces!==undefined&&previous.kind==="force"?previous.inputCursor:this.cursor;
    const input=inputCursor===this.cursor?this.session:await this.inputAt(inputCursor);
    const inputHash=await forceInputHash(input,inputHashVersion);
    if(this.revision!==revision)throw Error("gesture superseded by a newer revision");
    if(expectedInputHash!==undefined&&inputHash!==expectedInputHash)throw Error('force input differs');
    const seq=this.session.nextOperationSeq,op=this.session.historyTransaction(()=>{
      const resolved=resolveForce(input,gesture);if(replaces!==undefined&&resolved.op==="forceResult")resolved.params.replaces=replaces;
      applyResolvedForce(this.session,resolved,origin,label);return resolved;
    });
    const forceSeq=this.session.history().filter(e=>e.applied).at(-1)!.seq;
    if(forceSeq===undefined)throw Error("missing committed force sequence");
    this.record({kind:"force",seq,origin,...(label?{label}:{}),gesture:structuredClone(gesture),inputHash,inputHashVersion,inputCursor,forceSeq,...(replaces!==undefined?{replaces}: {})});return op;
    }catch(error){if(this.revision===revision)this.session.installExecution(rollback);throw error;}
  }
  undo():boolean {if(!this.cursor)return false;const cached=this.recent.get(this.cursor-1);if(cached){this.remember();const seq=this.session.nextOperationSeq;this.session.installExecution(cached);this.session.setReplaySequence(Math.max(seq,this.session.nextOperationSeq));this.cursor--;this.revision++;return true;}
    if(!this.session.historyTransaction(()=>this.session.undo()))throw Error("cold undo requires await seek(count-1)");this.cursor--;this.revision++;this.remember();return true;}
  redo():boolean {if(this.cursor===this.entries.length)return false;const cached=this.recent.get(this.cursor+1);if(cached){this.remember();const seq=this.session.nextOperationSeq;this.session.installExecution(cached);this.session.setReplaySequence(Math.max(seq,this.session.nextOperationSeq));this.cursor++;this.revision++;return true;}
    if(!this.session.historyTransaction(()=>this.session.redo()))throw Error("cold redo requires await seek(count+1)");this.cursor++;this.revision++;this.remember();return true;}
  private async replayEntry(entry:GestureEntry):Promise<void> {
    if(!entry||!['user','claude','fix'].includes(entry.origin)||entry.label!==undefined&&typeof entry.label!=='string')throw Error('invalid gesture envelope');
    this.session.setReplaySequence(entry.seq);
    if(entry.kind==='operations')this.apply(entry.ops,entry.origin,entry.label);
    else if(entry.kind==='legacy'){if(entry.op?.seq!==entry.seq||entry.op.origin!==entry.origin)throw Error('invalid legacy envelope');this.importLegacy(entry.op);}
    else if(entry.kind==='selection')await this.select(entry.gesture,entry.origin,entry.label,entry.inputHash,entry.inputHashVersion??1);
    else if(entry.kind==='force'){await this.force(entry.gesture,entry.origin,entry.label,entry.replaces,entry.inputHash,entry.inputHashVersion??1);const actual=this.entries.at(-1) as Extract<GestureEntry,{kind:'force'}>;if(actual.forceSeq!==entry.forceSeq||actual.inputCursor!==entry.inputCursor)throw Error('force cursor/sequence differs');}
    else throw Error('unknown gesture kind');
  }
  /** Cold history movement is asynchronous; callers retain the current visible map until it succeeds. */
  async seek(target:number,progress?:(at:number,session:MapSession)=>Promise<void>):Promise<void> {
    if(!Number.isSafeInteger(target)||target<0||target>this.entries.length)throw Error('invalid history cursor');
    if(target===this.cursor)return;
    const nextSeq=this.session.nextOperationSeq,revision=this.revision,cached=this.recent.get(target);
    let execution:object,replayed=0,at=target;
    if(cached)execution=cached;
    else {
      const cp=this.checkpoints.filter(c=>c.at<=target).at(-1);if(!cp)throw Error('missing history checkpoint');at=cp.at;
      const state=unpackState(this.results.cold.get(CHECKPOINT_KEY+at),this.results,this.bank);
      if(this.entries[at])state.seqNext=this.entries[at].seq;
      const h=new GestureHistory(this.base,this.results.cold,this.documentId,this.epoch,{...this.policy,checkpointEvery:0},state,this.results);
      h.entries=this.entries.slice(0,at);h.cursor=at;h.checkpoints=this.checkpoints.filter(c=>c.at<=at);h.inputAt=n=>this.inputAt(n);
      if(this.canonicalBoundaries.has(h.cursor))h.settleCanonical();
      for(const e of this.entries.slice(at,target)){await h.replayEntry(e);if(this.canonicalBoundaries.has(h.cursor))h.settleCanonical();replayed++;await progress?.(h.cursor,h.session);}
      execution=h.session.checkpointExecution();
    }
    if(this.revision!==revision)throw Error('history seek superseded');
    this.remember();this.session.installExecution(execution);this.session.setReplaySequence(Math.max(nextSeq,this.session.nextOperationSeq));this.cursor=target;this.revision++;this.remember();this.lastSeek={replayed,checkpoint:at,cache:!!cached};
  }
  private checkpointBytes():number{return this.checkpoints.reduce((n,c)=>n+c.bytes,0)+this.bank.index(this.checkpoints.flatMap(c=>c.blobs)).reduce((n,c)=>n+c.bytes,0);}
  get checkpointStats(){return {spacing:this.spacing,count:this.checkpoints.length,bytes:this.checkpointBytes(),recentBytes:this.recent.bytes,recentCount:this.recent.size,failure:this.checkpointFailure};}
  get count():number{return this.cursor;}
  get project():GestureProject {return {app:"dam-good-maps",formatVersion:4,replayVersion:REPLAY_VERSION,documentId:this.documentId,epoch:this.epoch,base:{...this.base,meta:immutable(structuredClone(this.session.meta))},entries:this.entries.slice(0,this.cursor),nextSeq:this.session.nextOperationSeq};}
  async save(sink:(bytes:Uint8Array)=>Promise<void>):Promise<void> {
    this.remember();this.persistCheckpoint();
    const index=this.checkpoints.filter(c=>c.at<=this.entries.length),current=this.session.checkpointExecution();
    const manifest={...this.project,formatVersion:5,abi:STATE_ABI,entries:this.entries.slice(),cursor:this.cursor,spacing:this.spacing,checkpoints:index,canonicalBoundaries:[...this.canonicalBoundaries]};
    await writeArchive(manifest,current,index,this.results,this.bank,sink);
  }
  static async open(source:Iterable<Uint8Array>|AsyncIterable<Uint8Array>,cold:ColdResults,policy:Policy={},progress?:(done:number,total:number)=>Promise<void>):Promise<GestureHistory|MapSession> {
    const input=await archiveSource(source);
    if(input.archive){const store=new ResultStore(cold,policy.results??32*1024*1024),archive=await readArchive(input.source,store);if(!archive)throw Error('missing archive');const raw=archive.manifest;
      if(raw.app!=='dam-good-maps'||raw.formatVersion!==5||raw.replayVersion!==REPLAY_VERSION||raw.abi!==STATE_ABI)throw Error('unsupported project version');
      if(!Array.isArray(raw.entries)||!Number.isSafeInteger(raw.cursor)||raw.cursor<0||raw.cursor>raw.entries.length||!Number.isSafeInteger(raw.spacing)||raw.spacing<1||archive.current.undoStack.length!==raw.cursor||archive.current.seqNext!==raw.nextSeq)throw Error('invalid saved history');
      let prior=0;for(const e of raw.entries){if(!Number.isSafeInteger(e.seq)||e.seq<=prior||!['operations','selection','force','legacy'].includes(e.kind)||!['user','claude','fix'].includes(e.origin)||e.label!==undefined&&typeof e.label!=='string')throw Error('invalid gesture envelope');
        if((e.kind==='force'||e.kind==='selection')&&((e.inputHashVersion!==undefined&&e.inputHashVersion!==1&&e.inputHashVersion!==2)||typeof e.inputHash!=='string'||!/^[0-9a-f]{64}$/.test(e.inputHash)))throw Error('unsupported or invalid input hash');prior=e.seq;}
      const boundaries=raw.canonicalBoundaries??[];if(!Array.isArray(boundaries)||boundaries.some((n:any)=>!Number.isSafeInteger(n)||n<0||n>raw.entries.length)||new Set(boundaries).size!==boundaries.length)throw Error('invalid canonical water boundaries');
      const h=new GestureHistory(raw.base,cold,raw.documentId,raw.epoch,policy,archive.current,store);h.bank=archive.bank;h.entries=raw.entries.map((e:GestureEntry)=>immutable(e));h.cursor=raw.cursor;h.spacing=raw.spacing;h.checkpoints=archive.checkpoints;h.canonicalBoundaries=new Set(boundaries);h.recent.clear();h.remember();return h;
    }
    const raw=await readProject(input.source) as GestureProject;
    if(raw.app!=="dam-good-maps")throw Error("not a DGM project");
    if(raw.formatVersion!==4){
      const doc=decodeProjectObject(raw),features=baseFeaturesOf(doc),base={...doc,baseFeatures:features,features,edits:[],nextSeq:1};
      const h=new GestureHistory(base,cold,"legacy-"+crypto.randomUUID(),0,policy);
      // A saved legacy result may lack its historical force/water inputs. Preserve it losslessly;
      // all NEW edits use gestures. Do not guess a seed recipe or discard old undo depth.
      for(const op of doc.edits)h.importLegacy(op);
      h.session.setReplaySequence(doc.nextSeq);h.session.settleCanonical();return h;
    }
    if(raw.replayVersion!==REPLAY_VERSION)throw Error("unsupported replay version; original engine required");
    if(!Array.isArray(raw.entries)||raw.base?.app!=="dam-good-maps"||raw.base.formatVersion!==3)throw Error("invalid gesture journal");
    const h=new GestureHistory(raw.base,cold,raw.documentId,raw.epoch,policy);
    for(const entry of raw.entries){
      await h.replayEntry(entry);
      await progress?.(h.count,raw.entries.length);
    }
    h.session.setReplaySequence(raw.nextSeq);return h;
  }
}
