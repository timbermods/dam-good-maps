import { fullMap, type FullForceMap } from '../../src/core/forces/force';
import { CarveRun, DEFAULTS } from '../../src/core/forces/carve/run';
import { carveParams } from '../../src/core/forces/carve/result';
import { CraterRun, EruptRun, QuakeRun } from '../../src/core/forces/runs';
import { GlaciateRun } from '../../src/core/forces/glaciate/run';
import { CRATER_DEFAULTS } from '../../src/core/forces/craterize';
import { ERUPT_DEFAULTS } from '../../src/core/forces/erupt';
import { QUAKE_DEFAULTS } from '../../src/core/forces/quake';
import { forceParamsOf, type ForceRecord } from '../../src/core/forces/result';
import { forceOfCarve, type Verb } from '../../src/core/forces/op';
import { buildMap } from '../../src/core/features/build';
import type { EditOp } from '../../src/core/doc/ops';
import type { MapSession } from '../../src/core/doc/session';
import { startBrokenBy, startMiddle, moveStartNear } from '../../src/core/doc/tools';
import { clone, difference, plain, type State, type Mask } from './state';
export type Gesture = ForceRecord & { id:string; baseSeq:number; claimRevision:number };
export function gesture(verb:Verb,W:number,seed=362,mode?:string):Gesture {
  const origin:[number,number]=[Math.floor(W*.35),Math.floor(W*.7)],end:[number,number]=[Math.floor(W*.75),Math.floor(W*.3)];
  const path:[number,number][]=[origin,[W*.55,W*.55],end];
  return {id:`00000000-0000-4000-8000-${seed.toString(16).padStart(12,'0')}`,baseSeq:0,claimRevision:0,
    verb,settings: verb==='carve'?{mode:'aim',power:30,width:5,dry:true,wander:35,walls:'steep',defyGravity:false,seed}:
      verb==='craterize'?{...CRATER_DEFAULTS,power:40,size:20,seed}:
      verb==='erupt'?{...ERUPT_DEFAULTS,mode:mode==='fissure'?'fissure':'vent',power:40,size:20,seed}:
      verb==='quake'?{...QUAKE_DEFAULTS,mode:mode==='slide'?'slide':'lift',power:25,seed}:
      {mode:'aim',power:25,size:8,meltwater:true,seed,tarn:false,scree:false},
    where:verb==='quake'?{path,side:1}:verb==='erupt'&&mode==='fissure'?{origin,path}:verb==='carve'||verb==='glaciate'?{origin,end}:{origin},
    cut:null,steps:0,reason:'done'};
}
export function forceMap(s:State):FullForceMap {
  return fullMap({W:s.W,H:s.H,heights:s.heights,entities:s.entities,water:{depth:s.water,contamination:s.contamination},maxHeight:22,lava:s.lava,fallen:s.fallen,rockLayers:s.rockLayers});
}
export type Prepared={gesture:Gesture; op:EditOp; after:State; footprint:Mask; planningMs:number; buildMs:number};
export function prepare(s:State,g:Gesture):Prepared {
  if(g.replaces!==undefined)throw Error('prepare Try another on its original checkpoint, without replaces');
  const start=performance.now(),m=forceMap(s),w=g.where;
  const origin=(w.origin?.[1]??0)*s.W+(w.origin?.[0]??0),end=w.end?w.end[1]*s.W+w.end[0]:undefined;
  let op:EditOp,final:FullForceMap;
  const keep=new Uint8Array(s.W*s.H);for(const [i]of s.columns)keep[i]=1;
  if(g.cut!==null)for(let i=0;i<keep.length;i++)if(s.heights[i]>g.cut)keep[i]=1;
  if(g.verb==='carve') {
    const run=new CarveRun(m,g.settings as any,{origin,end,via:w.path?.slice(1,-1).map(([x,y])=>Math.round(y)*s.W+Math.round(x))},{sourceId:g.id,keep,unleashed:w.source});
    // Fixed deterministic horizon. Never use wall time as the stop condition.
    for(let k=0;k<256&&!run.done;k++)run.step();
    const p=carveParams(m,run,{settings:g.settings as any,origin:w.origin!,end:w.end,cut:g.cut});
    if(!p)throw Error('no force effect');op={op:'forceResult',params:forceOfCarve(p)};final=fullMap(run.map);
  } else {
    const points=w.path?.map(([x,y])=>({x,y}));
    const run=g.verb==='craterize'?new CraterRun(m,g.settings as any,{origin,end},keep):
      g.verb==='erupt'?new EruptRun(m,g.settings as any,{origin,path:points},keep):
      g.verb==='quake'?new QuakeRun(m,g.settings as any,{path:points!,side:w.side!},keep):
      new GlaciateRun(m,g.settings as any,{origin,end,via:w.path?.slice(1,-1).map(([x,y])=>Math.round(y)*s.W+Math.round(x))},keep);
    run.planAll();final=run.final()!;
    const p=forceParamsOf(m,final,{...g,steps:run.total,reason:'done'});
    if(!p)throw Error('no force effect');
    if(run instanceof GlaciateRun) {
      const beforeIds=new Set(m.entities.map(e=>e.id));
      p.sources=final.entities.filter(e=>!beforeIds.has(e.id)&&e.template==='WaterSource').map(e=>({id:e.id,x:e.x,y:e.y,strength:Number((e.components as any).WaterSource?.SpecifiedStrength??0)})).filter(e=>e.strength>0);
      if(run.plan?.retained.tiles.length)p.lake=run.plan.retained;
      const owned=run.footprint();if(owned){const at=new Map(p.tiles.map((i,k)=>[i,p.heights[k]]));for(let i=0;i<owned.length;i++)if(owned[i])at.set(i,final.heights[i]);
        p.tiles=[...at.keys()].sort((a,b)=>a-b);p.heights=p.tiles.map(i=>at.get(i)!);}
    }
    op={op:'forceResult',params:p};
  }
  const planningMs=performance.now()-start;
  // The product's build derives slopes, carries the start and handles rigid objects. Include it.
  const bstart=performance.now(),applied={...op,seq:1,origin:'user' as const};
  const b=buildMap({W:s.W,H:s.H,seed:362,features:[],base:{heights:s.heights,columns:new Map(s.columns.map(([i,c])=>[i,Uint8Array.from(c)])),entities:s.entities},
    sculpts:[applied as any],entityEdits:[applied as any]}, {stopBeforeWater:true});
  const after=clone(s);after.heights=b.heights;after.entities=plain(b.entities);after.lava=final.lava.slice();after.fallen=clone(final.fallen);
  if(op.params.lake)after.retained.push({id:g.id,water:clone(op.params.lake)});
  // The product groups this automatic carry with the force. Use its core planning helper.
  const facade={built:{...b,water:s.water},features:[],size:{x:s.W,y:s.H}} as unknown as MapSession;
  if(startBrokenBy(facade,new Set(op.params.tiles))) {
    const at=startMiddle(facade),carry=at?moveStartNear(facade,at[0],at[1],true):null;
    if(carry)for(const edit of carry)if(edit.op==='moveEntity') {
      const e=after.entities.find(e=>e.id===edit.params.id);if(e){e.x=edit.params.x;e.y=edit.params.y;e.z=after.heights[e.y*s.W+e.x];}
    }
  }
  const footprint=difference(s,after).writes;
  return {gesture:clone(g),op,after,footprint,planningMs,buildMs:performance.now()-bstart};
}
// Latest stroke replaces pending work. A worker may run prepare in slices; this cache is the
// completed-plan boundary. Release is disabled until the latest gesture has a completed plan.
export class PreviewCache {
  private last:Prepared|null=null;
  computations=0;
  preview(s:State,g:Gesture){if(this.last&&JSON.stringify(this.last.gesture)===JSON.stringify(g))return this.last;
    this.computations++;return this.last=prepare(s,g);}
  release(id:string,seq:number,claims:number){const p=this.last;
    if(!p||p.gesture.id!==id||p.gesture.baseSeq!==seq||p.gesture.claimRevision!==claims)throw Error('preview changed; draw again');
    this.last=null;return p;
  }
}
