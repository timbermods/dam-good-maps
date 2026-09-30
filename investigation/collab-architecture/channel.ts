// Headless host/replica dispatcher. Plug into collab-spike's reliable data channel;
// the two-copy-paste SDP exchange and STUN-only configuration are unchanged.
import type { EditOp } from '../../src/core/doc/ops';
import { Journal, type Claims } from './architecture';
import { type State, type Player, clone, put } from './state';
import { prepare, PreviewCache, type Gesture } from './forces';
import type { Presence } from './snapshot';
export type Command = {kind:'edit';op:EditOp;label:string}|{kind:'force';gesture:Gesture}|
  {kind:'undo'}|{kind:'claim';action:'claim'|'release';runs:number[][]}|
  {kind:'offer';id:string;runs:number[][]}|{kind:'answer';id:string;accept:boolean};
export type Request={kind:'request';session:string;epoch:string;counter:number;baseSeq:number;claimRevision:number;command:Command};
export type Commit={kind:'commit';seq:number;author:Player;counter:number;command:Command;hash:string;undone?:number|null;skipped?:{seq:number;reason:string}[]};
export type Reliable = {kind:'hello';protocol:1;build:string;schema:string;session:string;epoch:string;lastSeq:number;hash:string}|
  {kind:'snapshot';id:string;seq:number;bytes:number;sha256:string;chunks:number}|
  {kind:'chunk';id:string;part:number;data:Uint8Array}|
  {kind:'end';seq:number;hash:string}|{kind:'ready'|'ack';seq:number;hash:string}|
  Request|Commit|{kind:'reject';counter:number;reason:string}|
  {kind:'ping'|'pong';counter:number}|{kind:'pause';reason:string}|
  {kind:'map-opening';name:string}|{kind:'water';seq:number;author:Player;runs:number[][];bounds:number[];flooded:number;drained:number}|Presence;
const other=(p:Player):Player=>p==='host'?'guest':'host';
export type CoreAdapter={apply:(s:State,op:EditOp)=>State;settle?:(s:State)=>State;hash:(s:State)=>string;plan?:typeof prepare};
function forceBase(j:Journal,p:Player,g:Gesture,core:CoreAdapter){
  const previous=g.replaces===undefined?undefined:j.entries.find(e=>e.seq===g.replaces&&e.active);
  if(g.replaces!==undefined&&(!previous||previous.author!==p||j.entries.filter(e=>e.active).at(-1)!==previous))throw Error('Try another is no longer latest');
  let original=j.state;if(previous){original=clone(j.state);put(original,previous.patch,true);if(core.settle)original=core.settle(original);}
  return {previous,original};
}
function execute(j:Journal,p:Player,c:Command,core:CoreAdapter){
  switch(c.kind){
    case 'edit':
      if(['forceResult','carve'].includes(c.op.op))throw Error('send the force gesture, not a result');
      j.accept(p,c.label,core.apply(j.state,c.op),c.op);break;
    case 'force': {
      const {previous,original}=forceBase(j,p,c.gesture,core);
      const f=(core.plan??prepare)(original,{...c.gesture,replaces:undefined});
      if(previous&&f.op.op==='forceResult')f.op.params.replaces=previous.seq;
      j.accept(p,c.gesture.verb,f.after,f.op);break;
    }
    case 'undo':return j.undo(p,core.settle);
    case 'claim':j.claims[c.action](p,c.runs);j.seq++;break;
    case 'offer':j.claims.offer(c.id,p,other(p),c.runs);j.seq++;break;
    case 'answer':j.claims.answer(c.id,p,c.accept);j.seq++;break;
  }
  return undefined;
}
export class Host {
  ready=false;
  previewCache=new PreviewCache();
  counters:Record<Player,number>={host:0,guest:0};
  constructor(readonly journal:Journal,readonly core:CoreAdapter,readonly session:string,readonly epoch:string){}
  drop(){this.ready=false;}
  preview(author:Player,g:Gesture){
    if(!this.ready||g.baseSeq!==this.journal.seq||g.claimRevision!==this.journal.claims.revision)throw Error('stale preview');
    const {original}=forceBase(this.journal,author,g,this.core);return this.previewCache.preview(original,{...g,replaces:undefined});
  }
  request(author:Player,r:Request):Commit|{kind:'reject';counter:number;reason:string}{
    try {
      if(!this.ready)throw Error('session paused');
      if(r.session!==this.session||r.epoch!==this.epoch)throw Error('old connection');
      if(!Number.isSafeInteger(r.counter)||r.counter!==this.counters[author]+1)throw Error('duplicate or missing request');
      // Count attempted requests too: rejection is terminal and must not be retried under the same id.
      this.counters[author]=r.counter;
      if(r.baseSeq!==this.journal.seq||r.claimRevision!==this.journal.claims.revision)throw Error('map changed; draw again');
      if(r.command.kind==='force'&&(r.command.gesture.baseSeq!==r.baseSeq||r.command.gesture.claimRevision!==r.claimRevision))throw Error('stale force preview');
      const undo=execute(this.journal,author,r.command,{...this.core,plan:(s,g)=>{
        this.previewCache.preview(s,g);return this.previewCache.release(g.id,this.journal.seq,this.journal.claims.revision);
      }});
      if(undo&&undo.action===null)throw Error(undo.skipped[0]?.reason??'no own action to undo');
      return {kind:'commit',seq:this.journal.seq,author,counter:r.counter,command:r.command,hash:this.core.hash(this.journal.state),
        ...(undo?{undone:undo.action,skipped:undo.skipped}: {})};
    }catch(e){return {kind:'reject',counter:r.counter,reason:(e as Error).message};}
  }
}
export function receiveCommit(j:Journal,c:Commit,core:CoreAdapter){
  if(c.seq!==j.seq+1)throw Error('commit gap; pause and rejoin');
  const undo=execute(j,c.author,c.command,core);
  if(undo&&undo.action!==c.undone)throw Error('undo differs; pause');
  if(core.hash(j.state)!==c.hash)throw Error('map differs; pause');
}
export class PresenceReceiver {
  counter=-1;current:Presence|null=null;
  constructor(readonly epoch:string,readonly W:number,readonly H:number){}
  accept(p:Presence){
    if(p.epoch!==this.epoch||!Number.isSafeInteger(p.counter)||p.counter<=this.counter)return false;
    const point=(v:number[])=>v.length===2&&v.every(Number.isInteger)&&v[0]>=0&&v[1]>=0&&v[0]<4*this.W&&v[1]<4*this.H;
    if(p.cursor&&!point(p.cursor))return false;
    if(p.stroke){if(p.stroke.points.length>72||p.stroke.points.length%2)return false;
      for(let k=0;k<p.stroke.points.length;k+=2)if(!point(p.stroke.points.slice(k,k+2)))return false;}
    if(p.tool.length>32||!p.view.target.every(Number.isFinite)||![p.view.distance,p.view.yaw,p.view.pitch].every(Number.isFinite))return false;
    this.counter=p.counter;this.current=p;return true;
  }
}
