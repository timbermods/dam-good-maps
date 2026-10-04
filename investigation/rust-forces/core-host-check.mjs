// Fixed core-integration fixtures, not a random corpus or timing run.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,deps,json,hash} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),bridge=await api.bridge(readFileSync(resolve(LOCAL,'forces.wasm'))),rows=[];let calls=0;const rust={create(j){const task=bridge.create(j),plan=task.plan;task.plan=()=>{calls++;return plan();};return task;}};
for(const verb of ['craterize','erupt','quake','carve','glaciate'])for(const k of [0,1,2]){
 const j=api.job(verb,64,k),base=j.map,W=base.W,n=W*base.H,point=i=>[i%W,Math.floor(i/W)];
 const request={verb,settings:j.settings,cut:null,...(verb==='quake'?{path:j.intent.path,side:j.intent.side}:{origin:point(j.intent.origin)}),...(j.intent.end!==undefined?{end:point(j.intent.end)}:{}),...(verb==='erupt'?{path:j.intent.path}:{}),...(k===1?{natural:true}:{}),...(k===2&&verb==='quake'?{painting:true}:{}),...(k===2?{area:Array.from({length:64},(_,y)=>[y,4,60])}:{})};
 const state={pre:base.heights.slice(),protect:new Uint8Array(n),channel:new Uint8Array(n),base:base.heights.slice(),locked:null,columns:new Int32Array(n).fill(-1),top:base.maxHeight};
 const input={base,request,caves:[],state,newId:()=>`core-fixture-${verb}-${k}`};
 const beforeCalls=calls,ts=api.planForce(input),rs=api.planRustForce(input,rust);
 assert.equal(ts.ok,rs.ok);if(!ts.ok){assert.equal(ts.error,rs.error);rows.push({verb,k,refusal:ts.error});continue;}
 for(const selected of [ts,rs]){if(selected.carve){let steps=0;while(!selected.carve.done&&steps++<10000)selected.carve.step();assert.ok(selected.carve.done);}else selected.staged.finishAll();}
 const expected=api.keptForceParams(ts),actual=api.keptForceParams(rs);
 assert.deepEqual(Buffer.from(api.encode(actual)),Buffer.from(api.encode(expected)),verb+' core kept operation');
 const tm=ts.carve?.map??ts.staged.final(),rm=rs.carve?.map??rs.staged.final();
 assert.deepEqual(Buffer.from(api.encode(rm)),Buffer.from(api.encode(tm)),verb+' core final map');
 assert.equal(calls-beforeCalls,1,verb+' one Rust operation');
 rows.push({verb,k,status:'pass',operationSha256:hash(api.encode(expected))});console.log(verb,k,'core host PASS');
}
json('core-host.json',{status:'pass',rows});
