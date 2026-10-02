import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {LOCAL,deps,api,json,hash} from './common.mjs';
const p=deps(resolve(LOCAL,'protocol.cjs')),fast=api(),folder=resolve(LOCAL,'profiles/edges');mkdirSync(folder,{recursive:true});const rows=[],suffix=process.platform==='win32'?'.exe':'';
for(const [W,H] of [[1,257],[257,1]])for(const rules of ['game','port']){
 const N=W*H,id=`shape-${W}-${H}-${rules}`,model={W,H,floor:new Float64Array(N),dam:null,emitters:N?[{cells:[0,N-1],strength:.3,contamination:.25}]:[]},initial={depth:new Float64Array(N).fill(.2),contamination:new Float64Array(N).fill(.3)},opts={rules},commands=[{ticks:1},{ticks:64},{settle:{maxDays:.2}}];
 const sim=new fast.WaterSim(structuredClone(model),initial,opts),snaps=[];
 for(const c of commands){const result=c.settle?fast.settle(sim,c.settle):null;if(c.ticks)sim.run(c.ticks);snaps.push(p.snapshot(sim,result));}
 const expected=p.packSnapshots(snaps),input=p.encodeJob(model,initial,opts,commands);writeFileSync(resolve(folder,id+'.in'),input);writeFileSync(resolve(folder,id+'.expected'),expected);
 for(const [name,exe] of [['before',resolve(LOCAL,'before-water-batch'+suffix)],['current',resolve(LOCAL,'target/release/water-batch'+suffix)]]){const output=resolve(folder,id+'.'+name);execFileSync(exe,[resolve(folder,id+'.in'),output]);assert.ok(readFileSync(output).equals(expected),id+'/'+name);}
 rows.push({id,input:hash(input),expected:hash(expected),captures:3});
}
json('profiles/edges.json',{status:'pass',rows});console.log('Native before/current extra shapes PASS',rows.length);
