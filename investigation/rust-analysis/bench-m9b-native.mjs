import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {measureCaptured} from './local/m9b-captured.ts';
import {LOCAL,deps,json} from './common.mjs';
import {unpack,untimed,exact} from './codec.mjs';
import {loadSampler} from './load.mjs';
const bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(deps(resolve(LOCAL,'analysis.node')));
const sampler=loadSampler(),rows=[];try{
 const cases=JSON.parse(readFileSync(resolve(LOCAL,'corpus.json'))).cases.filter(c=>/^m9b-.*-(96|128|256)-1$/.test(c.id));
 for(const c of cases){const snapshot=resolve(LOCAL,'cases',c.id+'.m9b.json.gz');while(!existsSync(snapshot))await new Promise(r=>setTimeout(r,5000));const p=unpack(JSON.parse(gunzipSync(readFileSync(snapshot))));
 const run=native=>{globalThis.__ra=native?{enter(){},leave(){},replace:(n,a)=>bridge.replace(n,a)}:null;try{return measureCaptured(p.result,p.theme,p.seed,p.size,p.generation);}finally{globalThis.__ra=null;}};
 run(false);run(true);sampler.reset();const before=[],after=[];for(let rep=0;rep<3;rep++){let t=performance.now();const b=run(false);before.push(performance.now()-t);t=performance.now();const a=run(true);after.push(performance.now()-t);assert.equal(exact(untimed(b)),exact(p.measure));assert.equal(exact(untimed(a)),exact(p.measure));}
 rows.push({id:c.id,times:[{name:'m9bMeasures',before,after}],load:sampler.summary()});json('native-m9b-cases.json',{rows});
 }console.log('Native M9b descriptive timings pass',rows.length);
}finally{sampler.stop();}
