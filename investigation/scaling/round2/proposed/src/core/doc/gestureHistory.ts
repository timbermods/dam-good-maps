import {MapSession} from "./session";
import {decodeProjectObject,baseFeaturesOf,type MapDocument} from "./document";
import type {EditOp,OpOrigin,AppliedOp} from "./ops";
import {ResultStore,type ColdResults} from "./resultStore";
import {readProject,writeProject} from "./projectStream";
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
  {kind:"operations";ops:EditOp[]}|{kind:"force";gesture:ForceGesture;inputHash:string;inputCursor:number;forceSeq:number;replaces?:number}|{kind:"legacy";op:AppliedOp}|{kind:"selection";gesture:SelectionGesture;inputHash:string}
);
export type SelectionGesture={action:"remove";area:Runs;kinds:RemoveKind[]};
export type GestureProject={app:"dam-good-maps";formatVersion:4;replayVersion:typeof REPLAY_VERSION;documentId:string;epoch:number;base:MapDocument;entries:GestureEntry[];nextSeq:number};
export type Policy={results?:number;snapshots?:number;steps?:number};
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
export async function forceInputHash(s:MapSession):Promise<string> {
  const m=s.historyTransaction(()=>canonicalForceMap(s)),parts:Uint8Array[]=[m.heights,new Uint8Array(m.water.depth.buffer),new Uint8Array(m.water.contamination.buffer),new Uint8Array(m.lava.buffer),new TextEncoder().encode(JSON.stringify([m.W,m.H,m.maxHeight,m.entities,m.rockLayers,m.fallen]))];
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
  constructor(readonly base:MapDocument,cold:ColdResults,readonly documentId:string,readonly epoch=0,readonly policy:Policy={}) {
    if(base.edits.length)throw Error("gesture history needs an immutable generation; legacy literals stay legacy");
    if(!documentId||!Number.isSafeInteger(epoch)||epoch<0)throw Error("invalid document identity");
    this.base=immutable(structuredClone(base));this.session=MapSession.open(this.base);this.session.setWaterMode("defer");
    this.results=new ResultStore(cold,policy.results??32*1024*1024);
    this.session.useResultStore(this.results,policy.snapshots??128*1024*1024,policy.steps??16);
  }
  private record(entry:GestureEntry):void {this.entries.length=this.cursor;this.entries.push(immutable(entry));this.cursor++;this.revision++;}
  private importLegacy(op:AppliedOp):void {
    const applied=this.session.historyTransaction(()=>this.session.importAppliedForReplay(op));
    // Undo metadata is derived, and must stay mutable in the execution log.
    const {undo:_,orphaned:__,...literal}=applied;
    this.record({kind:"legacy",seq:op.seq,origin:op.origin,...(op.label?{label:op.label}:{}),op:literal});
  }
  apply(ops:EditOp[],origin:OpOrigin="user",label?:string):void {
    if(!ops.length||ops.some(o=>o.op==="forceResult"||o.op==="carve"))throw Error("new history accepts gestures, never force literals");
    const seq=this.session.nextOperationSeq,r=this.session.historyTransaction(()=>this.session.applyAll(ops,origin,label));if(!r.ok)throw Error(r.errors.join("; "));
    this.record({kind:"operations",seq,origin,...(label?{label}:{}),ops:structuredClone(ops)});
  }
  async select(gesture:SelectionGesture,origin:OpOrigin="user",label?:string):Promise<void>{
    gesture=structuredClone(gesture);if(gesture.action!=="remove")throw Error("unknown Select action");
    validArea(gesture.area,this.session.size.x,this.session.size.y);
    if(!Array.isArray(gesture.kinds)||!gesture.kinds.length||gesture.kinds.some(k=>!["trees","bushes","ruins","sources","water","badwater","slopes","objects","start"].includes(k)))throw Error("invalid Select kinds");
    const revision=this.revision,inputHash=await forceInputHash(this.session);if(this.revision!==revision)throw Error("gesture superseded by a newer revision");
    const seq=this.session.nextOperationSeq,plan=planRemoveAt(this.session,runsToTiles(gesture.area,this.session.size.x),gesture.kinds,label);
    const r=this.session.historyTransaction(()=>this.session.applyAll(plan.ops,origin,plan.label));if(!r.ok)throw Error(r.errors.join("; "));
    this.record({kind:"selection",seq,origin,label:plan.label,gesture,inputHash});
  }
  private async inputAt(count:number):Promise<MapSession> {
    const offsets=new Map<number,number>(),cold:ColdResults={put:(k,b)=>{let key=offsets.get(k);if(key===undefined){key=this.tempKey++;offsets.set(k,key);}this.results.cold.put(key,b);},get:k=>{const key=offsets.get(k);if(key===undefined)throw Error("missing replay cache");return this.results.cold.get(key);}};
    const h=new GestureHistory(this.base,cold,this.documentId,this.epoch,{...this.policy,snapshots:0,steps:1});
    for(const e of this.entries.slice(0,count)){h.session.setReplaySequence(e.seq);if(e.kind==="operations")h.apply(e.ops,e.origin,e.label);else if(e.kind==="legacy")h.importLegacy(e.op);else if(e.kind==="selection")await h.select(e.gesture,e.origin,e.label);else await h.force(e.gesture,e.origin,e.label,e.replaces);}
    return h.session;
  }
  async force(gesture:ForceGesture,origin:OpOrigin="user",label?:string,replaces?:number):Promise<EditOp> {
    gesture=structuredClone(gesture);
    validForce(gesture,this.session);
    const revision=this.revision;
    const previous=this.entries[this.cursor-1];
    if(replaces!==undefined&&(!previous||previous.kind!=="force"||previous.forceSeq!==replaces||previous.gesture.verb!==gesture.verb))throw Error("Try another needs the latest force in its series");
    const inputCursor=replaces!==undefined&&previous.kind==="force"?previous.inputCursor:this.cursor;
    const input=inputCursor===this.cursor?this.session:await this.inputAt(inputCursor);
    const inputHash=await forceInputHash(input);
    if(this.revision!==revision)throw Error("gesture superseded by a newer revision");
    const seq=this.session.nextOperationSeq,op=this.session.historyTransaction(()=>{
      const resolved=resolveForce(input,gesture);if(replaces!==undefined&&resolved.op==="forceResult")resolved.params.replaces=replaces;
      applyResolvedForce(this.session,resolved,origin,label);return resolved;
    });
    const forceSeq=this.session.history().filter(e=>e.applied).at(-1)!.seq;
    if(forceSeq===undefined)throw Error("missing committed force sequence");
    this.record({kind:"force",seq,origin,...(label?{label}:{}),gesture:structuredClone(gesture),inputHash,inputCursor,forceSeq,...(replaces!==undefined?{replaces}: {})});return op;
  }
  undo():boolean {if(!this.cursor)return false;if(!this.session.historyTransaction(()=>this.session.undo()))throw Error("history mismatch");this.cursor--;this.revision++;return true;}
  redo():boolean {if(this.cursor===this.entries.length)return false;if(!this.session.historyTransaction(()=>this.session.redo()))throw Error("history mismatch");this.cursor++;this.revision++;return true;}
  get count():number{return this.cursor;}
  get project():GestureProject {return {app:"dam-good-maps",formatVersion:4,replayVersion:REPLAY_VERSION,documentId:this.documentId,epoch:this.epoch,base:{...this.base,meta:immutable(structuredClone(this.session.meta))},entries:this.entries.slice(0,this.cursor),nextSeq:this.session.nextOperationSeq};}
  async save(sink:(bytes:Uint8Array)=>Promise<void>):Promise<void> {await writeProject(this.project,sink);}
  static async open(source:Iterable<Uint8Array>|AsyncIterable<Uint8Array>,cold:ColdResults,policy:Policy={},progress?:(done:number,total:number)=>Promise<void>):Promise<GestureHistory|MapSession> {
    const raw=await readProject(source) as GestureProject;
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
      if(!entry||!["user","claude","fix"].includes(entry.origin)||entry.label!==undefined&&typeof entry.label!=="string")throw Error("invalid gesture envelope");
      h.session.setReplaySequence(entry.seq);
      if(entry.kind==="operations")h.apply(entry.ops,entry.origin,entry.label);
      else if(entry.kind==="legacy"){if(entry.op?.seq!==entry.seq||entry.op.origin!==entry.origin)throw Error("invalid legacy envelope");h.importLegacy(entry.op);}
      else if(entry.kind==="selection"){if(await forceInputHash(h.session)!==entry.inputHash)throw Error("Select input differs");await h.select(entry.gesture,entry.origin,entry.label);}
      else if(entry.kind==="force"){
        const old=h.entries[h.cursor-1],at=entry.replaces!==undefined&&old?.kind==="force"?old.inputCursor:h.cursor;
        if(entry.inputCursor!==at)throw Error("invalid original force input cursor");
        const input=at===h.cursor?h.session:await h.inputAt(at);
        if(await forceInputHash(input)!==entry.inputHash)throw Error("force input does not match recorded epoch/state");
        await h.force(entry.gesture,entry.origin,entry.label,entry.replaces);
        if(h.entries.at(-1)?.kind!=="force"||(h.entries.at(-1) as Extract<GestureEntry,{kind:"force"}>).forceSeq!==entry.forceSeq)throw Error("force sequence differs");
      }
      else throw Error("unknown gesture kind");
      await progress?.(h.count,raw.entries.length);
    }
    h.session.setReplaySequence(raw.nextSeq);return h;
  }
}
