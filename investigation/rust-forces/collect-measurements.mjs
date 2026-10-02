// Join separately measured cohorts without concealing their source provenance.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,arg,json,hash} from './common.mjs';
const gate=arg('gate','final-gate'),rest=arg('rest','final-rest'),name=arg('name','final');
for(const target of ['native','browser']){
 const inputs=[gate,rest].map(cohort=>{const file=target+'-'+cohort+'.json',bytes=readFileSync(resolve(LOCAL,file));return {cohort,file,sha256:hash(bytes),data:JSON.parse(bytes)};});
 const [a,b]=inputs.map(v=>v.data.build);for(const key of ['src/lib.rs','rust/main.rs','Cargo.toml','.cargo/config.toml'])if(a.inputs[key]!==b.inputs[key])throw Error('Timed Rust source changed: '+key);if(a.wasm.sha256!==b.wasm.sha256)throw Error('Timed Wasm changed');
 json(target+'-'+name+'.json',{rows:inputs.flatMap(v=>v.data.rows.map(r=>({...r,cohort:v.cohort}))),build:b,nativeSha256:inputs[1].data.nativeSha256,machine:inputs[1].data.machine,logicalCores:inputs[1].data.logicalCores,cohorts:inputs.map(v=>({name:v.cohort,file:v.file,sha256:v.sha256,wasm:v.data.build.wasm,inputs:v.data.build.inputs,nativeSha256:v.data.nativeSha256})),note:'The cold IEEE fixture checker changed between cohorts; Rust and the timed configure/plan/result interface did not.'});
}
