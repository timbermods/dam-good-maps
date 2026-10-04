// Count complete analytic inputs; hashing is observational work, not a latency measurement.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {strict as assert} from 'node:assert';
import {build,dir} from './build.mjs';
import {digest,identityState,compareRaw} from './identity.mjs';
import {trace} from './trace.mjs';
const rows=[];let before=null;
for(const variant of ['before','after']){
 const m=await import(pathToFileURL(await build(variant,true))),prof=trace(),groups=new Map(),lands=[];let preland=true;
 prof.drought=(model,depth,days)=>{if(!preland)return;const signature=digest([model.W,model.H,days,model.emitters,model.floor,model.dam,depth]);const group=groups.get(signature)??{signature,days,calls:0};group.calls++;groups.set(signature,group);};
 globalThis.__gs=prof;
 const r=m.generate(m.decodeSpecFragment('s=7&t=lakeBasin&z=256&d=n').spec,{onLand:l=>{lands.push(structuredClone(l));prof.land();preland=false;}});
 prof.finish();globalThis.__gs=undefined;
 const state=identityState(r,lands);if(before)compareRaw(before,state);else before=state;
 const calls=name=>prof.totals['preland:'+name]?.calls??0;
 const row={variant,droughtCalls:[...groups.values()].reduce((s,g)=>s+g.calls,0),distinctDroughtInputs:groups.size,pickStartCalls:calls('gen/settler.ts:pickStart'),prepareStartCalls:calls('gen/settler.ts:prepareStart'),groups:[...groups.values()],completeState:digest(state)};
 assert.equal(row.droughtCalls,variant==='before'?12:2);assert.equal(row.distinctDroughtInputs,2);assert.equal(row.pickStartCalls,4);rows.push(row);console.log(variant,row.droughtCalls,'drought calculations,',row.pickStartCalls,'distinct picks');
}
const baseline=JSON.parse(readFileSync(resolve(dir,'BASE.json')));
writeFileSync(resolve(dir,'SHARED-COST.json'),JSON.stringify({base:baseline.base,theme:'lakeBasin',size:256,seed:7,source:'investigation/lake-basin/round2-shared-evidence.json at e292cefe',sourceCpu:{droughtStorageMs:282,pickStartMs:937},note:'Peer CPU observations are single-run evidence; repeated latency and load are reported by the full matrix. Input hashing here is excluded from timing evidence.',byteIdentical:true,candidate:baseline.files,rows},null,2)+'\n');
