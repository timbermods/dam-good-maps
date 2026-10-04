// Consume the published pins; changing them requires an explicit re-pinning decision.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const read=n=>JSON.parse(readFileSync(resolve(LOCAL,n+'.json'))),expected=JSON.parse(readFileSync(resolve(HERE,'RESULTS.json')));
const sort=(a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0,root=rows=>hash(JSON.stringify(rows.sort(sort)));
const suite=process.argv[process.argv.indexOf('--suite')+1];
if(!process.argv.includes('--suite'))throw Error('Choose --suite generation, water, fixtures, forces, carve, gestures, camera or forcing; use the declared source/input profile');
const match=(name,actual,pin)=>{if(actual!==pin)throw Error(name+' differs from published pin: '+actual);console.log(name+' pin PASS');};
if(suite==='generation'){
 const summary=read('generation-summary');if(summary.source!==expected.experimentalSource)throw Error('Different generation source profile');
 const rows=read('generation-manifest');if(rows.length!==840)throw Error('Incomplete generation');
 for(const engine of ['chromium','firefox','webkit'])match('generation/'+engine,root(rows.map(r=>[r.id,r.results[engine].adopted.hash])),expected.generation.pins.all);
}else if(suite==='water'){
 for(const [name,pins]of Object.entries(expected.water)){
  const rows=readdirSync(resolve(LOCAL,name)).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(resolve(LOCAL,name,f))));if(rows.length!==pins.cases)throw Error('Incomplete '+name);
  for(const engine of ['chromium','firefox','webkit'])for(const threads of [1,2,3,4,7,8,16])match(name+'/'+engine+'/'+threads,root(rows.map(r=>{const s=r.results.find(s=>s.engine===engine&&s.threads===threads);if(!s)throw Error('Missing thread count');return [r.id,s.hash,s.ticks,s.volume,s.result,s.rows];})),pins.pin);
 }
}else if(suite==='fixtures'){
 const rows=read('fixtures-manifest');for(const kind of ['official','golden'])for(const engine of ['chromium','firefox','webkit'])match(kind+'/'+engine,root(rows.filter(r=>r.id.startsWith(kind+'-')).map(r=>[r.id,r.results[engine].adopted.hash])),expected.fixtures.pins[kind]);
}else if(suite==='forces'){
 for(const engine of ['chromium','firefox','webkit'])match('forces/'+engine,root(read('forces-adoption/'+engine).map(r=>[r.label,r.hash])),expected.forces.pin);
}else if(suite==='carve'){
 for(const engine of ['chromium','firefox','webkit'])match('carve/'+engine,root(read('carve-manifest').map(r=>[r.id,r.results[engine].adopted.hash])),expected.carve.pin);
}else if(suite==='gestures'){
 const rows=read('gestures-manifest');for(const revision of ['legacy','dev'])for(const engine of ['chromium','firefox','webkit'])match('gestures/'+revision+'/'+engine,root(rows.filter(r=>r.engine===engine&&r.revision===revision).map(r=>[r.id,r.after])),expected.gestures.pins[revision]);
}else if(suite==='camera'){
 for(const name of ['three','three-dev'])for(const r of read(name+'-manifest').filter(r=>r.mode==='after'))match(name+'/'+r.engine,hash(JSON.stringify(r.hashes)),expected.camera[name].pin);
}else if(suite==='forcing'){
 const rows=read('curves-full');for(const engine of ['chromium','firefox','webkit'])match('forcing/'+engine,hash(JSON.stringify([rows[engine].adopted.native,rows[engine].adopted.fractionalNative])),expected.weather.probePin);
}else if(suite==='embedded'){
 const proof=read('embedded-summary');for(const engine of ['chromium','firefox','webkit'])match('embedded/'+engine,proof.pins[engine],expected.embedded.pins[engine]);
}else throw Error('Unknown pin suite');
